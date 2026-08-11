import { MATCH_CONFIG } from './config.js'
import { STALL_MAX } from './stall.js'
import { THROW_TYPE, THROW_TRAJECTORY } from './throwTypes.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from './tacticsModifiers.js'
import {
  attackStyleForPointStart,
  defenseStyleForPointStart,
  pointStartRoleForTeam,
} from './lineups.js'
import { forceMarkLayoutSide, normalizeForceMark } from './throwTechnique.js'
import { forceMarkPosition } from './ai/defenderBrain.js'
import { zoneStructuralTarget, ZONE_SLOT_ORDER, ZONE_SLOT_ROLES } from './ai/tacticsBehavior.js'
import { resolveTeamZoneSlots } from './defenseZoneRoles.js'
import {
  FIELD_DIMENSIONS,
  clampFieldX,
  clampFieldY,
  fieldCenterY,
  attackDirectionX,
  geoTeam,
} from './fieldDimensions.js'

export { FIELD_DIMENSIONS, clampFieldX, clampFieldY, fieldCenterY, attackDirectionX, geoTeam } from './fieldDimensions.js'

/** Stałe ID slotów na boisku (7v7) — niezmienne w obrębie punktu i klipów wizualizacji. */
export const FIELD_LINEUP_SIZE = 7

export function fieldSlotId(teamSide, slotIndex) {
  return `${teamSide}_${slotIndex}`
}

/** Mapy rosterId ↔ fieldSlotId na podstawie składu z POINT_START. */
export function buildFieldSlotMaps(homeLineupIds = [], awayLineupIds = []) {
  const rosterToField = new Map()
  const fieldToRoster = new Map()
  homeLineupIds.forEach((rosterId, i) => {
    const fid = fieldSlotId('home', i)
    rosterToField.set(rosterId, fid)
    fieldToRoster.set(fid, rosterId)
  })
  awayLineupIds.forEach((rosterId, i) => {
    const fid = fieldSlotId('away', i)
    rosterToField.set(rosterId, fid)
    fieldToRoster.set(fid, rosterId)
  })
  return { rosterToField, fieldToRoster }
}

export function fieldLineupIdsFromPointEvents(pointEvents) {
  const start = pointEvents?.find((e) => e.type === 'point_start')
  return {
    homeLineupIds: start?.homeLineupIds ?? [],
    awayLineupIds: start?.awayLineupIds ?? [],
  }
}

/** Tylko zawodnicy z siódemki bieżącego punktu (bez „duchów” z poprzedniego). */
export function filterPlayersToPointLineup(players, homeLineupIds, awayLineupIds) {
  if (!players?.length) return []
  const home = new Set((homeLineupIds ?? []).filter(Boolean))
  const away = new Set((awayLineupIds ?? []).filter(Boolean))
  if (!home.size && !away.size) return players
  return players.filter((p) => {
    if (p.teamId === 'home') return home.has(p.id)
    if (p.teamId === 'away') return away.has(p.id)
    return false
  })
}

const STACK_SPACING_M = 4.5

function clampM(x) {
  return clampFieldX(x)
}

function clampY(y) {
  return clampFieldY(y)
}

/** Pozycja dysku na boisku 0–100 m (home broni lewej strefy, atakuje w prawo). */
export function discMetersFromState(discPosition, possessionTeam) {
  const m = discPosition
  if (possessionTeam === 'home') return m
  return MATCH_CONFIG.field.max - m
}

/** Absolutne metry boiska → discPosition dla drużyny w posiadaniu. */
export function discPositionFromFieldMeters(fieldX, possessionTeam) {
  const x = Number.isFinite(fieldX) ? fieldX : MATCH_CONFIG.field.min
  if (possessionTeam === 'home') return x
  return MATCH_CONFIG.field.max - x
}

export function initials(firstName, lastName) {
  const a = firstName?.[0] ?? ''
  const b = lastName?.[0] ?? ''
  return `${a}${b}`.toUpperCase() || '?'
}

function playerLabelMeta(p, teamId, fieldId = null) {
  return {
    id: p.id,
    fieldId: fieldId ?? p.fieldId ?? null,
    teamId,
    label: p.jersey != null ? String(p.jersey) : initials(p.firstName, p.lastName),
  }
}

function orderOffenseLine(players, throwerId) {
  if (!throwerId) return [...players]
  const thrower = players.find((p) => p.id === throwerId)
  const rest = players.filter((p) => p.id !== throwerId)
  if (!thrower) return [...players]
  const dump = rest[0] ?? null
  const cutters = rest.slice(1)
  return [thrower, dump, ...cutters].filter(Boolean)
}

function layoutOffenseVertical(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  const ahead = (offset) => clampM(discMeters + attackSign * offset)
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'thrower',
        x: clampM(discMeters),
        y: clampY(cy),
      }
    }
    if (i === 1) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'dump',
        x: clampM(discMeters),
        y: clampY(cy - 4.5),
      }
    }
    const cutterIdx = i - 2
    const cutterCount = 4
    const aheadX = ahead(8)
    if (cutterIdx < cutterCount) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'stack',
        x: clampM(aheadX + attackSign * cutterIdx * STACK_SPACING_M),
        y: cy,
      }
    }
    return {
      ...base,
      stackIndex: i,
      fieldRole: 'stack',
      x: clampM(aheadX + attackSign * cutterCount * STACK_SPACING_M),
      y: clampY(cy + (cutterIdx % 2 === 0 ? 1.5 : -1.5)),
    }
  })
}

function layoutOffenseHorizontal(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  const w = FIELD_DIMENSIONS.widthM
  /** Przestrzeń handlerska: 3 handlery w jednej linii (thrower / H1 na środku). */
  const handlerX = clampM(discMeters)
  const handlerSpacingY = 5.5
  /** Cuttery dalej downfield, linia poprzeczna. */
  const stackDepthX = clampM(discMeters + attackSign * 12)
  const cutterY = [w * 0.14, w * 0.38, w * 0.62, w * 0.86]
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'thrower',
        x: handlerX,
        y: clampY(cy),
      }
    }
    if (i === 1) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'dump',
        x: handlerX,
        y: clampY(cy - handlerSpacingY),
      }
    }
    if (i === 2) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'handler',
        x: handlerX,
        y: clampY(cy + handlerSpacingY),
      }
    }
    const cutterIdx = i - 3
    return {
      ...base,
      stackIndex: i,
      fieldRole: 'stack',
      x: stackDepthX,
      y: clampY(cutterY[cutterIdx] ?? cy),
    }
  })
}

function layoutOffenseSplit(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return { ...base, stackIndex: i, fieldRole: 'thrower', x: clampM(discMeters), y: clampY(cy) }
    }
    if (i === 1) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'dump',
        x: clampM(discMeters - attackSign * 2),
        y: clampY(cy - 5),
      }
    }
    const cutterIdx = i - 2
    const side = cutterIdx % 2 === 0 ? 1 : -1
    const depth = 8 + Math.floor(cutterIdx / 2) * 7
    return {
      ...base,
      stackIndex: i,
      fieldRole: cutterIdx === 0 ? 'iso' : 'stack',
      x: clampM(discMeters + attackSign * depth),
      y: clampY(cy + side * (8 + (cutterIdx % 2) * 3)),
    }
  })
}

function layoutOffenseSide(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  const w = FIELD_DIMENSIONS.widthM
  const floodY = w * 0.22
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return { ...base, stackIndex: i, fieldRole: 'thrower', x: clampM(discMeters), y: clampY(cy) }
    }
    if (i === 1) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'dump',
        x: clampM(discMeters),
        y: clampY(floodY),
      }
    }
    if (i === 2) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'iso',
        x: clampM(discMeters + attackSign * 14),
        y: clampY(w * 0.78),
      }
    }
    const floodIdx = i - 3
    return {
      ...base,
      stackIndex: i,
      fieldRole: 'stack',
      x: clampM(discMeters + attackSign * (7 + floodIdx * 5)),
      y: clampY(floodY + floodIdx * 2.5),
    }
  })
}

function layoutOffenseHex(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  const angles = [0, 60, 120, 180, -120, -60]
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return { ...base, stackIndex: i, fieldRole: 'thrower', x: clampM(discMeters), y: clampY(cy) }
    }
    const a = ((angles[(i - 1) % 6] ?? 0) * Math.PI) / 180
    const radius = 9
    return {
      ...base,
      stackIndex: i,
      fieldRole: i === 1 ? 'dump' : 'stack',
      x: clampM(discMeters + Math.cos(a) * attackSign * radius),
      y: clampY(cy + Math.sin(a) * radius),
    }
  })
}

/** Motion: 3 handlery blisko dysku, 4 cuttery w ruchu wokół (jak hex lanes). */
function layoutOffenseMotion(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  const handlerX = clampM(discMeters)
  const handlerSpacingY = 5.5
  const angles = [-120, -60, 0, 60]
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'thrower',
        x: handlerX,
        y: clampY(cy),
      }
    }
    if (i === 1) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'handler',
        x: clampM(handlerX + attackSign * 1.5),
        y: clampY(cy - handlerSpacingY),
      }
    }
    if (i === 2) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'handler',
        x: clampM(handlerX + attackSign * 1.5),
        y: clampY(cy + handlerSpacingY),
      }
    }
    const cutterIdx = i - 3
    const a = ((angles[cutterIdx % 4] ?? 0) * Math.PI) / 180
    const radius = 10
    return {
      ...base,
      stackIndex: i,
      fieldRole: 'stack',
      x: clampM(discMeters + Math.cos(a) * attackSign * radius),
      y: clampY(cy + Math.sin(a) * radius),
    }
  })
}

function layoutOffenseZoneO(players, teamId, discMeters, throwerId, attackSign, discY) {
  const ordered = orderOffenseLine(players, throwerId)
  const cy = discY ?? fieldCenterY()
  return ordered.map((p, i) => {
    const base = playerLabelMeta(p, teamId)
    if (i === 0) {
      return { ...base, stackIndex: i, fieldRole: 'thrower', x: clampM(discMeters), y: clampY(cy) }
    }
    if (i <= 2) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'handler',
        x: clampM(discMeters + attackSign * 2),
        y: clampY(cy + (i === 1 ? -8 : 8)),
      }
    }
    if (i === 3) {
      return {
        ...base,
        stackIndex: i,
        fieldRole: 'popper',
        x: clampM(discMeters + attackSign * 9),
        y: clampY(cy),
      }
    }
    return {
      ...base,
      stackIndex: i,
      fieldRole: 'wing',
      x: clampM(discMeters + attackSign * (14 + (i - 4) * 4)),
      y: clampY(cy + (i % 2 === 0 ? 11 : -11)),
    }
  })
}

function markPosRelativeToOffense(offensePlayer, gap = 2.2, attackSign = 1, forceSide = 'home') {
  const cy = fieldCenterY()
  if (!offensePlayer) return { x: 45, y: cy }
  // Thrower: ciasny stall mark (~0.55 m) z force shade.
  if (offensePlayer.fieldRole === 'thrower') {
    return forceMarkPosition(offensePlayer.x, offensePlayer.y, forceSide, attackSign)
  }
  const shade = forceSide === 'away' ? 0.85 : forceSide === 'home' ? -0.85 : 0
  return {
    x: clampM(offensePlayer.x - gap * attackSign),
    y: clampY(offensePlayer.y + shade),
  }
}

/** Po przesunięciu O (snapshot / pin Y) dociągnij D do swoich marek. */
function resyncDefenseMarksToOffense(defenseLayout, offenseLayout, attackSign, forceSide) {
  if (!defenseLayout?.length || !offenseLayout?.length) return defenseLayout
  const offenseById = new Map(offenseLayout.map((o) => [o.id, o]))
  const layoutSide = forceMarkLayoutSide(forceSide)
  return defenseLayout.map((d) => {
    if (ZONE_SLOT_ROLES.has(d.fieldRole) || d.fieldRole === 'zone_wall' || d.fieldRole === 'zone') {
      return d
    }
    const off = d.markTargetId != null ? offenseById.get(d.markTargetId) : null
    if (!off) return d
    const pos = markPosRelativeToOffense(off, 2.6, attackSign, layoutSide)
    return { ...d, x: pos.x, y: pos.y }
  })
}

function layoutDefensePersonMark(
  players,
  teamId,
  offenseLayout,
  attackSign = 1,
  forceMark = FORCE_SIDES.FORCE_FOREHAND,
  personMatchups = null,
) {
  const layoutSide = forceMarkLayoutSide(forceMark)
  const offenseById = new Map(offenseLayout.map((o) => [o.id, o]))
  // Reverse map: defenderId → offense layout entry (gdy matchupy są przetasowane).
  const offByDefId = new Map()
  if (personMatchups instanceof Map) {
    for (const [offId, def] of personMatchups) {
      if (def?.id != null) offByDefId.set(def.id, offenseById.get(offId) ?? null)
    }
  }
  const usedOffenseIds = new Set()
  return players.map((p, i) => {
    let mark = offByDefId.get(p.id)
    // Gdy matchupy są — nie bierz offenseLayout[i] (kolejność ≠ pary person-mark).
    if (!mark && !(personMatchups instanceof Map && personMatchups.size)) {
      mark = offenseLayout[i] ?? offenseLayout[offenseLayout.length - 1]
    }
    if (!mark) {
      mark =
        offenseLayout.find((o) => o?.id != null && !usedOffenseIds.has(o.id)) ??
        offenseLayout[offenseLayout.length - 1]
    }
    if (mark?.id != null) usedOffenseIds.add(mark.id)
    const pos = mark
      ? markPosRelativeToOffense(mark, 2.6, attackSign, layoutSide)
      : { x: p.x ?? 0, y: p.y ?? 0 }
    return {
      ...playerLabelMeta(p, teamId),
      stackIndex: i,
      fieldRole: 'marker',
      markTargetId: mark?.id ?? null,
      x: pos.x,
      y: pos.y,
    }
  })
}

function layoutDefensePerson(players, teamId, discMeters, attackSign = 1) {
  const baseX = discMeters - attackSign * 5
  const w = FIELD_DIMENSIONS.widthM
  return players.map((p, i) => {
    const row = i % 7
    const y = 3 + row * ((w - 6) / 6)
    const xOffset = (i % 3) * 1.8 - 1.8
    return {
      ...playerLabelMeta(p, teamId),
      stackIndex: i,
      fieldRole: 'marker',
      x: clampM(baseX + xOffset - 2),
      y: clampY(y),
    }
  })
}

/**
 * Zone cup: 1 marker + 2 cup (przed throwerem, utrudniają rzut) + 2 wingi + 1 middle
 * (druga linia, tnie podania w bok/średni dystans) + 1 deep (ostatnia linia, huck).
 * Sloty trzymają kształt strefy niezależnie od pozycji zawodników ataku — realny ruch
 * co tick liczy zoneStructuralTarget (ai/tacticsBehavior.js), to tylko seed na klatkę 0.
 */
function layoutDefenseZoneCup(players, teamId, discMeters, attackSign = 1, discYMeters = null, defenseTactics = null) {
  const slots = resolveTeamZoneSlots(defenseTactics, players.map((p) => p.id))
  return players.map((p, i) => {
    const { role: fieldRole, roleSlotIndex } = slots[i] ?? { role: ZONE_SLOT_ORDER[i] ?? 'zone_deep', roleSlotIndex: 0 }
    const pos = zoneStructuralTarget(fieldRole, roleSlotIndex, {
      discX: discMeters,
      discY: discYMeters,
      attackSign,
      zoneKind: 'cup',
    })
    return {
      ...playerLabelMeta(p, teamId),
      stackIndex: i,
      fieldRole,
      roleSlotIndex,
      x: pos.x,
      y: pos.y,
    }
  })
}

/** Arrowhead / junk wall — te same sloty co cup, płytsza druga linia (zoneKind='wall'). */
function layoutDefenseZoneWall(players, teamId, discMeters, attackSign = 1, discYMeters = null, defenseTactics = null) {
  const slots = resolveTeamZoneSlots(defenseTactics, players.map((p) => p.id))
  return players.map((p, i) => {
    const { role: fieldRole, roleSlotIndex } = slots[i] ?? { role: ZONE_SLOT_ORDER[i] ?? 'zone_deep', roleSlotIndex: 0 }
    const pos = zoneStructuralTarget(fieldRole, roleSlotIndex, {
      discX: discMeters,
      discY: discYMeters,
      attackSign,
      zoneKind: 'wall',
    })
    return {
      ...playerLabelMeta(p, teamId),
      stackIndex: i,
      fieldRole,
      roleSlotIndex,
      x: pos.x,
      y: pos.y,
    }
  })
}

/**
 * Style formacji na boisku: zależą od linii, która startowała punkt (O-Line vs D-Line),
 * nie od aktualnego posiadania.
 */
export function resolveFieldTactics(
  possessionTeam,
  homeTeam,
  awayTeam,
  currentEvent,
  pullTeam = null,
) {
  const offenseTeam = possessionTeam === 'home' ? homeTeam : awayTeam
  const defenseTeam = possessionTeam === 'home' ? awayTeam : homeTeam
  const defenseTeamId = possessionTeam === 'home' ? 'away' : 'home'
  const pull = pullTeam ?? currentEvent?.pullTeam ?? null

  const offenseRole =
    offenseTeam?._pointStartRole ??
    (pull ? pointStartRoleForTeam(possessionTeam, pull) : 'offense')
  const defenseRole =
    defenseTeam?._pointStartRole ??
    (pull ? pointStartRoleForTeam(defenseTeamId, pull) : 'offense')

  let attackStyle = attackStyleForPointStart(offenseTeam?.tactics, offenseRole)
  let defenseStyle = defenseStyleForPointStart(defenseTeam?.tactics, defenseRole)
  if (currentEvent?.attackStyle) attackStyle = currentEvent.attackStyle
  if (currentEvent?.defenseStyle) defenseStyle = currentEvent.defenseStyle
  const personMark =
    currentEvent?.personMark !== undefined
      ? currentEvent.personMark
      : defenseStyle !== DEFENSE_STYLES.ZONE_CUP &&
        defenseStyle !== DEFENSE_STYLES.ZONE_WALL
  return { attackStyle, defenseStyle, personMark }
}

function normalizeForceSide(raw) {
  return forceMarkLayoutSide(normalizeForceMark(raw))
}

/** Force Forehand / Backhand / Middle z taktyki linii broniącej lub zdarzenia punktu. */
export function resolveMarkForceSide(defenseTeam, currentEvent) {
  const fromEvent = currentEvent?.forceSide
  if (fromEvent) return normalizeForceMark(fromEvent)
  const lineRole = defenseTeam?._pointStartRole ?? defenseTeam?.tactics?._pointStartRole
  const fromCoach =
    lineRole === 'defense'
      ? defenseTeam?.tactics?.dLineCoachDirectives?.forceSide
      : defenseTeam?.tactics?.oLineCoachDirectives?.forceSide
  if (fromCoach) return normalizeForceMark(fromCoach)
  const legacyCoach = defenseTeam?.tactics?.coachDirectives?.forceSide
  if (legacyCoach) return normalizeForceMark(legacyCoach)
  const fromTactics = defenseTeam?.tactics?.forceSide
  if (fromTactics) return normalizeForceMark(fromTactics)
  return FORCE_SIDES.FORCE_FOREHAND
}

/** Rozmieszczenie 7 graczy — geometria z taktyki ataku / obrony. */
export function layoutPlayersOnField(
  players,
  teamId,
  discMeters,
  isOffense,
  layoutOptions = {},
) {
  if (!players?.length) return []

  const {
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle = DEFENSE_STYLES.PERSON,
    throwerId = null,
    offenseLayout = null,
    personMark = true,
    attackSign = 1,
    discYMeters = null,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    personMatchups = null,
    /** Taktyka drużyny broniącej — do resolveTeamZoneSlots (kto gra w cupie/na wingu itd.). */
    defenseTactics = null,
  } = layoutOptions

  if (isOffense) {
    if (attackStyle === ATTACK_STYLES.HORIZONTAL_STACK) {
      return layoutOffenseHorizontal(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    if (attackStyle === ATTACK_STYLES.SPLIT_STACK) {
      return layoutOffenseSplit(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    if (attackStyle === ATTACK_STYLES.SIDE_STACK) {
      return layoutOffenseSide(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    if (
      attackStyle === ATTACK_STYLES.HEX_OFFENSE
    ) {
      return layoutOffenseHex(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    if (attackStyle === ATTACK_STYLES.MOTION_OFFENSE) {
      return layoutOffenseMotion(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    if (attackStyle === ATTACK_STYLES.ZONE_OFFENSE) {
      return layoutOffenseZoneO(players, teamId, discMeters, throwerId, attackSign, discYMeters)
    }
    return layoutOffenseVertical(players, teamId, discMeters, throwerId, attackSign, discYMeters)
  }

  if (defenseStyle === DEFENSE_STYLES.ZONE_CUP) {
    return layoutDefenseZoneCup(players, teamId, discMeters, attackSign, discYMeters, defenseTactics)
  }
  if (defenseStyle === DEFENSE_STYLES.ZONE_WALL) {
    return layoutDefenseZoneWall(players, teamId, discMeters, attackSign, discYMeters, defenseTactics)
  }
  if (personMark && offenseLayout?.length) {
    return layoutDefensePersonMark(
      players,
      teamId,
      offenseLayout,
      attackSign,
      forceSide,
      personMatchups,
    )
  }
  return layoutDefensePerson(players, teamId, discMeters, attackSign)
}

export function playerById(team, id) {
  return team?.players?.find((p) => p.id === id)
}

function sampleQuadratic(x0, y0, cx, cy, x1, y1, steps) {
  const pts = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    pts.push({
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1,
    })
  }
  return pts
}

function pointsToPathD(points) {
  if (!points.length) return ''
  const [first, ...rest] = points
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`
}

/**
 * Punkty trajektorii lotu dysku (widok z góry + wysokość jako offset Y na łuku).
 */
export function buildThrowPathPoints(fx, fy, tx, ty, trajectory, throwType) {
  if (
    trajectory === THROW_TRAJECTORY.LATERAL ||
    throwType === THROW_TYPE.DUMP_SWING
  ) {
    const mx = fx + (tx - fx) * 0.4
    const my = fy + (ty - fy) * 0.55
    return [
      { x: fx, y: fy },
      { x: mx, y: my },
      { x: tx, y: ty },
    ]
  }

  if (trajectory === THROW_TRAJECTORY.DEEP || throwType === THROW_TYPE.HUCK) {
    const cx = (fx + tx) / 2
    const cy = (fy + ty) / 2 - Math.min(6, Math.abs(tx - fx) * 0.08)
    return sampleQuadratic(fx, fy, cx, cy, tx, ty, 16)
  }

  if (
    trajectory === THROW_TRAJECTORY.OVERHEAD ||
    throwType === THROW_TYPE.OVER_THE_TOP
  ) {
    const cx = (fx + tx) / 2
    const cy = (fy + ty) / 2 - Math.min(8, Math.abs(ty - fy) + 4)
    return sampleQuadratic(fx, fy, cx, cy, tx, ty, 18)
  }

  const steps = Math.max(6, Math.ceil(Math.hypot(tx - fx, ty - fy) / 3))
  const pts = [{ x: fx, y: fy }]
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    pts.push({ x: fx + (tx - fx) * t, y: fy + (ty - fy) * t })
  }
  return pts
}

function cutDepthForSeparation(separationOutcome) {
  if (separationOutcome === 'open') return 11
  if (separationOutcome === 'tight') return 5
  return 7
}

function defenderMarkOffset(separationOutcome) {
  if (separationOutcome === 'open') return { dx: -4.5, dy: 1.2 }
  if (separationOutcome === 'tight') return { dx: -1.4, dy: 0.9 }
  return { dx: -2.8, dy: 1 }
}

function actionLabelForEvent(event) {
  if (!event) return null
  if (event.type === 'stall_pressure') return 'Stall Pressure!'
  if (event.type === 'stall_out') return 'Stall Out!'
  if (event.type === 'throw_fail' && event.isBlock) {
    if (event.throwType === THROW_TYPE.OVER_THE_TOP) return 'Przechwyt!'
    return 'D-Block!'
  }
  const t = event.throwType
  if (t === THROW_TYPE.HUCK) return 'Huck!'
  if (t === THROW_TYPE.DUMP_SWING) return 'Dump Reset'
  if (t === THROW_TYPE.OVER_THE_TOP) return 'Hammer!'
  return null
}

function enrichPlayersWithCutting(layout, ctx) {
  const { lastThrow, separationOutcome, animatingThrow, phase } = ctx
  if (!lastThrow?.toId) return layout

  return layout.map((p) => {
    let next = { ...p }

    if (p.id === lastThrow.toId) {
      const depth = cutDepthForSeparation(separationOutcome)
      const fromX = Math.max(2, p.x - depth)
      const fromY = p.y - 2
      if (phase === 'attempt') {
        next = { ...next, x: fromX, y: fromY, role: 'receiver' }
      } else if (animatingThrow) {
        next = {
          ...next,
          role: 'receiver',
          fromX,
          fromY,
          toX: p.x,
          toY: p.y,
          animateCut: true,
        }
      }
    }

    if (p.id === lastThrow.defenderId && lastThrow.toId) {
      const recv = layout.find((pl) => pl.id === lastThrow.toId)
      if (recv) {
        const depth = cutDepthForSeparation(separationOutcome)
        const recvFromX = Math.max(2, recv.x - depth)
        const recvFromY = recv.y - 2
        const off = defenderMarkOffset(separationOutcome)
        const fromX = recvFromX + off.dx
        const fromY = recvFromY + off.dy
        const toX = p.x + off.dx * 0.35
        const toY = p.y + off.dy * 0.35

        if (phase === 'attempt') {
          next = { ...next, x: fromX, y: fromY, role: 'defender' }
        } else if (animatingThrow) {
          next = {
            ...next,
            x: toX,
            y: toY,
            fromX,
            fromY,
            animateCut: true,
            role: 'defender',
          }
        }
      }
    }

    return next
  })
}

/**
 * Stan boiska z listy zdarzeń punktu do indeksu kroku (włącznie).
 */
export function fieldStateAtEventStep(pointEvents, stepIndex, homeTeam, awayTeam, pullTeam) {
  const sidesSwapped = !!pointEvents?.find((e) => e.type === 'point_start')?.sidesSwapped
  const attackTeamId = pullTeam === 'home' ? 'away' : 'home'
  let possession = attackTeamId
  let discPosition = MATCH_CONFIG.field.positionAfterPull
  let discHolderId = null
  let lastThrow = null
  let stallCount = 0
  let separationOutcome = null
  let throwerId = null
  let discYMeters = fieldCenterY()
  let offenseFieldSnapshot = null
  /** @type {Array<{offenseId:number,defenderId:number}>|null} */
  let personMatchupPairs = null

  const homeOnField = []
  const awayOnField = []

  for (let i = 0; i <= stepIndex && i < pointEvents.length; i += 1) {
    const e = pointEvents[i]
    if (e.type === 'possession') {
      possession = e.team
      discPosition = e.discPosition
      if (e.discYMeters != null) discYMeters = e.discYMeters
    }
    if (e.type === 'person_matchups') {
      personMatchupPairs = e.pairs ?? null
    }
    if (e.type === 'stall_pressure') {
      stallCount = e.stallCount ?? stallCount
      throwerId = e.throwerId ?? throwerId
    }
    if (e.type === 'stall_out') {
      stallCount = e.stallCount ?? STALL_MAX
      throwerId = e.throwerId ?? throwerId
      discHolderId = e.throwerId ?? discHolderId
    }
    if (e.type === 'throw_attempt') {
      stallCount = e.stallCount ?? stallCount
      separationOutcome = e.separationOutcome ?? separationOutcome
      throwerId = e.throwerId
      discHolderId = e.throwerId
      lastThrow = {
        fromId: e.throwerId,
        toId: e.receiverId,
        defenderId: e.defenderId,
        possessionTeam: e.possessionTeam ?? possession,
        throwType: e.throwType,
        trajectory: e.trajectory,
        separationOutcome: e.separationOutcome,
        animating: false,
      }
    }
    if (e.type === 'throw_success') {
      discPosition = e.discPosition
      discHolderId = e.receiverId ?? e.toId
      if (e.discYMeters != null) discYMeters = e.discYMeters
      if (e.offenseFieldPositions?.length) {
        offenseFieldSnapshot = e.offenseFieldPositions
      }
      lastThrow = {
        ...lastThrow,
        success: true,
        animating: true,
        throwType: e.throwType ?? lastThrow?.throwType,
        trajectory: e.trajectory ?? lastThrow?.trajectory,
      }
    }
    if (e.type === 'throw_fail') {
      lastThrow = {
        ...lastThrow,
        success: false,
        animating: true,
        throwType: e.throwType ?? lastThrow?.throwType,
        trajectory: e.trajectory ?? lastThrow?.trajectory,
      }
    }
    if (e.type === 'turnover') {
      possession = e.newPossession
      discPosition = e.discPosition
      discHolderId = null
      stallCount = 0
      offenseFieldSnapshot = null
      personMatchupPairs = null
      if (e.discYMeters != null) discYMeters = e.discYMeters
      lastThrow = { ...lastThrow, turnover: true, animating: true }
    }
    if (e.type === 'point_start') {
      if (e.homeLineupIds) homeOnField.splice(0, homeOnField.length, ...e.homeLineupIds)
      if (e.awayLineupIds) awayOnField.splice(0, awayOnField.length, ...e.awayLineupIds)
    }
  }

  const currentEvent = pointEvents[stepIndex] ?? null
  const animatingThrow =
    !!lastThrow?.animating &&
    (currentEvent?.type === 'throw_success' || currentEvent?.type === 'throw_fail')

  const resolveLineup = (ids, team) =>
    (ids ?? [])
      .map((id) => playerById(team, id))
      .filter(Boolean)

  let homePlayers = resolveLineup(homeOnField, homeTeam)
  let awayPlayers = resolveLineup(awayOnField, awayTeam)

  if (!homePlayers.length && pointEvents[0]?.homeLineupIds) {
    homePlayers = resolveLineup(pointEvents[0].homeLineupIds, homeTeam)
  }
  if (!awayPlayers.length && pointEvents[0]?.awayLineupIds) {
    awayPlayers = resolveLineup(pointEvents[0].awayLineupIds, awayTeam)
  }

  const geoPossession = geoTeam(possession, sidesSwapped)
  const discMeters = discMetersFromState(discPosition, geoPossession)
  const attackSign = attackDirectionX(geoPossession)

  const { attackStyle, defenseStyle, personMark } = resolveFieldTactics(
    possession,
    homeTeam,
    awayTeam,
    currentEvent,
    pullTeam,
  )

  const activeThrowerId = throwerId ?? discHolderId
  const defenseTeamObj = possession === 'home' ? awayTeam : homeTeam
  const forceSide = resolveMarkForceSide(defenseTeamObj, currentEvent)

  const defensePlayers = possession === 'home' ? awayPlayers : homePlayers
  const personMatchups =
    personMark && personMatchupPairs?.length
      ? (() => {
          const byId = new Map(defensePlayers.map((p) => [p.id, p]))
          const map = new Map()
          for (const pair of personMatchupPairs) {
            if (pair?.offenseId == null || pair?.defenderId == null) continue
            const def = byId.get(pair.defenderId)
            if (def) map.set(pair.offenseId, def)
          }
          return map.size ? map : null
        })()
      : null

  const homeOffense = possession === 'home'
  const layoutOpts = {
    attackStyle,
    defenseStyle,
    throwerId: homeOffense ? activeThrowerId : null,
    attackSign,
    discYMeters,
    forceSide: homeOffense ? forceSide : FORCE_SIDES.FORCE_FOREHAND,
    defenseTactics: defenseTeamObj?.tactics,
  }
  const awayLayoutOpts = {
    attackStyle,
    defenseStyle,
    throwerId: !homeOffense ? activeThrowerId : null,
    attackSign,
    discYMeters,
    forceSide: homeOffense ? FORCE_SIDES.FORCE_FOREHAND : forceSide,
    defenseTactics: defenseTeamObj?.tactics,
  }

  let homeLayout
  let awayLayout
  if (homeOffense) {
    homeLayout = layoutPlayersOnField(
      homePlayers,
      'home',
      discMeters,
      true,
      layoutOpts,
    )
    awayLayout = layoutPlayersOnField(
      awayPlayers,
      'away',
      discMeters,
      false,
      {
        ...awayLayoutOpts,
        offenseLayout: homeLayout,
        personMark,
        personMatchups,
      },
    )
  } else {
    awayLayout = layoutPlayersOnField(
      awayPlayers,
      'away',
      discMeters,
      true,
      awayLayoutOpts,
    )
    homeLayout = layoutPlayersOnField(
      homePlayers,
      'home',
      discMeters,
      false,
      {
        ...layoutOpts,
        offenseLayout: awayLayout,
        personMark,
        personMatchups,
      },
    )
  }

  const phase =
    currentEvent?.type === 'throw_attempt' ? 'attempt' : 'result'
  const cutCtx = {
    lastThrow,
    separationOutcome: separationOutcome ?? lastThrow?.separationOutcome,
    animatingThrow,
    phase,
  }
  homeLayout = enrichPlayersWithCutting(homeLayout, cutCtx)
  awayLayout = enrichPlayersWithCutting(awayLayout, cutCtx)

  const receiverFieldY =
    currentEvent?.targetFieldY ??
    currentEvent?.discYMeters ??
    (currentEvent?.type === 'throw_success' ? currentEvent.discYMeters : null)
  const receiverIdForY =
    currentEvent?.receiverId ?? lastThrow?.toId ?? null
  if (receiverFieldY != null && receiverIdForY) {
    const applyReceiverY = (layout) =>
      layout.map((p) => (p.id === receiverIdForY ? { ...p, y: receiverFieldY } : p))
    homeLayout = applyReceiverY(homeLayout)
    awayLayout = applyReceiverY(awayLayout)
  }

  if (discHolderId) {
    const pinHolderY = (layout) =>
      layout.map((p) => (p.id === discHolderId ? { ...p, y: discYMeters } : p))
    homeLayout = pinHolderY(homeLayout)
    awayLayout = pinHolderY(awayLayout)
  }

  if (offenseFieldSnapshot?.length) {
    const snapById = new Map(offenseFieldSnapshot.map((p) => [p.id, p]))
    const applySnapshot = (layout, teamId) => {
      if (teamId !== possession) return layout
      return layout.map((p) => {
        const s = snapById.get(p.id)
        if (!s) return p
        return { ...p, x: s.x, y: s.y }
      })
    }
    homeLayout = applySnapshot(homeLayout, 'home')
    awayLayout = applySnapshot(awayLayout, 'away')
  }

  // Snapshot / pin Y rusza O — D musi wrócić na swoje marki (szczególnie stall mark).
  if (personMark) {
    if (homeOffense) {
      awayLayout = resyncDefenseMarksToOffense(awayLayout, homeLayout, attackSign, forceSide)
    } else {
      homeLayout = resyncDefenseMarksToOffense(homeLayout, awayLayout, attackSign, forceSide)
    }
  }

  let discX = discMeters
  let discY = discYMeters
  let discFromX = discX
  let discFromY = discY
  let throwPathPoints = null

  const allLayout = [...homeLayout, ...awayLayout]

  if (lastThrow?.fromId && lastThrow?.animating) {
    const fromP = allLayout.find((p) => p.id === lastThrow.fromId)
    const toP = lastThrow.toId ? allLayout.find((p) => p.id === lastThrow.toId) : null
    if (fromP) {
      discFromX = fromP.x
      discFromY = fromP.y
    }
    if (lastThrow.success && toP) {
      discX = toP.x
      discY = toP.y
    } else if (lastThrow.turnover || !lastThrow.success) {
      discX = discMeters
      discY = discYMeters
    }
    throwPathPoints = buildThrowPathPoints(
      discFromX,
      discFromY,
      discX,
      discY,
      lastThrow.trajectory,
      lastThrow.throwType,
    )
  } else if (discHolderId) {
    const holder = allLayout.find((p) => p.id === discHolderId)
    if (holder) {
      discX = holder.x
      discY = holder.y
      discFromX = holder.x
      discFromY = holder.y
      throwerId = discHolderId
    }
  }

  const badgeThrower =
    allLayout.find((p) => p.id === (throwerId ?? discHolderId ?? lastThrow?.fromId)) ?? null

  const { homeLineupIds, awayLineupIds } = fieldLineupIdsFromPointEvents(pointEvents)

  return {
    possessionTeam: possession,
    sidesSwapped,
    discMeters,
    discPosition,
    discX,
    discY,
    discFromX,
    discFromY,
    homePlayers: homeLayout,
    awayPlayers: awayLayout,
    homeLineupIds,
    awayLineupIds,
    lastThrow,
    throwType: lastThrow?.throwType ?? currentEvent?.throwType ?? null,
    trajectory: lastThrow?.trajectory ?? currentEvent?.trajectory ?? null,
    stallCount,
    separationOutcome: separationOutcome ?? lastThrow?.separationOutcome ?? null,
    actionLabel: actionLabelForEvent(currentEvent),
    throwPathPoints,
    throwPathD: throwPathPoints ? pointsToPathD(throwPathPoints) : null,
    animatingThrow,
    throwerBadge: badgeThrower ? { x: badgeThrower.x, y: badgeThrower.y } : null,
    animationKey: `${stepIndex}-${currentEvent?.id ?? 0}`,
    currentEventType: currentEvent?.type ?? null,
    attackStyle,
    defenseStyle,
    personMark,
  }
}

export function animatableEventIndices(pointEvents) {
  const indices = []
  pointEvents.forEach((e, i) => {
    if (
      [
        'pull',
        'possession',
        'separation',
        'stall_pressure',
        'stall_out',
        'throw_attempt',
        'throw_success',
        'throw_fail',
        'turnover',
        'score',
      ].includes(e.type)
    ) {
      indices.push(i)
    }
  })
  return indices
}
