import { create } from 'zustand'

/**
 * React-facing game state (HUD, panels, notifications). Anything that changes
 * every frame lives in `runtime` instead and is mirrored here at a low rate.
 */

const SETTINGS_KEY = 'jetpack_escape_settings'
export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.35,
  sfxVolume: 0.8,
  showFps: false,
  quality: 'high',
  camSensitivity: 1,
  showNames: true,
  showOtherTrails: true,
  showChat: true,
  autoCamera: true,
  /** A / D (and arrows) turn the camera with you, like steering. */
  turnCamera: true,
  /** The sound on/off button. */
  muted: false,
  /** Let the game trade glow/shadows for frame rate on slow PCs (never resolution). */
  autoPerf: true,
}

/**
 * First visit: pick the graphics setting from the hardware, so a weak laptop
 * starts smooth instead of starting slow and adapting.
 */
function detectQuality() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'low'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    const memory = navigator.deviceMemory || 8
    const cores = navigator.hardwareConcurrency || 4
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(gpu) || memory <= 2 || cores <= 2) return 'low'
    if (touch || memory <= 4 || /intel|uhd|iris|hd graphics|mali|adreno|powervr|apple gpu|vivante|videocore/.test(gpu)) return 'medium'
    return 'high'
  } catch {
    return 'medium'
  }
}

function loadSettings() {
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch {
    // storage unavailable - defaults below
  }
  const settings = { ...DEFAULT_SETTINGS, ...saved }
  if (!saved.quality) {
    settings.quality = detectQuality()
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // storage unavailable - it is detected again next time
    }
  }
  return settings
}

let toastId = 1

export const useGame = create((set, get) => ({
  /** connecting | playing | error */
  phase: 'connecting',
  error: null,
  /** Socket dropped; trying to get back into the same room. */
  reconnecting: false,
  /** Status line while joining ("Starting the server..."). */
  joinStatus: null,
  welcome: null,
  profile: null,
  boards: { trophies: [], playtime: [], rebirths: [] },
  moonlitStock: 5000,
  players: [],
  race: { phase: 'idle', endsAt: 0, startAt: 0, racers: 0, joined: false, results: null },

  panel: null,
  panelArg: null,
  prompt: null,
  banner: null,
  toasts: [],
  fuel: { cur: 10, max: 10 },
  speedLimit: null,
  chat: [],
  chatOpen: false,
  /** Tab toggles the player list; hidden by default to keep the screen clean. */
  showPlayerList: false,
  /** The guide for first-time players (see Guide in HUD). */
  hello: null,
  /** Set by AdaptiveQuality when even the lowest resolution is too slow: glow and shadows off. */
  lowPower: false,
  /** Render resolution chosen by AdaptiveQuality (null = the setting's sharpest). */
  renderDpr: null,
  crateResult: null,
  purchasePending: null,
  settings: loadSettings(),

  setPhase: (phase, error = null) => set({ phase, error }),
  openPanel: (panel, panelArg = null) => set({ panel, panelArg }),
  closePanel: () => set({ panel: null, panelArg: null }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel, panelArg: null })),

  toast(text, kind = 'info', ms = 3200) {
    const id = toastId++
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  showBanner(text, kind = 'info', ms = 3000) {
    const id = toastId++
    set({ banner: { id, text, kind } })
    setTimeout(() => {
      if (get().banner?.id === id) set({ banner: null })
    }, ms)
  },
  pushChat(entry) {
    set((s) => ({ chat: [...s.chat.slice(-40), { ...entry, id: toastId++, at: Date.now() }] }))
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // storage unavailable (private mode) - settings just won't persist
    }
    set({ settings })
  },
}))

export const getGame = () => useGame.getState()

/**
 * A shared wall clock for timers in the HUD (countdowns, cooldowns), ticked
 * outside React so components never read Date.now() during render.
 */
export const useClock = create(() => ({ now: Date.now() }))
setInterval(() => useClock.setState({ now: Date.now() }), 250)
