import { discAirAcceleration, stepFreeDisc } from './discAerodynamics.js'
import { discHeightAtSec, solveDragPacing, sampleDragPaceU } from './discPhysics.js'
import { normalizeWind } from '../wind.js'
import { discAttitude } from './discAttitude.js'

/** Wspólny, lekki model toru dla wyboru i wykonania. Parametry opisują plan,
 * nie wynik rzutu. To model kinematyczny, nie pełna aerodynamika dysku.
 */
export function createDiscTrajectory({ fromX, fromY, toX, toY, totalFlightMs,
  startHeightM, peakHeightM, endHeightM, amplitudeM = 0, curveSign = 1, spinRadSec = 50, wind = null }) {
  const dx = toX - fromX, dy = toY - fromY
  const pathLenM = Math.hypot(dx, dy)
  const totalMs = Math.max(80, totalFlightMs)
  const weather = normalizeWind(wind)
  const rad = weather.directionDeg * Math.PI / 180
  const result = { fromX, fromY, toX, toY, totalMs, startHeightM, peakHeightM, endHeightM,
    amplitudeM, curveSign, spinRadSec, pathLenM, perpX: -dy / (pathLenM || 1), perpY: dx / (pathLenM || 1),
    pacing: solveDragPacing({ totalFlightMs: totalMs, pathLenM }),
    windX: Math.cos(rad) * weather.speedMps, windY: Math.sin(rad) * weather.speedMps }
  const length = pathLenM || 1
  result.normal = { x: -dx / length * Math.sin(0.12), y: -dy / length * Math.sin(0.12), z: Math.cos(0.12) }
  const velocity = { x: dx / (totalMs / 1000), y: dy / (totalMs / 1000), z: 0 }
  const calm = discAirAcceleration(velocity, {}, result.normal)
  const windy = discAirAcceleration(velocity, { x: result.windX, y: result.windY }, result.normal)
  result.windAcceleration = { x: windy.x - calm.x, y: windy.y - calm.y, z: windy.z - calm.z }
  return result
}

/** Przybliżona odpowiedź na wiatr z czasem narastania i różnicą sił nośnych/oporu.
 * Zależy od względnej prędkości powietrza; obrót osi boiska nie zmienia wielkości efektu.
 * Współczynniki wymagają osobnej kalibracji, nie są pomiarem aerodynamicznym.
 */
export function trajectoryWindOffset(plan, ms) {
  const t = Math.max(0, ms / 1000)
  const responseSec = t - 1.5 * (1 - Math.exp(-t / 1.5))
  // Zredukowana odpowiedź wokół planu bezwietrznego: różnica sił, z tłumieniem.
  const scale = 0.12 * 1.5 * responseSec
  return { dx: plan.windAcceleration.x * scale, dy: plan.windAcceleration.y * scale,
    dz: plan.windAcceleration.z * scale }

}

export function sampleDiscTrajectory(plan, elapsedMs) {
  const ms = Math.max(0, Math.min(plan.totalMs, elapsedMs))
  const t = ms / plan.totalMs
  const u = sampleDragPaceU(plan.pacing, ms / 1000, plan.totalMs / 1000, plan.pathLenM)
    ?? (1 - (1 - t) ** 1.8)
  const lateral = plan.curveSign * plan.amplitudeM * Math.sin(2 * Math.PI * t)
  const drift = trajectoryWindOffset(plan, ms)
  return { x: plan.fromX + (plan.toX - plan.fromX) * u + plan.perpX * lateral + drift.dx,
    y: plan.fromY + (plan.toY - plan.fromY) * u + plan.perpY * lateral + drift.dy,
    z: Math.max(0, drift.dz + discHeightAtSec(ms / 1000, { totalSec: plan.totalMs / 1000,
      startHeightM: plan.startHeightM, peakHeightM: plan.peakHeightM, endHeightM: plan.endHeightM })),
    u, ms, timeToDisc: plan.totalMs - ms, ...discAttitude(plan, ms) }
}

/** Końcówka niezłapanego/zbitego dysku: jawne przybliżenie balistyczne.
 * Nie jest kontynuacją stabilnego szybowania ani modelem odbicia od dłoni.
 */
export function looseDiscLanding(start, velocity, elapsedSec) {
  const vz = Math.min(0, velocity.z ?? 0)
  const height = Math.max(0, start.z ?? 0)
  const durationSec = (vz + Math.sqrt(vz * vz + 2 * 9.81 * height)) / 9.81
  const t = Math.min(durationSec, Math.max(0, elapsedSec))
  const travelSec = (1 - Math.exp(-2 * t)) / 2
  return { x: start.x + (velocity.x ?? 0) * travelSec,
    y: start.y + (velocity.y ?? 0) * travelSec,
    z: Math.max(0, height + vz * t - 0.5 * 9.81 * t * t),
    durationSec, grounded: elapsedSec >= durationSec }
}

const continuationCache = new WeakMap()
/** Próbkuj dalej, aż do ziemi. Koniec planowanego podania nie zatrzymuje dysku. */
export function sampleContinuedDisc(plan, elapsedMs) {
  if (elapsedMs <= plan.totalMs) return sampleDiscTrajectory(plan, elapsedMs)
  let samples = continuationCache.get(plan)
  if (!samples) {
    const end = sampleDiscTrajectory(plan, plan.totalMs)
    const before = sampleDiscTrajectory(plan, Math.max(0, plan.totalMs - 20))
    samples = [{ ...end, vx: (end.x - before.x) / 0.02, vy: (end.y - before.y) / 0.02, vz: (end.z - before.z) / 0.02 }]
    continuationCache.set(plan, samples)
  }
  const index = Math.ceil((elapsedMs - plan.totalMs) / 20)
  while (samples.length <= index && samples.at(-1).z > 0 && samples.length < 601) {
    const last = samples.at(-1)
    const attitude = discAttitude(plan, last.ms)
    const v = stepFreeDisc({ x: last.vx, y: last.vy, z: last.vz },
      { x: plan.windX, y: plan.windY }, attitude.normal, 0.02)
    const nextZ = last.z + v.z * 0.02
    const fraction = nextZ < 0 ? last.z / (last.z - nextZ) : 1
    samples.push({ x: last.x + v.x * 0.02 * fraction, y: last.y + v.y * 0.02 * fraction,
      z: Math.max(0, nextZ), vx: v.x, vy: v.y, vz: v.z,
      ms: last.ms + 20, timeToDisc: 0, u: 1 })
  }
  return samples[Math.min(index, samples.length - 1)]
}
