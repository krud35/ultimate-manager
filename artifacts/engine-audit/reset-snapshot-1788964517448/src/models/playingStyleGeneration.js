import { PLAYER_ARCHETYPES } from './playerArchetypes.js'
export const PLAYING_STYLE_CATEGORIES = {
  "thrower": [
    "huck_lover",
    "dump_guy",
    "safe_hands",
    "creative_thrower",
    "hammer_happy",
    "force_happy",
    "iso_ball",
    "zone_breaker",
    "good_insides",
    "good_arounds",
    "fakes_a_lot"
  ],
  "receiver": [
    "deep_threat",
    "under_cutter",
    "layout_machine",
    "aggressive_cutter",
    "hesitant_cutter",
    "long_cuts",
    "quick_cuts",
    "double_move_cutter",
    "sideline_receiver",
    "attacks_disc_high"
  ],
  "offense": [
    "wants_the_disc",
    "disciplined",
    "give_and_go",
    "upline_seeker",
    "swing_first",
    "attack_turnover",
    "settle_turnover"
  ],
  "defense": [
    "shutdown",
    "poacher",
    "physical_mark",
    "soft_mark",
    "foul_prone",
    "deny_deep",
    "deny_under",
    "recovery_defense"
  ]
}
export const STYLE_CATEGORY = Object.fromEntries(Object.entries(PLAYING_STYLE_CATEGORIES).flatMap(([category, ids]) => ids.map(id => [id, category])))
export const STYLE_COUNT_WEIGHTS = [
 [65,30,5,0,0,0], [30,45,20,5,0,0], [10,25,40,20,5,0],
 [5,15,30,30,15,5], [0,10,25,35,20,10],
]
export const ALL_ROUNDER_COUNT_WEIGHTS = [
 [0,0,80,20,0,0], [0,0,60,30,10,0], [0,0,30,45,20,5],
 [0,0,15,40,30,15], [0,0,10,30,35,25],
]
export const STYLE_ROLE_WEIGHTS = {
 handler: {thrower:55,receiver:10,offense:25,defense:10},
 cutter: {thrower:10,receiver:55,offense:25,defense:10},
 defender: {thrower:10,receiver:20,offense:15,defense:55},
 utility: {thrower:25,receiver:25,offense:25,defense:25},
}
export function styleFamily(player) { return PLAYER_ARCHETYPES[player?.archetype]?.family ?? 'unknown' }
export function styleCountWeights(player) {
 const age = Number.isFinite(player?.age) ? player.age : 25
 const band = age <= 19 ? 0 : age <= 22 ? 1 : age <= 26 ? 2 : age <= 30 ? 3 : 4
 return (styleFamily(player) === 'utility' ? ALL_ROUNDER_COUNT_WEIGHTS : STYLE_COUNT_WEIGHTS)[band]
}
export function weightedStylePick(items, weight, rng) {
 let roll = rng() * items.reduce((sum, item) => sum + weight(item), 0)
 return items.find(item => { roll -= weight(item); return roll < 0 }) ?? items.at(-1)
}
export function initialStyleCount(player, rng) {
 return weightedStylePick([1,2,3,4,5,6], count => styleCountWeights(player)[count - 1], rng)
}

export function generatePlayingStyles(player, count, rng, eligible, traitWeight) {
 const selected = [], counts = {thrower:0,receiver:0,offense:0,defense:0}
 const family = styleFamily(player)
 const weights = STYLE_ROLE_WEIGHTS[family] ?? STYLE_ROLE_WEIGHTS.utility
 const primary = {handler:'thrower',cutter:'receiver',defender:'defense'}[family]
 for (let slot = 0; slot < count; slot++) {
  const pool = eligible(selected)
  let categories = Object.keys(counts).filter(category => counts[category] < 4 && pool.some(id => STYLE_CATEGORY[id] === category))
  if (family === 'utility') {
   const min = Math.min(...categories.map(category => counts[category]))
   categories = categories.filter(category => counts[category] === min)
  } else if (slot === 0 && primary && categories.includes(primary)) categories = [primary]
  else if (count >= 3 && slot === count - 1 && Object.values(counts).filter(Boolean).length === 1) {
   categories = categories.filter(category => !counts[category])
  }
  if (!categories.length) throw new Error('No compatible playing style category')
  const category = weightedStylePick(categories, key => weights[key], rng)
  const candidates = pool.filter(id => STYLE_CATEGORY[id] === category)
  const id = weightedStylePick(candidates, traitWeight, rng)
  selected.push(id)
  counts[category]++
 }
 return selected
}
