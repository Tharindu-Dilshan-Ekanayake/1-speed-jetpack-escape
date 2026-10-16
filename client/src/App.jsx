import { Component, useCallback, useEffect, useRef } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import { getToken } from './bloxity/boxity.js'
import { audio } from './game/audio.js'
import GameCanvas from './game/GameCanvas.jsx'
import { input } from './game/input.js'
import { installBoxityFeatures } from './net/boxityGame.js'
import { connect, rejoin } from './net/connection.js'
import { useGame } from './state/gameStore.js'
import { runtime } from './state/runtime.js'
import HUD from './ui/HUD.jsx'

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) window.__jetpack = { runtime, useGame, input }

/** Canvas text needs the web fonts before signs are painted. */
async function loadFonts() {
  if (!document.fonts?.load) return
  await Promise.race([
    Promise.all([document.fonts.load("700 48px 'Fredoka'"), document.fonts.load("400 48px 'Luckiest Guy'")]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]).catch(() => {})
}

/** A crash in the 3D scene shows a reload card instead of a blank page. */
class SceneBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.error('[app] the game scene crashed:', err)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="overlay">
        <div className="box">
          <div className="tx title-font" style={{ fontSize: 44 }}>
            Oops!
          </div>
          <div className="tx tx-sm" style={{ fontSize: 18 }}>
            Something went wrong. Your progress is saved.
          </div>
          <button className="play-btn pressable tx title-font" style={{ fontSize: 40, height: 76 }} onClick={() => window.location.reload()}>
            RELOAD
          </button>
        </div>
      </div>
    )
  }
}

/** How long to wait for a saved Boxity login to be restored before joining as a guest. */
const LOGIN_RESTORE_MS = 2500

/**
 * No title screen: the world renders straight away and we join as soon as we
 * know who the player is - their Boxity account if they have one, otherwise
 * their guest account. There is no log-out.
 */
function App() {
  const { identity, isLoggedIn, avatar, proportions, game, status, user } = useBloxity()
  const phase = useGame((s) => s.phase)
  const error = useGame((s) => s.error)
  const reconnecting = useGame((s) => s.reconnecting)
  const joinStatus = useGame((s) => s.joinStatus)
  const loadingEnded = useRef(false)
  const started = useRef(false)

  // Once the SDK is up: subscribe to the portal's settings, events and chat
  // (before the loading screen ends, so the first push isn't missed), then
  // drop Boxity's loading overlay - the game itself is on screen.
  useEffect(() => {
    if (loadingEnded.current || status === 'loading' || status === 'idle') return
    loadingEnded.current = true
    if (status === 'ready') installBoxityFeatures()
    game.loadingEnd()
  }, [status, game])

  // Browsers only allow sound after the first tap or key press.
  useEffect(() => {
    const unlock = () => audio.init()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const makeIdentity = useCallback(
    () => ({
      token: isLoggedIn ? getToken() : undefined,
      name: identity?.displayName || identity?.username || 'Guest',
      pfp: identity?.pfp,
      avatar: { equipped: avatar || {}, proportions: proportions || {} },
    }),
    [identity, isLoggedIn, avatar, proportions],
  )

  const play = useCallback(async () => {
    useGame.setState({ phase: 'connecting', error: null, joinStatus: null })
    try {
      await loadFonts()
      await connect(makeIdentity(), { onWait: (msg) => useGame.setState({ joinStatus: msg }) })
      useGame.setState({ phase: 'playing', joinStatus: null })
    } catch (err) {
      console.error('[app] connect failed', err)
      useGame.setState({ phase: 'error', joinStatus: null, error: `Could not join the game server (${err?.message || err}).` })
    }
  }, [makeIdentity])

  // Join automatically: right away when signed in (or with no saved login),
  // otherwise give a saved login a moment to come back first.
  useEffect(() => {
    if (started.current || status === 'loading' || status === 'idle') return undefined
    const savedLogin = status === 'ready' && !isLoggedIn && !!getToken()
    const t = setTimeout(
      () => {
        if (started.current) return
        started.current = true
        play()
      },
      savedLogin ? LOGIN_RESTORE_MS : 150,
    )
    return () => clearTimeout(t)
  }, [status, isLoggedIn, play])

  // Signing in mid-game (e.g. from the Boxity portal) changes who you are:
  // rejoin the SAME room as the account (never re-matchmake - that would pull
  // you away from friends).
  const userId = user?._id || null
  const lastUser = useRef(userId)
  useEffect(() => {
    if (lastUser.current === userId) return
    lastUser.current = userId
    if (useGame.getState().phase !== 'playing') return
    rejoin(makeIdentity()).catch((err) => {
      console.error('[app] rejoin failed', err)
      useGame.setState({ phase: 'error', error: 'Could not rejoin after signing in.' })
    })
  }, [userId, makeIdentity])

  const name = identity?.displayName || identity?.username || 'Player'

  return (
    <div className="game-root">
      <SceneBoundary>
        <GameCanvas identity={{ name, equipped: avatar || {}, proportions: proportions || {} }} />
      </SceneBoundary>
      {phase === 'playing' && <HUD />}
      {phase === 'connecting' && (
        <div className="joining tx tx-sm">
          <span className="spinner" />
          {joinStatus || (isLoggedIn ? `Joining as ${name}...` : 'Joining...')}
        </div>
      )}
      {reconnecting && phase === 'playing' && (
        <div className="joining tx tx-sm">
          <span className="spinner" />
          Reconnecting...
        </div>
      )}
      {phase === 'error' && (
        <div className="overlay">
          <div className="box">
            <div className="tx title-font" style={{ fontSize: 44 }}>
              Disconnected
            </div>
            <div className="tx tx-sm" style={{ fontSize: 18 }}>
              {error}
            </div>
            <button className="play-btn pressable tx title-font" style={{ fontSize: 40, height: 76 }} onClick={() => window.location.reload()}>
              REJOIN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
