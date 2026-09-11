import { integrateAgentMotion } from './playerMovement.js'
import { subStat } from './statFormulas.js'
import { bodyAwareTarget } from './bodyTraffic.js'

export const ARRIVAL_CALIBRATION = { kinematics: true, observationRisk: true, horizonSec: 0.8 }

// A movement request, not an instantaneous speed change. Braking and turning
// remain the integrator's responsibility; catching does not require stopping.
export function arrivalSpeed(agent, target, _player, speed, seconds, lead = 0.15, buffer = 0.08) {
  const distance = Math.max(0, Math.hypot(target.x - agent.x, target.y - agent.y) - buffer)
  return Math.min(speed, distance / Math.max(0.08, seconds - lead))
}

// Only the imminent contact window is integrated; distant route estimates stay
// analytical. Carries velocity through the same steering/braking as live motion.
export function arrivalWindowGap(agent, target, player, role, speed, seconds, reach, blockers = []) {
  let projected = { ...agent, player }
  let elapsed = 0
  while (elapsed < seconds - 1e-9) {
    const dt = Math.min(0.02, seconds - elapsed)
    const requested = arrivalSpeed(projected, target, player, speed, seconds - elapsed)
    const steer = bodyAwareTarget(projected, target, blockers, requested)
    projected = { ...projected, ...integrateAgentMotion(projected, steer.x, steer.y, speed, dt, true, role, steer.speed) }
    elapsed += dt
  }
  return Math.hypot(projected.x - target.x, projected.y - target.y) - reach
}

export function observationUncertaintyM(agent, thrower) {
  const age = Math.max(0, agent.observationAgeMs ?? 0) / 1000
  const prediction = subStat(thrower, 'mental', 'anticipation') / 100
  return Math.min(4, age * (0.5 + Math.hypot(agent.vx ?? 0, agent.vy ?? 0)) * (1 - prediction * 0.5))
}
