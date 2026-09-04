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
import { openSideSign , resetSlotTarget } from './offenseReorganization.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { subStat } from './statFormulas.js'

export function maxConcurrentCutters(attackStyle) {
  const m = attackMods(attackStyle)
  return Math.max(1, Math.min(4, Math.round(m.cutConcurrency ?? 2)))
}

/** Stałe sloty strefy (7v7): 1 marker, 2 cup, 2 wing, 1 middle, 1 deep. */
export const ZONE_SLOT_ROLES = new Set([
  'zone_marker',
  'zone_cup',
  'zone_wing',
  'zone_middle',
  'zone_deep',
])

/** Kolejność slotów wg stackIndex (0-6) przy budowie linii strefowej. */
export const ZONE_SLOT_ORDER = [
  'zone_marker',
  'zone_cup',
  'zone_cup',
  'zone_wing',
  'zone_wing',
  'zone_middle',
  'zone_deep',
]

/**
 * KSZTAŁT STREFY — trzy ciała na łuku wokół rzucającego, plus druga linia i deep.
 *
 * Cup jest ROZSZERZENIEM MARKERA, nie osobną formacją: marker stoi na rzucającym
 * (forceMarkPosition, ~0.55 m), a dwaj „cupowcy" domykają łuk po jego bokach. Razem
 * zasłaniają ciałami konkretną przestrzeń rzutu do przodu — bramka między sąsiednimi
 * ciałami wychodzi ~3 m, czyli tyle, ile realnie trzeba przerzucić albo obejść.
 *
 * Poprzedni kształt (2 sloty po ±5 m od ŚRODKA BOISKA, na sztywno 3 m przed dyskiem)
 * dawał zmierzony rozstaw 9.97 m — dziesięciometrową bramę prosto przed rzucającym,
 * przez którą przechodziło 82% podań przy 96% skuteczności. Sloty były też kotwiczone
 * do osi boiska, nie do dysku, więc przy dysku na linii bocznej cup w ogóle nie stał
 * przed rzucającym.
 *
 * Druga linia (wing/middle) i deep NIE stoją już na stałych offsetach: dostają
 * `threats` (pozycje ataku) i przesuwają się w stronę realnego zagrożenia w swoim
 * rejonie — to jest cały sens strefy („bronię przestrzeni, ale patrzę, kto w nią
 * wbiega"). Bez `threats` (seed na klatkę 0 w fieldViz.layoutDefenseZoneCup) wychodzi
 * czysta geometria, jak dawniej.
 *
 * `roleSlotIndex` odróżnia lewy/prawy człon cup i wing — 0-based indeks W OBRĘBIE
 * roli (który z dwóch "zone_cup", nie surowy stackIndex w linii), bo gracz może być
 * ręcznie przypisany do cupa/winga z dowolnej pozycji w lineup (patrz
 * defenseZoneRoles.js resolveTeamZoneSlots).
 * `zoneKind`: 'cup' (ciasny łuk 3 m) | 'wall' (junk/arrowhead — szerszy i płytszy).
 */
export const ZONE_SHAPE = {
  cup: {
    /** Promień łuku cupa od dysku (m) — marker jest trzecim ciałem tego łuku. */
    cupRadiusM: 3.6,
    /** Rozwarcie łuku: kąt cupowca od osi ataku (rad). 0.85 ≈ 49° → rozstaw ~5.4 m. */
    cupHalfAngleRad: 0.85,
    /** Obrót całego łuku w stronę open side — cup zabiera lane, na który force wypycha. */
    cupForceRotationRad: 0.22,
    /** W jakim promieniu cupowiec szuka wbiegającego, żeby przesunąć się po łuku (m). */
    cupShadeRadiusM: 5,
    /** Maksymalne przesunięcie po łuku DO ŚRODKA (rad): 0.35 ≈ 20°, ~1.2 m wzdłuż łuku. */
    cupShadeMaxRad: 0.35,
    /** Na zewnątrz łuku — dużo mniej, bo krok w bok jest jednocześnie krokiem do tyłu. */
    cupShadeOutRad: 0.12,
    secondLineM: 9,
    /** Rozstaw wingów od LANE DYSKU (nie od osi boiska). */
    wingSpreadM: 8.5,
    /** Jak daleko za najgłębszym atakującym stoi deep. */
    deepBehindM: 5,
    deepMinAheadM: 16,
    deepMaxAheadM: 32,
  },
  wall: {
    cupRadiusM: 4.8,
    cupHalfAngleRad: 1.12,
    cupForceRotationRad: 0.14,
    cupShadeRadiusM: 6,
    cupShadeMaxRad: 0.3,
    cupShadeOutRad: 0.1,
    secondLineM: 11,
    wingSpreadM: 10,
    deepBehindM: 5,
    deepMinAheadM: 18,
    deepMaxAheadM: 32,
  },
}

/** Najgroźniejszy atakujący dla danego slotu: najbliższy kotwicy, w promieniu. */
function nearestThreat(threats, atX, atY, radiusM) {
  let best = null
  let bestD = radiusM
  for (const t of threats) {
    if (!t || t.isThrower) continue
    const d = Math.hypot(t.x - atX, t.y - atY)
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** Przesuwa kotwicę w stronę zagrożenia, osobno wzdłuż i w poprzek boiska. */
function shadeToward(base, threat, alongFrac, acrossFrac) {
  if (!threat) return base
  return {
    x: base.x + (threat.x - base.x) * alongFrac,
    y: base.y + (threat.y - base.y) * acrossFrac,
  }
}

export function zoneStructuralTarget(
  fieldRole,
  roleSlotIndex,
  {
    discX = 0,
    discY = null,
    attackSign = 1,
    zoneKind = 'cup',
    /** ±1: w którą stronę boiska force wypuszcza rzut (openSideSign). 0 = brak force. */
    openSideSign = 0,
    /** [{ id, x, y, isThrower }] — pozycje ataku w tym ticku. */
    threats = null,
  } = {},
) {
  const cy = fieldCenterY()
  const dY = discY ?? cy
  const sign = Math.sign(attackSign) || 1
  const S = ZONE_SHAPE[zoneKind] ?? ZONE_SHAPE.cup
  // Strefa broni przestrzeni PRZED dyskiem. Zawodnik cofnięty za dysk (reset) jest
  // świadomie oddawany — inaczej shading ciągnąłby drugą linię do tyłu i cup przestawał
  // stać przed rzucającym (zmierzone przy pierwszej wersji: cup 0.2 m przed dyskiem,
  // „przełamany" w 64% rzutów).
  const live = Array.isArray(threats)
    ? threats.filter((t) => t && !t.isThrower && (t.x - discX) * sign > -2)
    : []

  if (fieldRole === 'zone_marker') {
    // Tylko seed — realny ruch markera liczy forceMarkPosition (tickDefenderBrain,
    // isMarkerOnThrower), bo marker jako jedyny slot kryje konkretną osobę.
    return { x: clampFieldX(discX + sign * 0.6), y: clampFieldY(dY) }
  }

  if (fieldRole === 'zone_cup') {
    const side = roleSlotIndex === 0 ? -1 : 1
    let angle = side * S.cupHalfAngleRad + openSideSign * S.cupForceRotationRad
    // Cupowiec reaguje na wbiegającego PO ŁUKU — przesuwa się wzdłuż niego, nie schodzi
    // z niego do krycia osobowego. Kiedy wolno mu było gonić człowieka jak reszcie
    // strefy, łuk przestawał istnieć: zmierzony cupowiec stał 0.6 m przed dyskiem
    // zamiast 1.9 m i w 37% rzutów był już za dyskiem.
    const baseX = discX + sign * S.cupRadiusM * Math.cos(angle)
    const baseY = dY + S.cupRadiusM * Math.sin(angle)
    const threat = nearestThreat(live, baseX, baseY, S.cupShadeRadiusM)
    if (threat) {
      const bearing = Math.atan2(threat.y - dY, (threat.x - discX) * sign)
      // Do środka łuku wolno się przesunąć szeroko, na zewnątrz prawie wcale: krok w bok
      // od osi to jednocześnie krok DO TYŁU (x = R·cos kąta), a cupowiec, który zejdzie
      // na skrzydło, stoi już tylko obok rzucającego i nie zasłania nic z przodu.
      const raw = bearing - angle
      const outward = side > 0 ? S.cupShadeOutRad : -S.cupShadeOutRad
      const inward = side > 0 ? -S.cupShadeMaxRad : S.cupShadeMaxRad
      const lo = Math.min(outward, inward)
      const hi = Math.max(outward, inward)
      angle += Math.max(lo, Math.min(hi, raw))
    }
    return {
      x: clampFieldX(discX + sign * S.cupRadiusM * Math.cos(angle)),
      y: clampFieldY(dY + S.cupRadiusM * Math.sin(angle)),
    }
  }

  if (fieldRole === 'zone_wing') {
    const side = roleSlotIndex === 0 ? -1 : 1
    const base = {
      x: clampFieldX(discX + sign * S.secondLineM),
      y: clampFieldY(dY + side * S.wingSpreadM),
    }
    // Wing kryje swing i under po SWOJEJ stronie — dociąga się do tego, kto tam wbiega.
    const threat = nearestThreat(live, base.x, base.y, 11)
    const shaded = shadeToward(base, threat, 0.3, 0.5)
    return { x: clampFieldX(shaded.x), y: clampFieldY(shaded.y) }
  }

  if (fieldRole === 'zone_middle') {
    const base = { x: clampFieldX(discX + sign * S.secondLineM), y: clampFieldY(dY) }
    const threat = nearestThreat(live, base.x, base.y, 9)
    const shaded = shadeToward(base, threat, 0.35, 0.55)
    return { x: clampFieldX(shaded.x), y: clampFieldY(shaded.y) }
  }

  if (fieldRole === 'zone_deep') {
    // Deep gra WZGLĘDEM najgłębszego atakującego, nie na stałym offsecie 24 m. Sztywne
    // 24 m robiło z niego niepokonywalną ścianę (zmierzone: huck spadał z 5.3% podań
    // przy person do 0.0-0.4% przy strefie — deep kasował bombę za darmo).
    let deepest = null
    let deepestAhead = -Infinity
    for (const t of live) {
      const ahead = (t.x - discX) * sign
      if (ahead > deepestAhead) {
        deepestAhead = ahead
        deepest = t
      }
    }
    const aheadM = Math.max(
      S.deepMinAheadM,
      Math.min(S.deepMaxAheadM, (Number.isFinite(deepestAhead) ? deepestAhead : 19) + S.deepBehindM),
    )
    const targetY = deepest ? dY * 0.35 + deepest.y * 0.65 : cy + (dY - cy) * 0.3
    return { x: clampFieldX(discX + sign * aheadM), y: clampFieldY(targetY) }
  }

  return { x: clampFieldX(discX), y: clampFieldY(dY) }
}

/**
 * Mnożnik czasu skanowania boiska przed wypuszczeniem dysku.
 *
 * Człon STYLU ATAKU został stąd usunięty (dawniej `attackMods(style).releaseGateMult`,
 * wartości 0.62-1.25). Po naprawie doboru celu cutu przez mapę przestrzeni okazał się
 * jedyną rzeczą, która realnie decydowała o udziale hucków — zmierzona korelacja przez
 * wszystkie 7 stylów była monotoniczna: 1.25 -> 16.7% hucków, 1.20 -> 20.8, 1.15 -> 8.2,
 * 1.05 -> 6.1, 0.95 -> 2.3, 0.72 -> 0.1, 0.62 -> 0.0. Formacja dyktowała więc wynik
 * rzutowy z tabeli stałych, a nie przez to, co dzieje się na boisku: horizontal stack ma
 * najwięcej pustej przestrzeni deep ze wszystkich stacków i mimo to hucował najmniej,
 * bo rzucający wypuszczał dysk, zanim ktokolwiek zdążył tam wybiec.
 *
 * Zostaje ODCZYT OBRONY — to czytanie realnej sytuacji, nie tożsamość formacji. Tempo
 * gry ma teraz wychodzić z tego, jak szybko pojawia się dobra opcja: przy ciasnym
 * ustawieniu (motion/hex) bliska opcja pojawia się od razu, więc dysk i tak schodzi
 * szybko — bez odgórnego skracania skanowania.
 */
export function throwReleaseGateMultiplier(attackStyle, defenseStyle = null) {
  let m = 1
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
    return resetSlotTarget({ disc, throwerPos: { x: ox, y: oy }, attackSign, forceSide, rng })
  }

  // Klasyczny 2-handler: index 1 = dump w layoutcie; gdy brak flagi, i tak trzymaj dump shape
  const twoHandlerDumpFallback =
    stackIndex === 1 &&
    attackStyle !== ATTACK_STYLES.ZONE_OFFENSE &&
    attackStyle !== ATTACK_STYLES.HORIZONTAL_STACK &&
    attackStyle !== ATTACK_STYLES.MOTION_OFFENSE
  if (twoHandlerDumpFallback) {
    return resetSlotTarget({ disc, throwerPos: { x: ox, y: oy }, attackSign, forceSide, rng })
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
  const traitMult = mergeTraitAndCoachMods(defender, defenseTactics, 'defense').poachChanceMult ?? 1
  // Zawodnik z cechą `poacher` albo instrukcją `poach` poachuje NIEZALEŻNIE od stylu:
  // w zwykłym person defence tendencja stylu to 0.09, więc cecha nie miała czego mnożyć.
  // Taki zawodnik reaguje też na cuty daleko od dysku (deep help, zamykanie open side),
  // czego dawna bramka „tylko blisko dysku lub lane'u" zabraniała z definicji.
  const dedicatedPoacher = !globalThis.__OFF_PREPOACH && traitMult >= 1.3
  const tendency = Math.max(def.poachTendency ?? 0, dedicatedPoacher ? 0.24 : 0)
  if (tendency <= 0) return false
  if (!canPoachRole && !dedicatedPoacher) return false
  const maxPoachers = def.maxPoachers ?? 1
  if (activePoachers >= maxPoachers) return false

  // Blisko lane'u/dysku — albo dedykowany poacher, który może pomóc też z głębi.
  if (!dedicatedPoacher && distToDisc > 9 && distToLane > 3.5) return false
  // Nie zostawiaj człowieka, który już jest otwarty / którego gubisz.
  if (separationToMark > 3.2) return false

  const vision = subStatFromPlayer(defender, 'mental', 'vision')
  const reactions = subStatFromPlayer(defender, 'mental', 'reactions')
  const skill = (vision * 0.55 + reactions * 0.45) / 100
  const traitPoach = traitMult
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
