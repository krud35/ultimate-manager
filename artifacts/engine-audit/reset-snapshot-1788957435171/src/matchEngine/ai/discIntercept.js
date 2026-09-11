import { playerMatchMods } from '../playerModsRegistry.js'
import { MAX_ACCEL_MPS2, mobilityMultiplier, maxTurnRadForSpeed } from './playerMovement.js'
import { horizontalReachM, standingReachM, jumpHeightM, subStat, movementFatigueMult } from './statFormulas.js'
import { plannedCatchSupport } from './catchRules.js'
import { bodyAwareTarget, BODY_TRAFFIC_CALIBRATION } from './bodyTraffic.js'

/** Przybliżony czas dobiegu, z rozpędzaniem i kosztem zmiany kierunku.
 * To ocena możliwości, a nie zastępstwo integratora ruchu i detekcji kontaktu.
 */
export function interceptTravelSec(agent, point, speed, acceleration, reach = 0, turnRate = 5.2) {
  const dx = point.x - agent.x, dy = point.y - agent.y
  const distance = Math.hypot(dx, dy)
  if (distance <= reach) return 0
  const vx = agent.vx ?? 0, vy = agent.vy ?? 0
  const current = Math.hypot(vx, vy)
  const cosine = current > 0.05 ? Math.max(-1, Math.min(1, (vx * dx + vy * dy) / (current * distance))) : 1
  const angle = Math.acos(cosine)
  const turnSec = current > 0.05 ? angle / Math.max(0.1, turnRate) : 0
  const initial = Math.min(speed, Math.max(0, current * cosine))
  const accel = Math.max(0.1, acceleration), top = Math.max(0.1, speed)
  const rampSec = (top - initial) / accel
  const rampDistance = initial * rampSec + 0.5 * accel * rampSec * rampSec
  const needed = distance - reach
  const runSec = needed <= rampDistance
    ? (Math.sqrt(initial * initial + 2 * accel * needed) - initial) / accel
    : rampSec + (needed - rampDistance) / top
  return turnSec + runSec
}

export function playerTravelSec(agent, point, player, role, speed, reach = 0) {
  const acceleration = MAX_ACCEL_MPS2 * (0.65 + subStat(player, 'physical', 'acceleration') / 100 * 0.45)
    * movementFatigueMult(player)
  const turnRate = maxTurnRadForSpeed(Math.hypot(agent.vx ?? 0, agent.vy ?? 0), 1) * mobilityMultiplier(player, role)
  return interceptTravelSec(agent, point, speed, acceleration, reach, turnRate)
}

/** Najwcześniejszy osiągalny punkt widzianego toru. Brak możliwości kontaktu
 * daje najlepszą próbę dobiegu, a nie przyznany chwyt ani zwiększony zasięg.
 */
export function selectDiscIntercept({ agent, player, role, speed, elapsedMs, totalMs, sample, blockers = [] }) {
  const mobility = mobilityMultiplier(player, role)
  const acceleration = MAX_ACCEL_MPS2 * (0.65 + subStat(player, 'physical', 'acceleration') / 100 * 0.45) * movementFatigueMult(player)
  const turnRate = maxTurnRadForSpeed(Math.hypot(agent.vx ?? 0, agent.vy ?? 0), 1) * mobility
  const standing = standingReachM(player)
  const attackHigh = role === 'offense' && playerMatchMods(player).highDiscAttack
  const jump = attackHigh ? jumpHeightM(player) * (0.5 + subStat(player, 'offensive', 'cutTiming') / 200) : 0
  const height = standing + jump
  const jumpTime = jump ? Math.sqrt(2 * jump / 9.81) : 0
  const sideReach = horizontalReachM(player)
  let best = null
  for (let ms = Math.min(totalMs, elapsedMs + 20); ; ms = Math.min(totalMs, ms + 40)) {
    const point = sample(ms)
    if ((point.z ?? 0) <= 0) {
      if (best) break
      return { ...point, atMs: ms, travelSec: Infinity, reachable: false, legal: false, lateness: 3 }
    }
    // Zasięg na stojąco: nie zakładamy automatycznego, idealnie wykonanego skoku.
    const relativeZ = (point.z ?? 0) / (height / 2) - 1
    const reach = Math.abs(relativeZ) <= 1 ? sideReach * Math.sqrt(1 - relativeZ * relativeZ) : 0
    let support = role === 'offense' ? plannedCatchSupport(agent, point, reach * 0.7)
      : { x: point.x, y: point.y, legal: true, reachRemaining: reach * 0.7 }
    const route = BODY_TRAFFIC_CALIBRATION.planning
      ? bodyAwareTarget(agent, support, blockers, speed, true) : null
    let detourSec = 0
    if (route?.avoidanceKind === 'support') {
      const extension = Math.hypot(route.x - point.x, route.y - point.y)
      support = { ...support, x: route.x, y: route.y, reachRemaining: Math.max(0, reach * 0.7 - extension),
        legal: support.legal && extension <= reach * 0.7 }
    } else if (route?.avoidanceKind === 'detour') {
      const first = Math.hypot(route.x - agent.x, route.y - agent.y)
      const second = Math.hypot(support.x - route.x, support.y - route.y)
      const direct = Math.hypot(support.x - agent.x, support.y - agent.y)
      const cosine = first > 0 && second > 0 ? ((route.x - agent.x) * (support.x - route.x)
        + (route.y - agent.y) * (support.y - route.y)) / (first * second) : 1
      detourSec = Math.max(0, first + second - direct) / Math.max(0.1, speed)
        + Math.acos(Math.max(-1, Math.min(1, cosine))) / Math.max(0.1, turnRate)
    }
    const travelSec = interceptTravelSec(agent, support, speed, acceleration, support.reachRemaining, turnRate) + detourSec
    const availableSec = Math.max(0, (ms - elapsedMs) / 1000 - ((point.z ?? 0) > standing ? jumpTime : 0))
    const heightPenalty = Math.max(0, (point.z ?? 0) - height)
    const lateness = travelSec - availableSec + heightPenalty
    const candidate = { x: support.x, y: support.y, z: point.z, atMs: ms, travelSec,
      discPoint: point, support, legal: support.legal, detourSec, avoidedId: route?.avoidedId ?? null,
      reachable: support.legal && heightPenalty === 0 && travelSec <= availableSec, lateness }
    if (candidate.reachable) return candidate
    if (!best || (candidate.legal && !best.legal)
      || (candidate.legal === best.legal && lateness < best.lateness)) best = candidate
    if (ms >= totalMs) break
  }
  return best
}
