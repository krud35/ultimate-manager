import { stepFreeDisc } from './discAerodynamics.js'
import { discAttitude } from './discAttitude.js'
export const DEFLECTION_CALIBRATION = { controlledSwat: true }

export function makeDeflection(contact, velocity, atMs, blocked = false) {
  // A fingertip changes velocity and spin, rather than ending play in the air.
  // Central contact permits a downward swat. A glancing fingertip remains a
  // live tip; neither contact guarantees a turnover before the disc lands.
  const control = blocked && DEFLECTION_CALIBRATION.controlledSwat ? 1 - Math.min(1, Math.max(0, contact.envelope ?? 1)) : 0
  const retain = blocked ? 0.4 - control * 0.2 : 0.55
  return { atMs, blocked, samples: [{ x: contact.x, y: contact.y, z: contact.z,
    vx: velocity.x * retain, vy: velocity.y * retain,
    vz: !DEFLECTION_CALIBRATION.controlledSwat ? Math.max(0.4, velocity.z * 0.25)
      : blocked ? -Math.hypot(velocity.x, velocity.y, velocity.z) * (0.08 + control * 0.37)
        : velocity.z * 0.25, ms: atMs }] }
}
export function sampleDeflection(deflection, plan, elapsedMs) {
  const index = Math.max(0, Math.ceil((elapsedMs - deflection.atMs) / 20))
  const samples = deflection.samples
  while (samples.length <= index && samples.at(-1).z > 0 && samples.length < 601) {
    const last = samples.at(-1)
    const attitude = discAttitude({ ...plan, spinRadSec: (plan.spinRadSec ?? 50) * 0.35 }, last.ms)
    const v = stepFreeDisc({ x: last.vx, y: last.vy, z: last.vz },
      { x: plan.windX, y: plan.windY }, attitude.normal, 0.02)
    const z = last.z + v.z * 0.02, fraction = z < 0 ? last.z / (last.z - z) : 1
    samples.push({ x: last.x + v.x * 0.02 * fraction, y: last.y + v.y * 0.02 * fraction,
      z: Math.max(0, z), vx: v.x, vy: v.y, vz: v.z, ms: last.ms + 20 })
  }
  return { ...samples[Math.min(index, samples.length - 1)], timeToDisc: 0, u: 1 }
}
