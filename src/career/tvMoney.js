/** TV rights are settled once at the end of the season. */
import { adjustTransferBudget } from './transfers/clubFinances.js'
import { formatUsd } from './transfers/moneyFormat.js'
import { TV_MONTHLY_BY_TIER } from './economyBalance.js'
import { leagueTvAllocation, tvSeasonKey, legacyTvAdvance } from './tvAllocation.js'

// Compatibility for old integrations: monthly calls never transfer cash.
export const TV_MONEY_MONTHLY_BY_TIER = TV_MONTHLY_BY_TIER
export function processMonthlyTvPayouts() { return [] }
export function processMonthlyTvPayoutsForRange() { return [] }

export function processSeasonEndTvPayouts(world, league, seasonYear, date = `${Number(seasonYear)+1}-07-31`) {
  if (!world?.teamsById || !league || !Number.isFinite(Number(seasonYear)) || date < `${Number(seasonYear)+1}-07-31`) return []
  const fixtures = (league.fixtures ?? []).filter(f => f.competition === 'league' || !f.competition)
  if (fixtures.some(f => !f.bye && f.status !== 'completed')) return []
  const key = tvSeasonKey(league, seasonYear)
  const results = []
  for (const row of leagueTvAllocation(world, league)) {
    const team = world.teamsById[row.teamId]
    team.finances ??= {}
    if (team.finances.tvSettlements?.[key]) continue
    const advance = legacyTvAdvance(team, seasonYear, league)
    const amount = Math.max(0, row.amount - advance)
    if (amount > 0) adjustTransferBudget(team, amount, 'tv', date)
    team.finances.tvSettlements ??= {}
    team.finances.tvSettlements[key] = { ...row, advance, amount, date }
    if (amount > 0) results.push({ ...row, advance, amount })
  }
  return results
}
function newTvMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `msg-tv-${crypto.randomUUID()}`
  }
  return `msg-tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Wiadomość do skrzynki gracza o wypłacie TV (tylko jego drużyna). */
export function messagesFromTvPayouts(payouts, career, { date = null } = {}) {
  const list = Array.isArray(payouts) ? payouts : []
  if (!list.length || !career?.playerTeamId) return []
  const mine = list.find((p) => p.teamId === career.playerTeamId)
  if (!mine || mine.amount <= 0) return []

  return [
    {
      id: newTvMessageId(),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: career.seasonYear ?? null,
      read: false,
      title: 'Wypłata telewizyjna',
      titleEn: 'TV rights payout',
      body: `Rozliczenie praw TV za sezon: część równa ${formatUsd(mine.equal)}, premia za ${mine.place}. miejsce ${formatUsd(mine.bonus)}. Wcześniejsze zaliczki: ${formatUsd(mine.advance ?? 0)}. Wypłata: ${formatUsd(mine.amount)}.`,
      bodyEn: `Season TV settlement: equal share ${formatUsd(mine.equal)}, bonus for place ${mine.place}: ${formatUsd(mine.bonus)}. Previous advances: ${formatUsd(mine.advance ?? 0)}. Paid: ${formatUsd(mine.amount)}.`,
      payload: { kind: 'tv_payout', ...mine },
    },
  ]
}
