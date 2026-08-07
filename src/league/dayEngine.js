/**
 * Silnik dnia kalendarza: mecze AI, blokada na mecz gracza, faza sezonu.
 */

import {
  addDays,
  formatISODate,
  parseISODate,
  officialSeasonEndDate,
} from './seasonCalendar.js'
import { simulateFixtureMatch, applyMatchResultToLeague } from './leagueEngine.js'
import {
  advanceCupAfterMatch,
  createCupFromFallStandings,
  syncCupMatchesIntoFixtures,
} from './cupBracket.js'
import { createLeaguePlayerStats, mergeMatchBoxScore } from './leagueStats.js'
import { standingsTable } from './standings.js'
import { teamFromLeague } from '../career/worldState.js'
import { applyReputationForMatchTeams } from '../models/teamReputation.js'
import { applyFansMoodForMatchTeams } from '../models/teamFans.js'
import { applyFanShopAfterMatch } from '../career/clubFacilities.js'

function toIso(date) {
  return typeof date === 'string' ? String(date).slice(0, 10) : formatISODate(date)
}

function allLeagueFixtures(league) {
  return league.fixtures ?? []
}

function isPlayerInFixture(league, fixture) {
  const pid = league.playerTeamId
  if (!pid || !fixture) return false
  return fixture.homeTeamId === pid || fixture.awayTeamId === pid
}

function isPending(fixture) {
  return fixture.status === 'scheduled' || fixture.status === 'pending'
}

/**
 * Faza sezonu na podstawie daty i kalendarza.
 * @returns {'fall'|'cup'|'spring'|'offseason'}
 */
export function detectSeasonPhase(league, date = league.currentDate) {
  const cal = league.calendar
  if (!cal || !date) return league.phase ?? 'fall'

  const iso = toIso(date)
  const d = parseISODate(iso)
  const start = parseISODate(cal.startDate)
  const end = parseISODate(cal.endDate)

  if (d.getTime() < start.getTime()) return 'offseason'
  if (d.getTime() > end.getTime()) return 'offseason'

  const cup = cal.cup
  if (cup) {
    const cupStart = parseISODate(cup.freeWeek1.start)
    const cupEnd = parseISODate(cup.freeWeek4.end)
    if (d.getTime() >= cupStart.getTime() && d.getTime() <= cupEnd.getTime()) {
      return 'cup'
    }
  }

  const year = d.getFullYear()
  const month = d.getMonth()
  if (year === cal.seasonYear && month >= 7) return 'fall'
  if (year === cal.seasonYear + 1 && month >= 1 && month <= 5) return 'spring'

  return 'offseason'
}

export function getFixturesOnDate(league, date) {
  const iso = toIso(date)
  const fromLeague = allLeagueFixtures(league).filter((f) => f.date === iso)

  const seen = new Set(fromLeague.map((f) => f.id))
  if (league.cup?.matches) {
    for (const m of league.cup.matches) {
      if (m.date === iso && !seen.has(m.id)) {
        fromLeague.push(m)
        seen.add(m.id)
      }
    }
  }

  return fromLeague
}

export function getPlayerFixtureOnDate(league, date) {
  return (
    getFixturesOnDate(league, date).find(
      (f) => isPlayerInFixture(league, f) && isPending(f) && f.homeTeamId && f.awayTeamId,
    ) ?? null
  )
}

/** Po domknięciu jesieni — drabinka pucharu. */
export function maybeInitializeCup(league) {
  if (!league || league.cup) return league

  const fallFixtures = (league.fixtures ?? []).filter(
    (f) => f.competition !== 'cup' && f.round >= 1 && f.round <= 15,
  )
  if (!fallFixtures.length || fallFixtures.some((f) => f.status !== 'completed')) {
    return league
  }

  const order = Object.values(league.standings ?? {})
    .map((row) => ({
      ...row,
      diff: (row.pointsFor ?? 0) - (row.pointsAgainst ?? 0),
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.diff - a.diff
    })
    .map((r) => r.teamId)

  if (order.length < 16 || !league.calendar?.cup) return league

  league.fallStandingsOrder = order
  league.cup = createCupFromFallStandings(order, league.calendar.cup)
  syncCupMatchesIntoFixtures(league)
  return league
}

export function syncLeagueRoundFromDate(league) {
  const today = league.currentDate
  const upcoming = (league.fixtures ?? [])
    .filter((f) => f.competition !== 'cup' && f.date && f.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.round ?? 0) - (b.round ?? 0))
  if (upcoming[0]?.round) league.currentRound = upcoming[0].round
  return league
}

export function isSeasonFullyComplete(league) {
  return areCompetitionsComplete(league)
}

/** Wszystkie mecze ligi + pucharu rozegrane. */
export function areCompetitionsComplete(league) {
  const leagueDone = (league.fixtures ?? [])
    .filter((f) => f.competition !== 'cup')
    .every((f) => f.status === 'completed')
  const cupDone = !league.cup || league.cup.status === 'complete'
  return leagueDone && cupDone
}

/** Oficjalny koniec sezonu kariery (31 lipca) — można przejść do kolejnego. */
export function isOfficialSeasonEnded(league) {
  if (!areCompetitionsComplete(league)) return false
  const official = officialSeasonEndDate(league.calendar ?? league.seasonYear)
  const today = toIso(league.currentDate)
  if (!official || !today) return false
  return today >= official
}

export function getLeagueChampionTeamId(league) {
  const table = standingsTable(league?.standings ?? {}, (id) => id)
  return table[0]?.teamId ?? null
}

/**
 * Symuluje zaplanowane mecze danego dnia.
 * @param {{ includePlayer?: boolean }} options — domyślnie pomija mecz gracza.
 */
export function simulateFixturesOnDate(league, date, options = {}) {
  const includePlayer = !!options.includePlayer
  const fixtures = getFixturesOnDate(league, date).filter(
    (f) =>
      isPending(f) &&
      (includePlayer || !isPlayerInFixture(league, f)) &&
      f.homeTeamId &&
      f.awayTeamId,
  )

  for (const fixture of fixtures) {
    ensureFixtureInLeague(league, fixture)

    const record = simulateFixtureMatch(league, fixture)

    if (fixture.competition === 'cup') {
      applyCupMatchResult(league, fixture, record)
    } else {
      applyMatchResultToLeague(league, record)
    }
  }

  return league
}

/** Symuluje wszystkie zaplanowane mecze AI danego dnia (pomija mecz gracza). */
export function simulateAiFixturesOnDate(league, date) {
  return simulateFixturesOnDate(league, date, { includePlayer: false })
}

function ensureFixtureInLeague(league, fixture) {
  if (!allLeagueFixtures(league).some((f) => f.id === fixture.id)) {
    league.fixtures.push(fixture)
  }
}

function applyCupMatchResult(league, fixture, record) {
  const target = findFixtureInLeague(league, fixture.id) ?? fixture
  target.status = 'completed'
  target.homeScore = record.homeScore
  target.awayScore = record.awayScore
  target.winnerTeamId = record.winner
  target.playedByPlayer = !!record.playedByPlayer

  if (record.boxScore?.length) {
    if (!league.cupPlayerStats) league.cupPlayerStats = createLeaguePlayerStats()
    mergeMatchBoxScore(
      league.cupPlayerStats,
      record.boxScore,
      record.homeTeamId,
      record.awayTeamId,
    )
  }

  if (league.cup) {
    advanceCupAfterMatch(league.cup, {
      ...record,
      fixtureId: fixture.id,
    })
    syncCupMatchesIntoFixtures(league)
  }

  if (!league.matchHistory) league.matchHistory = []
  league.matchHistory.push({
    fixtureId: record.fixtureId,
    homeTeamId: record.homeTeamId,
    awayTeamId: record.awayTeamId,
    homeScore: record.homeScore,
    awayScore: record.awayScore,
    winner: record.winner,
    competition: 'cup',
    playedByPlayer: !!record.playedByPlayer,
    completedAt: Date.now(),
    injuries: record.injuries ?? [],
  })

  applyReputationForMatchTeams(
    teamFromLeague(league, record.homeTeamId),
    teamFromLeague(league, record.awayTeamId),
    record.homeScore,
    record.awayScore,
    { competition: 'cup' },
  )
  applyFansMoodForMatchTeams(
    teamFromLeague(league, record.homeTeamId),
    teamFromLeague(league, record.awayTeamId),
    record.homeScore,
    record.awayScore,
    { competition: 'cup', boxScore: record.boxScore ?? null },
  )

  const homeTeam = teamFromLeague(league, record.homeTeamId)
  const awayTeam = teamFromLeague(league, record.awayTeamId)
  const homeWon = (record.homeScore ?? 0) > (record.awayScore ?? 0)
  const awayWon = (record.awayScore ?? 0) > (record.homeScore ?? 0)
  if (homeTeam) applyFanShopAfterMatch(homeTeam, { won: homeWon, isHome: true })
  if (awayTeam) applyFanShopAfterMatch(awayTeam, { won: awayWon, isHome: false })
}

function findFixtureInLeague(league, fixtureId) {
  return allLeagueFixtures(league).find((f) => f.id === fixtureId) ?? null
}

/**
 * @param {{ autoSimulatePlayer?: boolean }} options
 * @returns {{ league: object, blocked: boolean, playerFixture?: object|null, weekTick?: boolean, autoSimulatedPlayer?: boolean }}
 */
export function advanceCalendarDay(league, options = {}) {
  if (!league.currentDate) {
    return { league, blocked: false, weekTick: false }
  }

  const autoSimulatePlayer = !!options.autoSimulatePlayer
  const date = toIso(league.currentDate)
  maybeInitializeCup(league)
  simulateAiFixturesOnDate(league, date)

  let playerFixture = getPlayerFixtureOnDate(league, date)
  let autoSimulatedPlayer = false
  if (playerFixture && playerFixture.status !== 'completed') {
    if (autoSimulatePlayer) {
      simulateFixturesOnDate(league, date, { includePlayer: true })
      autoSimulatedPlayer = true
      playerFixture = getPlayerFixtureOnDate(league, date)
    }
    if (playerFixture && playerFixture.status !== 'completed') {
      league.phase = detectSeasonPhase(league, date)
      syncLeagueRoundFromDate(league)
      return { league, blocked: true, playerFixture, weekTick: false, autoSimulatedPlayer }
    }
  }

  const prevDow = parseISODate(date).getDay()
  const next = formatISODate(addDays(date, 1))
  league.currentDate = next
  league.phase = detectSeasonPhase(league, next)
  syncLeagueRoundFromDate(league)

  // Rozgrywki skończone → flaga, ale kalendarz idzie dalej do 31 lipca.
  if (areCompetitionsComplete(league)) {
    league.competitionsComplete = true
    if (isOfficialSeasonEnded(league)) {
      league.status = 'complete'
      league.phase = 'offseason'
    } else if (league.status === 'complete') {
      // Starsze save'y / błędny stan — trzymaj active do oficjalnego końca.
      league.status = 'active'
    }
  }

  return {
    league,
    blocked: false,
    playerFixture: null,
    weekTick: prevDow === 0,
    autoSimulatedPlayer,
  }
}

/**
 * Szybkie przewijanie dni aż do daty / predykatu.
 * @param {{ maxDays?: number, autoSimulatePlayer?: boolean }} options
 *   `autoSimulatePlayer` — przy napotkaniu meczu gracza rozgrywa go w tle i kontynuuje.
 */
export function simulateDaysUntil(league, targetDateOrPredicate, options = {}) {
  const maxDays = options.maxDays ?? 400
  const autoSimulatePlayer = !!options.autoSimulatePlayer
  let days = 0
  let weekTicks = 0
  let playerMatchesSimulated = 0

  const done = () => {
    if (typeof targetDateOrPredicate === 'function') {
      return targetDateOrPredicate(league)
    }
    return toIso(league.currentDate) >= toIso(targetDateOrPredicate)
  }

  while (days < maxDays && !done() && league.status !== 'complete') {
    const result = advanceCalendarDay(league, { autoSimulatePlayer })
    days += 1
    if (result.weekTick) weekTicks += 1
    if (result.autoSimulatedPlayer) playerMatchesSimulated += 1
    if (result.blocked) {
      return {
        league,
        blocked: true,
        playerFixture: result.playerFixture,
        daysAdvanced: days,
        weekTicks,
        playerMatchesSimulated,
      }
    }
  }

  return {
    league,
    blocked: false,
    playerFixture: null,
    daysAdvanced: days,
    weekTicks,
    playerMatchesSimulated,
  }
}

/**
 * Przewija kalendarz do wskazanej daty, automatycznie symulując wszystkie mecze
 * (AI + gracza) po drodze. Zatrzymuje się na `targetDate` (mecze tego dnia nie są
 * jeszcze rozgrywane — możesz je zagrać ręcznie).
 */
export function simulateUntilDate(league, targetDate, options = {}) {
  const target = toIso(targetDate)
  const current = toIso(league.currentDate)
  if (!target || !current || target <= current) {
    return {
      league,
      blocked: false,
      playerFixture: null,
      daysAdvanced: 0,
      weekTicks: 0,
      playerMatchesSimulated: 0,
      reached: target === current,
    }
  }

  const result = simulateDaysUntil(league, target, {
    maxDays: options.maxDays ?? 400,
    autoSimulatePlayer: options.autoSimulatePlayer !== false,
  })

  return {
    ...result,
    reached: toIso(league.currentDate) >= target || league.status === 'complete',
  }
}

/** Symuluj aż do następnego meczu gracza lub końca rozgrywek (nie do 31 lipca). */
export function simulateUntilPlayerMatchOrEnd(league, options = {}) {
  const maxDays = options.maxDays ?? 120
  let days = 0
  let weekTicks = 0

  while (days < maxDays && league.status !== 'complete') {
    const pending = getPlayerFixtureOnDate(league, league.currentDate)
    if (pending) {
      return {
        league,
        blocked: true,
        playerFixture: pending,
        daysAdvanced: days,
        weekTicks,
      }
    }

    // Po ostatnim meczu kalendarz ma iść dzień po dniu — nie skacz do 31 lipca.
    if (areCompetitionsComplete(league)) {
      const upcomingPlayer = allLeagueFixtures(league).some(
        (f) =>
          (f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId) &&
          f.status !== 'completed' &&
          f.date &&
          f.date >= league.currentDate,
      )
      if (!upcomingPlayer) {
        return {
          league,
          blocked: false,
          playerFixture: null,
          daysAdvanced: days,
          weekTicks,
          competitionsComplete: true,
        }
      }
    }

    const result = advanceCalendarDay(league)
    days += 1
    if (result.weekTick) weekTicks += 1
    if (result.blocked) {
      return {
        league,
        blocked: true,
        playerFixture: result.playerFixture,
        daysAdvanced: days,
        weekTicks,
      }
    }
  }

  return {
    league,
    blocked: false,
    playerFixture: null,
    daysAdvanced: days,
    weekTicks,
  }
}

function daysBetweenIso(fromIso, toIso) {
  const a = parseISODate(fromIso).getTime()
  const b = parseISODate(toIso).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

async function maybeReportProgress(onProgress, yieldEvery, days, payload) {
  if (!onProgress) return
  if (yieldEvery > 1 && days % yieldEvery !== 0) return
  onProgress(payload)
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Async wersja simulateDaysUntil — raportuje postęp i oddaje UI między chunkami.
 */
export async function simulateDaysUntilAsync(league, targetDateOrPredicate, options = {}) {
  const maxDays = options.maxDays ?? 400
  const autoSimulatePlayer = !!options.autoSimulatePlayer
  const onProgress = options.onProgress
  const yieldEvery = options.yieldEvery ?? 2
  let days = 0
  let weekTicks = 0
  let playerMatchesSimulated = 0

  const startIso = toIso(league.currentDate)
  let estimatedTotal =
    typeof targetDateOrPredicate === 'string'
      ? Math.max(1, daysBetweenIso(startIso, targetDateOrPredicate))
      : Math.min(maxDays, 40)

  const done = () => {
    if (typeof targetDateOrPredicate === 'function') {
      return targetDateOrPredicate(league)
    }
    return toIso(league.currentDate) >= toIso(targetDateOrPredicate)
  }

  while (days < maxDays && !done() && league.status !== 'complete') {
    const result = advanceCalendarDay(league, { autoSimulatePlayer })
    days += 1
    if (result.weekTick) weekTicks += 1
    if (result.autoSimulatedPlayer) playerMatchesSimulated += 1

    if (typeof targetDateOrPredicate === 'function' && days > estimatedTotal * 0.85) {
      estimatedTotal = Math.min(maxDays, estimatedTotal + 20)
    }

    await maybeReportProgress(onProgress, yieldEvery, days, {
      phase: 'calendar',
      daysAdvanced: days,
      total: estimatedTotal,
      currentDate: league.currentDate,
    })

    if (result.blocked) {
      return {
        league,
        blocked: true,
        playerFixture: result.playerFixture,
        daysAdvanced: days,
        weekTicks,
        playerMatchesSimulated,
      }
    }
  }

  return {
    league,
    blocked: false,
    playerFixture: null,
    daysAdvanced: days,
    weekTicks,
    playerMatchesSimulated,
  }
}

export async function simulateUntilDateAsync(league, targetDate, options = {}) {
  const target = toIso(targetDate)
  const current = toIso(league.currentDate)
  if (!target || !current || target <= current) {
    return {
      league,
      blocked: false,
      playerFixture: null,
      daysAdvanced: 0,
      weekTicks: 0,
      playerMatchesSimulated: 0,
      reached: target === current,
    }
  }

  const result = await simulateDaysUntilAsync(league, target, {
    maxDays: options.maxDays ?? 400,
    autoSimulatePlayer: options.autoSimulatePlayer !== false,
    onProgress: options.onProgress,
    yieldEvery: options.yieldEvery,
  })

  return {
    ...result,
    reached: toIso(league.currentDate) >= target || league.status === 'complete',
  }
}

export async function simulateUntilPlayerMatchOrEndAsync(league, options = {}) {
  const maxDays = options.maxDays ?? 120
  const onProgress = options.onProgress
  const yieldEvery = options.yieldEvery ?? 2
  let days = 0
  let weekTicks = 0
  let estimatedTotal = Math.min(maxDays, 35)

  while (days < maxDays && league.status !== 'complete') {
    const pending = getPlayerFixtureOnDate(league, league.currentDate)
    if (pending) {
      return {
        league,
        blocked: true,
        playerFixture: pending,
        daysAdvanced: days,
        weekTicks,
      }
    }

    if (areCompetitionsComplete(league)) {
      const upcomingPlayer = allLeagueFixtures(league).some(
        (f) =>
          (f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId) &&
          f.status !== 'completed' &&
          f.date &&
          f.date >= league.currentDate,
      )
      if (!upcomingPlayer) {
        return {
          league,
          blocked: false,
          playerFixture: null,
          daysAdvanced: days,
          weekTicks,
          competitionsComplete: true,
        }
      }
    }

    const result = advanceCalendarDay(league)
    days += 1
    if (result.weekTick) weekTicks += 1
    if (days > estimatedTotal * 0.85) {
      estimatedTotal = Math.min(maxDays, estimatedTotal + 20)
    }

    await maybeReportProgress(onProgress, yieldEvery, days, {
      phase: 'calendar',
      daysAdvanced: days,
      total: estimatedTotal,
      currentDate: league.currentDate,
    })

    if (result.blocked) {
      return {
        league,
        blocked: true,
        playerFixture: result.playerFixture,
        daysAdvanced: days,
        weekTicks,
      }
    }
  }

  return {
    league,
    blocked: false,
    playerFixture: null,
    daysAdvanced: days,
    weekTicks,
  }
}
