/**
 * Statystyki sezonu regularnego UFA 2025 — Seattle Cascades & Boston Glory.
 * Pozostałe drużyny ligi: src/data/ufa2025LeagueRosters.js (ten sam katalog UFA Stats).
 * Źródło: https://watchufa.com/stats/player-stats?year=2025
 * Surowe dane: ufa2025Rosters.raw.js. Atrybuty normalizowane na tle całej ligi
 * (UFA_2025_LEAGUE_STAT_MAX), tak samo jak w realnym starcie kariery (seasonLeagueBuilder.js).
 */
import { buildTeamRoster } from './playerStatsFromUfa.js'
import { UFA_2025_LEAGUE_STAT_MAX } from './ufa2025LeagueStatMax.js'
import { SEATTLE_RAW, BOSTON_RAW } from './ufa2025Rosters.raw.js'

const ROSTER_OPTIONS = {
  mode: 'historical',
  balance: false,
  statMax: UFA_2025_LEAGUE_STAT_MAX,
}

export const seattleCascades2025 = buildTeamRoster(
  'Seattle Cascades',
  SEATTLE_RAW,
  1001,
  ROSTER_OPTIONS,
)

export const bostonGlory2025 = buildTeamRoster(
  'Boston Glory',
  BOSTON_RAW,
  2001,
  ROSTER_OPTIONS,
)

/** Pełna pula zawodników obu drużyn (widok Skład). */
export const mockPlayers = [...seattleCascades2025, ...bostonGlory2025]

export function getPlayerFullName(player) {
  return `${player.firstName} ${player.lastName}`
}

export { getOverallRating } from '../models/playerStats.js'
