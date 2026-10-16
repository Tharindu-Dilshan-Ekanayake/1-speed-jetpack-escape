import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { SKIN_BY_ID } from '../../../shared/config.js'
import { drawBoard, drawLabel, makeCanvas, toTexture } from './canvasArt.js'
import { createJetpack } from './jetpackModel.js'
import { getSurfaceTexture } from './textures.js'

const dummy = new Object3D()

/* ------------------------------------------------------------------------ */
/* Labels                                                                    */
/* ------------------------------------------------------------------------ */

/** A camera-facing text sprite that can be redrawn cheaply. */
export class LabelSprite {
  constructor(width = 12, aspect = 2, { depthTest = true } = {}) {
    // 768 px wide: crisp text even up close.
    this.canvas = makeCanvas(768, Math.round(768 / aspect))
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest }))
    this.sprite.scale.set(width, width / aspect, 1)
    this.key = ''
  }

  set(lines) {
    const key = JSON.stringify(lines)
    if (key === this.key) return
    this.key = key
    drawLabel(this.canvas, lines)
    this.texture.needsUpdate = true
  }
}

/* ------------------------------------------------------------------------ */
/* Ghosts                                                                    */
/* ------------------------------------------------------------------------ */

const ghostBody = mergeGeometries([
  new BoxGeometry(3, 3.4, 2.2).translate(0, 0.5, 0),
  new BoxGeometry(0.9, 0.8, 2.2).translate(-1.05, -1.6, 0),
  new BoxGeometry(0.9, 0.8, 2.2).translate(1.05, -1.6, 0),
  new BoxGeometry(0.7, 0.5, 2.2).translate(0, -1.45, 0),
])
const ghostFace = mergeGeometries([
  new BoxGeometry(0.55, 0.75, 0.1).translate(-0.6, 1.0, 1.12),
  new BoxGeometry(0.55, 0.75, 0.1).translate(0.6, 1.0, 1.12),
  new BoxGeometry(1.4, 0.3, 0.1).translate(0, 0.0, 1.12),
])

export function createGhost({ color = '#ffffff', outline: outlineColor = '#ff2433' } = {}) {
  const g = new Group()
  const body = new Mesh(ghostBody, new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.6 }))
  const outline = new Mesh(ghostBody, new MeshBasicMaterial({ color: outlineColor, side: BackSide }))
  outline.scale.setScalar(1.08)
  const face = new Mesh(ghostFace, new MeshBasicMaterial({ color: '#1a1a1a' }))
  g.add(outline, body, face)
  g.userData = { body, outline, face }
  return g
}

/* ------------------------------------------------------------------------ */
/* Pumpkins (instanced)                                                      */
/* ------------------------------------------------------------------------ */

function pumpkinGeometry() {
  const body = new SphereGeometry(1, 20, 14)
  const pos = body.getAttribute('position')
  const colors = []
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const rib = 1 + 0.08 * Math.cos(Math.atan2(z, x) * 8)
    pos.setXYZ(i, x * rib * 1.25, pos.getY(i) * 0.95, z * rib * 1.25)
    colors.push(1, 0.42, 0.05)
  }
  body.setAttribute('color', new Float32BufferAttribute(colors, 3))
  body.computeVertexNormals()
  const stem = new CylinderGeometry(0.13, 0.2, 0.6, 6).translate(0, 1.1, 0)
  const sc = []
  for (let i = 0; i < stem.getAttribute('position').count; i += 1) sc.push(0.2, 0.55, 0.12)
  stem.setAttribute('color', new Float32BufferAttribute(sc, 3))
  const uv = stem.getAttribute('uv')
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.01, 0.01)
  return mergeGeometries([body, stem])
}

function pumpkinFaceTextures() {
  const c = makeCanvas(256, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 128)
  const e = makeCanvas(256, 128)
  const ectx = e.getContext('2d')
  ectx.fillStyle = '#000000'
  ectx.fillRect(0, 0, 256, 128)
  // Face centred at u = 0.25 (the +Z side of a three.js sphere).
  for (const [g, color] of [[ctx, '#3a1600'], [ectx, '#ffd23a']]) {
    g.fillStyle = color
    const cx = 64
    g.beginPath()
    g.moveTo(cx - 22, 52)
    g.lineTo(cx - 12, 36)
    g.lineTo(cx - 4, 52)
    g.moveTo(cx + 4, 52)
    g.lineTo(cx + 12, 36)
    g.lineTo(cx + 22, 52)
    g.fill()
    g.beginPath()
    g.moveTo(cx - 26, 66)
    g.lineTo(cx + 26, 66)
    g.lineTo(cx + 18, 80)
    g.lineTo(cx + 8, 74)
    g.lineTo(cx, 82)
    g.lineTo(cx - 8, 74)
    g.lineTo(cx - 18, 80)
    g.closePath()
    g.fill()
  }
  return [toTexture(c), toTexture(e)]
}

/** @param {number[]} [rooms] room index of each pumpkin; hidden rooms are skipped in update() */
export function createPumpkins(pumpkins, stageOf, rooms = []) {
  const [map, emissiveMap] = pumpkinFaceTextures()
  const mesh = new InstancedMesh(
    pumpkinGeometry(),
    new MeshLambertMaterial({ vertexColors: true, map, emissive: '#ffffff', emissiveMap, emissiveIntensity: 1.2 }),
    pumpkins.length,
  )
  mesh.castShadow = true
  mesh.frustumCulled = false
  const scales = pumpkins.map((p) => 1.4 + stageOf(p) * 0.35)
  const hidden = new Array(pumpkins.length).fill(false)
  return {
    mesh,
    setHidden(i, value) {
      hidden[i] = value
    },
    /** Only pumpkins in drawn rooms (and not taken) get an instance slot. */
    update(t, roomVisible) {
      let n = 0
      pumpkins.forEach((p, i) => {
        if (hidden[i] || (roomVisible && rooms[i] >= 0 && !roomVisible[rooms[i]])) return
        const s = scales[i]
        dummy.position.set(p.pos[0], p.pos[1] + s * 1.1 + Math.sin(t * 2 + i) * 0.35, p.pos[2])
        dummy.rotation.set(0, t * 0.8 + i, 0)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        mesh.setMatrixAt(n++, dummy.matrix)
      })
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

/* ------------------------------------------------------------------------ */
/* Coins along the stage paths                                               */
/* ------------------------------------------------------------------------ */

function coinFaceTexture() {
  const c = makeCanvas(128, 128)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(52, 48, 6, 64, 64, 64)
  g.addColorStop(0, '#fff7b8')
  g.addColorStop(0.55, '#ffd23f')
  g.addColorStop(1, '#e09a10')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(64, 64, 62, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#c47a06'
  ctx.beginPath()
  ctx.arc(64, 64, 48, 0, Math.PI * 2)
  ctx.stroke()
  // A star in the middle, like the HUD coin.
  ctx.fillStyle = '#fff3a6'
  ctx.strokeStyle = '#b86c00'
  ctx.lineWidth = 5
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 14 : 32
    ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 64 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return toTexture(c)
}

/**
 * Spinning gold coins. Each player sees their own: a coin hides when they
 * take it and every coin is back once they are home again.
 */
export function createCoins(coins, rooms = []) {
  const face = coinFaceTexture()
  const rim = new MeshLambertMaterial({ color: '#e8a412', emissive: '#7a4a00', emissiveIntensity: 0.6 })
  const faceMat = new MeshLambertMaterial({ map: face, emissive: '#ffcf3d', emissiveIntensity: 0.35 })
  // Cylinder groups: 0 = side, 1 = top, 2 = bottom. Stand it on its edge.
  // 16 sides: round enough at coin size, a third of the triangles of 28+.
  const geo = new CylinderGeometry(1.5, 1.5, 0.36, 16).rotateX(Math.PI / 2)
  const mesh = new InstancedMesh(geo, [rim, faceMat, faceMat], coins.length)
  mesh.frustumCulled = false
  const hidden = new Array(coins.length).fill(false)
  const index = new Map(coins.map((c, i) => [c.id, i]))
  return {
    mesh,
    index,
    hidden,
    take(id) {
      const i = index.get(id)
      if (i === undefined || hidden[i]) return false
      hidden[i] = true
      return true
    },
    reset() {
      hidden.fill(false)
    },
    /** Only coins in drawn rooms (and not taken) get an instance slot. */
    update(t, roomVisible) {
      let n = 0
      coins.forEach((c, i) => {
        if (hidden[i] || (roomVisible && rooms[i] >= 0 && !roomVisible[rooms[i]])) return
        dummy.position.set(c.pos[0], c.pos[1] + Math.sin(t * 2.4 + i * 0.7) * 0.35, c.pos[2])
        dummy.rotation.set(0, t * 2.6 + i * 0.4, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        mesh.setMatrixAt(n++, dummy.matrix)
      })
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}

/* ------------------------------------------------------------------------ */
/* Instanced decor: torches, icicles, crystals, barrels                      */
/* ------------------------------------------------------------------------ */

export function createInstancedDecor(props) {
  const group = new Group()
  const torches = props.filter((p) => p.kind === 'torch')
  const updaters = []
  if (torches.length) {
    const stick = new InstancedMesh(new BoxGeometry(0.8, 3.2, 0.8), new MeshLambertMaterial({ color: '#2b2f48' }), torches.length)
    const flameMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })
    const flame = new InstancedMesh(new ConeGeometry(0.7, 2.4, 8).translate(0, 1.2, 0), flameMat, torches.length)
    const glow = new InstancedMesh(new SphereGeometry(1.6, 8, 6), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }), torches.length)
    torches.forEach((p, i) => {
      dummy.position.set(p.pos[0], p.pos[1], p.pos[2])
      dummy.rotation.set(0, 0, p.side * 0.35)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      stick.setMatrixAt(i, dummy.matrix)
      dummy.position.y += 1.7
      dummy.position.x -= p.side * 0.6
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      flame.setMatrixAt(i, dummy.matrix)
      dummy.position.y += 1
      dummy.updateMatrix()
      glow.setMatrixAt(i, dummy.matrix)
      const color = new Color(p.color)
      flame.setColorAt(i, color)
      glow.setColorAt(i, color)
    })
    group.add(stick, flame, glow)
    updaters.push((t) => {
      flameMat.opacity = 0.8 + Math.sin(t * 13) * 0.1 + Math.sin(t * 29) * 0.07
    })
  }

  const icicles = props.filter((p) => p.kind === 'icicle')
  if (icicles.length) {
    const mesh = new InstancedMesh(
      new ConeGeometry(1, 4, 6).rotateX(Math.PI).translate(0, -2, 0),
      new MeshStandardMaterial({ color: '#cdf3ff', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
      icicles.length,
    )
    icicles.forEach((p, i) => {
      dummy.position.set(p.pos[0], p.pos[1], p.pos[2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(p.scale * 0.5, p.scale, p.scale * 0.5)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    group.add(mesh)
  }

  const crystals = props.filter((p) => p.kind === 'crystal')
  if (crystals.length) {
    const mesh = new InstancedMesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: '#ffffff' }), crystals.length)
    crystals.forEach((p, i) => {
      dummy.position.set(p.pos[0], p.pos[1], p.pos[2])
      dummy.rotation.set(0.3 * i, i, 0.4)
      dummy.scale.set(p.scale * 0.4, p.scale, p.scale * 0.4)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, new Color(p.color))
    })
    group.add(mesh)
  }

  const barrels = props.filter((p) => p.kind === 'barrel')
  if (barrels.length) {
    const body = new InstancedMesh(new CylinderGeometry(1.4, 1.4, 3.6, 12).translate(0, 1.8, 0), new MeshLambertMaterial({ color: '#3d5a2a' }), barrels.length)
    const top = new InstancedMesh(new CylinderGeometry(1.25, 1.25, 0.2, 12).translate(0, 3.65, 0), new MeshBasicMaterial({ color: '#8dff4a' }), barrels.length)
    barrels.forEach((p, i) => {
      dummy.position.set(p.pos[0], p.pos[1], p.pos[2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
      top.setMatrixAt(i, dummy.matrix)
    })
    group.add(body, top)
  }

  return { group, update: (t) => updaters.forEach((u) => u(t)) }
}

/* ------------------------------------------------------------------------ */
/* Beacons: light columns marking far landings                              */
/* ------------------------------------------------------------------------ */

export function createBeacons(beacons) {
  if (!beacons.length) return null
  const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide })
  const mesh = new InstancedMesh(new CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0), mat, beacons.length)
  const shown = new Array(beacons.length).fill(null)
  const place = (i, visible) => {
    const b = beacons[i]
    dummy.position.set(b.pos[0], b.pos[1], b.pos[2])
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(visible ? 5 : 0, visible ? b.height : 0, visible ? 5 : 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    shown[i] = visible
  }
  beacons.forEach((b, i) => {
    place(i, true)
    mesh.setColorAt(i, new Color(b.color))
  })
  mesh.frustumCulled = false
  return {
    mesh,
    /** Beacons mark *far* landings; hide the one you're standing next to. */
    update(t, focus) {
      mat.opacity = 0.13 + Math.sin(t * 2) * 0.04
      if (!focus) return
      let dirty = false
      beacons.forEach((b, i) => {
        const visible = Math.hypot(b.pos[0] - focus.x, b.pos[2] - focus.z) > 90
        if (visible !== shown[i]) {
          place(i, visible)
          dirty = true
        }
      })
      if (dirty) mesh.instanceMatrix.needsUpdate = true
    },
  }
}

/* ------------------------------------------------------------------------ */
/* Unique props                                                              */
/* ------------------------------------------------------------------------ */

function spawnStarTexture() {
  const c = makeCanvas(512, 512)
  const ctx = c.getContext('2d')
  ctx.translate(256, 256)
  ctx.fillStyle = 'rgba(40, 30, 110, 0.45)'
  for (const [spikes, outer, inner, rot] of [[12, 250, 120, 0], [8, 170, 90, 0.2]]) {
    ctx.beginPath()
    for (let i = 0; i < spikes * 2; i += 1) {
      const r = i % 2 ? inner : outer
      const a = (i * Math.PI) / spikes + rot
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }
  return toTexture(c)
}

function arrowTexture() {
  const c = makeCanvas(128, 128)
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.moveTo(64, 8)
  ctx.lineTo(120, 70)
  ctx.lineTo(84, 70)
  ctx.lineTo(84, 120)
  ctx.lineTo(44, 120)
  ctx.lineTo(44, 70)
  ctx.lineTo(8, 70)
  ctx.closePath()
  ctx.fill()
  return toTexture(c)
}

function crateWindowTexture() {
  const c = makeCanvas(256, 96)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#2a2140'
  ctx.fillRect(0, 0, 256, 96)
  const colors = ['#22d3ff', '#ff3bd4', '#ff3b3b', '#ffd43b', '#ff8a3b']
  colors.forEach((col, i) => {
    ctx.fillStyle = col
    ctx.beginPath()
    const x = 26 + i * 50
    if (i % 2) {
      ctx.moveTo(x - 18, 30)
      ctx.lineTo(x + 18, 30)
      ctx.lineTo(x, 66)
    } else {
      ctx.moveTo(x, 30)
      ctx.lineTo(x + 18, 66)
      ctx.lineTo(x - 18, 66)
    }
    ctx.fill()
  })
  return toTexture(c)
}

const sharedTex = {}
const lazyTex = (key, fn) => (sharedTex[key] ||= fn())

/**
 * Builds a unique prop. Returns { object, update?, onBoards?, onStock?, onProfile? }.
 */
export function createProp(prop) {
  const root = new Group()
  root.position.set(prop.pos[0], prop.pos[1], prop.pos[2])
  root.rotation.y = prop.ry || 0
  const out = { object: root }

  switch (prop.kind) {
    case 'floorArrow': {
      const m = new Mesh(new PlaneGeometry(prop.scale, prop.scale), new MeshBasicMaterial({ map: lazyTex('arrow', arrowTexture), transparent: true, depthWrite: false, opacity: 0.6 }))
      m.rotation.x = -Math.PI / 2
      root.add(m)
      out.update = (t) => (m.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3 - prop.pos[2] * 0.08)))
      break
    }
    case 'spawnStar': {
      const m = new Mesh(new PlaneGeometry(prop.scale, prop.scale), new MeshBasicMaterial({ map: lazyTex('star', spawnStarTexture), transparent: true, depthWrite: false }))
      m.rotation.x = -Math.PI / 2
      root.add(m)
      out.update = (t) => (m.rotation.z = t * 0.05)
      break
    }
    case 'board': {
      const frame = new Mesh(new BoxGeometry(prop.w + 1.6, prop.h + 1.6, 1), new MeshLambertMaterial({ color: '#141836' }))
      frame.position.y = 3 + prop.h / 2
      const c = makeCanvas(512, Math.round((512 * prop.h) / prop.w))
      const tex = toTexture(c)
      const face = new Mesh(new PlaneGeometry(prop.w, prop.h), new MeshBasicMaterial({ map: tex }))
      face.position.set(0, 3 + prop.h / 2, 0.52)
      for (const x of [-prop.w / 2 + 2, prop.w / 2 - 2]) {
        const post = new Mesh(new BoxGeometry(1.2, 3, 1.2), new MeshLambertMaterial({ color: '#1e4f9c' }))
        post.position.set(x, 1.5, 0)
        root.add(post)
      }
      root.add(frame, face)
      drawBoard(c, prop.board, [])
      out.onBoards = (boards) => {
        drawBoard(c, prop.board, boards?.[prop.board] || [])
        tex.needsUpdate = true
      }
      break
    }
    case 'crateMachine': {
      const pad = new Mesh(new BoxGeometry(16, 0.4, 12), new MeshBasicMaterial({ color: '#ffb347' }))
      pad.position.y = 0.2
      const white = new MeshLambertMaterial({ map: getSurfaceTexture('tile'), color: '#f3e8f0' })
      const pink = new MeshLambertMaterial({ map: getSurfaceTexture('tile'), color: '#d8a6bd' })
      const parts = [
        [new BoxGeometry(12, 1.6, 4), white, 0, 1.2, 0],
        [new BoxGeometry(12, 1.6, 4), white, 0, 8.2, 0],
        [new BoxGeometry(1.8, 7, 4.2), pink, -5.6, 4.7, 0],
        [new BoxGeometry(1.8, 7, 4.2), pink, 5.6, 4.7, 0],
      ]
      for (const [geo, mat, x, y, z] of parts) {
        const m = new Mesh(geo, mat)
        m.position.set(x, y, z)
        m.castShadow = true
        root.add(m)
      }
      const window = new Mesh(new PlaneGeometry(9.4, 5.4), new MeshBasicMaterial({ map: lazyTex('crateWin', crateWindowTexture) }))
      window.position.set(0, 4.7, 1.6)
      const back = new Mesh(new BoxGeometry(9.4, 5.4, 0.4), new MeshLambertMaterial({ color: '#1b1530' }))
      back.position.set(0, 4.7, -1)
      root.add(pad, window, back)
      const label = new LabelSprite(12, 2.2)
      label.set([{ text: 'Crates', icon: 'coin' }, { text: 'Skins x1.1 - x5 steps', size: 0.6, color: '#ffe36b' }])
      label.sprite.position.set(0, 12, 0)
      root.add(label.sprite)
      out.update = (t) => (pad.material.color.setHSL(0.09, 1, 0.6 + Math.sin(t * 3) * 0.08))
      break
    }
    case 'skinDisplay': {
      const skin = SKIN_BY_ID[prop.skin]
      const ring = new Mesh(new TorusGeometry(5, 0.35, 8, 40), new MeshBasicMaterial({ color: '#ffe14d' }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.4
      const disc = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.18, depthWrite: false }))
      disc.rotation.x = -Math.PI / 2
      disc.position.y = 0.3
      const pack = createJetpack('jp1', prop.skin, { shadow: false })
      pack.scale.setScalar(2.2)
      pack.position.y = 6
      root.add(ring, disc, pack)
      const label = new LabelSprite(13, 1.6)
      label.sprite.position.set(0, 14, 0)
      root.add(label.sprite)
      const draw = (stock) =>
        label.set([
          { text: prop.tag, color: '#ff5ce1', size: 0.7 },
          { text: skin.name, color: '#ffe14d' },
          { text: prop.limited ? `${stock}/${skin.limited} left` : prop.sub || `x${skin.mult} steps`, size: 0.7 },
        ])
      draw(skin.limited || 0)
      out.onStock = draw
      out.update = (t) => {
        pack.rotation.y = t * 0.9
        pack.position.y = 6 + Math.sin(t * 2) * 0.5
        pack.userData.setThrust(1, t)
      }
      break
    }
    case 'chest': {
      const gold = new MeshStandardMaterial({ color: '#f2b51d', metalness: 0.5, roughness: 0.35 })
      const wood = new MeshStandardMaterial({ map: getSurfaceTexture('plank'), color: '#b8742e', roughness: 0.8 })
      const base = new Mesh(new BoxGeometry(8, 4, 5), wood)
      base.position.y = 2.6
      const lid = new Mesh(new BoxGeometry(8.2, 1.8, 5.2), wood)
      lid.position.set(0, 5.5, 0)
      const bands = [-2.6, 2.6].map((x) => {
        const b = new Mesh(new BoxGeometry(0.6, 6.4, 5.4), gold)
        b.position.set(x, 3.4, 0)
        return b
      })
      const glow = new Mesh(new BoxGeometry(12, 0.3, 9), new MeshBasicMaterial({ color: '#ffcf3d' }))
      glow.position.y = 0.15
      root.add(base, lid, glow, ...bands)
      const label = new LabelSprite(12, 1.8)
      label.sprite.position.set(0, 11.5, 0)
      root.add(label.sprite)
      out.onProfile = (profile, now) => {
        const wait = profile ? profile.chestAt + 20 * 60 * 1000 - now : 0
        if (wait > 0) {
          const m = Math.floor(wait / 60000)
          const s = Math.floor((wait % 60000) / 1000)
          label.set([{ text: 'Free Chest', size: 0.8 }, { text: `${m}:${String(s).padStart(2, '0')}`, color: '#bfc8ff' }])
          lid.rotation.x = 0
        } else {
          label.set([{ text: 'FREE CHEST!', color: '#ffe36b' }, { text: 'Steps + Coins', size: 0.75 }])
        }
      }
      out.update = (t) => {
        glow.material.color.setHSL(0.12, 1, 0.55 + Math.sin(t * 4) * 0.1)
      }
      break
    }
    case 'lamp': {
      const m = new Mesh(new BoxGeometry(5, 3.5, 5), new MeshBasicMaterial({ color: '#fff6a8' }))
      m.position.y = 1.5
      root.add(m)
      break
    }
    case 'portal': {
      const ring = new Mesh(new TorusGeometry(10, 1.2, 12, 48), new MeshBasicMaterial({ color: '#ffd23f' }))
      ring.position.y = 12
      const inner = new Mesh(new PlaneGeometry(19, 19), new MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false }))
      inner.position.y = 12
      root.add(ring, inner)
      const label = new LabelSprite(16, 3)
      label.set([{ text: 'Return to Lobby', color: '#ffe36b' }])
      label.sprite.position.y = 26
      root.add(label.sprite)
      out.update = (t) => {
        ring.rotation.z = t * 0.6
        inner.material.opacity = 0.4 + Math.sin(t * 3) * 0.15
      }
      break
    }
    case 'finishArch': {
      const mat = new MeshLambertMaterial({ color: '#1e4f9c' })
      for (const x of [-prop.w / 2 + 2, prop.w / 2 - 2]) {
        const p = new Mesh(new BoxGeometry(4, 30, 4), mat)
        p.position.set(x, 15, 0)
        root.add(p)
      }
      const beam = new Mesh(new BoxGeometry(prop.w, 6, 3), new MeshLambertMaterial({ map: getSurfaceTexture('checker') }))
      beam.position.y = 30
      root.add(beam)
      break
    }
    case 'conveyorArrows': {
      const mat = new MeshBasicMaterial({ map: lazyTex('arrow', arrowTexture), transparent: true, depthWrite: false, opacity: 0.55 })
      const n = Math.max(2, Math.floor(prop.len / 30))
      const size = Math.min(prop.w * 0.5, 14)
      for (let i = 0; i < n; i += 1) {
        const m = new Mesh(new PlaneGeometry(size, size), mat)
        m.rotation.set(-Math.PI / 2, 0, prop.dir > 0 ? -Math.PI / 2 : Math.PI / 2)
        m.position.set(0, 0.06, -prop.len / 2 + ((i + 0.5) * prop.len) / n)
        root.add(m)
      }
      break
    }
    case 'bounceRing': {
      const ring = new Mesh(new TorusGeometry(4, 0.4, 8, 32), new MeshBasicMaterial({ color: '#3dff8a' }))
      ring.rotation.x = Math.PI / 2
      root.add(ring)
      out.update = (t) => {
        const s = 1 + ((t * 1.5) % 1) * 0.6
        ring.scale.setScalar(s)
        ring.position.y = ((t * 1.5) % 1) * 3
      }
      break
    }
    case 'tesla': {
      const pylon = new Mesh(new CylinderGeometry(0.8, 1.4, 10, 8), new MeshLambertMaterial({ color: '#3a4466' }))
      pylon.position.y = 5
      const orb = new Mesh(new SphereGeometry(1.8, 12, 10), new MeshBasicMaterial({ color: '#b9a4ff' }))
      orb.position.y = 11
      root.add(pylon, orb)
      out.update = (t) => orb.material.color.setHSL(0.72, 1, 0.65 + Math.sin(t * 23 + prop.pos[2]) * 0.15)
      break
    }
    default:
      return null
  }
  root.traverse((o) => {
    if (o.isMesh && !o.material.transparent) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return out
}
