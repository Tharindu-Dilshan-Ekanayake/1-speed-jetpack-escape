import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'

import { FONT, makeCanvas, roundRect } from './canvasArt.js'

/** White speech bubble shown above a player's head for a few seconds. */
export class ChatBubble {
  constructor() {
    this.canvas = makeCanvas(512, 256)
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }))
    this.sprite.scale.set(10, 5, 1)
    this.sprite.position.y = 9.6
    this.sprite.visible = false
    this.text = ''
  }

  /** @param {{ text: string, until: number } | null} chat */
  update(chat) {
    const show = !!chat && chat.until > Date.now()
    this.sprite.visible = show
    if (show && chat.text !== this.text) {
      this.text = chat.text
      this.draw(chat.text)
    }
  }

  draw(text) {
    const c = this.canvas
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.font = `600 34px ${FONT}`
    const lines = []
    let line = ''
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > c.width - 60 && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    const shown = lines.slice(0, 3)
    const h = shown.length * 40 + 30
    const w = Math.min(c.width - 10, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 50)
    const x = (c.width - w) / 2
    const y = c.height - h - 22
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    roundRect(ctx, x, y, w, h, 22)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(c.width / 2 - 14, y + h)
    ctx.lineTo(c.width / 2, y + h + 18)
    ctx.lineTo(c.width / 2 + 14, y + h)
    ctx.fill()
    ctx.fillStyle = '#1b1d33'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    shown.forEach((l, i) => ctx.fillText(l, c.width / 2, y + 35 + i * 40))
    this.texture.needsUpdate = true
  }
}
