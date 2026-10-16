import { SKIN_BY_ID, skinsInCrate } from '../../../shared/config.js'

export const REEL_LENGTH = 42
export const REEL_WIN_SLOT = 36

/**
 * The strip of skins the crate reel scrolls past: weighted random filler with
 * the real result fixed at REEL_WIN_SLOT. Built once when the result arrives.
 */
export function buildReel(crateId, skinId) {
  const pool = skinsInCrate(crateId)
  const list = []
  for (let i = 0; i < REEL_LENGTH; i += 1) {
    let roll = Math.random() * 100
    let pick = pool[pool.length - 1]
    for (const sk of pool) {
      roll -= sk.chance
      if (roll <= 0) {
        pick = sk
        break
      }
    }
    list.push(pick.id)
  }
  list[REEL_WIN_SLOT] = SKIN_BY_ID[skinId] ? skinId : list[REEL_WIN_SLOT]
  return { items: list, jitter: (Math.random() - 0.5) * 70 }
}
