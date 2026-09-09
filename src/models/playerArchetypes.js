import { PLAYER_STAT_CATEGORIES, clampSubStat, getOverallRating } from './playerStats.js'

// Category offsets describe ability, never add match modifiers or personality.
export const PLAYER_ARCHETYPES = {
  control_handler: { pl: 'Rozgrywający kontrolujący tempo', en: 'Control handler', family: 'handler', offsets: [8, -6, 7, 0, -9] },
  deep_handler: { pl: 'Rozgrywający długim podaniem', en: 'Deep handler', family: 'handler', offsets: [10, -2, 3, -3, -8] },
  mobile_handler: { pl: 'Mobilny rozgrywający', en: 'Mobile handler', family: 'handler', offsets: [5, 5, 1, 2, -13] },
  under_cutter: { pl: 'Cutter pod dysk', en: 'Under cutter', family: 'cutter', offsets: [-6, 4, 0, 9, -7] },
  deep_cutter: { pl: 'Cutter atakujący głębię', en: 'Deep cutter', family: 'cutter', offsets: [-9, 9, -4, 8, -4] },
  matchup_defender: { pl: 'Obrońca indywidualny', en: 'Matchup defender', family: 'defender', offsets: [-7, 5, 0, -7, 9] },
  reading_defender: { pl: 'Obrońca czytający grę', en: 'Reading defender', family: 'defender', offsets: [-4, -4, 8, -8, 8] },
  all_rounder: { pl: 'Uniwersalny', en: 'All-rounder', family: 'utility', offsets: [2, -1, 1, -1, -1] },
}

const SPECIALTIES = {
  control_handler: { 'throwing.backhand': 3, 'throwing.touch': 4, 'throwing.huck': -4,
    'offensive.resetMovement': 6, 'mental.decisionMaking': 3 },
  deep_handler: { 'throwing.huck': 5, 'throwing.power': 5, 'throwing.touch': -3,
    'mental.vision': 3, 'offensive.resetMovement': 3 },
  mobile_handler: { 'physical.acceleration': 4, 'physical.agility': 3, 'physical.jump': -3,
    'offensive.resetMovement': 5, 'throwing.releaseControl': 3 },
  under_cutter: { 'physical.agility': 3, 'offensive.routeCraft': 4, 'offensive.cutTiming': 4,
    'offensive.resetMovement': -3 },
  deep_cutter: { 'physical.speed': 4, 'physical.jump': 4, 'offensive.discReading': 4,
    'offensive.resetMovement': -5 },
  matchup_defender: { 'defensive.matchupReading': 4, 'defensive.marking': 4,
    'physical.acceleration': 3, 'mental.vision': -3 },
  reading_defender: { 'defensive.positioning': 4, 'defensive.discReading': 4,
    'mental.anticipation': 4, 'physical.speed': -3 },
  all_rounder: {},
}

function shuffle(values, rng) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function initialAge(rng) {
  const r = rng()
  const [min, width] = r < 0.1 ? [18, 2] : r < 0.28 ? [20, 3] : r < 0.62 ? [23, 5]
    : r < 0.82 ? [28, 3] : r < 0.94 ? [31, 3] : [34, 3]
  return min + Math.floor(rng() * width)
}

/** New UltiLeague rosters only. Ensure several options for both seven-player lines. */
export function assignRosterArchetypes(players, tier, rng, coverage) {
  const n = players.length
  const handlers = Math.max(3, Math.round(n * 0.25))
  const cutters = Math.max(4, Math.round(n * 0.32))
  const defenders = Math.max(3, Math.round(n * 0.25))
  const counts = { handler: handlers, cutter: cutters, defender: defenders }
  const gaps = coverage?.gaps ?? []
  const available = ['handler', 'cutter', 'defender'].filter(family => !gaps.includes(family))
  const surplusFamily = gaps.length ? available[Math.floor(rng() * available.length)] : null
  // Missing depth, never a completely unplayable family of roles.
  for (const family of gaps) {
    counts[surplusFamily] += counts[family] - 2
    counts[family] = 2
  }
  const roles = [
    ...Array.from({ length: counts.handler }, (_, i) => ['control_handler', 'deep_handler', 'mobile_handler'][i % 3]),
    ...Array.from({ length: counts.cutter }, (_, i) => ['under_cutter', 'deep_cutter'][i % 2]),
    ...Array.from({ length: counts.defender }, (_, i) => ['matchup_defender', 'reading_defender'][i % 2]),
  ]
  while (roles.length < n) roles.push('all_rounder')
  const assignments = shuffle(roles.slice(0, n), rng)
  players.forEach((p, index) => {
    p.archetype = assignments[index]
    p.age = initialAge(rng)
    // Talent is independent of playing role and personality. League shifts the
    // probability distribution, not everyone's remaining development by +4/+6.
    p.generationTalent = Math.max(0, Math.min(1, rng() + (2 - tier) * 0.08))
    p.innatePotential = Math.round(74 + 21 * p.generationTalent)
    p.developmentModel = 'talent-v1'
    const offsets = PLAYER_ARCHETYPES[p.archetype].offsets
    const original = p.skills
    p.skills = Object.fromEntries(Object.entries(PLAYER_STAT_CATEGORIES).map(([cat, keys], i) => {
      const variation = (rng() - 0.5) * 4
      const ageOffset = cat === 'physical' ? (p.age < 24 ? 2 : p.age >= 31 ? -(p.age - 29) * 0.7 : 0)
        : cat === 'mental' || cat === 'throwing' ? (p.age <= 22 ? -3 : p.age >= 29 ? 2 : 0) : 0
      return [cat, Object.fromEntries(keys.map(key => [key, clampSubStat(original[cat][key]
        + offsets[i] + variation + ageOffset + (SPECIALTIES[p.archetype][`${cat}.${key}`] ?? 0), cat)]))]
    }))
  })
}

/** Must run after final OVR fitting. Never modify legacy saves on load. */
export function finalizeGeneratedPotential(players) {
  for (const p of players) {
    const ovr = getOverallRating(p.skills)
    // A generated player's demonstrated ability is a lower bound on their ceiling.
    p.innatePotential = Math.min(95, Math.max(p.innatePotential, ovr))
    p.potential = generatedPotentialForAge(p, ovr)
  }
}

export function generatedPotentialForAge(player, ovr) {
  const age = player.age ?? 25
  const room = age <= 21 ? 18 : age <= 24 ? 12 : age <= 27 ? 7 : age <= 30 ? 3 : 0
  return Math.max(ovr, Math.min(player.innatePotential, ovr + room, 95))
}
