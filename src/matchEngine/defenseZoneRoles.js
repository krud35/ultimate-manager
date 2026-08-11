/**
 * Ręczne przypisanie slotu strefy (kto gra w cupie / na wingu / middle / deep) —
 * przechowywane w tactics.playerZoneRoles: { [playerId]: zoneRoleId }, analogicznie
 * do tactics.playerSubRoles (playerSubRoles.js), ale osobny bucket — sub-role
 * (handler/cutter) i rola strefowa dotyczą innej fazy gry (atak vs obrona) tego
 * samego zawodnika, więc nie mogą dzielić jednego klucza w mapie.
 */
import { ZONE_SLOT_ORDER, ZONE_SLOT_ROLES } from './ai/tacticsBehavior.js'

export const ZONE_DEFENSE_ROLES = {
  MARKER: 'zone_marker',
  CUP: 'zone_cup',
  WING: 'zone_wing',
  MIDDLE: 'zone_middle',
  DEEP: 'zone_deep',
}

/** Ile slotów danej roli jest w linii 7-osobowej (1 marker, 2 cup, 2 wing, 1 middle, 1 deep). */
export const ZONE_ROLE_SLOT_LIMITS = {
  [ZONE_DEFENSE_ROLES.MARKER]: 1,
  [ZONE_DEFENSE_ROLES.CUP]: 2,
  [ZONE_DEFENSE_ROLES.WING]: 2,
  [ZONE_DEFENSE_ROLES.MIDDLE]: 1,
  [ZONE_DEFENSE_ROLES.DEEP]: 1,
}

export const ZONE_DEFENSE_ROLE_DEFS = {
  [ZONE_DEFENSE_ROLES.MARKER]: {
    id: ZONE_DEFENSE_ROLES.MARKER,
    label: 'Marker',
    shortLabel: 'MK',
    description: 'Stoi na throwerze, wymusza stall i force.',
    descriptionEn: 'Marks the thrower, forces the stall and force side.',
  },
  [ZONE_DEFENSE_ROLES.CUP]: {
    id: ZONE_DEFENSE_ROLES.CUP,
    label: 'Cup',
    shortLabel: 'CUP',
    description: 'Przy markerze — blokuje rzuty dookoła marku.',
    descriptionEn: 'Beside the marker — blocks around-the-mark throws.',
  },
  [ZONE_DEFENSE_ROLES.WING]: {
    id: ZONE_DEFENSE_ROLES.WING,
    label: 'Wing',
    shortLabel: 'WG',
    description: 'Druga linia, przy linii bocznej — kryje swing.',
    descriptionEn: 'Second line, near the sideline — covers the swing pass.',
  },
  [ZONE_DEFENSE_ROLES.MIDDLE]: {
    id: ZONE_DEFENSE_ROLES.MIDDLE,
    label: 'Middle',
    shortLabel: 'MID',
    description: 'Druga linia, środek — wypełnia lukę cup-deep.',
    descriptionEn: 'Second line, center — fills the gap between cup and deep.',
  },
  [ZONE_DEFENSE_ROLES.DEEP]: {
    id: ZONE_DEFENSE_ROLES.DEEP,
    label: 'Deep',
    shortLabel: 'DP',
    description: 'Ostatnia linia — kryje huck.',
    descriptionEn: 'Last line — covers the deep huck.',
  },
}

export const ZONE_DEFENSE_ROLE_IDS = Object.keys(ZONE_DEFENSE_ROLE_DEFS)

export function zoneDefenseRoleDef(id) {
  return ZONE_DEFENSE_ROLE_DEFS[id] ?? null
}

export function zoneDefenseRoleLabel(id) {
  return ZONE_DEFENSE_ROLE_DEFS[id]?.label ?? id
}

export function zoneDefenseRoleShortLabel(id) {
  return ZONE_DEFENSE_ROLE_DEFS[id]?.shortLabel ?? id
}

export function normalizeZoneRoleId(id) {
  if (typeof id !== 'string') return null
  return ZONE_SLOT_ROLES.has(id) ? id : null
}

/** @param {Record<string|number, string>|null|undefined} map */
export function normalizePlayerZoneRolesMap(map) {
  if (!map || typeof map !== 'object') return {}
  const out = {}
  for (const [key, raw] of Object.entries(map)) {
    const id = normalizeZoneRoleId(raw)
    if (id) out[String(key)] = id
  }
  return out
}

export function storedZoneRoleForPlayer(tactics, playerId) {
  if (playerId == null) return null
  const map = normalizePlayerZoneRolesMap(tactics?.playerZoneRoles)
  return map[String(playerId)] ?? null
}

/** Ustawia rolę strefową zawodnika w taktyce (null = usuń, wraca do auto-przydziału). */
export function setPlayerZoneRoleInTactics(tactics, playerId, zoneRoleId) {
  const pid = String(playerId)
  const map = { ...normalizePlayerZoneRolesMap(tactics?.playerZoneRoles) }
  const id = normalizeZoneRoleId(zoneRoleId)
  if (id) map[pid] = id
  else delete map[pid]
  return {
    ...tactics,
    playerZoneRoles: map,
  }
}

/**
 * Rozwiązuje przydział slotów strefy dla 7 graczy na linii: honoruje zapisane role
 * (o ile mieszczą się w limicie 1 marker/2 cup/2 wing/1 middle/1 deep, pierwszeństwo
 * wg kolejności w linii), a każdego gracza bez ważnego/unikalnego przydziału wrzuca w
 * pierwszy wolny slot wg ZONE_SLOT_ORDER. Wynik zawsze jest poprawną, kompletną
 * siódemką slotów — nawet gdy zapisana mapa jest sprzeczna/nieaktualna (np. po
 * zmianie składu linii albo przełączeniu stylu obrony).
 * @param {object|null} tactics
 * @param {Array<string|number>} playerIds — 7 graczy na linii, w kolejności z lineup
 * @returns {string[]} role wg ZONE_DEFENSE_ROLES, po jednej na gracza (ten sam porządek co playerIds)
 */
export function resolveTeamZoneSlotRoles(tactics, playerIds) {
  const ids = playerIds ?? []
  const stored = ids.map((id) => storedZoneRoleForPlayer(tactics, id))
  const counts = Object.fromEntries(Object.keys(ZONE_ROLE_SLOT_LIMITS).map((k) => [k, 0]))
  const resolved = new Array(ids.length).fill(null)

  for (let i = 0; i < ids.length; i += 1) {
    const role = stored[i]
    if (role && counts[role] < ZONE_ROLE_SLOT_LIMITS[role]) {
      resolved[i] = role
      counts[role] += 1
    }
  }
  for (let i = 0; i < ids.length; i += 1) {
    if (resolved[i]) continue
    const nextRole = ZONE_SLOT_ORDER.find((r) => counts[r] < ZONE_ROLE_SLOT_LIMITS[r])
    const role = nextRole ?? ZONE_DEFENSE_ROLES.DEEP
    resolved[i] = role
    counts[role] = (counts[role] ?? 0) + 1
  }
  return resolved
}

/**
 * Jak wyżej, ale zwraca playerId -> rola (do UI: łatwiej odpytać "co gra ten gracz").
 */
export function resolveTeamZoneSlotRoleMap(tactics, playerIds) {
  const roles = resolveTeamZoneSlotRoles(tactics, playerIds)
  const out = {}
  ;(playerIds ?? []).forEach((id, i) => {
    if (id != null) out[String(id)] = roles[i]
  })
  return out
}

/**
 * Jak resolveTeamZoneSlotRoles, ale dokłada roleSlotIndex (0-based indeks W OBRĘBIE
 * roli — np. który z dwóch "zone_cup" to lewy/prawy) — potrzebne do geometrii
 * (zoneStructuralTarget w ai/tacticsBehavior.js), bo pozycja lewo/prawo NIE może już
 * zależeć od surowego stackIndex w linii (gracz przypisany ręcznie do cupa może być
 * na dowolnej pozycji w lineup).
 * @returns {{role: string, roleSlotIndex: number}[]}
 */
export function resolveTeamZoneSlots(tactics, playerIds) {
  const roles = resolveTeamZoneSlotRoles(tactics, playerIds)
  const seen = {}
  return roles.map((role) => {
    const roleSlotIndex = seen[role] ?? 0
    seen[role] = roleSlotIndex + 1
    return { role, roleSlotIndex }
  })
}
