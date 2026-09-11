import { UFA_LEAGUE_TEAMS, PLAYER_TEAM_ID } from '../data/ufaLeagueTeams.js'
import {
  flattenSchedule,
  generateDoubleRoundRobinSchedule,
  shuffledTeamOrder,
} from './schedule.js'
import { createStandings, standingsTable } from './standings.js'
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
    playerTeamId: Object.hasOwn(options, 'playerTeamId') ? options.playerTeamId : PLAYER_TEAM_ID,
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
  const playerTeamId = Object.hasOwn(options, 'playerTeamId') ? options.playerTeamId : PLAYER_TEAM_ID
  const seasonYear = options.seasonYear ?? 2025
  const simSeedBase = options.simSeedBase ?? seasonYear * 1000 + 805
  const calendar = buildSeasonCalendar({ seasonYear, teamIds })
  // Terminarz losowany per-kariera (seed = simSeedBase, inny za każdym razem gdy gracz
  // zaczyna nową karierę) — metoda koła sama w sobie jest deterministyczna względem
  // kolejności drużyn, więc bez tasowania każda kariera miałaby identyczny terminarz.
  // Druga połowa sezonu losowana OSOBNYM seedem, żeby mieć inną kolejność przeciwników
  // niż w pierwszej połowie (nie tylko odwrócony dom/wyjazd tych samych par).
  const scheduleRounds = generateDoubleRoundRobinSchedule(
    shuffledTeamOrder(teamIds, simSeedBase),
    shuffledTeamOrder(teamIds, simSeedBase + 1),
  )
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

/**
 * Jak `teamNameMap`, ale dla WSZYSTKICH drużyn dostępnych w `league.teamsById` — nie
 * tylko `league.teamIds` (poziom gracza). Piramida Ligi Europejskiej ma 48 klubów w
 * `teamsById` od startu sezonu (patrz materializeFullPyramidTeams), ale mecze pucharowe
 * i widoki typu "dzisiejsze mecze" pokazują drużyny z KAŻDEGO poziomu — bez tego
 * przeciwnik spoza własnej ligi nie ma nazwy do pokazania.
 */
export function teamNameMapAll(league, lang = UI_LANG.PL) {
  const map = {}
  const teamsById = league?.teamsById ?? {}
  for (const id of Object.keys(teamsById)) {
    map[id] = resolveTeamName(teamsById[id], lang) || id
  }
  return map
}

/**
 * Znajduje tabelę/statystyki DOWOLNEJ drużyny piramidy — najpierw w lidze gracza
 * (`league.standings`/`league.playerStats`), potem w każdej z pozostałych lig
 * (`league.otherLeagues`). Bez tego przeciwnik pucharowy spoza poziomu gracza nie miał
 * bilansu/miejsca w tabeli ani liderów sezonu (zawsze puste/„Unranked”).
 * @returns {{ standing: object|null, place: number|null, totalTeams: number, playerStats: object }}
 */
export function teamLeagueContext(league, teamId) {
  if (!teamId) return { standing: null, place: null, totalTeams: 0, playerStats: {} }

  const ownTable = standingsTable(league.standings ?? {})
  const ownIdx = ownTable.findIndex((r) => r.teamId === teamId)
  if (ownIdx >= 0) {
    return {
      standing: league.standings[teamId],
      place: ownIdx + 1,
      totalTeams: ownTable.length,
      playerStats: league.playerStats ?? {},
    }
  }

  for (const otherLeague of league.otherLeagues ?? []) {
    const table = standingsTable(otherLeague.standings ?? {})
    const idx = table.findIndex((r) => r.teamId === teamId)
    if (idx >= 0) {
      return {
        standing: otherLeague.standings[teamId],
        place: idx + 1,
        totalTeams: table.length,
        playerStats: otherLeague.playerStats ?? {},
      }
    }
  }

  return { standing: null, place: null, totalTeams: 0, playerStats: {} }
}

/**
 * Ids jednego poziomu uporządkowane wg JEGO tabeli na dziś (1. miejsce pierwsze).
 * Wszystkie drużyny poziomu siedzą w tej samej tabeli — albo w lidze gracza, albo w
 * jednej z `league.otherLeagues` — więc wystarczy znaleźć tę jedną i po niej posortować.
 * Drużyny bez wiersza w tabeli lądują na końcu, w oryginalnej kolejności.
 */
export function teamIdsByStandings(league, teamIds) {
  if (!teamIds?.length) return []
  const sources = [league?.standings, ...(league?.otherLeagues ?? []).map((l) => l.standings)]
  const source = sources.find((s) => s && teamIds.some((id) => s[id]))
  if (!source) return [...teamIds]

  const wanted = new Set(teamIds)
  const ranked = standingsTable(source)
    .map((r) => r.teamId)
    .filter((id) => wanted.has(id))
  const rankedSet = new Set(ranked)
  return [...ranked, ...teamIds.filter((id) => !rankedSet.has(id))]
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
