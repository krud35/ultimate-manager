import { playerBody } from '../../models/playerBody.js'
import { FIELD_DIMENSIONS } from '../fieldDimensions.js'

export const BODY_TRAFFIC_CALIBRATION = { enabled: true, planning: true, offBall: true, clearanceM: 0.12, lookAheadSec: 0.5 }

/** Geometry shared by candidate targets in ONE decision. Rebuild whenever the
 * agent, obstacles or calibration change; never reuse across movement ticks. */
export function prepareBodyTraffic(agent, others) {
  if (!BODY_TRAFFIC_CALIBRATION.enabled || agent.diving) return null
  const myRadius = playerBody(agent.player ?? agent).shoulderWidthM / 2
  const obstacles = []
  for (const other of others ?? []) {
    if (other.id === agent.id || Math.abs((other.z ?? 0) - (agent.z ?? 0)) > 1.5) continue
    const ox = other.x - agent.x, oy = other.y - agent.y
    obstacles.push({ other, ox, oy, gap: Math.hypot(ox, oy),
      radius: myRadius + playerBody(other.player ?? other).shoulderWidthM / 2 + BODY_TRAFFIC_CALIBRATION.clearanceM })
  }
  return { myRadius, obstacles }
}

/** Steer around occupied ground space. Returns a movement request, never moves
 * bodies, enlarges reach or awards a contact. Both teams read the same snapshot. */
export function bodyAwareTarget(agent, target, others, requestedSpeed, planning = false, traffic = null) {
  if (!BODY_TRAFFIC_CALIBRATION.enabled || agent.diving) return { ...target, speed: requestedSpeed }
  const dx = target.x - agent.x, dy = target.y - agent.y, distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return { ...target, speed: requestedSpeed }
  const ux = dx / distance, uy = dy / distance
  const myRadius = traffic?.myRadius ?? playerBody(agent.player ?? agent).shoulderWidthM / 2
  // When the original target is inside, do not invent an out-of-bounds detour.
  // Genuine targets outside remain possible for returning discs.
  const footInset = myRadius * 0.6 + 0.02
  const safe = candidate => target.x > 0 && target.x < FIELD_DIMENSIONS.lengthM
    && target.y > 0 && target.y < FIELD_DIMENSIONS.widthM
    ? { ...candidate, x: Math.max(footInset, Math.min(FIELD_DIMENSIONS.lengthM - footInset, candidate.x)),
      y: Math.max(footInset, Math.min(FIELD_DIMENSIONS.widthM - footInset, candidate.y)) } : candidate
  let nearest = null
  for (const entry of traffic?.obstacles ?? others ?? []) {
    const other = traffic ? entry.other : entry
    if (!traffic && (other.id === agent.id || Math.abs((other.z ?? 0) - (agent.z ?? 0)) > 1.5)) continue
    const radius = traffic ? entry.radius
      : myRadius + playerBody(other.player ?? other).shoulderWidthM / 2 + BODY_TRAFFIC_CALIBRATION.clearanceM
    const ox = traffic ? entry.ox : other.x - agent.x, oy = traffic ? entry.oy : other.y - agent.y
    const along = ox * ux + oy * uy, across = ox * -uy + oy * ux
    const inCorridor = along > 0 && along < (planning ? distance : Math.min(distance, Math.max(1, requestedSpeed * BODY_TRAFFIC_CALIBRATION.lookAheadSec + radius)))
      && Math.abs(across) < radius
    const tx = other.x - target.x, ty = other.y - target.y
    // Reject distant targets without a square root; keep the original hypot
    // and strict comparisons for all candidates near the occupied space.
    const targetGap = Math.abs(tx) < radius && Math.abs(ty) < radius ? Math.hypot(tx, ty) : Infinity
    const nearTarget = targetGap < radius && targetGap + 0.05 < distance
    if (!nearTarget && !inCorridor) continue
    const gap = traffic ? entry.gap : Math.hypot(ox, oy)
    const occupiesTarget = nearTarget && gap > 0.01
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
