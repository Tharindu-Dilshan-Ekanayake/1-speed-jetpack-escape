import { useEffect, useRef } from 'react'

import { runtime } from '../state/runtime.js'

const LINES = 90

function newLine(line = {}) {
  line.angle = Math.random() * Math.PI * 2
  line.t = Math.random()
  line.len = 0.08 + Math.random() * 0.18
  line.width = 1 + Math.random() * 2.2
  line.speed = 0.6 + Math.random() * 0.8
  return line
}

/**
 * Flying with the jetpack: white streaks rush past the edges of the screen and
 * the edges blur, stronger the faster you go. The middle stays clear so you
 * can always see where you are going. Very fast running gets a lighter version.
 */
export function SpeedLines({ quality }) {
  const canvasRef = useRef(null)
  const blurRef = useRef(null)

  useEffect(() => {
    const lines = Array.from({ length: LINES }, () => newLine())
    let raf = 0
    let level = 0
    let last = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const canvas = canvasRef.current
      if (!canvas) return
      const ctl = runtime.local
      const c = ctl?.state
      let want = 0
      if (c?.jetting) want = Math.min(1, 0.4 + ctl.hSpeed / 280)
      else if (ctl) want = Math.max(0, Math.min(0.45, (ctl.hSpeed - 120) / 260))
      level += (want - level) * (1 - Math.exp(-dt * (want > level ? 6 : 3)))
      if (blurRef.current) {
        blurRef.current.style.opacity = level.toFixed(3)
        // Fully off (not just transparent) when idle, so the blur costs nothing.
        blurRef.current.style.visibility = level > 0.02 ? 'visible' : 'hidden'
      }

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      if (level < 0.02) return
      const cx = w / 2
      const cy = h / 2
      const reach = Math.hypot(cx, cy)
      ctx.lineCap = 'round'
      for (const line of lines) {
        line.t += dt * line.speed * (0.8 + level * 2.4)
        if (line.t > 1) {
          newLine(line)
          line.t = 0
        }
        // Streaks live in the outer ring and race outward.
        const r0 = reach * (0.52 + line.t * 0.5)
        const r1 = r0 + reach * line.len * (0.6 + level)
        const cos = Math.cos(line.angle)
        const sin = Math.sin(line.angle)
        const fade = Math.sin(Math.PI * line.t)
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.32 * level * fade).toFixed(3)})`
        ctx.lineWidth = line.width * (0.8 + level)
        ctx.beginPath()
        ctx.moveTo(cx + cos * r0, cy + sin * r0)
        ctx.lineTo(cx + cos * r1, cy + sin * r1)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      {quality !== 'low' && <div ref={blurRef} className="speed-blur" aria-hidden="true" />}
      <canvas ref={canvasRef} className="speed-lines" aria-hidden="true" />
    </>
  )
}

export default SpeedLines
