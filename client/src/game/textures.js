import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'

import { mulberry32 } from '../../../shared/rng.js'

/**
 * Procedural surface textures, drawn once on canvases.
 *
 * Surface patterns are near-white so the per-vertex colour of each box tints
 * them (one texture serves every colour). Hazard surfaces are pre-coloured.
 */

const SIZE = 256

function canvas(size = SIZE) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function finish(c, { repeat = true } = {}) {
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

const gray = (v, a = 1) => `rgba(${v},${v},${v},${a})`

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function noise(ctx, size, amount, seed = 1) {
  const rand = mulberry32(seed)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

const painters = {
  /** Roblox-style rounded tile insets (walls, ceilings). */
  tile(ctx, s) {
    ctx.fillStyle = gray(200)
    ctx.fillRect(0, 0, s, s)
    const n = 2
    const cell = s / n
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const x = i * cell + 10
        const y = j * cell + 10
        const w = cell - 20
        const g = ctx.createLinearGradient(x, y, x + w, y + w)
        g.addColorStop(0, gray(255))
        g.addColorStop(1, gray(222))
        roundRect(ctx, x, y, w, w, 16)
        ctx.fillStyle = g
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = gray(178)
        ctx.stroke()
        roundRect(ctx, x + 6, y + 6, w - 12, w - 12, 12)
        ctx.strokeStyle = gray(255, 0.6)
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
    noise(ctx, s, 6, 2)
  },
  /** LEGO studs (platform tops). */
  studs(ctx, s) {
    ctx.fillStyle = gray(225)
    ctx.fillRect(0, 0, s, s)
    const n = 4
    const cell = s / n
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const cx = i * cell + cell / 2
        const cy = j * cell + cell / 2
        const r = cell * 0.3
        ctx.beginPath()
        ctx.arc(cx + 3, cy + 4, r, 0, Math.PI * 2)
        ctx.fillStyle = gray(160, 0.8)
        ctx.fill()
        const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 1, cx, cy, r)
        g.addColorStop(0, gray(255))
        g.addColorStop(1, gray(215))
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      }
    }
    ctx.strokeStyle = gray(190)
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, s - 2, s - 2)
  },
  /** Criss-cross diamond plate (lobby floor). */
  diamond(ctx, s) {
    ctx.fillStyle = gray(246)
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = gray(212)
    ctx.lineWidth = 5
    for (let k = -s; k <= s * 2; k += s / 2) {
      ctx.beginPath()
      ctx.moveTo(k, 0)
      ctx.lineTo(k + s, s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(k, s)
      ctx.lineTo(k + s, 0)
      ctx.stroke()
    }
    ctx.strokeStyle = gray(232)
    ctx.lineWidth = 3
    ctx.strokeRect(1.5, 1.5, s - 3, s - 3)
    noise(ctx, s, 5, 3)
  },
  /** Pink stone with dots (platform sides). */
  dots(ctx, s) {
    ctx.fillStyle = gray(238)
    ctx.fillRect(0, 0, s, s)
    const n = 8
    const cell = s / n
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        ctx.beginPath()
        ctx.arc(i * cell + cell / 2, j * cell + cell / 2, cell * 0.16, 0, Math.PI * 2)
        ctx.fillStyle = gray(196)
        ctx.fill()
      }
    }
    noise(ctx, s, 8, 4)
  },
  plank(ctx, s) {
    const rand = mulberry32(5)
    const rows = 4
    const h = s / rows
    for (let r = 0; r < rows; r += 1) {
      const v = 205 + Math.floor(rand() * 40)
      ctx.fillStyle = gray(v)
      ctx.fillRect(0, r * h, s, h)
      ctx.strokeStyle = gray(v - 30, 0.5)
      ctx.lineWidth = 2
      for (let g = 0; g < 5; g += 1) {
        const y = r * h + 6 + rand() * (h - 12)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(s * 0.3, y + rand() * 6 - 3, s * 0.6, y + rand() * 6 - 3, s, y)
        ctx.stroke()
      }
      ctx.fillStyle = gray(120)
      ctx.fillRect(0, r * h, s, 3)
      const seam = rand() * s
      ctx.fillRect(seam, r * h, 3, h)
    }
  },
  metal(ctx, s) {
    ctx.fillStyle = gray(210)
    ctx.fillRect(0, 0, s, s)
    const g = ctx.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, gray(240, 0.5))
    g.addColorStop(1, gray(170, 0.5))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = gray(150)
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, s / 2 - 4, s - 4)
    ctx.strokeRect(s / 2 + 2, 2, s / 2 - 4, s - 4)
    ctx.fillStyle = gray(140)
    for (const [x, y] of [[14, 14], [s / 2 - 14, 14], [14, s - 14], [s / 2 - 14, s - 14], [s / 2 + 14, 14], [s - 14, 14], [s / 2 + 14, s - 14], [s - 14, s - 14]]) {
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    noise(ctx, s, 10, 6)
  },
  ice(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, gray(255))
    g.addColorStop(1, gray(225))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    const rand = mulberry32(7)
    ctx.strokeStyle = gray(255, 0.9)
    ctx.lineWidth = 2
    for (let i = 0; i < 9; i += 1) {
      let x = rand() * s
      let y = rand() * s
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let k = 0; k < 4; k += 1) {
        x += (rand() - 0.5) * 70
        y += (rand() - 0.5) * 70
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  },
  crystal(ctx, s) {
    const rand = mulberry32(8)
    ctx.fillStyle = gray(220)
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 40; i += 1) {
      ctx.beginPath()
      ctx.moveTo(rand() * s, rand() * s)
      ctx.lineTo(rand() * s, rand() * s)
      ctx.lineTo(rand() * s, rand() * s)
      ctx.closePath()
      ctx.fillStyle = gray(190 + Math.floor(rand() * 65), 0.5)
      ctx.fill()
    }
  },
  grid(ctx, s) {
    ctx.fillStyle = gray(150)
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = gray(255)
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, s - 6, s - 6)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s / 2, 0)
    ctx.lineTo(s / 2, s)
    ctx.moveTo(0, s / 2)
    ctx.lineTo(s, s / 2)
    ctx.stroke()
  },
  brick(ctx, s) {
    ctx.fillStyle = gray(170)
    ctx.fillRect(0, 0, s, s)
    const rows = 6
    const h = s / rows
    const rand = mulberry32(9)
    for (let r = 0; r < rows; r += 1) {
      const off = r % 2 ? s / 4 : 0
      for (let x = -s / 2 + off; x < s; x += s / 2) {
        ctx.fillStyle = gray(215 + Math.floor(rand() * 35))
        ctx.fillRect(x + 3, r * h + 3, s / 2 - 6, h - 6)
      }
    }
    noise(ctx, s, 10, 10)
  },
  smooth(ctx, s) {
    ctx.fillStyle = gray(236)
    ctx.fillRect(0, 0, s, s)
    noise(ctx, s, 10, 11)
  },
  hazard(ctx, s) {
    ctx.fillStyle = gray(255)
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = gray(60)
    for (let k = -s; k < s * 2; k += s / 2) {
      ctx.beginPath()
      ctx.moveTo(k, 0)
      ctx.lineTo(k + s / 4, 0)
      ctx.lineTo(k + s / 4 + s, s)
      ctx.lineTo(k + s, s)
      ctx.closePath()
      ctx.fill()
    }
  },
  checker(ctx, s) {
    const n = 4
    const cell = s / n
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        ctx.fillStyle = (i + j) % 2 ? gray(30) : gray(255)
        ctx.fillRect(i * cell, j * cell, cell, cell)
      }
    }
  },
  belt(ctx, s) {
    ctx.fillStyle = gray(120)
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = gray(80)
    for (let y = 0; y < s; y += s / 8) ctx.fillRect(0, y, s, s / 20)
    ctx.fillStyle = gray(160, 0.6)
    for (let y = s / 16; y < s; y += s / 8) ctx.fillRect(0, y, s, 3)
  },
}

/** Studs of world space covered by one repeat of each pattern. */
export const TEXTURE_SCALE = {
  tile: 8,
  studs: 4,
  diamond: 10,
  dots: 4,
  plank: 8,
  metal: 8,
  ice: 14,
  crystal: 10,
  grid: 8,
  brick: 8,
  smooth: 16,
  hazard: 6,
  checker: 8,
  belt: 4,
}

const cache = new Map()

export function getSurfaceTexture(key) {
  if (!painters[key]) key = 'smooth'
  if (cache.has(key)) return cache.get(key)
  const c = canvas()
  painters[key](c.getContext('2d'), SIZE)
  const tex = finish(c)
  cache.set(key, tex)
  return tex
}

/* ------------------------------------------------------------------------ */
/* Hazard surfaces (pre-coloured, scrolled at runtime)                       */
/* ------------------------------------------------------------------------ */

const HAZARD_PALETTES = {
  lava: ['#ff4d00', '#ffb000', '#ffe36b'],
  acid: ['#1f9e1a', '#6cff3a', '#d8ff9a'],
  water: ['#1a4f9a', '#3f8fe0', '#c8ecff'],
  plasma: ['#3b1aa8', '#9a6bff', '#f0d8ff'],
  gold: ['#c97a00', '#ffc21a', '#fff3b0'],
}

export function getHazardTexture(kind) {
  const key = `hazard:${kind}`
  if (cache.has(key)) return cache.get(key)
  const [dark, mid, light] = HAZARD_PALETTES[kind] || HAZARD_PALETTES.lava
  const c = canvas()
  const ctx = c.getContext('2d')
  ctx.fillStyle = dark
  ctx.fillRect(0, 0, SIZE, SIZE)
  const rand = mulberry32(kind.length * 13)
  // Overlapping soft blobs, drawn wrapped so the texture tiles seamlessly.
  for (let i = 0; i < 70; i += 1) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    const r = 10 + rand() * 38
    const color = rand() < 0.65 ? mid : light
    for (const ox of [-SIZE, 0, SIZE]) {
      for (const oy of [-SIZE, 0, SIZE]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  const tex = finish(c)
  cache.set(key, tex)
  return tex
}

/* ------------------------------------------------------------------------ */
/* Particle sprite atlas: 4x4 cells                                          */
/* ------------------------------------------------------------------------ */

export const SPRITE = { circle: 0, spark: 1, star: 2, heart: 3, ghost: 4, smoke: 5, square: 6, ring: 7, flame: 8, confetti: 9, bolt: 10, pumpkin: 11 }

function starPath(ctx, cx, cy, spikes, outer, inner) {
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 ? inner : outer
    const a = (i * Math.PI) / spikes - Math.PI / 2
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.closePath()
}

export function heartPath(ctx, cx, cy, s) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.35)
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.35, cy - s * 0.85, cx, cy - s * 0.35)
  ctx.bezierCurveTo(cx + s * 0.35, cy - s * 0.85, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35)
  ctx.closePath()
}

export function getSpriteAtlas() {
  if (cache.has('atlas')) return cache.get('atlas')
  const s = 512
  const cell = s / 4
  const c = canvas(s)
  const ctx = c.getContext('2d')
  const at = (i) => [(i % 4) * cell + cell / 2, Math.floor(i / 4) * cell + cell / 2]
  const white = '#ffffff'

  let [x, y] = at(SPRITE.circle)
  let g = ctx.createRadialGradient(x, y, 0, x, y, cell / 2)
  g.addColorStop(0, white)
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell)
  ;[x, y] = at(SPRITE.spark)
  g = ctx.createRadialGradient(x, y, 0, x, y, cell / 2)
  g.addColorStop(0, white)
  g.addColorStop(0.15, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell)
  ;[x, y] = at(SPRITE.star)
  starPath(ctx, x, y, 5, cell * 0.45, cell * 0.2)
  ctx.fillStyle = white
  ctx.fill()
  ;[x, y] = at(SPRITE.heart)
  heartPath(ctx, x, y + cell * 0.08, cell * 0.8)
  ctx.fill()
  ;[x, y] = at(SPRITE.ghost)
  ctx.beginPath()
  ctx.arc(x, y - cell * 0.1, cell * 0.3, Math.PI, 0)
  ctx.lineTo(x + cell * 0.3, y + cell * 0.35)
  for (let i = 0; i < 4; i += 1) ctx.lineTo(x + cell * 0.3 - (i + 0.5) * cell * 0.15, y + cell * (i % 2 ? 0.35 : 0.25))
  ctx.lineTo(x - cell * 0.3, y + cell * 0.35)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(x - cell * 0.1, y - cell * 0.12, cell * 0.05, 0, Math.PI * 2)
  ctx.arc(x + cell * 0.1, y - cell * 0.12, cell * 0.05, 0, Math.PI * 2)
  ctx.fill()
  ;[x, y] = at(SPRITE.smoke)
  g = ctx.createRadialGradient(x, y, 0, x, y, cell / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell)
  ;[x, y] = at(SPRITE.square)
  ctx.fillStyle = white
  ctx.fillRect(x - cell * 0.35, y - cell * 0.35, cell * 0.7, cell * 0.7)
  ;[x, y] = at(SPRITE.ring)
  ctx.strokeStyle = white
  ctx.lineWidth = cell * 0.08
  ctx.beginPath()
  ctx.arc(x, y, cell * 0.38, 0, Math.PI * 2)
  ctx.stroke()
  ;[x, y] = at(SPRITE.flame)
  g = ctx.createRadialGradient(x, y + cell * 0.1, 0, x, y, cell / 2)
  g.addColorStop(0, white)
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y, cell * 0.3, cell * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ;[x, y] = at(SPRITE.confetti)
  ctx.fillStyle = white
  ctx.fillRect(x - cell * 0.12, y - cell * 0.3, cell * 0.24, cell * 0.6)
  ;[x, y] = at(SPRITE.bolt)
  ctx.beginPath()
  ctx.moveTo(x + cell * 0.1, y - cell * 0.45)
  ctx.lineTo(x - cell * 0.2, y + cell * 0.05)
  ctx.lineTo(x, y + cell * 0.05)
  ctx.lineTo(x - cell * 0.1, y + cell * 0.45)
  ctx.lineTo(x + cell * 0.22, y - cell * 0.08)
  ctx.lineTo(x + cell * 0.02, y - cell * 0.08)
  ctx.closePath()
  ctx.fillStyle = white
  ctx.fill()
  ;[x, y] = at(SPRITE.pumpkin)
  ctx.fillStyle = '#ff8a1a'
  ctx.beginPath()
  ctx.ellipse(x, y, cell * 0.38, cell * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a9a2a'
  ctx.fillRect(x - cell * 0.04, y - cell * 0.42, cell * 0.08, cell * 0.14)

  const tex = finish(c, { repeat: false })
  cache.set('atlas', tex)
  return tex
}
