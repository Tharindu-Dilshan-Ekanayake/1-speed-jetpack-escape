import { buildWorld } from '../../../shared/world.js'

/**
 * Mutable per-frame game state shared by the systems in the render loop.
 * Never read from React render functions — use the zustand store for that.
 */
export const runtime = {
  world: buildWorld(),
  /** CollisionWorld, created by the World component. */
  collision: null,
  /** Colyseus room once connected. */
  room: null,
  sessionId: null,
  /** server clock = Date.now() + timeOffset */
  timeOffset: 0,
  serverNow: () => Date.now() + runtime.timeOffset,
  /** Seconds on the shared clock that drives movers/lasers on every client. */
  worldTime: () => (Date.now() + runtime.timeOffset) / 1000,

  /** Local player character state, see physics.createCharacter(). */
  local: null,
  /** Local avatar root object (for the camera and effects). */
  localObject: null,
  /** sessionId -> remote interpolation record */
  remotes: new Map(),
  /** Zone the camera is in (drives fog/lighting). */
  zone: null,
  camera: null,
  /** Systems run in order by the GameLoop: { name, order, update(dt, t) } */
  systems: [],
}

export function addSystem(system) {
  runtime.systems.push(system)
  runtime.systems.sort((a, b) => a.order - b.order)
  return () => {
    const i = runtime.systems.indexOf(system)
    if (i >= 0) runtime.systems.splice(i, 1)
  }
}
