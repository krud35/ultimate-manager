import { UFA_LEAGUE_TEAMS } from './ufaLeagueTeams.js'

export const mockPlayers = UFA_LEAGUE_TEAMS.flatMap((t) =>
  t.players.map((p) => ({ ...p, team: t.name })),
)

export {
  getPlayerFullName,
  getOverallRating,
  seattleCascades2025,
  bostonGlory2025,
} from './ufa2025Rosters.js'
