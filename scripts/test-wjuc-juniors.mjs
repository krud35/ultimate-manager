import assert from 'node:assert/strict'
import source from '../src/data/wjucJuniors.json' with { type: 'json' }
import { ensureYouthCohort, discoverRegionalYouth, claimRegionalYouth } from '../src/career/youthPopulation.js'
import { initializeWorldAcademies } from '../src/career/academy.js'

assert.equal(source.teams.length, 18)
assert.equal(source.teams.flatMap(t => t.players).length, 392)
assert(!source.teams.some(t => t.country === 'Israel' || t.countryId === 'il'))
const team = { id: 'test-club', name: 'Test', countryId: 'be', players: [], academyPlayers: [], academyRosterInitialized: true }
const world = { templateSeasonYear: 2025, teamIds: [team.id], teamsById: { [team.id]: team } }
initializeWorldAcademies(world, 2025)
assert.equal(world.regionalYouth.filter(p => p.youthReference).length, 392)
const start = JSON.stringify(world.regionalYouth)
const expected = new Set(world.regionalYouth.map(p => p.id))
const discoveries = discoverRegionalYouth(world, team, 'be', 10000, () => .5, { date: '2025-08-10' })
assert(discoveries.some(p => p.youthReference))
assert(discoveries.every(p => expected.has(p.id)))
assert.equal(JSON.stringify(world.regionalYouth), start)
assert.equal(discoverRegionalYouth(world, team, 'be', 10000, () => .5).length, 0)
const candidate = discoveries.find(p => p.youthReference)
const claimed = claimRegionalYouth(world, candidate.id)
assert(claimed)
team.academyPlayers.push(claimed)
assert(!world.regionalYouth.some(p => p.id === claimed.id))
const saved = JSON.parse(JSON.stringify(world))
ensureYouthCohort(saved, 2025)
assert.deepEqual(saved, world)
ensureYouthCohort(saved, 2026)
assert(!saved.regionalYouth.some(p => p.id === claimed.id))
assert.equal(saved.regionalYouth.filter(p => p.youthReference).length, 391)
assert.equal(new Set(saved.regionalYouth.map(p => p.id)).size, saved.regionalYouth.length)

const record = source.teams[0].players[0]
const legacy = { templateSeasonYear: 2025, youthCohortVersions: { 2025: 2 }, youthCohortYears: [2025], regionalYouth: [],
  teamsById: { club: { players: [{ ...record, id: 'existing-senior' }] } } }
ensureYouthCohort(legacy, 2025)
assert.equal(legacy.regionalYouth.filter(p => p.youthReference).length, 391)
const snapshot = structuredClone(legacy)
ensureYouthCohort(legacy, 2025)
assert.deepEqual(legacy, snapshot)
console.log('WJUC: 392 identities, 18 countries, startup population, discovery without generation, claims, save/load, later cohorts and duplicate prevention passed')
