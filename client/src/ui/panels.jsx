import { useEffect, useState } from 'react'

import {
  EVENT,
  JETPACKS,
  MOONLIT_STOCK,
  PRODUCTS,
  RARITIES,
  SKINS,
  SQUAD,
  STAGES,
  TRAILS,
  levelCap,
  rebirthMultiplier,
} from '../../../shared/config.js'
import { formatNumber } from '../../../shared/format.js'
import { useBloxity } from '../bloxity/BloxityContext'
import { getFriends, inviteFriend, inviteLink, isEmbedded, isLoggedIn } from '../bloxity/boxity.js'
import { audio } from '../game/audio.js'
import { send } from '../net/connection.js'
import { getGame, useGame } from '../state/gameStore.js'
import { CratesPanel } from './CratesPanel.jsx'
import { PanelFrame } from './PanelFrame.jsx'
import {
  BagIcon,
  CoinIcon,
  GearIcon,
  GlobeIcon,
  HeartIcon,
  LockIcon,
  PumpkinIcon,
  RebirthIcon,
  ShoeIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from './Icons.jsx'
import { jetpackImage, trailImage } from './jetpackImage.js'
import { buyProduct } from './purchase.js'

const click = () => audio.play('click')

/** Prices: `wins` (stored as trophies) or `coins`. */
const Price = ({ wins, coins }) => (
  <>
    {wins !== undefined && (
      <>
        <TrophyIcon size={24} />
        {formatNumber(wins)}
      </>
    )}
    {coins !== undefined && (
      <>
        <CoinIcon size={22} />
        {formatNumber(coins)}
      </>
    )}
  </>
)

/* ------------------------------------------------------------------------ */
/* Rebirth — same layout as the original                                     */
/* ------------------------------------------------------------------------ */

function Arrow() {
  return (
    <svg className="arrow-right" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M10 36 H52 V14 L92 50 L52 86 V64 H10 Z" fill="#ffffff" stroke="#c9d6ff" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  )
}

function RebirthPanel() {
  const p = useGame((s) => s.profile)
  const cap = levelCap(p.rebirths)
  const nextCap = levelCap(p.rebirths + 1)
  const ready = p.level >= cap
  const fmt = (m) => `x${Math.round(m * 100) / 100}`
  return (
    <PanelFrame title="Rebirth" icon={<RebirthIcon size={64} />}>
      <div className="rebirth-body">
        <div className="rebirth-row">
          <div className="rebirth-tile steps tx">
            <div className="tile-title tx">Steps</div>
            <span className="mult">{fmt(rebirthMultiplier(p.rebirths))}</span>
            <ShoeIcon size={92} />
          </div>
          <Arrow />
          <div className="rebirth-tile steps tx">
            <div className="tile-title tx">Steps</div>
            <span className="mult">{fmt(rebirthMultiplier(p.rebirths + 1))}</span>
            <ShoeIcon size={92} />
          </div>
        </div>
        <div className="rebirth-row">
          <div className="rebirth-tile level tx">Level {cap}</div>
          <Arrow />
          <div className="rebirth-tile level tx">Level {nextCap}</div>
        </div>
        <div className="rebirth-note tx">Rebirth will reset your level</div>
        <div className="progress">
          <div className="fill" style={{ width: `${Math.min(100, (p.level / cap) * 100)}%` }} />
          <div className="text tx">
            Level {p.level}/{cap}
          </div>
        </div>
        <div className="rebirth-actions">
          <button className="btn pink pressable tx" disabled={!ready} onClick={() => (click(), send('rebirth', {}))}>
            <RebirthIcon size={70} /> Rebirth!
          </button>
          <button
            className="btn green pressable tx"
            disabled={!ready}
            onClick={() => {
              click()
              if (p.skipCredits > 0) send('rebirth', { skip: true })
              else buyProduct('skip_rebirth')
            }}
          >
            <TrophyIcon size={44} /> Skip
            <span className="skip-note tx tx-sm">{p.skipCredits > 0 ? `${p.skipCredits} ready` : `Keep your level! ${formatNumber(PRODUCTS.skip_rebirth.price)} Wins`}</span>
          </button>
        </div>
        {!ready && (
          <div className="tx tx-sm" style={{ textAlign: 'center', fontSize: 18, marginTop: 18 }}>
            Reach level {cap} to rebirth. Total rebirths: {p.rebirths}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}

/* ------------------------------------------------------------------------ */
/* Skins + owned jetpacks                                                    */
/* ------------------------------------------------------------------------ */

function SkinsTab() {
  const p = useGame((s) => s.profile)
  const [tab, setTab] = useState('skins')
  return (
    <>
      <div className="tabs sub-tabs">
        <button className={`tab tx tx-sm ${tab === 'skins' ? 'active' : ''}`} onClick={() => setTab('skins')}>
          Jetpack Skins
        </button>
        <button className={`tab tx tx-sm ${tab === 'jetpacks' ? 'active' : ''}`} onClick={() => setTab('jetpacks')}>
          Jetpacks
        </button>
      </div>
      {tab === 'skins' ? (
        <>
          <div className="tx tx-sm" style={{ marginBottom: 12, fontSize: 16, opacity: 0.9 }}>
            Skins multiply every step you take. Get them from Crates in the lobby, the Spooky event and the shop.
          </div>
          <div className="grid">
            {SKINS.map((sk) => {
              const owned = (p.skins[sk.id] || 0) > 0
              const equipped = p.skin === sk.id
              const r = RARITIES[sk.rarity]
              return (
                <div key={sk.id} className={`card ${equipped ? 'equipped' : ''}`} style={{ borderColor: owned ? r.color : undefined, opacity: owned ? 1 : 0.55 }}>
                  <div className="preview">{owned ? <img src={jetpackImage(p.jetpack, sk.id)} alt="" width={96} /> : <LockIcon size={46} />}</div>
                  <div className="name tx tx-sm">{sk.name}</div>
                  <div className="rarity tx tx-sm" style={{ background: r.color }}>
                    {r.label}
                  </div>
                  <div className="sub tx tx-sm">x{sk.mult} steps</div>
                  {owned && p.skins[sk.id] > 1 && <div className="sub tx tx-sm">Owned x{p.skins[sk.id]}</div>}
                  {owned ? (
                    <button className={`btn wide pressable tx ${equipped ? 'gray' : 'green'}`} onClick={() => (click(), send('equipSkin', { id: equipped ? '' : sk.id }))}>
                      {equipped ? 'Unequip' : 'Equip'}
                    </button>
                  ) : (
                    <div className="sub tx tx-sm">{sk.crate ? `${sk.crate[0].toUpperCase() + sk.crate.slice(1)} crate · ${sk.chance}%` : sk.sku ? 'Shop exclusive' : 'Spooky event'}</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="grid">
          {JETPACKS.map((jp) => {
            const owned = p.jetpacks.includes(jp.id)
            const equipped = p.jetpack === jp.id
            return (
              <div key={jp.id} className={`card ${equipped ? 'equipped' : ''}`} style={{ opacity: owned ? 1 : 0.6 }}>
                <div className="preview">
                  <img src={jetpackImage(jp.id, '')} alt="" width={96} />
                </div>
                <div className="name tx tx-sm">{jp.name}</div>
                <div className="sub tx tx-sm">Fuel {jp.fuel}</div>
                {owned ? (
                  <button className={`btn wide pressable tx ${equipped ? 'gray' : 'green'}`} disabled={equipped} onClick={() => (click(), send('equipJetpack', { id: jp.id }))}>
                    {equipped ? 'Equipped' : 'Equip'}
                  </button>
                ) : jp.sku ? (
                  <button className="btn wide gold pressable tx" onClick={() => (click(), buyProduct(jp.sku))}>
                    <Price wins={PRODUCTS.pulse_jetpack.price} />
                  </button>
                ) : (
                  <div className="sub tx tx-sm">
                    <Price wins={jp.price} /> at the JETPACKS wall
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Worlds                                                                    */
/* ------------------------------------------------------------------------ */

function WorldsPanel() {
  const p = useGame((s) => s.profile)
  const dev = useGame((s) => s.welcome?.devPurchases)
  const [stageIndex, setStageIndex] = useState(0)
  const stage = STAGES[stageIndex]
  return (
    <PanelFrame title="Worlds" icon={<GlobeIcon size={64} />}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        <div className="card equipped" style={{ alignItems: 'stretch', textAlign: 'left' }}>
          <div className="name tx title-font" style={{ fontSize: 30 }}>
            World 1 · The Facility
          </div>
          <div className="sub tx tx-sm">Escape all 9 stages. Choose a stage below to view it.</div>
          <div className={`stage-choice tx-sm ${p.bestStage >= stage.id ? 'complete' : ''}`}>
            <div className="stage-choice-title tx title-font">
              {p.bestStage >= stage.id ? '✔' : '•'} Stage {stage.id}
            </div>
            <div className="stage-choice-name tx">{stage.name}</div>
            <div className="stage-choice-level tx tx-sm">Recommended level: {stage.recLevel}</div>
            {dev && (
              <button className="btn blue pressable tx tx-sm" onClick={() => (click(), send('devTeleport', { stage: stage.id }), getGame().closePanel())}>
                Go (dev)
              </button>
            )}
          </div>
          <div className="stage-nav">
            <button
              className="stage-nav-arrow pressable tx"
              onClick={() => (click(), setStageIndex((i) => Math.max(0, i - 1)))}
              disabled={stageIndex === 0}
              aria-label="Previous stage"
              title="Previous stage"
            >
              ←
            </button>
            <div className="stage-nav-count tx tx-sm">
              {stageIndex + 1} / {STAGES.length}
            </div>
            <button
              className="stage-nav-arrow pressable tx"
              onClick={() => (click(), setStageIndex((i) => Math.min(STAGES.length - 1, i + 1)))}
              disabled={stageIndex === STAGES.length - 1}
              aria-label="Next stage"
              title="Next stage"
            >
              →
            </button>
          </div>
          <button className="btn blue pressable tx" onClick={() => (click(), send('toLobby'), getGame().closePanel())}>
            Return to Lobby
          </button>
        </div>
        <PlayTogether />
        <div className="card" style={{ justifyContent: 'center', opacity: 0.7 }}>
          <LockIcon size={64} />
          <div className="name tx title-font" style={{ fontSize: 30 }}>
            World 2
          </div>
          <div className="sub tx tx-sm">Coming soon! Keep rebirthing to be ready.</div>
        </div>
      </div>
    </PanelFrame>
  )
}

/* ------------------------------------------------------------------------ */
/* Trails                                                                    */
/* ------------------------------------------------------------------------ */

function TrailsTab() {
  const p = useGame((s) => s.profile)
  return (
    <>
      <div className="grid">
        {TRAILS.map((t) => {
          const owned = p.trails.includes(t.id)
          const equipped = p.trail === t.id
          return (
            <div key={t.id} className={`card ${equipped ? 'equipped' : ''}`}>
              <div className="preview" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <img src={trailImage(t.id)} alt="" width={140} />
              </div>
              <div className="name tx tx-sm">{t.name}</div>
              {owned ? (
                <button className={`btn wide pressable tx ${equipped ? 'gray' : 'green'}`} disabled={equipped} onClick={() => (click(), send('equipTrail', { id: t.id }))}>
                  {equipped ? 'Equipped' : 'Equip'}
                </button>
              ) : t.currency === 'event' ? (
                <div className="sub tx tx-sm">Spooky event reward</div>
              ) : (
                <button className="btn wide gold pressable tx" onClick={() => (click(), send('buyTrail', { id: t.id }))}>
                  {t.currency === 'coins' ? <Price coins={t.price} /> : <Price wins={t.price} />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

function Toggle({ value, onChange }) {
  return <button className={`toggle ${value ? 'on' : ''}`} onClick={() => (click(), onChange(!value))} aria-pressed={value} />
}

function SettingsPanel() {
  const s = useGame((st) => st.settings)
  const update = useGame((st) => st.updateSettings)
  const guest = useGame((st) => st.welcome?.guest)
  const { login, status } = useBloxity()
  const [embedded] = useState(isEmbedded)
  return (
    <PanelFrame title="Settings" icon={<GearIcon size={60} />} narrow>
      {embedded && (
        <div className="tx tx-sm" style={{ fontSize: 15, marginBottom: 10, opacity: 0.9 }}>
          Volume, graphics, camera, FPS and chat also follow your Boxity menu settings.
        </div>
      )}
      {guest && status === 'ready' && (
        <div className="setting tx tx-sm" style={{ fontSize: 16 }}>
          Playing as a guest - progress is saved on this device.
          <button className="btn blue pressable tx tx-sm" onClick={() => (click(), login())}>
            Log in
          </button>
        </div>
      )}
      <div className="setting tx tx-sm">
        Sound
        <Toggle value={!s.muted} onChange={(v) => update({ muted: !v })} />
      </div>
      <div className="setting tx tx-sm">
        Master volume
        <input type="range" min={0} max={1} step={0.05} value={s.masterVolume} onChange={(e) => update({ masterVolume: Number(e.target.value) })} />
      </div>
      <div className="setting tx tx-sm">
        Music
        <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => update({ musicVolume: Number(e.target.value) })} />
      </div>
      <div className="setting tx tx-sm">
        Sound effects
        <input type="range" min={0} max={1} step={0.05} value={s.sfxVolume} onChange={(e) => update({ sfxVolume: Number(e.target.value) })} />
      </div>
      <div className="setting tx tx-sm">
        Graphics
        <div className="seg">
          {['low', 'medium', 'high'].map((q) => (
            <button key={q} className={`tx tx-sm ${s.quality === q ? 'on' : ''}`} onClick={() => (click(), update({ quality: q }))}>
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="setting tx tx-sm">
        Auto performance (keeps it smooth on slow PCs)
        <Toggle value={s.autoPerf !== false} onChange={(v) => update({ autoPerf: v })} />
      </div>
      <div className="setting tx tx-sm">
        Camera sensitivity
        <input type="range" min={0.3} max={2.5} step={0.1} value={s.camSensitivity} onChange={(e) => update({ camSensitivity: Number(e.target.value) })} />
      </div>
      <div className="setting tx tx-sm">
        A / D turn the camera
        <Toggle value={s.turnCamera !== false} onChange={(v) => update({ turnCamera: v })} />
      </div>
      <div className="setting tx tx-sm">
        Auto camera when running fast
        <Toggle value={s.autoCamera} onChange={(v) => update({ autoCamera: v })} />
      </div>
      <div className="setting tx tx-sm">
        Show names
        <Toggle value={s.showNames} onChange={(v) => update({ showNames: v })} />
      </div>
      <div className="setting tx tx-sm">
        Show other players&apos; trails
        <Toggle value={s.showOtherTrails} onChange={(v) => update({ showOtherTrails: v })} />
      </div>
      <div className="setting tx tx-sm">
        Show chat
        <Toggle value={s.showChat} onChange={(v) => update({ showChat: v })} />
      </div>
      <div className="setting tx tx-sm">
        Show FPS
        <Toggle value={s.showFps} onChange={(v) => update({ showFps: v })} />
      </div>
      <div className="setting tx tx-sm" style={{ flexDirection: 'column', alignItems: 'flex-start', fontSize: 16, gap: 4 }}>
        <b>Controls</b>
        <span>W / S - forward, back · A / D - turn · Space - jump, hold in the air to fly</span>
        <span>Drag - look around · Wheel - zoom · E - use / buy</span>
        <span>R - rebirth · T - worlds · B - shop · O - settings · M - sound</span>
        <span>Z / X - slower / faster · C - full speed · Tab - players · Enter - chat · Esc - close</span>
      </div>
    </PanelFrame>
  )
}

/* ------------------------------------------------------------------------ */
/* Shop: Wins products, skins and trails                                     */
/* ------------------------------------------------------------------------ */

function ProductsTab() {
  const p = useGame((s) => s.profile)
  const focus = useGame((s) => s.panelArg)
  const stock = useGame((s) => s.moonlitStock)
  const pending = useGame((s) => s.purchasePending)
  const items = [
    { ...PRODUCTS.x2_steps, img: <ShoeIcon size={70} />, owned: p.passes.x2_steps },
    { ...PRODUCTS.vip, img: <StarIcon size={70} />, owned: p.passes.vip || p.passes.vip_plus },
    { ...PRODUCTS.vip_plus, img: <StarIcon size={70} color="#5ff0ff" />, owned: p.passes.vip_plus },
    { ...PRODUCTS.steps_25k, img: <ShoeIcon size={60} /> },
    { ...PRODUCTS.steps_150k, img: <ShoeIcon size={66} /> },
    { ...PRODUCTS.steps_2m, img: <ShoeIcon size={74} /> },
    { ...PRODUCTS.pulse_jetpack, img: <img src={jetpackImage('pulse')} alt="" width={90} />, owned: p.jetpacks.includes('pulse') },
    { ...PRODUCTS.skip_rebirth, img: <RebirthIcon size={70} />, desc: `${PRODUCTS.skip_rebirth.desc} (${p.skipCredits} ready)` },
    { ...PRODUCTS.moonlit_pulse, img: <img src={jetpackImage('jp1', 'moonlit_pulse')} alt="" width={96} />, desc: `${PRODUCTS.moonlit_pulse.desc} ${stock}/${MOONLIT_STOCK} left`, owned: (p.skins.moonlit_pulse || 0) > 0, soldOut: stock <= 0 },
    { ...PRODUCTS.coins_300, img: <CoinIcon size={64} /> },
    { ...PRODUCTS.coins_1500, img: <CoinIcon size={80} /> },
  ]
  return (
    <>
      <div className="tx tx-sm shop-note">
        Everything costs <TrophyIcon size={18} /> <b>Wins</b> - escape stages to earn them. Pink VIP pads pay double!
      </div>
      <div className="grid">
        {items.map((it) => {
          const afford = p.trophies >= it.price
          const locked = it.owned && it.kind !== 'steps' && it.kind !== 'coins' && it.kind !== 'skipRebirth'
          return (
            <div key={it.sku} className={`card ${focus === it.sku ? 'highlight' : ''}`}>
              <div className="preview">{it.img}</div>
              <div className="name tx tx-sm">{it.name}</div>
              {it.desc && <div className="sub tx tx-sm">{it.desc}</div>}
              <button
                className={`btn wide pressable tx ${locked ? 'gray' : afford ? 'green' : 'red'}`}
                disabled={locked || it.soldOut || !!pending}
                onClick={() => (click(), buyProduct(it.sku))}
              >
                {locked ? 'Owned' : it.soldOut ? 'Sold out' : pending === it.sku ? '...' : <Price wins={it.price} />}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

const SHOP_TABS = [
  { id: 'shop', label: 'Shop' },
  { id: 'skins', label: 'Skins' },
  { id: 'trails', label: 'Trails' },
]

function ShopPanel() {
  const p = useGame((s) => s.profile)
  const focus = useGame((s) => s.panelArg)
  const [tab, setTab] = useState(focus === 'skins' || focus === 'trails' ? focus : 'shop')
  return (
    <PanelFrame
      title="Shop"
      icon={<BagIcon size={60} />}
      right={
        <div className="wallet tx">
          <TrophyIcon size={30} /> {formatNumber(p.trophies)}
          <CoinIcon size={26} /> {formatNumber(p.coins)}
        </div>
      }
    >
      <div className="tabs">
        {SHOP_TABS.map((t) => (
          <button key={t.id} className={`tab tx tx-sm ${tab === t.id ? 'active' : ''}`} onClick={() => (click(), setTab(t.id))}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'shop' && <ProductsTab />}
      {tab === 'skins' && <SkinsTab />}
      {tab === 'trails' && <TrailsTab />}
    </PanelFrame>
  )
}

/* ------------------------------------------------------------------------ */
/* ------------------------------------------------------------------------ */
/* Friends (Boxity social)                                                   */
/* ------------------------------------------------------------------------ */

const STATUS_LABEL = { online: 'Online', 'in-game': 'Playing', away: 'Away', offline: 'Offline' }

/** Inside Worlds: the squad bonus, your friends and an invite link. */
function PlayTogether() {
  const [friends, setFriends] = useState(null)
  const [invited, setInvited] = useState({})
  const [copied, setCopied] = useState(false)
  const signedIn = isLoggedIn()
  useEffect(() => {
    let live = true
    if (signedIn) getFriends().then((list) => live && setFriends(list))
    return () => {
      live = false
    }
  }, [signedIn])
  const invite = async (f) => {
    click()
    setInvited((s) => ({ ...s, [f._id]: 'sending' }))
    const ok = await inviteFriend(f._id)
    setInvited((s) => ({ ...s, [f._id]: ok ? 'sent' : 'failed' }))
  }
  const copyLink = async () => {
    click()
    const link = inviteLink()
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this invite link:', link)
    }
  }
  const order = { 'in-game': 0, online: 1, away: 2, offline: 3 }
  const sorted = [...(friends || [])].sort((a, b) => (order[a.presence?.status] ?? 4) - (order[b.presence?.status] ?? 4))
  return (
    <div className="card together" style={{ alignItems: 'stretch', textAlign: 'left' }}>
      <div className="name tx title-font" style={{ fontSize: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeartIcon size={30} /> Play together
      </div>
      <div className="sub tx tx-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <UsersIcon size={22} /> Every player in your server gives +{Math.round(SQUAD.perPlayer * 100)}% steps (up to +{Math.round(SQUAD.max * 100)}%). Bring your friends!
      </div>
      <button className="btn blue wide pressable tx" style={{ margin: '8px 0 12px' }} onClick={copyLink}>
        {copied ? 'Link copied!' : 'Copy invite link to this server'}
      </button>
      {!signedIn && <div className="tx tx-sm" style={{ fontSize: 16 }}>Log in with Boxity to see and invite your friends.</div>}
      {signedIn && friends === null && <div className="tx tx-sm">Loading friends...</div>}
      {signedIn && friends?.length === 0 && <div className="tx tx-sm">No friends yet - add some on bloxity.io!</div>}
      {sorted.map((f) => {
        const status = f.presence?.status || 'offline'
        const state = invited[f._id]
        return (
          <div key={f._id} className="friend">
            {f.pfp ? <img src={f.pfp} alt="" /> : <div className="pfp tx">{(f.displayName || f.username || '?').charAt(0).toUpperCase()}</div>}
            <div className="who tx tx-sm">
              <div style={{ fontSize: 17 }}>{f.displayName || f.username}</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                <span className={`presence ${status}`} />
                {status === 'in-game' && f.presence?.gameName ? `Playing ${f.presence.gameName}` : STATUS_LABEL[status] || status}
              </div>
            </div>
            <button className="btn green pressable tx tx-sm" disabled={state === 'sending' || state === 'sent'} onClick={() => invite(f)}>
              {state === 'sent' ? 'Invited!' : state === 'failed' ? 'Retry' : 'Invite'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

const PANELS = {
  rebirth: RebirthPanel,
  worlds: WorldsPanel,
  settings: SettingsPanel,
  crates: CratesPanel,
  shop: ShopPanel,
  event: EventInfoPanel,
}

/** The Spooky pumpkin box in the lobby: progress only - rewards arrive by themselves. */
function EventInfoPanel() {
  const p = useGame((s) => s.profile)
  return (
    <PanelFrame title="Spooky Season" icon={<PumpkinIcon size={64} />} narrow>
      <div className="tx tx-sm" style={{ fontSize: 18, marginBottom: 12 }}>
        Glowing pumpkins hide in the lobby and every stage. Each gives <CoinIcon size={18} /> {EVENT.pumpkinCoins} coins and comes back after {EVENT.pumpkinRespawn / 60} minutes. Rewards
        unlock by themselves!
      </div>
      {EVENT.milestones.map((m, i) => {
        const claimed = p.eventClaims.includes(i)
        return (
          <div key={m.count} className="setting tx tx-sm">
            <span>
              {claimed ? '✔ ' : ''}
              {m.label}
            </span>
            <span>
              <PumpkinIcon size={20} /> {Math.min(p.pumpkins, m.count)}/{m.count}
            </span>
          </div>
        )
      })}
    </PanelFrame>
  )
}

export function Panels() {
  const panel = useGame((s) => s.panel)
  const profile = useGame((s) => s.profile)
  const Panel = PANELS[panel]
  if (!Panel || !profile) return null
  return <Panel />
}
