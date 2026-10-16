import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useState } from 'react'
import { NeutralToneMapping } from 'three'

import { progressAt } from '../../../shared/world.js'
import { trackPresence } from '../bloxity/boxity.js'
import { getGame, useGame } from '../state/gameStore.js'
import { addSystem, runtime } from '../state/runtime.js'
import { audio } from './audio.js'
import { Effects } from './effects.js'
import GuideArrow from './GuideArrow.jsx'
import { endInputFrame, input, installInput } from './input.js'
import Lighting from './Lighting.jsx'
import LocalPlayer from './LocalPlayer.jsx'
import { CollisionWorld } from './physics.js'
import RemotePlayers from './RemotePlayers.jsx'
import { WorldView } from './worldView.js'

/** Static + animated level geometry, and the collision world built from the same data. */
function World() {
  const [view] = useState(() => new WorldView(runtime.world))

  useEffect(() => {
    runtime.collision = new CollisionWorld(runtime.world)
    runtime.worldView = view
    const g = getGame()
    if (g.profile) view.applyProfile(g.profile)
    view.applyBoards(g.boards)
    view.applyStock(g.moonlitStock)
    const remove = addSystem({ name: 'world', order: 5, update: (dt, t) => view.update(dt, t, runtime.local?.state) })
    const slow = setInterval(() => view.slowUpdate(Date.now()), 1000)
    return () => {
      remove()
      clearInterval(slow)
      runtime.worldView = null
      runtime.collision = null
    }
  }, [view])

  return <primitive object={view.root} />
}

function EffectsLayer() {
  const [effects] = useState(() => new Effects())
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    runtime.effects = effects
    const remove = addSystem({ name: 'effects', order: 40, update: (dt) => effects.update(dt, camera, gl.domElement.height) })
    return () => {
      remove()
      runtime.effects = null
    }
  }, [effects, camera, gl])
  return <primitive object={effects.group} />
}

/** Runs every system in a fixed order once per frame, then mirrors state to the HUD. */
function GameLoop() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    runtime.camera = camera
    runtime.gl = gl
    return installInput(gl.domElement)
  }, [camera, gl])

  useEffect(() => {
    let timer = 0
    return addSystem({
      name: 'hud-mirror',
      order: 50,
      update(dt) {
        timer -= dt
        if (timer > 0) return
        timer = 0.25
        const room = runtime.room
        if (!room?.state?.players) return
        const players = []
        const c = runtime.local?.state
        room.state.players.forEach((p, sid) => {
          const me = sid === runtime.sessionId
          // Our own head follows local movement instead of waiting for the server.
          const progress = me && c ? progressAt(runtime.world, c.x, c.y, c.z) : p.progress
          players.push({ id: sid, name: p.name, pfp: p.pfp, progress, level: p.level, rebirths: p.rebirths, trophies: p.trophies, vip: p.vip, racing: p.racing, me })
        })
        const r = room.state.race
        const prevRace = getGame().race
        const race = { ...prevRace, phase: r.phase, endsAt: r.endsAt, startAt: r.startAt, racers: r.racers }
        if (r.phase === 'idle' && prevRace.phase !== 'idle') race.joined = false
        useGame.setState({ players, race })
        // Boxity friend-join toasts.
        trackPresence(players.filter((p) => !p.me).map((p) => p.name))
      },
    })
  }, [])

  useFrame((state, delta) => {
    // Simulation systems sub-step on slow frames so a low frame rate doesn't
    // slow the game down; presentation systems run once per frame.
    const total = Math.min(delta, 0.15)
    const steps = Math.max(1, Math.ceil(total / (1 / 30)))
    const dt = total / steps
    const race = runtime.room?.state?.race
    if (runtime.collision) runtime.collision.raceGateClosed = race?.phase !== 'running'
    runtime.worldView?.setRaceGateOpen(race?.phase === 'running')
    const now = runtime.worldTime()
    const cpuStart = performance.now()
    for (let i = 0; i < steps; i += 1) {
      const t = now - (steps - 1 - i) * dt
      runtime.collision?.update(t)
      for (const system of runtime.systems) if (system.fixed) system.update(dt, t, state)
      input.jumpPressed = false
    }
    for (const system of runtime.systems) if (!system.fixed) system.update(total, now, state)
    endInputFrame()
    // Game-logic cost per frame (ms), smoothed - read by the performance tests.
    runtime.cpuMs = (runtime.cpuMs || 0) * 0.95 + (performance.now() - cpuStart) * 0.05
  })
  return null
}

/** Glow + vignette. 2x MSAA and a 6-level half-resolution bloom: the High look at a fraction of the cost. */
function PostFX() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom mipmapBlur levels={6} resolutionScale={0.5} luminanceThreshold={0.8} luminanceSmoothing={0.25} intensity={0.7} />
      <Vignette offset={0.3} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}

function AudioVolumes() {
  const music = useGame((s) => s.settings.musicVolume)
  const sfx = useGame((s) => s.settings.sfxVolume)
  const master = useGame((s) => s.settings.masterVolume)
  const muted = useGame((s) => s.settings.muted)
  useEffect(() => audio.setVolumes(music, sfx, muted ? 0 : master), [music, sfx, master, muted])
  return null
}

const MIN_DPR = 0.65

/**
 * Keeps the frame rate up on any PC. When frames get slow the render
 * resolution steps down a little (to 65% at most) and comes back when there
 * is room again; bloom, shadows and lights stay on, so "High" still looks like
 * High on a low-end laptop. Only if it is still slow at the lowest
 * resolution does it switch to the lighter mode (no glow / shadows).
 */
function AdaptiveQuality({ maxDpr }) {
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    let dpr = maxDpr
    let frames = 0
    let since = performance.now()
    let calm = 0
    let slowAtMin = 0
    setDpr(dpr)
    runtime.dpr = dpr
    return addSystem({
      name: 'adaptive-quality',
      order: 60,
      update() {
        frames += 1
        const now = performance.now()
        const span = now - since
        if (span < 1000) return
        const fps = (frames * 1000) / span
        frames = 0
        since = now
        runtime.fps = fps
        // A hidden tab stops frames for a while: that is not slowness.
        if (document.hidden || span > 2500) return
        if (fps < 50 && dpr > MIN_DPR) {
          dpr = Math.max(MIN_DPR, Math.round((dpr - 0.1) * 100) / 100)
          setDpr(dpr)
          calm = 0
        } else if (fps < 40) {
          slowAtMin += 1
          if (slowAtMin >= 4 && !getGame().lowPower) useGame.setState({ lowPower: true })
        } else if (fps > 57) {
          slowAtMin = 0
          calm += 1
          if (calm >= 3 && dpr < maxDpr) {
            dpr = Math.min(maxDpr, Math.round((dpr + 0.05) * 100) / 100)
            setDpr(dpr)
            calm = 0
          }
        } else {
          calm = 0
        }
        runtime.dpr = dpr
      },
    })
  }, [maxDpr, setDpr])
  return null
}

/** Sharpest render resolution per setting (capped: 2x on a 4K screen costs 4x for little gain). */
function maxDprFor(quality) {
  const screen = window.devicePixelRatio || 1
  if (quality === 'low') return 0.75
  if (quality === 'medium') return Math.min(screen, 1.25)
  return Math.min(screen, 1.5)
}

/**
 * @param {{ identity: object, onReady?: () => void }} props
 */
export function GameCanvas({ identity, onReady }) {
  const quality = useGame((s) => s.settings.quality)
  const lowPower = useGame((s) => s.lowPower)
  const maxDpr = maxDprFor(quality)
  return (
    <Canvas
      className="game-canvas"
      shadows={quality !== 'low'}
      dpr={maxDpr}
      camera={{ fov: 70, near: 0.5, far: 2400, position: [0, 12, 60] }}
      gl={{ antialias: quality !== 'high', powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
    >
      <World />
      <Lighting quality={quality} shadows={quality !== 'low' && !lowPower} />
      <LocalPlayer identity={identity} onReady={onReady} />
      <RemotePlayers />
      <GuideArrow />
      <EffectsLayer />
      <GameLoop />
      <AudioVolumes />
      <AdaptiveQuality maxDpr={maxDpr} />
      {quality === 'high' && !lowPower && <PostFX />}
    </Canvas>
  )
}

export default GameCanvas
