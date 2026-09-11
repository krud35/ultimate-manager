// node --import ./scripts/register-world-tests.mjs scripts/test-roster-generation.mjs
import assert from 'node:assert/strict'
import { buildEucsLeagueTemplate } from '../src/data/eucsLeagueTeams.js'
import { EUCS_ROSTER_BALANCE, eucsResultAdjustment } from '../src/data/eucsRosterBalance.js'
import { rollRandomSkillsForRoster, applyRandomOvrBands } from '../src/data/randomRosterSkills.js'
import { PLAYER_STAT_CATEGORIES, categoryStatRange, getOverallRating, normalizePlayerSkills,
  scaleSkillsToTargetOvr, clampOverallTarget } from '../src/models/playerStats.js'
import { createCareer } from '../src/career/careerModel.js'
import { initWorldPlayerStats } from '../src/career/worldState.js'
import { loadSaveStore, saveCareerNow } from '../src/career/saveStore.js'

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
function checkSkills(skills) {
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    const { min, max } = categoryStatRange(cat)
    for (const key of keys) assert(Number.isInteger(skills[cat][key]) && skills[cat][key] >= min && skills[cat][key] <= max)
  }
  assert.deepEqual(normalizePlayerSkills(structuredClone(skills)), skills, 'Normalization preserves generated attributes')
}

// Exercise every feasible target, input immutability and impossible targets.
const probe = [{ id: 1234 }]
rollRandomSkillsForRoster(probe, 'scaling-test')
const original = structuredClone(probe[0].skills)
for (let target = clampOverallTarget(-100); target <= clampOverallTarget(200); target++) {
  const skills = scaleSkillsToTargetOvr(probe[0].skills, target)
  assert.equal(getOverallRating(skills), target)
  checkSkills(skills)
}
assert.deepEqual(probe[0].skills, original)
assert.throws(() => scaleSkillsToTargetOvr(original, 60), RangeError)
assert.throws(() => scaleSkillsToTargetOvr(original, 97), RangeError)
assert.throws(() => scaleSkillsToTargetOvr(original, NaN), TypeError)
for (const offset of [-14, 0, 8]) {
  const ps = Array.from({ length: 26 }, (_, id) => ({ id }))
  rollRandomSkillsForRoster(ps, 'random-ufa')
  applyRandomOvrBands(ps, 'random-ufa', offset)
  ps.forEach(p => checkSkills(p.skills))
}

const neutral = { id: 'neutral', wins: 5, losses: 5, winPct: 50 }
const small = { id: 'small', wins: 2, losses: 0, winPct: 100 }
const large = { id: 'large', wins: 20, losses: 0, winPct: 100 }
const placeholder = { id: 'placeholder', placeholderStats: true, winPct: 100 }
const sample = [neutral, small, large, placeholder]
assert.equal(eucsResultAdjustment(placeholder, sample), 0)
assert(eucsResultAdjustment(small, sample) < eucsResultAdjustment(large, sample))

// Fixed seeds, all 48 clubs: distribution checks are population checks, not exact snapshots.
const summary = []
for (const tier of [1, 2, 3]) {
  const ratings = []
  const teamMeans = []
  const top7 = [], top14 = [], bench = []
  for (let seed = 1; seed <= 30; seed++) {
    const template = buildEucsLeagueTemplate({ tier, seed })
    for (const team of template.teams) {
      const values = team.players.map(p => { checkSkills(p.skills); return getOverallRating(p.skills) })
      const average = mean(values)
      assert(Math.abs(average - EUCS_ROSTER_BALANCE[tier].mean) <= 3.1, 'Bounded club strength')
      ratings.push(...values)
      teamMeans.push(average)
      values.sort((a, b) => b - a)
      top7.push(mean(values.slice(0, 7)))
      top14.push(mean(values.slice(0, 14)))
      bench.push(mean(values.slice(14)))
    }
    if (seed === 1) {
      const first = template.teams[0]
      assert.deepEqual(buildEucsLeagueTemplate({ tier, seed, teamIds: [first.id] }).teams[0], first,
        'Single-club materialization and full tier generate identical players')
    }
  }
  const average = mean(ratings)
  const elitePct = ratings.filter(v => v >= 90).length / ratings.length * 100
  assert(Math.abs(average - EUCS_ROSTER_BALANCE[tier].mean) < 0.4)
  const bounds = { 1: [4, 6], 2: [1, 2], 3: [0, 0.5] }[tier]
  assert(elitePct >= bounds[0] && elitePct <= bounds[1], `Tier ${tier} elite share ${elitePct}`)
  summary.push({ tier, players: ratings.length, mean: +average.toFixed(2), elitePct: +elitePct.toFixed(2),
    top7: +mean(top7).toFixed(2), top14: +mean(top14).toFixed(2), bench: +mean(bench).toFixed(2),
    minTeam: +Math.min(...teamMeans).toFixed(2), maxTeam: +Math.max(...teamMeans).toFixed(2) })
}
console.table(summary)

// Real career initialization + storage API, using isolated in-memory localStorage.
const data = new Map()
globalThis.localStorage = { getItem: k => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }
const random = Math.random
try {
  Math.random = () => 0.5
  const career = createCareer(0, { competition: 'eucs', playerTeamId: 'eucs-mooncatchers', seasonYear: 2026 })
  const snapshot = c => Object.values(c.world.teamsById).flatMap(t => t.players.map(p => ({ id: p.id, skills: p.skills })))
  const expected = structuredClone(snapshot(career))
  for (const tier of [1, 2, 3]) {
    const template = buildEucsLeagueTemplate({ tier, seed: 2026 * 1009 + 500 })
    for (const t of template.teams) assert.deepEqual(career.world.teamsById[t.id].players.map(p => p.skills), t.players.map(p => p.skills))
  }
  initWorldPlayerStats(career.world, { playerTeamId: career.playerTeamId })
  assert.deepEqual(snapshot(career), expected)
  // A saved player may have developed independently of the initial distribution.
  // Loading must retain that profile instead of enforcing the new league targets.
  const veteran = Object.values(career.world.teamsById)[0].players[0]
  veteran.skills = scaleSkillsToTargetOvr(veteran.skills, 73)
  const saved = structuredClone(snapshot(career))
  const profiles = c => Object.values(c.world.teamsById).flatMap(t => t.players.map(p => ({
    id: p.id, archetype: p.archetype, personalityType: p.personalityType, age: p.age, innatePotential: p.innatePotential,
    potential: p.potential, traits: p.traits, generatedReserve: p.generatedReserve,
  })))
  const savedProfiles = structuredClone(profiles(career))
  const structures = c => Object.values(c.world.teamsById).map(t => ({ shape: t.rosterShape, coverage: t.rosterCoverage }))
  const savedStructures = structuredClone(structures(career))
  saveCareerNow(career)
  const loaded = loadSaveStore().slots[0]
  assert.deepEqual(snapshot(loaded), saved, 'Save/load preserves all senior attributes')
  assert.deepEqual(profiles(loaded), savedProfiles, 'Save/load preserves archetype, age, talent and personality')
  assert.deepEqual(structures(loaded), savedStructures, 'Save/load preserves structure and role coverage')
} finally { Math.random = random }
console.log('Roster generation, initialization and save/load checks passed')
