/** Uproszczony model siły nośnej i oporu. vAir = vDisc - vWind.
 * Struktura równań: https://pmc.ncbi.nlm.nih.gov/articles/PMC6210097/
 * Współczynniki poniżej są przybliżeniem gry, nie pomiarem używanego dysku.
 * Orientacja jest zadana; nie rozwiązujemy pełnych momentów bryły 6-DOF.
 */
export function discAirAcceleration(velocity, wind, normal = { x: 0, y: 0, z: 1 }) {
  const x = velocity.x - (wind.x ?? 0), y = velocity.y - (wind.y ?? 0), z = velocity.z ?? 0
  const speed = Math.hypot(x, y, z)
  if (speed < 0.001) return { x: 0, y: 0, z: 0 }
  const ux = x / speed, uy = y / speed, uz = z / speed
  const dot = ux * normal.x + uy * normal.y + uz * normal.z
  const alpha = -Math.asin(Math.max(-1, Math.min(1, dot)))
  const cl = Math.max(-0.8, Math.min(1.1, 0.15 + 1.4 * alpha))
  const cd = 0.08 + 2.72 * alpha * alpha
  const lx = normal.x - dot * ux, ly = normal.y - dot * uy, lz = normal.z - dot * uz
  const length = Math.hypot(lx, ly, lz) || 1
  const pressure = 0.5 * 1.225 * 0.057 / 0.175 * speed * speed
  return { x: pressure * (cl * lx / length - cd * ux),
    y: pressure * (cl * ly / length - cd * uy),
    z: pressure * (cl * lz / length - cd * uz) }
}

/** Swobodny lot po punkcie dostarczenia, z zachowaniem prędkości i wysokości.
 * Stała orientacja, grawitacja oraz opór/nośność od względnej prędkości powietrza.
 */
export function stepFreeDisc(state, wind, normal, dtSec) {
  const a = discAirAcceleration(state, wind, normal)
  const vx = state.x + a.x * dtSec, vy = state.y + a.y * dtSec
  const vz = state.z + (a.z - 9.81) * dtSec
  return { x: vx, y: vy, z: vz }
}
