import { store } from './store.js'

/**
 * Who is online in THIS process (pod), keyed by profile id. With several pods
 * a player is only ever in one of them; anything that must reach a player
 * elsewhere goes through the database instead.
 * @type {Map<string, { room: import('./WorldRoom.js').WorldRoom, client: any, profile: object }>}
 */
export const online = new Map()

/** Sends a message to every connected client in every room of this process. */
export function broadcastAll(type, message) {
  for (const { client } of online.values()) client.send(type, message)
}

/* ------------------------------------------------------------------------ */
/* Leaderboards: global top 10s, refreshed from the database in the background */
/* ------------------------------------------------------------------------ */

const BOARD_TTL_MS = 20000
let boards = { trophies: [], playtime: [], rebirths: [] }
let boardsAt = 0
let refreshing = null

async function refreshBoards() {
  const [trophies, playtime, rebirths] = await Promise.all([store.top('trophiesEarned'), store.top('playtime'), store.top('rebirths')])
  const row = (p) => ({ name: p.name || 'Player', pfp: p.pfp || '' })
  boards = {
    trophies: trophies.map((p) => ({ ...row(p), value: p.trophiesEarned })),
    playtime: playtime.map((p) => ({ ...row(p), value: Math.floor(p.playtime) })),
    rebirths: rebirths.map((p) => ({ ...row(p), value: p.rebirths, level: p.level })),
  }
  boardsAt = Date.now()
}

/** Latest boards (never blocks; kicks off a refresh when stale). */
export function getBoards() {
  if (!refreshing && Date.now() - boardsAt > BOARD_TTL_MS) {
    refreshing = refreshBoards()
      .catch((err) => console.warn('[boards] refresh failed:', err.message))
      .finally(() => {
        refreshing = null
      })
  }
  return boards
}

/** Waits for fresh boards (used once when a player joins). */
export async function getBoardsNow() {
  getBoards()
  if (refreshing) await refreshing
  return boards
}
