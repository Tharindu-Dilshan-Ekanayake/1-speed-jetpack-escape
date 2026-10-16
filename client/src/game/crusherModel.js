import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { crusherState } from '../../../shared/world.js'
import { getSurfaceTexture } from './textures.js'

/**
 * Crusher walls: heavy blocks that slide out of the hall's side walls with a
 * row of spikes and a hazard-striped face. Timing comes from crusherState(),
 * the same function the collision uses, on the server-synced clock.
 */

function spikeRow(height, depth, dir) {
  const spikes = []
  const rows = Math.max(2, Math.round(height / 9))
  const cols = Math.max(2, Math.round(depth / 7))
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cone = new ConeGeometry(1.4, 4, 6)
      cone.rotateZ(-dir * Math.PI / 2)
      cone.translate(dir * 2, -height / 2 + ((r + 0.5) * height) / rows, -depth / 2 + ((c + 0.5) * depth) / cols)
      spikes.push(cone)
    }
  }
  return mergeGeometries(spikes)
}

export function createCrushers(crushers) {
  const group = new Group()
  group.name = 'crushers'
  const metal = new MeshStandardMaterial({ map: getSurfaceTexture('metal'), color: '#9fb4d6', roughness: 0.45, metalness: 0.5 })
  const stripes = new MeshStandardMaterial({ map: getSurfaceTexture('hazard'), color: '#ffd84d', roughness: 0.6 })
  const steel = new MeshStandardMaterial({ color: '#e8eefc', roughness: 0.25, metalness: 0.85 })

  const walls = crushers.map((c) => {
    const height = c.y1 - c.y0
    const depth = c.z0 - c.z1
    const sides = [-1, 1].map((side) => {
      // Long enough to reach the centre from the hall wall when shut.
      const width = (side < 0 ? c.cx - c.xL : c.xR - c.cx) + 4
      const g = new Group()
      // The group sits on the wall's inner edge; the body extends outward.
      const body = new Mesh(new BoxGeometry(width, height, depth), metal)
      body.position.x = side * (width / 2)
      const plate = new Mesh(new BoxGeometry(1.2, height, depth + 0.4), stripes)
      plate.position.x = side * 0.6
      const spikes = new Mesh(spikeRow(height, depth, side < 0 ? 1 : -1), steel)
      for (const m of [body, plate, spikes]) {
        m.castShadow = true
        m.receiveShadow = true
      }
      g.add(body, plate, spikes)
      g.position.set(0, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2)
      group.add(g)
      return { g, side }
    })
    return { c, sides }
  })

  return {
    group,
    update(t) {
      for (const { c, sides } of walls) {
        const s = crusherState(c, t)
        // Rumble before the slam so players get a warning.
        const shake = s.warn > 0 ? Math.sin(t * 70) * 0.5 * s.warn : 0
        for (const { g, side } of sides) g.position.x = (side < 0 ? s.left : s.right) + shake
      }
    },
  }
}
