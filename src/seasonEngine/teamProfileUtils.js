import { MATCH_CONFIG } from '../matchEngine/config.js'
import { getOverallRating } from '../data/mockPlayers.js'
import { resolveTeamRatings } from './teamRatings.js'
import { seasonStatsForPlayer } from '../league/leagueStats.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

export function pickBestSeven(players) {
  return [...(players ?? [])]
    .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
    .slice(0, LINE_SIZE)
}

export function teamOffenseDefenseRatings(team) {
  const { attack, defense } = resolveTeamRatings(team)
  return {
    offense: Math.round(attack),
    defense: Math.round(defense),
  }
}

export function matchesForTeam(seasonState, teamId) {
  const list = seasonState.schedule ?? seasonState.matches ?? []
  return list
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => a.week - b.week)
}

export function playerSeasonLine(seasonState, player) {
  const s = seasonStatsForPlayer(seasonState.leaguePlayerStats, player)
  const gp = seasonState.leaguePlayerStats?.[player.id]?.games ?? 0
  return { ...s, games: gp }
}

export function playerStamina(player) {
  const v = player?.currentStamina
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  return 100
}

export function matchResultForTeam(match, teamId) {
  if (match.status !== 'COMPLETED' && match.status !== 'completed') {
    return { type: 'upcoming' }
  }
  const isHome = match.homeTeamId === teamId
  const us = isHome ? match.homeScore : match.awayScore
  const them = isHome ? match.awayScore : match.homeScore
  if (us == null || them == null) return { type: 'upcoming' }
  if (us > them) return { type: 'win', us, them }
  if (us < them) return { type: 'loss', us, them }
  return { type: 'draw', us, them }
}
