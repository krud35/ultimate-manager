import { CLUB_STRATEGY_DEFS } from './clubObjectives.js'
import { currentEucsTier } from './competitionMembership.js'
import { rebalanceAiBudget } from './clubEconomy.js'
import { staffWeeklyCosts, facilityWeeklyCost } from './economyBalance.js'
import { getCategoryOverall } from '../models/playerStats.js'
import { getFacilityLevel, FACILITY_IDS, FACILITY_DEFS, upgradeFacility } from './clubFacilities.js'
import { ensureClubEconomy, clubFinanceForecast, postClubCash, clubCash, contractualWeeklyBill } from './clubEconomy.js'
import { getTransferBudget } from './transfers/clubFinances.js'
import { academyCapacity, signAcademyCandidate, runAiAcademyPromotionPass } from './academy.js'
import { ensureYouthCohort, clubYouthCountry, discoverRegionalYouth } from './youthPopulation.js'
import { createRng } from '../matchEngine/rng.js'
import { applyOffseasonCampGrowth } from './playerDevelopment.js'
import { simulateAiFreeAgentSignings } from './transfers/freeAgency.js'
import { SPONSOR_SLOTS, refreshSponsorOffers, signSponsorOffer } from './clubSponsors.js'

export const STAFF_ROLES = ['youthCoach', 'chiefScout', 'physio', 'sportingDirector']
export const STAFF_WEEKLY_COST = staffWeeklyCosts
export const CLUB_STRATEGIES = Object.keys(CLUB_STRATEGY_DEFS)
function seed(value) { let n = 17; for (const c of String(value)) n = Math.imul(n, 31) + c.charCodeAt(0); return n >>> 0 }

export function ensureClubManagement(team, year = 2025) {
  if (!team) return
  team.financeSeasonYear ??= year
  team.staff ??= Object.fromEntries(STAFF_ROLES.map(role => [role, 1]))
  const tier = currentEucsTier(team)
  const strategies = CLUB_STRATEGIES.filter(strategy => strategy === 'promotion' ? tier > 1 : strategy === 'survival' ? !!tier : true)
  team.clubStrategy ??= strategies[seed(team.id) % strategies.length]
  team.boardObjective ??= { fromSeason: year, untilSeason: year + 2, confidence: 60,
    targetPlace: CLUB_STRATEGY_DEFS[team.clubStrategy]?.place ?? 8,
    youthTarget: CLUB_STRATEGY_DEFS[team.clubStrategy]?.youth ?? 2, graduates: 0 }
  ensureClubEconomy(team).weeklyOperations = weeklyClubOperatingCost(team)
}

export function setClubStaff(team, role, level) {
  ensureClubManagement(team)
  if (!STAFF_ROLES.includes(role) || ![0, 1, 2, 3].includes(level)) return { ok: false, error: 'invalid_staff' }
  const cost = level > team.staff[role] ? STAFF_WEEKLY_COST[level] * 4 : 0
  if (cost > 0 && getTransferBudget(team) < cost) return { ok: false, error: 'insufficient_funds' }
  postClubCash(team, -cost, 'staff_recruitment', team.managementDate)
  team.staff[role] = level
  ensureClubEconomy(team).weeklyOperations = weeklyClubOperatingCost(team)
  return { ok: true }
}

export function setClubStrategy(team, strategy) {
  ensureClubManagement(team)
  if (!CLUB_STRATEGIES.includes(strategy)) return false
  return team.clubStrategy === strategy // Strategy belongs to the board, not the manager.
}

export function playerSquadProfile(player) {
  return {
    role: (getCategoryOverall(player.skills, 'throwing') - 60) / 35 >= (getCategoryOverall(player.skills, 'offensive') - 70) / 25 ? 'handler' : 'cutter',
    line: getCategoryOverall(player.skills, 'defensive') >= getCategoryOverall(player.skills, 'offensive') ? 'defense' : 'offense',
  }
}

export function buildSquadPlan(team) {
  const counts = { handler: 0, cutter: 0, offense: 0, defense: 0 }
  for (const p of team.players ?? []) {
    const profile = playerSquadProfile(p)
    counts[profile.role]++; counts[profile.line]++
  }
  const target = ['contend','promotion'].includes(team.clubStrategy) ? 30 : team.clubStrategy === 'financial' ? 26 : 28
  const needs = { handler: Math.max(0, 9 - counts.handler), cutter: Math.max(0, 15 - counts.cutter),
    offense: Math.max(0, 10 - counts.offense), defense: Math.max(0, 10 - counts.defense) }
  team.squadPlan = { target, counts, needs, depthNeeded: Math.max(0, target - (team.players?.length ?? 0)) }
  return team.squadPlan
}

export function weeklyClubOperatingCost(team) {
  const staff = STAFF_ROLES.reduce((sum, role) => sum + STAFF_WEEKLY_COST[team.staff?.[role] ?? 1], 0)
  const facilities = FACILITY_IDS.reduce((sum, id) => sum + facilityWeeklyCost(id, getFacilityLevel(team, id)), 0)
  const academy = (team.academyPlayers?.length ?? 0) * 80
  return staff + facilities + academy
}

export function processClubManagement(career, date, { weekTick = false } = {}) {
  const messages = []
  const world = career.world
  if (!world) return { inboxMessages: messages, transferLog: career.transferLog ?? [] }
  const teams = Object.values(world.teamsById)
  const monthly = date.slice(8, 10) === '01' && !(world.lastManagementCycleMonth >= date.slice(0, 7))
  if (monthly) ensureYouthCohort(world, career.seasonYear)
  for (const team of teams) {
    ensureClubManagement(team, career.seasonYear)
    ensureClubEconomy(team)
    team.managementDate = date
    team.financeSeasonYear = career.seasonYear
    team.academyCandidates = (team.academyCandidates ?? []).filter(p => !p.offerExpires || p.offerExpires >= date)
    const project = team.facilityProject
    if (project && project.completesOn <= date) {
      team.facilities[project.facilityId] = project.targetLevel
      team.facilityProject = null
      if (team.id === career.playerTeamId) messages.push({ id: `facility-${team.id}-${project.completesOn}`,
        type: 'club_news', date, read: false, title: 'Zakończono rozbudowę', titleEn: 'Construction completed',
        body: `Rozbudowa: ${FACILITY_DEFS[project.facilityId]?.namePl} — poziom ${project.targetLevel}.`,
        bodyEn: `${FACILITY_DEFS[project.facilityId]?.nameEn} is now level ${project.targetLevel}.`,
        payload: { kind: 'facility_completed', ...project } })
    }
    if (weekTick && team.lastOperationsDate !== date) {
      team.lastOperationsDate = date
      const costs = weeklyClubOperatingCost(team)
      team.finances.weeklyOperations = costs
      postClubCash(team, -costs, 'club_operations', date)
      if (clubCash(team) < 0) postClubCash(team, Math.round(clubCash(team) * 0.0015), 'debt_interest', date)
      buildSquadPlan(team)
      const rng = createRng(seed(`${team.id}|youth-minutes|${date}`))
      // A lightweight youth competition: minutes and growth, no senior match simulation.
      for (const p of (team.academyPlayers ?? []).slice(0, academyCapacity(team))) {
        p.youthMinutes = (p.youthMinutes ?? 0) + 30 + rng.int(0, 30)
        if (rng.float() < 0.15 + (team.staff.youthCoach ?? 0) * 0.1) applyOffseasonCampGrowth(p, () => rng.float())
      }
    }
    if (!monthly || team.lastManagementMonth === date.slice(0, 7)) continue
    team.lastManagementMonth = date.slice(0, 7)
    if (team.id !== career.playerTeamId) rebalanceAiBudget(team)
    buildSquadPlan(team)
    if (team.id === career.playerTeamId) continue
    for (const slot of SPONSOR_SLOTS) {
      if (team.sponsors?.[slot]) continue
      const offers = refreshSponsorOffers(team, slot, { seasonYear: career.seasonYear, seed: `${team.id}|${date}|${slot}` })
      const preferUpfront = clubCash(team) < contractualWeeklyBill(team) * 8
      const offer = offers.find(o => o.paymentModel === (preferUpfront ? 'upfront' : 'monthly')) ?? offers[0]
      if (offer) signSponsorOffer(team, slot, offer.id, { seasonYear: career.seasonYear, date, quiet: true })
    }
    const forecast = clubFinanceForecast(team)
    // A club with a short squad rebuilds first; extra upkeep must not consume its payroll capacity.
    if (team.players.length >= 24 && forecast.annualIncome - forecast.annualCosts > 50_000 && forecast.cash > forecast.annualCosts * 1.4 && forecast.projectedCash > forecast.annualCosts * 1.2 && !team.facilityProject) {
      const priority = team.clubStrategy === 'development' ? ['academy', 'trainingCenter', 'scoutingDept'] : ['trainingCenter', 'medicalCenter', 'fanShop']
      const facility = priority.sort((a, b) => getFacilityLevel(team, a) - getFacilityLevel(team, b))[0]
      if (getTransferBudget(team) > 150_000) upgradeFacility(team, facility, { date })
      const role = team.clubStrategy === 'development' ? 'youthCoach' : 'sportingDirector'
      if (forecast.projectedCash > 500_000 && team.staff[role] < 3) setClubStaff(team, role, team.staff[role] + 1)
    }
    const rng = createRng(seed(`${team.id}|youth-scout|${date}`))
    if ((team.academyPlayers?.length ?? 0) < academyCapacity(team)) {
      const candidates = discoverRegionalYouth(world, team, clubYouthCountry(team), 2, () => rng.float())
      for (const p of candidates.sort((a, b) => b.potential - a.potential)) {
        signAcademyCandidate(team, p.id, { world, seasonYear: career.seasonYear })
      }
    }
  }
  let transferLog = career.transferLog ?? []
  if (monthly) {
    world.lastManagementCycleMonth = date.slice(0, 7)
    runAiAcademyPromotionPass(world, { playerTeamId: career.playerTeamId, seed: seed(date), league: career.league })
    if (world.freeAgents?.length) {
      const signed = simulateAiFreeAgentSignings({ ...career, transferLog }, { maxDeals: teams.length * 4, seed: seed(date), rosterTarget: 28 })
      transferLog = signed.transferLog
    }
    for (const team of teams) {
      team.finances.weeklyOperations = weeklyClubOperatingCost(team)
      buildSquadPlan(team)
    }
  }
  return { inboxMessages: messages, transferLog }
}

export function evaluateBoardSeason(world, league, seasonYear) {
  const tables = [league, ...(league.otherLeagues ?? [])]
  for (const competition of tables) {
    const table = Object.values(competition.standings ?? {}).sort((a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst))
    table.forEach((row, i) => {
      const team = world.teamsById[row.teamId]
      if (!team) return
      ensureClubManagement(team, seasonYear)
      const goal = team.boardObjective
      if (goal.lastEvaluatedSeason === seasonYear) return
      goal.lastEvaluatedSeason = seasonYear
      goal.lastPlace = i + 1
      goal.confidence = Math.max(0, Math.min(100, goal.confidence + (i + 1 <= goal.targetPlace ? 8 : -8) + (clubCash(team) >= 0 ? 3 : -6)))
      if (seasonYear >= goal.untilSeason) {
        team.boardHistory = [...(team.boardHistory ?? []), { ...goal, achieved: i + 1 <= goal.targetPlace && goal.graduates >= goal.youthTarget }].slice(-10)
        team.boardObjective = { ...goal, fromSeason: seasonYear + 1, untilSeason: seasonYear + 3, graduates: 0 }
      }
    })
  }
}
