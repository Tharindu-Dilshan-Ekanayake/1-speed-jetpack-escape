/**
 * Keyboard / mouse / touch input, kept in a plain mutable object (never React
 * state): the game loop reads it every frame.
 */

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
}

/** One-shot keys for the HUD buttons; each button shows its key in its corner. */
export const SHORTCUTS = {
  KeyR: 'rebirth',
  KeyT: 'worlds',
  KeyB: 'shop',
  KeyO: 'settings',
  KeyM: 'mute',
  KeyZ: 'slower',
  KeyX: 'faster',
  KeyC: 'fullSpeed',
}
/** The label shown on a button for an action, e.g. KEY_OF.rebirth === 'R'. */
export const KEY_OF = Object.fromEntries(Object.entries(SHORTCUTS).map(([code, action]) => [action, code.replace('Key', '')]))

export const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  /** Edge-triggered: true for exactly one frame after Space goes down. */
  jumpPressed: false,
  /** Virtual joystick, -1..1 each axis (x right, y forward). */
  stickX: 0,
  stickY: 0,
  /** Touch jump button. */
  touchJump: false,
  /** Camera orbit deltas accumulated since the last frame (pixels). */
  lookX: 0,
  lookY: 0,
  zoom: 0,
  enabled: true,
  /** True when Boxity's portal owns chat (embedded): we leave Enter alone. */
  portalChat: false,
}

const listeners = new Map()
/** Subscribe to one-shot key actions (e.g. 'interact', 'chat', 'playerList'). */
export function onAction(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name).add(fn)
  return () => listeners.get(name).delete(fn)
}
export function emitAction(name) {
  listeners.get(name)?.forEach((fn) => fn())
}

const isTyping = () => {
  const el = document.activeElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function clearKeys() {
  input.forward = input.backward = input.left = input.right = input.jump = false
  input.stickX = input.stickY = 0
  input.touchJump = false
}

let installed = false
export function installInput(canvas) {
  if (installed) return () => {}
  installed = true

  const onKeyDown = (e) => {
    if (isTyping()) {
      if (e.code === 'Escape') document.activeElement.blur()
      return
    }
    const action = KEY_MAP[e.code]
    if (action) {
      e.preventDefault()
      if (action === 'jump' && !input.jump) input.jumpPressed = true
      input[action] = true
      return
    }
    if (e.repeat) return
    if (e.code === 'KeyE') emitAction('interact')
    // Embedded on bloxity.io, Enter belongs to the portal's chat.
    else if ((e.code === 'Enter' || e.code === 'Slash') && !input.portalChat) {
      e.preventDefault()
      emitAction('chat')
    } else if (e.code === 'Tab') {
      e.preventDefault()
      emitAction('playerList')
    } else if (e.code === 'Escape') emitAction('escape')
    else if (SHORTCUTS[e.code]) emitAction(SHORTCUTS[e.code])
  }
  const onKeyUp = (e) => {
    const action = KEY_MAP[e.code]
    if (action) input[action] = false
  }

  // Camera: drag with either mouse button on the canvas, wheel to zoom.
  let dragging = false
  let lastX = 0
  let lastY = 0
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return // touch camera is handled by TouchControls
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragging) return
    input.lookX += e.clientX - lastX
    input.lookY += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
  }
  const onPointerUp = (e) => {
    dragging = false
    canvas.releasePointerCapture?.(e.pointerId)
  }
  const onWheel = (e) => {
    e.preventDefault()
    input.zoom += e.deltaY
  }
  const onContext = (e) => e.preventDefault()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearKeys)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContext)

  return () => {
    installed = false
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', clearKeys)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContext)
  }
}

/** Called by the game loop once it has consumed this frame's edges/deltas. */
export function endInputFrame() {
  input.jumpPressed = false
  input.lookX = 0
  input.lookY = 0
  input.zoom = 0
}
