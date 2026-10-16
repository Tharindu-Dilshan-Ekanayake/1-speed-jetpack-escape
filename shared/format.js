/** Number/time formatting shared by HUD, leaderboards and server messages. */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'qd', 'qn', 'sx', 'sp', 'oc', 'no', 'dc', 'ud', 'dd', 'td', 'qtd', 'qnd', 'sxd', 'spd', 'ocd', 'nod', 'vg']

/**
 * 1278 -> "1.3K", 1014 -> "1K", 5.29e24 -> "5.29sp".
 * Below 1000 numbers are shown whole.
 */
export function formatNumber(value, decimals = 1) {
  const n = Number(value) || 0
  const sign = n < 0 ? '-' : ''
  let abs = Math.abs(n)
  if (abs < 1000) return sign + Math.floor(abs).toString()
  let tier = 0
  while (abs >= 1000 && tier < SUFFIXES.length - 1) {
    abs /= 1000
    tier += 1
  }
  let text = abs.toFixed(decimals)
  // toFixed can round 999.96 up to "1000.0" - carry into the next suffix.
  if (Number(text) >= 1000 && tier < SUFFIXES.length - 1) {
    abs /= 1000
    tier += 1
    text = abs.toFixed(decimals)
  }
  if (text.includes('.')) text = text.replace(/\.?0+$/, '')
  return sign + text + SUFFIXES[tier]
}

/** 4,000,123 -> "4,000,123" */
export const formatInt = (value) => Math.floor(Number(value) || 0).toLocaleString('en-US')

/** Playtime style used on the leaderboard: "1111h 1m". */
export function formatHours(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Countdown style: "4:07" or "1:02:09". */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (v) => String(v).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

/** x1, x1.5, x2.25 */
export function formatMult(value) {
  const v = Math.round((Number(value) || 0) * 100) / 100
  return `x${v}`
}
