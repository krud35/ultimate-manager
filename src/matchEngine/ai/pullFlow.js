import { clampFieldX, clampFieldY, fieldCenterY } from '../fieldDimensions.js'

/** Keep the primary in the middle and support handlers in separate forward lanes. */
export function pullHandlerTarget({ subRole, handlerSlotIndex = 0, disc, attackSign }) {
  const primary = subRole === 'primary_handler'
  const side = handlerSlotIndex % 2 ? 1 : -1
  const center = fieldCenterY()
  const supportCenter = Math.max(center - 2, Math.min(center + 2, disc.y * .4 + center * .6))
  return {
    x: clampFieldX(disc.x + attackSign * (primary ? 5 : 7)),
    y: clampFieldY(primary ? center : supportCenter + side * 6),
  }
}

/** Once coverage arrives, a later gap must not restart the special pull phase. */
export function pullFlowIsOpen(active, defenders, disc) {
  return active && defenders.every(a => Math.hypot(a.x - disc.x, a.y - disc.y) > 8)
}
