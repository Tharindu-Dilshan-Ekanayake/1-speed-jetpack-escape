import { CanvasTexture, SRGBColorSpace } from 'three'

import { formatHours, formatNumber } from '../../../shared/format.js'
import { heartPath } from './textures.js'

/** Canvas drawing for in-world signs, labels, leaderboards and icons. */

export const FONT = "'Fredoka', 'Arial Rounded MT Bold', system-ui, sans-serif"
export const TITLE_FONT = "'Luckiest Guy', 'Fredoka', system-ui, sans-serif"

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function toTexture(c) {
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Chunky white text with a dark outline, Roblox style. */
export function outlined(ctx, text, x, y, { size = 48, fill = '#ffffff', stroke = '#101225', width, align = 'center', font = FONT, weight = 700, baseline = 'middle', maxWidth } = {}) {
  ctx.font = `${weight} ${size}px ${font}`
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = width ?? Math.max(3, size * 0.18)
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y, maxWidth)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y, maxWidth)
}

/* ------------------------------------------------------------------------ */
/* Icons                                                                     */
/* ------------------------------------------------------------------------ */

export function drawIcon(ctx, name, cx, cy, s) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s / 100, s / 100)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 7
  ctx.strokeStyle = '#1a1206'
  switch (name) {
    case 'trophy': {
      ctx.fillStyle = '#ffc928'
      ctx.beginPath()
      ctx.moveTo(-30, -38)
      ctx.lineTo(30, -38)
      ctx.lineTo(26, -2)
      ctx.quadraticCurveTo(20, 18, 0, 20)
      ctx.quadraticCurveTo(-20, 18, -26, -2)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-30, -18, 13, Math.PI * 0.5, Math.PI * 1.5)
      ctx.arc(30, -18, 13, Math.PI * 1.5, Math.PI * 0.5)
      ctx.lineWidth = 6
      ctx.strokeStyle = '#ffc928'
      ctx.stroke()
      ctx.fillStyle = '#e8a412'
      ctx.fillRect(-7, 18, 14, 14)
      ctx.fillStyle = '#ffc928'
      ctx.strokeStyle = '#1a1206'
      ctx.lineWidth = 6
      roundRect(ctx, -24, 30, 48, 12, 4)
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#fff3b0'
      ctx.fillRect(-18, -30, 8, 22)
      break
    }
    case 'shoe': {
      ctx.fillStyle = '#2f8cff'
      ctx.beginPath()
      ctx.moveTo(-42, 10)
      ctx.lineTo(-30, -30)
      ctx.lineTo(-6, -24)
      ctx.quadraticCurveTo(4, -6, 26, -2)
      ctx.quadraticCurveTo(46, 2, 46, 18)
      ctx.lineTo(-42, 18)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-44, 18, 92, 12)
      ctx.strokeRect(-44, 18, 92, 12)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-16, -14)
      ctx.lineTo(-4, -18)
      ctx.moveTo(-12, -4)
      ctx.lineTo(2, -8)
      ctx.stroke()
      break
    }
    case 'jetpack':
    case 'fuel': {
      ctx.rotate(-0.35)
      ctx.fillStyle = '#ffc928'
      roundRect(ctx, -26, -40, 52, 80, 22)
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#2fa8ff'
      roundRect(ctx, -16, -26, 32, 52, 12)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(4, -20)
      ctx.lineTo(-10, 4)
      ctx.lineTo(0, 4)
      ctx.lineTo(-4, 20)
      ctx.lineTo(10, -4)
      ctx.lineTo(0, -4)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'run': {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(8, -32, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(2, -16)
      ctx.lineTo(-6, 8)
      ctx.lineTo(10, 22)
      ctx.lineTo(4, 40)
      ctx.moveTo(-6, 8)
      ctx.lineTo(-22, 24)
      ctx.lineTo(-34, 22)
      ctx.moveTo(0, -12)
      ctx.lineTo(20, -2)
      ctx.lineTo(30, -12)
      ctx.moveTo(0, -12)
      ctx.lineTo(-18, -4)
      ctx.stroke()
      break
    }
    case 'coin': {
      ctx.fillStyle = '#e09a12'
      ctx.beginPath()
      ctx.ellipse(0, 6, 40, 38, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath()
      ctx.ellipse(0, 0, 40, 38, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#ffe680'
      ctx.beginPath()
      ctx.ellipse(0, 0, 26, 24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e8a412'
      ctx.fillRect(-6, -14, 12, 28)
      break
    }
    case 'clock': {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, 38, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#1f7ae0'
      ctx.lineWidth = 9
      ctx.stroke()
      ctx.strokeStyle = '#1f7ae0'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -24)
      ctx.moveTo(0, 0)
      ctx.lineTo(16, 10)
      ctx.stroke()
      break
    }
    case 'rebirth': {
      // Same as the HUD icon: pink and light-blue arrows chasing round a circle.
      ctx.translate(-50, -50)
      const arcs = [
        ['M22.8 37.3 A30 30 0 0 1 77.2 37.3', 'M89 31.8 L83.5 50.9 L65.4 42.8 Z', '#ff5fa2'],
        ['M77.2 62.7 A30 30 0 0 1 22.8 62.7', 'M11 68.2 L16.5 49.1 L34.6 57.2 Z', '#8fdcff'],
      ]
      ctx.lineJoin = 'round'
      for (const [arc, head] of arcs) {
        ctx.strokeStyle = '#1a1206'
        ctx.lineWidth = 25
        ctx.stroke(new Path2D(arc))
        ctx.lineWidth = 10
        ctx.fillStyle = '#1a1206'
        ctx.stroke(new Path2D(head))
        ctx.fill(new Path2D(head))
      }
      for (const [arc, head, color] of arcs) {
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = 15
        ctx.stroke(new Path2D(arc))
        ctx.lineWidth = 2
        ctx.stroke(new Path2D(head))
        ctx.fill(new Path2D(head))
      }
      break
    }
    case 'crown': {
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath()
      ctx.moveTo(-36, 24)
      ctx.lineTo(-40, -22)
      ctx.lineTo(-16, 0)
      ctx.lineTo(0, -30)
      ctx.lineTo(16, 0)
      ctx.lineTo(40, -22)
      ctx.lineTo(36, 24)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
      break
    }
    case 'lock': {
      ctx.strokeStyle = '#dfe6ff'
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.arc(0, -10, 18, Math.PI, 0)
      ctx.stroke()
      ctx.fillStyle = '#ffc928'
      ctx.strokeStyle = '#1a1206'
      ctx.lineWidth = 6
      roundRect(ctx, -26, -10, 52, 42, 8)
      ctx.stroke()
      ctx.fill()
      break
    }
    case 'heart': {
      ctx.fillStyle = '#ff4f7a'
      heartPath(ctx, 0, 6, 70)
      ctx.stroke()
      ctx.fill()
      break
    }
    default:
      break
  }
  ctx.restore()
}

/* ------------------------------------------------------------------------ */
/* Signs                                                                     */
/* ------------------------------------------------------------------------ */

/** Returns { texture, aspect } for a world sign descriptor. */
export function makeSignTexture(sign) {
  const pxPerStud = sign.kind === 'stage' ? 26 : 22
  const w = Math.min(2048, Math.round(sign.w * pxPerStud))
  const h = Math.min(1024, Math.round(sign.h * pxPerStud))
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')

  if (sign.kind === 'stage') {
    outlined(ctx, sign.text, w / 2, h / 2 + h * 0.05, {
      size: h * 0.78,
      font: TITLE_FONT,
      weight: 400,
      fill: sign.gold ? '#ffe066' : '#ffffff',
      stroke: sign.gold ? '#7a4a00' : '#1b1d3d',
      width: h * 0.1,
      maxWidth: w * 0.96,
    })
  } else if (sign.kind === 'banner') {
    ctx.fillStyle = '#123a7a'
    roundRect(ctx, 0, 0, w, h, h * 0.12)
    ctx.fill()
    const inset = h * 0.1
    const g = ctx.createLinearGradient(0, inset, 0, h - inset)
    g.addColorStop(0, lighten(sign.bg, 0.25))
    g.addColorStop(1, sign.bg)
    ctx.fillStyle = g
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, h * 0.08)
    ctx.fill()
    drawIcon(ctx, sign.icon, inset + h * 0.42, h / 2, h * 0.7)
    outlined(ctx, sign.text, w / 2 + h * 0.3, h / 2 + h * 0.04, { size: h * 0.56, font: TITLE_FONT, weight: 400, width: h * 0.08, maxWidth: w - h * 1.3 - inset * 2 })
  } else if (sign.kind === 'rec') {
    ctx.fillStyle = '#2c3a8a'
    roundRect(ctx, 0, 0, w, h, 18)
    ctx.fill()
    ctx.fillStyle = '#3f52c2'
    roundRect(ctx, 8, 8, w - 16, h - 16, 14)
    ctx.fill()
    outlined(ctx, 'Recommended', w / 2, h * 0.17, { size: h * 0.14 })
    drawIcon(ctx, 'jetpack', w * 0.3, h * 0.58, h * 0.5)
    outlined(ctx, `Lvl.`, w * 0.7, h * 0.44, { size: h * 0.18 })
    outlined(ctx, String(sign.level), w * 0.7, h * 0.68, { size: h * 0.3 })
  } else {
    ctx.fillStyle = '#1b2350'
    roundRect(ctx, 0, 0, w, h, 14)
    ctx.fill()
    const lines = String(sign.text).split('\n')
    lines.forEach((line, i) => {
      outlined(ctx, line, w / 2, (h * (i + 1)) / (lines.length + 1), { size: h / (lines.length + 1.4), width: 4, fill: i === 0 ? '#ffffff' : '#ffe36b', maxWidth: w * 0.92 })
    })
  }
  return { texture: toTexture(c), aspect: w / h }
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amount)
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amount)
  const b = Math.min(255, (n & 255) + 255 * amount)
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

/* ------------------------------------------------------------------------ */
/* Floating labels (sprites)                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Draws stacked label lines: [{ text, icon?, color?, size? }].
 * Returns the canvas; the caller makes a sprite with matching aspect.
 */
export function drawLabel(c, lines) {
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  const total = lines.reduce((s, l) => s + (l.size || 1), 0)
  // Keep the outline inside the canvas: long lines shrink instead of getting cut off.
  const room = c.width * 0.94
  let y = 0
  for (const line of lines) {
    const lh = (c.height * (line.size || 1)) / total
    let size = lh * 0.72
    ctx.font = `700 ${size}px ${FONT}`
    let textW = ctx.measureText(line.text).width
    let iconW = line.icon ? size * 1.15 : 0
    const needed = textW + iconW + size * 0.4
    if (needed > room) {
      size *= room / needed
      ctx.font = `700 ${size}px ${FONT}`
      textW = ctx.measureText(line.text).width
      iconW = line.icon ? size * 1.15 : 0
    }
    const startX = c.width / 2 - (textW + iconW) / 2
    if (line.icon) drawIcon(ctx, line.icon, startX + iconW * 0.45, y + lh / 2, size)
    outlined(ctx, line.text, startX + iconW + textW / 2, y + lh / 2 + size * 0.04, { size, fill: line.color || '#ffffff', width: size * 0.2 })
    y += lh
  }
}

/* ------------------------------------------------------------------------ */
/* Leaderboards                                                              */
/* ------------------------------------------------------------------------ */

const BOARD_STYLE = {
  trophies: { title: 'Wins Leaderboard', icon: 'trophy', top: '#ff9d2e', bottom: '#ff5a1f', row: '#ffcf3d', alt: '#f5b52a', ink: '#3a1f00' },
  playtime: { title: 'Playtime Leaderboard', icon: 'clock', top: '#3fb5ff', bottom: '#1f6be0', row: '#2fa0ff', alt: '#2386ea', ink: '#ffffff' },
  rebirths: { title: 'Rebirth Leaderboard', icon: 'rebirth', top: '#ff6ad5', bottom: '#b13cff', row: '#d779ff', alt: '#c25cf2', ink: '#ffffff' },
}

export function drawBoard(c, board, entries = []) {
  const s = BOARD_STYLE[board]
  const ctx = c.getContext('2d')
  const W = c.width
  const H = c.height
  ctx.clearRect(0, 0, W, H)
  const header = H * 0.22
  const g = ctx.createLinearGradient(0, 0, 0, header)
  g.addColorStop(0, s.top)
  g.addColorStop(1, s.bottom)
  ctx.fillStyle = g
  roundRect(ctx, 0, 0, W, header + 20, 26)
  ctx.fill()
  drawIcon(ctx, s.icon, W / 2, header * 0.38, header * 0.5)
  outlined(ctx, s.title, W / 2, header * 0.82, { size: header * 0.17 })

  ctx.fillStyle = '#121633'
  ctx.fillRect(0, header, W, H - header)
  ctx.fillStyle = '#1d2350'
  ctx.fillRect(0, header, W, H * 0.06)
  outlined(ctx, '#  Player', 20, header + H * 0.03, { size: H * 0.032, align: 'left', width: 4 })
  outlined(ctx, 'Record', W - 20, header + H * 0.03, { size: H * 0.032, align: 'right', width: 4 })

  const rows = 10
  const top = header + H * 0.06
  const rh = (H - top) / rows
  for (let i = 0; i < rows; i += 1) {
    const y = top + i * rh
    ctx.fillStyle = i % 2 ? s.alt : s.row
    ctx.fillRect(6, y + 3, W - 12, rh - 6)
    const e = entries[i]
    const fs = rh * 0.42
    outlined(ctx, `${i + 1}.`, 18, y + rh / 2, { size: fs, align: 'left', width: 5 })
    if (!e) continue
    const value =
      board === 'playtime' ? formatHours(e.value) : board === 'rebirths' ? `R${formatNumber(e.value)} Lv${e.level}` : `${formatNumber(e.value, 2)}`
    outlined(ctx, e.name, 70, y + rh / 2, { size: fs, align: 'left', width: 5, maxWidth: W * 0.55 })
    outlined(ctx, value, W - 18, y + rh / 2, { size: fs, align: 'right', width: 5, fill: board === 'trophies' ? '#fff6c2' : '#ffffff' })
  }
}
