/**
 * Profile model + every rule that changes it. Pure functions over a plain
 * profile object: the room calls these and turns the results into messages.
 * Each action returns `{ ok: true, ... }` or `{ ok: false, error }`.
 */
import {
  BOOST_BY_ID,
  CRATE_BY_ID,
  DAILY_REWARDS,
  DUPLICATE_REFUND,
  EVENT,
  FREE_CHEST,
  GIFTS,
  JETPACK_BY_ID,
  MAX_REBIRTHS,
  PRODUCT_BY_SKU,
  QUESTS,
  QUEST_BONUS_COINS,
  QUEST_COINS,
  RETURN_AFTER_HOURS,
  SKIN_BY_ID,
  STAGES,
  STEP_BOOST,
  TRAIL_BY_ID,
  firstClearCoins,
  levelCap,
  questWins,
  rebirthMultiplier,
  returnBonusCoins,
  skinsInCrate,
  speedForLevel,
  stepsAtCap,
  stepsForLevel,
} from '../../shared/config.js'
import { formatNumber } from '../../shared/format.js'

export function newProfile(id, name) {
  return normalizeProfile({ id, name, createdAt: Date.now() })
}

/** Fills in fields added after a profile was first saved. */
export function normalizeProfile(p) {
  // Very old saves called coins "gems".
  if (p.coins === undefined && typeof p.gems === 'number') p.coins = p.gems
  delete p.gems
  const d = {
    level: 1,
    steps: 0,
    totalSteps: 0,
    rebirths: 0,
    trophies: 0,
    trophiesEarned: 0,
    coins: 0,
    jetpacks: ['jp1'],
    jetpack: 'jp1',
    boosts: ['b1'],
    skins: {},
    skin: '',
    trails: ['arrows'],
    trail: 'arrows',
    passes: { x2_steps: false, vip: false, vip_plus: false },
    playtime: 0,
    bestStage: 0,
    clears: {},
    pumpkins: 0,
    pumpkinTimes: {},
    eventClaims: [],
    daily: { last: '', streak: 0 },
    chestAt: 0,
    deaths: 0,
    racesWon: 0,
    teleportCredits: 0,
    skipCredits: 0,
    tutorialDone: false,
    /** Timed x2 steps boost (starter, welcome back, quest bonus) runs until this time. */
    boostUntil: 0,
    coinsCollected: 0,
    /** Today's quests: { day, list: [{ type, goal, progress, claimed, wins, coins }], bonusClaimed }. */
    quests: null,
    /** Where the player was when they left, so they continue from there: { kind, stage }. */
    resume: null,
  }
  for (const [k, v] of Object.entries(d)) {
    if (p[k] === undefined || p[k] === null) p[k] = typeof v === 'object' ? structuredClone(v) : v
  }
  p.passes = { ...d.passes, ...p.passes }
  return p
}

/* ------------------------------------------------------------------------ */
/* Multipliers                                                               */
/* ------------------------------------------------------------------------ */

export const bestBoost = (p) => Math.max(1, ...p.boosts.map((id) => BOOST_BY_ID[id]?.amount || 1))
export const skinMultiplier = (p) => SKIN_BY_ID[p.skin]?.mult || 1
export const passMultiplier = (p) => (p.passes.x2_steps ? 2 : 1)
export const hasVip = (p) => !!(p.passes.vip || p.passes.vip_plus)
export const boostMultiplier = (p, now = Date.now()) => (p.boostUntil > now ? STEP_BOOST.mult : 1)

/**
 * Steps earned for one step.
 * @param {number} [treadmillMult] treadmill x1 / x2 / x4
 * @param {number} [squad] bonus for playing with others (squadMultiplier)
 */
export const stepsPerStep = (p, treadmillMult = 1, squad = 1, now = Date.now()) =>
  Math.round(bestBoost(p) * rebirthMultiplier(p.rebirths) * skinMultiplier(p) * passMultiplier(p) * boostMultiplier(p, now) * squad * treadmillMult * 100) / 100

/** Extends the timed x2 steps boost (timers add up, capped). */
export function addStepBoost(p, minutes, now = Date.now()) {
  p.boostUntil = Math.min(now + STEP_BOOST.maxMinutes * 60000, Math.max(now, p.boostUntil || 0) + minutes * 60000)
}

export const fuelFor = (p) => JETPACK_BY_ID[p.jetpack]?.fuel || 10

/** Adds steps and levels the player up. Returns level-up info if any. */
export function addSteps(p, amount) {
  if (!(amount > 0)) return null
  const cap = levelCap(p.rebirths)
  const before = p.level
  p.totalSteps += amount
  p.steps += amount
  while (p.level < cap && p.steps >= stepsForLevel(p.level)) p.level += 1
  if (p.level >= cap) p.steps = Math.min(p.steps, stepsAtCap(p.rebirths))
  if (p.level === before) return null
  return { from: before, to: p.level, fromSpeed: speedForLevel(before), toSpeed: speedForLevel(p.level) }
}

/* ------------------------------------------------------------------------ */
/* Rebirth                                                                   */
/* ------------------------------------------------------------------------ */

export const canRebirth = (p) => p.level >= levelCap(p.rebirths) && p.rebirths < MAX_REBIRTHS

export function rebirth(p, { skip = false } = {}) {
  if (!canRebirth(p)) return { ok: false, error: `Reach level ${levelCap(p.rebirths)} first!` }
  if (skip) {
    if (p.skipCredits <= 0) return { ok: false, error: 'No skips left.' }
    p.skipCredits -= 1
  } else {
    p.level = 1
    p.steps = 0
  }
  p.rebirths += 1
  return { ok: true, rebirths: p.rebirths, mult: rebirthMultiplier(p.rebirths), cap: levelCap(p.rebirths), skip }
}

/* ------------------------------------------------------------------------ */
/* Shops                                                                     */
/* ------------------------------------------------------------------------ */

/** Wins are stored as `trophies`. */
const needWins = (n) => `Need ${formatNumber(n)} more Wins.`

export function buyJetpack(p, id) {
  const jp = JETPACK_BY_ID[id]
  if (!jp) return { ok: false, error: 'Unknown jetpack.' }
  if (p.jetpacks.includes(id)) return equipJetpack(p, id)
  if (jp.sku) return buyProduct(p, jp.sku)
  if (p.trophies < jp.price) return { ok: false, error: needWins(jp.price - p.trophies) }
  p.trophies -= jp.price
  p.jetpacks.push(id)
  p.jetpack = id
  return { ok: true, bought: true, text: `${jp.name} equipped! Fuel ${jp.fuel}` }
}

export function equipJetpack(p, id) {
  if (!p.jetpacks.includes(id)) return { ok: false, error: 'You do not own that jetpack.' }
  p.jetpack = id
  return { ok: true, text: `${JETPACK_BY_ID[id].name} equipped!` }
}

export function buyBoost(p, id) {
  const b = BOOST_BY_ID[id]
  if (!b) return { ok: false, error: 'Unknown boost.' }
  if (p.boosts.includes(id)) return { ok: false, error: 'Already owned.' }
  if (p.trophies < b.price) return { ok: false, error: needWins(b.price - p.trophies) }
  p.trophies -= b.price
  p.boosts.push(id)
  return { ok: true, text: `+${b.amount} steps per step!` }
}

export function buyTrail(p, id) {
  const tr = TRAIL_BY_ID[id]
  if (!tr) return { ok: false, error: 'Unknown trail.' }
  if (p.trails.includes(id)) return equipTrail(p, id)
  if (tr.currency === 'event') return { ok: false, error: 'Unlock it in the Spooky event!' }
  const wallet = tr.currency === 'coins' ? 'coins' : 'trophies'
  if (p[wallet] < tr.price) return { ok: false, error: wallet === 'coins' ? `Need ${formatNumber(tr.price - p.coins)} more coins.` : needWins(tr.price - p.trophies) }
  p[wallet] -= tr.price
  p.trails.push(id)
  p.trail = id
  return { ok: true, text: `${tr.name} trail equipped!` }
}

export function equipTrail(p, id) {
  if (!p.trails.includes(id)) return { ok: false, error: 'You do not own that trail.' }
  p.trail = id
  return { ok: true }
}

export function equipSkin(p, id) {
  if (id === '') {
    p.skin = ''
    return { ok: true }
  }
  if (!(p.skins[id] > 0)) return { ok: false, error: 'You do not own that skin.' }
  p.skin = id
  return { ok: true }
}

export function openCrate(p, crateId, random = Math.random) {
  const crate = CRATE_BY_ID[crateId]
  if (!crate) return { ok: false, error: 'Unknown crate.' }
  if (p.coins < crate.price) return { ok: false, error: `Need ${crate.price - p.coins} more coins.` }
  p.coins -= crate.price
  const pool = skinsInCrate(crateId)
  let roll = random() * pool.reduce((s, sk) => s + sk.chance, 0)
  let skin = pool[pool.length - 1]
  for (const sk of pool) {
    roll -= sk.chance
    if (roll <= 0) {
      skin = sk
      break
    }
  }
  const duplicate = (p.skins[skin.id] || 0) > 0
  p.skins[skin.id] = (p.skins[skin.id] || 0) + 1
  const refund = duplicate ? Math.floor(crate.price * DUPLICATE_REFUND) : 0
  p.coins += refund
  let equipped = false
  if (skin.mult > skinMultiplier(p)) {
    p.skin = skin.id
    equipped = true
  }
  return { ok: true, skin: skin.id, duplicate, refund, equipped }
}

/* ------------------------------------------------------------------------ */
/* Rewards                                                                   */
/* ------------------------------------------------------------------------ */

export function claimStage(p, stage, vip) {
  const S = STAGES[stage - 1]
  const amount = S.trophies * (vip ? 2 : 1)
  p.trophies += amount
  p.trophiesEarned += amount
  p.clears[stage] = (p.clears[stage] || 0) + 1
  let coins = 0
  if (stage > p.bestStage) {
    coins = firstClearCoins(stage)
    p.coins += coins
    p.bestStage = stage
  }
  return { amount, coins }
}

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)

export function dailyStatus(p, now = Date.now()) {
  const today = dayKey(now)
  if (p.daily.last === today) return { available: false, streak: p.daily.streak }
  const yesterday = dayKey(now - 86400000)
  const streak = p.daily.last === yesterday ? p.daily.streak + 1 : 1
  return { available: true, streak, coins: DAILY_REWARDS[Math.min(streak, DAILY_REWARDS.length) - 1] }
}

export function claimDaily(p, now = Date.now()) {
  const s = dailyStatus(p, now)
  if (!s.available) return { ok: false, error: 'Come back tomorrow!' }
  p.daily = { last: dayKey(now), streak: s.streak }
  p.coins += s.coins
  return { ok: true, coins: s.coins, streak: s.streak }
}

export function claimChest(p, now = Date.now()) {
  const wait = p.chestAt + FREE_CHEST.cooldown * 1000 - now
  if (wait > 0) return { ok: false, error: `Chest refills in ${Math.ceil(wait / 60000)} min.` }
  p.chestAt = now
  const steps = Math.max(FREE_CHEST.minSteps, Math.floor(stepsForLevel(p.level) * FREE_CHEST.stepsPctOfLevel))
  const levelUp = addSteps(p, steps)
  p.coins += FREE_CHEST.coins
  return { ok: true, steps, coins: FREE_CHEST.coins, levelUp }
}

export function claimGift(p, index, sessionSeconds, claimed) {
  const gift = GIFTS[index]
  if (!gift) return { ok: false, error: 'Unknown gift.' }
  if (claimed.has(index)) return { ok: false, error: 'Already claimed.' }
  if (sessionSeconds < gift.at * 60) return { ok: false, error: 'Not ready yet.' }
  claimed.add(index)
  p.coins += gift.coins
  return { ok: true, coins: gift.coins }
}

export function collectPumpkin(p, id, now = Date.now()) {
  const last = p.pumpkinTimes[id] || 0
  if (now - last < EVENT.pumpkinRespawn * 1000) return null
  p.pumpkinTimes[id] = now
  p.pumpkins += 1
  p.coins += EVENT.pumpkinCoins
  return { count: p.pumpkins, coins: EVENT.pumpkinCoins }
}

export function claimEvent(p, index) {
  const m = EVENT.milestones[index]
  if (!m) return { ok: false, error: 'Unknown reward.' }
  if (p.eventClaims.includes(index)) return { ok: false, error: 'Already claimed.' }
  if (p.pumpkins < m.count) return { ok: false, error: `Collect ${m.count} pumpkins first!` }
  p.eventClaims.push(index)
  p.coins += m.coins || 0
  if (m.skin) {
    p.skins[m.skin] = (p.skins[m.skin] || 0) + 1
    if (SKIN_BY_ID[m.skin].mult > skinMultiplier(p)) p.skin = m.skin
  }
  if (m.trail && !p.trails.includes(m.trail)) p.trails.push(m.trail)
  return { ok: true, text: `Claimed: ${m.label}!` }
}

export function collectCoin(p, value) {
  p.coins += value
  p.coinsCollected += 1
  return { coins: value }
}

/* ------------------------------------------------------------------------ */
/* Welcome: starter boost for new players, a gift for coming back            */
/* ------------------------------------------------------------------------ */

/**
 * Call on join, before `lastSeen` is updated.
 * @returns {{ kind: 'new' } | { kind: 'return', daysAway: number, coins: number } | { kind: 'again' }}
 */
export function welcome(p, isNew, now = Date.now()) {
  if (isNew) {
    addStepBoost(p, STEP_BOOST.starterMinutes, now)
    return { kind: 'new', boostMinutes: STEP_BOOST.starterMinutes }
  }
  const away = now - (p.lastSeen || now)
  if (away < RETURN_AFTER_HOURS * 3600000) return { kind: 'again', awayMs: away }
  const daysAway = away / 86400000
  const coins = returnBonusCoins(daysAway)
  p.coins += coins
  addStepBoost(p, STEP_BOOST.returnMinutes, now)
  return { kind: 'return', awayMs: away, daysAway: Math.floor(daysAway), coins, boostMinutes: STEP_BOOST.returnMinutes }
}

/* ------------------------------------------------------------------------ */
/* Daily quests                                                              */
/* ------------------------------------------------------------------------ */

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Deals today's three quests if the day changed. Returns true when it did. */
export function ensureQuests(p, now = Date.now()) {
  const day = dayKey(now)
  if (p.quests?.day === day) return false
  const pool = Object.keys(QUESTS).filter((t) => !QUESTS[t].minLevel || p.level >= QUESTS[t].minLevel || p.rebirths > 0)
  const list = []
  let seed = hash(`${day}:${p.id}`)
  while (list.length < 3 && pool.length) {
    const type = pool.splice(seed % pool.length, 1)[0]
    seed = hash(`${seed}`)
    list.push({ type, goal: QUESTS[type].goal, progress: 0, claimed: false, wins: questWins(p.bestStage), coins: QUEST_COINS })
  }
  p.quests = { day, list, bonusClaimed: false }
  return true
}

/** Adds progress to today's quest of this type. Returns its index when it just completed, else -1. */
export function questProgress(p, type, amount, now = Date.now()) {
  ensureQuests(p, now)
  const i = p.quests.list.findIndex((q) => q.type === type && !q.claimed)
  if (i < 0) return -1
  const q = p.quests.list[i]
  if (q.progress >= q.goal) return -1
  q.progress = Math.min(q.goal, q.progress + amount)
  return q.progress >= q.goal ? i : -1
}

export function claimQuest(p, index, now = Date.now()) {
  ensureQuests(p, now)
  const q = p.quests.list[index]
  if (!q) return { ok: false, error: 'Unknown quest.' }
  if (q.claimed) return { ok: false, error: 'Already claimed.' }
  if (q.progress < q.goal) return { ok: false, error: 'Not done yet!' }
  q.claimed = true
  p.trophies += q.wins
  p.trophiesEarned += q.wins
  p.coins += q.coins
  return { ok: true, wins: q.wins, coins: q.coins, text: `Quest done! +${formatNumber(q.wins)} Wins, +${q.coins} coins` }
}

/** All three claimed: a bonus chest with coins and a x2 steps boost. */
export function claimQuestBonus(p, now = Date.now()) {
  ensureQuests(p, now)
  if (p.quests.bonusClaimed) return { ok: false, error: 'Already claimed today.' }
  if (!p.quests.list.every((q) => q.claimed)) return { ok: false, error: 'Finish all three quests first!' }
  p.quests.bonusClaimed = true
  p.coins += QUEST_BONUS_COINS
  addStepBoost(p, STEP_BOOST.questMinutes, now)
  return { ok: true, text: `Daily bonus! +${QUEST_BONUS_COINS} coins and x2 steps for ${STEP_BOOST.questMinutes} min` }
}

/* ------------------------------------------------------------------------ */
/* Shop products (bought with Wins)                                         */
/* ------------------------------------------------------------------------ */

/** Why a product can't be bought right now, or null. Limited stock is checked by the caller. */
export function productBlocked(p, sku, { free = false } = {}) {
  const product = PRODUCT_BY_SKU[sku]
  if (!product) return 'Unknown item.'
  if (product.kind === 'pass' && (p.passes[sku] || (sku === 'vip' && p.passes.vip_plus))) return 'You already own it!'
  if (product.kind === 'jetpack' && p.jetpacks.includes(product.jetpack)) return 'You already own it!'
  if (product.kind === 'skin' && (p.skins[product.skin] || 0) > 0) return 'You already own it!'
  if (!free && p.trophies < product.price) return needWins(product.price - p.trophies)
  return null
}

/** Pays the Wins and applies the product. `free` is for DEV_PURCHASES only. */
export function buyProduct(p, sku, { free = false } = {}) {
  const blocked = productBlocked(p, sku, { free })
  if (blocked) return { ok: false, error: blocked }
  if (!free) p.trophies -= PRODUCT_BY_SKU[sku].price
  return grantProduct(p, sku)
}

/** Applies a product the player has paid for. */
export function grantProduct(p, sku) {
  const product = PRODUCT_BY_SKU[sku]
  if (!product) return { ok: false, error: `Unknown sku ${sku}` }
  switch (product.kind) {
    case 'pass':
      p.passes[sku] = true
      if (sku === 'vip_plus') p.passes.vip = true
      return { ok: true, text: `${product.name} unlocked!` }
    case 'steps': {
      const levelUp = addSteps(p, product.amount)
      return { ok: true, text: `+${formatNumber(product.amount)} steps!`, levelUp }
    }
    case 'jetpack':
      if (!p.jetpacks.includes(product.jetpack)) p.jetpacks.push(product.jetpack)
      p.jetpack = product.jetpack
      return { ok: true, bought: true, text: `${product.name} equipped!` }
    case 'skipRebirth':
      p.skipCredits += 1
      return { ok: true, skip: true, text: 'Rebirth skip ready!' }
    case 'skin':
      p.skins[product.skin] = (p.skins[product.skin] || 0) + 1
      p.skin = product.skin
      return { ok: true, text: `${product.name} equipped!` }
    case 'coins':
      p.coins += product.amount
      return { ok: true, text: `+${product.amount} coins!` }
    default:
      return { ok: false, error: 'Unhandled product.' }
  }
}

/** The private slice of the profile the owning client sees. */
export function privateView(p, extra = {}) {
  return {
    level: p.level,
    steps: p.steps,
    rebirths: p.rebirths,
    trophies: p.trophies,
    trophiesEarned: p.trophiesEarned,
    coins: p.coins,
    jetpacks: p.jetpacks,
    jetpack: p.jetpack,
    boosts: p.boosts,
    skins: p.skins,
    skin: p.skin,
    trails: p.trails,
    trail: p.trail,
    passes: p.passes,
    playtime: Math.floor(p.playtime),
    bestStage: p.bestStage,
    pumpkins: p.pumpkins,
    pumpkinTimes: p.pumpkinTimes,
    eventClaims: p.eventClaims,
    daily: dailyStatus(p),
    chestAt: p.chestAt,
    teleportCredits: p.teleportCredits,
    skipCredits: p.skipCredits,
    tutorialDone: p.tutorialDone,
    boostUntil: p.boostUntil,
    quests: p.quests,
    stepsPerStep: stepsPerStep(p),
    ...extra,
  }
}
