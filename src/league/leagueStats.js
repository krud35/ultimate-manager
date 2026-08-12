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

function coalesceStat(...values) {
  let best = 0
  for (const value of values) {
    const n = value ?? 0
    if (typeof n === 'number' && n > best) best = n
  }
  return best
}

/** Statystyki bieżącego sezonu gry (G/A/B/PP) — liga + `player.stats` na składzie. */
export function seasonStatsForPlayer(leaguePlayerStats, player) {
  const pointsPlayedMatch = player?.stats?.pointsPlayedMatch ?? 0
  const row = leaguePlayerStats?.[player?.id]
  const local = player?.seasonStats
  const stats = player?.stats

  const goals = coalesceStat(row?.goals, stats?.goals, local?.goals)
  const assists = coalesceStat(row?.assists, stats?.assists, local?.assists)
  const blocks = coalesceStat(row?.blocks, stats?.blocks, local?.blocks)
  const turnovers = coalesceStat(row?.turnovers, stats?.turnovers, local?.turnovers)
  const attempts = coalesceStat(row?.attempts, stats?.attempts, local?.attempts)
  const completions = coalesceStat(row?.completions, stats?.completions, local?.completions)
  const throwMeters = coalesceStat(row?.throwMeters, stats?.throwMeters, local?.throwMeters)
  const catches = coalesceStat(row?.catches, stats?.catches, local?.catches)
  const catchMeters = coalesceStat(row?.catchMeters, stats?.catchMeters, local?.catchMeters)
  const runMeters = coalesceStat(row?.runMeters, stats?.runMeters, local?.runMeters)

  return {
    goals,
    assists,
    blocks,
    turnovers,
    plusMinus: goals + assists + blocks - turnovers,
    pointsPlayed: coalesceStat(row?.pointsPlayed, stats?.pointsPlayed, local?.pointsPlayed),
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
