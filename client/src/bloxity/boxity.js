import { getSDK, safeCall, toUnsubscribe } from './sdk'

/**
 * Every Boxity SDK call the game makes, in one place.
 *
 * The SDK behaves the same embedded (iframe on bloxity.io) and standalone (our
 * own domain); the few differences are handled here:
 *  - chat comes from the portal, so it only exists embedded;
 *  - portal settings only exist embedded (standalone keeps our own settings);
 *  - party launches only resolve on the game's Boxity page.
 */

export const API_URL = import.meta.env.VITE_BLOXITY_API_URL || 'https://api.bloxity.io'
export const PORTAL_URL = import.meta.env.VITE_BLOXITY_PORTAL_URL || 'https://bloxity.io'

/** Set when the game server is deployed through Boxity hosting (<id>.host.bloxity.io). */
export const HOSTING_ID = import.meta.env.VITE_BOXITY_HOSTING_ID || ''
const HOSTING_VERSION = import.meta.env.VITE_BOXITY_HOSTING_VERSION || ''
const PLAY_WS = 'wss://play.bloxity.io/v1/ws/'
/** Most players one room holds; must match the server's MAX_CLIENTS. */
export const ROOM_SIZE = Number(import.meta.env.VITE_ROOM_SIZE) || 8

const sdk = () => getSDK()
const call = (fn, ...args) => {
  const s = sdk()
  return s ? safeCall(fn(s), ...args) : undefined
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const isEmbedded = () => !!call((s) => s.portal?.isEmbeddedInLegion?.bind(s.portal))
export const isLoggedIn = () => !!call((s) => s.auth?.isLoggedIn?.bind(s.auth))
export const getToken = () => call((s) => s.auth?.getToken?.bind(s.auth)) || undefined
/** Boxity account ids may arrive as "legion_<id>"; the game keys on the bare id. */
export const bareUserId = (id) => String(id || '').replace(/^legion_/, '')

/* ------------------------------------------------------------------------ */
/* Multiplayer endpoint                                                      */
/* ------------------------------------------------------------------------ */

/** Our own server: VITE_SERVER_URL, else :2567 in dev, else same origin. */
export function directServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`
  return location.origin
}

/**
 * Where to open the next Colyseus Client. Hosted on Boxity: always through
 * the Boxity matchmaker (never <id>.host.bloxity.io), resolved fresh for every
 * connect because each endpoint is pinned to one pod. Retries with backoff -
 * a cold start can take ~45 s.
 * @returns {Promise<{ endpoint: string, relayRoomId: string|null }>}
 */
export async function resolveEndpoint({ onWait, giveUpMs = 60000 } = {}) {
  if (!HOSTING_ID) return { endpoint: directServerUrl(), relayRoomId: null }
  const started = Date.now()
  let delay = 1000
  for (;;) {
    try {
      const net = sdk()?.net
      if (!net?.resolveEndpoint) throw new Error('Boxity SDK not loaded')
      const r = await net.resolveEndpoint(HOSTING_ID, HOSTING_VERSION ? { version: HOSTING_VERSION } : {})
      return { endpoint: r.endpoint, relayRoomId: r.roomId || null }
    } catch (err) {
      if (Date.now() - started + delay > giveUpMs) throw err
      onWait?.('Starting the server...')
      await sleep(delay)
      delay = Math.min(delay * 2, 8000)
    }
  }
}

/**
 * The id other players use to reach a room (invites, Open Rooms, ?roomId=).
 * Hosted rooms also need the relay route: "<relayRoomId>~<colyseusRoomId>".
 */
export const publicRoomId = (colyseusRoomId, relayRoomId) => (HOSTING_ID && relayRoomId ? `${relayRoomId}~${colyseusRoomId}` : colyseusRoomId)

/** Turns a public room id back into { endpoint, roomId } for joinById. */
export async function locateRoom(publicId) {
  const [relay, roomId] = publicId.includes('~') ? publicId.split('~') : [null, publicId]
  if (relay) return { endpoint: PLAY_WS + relay, roomId }
  const { endpoint } = await resolveEndpoint({ giveUpMs: 15000 })
  return { endpoint, roomId }
}

let launchRoomUsed = false
/** ?roomId= from the page URL (Open Rooms "Join", friend invites). Used once. */
export function takeLaunchRoomId() {
  if (launchRoomUsed) return null
  launchRoomUsed = true
  const id = new URLSearchParams(location.search).get('roomId')
  return id && /^[A-Za-z0-9_~-]{3,120}$/.test(id) ? id : null
}

/* ------------------------------------------------------------------------ */
/* Rooms, presence, lifecycle                                                */
/* ------------------------------------------------------------------------ */

let reportedRoom = null
export function reportRoom(id) {
  if (id === reportedRoom) return
  reportedRoom = id
  call((s) => s.game?.updateRoom?.bind(s.game), id || '')
}
export const gameplayStart = () => call((s) => s.game?.gameplayStart?.bind(s.game))
export const gameplayEnd = () => call((s) => s.game?.gameplayEnd?.bind(s.game))

/** Friend-join toasts: everyone already here once, then each newcomer. */
let knownPlayers = null
export function resetPresence() {
  knownPlayers = null
}
export function trackPresence(names) {
  if (!knownPlayers) {
    knownPlayers = new Set(names)
    for (const n of names) call((s) => s.game?.playerInRoom?.bind(s.game), n)
    return
  }
  for (const n of names) {
    if (knownPlayers.has(n)) continue
    knownPlayers.add(n)
    call((s) => s.game?.playerJoined?.bind(s.game), n)
  }
}

/* ------------------------------------------------------------------------ */
/* Party play (own servers; Boxity hosting seats parties by itself)          */
/* ------------------------------------------------------------------------ */

export function enableParty() {
  if (HOSTING_ID) return
  call((s) => s.party?.enable?.bind(s.party), { maxPartySize: ROOM_SIZE })
}

/** The party this launch belongs to, or null. Only asks on the Boxity page (else it waits 5 s for nothing). */
export async function getPartyLaunch() {
  if (HOSTING_ID || !isEmbedded()) return null
  try {
    return (await sdk()?.party?.getLaunch?.()) || null
  } catch {
    return null
  }
}
export const partyJoined = (roomId) => call((s) => s.party?.joined?.bind(s.party), roomId)
export const partyFailed = (reason) => call((s) => s.party?.failed?.bind(s.party), reason)

/* ------------------------------------------------------------------------ */
/* Portal settings (embedded only)                                           */
/* ------------------------------------------------------------------------ */

const QUALITY = { Low: 'low', Medium: 'medium', High: 'high', Ultra: 'high' }
const SETTING_KEYS = {
  master_volume: (v) => ({ masterVolume: clamp01(Number(v) / 100) }),
  music_volume: (v) => ({ musicVolume: clamp01(Number(v) / 100) }),
  graphics_quality: (v) => (QUALITY[v] ? { quality: QUALITY[v] } : null),
  show_fps: (v) => ({ showFps: v === 'true' }),
  camera_sensitivity: (v) => (Number.isFinite(Number(v)) ? { camSensitivity: Math.min(5, Math.max(0.1, Number(v))) } : null),
  enable_chat: (v) => ({ showChat: v !== 'false' }),
}
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8)

/**
 * Registers the settings this game supports (they appear in the portal menu)
 * and applies every push. Standalone there is no portal, so our own settings
 * panel stays in charge.
 * @param {(patch: object) => void} apply
 */
export function listenToPortalSettings(apply) {
  const settings = sdk()?.settings
  if (!settings?.listen || !isEmbedded()) return () => {}
  const offs = Object.entries(SETTING_KEYS).map(([key, map]) =>
    toUnsubscribe(
      settings.listen(key, (value) => {
        const patch = map(String(value ?? ''))
        if (patch) apply(patch)
      }),
    ),
  )
  return () => offs.forEach((off) => off())
}

/* ------------------------------------------------------------------------ */
/* Chat, player events, emotes                                               */
/* ------------------------------------------------------------------------ */

/** Boxity chat (drawn by the portal). cb({ userId, text, seconds, isLocalPlayer }). */
export function onChatMessage(cb) {
  const chat = sdk()?.chat
  if (!chat?.onMessage) return () => {}
  return toUnsubscribe(
    chat.onMessage((m) => {
      try {
        cb({ userId: bareUserId(m.userId), text: chat.bubbleText(m), seconds: chat.bubbleSeconds || 4, isLocalPlayer: !!m.isLocalPlayer })
      } catch (err) {
        console.warn('[boxity] chat bubble failed', err)
      }
    }),
  )
}

/** respawn_request, play_emote (data = emote id), pointer_lock_changed... */
export function onPlayerEvent(cb) {
  const player = sdk()?.player
  if (!player?.onEvent) return () => {}
  return toUnsubscribe(player.onEvent((event, data) => cb(event, data)))
}

export const registerFeature = (name) => call((s) => s.game?.registerFeature?.bind(s.game), name)
export const showPortalMenu = () => call((s) => s.portal?.showMenu?.bind(s.portal), true)

let emotes = null
/** Emote clips by id, fetched once. Unknown ids simply have no clip. */
export async function loadEmotes() {
  if (emotes) return emotes
  emotes = new Map()
  try {
    const res = await fetch(`${API_URL}/v1/avatar/emotes`)
    const body = await res.json()
    for (const e of body.emotes || []) if (e?.id && e.clip?.tracks) emotes.set(e.id, e.clip)
  } catch (err) {
    console.warn('[boxity] emote catalogue unavailable', err)
  }
  return emotes
}
export const emoteClip = (id) => emotes?.get(id) || null

/* ------------------------------------------------------------------------ */
/* Friends                                                                   */
/* ------------------------------------------------------------------------ */

export async function getFriends() {
  try {
    const list = await sdk()?.social?.getFriends?.()
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
export async function inviteFriend(userId) {
  try {
    return !!(await sdk()?.social?.inviteFriend?.(userId))
  } catch {
    return false
  }
}
export const inviteLink = () => call((s) => s.social?.getInviteFriendsLink?.bind(s.social)) || ''
