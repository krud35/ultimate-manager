/** Reduced spin/attitude model, not a six-degree-of-freedom rigid body solver. */
export function discAttitude(plan, ms) {
  const sec = Math.max(0, ms / 1000)
  const initialSpin = plan.spinRadSec ?? 50
  const spinRadSec = initialSpin * Math.exp(-0.12 * sec)
  const heading = Math.atan2(plan.toY - plan.fromY, plan.toX - plan.fromX)
  const bank = (plan.curveSign ?? 1) * Math.min(0.3, (plan.amplitudeM ?? 0) * 0.08)
    * Math.exp(-0.35 * sec)
  const pitch = 0.12 + Math.min(0.16, (1 - spinRadSec / Math.max(1, initialSpin)) * 0.2)
  const nx = -Math.sin(pitch) * Math.cos(heading) - Math.sin(bank) * Math.sin(heading)
  const ny = -Math.sin(pitch) * Math.sin(heading) + Math.sin(bank) * Math.cos(heading)
  const nz = Math.cos(pitch) * Math.cos(bank), length = Math.hypot(nx, ny, nz)
  return { spinRadSec, bank, pitch, normal: { x: nx / length, y: ny / length, z: nz / length } }
}
