import { clubMonthlyTvIncome } from './economyBalance.js'
import { standingsTable } from '../league/standings.js'

export const TV_EQUAL_SHARE = 0.7
export const tvSeasonKey = (league, year) => `${year}|${league.id ?? league.domesticLeagueId ?? `tier-${league.tier ?? 'main'}`}`

/** One league-wide pot, including multinational leagues. Preserve the annual pool. */
export function leagueTvAllocation(world, league) {
  const table = standingsTable(league?.standings ?? {})
  const ids = [...new Set(league?.teamIds?.length ? league.teamIds : table.map(row => row.teamId))]
  const teams = ids.map(id => world?.teamsById?.[id]).filter(Boolean)
  if (!teams.length) return []
  const pool = Math.round(teams.reduce((sum, team) => sum + clubMonthlyTvIncome({
    ...team, tier: league.tier ?? team.tier, competitionTier: league.tier ?? team.competitionTier,
  }) * 12, 0))
  const equal = Math.floor(pool * TV_EQUAL_SHARE / teams.length)
  const bonusPool = pool - equal * teams.length
  const ordered = [...table.map(row => row.teamId).filter(id => ids.includes(id)), ...ids.filter(id => !table.some(row => row.teamId === id))]
  const weightSum = teams.length * (teams.length + 1) / 2
  const rows = ordered.filter(id => world?.teamsById?.[id]).map((teamId, index) => ({
    teamId, place: index + 1, equal, bonus: Math.floor(bonusPool * (teams.length - index) / weightSum), pool,
  }))
  let remainder = bonusPool - rows.reduce((sum, row) => sum + row.bonus, 0)
  for (const row of rows) { if (remainder-- > 0) row.bonus++; row.amount = row.equal + row.bonus }
  return rows
}

/** Old saves already received monthly advances; never debit money on migration. */
export function legacyTvAdvance(team, year, league) {
  const month = team?.finances?._tvLastMonthlyYm
  if (!month || month < `${year}-08` || month > `${Number(year)+1}-07`) return 0
  const [y, m] = month.split('-').map(Number)
  const months = (y - Number(year)) * 12 + m - 7
  return clubMonthlyTvIncome({ ...team, tier: league?.tier ?? team.tier, competitionTier: league?.tier ?? team.competitionTier }) * months
}
