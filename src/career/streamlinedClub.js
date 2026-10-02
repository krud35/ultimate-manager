import { getFacilityLevel, facilityUpgradeCost } from './clubFacilities.js'
import { facilityWeeklyCost } from './economyBalance.js'
import { clubFinancialMarket } from './financialMarkets.js'
import { clubBudgetAllocation, postClubCash } from './clubEconomy.js'
import { addDays, formatISODate } from '../league/seasonCalendar.js'
export const CLUB_TRACKS = {
  preparation: { pl: 'Przygotowanie zespołu', en: 'Team preparation', facilities: ['trainingCenter', 'medicalCenter', 'chillRoom'], effectPl: 'Trening, zdrowie i regeneracja', effectEn: 'Training, health and recovery' },
  recruitment: { pl: 'Pozyskiwanie talentów', en: 'Talent recruitment', facilities: ['scoutingDept', 'academy'], effectPl: 'Scouting i rozwój akademii', effectEn: 'Scouting and academy development' },
  infrastructure: { pl: 'Infrastruktura klubu', en: 'Club infrastructure', facilities: ['stadium', 'fanShop'], effectPl: 'Przewaga własnego boiska i przychody meczowe', effectEn: 'Home advantage and match income' },
}
export const STAFF_FUNCTIONS = [
  { id: 'training', pl: 'Trening', en: 'Training', primary: 'assistantCoach', roles: ['assistantCoach', 'youthCoach', 'analyst'] },
  { id: 'recruitment', pl: 'Rekrutacja', en: 'Recruitment', primary: 'chiefScout', roles: ['chiefScout', 'sportingDirector'] },
  { id: 'health', pl: 'Zdrowie', en: 'Health', primary: 'physio', roles: ['physio'] },
]
export function clubTrackQuote(team, id) {
  const track = CLUB_TRACKS[id]
  if (!track) return null
  const levels = Object.fromEntries(track.facilities.map(f => [f, getFacilityLevel(team, f)]))
  const minimum = Math.min(...Object.values(levels)), target = [4, 7, 10].find(level => level > minimum)
  const tier = [4, 7, 10].filter(level => level <= minimum).length
  let cost = 0, upkeepDelta = 0
  const targets = {}
  if (target) for (const [f, level] of Object.entries(levels)) {
    targets[f] = Math.max(target, level) // Never erase a stronger inherited asset.
    for (let l = level; l < targets[f]; l++) cost += facilityUpgradeCost(f, l, team)
    upkeepDelta += facilityWeeklyCost(f, targets[f]) - facilityWeeklyCost(f, level)
  }
  upkeepDelta = Math.round(upkeepDelta * clubFinancialMarket(team).prices)
  const allocation = clubBudgetAllocation(team)
  const remaining = allocation.transferBudget - cost - (team.streamlinedClub?.economyActive ? upkeepDelta * Math.min(8, allocation.weeks) : 0)
  return { id, tier, levels, target, targets, cost, upkeepDelta, remaining, days: target ? 21 + (target - 1) * 7 : 0 }
}
export function upgradeClubTrack(team, id, date) {
  if (!team.streamlinedClub?.enabled || !date) return { ok: false, error: 'unavailable' }
  if (team.facilityProject || team.streamlinedClub.project) return { ok: false, error: 'construction_in_progress' }
  const quote = clubTrackQuote(team, id)
  if (!quote?.target) return { ok: false, error: 'max_level' }
  if (quote.remaining < 0) return { ok: false, error: 'insufficient_funds' }
  postClubCash(team, -quote.cost, 'facility_construction', date)
  team.streamlinedClub.project = { ...quote, startsOn: date, completesOn: formatISODate(addDays(date, quote.days)) }
  return { ok: true, ...quote }
}
export function completeClubTrack(team, date) {
  const project = team.streamlinedClub?.project
  if (!project || date < project.completesOn) return null
  for (const [id, level] of Object.entries(project.targets)) team.facilities[id] = Math.max(getFacilityLevel(team, id), level)
  if (team.finances) team.finances.weeklyOperations = (team.finances.weeklyOperations ?? 0) + project.upkeepDelta
  team.streamlinedClub.project = null
  return project
}
