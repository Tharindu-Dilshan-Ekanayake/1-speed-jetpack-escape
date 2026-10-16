import { BOOST_BY_ID, FREE_CHEST, JETPACK_BY_ID, NET, PRODUCT_BY_SKU, TREADMILL_TYPES, speedForLevel } from '../../../shared/config.js'
import { formatNumber } from '../../../shared/format.js'
import { ANIM } from '../../../shared/net.js'
import { zoneAt } from '../../../shared/world.js'
import { send } from '../net/connection.js'
import { getGame, useGame } from '../state/gameStore.js'
import { runtime } from '../state/runtime.js'
import { audio } from './audio.js'
import { input } from './input.js'
import { createCharacter, stepCharacter } from './physics.js'
import { stopEmote, updatePose } from './pose.js'

const SEND_INTERVAL = 1 / NET.SEND_HZ
const RESPAWN_DELAY = 1.4
/** A bit tighter than the server's reach, so a coin that vanishes is always paid. */
const COIN_REACH = 3.8

const COINS_BY_STAGE = {}
for (const coin of runtime.world.coins) (COINS_BY_STAGE[coin.stage] ||= []).push(coin)

const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Prompt shown above the action button for the interactable in range. */
function describeInteractable(it, profile, now) {
  switch (it.kind) {
    case 'jetpack': {
      const jp = JETPACK_BY_ID[it.jetpack]
      const owned = profile.jetpacks.includes(jp.id)
      if (profile.jetpack === jp.id) return { title: jp.name, action: 'Equipped', disabled: true, sub: `Fuel ${jp.fuel}` }
      if (owned) return { title: jp.name, action: 'Equip', sub: `Fuel ${jp.fuel}` }
      const price = jp.sku ? PRODUCT_BY_SKU[jp.sku].price : jp.price
      return { title: jp.name, action: 'Buy', price: { trophies: price }, sub: `Fuel ${jp.fuel}`, short: profile.trophies < price }
    }
    case 'boost': {
      const b = BOOST_BY_ID[it.boost]
      if (profile.boosts.includes(b.id)) return { title: `+${formatNumber(b.amount)} steps`, action: 'Owned', disabled: true }
      return { title: `+${formatNumber(b.amount)} steps per step`, action: 'Buy', price: { trophies: b.price }, short: profile.trophies < b.price }
    }
    case 'crates':
      return { title: 'Crates', action: 'Open' }
    case 'buySkin':
      return { title: 'Moonlit Pulse', action: 'View' }
    case 'event':
      return { title: 'Spooky Season', action: 'Open' }
    case 'chest': {
      const wait = profile.chestAt + FREE_CHEST.cooldown * 1000 - now
      if (wait > 0) return { title: 'Free Chest', action: `${Math.ceil(wait / 60000)} min`, disabled: true }
      return { title: 'Free Chest', action: 'Claim' }
    }
    default:
      return null
  }
}

export function createLocalController({ poseRef, thrustRef, chatRef }) {
  const world = runtime.world
  const s = world.spawn
  const c = createCharacter(s.x, s.y, s.z)
  let group = null
  let alive = true
  let deadFor = 0
  let pendingRespawn = null
  let sendTimer = 0
  let promptTimer = 0
  let fuelTimer = 0
  let lastPromptKey = ''
  let currentPrompt = null
  let stepCycle = 0
  let lastVipNag = 0
  let anim = ANIM.idle
  let prevYaw = s.ry
  let zoneKind = 'lobby'
  let coinCombo = 0
  let lastCoinAt = 0

  const ctl = {
    state: c,
    chatRef,
    poseRef,
    yaw: s.ry,
    shakeAmount: 0,
    treadmill: -1,
    hSpeed: 0,

    attach(g) {
      group = g
    },

    setMaxFuel(fuel) {
      if (fuel !== c.maxFuel) {
        c.maxFuel = fuel
        c.fuel = fuel
      }
    },

    shake(amount) {
      ctl.shakeAmount = Math.max(ctl.shakeAmount, amount)
    },

    teleport(p, { snap = true, effect = false } = {}) {
      c.x = p.x
      c.y = p.y
      c.z = p.z
      c.vx = c.vy = c.vz = 0
      c.grounded = false
      c.fuel = c.maxFuel
      if (typeof p.ry === 'number') ctl.yaw = prevYaw = p.ry
      if (snap) runtime.cameraRig?.snap(ctl.yaw)
      if (effect) runtime.effects?.burst('spawn', c.x, c.y, c.z)
      runtime.effects?.forgetTrail('local')
      sendTimer = SEND_INTERVAL // send next frame
    },

    onRespawn(m) {
      pendingRespawn = m
    },

    die(cause) {
      if (!alive) return
      alive = false
      deadFor = 0
      pendingRespawn = null
      if (group) group.visible = false
      runtime.effects?.burst('death', c.x, c.y, c.z)
      runtime.worldView?.resetCoins()
      audio.play('death')
      audio.setJet(0)
      thrustRef.current = false
      ctl.shake(0.5)
      send('died', { cause })
      useGame.setState({ prompt: null })
    },

    interact() {
      const p = currentPrompt
      if (!p || p.disabled) return
      const it = p.it
      audio.play('click')
      switch (it.kind) {
        case 'jetpack': {
          const profile = getGame().profile
          const jp = JETPACK_BY_ID[it.jetpack]
          if (profile.jetpacks.includes(jp.id)) send('equipJetpack', { id: jp.id })
          else send('buyJetpack', { id: jp.id })
          break
        }
        case 'boost':
          send('buyBoost', { id: it.boost })
          break
        case 'crates':
          getGame().openPanel('crates')
          break
        case 'buySkin':
          getGame().openPanel('shop', 'moonlit_pulse')
          break
        case 'event':
          getGame().openPanel('event')
          break
        case 'chest':
          send('chest')
          break
        default:
          break
      }
    },

    /** Coins within reach: hide at once (feels instant); the server confirms and pays. */
    grabCoins(stage) {
      const list = COINS_BY_STAGE[stage]
      if (!list || !runtime.worldView) return
      for (const coin of list) {
        if (Math.abs(coin.pos[0] - c.x) > COIN_REACH || Math.abs(coin.pos[2] - c.z) > COIN_REACH) continue
        if (Math.abs(coin.pos[1] - (c.y + 2.5)) > 4.5) continue
        if (Math.hypot(coin.pos[0] - c.x, coin.pos[2] - c.z) > COIN_REACH) continue
        if (!runtime.worldView.takeCoin(coin.id)) continue
        const now = performance.now()
        coinCombo = now - lastCoinAt < 1500 ? coinCombo + 1 : 0
        lastCoinAt = now
        audio.play('coin', { combo: coinCombo })
        runtime.effects?.burst('coin', coin.pos[0], coin.pos[1], coin.pos[2])
      }
    },

    update(dt) {
      const game = getGame()
      const profile = game.profile
      const cw = runtime.collision
      if (!cw || !profile) return

      if (!alive) {
        deadFor += dt
        if (deadFor > RESPAWN_DELAY && pendingRespawn) {
          const m = pendingRespawn
          pendingRespawn = null
          alive = true
          if (group) group.visible = true
          ctl.teleport(m, { snap: true, effect: true })
        }
        return
      }

      // ---- movement intent, relative to the camera ----
      const camYaw = runtime.cameraRig?.yaw ?? ctl.yaw
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.stickX
      let my = (input.forward ? 1 : 0) - (input.backward ? 1 : 0) + input.stickY
      const len = Math.hypot(mx, my)
      if (len > 1) {
        mx /= len
        my /= len
      }
      const fx = -Math.sin(camYaw)
      const fz = -Math.cos(camYaw)
      const rx = Math.cos(camYaw)
      const rz = -Math.sin(camYaw)
      const wishX = rx * mx + fx * my
      const wishZ = rz * mx + fz * my
      const moving = len > 0.05

      const limit = game.speedLimit
      const level = limit ? Math.min(limit, profile.level) : profile.level
      const speed = speedForLevel(level)

      // ---- treadmill: stand still on the belt to train ----
      ctl.treadmill = -1
      if (c.grounded && c.ground?.kind === 'treadmill' && !moving) {
        const tm = world.treadmills[c.ground.tm]
        const type = TREADMILL_TYPES[tm?.type]
        const needs = type?.requires
        const ok = !needs || profile.passes[needs] || (needs === 'vip' && profile.passes.vip_plus)
        if (ok) ctl.treadmill = c.ground.tm
        else if (performance.now() - lastVipNag > 5000) {
          lastVipNag = performance.now()
          game.showBanner(`${needs === 'vip' ? 'VIP' : 'VIP+'} required for this treadmill!`, 'info', 2000)
        }
      }

      stepCharacter(cw, c, { wishX, wishZ, speed, jumpHeld: input.jump || input.touchJump, jumpPressed: input.jumpPressed }, dt)

      // ---- events: audio + effects ----
      if (c.events.jump) audio.play('jump')
      if (c.events.bounce) {
        audio.play('bounce')
        ctl.shake(0.2)
      }
      if (c.events.land > 0) {
        if (c.events.land > 25) {
          audio.play('land', { impact: c.events.land })
          runtime.effects?.burst('land', c.x, c.y, c.z, { impact: c.events.land })
          if (c.events.land > 90) ctl.shake(Math.min(0.5, c.events.land / 400))
        }
      }

      thrustRef.current = c.jetting
      audio.setJet(c.jetting ? 1 : 0)

      // ---- facing ----
      const hx = c.vx
      const hz = c.vz
      ctl.hSpeed = Math.hypot(hx, hz)
      if (ctl.treadmill >= 0) {
        const d = world.treadmills[ctl.treadmill].dir
        ctl.yaw = angleLerp(ctl.yaw, Math.atan2(d[0], d[2]), 1 - Math.exp(-10 * dt))
      }
      else if (ctl.hSpeed > 0.6 && moving) ctl.yaw = angleLerp(ctl.yaw, Math.atan2(hx, hz), 1 - Math.exp(-14 * dt))

      if (c.jetting && runtime.effects) {
        const flame = JETPACK_BY_ID[profile.jetpack]?.flame || '#ffb347'
        runtime.effects.jetpackExhaust(c.x, c.y, c.z, ctl.yaw, poseRef.current.bodyPitch, flame)
      }

      // ---- death ----
      const zone = zoneAt(world, c.x, c.y + 2, c.z)
      runtime.zone = zone
      const kind = zone?.kind || zoneKind
      if (kind === 'lobby' && zoneKind !== 'lobby') runtime.worldView?.resetCoins()
      zoneKind = kind
      if (zone?.kind === 'stage') ctl.grabCoins(zone.stage)
      let killed = cw.killedAt(c.x, c.y, c.z)
      for (const g of runtime.ghosts || []) {
        if (Math.hypot(g.x - c.x, g.y - (c.y + 2.5), g.z - c.z) < g.radius + 1.2) killed = 'ghost'
      }
      if (killed || (zone && c.y < zone.killY) || c.y < -400) {
        ctl.die(killed || 'fall')
        return
      }

      // ---- animation ----
      if (c.jetting) anim = ANIM.fly
      else if (c.grounded) anim = ctl.treadmill >= 0 ? ANIM.treadmill : ctl.hSpeed > 1.5 ? ANIM.run : ANIM.idle
      else anim = c.vy > 0 ? ANIM.jump : ANIM.fall
      let turn = ctl.yaw - prevYaw
      if (turn > Math.PI) turn -= Math.PI * 2
      else if (turn < -Math.PI) turn += Math.PI * 2
      prevYaw = ctl.yaw
      updatePose(poseRef.current, { anim, speed: ctl.hSpeed, turn: turn / Math.max(dt, 1e-3) }, dt)
      if (poseRef.current.spinStarted) audio.play('spin')
      // An emote ends as soon as the player moves.
      const emote = poseRef.current.emote
      if (emote && !emote.stopping && (moving || !c.grounded)) {
        stopEmote(poseRef.current)
        send('emoteStop')
      }

      // Footsteps on each foot plant.
      if (anim === ANIM.run || anim === ANIM.treadmill) {
        const cyc = Math.floor(poseRef.current.cycle / Math.PI)
        if (cyc !== stepCycle) {
          stepCycle = cyc
          audio.play('step')
        }
      }

      if (group) {
        group.position.set(c.x, c.y, c.z)
        group.rotation.y = ctl.yaw
      }

      const ex = c.grounded && c.ground?.kind === 'conveyor' ? c.ground.vel[0] : 0
      runtime.effects?.trail('local', profile.trail, c.x, c.y + 2.6, c.z, c.vx + ex, c.vy, c.vz, dt)

      // ---- network ----
      sendTimer += dt
      if (sendTimer >= SEND_INTERVAL) {
        sendTimer = 0
        send('move', {
          x: Math.round(c.x * 100) / 100,
          y: Math.round(c.y * 100) / 100,
          z: Math.round(c.z * 100) / 100,
          ry: Math.round(ctl.yaw * 1000) / 1000,
          a: anim,
          s: Math.round(ctl.hSpeed * 10) / 10,
          tm: ctl.treadmill,
        })
      }

      // ---- proximity prompt ----
      promptTimer += dt
      if (promptTimer > 0.15) {
        promptTimer = 0
        let best = null
        let bestD = Infinity
        for (const it of world.interactables) {
          if (it.touch) continue
          const d = Math.hypot(c.x - it.pos[0], c.z - it.pos[2])
          if (d < it.r && d < bestD && Math.abs(c.y - it.pos[1]) < 12) {
            best = it
            bestD = d
          }
        }
        const desc = best ? describeInteractable(best, profile, Date.now()) : null
        currentPrompt = desc ? { ...desc, it: best } : null
        const key = currentPrompt ? JSON.stringify(desc) + best.id : ''
        if (key !== lastPromptKey) {
          lastPromptKey = key
          useGame.setState({ prompt: currentPrompt ? { ...desc, id: best.id } : null })
        }
      }

      // ---- HUD fuel (10 Hz) ----
      fuelTimer += dt
      if (fuelTimer > 0.1) {
        fuelTimer = 0
        const f = game.fuel
        const cur = Math.round(c.fuel)
        if (f.cur !== cur || f.max !== c.maxFuel) useGame.setState({ fuel: { cur, max: c.maxFuel } })
      }

      ctl.shakeAmount = Math.max(0, ctl.shakeAmount - dt * 1.5)
    },
  }
  return ctl
}
