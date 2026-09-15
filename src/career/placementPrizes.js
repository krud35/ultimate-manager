/**
 * Premie za lokatę — Liga Europejska: (1) premia ligowa na koniec sezonu, skalowana
 * poziomem piramidy (Liga 1 >> Liga 2 >> Liga 3, jak budżety i obiekty), (2) premia
 * pucharowa (Puchar Piramidy, wszystkie 48 klubów razem) — płaska, zależna tylko od
 * rundy, w której drużyna odpadła (jak realne "prize money" w pucharach pucharowych,
 * niezależnie od dywizji, z której drużyna startowała).
 */

import { adjustTransferBudget } from './transfers/clubFinances.js'
import { formatUsd } from './transfers/moneyFormat.js'
import { standingsTable } from '../league/standings.js'
import { clubFinancialMarket } from './financialMarkets.js'

/** Premia mistrza (1. miejsce) wg poziomu piramidy. */
const LEAGUE_PLACEMENT_BASE_BY_TIER = { 1: 3_500_000, 2: 700_000, 3: 100_000 }

/** 1.0 na 1. miejscu → ~0.06 na ostatnim (16.), łagodny spadek. */
function placementCurveMult(place, totalTeams) {
  if (!totalTeams || totalTeams <= 1) return 1
  const t = (place - 1) / (totalTeams - 1)
  return 0.06 + 0.94 * (1 - t) ** 1.6
}

/**
 * Premie ligowe na koniec sezonu dla wszystkich drużyn poziomu gracza.
 * @returns {{ teamId: string, amount: number, place: number }[]}
 */
export function processLeaguePlacementPrizes(world, league, tier) {
  if (!world?.teamsById || !league?.standings) return []
  const legacyBase = 2 * (LEAGUE_PLACEMENT_BASE_BY_TIER[tier] ?? 0)

  const table = standingsTable(league.standings)
  const total = table.length
  const results = []
  table.forEach((row, i) => {
    const team = world.teamsById[row.teamId]
    if (!team) return
    // Season rollover may already have promoted/relegated the club. Reward the
    // competition just completed, not its new membership.
    const market = clubFinancialMarket({ ...team, tier: tier ?? team.tier })
    const base = market.domestic ? 7_000_000 * market.prize : legacyBase
    const place = i + 1
    const amount = Math.round((base * placementCurveMult(place, total)) / 500) * 500
    if (amount <= 0) return
    adjustTransferBudget(team, amount)
    results.push({ teamId: row.teamId, amount, place })
  })
  return results
}

function newPrizeMessageId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `msg-${prefix}-${crypto.randomUUID()}`
  }
  return `msg-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function messagesFromLeaguePlacementPrizes(payouts, career, { date = null } = {}) {
  const list = Array.isArray(payouts) ? payouts : []
  if (!list.length || !career?.playerTeamId) return []
  const mine = list.find((p) => p.teamId === career.playerTeamId)
  if (!mine || mine.amount <= 0) return []

  return [
    {
      id: newPrizeMessageId('leagueprize'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: career.seasonYear ?? null,
      read: false,
      title: `Premia za miejsce w lidze (${mine.place}.)`,
      titleEn: `League placement prize (${mine.place}${ordinalSuffixEn(mine.place)})`,
      body: `Za ${mine.place}. miejsce w lidze klub otrzymuje ${formatUsd(mine.amount)}.`,
      bodyEn: `For finishing ${mine.place}${ordinalSuffixEn(mine.place)} in the league, the club receives ${formatUsd(mine.amount)}.`,
      payload: { kind: 'league_placement_prize', amount: mine.amount, place: mine.place },
    },
  ]
}

function ordinalSuffixEn(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** Kolejność rund pucharu piramidy — od najwcześniejszej do finału. */
const CUP_ROUND_ORDER = ['round1', 'roundOf32', 'roundOf16', 'quarterfinal', 'semifinal', 'final']

/** Płaska premia (nie skalowana poziomem) — merytoryczna nagroda za rundę pucharu. */
const CUP_ROUND_PRIZE = {
  champion: 1_500_000,
  final: 750_000, // finalista (przegrany finał)
  semifinal: 375_000, // odpadł w półfinale
  quarterfinal: 200_000,
  roundOf16: 100_000,
  roundOf32: 50_000,
  round1: 20_000,
}

function teamCupOutcome(cup, teamId) {
  if (!cup?.matches) return null
  if (cup.championTeamId === teamId) return 'champion'
  let bestIdx = -1
  let bestMatch = null
  for (const m of cup.matches) {
    if (m.status !== 'completed') continue
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue
    const round = ({ 'round-16': 'roundOf16', 'round-32': 'roundOf32', 'round-64': 'round1' })[m.round] ?? m.round
    const idx = CUP_ROUND_ORDER.indexOf(round)
    if (idx > bestIdx) {
      bestIdx = idx
      bestMatch = { ...m, round }
    }
  }
  if (!bestMatch) return null
  // Przegrana w danej rundzie = "wynik" tej rundy (np. przegrana w finale = finalista).
  return bestMatch.round
}

/**
 * Premie pucharowe — raz, po rozstrzygnięciu całego Pucharu Piramidy. Nie dotyczy
 * zwykłego pucharu UFA (`cup.pyramidCupDates` obecne tylko dla `createPyramidCup` —
 * bez tego strażnika mistrz/finalista zwykłego pucharu UFA dostałby premię w EUR mimo
 * że to inna, niepowiązana rozgrywka). Płaci wszystkim drużynom obecnym w `teamsById`
 * — od startu sezonu to wszystkie 48 klubów piramidy (patrz `materializeFullPyramidTeams`
 * w shadowLeague.js). Idempotentne: zapisuje `cup.prizesAwarded`, więc bezpiecznie
 * wołać wielokrotnie.
 * @returns {Record<string, { amount: number, outcome: string }>}
 */
export function applyCupPlacementPrizes(cup, teamsById) {
  if (
    !cup?.matches ||
    (!cup.pyramidCupDates && cup.format !== 'domestic') ||
    cup.status !== 'complete' ||
    cup.prizesAwarded ||
    !teamsById
  ) {
    return cup?.prizesAwarded ?? {}
  }
  const awarded = {}
  const seenTeamIds = new Set()
  for (const m of cup.matches) {
    if (m.homeTeamId) seenTeamIds.add(m.homeTeamId)
    if (m.awayTeamId) seenTeamIds.add(m.awayTeamId)
  }
  // A cup rewards the same finish equally, including teams from lower divisions.
  const markets = [...new Map([...seenTeamIds].map(id => {
    const market = clubFinancialMarket(teamsById[id])
    return [market.countryId, market.television]
  })).values()]
  const cupScale = cup.format === 'domestic' && markets.length ? markets.reduce((sum, value) => sum + value, 0) / markets.length : 1
  for (const teamId of seenTeamIds) {
    const outcome = teamCupOutcome(cup, teamId)
    if (!outcome) continue
    const amount = Math.round(2 * CUP_ROUND_PRIZE[outcome] * cupScale)
    if (!amount) continue
    const team = teamsById[teamId]
    if (!team) continue
    adjustTransferBudget(team, amount)
    awarded[teamId] = { amount, outcome }
  }
  cup.prizesAwarded = awarded
  return awarded
}

const CUP_OUTCOME_LABEL_PL = {
  champion: 'zwycięstwo w Pucharze Piramidy',
  final: 'finał Pucharu Piramidy',
  semifinal: 'półfinał Pucharu Piramidy',
  quarterfinal: 'ćwierćfinał Pucharu Piramidy',
  roundOf16: '1/8 finału Pucharu Piramidy',
  roundOf32: 'rundę 32 Pucharu Piramidy',
  round1: '1. rundę Pucharu Piramidy',
}

const CUP_OUTCOME_LABEL_EN = {
  champion: 'winning the Pyramid Cup',
  final: 'reaching the Pyramid Cup final',
  semifinal: 'reaching the Pyramid Cup semifinal',
  quarterfinal: 'reaching the Pyramid Cup quarterfinal',
  roundOf16: 'reaching the Pyramid Cup round of 16',
  roundOf32: 'reaching the Pyramid Cup round of 32',
  round1: 'playing the Pyramid Cup first round',
}

/**
 * Wiadomość podsumowująca premię pucharową gracza — wołana na koniec sezonu (kiedy
 * `cup.prizesAwarded` jest już ustawione), więc nie trzeba przeplatać skrzynki przez
 * `advanceCalendarDay` (puchar rozstrzyga się w tle, w jeden dzień kalendarza).
 */
export function messageFromCupPlacementPrize(career, { date = null } = {}) {
  const awarded = career?.league?.cup?.prizesAwarded
  const mine = awarded?.[career?.playerTeamId]
  if (!mine || mine.amount <= 0) return null

  return {
    id: newPrizeMessageId('cupprize'),
    type: 'club_news',
    createdAt: new Date().toISOString(),
    date: date ?? career.league?.currentDate ?? null,
    seasonIndex: career.seasonIndex ?? null,
    seasonYear: career.seasonYear ?? null,
    read: false,
    title: 'Premia pucharowa',
    titleEn: 'Cup prize money',
    body: career.league.cup.format === 'domestic' ? `Za udział w krajowym pucharze klub otrzymuje ${formatUsd(mine.amount)}.` : `Za ${CUP_OUTCOME_LABEL_PL[mine.outcome] ?? 'udział w Pucharze Piramidy'} klub otrzymuje ${formatUsd(mine.amount)}.`,
    bodyEn: career.league.cup.format === 'domestic' ? `The club receives ${formatUsd(mine.amount)} for its domestic cup run.` : `For ${CUP_OUTCOME_LABEL_EN[mine.outcome] ?? 'the Pyramid Cup run'}, the club receives ${formatUsd(mine.amount)}.`,
    payload: { kind: 'cup_placement_prize', amount: mine.amount, outcome: mine.outcome },
  }
}
