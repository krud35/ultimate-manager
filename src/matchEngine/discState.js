/** Wzajemnie wykluczające się stany dysku w symulacji. */
export const DISC_STATE = {
  HELD: 'HELD',
  IN_FLIGHT: 'IN_FLIGHT',
  ON_GROUND: 'ON_GROUND',
}

export const DISC_HELD_Z_M = 1.1
export const DISC_GROUND_Z_M = 0
export const CATCH_SNAP_MS = 16

/** Offset w dłoni względem rzucającego (m). */
export const DISC_HELD_OFFSET = { x: 0.35, y: 0.15 }

export function discPositionHeld(throwerX, throwerY, attackSign = 1) {
  return {
    state: DISC_STATE.HELD,
    x: throwerX + DISC_HELD_OFFSET.x * attackSign,
    y: throwerY + DISC_HELD_OFFSET.y,
    z: DISC_HELD_Z_M,
  }
}

export function discPositionInFlight(x, y, z = 0) {
  return { state: DISC_STATE.IN_FLIGHT, x, y, z }
}

export function discPositionOnGround(x, y) {
  return { state: DISC_STATE.ON_GROUND, x, y, z: DISC_GROUND_Z_M }
}

/** Jedna klatka dociągu po chwycie (IN_FLIGHT → HELD). */
export function discCatchSnapFrame(flightDisc, holderX, holderY, attackSign, progress01) {
  const held = discPositionHeld(holderX, holderY, attackSign)
  const t = Math.max(0, Math.min(1, progress01))
  return {
    state: DISC_STATE.HELD,
    x: flightDisc.x + (held.x - flightDisc.x) * t,
    y: flightDisc.y + (held.y - flightDisc.y) * t,
    z: flightDisc.z + (held.z - flightDisc.z) * t,
  }
}
