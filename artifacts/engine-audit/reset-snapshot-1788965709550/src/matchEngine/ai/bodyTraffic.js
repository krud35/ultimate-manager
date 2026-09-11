import { playerBody } from '../../models/playerBody.js'
import { FIELD_DIMENSIONS } from '../fieldDimensions.js'

export const BODY_TRAFFIC_CALIBRATION = { enabled: true, planning: true, offBall: true, clearanceM: 0.12, lookAheadSec: 0.5 }

/** Steer around occupied ground space. Returns a movement request, never moves
 * bodies, enlarges reach or awards a contact. Both teams read the same snapshot. */
export function bodyAwareTarget(agent, target, others, requestedSpeed, planning = false) {
  if (!BODY_TRAFFIC_CALIBRATION.enabled || agent.diving) return { ...target, speed: requestedSpeed }
  const dx = target.x - agent.x, dy = target.y - agent.y, distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return { ...target, speed: requestedSpeed }
  const ux = dx / distance, uy = dy / distance
  const myRadius = playerBody(agent.player ?? agent).shoulderWidthM / 2
  // When the original target is inside, do not invent an out-of-bounds detour.
  // Genuine targets outside remain possible for returning discs.
  const footInset = myRadius * 0.6 + 0.02
  const safe = candidate => target.x > 0 && target.x < FIELD_DIMENSIONS.lengthM
    && target.y > 0 && target.y < FIELD_DIMENSIONS.widthM
    ? { ...candidate, x: Math.max(footInset, Math.min(FIELD_DIMENSIONS.lengthM - footInset, candidate.x)),
      y: Math.max(footInset, Math.min(FIELD_DIMENSIONS.widthM - footInset, candidate.y)) } : candidate
  let nearest = null
  for (const other of others ?? []) {
    if (other.id === agent.id || Math.abs((other.z ?? 0) - (agent.z ?? 0)) > 1.5) continue
    const radius = myRadius + playerBody(other.player ?? other).shoulderWidthM / 2 + BODY_TRAFFIC_CALIBRATION.clearanceM
    const ox = other.x - agent.x, oy = other.y - agent.y, gap = Math.hypot(ox, oy)
    const along = ox * ux + oy * uy, across = ox * -uy + oy * ux
    const occupiesTarget = Math.hypot(other.x - target.x, other.y - target.y) < radius
      && gap > 0.01 && Math.hypot(other.x - target.x, other.y - target.y) + 0.05 < distance
    const inCorridor = along > 0 && along < (planning ? distance : Math.min(distance, Math.max(1, requestedSpeed * BODY_TRAFFIC_CALIBRATION.lookAheadSec + radius)))
      && Math.abs(across) < radius
    if ((!occupiesTarget && !inCorridor) || (nearest && gap >= nearest.gap)) continue
    nearest = { other, radius, gap, across, occupiesTarget }
  }
  if (!nearest) return { ...target, speed: requestedSpeed }
  const { other, radius, gap, across, occupiesTarget } = nearest
  if (occupiesTarget) {
    // The player already nearer the landing spot owns that space. Approach its
    // edge instead of placing both centres at the same intercept coordinate.
    return safe({ ...target, x: other.x + (agent.x - other.x) / gap * radius,
      y: other.y + (agent.y - other.y) / gap * radius,
      speed: Math.min(requestedSpeed, Math.max(0, gap - radius) / 0.25), avoidedId: other.id, avoidanceKind: 'support' })
  }
  const side = across >= 0 ? -1 : 1
  return safe({ ...target, x: other.x - uy * radius * side, y: other.y + ux * radius * side,
    speed: Math.min(requestedSpeed, Math.max(0.2, requestedSpeed * Math.min(1, gap / (radius * 2)))), avoidedId: other.id, avoidanceKind: 'detour' })
}
