import assert from 'node:assert/strict'
import { buildEucsLeagueTemplate, eucsTeamRosterPreview } from '../src/data/eucsLeagueTeams.js'
import { PLAYER_ARCHETYPES } from '../src/models/playerArchetypes.js'
import { getOverallRating, getCategoryOverall, getSubStat, normalizePlayerSkills } from '../src/models/playerStats.js'
import { computePotential, ensurePlayerDevelopment, applyOffseasonDevelopment, ageWorldPlayersOneYear } from '../src/career/playerDevelopment.js'
import { TRAIT_DEFS } from '../src/models/playerTraits.js'

const mean = a => a.reduce((s, v) => s + v, 0) / a.length
const groups = Object.fromEntries(Object.keys(PLAYER_ARCHETYPES).map(k => [k, []]))
const shapes = new Set()
const ages = []
for (const tier of [1, 2, 3]) for (let seed = 1; seed <= 10; seed++) {
  for (const team of buildEucsLeagueTemplate({ tier, seed }).teams) {
    assert(team.players.length >= 21)
    assert.equal(new Set(team.players.map(p => p.id)).size, team.players.length)
    assert.deepEqual(eucsTeamRosterPreview(team.id, seed), team.players.map(({ jersey, firstName, lastName }) => ({ jersey, firstName, lastName })))
    shapes.add(team.rosterShape)
    for (const family of ['handler', 'cutter', 'defender']) {
      const count = team.players.filter(p => PLAYER_ARCHETYPES[p.archetype].family === family).length
      if (team.rosterCoverage.gaps.includes(family)) assert.equal(count, 2)
      else assert(count >= 4)
    }
    for (const p of team.players) {
      const before = structuredClone(p)
      ensurePlayerDevelopment(p)
      assert.deepEqual(p.skills, before.skills)
      assert.equal(p.potential, before.potential)
      assert(p.age >= 18 && p.age <= 36)
      assert(p.potential >= getOverallRating(p.skills) && p.potential <= p.innatePotential)
      assert.equal(p.traits.filter(t => TRAIT_DEFS[t].kind === 'personality').length, 2)
      groups[p.archetype].push(p)
      ages.push(p.age)
    }
  }
}
assert.equal(shapes.size, 8)
assert(mean(ages) > 24 && mean(ages) < 28)
const category = (type, key) => mean(groups[type].map(p => getCategoryOverall(p.skills, key)))
assert(category('control_handler', 'throwing') > category('deep_cutter', 'throwing') + 7)
assert(category('deep_cutter', 'physical') > category('control_handler', 'physical') + 5)
assert(category('reading_defender', 'mental') > category('deep_cutter', 'mental') + 4)
assert(category('matchup_defender', 'defensive') > category('mobile_handler', 'defensive') + 7)
const huckBias = type => mean(groups[type].map(p => getSubStat(p.skills, 'throwing', 'huck') - getSubStat(p.skills, 'throwing', 'backhand')))
assert(huckBias('deep_handler') > huckBias('control_handler') + 5, 'Specific throwing profiles, not only category strength')
const young = Object.values(groups).flat().filter(p => p.age <= 22)
assert(new Set(young.map(p => p.potential - getOverallRating(p.skills))).size >= 8, 'Individual development headroom')

// Legacy players keep their age, skills and potential, without backfilling archetypes.
const legacy = structuredClone(groups.all_rounder[0])
delete legacy.archetype; delete legacy.developmentModel; delete legacy.innatePotential
legacy.potential = 93
legacy.age = 25
const oldSkills = structuredClone(legacy.skills)
ensurePlayerDevelopment(legacy)
assert.equal(legacy.archetype, undefined)
assert.equal(legacy.potential, 93)
assert.deepEqual(legacy.skills, oldSkills)

// Five actual offseason cycles: all clubs age and use existing training/decline.
const evolution = []
for (const tier of [1, 2, 3]) {
  const teams = buildEucsLeagueTemplate({ tier, seed: 71 }).teams
  const world = { teamIds: teams.map(t => t.id), teamsById: Object.fromEntries(teams.map(t => [t.id, t])) }
  const originals = new Map(teams.flatMap(t => t.players).map(p => [p.id, { age: p.age, ceiling: p.innatePotential }]))
  const row = { tier, start: +mean(teams.flatMap(t => t.players).map(p => getOverallRating(p.skills))).toFixed(2) }
  for (let year = 1; year <= 5; year++) {
    ageWorldPlayersOneYear(world)
    applyOffseasonDevelopment(world, { seed: 71 + year, skipAiPlans: true })
    for (const p of teams.flatMap(t => t.players)) {
      assert.equal(p.age, originals.get(p.id).age + year)
      assert.equal(p.innatePotential, originals.get(p.id).ceiling)
      assert.equal(p.potential, computePotential(p, getOverallRating(p.skills), 0))
      assert.deepEqual(normalizePlayerSkills(structuredClone(p.skills)), p.skills)
    }
  }
  row.afterFiveOffseasons = +mean(teams.flatMap(t => t.players).map(p => getOverallRating(p.skills))).toFixed(2)
  evolution.push(row)
}
console.table(evolution)
console.log('Archetypes, squad composition, preview, individual potential and five offseason cycles passed')
