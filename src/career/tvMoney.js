/**
 * Pieniądze telewizyjne — pasywny, comiesięczny przychód klubów Ligi Europejskiej,
 * skalowany poziomem piramidy (Liga 1 dostaje zdecydowanie najwięcej — jak w realnych
 * kontraktach TV). Dotyczy tylko drużyn Ligi Europejskiej (`eucsTeamTier` → null dla
 * id UFA → brak wypłaty), więc UFA zostaje bez zmian.
 *
 * Wzorowane 1:1 na cyklu wypłat sponsorskich (`clubSponsors.js`) — ta sama kadencja
 * (1. dzień miesiąca), ta sama para funkcji (pojedyncza data / zakres dat).
 */

import { adjustTransferBudget } from './transfers/clubFinances.js'
import { formatUsd } from './transfers/moneyFormat.js'
import { eucsTeamTier } from '../data/eucsLeagueTeams.js'

/** Miesięczna kwota wg poziomu piramidy (EUR w kontekście Ligi Europejskiej). */
export const TV_MONEY_MONTHLY_BY_TIER = { 1: 15_000, 2: 6_000, 3: 2_000 }

function tvMonthlyAmountFor(teamId) {
  const tier = eucsTeamTier(teamId)
  if (!tier) return 0
  return TV_MONEY_MONTHLY_BY_TIER[tier] ?? 0
}

/**
 * Wypłata TV na 1. dzień miesiąca dla wszystkich drużyn Ligi Europejskiej w `world`.
 * Bezpieczne wołać wielokrotnie — jak sponsorzy, chroni się przez `lastMonthlyYm`.
 * @returns {{ teamId: string, amount: number }[]}
 */
export function processMonthlyTvPayouts(world, dateIso) {
  if (!world?.teamsById || !dateIso) return []
  const ym = String(dateIso).slice(0, 7)
  const day = Number(String(dateIso).slice(8, 10))
  if (day !== 1) return []

  const results = []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    const amount = tvMonthlyAmountFor(id)
    if (amount <= 0) continue
    if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
    if (team.finances._tvLastMonthlyYm === ym) continue
    adjustTransferBudget(team, amount)
    team.finances._tvLastMonthlyYm = ym
    results.push({ teamId: id, amount })
  }
  return results
}

/** Wypłaty TV dla każdego 1. dnia w zakresie dat (włącznie). */
export function processMonthlyTvPayoutsForRange(world, startIso, endIso) {
  if (!world?.teamsById || !startIso || !endIso) return []
  const results = []
  const start = new Date(`${String(startIso).slice(0, 10)}T12:00:00`)
  const end = new Date(`${String(endIso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const cursor = new Date(start)
  while (cursor <= end) {
    if (cursor.getDate() === 1) {
      const iso = cursor.toISOString().slice(0, 10)
      results.push(...processMonthlyTvPayouts(world, iso))
    }
    cursor.setDate(cursor.getDate() + 1)
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
      body: `Na konto klubu wpłynęło ${formatUsd(mine.amount)} z praw telewizyjnych ligi.`,
      bodyEn: `${formatUsd(mine.amount)} hit the club account from the league's TV rights deal.`,
      payload: { kind: 'tv_payout', amount: mine.amount },
    },
  ]
}
