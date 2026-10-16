import { PHYSICS } from '../../../shared/config.js'
import { crusherState, jetVelocity } from '../../../shared/world.js'

/**
 * Collision + character controller.
 *
 * Every solid in the world is an axis-aligned box, so a hand-rolled AABB
 * controller is both cheaper and more predictable than a general physics
 * engine — and it has to match `airRange()` in shared/world.js exactly, since
 * that is what the stage gaps were sized with.
 */

const R = PHYSICS.PLAYER_RADIUS
const H = PHYSICS.PLAYER_HEIGHT
const CELL = 64
const EPS = 1e-4
const MAX_SUBSTEP = 0.45

const cellKey = (ix, iz) => (ix + 4096) * 65536 + (iz + 32768)

export class CollisionWorld {
  constructor(world) {
    this.grid = new Map()
    this.killGrid = new Map()
    this.dynamics = []
    this.lasers = []
    this.stamp = 1
    this.raceGateClosed = true

    const addStatic = (b, extra = {}) => {
      const c = { min: b.min.slice(), max: b.max.slice(), kind: b.kind, vel: b.vel, bounce: b.bounce, tm: b.tm, stamp: 0, ...extra }
      this.insert(this.grid, c)
      return c
    }
    for (const b of world.boxes) {
      if (b.solid === false) continue
      if (b.raceGate) {
        this.dynamics.push({ min: b.min.slice(), max: b.max.slice(), gate: true, solid: true, stamp: 0 })
        continue
      }
      addStatic(b)
    }
    for (const p of world.stepPads) addStatic(p, { kind: 'stepPad' })
    for (const p of world.pads) addStatic(p, { kind: 'trophyPad' })

    for (const m of world.movers) {
      this.dynamics.push({
        mover: true,
        base: { min: m.min, max: m.max },
        min: m.min.slice(),
        max: m.max.slice(),
        axis: m.axis,
        amp: m.amp,
        period: m.period,
        phase: m.phase,
        offset: null,
        delta: [0, 0, 0],
        vel: null,
        solid: true,
        stamp: 0,
      })
    }
    for (const b of world.blinkers) {
      this.dynamics.push({ blink: true, min: b.min.slice(), max: b.max.slice(), period: b.period, on: b.on, phase: b.phase, solid: true, stamp: 0 })
    }
    for (const k of world.kills) this.insert(this.killGrid, { min: k.min, max: k.max, kind: k.kind, stamp: 0 })
    for (const l of world.lasers) this.lasers.push({ min: l.min, max: l.max, period: l.period, on: l.on, phase: l.phase, active: false, kind: l.bolt ? 'lightning' : 'laser' })
    this.crushers = world.crushers.map((c) => ({ c, left: c.cx - c.open, right: c.cx + c.open }))
  }

  insert(grid, c) {
    const x0 = Math.floor(c.min[0] / CELL)
    const x1 = Math.floor(c.max[0] / CELL)
    const z0 = Math.floor(c.min[2] / CELL)
    const z1 = Math.floor(c.max[2] / CELL)
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const key = cellKey(ix, iz)
        let list = grid.get(key)
        if (!list) grid.set(key, (list = []))
        list.push(c)
      }
    }
  }

  /** Advance movers/blinkers/lasers to shared world time `t` (seconds). */
  update(t) {
    for (const d of this.dynamics) {
      if (d.mover) {
        const off = d.amp * Math.sin((Math.PI * 2 * t) / d.period + d.phase)
        const prev = d.offset ?? off
        d.offset = off
        for (let i = 0; i < 3; i += 1) {
          d.min[i] = d.base.min[i] + d.axis[i] * off
          d.max[i] = d.base.max[i] + d.axis[i] * off
          d.delta[i] = d.axis[i] * (off - prev)
        }
      } else if (d.blink) {
        d.solid = (((t / d.period + d.phase) % 1) + 1) % 1 < d.on
      } else if (d.gate) {
        d.solid = this.raceGateClosed
      }
    }
    for (const l of this.lasers) l.active = (((t / l.period + l.phase) % 1) + 1) % 1 < l.on
    for (const k of this.crushers) {
      const s = crusherState(k.c, t)
      k.left = s.left
      k.right = s.right
    }
  }

  /** Calls fn(box) for each solid overlapping the AABB. */
  query(min0, min1, min2, max0, max1, max2, fn) {
    const stamp = ++this.stamp
    const x0 = Math.floor(min0 / CELL)
    const x1 = Math.floor(max0 / CELL)
    const z0 = Math.floor(min2 / CELL)
    const z1 = Math.floor(max2 / CELL)
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const list = this.grid.get(cellKey(ix, iz))
        if (!list) continue
        for (const c of list) {
          if (c.stamp === stamp) continue
          c.stamp = stamp
          if (c.min[0] < max0 && c.max[0] > min0 && c.min[1] < max1 && c.max[1] > min1 && c.min[2] < max2 && c.max[2] > min2) fn(c)
        }
      }
    }
    for (const c of this.dynamics) {
      if (!c.solid) continue
      if (c.min[0] < max0 && c.max[0] > min0 && c.min[1] < max1 && c.max[1] > min1 && c.min[2] < max2 && c.max[2] > min2) fn(c)
    }
  }

  /** True if the player box at (x, y, z) overlaps anything solid. */
  blocked(x, y, z) {
    let hit = false
    this.query(x - R + EPS, y + EPS, z - R + EPS, x + R - EPS, y + H - EPS, z + R - EPS, () => {
      hit = true
    })
    return hit
  }

  /** Kill volumes (lava, acid, active lasers) touching the player at (x, y, z). */
  killedAt(x, y, z) {
    const shrink = 0.2
    const min0 = x - R + shrink
    const max0 = x + R - shrink
    const min1 = y + 0.05
    const max1 = y + H - shrink
    const min2 = z - R + shrink
    const max2 = z + R - shrink
    const list = this.killGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)))
    if (list) {
      for (const k of list) {
        if (k.min[0] < max0 && k.max[0] > min0 && k.min[1] < max1 && k.max[1] > min1 && k.min[2] < max2 && k.max[2] > min2) return k.kind || 'lava'
      }
    }
    for (const l of this.lasers) {
      if (!l.active) continue
      if (l.min[0] < max0 && l.max[0] > min0 && l.min[1] < max1 && l.max[1] > min1 && l.min[2] < max2 && l.max[2] > min2) return l.kind
    }
    for (const { c, left, right } of this.crushers) {
      if (c.z1 >= max2 || c.z0 <= min2 || c.y0 >= max1 || c.y1 <= min1) continue
      if (min0 < left || max0 > right) return 'crushed'
    }
    return null
  }

  /** Distance along a ray to the first solid, for camera collision. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist
    const ex = ox + dx * maxDist
    const ey = oy + dy * maxDist
    const ez = oz + dz * maxDist
    this.query(Math.min(ox, ex) - 0.5, Math.min(oy, ey) - 0.5, Math.min(oz, ez) - 0.5, Math.max(ox, ex) + 0.5, Math.max(oy, ey) + 0.5, Math.max(oz, ez) + 0.5, (c) => {
      let tmin = 0
      let tmax = best
      const o = [ox, oy, oz]
      const d = [dx, dy, dz]
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(d[i]) < 1e-8) {
          if (o[i] < c.min[i] || o[i] > c.max[i]) return
        } else {
          let t1 = (c.min[i] - o[i]) / d[i]
          let t2 = (c.max[i] - o[i]) / d[i]
          if (t1 > t2) [t1, t2] = [t2, t1]
          tmin = Math.max(tmin, t1)
          tmax = Math.min(tmax, t2)
          if (tmin > tmax) return
        }
      }
      if (tmin > 0 && tmin < best) best = tmin
    })
    return best
  }
}

/* ------------------------------------------------------------------------ */
/* Character controller                                                      */
/* ------------------------------------------------------------------------ */

export function createCharacter(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    ground: null,
    airTime: 0,
    coyote: 0,
    jumpBuffer: 0,
    jetting: false,
    fuel: 10,
    maxFuel: 10,
    /** One-frame events for audio/effects: jump, land (impact speed), bounce, ceiling. */
    events: { jump: false, land: 0, bounce: false },
  }
}

function moveAxis(cw, c, axis, delta, canStep) {
  if (delta === 0) return
  if (axis === 0) c.x += delta
  else if (axis === 1) c.y += delta
  else c.z += delta

  const min0 = c.x - R + EPS
  const max0 = c.x + R - EPS
  const min1 = c.y + EPS
  const max1 = c.y + H - EPS
  const min2 = c.z - R + EPS
  const max2 = c.z + R - EPS

  if (axis === 1) {
    let resolveTo = null
    let hitBox = null
    cw.query(min0, min1, min2, max0, max1, max2, (b) => {
      if (delta < 0) {
        if (resolveTo === null || b.max[1] > resolveTo) {
          resolveTo = b.max[1]
          hitBox = b
        }
      } else if (resolveTo === null || b.min[1] - H < resolveTo) {
        resolveTo = b.min[1] - H
        hitBox = b
      }
    })
    if (resolveTo === null) return
    c.y = resolveTo
    if (delta < 0) {
      c.events.land = Math.max(c.events.land, -c.vy)
      c.grounded = true
      c.ground = hitBox
      c.vy = 0
    } else if (c.vy > 0) {
      c.vy = 0
    }
    return
  }

  // Horizontal: try to step up onto low ledges (stairs, pads), else slide.
  let blocker = null
  let stepTo = -Infinity
  cw.query(min0, min1, min2, max0, max1, max2, (b) => {
    const rise = b.max[1] - c.y
    if (canStep && rise > 0 && rise <= PHYSICS.STEP_HEIGHT) {
      stepTo = Math.max(stepTo, b.max[1])
    } else {
      blocker = blocker || b
      if (delta > 0) {
        const edge = b.min[axis] - R - EPS * 2
        if (axis === 0 ? edge < c.x : edge < c.z) {
          if (axis === 0) c.x = edge
          else c.z = edge
        }
      } else {
        const edge = b.max[axis] + R + EPS * 2
        if (axis === 0 ? edge > c.x : edge > c.z) {
          if (axis === 0) c.x = edge
          else c.z = edge
        }
      }
    }
  })
  if (!blocker && stepTo > -Infinity) {
    if (!cw.blocked(c.x, stepTo + 0.01, c.z)) {
      c.y = stepTo + 0.01
      return
    }
    // No headroom to step up: treat as a wall.
    if (axis === 0) c.x -= delta
    else c.z -= delta
  }
  if (blocker || stepTo > -Infinity) {
    if (axis === 0) c.vx = 0
    else c.vz = 0
  }
}

/**
 * One frame of movement.
 * @param {{ wishX:number, wishZ:number, speed:number, jumpHeld:boolean, jumpPressed:boolean }} ctl
 */
export function stepCharacter(cw, c, ctl, dt) {
  const P = PHYSICS
  c.events.jump = false
  c.events.land = 0
  c.events.bounce = false

  const wasGrounded = c.grounded
  const ground = c.grounded ? c.ground : null

  // Ride moving platforms.
  if (ground?.mover) {
    c.x += ground.delta[0]
    c.y += ground.delta[1]
    c.z += ground.delta[2]
  }
  // Vanished blinker / opened gate under our feet.
  if (ground && (ground.blink || ground.gate) && !ground.solid) c.grounded = false

  // Horizontal velocity eases toward the wish (ice = slippery, flying = faster).
  const accel = c.grounded ? (ground?.kind === 'ice' ? P.ICE_ACCEL : P.GROUND_ACCEL) : P.AIR_ACCEL
  const k = 1 - Math.exp(-accel * dt)
  const wishSpeed = ctl.speed * (c.jetting ? P.FLY_SPEED_MULT : 1)
  c.vx += (ctl.wishX * wishSpeed - c.vx) * k
  c.vz += (ctl.wishZ * wishSpeed - c.vz) * k

  // Jump with a little buffering and coyote time.
  if (ctl.jumpPressed) c.jumpBuffer = 0.14
  c.jumpBuffer -= dt
  c.coyote = c.grounded ? 0.1 : c.coyote - dt
  if (c.jumpBuffer > 0 && (c.grounded || c.coyote > 0)) {
    c.vy = P.JUMP_VELOCITY
    c.grounded = false
    c.coyote = 0
    c.jumpBuffer = 0
    c.airTime = 0
    c.events.jump = true
  }

  // Jetpack / gravity.
  c.jetting = false
  if (!c.grounded) {
    c.airTime += dt
    if (ctl.jumpHeld && c.airTime > P.JET_DELAY && c.fuel > 0) {
      c.jetting = true
      c.fuel = Math.max(0, c.fuel - P.FUEL_DRAIN * dt)
      c.vy = jetVelocity(c.vy, Math.hypot(ctl.wishX, ctl.wishZ) > 0.1, dt)
    } else {
      c.vy -= P.GRAVITY * dt
    }
  } else {
    c.airTime = 0
    c.fuel = Math.min(c.maxFuel, c.fuel + c.maxFuel * P.FUEL_REFILL_RATE * dt)
    c.vy -= P.GRAVITY * dt
  }
  if (c.vy < -P.TERMINAL_VELOCITY) c.vy = -P.TERMINAL_VELOCITY

  // Conveyor push.
  let ex = 0
  let ez = 0
  if (c.grounded && ground?.kind === 'conveyor' && ground.vel) {
    ex = ground.vel[0]
    ez = ground.vel[1]
  }

  const dx = (c.vx + ex) * dt
  const dy = c.vy * dt
  const dz = (c.vz + ez) * dt
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / MAX_SUBSTEP))
  const canStep = wasGrounded || c.grounded
  c.grounded = false
  c.ground = null
  for (let i = 0; i < steps; i += 1) {
    moveAxis(cw, c, 0, dx / steps, canStep && c.vy <= 0.01)
    moveAxis(cw, c, 2, dz / steps, canStep && c.vy <= 0.01)
    moveAxis(cw, c, 1, dy / steps, false)
  }

  // Stick to the ground walking down stairs instead of "falling" every step.
  if (!c.grounded && wasGrounded && !c.events.jump && c.vy <= 0) {
    let top = -Infinity
    let hit = null
    cw.query(c.x - R + EPS, c.y - P.STEP_HEIGHT, c.z - R + EPS, c.x + R - EPS, c.y + EPS, c.z + R - EPS, (b) => {
      if (b.max[1] <= c.y + EPS && b.max[1] > top) {
        top = b.max[1]
        hit = b
      }
    })
    if (hit) {
      c.y = top
      c.vy = 0
      c.grounded = true
      c.ground = hit
    }
  }

  // Only report a landing on the frame we actually touch down.
  c.events.land = c.grounded && !wasGrounded ? Math.max(c.events.land, 0.01) : 0

  if (c.grounded && c.ground?.kind === 'bounce' && c.ground.bounce) {
    c.vy = c.ground.bounce
    c.grounded = false
    c.airTime = P.JET_DELAY + 0.01
    c.events.bounce = true
  }
}
