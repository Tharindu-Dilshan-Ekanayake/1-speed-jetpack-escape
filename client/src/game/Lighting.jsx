import { useEffect, useRef } from 'react'
import { Color } from 'three'

import { addSystem, runtime } from '../state/runtime.js'

/** Real point lights placed at the nearest torches / lava glows. Each one costs every pixel. */
const POOL_SIZE = { high: 4, medium: 3, low: 2 }
const LOBBY = runtime.world.zones.find((z) => z.kind === 'lobby')

/**
 * Lighting follows the zone the player is in: fog colour/density, sky and
 * ground tints all ease toward the current room's theme. Torches and lava
 * glows are served from a small pool of point lights placed at the sources
 * nearest the player (hundreds of lights in the data, six real ones).
 */
export function Lighting({ quality, shadows = quality !== 'low' }) {
  const hemi = useRef(null)
  const sun = useRef(null)
  const fog = useRef(null)
  const background = useRef(null)
  const pool = useRef([])

  useEffect(() => {
    const fogColor = new Color(LOBBY.fog)
    const skyColor = new Color(LOBBY.hemiSky)
    const groundColor = new Color(LOBBY.hemiGround)
    const target = new Color()
    let density = LOBBY.fogDensity
    let hemiI = LOBBY.hemi
    let sunI = LOBBY.sun
    let poolTimer = 0
    const lights = runtime.world.lights

    return addSystem({
      name: 'lighting',
      order: 30,
      update(dt) {
        const zone = runtime.zone || LOBBY
        const k = 1 - Math.exp(-2.5 * dt)
        fogColor.lerp(target.set(zone.fog), k)
        skyColor.lerp(target.set(zone.hemiSky), k)
        groundColor.lerp(target.set(zone.hemiGround), k)
        density += (zone.fogDensity - density) * k
        hemiI += (zone.hemi - hemiI) * k
        sunI += (zone.sun - sunI) * k
        if (fog.current) {
          fog.current.color.copy(fogColor)
          fog.current.density = density
        }
        background.current?.copy(fogColor)
        if (hemi.current) {
          hemi.current.color.copy(skyColor)
          hemi.current.groundColor.copy(groundColor)
          hemi.current.intensity = hemiI * 1.15
        }
        const c = runtime.local?.state
        if (!c) return
        if (sun.current) {
          sun.current.intensity = sunI * 1.6
          sun.current.position.set(c.x + 45, c.y + 110, c.z + 35)
          sun.current.target.position.set(c.x, c.y, c.z)
          sun.current.target.updateMatrixWorld()
        }
        poolTimer -= dt
        if (poolTimer > 0) return
        poolTimer = 0.3
        const near = []
        for (const l of lights) {
          const dx = l.pos[0] - c.x
          const dz = l.pos[2] - c.z
          const d = dx * dx + dz * dz
          if (d < (l.distance * 2.5) ** 2) near.push([d, l])
        }
        near.sort((a, b) => a[0] - b[0])
        pool.current.forEach((pl, i) => {
          const entry = near[i]?.[1]
          if (!pl) return
          if (!entry) {
            pl.intensity = 0
            return
          }
          pl.position.set(entry.pos[0], entry.pos[1], entry.pos[2])
          pl.color.set(entry.color)
          pl.distance = entry.distance
          pl.intensity = entry.intensity * entry.distance * 0.32
        })
      },
    })
  }, [])

  const mapSize = quality === 'high' ? 2048 : 1024
  const poolSize = POOL_SIZE[quality] || 3
  return (
    <>
      <fogExp2 ref={fog} attach="fog" args={[LOBBY.fog, LOBBY.fogDensity]} />
      <color ref={background} attach="background" args={[LOBBY.fog]} />
      <hemisphereLight ref={hemi} args={['#e6e2ff', '#7c74d6', 1.2]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        intensity={1.4}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
      />
      {Array.from({ length: poolSize }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            pool.current[i] = el
          }}
          intensity={0}
          distance={100}
          decay={1}
        />
      ))}
    </>
  )
}

export default Lighting
