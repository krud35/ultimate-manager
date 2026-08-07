/**
 * Archiwum sezonu + all-time — bez pełnej historii meczów (oszczędność pamięci).
 */

import { standingsTable } from '../league/standings.js'

function emptyTeamRow(teamId) {
  return {
    teamId,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    cupWins: 0,
    seasons: 0,
  }
}

export function createAllTimeStats() {
  return {
    players: {},
    teams: {},
  }
}

export function mergePlayerIntoAllTime(allTimePlayers, row) {
  if (!row?.playerId) return
  const id = row.playerId
  const existing = allTimePlayers[id]
  if (!existing) {
    allTimePlayers[id] = {
      playerId: id,
      firstName: row.firstName,
      lastName: row.lastName,
      teamId: row.teamId,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      blocks: row.blocks ?? 0,
      turnovers: row.turnovers ?? 0,
      games: row.games ?? 0,
      pointsPlayed: row.pointsPlayed ?? 0,
      seasons: 1,
    }
    return
  }
  existing.goals += row.goals ?? 0
  existing.assists += row.assists ?? 0
  existing.blocks += row.blocks ?? 0
  existing.turnovers += row.turnovers ?? 0
  existing.games += row.games ?? 0
  existing.pointsPlayed += row.pointsPlayed ?? 0
  existing.seasons = (existing.seasons ?? 0) + 1
  if (row.teamId) existing.teamId = row.teamId
  if (row.firstName) existing.firstName = row.firstName
  if (row.lastName) existing.lastName = row.lastName
}

export function mergeTeamIntoAllTime(allTimeTeams, standing, extras = {}) {
  if (!standing?.teamId) return
  const id = standing.teamId
  const existing = allTimeTeams[id] ?? emptyTeamRow(id)
  existing.wins += standing.wins ?? 0
  existing.losses += standing.losses ?? 0
  existing.pointsFor += standing.pointsFor ?? 0
  existing.pointsAgainst += standing.pointsAgainst ?? 0
  existing.seasons += 1
  if (extras.cupWin) existing.cupWins += 1
  allTimeTeams[id] = existing
}

/** Lekki snapshot standings (bez zbędnych pól). */
export function compactStandings(standings) {
  const out = {}
  for (const [id, row] of Object.entries(standings ?? {})) {
    out[id] = {
      teamId: id,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      pointsFor: row.pointsFor ?? 0,
      pointsAgainst: row.pointsAgainst ?? 0,
    }
  }
  return out
}

/** Statystyki zawodników bez ciężkich pól — kopia płytka wystarczy. */
export function compactPlayerStats(playerStats) {
  const out = {}
  for (const [id, row] of Object.entries(playerStats ?? {})) {
    out[id] = {
      playerId: row.playerId ?? id,
      firstName: row.firstName,
      lastName: row.lastName,
      teamId: row.teamId,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      blocks: row.blocks ?? 0,
      turnovers: row.turnovers ?? 0,
      games: row.games ?? 0,
      pointsPlayed: row.pointsPlayed ?? 0,
    }
  }
  return out
}

/**
 * Buduje archiwum sezonu + aktualizuje all-time.
 * Nie przechowuje matchHistory / box score poszczególnych meczów.
 */
export function buildSeasonArchiveRecord(career, nameById) {
  const league = career.league
  const table = standingsTable(league.standings, (id) => nameById?.(id) ?? id)
  const place = table.findIndex((r) => r.teamId === career.playerTeamId) + 1
  const standing = league.standings[career.playerTeamId] ?? {
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }

  const fallTable = league.fallStandingsOrder ?? null
  const cupChampionId = league.cup?.championTeamId ?? league.cup?.championId ?? null

  return {
    seasonYear: career.seasonYear,
    seasonLabel: league.seasonLabel,
    seasonIndex: career.seasonIndex,
    playerTeamId: career.playerTeamId,
    finalPlace: place || null,
    wins: standing.wins,
    losses: standing.losses,
    pointsFor: standing.pointsFor,
    pointsAgainst: standing.pointsAgainst,
    cupChampionId,
    cupWinner: cupChampionId === career.playerTeamId,
    fallStandingsOrder: fallTable,
    /** Pełna tabela sezonu (skompresowana). */
    teamStats: compactStandings(league.standings),
    /** Statystyki zawodników tego sezonu (liga). */
    playerStats: compactPlayerStats(league.playerStats),
    /** Statystyki zawodników tylko z Pucharu Ligi. */
    cupPlayerStats: compactPlayerStats(league.cupPlayerStats),
    completedAt: new Date().toISOString(),
  }
}

export function applyArchiveToAllTime(allTime, archive) {
  const next = {
    players: { ...(allTime?.players ?? {}) },
    teams: { ...(allTime?.teams ?? {}) },
  }
  for (const row of Object.values(archive.playerStats ?? {})) {
    mergePlayerIntoAllTime(next.players, row)
  }
  for (const row of Object.values(archive.teamStats ?? {})) {
    mergeTeamIntoAllTime(next.teams, row, {
      cupWin: archive.cupChampionId === row.teamId,
    })
  }
  return next
}

/**
 * Czyści ciężkie dane z ligi przed nowym sezonem / po archiwizacji.
 * Zachowuje world/teamsById (referencje zewnętrzne).
 */
export function pruneLeagueMemory(league) {
  if (!league) return league
  league.matchHistory = []
  // Fixtures completed season — drop heavy fields if any
  if (Array.isArray(league.fixtures)) {
    for (const f of league.fixtures) {
      delete f.boxScore
      delete f.events
    }
  }
  return league
}
