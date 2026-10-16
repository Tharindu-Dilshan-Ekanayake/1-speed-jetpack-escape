import { ANIM } from '../../../shared/net.js'

/**
 * Procedural animation shared by every avatar type.
 *
 * Joint angles are rotations about the character's +X axis (it faces +Z):
 *  - limbs hanging down: negative = swing forward
 *  - spine: positive = lean forward
 *  - knees: positive = fold back; elbows: negative = bend forward
 * `armOut` raises an arm sideways away from the body.
 *
 * Whole-body motion, applied around the hips by Avatar:
 *  - bodyPitch: forward dive (Superman flight)
 *  - bodyBank: lean into turns
 *  - spin: twirl about the body's long axis (a barrel roll when diving)
 */

const JOINTS = ['spine', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'armLOut', 'armROut', 'head']
const TAU = Math.PI * 2
const AIRBORNE = new Set([ANIM.jump, ANIM.fall, ANIM.fly])
/** Seconds of steady flight between flourishes. */
const FLOURISH_EVERY = 2.8

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

export function createPose() {
  const pose = {
    cycle: 0,
    runW: 0,
    bob: 0,
    time: 0,
    bodyPitch: 0,
    bodyBank: 0,
    spin: 0,
    spinning: false,
    /** True for the single frame a spin starts (for sound/effects). */
    spinStarted: false,
    prevAnim: ANIM.idle,
    flyTime: 0,
    lastFlourish: 0,
    landT: 0,
    _spin: null,
  }
  for (const j of JOINTS) {
    pose[j] = 0
    pose[`_${j}`] = 0
  }
  return pose
}

/* ---- Boxity emotes: a clip played over the pose, blended in and out ---- */

const EMOTE_BLEND = 0.1

export function startEmote(pose, clip) {
  pose.emote = { clip, t: 0, w: pose.emote?.w || 0, stopping: false }
}

export function stopEmote(pose) {
  if (pose.emote) pose.emote.stopping = true
}

/** Advances the emote clock and blend weight; clears it once faded out. */
export function advanceEmote(pose, dt) {
  const e = pose.emote
  if (!e) return null
  e.t += dt
  if (!e.clip.loop && e.t >= (e.clip.len || 0)) e.stopping = true
  e.w = Math.min(1, Math.max(0, e.w + (e.stopping ? -dt : dt) / EMOTE_BLEND))
  if (e.stopping && e.w <= 0) pose.emote = null
  return pose.emote
}

function startSpin(pose, turns, duration) {
  pose._spin = { t: 0, turns, duration }
  pose.spinStarted = true
}

const target = {}

/**
 * @param {object} pose from createPose()
 * @param {{ anim:number, speed:number, turn?:number }} motion
 *   `turn` is the yaw rate in rad/s, used to bank into turns.
 */
export function updatePose(pose, motion, dt) {
  pose.time += dt
  pose.spinStarted = false
  const t = pose.time
  for (const j of JOINTS) target[j] = 0
  const { anim } = motion
  const speed = motion.speed || 0
  const turn = motion.turn || 0
  let runTarget = 0
  let pitchT = 0
  let bankT = 0

  // ---- events: ignition spin, flourishes, landing squash ----
  const prev = pose.prevAnim
  pose.prevAnim = anim
  if (anim === ANIM.fly && prev !== ANIM.fly) {
    startSpin(pose, 1, 0.6)
    pose.flyTime = 0
    pose.lastFlourish = 0
  }
  if (anim === ANIM.fly) {
    pose.flyTime += dt
    if (speed > 12 && pose.flyTime - pose.lastFlourish > FLOURISH_EVERY && !pose._spin) {
      pose.lastFlourish = pose.flyTime
      startSpin(pose, 2, 0.9)
    }
  }
  if (AIRBORNE.has(prev) && !AIRBORNE.has(anim) && anim !== ANIM.dead) pose.landT = 0.24

  // ---- targets per state ----
  if (anim === ANIM.run || anim === ANIM.treadmill) {
    runTarget = anim === ANIM.treadmill ? 1 : Math.min(1, 0.4 + speed / 30)
    target.spine = 0.16 * runTarget
    target.elbowL = target.elbowR = -0.55 * runTarget
    bankT = clamp(-turn * 0.06, -0.18, 0.18)
  } else if (anim === ANIM.fly) {
    // Fast: Superman dive, right fist forward, left arm along the body.
    // Slow: upright hover with lazy kicks.
    const fwd = Math.min(1, speed / 35)
    const kick = Math.sin(t * 5) * (1 - fwd)
    pitchT = 0.15 + 1.05 * fwd
    bankT = clamp(-turn * 0.32, -0.75, 0.75)
    target.spine = 0.05
    target.head = -0.75 * fwd
    target.armR = lerp(0.3, -2.95, fwd)
    target.armROut = lerp(0.75, 0.05, fwd)
    target.armL = lerp(0.3, 0.25, fwd)
    target.armLOut = lerp(0.75, 0.12, fwd)
    target.elbowL = lerp(-0.3, -0.1, fwd)
    target.legL = lerp(0.3 + kick * 0.3, 0.12 + Math.sin(t * 7) * 0.05, fwd)
    target.legR = lerp(0.15 - kick * 0.3, 0.04 - Math.sin(t * 7) * 0.05, fwd)
    target.kneeL = lerp(0.6, 0.3, fwd)
    target.kneeR = lerp(0.4, 0.12, fwd)
  } else if (anim === ANIM.jump) {
    target.armL = -2.5
    target.armR = -2.5
    target.armLOut = 0.15
    target.armROut = 0.15
    target.legL = -0.45
    target.kneeL = 0.75
    target.legR = 0.2
    target.kneeR = 0.25
  } else if (anim === ANIM.fall) {
    pitchT = -0.12
    target.armL = -2.3 + Math.sin(t * 13) * 0.35
    target.armR = -2.3 - Math.sin(t * 13) * 0.35
    target.armLOut = 0.35
    target.armROut = 0.35
    target.legL = 0.25 + Math.sin(t * 9) * 0.2
    target.legR = -0.25 - Math.sin(t * 9) * 0.2
    target.kneeL = 0.45
    target.kneeR = 0.3
  } else {
    // idle breathing
    const b = Math.sin(t * 1.7)
    target.spine = b * 0.025
    target.armLOut = 0.07 + b * 0.025
    target.armROut = 0.07 + b * 0.025
    target.head = Math.sin(t * 0.6) * 0.05
  }

  // Landing squash: knees give, arms flare.
  let squash = 0
  if (pose.landT > 0) {
    pose.landT = Math.max(0, pose.landT - dt)
    squash = Math.sin((1 - pose.landT / 0.24) * Math.PI)
    target.kneeL += 0.8 * squash
    target.kneeR += 0.8 * squash
    target.legL -= 0.35 * squash
    target.legR -= 0.35 * squash
    target.armLOut += 0.5 * squash
    target.armROut += 0.5 * squash
    target.spine += 0.2 * squash
  }

  const k = 1 - Math.exp(-13 * dt)
  for (const j of JOINTS) pose[`_${j}`] += (target[j] - pose[`_${j}`]) * k
  pose.runW += (runTarget - pose.runW) * (1 - Math.exp(-10 * dt))
  const kb = 1 - Math.exp(-7 * dt)
  pose.bodyPitch += (pitchT - pose.bodyPitch) * kb
  pose.bodyBank += (bankT - pose.bodyBank) * kb

  // ---- spin (eased so it whips round then settles) ----
  const s = pose._spin
  if (s) {
    s.t += dt
    const p = Math.min(1, s.t / s.duration)
    pose.spin = s.turns * TAU * (1 - (1 - p) ** 3)
    pose.spinning = p < 1
    if (p >= 1) {
      pose._spin = null
      pose.spin = 0
    }
  } else {
    pose.spinning = false
    pose.spin = 0
  }

  // Run cycle, added on top with its own weight so it is never smoothed away.
  const freq = anim === ANIM.treadmill ? 2.6 : Math.min(4.2, 1.5 + speed / 16)
  if (pose.runW > 0.01) pose.cycle += dt * freq * Math.PI * 2
  const c = Math.sin(pose.cycle)
  const w = pose.runW
  for (const j of JOINTS) pose[j] = pose[`_${j}`]
  pose.legL += c * 0.95 * w
  pose.legR -= c * 0.95 * w
  pose.kneeL += Math.max(0, c) * 1.15 * w
  pose.kneeR += Math.max(0, -c) * 1.15 * w
  pose.armL -= c * 0.85 * w
  pose.armR += c * 0.85 * w
  pose.bob = Math.abs(Math.cos(pose.cycle)) * 0.28 * w + (anim === ANIM.idle ? Math.sin(t * 1.7) * 0.03 : 0) - squash * 0.45
  return pose
}
