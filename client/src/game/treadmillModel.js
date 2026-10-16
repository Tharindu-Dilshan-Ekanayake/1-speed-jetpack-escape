import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  Euler,
  Quaternion,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { drawIcon, makeCanvas, outlined, roundRect, toTexture } from './canvasArt.js'

/**
 * Detailed gym treadmills, built from instanced parts. Local frame: origin at
 * the floor under the belt centre, the runner faces +Z, the console is at +Z.
 */

const TIERS = {
  normal: { body: '#3d8bff', led: '#45d2ff', label: 'x1', sub: 'RUN!' },
  vip: { body: '#ffbf1a', led: '#ffe066', label: 'x2', sub: 'VIP' },
  vip_plus: { body: '#ff4fd8', led: '#ff9cf0', label: 'x4', sub: 'VIP+' },
}

function beltTexture() {
  const c = makeCanvas(64, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#1d2033'
  ctx.fillRect(0, 0, 64, 256)
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = '#2b3050'
    ctx.fillRect(0, y, 64, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, y, 64, 2)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(0, 0, 3, 256)
  ctx.fillRect(61, 0, 3, 256)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(1, 3)
  return tex
}

function screenTexture(tier) {
  const t = TIERS[tier]
  const c = makeCanvas(512, 168)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#071027'
  roundRect(ctx, 0, 0, 512, 168, 26)
  ctx.fill()
  const g = ctx.createLinearGradient(0, 0, 0, 168)
  g.addColorStop(0, 'rgba(80,190,255,0.25)')
  g.addColorStop(1, 'rgba(80,190,255,0.02)')
  ctx.fillStyle = g
  roundRect(ctx, 10, 10, 492, 148, 20)
  ctx.fill()
  ctx.strokeStyle = t.led
  ctx.lineWidth = 6
  roundRect(ctx, 10, 10, 492, 148, 20)
  ctx.stroke()
  drawIcon(ctx, 'shoe', 88, 84, 110)
  outlined(ctx, t.label, 270, 74, { size: 86, fill: t.led, width: 10 })
  outlined(ctx, t.sub, 270, 136, { size: 34, width: 6 })
  // speed bars
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i < 4 ? t.led : 'rgba(255,255,255,0.15)'
    ctx.fillRect(380 + i * 18, 120 - i * 12, 12, 24 + i * 12)
  }
  return toTexture(c)
}

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _e = new Euler()

/** Local transform for a part. */
function local(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
}

/**
 * @param {Array<{ type: string, pos: number[], dir: number[] }>} treadmills
 * @returns {{ group: Group, update: (dt: number) => void }}
 */
export function createTreadmills(treadmills) {
  const group = new Group()
  group.name = 'treadmills'
  const n = treadmills.length
  const bases = treadmills.map((t) => {
    const ry = Math.atan2(t.dir[0], t.dir[2])
    return new Matrix4().compose(_p.set(t.pos[0], t.pos[1], t.pos[2]), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1))
  })

  const white = (opts = {}) => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.1, ...opts })
  const chrome = new MeshStandardMaterial({ color: '#d7dcf0', roughness: 0.25, metalness: 0.85 })
  const dark = new MeshStandardMaterial({ color: '#262b45', roughness: 0.55, metalness: 0.3 })
  const belt = beltTexture()

  /** One instanced part shared by every treadmill. color: 'body' | 'led' | null */
  const part = (geometry, material, transforms, color = null, { shadow = true } = {}) => {
    const list = Array.isArray(transforms) ? transforms : [transforms]
    const mesh = new InstancedMesh(geometry, material, n * list.length)
    let i = 0
    treadmills.forEach((t, k) => {
      for (const lt of list) {
        mesh.setMatrixAt(i, _m.multiplyMatrices(bases[k], lt))
        if (color) mesh.setColorAt(i, new Color(TIERS[t.type]?.[color] || TIERS.normal[color]))
        i += 1
      }
    })
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  // Deck, belt, foot rails, rollers.
  part(new RoundedBoxGeometry(9.2, 1.0, 18.6, 2, 0.35), dark, local(0, 0.5, 0))
  part(new BoxGeometry(7.0, 0.16, 16.4), new MeshStandardMaterial({ map: belt, roughness: 0.9 }), local(0, 1.06, -0.2), null, { shadow: false })
  part(new BoxGeometry(1.05, 0.28, 17.2), white({ color: '#c9cfe6' }), [local(-4.1, 1.12, -0.4), local(4.1, 1.12, -0.4)])
  part(new CylinderGeometry(0.55, 0.55, 7.4, 16), chrome, [local(0, 0.72, -8.6, 0, 0, Math.PI / 2), local(0, 0.72, 8.3, 0, 0, Math.PI / 2)])
  // Glowing LED strips along both sides and the back edge.
  part(new BoxGeometry(0.22, 0.22, 18.2), new MeshBasicMaterial({ color: '#ffffff' }), [local(-4.66, 0.62, 0), local(4.66, 0.62, 0)], 'led', { shadow: false })
  part(new BoxGeometry(9.0, 0.22, 0.22), new MeshBasicMaterial({ color: '#ffffff' }), local(0, 0.62, -9.33), 'led', { shadow: false })
  // Motor hood (tier coloured).
  part(new RoundedBoxGeometry(9.0, 1.7, 2.6, 2, 0.5), white(), local(0, 1.2, 8.4), 'body')
  // Uprights, crossbar, handrails at waist height.
  part(new RoundedBoxGeometry(0.75, 5.6, 0.75, 2, 0.25), white(), [local(-3.9, 3.9, 8.9, -0.12), local(3.9, 3.9, 8.9, -0.12)], 'body')
  part(new CylinderGeometry(0.28, 0.28, 8.2, 10), chrome, local(0, 5.6, 8.55, 0, 0, Math.PI / 2))
  part(new CylinderGeometry(0.24, 0.24, 5.2, 10), chrome, [local(-3.9, 4.6, 6.0, Math.PI / 2), local(3.9, 4.6, 6.0, Math.PI / 2)])
  part(new RoundedBoxGeometry(0.6, 0.6, 1.0, 1, 0.2), dark, [local(-3.9, 4.6, 3.4), local(3.9, 4.6, 3.4)])
  // Console at chest height, its screen tilted up toward the runner.
  const tilt = 0.5
  const up = (d) => [Math.cos(tilt) * d, Math.sin(tilt) * d]
  const [topY, topZ] = up(1.4)
  part(new RoundedBoxGeometry(8.8, 2.8, 1.3, 2, 0.45), dark, local(0, 6.9, 8.9, tilt))
  part(new RoundedBoxGeometry(8.8, 0.32, 1.4, 1, 0.15), new MeshBasicMaterial({ color: '#ffffff' }), local(0, 6.9 + topY, 8.9 + topZ, tilt), 'led', { shadow: false })
  for (const tier of Object.keys(TIERS)) {
    const idx = treadmills.map((t, k) => (t.type === tier ? k : -1)).filter((k) => k >= 0)
    if (!idx.length) continue
    const mesh = new InstancedMesh(new PlaneGeometry(7.4, 2.3), new MeshBasicMaterial({ map: screenTexture(tier), toneMapped: false }), idx.length)
    // On the console's runner-facing side: centre + R(tilt) * (0, 0, -0.68).
    const lt = local(0, 6.9 + Math.sin(tilt) * 0.68, 8.9 - Math.cos(tilt) * 0.68, tilt, Math.PI)
    idx.forEach((k, i) => mesh.setMatrixAt(i, _m.multiplyMatrices(bases[k], lt)))
    group.add(mesh)
  }

  return {
    group,
    update(dt) {
      // Belt surface rolls back under the runner's feet.
      belt.offset.y = (belt.offset.y - dt * 2.2) % 1
    },
  }
}
