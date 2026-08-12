import { teamForMatchEngine } from '../data/ufaLeagueTeams.js'
import { simulateMatch } from '../matchEngine/index.js'
import {
  buildMatchStatsFromEvents,
  compactMatchStats,
  summarizeLineStartPoints,
} from '../matchEngine/matchStats.js'
import { tacticsForTeam } from '../matchEngine/aiLineup.js'
import { applyGameToStandings } from './standings.js'
import { createLeaguePlayerStats, mergeMatchBoxScore } from './leagueStats.js'
import { ensurePlayerStats } from '../models/playerStats.js'
import { teamFromLeague } from '../career/worldState.js'
import { applyReputationForMatchTeams } from '../models/teamReputation.js'
import { applyFansMoodForMatchTeams } from '../models/teamFans.js'
import { applyPostMatchFinances } from '../career/clubFacilities.js'
import { isClubBankrupt } from '../career/transfers/clubFinances.js'
import {
  findFixture,
  isRoundComplete,
  pendingFixturesInRound,
} from './leagueState.js'
import { advanceCupAfterMatch, syncCupMatchesIntoFixtures } from './cupBracket.js'

function fixtureSeed(league, fixtureId) {
  let h = league.simSeedBase
  for (let i = 0; i < fixtureId.length; i += 1) {
    h = (h * 31 + fixtureId.charCodeAt(i)) >>> 0
  }
  return h
}

function resolveTeam(league, teamId) {
  const team = teamFromLeague(league, teamId)
  if (!team) {
    throw new Error(`Brak drużyny ${teamId} w świecie ligi`)
  }
  return team
}

/**
 * Ile ostatnich meczów z rzędu (dowolna konkurencja) drużyna przegrała — patrz
 * "crisis mode" w resolveAiTeamIdentity (aiLineup.js): po CRISIS_LOSS_STREAK z rzędu
 * trener AI traci zaufanie do własnej tożsamości i mocniej opiera się na fitScore.
 */
function recentLossStreak(league, teamId) {
  const history = league?.matchHistory
  if (!teamId || !history?.length) return 0
  let streak = 0
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i]
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue
    if (!m.winner || m.winner === teamId) break
    streak += 1
  }
  return streak
}

function tacticsForResolvedTeam(team, league = null) {
  if (!team) return null
  return tacticsForTeam(team, { lossStreak: recentLossStreak(league, team.id) })
}

/**
 * Walkover 15–0 gdy klub ma budżet ≤ −2.5M.
 * @returns {object|null}
 */
export function tryForfeitMatchRecord(league, fixture) {
  const home = resolveTeam(league, fixture.homeTeamId)
  const away = resolveTeam(league, fixture.awayTeamId)
  const homeBroke = isClubBankrupt(home)
  const awayBroke = isClubBankrupt(away)
  if (!homeBroke && !awayBroke) return null

  let homeScore = 0
  let awayScore = 0
  let winner = fixture.homeTeamId
  if (homeBroke && awayBroke) {
    homeScore = 15
    awayScore = 0
    winner = fixture.homeTeamId
  } else if (homeBroke) {
    homeScore = 0
    awayScore = 15
    winner = fixture.awayTeamId
  } else {
    homeScore = 15
    awayScore = 0
    winner = fixture.homeTeamId
  }

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore,
    awayScore,
    winner,
    boxScore: [],
    playedByPlayer: false,
    competition: fixture.competition ?? 'league',
    injuries: [],
    forfeited: true,
    bankruptTeamIds: [
      ...(homeBroke ? [fixture.homeTeamId] : []),
      ...(awayBroke ? [fixture.awayTeamId] : []),
    ],
  }
}

/**
 * Symuluje pojedynczy mecz AI — ten sam silnik co mecz gracza (simulateMatch),
 * w trybie fastMode (bez klatkowania ruchu, patrz point.js: simulatePointFast).
 * Ujednolica ligę z meczem gracza: te same resolveThrow/resolveSeparation/
 * pickThrowType, ten sam kształt wyniku (leagueRecordFromEngineResult).
 */
export function simulateFixtureMatch(league, fixture) {
  const forfeit = tryForfeitMatchRecord(league, fixture)
  if (forfeit) return forfeit

  const home = resolveTeam(league, fixture.homeTeamId)
  const away = resolveTeam(league, fixture.awayTeamId)

  const homeTactics = tacticsForResolvedTeam(home, league)
  const awayTactics = tacticsForResolvedTeam(away, league)

  const engineResult = simulateMatch({
    homeTeam: { ...teamForMatchEngine(home), tactics: homeTactics },
    awayTeam: { ...teamForMatchEngine(away), tactics: awayTactics },
    homeTactics,
    awayTactics,
    seed: fixtureSeed(league, fixture.id),
    fastMode: true,
  })

  return leagueRecordFromEngineResult(fixture, engineResult, false)
}

/** Zapis wyniku meczu gracza lub AI do stanu ligi (mutuje league). */
export function applyMatchResultToLeague(league, matchRecord) {
  const fixture = findFixture(league, matchRecord.fixtureId)
  if (!fixture || fixture.status === 'completed') return league

  fixture.status = 'completed'
  fixture.homeScore = matchRecord.homeScore
  fixture.awayScore = matchRecord.awayScore
  fixture.winnerTeamId = matchRecord.winner
  fixture.playedByPlayer = !!matchRecord.playedByPlayer

  const isCup = (matchRecord.competition ?? fixture.competition) === 'cup'

  if (!isCup) {
    applyGameToStandings(
      league.standings,
      matchRecord.homeTeamId,
      matchRecord.awayTeamId,
      matchRecord.homeScore,
      matchRecord.awayScore,
    )
  }

  if (matchRecord.boxScore?.length) {
    const boxWithTeams = matchRecord.boxScore.map((row) => ({
      ...row,
      teamId: row.teamId ?? inferTeamSide(league, row, matchRecord),
    }))

    const statsTarget = isCup
      ? (league.cupPlayerStats ??= createLeaguePlayerStats())
      : (league.playerStats ??= createLeaguePlayerStats())

    mergeMatchBoxScore(
      statsTarget,
      boxWithTeams,
      matchRecord.homeTeamId,
      matchRecord.awayTeamId,
    )

    // Wszystkie mecze (gracza i AI) idą teraz przez ten sam silnik — box score
    // zawsze trzeba doliczyć do player.stats (silnik go tam sam nie wpisuje).
    applyEngineBoxScoreToRoster(league, matchRecord.homeTeamId, matchRecord.awayTeamId, boxWithTeams)

    // Statystyki per kolejka — źródło dla Ultiworld (Top 7, przeglądy).
    if (!isCup && matchRecord.round != null) {
      league.roundPlayerStats ??= {}
      const roundKey = String(matchRecord.round)
      league.roundPlayerStats[roundKey] ??= createLeaguePlayerStats()
      mergeMatchBoxScore(
        league.roundPlayerStats[roundKey],
        boxWithTeams,
        matchRecord.homeTeamId,
        matchRecord.awayTeamId,
      )
    }
  }

  if (isCup && league.cup) {
    advanceCupAfterMatch(league.cup, {
      ...matchRecord,
      fixtureId: matchRecord.fixtureId,
    })
    syncCupMatchesIntoFixtures(league)
  }

  league.matchHistory.push({
    fixtureId: matchRecord.fixtureId,
    round: matchRecord.round,
    homeTeamId: matchRecord.homeTeamId,
    awayTeamId: matchRecord.awayTeamId,
    homeScore: matchRecord.homeScore,
    awayScore: matchRecord.awayScore,
    winner: matchRecord.winner,
    competition: isCup ? 'cup' : 'league',
    playedByPlayer: !!matchRecord.playedByPlayer,
    completedAt: Date.now(),
    injuries: matchRecord.injuries ?? [],
  })

  applyReputationForMatchTeams(
    teamFromLeague(league, matchRecord.homeTeamId),
    teamFromLeague(league, matchRecord.awayTeamId),
    matchRecord.homeScore,
    matchRecord.awayScore,
    { competition: isCup ? 'cup' : 'league' },
  )
  applyFansMoodForMatchTeams(
    teamFromLeague(league, matchRecord.homeTeamId),
    teamFromLeague(league, matchRecord.awayTeamId),
    matchRecord.homeScore,
    matchRecord.awayScore,
    { competition: isCup ? 'cup' : 'league', boxScore: matchRecord.boxScore ?? null },
  )

  const homeTeam = teamFromLeague(league, matchRecord.homeTeamId)
  const awayTeam = teamFromLeague(league, matchRecord.awayTeamId)
  const homeWon = (matchRecord.homeScore ?? 0) > (matchRecord.awayScore ?? 0)
  const awayWon = (matchRecord.awayScore ?? 0) > (matchRecord.homeScore ?? 0)
  applyPostMatchFinances(homeTeam, awayTeam, {
    isCup,
    homeWon,
    awayWon,
  })

  delete fixture.boxScore

  return league
}

function inferTeamSide(league, row, matchRecord) {
  const homeTeam = teamFromLeague(league, matchRecord.homeTeamId)
  const awayTeam = teamFromLeague(league, matchRecord.awayTeamId)
  if (homeTeam?.players.some((p) => p.id === row.playerId)) return 'home'
  if (awayTeam?.players.some((p) => p.id === row.playerId)) return 'away'
  return null
}

/** G/A/B z box score silnika meczowego (PP już jest w `player.stats`). */
function applyEngineBoxScoreToRoster(league, homeTeamId, awayTeamId, boxScoreRows) {
  const home = teamFromLeague(league, homeTeamId)
  const away = teamFromLeague(league, awayTeamId)
  if (!home || !away) return

  for (const row of boxScoreRows) {
    const player =
      home.players.find((p) => p.id === row.playerId) ??
      away.players.find((p) => p.id === row.playerId)
    if (!player) continue

    ensurePlayerStats(player)
    player.stats.goals += row.goals ?? 0
    player.stats.assists += row.assists ?? 0
    player.stats.blocks += row.blocks ?? 0
  }
}

/** Symuluje wszystkie nierozegrane mecze AI w bieżącej kolejce (bez meczu gracza). */
export function simulatePendingRoundMatches(league, round = league.currentRound) {
  for (const fixture of pendingFixturesInRound(league, round)) {
    if (fixture.status === 'completed') continue
    if (
      fixture.homeTeamId === league.playerTeamId ||
      fixture.awayTeamId === league.playerTeamId
    ) {
      continue
    }
    const record = simulateFixtureMatch(league, fixture)
    applyMatchResultToLeague(league, record)
  }

  return league
}

/** Po meczu gracza: dokończ resztę kolejki AI i ewentualnie przejdź do następnej rundy. */
export function finishRound(league) {
  const round = league.currentRound

  for (const fixture of pendingFixturesInRound(league, round)) {
    if (fixture.status === 'completed') continue
    const record = simulateFixtureMatch(league, fixture)
    applyMatchResultToLeague(league, record)
  }

  if (isRoundComplete(league, round) && league.currentRound < league.totalRounds) {
    league.currentRound += 1
  } else if (isRoundComplete(league, round)) {
    league.status = 'complete'
  }

  return league
}

/** Buduje rekord wyniku z wyniku silnika (mecz gracza). */
export function leagueRecordFromEngineResult(fixture, engineResult, playedByPlayer = true) {
  const winner =
    engineResult.homeScore > engineResult.awayScore
      ? fixture.homeTeamId
      : fixture.awayTeamId

  const injuriesFromEvents = (engineResult.events ?? [])
    .filter((e) => e?.type === 'injury')
    .map((e) => ({
      playerId: e.playerId,
      name: e.playerName,
      daysRemaining: e.daysRemaining,
      label: e.label,
      source: 'match',
      teamId:
        e.teamId === 'home'
          ? fixture.homeTeamId
          : e.teamId === 'away'
            ? fixture.awayTeamId
            : e.teamId ?? null,
    }))

  const rawMatchStats =
    engineResult.matchStats ??
    (engineResult.events?.length ? buildMatchStatsFromEvents(engineResult.events) : null)

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore: engineResult.homeScore,
    awayScore: engineResult.awayScore,
    winner,
    boxScore: engineResult.boxScore,
    matchStats: compactMatchStats(rawMatchStats),
    linePoints: summarizeLineStartPoints(engineResult.events),
    playedByPlayer,
    competition: fixture.competition ?? 'league',
    injuries: engineResult.injuries?.length
      ? engineResult.injuries
      : injuriesFromEvents,
  }
}

export function canFinishRound(league) {
  const playerFix = fixturesForPlayerRound(league)
  const playerDone = !playerFix || playerFix.status === 'completed'
  const othersPending = pendingFixturesInRound(league).some((f) => f.status !== 'completed')
  return playerDone && othersPending
}

function fixturesForPlayerRound(league) {
  return league.fixtures.find(
    (f) =>
      f.round === league.currentRound &&
      (f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId),
  )
}

/** Mecz gracza — pełny silnik (zachowane dla rozgrywki interaktywnej). */
export function simulatePlayerFixtureMatch(league, fixture, tactics = {}) {
  const home = resolveTeam(league, fixture.homeTeamId)
  const away = resolveTeam(league, fixture.awayTeamId)

  const homeTactics = tactics.homeTactics ?? tacticsForResolvedTeam(home, league)
  const awayTactics = tactics.awayTactics ?? tacticsForResolvedTeam(away, league)

  return simulateMatch({
    homeTeam: { ...teamForMatchEngine(home), tactics: homeTactics },
    awayTeam: { ...teamForMatchEngine(away), tactics: awayTactics },
    homeTactics,
    awayTactics,
    seed: fixtureSeed(league, fixture.id),
    rotateHome: true,
  })
}
