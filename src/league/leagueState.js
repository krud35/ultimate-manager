import { UFA_LEAGUE_TEAMS, PLAYER_TEAM_ID } from '../data/ufaLeagueTeams.js'
import {
  flattenSchedule,
  generateDoubleRoundRobinSchedule,
  shuffledTeamOrder,
} from './schedule.js'
import { createStandings } from './standings.js'
import { createLeaguePlayerStats } from './leagueStats.js'
import {
  bindLeagueToWorld,
  createWorldFromTemplate,
  initWorldPlayerStats,
  teamFromLeague,
} from '../career/worldState.js'
import {
  assignDatesToLeagueFixtures,
  buildSeasonCalendar,
} from './seasonCalendar.js'
import { resolveTeamName, UI_LANG } from '../ui/locale.js'

/**
 * @param {object} [options]
 */
export function createLeagueSeason(options = {}) {
  const world = options.world ?? createWorldFromTemplate()
  initWorldPlayerStats(world, {
    playerTeamId: options.playerTeamId ?? PLAYER_TEAM_ID,
  })

  // Kopia, nie alias: `world.teamIds` bywa dalej mutowane (np. materializeFullPyramidTeams
  // dopisuje do niego pozostałe kluby piramidy) — gdyby `league.teamIds` był tą samą
  // tablicą, takie dopiski przeciekałyby do zakresu ligi gracza (więcej drużyn w
  // tabeli/terminarzu niż faktycznie w tej lidze).
  const teamIds = options.teamIds
    ? [...options.teamIds]
    : world.teamIds
      ? [...world.teamIds]
      : UFA_LEAGUE_TEAMS.map((t) => t.id)
  const playerTeamId = options.playerTeamId ?? PLAYER_TEAM_ID
  const seasonYear = options.seasonYear ?? 2025
  const simSeedBase = options.simSeedBase ?? seasonYear * 1000 + 805
  const calendar = buildSeasonCalendar({ seasonYear, teamIds })
  // Terminarz losowany per-kariera (seed = simSeedBase, inny za każdym razem gdy gracz
  // zaczyna nową karierę) — metoda koła sama w sobie jest deterministyczna względem
  // kolejności drużyn, więc bez tasowania każda kariera miałaby identyczny terminarz.
  const scheduleRounds = generateDoubleRoundRobinSchedule(shuffledTeamOrder(teamIds, simSeedBase))
  const fixtures = assignDatesToLeagueFixtures(flattenSchedule(scheduleRounds), calendar)

  const league = {
    seasonLabel: options.seasonLabel ?? calendar.seasonLabel,
    seasonYear,
    playerTeamId,
    teamIds,
    currentDate: calendar.startDate,
    currentRound: 1,
    totalRounds: scheduleRounds.length,
    scheduleRounds,
    fixtures,
    standings: createStandings(teamIds),
    fallStandingsOrder: null,
    cup: null,
    calendar,
    phase: 'fall',
    matchHistory: [],
    playerStats: createLeaguePlayerStats(),
    /** Statystyki zawodników tylko z meczów Pucharu Ligi (oddzielne od ligi). */
    cupPlayerStats: createLeaguePlayerStats(),
    simSeedBase,
    status: 'active',
  }

  return bindLeagueToWorld(league, world)
}

export function teamNameMap(league, lang = UI_LANG.PL) {
  const map = {}
  for (const id of league.teamIds) {
    const team = teamFromLeague(league, id)
    map[id] = resolveTeamName(team, lang) || id
  }
  return map
}

export function fixturesForRound(league, round) {
  return league.fixtures.filter((f) => f.round === round && f.competition !== 'cup')
}

export function fixturesForDate(league, date) {
  const iso = String(date).slice(0, 10)
  return (league.fixtures ?? []).filter((f) => f.date === iso)
}

export function playerFixtureForRound(league, round = league.currentRound) {
  return fixturesForRound(league, round).find(
    (f) => f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId,
  )
}

export function playerFixtureOnDate(league, date = league.currentDate) {
  return fixturesForDate(league, date).find(
    (f) =>
      (f.status === 'scheduled' || f.status === 'pending') &&
      f.homeTeamId &&
      f.awayTeamId &&
      (f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId),
  )
}

export function isRoundComplete(league, round = league.currentRound) {
  const roundFixtures = fixturesForRound(league, round)
  return roundFixtures.length > 0 && roundFixtures.every((f) => f.status === 'completed')
}

export function pendingFixturesInRound(league, round = league.currentRound) {
  return fixturesForRound(league, round).filter((f) => f.status !== 'completed')
}

export function findFixture(league, fixtureId) {
  const fromFixtures = league.fixtures.find((f) => f.id === fixtureId)
  if (fromFixtures) return fromFixtures
  return league.cup?.matches?.find((m) => m.id === fixtureId) ?? null
}

/** Puchar (i jawnie oznaczone mecze) — lokalizacja neutralna. */
export function isNeutralVenue(fixture) {
  if (!fixture) return false
  if (fixture.venue === 'neutral') return true
  return fixture.competition === 'cup'
}

/**
 * Oznaczenie boiska z perspektywy drużyny: H / A / N.
 * @returns {'H'|'A'|'N'|null}
 */
export function venueMarkerForTeam(fixture, teamId) {
  if (!fixture || !teamId) return null
  if (isNeutralVenue(fixture)) return 'N'
  if (fixture.homeTeamId === teamId) return 'H'
  if (fixture.awayTeamId === teamId) return 'A'
  return null
}

/**
 * Klon stanu ligi z zachowaniem wspólnych referencji do składów (`teamsById`).
 */
export function cloneLeague(league) {
  const teamsById = league.teamsById
  const { teamsById: _drop, ...rest } = league
  const copy = structuredClone(rest)
  if (teamsById) copy.teamsById = teamsById
  return copy
}
