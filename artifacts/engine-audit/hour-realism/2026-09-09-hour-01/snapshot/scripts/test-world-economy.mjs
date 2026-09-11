// node --import ./scripts/register-world-tests.mjs scripts/test-world-economy.mjs
import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { ensureClubEconomy, clubCash, postClubCash, reviewClubBudgets, clubFinanceForecast,
  processMonthlyOwnerFunding, postTransferCash, syncLoanFinancialCommitments } from '../src/career/clubEconomy.js'
import { signPlayerContract, clearPlayerContractOnExit, processWeeklyWages } from '../src/career/transfers/playerContracts.js'
import { ensureYouthCohort, discoverRegionalYouth, youthWillJoin } from '../src/career/youthPopulation.js'
import { signAcademyCandidate, academyCapacity, academyAnnualPlaces, runAcademyIntake } from '../src/career/academy.js'
import { upgradeFacility, getFacilityLevel } from '../src/career/clubFacilities.js'
import { setClubStaff, setClubStrategy, buildSquadPlan, processClubManagement, weeklyClubOperatingCost } from '../src/career/clubManagement.js'
import { getOverallRating } from '../src/models/playerStats.js'
import { createRng } from '../src/matchEngine/rng.js'
import { submitTransferOffer } from '../src/career/transfers/delayedNegotiation.js'

const rng = createRng(71)
Math.random = () => rng.float()
const base = createWorldFromTemplate(2025)
function make() {
  const world = structuredClone(base)
  const team = world.teamsById[world.teamIds[0]]
  team.finances.cash = 10_000_000
  team.finances.transferLimit = 10_000_000
  team.finances.openingCash = 10_000_000
  team.finances.totalIncome = 0
  team.finances.totalExpenses = 0
  team.finances.seasonPayrollBudget = 3_000_000
  return { world, team, career: { world, playerTeamId: team.id, seasonYear: 2025,
    league: { currentDate: '2025-08-01', playerTeamId: team.id }, transferLog: [], loanLog: [] } }
}
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`OK ${name}`) }

test('migration conserves positive assets and negative balances, exactly once', () => {
  for (const [transfer, salary] of [[100_000, 400_000], [-600_000, 100_000]]) {
    const team = { id: 'legacy', players: [], finances: { transferBudget: transfer, salaryBudget: salary } }
    ensureClubEconomy(team)
    assert.equal(clubCash(team), transfer + salary)
    const snapshot = JSON.stringify(team)
    ensureClubEconomy(team)
    assert.equal(JSON.stringify(team), snapshot)
  }
})

test('signing and ending contracts create no cash; wages debit cash once per date', () => {
  const { world, team } = make()
  const player = team.players[0]
  const cash = clubCash(team)
  assert(signPlayerContract(team, player, { weeklyWage: 1000, years: 5 }).ok)
  assert.equal(clubCash(team), cash)
  const result = processWeeklyWages(world, { date: '2025-08-03' })
  assert(result.paid > 0)
  const afterWages = clubCash(team)
  processWeeklyWages(world, { date: '2025-08-03' })
  assert.equal(clubCash(team), afterWages)
  clearPlayerContractOnExit(team, player)
  assert.equal(clubCash(team), afterWages)
})

test('wage ceiling rejects a contract without mutating the current contract', () => {
  const { team } = make()
  team.finances.weeklyWageLimit = 1
  const player = team.players[0], before = structuredClone(player.contract)
  assert(!signPlayerContract(team, player, { weeklyWage: 100_000, years: 2 }).ok)
  assert.deepEqual(player.contract, before)
})

test('free contracts use the wage limit and cash reserve, not transfer allocation', () => {
  const { world, team, career } = make()
  team.finances.seasonPayrollBudget = team.finances.cash
  career.league.currentDate = '2025-10-01'
  const player = structuredClone(team.players[0]); player.id = 'free-contract'; player.contract = null
  world.freeAgents.push(player)
  const cash = clubCash(team)
  // Existing templates can exceed the acquisition cap; this test targets finance only.
  team.players = team.players.slice(0, 24)
  const signed = submitTransferOffer(career, { row: { player, playerId: player.id, freeAgent: true }, contractTerms: { weeklyWage: 500, years: 1 } })
  assert(signed.ok)
  assert.equal(clubCash(team), cash)
  assert(team.players.some(p => p.id === player.id))
})

test('monthly management renews AI sponsors and cannot repeat signings or promotions', () => {
  const { world, team, career } = make()
  const ai = Object.values(world.teamsById).find(t => t.id !== team.id)
  ai.sponsors.main = null; ai.sponsors.secondary = null
  processClubManagement(career, '2025-08-01')
  assert(ai.sponsors.main && ai.sponsors.secondary)
  const snapshot = JSON.stringify(world)
  processClubManagement(career, '2025-08-01')
  assert.equal(JSON.stringify(world), snapshot)
})

test('owner funding, expenses and transfer allocations reconcile with cash', () => {
  const { world, team } = make()
  processMonthlyOwnerFunding(world, '2025-08-01')
  const after = clubCash(team)
  processMonthlyOwnerFunding(world, '2025-08-01')
  assert.equal(clubCash(team), after)
  const limit = team.finances.transferLimit
  postTransferCash(team, -12_000)
  assert.equal(team.finances.transferLimit, limit - 12_000)
  postClubCash(team, -700, 'test_expense')
  const f = team.finances
  assert.equal(f.cash, f.openingCash + f.totalIncome - f.totalExpenses)
  f.cash = -50_000
  reviewClubBudgets(team, 2026)
  assert.equal(f.cash, -50_000, 'new season cannot erase debt')
})

test('loan forecasts split weekly wages and total commitments between clubs', () => {
  const { world, team: parent } = make()
  const destination = world.teamsById[world.teamIds[1]]
  parent.players = [parent.players[0]]
  destination.players = []
  const p = parent.players.pop()
  p.contract = { weeklyWage: 1000, weeksRemaining: 52 }
  p.loan = { parentTeamId: parent.id, destinationTeamId: destination.id, wageSplitPct: 40,
    startDate: '2025-08-01', returnDate: '2025-11-01' }
  destination.players.push(p)
  syncLoanFinancialCommitments(world)
  assert.equal(clubFinanceForecast(parent).weeklyWages, 600)
  assert.equal(clubFinanceForecast(destination).weeklyWages, 400)
  assert.equal(clubFinanceForecast(parent).commitments + clubFinanceForecast(destination).commitments, 52_000)
})

test('scouting never creates players; two clubs cannot sign the same regional prospect', () => {
  const { world, team } = make()
  const other = world.teamsById[world.teamIds[1]]
  ensureYouthCohort(world, 2025)
  const population = world.regionalYouth.length
  const snapshot = JSON.stringify(world.regionalYouth)
  ensureYouthCohort(world, 2025)
  assert.equal(JSON.stringify(world.regionalYouth), snapshot)
  const found = discoverRegionalYouth(world, team, 'us', 100, () => 0.5)
  assert.equal(world.regionalYouth.length, population)
  const candidate = found.find(p => youthWillJoin(team, p))
  assert(candidate)
  other.academyCandidates = [structuredClone(candidate)]
  assert(signAcademyCandidate(team, candidate.id, { world, seasonYear: 2025 }).ok)
  assert.equal(world.regionalYouth.length, population - 1)
  assert(!other.academyCandidates.some(p => p.id === candidate.id))
  assert(!signAcademyCandidate(other, candidate.id, { world, seasonYear: 2025 }).ok)
})

test('academy capacity and seasonal admissions apply to every acquisition path', () => {
  const { world, team } = make()
  ensureYouthCohort(world, 2025)
  team.academyAdmissions = academyAnnualPlaces(team)
  team.academyAdmissionYear = 2025
  const p = world.regionalYouth[0]
  assert.equal(signAcademyCandidate(team, p.id, { world, seasonYear: 2025 }).error, 'annual_limit')
  team.academyPlayers = Array.from({ length: academyCapacity(team) }, (_, i) => ({ id: `capacity-${i}` }))
  assert.equal(signAcademyCandidate(team, p.id, { world, seasonYear: 2026 }).error, 'academy_full')
  runAcademyIntake(world, { seasonYear: 2026 })
  assert.equal(team.academyPlayers.length, academyCapacity(team))
})

test('regional youth quality has rare ready-made stars', () => {
  const { world } = make()
  ensureYouthCohort(world, 2025)
  ensureYouthCohort(world, 2026)
  const players = world.regionalYouth
  const starShare = players.filter(p => getOverallRating(p.skills) >= 78).length / players.length
  const mean = players.reduce((sum, p) => sum + getOverallRating(p.skills), 0) / players.length
  assert(starShare < 0.04)
  assert(mean >= 67 && mean < 73)
})

test('staff has cost, recurring costs and youth minutes support development', () => {
  const { team, career } = make()
  const before = clubCash(team), upkeep = weeklyClubOperatingCost(team)
  assert(setClubStaff(team, 'youthCoach', 3).ok)
  assert(clubCash(team) < before)
  assert(weeklyClubOperatingCost(team) > upkeep)
  team.academyPlayers = [structuredClone(team.players[0])]
  const c = team.academyPlayers[0]; c.id = 'minutes-test'; c.age = 18; c.youthMinutes = 0
  processClubManagement(career, '2025-08-03', { weekTick: true })
  assert(c.youthMinutes >= 30)
  const cash = clubCash(team)
  processClubManagement(career, '2025-08-03', { weekTick: true })
  assert.equal(clubCash(team), cash)
  team.finances.cash = -100_000
  assert(setClubStaff(team, 'youthCoach', 0).ok, 'A club in debt can reduce staff costs')
})

test('construction charges once and becomes effective only on completion', () => {
  const { team, career } = make()
  team.facilities.trainingCenter = 3
  const before = clubCash(team)
  const result = upgradeFacility(team, 'trainingCenter', { date: '2025-08-01' })
  assert(result.ok)
  assert.equal(getFacilityLevel(team, 'trainingCenter'), 3)
  assert(clubCash(team) < before)
  assert(!upgradeFacility(team, 'academy', { date: '2025-08-02' }).ok)
  processClubManagement(career, result.completesOn)
  assert.equal(getFacilityLevel(team, 'trainingCenter'), 4)
  assert.equal(team.facilityProject, null)
})

test('squad strategy produces actionable role and line needs', () => {
  const { team } = make()
  team.players = []
  team.clubStrategy = 'development' // Board-assigned test fixture.
  assert(!setClubStrategy(team, 'contend'))
  const development = buildSquadPlan(team)
  assert(development.needs.handler > 0 && development.needs.cutter > 0)
  team.clubStrategy = 'contend'
  assert(buildSquadPlan(team).target > development.target)
})

console.log(`Passed ${passed} economy and management tests`)
