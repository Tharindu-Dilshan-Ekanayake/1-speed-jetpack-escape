import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { JETPACK_BY_ID, SKIN_BY_ID } from '../../../shared/config.js'
import { makeCanvas, toTexture } from './canvasArt.js'

/**
 * Jetpack meshes. Local frame: +Y up, the wearer's back is at +Z (the pack
 * sits behind the torso), flames point down. Roughly 2 x 2.2 x 1.1 studs.
 */

const TANK = new RoundedBoxGeometry(0.95, 2.1, 0.95, 3, 0.26)
const BAND = new BoxGeometry(1.02, 0.2, 1.02)
const PLATE = new BoxGeometry(1.7, 1.3, 0.3)
const NOZZLE = new CylinderGeometry(0.27, 0.38, 0.42, 14)
const FLAME = new ConeGeometry(0.34, 1.7, 14, 1, true).rotateX(Math.PI).translate(0, -0.85, 0)
const CORE = new ConeGeometry(0.17, 1.0, 10, 1, true).rotateX(Math.PI).translate(0, -0.5, 0)

/*
 * Every jetpack has the same shape, so the static parts are baked once into
 * one geometry per material and shared: a jetpack is 3 draw calls (plus its
 * flames while flying) instead of 9 - or 21 with wings / spikes.
 */
const _o = new Object3D()
const _m = new Matrix4()
function placed(geo, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], parent = null) {
  _o.position.set(x, y, z)
  _o.rotation.set(rx, ry, rz)
  _o.scale.set(sx, sy, sz)
  _o.updateMatrix()
  _m.copy(_o.matrix)
  if (parent) _m.premultiply(parent)
  const g = geo.clone().applyMatrix4(_m)
  g.clearGroups()
  return g
}
const matrixOf = ([x, y, z], [sx, sy, sz] = [1, 1, 1]) => {
  _o.position.set(x, y, z)
  _o.rotation.set(0, 0, 0)
  _o.scale.set(sx, sy, sz)
  _o.updateMatrix()
  return _o.matrix.clone()
}
const SIDES = [-1, 1]
const TANKS = mergeGeometries(SIDES.map((side) => placed(TANK, [side * 0.55, 0, 0])))
const BANDS = mergeGeometries(SIDES.flatMap((side) => [0.55, -0.4].map((y) => placed(BAND, [side * 0.55, y, 0]))))
const DARK = mergeGeometries([placed(PLATE, [0, 0.1, 0.38]), ...SIDES.map((side) => placed(NOZZLE, [side * 0.55, -1.22, 0]))])

const FEATHER = new SphereGeometry(1, 12, 8)
/** Both angel wings (the left one mirrored), four feathers each. */
const WINGS = mergeGeometries(
  [matrixOf([0.6, 0.5, 0.2]), matrixOf([-0.6, 0.5, 0.2], [-1, 1, 1])].flatMap((wingMatrix) =>
    [0, 1, 2, 3].map((i) => placed(FEATHER, [1.0 + i * 0.12, 0.55 - i * 0.42, 0], [0, 0, 0.35 - i * 0.22], [1.5 - i * 0.22, 0.32, 0.08], wingMatrix)),
  ),
)
/** The spike burst, split by its two alternating colours. */
const SPIKES = [0, 1].map((odd) => {
  const burst = matrixOf([0, 0.2, -0.35])
  const parts = []
  for (let i = odd; i < 12; i += 2) {
    const a = (i / 12) * Math.PI * 2
    parts.push(placed(new ConeGeometry(0.22, 1.9 + (i % 3) * 0.5, 6), [Math.cos(a) * 1.2, Math.sin(a) * 1.2, -0.1], [0, 0, a - Math.PI / 2], [1, 1, 1], burst))
  }
  return mergeGeometries(parts)
})

const patternCache = new Map()

/** Skin pattern texture wrapped around each tank. */
function patternTexture(skin) {
  if (patternCache.has(skin.id)) return patternCache.get(skin.id)
  const [base, a, b] = skin.colors
  const c = makeCanvas(128, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 256)
  const colors = [a, b]
  if (skin.pattern === 'tri') {
    for (let row = 0; row < 4; row += 1) {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = colors[(row + i) % 2]
        const x = 10 + i * 40
        const y = 30 + row * 60
        ctx.beginPath()
        if ((row + i) % 2) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + 32, y)
          ctx.lineTo(x + 16, y + 30)
        } else {
          ctx.moveTo(x + 16, y)
          ctx.lineTo(x + 32, y + 30)
          ctx.lineTo(x, y + 30)
        }
        ctx.fill()
      }
    }
  } else if (skin.pattern === 'dot') {
    for (let row = 0; row < 5; row += 1) {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = colors[(row + i) % 2]
        ctx.beginPath()
        ctx.arc(24 + i * 40, 28 + row * 50, 13, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (skin.pattern === 'bar') {
    for (let row = 0; row < 6; row += 1) {
      ctx.fillStyle = colors[row % 2]
      ctx.fillRect(0, 14 + row * 42, 128, 18)
    }
  } else {
    for (let row = 0; row < 5; row += 1) {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = colors[(row + i) % 2]
        const cx = 22 + i * 42
        const cy = 26 + row * 50
        ctx.beginPath()
        for (let k = 0; k < 10; k += 1) {
          const r = k % 2 ? 6 : 15
          const ang = (k * Math.PI) / 5 - Math.PI / 2
          ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
        }
        ctx.fill()
      }
    }
  }
  const tex = toTexture(c)
  patternCache.set(skin.id, tex)
  return tex
}

/**
 * @param {string} jetpackId
 * @param {string} [skinId]
 * @param {{ shadow?: boolean }} [opts] display copies (shop wall) skip the shadow
 * @returns {Group} with userData.setThrust(amount 0..1, time)
 */
export function createJetpack(jetpackId, skinId, { shadow = true } = {}) {
  const jp = JETPACK_BY_ID[jetpackId] || JETPACK_BY_ID.jp1
  const skin = skinId ? SKIN_BY_ID[skinId] : null
  const group = new Group()
  group.name = 'jetpack'

  const bodyColor = new Color(skin ? '#ffffff' : jp.color)
  const tankMat = new MeshStandardMaterial({
    color: bodyColor,
    map: skin ? patternTexture(skin) : null,
    roughness: 0.55,
    metalness: 0.1,
    emissive: jp.glow ? new Color(jp.color).multiplyScalar(0.15) : new Color(0),
  })
  const bandColor = skin ? skin.colors[1] : jp.band
  const glowBands = jp.glow || skin?.rarity === 'legendary' || skin?.rarity === 'exclusive'
  const bandMat = glowBands
    ? new MeshBasicMaterial({ color: new Color(bandColor).multiplyScalar(1.6) })
    : new MeshStandardMaterial({ color: bandColor, roughness: 0.7 })
  const darkMat = new MeshStandardMaterial({ color: '#2a2d3a', roughness: 0.5, metalness: 0.6 })

  const tanks = new Mesh(TANKS, tankMat)
  tanks.castShadow = shadow
  group.add(tanks, new Mesh(BANDS, bandMat), new Mesh(DARK, darkMat))

  const flames = []
  for (const side of SIDES) {
    const flameMat = new MeshBasicMaterial({ color: jp.flame, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
    const coreMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })
    const flame = new Group()
    flame.position.set(side * 0.55, -1.4, 0)
    flame.add(new Mesh(FLAME, flameMat))
    flame.add(new Mesh(CORE, coreMat))
    flame.visible = false
    group.add(flame)
    flames.push(flame)
  }

  if (skin?.wings === 'angel') {
    group.add(new Mesh(WINGS, new MeshStandardMaterial({ color: '#ffffff', emissive: '#6fe7ff', emissiveIntensity: 0.6, roughness: 0.4, side: DoubleSide })))
  } else if (skin?.wings === 'spikes') {
    // Even spikes wear colour 3, odd ones colour 2 (as before).
    group.add(new Mesh(SPIKES[0], new MeshBasicMaterial({ color: skin.colors[2] })), new Mesh(SPIKES[1], new MeshBasicMaterial({ color: skin.colors[1] })))
  }

  let thrust = 0
  group.userData.setThrust = (target, time) => {
    thrust += (target - thrust) * 0.35
    for (let i = 0; i < flames.length; i += 1) {
      const f = flames[i]
      f.visible = thrust > 0.04
      const flicker = 0.85 + Math.sin(time * 41 + i * 2.1) * 0.1 + Math.sin(time * 67 + i) * 0.06
      f.scale.set(0.8 + thrust * 0.3, thrust * flicker * 1.3, 0.8 + thrust * 0.3)
    }
  }
  group.userData.dispose = () => {
    group.traverse((o) => {
      if (o.isMesh && o.material) o.material.dispose?.()
    })
  }
  return group
}
