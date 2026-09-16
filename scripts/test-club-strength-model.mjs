import assert from 'node:assert/strict'
import { applyClubOvrDistribution } from '../src/data/eucsRosterBalance.js'
import { rollRandomSkillsForRoster } from '../src/data/randomRosterSkills.js'
import { getOverallRating } from '../src/models/playerStats.js'
import { buildDomesticWorldTemplate } from '../src/career/domesticWorld.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'
import { initWorldPlayerStats } from '../src/career/worldState.js'

const ratings = ps => ps.map(p => getOverallRating(p.skills))
function probe(strength, tier, exceptionRoll = 0.5) {
  const players = Array.from({ length: 24 }, (_, id) => ({ id, age: 26 }))
  rollRandomSkillsForRoster(players, 'club-model-probe')
  let call = 0
  // One shape draw, 24 ranking draws, then noise/exceptional draws per player.
  const rng = () => {
    const index = call++
    if (index === 0) return 0.6 // elite_seven at tier 1
    if (index < 25) return 0.5
    return index === 26 ? exceptionRoll : 0.5
  }
  const shape = applyClubOvrDistribution(players, { tier, strength, rng })
  return { players, values: ratings(players), shape }
}
const strong = probe(83, 1), weak = probe(72, 1)
assert.equal(strong.shape, 'elite_seven')
assert.equal(weak.shape, strong.shape)
assert(strong.values.every(v => v < 90), 'Even a strong elite-seven club has no guaranteed world-class players')
assert(weak.values.every((v, i) => v < strong.values[i]), 'Hierarchy is relative to club strength')
assert.equal(strong.values.filter(v => v > 83).length, 7, 'The profile retains its seven-player core')
assert.equal(probe(81, 1, 0.01).players[0].generationClass, 'world_class')
assert.equal(probe(81, 1, 0.001).players[0].generationClass, 'generational')
assert.equal(probe(76, 2, 0.01).players[0].generationClass, 'regular', 'Lower levels have fewer exceptions')
assert(probe(71, 3, 0).values.some(v => v >= 93), 'Lower leagues can still contain an exceptional player')

const config = {
  leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, 'playable'])),
  international: { nationals: false, europe: false, paucc: false, aoucc: false, wucc: false },
}
const template = buildDomesticWorldTemplate(config, 2026, 871234)
const summary = []
for (const tier of [...new Set(template.teams.map(t => t.tier))].sort()) {
  const teams = template.teams.filter(t => t.tier === tier)
  const players = teams.flatMap(t => t.players)
  const values = ratings(players)
  const pct = min => 100 * values.filter(v => v >= min).length / values.length
  assert(pct(90) < 2.5)
  assert(pct(93) < 0.4)
  assert(teams.some(t => ratings(t.players).every(v => v < 90)))
  assert(teams.every(t => t.rosterShape && t.rosterCoverage))
  assert(players.every(p => Number.isFinite(p.potential) && p.potential >= getOverallRating(p.skills) && p.potential <= p.innatePotential))
  assert(players.every(p => getOverallRating(p.skills) < 90 || p.generationClass !== 'regular'))
  summary.push({ tier, clubs: teams.length, players: players.length,
    mean: +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(2),
    elitePct: +pct(90).toFixed(2), generationalPct: +pct(93).toFixed(2) })
}
const teams = template.teams.slice(0, 3)
const world = { rosterMode: 'random', teamsById: Object.fromEntries(teams.map(t => [t.id, t])), teamIds: teams.map(t => t.id) }
const profiles = () => teams.map(t => ({ shape: t.rosterShape, coverage: t.rosterCoverage,
  players: t.players.map(p => ({ id: p.id, skills: p.skills, potential: p.potential, innatePotential: p.innatePotential, generationClass: p.generationClass })) }))
const before = structuredClone(profiles())
initWorldPlayerStats(world)
assert.deepEqual(profiles(), before, 'Initialization preserves the new domestic model')
console.table(summary)
console.log('Relative hierarchy, rare exceptions, domestic population and initialization passed.')
