import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'

import { TRAIL_BY_ID } from '../../../shared/config.js'
import { drawLabel, makeCanvas } from './canvasArt.js'
import { SPRITE, getSpriteAtlas } from './textures.js'

/* ------------------------------------------------------------------------ */
/* Particles                                                                 */
/* ------------------------------------------------------------------------ */

const VERT = /* glsl */ `
attribute float alpha;
attribute float size;
attribute float frame;
attribute vec3 color;
uniform float scale;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vCell;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vAlpha = alpha;
  vColor = color;
  vCell = vec2(mod(frame, 4.0), floor(frame / 4.0));
}`

const FRAG = /* glsl */ `
uniform sampler2D atlas;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vCell;
void main() {
  vec2 uv = vec2((vCell.x + gl_PointCoord.x) / 4.0, 1.0 - (vCell.y + gl_PointCoord.y) / 4.0);
  vec4 tex = texture2D(atlas, uv);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`

class ParticleSystem {
  constructor(max, blending) {
    this.max = max
    this.next = 0
    this.alive = new Uint8Array(max)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.vel = new Float32Array(max * 3)
    this.gravity = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.size0 = new Float32Array(max)
    this.size1 = new Float32Array(max)
    this.alpha0 = new Float32Array(max)
    const g = new BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.alpha = new Float32Array(max)
    this.size = new Float32Array(max)
    this.frame = new Float32Array(max)
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('color', new BufferAttribute(this.col, 3))
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    g.setAttribute('size', new BufferAttribute(this.size, 1))
    g.setAttribute('frame', new BufferAttribute(this.frame, 1))
    this.material = new ShaderMaterial({
      uniforms: { atlas: { value: getSpriteAtlas() }, scale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    })
    this.points = new Points(g, this.material)
    this.points.frustumCulled = false
    this.geometry = g
  }

  spawn(o) {
    const i = this.next
    this.next = (this.next + 1) % this.max
    this.alive[i] = 1
    this.life[i] = 0
    this.maxLife[i] = o.life ?? 1
    this.pos[i * 3] = o.x
    this.pos[i * 3 + 1] = o.y
    this.pos[i * 3 + 2] = o.z
    this.vel[i * 3] = o.vx ?? 0
    this.vel[i * 3 + 1] = o.vy ?? 0
    this.vel[i * 3 + 2] = o.vz ?? 0
    const c = o.color
    this.col[i * 3] = c.r
    this.col[i * 3 + 1] = c.g
    this.col[i * 3 + 2] = c.b
    this.gravity[i] = o.gravity ?? 0
    this.drag[i] = o.drag ?? 0
    this.size0[i] = o.size ?? 1
    this.size1[i] = o.endSize ?? (o.size ?? 1) * 0.2
    this.alpha0[i] = o.alpha ?? 1
    this.frame[i] = o.frame ?? SPRITE.circle
  }

  update(dt, scale) {
    this.material.uniforms.scale.value = scale
    for (let i = 0; i < this.max; i += 1) {
      if (!this.alive[i]) continue
      this.life[i] += dt
      const t = this.life[i] / this.maxLife[i]
      if (t >= 1) {
        this.alive[i] = 0
        this.alpha[i] = 0
        this.size[i] = 0
        continue
      }
      const d = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= d
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.gravity[i] * dt
      this.vel[i * 3 + 2] *= d
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t
      this.alpha[i] = this.alpha0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9)
    }
    for (const name of ['position', 'color', 'alpha', 'size', 'frame']) this.geometry.attributes[name].needsUpdate = true
  }
}

/* ------------------------------------------------------------------------ */
/* Chevron trail (instanced)                                                 */
/* ------------------------------------------------------------------------ */

function chevronGeometry() {
  const s = new Shape()
  s.moveTo(0, 1)
  s.lineTo(1, -0.45)
  s.lineTo(0.55, -0.45)
  s.lineTo(0, 0.35)
  s.lineTo(-0.55, -0.45)
  s.lineTo(-1, -0.45)
  s.closePath()
  // Shape is in XY pointing +Y; lay it in XZ pointing +Z.
  return new ShapeGeometry(s).rotateX(Math.PI / 2)
}

class ChevronPool {
  constructor(max = 900) {
    this.max = max
    this.mesh = new InstancedMesh(chevronGeometry(), new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }), max)
    this.mesh.frustumCulled = false
    this.items = Array.from({ length: max }, () => ({ alive: false, life: 0, maxLife: 0.8, m: new Matrix4(), scale: 1 }))
    this.next = 0
    this.tmp = new Matrix4()
    this.zero = new Matrix4().makeScale(0, 0, 0)
    const white = new Color('#ffffff')
    for (let i = 0; i < max; i += 1) {
      this.mesh.setMatrixAt(i, this.zero)
      this.mesh.setColorAt(i, white)
    }
  }

  spawn(pos, dir, size, color, life = 0.8) {
    const i = this.next
    this.next = (this.next + 1) % this.max
    const item = this.items[i]
    const fwd = _a.copy(dir).normalize()
    const up = Math.abs(fwd.y) > 0.95 ? _x.set(1, 0, 0) : _y.set(0, 1, 0)
    const right = _b.crossVectors(fwd, up).normalize()
    const normal = _c.crossVectors(right, fwd).normalize()
    item.m.makeBasis(right, normal, fwd).setPosition(pos)
    item.alive = true
    item.life = 0
    item.maxLife = life
    item.scale = size
    this.mesh.setColorAt(i, color)
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      const it = this.items[i]
      if (!it.alive) continue
      it.life += dt
      const t = it.life / it.maxLife
      if (t >= 1) {
        it.alive = false
        this.mesh.setMatrixAt(i, this.zero)
        continue
      }
      const s = it.scale * (1 - t * t)
      this.tmp.makeScale(s, s, s).premultiply(it.m)
      this.mesh.setMatrixAt(i, this.tmp)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _x = new Vector3()
const _y = new Vector3()
const _v = new Vector3()

/* ------------------------------------------------------------------------ */
/* Floating popups ("+1 steps", "+20 Wins", "LEVEL UP!")                    */
/* ------------------------------------------------------------------------ */

class Popup {
  constructor() {
    this.canvas = makeCanvas(512, 160)
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }))
    this.sprite.renderOrder = 10
    this.sprite.visible = false
    this.life = 0
    this.maxLife = 1
    this.vel = new Vector3()
    this.size = 4
  }
}

/* ------------------------------------------------------------------------ */
/* Effects manager                                                           */
/* ------------------------------------------------------------------------ */

const COLORS = {}
const col = (hex) => (COLORS[hex] ||= new Color(hex))

export class Effects {
  constructor() {
    this.group = new Group()
    this.group.name = 'effects'
    this.add = new ParticleSystem(2600, AdditiveBlending)
    this.norm = new ParticleSystem(1400, NormalBlending)
    this.chevrons = new ChevronPool()
    this.popups = Array.from({ length: 24 }, () => new Popup())
    this.popupNext = 0
    this.rings = []
    this.group.add(this.add.points, this.norm.points, this.chevrons.mesh)
    for (const p of this.popups) this.group.add(p.sprite)
    /** sessionId -> { last: Vector3, hue, acc } */
    this.trails = new Map()
  }

  /* ---- bursts ---------------------------------------------------------- */

  burst(kind, x, y, z, opts = {}) {
    const rand = Math.random
    if (kind === 'levelUp') {
      for (let i = 0; i < 70; i += 1) {
        const a = rand() * Math.PI * 2
        const r = 2 + rand() * 3
        this.add.spawn({ x: x + Math.cos(a) * r, y: y + rand() * 2, z: z + Math.sin(a) * r, vx: Math.cos(a) * 3, vy: 8 + rand() * 14, vz: Math.sin(a) * 3, life: 1.2 + rand() * 0.6, size: 1.4, endSize: 0.2, color: col(rand() < 0.5 ? '#6ff3ff' : '#ffffff'), frame: rand() < 0.5 ? SPRITE.star : SPRITE.spark, drag: 1.2 })
      }
      this.ring(x, y + 0.3, z, '#5ff0ff', 14)
      this.ring(x, y + 0.3, z, '#ffffff', 9, 0.15)
    } else if (kind === 'trophy' || kind === 'confetti') {
      const palette = ['#ff4f7a', '#ffd23f', '#4fe3ff', '#7dff6b', '#c38bff', '#ffffff']
      for (let i = 0; i < 120; i += 1) {
        const a = rand() * Math.PI * 2
        this.norm.spawn({ x, y: y + 2, z, vx: Math.cos(a) * (6 + rand() * 18), vy: 18 + rand() * 26, vz: Math.sin(a) * (6 + rand() * 18), life: 2 + rand(), size: 1.1, endSize: 0.9, color: col(palette[i % palette.length]), frame: SPRITE.confetti, gravity: 30, drag: 1.5 })
      }
      this.ring(x, y + 0.3, z, '#ffd23f', 16)
    } else if (kind === 'coin') {
      for (let i = 0; i < 16; i += 1) {
        const a = rand() * Math.PI * 2
        this.add.spawn({ x, y, z, vx: Math.cos(a) * 8, vy: 3 + rand() * 9, vz: Math.sin(a) * 8, life: 0.55, size: 1.1, endSize: 0.1, color: col(rand() < 0.6 ? '#ffd23f' : '#fff6c2'), frame: rand() < 0.5 ? SPRITE.star : SPRITE.spark, drag: 3 })
      }
    } else if (kind === 'quest' || kind === 'buy') {
      const palette = kind === 'quest' ? ['#7dff6b', '#ffffff', '#ffd23f'] : ['#4fe3ff', '#ffffff', '#c38bff']
      for (let i = 0; i < 60; i += 1) {
        const a = rand() * Math.PI * 2
        this.add.spawn({ x: x + Math.cos(a) * 2, y: y + 1 + rand() * 3, z: z + Math.sin(a) * 2, vx: Math.cos(a) * 4, vy: 6 + rand() * 10, vz: Math.sin(a) * 4, life: 1 + rand() * 0.5, size: 1.3, endSize: 0.2, color: col(palette[i % palette.length]), frame: rand() < 0.5 ? SPRITE.star : SPRITE.spark, drag: 1.4 })
      }
      this.ring(x, y + 0.3, z, palette[0], 11)
    } else if (kind === 'pumpkin') {
      for (let i = 0; i < 40; i += 1) {
        const a = rand() * Math.PI * 2
        this.add.spawn({ x, y: y + 2, z, vx: Math.cos(a) * 10, vy: 6 + rand() * 12, vz: Math.sin(a) * 10, life: 0.9, size: 1.5, color: col(rand() < 0.6 ? '#ff8a1a' : '#ffd23f'), frame: SPRITE.spark, drag: 2, gravity: 10 })
      }
    } else if (kind === 'death') {
      const colors = opts.colors || ['#ffcf9a', '#2f80ed', '#1b2433', '#e0721f']
      for (let i = 0; i < 26; i += 1) {
        const a = rand() * Math.PI * 2
        this.norm.spawn({ x, y: y + 1 + rand() * 4, z, vx: Math.cos(a) * (6 + rand() * 10), vy: 10 + rand() * 18, vz: Math.sin(a) * (6 + rand() * 10), life: 1.4, size: 1.6, endSize: 1.2, color: col(colors[i % colors.length]), frame: SPRITE.square, gravity: 60, drag: 0.5 })
      }
      for (let i = 0; i < 16; i += 1) {
        this.norm.spawn({ x: x + (rand() - 0.5) * 3, y: y + rand() * 4, z: z + (rand() - 0.5) * 3, vy: 2 + rand() * 3, life: 1.2, size: 3, endSize: 6, alpha: 0.5, color: col('#e8e6f5'), frame: SPRITE.smoke })
      }
    } else if (kind === 'land') {
      const n = Math.min(24, 6 + Math.floor((opts.impact || 0) / 8))
      for (let i = 0; i < n; i += 1) {
        const a = rand() * Math.PI * 2
        this.norm.spawn({ x: x + Math.cos(a), y: y + 0.3, z: z + Math.sin(a), vx: Math.cos(a) * 7, vy: 1 + rand() * 2, vz: Math.sin(a) * 7, life: 0.6, size: 1.6, endSize: 3, alpha: 0.45, color: col('#e9e6ff'), frame: SPRITE.smoke, drag: 3 })
      }
    } else if (kind === 'spawn') {
      this.ring(x, y + 0.3, z, '#ffffff', 8)
      for (let i = 0; i < 30; i += 1) {
        const a = rand() * Math.PI * 2
        this.add.spawn({ x: x + Math.cos(a) * 1.5, y: y + rand() * 5, z: z + Math.sin(a) * 1.5, vy: 4 + rand() * 6, life: 0.9, size: 1, color: col('#bfefff'), frame: SPRITE.spark })
      }
    } else if (kind === 'rebirth') {
      for (let i = 0; i < 140; i += 1) {
        const a = rand() * Math.PI * 2
        const r = rand() * 6
        this.add.spawn({ x: x + Math.cos(a) * r, y: y + rand() * 2, z: z + Math.sin(a) * r, vy: 12 + rand() * 24, life: 1.6 + rand(), size: 1.6, color: col(rand() < 0.5 ? '#ff5ce1' : '#ffffff'), frame: rand() < 0.4 ? SPRITE.star : SPRITE.spark, drag: 0.8 })
      }
      this.ring(x, y + 0.3, z, '#ff5ce1', 20)
      this.ring(x, y + 0.3, z, '#ffffff', 12, 0.2)
    }
  }

  ring(x, y, z, color, radius, delay = 0) {
    const mesh = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(0.01)
    this.group.add(mesh)
    this.rings.push({ mesh, t: -delay, radius })
  }

  /** Twinkle left behind by a spinning flyer. */
  sparkle(x, y, z) {
    const r = Math.random
    this.add.spawn({ x, y, z, vx: (r() - 0.5) * 3, vy: (r() - 0.5) * 3, vz: (r() - 0.5) * 3, life: 0.55, size: 1.3, endSize: 0.1, color: col(r() < 0.5 ? '#ffffff' : '#8fe8ff'), frame: r() < 0.5 ? SPRITE.star : SPRITE.spark, drag: 2 })
  }

  /** Jetpack exhaust from a world-space nozzle point. */
  exhaust(x, y, z, flameColor, dx = 0, dy = -1, dz = 0) {
    const r = Math.random
    const v = 14 + r() * 6
    this.add.spawn({ x: x + (r() - 0.5) * 0.4, y, z: z + (r() - 0.5) * 0.4, vx: dx * v + (r() - 0.5) * 2, vy: dy * v, vz: dz * v + (r() - 0.5) * 2, life: 0.25, size: 1.3, endSize: 0.3, color: col(flameColor), frame: SPRITE.flame })
    if (r() < 0.35) this.norm.spawn({ x: x + dx, y: y + dy, z: z + dz, vx: dx * 6 + (r() - 0.5) * 3, vy: dy * 6, vz: dz * 6 + (r() - 0.5) * 3, life: 0.8, size: 1.2, endSize: 3.5, alpha: 0.3, color: col('#d9d6ea'), frame: SPRITE.smoke, drag: 2 })
  }

  /**
   * Exhaust for a flyer at feet position (x, y, z) facing `yaw`, leaning
   * forward by `pitch`: the nozzles sit on the back and swing with the dive.
   */
  jetpackExhaust(x, y, z, yaw, pitch, flameColor) {
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    // Nozzle relative to the hips (2.6 up) in character space, then pitched.
    const ny = -1.0 * cp + 1.05 * sp
    const nz = -1.0 * sp - 1.05 * cp
    for (const side of [-1, 1]) {
      this.exhaust(x + fz * side * 0.55 + fx * nz, y + 2.6 + ny, z - fx * side * 0.55 + fz * nz, flameColor, -fx * sp, -cp, -fz * sp)
    }
  }

  /* ---- popups ------------------------------------------------------------ */

  popup(lines, x, y, z, { size = 4, life = 1.1, rise = 4, spread = 1 } = {}) {
    const p = this.popups[this.popupNext]
    this.popupNext = (this.popupNext + 1) % this.popups.length
    drawLabel(p.canvas, lines)
    p.texture.needsUpdate = true
    p.sprite.visible = true
    p.sprite.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread)
    p.size = size
    p.sprite.scale.set(size * 3.2, size, 1)
    p.life = 0
    p.maxLife = life
    p.vel.set(0, rise, 0)
  }

  /* ---- trails ------------------------------------------------------------ */

  /**
   * Leaves a trail behind a moving player. Call every frame with their
   * current waist position and velocity.
   */
  trail(id, trailId, x, y, z, vx, vy, vz, dt) {
    let st = this.trails.get(id)
    const speed = Math.hypot(vx, vy, vz)
    if (!st) {
      st = { last: new Vector3(x, y, z), hue: Math.random(), acc: 0 }
      this.trails.set(id, st)
    }
    const trail = TRAIL_BY_ID[trailId] || TRAIL_BY_ID.arrows
    _v.set(x, y, z)
    const moved = _v.distanceTo(st.last)
    if (moved > 60) {
      st.last.copy(_v) // teleported
      return
    }
    if (speed < 3) {
      st.last.copy(_v)
      return
    }
    const spacing = Math.min(9, Math.max(2.4, speed * 0.05))
    st.acc += moved
    st.last.copy(_v)
    if (st.acc < spacing) return
    st.acc = 0
    st.hue = (st.hue + dt * 0.6 + 0.04) % 1
    const back = 1.6 / Math.max(speed, 0.001)
    const px = x - vx * back
    const py = y - vy * back
    const pz = z - vz * back
    const r = Math.random
    switch (trail.kind) {
      case 'chevron':
      case 'ribbon': {
        const color = trail.kind === 'ribbon' ? _rainbow.setHSL(st.hue, 1, 0.6) : col(trail.color)
        _dir.set(vx, vy, vz)
        this.chevrons.spawn(_pos.set(px, py - 1.2, pz), _dir, 1.5 + Math.min(2.5, speed * 0.012), color, 0.75)
        break
      }
      case 'sparkle':
        for (let i = 0; i < 3; i += 1) this.add.spawn({ x: px + (r() - 0.5) * 2, y: py + (r() - 0.5) * 3, z: pz + (r() - 0.5) * 2, vy: 1, life: 0.9, size: 1.3, color: col(trail.color), frame: SPRITE.spark })
        break
      case 'heart':
        this.norm.spawn({ x: px, y: py + (r() - 0.5) * 2, z: pz, vy: 2.5, life: 1.1, size: 1.6, endSize: 0.6, color: col(trail.color), frame: SPRITE.heart })
        break
      case 'flame':
        for (let i = 0; i < 3; i += 1) this.add.spawn({ x: px + (r() - 0.5) * 1.5, y: py - 1 + r(), z: pz + (r() - 0.5) * 1.5, vy: 5 + r() * 4, life: 0.6, size: 2, endSize: 0.4, color: col(i ? '#ff7a1a' : '#ffd23f'), frame: SPRITE.flame })
        break
      case 'ghost':
        this.norm.spawn({ x: px, y: py, z: pz, vy: 2, life: 1.3, size: 2, endSize: 1.2, alpha: 0.85, color: col(trail.color), frame: SPRITE.ghost })
        break
      case 'bolt':
        this.add.spawn({ x: px + (r() - 0.5) * 2, y: py + (r() - 0.5) * 2, z: pz, life: 0.35, size: 2.6, endSize: 2, color: col(trail.color), frame: SPRITE.bolt })
        break
      case 'star':
        for (let i = 0; i < 2; i += 1) this.add.spawn({ x: px + (r() - 0.5) * 3, y: py + (r() - 0.5) * 3, z: pz + (r() - 0.5) * 3, life: 1.2, size: 1.4, endSize: 0.2, color: _rainbow.setHSL(0.65 + r() * 0.2, 1, 0.7), frame: SPRITE.star })
        break
      default:
        break
    }
  }

  forgetTrail(id) {
    this.trails.delete(id)
  }

  /* ---- frame ------------------------------------------------------------- */

  update(dt, camera, viewportHeight) {
    const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))
    this.add.update(dt, scale)
    this.norm.update(dt, scale)
    this.chevrons.update(dt)
    for (const p of this.popups) {
      if (!p.sprite.visible) continue
      p.life += dt
      const t = p.life / p.maxLife
      if (t >= 1) {
        p.sprite.visible = false
        continue
      }
      p.sprite.position.addScaledVector(p.vel, dt)
      p.vel.multiplyScalar(Math.exp(-2.5 * dt))
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.25 ? 1.1 - ((t - 0.15) / 0.1) * 0.1 : 1
      p.sprite.scale.set(p.size * 3.2 * pop, p.size * pop, 1)
      p.sprite.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
    }
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i]
      r.t += dt
      if (r.t < 0) continue
      const t = r.t / 0.7
      if (t >= 1) {
        this.group.remove(r.mesh)
        r.mesh.geometry.dispose()
        r.mesh.material.dispose()
        this.rings.splice(i, 1)
        continue
      }
      r.mesh.scale.setScalar(0.5 + r.radius * (1 - (1 - t) ** 3))
      r.mesh.material.opacity = 1 - t
    }
  }
}

const _rainbow = new Color()
const _dir = new Vector3()
const _pos = new Vector3()
