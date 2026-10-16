import { schema, t } from '@colyseus/schema'

/**
 * Public, synced state. Everything here is visible to every client in the
 * room, so it only carries what other players need to render you; private
 * currencies/inventory go to the owner through the `profile` message.
 */
export const Player = schema(
  {
    name: t.string(),
    /** Boxity account id ('' for device guests): matches Boxity chat messages to players. */
    uid: t.string(),
    pfp: t.string(),
    /** JSON: { equipped, proportions } from the player's Bloxity avatar. */
    avatar: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    ry: t.float32(),
    /** Animation state, see ANIM in shared/net.js. */
    anim: t.uint8(),
    /** Horizontal speed, drives the run cycle of remote avatars. */
    spd: t.float32(),
    level: t.uint16(),
    rebirths: t.uint16(),
    trophies: t.float64(),
    jetpack: t.string(),
    skin: t.string(),
    trail: t.string(),
    /** 0 = lobby ... 9 = escaped. Feeds the stage progress bar. */
    progress: t.float32(),
    /** 0 none, 1 VIP, 2 VIP+ */
    vip: t.uint8(),
    racing: t.boolean(),
  },
  'Player',
)

export const RaceState = schema(
  {
    /** idle | invite | countdown | running | results */
    phase: t.string(),
    endsAt: t.float64(),
    startAt: t.float64(),
    racers: t.uint8(),
  },
  'RaceState',
)

/** A hunting ghost, simulated on the server so every player sees the same one. */
export const Ghost = schema(
  {
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    ry: t.float32(),
    /** 0 drifting home, 1 chasing */
    mode: t.uint8(),
  },
  'Ghost',
)

export const WorldState = schema(
  {
    players: t.map(Player),
    race: RaceState,
    ghosts: t.map(Ghost),
  },
  'WorldState',
)
