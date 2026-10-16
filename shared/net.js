/** Wire constants shared by client and server. */

export const ROOM_NAME = 'world'

/**
 * partyKey for everyone not in a Boxity party. Rooms filter on partyKey, and
 * Colyseus ignores a filter field the client leaves out - so solo players must
 * always send this, or they could be matched into a party's room.
 */
export const PUBLIC_PARTY = 'public'

/** Animation states sent in `move` and synced in Player.anim. */
export const ANIM = Object.freeze({
  idle: 0,
  run: 1,
  jump: 2,
  fall: 3,
  fly: 4,
  treadmill: 5,
  dead: 6,
})
export const ANIM_NAMES = Object.keys(ANIM)
