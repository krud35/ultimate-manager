// Headless management stress test: no matches, results, travel or match revenue.
// node --import ./scripts/register-world-tests.mjs scripts/check-world-balance.mjs
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { buildEucsLeagueTemplate, eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { processClubManagement } from '../src/career/clubManagement.js'
import { processMonthlyOwnerFunding, reviewClubBudgets, clubCash } from '../src/career/clubEconomy.js'
import { processWeeklyWages } from '../src/career/transfers/playerContracts.js'
import { processWeeklyFinancialHealth } from '../src/career/transfers/clubFinances.js'
import { processContractExpirations } from '../src/career/transfers/contractLifecycle.js'
import { processLoanReturns } from '../src/career/transfers/loans.js'
import { simulateAiTransferActivity } from '../src/career/transfers/aiMarket.js'
import { processMonthlyTvPayouts } from '../src/career/tvMoney.js'
import { processMonthlySponsorPayouts, processSeasonStartSponsorPayouts, processSeasonEndSponsorPayouts } from '../src/career/clubSponsors.js'
import { ageWorldPlayersOneYear, applyOffseasonDevelopment } from '../src/career/playerDevelopment.js'
import { processSeasonRetirements } from '../src/career/retirement.js'
import { runAcademyIntake, sweepAgedOutAcademyPlayers, applyAcademyOffseasonDevelopment, academyCapacity } from '../src/career/academy.js'
import { getOverallRating } from '../src/models/playerStats.js'

const rows = []
for (const size of (process.env.BALANCE_SIZES ?? '16,48').split(',').map(Number)) for (const seed of (process.env.BALANCE_SEEDS ?? '17,71').split(',').map(Number)) {
  const rng = createRng(seed); Math.random = () => rng.float()
  const templates = size === 48 ? [1, 2, 3].flatMap(tier => buildEucsLeagueTemplate({ tier,
    teamIds: eucsTeamsForTier(tier).map(t => t.id), seed }).teams) : undefined
  const world = createWorldFromTemplate(2025, { teams: templates })
  const teams = Object.values(world.teamsById)
  const career = { world, seasonYear: 2025, seasonIndex: 1, playerTeamId: null,
    league: { currentDate: '2025-08-01', teams, standings: {}, playerStats: {} }, transferLog: [], loanLog: [] }
  let days = 0, bailouts = 0
  for (let year = 2025; year < 2025 + Number(process.env.BALANCE_YEARS ?? 10); year++) {
    career.seasonYear = year; career.seasonIndex = year - 2024
    processSeasonStartSponsorPayouts(world, year)
    for (let day = new Date(`${year}-08-01T12:00:00Z`); day < new Date(`${year+1}-08-01T12:00:00Z`); day.setUTCDate(day.getUTCDate()+1)) {
      const date = day.toISOString().slice(0,10), weekTick = day.getUTCDay() === 0
      career.league.currentDate = date
      processMonthlyOwnerFunding(world, date)
      processMonthlySponsorPayouts(world, date); processMonthlyTvPayouts(world, date)
      const managed = processClubManagement(career, date, { weekTick })
      career.transferLog = managed.transferLog
      processLoanReturns(career, { date })
      if (weekTick) {
        processWeeklyWages(world, { date })
        processContractExpirations(career, { renewAhead: true })
        bailouts += processWeeklyFinancialHealth(world, { seasonYear: year }).bailouts.length
      }
      const market = simulateAiTransferActivity(career, { date, seed: seed + days++ })
      career.transferLog = market.transferLog ?? career.transferLog
      career.loanLog = market.loanLog ?? career.loanLog
    }
    processSeasonEndSponsorPayouts(world, career.league, year)
    ageWorldPlayersOneYear(world)
    sweepAgedOutAcademyPlayers(world, { playerTeamId: null, agePlayers: false })
    processSeasonRetirements(career, { seed: year + seed })
    applyOffseasonDevelopment(world, { seed: year + seed })
    applyAcademyOffseasonDevelopment(world, { seed: year + seed })
    runAcademyIntake(world, { seasonYear: year + 1 })
    for (const team of teams) {
      reviewClubBudgets(team, year + 1)
      assert.equal(clubCash(team), team.finances.openingCash + team.finances.totalIncome - team.finances.totalExpenses)
      assert((team.academyPlayers?.length ?? 0) <= academyCapacity(team))
    }
    const seniors = teams.flatMap(t => t.players), academy = teams.flatMap(t => t.academyPlayers ?? [])
    const all = [...seniors, ...academy, ...(world.regionalYouth ?? []), ...(world.freeAgents ?? []), ...(world.retiredPlayers ?? [])]
    assert.equal(new Set(all.map(p => String(p.id))).size, all.length, 'Unique player ownership')
    const cash = teams.map(clubCash).sort((a,b)=>a-b)
    const row = { size, seed, year: year+1, seniors: seniors.length, minSquad: Math.min(...teams.map(t=>t.players.length)),
      academy: academy.length, regional: world.regionalYouth.length, freeAgents: world.freeAgents.length,
      meanOvr: +(seniors.reduce((s,p)=>s+getOverallRating(p.skills),0)/seniors.length).toFixed(2),
      minCash: cash[0], medianCash: cash[Math.floor(size/2)], debtClubs: cash.filter(x=>x<0).length, bailouts }
    rows.push(row); console.log(JSON.stringify(row))
  }
  if (process.env.BALANCE_DEBUG) writeFileSync('artifacts/world-balance-debug.json', JSON.stringify(career))
}
writeFileSync('artifacts/world-stage-3-5-balance.json', JSON.stringify(rows, null, 2))
