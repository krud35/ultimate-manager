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
      }
      seenThisMatch.add(row.playerId)
    } else {
      existing.goals += row.goals ?? 0
      existing.assists += row.assists ?? 0
      existing.blocks += row.blocks ?? 0
      existing.turnovers += row.turnovers ?? 0
      existing.pointsPlayed = (existing.pointsPlayed ?? 0) + (row.pointsPlayed ?? 0)
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

  return {
    goals: coalesceStat(row?.goals, stats?.goals, local?.goals),
    assists: coalesceStat(row?.assists, stats?.assists, local?.assists),
    blocks: coalesceStat(row?.blocks, stats?.blocks, local?.blocks),
    pointsPlayed: coalesceStat(row?.pointsPlayed, stats?.pointsPlayed, local?.pointsPlayed),
    pointsPlayedMatch,
  }
}
