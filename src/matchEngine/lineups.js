import { MATCH_CONFIG } from './config.js'
import { getStamina, STAMINA_CONFIG } from './stamina.js'
import { assignPlayerToLineupSlot } from './lineManager.js'
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  defaultTacticsForPlayers,
} from './tacticsModifiers.js'
import { normalizeLineCoachDirectives } from './coachDirectives.js'
import {
  normalizePlayerInstructionsMap,
  normalizeLinePlayerInstructions,
} from './playerInstructions.js'
import {
  normalizePlayerSubRolesMap,
  defaultSubRoleForSlot,
} from './playerSubRoles.js'
import { offenseLineSlotsForAttackStyle } from './offenseLineSlots.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

/** @typedef {'offense'|'defense'} PointStartRole */

function lineHasPlayers(ids) {
  return (ids ?? []).some((id) => id != null)
}

function pickAttackStyle(...candidates) {
  for (const c of candidates) {
    if (c && Object.values(ATTACK_STYLES).includes(c)) return c
    if (typeof c === 'string' && c.length) return c
  }
  return ATTACK_STYLES.VERTICAL_STACK
}

function pickDefenseStyle(...candidates) {
  for (const c of candidates) {
    if (c && Object.values(DEFENSE_STYLES).includes(c)) return c
    if (typeof c === 'string' && c.length) return c
  }
  return DEFENSE_STYLES.PERSON
}

function fillSubRolesFromOffenseLine(tactics) {
  const map = { ...normalizePlayerSubRolesMap(tactics?.playerSubRoles) }
  const oLine = tactics?.lineupWhenOffenseStartPlayerIds ?? tactics?.oLinePlayerIds ?? []
  const attackStyle = tactics?.oLineAttackStyle ?? tactics?.attackStyle
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  for (let i = 0; i < slots.length; i += 1) {
    const pid = oLine[i]
    if (pid == null) continue
    const key = String(pid)
    // Tylko brakujące — nie nadpisuj (gracz może mieć inną rodzinę na D-Line).
    if (map[key]) continue
    const slot = slots[i]
    if (slot?.defaultSubRole) map[key] = slot.defaultSubRole
  }
  return map
}

export function normalizeTactics(tactics) {
  const offenseStart =
    tactics?.lineupWhenOffenseStartPlayerIds ??
    tactics?.oLinePlayerIds ??
    []
  const defenseStart =
    tactics?.lineupWhenDefenseStartPlayerIds ??
    tactics?.dLinePlayerIds ??
    []

  const legacyAtk = tactics?.attackStyle ?? ATTACK_STYLES.VERTICAL_STACK
  const legacyDef = tactics?.defenseStyle ?? DEFENSE_STYLES.PERSON

  const oLineAttackStyle = pickAttackStyle(tactics?.oLineAttackStyle, legacyAtk)
  const oLineDefenseStyle = pickDefenseStyle(tactics?.oLineDefenseStyle, legacyDef)
  const dLineAttackStyle = pickAttackStyle(tactics?.dLineAttackStyle, legacyAtk)
  const dLineDefenseStyle = pickDefenseStyle(tactics?.dLineDefenseStyle, legacyDef)

  const coachPair = normalizeLineCoachDirectives({
    ...tactics,
    oLineAttackStyle,
    forceSide: tactics?.forceSide,
    coachDirectives: tactics?.coachDirectives,
    oLineCoachDirectives: tactics?.oLineCoachDirectives,
    dLineCoachDirectives: tactics?.dLineCoachDirectives,
  })

  const lineupWhenOffenseStartPlayerIds = padLine(offenseStart)
  const lineupWhenDefenseStartPlayerIds = padLine(defenseStart)

  return {
    ...tactics,
    oLineAttackStyle,
    oLineDefenseStyle,
    dLineAttackStyle,
    dLineDefenseStyle,
    /** Alias: styl ataku O-Line (stary kod / eventy). */
    attackStyle: oLineAttackStyle,
    /** Alias: styl obrony O-Line. */
    defenseStyle: oLineDefenseStyle,
    oLineCoachDirectives: coachPair.oLineCoachDirectives,
    dLineCoachDirectives: coachPair.dLineCoachDirectives,
    /** @deprecated alias = O-Line coachDirectives */
    coachDirectives: coachPair.coachDirectives,
    /** @deprecated alias = O-Line force */
    forceSide: coachPair.forceSide,
    ...normalizeLinePlayerInstructions(tactics),
    playerSubRoles: fillSubRolesFromOffenseLine({
      ...tactics,
      oLineAttackStyle,
      lineupWhenOffenseStartPlayerIds,
    }),
    lineupWhenOffenseStartPlayerIds,
    lineupWhenDefenseStartPlayerIds,
  }
}

/**
 * Style linii na boisku w danym punkcie (O-Line vs D-Line według startu punktu).
 * @param {object} tactics
 * @param {PointStartRole} roleAtPointStart
 */
export function lineStylesForPointStart(tactics, roleAtPointStart) {
  const t = normalizeTactics(tactics)
  if (roleAtPointStart === 'defense') {
    return {
      attackStyle: t.dLineAttackStyle,
      defenseStyle: t.dLineDefenseStyle,
    }
  }
  return {
    attackStyle: t.oLineAttackStyle,
    defenseStyle: t.oLineDefenseStyle,
  }
}

export function attackStyleForPointStart(tactics, roleAtPointStart) {
  return lineStylesForPointStart(tactics, roleAtPointStart).attackStyle
}

export function defenseStyleForPointStart(tactics, roleAtPointStart) {
  return lineStylesForPointStart(tactics, roleAtPointStart).defenseStyle
}

/**
 * Domyślna taktyka kariery: style + O-Line / D-Line.
 * Uzupełnia brakujące pola wartościami z defaultTacticsForPlayers.
 */
export function resolvePlayerDefaultTactics(players, tactics = null) {
  const defaults = defaultTacticsForPlayers(players ?? [])
  if (!tactics) return normalizeTactics(defaults)

  const defaultsCoach = normalizeLineCoachDirectives(defaults)
  const mergedCoach = normalizeLineCoachDirectives({
    coachDirectives: {
      ...(defaults.coachDirectives ?? {}),
      ...(tactics.coachDirectives ?? {}),
    },
    oLineCoachDirectives: {
      ...(defaults.oLineCoachDirectives ?? defaults.coachDirectives ?? {}),
      ...(tactics.oLineCoachDirectives ?? {}),
    },
    dLineCoachDirectives: {
      ...(defaults.dLineCoachDirectives ?? defaults.coachDirectives ?? {}),
      ...(tactics.dLineCoachDirectives ?? {}),
    },
    forceSide:
      tactics.oLineCoachDirectives?.forceSide ??
      tactics.coachDirectives?.forceSide ??
      tactics.forceSide ??
      defaultsCoach.forceSide,
  })

  const merged = {
    ...defaults,
    ...tactics,
    oLineAttackStyle:
      tactics.oLineAttackStyle ?? tactics.attackStyle ?? defaults.oLineAttackStyle,
    oLineDefenseStyle:
      tactics.oLineDefenseStyle ?? tactics.defenseStyle ?? defaults.oLineDefenseStyle,
    dLineAttackStyle:
      tactics.dLineAttackStyle ?? tactics.attackStyle ?? defaults.dLineAttackStyle,
    dLineDefenseStyle:
      tactics.dLineDefenseStyle ?? tactics.defenseStyle ?? defaults.dLineDefenseStyle,
    oLineCoachDirectives: mergedCoach.oLineCoachDirectives,
    dLineCoachDirectives: mergedCoach.dLineCoachDirectives,
    coachDirectives: mergedCoach.coachDirectives,
    forceSide: mergedCoach.forceSide,
    oLinePlayerInstructions: normalizePlayerInstructionsMap({
      ...(defaults.oLinePlayerInstructions ?? defaults.playerInstructions ?? {}),
      ...(tactics.oLinePlayerInstructions ?? tactics.playerInstructions ?? {}),
    }),
    dLinePlayerInstructions: normalizePlayerInstructionsMap({
      ...(defaults.dLinePlayerInstructions ?? {}),
      ...(tactics.dLinePlayerInstructions ?? {}),
    }),
    playerSubRoles: normalizePlayerSubRolesMap({
      ...(defaults.playerSubRoles ?? {}),
      ...(tactics.playerSubRoles ?? {}),
    }),
    lineupWhenOffenseStartPlayerIds: lineHasPlayers(
      tactics.lineupWhenOffenseStartPlayerIds ?? tactics.oLinePlayerIds,
    )
      ? (tactics.lineupWhenOffenseStartPlayerIds ?? tactics.oLinePlayerIds)
      : defaults.lineupWhenOffenseStartPlayerIds,
    lineupWhenDefenseStartPlayerIds: lineHasPlayers(
      tactics.lineupWhenDefenseStartPlayerIds ?? tactics.dLinePlayerIds,
    )
      ? (tactics.lineupWhenDefenseStartPlayerIds ?? tactics.dLinePlayerIds)
      : defaults.lineupWhenDefenseStartPlayerIds,
  }
  return normalizeTactics(merged)
}

export function padLine(ids) {
  const line = [...(ids ?? [])]
  while (line.length < LINE_SIZE) line.push(null)
  return line.slice(0, LINE_SIZE)
}

export function lineupIdsForPointStart(tactics, roleAtPointStart) {
  const t = normalizeTactics(tactics)
  return roleAtPointStart === 'offense'
    ? t.lineupWhenOffenseStartPlayerIds
    : t.lineupWhenDefenseStartPlayerIds
}

export function setLineupForPointStart(tactics, roleAtPointStart, playerIds) {
  const t = normalizeTactics(tactics)
  if (roleAtPointStart === 'offense') {
    return { ...t, lineupWhenOffenseStartPlayerIds: padLine(playerIds) }
  }
  return { ...t, lineupWhenDefenseStartPlayerIds: padLine(playerIds) }
}

export function updateLineupSlot(tactics, roleAtPointStart, slotIndex, playerId) {
  const prevLine = [...lineupIdsForPointStart(tactics, roleAtPointStart)]
  const fromIndex =
    playerId != null
      ? prevLine.findIndex((id, i) => i !== slotIndex && id === playerId)
      : -1
  const next = assignPlayerToLineupSlot(prevLine, slotIndex, playerId)
  let result = setLineupForPointStart(tactics, roleAtPointStart, next)

  // Rozkazy (playerInstructions) zostają przy zawodniku.
  // Podrole idą za pozycją: po swapie / wstawieniu ustawiamy domyślną podrolę slotu.
  const attackStyle =
    roleAtPointStart === 'defense'
      ? (result.dLineAttackStyle ?? result.attackStyle)
      : (result.oLineAttackStyle ?? result.attackStyle)
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  const affected =
    fromIndex >= 0 ? [slotIndex, fromIndex] : playerId != null ? [slotIndex] : []
  if (affected.length) {
    const map = { ...normalizePlayerSubRolesMap(result.playerSubRoles) }
    for (const i of affected) {
      const pid = next[i]
      if (pid == null) continue
      const slot = slots[i]
      if (!slot) continue
      map[String(pid)] =
        slot.defaultSubRole ?? defaultSubRoleForSlot(slot.role, slot.roleIndex ?? 1)
    }
    result = { ...result, playerSubRoles: map }
  }

  return result
}

/** Kto na boisku na początku punktu (pullTeam = drużyna broniąca / rzucająca pull). */
export function pointStartRoleForTeam(teamId, pullTeam) {
  const attackTeamId = pullTeam === 'home' ? 'away' : 'home'
  return teamId === attackTeamId ? 'offense' : 'defense'
}

export function findExhaustedInLineup(playerIds, staminaMap) {
  const unique = [...new Set((playerIds ?? []).filter(Boolean))]
  return unique.filter(
    (id) => getStamina(staminaMap, id) < STAMINA_CONFIG.exhaustedThreshold,
  )
}

export function findExhaustedInTactics(tactics, staminaMap) {
  const t = normalizeTactics(tactics)
  const ids = [
    ...t.lineupWhenOffenseStartPlayerIds,
    ...t.lineupWhenDefenseStartPlayerIds,
  ]
  return findExhaustedInLineup(ids, staminaMap)
}

export { LINE_SIZE as POINT_LINEUP_SIZE }
