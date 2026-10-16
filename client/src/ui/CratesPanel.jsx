import { useCallback, useEffect, useRef, useState } from 'react'

import { CRATES, RARITIES, SKIN_BY_ID, skinsInCrate } from '../../../shared/config.js'
import { audio } from '../game/audio.js'
import { send } from '../net/connection.js'
import { useGame } from '../state/gameStore.js'
import { REEL_WIN_SLOT } from './crateReel.js'
import { CloseIcon, CoinIcon } from './Icons.jsx'
import { jetpackImage } from './jetpackImage.js'
import { PanelFrame } from './PanelFrame.jsx'

const ITEM_W = 130 // reel item width + gap
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, exclusive: 5, event: 3 }

function EyeIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M6 50 Q50 6 94 50 Q50 94 6 50 Z" fill="#ffffff" stroke="#16122b" strokeWidth="6" />
      <circle cx="50" cy="50" r="17" fill="#1e88e5" stroke="#16122b" strokeWidth="5" />
    </svg>
  )
}

/** Spinning reel that lands on the rolled skin, case-opening style. */
function Reel({ reel, onDone }) {
  const wrapRef = useRef(null)
  const stripRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const strip = stripRef.current
    if (!wrap || !strip) return undefined
    const target = REEL_WIN_SLOT * ITEM_W + 60 - wrap.clientWidth / 2 + reel.jitter
    const duration = 4200
    const start = performance.now()
    let lastSlot = -1
    let raf = 0
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const x = target * (1 - Math.pow(1 - t, 4))
      strip.style.transform = `translateX(${-x}px)`
      const slot = Math.floor((x + wrap.clientWidth / 2) / ITEM_W)
      if (slot !== lastSlot) {
        lastSlot = slot
        audio.play('tick')
      }
      if (t < 1) raf = requestAnimationFrame(frame)
      else onDone()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reel, onDone])

  return (
    <div className="reel-wrap" ref={wrapRef}>
      <div className="reel-marker" />
      <div className="reel" ref={stripRef}>
        {reel.items.map((id, i) => {
          const sk = SKIN_BY_ID[id]
          const color = RARITIES[sk.rarity].color
          return (
            <div key={i} className="reel-item tx tx-sm" style={{ background: `linear-gradient(180deg, ${color}55, #1b2350)`, borderColor: color }}>
              <img src={jetpackImage('jp1', sk.id)} alt="" width={80} />
              {sk.name}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CratesPanel() {
  const profile = useGame((s) => s.profile)
  const result = useGame((s) => s.crateResult)
  const [preview, setPreview] = useState(null)
  /** idle -> waiting (asked the server) -> revealed */
  const [stage, setStage] = useState('idle')

  const open = (crate) => {
    audio.play('click')
    useGame.setState({ crateResult: null })
    setStage('waiting')
    send('openCrate', { id: crate.id })
    // If the server refuses (not enough coins), stop waiting.
    setTimeout(() => {
      if (!useGame.getState().crateResult) setStage('idle')
    }, 2500)
  }
  // Stable while a reel spins, so profile updates don't restart the animation.
  const resultSkin = result?.skin
  const onDone = useCallback(() => {
    audio.play('reveal', { rank: RARITY_RANK[SKIN_BY_ID[resultSkin]?.rarity] || 0 })
    setStage('revealed')
  }, [resultSkin])
  const skin = stage === 'revealed' && result ? SKIN_BY_ID[result.skin] : null

  return (
    <PanelFrame
      title="Crates"
      right={
        <div className="wallet tx">
          <CoinIcon size={44} /> {profile.coins}
        </div>
      }
    >
      {stage === 'waiting' && result && (
        <div style={{ marginBottom: 16 }}>
          <Reel reel={result.reel} onDone={onDone} />
        </div>
      )}
      {skin && (
        <div className="result-card" style={{ background: `linear-gradient(90deg, ${RARITIES[skin.rarity].color}aa, #1b2350)`, marginBottom: 16 }}>
          <img src={jetpackImage('jp1', skin.id)} alt="" width={110} />
          <div style={{ flex: 1 }}>
            <div className="tx title-font" style={{ fontSize: 34 }}>
              {skin.name}
            </div>
            <div className="tx tx-sm" style={{ fontSize: 18 }}>
              {RARITIES[skin.rarity].label} · x{skin.mult} steps
              {result.equipped && ' · Equipped!'}
            </div>
            {result.duplicate && (
              <div className="tx tx-sm" style={{ fontSize: 16 }}>
                Duplicate! Refunded <CoinIcon size={16} /> {result.refund}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!result.equipped && profile.skin !== skin.id && (
              <button className="btn green pressable tx" onClick={() => send('equipSkin', { id: skin.id })}>
                Equip
              </button>
            )}
            <button className="btn gray pressable tx" onClick={() => setStage('idle')}>
              OK
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {CRATES.map((crate) => {
          const pool = skinsInCrate(crate.id)
          return (
            <div key={crate.id} className="crate-card" style={{ background: `linear-gradient(180deg, ${crate.theme[0]}, ${crate.theme[1]})` }}>
              <div className="crate-title tx title-font">{crate.name}</div>
              <div style={{ display: 'grid', placeItems: 'center', height: 120 }}>
                <img src={jetpackImage('jp1', pool[pool.length - 1].id)} alt="" width={110} />
              </div>
              <div className="chances">
                {[...pool].reverse().map((sk) => (
                  <div key={sk.id} className="chance tx tx-sm" style={{ background: `${RARITIES[sk.rarity].color}66` }} title={`${sk.name} x${sk.mult}`}>
                    <img src={jetpackImage('jp1', sk.id)} alt="" width={40} />
                    <span>{sk.chance}%</span>
                  </div>
                ))}
              </div>
              {preview === crate.id && (
                <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.35)' }}>
                  {pool.map((sk) => (
                    <div key={sk.id} className="tx tx-sm" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                      <span style={{ color: RARITIES[sk.rarity].color }}>{sk.name}</span>
                      <span>
                        x{sk.mult} · {sk.chance}%{(profile.skins[sk.id] || 0) > 0 ? ' ✔' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="actions">
                <button className="btn blue pressable" onClick={() => setPreview(preview === crate.id ? null : crate.id)} aria-label="Preview">
                  {preview === crate.id ? <CloseIcon size={26} /> : <EyeIcon />}
                </button>
                <button className="btn green pressable tx" disabled={stage === 'waiting' || profile.coins < crate.price} onClick={() => open(crate)}>
                  <CoinIcon size={32} /> {crate.price}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="tx tx-sm" style={{ marginTop: 14, fontSize: 15, opacity: 0.9 }}>
        Earn coins from pumpkins, gifts, daily rewards, races and first-time stage clears. Better skins multiply every step you take!
      </div>
    </PanelFrame>
  )
}

export default CratesPanel
