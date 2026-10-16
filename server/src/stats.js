import { online } from './sessions.js'

/**
 * Reports game stats to the player's Boxity profile ("Only in this game").
 *
 * Every value comes from server-owned profile state, never from a client
 * message. Only active on Boxity hosting, which provides BLOXITY_REPORT_TOKEN
 * and BLOXITY_GAME_ID; without them this does nothing (local development).
 */

const API_URL = (process.env.BLOXITY_API_URL || 'https://api.bloxity.io').replace(/\/$/, '')
const INTERVAL_MS = 60_000
const BATCH = 200

// Boxity rejects (does not clamp) anything above these.
const CEILING = { number: 1_000_000_000, seconds: 31_536_000_000, currency: 1_000_000_000_000, percent: 100 }

const DEFINITIONS = [
  { key: 'wins_earned', label: 'Wins Earned', type: 'number', sortOrder: 1 },
  { key: 'rebirths', label: 'Rebirths', type: 'number', sortOrder: 2 },
  { key: 'stages_escaped', label: 'Stages Escaped', type: 'number', sortOrder: 3 },
  { key: 'races_won', label: 'Races Won', type: 'number', sortOrder: 4 },
  { key: 'pumpkins', label: 'Pumpkins Found', type: 'number', sortOrder: 5 },
]
const TYPE_OF = Object.fromEntries(DEFINITIONS.map((d) => [d.key, d.type]))

function valuesFor(p) {
  const raw = {
    wins_earned: p.trophiesEarned,
    rebirths: p.rebirths,
    stages_escaped: p.bestStage,
    races_won: p.racesWon,
    pumpkins: p.pumpkins,
  }
  const values = {}
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue
    if (v > CEILING[TYPE_OF[key]]) continue
    values[key] = Math.floor(v)
  }
  return values
}

async function post(url, token, players) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ definitions: DEFINITIONS, players }),
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.text()
    console.log(`[stats] ${res.status} ${body.slice(0, 400)}`)
  } catch (err) {
    console.warn('[stats] report failed:', err.message)
  }
}

// Players who left since the last flush, so their final values still go out.
const departed = new Map()
export const rememberForStats = (profile) => departed.set(profile.id, profile)

/** Starts the reporter. Returns a flush() for shutdown, or null when disabled. */
export function installStatReporter() {
  const token = process.env.BLOXITY_REPORT_TOKEN
  const gameId = process.env.BLOXITY_GAME_ID
  if (!token || !gameId) return null
  const url = `${API_URL}/v1/games/${encodeURIComponent(gameId)}/stats`

  const flush = async () => {
    const profiles = new Map(departed)
    departed.clear()
    for (const { profile } of online.values()) profiles.set(profile.id, profile)
    const players = []
    for (const profile of profiles.values()) {
      // Guests have no Boxity account to attach stats to.
      if (!profile.id.startsWith('u_')) continue
      const values = valuesFor(profile)
      if (Object.keys(values).length) players.push({ userId: `legion_${profile.id.slice(2).split('#')[0]}`, values })
    }
    for (let i = 0; i < players.length; i += BATCH) await post(url, token, players.slice(i, i + BATCH))
  }

  const timer = setInterval(() => {
    flush().catch(() => {})
  }, INTERVAL_MS)
  timer.unref?.()
  console.log('[stats] reporting player stats to Boxity every 60 s')
  return flush
}
