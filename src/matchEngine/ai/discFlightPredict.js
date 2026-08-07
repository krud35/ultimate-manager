/** Predykcja punktu chwytu / przechwytu dysku w locie. */

import { clampFieldX, clampFieldY } from '../fieldDimensions.js'

const DEFAULT_FLIGHT_SPEED_MPS = 10
const MIN_CUT_SPEED_MPS = 4.5

function isCuttingState(state) {
  return state === 'ACTIVE_CUT' || state === 'INITIATING_CUT'
}

/**
 * Punkt, w który thrower rzuca: lead wzdłuż cutu (B), nie bieżąca pozycja (A).
 * Stojący / dump — lekki lead z prędkości; cutter — punkt osiągalny na drodze do targetu.
 */
export function predictReceiverCatchPoint(
  recvAgent,
  fromX,
  fromY,
  flightSpeedMps = DEFAULT_FLIGHT_SPEED_MPS,
) {
  if (!recvAgent) {
    return { x: (fromX ?? 0) + 8, y: fromY ?? 0 }
  }

  const curX = recvAgent.x ?? fromX ?? 0
  const curY = recvAgent.y ?? fromY ?? 0
  const tgtX = recvAgent.targetX ?? curX
  const tgtY = recvAgent.targetY ?? curY
  const vx = recvAgent.vx ?? 0
  const vy = recvAgent.vy ?? 0
  const cutting = isCuttingState(recvAgent.state)

  if (!cutting) {
    const speed = Math.hypot(vx, vy)
    if (speed < 0.4) return { x: curX, y: curY }
    const dist = Math.hypot(curX - fromX, curY - fromY)
    const flightSec = Math.max(0.25, dist / Math.max(1, flightSpeedMps))
    return {
      x: clampFieldX(curX + vx * flightSec * 0.55),
      y: clampFieldY(curY + vy * flightSec * 0.55),
    }
  }

  const toTarget = Math.hypot(tgtX - curX, tgtY - curY)
  if (toTarget < 0.75) return { x: curX, y: curY }

  // Lead w kierunku B: dysk leci tam, gdzie odbiorca dotrze w czasie lotu (max = target).
  const pathDist = Math.hypot(tgtX - fromX, tgtY - fromY)
  const flightSec = Math.max(0.3, pathDist / Math.max(1, flightSpeedMps))
  const recvSpeed = Math.max(Math.hypot(vx, vy), MIN_CUT_SPEED_MPS)
  const reach = Math.min(toTarget, recvSpeed * flightSec)
  const ux = (tgtX - curX) / toTarget
  const uy = (tgtY - curY) / toTarget
  return {
    x: clampFieldX(curX + ux * reach),
    y: clampFieldY(curY + uy * reach),
  }
}

export function predictCatchPointOnPath(samplePathAt, pathPoints, u, totalFlightMs, msElapsed) {
  if (!pathPoints?.length || !samplePathAt) {
    return { x: 0, y: 0 }
  }
  const timeToEnd = Math.max(0, totalFlightMs - msElapsed)
  const leadMs = Math.min(160, Math.max(35, timeToEnd * 0.42))
  const uLead = totalFlightMs > 0 ? Math.min(1, u + leadMs / totalFlightMs) : 1
  return samplePathAt(pathPoints, uLead)
}

export function discPathVelocityMps(samplePathAt, pathPoints, u, totalFlightMs) {
  if (totalFlightMs <= 0) return 0
  const eps = Math.min(0.04, 20 / totalFlightMs)
  const u0 = Math.max(0, u - eps)
  const u1 = Math.min(1, u + eps)
  const p0 = samplePathAt(pathPoints, u0)
  const p1 = samplePathAt(pathPoints, u1)
  const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const dtSec = ((u1 - u0) * totalFlightMs) / 1000
  return dtSec > 1e-6 ? dist / dtSec : 0
}
