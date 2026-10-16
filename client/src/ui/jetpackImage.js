import { JETPACK_BY_ID, SKIN_BY_ID, TRAIL_BY_ID } from '../../../shared/config.js'
import { makeCanvas, roundRect } from '../game/canvasArt.js'
import { heartPath } from '../game/textures.js'

/** Flat 2D jetpack thumbnails for UI cards, cached as data URLs. */

const cache = new Map()

function pattern(ctx, skin, x, y, w, h) {
  const [, a, b] = skin.colors
  const colors = [a, b]
  ctx.save()
  roundRect(ctx, x, y, w, h, w * 0.4)
  ctx.clip()
  const rows = 4
  for (let r = 0; r < rows; r += 1) {
    const cy = y + ((r + 0.5) * h) / rows
    ctx.fillStyle = colors[r % 2]
    if (skin.pattern === 'tri') {
      ctx.beginPath()
      ctx.moveTo(x + w / 2, cy - h / 12)
      ctx.lineTo(x + w * 0.78, cy + h / 12)
      ctx.lineTo(x + w * 0.22, cy + h / 12)
      ctx.fill()
    } else if (skin.pattern === 'dot') {
      ctx.beginPath()
      ctx.arc(x + w / 2, cy, w * 0.2, 0, Math.PI * 2)
      ctx.fill()
    } else if (skin.pattern === 'bar') {
      ctx.fillRect(x, cy - h / 18, w, h / 9)
    } else {
      ctx.beginPath()
      for (let k = 0; k < 10; k += 1) {
        const rr = k % 2 ? w * 0.09 : w * 0.22
        const ang = (k * Math.PI) / 5 - Math.PI / 2
        ctx.lineTo(x + w / 2 + Math.cos(ang) * rr, cy + Math.sin(ang) * rr)
      }
      ctx.fill()
    }
  }
  ctx.restore()
}

export function jetpackImage(jetpackId = 'jp1', skinId = '') {
  const key = `${jetpackId}|${skinId}`
  if (cache.has(key)) return cache.get(key)
  const jp = JETPACK_BY_ID[jetpackId] || JETPACK_BY_ID.jp1
  const skin = skinId ? SKIN_BY_ID[skinId] : null
  const c = makeCanvas(160, 160)
  const ctx = c.getContext('2d')
  ctx.lineJoin = 'round'

  if (skin?.wings === 'angel') {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#16122b'
    ctx.lineWidth = 4
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(80 + side * 50, 62, 34, 16, side * -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  } else if (skin?.wings === 'spikes') {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      ctx.fillStyle = i % 2 ? skin.colors[1] : skin.colors[2]
      ctx.beginPath()
      ctx.moveTo(80 + Math.cos(a - 0.15) * 30, 72 + Math.sin(a - 0.15) * 30)
      ctx.lineTo(80 + Math.cos(a) * 74, 72 + Math.sin(a) * 74)
      ctx.lineTo(80 + Math.cos(a + 0.15) * 30, 72 + Math.sin(a + 0.15) * 30)
      ctx.fill()
    }
  }

  // flames
  const flame = jp.flame || '#ffb347'
  for (const x of [56, 104]) {
    const g = ctx.createLinearGradient(0, 120, 0, 156)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.3, flame)
    g.addColorStop(1, 'rgba(255,120,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 12, 122)
    ctx.quadraticCurveTo(x, 170, x + 12, 122)
    ctx.fill()
  }
  for (const x of [34, 82]) {
    const body = skin ? skin.colors[0] : jp.color
    ctx.fillStyle = body
    ctx.strokeStyle = '#16122b'
    ctx.lineWidth = 5
    roundRect(ctx, x, 20, 44, 100, 16)
    ctx.fill()
    if (skin) pattern(ctx, skin, x, 20, 44, 100)
    else {
      ctx.fillStyle = jp.band
      ctx.fillRect(x, 44, 44, 9)
      ctx.fillRect(x, 86, 44, 9)
    }
    roundRect(ctx, x, 20, 44, 100, 16)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(x + 8, 28, 7, 60)
    ctx.fillStyle = '#2a2d3a'
    ctx.fillRect(x + 10, 118, 24, 8)
  }
  const url = c.toDataURL()
  cache.set(key, url)
  return url
}

const trailCache = new Map()
/** Small preview image for a trail. */
export function trailImage(trailId) {
  if (trailCache.has(trailId)) return trailCache.get(trailId)
  const t = TRAIL_BY_ID[trailId]
  const c = makeCanvas(160, 120)
  const ctx = c.getContext('2d')
  const colorAt = (i) => (t.color === 'rainbow' ? `hsl(${i * 60}, 100%, 60%)` : t.color)
  for (let i = 0; i < 5; i += 1) {
    const x = 20 + i * 28
    const y = 60 + Math.sin(i) * 8
    const s = 14 + i * 3
    ctx.fillStyle = colorAt(i)
    ctx.strokeStyle = '#16122b'
    ctx.lineWidth = 3
    ctx.beginPath()
    if (t.kind === 'chevron' || t.kind === 'ribbon') {
      ctx.moveTo(x - s * 0.5, y - s * 0.7)
      ctx.lineTo(x + s * 0.6, y)
      ctx.lineTo(x - s * 0.5, y + s * 0.7)
      ctx.lineTo(x - s * 0.2, y)
      ctx.closePath()
    } else if (t.kind === 'heart') {
      heartPath(ctx, x, y, s * 1.4)
    } else if (t.kind === 'bolt') {
      ctx.moveTo(x + 4, y - s)
      ctx.lineTo(x - 6, y + 2)
      ctx.lineTo(x + 2, y + 2)
      ctx.lineTo(x - 4, y + s)
      ctx.lineTo(x + 8, y - 4)
      ctx.lineTo(x, y - 4)
      ctx.closePath()
    } else {
      for (let k = 0; k < 10; k += 1) {
        const r = k % 2 ? s * 0.25 : s * 0.6
        const a = (k * Math.PI) / 5 - Math.PI / 2
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      }
      ctx.closePath()
    }
    ctx.fill()
    ctx.stroke()
  }
  const url = c.toDataURL()
  trailCache.set(trailId, url)
  return url
}
