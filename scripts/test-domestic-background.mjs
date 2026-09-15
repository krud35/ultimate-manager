import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { createStandings } from '../src/league/standings.js'
import { advanceOtherLeagueToDate } from '../src/league/otherLeagues.js'
import { replenishCupRepresentatives } from '../src/career/domesticWorld.js'
import { applyCupPlacementPrizes } from '../src/career/placementPrizes.js'

const world = createWorldFromTemplate(2026)
const [home, away] = Object.values(world.teamsById).slice(0, 2)
for (const team of [home, away]) { team.simulationMode = 'transfers'; for (const p of team.players) { p.injury = null; p.matchStamina = 100; p.developmentFatigue = 0 } }
const fixture = { id: 'background-1', date: '2026-08-15', competition: 'league', round: 1, homeTeamId: home.id, awayTeamId: away.id, status: 'scheduled' }
const league = { mode: 'transfers', simSeedBase: 99, fixtures: [fixture], standings: createStandings([home.id, away.id]), matchHistory: [], playerStats: {} }
advanceOtherLeagueToDate(league, world.teamsById, fixture.date)
const result = league.matchHistory[0]
assert.equal(result.simplified, true)
for (const [team, score] of [[home, result.homeScore], [away, result.awayScore]]) {
  const rows = result.boxScore.filter(p => p.teamId === team.id)
  assert.equal(rows.reduce((n, p) => n + p.goals, 0), score)
  assert.equal(rows.reduce((n, p) => n + p.assists, 0), score)
  assert(team.players.some(p => p.workload?.pendingMatch > 0))
}
advanceOtherLeagueToDate(league, world.teamsById, fixture.date)
assert.equal(league.matchHistory.length, 1)

home.simulationMode = 'off'; home.countryId = 'pl'; home.players = home.players.slice(0, 5)
replenishCupRepresentatives(world, 2027)
assert.equal(home.players.length, 24)
assert.equal(new Set(home.players.map(p => p.id)).size, 24)
replenishCupRepresentatives(world, 2027)
assert.equal(home.players.length, 24)

const cup = { format: 'domestic', status: 'complete', championTeamId: home.id, matches: [{ homeTeamId: home.id, awayTeamId: away.id, round: 'final', status: 'completed' }] }
const prizes = applyCupPlacementPrizes(cup, world.teamsById)
assert(prizes[home.id].amount > prizes[away.id].amount)
assert.equal(applyCupPlacementPrizes(cup, world.teamsById), prizes)
console.log('Domestic background: score totals, workload, idempotency, annual cup rosters and prizes passed.')
