import { ROSTER_STRUCTURE_WEIGHTS, sampleRosterWeight, rosterQualityOffset } from './rosterStructures.js'
import { PLAYER_ARCHETYPES } from '../models/playerArchetypes.js'
import { clampOverallTarget, scaleSkillsToTargetOvr } from '../models/playerStats.js'

// Population targets for NEW careers. Keep skillsGen unchanged: existing saves
// must not reroll their rosters when this balance configuration changes.
export const EUCS_ROSTER_BALANCE = {
  1: { mean: 81, elite: [91, 95], good: [84, 88] },
  2: { mean: 76, elite: [87, 92], good: [79, 83] },
  3: { mean: 71, elite: [80, 86], good: [74, 78] },
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

/** Variable roster hierarchy; explicitly calibrate its mean and upper tail.
 * A common shift of target ratings compensates for roster size and the OVR floor.
 */
export function applyEucsOvrDistribution(players, tier, adjustment, rng, coverage) {
  const profile = EUCS_ROSTER_BALANCE[tier]
  if (!profile) throw new RangeError(`Unknown UltiLeague tier: ${tier}`)
  if (!players.length) return
  const n = players.length
  const shape = sampleRosterWeight(ROSTER_STRUCTURE_WEIGHTS, tier, rng)
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
  const spread = tier === 1 ? 0.85 : 1
  const targets = order.map((_, i) => profile.mean + spread * rosterQualityOffset(shape, i, n) + (rng() - 0.5) * 1.5)
  const meanTarget = profile.mean + adjustment
  let low = -30
  let high = 30
  let best = null
  let error = Infinity
  for (let pass = 0; pass < 40; pass += 1) {
    const delta = (low + high) / 2
    const ratings = targets.map(t => clampOverallTarget(t + delta))
    const mean = ratings.reduce((sum, r) => sum + r, 0) / n
    if (Math.abs(mean - meanTarget) < error) {
      best = ratings
      error = Math.abs(mean - meanTarget)
    }
    if (mean < meanTarget) low = delta
    else high = delta
  }
  order.forEach(({ p }, i) => { p.skills = scaleSkillsToTargetOvr(p.skills, best[i]) })
  return shape
}
