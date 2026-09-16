import { ROSTER_STRUCTURE_WEIGHTS, sampleRosterWeight, rosterQualityOffset } from './rosterStructures.js'
import { PLAYER_ARCHETYPES } from '../models/playerArchetypes.js'
import { clampOverallTarget, scaleSkillsToTargetOvr } from '../models/playerStats.js'

// Club baselines for NEW careers. Keep skillsGen unchanged: existing saves
// must not reroll their rosters when this balance configuration changes.
export const EUCS_ROSTER_BALANCE = {
  1: { mean: 81 },
  2: { mean: 76 },
  3: { mean: 71 },
}

/** Small samples shrink towards the tier average; placeholders carry no signal.
 * Absolute win rate differences avoid amplifying a narrow min/max range.
 */
export function eucsResultAdjustment(team, tierTeams) {
  const known = tierTeams.filter(t => !t.placeholderStats && Number.isFinite(t.winPct)
    && Number.isFinite(t.wins) && Number.isFinite(t.losses) && t.wins + t.losses > 0)
  if (team.placeholderStats || !Number.isFinite(team.winPct) || !Number.isFinite(team.wins)
    || !Number.isFinite(team.losses) || team.wins + team.losses <= 0 || !known.length) return 0
  const games = t => t.wins + t.losses
  const total = known.reduce((sum, t) => sum + games(t), 0)
  const mean = known.reduce((sum, t) => sum + t.winPct * games(t), 0) / total
  const confidence = games(team) / (games(team) + 6)
  return Math.max(-2.5, Math.min(2.5, (team.winPct - mean) / 50 * 5 * confidence))
}

/** Compatibility entry point for the European pyramid; existing saves never reroll. */
export function applyEucsOvrDistribution(players, tier, adjustment, rng, coverage) {
  const profile = EUCS_ROSTER_BALANCE[tier]
  if (!profile) throw new RangeError(`Unknown UltiLeague tier: ${tier}`)
  return applyClubOvrDistribution(players, { tier, strength: profile.mean + adjustment, rng, coverage })
}

/** Club-relative hierarchy with an independent, rare world-class draw.
 * Strength is a baseline, not an exact mean to enforce by inflating everyone.
 */
export function applyClubOvrDistribution(players, { tier, strength, rng, coverage }) {
  if (!players.length) return
  const n = players.length
  const shape = sampleRosterWeight(ROSTER_STRUCTURE_WEIGHTS, Math.min(3, Math.max(1, tier)), rng)
  const order = players.map(p => ({ p, quality: (p.generationTalent ?? 0.5) * 0.55
    + (p.age >= 23 && p.age <= 30 ? 0.15 : p.age <= 21 ? -0.08 : 0) + rng() * 0.3 }))
    .sort((a, b) => b.quality - a.quality)
  if (coverage?.level === 'complete' && n >= 14) {
    // Allocate the first two quality bands to mixed lines, retaining talent order
    // inside each band. Actual rounded OVR can tie or overlap between neighbours.
    for (const start of [0, 7]) {
      const selected = []
      for (const family of ['handler', 'cutter', 'defender']) {
        for (let count = 0; count < 2; count++) {
          const index = order.findIndex(({ p }, i) => i >= start && PLAYER_ARCHETYPES[p.archetype]?.family === family)
          if (index >= 0) selected.push(...order.splice(index, 1))
        }
      }
      while (selected.length < 7 && order.length > start) selected.push(...order.splice(start, 1))
      selected.sort((a, b) => b.quality - a.quality)
      order.splice(start, 0, ...selected)
    }
  }
  const offsets = order.map((_, i) => 0.6 * rosterQualityOffset(shape, i, n))
  // A small correction keeps shapes comparable without forcing an exact average.
  const center = Math.max(-1.5, Math.min(1.5, offsets.reduce((sum, v) => sum + v, 0) / n))
  const rarity = Math.max(0.15, Math.min(1, (strength - 71) / 10)) * 0.55 ** (tier - 1)
  order.forEach(({ p }, i) => {
    let target = strength + offsets[i] - center + (rng() - 0.5) * 1.5
    // Smoothly compress the ordinary upper tail below 89, avoiding a pile at a hard cap.
    if (target > 86) target = 86 + (target - 86) / (1 + (target - 86) / 3)
    const exceptionalRoll = rng()
    p.generationClass = 'regular'
    if (exceptionalRoll < 0.0015 * rarity) {
      target = 93 + Math.floor(rng() * 3)
      p.generationClass = 'generational'
    } else if (exceptionalRoll < 0.018 * rarity) {
      target = 90 + Math.floor(rng() * 3)
      p.generationClass = 'world_class'
    }
    p.skills = scaleSkillsToTargetOvr(p.skills, clampOverallTarget(target))
  })
  return shape
}
