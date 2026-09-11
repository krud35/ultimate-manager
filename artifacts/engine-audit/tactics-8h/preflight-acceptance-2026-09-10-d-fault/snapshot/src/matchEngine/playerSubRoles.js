/**
 * Podrole ofensywne pod główną pozycją Handler / Cutter.
 * Przechowywane w tactics.playerSubRoles: { [playerId]: subRoleId }
 */

export const HANDLER_SUB_ROLES = {
  PRIMARY: 'primary_handler',
  RESET: 'reset_handler',
}

export const CUTTER_SUB_ROLES = {
  PRIMARY: 'primary_cutter',
  SECONDARY: 'secondary_cutter',
  CONTINUATION: 'continuation_cutter',
  FILLER: 'filler_cutter',
}

export const HANDLER_SUB_ROLE_DEFS = {
  [HANDLER_SUB_ROLES.PRIMARY]: {
    id: HANDLER_SUB_ROLES.PRIMARY,
    family: 'handler',
    label: 'Primary handler',
    shortLabel: 'PH',
    description: 'Główny punkt startu posiadania — preferowany thrower / dump target.',
    descriptionEn: 'Main possession start — preferred thrower / dump target.',
  },
  [HANDLER_SUB_ROLES.RESET]: {
    id: HANDLER_SUB_ROLES.RESET,
    family: 'handler',
    label: 'Reset handler',
    shortLabel: 'RH',
    description: 'Dump / reset za dyskiem — bezpieczne wyjście spod stallu.',
    descriptionEn: 'Dump / reset behind the disc — safe exit under stall pressure.',
  },
}

export const CUTTER_SUB_ROLE_DEFS = {
  [CUTTER_SUB_ROLES.PRIMARY]: {
    id: CUTTER_SUB_ROLES.PRIMARY,
    family: 'cutter',
    label: 'Primary cutter',
    shortLabel: 'PC',
    description: 'Pierwszy priorytet przy rozpoczynaniu cutów.',
    descriptionEn: 'First priority when initiating cuts.',
  },
  [CUTTER_SUB_ROLES.SECONDARY]: {
    id: CUTTER_SUB_ROLES.SECONDARY,
    family: 'cutter',
    label: 'Secondary cutter',
    shortLabel: 'SC',
    description: 'Drugi priorytet przy ofertach / cutach.',
    descriptionEn: 'Second priority on offers / cuts.',
  },
  [CUTTER_SUB_ROLES.CONTINUATION]: {
    id: CUTTER_SUB_ROLES.CONTINUATION,
    family: 'cutter',
    label: 'Continuation cutter',
    shortLabel: 'CC',
    description: 'Nie rozpoczyna cutów — czeka na okazję do oferty kontynuacyjnej.',
    descriptionEn: 'Does not initiate cuts — waits for continuation opportunities.',
  },
  [CUTTER_SUB_ROLES.FILLER]: {
    id: CUTTER_SUB_ROLES.FILLER,
    family: 'cutter',
    label: 'Filler cutter',
    shortLabel: 'FC',
    description: 'Nie robi cutów, chyba że ma świetną okazję.',
    descriptionEn: 'Does not cut unless a great opportunity appears.',
  },
}

export const PLAYER_SUB_ROLE_DEFS = {
  ...HANDLER_SUB_ROLE_DEFS,
  ...CUTTER_SUB_ROLE_DEFS,
}

export const PLAYER_SUB_ROLE_IDS = Object.keys(PLAYER_SUB_ROLE_DEFS)

export function isHandlerSubRole(id) {
  return id != null && HANDLER_SUB_ROLE_DEFS[id] != null
}

export function isCutterSubRole(id) {
  return id != null && CUTTER_SUB_ROLE_DEFS[id] != null
}

export function playerSubRoleDef(id) {
  return PLAYER_SUB_ROLE_DEFS[id] ?? null
}

export function playerSubRoleLabel(id) {
  return PLAYER_SUB_ROLE_DEFS[id]?.label ?? id
}

export function playerSubRoleShortLabel(id) {
  return PLAYER_SUB_ROLE_DEFS[id]?.shortLabel ?? id
}

export function subRolesForFamily(family) {
  if (family === 'handler') return Object.values(HANDLER_SUB_ROLE_DEFS)
  if (family === 'cutter') return Object.values(CUTTER_SUB_ROLE_DEFS)
  return []
}

/**
 * Domyślna podrola wg slotu formacji (roleIndex 1-based).
 */
export function defaultSubRoleForSlot(role, roleIndex = 1) {
  const idx = Math.max(1, Number(roleIndex) || 1)
  if (role === 'handler') {
    return idx <= 1 ? HANDLER_SUB_ROLES.PRIMARY : HANDLER_SUB_ROLES.RESET
  }
  if (role === 'cutter') {
    if (idx <= 1) return CUTTER_SUB_ROLES.PRIMARY
    if (idx === 2) return CUTTER_SUB_ROLES.SECONDARY
    if (idx === 3) return CUTTER_SUB_ROLES.CONTINUATION
    return CUTTER_SUB_ROLES.FILLER
  }
  return null
}

export function normalizeSubRoleId(id) {
  if (typeof id !== 'string') return null
  return PLAYER_SUB_ROLE_DEFS[id] ? id : null
}

/**
 * @param {Record<string|number, string>|null|undefined} map
 */
/** Cache po tożsamości mapy — patrz normalizeLinePlayerInstructions (playerInstructions.js);
 * `storedSubRoleForPlayer` normalizuje całą mapę przy każdym odczycie jednego gracza. */
const subRolesMapCache = new WeakMap()

export function normalizePlayerSubRolesMap(map) {
  if (!map || typeof map !== 'object') return {}
  const cached = subRolesMapCache.get(map)
  if (cached) return cached
  const computed = computePlayerSubRolesMap(map)
  subRolesMapCache.set(map, computed)
  return computed
}

function computePlayerSubRolesMap(map) {
  const out = {}
  for (const [key, raw] of Object.entries(map)) {
    const id = normalizeSubRoleId(raw)
    if (id) out[String(key)] = id
  }
  return out
}

export function storedSubRoleForPlayer(tactics, playerId) {
  if (playerId == null) return null
  const map = normalizePlayerSubRolesMap(tactics?.playerSubRoles)
  return map[String(playerId)] ?? null
}

/**
 * Rozwiązuje podrolę: zapisana (jeśli pasuje do rodziny slotu) albo domyślna ze slotu.
 * @param {object|null} tactics
 * @param {string|number|null} playerId
 * @param {{ role?: 'handler'|'cutter'|null, roleIndex?: number }|null} [slotHint]
 */
export function resolvePlayerSubRole(tactics, playerId, slotHint = null) {
  const stored = storedSubRoleForPlayer(tactics, playerId)
  const family = slotHint?.role === 'handler' || slotHint?.role === 'cutter' ? slotHint.role : null

  if (family === 'handler') {
    if (stored && isHandlerSubRole(stored)) return stored
    return defaultSubRoleForSlot('handler', slotHint?.roleIndex ?? 1)
  }
  if (family === 'cutter') {
    if (stored && isCutterSubRole(stored)) return stored
    return defaultSubRoleForSlot('cutter', slotHint?.roleIndex ?? 1)
  }

  return stored
}

/**
 * Podrola agenta na boisku (bez slotu UI) — ze storage albo z fieldRole / stackIndex.
 */
export function subRoleForAgent(agent, tactics = null) {
  const stored = storedSubRoleForPlayer(tactics, agent?.id ?? agent?.player?.id)
  if (stored) return stored

  const fieldRole = agent?.fieldRole
  if (fieldRole === 'dump' || agent?.isDump) return HANDLER_SUB_ROLES.RESET
  if (fieldRole === 'handler' || fieldRole === 'thrower') return HANDLER_SUB_ROLES.PRIMARY

  const stackIndex = Number(agent?.stackIndex ?? 0)
  return defaultSubRoleForSlot('cutter', stackIndex + 1)
}

/**
 * Ustawia podrolę zawodnika w taktyce (null = usuń).
 */
export function setPlayerSubRoleInTactics(tactics, playerId, subRoleId) {
  const pid = String(playerId)
  const map = { ...normalizePlayerSubRolesMap(tactics?.playerSubRoles) }
  const id = normalizeSubRoleId(subRoleId)
  if (id) map[pid] = id
  else delete map[pid]
  return {
    ...tactics,
    playerSubRoles: map,
  }
}

/**
 * Modyfikatory silnika z podroli (bez compliance — to strukturalna rola).
 * @param {string|null|undefined} subRoleId
 */
export function subRoleMods(subRoleId) {
  const mods = {
    cutRollMult: 1,
    cutPriorityDelta: 0,
    cutOfferPriority: 0,
    continuationOnlyCuts: false,
    fillerCutsOnly: false,
    greatOppWindowMin: 0,
    postCatchOfferBonus: 0,
    throwerPickWeightMult: 1,
    primaryHandlerBias: 0,
    dumpWeightMult: 1,
    dumpEarlyBias: 0,
    resetFirstStallBias: 0,
    preferDumpRole: false,
  }

  switch (subRoleId) {
    case HANDLER_SUB_ROLES.PRIMARY:
      mods.throwerPickWeightMult = 1.45
      mods.primaryHandlerBias = 1
      mods.dumpWeightMult = 1.08
      break
    case HANDLER_SUB_ROLES.RESET:
      mods.throwerPickWeightMult = 0.85
      mods.dumpWeightMult = 1.35
      mods.dumpEarlyBias = 0.2
      mods.resetFirstStallBias = 2
      mods.preferDumpRole = true
      mods.cutRollMult = 0.12
      mods.cutPriorityDelta = 28
      break
    case CUTTER_SUB_ROLES.PRIMARY:
      mods.cutRollMult = 1.55
      mods.cutPriorityDelta = -14
      mods.cutOfferPriority = 3
      mods.postCatchOfferBonus = 0.28
      break
    case CUTTER_SUB_ROLES.SECONDARY:
      mods.cutRollMult = 1.1
      mods.cutPriorityDelta = -4
      mods.cutOfferPriority = 2
      mods.postCatchOfferBonus = 0.12
      break
    case CUTTER_SUB_ROLES.CONTINUATION:
      mods.cutRollMult = 0.18
      mods.cutPriorityDelta = 22
      mods.cutOfferPriority = 1
      mods.continuationOnlyCuts = true
      mods.greatOppWindowMin = 68
      mods.postCatchOfferBonus = 0.35
      break
    case CUTTER_SUB_ROLES.FILLER:
      mods.cutRollMult = 0.08
      mods.cutPriorityDelta = 32
      mods.cutOfferPriority = 0
      mods.fillerCutsOnly = true
      mods.greatOppWindowMin = 78
      mods.postCatchOfferBonus = -0.2
      break
    default:
      break
  }

  return mods
}

/**
 * Czy cut z WAITING jest dozwolony przy danej podroli / sytuacji.
 */
export function subRoleAllowsInitiateCut(subRoleId, situation, { reorgWindow = false } = {}) {
  const mods = subRoleMods(subRoleId)
  const window = situation?.throwWindowScore ?? 0
  const sepM = situation?.separation ?? 0
  const clogged = (situation?.cloggingLevel ?? 0) >= 2

  if (mods.continuationOnlyCuts) {
    // Kontynuacja: oferty po chwycie / reorg albo wyjątkowo dobre okno
    if (reorgWindow) return true
    return window >= mods.greatOppWindowMin && (sepM >= 5.5 || clogged || window >= 76)
  }
  if (mods.fillerCutsOnly) {
    return window >= mods.greatOppWindowMin && sepM >= 6.5
  }
  return true
}
