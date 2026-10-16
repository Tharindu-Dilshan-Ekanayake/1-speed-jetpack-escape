import {
  emoteClip,
  enableParty,
  listenToPortalSettings,
  loadEmotes,
  onChatMessage,
  onPlayerEvent,
  registerFeature,
} from '../bloxity/boxity.js'
import { startEmote } from '../game/pose.js'
import { getGame } from '../state/gameStore.js'
import { runtime } from '../state/runtime.js'
import { send } from './connection.js'

/**
 * Connects Boxity's portal features to the game. Called once, right after
 * Legion.SDK.init() and before loadingEnd(), so no portal push is missed.
 * @returns {() => void} unsubscribe everything
 */
export function installBoxityFeatures() {
  registerFeature('emotes') // shows the emote button in the Boxity overlay
  enableParty()
  loadEmotes()

  const offs = [
    // Volume, graphics, camera, FPS and chat follow the portal menu (embedded only).
    listenToPortalSettings((patch) => getGame().updateSettings(patch)),

    onPlayerEvent((event, data) => {
      if (getGame().phase !== 'playing') return
      if (event === 'respawn_request') runtime.local?.die('reset')
      else if (event === 'play_emote' && typeof data === 'string') playLocalEmote(data)
    }),

    // Boxity draws the chat; the game shows each message above the sender.
    onChatMessage(({ userId, text, seconds, isLocalPlayer }) => {
      const bubble = { text, until: Date.now() + seconds * 1000 }
      if (isLocalPlayer) {
        if (runtime.local?.chatRef) runtime.local.chatRef.current = bubble
        return
      }
      runtime.room?.state?.players?.forEach((player, sid) => {
        if (!player.uid || player.uid !== userId) return
        const remote = runtime.remotes.get(sid)
        if (remote?.chatRef) remote.chatRef.current = bubble
      })
    }),
  ]
  return () => offs.forEach((off) => off())
}

/** Plays an emote on our character and shows it to everyone in the room. */
export async function playLocalEmote(id) {
  await loadEmotes()
  const clip = emoteClip(id)
  const local = runtime.local
  if (!clip || !local?.poseRef) return // unknown id: ignore silently
  startEmote(local.poseRef.current, clip)
  send('emote', { id })
}
