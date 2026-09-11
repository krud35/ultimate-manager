import { clubCash } from '../src/career/clubEconomy.js'
// node --import ./scripts/register-world-tests.mjs scripts/test-world-lifecycle.mjs
import assert from 'node:assert/strict'
import { createRng } from '../src/matchEngine/rng.js'
import { worldTeamsList, rehydrateCareerWorld } from '../src/career/worldState.js'
import { createCareer, finalizeSeason } from '../src/career/careerModel.js'
import { advanceCareerDay, simulateCareerUntil } from '../src/career/calendarSimulation.js'
import { ageWorldPlayersOneYear } from '../src/career/playerDevelopment.js'
import { runAcademyIntake, sweepAgedOutAcademyPlayers, createAcademyProspect } from '../src/career/academy.js'
import { processSeasonRetirements } from '../src/career/retirement.js'
import { queueScoutMission, advanceAcademyCampaigns, academyReportDate, resolveScoutMissions } from '../src/career/scouting.js'
import { syncCompetitionMembership } from '../src/career/competitionMembership.js'
import { eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { processMonthlyTvPayouts } from '../src/career/tvMoney.js'
import { rollTransferBudget, ensureTeamFinances } from '../src/career/transfers/clubFinances.js'
import { processWeeklyWages } from '../src/career/transfers/playerContracts.js'
import { processContractExpirations } from '../src/career/transfers/contractLifecycle.js'
import { simulateAiTransferActivity, simulateAiTransfersForDateRange,
  AI_MARKET_TRANSFER_EVALUATION_LIMIT, AI_MARKET_LOAN_EVALUATION_LIMIT } from '../src/career/transfers/aiMarket.js'

// Isolated, in-memory slots; reproducible clocks/UUIDs also exercise RNG-dependent events.
globalThis.localStorage = { data: {}, getItem(k) { return this.data[k] ?? null },
  setItem(k, v) { this.data[k] = String(v) }, removeItem(k) { delete this.data[k] } }
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-09-09T12:00:00Z'])) }
  static now() { return new RealDate('2026-09-09T12:00:00Z').getTime() }
}
function resetRandom(seed = 72) {
  const rng = createRng(seed)
  Math.random = () => rng.float()
  let sequence = 0
  Object.defineProperty(globalThis, 'crypto', { configurable: true,
    value: { randomUUID: () => `test-${seed}-${++sequence}` } })
}
resetRandom()
const base = createCareer(0, { managerName: 'World tests', playerTeamId: 'toronto-rush', seasonYear: 2025 })
const clone = () => structuredClone(base)
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`OK ${name}`) }
function uniquePlayers(world) {
  const ids = worldTeamsList(world).flatMap(t => [
    ...(t.players ?? []), ...(t.academyPlayers ?? []), ...(t.academyCandidates ?? []).filter(p => !p.observationOnly),
  ]).concat(world.freeAgents ?? [], world.retiredPlayers ?? [], world.regionalYouth ?? []).map(p => String(p.id))
  assert.equal(new Set(ids).size, ids.length, 'a player belongs to exactly one population')
}

await test('all populations age once; new intake keeps its generated age', () => {
  const c = clone(), team = c.world.teamsById[c.playerTeamId]
  const junior = createAcademyProspect(() => 0.5, { teamId: team.id, seasonYear: 2025 })
  junior.id = 'academy-test'; junior.age = 20
  team.academyPlayers = [junior]
  const candidate = { ...structuredClone(junior), id: 'candidate-test' }
  team.academyCandidates = [candidate]
  const free = { ...structuredClone(junior), id: 'free-test', age: 28, inAcademy: false }
  c.world.freeAgents = [free]
  const senior = team.players[0], oldAge = senior.age
  ageWorldPlayersOneYear(c.world)
  sweepAgedOutAcademyPlayers(c.world, { playerTeamId: team.id, agePlayers: false })
  assert.equal(senior.age, oldAge + 1)
  assert.equal(free.age, 29)
  assert.equal(junior.age, 21)
  assert.equal(candidate.age, 21)
  assert(c.world.freeAgents.includes(junior))
  assert(c.world.freeAgents.includes(candidate))
  const intake = runAcademyIntake(c.world, { seasonYear: 2026, seed: 123 })
  assert(intake.created.every(p => p.age >= 16 && p.age <= 18))
  uniquePlayers(c.world)
})

await test('free agents can retire and leave the active population', () => {
  const c = clone()
  c.world.freeAgents = Array.from({ length: 100 }, (_, i) => ({
    ...structuredClone(c.world.teamsById[c.playerTeamId].players[0]), id: `retire-${i}`, age: 50, contract: null,
  }))
  const result = processSeasonRetirements(c, { seed: 17 })
  assert(result.retired.some(r => r.teamId === null))
  assert(c.world.freeAgents.length < 100)
  uniquePlayers(c.world)
})

await test('academy reports follow elapsed calendar months, including leap years and reloads', () => {
  assert.equal(academyReportDate('2025-01-31', 1), '2025-02-28')
  assert.equal(academyReportDate('2024-01-31', 1), '2024-02-29')
  assert.equal(academyReportDate('2025-01-31', 2), '2025-03-31')
  const c = clone(), team = c.world.teamsById[c.playerTeamId]
  team.finances.transferBudget = 1_000_000
  team.finances.cash = 10_000_000 // Calendar test: fund the full season before buying a mission.
  assert(queueScoutMission(team, { kind: 'academyProspect', countryId: 'us', durationMonths: 3, date: '2025-08-31' }).ok)
  assert.equal(advanceAcademyCampaigns(team, '2025-09-01').length, 0)
  assert.equal(advanceAcademyCampaigns(team, '2025-09-29').length, 0)
  assert.equal(advanceAcademyCampaigns(team, '2025-09-30', c.world).length, 1)
  assert.equal(advanceAcademyCampaigns(team, '2025-09-30').length, 0)
  const reloaded = structuredClone(team)
  assert.equal(advanceAcademyCampaigns(reloaded, '2025-10-30').length, 0)
  assert.equal(advanceAcademyCampaigns(reloaded, '2025-10-31').length, 1)
  assert.equal(advanceAcademyCampaigns(reloaded, '2025-11-30').length, 1)
  c.world.teamsById[team.id] = reloaded
  assert.equal(resolveScoutMissions(c.world, team.id, c.league, '2025-11-30').length, 1)
  assert.equal(advanceAcademyCampaigns(reloaded, '2025-12-31').length, 0)
  const legacy = structuredClone(team)
  legacy.scouting.pendingMissions[0].monthsElapsed = 0
  assert.equal(advanceAcademyCampaigns(legacy, '2025-12-31').length, 3)
  assert.equal(advanceAcademyCampaigns(legacy, '2025-12-31').length, 0)
})

await test('live tiers determine TV and budgets; old saves recover membership', () => {
  const id = eucsTeamsForTier(3)[0].id
  const team = { id, players: [], finances: { transferBudget: 0 } }
  const world = { teamIds: [id], teamsById: { [id]: team } }
  const before = rollTransferBudget(id, 123, team)
  syncCompetitionMembership(world, { tier1Ids: [id], tier2Ids: [], tier3Ids: [] })
  ensureTeamFinances(team, { seed: 123, force: true })
  assert(team.finances.transferBudget > before * 2)
  assert.equal(processMonthlyTvPayouts(world, '2026-08-01')[0].amount, 30_000)
  assert.equal(processMonthlyTvPayouts(world, '2026-08-01').length, 0)
  const c = clone(), existing = c.playerTeamId
  c.league.eucsPyramid = { tier1Ids: [], tier2Ids: [existing], tier3Ids: [] }
  delete c.world.teamsById[existing].competitionTier
  assert.equal(rehydrateCareerWorld(c).world.teamsById[existing].competitionTier, 2)
})

await test('last wage is paid once, expired player contract releases once', () => {
  const c = clone(), team = c.world.teamsById[c.playerTeamId], player = team.players[0]
  player.contract.weeksRemaining = 1
  const oldSalary = clubCash(team)
  const bill = team.players.reduce((sum, p) => sum + p.contract.weeklyWage, 0)
  processWeeklyWages(c.world)
  assert.equal(clubCash(team), oldSalary - bill)
  const expired = processContractExpirations(c)
  assert(c.world.freeAgents.includes(player))
  assert(!team.players.includes(player))
  assert.equal(expired.inboxMessages.filter(m => m.payload.playerId === player.id).length, 1)
  assert.equal(processContractExpirations(c).inboxMessages.length, 0)
  uniquePlayers(c.world)
})

await test('expired loan returns to owner before release, clearing active loan records', () => {
  const c = clone(), parent = c.world.teamsById[c.playerTeamId]
  const destination = worldTeamsList(c.world).find(t => t.id !== parent.id)
  const player = parent.players.shift()
  player.contract.weeksRemaining = 0
  player.loan = { id: 'expired-loan', parentTeamId: parent.id, destinationTeamId: destination.id }
  destination.players.push(player)
  c.world.activeLoans = [{ id: 'expired-loan', status: 'active' }]
  const result = processContractExpirations(c)
  assert(c.world.freeAgents.includes(player))
  assert.equal(c.world.activeLoans.length, 0)
  assert.equal(result.loanLog.at(-1).kind, 'returned')
  uniquePlayers(c.world)
})

await test('AI unable to renew does not retain expired contracts', () => {
  const c = clone(), team = worldTeamsList(c.world).find(t => t.id !== c.playerTeamId)
  team.finances.cash = 0
  const players = [...team.players]
  for (const p of players) p.contract.weeksRemaining = 0
  processContractExpirations(c)
  assert(players.every(p => c.world.freeAgents.includes(p)))
  uniquePlayers(c.world)
})

await test('market has bounded work, idempotent daily execution and valid player ownership', () => {
  assert.equal(simulateAiTransferActivity(null, { date: '2025-08-01' }).deals.length, 0)
  const c = clone()
  for (const t of worldTeamsList(c.world)) t.finances.transferBudget = 40_000
  const result = simulateAiTransferActivity(c, { date: '2025-08-01', seed: 111 })
  assert(result.metrics.transferEvaluations <= AI_MARKET_TRANSFER_EVALUATION_LIMIT)
  assert(result.metrics.loanEvaluations <= AI_MARKET_LOAN_EVALUATION_LIMIT)
  const next = { ...c, transferLog: result.transferLog, loanLog: result.loanLog }
  const snapshot = JSON.stringify(next)
  assert.equal(simulateAiTransferActivity(next, { date: '2025-08-01', seed: 111 }).deals.length, 0)
  assert.equal(JSON.stringify(next), snapshot)
  uniquePlayers(c.world)
})

await test('range transfers equal daily transfers even when ending outside the window', () => {
  const a = clone(), b = clone()
  a.league.currentDate = b.league.currentDate = '2025-09-02'
  resetRandom(19)
  const range = simulateAiTransfersForDateRange(a, '2025-08-30', '2025-09-02')
  resetRandom(19)
  let daily = b
  for (const date of ['2025-08-30', '2025-08-31', '2025-09-01', '2025-09-02']) {
    const r = simulateAiTransferActivity(daily, { date })
    daily = { ...daily, transferLog: r.transferLog, loanLog: r.loanLog }
  }
  assert.deepEqual(range.world, daily.world)
  assert.deepEqual(range.transferLog, daily.transferLog)
  assert.deepEqual(range.loanLog, daily.loanLog)
  assert(range.transferLog.every(t => t.date < '2025-09-01'))
  const snapshot = JSON.stringify(range.world)
  const replay = simulateAiTransfersForDateRange({ ...a, transferLog: range.transferLog, loanLog: range.loanLog }, '2025-08-30', '2025-09-02')
  assert.equal(replay.deals.length, 0)
  assert.equal(JSON.stringify(replay.world), snapshot)
})

await test('blocked match does not consume training, scouting time, wages or transfers', () => {
  const c = clone()
  const fixture = c.league.fixtures.find(f => f.homeTeamId === c.playerTeamId || f.awayTeamId === c.playerTeamId)
  c.league.currentDate = fixture.date
  c.league.fixtures = [fixture]
  const roster = JSON.stringify(c.world)
  const result = advanceCareerDay(c)
  assert(result.blocked)
  assert.equal(result.career.league.currentDate, fixture.date)
  assert.equal(JSON.stringify(result.career.world), roster)
  assert(advanceCareerDay(result.career).blocked)
})

await test('fast-forward and daily steps yield identical world and inbox across month/window boundary', async () => {
  const initial = clone()
  initial.league.currentDate = '2025-08-28'
  // Keep a future fixture so this remains an active season; isolate world logic from match cost.
  initial.league.fixtures = initial.league.fixtures.filter(f => f.date >= '2025-09-10')
  const team = initial.world.teamsById[initial.playerTeamId]
  team.finances.transferBudget = 2_000_000
  team.finances.cash = 10_000_000 // Fund season payroll before the calendar/parity setup purchase.
  assert(queueScoutMission(team, { kind: 'academyProspect', countryId: 'us', durationMonths: 1, date: '2025-07-31' }).ok)
  resetRandom(731)
  let daily = structuredClone(initial)
  while (daily.league.currentDate < '2025-09-04') daily = advanceCareerDay(daily).career
  resetRandom(731)
  const fast = await simulateCareerUntil(structuredClone(initial), { targetDate: '2025-09-04' })
  assert.equal(fast.daysAdvanced, 7)
  assert.deepEqual(fast.career, daily)
  uniquePlayers(daily.world)
})

await test('daily and fast paths retain identical effects with an actual auto-simulated player match', async () => {
  const initial = clone()
  const fixture = initial.league.fixtures.find(f => f.homeTeamId === initial.playerTeamId || f.awayTeamId === initial.playerTeamId)
  fixture.date = '2025-08-01'
  // A later fixture keeps the season active after the match under test.
  const later = initial.league.fixtures.find(f => f.id !== fixture.id)
  later.date = '2025-09-10'
  initial.league.fixtures = [fixture, later]
  resetRandom(791)
  const daily = advanceCareerDay(structuredClone(initial), { autoSimulatePlayer: true }).career
  resetRandom(791)
  const fast = await simulateCareerUntil(structuredClone(initial), { targetDate: '2025-08-02' })
  assert.equal(daily.league.matchHistory.length, 1)
  assert.equal(daily.league.fixtures[0].status, 'completed')
  assert.deepEqual(fast.career, daily)
  assert(!Object.hasOwn(fast.career, 'inboxMessages'), 'transient messages are not duplicated in saves')
})

await test('simulation until match leaves the match day untouched', async () => {
  const initial = clone()
  const fixture = initial.league.fixtures.find(f => f.homeTeamId === initial.playerTeamId || f.awayTeamId === initial.playerTeamId)
  fixture.date = '2025-08-03'
  initial.league.fixtures = [fixture]
  resetRandom(193)
  let daily = structuredClone(initial)
  for (let i = 0; i < 2; i++) daily = advanceCareerDay(daily).career
  resetRandom(193)
  const fast = await simulateCareerUntil(structuredClone(initial), { untilMatch: true })
  assert.equal(fast.career.league.currentDate, '2025-08-03')
  assert.equal(fast.career.league.fixtures[0].status, 'scheduled')
  assert.deepEqual(fast.career, daily)
})

await test('finalizing a season twice does not age players or create intake twice', () => {
  const c = clone()
  c.league.currentDate = '2026-07-31'
  c.league.fixtures = []
  c.league.cup = null
  const next = finalizeSeason(c)
  const snapshot = JSON.stringify(next.world)
  assert.equal(finalizeSeason(next), next)
  assert.equal(JSON.stringify(next.world), snapshot)
  for (const t of worldTeamsList(next.world)) {
    assert((t.academyPlayers ?? []).every(p => p.age >= 16 && p.age <= 18))
  }
  uniquePlayers(next.world)
})

console.log(`Passed ${passed} world lifecycle tests`)
