import { useEffect, useState } from 'react'
import { AdditiveBlending, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { addSystem, runtime } from '../state/runtime.js'

function buildArrows() {
  const root = new Group()
  root.name = 'guide'

  // Big arrow hovering over the target, pointing down.
  const down = new Group()
  const body = mergeGeometries([new CylinderGeometry(1.1, 1.1, 5, 16).translate(0, 4.6, 0), new ConeGeometry(2.6, 3.6, 20).rotateX(Math.PI).translate(0, 0.4, 0)])
  down.add(new Mesh(body, new MeshBasicMaterial({ color: '#ffd23f' })))
  const glow = new Mesh(body.clone().scale(1.35, 1.12, 1.35), new MeshBasicMaterial({ color: '#ff9d1f', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }))
  down.add(glow)
  root.add(down)

  // Flat arrow on the ground in front of the player, pointing the way.
  const shape = new Shape()
  shape.moveTo(0, 3.4)
  shape.lineTo(2.6, 0.4)
  shape.lineTo(1.1, 0.4)
  shape.lineTo(1.1, -2.6)
  shape.lineTo(-1.1, -2.6)
  shape.lineTo(-1.1, 0.4)
  shape.lineTo(-2.6, 0.4)
  shape.closePath()
  const flatGeo = new ShapeGeometry(shape).rotateX(-Math.PI / 2)
  const flatMat = new MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending })
  const flat = new Mesh(flatGeo, flatMat)
  flat.renderOrder = 5
  root.add(flat)

  return { root, down, flat, flatMat }
}

/**
 * Guides first-time players: the HUD's Guide sets `runtime.guide` to a world
 * position (treadmill, Stage 1 door, Wins pad, Jetpack 2) and this draws the way.
 */
export function GuideArrow() {
  const [arrows] = useState(buildArrows)
  useEffect(
    () =>
      addSystem({
        name: 'guide',
        order: 30,
        update(_dt, t) {
          const target = runtime.guide
          const c = runtime.local?.state
          arrows.root.visible = !!(target && c)
          if (!arrows.root.visible) return
          const [x, y, z] = target
          arrows.down.position.set(x, y + 7 + Math.sin(t * 3.2) * 1.2, z)
          arrows.down.rotation.y = t * 1.5
          const dx = x - c.x
          const dz = z - c.z
          const dist = Math.hypot(dx, dz)
          arrows.flat.visible = dist > 14 && c.grounded
          if (!arrows.flat.visible) return
          const ux = dx / dist
          const uz = dz / dist
          const ahead = 5.5 + Math.sin(t * 5) * 0.6
          arrows.flat.position.set(c.x + ux * ahead, c.y + 0.25, c.z + uz * ahead)
          // The shape points along -Z after rotateX; turn it toward the target.
          arrows.flat.rotation.y = Math.atan2(-ux, -uz)
          arrows.flatMat.opacity = 0.55 + Math.sin(t * 6) * 0.25
        },
      }),
    [arrows],
  )
  return <primitive object={arrows.root} />
}

export default GuideArrow
