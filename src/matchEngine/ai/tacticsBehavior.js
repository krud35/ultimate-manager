/**
 * Behawioralne konsekwencje taktyk dla AI (cutter / thrower / defender).
 * Źródło wiedzy: src/data/tacticsGuide.js — tu mapujemy zasady na liczby.
 */
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
  attackMods,
  defenseMods,
  forceMods,
} from '../tacticsModifiers.js'
import {
  attackDirectionX,
  clampFieldX,
  clampFieldY,
  fieldCenterY,
  FIELD_DIMENSIONS,
} from '../fieldDimensions.js'
import { openSideSign } from './offenseReorganization.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { subStat } from './statFormulas.js'

export function maxConcurrentCutters(attackStyle) {
  const m = attackMods(attackStyle)
  return Math.max(1, Math.min(4, Math.round(m.cutConcurrency ?? 2)))
}

export function throwReleaseGateMultiplier(attackStyle, defenseStyle = null) {
  let m = attackMods(attackStyle).releaseGateMult ?? 1
  if (defenseStyle) {
    const def = defenseMods(defenseStyle)
    // Vs zone: więcej cierpliwości (swing / dziura).
    if (def.zoneKind) m *= 1.28
    // Choppy person (clam / AP): gdy jest okno — szybciej, zanim poach zamknie.
    else if ((def.poachTendency ?? 0) >= 0.2) m *= 0.88
  }
  return m
}

/** Extra ms cierpliwości handlera (composure + decisionMaking). */
export function throwerPatienceBonusMs(thrower) {
  if (!thrower) return 0
  const decision = subStat(thrower, 'mental', 'decisionMaking')
  const composure = subStat(thrower, 'mental', 'composure')
  // Elita czeka dłużej na czysty look; słaby rzuca nerwowo wcześniej.
  return Math.round(((decision + composure) / 2 - 50) * 10)
}

/** Korekta oceny opcji rzutu pod styl ataku i force. */
export function applyAttackThrowBias(score, ctx) {
  const {
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    defenseStyle = DEFENSE_STYLES.PERSON,
    forwardProgress = 0,
    throwDistanceM = 0,
    isDump = false,
    separation = 0,
    isOpenSide = true,
    receiverY = null,
  } = ctx

  const atk = attackMods(attackStyle)
  const force = forceMods(forceSide)
  const def = defenseMods(defenseStyle)
  let s = score

  // Głębokość vs kontrola
  if (forwardProgress >= 12 || throwDistanceM >= 18) {
    s += (atk.throwDepthBias ?? 0) * 28
    s += (force.huckLaneOpen ?? 0) * 22
    if (def.baitDeep) s += 6
    if (def.antiVertBonus && attackStyle === ATTACK_STYLES.VERTICAL_STACK) {
      s -= def.antiVertBonus * 0.55
    }
  } else if (forwardProgress < 2 && isDump) {
    s += (atk.resetPriority ?? 0) * 18
  }

  // Motion / hex: premiuj bliskie kontynuacje
  if ((atk.continuationUrgency ?? 0) > 0.4 && forwardProgress >= 1 && throwDistanceM < 14) {
    s += atk.continuationUrgency * 16
  }

  // Zone O: swinguj i szukaj dziur
  if (atk.swingBias && Math.abs(forwardProgress) < 4 && throwDistanceM < 12) {
    s += atk.swingBias * 14
  }

  // Straight-up: shorty na obie strony łatwiejsze, deep trudniejsze
  if (force.bothSidesShort && throwDistanceM < 12) {
    s += force.bothSidesShort * 14
  }
  if (force.markStraight && throwDistanceM >= 20) {
    s -= 18
  }

  // Sideline trap: karz rzuty przy linii (zasada turnoverów)
  if ((force.sidelineTrap ?? 0) > 0.2 && receiverY != null) {
    const edge = Math.min(receiverY, FIELD_DIMENSIONS.widthM - receiverY)
    if (edge < 6) s -= force.sidelineTrap * 16
  }

  // Clam vs vert: open lane mniej atrakcyjny
  if (def.antiVertBonus && attackStyle === ATTACK_STYLES.VERTICAL_STACK && isOpenSide) {
    if (separation < 4) s -= 8
  }

  // Iso bias: nagradzaj samotnego cuttera z przestrzenią
  if ((atk.isoBias ?? 0) > 0 && separation >= 4.5 && forwardProgress >= 4) {
    s += atk.isoBias * 20
  }

  return s
}

/**
 * Cel strukturalny zależny od formacji ataku.
 * Indeksy muszą zgadzać się z layoutOffense* w fieldViz.js
 * (0 = thrower; dump tylko gdy isDump / layout ustawił fieldRole dump).
 */
export function formationStructuralTarget({
  attackStyle = ATTACK_STYLES.VERTICAL_STACK,
  x,
  y,
  disc,
  throwerPos,
  forceSide,
  possessionTeam,
  stackIndex = 2,
  isDump = false,
  rng,
}) {
  if (!disc) return { x, y }
  const attackSign = attackDirectionX(possessionTeam)
  const ox = throwerPos?.x ?? disc.x
  const oy = throwerPos?.y ?? disc.y
  const cy = fieldCenterY()
  const w = FIELD_DIMENSIONS.widthM
  const openSign = openSideSign(forceSide, y)
  const r = rng?.float ? rng.float() : 0.5

  // Dump/reset — tylko gdy layout / podrola oznaczyły dump (nie hardcoduj index==1:
  // zone O i horizontal mają handlery na 1–2 bez roli dump).
  if (isDump) {
    return {
      x: clampFieldX(ox - attackSign * (5.5 + r)),
      y: clampFieldY(oy + openSign * (4 + r * 2)),
    }
  }

  // Klasyczny 2-handler: index 1 = dump w layoutcie; gdy brak flagi, i tak trzymaj dump shape
  const twoHandlerDumpFallback =
    stackIndex === 1 &&
    attackStyle !== ATTACK_STYLES.ZONE_OFFENSE &&
    attackStyle !== ATTACK_STYLES.HORIZONTAL_STACK &&
    attackStyle !== ATTACK_STYLES.MOTION_OFFENSE
  if (twoHandlerDumpFallback) {
    return {
      x: clampFieldX(ox - attackSign * (5.5 + r)),
      y: clampFieldY(oy + openSign * (4 + r * 2)),
    }
  }

  const cutterFrom2 = Math.max(0, (stackIndex ?? 2) - 2)

  switch (attackStyle) {
    case ATTACK_STYLES.HORIZONTAL_STACK: {
      // 3 handlery w linii (0 środek, 1 i 2 boki), cuttery od 3
      if (stackIndex === 1) {
        return {
          x: clampFieldX(ox),
          y: clampFieldY(cy - (5.5 + r * 0.5)),
        }
      }
      if (stackIndex === 2) {
        return {
          x: clampFieldX(ox),
          y: clampFieldY(cy + (5.5 + r * 0.5)),
        }
      }
      const cutterSlot = Math.max(0, (stackIndex ?? 3) - 3)
      const cutterY = [w * 0.14, w * 0.38, w * 0.62, w * 0.86]
      return {
        x: clampFieldX(ox + attackSign * (12 + (cutterSlot % 2) * 2)),
        y: clampFieldY(cutterY[cutterSlot % 4] ?? cy),
      }
    }
    case ATTACK_STYLES.MOTION_OFFENSE: {
      // 3. handler blisko dysku (jak w ho-stack); reszta w ruchu wokół
      if (stackIndex === 1 || stackIndex === 2) {
        return {
          x: clampFieldX(ox + attackSign * (1.5 + r)),
          y: clampFieldY(cy + (stackIndex === 1 ? -1 : 1) * (5.5 + r)),
        }
      }
      const angles = [-120, -60, 0, 60, 120, 180]
      const motionSlot = Math.max(0, (stackIndex ?? 3) - 3)
      const a = (angles[motionSlot % 6] * Math.PI) / 180
      const radius = 7 + r * 3
      return {
        x: clampFieldX(ox + Math.cos(a) * attackSign * radius),
        y: clampFieldY(oy + Math.sin(a) * radius),
      }
    }
    case ATTACK_STYLES.SPLIT_STACK: {
      const side = cutterFrom2 % 2 === 0 ? 1 : -1
      const depth = 8 + Math.floor(cutterFrom2 / 2) * 7
      return {
        x: clampFieldX(ox + attackSign * depth),
        y: clampFieldY(cy + side * (8 + (cutterFrom2 % 2) * 3)),
      }
    }
    case ATTACK_STYLES.SIDE_STACK: {
      // Layout: 0 thrower, 1 dump, 2 iso, 3+ flood
      const floodSign = -openSign
      if (stackIndex === 2 || cutterFrom2 === 0) {
        return {
          x: clampFieldX(ox + attackSign * (12 + r * 6)),
          y: clampFieldY(cy + openSign * (10 + r * 3)),
        }
      }
      const floodIdx = Math.max(0, (stackIndex ?? 3) - 3)
      return {
        x: clampFieldX(ox + attackSign * (7 + floodIdx * 5)),
        y: clampFieldY(cy + floodSign * (6 + (floodIdx % 2) * 3)),
      }
    }
    case ATTACK_STYLES.HEX_OFFENSE: {
      // Layout: kąty [0,60,120,180,-120,-60] dla i-1
      const angles = [0, 60, 120, 180, -120, -60]
      const hexSlot = Math.max(0, (stackIndex ?? 1) - 1)
      const a = (angles[hexSlot % 6] * Math.PI) / 180
      const radius = 9
      return {
        x: clampFieldX(ox + Math.cos(a) * attackSign * radius),
        y: clampFieldY(oy + Math.sin(a) * radius),
      }
    }
    case ATTACK_STYLES.ZONE_OFFENSE: {
      // Layout: 1–2 handlery flat, 3 popper, 4+ wings
      if (stackIndex === 1 || stackIndex === 2) {
        return {
          x: clampFieldX(ox + attackSign * 2),
          y: clampFieldY(cy + (stackIndex === 1 ? -8 : 8)),
        }
      }
      if (stackIndex === 3) {
        return { x: clampFieldX(ox + attackSign * 9), y: clampFieldY(cy) }
      }
      const wingIdx = Math.max(0, (stackIndex ?? 4) - 4)
      return {
        x: clampFieldX(ox + attackSign * (14 + wingIdx * 4)),
        y: clampFieldY(cy + (stackIndex % 2 === 0 ? 11 : -11)),
      }
    }
    case ATTACK_STYLES.VERTICAL_STACK:
    default: {
      const depth = 9 + cutterFrom2 * 6
      return {
        x: clampFieldX(ox + attackSign * depth),
        y: clampFieldY(cy + openSign * (cutterFrom2 % 2 === 0 ? 2 : -2)),
      }
    }
  }
}

/** Preferowany rodzaj cutu pod formację. */
export function preferredCutKind(attackStyle, stackIndex, rng) {
  const r = rng?.float ? rng.float() : 0.5
  const atk = attackMods(attackStyle)
  if (attackStyle === ATTACK_STYLES.HORIZONTAL_STACK) {
    // Diamond / lane cuts z linii cutterów (stackIndex 3+)
    if (stackIndex <= 2) return r < 0.35 ? 'in' : 'deep'
    if (stackIndex === 3 || stackIndex === 4) return r < 0.5 ? 'in' : 'deep'
    return r < 0.4 ? 'deep' : 'in'
  }
  if (attackStyle === ATTACK_STYLES.MOTION_OFFENSE) {
    if (stackIndex <= 2) return r < 0.55 ? 'in' : 'deep'
    return r < 0.65 ? 'in' : 'deep'
  }
  if (attackStyle === ATTACK_STYLES.ZONE_OFFENSE && stackIndex <= 2) {
    return r < 0.6 ? 'in' : 'deep'
  }
  if (attackStyle === ATTACK_STYLES.SIDE_STACK && stackIndex === 2) {
    return r < 0.55 ? 'deep' : 'in'
  }
  if (attackStyle === ATTACK_STYLES.HEX_OFFENSE) {
    return r < 0.65 ? 'in' : 'deep'
  }
  if ((atk.throwDepthBias ?? 0) > 0.2) return r < 0.48 ? 'deep' : 'in'
  return r < 0.38 ? 'deep' : 'in'
}

/**
 * Test poacha: vision + reactions. Zwraca true jeśli obrońca rzuca assignment.
 * Celowo trudny i rzadki — poach to high-risk exception, nie default movement.
 */
export function shouldAttemptPoach(defender, ctx) {
  const {
    defenseStyle = DEFENSE_STYLES.PERSON,
    distToDisc = 99,
    distToLane = 99,
    separationToMark = 0,
    stallCount = 1,
    canPoachRole = false,
    activePoachers = 0,
    rng,
    defenseTactics = null,
  } = ctx
  const def = defenseMods(defenseStyle)
  const tendency = def.poachTendency ?? 0
  if (tendency <= 0) return false
  if (!canPoachRole) return false
  const maxPoachers = def.maxPoachers ?? 1
  if (activePoachers >= maxPoachers) return false

  // Tylko realnie blisko passing lane / dysku — nie „poach z deep stacka”.
  if (distToDisc > 9 && distToLane > 3.5) return false
  // Nie zostawiaj człowieka, który już jest otwarty / którego gubisz.
  if (separationToMark > 3.2) return false

  const vision = subStatFromPlayer(defender, 'mental', 'vision')
  const reactions = subStatFromPlayer(defender, 'mental', 'reactions')
  const skill = (vision * 0.55 + reactions * 0.45) / 100
  const traitPoach =
    mergeTraitAndCoachMods(defender, defenseTactics, 'defense').poachChanceMult ?? 1
  // Elita (~80): ~tendency*0.35; przeciętny (~55): ~tendency*0.22 na probe.
  const chance =
    tendency *
    (0.08 + skill * 0.32) *
    (distToLane < 2.5 ? 1.25 : 1) *
    (stallCount >= 6 ? 1.2 : 0.85) *
    traitPoach
  const roll = rng?.float ? rng.float() : 1
  return roll < Math.min(0.22, chance)
}

function subStatFromPlayer(player, category, key) {
  const v = player?.skills?.[category]?.[key]
  return typeof v === 'number' ? v : 50
}

export { attackMods, defenseMods, forceMods, ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES }
