/**
 * Bloxity identity.
 *
 * Logged-in players send their Bloxity token in the join options; we verify it
 * against the Bloxity API (the same endpoints the SDK itself uses) instead of
 * trusting whatever user object the client claims. Guests get a device-bound
 * id from the client's localStorage.
 */

const API_URL = (process.env.BLOXITY_API_URL || 'https://api.bloxity.io').replace(/\/$/, '')
const GAME_SLUG = process.env.BLOXITY_GAME_SLUG || process.env.BLOXITY_GAME_ID || ''
const CACHE_MS = 10 * 60 * 1000

const cache = new Map()

/** Boxity account ids may arrive bare or as "legion_<id>"; we key on the bare id. */
export const bareUserId = (id) => String(id || '').replace(/^legion_/, '')

async function fetchVerified(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  if (!body || typeof body !== 'object' || body.valid === false) return null
  const user = 'user' in body && body.user ? body.user : body
  if (!user || !(user._id || user.id)) return null
  // Guest accounts this browser played as before signing in (newest first).
  const carriedFrom = Array.isArray(body.carriedFrom) ? body.carriedFrom.map(bareUserId).filter(Boolean).slice(0, 5) : []
  return { user, carriedFrom }
}

/**
 * Verifies a Boxity login token with Boxity itself.
 * @returns {Promise<{ user: object, carriedFrom: string[] } | null>}
 */
export async function verifyBloxityToken(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 8192) return null
  const hit = cache.get(token)
  if (hit && hit.expires > Date.now()) return hit.result

  const headers = { Authorization: `Bearer ${token}` }
  let result = null
  try {
    if (GAME_SLUG) {
      result = await fetchVerified(`${API_URL}/v1/auth/game-token/verify`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: GAME_SLUG }),
      })
    }
    if (!result) result = await fetchVerified(`${API_URL}/v1/auth/me`, { headers })
  } catch (err) {
    console.warn('[auth] Boxity verification failed:', err.message)
    return null
  }
  if (result) {
    cache.set(token, { result, expires: Date.now() + CACHE_MS })
    if (cache.size > 5000) cache.delete(cache.keys().next().value)
  }
  return result
}

const NAME_RE = /[^A-Za-z0-9_ .-]/g

export function cleanName(value, fallback = 'Player') {
  const name = String(value || '').replace(NAME_RE, '').trim().slice(0, 20)
  return name.length >= 2 ? name : fallback
}

export const isGuestId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value)

/** Only Bloxity CDN images may be shown as profile pictures. */
export function cleanPfp(value) {
  if (typeof value !== 'string' || value.length > 600) return ''
  return /^https:\/\/static\.bloxity\.io\/[A-Za-z0-9_\-./%]+$/.test(value) ? value : ''
}

const AVATAR_ID_KEYS = [
  'skinId', 'hatId', 'backId', 'headId', 'armLId', 'armRId', 'legLId', 'legRId', 'torsoId',
  'hairId', 'maskId', 'neckId', 'chestId', 'waistId', 'handId', 'shoesId', 'faceId', 'pantsId', 'shirtId',
]
const PROPORTION_KEYS = ['height', 'shoulderWidth', 'armLength', 'legOffsetX', 'torsoScaleX', 'neckHeight', 'headScale']
// Boxity's own ranges for avatar proportions.
const PROPORTION_MIN = { height: 0.5, shoulderWidth: 0.5, armLength: 0.05, legOffsetX: -0.7, torsoScaleX: 0.3, neckHeight: 0.94, headScale: 0.3 }
const PROPORTION_MAX = { height: 1.6, shoulderWidth: 1.5, armLength: 3, legOffsetX: 5, torsoScaleX: 2, neckHeight: 1.2, headScale: 2.6 }

/** Keep only well-formed avatar ids and clamped proportions; returns a JSON string. */
export function cleanAvatar(raw) {
  const equipped = {}
  const proportions = {}
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const key of AVATAR_ID_KEYS) {
    const v = src.equipped?.[key]
    if ((typeof v === 'string' || typeof v === 'number') && /^-?[A-Za-z0-9_]{1,40}$/.test(String(v))) equipped[key] = String(v)
  }
  for (const key of PROPORTION_KEYS) {
    const v = Number(src.proportions?.[key])
    if (Number.isFinite(v)) proportions[key] = Math.min(PROPORTION_MAX[key], Math.max(PROPORTION_MIN[key], v))
  }
  return JSON.stringify({ equipped, proportions })
}
