import { Room } from '@colyseus/core'

import {
  CHAT,
  EVENT,
  GIFTS,
  JETPACK_BY_ID,
  MOONLIT_STOCK,
  NET,
  PRODUCT_BY_SKU,
  QUEST_BONUS_COINS,
  RACE,
  SKIN_BY_ID,
  STEP_BOOST,
  STEP_INTERVAL,
  TREADMILL_TYPES,
  coinValue,
  speedForLevel,
  squadMultiplier,
} from '../../shared/config.js'
import { formatNumber } from '../../shared/format.js'
import { ANIM, PUBLIC_PARTY } from '../../shared/net.js'
import { clamp } from '../../shared/rng.js'
import { buildWorld, pointInBox, progressAt, zoneAt } from '../../shared/world.js'
import { bareUserId, cleanAvatar, cleanName, cleanPfp, isGuestId, verifyBloxityToken } from './auth.js'
import * as eco from './economy.js'
import { broadcastAll, getBoards, getBoardsNow, online } from './sessions.js'
import { Ghost, Player, WorldState } from './schema.js'
import { rememberForStats } from './stats.js'
import { store } from './store.js'

const WORLD = buildWorld()
/** LOCAL TESTING ONLY: shop items cost nothing and the Worlds panel can teleport. */
const DEV_PURCHASES = process.env.DEV_PURCHASES === '1'
const INTERACT_BY_ID = Object.fromEntries(WORLD.interactables.map((i) => [i.id, i]))
const finite = (...values) => values.every((v) => typeof v === 'number' && Number.isFinite(v))
/** Limited products: sku -> [stock counter, starting stock]. */
const LIMITED = { moonlit_pulse: ['moonlit', MOONLIT_STOCK] }

const COINS_BY_STAGE = {}
for (const c of WORLD.coins) (COINS_BY_STAGE[c.stage] ||= []).push(c)
/** How close (studs) a player passes a coin to pick it up. */
const COIN_REACH = 4.5

/** Squared distance from point (px, pz) to the segment a -> b, and where along it (0..1). */
function segmentDist2(ax, az, bx, bz, px, pz) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0
  const ex = ax + dx * t - px
  const ez = az + dz * t - pz
  return [ex * ex + ez * ez, t]
}

/** Server-side record for one connected client. */
function createSession(client, profile, spawn) {
  const now = Date.now()
  return {
    client,
    profile,
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    lastPacketAt: now,
    lastMovedAt: 0,
    moveAccum: 0,
    budget: 0,
    /** A server-ordered teleport the client hasn't arrived at yet. */
    expect: { ...spawn, r: 40, until: now + 10000 },
    run: 0,
    lastStage: 0,
    treadmill: null,
    sessionStart: now,
    gifts: new Set(),
    lastChat: 0,
    lastVipNag: 0,
    profileDirty: true,
    lastProfileSent: 0,
    claiming: false,
    /** Coins picked up this run; they come back once the player is home again. */
    coinsTaken: new Set(),
    /** Fractions of a step left over after multipliers. */
    stepCarry: 0,
    buying: false,
  }
}

/** Seats per lobby. On Boxity hosting this must equal the seat cap the pod deploys with. */
export const MAX_CLIENTS = Math.min(100, Math.max(2, Number(process.env.MAX_CLIENTS) || 8))
const EMOTE_ID = /^[A-Za-z0-9]{24}$/
/** A Boxity party's room key, or null for public rooms. */
const partyKeyOf = (options) =>
  typeof options?.partyKey === 'string' && options.partyKey && options.partyKey !== PUBLIC_PARTY ? options.partyKey.slice(0, 128) : null

/**
 * Copies a guest save into an account that has never played, once: the guest
 * save is marked so it can never be copied into a second account.
 * @param {string[]} guestIds profile ids to try, best first
 */
async function carryGuestProgress(accountId, guestIds) {
  for (const gid of guestIds) {
    const guest = await store.load(gid)
    if (!guest || guest.mergedInto) continue
    const profile = { ...guest, id: accountId }
    delete profile.mergedInto
    guest.mergedInto = accountId
    await store.save(guest)
    await store.save(profile)
    return profile
  }
  return null
}

/** How often each room writes changed profiles to the database. */
const SAVE_EVERY_MS = 5000

export class WorldRoom extends Room {
  /** One lobby holds MAX_CLIENTS (8) players; joinOrCreate opens a new room when it is full. */
  maxClients = MAX_CLIENTS
  maxMessagesPerSecond = 60

  onCreate(options = {}) {
    // Boxity party: every member presents the same key and lands in this room;
    // the room definition filters on it, so strangers are never matched here.
    // Not setPrivate (joinOrCreate skips private rooms and would split the
    // party), and no setMetadata: Colyseus keeps the partyKey filter value in
    // this room's metadata, and replacing it would break matching.
    this.partyKey = partyKeyOf(options)
    this.draining = false
    this.state = new WorldState()
    this.state.race.phase = 'idle'
    this.state.race.endsAt = 0
    this.state.race.startAt = 0
    this.state.race.racers = 0
    this.sessions = new Map()
    this.race = { joined: new Set(), finished: [], nextAt: Date.now() + 60000 }
    for (const sp of WORLD.ghostSpawns) {
      this.state.ghosts.set(sp.id, new Ghost({ x: sp.home[0], y: sp.home[1], z: sp.home[2], ry: Math.PI, mode: 0 }))
    }

    this.setPatchRate(NET.PATCH_MS)
    this.setSimulationInterval((dt) => this.tick(dt), NET.TICK_MS)
    this.clock.setInterval(() => this.broadcast('boards', getBoards()), 30000)
    this.clock.setInterval(() => this.saveDirty(), SAVE_EVERY_MS)
    this.registerHandlers()
  }

  /* ---------------------------------------------------------------------- */
  /* Join / leave                                                            */
  /* ---------------------------------------------------------------------- */

  async onAuth(_client, options = {}) {
    if (partyKeyOf(options) !== this.partyKey) throw new Error(this.partyKey ? 'This room belongs to a party.' : 'Party members join their own room.')
    if (options.token) {
      const verified = await verifyBloxityToken(options.token)
      if (verified) {
        const uid = bareUserId(verified.user._id || verified.user.id)
        return {
          kind: 'user',
          id: `u_${uid}`,
          uid,
          carriedFrom: verified.carriedFrom,
          name: cleanName(verified.user.displayName || verified.user.username),
          pfp: cleanPfp(verified.user.pfp),
        }
      }
    }
    if (!isGuestId(options.guestId)) throw new Error('A guest id is required to play without logging in.')
    return { kind: 'guest', id: `g_${options.guestId}`, uid: '', name: cleanName(options.name, 'Guest'), pfp: cleanPfp(options.pfp) }
  }

  /**
   * The player's profile: their live copy if they are already on this pod, else from the database.
   * @returns {Promise<{ profile: object, isNew: boolean }>}
   */
  async loadProfile(auth, options) {
    const previous = online.get(auth.id)
    if (previous) {
      previous.room.kickDuplicate(previous.client)
      return { profile: previous.profile, isNew: false }
    }
    let profile = await store.load(auth.id)
    // An account that has never played here inherits a guest save: first the
    // Boxity guests this browser played as (carriedFrom), then this device's
    // own guest id.
    if (!profile && auth.kind === 'user') {
      const candidates = (auth.carriedFrom || []).map((id) => `u_${id}`)
      if (isGuestId(options.guestId)) candidates.push(`g_${options.guestId}`)
      profile = await carryGuestProgress(auth.id, candidates)
    }
    return profile ? { profile, isNew: false } : { profile: eco.newProfile(auth.id, auth.name), isNew: true }
  }

  /** Where a saved `resume` puts the player back: the stage start, or the reward room they hadn't cashed in. */
  resumePoint(resume) {
    const stage = resume && WORLD.stages[resume.stage - 1]
    if (!stage) return null
    if (resume.kind === 'reward') return { kind: 'reward', stage: stage.index, name: stage.name, spawn: { x: 0, y: 0.05, z: stage.padZ + 24, ry: Math.PI } }
    return { kind: 'stage', stage: stage.index, name: stage.name, spawn: { ...stage.start } }
  }

  /** What to save as `resume` when a player leaves: the stage they were in the middle of, if any. */
  resumeFrom(s) {
    if (this.state.players.get(s.client.sessionId)?.racing || s.claiming) return null
    const zone = zoneAt(WORLD, s.pos.x, s.pos.y + 2, s.pos.z)
    if ((zone?.kind === 'stage' || zone?.kind === 'reward') && s.run >= zone.stage) return { kind: zone.kind, stage: zone.stage }
    return null
  }

  async onJoin(client, options = {}, auth) {
    const { profile, isNew } = await this.loadProfile(auth, options)
    eco.normalizeProfile(profile)
    const now = Date.now()
    // Before lastSeen moves: a starter boost for new players, a gift for coming back.
    const hello = eco.welcome(profile, isNew, now)
    eco.ensureQuests(profile, now)
    profile.name = auth.name
    profile.pfp = auth.pfp
    profile.kind = auth.kind
    profile.lastSeen = now

    // Continue exactly where they stopped - the stage they were in, or the lobby.
    const resume = this.resumePoint(profile.resume)
    const spawn = resume ? resume.spawn : this.spawnPoint()
    const session = createSession(client, profile, spawn)
    if (resume) session.run = resume.stage
    session.unsaved = true
    this.sessions.set(client.sessionId, session)
    online.set(profile.id, { room: this, client, profile })

    const player = new Player({
      name: profile.name,
      uid: auth.uid || '',
      pfp: profile.pfp || '',
      avatar: cleanAvatar(options.avatar),
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      ry: spawn.ry,
      anim: ANIM.idle,
      spd: 0,
      progress: 0,
      racing: false,
    })
    this.state.players.set(client.sessionId, player)
    this.syncPublic(session)

    client.send('welcome', {
      sessionId: client.sessionId,
      profileId: profile.id,
      name: profile.name,
      guest: auth.kind === 'guest',
      serverTime: Date.now(),
      spawn,
      devPurchases: DEV_PURCHASES,
      moonlitStock: await store.getStock('moonlit', MOONLIT_STOCK),
      newPlayer: !profile.tutorialDone,
      hello: { ...hello, level: profile.level, rebirths: profile.rebirths, resume: resume ? { kind: resume.kind, stage: resume.stage, name: resume.name } : null },
    })
    client.send('boards', await getBoardsNow())
    this.sendProfile(session, true)
    this.broadcast('announce', { text: `${profile.name} joined the game` }, { except: client })
    this.squadChanged()
  }

  async onLeave(client) {
    const session = this.sessions.get(client.sessionId)
    if (!session) return
    session.profile.lastSeen = Date.now()
    session.profile.resume = this.resumeFrom(session)
    rememberForStats(session.profile)
    this.sessions.delete(client.sessionId)
    this.state.players.delete(client.sessionId)
    this.race.joined.delete(client.sessionId)
    this.squadChanged()
    const mine = online.get(session.profile.id)?.client === client
    if (mine) online.delete(session.profile.id)
    // A duplicate login on this pod took over the same profile object and saves it from now on.
    if (mine) await this.saveSession(session)
  }

  /** Everyone's squad bonus depends on how many play here; refresh the numbers they see. */
  squadChanged() {
    for (const s of this.sessions.values()) s.profileDirty = true
  }

  squad() {
    return squadMultiplier(this.sessions.size - 1)
  }

  async saveSession(session) {
    session.unsaved = false
    try {
      await store.save(session.profile)
    } catch (err) {
      session.unsaved = true
      console.error('[room] save failed:', err.message)
    }
  }

  saveDirty() {
    return Promise.all([...this.sessions.values()].filter((s) => s.unsaved).map((s) => this.saveSession(s)))
  }

  /**
   * Boxity deploys and scale-downs send SIGTERM and wait up to 10 minutes.
   * Drain instead of dropping everyone: stop taking joins, let a race in
   * progress finish, save everyone, then close with a code clients treat as
   * "reconnect" - the matchmaker puts them on the fresh pod, progress intact.
   */
  async onBeforeShutdown() {
    this.draining = true
    this.lock()
    this.broadcast('serverMoving', {})
    const deadline = Date.now() + 120000
    while (['countdown', 'running'].includes(this.state.race.phase) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000))
    }
    await this.saveDirty()
    await this.disconnect(4100)
  }

  kickDuplicate(client) {
    client.send('toast', { text: 'You joined from another tab.', kind: 'error' })
    client.leave(4000)
  }

  spawnPoint() {
    const s = WORLD.spawn
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * s.radius
    return { x: s.x + Math.cos(a) * r, y: s.y, z: s.z + Math.sin(a) * r, ry: s.ry }
  }

  /* ---------------------------------------------------------------------- */
  /* Sync helpers                                                            */
  /* ---------------------------------------------------------------------- */

  syncPublic(session) {
    const p = session.profile
    const pl = this.state.players.get(session.client.sessionId)
    if (!pl) return
    pl.level = p.level
    pl.rebirths = p.rebirths
    pl.trophies = p.trophies
    pl.jetpack = p.jetpack
    pl.skin = p.skin || ''
    pl.trail = p.trail
    pl.vip = p.passes.vip_plus ? 2 : p.passes.vip ? 1 : 0
  }

  markDirty(session) {
    session.profileDirty = true
    session.unsaved = true
  }

  sendProfile(session, force = false) {
    const now = Date.now()
    if (!force && (!session.profileDirty || now - session.lastProfileSent < 200)) return
    session.profileDirty = false
    session.lastProfileSent = now
    session.client.send(
      'profile',
      eco.privateView(session.profile, {
        sessionSeconds: Math.floor((now - session.sessionStart) / 1000),
        giftsClaimed: [...session.gifts],
        squad: this.sessions.size - 1,
        stepsPerStep: eco.stepsPerStep(session.profile, 1, this.squad(), now),
      }),
    )
  }

  /** Daily quest progress. A finished quest pays out at once; all three add the daily bonus. */
  quest(s, type, amount) {
    const done = eco.questProgress(s.profile, type, amount)
    this.markDirty(s)
    if (done < 0) return
    const r = eco.claimQuest(s.profile, done)
    if (!r.ok) return
    s.client.send('questDone', { index: done, type, wins: r.wins, coins: r.coins })
    this.fx(s, 'quest')
    this.syncPublic(s)
    const bonus = eco.claimQuestBonus(s.profile)
    if (bonus.ok) s.client.send('reward', { kind: 'questBonus', coins: QUEST_BONUS_COINS, boostMinutes: STEP_BOOST.questMinutes })
  }

  /** Once a second: playtime gifts, the daily streak and event milestones claim themselves. */
  autoRewards(s, now) {
    const p = s.profile
    const seconds = (now - s.sessionStart) / 1000
    GIFTS.forEach((g, i) => {
      if (s.gifts.has(i) || seconds < g.at * 60) return
      const r = eco.claimGift(p, i, seconds, s.gifts)
      if (r.ok) {
        s.client.send('reward', { kind: 'gift', coins: r.coins })
        this.markDirty(s)
      }
    })
    if (eco.dailyStatus(p, now).available) {
      const r = eco.claimDaily(p, now)
      if (r.ok) {
        s.client.send('reward', { kind: 'daily', coins: r.coins, streak: r.streak })
        this.markDirty(s)
      }
    }
    EVENT.milestones.forEach((m, i) => {
      if (p.eventClaims.includes(i) || p.pumpkins < m.count) return
      const r = eco.claimEvent(p, i)
      if (r.ok) {
        s.client.send('reward', { kind: 'event', coins: m.coins, label: m.label })
        this.syncPublic(s)
        this.markDirty(s)
      }
    })
  }

  /** Back home (or dead): this run is over, its coins come back. */
  endRun(s) {
    s.run = 0
    if (s.coinsTaken.size) s.coinsTaken.clear()
  }

  teleport(session, target, reason = 'teleport') {
    session.expect = { x: target.x, y: target.y, z: target.z, r: 30, until: Date.now() + 8000 }
    session.client.send('teleport', { x: target.x, y: target.y, z: target.z, ry: target.ry ?? Math.PI, reason })
  }

  toast(session, text, kind = 'info') {
    session.client.send('toast', { text, kind })
  }

  /** Runs a shop/claim action and reports the outcome to the player. */
  act(session, result, after) {
    if (!result.ok) {
      this.toast(session, result.error, 'error')
      return false
    }
    if (result.text) this.toast(session, result.text, 'success')
    after?.(result)
    this.syncPublic(session)
    this.markDirty(session)
    this.sendProfile(session, true)
    return true
  }

  near(session, interactableId, slack = 8) {
    const it = INTERACT_BY_ID[interactableId]
    if (!it) return false
    const { x, z } = session.pos
    return Math.hypot(x - it.pos[0], z - it.pos[2]) <= it.r + slack
  }

  /* ---------------------------------------------------------------------- */
  /* Messages                                                                */
  /* ---------------------------------------------------------------------- */

  registerHandlers() {
    const on = (type, handler) =>
      this.onMessage(type, (client, message) => {
        const session = this.sessions.get(client.sessionId)
        if (!session) return
        try {
          handler(session, message && typeof message === 'object' ? message : {})
        } catch (err) {
          console.error(`[room] ${type} handler failed:`, err)
        }
      })

    on('move', (s, m) => this.onMove(s, m))
    on('ping', (s, m) => s.client.send('pong', { t: m.t, now: Date.now() }))
    on('died', (s) => this.onDied(s))

    on('buyProduct', (s, m) => this.buyProduct(s, String(m.sku)))

    on('buyJetpack', (s, m) => {
      if (!this.near(s, `jetpack:${m.id}`)) return this.toast(s, 'Walk up to the jetpack to buy it.', 'error')
      this.act(s, eco.buyJetpack(s.profile, String(m.id)), (r) => r.bought && this.fx(s, 'buy', { name: JETPACK_BY_ID[m.id]?.name }))
    })
    on('equipJetpack', (s, m) => this.act(s, eco.equipJetpack(s.profile, String(m.id))))
    on('buyBoost', (s, m) => {
      if (!this.near(s, `boost:${m.id}`)) return this.toast(s, 'Stand on the pad to buy it.', 'error')
      this.act(s, eco.buyBoost(s.profile, String(m.id)))
    })
    on('buyTrail', (s, m) => this.act(s, eco.buyTrail(s.profile, String(m.id))))
    on('equipTrail', (s, m) => this.act(s, eco.equipTrail(s.profile, String(m.id))))
    on('equipSkin', (s, m) => this.act(s, eco.equipSkin(s.profile, String(m.id ?? ''))))
    on('openCrate', (s, m) => {
      if (!this.near(s, 'crates', 14)) return this.toast(s, 'Go to the crate machine.', 'error')
      this.act(s, eco.openCrate(s.profile, String(m.id)), (r) => {
        s.client.send('crateResult', { crate: m.id, ...r })
        const skin = SKIN_BY_ID[r.skin]
        if (skin.rarity === 'legendary' || skin.rarity === 'epic') {
          this.broadcast('announce', { text: `${s.profile.name} unboxed ${skin.name}!`, kind: skin.rarity })
        }
      })
    })
    on('rebirth', (s, m) => {
      this.act(s, eco.rebirth(s.profile, { skip: !!m.skip }), (r) => {
        s.client.send('rebirthed', r)
        this.fx(s, 'rebirth', { rebirths: r.rebirths })
        this.broadcast('announce', { text: `${s.profile.name} reached Rebirth ${r.rebirths}!`, kind: 'rebirth' })
      })
    })
    on('chest', (s) => {
      if (!this.near(s, 'chest')) return this.toast(s, 'Walk to the chest.', 'error')
      this.act(s, eco.claimChest(s.profile), (r) => {
        s.client.send('reward', { kind: 'chest', steps: r.steps, coins: r.coins })
        if (r.levelUp) this.onLevelUp(s, r.levelUp)
      })
    })
    // Boxity emotes: the client plays it locally; everyone else gets it relayed.
    on('emote', (s, m) => {
      if (typeof m.id !== 'string' || !EMOTE_ID.test(m.id)) return
      this.broadcast('emote', { sid: s.client.sessionId, id: m.id }, { except: s.client })
    })
    on('emoteStop', (s) => this.broadcast('emoteStop', { sid: s.client.sessionId }, { except: s.client }))

    on('toLobby', (s) => {
      if (this.state.players.get(s.client.sessionId)?.racing) return
      this.endRun(s)
      this.teleport(s, this.spawnPoint(), 'lobby')
    })
    on('tutorialDone', (s) => {
      s.profile.tutorialDone = true
      this.markDirty(s)
    })
    on('avatar', (s, m) => {
      const pl = this.state.players.get(s.client.sessionId)
      if (pl) pl.avatar = cleanAvatar(m.avatar)
    })
    on('chat', (s, m) => {
      const now = Date.now()
      if (now - s.lastChat < CHAT.COOLDOWN_MS) return
      // eslint-disable-next-line no-control-regex
      const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT.MAX_LENGTH)
      if (!text) return
      s.lastChat = now
      this.broadcast('chat', { sid: s.client.sessionId, name: s.profile.name, text })
    })

    on('raceJoin', (s) => {
      if (this.state.race.phase !== 'invite') return
      if (s.profile.level < RACE.MIN_LEVEL) return this.toast(s, `Races need level ${RACE.MIN_LEVEL}.`, 'error')
      if (this.race.joined.has(s.client.sessionId)) return
      this.race.joined.add(s.client.sessionId)
      this.state.race.racers = this.race.joined.size
      this.toast(s, 'You joined the race!', 'success')
    })

    on('devTeleport', (s, m) => {
      if (!DEV_PURCHASES) return
      const stage = WORLD.stages[Number(m.stage) - 1]
      if (!stage) return
      this.endRun(s)
      s.run = stage.index
      this.teleport(s, stage.start, 'dev')
    })
  }

  /** Shop purchase with Wins. Limited stock is reserved first, so two buyers can't both get the last one. */
  async buyProduct(s, sku) {
    const product = PRODUCT_BY_SKU[sku]
    if (!product || s.buying) return
    const fail = (error) => s.client.send('purchase', { sku, ok: false, text: error })
    const blocked = eco.productBlocked(s.profile, sku, { free: DEV_PURCHASES })
    if (blocked) return fail(blocked)
    const limited = LIMITED[sku]
    s.buying = true
    try {
      if (limited && !(await store.takeStock(...limited))) return fail(`${product.name} is sold out!`)
      // The player may have left, or spent the Wins, while the stock was reserved.
      const result = this.sessions.has(s.client.sessionId) ? eco.buyProduct(s.profile, sku, { free: DEV_PURCHASES }) : { ok: false }
      if (!result.ok) {
        if (limited) await store.giveBackStock(limited[0])
        return result.error && fail(result.error)
      }
      s.client.send('purchase', { sku, ok: true, text: result.text || `${product.name} bought!` })
      this.fx(s, 'buy', { name: product.name })
      if (result.levelUp) this.onLevelUp(s, result.levelUp)
      if (result.skip && eco.canRebirth(s.profile)) {
        const r = eco.rebirth(s.profile, { skip: true })
        if (r.ok) {
          s.client.send('rebirthed', r)
          this.fx(s, 'rebirth', { rebirths: r.rebirths })
        }
      }
      if (limited) broadcastAll('stock', { moonlitStock: await store.getStock(...limited) })
      this.syncPublic(s)
      this.markDirty(s)
      this.sendProfile(s, true)
    } catch (err) {
      console.error('[room] purchase failed:', err.message)
      fail('Purchase failed - try again.')
    } finally {
      s.buying = false
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Movement + world triggers                                               */
  /* ---------------------------------------------------------------------- */

  onMove(s, m) {
    const x = Number(m.x)
    const y = Number(m.y)
    const z = Number(m.z)
    if (!finite(x, y, z) || Math.abs(y) > 2000) return
    const now = Date.now()
    const dt = Math.min(1.5, (now - s.lastPacketAt) / 1000)
    s.lastPacketAt = now

    if (s.expect) {
      const arrived = Math.hypot(x - s.expect.x, z - s.expect.z) < s.expect.r && Math.abs(y - s.expect.y) < 60
      if (arrived) {
        s.expect = null
        s.pos = { x, y, z }
        s.budget = 0
      } else if (now < s.expect.until) {
        return // still in flight to the teleport target
      } else {
        s.expect = null
      }
    }

    // Speed check with a token bucket, so network jitter doesn't trip it.
    const allowed = speedForLevel(s.profile.level) * 2 + 60
    s.budget = Math.min(s.budget + allowed * dt, allowed * 1.3 + 80)
    const moved = Math.hypot(x - s.pos.x, z - s.pos.z)
    if (moved > s.budget) {
      this.teleport(s, { ...s.pos, ry: Number(m.ry) || 0 }, 'sync')
      return
    }
    s.budget -= moved
    if (moved > 0.05) s.lastMovedAt = now
    const from = s.pos
    s.pos = { x, y, z }

    const pl = this.state.players.get(s.client.sessionId)
    pl.x = x
    pl.y = y
    pl.z = z
    pl.ry = finite(Number(m.ry)) ? Number(m.ry) : pl.ry
    pl.anim = Number.isInteger(m.a) && m.a >= 0 && m.a <= 6 ? m.a : ANIM.idle
    pl.spd = finite(Number(m.s)) ? Math.max(0, Math.min(2000, Number(m.s))) : 0
    pl.progress = progressAt(WORLD, x, y, z)

    const zone = zoneAt(WORLD, x, y, z)
    if (zone?.kind === 'stage') {
      s.run = Math.max(s.run, zone.stage)
      s.lastStage = zone.stage
      this.checkCoins(s, zone.stage, from)
    } else if (zone?.kind === 'lobby') {
      this.endRun(s)
    }
    if (pl.anim === ANIM.fly && moved > 0.05) this.quest(s, 'fly', Math.min(dt, 0.3))

    this.checkTreadmill(s, m.tm, now)
    this.checkPads(s, now)
    this.checkPumpkins(s, now)
    if (pl.racing) this.checkRaceFinish(s, now)
    const exit = INTERACT_BY_ID.exit
    if (exit && Math.hypot(x - exit.pos[0], z - exit.pos[2]) < exit.r && Math.abs(y - exit.pos[1]) < 10) {
      this.endRun(s)
      this.teleport(s, this.spawnPoint(), 'exit')
    }
  }

  /** Coins the player passed through since their last position (fast players cover many studs per packet). */
  checkCoins(s, stage, from) {
    const list = COINS_BY_STAGE[stage]
    if (!list) return
    const { x, y, z } = s.pos
    const reach2 = COIN_REACH * COIN_REACH
    for (const c of list) {
      if (s.coinsTaken.has(c.id)) continue
      const [d2, t] = segmentDist2(from.x, from.z, x, z, c.pos[0], c.pos[2])
      if (d2 > reach2) continue
      const py = from.y + (y - from.y) * t + 2.5
      if (Math.abs(c.pos[1] - py) > 5) continue
      s.coinsTaken.add(c.id)
      const value = coinValue(stage)
      eco.collectCoin(s.profile, value)
      s.client.send('coin', { id: c.id, coins: value })
      this.fx(s, 'coin', { at: c.pos })
      this.quest(s, 'coins', 1)
    }
  }

  checkTreadmill(s, index, now) {
    if (!Number.isInteger(index) || index < 0) return
    const tm = WORLD.treadmills[index]
    if (!tm) return
    const { x, y, z } = s.pos
    if (!pointInBox(tm.min, tm.max, x, y, z, 3)) return
    const type = TREADMILL_TYPES[tm.type]
    if (type.requires && !s.profile.passes[type.requires] && !(type.requires === 'vip' && s.profile.passes.vip_plus)) return
    s.treadmill = { mult: type.mult, until: now + 500 }
    s.lastMovedAt = now
  }

  checkPads(s, now) {
    if (s.claiming) return
    const { x, y, z } = s.pos
    for (const pad of WORLD.pads) {
      if (!pointInBox(pad.min, [pad.max[0], pad.max[1] + 6, pad.max[2]], x, y, z, 1.5)) continue
      if (s.run < pad.stage) return
      if (pad.vip && !eco.hasVip(s.profile)) {
        if (now - s.lastVipNag > 4000) {
          s.lastVipNag = now
          s.client.send('needPurchase', { sku: 'vip', reason: 'pad' })
        }
        return
      }
      s.claiming = true
      const reward = eco.claimStage(s.profile, pad.stage, pad.vip)
      s.client.send('stageClear', { stage: pad.stage, vip: pad.vip, trophies: reward.amount, coins: reward.coins })
      this.fx(s, 'wins', { amount: reward.amount, stage: pad.stage })
      if (pad.stage >= 3) this.broadcast('announce', { text: `${s.profile.name} escaped Stage ${pad.stage}! +${formatNumber(reward.amount)} Wins`, kind: 'stage' }, { except: s.client })
      this.endRun(s)
      this.quest(s, 'escape', 1)
      this.syncPublic(s)
      this.markDirty(s)
      this.sendProfile(s, true)
      // Short celebration, then home.
      this.clock.setTimeout(() => {
        s.claiming = false
        if (this.sessions.has(s.client.sessionId)) this.teleport(s, this.spawnPoint(), 'claimed')
      }, 1200)
      return
    }
  }

  checkPumpkins(s, now) {
    const { x, y, z } = s.pos
    for (const pk of WORLD.pumpkins) {
      if (Math.abs(pk.pos[0] - x) > 6 || Math.abs(pk.pos[2] - z) > 6 || Math.abs(pk.pos[1] - y) > 7) continue
      const got = eco.collectPumpkin(s.profile, pk.id, now)
      if (!got) continue
      s.client.send('pumpkin', { id: pk.id, count: got.count, coins: got.coins })
      this.quest(s, 'pumpkins', 1)
    }
  }

  onDied(s) {
    const pl = this.state.players.get(s.client.sessionId)
    if (pl) pl.anim = ANIM.dead
    s.profile.deaths += 1
    let respawn
    if (pl?.racing && this.state.race.phase === 'running') {
      respawn = WORLD.race.grid[Math.floor(Math.random() * 4)]
    } else {
      this.endRun(s)
      respawn = this.spawnPoint()
    }
    s.expect = { x: respawn.x, y: respawn.y, z: respawn.z, r: 30, until: Date.now() + 9000 }
    s.client.send('respawn', respawn)
    this.markDirty(s)
    this.sendProfile(s, true)
  }

  onLevelUp(s, info) {
    s.client.send('levelUp', info)
    this.fx(s, 'levelUp', { level: info.to })
    this.syncPublic(s)
  }

  /** Shows everyone else what this player just did (bursts and a popup over their head). */
  fx(s, kind, data = {}) {
    if (this.sessions.size > 1) this.broadcast('fx', { sid: s.client.sessionId, kind, ...data }, { except: s.client })
  }

  /* ---------------------------------------------------------------------- */
  /* Simulation tick: steps, playtime, races                                 */
  /* ---------------------------------------------------------------------- */

  tick(dtMs) {
    const now = Date.now()
    const dt = dtMs / 1000
    const squad = this.squad()
    const slow = now - (this.lastSlowTick || 0) >= 1000
    if (slow) this.lastSlowTick = now
    for (const s of this.sessions.values()) {
      const p = s.profile
      p.playtime += dt
      const onTreadmill = s.treadmill && s.treadmill.until > now
      if (now - s.lastMovedAt < 350 || onTreadmill) {
        s.moveAccum += dt
        let ticks = 0
        while (s.moveAccum >= STEP_INTERVAL) {
          s.moveAccum -= STEP_INTERVAL
          ticks += 1
        }
        if (ticks > 0) {
          s.stepCarry += ticks * eco.stepsPerStep(p, onTreadmill ? s.treadmill.mult : 1, squad, now)
          const gained = Math.floor(s.stepCarry)
          s.stepCarry -= gained
          if (gained > 0) {
            const levelUp = eco.addSteps(p, gained)
            if (levelUp) this.onLevelUp(s, levelUp)
          }
          this.quest(s, onTreadmill ? 'treadmill' : 'walk', onTreadmill ? ticks * STEP_INTERVAL : ticks)
        }
      }
      if (slow) this.autoRewards(s, now)
      this.sendProfile(s)
    }
    this.ghostTick(dt)
    this.raceTick(now)
  }

  /**
   * Ghosts hover in the middle of their room and hunt the nearest living
   * player inside it. They are slower than a player at the recommended level,
   * so keeping moving keeps you alive.
   */
  ghostTick(dt) {
    for (const sp of WORLD.ghostSpawns) {
      const g = this.state.ghosts.get(sp.id)
      if (!g) continue
      let target = null
      let best = Infinity
      for (const [sid, s] of this.sessions) {
        const pl = this.state.players.get(sid)
        if (!pl || pl.anim === ANIM.dead || s.expect) continue
        const { x, y, z } = s.pos
        const zone = zoneAt(WORLD, x, y + 2, z)
        if (zone?.kind !== 'stage' || zone.stage !== sp.stage) continue
        const d = Math.hypot(x - g.x, y + 3 - g.y, z - g.z)
        if (d < best) {
          best = d
          target = s
        }
      }
      const aim = target ? [target.pos.x, target.pos.y + 3, target.pos.z] : sp.home
      const dx = aim[0] - g.x
      const dy = aim[1] - g.y
      const dz = aim[2] - g.z
      const dist = Math.hypot(dx, dy, dz)
      const step = Math.min(dist, (target ? sp.speed : sp.speed * 0.5) * dt)
      if (dist > 0.01) {
        g.x = clamp(g.x + (dx / dist) * step, sp.min[0], sp.max[0])
        g.y = clamp(g.y + (dy / dist) * step, sp.min[1], sp.max[1])
        g.z = clamp(g.z + (dz / dist) * step, sp.min[2], sp.max[2])
        if (Math.hypot(dx, dz) > 1) g.ry = Math.atan2(dx, dz)
      }
      g.mode = target ? 1 : 0
    }
  }

  raceTick(now) {
    const r = this.state.race
    const race = this.race
    switch (r.phase) {
      case 'idle': {
        if (now < race.nextAt || this.draining) return
        const eligible = [...this.sessions.values()].some((s) => s.profile.level >= RACE.MIN_LEVEL)
        if (!eligible) {
          race.nextAt = now + 30000
          return
        }
        race.joined.clear()
        race.finished = []
        r.racers = 0
        r.phase = 'invite'
        r.endsAt = now + RACE.INVITE * 1000
        return
      }
      case 'invite': {
        if (now < r.endsAt) return
        const racers = [...race.joined].map((id) => this.sessions.get(id)).filter(Boolean)
        if (!racers.length) {
          r.phase = 'idle'
          race.nextAt = now + RACE.INTERVAL * 1000
          return
        }
        racers.forEach((s, i) => {
          this.state.players.get(s.client.sessionId).racing = true
          s.run = 0
          this.teleport(s, WORLD.race.grid[i % WORLD.race.grid.length], 'race')
        })
        r.racers = racers.length
        r.phase = 'countdown'
        r.startAt = now + (RACE.COUNTDOWN + 2) * 1000
        r.endsAt = r.startAt
        return
      }
      case 'countdown':
        if (now >= r.startAt) {
          r.phase = 'running'
          r.endsAt = now + RACE.MAX_TIME * 1000
        }
        return
      case 'running': {
        const racing = [...this.sessions.values()].filter((s) => this.state.players.get(s.client.sessionId)?.racing)
        if (now >= r.endsAt || racing.length === 0 || racing.every((s) => race.finished.some((f) => f.sid === s.client.sessionId))) {
          this.finishRace(now)
        }
        return
      }
      case 'results':
        if (now >= r.endsAt) {
          r.phase = 'idle'
          race.nextAt = now + RACE.INTERVAL * 1000
        }
        return
      default:
        r.phase = 'idle'
    }
  }

  checkRaceFinish(s, now) {
    const r = this.state.race
    if (r.phase !== 'running') return
    if (this.race.finished.some((f) => f.sid === s.client.sessionId)) return
    const { x, y, z } = s.pos
    if (!pointInBox(WORLD.race.finish.min, WORLD.race.finish.max, x, y, z, 2)) return
    const place = this.race.finished.length + 1
    this.race.finished.push({ sid: s.client.sessionId, name: s.profile.name, time: (now - r.startAt) / 1000, place })
    this.broadcast('announce', { text: `${s.profile.name} finished the race #${place}!`, kind: 'race' })
  }

  finishRace(now) {
    const r = this.state.race
    const standings = this.race.finished.map((f) => ({ ...f, coins: RACE.REWARDS[f.place - 1] ?? RACE.PARTICIPATION }))
    for (const [sid, pl] of this.state.players) {
      if (!pl.racing) continue
      const s = this.sessions.get(sid)
      pl.racing = false
      if (!s) continue
      const result = standings.find((f) => f.sid === sid)
      const coins = result ? result.coins : RACE.PARTICIPATION
      s.profile.coins += coins
      if (result?.place === 1) s.profile.racesWon += 1
      this.quest(s, 'race', 1)
      this.markDirty(s)
      this.sendProfile(s, true)
      this.teleport(s, this.spawnPoint(), 'raceOver')
    }
    this.broadcast('raceResults', { standings: standings.map(({ sid: _sid, ...rest }) => rest) })
    r.phase = 'results'
    r.racers = 0
    r.endsAt = now + 6000
  }
}
