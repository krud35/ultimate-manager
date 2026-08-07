import { ATTACK_STYLES } from './tacticsModifiers.js'
import { MATCH_CONFIG } from './config.js'
import { defaultSubRoleForSlot } from './playerSubRoles.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

/**
 * Ile handlerów w siódemce przy danym stylu ataku (reszta = cutters).
 * Zgodne z opisami formacji w TACTICS_MODIFIERS / klasycznym ultimate.
 */
export function handlerCountForAttackStyle(attackStyle) {
  switch (attackStyle) {
    case ATTACK_STYLES.HORIZONTAL_STACK:
    case ATTACK_STYLES.MOTION_OFFENSE:
    case ATTACK_STYLES.ZONE_OFFENSE:
      return 3
    case ATTACK_STYLES.VERTICAL_STACK:
    case ATTACK_STYLES.SPLIT_STACK:
    case ATTACK_STYLES.SIDE_STACK:
    case ATTACK_STYLES.HEX_OFFENSE:
    default:
      return 2
  }
}

/**
 * Sloty pozycji dla formacji ofensywnej: Handler 1..N, Cutter 1..M.
 * @returns {{ key: string, role: 'handler'|'cutter', roleIndex: number, label: string, shortLabel: string, defaultSubRole: string }[]}
 */
export function offenseLineSlotsForAttackStyle(attackStyle) {
  const handlers = Math.max(1, Math.min(LINE_SIZE - 1, handlerCountForAttackStyle(attackStyle)))
  const cutters = LINE_SIZE - handlers
  const slots = []
  for (let i = 0; i < handlers; i += 1) {
    const n = i + 1
    slots.push({
      key: `handler_${n}`,
      role: 'handler',
      roleIndex: n,
      label: `Handler ${n}`,
      shortLabel: `H${n}`,
      defaultSubRole: defaultSubRoleForSlot('handler', n),
    })
  }
  for (let i = 0; i < cutters; i += 1) {
    const n = i + 1
    slots.push({
      key: `cutter_${n}`,
      role: 'cutter',
      roleIndex: n,
      label: `Cutter ${n}`,
      shortLabel: `C${n}`,
      defaultSubRole: defaultSubRoleForSlot('cutter', n),
    })
  }
  return slots
}

/** Etykieta slotu (0-based index) dla UI. */
export function offenseSlotLabel(attackStyle, slotIndex) {
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  return slots[slotIndex]?.label ?? `Slot ${slotIndex + 1}`
}

export function offenseSlotShortLabel(attackStyle, slotIndex) {
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  return slots[slotIndex]?.shortLabel ?? String(slotIndex + 1)
}
