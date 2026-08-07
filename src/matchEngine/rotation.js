import { MATCH_CONFIG } from './config.js'
import { lineupForPoint } from './participants.js'
import {
  clampStamina,
  getStamina,
  getSprintMeters,
  regenBenchStamina,
  residualCostFromSprintMeters,
  resetSprintMeters,
  STAMINA_CONFIG,
  staminaRoleFamily,
} from './stamina.js'
import { findExhaustedInTactics } from './lineups.js'
import { autoRotateTacticsForTeam } from './aiLineup.js'

export { autoRotateTacticsForTeam, tacticsForTeam } from './aiLineup.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

/**
 * Po punkcie: residual 5–20 z metrów sprintu + regen ławki 6–12 (endurance).
 * @param {object} session
 * @param {'home'|'away'} pullTeamBeforePoint
 * @param {unknown} [_staminaBefore] legacy unused — effort z session.stamina.sprintM
 */
export function applyFatigueAfterPoint(
  session,
  pullTeamBeforePoint,
  _staminaBefore = null,
) {
  const attackTeamId = pullTeamBeforePoint === 'home' ? 'away' : 'home'
  const rng = session.rng

  for (const side of ['home', 'away']) {
    const team = session[side]
    const role = side === attackTeamId ? 'offense' : 'defense'
    const onField = lineupForPoint(team, role)
    const onFieldIds = new Set(onField.map((p) => p.id))
    const map = session.stamina[side]
    for (const p of onField) {
      const family = staminaRoleFamily(p, team.tactics)
      const hasTracking = Boolean(session.stamina?.sprintM)
      const sprintM = hasTracking
        ? getSprintMeters(session.stamina, side, p.id)
        : family === 'handler'
          ? STAMINA_CONFIG.bgEstimatedHandlerSprintM *
            (role === 'defense' ? 0.65 : 1)
          : STAMINA_CONFIG.bgEstimatedCutterSprintM *
            (role === 'defense' ? 0.55 : 1)
      const cost = residualCostFromSprintMeters(
        sprintM,
        role,
        p,
        family,
        team.tactics,
      )
      map[p.id] = clampStamina(getStamina(map, p.id) - cost)
    }
    regenBenchStamina(map, team.players, onFieldIds, rng)
  }

  resetSprintMeters(session.stamina)
}

export function findExhaustedInLines(tactics, staminaMap) {
  return findExhaustedInTactics(tactics, staminaMap)
}

export { LINE_SIZE }
