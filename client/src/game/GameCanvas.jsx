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
  const lowPower = useGame((s) => s.lowPower)
  if (lowPower) return null
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

/**
 * The picture never gets blurrier than the screen itself: a lower render
 * resolution is the drop people notice most, so it is the last thing to go.
 */
const minDpr = () => Math.min(1, window.devicePixelRatio || 1)

/**
 * Keeps the frame rate up on any PC. When frames get slow, a sharper-than-
 * native resolution (high-DPI screens) steps down toward native; if it is
 * still slow at native, the light mode switches off the glow pass and the
 * shadows - cheap to lose, and the picture stays sharp.
 */
function AdaptiveQuality({ maxDpr }) {
  useEffect(() => {
    const MIN_DPR = Math.min(maxDpr, minDpr())
    let dpr = maxDpr
    let frames = 0
    let since = performance.now()
    let calm = 0
    let slow = 0
    let slowAtMin = 0
    /** No sharpening again for a while after slowing down: avoids flip-flopping. */
    let holdUntil = 0
    // The Canvas renders at the store's value (it re-applies its dpr prop on every render).
    const setDpr = (v) => useGame.setState({ renderDpr: v })
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
        // Turned off in Settings: always the full look.
        if (!getGame().settings.autoPerf) {
          if (dpr !== maxDpr) setDpr((dpr = maxDpr))
          if (getGame().lowPower) useGame.setState({ lowPower: false })
          return
        }
        // A hidden tab stops frames for a while: that is not slowness.
        if (document.hidden || span > 2500) return
        if (fps < 50) {
          calm = 0
          slow += 1
          if (dpr > MIN_DPR && slow >= 2) {
            // Two slow seconds in a row: a bit less resolution.
            dpr = Math.max(MIN_DPR, Math.round((dpr - 0.1) * 100) / 100)
            setDpr(dpr)
            slow = 0
            holdUntil = now + 10000
          } else if (dpr <= MIN_DPR && fps < 40) {
            slowAtMin += 1
            if (slowAtMin >= 4 && !getGame().lowPower) {
              useGame.setState({ lowPower: true })
              getGame().toast('Smooth mode on: glow and shadows off so the game stays fast. You can change this in Settings.', 'info', 7000)
            }
          }
        } else if (fps > 57) {
          slow = 0
          slowAtMin = 0
          calm += 1
          if (calm >= 5 && dpr < maxDpr && now > holdUntil) {
            dpr = Math.min(maxDpr, Math.round((dpr + 0.05) * 100) / 100)
            setDpr(dpr)
            calm = 0
          }
        } else {
          slow = 0
          calm = 0
        }
        runtime.dpr = dpr
      },
    })
  }, [maxDpr])
  return null
}

/**
 * Sharpest render resolution per setting. Every setting is at least native
 * (1x) - Low saves its time elsewhere (no glow pass, fewer lights, smaller
 * shadow map). Capped because 2x on a 4K screen costs 4x for little gain.
 */
function maxDprFor(quality) {
  const screen = window.devicePixelRatio || 1
  if (quality === 'low') return Math.min(screen, 1)
  if (quality === 'medium') return Math.min(screen, 1.25)
  return Math.min(screen, 1.5)
}

/**
 * @param {{ identity: object, onReady?: () => void }} props
 */
export function GameCanvas({ identity, onReady }) {
  const quality = useGame((s) => s.settings.quality)
  const maxDpr = maxDprFor(quality)
  const dpr = Math.min(maxDpr, useGame((s) => s.renderDpr) ?? maxDpr)
  return (
    <Canvas
      className="game-canvas"
      shadows
      dpr={dpr}
      camera={{ fov: 70, near: 0.5, far: 2400, position: [0, 12, 60] }}
      // Antialiasing always on: the GL context is made once and settings can change mid-game.
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
    >
      <World />
      <Lighting quality={quality} />
      <LocalPlayer identity={identity} onReady={onReady} />
      <RemotePlayers />
      <GuideArrow />
      <EffectsLayer />
      <GameLoop />
      <AudioVolumes />
      <AdaptiveQuality maxDpr={maxDpr} />
      {quality !== 'low' && <PostFX />}
    </Canvas>
  )
}

export default GameCanvas
