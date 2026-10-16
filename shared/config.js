/**
 * Game balance — the single source of truth for every number in the game.
 *
 * Imported by the Colyseus server (authoritative: it awards steps, levels,
 * trophies and validates purchases) and by the client (movement, HUD, shop
 * labels). Keep this file free of browser/Node-only APIs.
 *
 * Distances are in studs (player is 5 studs tall), time in seconds.
 */

/* ------------------------------------------------------------------------ */
/* Movement                                                                  */
/* ------------------------------------------------------------------------ */

export const PHYSICS = Object.freeze({
  GRAVITY: 150,
  JUMP_VELOCITY: 50,
  /**
   * Jetpack vertical speed it settles at. Moving (Space + WASD) = near-level
   * forward flight; standing still (Space only) = climb straight up.
   */
  JET_CRUISE_VY: 2,
  JET_CLIMB_VY: 16,
  /** How fast thrust catches a falling player (1/s, exponential). */
  JET_RESPONSE: 5,
  /** Horizontal speed multiplier while the jetpack fires. */
  FLY_SPEED_MULT: 1.15,
  /** Holding jump only lights the jetpack after this long in the air, so a tap is a plain jump. */
  JET_DELAY: 0.16,
  /** Fuel units burned per second of thrust. Jetpack 1 (10 fuel) = 2.5 s of flight. */
  FUEL_DRAIN: 4,
  /** Fuel refilled per second on the ground, as a fraction of max fuel. */
  FUEL_REFILL_RATE: 1.6,
  TERMINAL_VELOCITY: 190,
  PLAYER_HEIGHT: 5,
  PLAYER_RADIUS: 0.9,
  STEP_HEIGHT: 1.6,
  GROUND_ACCEL: 38,
  AIR_ACCEL: 22,
  ICE_ACCEL: 2.2,
})

/* ------------------------------------------------------------------------ */
/* Steps, levels, speed, rebirth                                             */
/* ------------------------------------------------------------------------ */

/** Seconds of movement that count as one "step". */
export const STEP_INTERVAL = 0.4

export const BASE_LEVEL_CAP = 20
export const LEVEL_CAP_PER_REBIRTH = 30
export const MAX_REBIRTHS = 200

/** Max level reachable at a given rebirth count: 20, 50, 80, 110, ... */
export const levelCap = (rebirths) => BASE_LEVEL_CAP + LEVEL_CAP_PER_REBIRTH * rebirths

/** Rebirth step multiplier: x1, x1.5, x2, x2.5, ... */
export const rebirthMultiplier = (rebirths) => 1 + 0.5 * rebirths

/** Walk speed for a level. Level 6 -> 20, level 7 -> 22 ("Speed increased: 20 -> 22"). */
export const speedForLevel = (level) => 8 + 2 * Math.max(1, level)

/**
 * Steps needed to go from `level` to `level + 1`.
 * Levels 1-19 reproduce the original game exactly (33, 75, 126, 186, 247, ...,
 * 567, 634, ... 1.2K, 1.3K cumulative); past 20 the curve turns exponential so
 * rebirth multipliers and step boosts stay meaningful.
 */
function levelIncrement(n) {
  if (n <= 4) return 33 + 9 * (n - 1)
  if (n <= 11) return 60 + (n - 4)
  if (n <= 19) return 67 + 3 * (n - 11)
  return Math.round((67 + 3 * (n - 11)) * Math.pow(1.07, n - 19))
}

const THRESHOLDS = [0]
/** Cumulative steps required to *leave* `level` (reach level + 1). */
export function stepsForLevel(level) {
  const n = Math.max(1, Math.floor(level))
  while (THRESHOLDS.length <= n) {
    const i = THRESHOLDS.length
    THRESHOLDS.push(THRESHOLDS[i - 1] + levelIncrement(i))
  }
  return THRESHOLDS[n]
}

/** Steps at which a player sitting at the level cap is clamped (bar shows full). */
export const stepsAtCap = (rebirths) => stepsForLevel(levelCap(rebirths) - 1)

/** Step progress for the HUD bar: { current, needed } for the level the player is on. */
export function levelProgress(level, steps, rebirths) {
  const cap = levelCap(rebirths)
  if (level >= cap) {
    const full = stepsAtCap(rebirths)
    return { current: Math.min(steps, full), needed: full, maxed: true }
  }
  return { current: steps, needed: stepsForLevel(level), maxed: false }
}

/* ------------------------------------------------------------------------ */
/* Jetpacks (fuel = flight time)                                             */
/* ------------------------------------------------------------------------ */

export const JETPACKS = [
  { id: 'jp1', name: 'Jetpack 1', price: 0, fuel: 10, color: '#e8742a', band: '#5a3a2a', flame: '#ffb347' },
  { id: 'jp2', name: 'Jetpack 2', price: 3, fuel: 12, color: '#f5c518', band: '#5b4a1a', flame: '#ffd36b' },
  { id: 'jp3', name: 'Jetpack 3', price: 35, fuel: 15, color: '#2ea6f2', band: '#173a5c', flame: '#8fe3ff' },
  { id: 'jp4', name: 'Jetpack 4', price: 200, fuel: 17, color: '#8e4cf0', band: '#3a1d63', flame: '#d6a6ff' },
  { id: 'jp5', name: 'Jetpack 5', price: 1000, fuel: 20, color: '#e8333a', band: '#5c1416', flame: '#ff8a5c' },
  { id: 'jp6', name: 'Jetpack 6', price: 4000, fuel: 24, color: '#22c55e', band: '#0f4d27', flame: '#a3ff8f' },
  { id: 'jp7', name: 'Jetpack 7', price: 15000, fuel: 28, color: '#ff7ad9', band: '#5c1d4a', flame: '#ffc2f0' },
  { id: 'jp8', name: 'Jetpack 8', price: 50000, fuel: 33, color: '#1de9d6', band: '#0d4f4a', flame: '#b0fff6' },
  { id: 'jp9', name: 'Jetpack 9', price: 150000, fuel: 38, color: '#ffd84d', band: '#6b4e00', flame: '#fff3b0', glow: true },
  { id: 'jp10', name: 'Jetpack 10', price: 500000, fuel: 45, color: '#ffffff', band: '#7c4dff', flame: '#c9b6ff', glow: true },
  { id: 'pulse', name: 'Pulse Jetpack', price: 0, sku: 'pulse_jetpack', fuel: 25, color: '#1b2a4a', band: '#28e0ff', flame: '#28e0ff', glow: true },
]
export const JETPACK_BY_ID = Object.fromEntries(JETPACKS.map((j) => [j.id, j]))

/* ------------------------------------------------------------------------ */
/* Step boosts (the STEPS pads in the lobby): each step gives +N instead of +1 */
/* ------------------------------------------------------------------------ */

export const STEP_BOOSTS = [
  { id: 'b1', amount: 1, price: 0 },
  { id: 'b2', amount: 2, price: 3 },
  { id: 'b3', amount: 5, price: 10 },
  { id: 'b4', amount: 10, price: 25 },
  { id: 'b5', amount: 15, price: 75 },
  { id: 'b6', amount: 20, price: 200 },
  { id: 'b7', amount: 40, price: 500 },
  { id: 'b8', amount: 80, price: 1000 },
  { id: 'b9', amount: 150, price: 4000 },
  { id: 'b10', amount: 300, price: 15000 },
  { id: 'b11', amount: 600, price: 50000 },
  { id: 'b12', amount: 1200, price: 150000 },
]
export const BOOST_BY_ID = Object.fromEntries(STEP_BOOSTS.map((b) => [b.id, b]))

/* ------------------------------------------------------------------------ */
/* Stages                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * `recLevel` / `recFuel` are what the level generator designs the gaps around:
 * the longest jump in a stage is ~72% of what a player at that level and fuel
 * can cover, so "Recommended" really means "this is enough".
 * `trophies` is the Wins paid by the yellow pad; the pink VIP pad pays double.
 * (Wins are stored as `trophies` in profiles - the field predates the name.)
 */
export const STAGES = [
  { id: 1, name: 'Lava Halls', theme: 'lava', recLevel: 5, recFuel: 10, trophies: 3, width: 130, ceiling: 46 },
  { id: 2, name: 'Haunted Crypt', theme: 'crypt', recLevel: 15, recFuel: 12, trophies: 10, width: 170, ceiling: 60 },
  { id: 3, name: 'Ghost Void', theme: 'void', recLevel: 35, recFuel: 15, trophies: 35, width: 220, ceiling: 70 },
  { id: 4, name: 'Frozen Crushers', theme: 'ice', recLevel: 50, recFuel: 17, trophies: 120, width: 260, ceiling: 80 },
  { id: 5, name: 'Toxic Lab', theme: 'toxic', recLevel: 65, recFuel: 20, trophies: 400, width: 300, ceiling: 90 },
  { id: 6, name: 'Crystal Caverns', theme: 'crystal', recLevel: 80, recFuel: 24, trophies: 1200, width: 340, ceiling: 100 },
  { id: 7, name: 'Laser Factory', theme: 'neon', recLevel: 95, recFuel: 28, trophies: 4000, width: 380, ceiling: 110 },
  { id: 8, name: 'Storm Reactor', theme: 'storm', recLevel: 115, recFuel: 33, trophies: 12000, width: 420, ceiling: 120 },
  { id: 9, name: 'The Core', theme: 'core', recLevel: 135, recFuel: 38, trophies: 40000, width: 460, ceiling: 130 },
]

/** Coins paid out the first time a player clears each stage. */
export const firstClearCoins = (stage) => 15 * stage

/** Each coin floating along a stage's path is worth this much; they come back every run. */
export const coinValue = (stage) => stage

/* ------------------------------------------------------------------------ */
/* Skins (jetpack skins from crates) — give a step multiplier                */
/* ------------------------------------------------------------------------ */

export const RARITIES = {
  common: { label: 'Common', color: '#b9c6da' },
  uncommon: { label: 'Uncommon', color: '#5fd35f' },
  rare: { label: 'Rare', color: '#3aa0ff' },
  epic: { label: 'Epic', color: '#b45cff' },
  legendary: { label: 'Legendary', color: '#ffb800' },
  exclusive: { label: 'Exclusive', color: '#ff4fd8' },
  event: { label: 'Special', color: '#ff8a1a' },
}

const crateSkins = (crate, pattern, list) =>
  list.map(([id, name, rarity, chance, mult, colors]) => ({ id, name, crate, rarity, chance, mult, colors, pattern }))

export const SKINS = [
  ...crateSkins('thruster', 'tri', [
    ['tri_frost', 'Frost Thruster', 'common', 45, 1.1, ['#eef6ff', '#5ccfff', '#ff5a8a']],
    ['tri_cherry', 'Cherry Thruster', 'uncommon', 35, 1.25, ['#ffe1ea', '#ff3b5c', '#ffd43b']],
    ['tri_lime', 'Lime Thruster', 'rare', 15, 1.5, ['#1f2a14', '#b6ff3b', '#3bf0ff']],
    ['tri_sunset', 'Sunset Thruster', 'epic', 4, 2, ['#2a1446', '#ff8a3b', '#ff3bd4']],
    ['tri_prism', 'Prism Thruster', 'legendary', 1, 3, ['#ffffff', '#3bffb4', '#9b5cff']],
  ]),
  ...crateSkins('loadpoint', 'dot', [
    ['dot_snow', 'Snow Loadpoint', 'common', 45, 1.15, ['#f4f6fb', '#202a44', '#7aa2ff']],
    ['dot_candy', 'Candy Loadpoint', 'uncommon', 35, 1.3, ['#ffd6f0', '#ff4fb5', '#4fd6ff']],
    ['dot_ocean', 'Ocean Loadpoint', 'rare', 15, 1.6, ['#0f3b66', '#3bd1ff', '#ffffff']],
    ['dot_magma', 'Magma Loadpoint', 'epic', 4, 2.2, ['#2a0d08', '#ff5a1f', '#ffd21f']],
    ['dot_galaxy', 'Galaxy Loadpoint', 'legendary', 1, 3.5, ['#140b2e', '#ff5cf0', '#5cf0ff']],
  ]),
  ...crateSkins('cosmic', 'bar', [
    ['bar_ruby', 'Ruby Cosmic', 'common', 45, 1.3, ['#2a0b12', '#ff2b4f', '#ffd0d8']],
    ['bar_lemon', 'Lemon Cosmic', 'uncommon', 35, 1.6, ['#2b2a0b', '#fff23b', '#ffffff']],
    ['bar_cyan', 'Cyan Cosmic', 'rare', 15, 2, ['#0b222b', '#2bf0ff', '#ffffff']],
    ['bar_violet', 'Violet Cosmic', 'epic', 4, 3, ['#170b2b', '#a23bff', '#ff8af0']],
    ['bar_nova', 'Nova Cosmic', 'legendary', 1, 5, ['#000000', '#ffffff', '#ffb800']],
  ]),
  {
    id: 'moonlit_pulse', name: 'Moonlit Pulse', rarity: 'exclusive', mult: 6, pattern: 'star',
    colors: ['#3b1a7a', '#ffe14d', '#ff4fd8'], limited: 5000, sku: 'moonlit_pulse', wings: 'spikes',
  },
  {
    id: 'boo_pulse', name: 'Boo Pulse', rarity: 'event', mult: 2.5, pattern: 'dot',
    colors: ['#e9f7ff', '#29d3ff', '#ffffff'], wings: 'angel',
  },
]
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]))

export const CRATES = [
  { id: 'thruster', name: 'Thruster', price: 200, pattern: 'tri', theme: ['#f6e4ec', '#c99aae'] },
  { id: 'loadpoint', name: 'Loadpoint', price: 200, pattern: 'dot', theme: ['#2a2f4a', '#141829'] },
  { id: 'cosmic', name: 'Cosmic', price: 600, pattern: 'bar', theme: ['#32124f', '#170828'] },
]
export const CRATE_BY_ID = Object.fromEntries(CRATES.map((c) => [c.id, c]))
export const skinsInCrate = (crateId) => SKINS.filter((s) => s.crate === crateId)
/** Coins refunded when a crate rolls a skin the player already owns. */
export const DUPLICATE_REFUND = 0.25

/* ------------------------------------------------------------------------ */
/* Trails                                                                    */
/* ------------------------------------------------------------------------ */

export const TRAILS = [
  { id: 'arrows', name: 'Arrows', price: 0, currency: 'trophies', kind: 'chevron', color: '#ffffff' },
  { id: 'sparkle', name: 'Sparkle', price: 60, currency: 'coins', kind: 'sparkle', color: '#ffe066' },
  { id: 'hearts', name: 'Hearts', price: 150, currency: 'coins', kind: 'heart', color: '#ff5c8a' },
  { id: 'flames', name: 'Flames', price: 800, currency: 'trophies', kind: 'flame', color: '#ff7a1a' },
  { id: 'rainbow', name: 'Rainbow', price: 400, currency: 'coins', kind: 'ribbon', color: 'rainbow' },
  { id: 'ghost', name: 'Ghostly', price: 0, currency: 'event', kind: 'ghost', color: '#cdbbff' },
  { id: 'lightning', name: 'Lightning', price: 20000, currency: 'trophies', kind: 'bolt', color: '#7df9ff' },
  { id: 'galaxy', name: 'Galaxy', price: 250000, currency: 'trophies', kind: 'star', color: '#b18bff' },
]
export const TRAIL_BY_ID = Object.fromEntries(TRAILS.map((t) => [t.id, t]))

/* ------------------------------------------------------------------------ */
/* Shop products - everything is bought with Wins earned in the game          */
/* ------------------------------------------------------------------------ */

/** `price` is in Wins. `sku` is the product's id in messages and saves. */
export const PRODUCTS = {
  x2_steps: { sku: 'x2_steps', name: 'x2 Multiplier', desc: 'Double every step, forever.', price: 1500, kind: 'pass' },
  vip: { sku: 'vip', name: 'VIP', desc: 'VIP treadmills (x2 steps), pink pads (x2 Wins), VIP tag.', price: 2500, kind: 'pass' },
  vip_plus: { sku: 'vip_plus', name: 'VIP+', desc: 'VIP+ treadmills (x4 steps) and everything in VIP.', price: 25000, kind: 'pass' },
  steps_25k: { sku: 'steps_25k', name: '+25K Steps', amount: 25000, price: 120, kind: 'steps' },
  steps_150k: { sku: 'steps_150k', name: '+150K Steps', amount: 150000, price: 600, kind: 'steps' },
  steps_2m: { sku: 'steps_2m', name: '+2M Steps', amount: 2000000, price: 6000, kind: 'steps' },
  pulse_jetpack: { sku: 'pulse_jetpack', name: 'Pulse Jetpack', desc: '25 fuel. Glows.', price: 8000, kind: 'jetpack', jetpack: 'pulse' },
  skip_rebirth: { sku: 'skip_rebirth', name: 'Skip Rebirth', desc: 'Rebirth without losing your level.', price: 1000, kind: 'skipRebirth' },
  moonlit_pulse: { sku: 'moonlit_pulse', name: 'Moonlit Pulse', desc: 'Exclusive x6 skin. Limited stock.', price: 50000, kind: 'skin', skin: 'moonlit_pulse' },
  coins_300: { sku: 'coins_300', name: '300 Coins', amount: 300, price: 150, kind: 'coins' },
  coins_1500: { sku: 'coins_1500', name: '1,500 Coins', amount: 1500, price: 600, kind: 'coins' },
}
export const PRODUCT_BY_SKU = Object.fromEntries(Object.values(PRODUCTS).map((p) => [p.sku, p]))

export const MOONLIT_STOCK = 5000

/* ------------------------------------------------------------------------ */
/* Treadmills                                                                */
/* ------------------------------------------------------------------------ */

export const TREADMILL_TYPES = {
  normal: { mult: 1, requires: null, label: '' },
  vip: { mult: 2, requires: 'vip', label: 'VIP REQUIRED · x2 STEPS!' },
  vip_plus: { mult: 4, requires: 'vip_plus', label: 'VIP+ REQUIRED · x4 STEPS!' },
}

/* ------------------------------------------------------------------------ */
/* Retention: playtime gifts, daily streak, free chest, Spooky event, races  */
/* ------------------------------------------------------------------------ */

/** Session playtime gifts. `at` is minutes online. */
export const GIFTS = [
  { at: 1, coins: 5 },
  { at: 3, coins: 10 },
  { at: 5, coins: 15 },
  { at: 10, coins: 25, trophyPct: 0 },
  { at: 15, coins: 30 },
  { at: 20, coins: 40 },
  { at: 30, coins: 60 },
  { at: 45, coins: 80 },
  { at: 60, coins: 120 },
]

export const DAILY_REWARDS = [20, 30, 40, 50, 75, 100, 200]

/** "Like the game" chest in the lobby. */
export const FREE_CHEST = { cooldown: 20 * 60, minSteps: 5000, stepsPctOfLevel: 0.25, coins: 15 }

export const EVENT = {
  id: 'spooky',
  name: 'Spooky Season',
  pumpkinRespawn: 180,
  pumpkinCoins: 2,
  milestones: [
    { count: 20, coins: 50, skin: 'boo_pulse', label: 'Boo Pulse skin' },
    { count: 50, coins: 150, trail: 'ghost', label: 'Ghostly trail' },
    { count: 100, coins: 400, label: '400 Coins' },
    { count: 200, coins: 1000, label: '1,000 Coins' },
  ],
}

export const RACE = {
  MIN_LEVEL: 50,
  /** Seconds between race invitations (only sent when someone is eligible). */
  INTERVAL: 240,
  INVITE: 20,
  COUNTDOWN: 4,
  MAX_TIME: 75,
  REWARDS: [20, 10, 5],
  PARTICIPATION: 2,
}

/* ------------------------------------------------------------------------ */
/* Coming back, playing together, daily quests                               */
/* ------------------------------------------------------------------------ */

/** Timed "x2 Steps" boost: new players, returning players and quest bonus. Timers add up to `maxMinutes`. */
export const STEP_BOOST = { mult: 2, starterMinutes: 15, returnMinutes: 10, questMinutes: 15, maxMinutes: 60 }

/** Back after this long away: a welcome-back gift (coins + boost). */
export const RETURN_AFTER_HOURS = 20
export const returnBonusCoins = (daysAway) => 25 * Math.min(7, Math.max(1, Math.floor(daysAway)))

/** Every other player in your server gives +10% steps, up to +50% - more fun (and faster) together. */
export const SQUAD = { perPlayer: 0.1, max: 0.5 }
export const squadMultiplier = (others) => 1 + Math.min(SQUAD.max, SQUAD.perPlayer * Math.max(0, others))

/**
 * Three daily quests, reset at 00:00 UTC. `goal` is what the player must
 * reach; rewards are sized to their best stage when the day's quests are dealt.
 */
export const QUESTS = {
  walk: { goal: 400, label: (n) => `Take ${formatGoal(n)} steps` },
  coins: { goal: 30, label: (n) => `Collect ${n} coins on the stages` },
  escape: { goal: 2, label: (n) => `Escape ${n} stages` },
  treadmill: { goal: 120, label: (n) => `Train ${Math.round(n / 60)} minutes on treadmills` },
  fly: { goal: 45, label: (n) => `Fly ${n} seconds with your jetpack` },
  pumpkins: { goal: 4, label: (n) => `Find ${n} pumpkins` },
  race: { goal: 1, label: () => 'Race other players once', minLevel: 50 },
}
const formatGoal = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n))
export const QUEST_COINS = 40
/** Wins per quest: most of what the player's best stage pays. */
export const questWins = (bestStage) => Math.max(3, Math.round((STAGES[Math.max(0, bestStage - 1)]?.trophies || 3) * 0.6))
export const QUEST_BONUS_COINS = 100

export const CHAT = { MAX_LENGTH: 120, COOLDOWN_MS: 1200 }

/** Server tick rates. */
export const NET = { SEND_HZ: 15, PATCH_MS: 50, TICK_MS: 100 }
