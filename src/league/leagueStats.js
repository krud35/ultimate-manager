/** Kumulatywne statystyki zawodników w całej lidze. */

import { ensurePlayerStats } from '../models/playerStats.js'

export function createLeaguePlayerStats() {
  return {}
}

export function ensurePlayerRow(stats, player, teamId) {
  if (stats[player.id]) return stats[player.id]
  stats[player.id] = {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    teamId,
    goals: 0,
    assists: 0,
    blocks: 0,
    turnovers: 0,
    games: 0,
    pointsPlayed: 0,
    attempts: 0,
    completions: 0,
    throwMeters: 0,
    catches: 0,
    catchMeters: 0,
    runMeters: 0,
  }
  return stats[player.id]
}

export function mergeMatchBoxScore(leagueStats, boxScoreRows, homeTeamId, awayTeamId) {
  const seenThisMatch = new Set()

  for (const row of boxScoreRows) {
    const teamId =
      row.teamId === 'home'
        ? homeTeamId
        : row.teamId === 'away'
          ? awayTeamId
          : row.teamId
    if (!teamId) continue

    const existing = leagueStats[row.playerId]
    if (!existing) {
      leagueStats[row.playerId] = {
        playerId: row.playerId,
        firstName: row.firstName,
        lastName: row.lastName,
        teamId,
        goals: row.goals ?? 0,
        assists: row.assists ?? 0,
        blocks: row.blocks ?? 0,
        turnovers: row.turnovers ?? 0,
        games: 1,
        pointsPlayed: row.pointsPlayed ?? 0,
        attempts: row.attempts ?? 0,
        completions: row.completions ?? 0,
        throwMeters: row.throwMeters ?? 0,
        catches: row.catches ?? 0,
        catchMeters: row.catchMeters ?? 0,
        runMeters: row.runMeters ?? 0,
      }
      seenThisMatch.add(row.playerId)
    } else {
      existing.goals += row.goals ?? 0
      existing.assists += row.assists ?? 0
      existing.blocks += row.blocks ?? 0
      existing.turnovers += row.turnovers ?? 0
      existing.pointsPlayed = (existing.pointsPlayed ?? 0) + (row.pointsPlayed ?? 0)
      existing.attempts = (existing.attempts ?? 0) + (row.attempts ?? 0)
      existing.completions = (existing.completions ?? 0) + (row.completions ?? 0)
      existing.throwMeters = (existing.throwMeters ?? 0) + (row.throwMeters ?? 0)
      existing.catches = (existing.catches ?? 0) + (row.catches ?? 0)
      existing.catchMeters = (existing.catchMeters ?? 0) + (row.catchMeters ?? 0)
      existing.runMeters = (existing.runMeters ?? 0) + (row.runMeters ?? 0)
      if (!seenThisMatch.has(row.playerId)) {
        existing.games += 1
        seenThisMatch.add(row.playerId)
      }
    }
  }
}

export function topLeaders(leagueStats, metric, limit = 10) {
  const rows = Object.values(leagueStats)
  const key = metric
  return rows
    .filter((r) => (r[key] ?? 0) > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, limit)
}

/** +/- = gole + asysty + bloki - straty. */
export function plusMinusForRow(row) {
  return (row?.goals ?? 0) + (row?.assists ?? 0) + (row?.blocks ?? 0) - (row?.turnovers ?? 0)
}

export function topPlusMinusLeaders(leagueStats, limit = 10) {
  return Object.values(leagueStats)
    .map((r) => ({ ...r, plusMinus: plusMinusForRow(r) }))
    .filter((r) => r.plusMinus > 0)
    .sort((a, b) => b.plusMinus - a.plusMinus)
    .slice(0, limit)
}

export function snapshotRosterStats(players) {
  const snap = new Map()
  for (const player of players ?? []) {
    ensurePlayerStats(player)
    snap.set(player.id, {
      goals: player.stats.goals,
      assists: player.stats.assists,
      blocks: player.stats.blocks,
      pointsPlayed: player.stats.pointsPlayed,
    })
  }
  return snap
}

/** Wiersze box score z przyrostów `player.stats` po meczu tła. */
export function buildBoxScoreRowsFromStatDelta(beforeSnap, homePlayers, awayPlayers) {
  const rows = []
  const pushSide = (players, teamSide) => {
    for (const player of players ?? []) {
      ensurePlayerStats(player)
      const before = beforeSnap.get(player.id)
      const row = {
        playerId: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        teamId: teamSide,
        goals: player.stats.goals - (before?.goals ?? 0),
        assists: player.stats.assists - (before?.assists ?? 0),
        blocks: player.stats.blocks - (before?.blocks ?? 0),
        pointsPlayed: player.stats.pointsPlayed - (before?.pointsPlayed ?? 0),
        turnovers: 0,
      }
      if (row.goals || row.assists || row.blocks || row.pointsPlayed) {
        rows.push(row)
      }
    }
  }
  pushSide(homePlayers, 'home')
  pushSide(awayPlayers, 'away')
  return rows
}

/**
 * Statystyki bieżącego sezonu gry (G/A/B/PP/+-/...) — jedno spójne źródło.
 *
 * `row` (leaguePlayerStats) to TYLKO liga, `player.stats` to liga+puchar razem
 * (patrz applyEngineBoxScoreToRoster w leagueEngine.js — działa dla każdego meczu,
 * kiedy `row` dotyczy wyłącznie meczów ligowych). Wcześniej każde pole było
 * coalesce'owane osobno (bierz wyższą z dwóch wartości) — dla pojedynczych liczb to
 * nieszkodliwe, ale dla pochodnych metryk jak +/- czy % celności miesza się wtedy
 * liga-only z liga+puchar pole po polu i wynik nie zgadza się z tabelą liderów
 * (która liczy +/- wyłącznie z `row`). Bierzemy więc jedno źródło w całości.
 */
export function seasonStatsForPlayer(leaguePlayerStats, player) {
  const pointsPlayedMatch = player?.stats?.pointsPlayedMatch ?? 0
  const row = leaguePlayerStats?.[player?.id]
  const stats = player?.stats
  const local = player?.seasonStats
  const source = row ?? stats ?? local ?? {}

  const goals = source.goals ?? 0
  const assists = source.assists ?? 0
  const blocks = source.blocks ?? 0
  const turnovers = source.turnovers ?? 0
  const attempts = source.attempts ?? 0
  const completions = source.completions ?? 0
  const throwMeters = source.throwMeters ?? 0
  const catches = source.catches ?? 0
  const catchMeters = source.catchMeters ?? 0
  const runMeters = source.runMeters ?? 0

  return {
    goals,
    assists,
    blocks,
    turnovers,
    plusMinus: goals + assists + blocks - turnovers,
    pointsPlayed: source.pointsPlayed ?? 0,
    pointsPlayedMatch,
    attempts,
    completions,
    completionPct: attempts > 0 ? (completions / attempts) * 100 : null,
    throwMeters,
    avgThrowMetersPerAttempt: completions > 0 ? throwMeters / completions : null,
    catches,
    catchMeters,
    avgCatchMetersPerCatch: catches > 0 ? catchMeters / catches : null,
    runMeters,
    runKm: runMeters / 1000,
  }
}
