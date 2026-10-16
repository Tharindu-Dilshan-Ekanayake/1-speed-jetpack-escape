import { useEffect, useMemo, useRef, useState } from 'react'

import { CHAT, QUESTS, RACE, SKIN_BY_ID, STAGES, levelCap, levelProgress, rebirthMultiplier, speedForLevel, squadMultiplier } from '../../../shared/config.js'
import { formatClock, formatMult, formatNumber } from '../../../shared/format.js'
import { useBloxity } from '../bloxity/BloxityContext'
import { isEmbedded, showPortalMenu } from '../bloxity/boxity.js'
import { audio } from '../game/audio.js'
import { KEY_OF, emitAction, input, onAction } from '../game/input.js'
import { send } from '../net/connection.js'
import { getGame, useClock, useGame } from '../state/gameStore.js'
import { runtime } from '../state/runtime.js'
import {
  BagIcon,
  ChevronRankIcon,
  CoinIcon,
  CrownIcon,
  FuelIcon,
  GearIcon,
  GlobeIcon,
  QuestIcon,
  RebirthIcon,
  ShoeIcon,
  SoundIcon,
  TrophyIcon,
  UsersIcon,
} from './Icons.jsx'
import { Panels } from './panels.jsx'
import { SpeedLines } from './SpeedLines.jsx'

const click = () => audio.play('click')
const IS_TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

/**
 * The HUD is laid out for a 1500 x 860 screen (1350 x 800 on touch, for
 * bigger thumbs). Smaller windows and phones get the same layout scaled down
 * as one piece - buttons, bars and text together - so nothing overlaps.
 */
function hudScale() {
  const [w, h] = IS_TOUCH ? [1350, 800] : [1500, 860]
  const s = Math.min(window.innerWidth / w, window.innerHeight / h)
  return Math.max(0.4, Math.min(1, Math.round(s * 1000) / 1000))
}

/** The shortcut key, drawn in a button's top-left corner (hidden on touch screens). */
const KeyBadge = ({ k }) => (k ? <span className="key-badge tx-sm">{k}</span> : null)

/* ------------------------------------------------------------------------ */
/* Top: stage progress track with every player's head                        */
/* ------------------------------------------------------------------------ */

const TRACK_MAX = STAGES.length + 0.3
const trackX = (p) => `${(Math.max(0, Math.min(TRACK_MAX, p)) / TRACK_MAX) * 100}%`

function Head({ player }) {
  return (
    <div className={`stage-head tx tx-sm ${player.me ? 'me' : ''}`} style={{ left: trackX(player.progress) }} title={player.name}>
      {player.pfp ? <img src={player.pfp} alt="" draggable={false} /> : player.name.charAt(0).toUpperCase()}
    </div>
  )
}

function StageTrack() {
  const players = useGame((s) => s.players)
  const best = useGame((s) => s.profile?.bestStage || 0)
  const me = players.find((p) => p.me)
  return (
    <div className="stage-track">
      <div className="line" />
      <div className="fill" style={{ width: trackX(me?.progress || 0) }} />
      {STAGES.map((s) => (
        <div key={s.id} className={`stage-node tx tx-sm ${best >= s.id ? 'done' : ''}`} style={{ left: trackX(s.id) }} title={s.name}>
          {s.id}
        </div>
      ))}
      {players
        .filter((p) => !p.me)
        .map((p) => (
          <Head key={p.id} player={p} />
        ))}
      {me && <Head player={me} />}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Left: Wins, coins, Rebirth / Worlds / Shop, daily quests                  */
/* ------------------------------------------------------------------------ */

function RebirthArrow() {
  return (
    <svg className="rebirth-arrow" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M8 50 L48 12 L48 32 L92 32 L92 68 L48 68 L48 88 Z" fill="#ff2a2a" stroke="#16122b" strokeWidth="6" strokeLinejoin="round" />
      <path d="M22 50 L44 30" stroke="#ff8080" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

function MenuButton({ label, k, icon, onClick, badge, className = '' }) {
  return (
    <button className={`menu-btn pressable ${className}`} onClick={onClick} aria-label={label} title={k ? `${label} (${k})` : label}>
      {icon}
      <span className="label tx">{label}</span>
      <KeyBadge k={k} />
      {badge && <span className="badge-dot" />}
    </button>
  )
}

function LeftMenu() {
  const profile = useGame((s) => s.profile)
  const toggle = useGame((s) => s.togglePanel)
  if (!profile) return null
  const canRebirth = profile.level >= levelCap(profile.rebirths)
  const open = (name) => () => {
    click()
    toggle(name)
  }
  return (
    <div className="left-menu">
      <div className="currency tx" title="Wins - earned by escaping stages. Buy everything with them!">
        <TrophyIcon size={58} />
        {formatNumber(profile.trophies)}
        <span className="cur-label tx-sm">WINS</span>
      </div>
      <div className="currency coins tx" title="Coins - collect them along the stages">
        <CoinIcon size={46} />
        {formatNumber(profile.coins)}
        <span className="cur-label tx-sm">COINS</span>
      </div>
      <div className="currency rebirths tx" title={`Rebirths - each one adds x0.5 steps. Now x${rebirthMultiplier(profile.rebirths)}`}>
        <RebirthIcon size={46} />
        {formatNumber(profile.rebirths)}
        <span className="cur-label tx-sm">REBIRTHS</span>
      </div>
      <div className="menu-col">
        <MenuButton label="Rebirth" k={KEY_OF.rebirth} icon={<RebirthIcon size={58} />} onClick={open('rebirth')} badge={canRebirth} className="rebirth" />
        <MenuButton label="Worlds" k={KEY_OF.worlds} icon={<GlobeIcon size={56} />} onClick={open('worlds')} className="worlds" />
        <MenuButton label="Shop" k={KEY_OF.shop} icon={<BagIcon size={52} />} onClick={open('shop')} className="shop" />
        {canRebirth && <RebirthArrow />}
      </div>
    </div>
  )
}

function questProgressText(q) {
  if (q.type === 'treadmill') return `${formatClock(q.progress)} / ${formatClock(q.goal)}`
  if (q.type === 'fly') return `${Math.floor(q.progress)}s / ${q.goal}s`
  return `${formatNumber(q.progress)} / ${formatNumber(q.goal)}`
}

/** Today's three quests: progress fills as you play, rewards pay out by themselves. */
function QuestTracker() {
  const quests = useGame((s) => s.profile?.quests)
  const [open, setOpen] = useState(!IS_TOUCH)
  if (!quests?.list?.length) return null
  const done = quests.list.filter((q) => q.claimed).length
  return (
    <div className={`quest-card ${open ? 'open' : ''}`}>
      <button className="quest-head tx tx-sm" onClick={() => (click(), setOpen(!open))} aria-expanded={open}>
        <QuestIcon size={26} />
        <span>Daily Quests</span>
        <span className={`quest-count ${done === 3 ? 'all' : ''}`}>{done}/3</span>
      </button>
      {open &&
        quests.list.map((q, i) => (
          <div key={i} className={`quest ${q.claimed ? 'done' : ''}`}>
            <div className="q-label tx-sm">
              {q.claimed ? '✔ ' : ''}
              {QUESTS[q.type]?.label(q.goal) || q.type}
            </div>
            <div className="q-bar">
              <div className="q-fill" style={{ width: `${Math.min(100, (q.progress / q.goal) * 100)}%` }} />
              <span className="q-num tx-sm">{q.claimed ? 'Done!' : questProgressText(q)}</span>
            </div>
            <div className="q-reward tx-sm">
              <TrophyIcon size={15} /> {formatNumber(q.wins)} <CoinIcon size={14} /> {q.coins}
            </div>
          </div>
        ))}
      {open && <div className="quest-foot tx-sm">{quests.bonusClaimed ? 'All done! New quests at midnight.' : 'Finish all 3: +100 coins & x2 steps!'}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Right: settings, sound, speed                                             */
/* ------------------------------------------------------------------------ */

function CornerButtons() {
  const muted = useGame((s) => s.settings.muted)
  const update = useGame((s) => s.updateSettings)
  const toggle = useGame((s) => s.togglePanel)
  return (
    <div className="corner-btns">
      <button className="menu-btn small pressable" onClick={() => (click(), toggle('settings'))} aria-label="Settings" title={`Settings (${KEY_OF.settings})`}>
        <GearIcon size={34} />
        <KeyBadge k={KEY_OF.settings} />
      </button>
      <button
        className={`menu-btn small pressable sound ${muted ? 'muted' : ''}`}
        onClick={() => update({ muted: !muted })}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        title={`Sound ${muted ? 'off' : 'on'} (${KEY_OF.mute})`}
      >
        <SoundIcon size={34} muted={muted} />
        <KeyBadge k={KEY_OF.mute} />
      </button>
    </div>
  )
}

/** Cap your speed below your level for precise jumps: Z slower, X faster, C full speed. */
function SpeedControl() {
  const level = useGame((s) => s.profile?.level || 1)
  const limit = useGame((s) => s.speedLimit)
  const value = limit ? Math.min(limit, level) : level
  useEffect(() => {
    const set = (v) => {
      const lvl = getGame().profile?.level || 1
      useGame.setState({ speedLimit: v >= lvl ? null : Math.max(1, v) })
    }
    const current = () => {
      const g = getGame()
      const lvl = g.profile?.level || 1
      return { lvl, cur: g.speedLimit ? Math.min(g.speedLimit, lvl) : lvl, step: Math.max(1, Math.round(lvl * 0.1)) }
    }
    const offs = [
      onAction('slower', () => {
        const { cur, step } = current()
        set(cur - step)
      }),
      onAction('faster', () => {
        const { cur, step } = current()
        set(cur + step)
      }),
      onAction('fullSpeed', () => useGame.setState({ speedLimit: null })),
    ]
    return () => offs.forEach((off) => off())
  }, [])
  const step = Math.max(1, Math.round(level * 0.1))
  const set = (v) => useGame.setState({ speedLimit: v >= level ? null : Math.max(1, v) })
  return (
    <div className={`speed-control ${limit ? 'limited' : ''}`}>
      <div className="sc-readout">
        <span className="sc-title tx tx-sm">SPEED</span>
        <span className="sc-value tx">{speedForLevel(value)}</span>
      </div>
      <button className="sc-btn pressable tx" onClick={() => (click(), set(value - step))} aria-label="Slower">
        −<KeyBadge k={KEY_OF.slower} />
      </button>
      <div className="sc-slider" title={limit ? `Limited to ${speedForLevel(value)} of ${speedForLevel(level)}` : 'Full speed'}>
        <div className="fill" style={{ width: `${(value / level) * 100}%` }} />
        <input type="range" min={1} max={level} value={value} onChange={(e) => set(Number(e.target.value))} aria-label="Speed limit" />
      </div>
      <button className="sc-btn pressable tx" onClick={() => (click(), set(value + step))} aria-label="Faster">
        +<KeyBadge k={KEY_OF.faster} />
      </button>
      <button className="sc-max pressable tx tx-sm" onClick={() => (click(), useGame.setState({ speedLimit: null }))} disabled={!limit}>
        MAX
        <KeyBadge k={KEY_OF.fullSpeed} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Bottom: multipliers, level bar, fuel bar                                  */
/* ------------------------------------------------------------------------ */

function BottomHUD() {
  const profile = useGame((s) => s.profile)
  const fuel = useGame((s) => s.fuel)
  const now = useClock((s) => s.now) + runtime.timeOffset
  if (!profile) return null
  const prog = levelProgress(profile.level, profile.steps, profile.rebirths)
  const pct = Math.min(100, (prog.current / Math.max(1, prog.needed)) * 100)
  const skinMult = (SKIN_BY_ID[profile.skin]?.mult || 1) * (profile.passes.x2_steps ? 2 : 1)
  const boostLeft = (profile.boostUntil || 0) - now
  return (
    <div className="bottom-hud">
      <div className="mult-row">
        <div className="mult-pill tx" title="Skin & pass step multiplier">
          <ChevronRankIcon size={40} />
          {formatMult(skinMult)}
        </div>
        <div className="mult-pill tx" title="Rebirth step multiplier">
          <RebirthIcon size={40} />
          {formatMult(rebirthMultiplier(profile.rebirths))}
        </div>
        {boostLeft > 0 && (
          <div className="mult-pill boost tx" title="x2 steps boost">
            <ShoeIcon size={38} />
            x2 · {formatClock(boostLeft / 1000)}
          </div>
        )}
        {profile.squad > 0 && (
          <div className="mult-pill squad tx" title="+10% steps for every other player in your server">
            <UsersIcon size={28} />+{Math.round((squadMultiplier(profile.squad) - 1) * 100)}%
          </div>
        )}
      </div>
      <div className={`bar ${prog.maxed ? 'maxed' : ''}`} title={`Speed ${speedForLevel(profile.level)} - ${formatNumber(profile.stepsPerStep)} steps per step`}>
        <div className="bar-icon">
          <ShoeIcon size={80} />
        </div>
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="text tx">
          <span>Level {profile.level}</span>
          <span>
            {formatNumber(prog.current)}/{formatNumber(prog.needed)}
          </span>
        </div>
      </div>
      <div className="bar fuel">
        <div className="bar-icon">
          <FuelIcon size={66} />
        </div>
        <div className="fill" style={{ width: `${(fuel.cur / Math.max(1, fuel.max)) * 100}%` }} />
        <div className="text tx">
          {fuel.cur}/{fuel.max}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

function Banner() {
  const banner = useGame((s) => s.banner)
  if (!banner) return null
  return (
    <div className="banner">
      <div key={banner.id} className={`banner-inner tx ${banner.kind}`}>
        {banner.text}
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tx tx-sm ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

function Prompt() {
  const prompt = useGame((s) => s.prompt)
  if (!prompt) return null
  const act = () => emitAction('interact')
  return (
    <button className={`prompt ${prompt.disabled ? 'disabled' : ''}`} onClick={act}>
      <div className="key tx">{IS_TOUCH ? 'TAP' : 'E'}</div>
      <div className="lines">
        <span className="title tx tx-sm">{prompt.title}</span>
        <span className={`action tx ${prompt.short ? 'short' : ''}`}>
          {prompt.action}
          {prompt.price?.trophies !== undefined && (
            <>
              <TrophyIcon size={26} />
              {formatNumber(prompt.price.trophies)} Wins
            </>
          )}
        </span>
        {prompt.sub && <span className="title tx tx-sm">{prompt.sub}</span>}
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------------ */
/* Races                                                                     */
/* ------------------------------------------------------------------------ */

function RaceUI() {
  const race = useGame((s) => s.race)
  const level = useGame((s) => s.profile?.level || 0)
  const me = useGame((s) => s.players.find((p) => p.me))
  const [dismissed, setDismissed] = useState(0)
  const lastBeep = useRef(null)
  const now = useClock((s) => s.now) + runtime.timeOffset

  // Countdown beeps.
  useEffect(() => {
    if (race.phase !== 'countdown' || !me?.racing) return
    const left = Math.ceil((race.startAt - now) / 1000)
    if (left !== lastBeep.current && left >= 1 && left <= 3) {
      lastBeep.current = left
      audio.play('beep')
    }
  })
  useEffect(() => {
    if (race.phase === 'running' && me?.racing) audio.play('beep', { go: true })
  }, [race.phase, me?.racing])
  useEffect(() => {
    if (!race.results) return undefined
    const id = setTimeout(() => useGame.setState((s) => ({ race: { ...s.race, results: null } })), 7000)
    return () => clearTimeout(id)
  }, [race.results])

  if (race.results) {
    return (
      <div className="race-invite" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 300 }}>
        <div className="tx title-font" style={{ fontSize: 30, textAlign: 'center' }}>
          Race Results
        </div>
        {race.results.length === 0 && <div className="tx tx-sm">Nobody finished!</div>}
        {race.results.map((r) => (
          <div key={r.place} className="tx tx-sm" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 18 }}>
            <span>
              #{r.place} {r.name}
            </span>
            <span>
              {r.time.toFixed(2)}s · <CoinIcon size={16} /> +{r.coins}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (race.phase === 'invite' && !race.joined && dismissed !== race.endsAt) {
    const left = Math.max(0, Math.ceil((race.endsAt - now) / 1000))
    const eligible = level >= RACE.MIN_LEVEL
    return (
      <div className="race-invite">
        <div className="race-reward tx tx-sm">
          <span>1st</span>
          <CoinIcon size={40} />
          <span>+{RACE.REWARDS[0]}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="tx" style={{ fontSize: 22, maxWidth: 260 }}>
            A race is starting in {left} seconds. Join?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`race-btn tx pressable ${eligible ? '' : 'locked'}`}
              disabled={!eligible}
              onClick={() => {
                click()
                send('raceJoin')
                useGame.setState((s) => ({ race: { ...s.race, joined: true } }))
              }}
            >
              {eligible ? 'JOIN' : `Lvl. ${RACE.MIN_LEVEL}`}
            </button>
            <button className="race-btn no pressable" onClick={() => (click(), setDismissed(race.endsAt))}>
              NO
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (me?.racing && race.phase === 'countdown') {
    const left = Math.ceil((race.startAt - now) / 1000)
    return (
      <div key={left} className="countdown tx title-font">
        {left > 3 ? 'GET READY' : Math.max(1, left)}
      </div>
    )
  }
  if (me?.racing && race.phase === 'running') {
    const t = (now - race.startAt) / 1000
    return (
      <>
        {t < 1.2 && <div className="countdown tx title-font">GO!</div>}
        <div className="race-timer tx">
          <span className="title-font">RACE</span> {t.toFixed(1)}s · {formatClock((race.endsAt - now) / 1000)} left
        </div>
      </>
    )
  }
  return null
}

/* ------------------------------------------------------------------------ */
/* Player list (Tab), chat (Enter)                                           */
/* ------------------------------------------------------------------------ */

function PlayerList() {
  const show = useGame((s) => s.showPlayerList)
  const players = useGame((s) => s.players)
  useEffect(() => onAction('playerList', () => useGame.setState((s) => ({ showPlayerList: !s.showPlayerList }))), [])
  const sorted = useMemo(() => [...players].sort((a, b) => b.rebirths - a.rebirths || b.level - a.level), [players])
  if (!show) return null
  return (
    <div className="player-list tx tx-sm">
      <div className="row head">
        <span>Players ({players.length})</span>
        <span>Level</span>
        <span>Reb.</span>
        <span>Wins</span>
      </div>
      {sorted.map((p) => (
        <div key={p.id} className={`row ${p.me ? 'me' : ''}`}>
          <span className="name">
            {p.vip ? <CrownIcon size={14} /> : null} {p.name}
          </span>
          <span>{p.level}</span>
          <span>{p.rebirths}</span>
          <span>{formatNumber(p.trophies)}</span>
        </div>
      ))}
    </div>
  )
}

function Chat() {
  const chat = useGame((s) => s.chat)
  const open = useGame((s) => s.chatOpen)
  const show = useGame((s) => s.settings.showChat)
  const [text, setText] = useState('')
  const now = useClock((s) => s.now)
  const inputRef = useRef(null)
  useEffect(() => onAction('chat', () => useGame.setState({ chatOpen: true })), [])
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  if (!show) return null
  const visible = chat.filter((m) => open || now - m.at < 20000).slice(-6)
  if (!visible.length && !open) return null
  const submit = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (t) send('chat', { text: t.slice(0, CHAT.MAX_LENGTH) })
    setText('')
    useGame.setState({ chatOpen: false })
    inputRef.current?.blur()
  }
  return (
    <div className="chat">
      {visible.map((m) => (
        <div key={m.id} className="msg tx-sm">
          <b>{m.name}:</b> {m.text}
        </div>
      ))}
      {open && (
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={text}
            maxLength={CHAT.MAX_LENGTH}
            placeholder="Say something... (Enter to send)"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => !text && useGame.setState({ chatOpen: false })}
          />
        </form>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* First-time guide: where to go next, with a 3D arrow in the world          */
/* ------------------------------------------------------------------------ */

const W = runtime.world
const boxCenter = (b) => [(b.min[0] + b.max[0]) / 2, b.max[1] + 1, (b.min[2] + b.max[2]) / 2]
const GUIDE_TARGETS = {
  treadmill: W.treadmills.find((t) => t.type === 'normal')?.pos,
  door: [0, 2, W.stages[0].zStart - 6],
  pad: (() => {
    const pad = W.pads.find((p) => p.stage === 1 && !p.vip)
    return pad && boxCenter(pad)
  })(),
  jetpack: W.pedestals.find((p) => p.id === 'jp2')?.pos,
}
const GUIDE_STEPS = 5
const SPACE = IS_TOUCH ? <b>JUMP</b> : <kbd>Space</kbd>
const E_KEY = IS_TOUCH ? <b>tap the button</b> : <kbd>E</kbd>

function guideStep(profile, zoneKind) {
  if (profile.tutorialDone) return null
  if (zoneKind === 'stage') {
    if (profile.bestStage > 0) return null
    return { n: 3, target: 'pad', text: <>Jump, then <b>hold</b> {SPACE} to fly with your jetpack! Grab the coins, don&apos;t touch the lava.</> }
  }
  if (zoneKind === 'reward') return { n: 4, target: 'pad', text: <>Step on the <b>yellow pad</b> to collect your Wins!</> }
  if (profile.bestStage === 0) {
    if (profile.level < 3) return { n: 1, target: 'treadmill', text: <>Run around or stand on a treadmill to earn steps - every level makes you <b>faster</b>!</> }
    return { n: 2, target: 'door', text: <>Go through the <b>STAGE 1</b> door and escape over the lava!</> }
  }
  if (profile.jetpacks.length === 1) {
    if (profile.trophies >= 3) return { n: 5, target: 'jetpack', text: <>You have <b>{formatNumber(profile.trophies)} Wins</b>! Buy <b>Jetpack 2</b> (3 Wins) at the JETPACKS wall - {E_KEY}.</> }
    return { n: 5, target: 'door', text: <>Escape Stage 1 again to earn <b>3 Wins</b> for Jetpack 2!</> }
  }
  return null
}

function Guide() {
  const profile = useGame((s) => s.profile)
  const panel = useGame((s) => s.panel)
  const [zoneKind, setZoneKind] = useState('lobby')
  useEffect(() => {
    const id = setInterval(() => setZoneKind(runtime.zone?.kind || 'lobby'), 400)
    return () => clearInterval(id)
  }, [])
  const step = profile ? guideStep(profile, zoneKind) : null
  const target = step?.target || null
  useEffect(() => {
    runtime.guide = target ? GUIDE_TARGETS[target] || null : null
    return () => {
      runtime.guide = null
    }
  }, [target])
  // Bought Jetpack 2 after a first escape (or got further some other way): done.
  const finished = !!profile && !profile.tutorialDone && profile.bestStage >= 1 && (profile.jetpacks.length > 1 || profile.bestStage >= 2 || profile.rebirths > 0)
  useEffect(() => {
    if (!finished) return
    send('tutorialDone')
    getGame().showBanner('Great job! Now escape more stages for bigger Wins!', 'trophy', 3600)
  }, [finished])
  if (!step || panel) return null
  return (
    <div className="guide">
      <div className="guide-step tx tx-sm">
        STEP {step.n}/{GUIDE_STEPS}
      </div>
      <div className="guide-text">{step.text}</div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Welcome / welcome back                                                    */
/* ------------------------------------------------------------------------ */

function WelcomeCard() {
  const hello = useGame((s) => s.hello)
  const name = useGame((s) => s.welcome?.name)
  const guest = useGame((s) => s.welcome?.guest)
  const { login, status } = useBloxity()
  const quiet = hello && hello.kind === 'again'
  useEffect(() => {
    if (!hello) return undefined
    const id = setTimeout(() => useGame.setState({ hello: null }), quiet ? 5000 : 14000)
    return () => clearTimeout(id)
  }, [hello, quiet])
  if (!hello) return null
  const close = () => {
    click()
    useGame.setState({ hello: null })
  }
  const resume = hello.resume
  if (quiet) {
    if (!resume) return null
    return (
      <div className="welcome-chip tx tx-sm">
        Welcome back! Level {hello.level} · continuing at Stage {resume.stage} - {resume.name}
      </div>
    )
  }
  const isNew = hello.kind === 'new'
  return (
    <div className="welcome-card">
      <div className="wc-title tx title-font">{isNew ? 'Welcome!' : `Welcome back, ${name}!`}</div>
      {isNew ? (
        <div className="wc-body tx-sm">Every step makes you faster. Escape the stages to earn Wins, then buy better jetpacks to fly further!</div>
      ) : (
        <div className="wc-body tx-sm">
          You were away {hello.daysAway >= 1 ? `${hello.daysAway} day${hello.daysAway > 1 ? 's' : ''}` : 'a while'} - here is a gift:
          <div className="wc-gift tx">
            <CoinIcon size={30} /> +{hello.coins}
          </div>
        </div>
      )}
      <div className="wc-boost tx tx-sm">
        <ShoeIcon size={30} /> x2 steps for {hello.boostMinutes} min!
      </div>
      {!isNew && (
        <div className="wc-body tx-sm">
          You are <b>Level {hello.level}</b>
          {hello.rebirths ? ` · Rebirth ${hello.rebirths}` : ''}
          {resume ? ` - continuing at Stage ${resume.stage}: ${resume.name}` : ''}.
        </div>
      )}
      {guest && (
        <div className="wc-note tx-sm">
          Playing as a guest - your progress is saved on this device.
          {status === 'ready' && (
            <button className="btn blue pressable tx tx-sm wc-login" onClick={() => (click(), login())}>
              Log in to keep it everywhere
            </button>
          )}
        </div>
      )}
      <div className="wc-actions">
        <button className="btn green pressable tx" onClick={close}>
          {resume ? 'Continue' : "Let's go!"}
        </button>
        {resume && (
          <button
            className="btn gray pressable tx"
            onClick={() => {
              close()
              send('toLobby')
            }}
          >
            Go to lobby
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Touch controls                                                            */
/* ------------------------------------------------------------------------ */

function TouchControls() {
  const knob = useRef(null)
  const stick = useRef({ id: null, cx: 0, cy: 0 })
  const look = useRef({ id: null, x: 0, y: 0 })

  const onStickDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    stick.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    e.currentTarget.setPointerCapture(e.pointerId)
    onStickMove(e)
  }
  const onStickMove = (e) => {
    if (stick.current.id !== e.pointerId) return
    let dx = e.clientX - stick.current.cx
    let dy = e.clientY - stick.current.cy
    const len = Math.hypot(dx, dy)
    const max = 52
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    input.stickX = dx / max
    input.stickY = -dy / max
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const onStickUp = () => {
    stick.current.id = null
    input.stickX = input.stickY = 0
    if (knob.current) knob.current.style.transform = ''
  }
  const onLookDown = (e) => {
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onLookMove = (e) => {
    if (look.current.id !== e.pointerId) return
    input.lookX += (e.clientX - look.current.x) * 1.4
    input.lookY += (e.clientY - look.current.y) * 1.4
    look.current.x = e.clientX
    look.current.y = e.clientY
  }
  const onLookUp = () => {
    look.current.id = null
  }
  const jumpDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!input.touchJump) input.jumpPressed = true
    input.touchJump = true
  }
  const jumpUp = () => {
    input.touchJump = false
  }
  return (
    <>
      <div className="touch-look" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="joystick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className="knob" ref={knob} />
      </div>
      <button className="jump-btn tx tx-sm" onPointerDown={jumpDown} onPointerUp={jumpUp} onPointerCancel={jumpUp}>
        JUMP
        <br />
        FLY
      </button>
    </>
  )
}

/* ------------------------------------------------------------------------ */

export function HUD() {
  // Embedded on bloxity.io the portal draws chat; ours is for standalone only.
  const embedded = useMemo(() => isEmbedded(), [])
  const panel = useGame((s) => s.panel)
  const quality = useGame((s) => s.settings.quality)
  const lowPower = useGame((s) => s.lowPower)
  const [scale, setScale] = useState(hudScale)
  useEffect(() => {
    const onResize = () => setScale(hudScale())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  useEffect(() => {
    input.portalChat = embedded
    const toggle = (name) => () => getGame().togglePanel(name)
    const offs = [
      onAction('escape', () => {
        if (getGame().panel) getGame().closePanel()
        else if (embedded) showPortalMenu() // the Boxity pause menu
      }),
      onAction('rebirth', toggle('rebirth')),
      onAction('worlds', toggle('worlds')),
      onAction('shop', toggle('shop')),
      onAction('settings', toggle('settings')),
      onAction('mute', () => {
        const g = getGame()
        g.updateSettings({ muted: !g.settings.muted })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [embedded])
  return (
    <div className={`hud ${IS_TOUCH ? 'touch' : ''}`} style={{ '--hud-scale': scale }}>
      <SpeedLines quality={lowPower ? 'low' : quality} />
      {IS_TOUCH && <div className="rotate-hint tx tx-sm">Turn your phone sideways to play!</div>}
      {IS_TOUCH && <TouchControls />}
      <StageTrack />
      <PlayerList />
      {!embedded && !IS_TOUCH && <Chat />}
      <LeftMenu />
      <CornerButtons />
      <QuestTracker />
      <SpeedControl />
      <BottomHUD />
      <Guide />
      <Prompt />
      <RaceUI />
      <Banner />
      <Toasts />
      <WelcomeCard />
      {panel && <Panels />}
      <FpsCounter />
    </div>
  )
}

function FpsCounter() {
  const show = useGame((s) => s.settings.showFps)
  const [fps, setFps] = useState(0)
  useEffect(() => {
    if (!show) return undefined
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = (now) => {
      frames += 1
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [show])
  if (!show) return null
  return <div className="fps tx tx-sm">{fps} FPS</div>
}

export default HUD
