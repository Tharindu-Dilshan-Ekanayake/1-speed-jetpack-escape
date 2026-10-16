/**
 * Deterministic world generator.
 *
 * Builds the lobby, the nine stages with their reward rooms, and the race
 * track as plain data (axis-aligned boxes, kill volumes, triggers, signs).
 * The client turns it into meshes + collision; the server uses the same data
 * to validate trophy pads, pumpkins, treadmills and stage progress, so both
 * sides always agree on where everything is.
 *
 * Axes: +Y up. The course runs toward -Z. The avatar faces +Z at yaw 0.
 * Every room is fully enclosed (walls + ceiling) — there is no sky anywhere.
 */
import { PHYSICS, STAGES, JETPACKS, STEP_BOOSTS, speedForLevel } from './config.js'
import { mulberry32, clamp } from './rng.js'

/* ------------------------------------------------------------------------ */
/* Themes                                                                    */
/* ------------------------------------------------------------------------ */

export const LOBBY_THEME = {
  floor: '#cfcaf7',
  wall: '#8f88e6',
  ceil: '#6f67cf',
  trim: '#1e4f9c',
  pillar: '#a49ef0',
  fog: '#3b3478',
  fogDensity: 0.0032,
  hemiSky: '#e6e2ff',
  hemiGround: '#7c74d6',
  hemi: 1.15,
  sun: 0.9,
}

export const THEMES = {
  lava: {
    wall: '#7b6fd6', wallTex: 'tile', ceil: '#5d53b6', pillar: '#8c82e3',
    platTop: '#2457c5', platTopTex: 'studs', platSide: '#e7b8c8', platSideTex: 'dots',
    hazard: 'lava', solidPlatforms: true,
    fog: '#4a2048', fogDensity: 0.0042, hemiSky: '#d9c9ff', hemiGround: '#ff8a3a', hemi: 1.05, sun: 0.7,
    accent: '#ff9d3a', torch: '#ffb15a', ghosts: 3,
  },
  crypt: {
    wall: '#a8875c', wallTex: 'brick', ceil: '#7c6040', pillar: '#c49d6b',
    platTop: '#2a4d8f', platTopTex: 'studs', platSide: '#e3c6a6', platSideTex: 'dots',
    hazard: 'void', solidPlatforms: true,
    fog: '#5b4026', fogDensity: 0.0036, hemiSky: '#ffe2b8', hemiGround: '#6b4a2a', hemi: 1.0, sun: 0.6,
    accent: '#ffd28a', torch: '#ffc46b', ghosts: 4,
  },
  void: {
    wall: '#2b2449', wallTex: 'tile', ceil: '#1b1632', pillar: '#2f5fa8',
    platTop: '#9c6a3c', platTopTex: 'plank', platSide: '#6f4724', platSideTex: 'plank',
    hazard: 'void', solidPlatforms: false,
    fog: '#120d24', fogDensity: 0.0024, hemiSky: '#9aa8ff', hemiGround: '#1a1030', hemi: 0.85, sun: 0.45,
    accent: '#5ad1ff', torch: '#4cc3ff', ghosts: 3,
  },
  ice: {
    wall: '#9fd2fb', wallTex: 'tile', ceil: '#7db4e6', pillar: '#c7e8ff',
    platTop: '#eaf7ff', platTopTex: 'ice', platSide: '#a6d6f4', platSideTex: 'ice',
    hazard: 'water', solidPlatforms: true,
    fog: '#9ccbe8', fogDensity: 0.0016, hemiSky: '#ffffff', hemiGround: '#5c9fd6', hemi: 1.15, sun: 0.85,
    accent: '#d8f6ff', torch: '#bff0ff', ghosts: 1,
  },
  toxic: {
    wall: '#3c4d3c', wallTex: 'metal', ceil: '#283528', pillar: '#56684f',
    platTop: '#f2c230', platTopTex: 'hazard', platSide: '#5b6b5b', platSideTex: 'metal',
    hazard: 'acid', solidPlatforms: true,
    fog: '#1d3a17', fogDensity: 0.0013, hemiSky: '#d9ffcf', hemiGround: '#3cff4a', hemi: 0.95, sun: 0.6,
    accent: '#7dff4a', torch: '#8dff5a', ghosts: 1,
  },
  crystal: {
    wall: '#3c2358', wallTex: 'tile', ceil: '#2a173f', pillar: '#5a3a86',
    platTop: '#c79bff', platTopTex: 'crystal', platSide: '#7a4bb3', platSideTex: 'crystal',
    hazard: 'void', solidPlatforms: false,
    fog: '#2a1240', fogDensity: 0.0011, hemiSky: '#ffc9fb', hemiGround: '#3a1466', hemi: 1.0, sun: 0.55,
    accent: '#ff7bf2', torch: '#ff8af5', ghosts: 1,
  },
  neon: {
    wall: '#191b33', wallTex: 'metal', ceil: '#0f1122', pillar: '#25284a',
    platTop: '#24284a', platTopTex: 'grid', platSide: '#30355c', platSideTex: 'metal',
    hazard: 'void', solidPlatforms: false,
    fog: '#0b0c1c', fogDensity: 0.0009, hemiSky: '#b3e9ff', hemiGround: '#ff2bd6', hemi: 0.9, sun: 0.5,
    accent: '#00f0ff', accent2: '#ff2bd6', torch: '#00e5ff', ghosts: 0,
  },
  storm: {
    wall: '#2c3652', wallTex: 'metal', ceil: '#1c2338', pillar: '#3c4a70',
    platTop: '#5a6684', platTopTex: 'metal', platSide: '#3c4663', platSideTex: 'metal',
    hazard: 'plasma', solidPlatforms: false,
    fog: '#1a1f36', fogDensity: 0.0008, hemiSky: '#cfe0ff', hemiGround: '#8f6bff', hemi: 0.95, sun: 0.55,
    accent: '#9dc4ff', torch: '#a8c8ff', ghosts: 0,
  },
  core: {
    wall: '#f0deb0', wallTex: 'tile', ceil: '#d9c086', pillar: '#ffe9a8',
    platTop: '#ffffff', platTopTex: 'studs', platSide: '#ffcf3d', platSideTex: 'dots',
    hazard: 'gold', solidPlatforms: true,
    fog: '#4d3612', fogDensity: 0.0007, hemiSky: '#fff6d8', hemiGround: '#ffb000', hemi: 1.15, sun: 0.8,
    accent: '#fff2a8', torch: '#fff0b0', ghosts: 2,
  },
}

export const REWARD_THEME = {
  floor: '#b9b3f2', wall: '#8079dc', ceil: '#625ac2', trim: '#1e4f9c',
  fog: '#3a3270', fogDensity: 0.004, hemiSky: '#e6e2ff', hemiGround: '#7c74d6', hemi: 1.1, sun: 0.8,
}

const HAZARD_COLORS = {
  lava: '#ff7a1a', acid: '#6cff3a', water: '#2f7fd0', plasma: '#9a6bff', gold: '#ffb000',
}

/* ------------------------------------------------------------------------ */
/* Flight model (mirrors the client controller exactly)                      */
/* ------------------------------------------------------------------------ */

/**
 * Vertical speed after one step of jetpack thrust. Thrust never pushes down:
 * above the target speed the player just decelerates under gravity (so jumps
 * and bounce pads keep their arc); below it, thrust eases them up to it.
 * Shared by the client controller and the level generator.
 */
export function jetVelocity(vy, moving, dt) {
  const target = moving ? PHYSICS.JET_CRUISE_VY : PHYSICS.JET_CLIMB_VY
  if (vy > target) return Math.max(target, vy - PHYSICS.GRAVITY * dt)
  return vy + (target - vy) * (1 - Math.exp(-PHYSICS.JET_RESPONSE * dt))
}

/**
 * Simulates running off a ledge, jumping and holding the jetpack while moving
 * forward until the fuel runs out. Mirrors stepCharacter() exactly.
 * Returns { range, peak }: horizontal distance covered when landing `dh` above
 * take-off, and the highest point reached.
 */
function simulateFlight(speed, fuel, ceilingClear, dh = 0) {
  const { GRAVITY: g, JUMP_VELOCITY, JET_DELAY, FUEL_DRAIN, TERMINAL_VELOCITY, PLAYER_HEIGHT, AIR_ACCEL, FLY_SPEED_MULT } = PHYSICS
  const dt = 1 / 120
  const top = Math.max(PLAYER_HEIGHT + 1, ceilingClear) - PLAYER_HEIGHT
  const k = 1 - Math.exp(-AIR_ACCEL * dt)
  let x = 0
  let y = 0
  let vx = speed
  let vy = JUMP_VELOCITY
  let f = fuel
  let t = 0
  let jetting = false
  let peak = 0
  for (let i = 0; i < 60000; i += 1) {
    t += dt
    vx += (speed * (jetting ? FLY_SPEED_MULT : 1) - vx) * k
    jetting = t > JET_DELAY && f > 0
    if (jetting) {
      vy = jetVelocity(vy, true, dt)
      f -= FUEL_DRAIN * dt
    } else {
      vy -= g * dt
    }
    if (vy < -TERMINAL_VELOCITY) vy = -TERMINAL_VELOCITY
    y += vy * dt
    if (y > top) {
      y = top
      if (vy > 0) vy = 0
    }
    if (y > peak) peak = y
    x += vx * dt
    if (vy < 0 && y <= dh) return { range: x, peak }
  }
  return { range: x, peak }
}

/**
 * Crusher walls at shared world time `t` (seconds). Open half the cycle, then
 * slam shut, hold, and pull back. `warn` ramps 0 -> 1 just before a slam.
 * Returns the inner edges of the left and right walls.
 */
export function crusherState(c, t) {
  const p = (((t / c.period + c.phase) % 1) + 1) % 1
  let shut = 0
  if (p >= 0.5 && p < 0.62) shut = ((p - 0.5) / 0.12) ** 2
  else if (p >= 0.62 && p < 0.78) shut = 1
  else if (p >= 0.78) {
    const u = (p - 0.78) / 0.22
    shut = 1 - u * u * (3 - 2 * u)
  }
  const gap = c.open * (1 - shut)
  return { shut, warn: p >= 0.34 && p < 0.5 ? (p - 0.34) / 0.16 : 0, left: c.cx - gap, right: c.cx + gap }
}

/** Horizontal distance coverable landing `dh` above take-off. Sizes every gap. */
export const airRange = (speed, fuel, ceilingClear, dh = 0) => simulateFlight(speed, fuel, ceilingClear, dh).range

/** Highest climb possible while flying forward. Caps how high a step-up can be. */
export const maxRise = (speed, fuel, ceilingClear) => simulateFlight(speed, fuel, ceilingClear, -1e9).peak

/* ------------------------------------------------------------------------ */
/* Builder                                                                   */
/* ------------------------------------------------------------------------ */

const DOOR_W = 44
const DOOR_H = 32
const WALL_T = 6

function makeBuilder() {
  const W = {
    boxes: [],
    movers: [],
    blinkers: [],
    lasers: [],
    kills: [],
    hazards: [],
    lights: [],
    signs: [],
    labels: [],
    pads: [],
    zones: [],
    stages: [],
    pumpkins: [],
    /** Coins along each stage's path: { id, stage, pos }. Collected once per run. */
    coins: [],
    ghosts: [],
    treadmills: [],
    /** Wall pairs that slam together (see crusherState). */
    crushers: [],
    /** Server-simulated ghosts that hunt players (see server ghost sim). */
    ghostSpawns: [],
    stepPads: [],
    pedestals: [],
    props: [],
    beacons: [],
    interactables: [],
    spawn: null,
    race: null,
  }
  let nextId = 1
  const norm = (a, b) => [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  ]
  return {
    W,
    id: () => nextId++,
    /** Static box. opts: c, tex, tc, ttex, em, solid, kind, vel, bounce, shadow, ts, alpha */
    box(a, b, opts = {}) {
      const [min, max] = norm(a, b)
      const box = { id: nextId++, min, max, ...opts }
      W.boxes.push(box)
      return box
    },
    mover(a, b, motion, opts = {}) {
      const [min, max] = norm(a, b)
      const m = { id: nextId++, min, max, ...motion, ...opts }
      W.movers.push(m)
      return m
    },
    blinker(a, b, timing, opts = {}) {
      const [min, max] = norm(a, b)
      const m = { id: nextId++, min, max, ...timing, ...opts }
      W.blinkers.push(m)
      return m
    },
    laser(a, b, timing, opts = {}) {
      const [min, max] = norm(a, b)
      const l = { id: nextId++, min, max, ...timing, ...opts }
      W.lasers.push(l)
      return l
    },
    kill(a, b, kind) {
      const [min, max] = norm(a, b)
      W.kills.push({ min, max, kind })
    },
  }
}

const unionCross = (a, b) => ({
  x0: Math.min(a.x0, b.x0),
  x1: Math.max(a.x1, b.x1),
  y0: Math.min(a.y0, b.y0),
  y1: Math.max(a.y1, b.y1),
})

/**
 * The wall between two rooms, with a door. `zFace` is its +Z face; `cross`
 * must cover both rooms' cross-sections so neither side can see a gap. The
 * front half wears the previous room's style, the back half the next room's.
 */
function doorWall(B, zFace, cross, front, back, opening = { x: 0, w: DOOR_W, h: DOOR_H }) {
  const z0 = zFace - WALL_T
  const ox0 = opening.x - opening.w / 2
  const ox1 = opening.x + opening.w / 2
  const slab = (za, zb, style) => {
    const o = { c: style.wall, tex: style.wallTex || 'tile', shadow: false }
    B.box([cross.x0, cross.y0, za], [ox0, cross.y1, zb], o)
    B.box([ox1, cross.y0, za], [cross.x1, cross.y1, zb], o)
    B.box([ox0, opening.h, za], [ox1, cross.y1, zb], o)
    // Threshold under the opening (walkable, top at y = 0).
    B.box([ox0, cross.y0, za], [ox1, 0, zb], { c: style.trim || '#1e4f9c', tex: 'tile', tc: style.floor || '#cfcaf7', ttex: 'diamond' })
  }
  slab(zFace - WALL_T / 2, zFace, front)
  slab(z0, zFace - WALL_T / 2, back)
  // Chunky dark-blue frame on both faces.
  for (const [za, zb, style] of [[zFace, zFace + 2.5, front], [z0 - 2.5, z0, back]]) {
    const f = { c: style.trim || '#1e4f9c', tex: 'tile' }
    B.box([ox0 - 4, 0, za], [ox0, opening.h + 4, zb], f)
    B.box([ox1, 0, za], [ox1 + 4, opening.h + 4, zb], f)
    B.box([ox0 - 4, opening.h, za], [ox1 + 4, opening.h + 4, zb], f)
  }
  return z0
}

/** Four walls, floor and ceiling around an interior box. */
function enclose(B, min, max, style, { floor = true, skipNorth = false, skipSouth = false } = {}) {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const w = { c: style.wall, tex: style.wallTex || 'tile', shadow: false }
  B.box([x0 - WALL_T, y0 - 4, z0 - (skipNorth ? 0 : 0)], [x0, y1 + WALL_T, z1], w)
  B.box([x1, y0 - 4, z0], [x1 + WALL_T, y1 + WALL_T, z1], w)
  if (!skipNorth) B.box([x0 - WALL_T, y0 - 4, z0 - WALL_T], [x1 + WALL_T, y1 + WALL_T, z0], w)
  if (!skipSouth) B.box([x0 - WALL_T, y0 - 4, z1], [x1 + WALL_T, y1 + WALL_T, z1 + WALL_T], w)
  B.box([x0 - WALL_T, y1, z0 - WALL_T], [x1 + WALL_T, y1 + WALL_T, z1 + WALL_T], { c: style.ceil, tex: style.ceilTex || 'tile', shadow: false })
  if (floor) B.box([x0, y0 - 4, z0], [x1, y0, z1], { c: style.floor, tex: style.floorTex || 'diamond', shadow: false })
}

/* ------------------------------------------------------------------------ */
/* Lobby                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Sized for one server room (8 players): shops on the side walls, the Stage 1
 * door and leaderboards on the north wall, one row of treadmills to the south.
 */
export const LOBBY = { x0: -84, x1: 84, z0: -76, z1: 96, h: 48 }

function buildLobby(B) {
  const { W } = B
  const L = LOBBY
  const T = LOBBY_THEME

  // Floor, ceiling, east/west/south walls. The north wall (with the Stage 1
  // door) is built by stage 1 so it can also cover the taller hall behind it.
  B.box([L.x0, -4, L.z0], [L.x1, 0, L.z1], { c: T.floor, tex: 'diamond', shadow: false })
  B.box([L.x0 - WALL_T, -4, L.z0], [L.x0, L.h + WALL_T, L.z1], { c: T.wall, tex: 'tile', shadow: false })
  B.box([L.x1, -4, L.z0], [L.x1 + WALL_T, L.h + WALL_T, L.z1], { c: T.wall, tex: 'tile', shadow: false })
  B.box([L.x0 - WALL_T, -4, L.z1], [L.x1 + WALL_T, L.h + WALL_T, L.z1 + WALL_T], { c: T.wall, tex: 'tile', shadow: false })
  B.box([L.x0 - WALL_T, L.h, L.z0], [L.x1 + WALL_T, L.h + WALL_T, L.z1 + WALL_T], { c: T.ceil, tex: 'tile', shadow: false })

  // Darker wainscot band and pillars, like the original's walls.
  const band = { c: '#7068cf', tex: 'tile', shadow: false }
  B.box([L.x0, 0, L.z0], [L.x0 + 1, 8, L.z1], band)
  B.box([L.x1 - 1, 0, L.z0], [L.x1, 8, L.z1], band)
  B.box([L.x0, 0, L.z1 - 1], [L.x1, 8, L.z1], band)
  const pillar = { c: T.pillar, tex: 'tile' }
  for (let z = L.z0 + 22; z < L.z1 - 10; z += 44) {
    B.box([L.x0, 0, z - 4], [L.x0 + 5, L.h, z + 4], pillar)
    B.box([L.x1 - 5, 0, z - 4], [L.x1, L.h, z + 4], pillar)
  }
  // Ceiling light panels.
  for (const x of [-50, 0, 50]) {
    for (const z of [-46, 10, 66]) {
      B.box([x - 9, L.h - 0.6, z - 5], [x + 9, L.h, z + 5], { c: '#fffbe0', em: '#fff6cf', solid: false, shadow: false })
    }
  }

  // Runway to the stage door, with dark trim and arrow decals.
  B.box([-22, 0, L.z0], [22, 0.5, -26], { c: '#dcd9fc', tex: 'diamond', shadow: false })
  B.box([-25, 0, L.z0], [-22, 0.9, -26], { c: T.trim, tex: 'tile' })
  B.box([22, 0, L.z0], [25, 0.9, -26], { c: T.trim, tex: 'tile' })
  for (let z = -36; z > L.z0 + 10; z -= 16) W.props.push({ kind: 'floorArrow', pos: [0, 0.56, z], ry: Math.PI, scale: 8 })

  // Spawn: star decal in the middle of the room.
  W.spawn = { x: 0, y: 0.05, z: 22, ry: Math.PI, radius: 10 }
  W.props.push({ kind: 'spawnStar', pos: [0, 0.04, 22], scale: 30 })

  // STAGE 1 sign inside the door opening, leaderboards either side.
  W.signs.push({ kind: 'stage', text: 'STAGE 1', pos: [0, 24, L.z0 + 0.6], ry: 0, w: 40, h: 11 })
  W.signs.push({ kind: 'rec', level: STAGES[0].recLevel, jetpack: 'jp1', pos: [31, 8, L.z0 + 3], ry: 0, w: 12, h: 9 })
  W.props.push({ kind: 'board', board: 'trophies', pos: [-46, 0, L.z0 + 4], ry: 0, w: 20, h: 28 })
  W.props.push({ kind: 'board', board: 'playtime', pos: [48, 0, L.z0 + 4], ry: 0, w: 20, h: 28 })
  W.props.push({ kind: 'board', board: 'rebirths', pos: [-72, 0, L.z0 + 4], ry: 0, w: 16, h: 24 })

  // Crate machine (left) and the exclusive Moonlit Pulse display (right).
  W.props.push({ kind: 'crateMachine', pos: [-48, 0, L.z0 + 22], ry: 0.35 })
  W.interactables.push({ id: 'crates', kind: 'crates', pos: [-48, 0, L.z0 + 22], r: 14, label: 'Crates' })
  W.props.push({ kind: 'skinDisplay', skin: 'moonlit_pulse', pos: [46, 0, L.z0 + 24], tag: 'EXCLUSIVE SKIN', limited: true })
  W.interactables.push({ id: 'moonlit', kind: 'buySkin', skin: 'moonlit_pulse', pos: [46, 0, L.z0 + 24], r: 12, label: 'Moonlit Pulse' })

  // WEST: STEPS shop — a row of pads along the wall.
  W.signs.push({ kind: 'banner', text: 'STEPS', icon: 'shoe', bg: '#22c3f3', pos: [L.x0 + 0.7, 32, 4], ry: Math.PI / 2, w: 52, h: 13 })
  STEP_BOOSTS.forEach((b, i) => {
    const z = -62 + i * 12
    const min = [L.x0 + 7, 0, z - 5]
    const max = [L.x0 + 17, 0.7, z + 5]
    W.stepPads.push({ id: b.id, min, max })
    W.interactables.push({ id: `boost:${b.id}`, kind: 'boost', boost: b.id, pos: [L.x0 + 12, 0, z], r: 6, label: `+${b.amount} steps` })
    W.labels.push({ kind: 'boost', boost: b.id, pos: [L.x0 + 12, 9, z] })
  })
  W.props.push({ kind: 'skinDisplay', skin: 'boo_pulse', pos: [-72, 0, 86], tag: 'SPECIAL SKIN', sub: 'Event Reward' })
  W.interactables.push({ id: 'boo', kind: 'event', pos: [-72, 0, 86], r: 10, label: 'Spooky Event' })

  // EAST: JETPACKS shop — pedestals with the jetpacks on top.
  W.signs.push({ kind: 'banner', text: 'JETPACKS', icon: 'jetpack', bg: '#f7c51f', pos: [L.x1 - 0.7, 32, 0], ry: -Math.PI / 2, w: 60, h: 13 })
  JETPACKS.forEach((j, i) => {
    const z = -62 + i * 12.4
    const x = L.x1 - 14
    B.box([x - 4.5, 0, z - 4.5], [x + 4.5, 1.6, z + 4.5], { c: '#d9dcf5', tex: 'tile', tc: '#f4f5ff', ttex: 'tile' })
    W.pedestals.push({ id: j.id, pos: [x, 1.6, z] })
    W.interactables.push({ id: `jetpack:${j.id}`, kind: 'jetpack', jetpack: j.id, pos: [x, 0, z], r: 6.5, label: j.name })
    W.labels.push({ kind: 'jetpack', jetpack: j.id, pos: [x, 11, z] })
  })
  // Free chest ("Like the game" chest) in the corner past the jetpacks.
  W.props.push({ kind: 'chest', pos: [72, 0, 84], ry: -Math.PI / 2 })
  W.interactables.push({ id: 'chest', kind: 'chest', pos: [72, 0, 84], r: 10, label: 'Free Chest' })

  // SOUTH: one row of treadmills. They face the wall (+Z): you run away from
  // the camera and see the console screen ahead. Only invisible collision
  // lives in the world data; the client builds the detailed model.
  W.signs.push({ kind: 'banner', text: 'TREADMILLS', icon: 'run', bg: '#f26b1d', pos: [0, 30, L.z1 - 0.7], ry: Math.PI, w: 64, h: 13 })
  const treadmill = (id, x, y, z, type) => {
    const min = [x - 3.6, y, z - 8]
    const max = [x + 3.6, y + 1.2, z + 8]
    B.box(min, max, { kind: 'treadmill', tm: id, hidden: true })
    B.box([x - 4.7, y, z - 9], [x - 3.6, y + 1.35, z + 9], { hidden: true })
    B.box([x + 3.6, y, z - 9], [x + 4.7, y + 1.35, z + 9], { hidden: true })
    B.box([x - 4.7, y, z + 8], [x + 4.7, y + 8.2, z + 10], { hidden: true })
    W.treadmills.push({ id, type, min, max, pos: [x, y, z], dir: [0, 0, 1] })
    if (type !== 'normal') W.labels.push({ kind: 'treadmill', type, pos: [x, y + 12, z + 9] })
  }
  // Rubber gym floor under the row, with orange edging.
  B.box([-64, 0, 64], [64, 0.12, 92], { c: '#262a52', tex: 'smooth', shadow: false })
  for (const [za, zb] of [[64, 65.2], [90.8, 92]]) B.box([-64, 0, za], [64, 0.16, zb], { c: '#ff8a2a', em: '#ff8a2a', shadow: false })
  const row = ['normal', 'normal', 'vip', 'vip_plus', 'normal', 'normal']
  row.forEach((type, i) => treadmill(i, -50 + i * 20, 0, 76, type))

  W.lights.push({ pos: [0, 34, 0], color: '#ffffff', intensity: 1.2, distance: 150 })
  W.lights.push({ pos: [0, 30, 70], color: '#fff2d6', intensity: 1.0, distance: 110 })

  // Pumpkins hidden in the corners.
  W.pumpkins.push({ id: 'p_l1', pos: [78, 0.1, -70] })
  W.pumpkins.push({ id: 'p_l2', pos: [-78, 0.1, 93] })
  W.ghosts.push({ pos: [-30, 36, 10], scale: 2, phase: 0.2 })

  W.zones.push({
    id: 'lobby', kind: 'lobby', min: [L.x0 - WALL_T, -10, L.z0], max: [L.x1 + WALL_T, L.h + WALL_T, L.z1 + WALL_T],
    fog: T.fog, fogDensity: T.fogDensity, hemiSky: T.hemiSky, hemiGround: T.hemiGround, hemi: T.hemi, sun: T.sun, killY: -40,
  })
}

/* ------------------------------------------------------------------------ */
/* Stages                                                                    */
/* ------------------------------------------------------------------------ */

function buildStage(B, k, zBoundary, prevCross, prevStyle) {
  const { W } = B
  const S = STAGES[k - 1]
  const T = THEMES[S.theme]
  const rng = mulberry32(7000 + k * 101)
  const rand = (a, b) => a + (b - a) * rng()
  const pick = (arr) => arr[Math.floor(rng() * arr.length)]

  const speed = speedForLevel(S.recLevel)
  const fuel = S.recFuel
  const H = S.ceiling
  const halfW = S.width / 2
  const isVoid = T.hazard === 'void'
  const bottomY = isVoid ? -260 : -18
  const hazardTop = -10
  const killY = isVoid ? -70 : hazardTop + 0.6
  const jumpOnly = airRange(speed, 0, H, 0)
  const rangeFrom = (top, dh) => airRange(speed, fuel, H - top, dh)
  // Never ask for a step up the recommended jetpack can't climb while flying forward.
  const climbCap = Math.max(4, (maxRise(speed, fuel, H) - 2) * 0.7)
  const hazardColor = HAZARD_COLORS[T.hazard] || '#ff7a1a'

  const hallStart = zBoundary - WALL_T // interior starts behind the entrance wall
  const plats = []
  const platStyle = (extra = {}) => ({ c: T.platSide, tex: T.platSideTex, tc: T.platTop, ttex: T.platTopTex, ...extra })

  const solidBottom = (top) => (T.solidPlatforms ? (isVoid ? bottomY : hazardTop - 8) : top - rand(3.5, 6))

  // Entrance wall, covering both the previous room and this (bigger) hall.
  const hallStyle = { wall: T.wall, wallTex: T.wallTex, trim: '#1e4f9c', floor: T.platTop }
  const hallCross = { x0: -halfW - WALL_T, x1: halfW + WALL_T, y0: bottomY, y1: H + WALL_T }
  doorWall(B, zBoundary, unionCross(prevCross, hallCross), prevStyle, hallStyle)

  const extras = []
  /** Floating slabs get a thin support pillar disappearing into the abyss. */
  function support(p) {
    if (T.solidPlatforms || p.w <= 14) return
    const pw = Math.min(6, p.w * 0.2)
    const zc = (p.z0 + p.z1) / 2
    B.box([p.x - pw / 2, p.top - 260, zc - pw / 2], [p.x + pw / 2, p.top - 4, zc + pw / 2], { c: T.pillar, tex: T.wallTex, shadow: false })
  }
  function addPlat(p, opts = {}) {
    const plat = { ...p }
    plats.push(plat)
    plat.box = B.box([p.x - p.w / 2, solidBottom(p.top), p.z1], [p.x + p.w / 2, p.top, p.z0], platStyle(opts.style))
    support(plat)
    return plat
  }
  const last = () => plats[plats.length - 1]

  // Start platform behind the door.
  addPlat({ x: 0, z0: hallStart, z1: hallStart - clamp(speed * 0.5, 50, 120), w: clamp(speed * 0.4 + 56, 60, 140), top: 0 })

  /* ---- Layout helpers ----------------------------------------------------
   * Every distance is a fraction of one full jetpack flight at the stage's
   * recommended level + jetpack, so "Recommended" really is enough. */

  /** Next platform on the main path, at absolute x. */
  function at(x, frac, { dh = 0, len, w, style, kind, d } = {}) {
    const prev = last()
    const top = clamp(prev.top + Math.min(dh, climbCap), -4, H - 34)
    const dist = d ?? rangeFrom(prev.top, top - prev.top) * frac
    const lateral = Math.max(0, Math.abs(x - prev.x) - (prev.w + w) / 2)
    const gapZ = Math.sqrt(Math.max(dist * dist - lateral * lateral, (dist * 0.35) ** 2))
    const z0 = prev.z1 - gapZ
    const p = addPlat({ x, z0, z1: z0 - len, w, top, gap: gapZ }, { style })
    if (kind) p.box.kind = kind
    return p
  }
  /** Extra platform in the same row as `ref`, off the main path. */
  function beside(ref, x, { dh = 0 } = {}) {
    const p = { x, z0: ref.z0, z1: ref.z1, w: ref.w, top: ref.top + dh }
    p.box = B.box([x - p.w / 2, solidBottom(p.top), p.z1], [x + p.w / 2, p.top, p.z0], platStyle())
    support(p)
    extras.push(p)
    return p
  }
  /** A platform that slides (axis x) or rises and falls (axis y). */
  function moving(x, frac, { len, w, amp, period, phase = 0, axis = [1, 0, 0] }) {
    const prev = last()
    const z0 = prev.z1 - rangeFrom(prev.top, 0) * frac
    const top = prev.top
    B.mover([x - w / 2, top - 3, z0 - len], [x + w / 2, top, z0], { axis, amp, period, phase }, platStyle())
    plats.push({ x, z0, z1: z0 - len, w: axis[0] ? w + amp * 2 : w, top, virtual: true, mover: true })
  }
  /** A platform that fades in and out. */
  function blink(x, frac, { len, w, period, on, phase }) {
    const prev = last()
    const z0 = prev.z1 - rangeFrom(prev.top, 0) * frac
    B.blinker([x - w / 2, prev.top - 3, z0 - len], [x + w / 2, prev.top, z0], { period, on, phase }, platStyle({ c: T.accent, tc: T.platTop }))
    plats.push({ x, z0, z1: z0 - len, w, top: prev.top, virtual: true })
  }
  /** Low rims on a platform's sides so it reads as a box you land in. */
  function rims(p) {
    for (const side of [-1, 1]) {
      const x = p.x + side * (p.w / 2 - 0.8)
      B.box([x - 0.8, p.top, p.z1], [x + 0.8, p.top + 1.2, p.z0], { c: T.accent, tex: 'smooth' })
    }
  }
  /** Hazard strips across a platform. */
  function strips(p, n, kind = T.hazard === 'void' ? 'lava' : T.hazard) {
    const depth = clamp(jumpOnly * 0.42, 5, 70)
    for (let s = 0; s < n; s += 1) {
      const zc = p.z0 - ((s + 1) / (n + 1)) * (p.z0 - p.z1)
      const min = [p.x - p.w / 2, p.top - 0.4, zc - depth / 2]
      const max = [p.x + p.w / 2, p.top + 0.25, zc + depth / 2]
      W.hazards.push({ kind, min, max })
      B.kill(min, [max[0], max[1] + 0.6, max[2]], kind)
    }
  }
  /** Laser gates across a platform, on/off in sequence. */
  function laserGates(p, n, { period = 2.6, on = 0.45, stagger = 0.5 } = {}) {
    for (let g = 0; g < n; g += 1) {
      const zc = p.z0 - ((g + 1) / (n + 1)) * (p.z0 - p.z1)
      const x0 = p.x - p.w / 2
      const x1 = p.x + p.w / 2
      B.box([x0 - 3, p.top, zc - 1.5], [x0, p.top + 18, zc + 1.5], { c: '#2a2f4a', tex: 'metal' })
      B.box([x1, p.top, zc - 1.5], [x1 + 3, p.top + 18, zc + 1.5], { c: '#2a2f4a', tex: 'metal' })
      B.laser([x0, p.top, zc - 0.6], [x1, H, zc + 0.6], { period, on, phase: g * stagger }, { color: T.accent2 || '#ff2b4f' })
    }
  }
  /** Belt pushing sideways across a platform. */
  function conveyor(p, dir, push) {
    p.box.kind = 'conveyor'
    p.box.vel = [dir * speed * push, 0]
    p.box.ttex = 'belt'
    p.box.tc = '#2a2f4a'
    W.props.push({ kind: 'conveyorArrows', pos: [p.x, p.top + 0.05, (p.z0 + p.z1) / 2], dir, w: p.w, len: p.z0 - p.z1 })
  }
  /**
   * Two walls that slide out of the side walls and slam together over the
   * platform. They reach the ceiling, so the only way past is timing.
   */
  function crusher(p, zc, depth, phase, period = 3.4) {
    W.crushers.push({ id: B.id(), stage: k, cx: p.x, z0: zc + depth / 2, z1: zc - depth / 2, y0: p.top - 1, y1: H, xL: -halfW, xR: halfW, open: p.w / 2 + 6, period, phase, color: T.accent })
  }
  /** Lightning: each row strikes its left and right half in turn. */
  function bolts(p, rows, { period = 2.4, on = 0.3 } = {}) {
    const depth = clamp(speed * 0.18, 30, 70)
    for (let r = 0; r < rows; r += 1) {
      const zc = p.z0 - ((r + 1) / (rows + 1)) * (p.z0 - p.z1)
      for (const [side, ph] of [[-1, r * 0.25], [1, r * 0.25 + 0.5]]) {
        const xa = side < 0 ? p.x - p.w / 2 : p.x
        const xb = side < 0 ? p.x : p.x + p.w / 2
        B.laser([xa, p.top, zc - depth / 2], [xb, H, zc + depth / 2], { period, on, phase: ph }, { color: '#cfe4ff', bolt: true })
      }
    }
  }
  /** Launch strip at the far end of a platform. */
  function bounceStrip(p) {
    const padLen = clamp(speed * 0.12, 10, 60)
    B.box([p.x - p.w / 2 + 1, p.top, p.z1], [p.x + p.w / 2 - 1, p.top + 0.6, p.z1 + padLen], { c: '#3dff8a', em: '#1fff6a', kind: 'bounce', bounce: 120, tex: 'smooth' })
    W.props.push({ kind: 'bounceRing', pos: [p.x, p.top + 0.7, p.z1 + padLen / 2] })
  }
  /** Platform after a bounce strip: higher, reached from the top of the bounce arc. */
  function afterBounce(x, { len, w }) {
    const prev = last()
    const dh = Math.min(28, H - 40 - prev.top)
    return at(x, 0, { dh, len, w, d: rangeFrom(prev.top + 30, dh - 30) * 0.6 })
  }
  const ghostRoom = []

  /* ---- The nine stages --------------------------------------------------- */
  const U = clamp(speed * 0.5, 26, 190)
  switch (k) {
    case 1: {
      // Three big blocks rising out of the lava.
      at(0, 0.42, { len: 40, w: 50, dh: 3 })
      at(-12, 0.5, { len: 40, w: 50, dh: 3 })
      at(12, 0.55, { len: 40, w: 50, dh: -2 })
      break
    }
    case 2: {
      // Zig-zag: left box, right box, left box.
      const side = halfW * 0.54
      rims(at(-side, 0.45, { len: 40, w: 40, dh: 2 }))
      rims(at(side, 0.5, { len: 40, w: 40, dh: 3 }))
      rims(at(-side, 0.55, { len: 40, w: 40, dh: -1 }))
      break
    }
    case 3: {
      // A field of boxes - left, middle, right - with the big ghost hunting over it.
      const col = halfW * 0.62
      const box = { len: 40, w: 40 }
      const r1 = at(0, 0.32, box)
      beside(r1, -col)
      beside(r1, col)
      const r2 = at(-col, 0.34, { ...box, dh: 3 })
      beside(r2, col)
      const r3 = at(0, 0.34, box)
      beside(r3, -col)
      beside(r3, col)
      const r4 = at(col, 0.36, { ...box, dh: 2 })
      beside(r4, -col)
      ghostRoom.push({ id: 'ghost3', from: r1, to: r4, speed: speed * 0.5, scale: 6, radius: 8, color: '#ffffff', glow: '#ff2433' })
      break
    }
    case 4: {
      // Crushing walls slam together across long bridges.
      const wide = Math.min(halfW * 0.8, 110)
      const A = at(0, 0.38, { len: U * 2.6, w: wide })
      crusher(A, (A.z0 + A.z1) / 2, 26, 0)
      const Bp = at(0, 0.42, { len: U * 4, w: wide })
      crusher(Bp, Bp.z0 - (Bp.z0 - Bp.z1) / 3, 26, 0.25)
      crusher(Bp, Bp.z0 - (2 * (Bp.z0 - Bp.z1)) / 3, 26, 0.75)
      const C = at(0, 0.46, { len: U * 2.6, w: wide, dh: 3 })
      crusher(C, (C.z0 + C.z1) / 2, 26, 0.5)
      break
    }
    case 5: {
      // Sliding platforms over acid, an acid-striped bridge, then pistons.
      const amp = halfW * 0.5
      moving(0, 0.26, { len: U * 0.9, w: 64, amp, period: 5, phase: 0 })
      moving(0, 0.26, { len: U * 0.9, w: 64, amp, period: 5, phase: 2.1 })
      moving(0, 0.26, { len: U * 0.9, w: 64, amp, period: 5, phase: 4.2 })
      strips(at(0, 0.28, { len: U * 3.4, w: 110 }), 3, 'acid')
      moving(0, 0.3, { len: U, w: 72, amp: 14, period: 4.2, axis: [0, 1, 0] })
      moving(0, 0.3, { len: U, w: 72, amp: 14, period: 4.2, phase: 3.1, axis: [0, 1, 0] })
      break
    }
    case 6: {
      // Crystal bridges that appear one after another like a wave.
      const xs = [-70, 30, -30, 70]
      xs.forEach((x, i) => blink(x, 0.22, { len: U * 0.8, w: 72, period: 4, on: 0.6, phase: -i * 0.15 }))
      at(0, 0.24, { len: U * 1.4, w: 120 })
      ;[50, -50, 50].forEach((x, i) => blink(x, 0.22, { len: U * 0.8, w: 72, period: 3, on: 0.55, phase: -i / 3 }))
      break
    }
    case 7: {
      // Conveyor belts dragging you sideways through laser gates.
      const A = at(0, 0.36, { len: U * 3, w: 140 })
      conveyor(A, -1, 0.3)
      laserGates(A, 2, { period: 2.6, on: 0.45 })
      const Bp = at(0, 0.4, { len: U * 3.4, w: 140 })
      conveyor(Bp, 1, 0.35)
      laserGates(Bp, 3, { period: 2.2, on: 0.45, stagger: 0.33 })
      moving(0, 0.3, { len: U, w: 90, amp: halfW * 0.5, period: 5 })
      break
    }
    case 8: {
      // Lightning strikes the left half, then the right - dodge across.
      const A = at(0, 0.36, { len: U * 3, w: 170 })
      bolts(A, 3)
      moving(0, 0.3, { len: U, w: 90, amp: 16, period: 4, axis: [0, 1, 0] })
      const Bp = at(0, 0.4, { len: U * 3.4, w: 170, dh: 4 })
      bolts(Bp, 4, { period: 2.1 })
      break
    }
    case 9: {
      // The Core: crushers, the golden ghost's box field, lightning, and a launch to the exit.
      const A = at(0, 0.34, { len: U * 1.8, w: 130 })
      crusher(A, (A.z0 + A.z1) / 2, 30, 0)
      const col = halfW * 0.45
      const r1 = at(-col, 0.3, { len: 80, w: 80, dh: 3 })
      beside(r1, col)
      const r2 = at(0, 0.3, { len: 80, w: 80 })
      beside(r2, -col * 1.4)
      beside(r2, col * 1.4)
      ghostRoom.push({ id: 'ghost9', from: r1, to: r2, speed: speed * 0.45, scale: 9, radius: 12, color: '#ffe066', glow: '#ff8a00' })
      const C = at(0, 0.3, { len: U * 2.2, w: 130 })
      bolts(C, 2)
      bounceStrip(C)
      afterBounce(0, { len: U * 1.2, w: 120 })
      break
    }
    default:
      at(0, 0.5, { len: U, w: 60 })
  }

  // Final landing reaches the exit wall at floor height.
  const prev = last()
  const finalGap = rangeFrom(prev.top, -prev.top) * 0.62
  const finalLen = clamp(speed * 0.7, 50, 240)
  const fz0 = prev.z1 - finalGap
  addPlat({ x: 0, z0: fz0, z1: fz0 - finalLen, w: 70, top: 0 })
  const hallEnd = fz0 - finalLen

  // Beacons on big landings so they can be found across the fog.
  for (const p of plats) {
    if (!p.virtual && (p.gap || 0) > 110) {
      W.beacons.push({ pos: [p.x, p.top, (p.z0 + p.z1) / 2], height: H - p.top, color: T.accent })
    }
  }

  // ---- Enclosure: walls, ceiling, hazard ---------------------------------
  const wallStyle = { c: T.wall, tex: T.wallTex, shadow: false }
  const xL = -halfW
  const xR = halfW
  B.box([xL - WALL_T, bottomY, hallEnd], [xL, H + WALL_T, hallStart], wallStyle)
  B.box([xR, bottomY, hallEnd], [xR + WALL_T, H + WALL_T, hallStart], wallStyle)
  B.box([xL - WALL_T, H, hallEnd], [xR + WALL_T, H + WALL_T, hallStart], { c: T.ceil, tex: T.wallTex, shadow: false })

  if (isVoid) {
    B.box([xL, bottomY - 4, hallEnd], [xR, bottomY, hallStart], { c: '#06040c', tex: 'smooth', shadow: false })
  } else {
    B.box([xL, bottomY - 4, hallEnd], [xR, hazardTop - 0.5, hallStart], { c: '#2a1a10', tex: 'smooth', shadow: false, solid: false })
    W.hazards.push({ kind: T.hazard, min: [xL, hazardTop - 0.5, hallEnd], max: [xR, hazardTop, hallStart], big: true })
    B.kill([xL, bottomY - 4, hallEnd], [xR, hazardTop + 0.6, hallStart], T.hazard)
  }

  // Pillars along the walls, torches between them, light pool entries.
  const spacing = clamp(speed * 1.1, 60, 420)
  let n = 0
  for (let z = hallStart - spacing * 0.5; z > hallEnd + 20; z -= spacing) {
    const pw = clamp(speed * 0.08 + 8, 8, 30)
    for (const side of [-1, 1]) {
      const x = side < 0 ? xL : xR - pw * 0.7
      B.box([x, bottomY, z - pw / 2], [x + pw * 0.7, H, z + pw / 2], { c: T.pillar, tex: T.wallTex, shadow: false })
      W.props.push({ kind: 'torch', pos: [side < 0 ? xL + pw * 0.7 + 0.6 : xR - pw * 0.7 - 0.6, H * 0.55, z - spacing / 2], side, color: T.torch })
    }
    W.lights.push({ pos: [0, H * 0.7, z - spacing / 2], color: T.torch, intensity: 1.4, distance: Math.max(120, spacing * 1.4) })
    if (!isVoid) W.lights.push({ pos: [(n % 2 ? -1 : 1) * halfW * 0.5, hazardTop + 6, z], color: hazardColor, intensity: 1.6, distance: Math.max(90, spacing) })
    n += 1
  }
  if (S.theme === 'neon' || S.theme === 'storm') {
    for (const side of [-1, 1]) {
      const x = side < 0 ? xL + 0.4 : xR - 0.4
      B.box([x - 0.3, H * 0.3, hallEnd], [x + 0.3, H * 0.3 + 1.2, hallStart], { c: T.accent, em: T.accent, solid: false, shadow: false })
      B.box([x - 0.3, H * 0.75, hallEnd], [x + 0.3, H * 0.75 + 1.2, hallStart], { c: T.accent2 || T.accent, em: T.accent2 || T.accent, solid: false, shadow: false })
    }
  }

  // The hunting ghost: lives over its box field, never leaves the hall.
  for (const g of ghostRoom) {
    const zMid = (g.from.z0 + g.to.z1) / 2
    W.ghostSpawns.push({
      id: g.id, stage: k, speed: g.speed, scale: g.scale, radius: g.radius, color: g.color, glow: g.glow,
      home: [0, g.from.top + 26, zMid],
      min: [xL + 14, g.from.top + 5, g.to.z1 - 40],
      max: [xR - 14, H - 12, g.from.z0 + 40],
    })
  }

  // Decor props per theme.
  const realPlats = [...plats.filter((p) => !p.virtual), ...extras]
  const decorGhosts = ghostRoom.length ? 0 : T.ghosts
  for (let g = 0; g < decorGhosts; g += 1) {
    const p = realPlats[Math.floor(((g + 1) / (T.ghosts + 1)) * realPlats.length)]
    W.ghosts.push({ pos: [clamp(p.x + rand(-30, 30), xL + 20, xR - 20), Math.min(H - 12, p.top + 22), (p.z0 + p.z1) / 2], scale: clamp(speed * 0.04, 2, 7), phase: rng() * 6 })
  }
  if (S.theme === 'ice') {
    for (let z = hallStart - 40; z > hallEnd; z -= clamp(speed * 0.5, 30, 160)) {
      W.props.push({ kind: 'icicle', pos: [rand(xL + 10, xR - 10), H, z], scale: rand(3, 9) })
    }
  }
  if (S.theme === 'crystal') {
    for (let z = hallStart - 30; z > hallEnd; z -= clamp(speed * 0.45, 30, 180)) {
      const side = rng() < 0.5 ? -1 : 1
      W.props.push({ kind: 'crystal', pos: [side * (halfW - 8), rand(10, H - 20), z], scale: rand(6, 16), color: pick(['#ff7bf2', '#7bd6ff', '#c79bff']) })
    }
  }
  if (S.theme === 'toxic') {
    for (const p of realPlats) if (rng() < 0.5) W.props.push({ kind: 'barrel', pos: [p.x + rand(-0.3, 0.3) * p.w, p.top, p.z1 + 4] })
  }
  if (S.theme === 'storm') {
    for (const p of realPlats) if (rng() < 0.4) W.props.push({ kind: 'tesla', pos: [p.x + (rng() < 0.5 ? -1 : 1) * (p.w / 2 - 2), p.top, (p.z0 + p.z1) / 2] })
  }

  // Pumpkins on a handful of platforms (a couple slightly off the path).
  // Pumpkins: on the path (skipping the start) and on the off-path boxes.
  const pumpkinPlats = [...plats.filter((p, i) => i > 0 && !p.virtual).slice(0, 3), ...extras.slice(0, 2)]
  pumpkinPlats.forEach((p, i) => {
    W.pumpkins.push({ id: `p_${k}_${i}`, pos: [clamp(p.x + rand(-0.35, 0.35) * p.w, xL + 3, xR - 3), p.top + 0.1, p.z1 + 3] })
  })

  // Coins: a row along each platform, a line across each big gap (where a
  // normal jetpack flight passes) and a pair on every off-path box. Never on
  // moving platforms or over hazard strips.
  let coinN = 0
  const onHazard = (x, z) => W.hazards.some((h) => !h.big && x >= h.min[0] - 2 && x <= h.max[0] + 2 && z >= h.min[2] - 3 && z <= h.max[2] + 3)
  const coin = (x, y, z) => {
    if (!onHazard(x, z)) W.coins.push({ id: `c${k}_${coinN++}`, stage: k, pos: [x, y, z] })
  }
  const rowOn = (p, n) => {
    for (let i = 0; i < n; i += 1) coin(p.x, p.top + 2.4, p.z0 - ((i + 1) / (n + 1)) * (p.z0 - p.z1))
  }
  plats.forEach((p, i) => {
    if (i === 0) return
    if (!p.mover) rowOn(p, clamp(Math.round((p.z0 - p.z1) / 40), 2, 3))
    const prev = plats[i - 1]
    const gap = prev.z1 - p.z0
    if (gap < 30) return
    const n = clamp(Math.floor(gap / 45), 1, 3)
    const y = Math.max(prev.top, p.top) + 5
    for (let j = 0; j < n; j += 1) {
      const f = (j + 1) / (n + 1)
      coin(prev.x + (p.x - prev.x) * f, y, prev.z1 - gap * f)
    }
  })
  for (const p of extras) rowOn(p, 2)

  W.zones.push({
    id: `stage${k}`, kind: 'stage', stage: k,
    min: [xL - WALL_T, bottomY - 10, hallEnd], max: [xR + WALL_T, H + WALL_T, zBoundary],
    fog: T.fog, fogDensity: T.fogDensity, hemiSky: T.hemiSky, hemiGround: T.hemiGround, hemi: T.hemi, sun: T.sun,
    killY, far: clamp(speed * 16, 1200, 6000),
  })

  const path = plats.map((p) => ({ x: p.x, z0: p.z0, z1: p.z1, w: p.w, top: p.top, virtual: !!p.virtual }))
  return { hallStart, hallEnd, H, halfW, bottomY, speed, isVoid, style: hallStyle, cross: hallCross, path }
}

/** Room between stages with the two trophy pads and the next door. */
function buildRewardRoom(B, k, zBoundary, hall) {
  const { W } = B
  const S = STAGES[k - 1]
  const T = REWARD_THEME
  const final = k === STAGES.length
  const depth = final ? 130 : 100
  const halfW = final ? 90 : 70
  const H = final ? 70 : 48
  const z0 = zBoundary - WALL_T
  const z1 = z0 - depth
  const style = final
    ? { wall: '#f3e2ae', ceil: '#e4c97a', floor: '#fff6d8', trim: '#c9971a', wallTex: 'tile' }
    : { wall: T.wall, ceil: T.ceil, floor: T.floor, trim: T.trim, wallTex: 'tile' }
  const cross = { x0: -halfW - WALL_T, x1: halfW + WALL_T, y0: -4, y1: H + WALL_T }

  B.box([-halfW, -4, z1], [halfW, 0, z0], { c: style.floor, tex: 'diamond', shadow: false })
  B.box([-halfW - WALL_T, -4, z1], [-halfW, H + WALL_T, z0], { c: style.wall, tex: 'tile', shadow: false })
  B.box([halfW, -4, z1], [halfW + WALL_T, H + WALL_T, z0], { c: style.wall, tex: 'tile', shadow: false })
  B.box([-halfW - WALL_T, H, z1], [halfW + WALL_T, H + WALL_T, z0], { c: style.ceil, tex: 'tile', shadow: false })

  // Entrance wall, shared with the (bigger) hall behind it.
  doorWall(B, zBoundary, unionCross(hall.cross, cross), hall.style, style)

  // Trophy pads: pink (VIP, x2) left, yellow right.
  const padZ = z0 - depth * 0.5
  const amount = S.trophies
  for (const [vip, x] of [[true, -32], [false, 32]]) {
    const min = [x - 8, 0, padZ - 8]
    const max = [x + 8, 0.7, padZ + 8]
    W.pads.push({ stage: k, vip, min, max, amount: vip ? amount * 2 : amount })
    W.labels.push({ kind: 'pad', vip, amount: vip ? amount * 2 : amount, pos: [x, 9, padZ + 2] })
    B.box([x - 4, 0, padZ - 22], [x + 4, 16, padZ - 18], { c: style.trim, tex: 'tile' })
    W.props.push({ kind: 'lamp', pos: [x, 16, padZ - 20] })
    W.lights.push({ pos: [x, 12, padZ], color: vip ? '#ff4fd8' : '#ffd23f', intensity: 1.4, distance: 60 })
  }
  // A stage-clear pumpkin on a ledge.
  W.pumpkins.push({ id: `p_r${k}`, pos: [halfW - 6, 0.1, z1 + 8] })

  W.zones.push({
    id: `reward${k}`, kind: 'reward', stage: k, min: [-halfW - WALL_T, -10, z1 - WALL_T], max: [halfW + WALL_T, H + WALL_T, z0],
    fog: final ? '#5a4416' : T.fog, fogDensity: T.fogDensity, hemiSky: T.hemiSky, hemiGround: final ? '#ffcf3d' : T.hemiGround, hemi: T.hemi, sun: T.sun, killY: -40,
  })

  if (final) {
    // The exit: back wall with a glowing portal home.
    B.box([-halfW - WALL_T, -4, z1 - WALL_T], [halfW + WALL_T, H + WALL_T, z1], { c: style.wall, tex: 'tile', shadow: false })
    W.signs.push({ kind: 'stage', text: 'YOU ESCAPED!', pos: [0, 46, z1 + 0.6], ry: 0, w: 90, h: 16, gold: true })
    W.props.push({ kind: 'portal', pos: [0, 0, z1 + 3] })
    W.interactables.push({ id: 'exit', kind: 'portal', pos: [0, 0, z1 + 6], r: 12, label: 'Return to Lobby', touch: true })
    W.lights.push({ pos: [0, 30, z1 + 20], color: '#fff0b0', intensity: 2, distance: 160 })
    return { z1: z1 - WALL_T, padZ, cross, style }
  }

  const nextS = STAGES[k]
  W.signs.push({ kind: 'stage', text: `STAGE ${k + 1}`, pos: [0, 24, z1 + 0.6], ry: 0, w: 40, h: 11 })
  W.signs.push({ kind: 'rec', level: nextS.recLevel, jetpack: recommendedJetpack(nextS).id, pos: [34, 9, z1 + 3], ry: 0, w: 14, h: 10 })
  return { z1, padZ, cross, style }
}

/** Cheapest trophy jetpack with enough fuel for a stage. */
export const recommendedJetpack = (stage) => JETPACKS.find((j) => j.fuel >= stage.recFuel && !j.sku) || JETPACKS[0]

/* ------------------------------------------------------------------------ */
/* Race track                                                                */
/* ------------------------------------------------------------------------ */

export const RACE_TRACK = { x: -20000, halfW: 44, length: 3200, h: 60 }

function buildRace(B) {
  const { W } = B
  const R = RACE_TRACK
  const x0 = R.x - R.halfW
  const x1 = R.x + R.halfW
  const zStart = 90
  const zEnd = -R.length - 160
  const style = { wall: '#3a3f7a', ceil: '#262a5a', floor: '#d8d4ff', trim: '#1e4f9c' }
  enclose(B, [x0, 0, zEnd], [x1, R.h, zStart], style, { floor: false })
  // lane stripes
  for (let i = -2; i <= 2; i += 1) {
    B.box([R.x + i * 16 - 0.4, 0, -R.length], [R.x + i * 16 + 0.4, 0.06, 40], { c: '#ffffff', solid: false, shadow: false })
  }
  // Obstacles every 180 studs; pits leave real holes in the floor.
  const rng = mulberry32(4242)
  const pits = []
  let obstacle = 0
  for (let z = -160; z > -R.length + 120; z -= 180) {
    const kind = obstacle % 4
    if (kind === 0) {
      B.box([x0, 0, z - 2], [x1, 3.2, z + 2], { c: '#ffcf2e', tex: 'hazard' })
    } else if (kind === 1) {
      const min = [x0, -0.4, z - 14]
      const max = [x1, 0.3, z + 14]
      W.hazards.push({ kind: 'lava', min, max })
      B.kill(min, [max[0], 0.9, max[2]], 'lava')
    } else if (kind === 2) {
      for (let i = 0; i < 5; i += 1) {
        const px = R.x + (rng() * 2 - 1) * (R.halfW - 8)
        B.box([px - 4, 0, z - 4], [px + 4, 22, z + 4], { c: '#7a72d8', tex: 'tile' })
      }
    } else {
      pits.push([z - 30, z + 30])
      W.hazards.push({ kind: 'lava', min: [x0, -6.5, z - 30], max: [x1, -6, z + 30] })
      B.kill([x0, -40, z - 30], [x1, -5.5, z + 30], 'lava')
    }
    obstacle += 1
  }
  let zTop = zStart
  for (const [a, b] of pits) {
    B.box([x0, -12, b], [x1, 0, zTop], { c: style.floor, tex: 'diamond', shadow: false })
    zTop = a
  }
  B.box([x0, -12, zEnd], [x1, 0, zTop], { c: style.floor, tex: 'diamond', shadow: false })

  // Start gate + finish.
  W.race = {
    zone: 'race',
    grid: [],
    gate: B.box([x0, 0, 60], [x1, 20, 62], { c: '#ff3b5c', em: '#ff3b5c', alpha: 0.55, raceGate: true }).id,
    finish: { min: [x0, 0, -R.length - 20], max: [x1, 30, -R.length] },
    podium: { x: R.x, y: 0.05, z: -R.length - 90 },
  }
  for (let i = 0; i < 16; i += 1) {
    W.race.grid.push({ x: R.x + ((i % 4) - 1.5) * 18, y: 0.05, z: 70 + Math.floor(i / 4) * 5, ry: Math.PI })
  }
  W.props.push({ kind: 'finishArch', pos: [R.x, 0, -R.length - 10], w: R.halfW * 2 })
  B.box([x0, 0, -R.length - 20], [x1, 0.08, -R.length], { c: '#ffffff', tex: 'checker', solid: false, shadow: false })
  W.signs.push({ kind: 'stage', text: 'RACE', pos: [R.x, 40, 89.4], ry: Math.PI, w: 40, h: 11 })
  W.lights.push({ pos: [R.x, 40, 0], color: '#ffffff', intensity: 1.2, distance: 400 })
  W.zones.push({
    id: 'race', kind: 'race', min: [x0 - WALL_T, -50, zEnd - WALL_T], max: [x1 + WALL_T, R.h + WALL_T, zStart + WALL_T],
    fog: '#2b2f66', fogDensity: 0.0012, hemiSky: '#ffffff', hemiGround: '#7c74d6', hemi: 1.1, sun: 0.8, killY: -30, far: 3500,
  })
}

/* ------------------------------------------------------------------------ */
/* Assemble                                                                  */
/* ------------------------------------------------------------------------ */

let cached = null

export function buildWorld() {
  if (cached) return cached
  const B = makeBuilder()
  const { W } = B
  buildLobby(B)

  let boundary = LOBBY.z0
  let prevCross = { x0: LOBBY.x0 - WALL_T, x1: LOBBY.x1 + WALL_T, y0: -4, y1: LOBBY.h + WALL_T }
  let prevStyle = { wall: LOBBY_THEME.wall, wallTex: 'tile', trim: LOBBY_THEME.trim, floor: LOBBY_THEME.floor }
  for (let k = 1; k <= STAGES.length; k += 1) {
    const hall = buildStage(B, k, boundary, prevCross, prevStyle)
    const start = { x: 0, y: 0.05, z: hall.hallStart - 14, ry: Math.PI }
    const room = buildRewardRoom(B, k, hall.hallEnd, hall)
    W.stages.push({
      index: k,
      name: STAGES[k - 1].name,
      zStart: boundary,
      zEnd: hall.hallEnd,
      rewardZ: room.z1,
      padZ: room.padZ,
      start,
      ceiling: hall.H,
      path: hall.path,
    })
    boundary = room.z1
    prevCross = room.cross
    prevStyle = room.style
  }
  buildRace(B)

  cached = W
  return W
}

/* ------------------------------------------------------------------------ */
/* Queries shared by client and server                                       */
/* ------------------------------------------------------------------------ */

const inside = (min, max, x, y, z, pad = 0) =>
  x >= min[0] - pad && x <= max[0] + pad && y >= min[1] - pad && y <= max[1] + pad && z >= min[2] - pad && z <= max[2] + pad

export function zoneAt(world, x, y, z) {
  for (const zone of world.zones) if (inside(zone.min, zone.max, x, y, z)) return zone
  return null
}

/**
 * Position along the course for the top progress bar:
 * 0 = lobby, k-1..k = inside stage k, k = its reward room, 9 = escaped.
 */
export function progressAt(world, x, y, z) {
  const zone = zoneAt(world, x, y, z)
  if (!zone || zone.kind === 'lobby' || zone.kind === 'race') return 0
  const stage = world.stages[zone.stage - 1]
  if (zone.kind === 'reward') return zone.stage
  const t = clamp((stage.zStart - z) / (stage.zStart - stage.zEnd), 0, 1)
  return zone.stage - 1 + t
}

export const pointInBox = inside
