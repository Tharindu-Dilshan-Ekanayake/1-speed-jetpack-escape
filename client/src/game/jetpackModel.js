import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

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

function wing(color, glow) {
  const g = new Group()
  const mat = new MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.6, roughness: 0.4, side: DoubleSide })
  for (let i = 0; i < 4; i += 1) {
    const feather = new Mesh(new SphereGeometry(1, 12, 8), mat)
    feather.scale.set(1.5 - i * 0.22, 0.32, 0.08)
    feather.position.set(1.0 + i * 0.12, 0.55 - i * 0.42, 0)
    feather.rotation.z = 0.35 - i * 0.22
    g.add(feather)
  }
  return g
}

function spikes(colorA, colorB) {
  const g = new Group()
  for (let i = 0; i < 12; i += 1) {
    const mat = new MeshBasicMaterial({ color: i % 2 ? colorA : colorB })
    const spike = new Mesh(new ConeGeometry(0.22, 1.9 + (i % 3) * 0.5, 6), mat)
    const a = (i / 12) * Math.PI * 2
    spike.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, -0.1)
    spike.rotation.z = a - Math.PI / 2
    g.add(spike)
  }
  return g
}

/**
 * @param {string} jetpackId
 * @param {string} [skinId]
 * @returns {Group} with userData.setThrust(amount 0..1, time)
 */
export function createJetpack(jetpackId, skinId) {
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

  const plate = new Mesh(PLATE, darkMat)
  plate.position.set(0, 0.1, 0.38)
  group.add(plate)

  const flames = []
  for (const side of [-1, 1]) {
    const tank = new Mesh(TANK, tankMat)
    tank.position.set(side * 0.55, 0, 0)
    tank.castShadow = true
    group.add(tank)
    for (const y of [0.55, -0.4]) {
      const band = new Mesh(BAND, bandMat)
      band.position.set(side * 0.55, y, 0)
      group.add(band)
    }
    const nozzle = new Mesh(NOZZLE, darkMat)
    nozzle.position.set(side * 0.55, -1.22, 0)
    group.add(nozzle)

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
    const right = wing('#ffffff', '#6fe7ff')
    const left = wing('#ffffff', '#6fe7ff')
    left.scale.x = -1
    right.position.set(0.6, 0.5, 0.2)
    left.position.set(-0.6, 0.5, 0.2)
    group.add(right, left)
  } else if (skin?.wings === 'spikes') {
    const burst = spikes(skin.colors[1], skin.colors[2])
    burst.position.set(0, 0.2, -0.35)
    group.add(burst)
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
