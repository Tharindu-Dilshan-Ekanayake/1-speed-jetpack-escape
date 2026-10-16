import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'

import { makeCanvas, toTexture } from './canvasArt.js'

/**
 * Classic R6-style blocky character, used while the Bloxity avatar streams in
 * or when its CDN is unreachable. Colours are derived from the player name so
 * everyone stays recognisable. 5 studs tall, facing +Z, feet at y = 0.
 */

const SKIN_TONES = ['#f5cd9a', '#e8b07d', '#c98d5c', '#8d5a3b', '#ffd9b3', '#f2c48d']
const SHIRTS = ['#1f1f24', '#2f80ed', '#eb5757', '#27ae60', '#9b51e0', '#f2994a', '#56ccf2']
const PANTS = ['#1b2433', '#3b3b46', '#28344d', '#4a3426', '#1d3a2c']
const HAIR = ['#e0721f', '#2b1d12', '#f2d06b', '#6b3a1d', '#111111']

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

let faceTexture = null
function getFace() {
  if (faceTexture) return faceTexture
  const c = makeCanvas(128, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#111111'
  ctx.beginPath()
  ctx.ellipse(44, 52, 7, 11, 0, 0, Math.PI * 2)
  ctx.ellipse(84, 52, 7, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#111111'
  ctx.beginPath()
  ctx.arc(64, 72, 22, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  faceTexture = toTexture(c)
  return faceTexture
}

const geo = {
  leg: new BoxGeometry(0.98, 2, 1).translate(0, -1, 0),
  arm: new BoxGeometry(0.98, 2, 1).translate(0, -0.9, 0),
  torso: new BoxGeometry(2, 2, 1).translate(0, 1, 0),
  head: new BoxGeometry(1.25, 1.2, 1.2).translate(0, 0.6, 0),
  hair: new BoxGeometry(1.35, 0.5, 1.32).translate(0, 1.15, -0.04),
  hairBack: new BoxGeometry(1.35, 0.9, 0.3).translate(0, 0.75, -0.55),
}

export function createBlockyRig(name = 'Player') {
  const h = hash(name)
  const mat = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.75, ...extra })
  const skin = mat(SKIN_TONES[h % SKIN_TONES.length])
  const shirt = mat(SHIRTS[(h >> 3) % SHIRTS.length])
  const pants = mat(PANTS[(h >> 6) % PANTS.length])
  const hair = mat(HAIR[(h >> 9) % HAIR.length])
  const faceMat = mat('#ffffff', { map: getFace() })

  const root = new Group()
  const hips = new Group()
  hips.position.y = 2
  root.add(hips)

  const legL = new Group()
  legL.position.set(0.5, 0, 0)
  legL.add(new Mesh(geo.leg, pants))
  const legR = new Group()
  legR.position.set(-0.5, 0, 0)
  legR.add(new Mesh(geo.leg, pants))
  hips.add(legL, legR)

  const torso = new Group()
  hips.add(torso)
  torso.add(new Mesh(geo.torso, shirt))

  const armL = new Group()
  armL.position.set(1.5, 1.85, 0)
  armL.add(new Mesh(geo.arm, skin))
  const armR = new Group()
  armR.position.set(-1.5, 1.85, 0)
  armR.add(new Mesh(geo.arm, skin))
  torso.add(armL, armR)

  const neck = new Group()
  neck.position.y = 2
  torso.add(neck)
  // Face on the front (+Z) side only.
  const headMats = [skin, skin, skin, skin, faceMat, skin]
  neck.add(new Mesh(geo.head, headMats), new Mesh(geo.hair, hair), new Mesh(geo.hairBack, hair))

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return { root, hips, torso, legL, legR, armL, armR, neck, back: torso }
}

/** Applies a pose.js pose to the blocky rig. */
export function poseBlocky(r, pose) {
  if (!pose) return
  r.hips.position.y = 2 + pose.bob
  r.torso.rotation.x = pose.spine
  r.legL.rotation.x = pose.legL + pose.kneeL * 0.35
  r.legR.rotation.x = pose.legR + pose.kneeR * 0.35
  r.armL.rotation.set(pose.armL + pose.elbowL * 0.3, 0, pose.armLOut)
  r.armR.rotation.set(pose.armR + pose.elbowR * 0.3, 0, -pose.armROut)
  r.neck.rotation.x = pose.head - pose.spine * 0.4
}
