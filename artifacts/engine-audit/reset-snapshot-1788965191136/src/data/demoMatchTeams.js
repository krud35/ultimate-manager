import { bostonGlory2025, seattleCascades2025 } from './ufa2025Rosters.js'
import { playerTeam, teamById, teamForMatchEngine } from './ufaLeagueTeams.js'

export const demoHomeTeam = teamForMatchEngine(playerTeam())

export const demoAwayTeam = teamForMatchEngine(teamById('boston-glory'))

export { seattleCascades2025, bostonGlory2025 }
