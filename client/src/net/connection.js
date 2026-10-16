import { Client } from '@colyseus/sdk'

import { EVENT, JETPACK_BY_ID, PRODUCT_BY_SKU, QUESTS } from '../../../shared/config.js'
import { formatNumber } from '../../../shared/format.js'
import { PUBLIC_PARTY, ROOM_NAME } from '../../../shared/net.js'
import {
  HOSTING_ID,
  emoteClip,
  gameplayEnd,
  gameplayStart,
  getPartyLaunch,
  getToken,
  locateRoom,
  partyFailed,
  partyJoined,
  publicRoomId,
  reportRoom,
  resetPresence,
  resolveEndpoint,
  takeLaunchRoomId,
} from '../bloxity/boxity.js'
import { audio } from '../game/audio.js'
import { startEmote, stopEmote } from '../game/pose.js'
import { getGame, useGame } from '../state/gameStore.js'
import { runtime } from '../state/runtime.js'
import { buildReel } from '../ui/crateReel.js'

export function send(type, message = {}) {
  runtime.room?.send(type, message)
}

let pingTimer = null
let lastSteps = null
let stepAccum = 0
let lastStepPopup = 0

/** A random spot on a ring around the local player, for small popups. */
function aroundLocal(radius = 3.6) {
  const c = runtime.local?.state
  if (!c) return null
  const a = Math.random() * Math.PI * 2
  return [c.x + Math.cos(a) * radius, c.y + 2.5 + Math.random() * 3, c.z + Math.sin(a) * radius]
}

/** Where another player is right now (their interpolated avatar). */
function remoteAt(sid) {
  const p = runtime.remotes.get(sid)?.prev
  return p ? [p.x, p.y, p.z] : null
}

function nextPumpkinGoal(count) {
  const next = EVENT.milestones.find((m) => m.count > count)
  return next ? next.count : count
}

const handlers = {
  welcome(m) {
    runtime.timeOffset = m.serverTime - Date.now()
    useGame.setState({ welcome: m, moonlitStock: m.moonlitStock, hello: m.hello ? { ...m.hello, at: Date.now() } : null })
    runtime.worldView?.applyStock(m.moonlitStock)
    runtime.local?.teleport(m.spawn, { snap: true })
  },

  profile(p) {
    const g = getGame()
    const prev = g.profile
    // _receivedAt lets the HUD tick session timers between profile updates.
    useGame.setState({ profile: { ...p, _receivedAt: Date.now() } })
    runtime.worldView?.applyProfile(p)
    const fuel = JETPACK_BY_ID[p.jetpack]?.fuel || 10
    if (runtime.local) runtime.local.setMaxFuel(fuel)

    // "+N" step popups above the head, batched so fast gains stay readable.
    if (prev && lastSteps !== null && p.level === prev.level && p.steps > lastSteps) {
      stepAccum += p.steps - lastSteps
    }
    lastSteps = p.steps
    const now = performance.now()
    // Small "+N" bubbles popping out around the player as the steps come in.
    const spot = aroundLocal()
    if (stepAccum > 0 && spot && now - lastStepPopup > 380) {
      runtime.effects?.popup([{ text: `+${formatNumber(stepAccum)}`, icon: 'shoe' }], spot[0], spot[1], spot[2], { size: 1.5, life: 0.85, rise: 2.4, spread: 0 })
      audio.play('steps')
      stepAccum = 0
      lastStepPopup = now
    }
  },

  boards(b) {
    useGame.setState({ boards: b })
    runtime.worldView?.applyBoards(b)
  },

  toast(m) {
    getGame().toast(m.text, m.kind)
    if (m.kind === 'error') audio.play('error')
  },

  announce(m) {
    getGame().toast(m.text, m.kind === 'legendary' || m.kind === 'rebirth' ? 'special' : 'feed', 4500)
  },

  levelUp(m) {
    getGame().showBanner(`Level up! Speed increased: ${m.fromSpeed} -> ${m.toSpeed}`, 'level', 2600)
    const c = runtime.local?.state
    if (c) {
      runtime.effects?.burst('levelUp', c.x, c.y, c.z)
      runtime.effects?.popup([{ text: 'Level Up!', color: '#6ff3ff' }], c.x, c.y + 8.5, c.z, { size: 3.2, life: 1.4, rise: 5, spread: 0 })
    }
    runtime.local?.shake(0.25)
    audio.play('levelUp')
    lastSteps = null
  },

  teleport(m) {
    runtime.local?.teleport(m, { snap: true, effect: m.reason !== 'sync' })
    if (m.reason !== 'sync') audio.play('whoosh')
  },

  respawn(m) {
    runtime.local?.onRespawn(m)
  },

  stageClear(m) {
    const c = runtime.local?.state
    if (c) {
      runtime.effects?.burst('trophy', c.x, c.y, c.z)
      runtime.effects?.popup([{ text: `+${formatNumber(m.trophies)} Wins`, icon: 'trophy', color: '#ffe36b' }], c.x, c.y + 8, c.z, { size: 4, life: 1.6, rise: 6, spread: 0 })
    }
    getGame().showBanner(`Stage ${m.stage} escaped! +${formatNumber(m.trophies)} Wins${m.vip ? ' (VIP x2)' : ''}`, 'trophy', 3200)
    if (m.coins) getGame().toast(`First clear bonus: +${m.coins} coins!`, 'special', 4000)
    audio.play('trophy')
  },

  pumpkin(m) {
    runtime.worldView?.hidePumpkin(m.id)
    const p = runtime.world.pumpkins.find((pk) => pk.id === m.id)
    if (p) {
      runtime.effects?.burst('pumpkin', p.pos[0], p.pos[1], p.pos[2])
      runtime.effects?.popup([{ text: `+${m.coins}`, icon: 'coin', color: '#7dff9a' }], p.pos[0], p.pos[1] + 5, p.pos[2], { size: 2.6 })
    }
    getGame().showBanner(`Collect ${nextPumpkinGoal(m.count)} Pumpkins: ${m.count}/${nextPumpkinGoal(m.count)}`, 'pumpkin', 2600)
    audio.play('pumpkin')
  },

  reward(m) {
    const parts = []
    if (m.steps) parts.push(`+${formatNumber(m.steps)} steps`)
    if (m.coins) parts.push(`+${formatNumber(m.coins)} coins`)
    if (m.boostMinutes) parts.push(`x2 steps for ${m.boostMinutes} min`)
    const title =
      {
        daily: `Daily reward - day ${m.streak}`,
        chest: 'Free chest',
        gift: 'Playtime gift',
        event: `Spooky reward: ${m.label}`,
        questBonus: 'All quests done!',
      }[m.kind] || 'Reward'
    getGame().toast(`${title}: ${parts.join(', ')}`, 'special', 4500)
    audio.play(m.kind === 'questBonus' ? 'quest' : 'buy')
    const c = runtime.local?.state
    if (c) runtime.effects?.burst('confetti', c.x, c.y, c.z)
  },

  questDone(m) {
    const q = QUESTS[m.type]
    const goal = getGame().profile?.quests?.list?.[m.index]?.goal
    getGame().showBanner(`Quest complete: ${q && goal ? q.label(goal) : 'quest'}! +${formatNumber(m.wins)} Wins +${m.coins} coins`, 'trophy', 3400)
    audio.play('quest')
    const c = runtime.local?.state
    if (c) runtime.effects?.burst('quest', c.x, c.y, c.z)
  },

  /** The server confirmed a coin (already hidden locally): show what it paid. */
  coin(m) {
    runtime.worldView?.takeCoin(m.id)
    const spot = aroundLocal(2.2)
    if (spot) runtime.effects?.popup([{ text: `+${m.coins}`, icon: 'coin', color: '#ffe36b' }], spot[0], spot[1] + 1, spot[2], { size: 1.6, life: 0.8, rise: 3, spread: 0 })
  },

  /** Something another player did: everyone sees it over their head. */
  fx(m) {
    const at = m.kind === 'coin' && m.at ? m.at : remoteAt(m.sid)
    const fx = runtime.effects
    if (!at || !fx) return
    const [x, y, z] = at
    switch (m.kind) {
      case 'levelUp':
        fx.burst('levelUp', x, y, z)
        fx.popup([{ text: `Level ${m.level}!`, color: '#6ff3ff' }], x, y + 8.5, z, { size: 2.6, life: 1.3, rise: 4, spread: 0 })
        break
      case 'rebirth':
        fx.burst('rebirth', x, y, z)
        fx.popup([{ text: `REBIRTH ${m.rebirths}!`, color: '#ff8af0' }], x, y + 9, z, { size: 3.2, life: 1.8, rise: 4, spread: 0 })
        break
      case 'wins':
        fx.burst('trophy', x, y, z)
        fx.popup([{ text: `+${formatNumber(m.amount)} Wins`, icon: 'trophy', color: '#ffe36b' }], x, y + 8.5, z, { size: 3, life: 1.5, rise: 5, spread: 0 })
        break
      case 'buy':
        fx.burst('buy', x, y, z)
        if (m.name) fx.popup([{ text: m.name, color: '#8fe8ff' }], x, y + 8.5, z, { size: 2.2, life: 1.4, rise: 3, spread: 0 })
        break
      case 'quest':
        fx.burst('quest', x, y, z)
        fx.popup([{ text: 'Quest done!', color: '#7dff6b' }], x, y + 8.5, z, { size: 2.2, life: 1.3, rise: 3, spread: 0 })
        break
      case 'coin':
        fx.burst('coin', x, y, z)
        break
      default:
        break
    }
  },

  crateResult(m) {
    useGame.setState({ crateResult: { ...m, at: Date.now(), reel: buildReel(m.crate, m.skin) } })
  },

  rebirthed(m) {
    const c = runtime.local?.state
    if (c) runtime.effects?.burst('rebirth', c.x, c.y, c.z)
    getGame().showBanner(m.skip ? `Rebirth skipped! Steps x${m.mult}, max level ${m.cap}` : `REBIRTH ${m.rebirths}! Steps x${m.mult} - Max level ${m.cap}`, 'rebirth', 4000)
    getGame().closePanel()
    audio.play('rebirth')
    lastSteps = null
  },

  purchase(m) {
    useGame.setState({ purchasePending: null })
    if (!m.ok) {
      getGame().toast(m.text, 'error')
      audio.play('error')
      return
    }
    getGame().toast(m.text, 'special', 4000)
    audio.play('buy')
    const c = runtime.local?.state
    if (c) runtime.effects?.burst('buy', c.x, c.y, c.z)
  },

  needPurchase(m) {
    const product = PRODUCT_BY_SKU[m.sku]
    if (!product) return
    if (m.reason === 'pad') getGame().toast('Pink pads pay x2 Wins - they need VIP!', 'info')
    getGame().openPanel('shop', m.sku)
  },

  /** This pod is being replaced (deploy / scale-down); the reconnect moves us to a fresh one. */
  serverMoving() {
    getGame().toast('Server update - moving you to a fresh server...', 'info', 6000)
  },

  emote(m) {
    const remote = runtime.remotes.get(m.sid)
    const clip = emoteClip(m.id)
    if (remote?.poseRef && clip) startEmote(remote.poseRef.current, clip)
  },

  emoteStop(m) {
    const remote = runtime.remotes.get(m.sid)
    if (remote?.poseRef) stopEmote(remote.poseRef.current)
  },

  chat(m) {
    getGame().pushChat(m)
    const remote = runtime.remotes.get(m.sid)
    const target = m.sid === runtime.sessionId ? runtime.local : remote
    if (target?.chatRef) target.chatRef.current = { text: m.text, until: Date.now() + 7000 }
  },

  raceResults(m) {
    useGame.setState((s) => ({ race: { ...s.race, results: m.standings, joined: false } }))
  },

  stock(m) {
    useGame.setState({ moonlitStock: m.moonlitStock })
    runtime.worldView?.applyStock(m.moonlitStock)
  },

  pong(m) {
    const now = Date.now()
    const rtt = now - m.t
    const offset = m.now - (m.t + rtt / 2)
    runtime.timeOffset = runtime.timeOffset ? runtime.timeOffset * 0.7 + offset * 0.3 : offset
    runtime.ping = rtt
  },
}

const GUEST_KEY = 'jetpack_escape_guest_id'
export function guestId() {
  try {
    let id = localStorage.getItem(GUEST_KEY)
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18))
      id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32)
      localStorage.setItem(GUEST_KEY, id)
    }
    return id
  } catch {
    return `tmp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 32)
  }
}

/* ------------------------------------------------------------------------ */
/* Connecting                                                                */
/* ------------------------------------------------------------------------ */

/** The room we are in, so a sign-in mid-game or a dropped socket returns to it. */
let current = { publicId: null, identity: null }

function joinOptions(identity, partyKey) {
  return {
    token: identity.token || undefined,
    guestId: guestId(),
    name: identity.name,
    pfp: identity.pfp,
    avatar: identity.avatar,
    partyKey,
  }
}

async function tryJoinById(publicId, options) {
  try {
    const { endpoint, roomId } = await locateRoom(publicId)
    const room = await new Client(endpoint).joinById(roomId, options)
    return { room, relayRoomId: publicId.includes('~') ? publicId.split('~')[0] : null }
  } catch (err) {
    console.info('[net] room', publicId, 'unavailable, matchmaking instead:', err?.message || err)
    return null
  }
}

async function matchmake(options, onWait) {
  // Hosted: a failed join after a resolve means a cold or busy pod - resolve
  // again with backoff, give up after ~60 s.
  const started = Date.now()
  let delay = 1000
  for (;;) {
    const { endpoint, relayRoomId } = await resolveEndpoint({ onWait })
    try {
      return { room: await new Client(endpoint).joinOrCreate(ROOM_NAME, options), relayRoomId }
    } catch (err) {
      if (!HOSTING_ID || Date.now() - started > 60000) throw err
      onWait?.('Finding a server...')
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 2, 8000)
    }
  }
}

/**
 * Joins the game. Order of preference: the Boxity party's own room, then a
 * specific room (?roomId= / rejoin), then normal matchmaking.
 * @param {{ token?: string, name?: string, pfp?: string, avatar?: object }} identity
 * @param {{ roomId?: string|null, onWait?: (msg: string) => void }} [opts]
 */
export async function connect(identity, { roomId = null, onWait } = {}) {
  const party = await getPartyLaunch()
  const ownParty = party && !party.managed
  const options = joinOptions(identity, ownParty ? party.roomKey : PUBLIC_PARTY)

  let joined = null
  const target = ownParty ? null : roomId || takeLaunchRoomId()
  if (target) joined = await tryJoinById(target, options)
  if (!joined) {
    try {
      joined = await matchmake(options, onWait)
    } catch (err) {
      // Never split a party into public rooms: tell Boxity instead.
      if (ownParty) partyFailed('room-full')
      throw err
    }
  }
  const { room, relayRoomId } = joined
  if (party) partyJoined(room.roomId)
  current = { publicId: publicRoomId(room.roomId, relayRoomId), identity }
  attach(room)
  reportRoom(current.publicId)
  resetPresence()
  gameplayStart()
  return room
}

/** Rejoin the same room with a new identity (signing in or out mid-game). */
export async function rejoin(identity) {
  const old = runtime.room
  if (old) {
    old.intentionalLeave = true
    await old.leave().catch(() => {})
  }
  return connect(identity, { roomId: current.publicId })
}

/** Leaving to the menu. */
export function disconnect() {
  const room = runtime.room
  if (room) {
    room.intentionalLeave = true
    room.leave().catch(() => {})
  }
  reportRoom('')
  gameplayEnd()
}

/** Close code the server uses when its pod is draining (deploy / scale-down). */
const SERVER_MOVING = 4100

/**
 * The socket dropped: try to get back into the same room for up to a minute.
 * When the pod is being replaced, skip the old room and let the matchmaker
 * seat us on a fresh pod.
 */
async function reconnect({ sameRoom = true } = {}) {
  useGame.setState({ reconnecting: true })
  const started = Date.now()
  while (Date.now() - started < 60000) {
    try {
      const identity = { ...current.identity, token: current.identity?.token ? getToken() : undefined }
      await connect(identity, { roomId: sameRoom ? current.publicId : null })
      useGame.setState({ reconnecting: false })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  useGame.setState({ reconnecting: false })
  reportRoom('')
  gameplayEnd()
  getGame().setPhase('error', 'Lost connection to the server.')
}

function attach(room) {
  runtime.room = room
  runtime.sessionId = room.sessionId
  lastSteps = null

  for (const [type, fn] of Object.entries(handlers)) {
    room.onMessage(type, (msg) => {
      try {
        fn(msg)
      } catch (err) {
        console.error(`[net] ${type} handler failed`, err)
      }
    })
  }

  room.onLeave((code) => {
    clearInterval(pingTimer)
    if (runtime.room === room) runtime.room = null
    if (room.intentionalLeave) return
    if (code === 4000) {
      reportRoom('')
      gameplayEnd()
      getGame().setPhase('error', 'You joined from another tab.')
    } else {
      reconnect({ sameRoom: code !== SERVER_MOVING })
    }
  })
  room.onError?.((code, message) => console.warn('[net] room error', code, message))

  const ping = () => send('ping', { t: Date.now() })
  ping()
  setTimeout(ping, 1000)
  clearInterval(pingTimer)
  pingTimer = setInterval(ping, 8000)
}
