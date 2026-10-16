import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three'

import { runtime } from '../state/runtime.js'
import { createGhost } from './props.js'

const INTERP_DELAY = 120 // ms behind the newest server snapshot

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/**
 * The hunting ghosts. Their position comes from the server (one ghost per
 * room, the same for everyone); this interpolates it, animates the body and
 * publishes `runtime.ghosts` for the local player's touch check.
 */
export class GhostsView {
  constructor(spawns) {
    this.group = new Group()
    this.group.name = 'ghosts'
    this.time = 0
    const red = new Color('#ff2433')
    this.ghosts = spawns.map((sp) => {
      const mesh = createGhost({ color: sp.color, outline: sp.glow })
      mesh.scale.setScalar(sp.scale)
      // Soft glow so it can be spotted across the room.
      const aura = new Mesh(
        new SphereGeometry(3.2, 20, 14),
        new MeshBasicMaterial({ color: sp.glow, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false }),
      )
      aura.position.y = 0.5
      mesh.add(aura)
      const root = new Group()
      root.add(mesh)
      root.position.set(sp.home[0], sp.home[1], sp.home[2])
      this.group.add(root)
      return { sp, root, mesh, aura, buffer: [], yaw: Math.PI, mode: 0, faceColor: new Color('#1a1a1a'), red }
    })
    runtime.ghosts = this.ghosts.map((g) => ({ id: g.sp.id, x: g.sp.home[0], y: g.sp.home[1], z: g.sp.home[2], radius: g.sp.radius, stage: g.sp.stage }))
  }

  update(dt) {
    this.time += dt
    const state = runtime.room?.state?.ghosts
    const now = performance.now()
    this.ghosts.forEach((g, i) => {
      const s = state?.get(g.sp.id)
      if (s) {
        const last = g.buffer[g.buffer.length - 1]
        if (!last || last.x !== s.x || last.y !== s.y || last.z !== s.z) {
          g.buffer.push({ t: now, x: s.x, y: s.y, z: s.z, ry: s.ry })
          if (g.buffer.length > 20) g.buffer.shift()
        }
        g.mode = s.mode
      }
      const buf = g.buffer
      if (buf.length) {
        const rt = now - INTERP_DELAY
        let a = buf[0]
        let b = buf[0]
        for (let j = buf.length - 1; j >= 0; j -= 1) {
          if (buf[j].t <= rt) {
            a = buf[j]
            b = buf[Math.min(j + 1, buf.length - 1)]
            break
          }
        }
        const span = b.t - a.t
        const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1
        g.root.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
        g.yaw = lerpAngle(g.yaw, b.ry, 1 - Math.exp(-6 * dt))
      }
      const chasing = g.mode === 1
      const t = this.time + i
      g.mesh.position.y = Math.sin(t * 1.6) * 1.2
      g.mesh.rotation.set(chasing ? 0.25 : 0, g.yaw, Math.sin(t * 1.1) * 0.08)
      // Chomp while hunting: the face stretches like a gaping mouth.
      const { face, outline } = g.mesh.userData
      face.scale.set(1, chasing ? 1 + Math.max(0, Math.sin(t * 9)) * 0.5 : 1, 1)
      face.material.color.copy(chasing ? g.red : g.faceColor)
      outline.scale.setScalar(chasing ? 1.1 + Math.sin(t * 12) * 0.02 : 1.08)
      g.aura.material.opacity = chasing ? 0.2 + Math.sin(t * 6) * 0.06 : 0.1
      const pub = runtime.ghosts[i]
      pub.x = g.root.position.x
      pub.y = g.root.position.y + g.mesh.position.y + 0.5 * g.sp.scale
      pub.z = g.root.position.z
    })
  }
}
