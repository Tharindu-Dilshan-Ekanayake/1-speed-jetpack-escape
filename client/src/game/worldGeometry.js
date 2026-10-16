import { BufferGeometry, Color, Float32BufferAttribute, Uint32BufferAttribute } from 'three'

import { TEXTURE_SCALE } from './textures.js'

/**
 * Turns world boxes into merged BufferGeometries, one per texture "bucket".
 * UVs are in world space so patterns line up across neighbouring boxes.
 */

// Corner order per face, wound counter-clockwise seen from outside.
const FACES = [
  { n: [0, 1, 0], top: true, c: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]], uv: (p) => [p[0], p[2]] },
  { n: [0, -1, 0], c: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]], uv: (p) => [p[0], p[2]] },
  { n: [1, 0, 0], side: true, c: (a, b) => [[b[0], a[1], b[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]]], uv: (p) => [-p[2], p[1]] },
  { n: [-1, 0, 0], side: true, c: (a, b) => [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]], uv: (p) => [p[2], p[1]] },
  { n: [0, 0, 1], side: true, c: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], uv: (p) => [p[0], p[1]] },
  { n: [0, 0, -1], side: true, c: (a, b) => [[b[0], a[1], a[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]]], uv: (p) => [-p[0], p[1]] },
]

export class GeometryBucket {
  constructor() {
    this.pos = []
    this.nrm = []
    this.uv = []
    this.col = []
    this.idx = []
  }

  get empty() {
    return this.idx.length === 0
  }

  /** corners: 4 points in world space; origin: subtracted from positions */
  quad(corners, n, uvFn, scale, color, origin, shade) {
    const base = this.pos.length / 3
    for (let i = 0; i < 4; i += 1) {
      const p = corners[i]
      this.pos.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2])
      this.nrm.push(n[0], n[1], n[2])
      const [u, v] = uvFn(p)
      this.uv.push(u / scale, v / scale)
      const s = shade ? shade[i] : 1
      this.col.push(color.r * s, color.g * s, color.b * s)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  build() {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(new Uint32BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

const colorCache = new Map()
export function linearColor(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new Color(hex))
  return colorCache.get(hex)
}

/**
 * Picks the bucket key for one face of a box. Animated belt tops and glowing
 * boxes get their own buckets so they can use special materials.
 */
export function faceBucketKey(box, face) {
  if (box.em) return 'glow'
  if (face.top && box.kind === 'treadmill') return 'beltZ'
  if (face.top && box.kind === 'conveyor') return box.vel?.[0] < 0 ? 'beltX-' : 'beltX+'
  const tex = face.top && box.ttex ? box.ttex : box.tex || 'smooth'
  return box.shadow === false ? `${tex}|ns` : tex
}

export const bucketTexture = (key) => {
  if (key.startsWith('belt')) return 'belt'
  return key.split('|')[0]
}

/**
 * Writes all six faces of a box into buckets.
 * @param {(key:string) => GeometryBucket} getBucket
 */
export function writeBox(box, getBucket, origin = [0, 0, 0], min = box.min, max = box.max) {
  const height = max[1] - min[1]
  for (const face of FACES) {
    const key = faceBucketKey(box, face)
    const texKey = bucketTexture(key)
    const scale = box.ts || TEXTURE_SCALE[texKey] || 8
    const hex = box.em ? box.em : face.top && box.tc ? box.tc : box.c || '#cccccc'
    const color = linearColor(hex)
    // Cheap ambient occlusion: darken the bottom of tall side faces.
    let shade = null
    if (face.side && height > 3 && !box.em) {
      const dark = height > 40 ? 0.72 : 0.84
      shade = [dark, dark, 1, 1]
    } else if (face.n[1] < 0) {
      shade = [0.7, 0.7, 0.7, 0.7]
    }
    getBucket(key).quad(face.c(min, max), face.n, face.uv, scale, color, origin, shade)
  }
}
