import { fieldCenterY } from '../fieldDimensions.js'
import { FORCE_SIDES } from '../tacticsModifiers.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'
import { CUTTER_STATE } from './cutterBrain.js'
import {
  defenderReactionDelayMs,
  maxSpeedMps,
  subStat,
} from './statFormulas.js'
import { integrateAgentMotion } from './playerMovement.js'
import { threatCellForMark, perceiveSpaceMap, poachTargetCell } from './spaceMap.js'
import {
  defenseMods,
  shouldAttemptPoach,
  zoneStructuralTarget,
  ZONE_SLOT_ROLES,
} from './tacticsBehavior.js'
import { isCloggingThrowLane } from './offenseReorganization.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'

export const DEFENDER_STATE = {
  MARKING_STALL: 'MARKING_STALL',
  COVERING_CUTTER: 'COVERING_CUTTER',
  CONTESTING_DISC: 'CONTESTING_DISC',
  RECOVERING: 'RECOVERING',
  POACHING: 'POACHING',
}

/** Opóźnienie reakcji na zmianę kierunku cuttera (ms). */
export function reactionDelayMs(player) {
  return defenderReactionDelayMs(player)
}

/**
 * Prędkość obrońcy w pościgu za swoim graczem.
 *
 * Symetryczna do prędkości cuttera w ACTIVE_CUT (cutterBrain.js), i to jest cały sens
 * tej zmiany. Cutter biegnie `maxSpeed * (0.90 + cutterMovement/100 * 0.12)`, czyli
 * 0.98-1.01x. Obrońca miał tu PŁASKIE 0.94x, niezależnie od umiejętności — był więc
 * strukturalnie 4-6% wolniejszy od krytego zawodnika, zawsze. Przy 3-sekundowym cucie
 * i 7 m/s to ~1 m separacji oddawanej ZA DARMO, zanim czas reakcji w ogóle wejdzie do
 * gry. Zmierzony skutek: 81% pierwszych looków (stall 1) było zupełnie otwartych.
 *
 * Obrońca i cutter to ci sami atleci — przewaga atakującego bierze się z tego, że ZNA
 * swój cut, a obrońca musi zareagować (reactionDelayMs) i obrócić biodra
 * (mobilityMultiplier). To jest modelowane osobno i tam ma zostać. Sama prędkość
 * maksymalna nie powinna dawać atakowi darmowej premii.
 *
 * UWAGA HISTORYCZNA: wcześniejszy komentarz w tym miejscu opisywał skalowanie
 * `defensiveCutterMovement` z zakresem 0.90-1.05x, którego kod NIE realizował (zwracał
 * płaskie 0.94) — została po wycofanej próbie i wprowadzała w błąd.
 */
function defenderSpeedMps(player) {
  const craft = 0.9 + (subStat(player, 'defensive', 'defensiveCutterMovement') / 100) * 0.12
  return maxSpeedMps(player) * craft
}

/** Dystans markera od throwera (m) — ręka / half-disc. */
export const STALL_MARK_DISTANCE_M = 0.55
/** Shade force (m) — blokuje break side, nie wygania na sideline. */
export const STALL_MARK_FORCE_SHADE_M = 0.42

/**
 * Pozycja markera: ~0.5 m od throwera, lekko w dół boiska, shade wedle force.
 * forceSide layout: home / away / middle (z forceMarkLayoutSide).
 */
export function forceMarkPosition(throwerX, throwerY, forceMark, attackSign = 1) {
  const force = normalizeForceMark(forceMark)
  const layout = forceMarkLayoutSide(force, throwerY)
  const downfield = Math.sign(attackSign || 1) || 1

  // Lekko przed throwerem (w stronę ataku) — typowy stall mark.
  let dx = downfield * 0.28
  let dy = 0

  if (layout === 'middle' || force === FORCE_SIDES.FORCE_STRAIGHT) {
    dy = 0
  } else if (layout === 'away') {
    // Force backhand (layout away): shade +Y → wymusza rzut w drugą stronę.
    dy = STALL_MARK_FORCE_SHADE_M
  } else {
    // Force forehand (layout home): shade −Y.
    dy = -STALL_MARK_FORCE_SHADE_M
  }

  // Force sideline: shade w stronę bliższej krawędzi.
  if (force === FORCE_SIDES.FORCE_SIDELINE) {
    const cy = fieldCenterY()
    dy = throwerY >= cy ? STALL_MARK_FORCE_SHADE_M : -STALL_MARK_FORCE_SHADE_M
  }

  // Force middle: lekko do środka boiska.
  if (force === FORCE_SIDES.FORCE_MIDDLE) {
    const cy = fieldCenterY()
    dy = throwerY >= cy ? -STALL_MARK_FORCE_SHADE_M * 0.85 : STALL_MARK_FORCE_SHADE_M * 0.85
  }

  const len = Math.hypot(dx, dy) || 1
  const scale = STALL_MARK_DISTANCE_M / len
  return {
    x: throwerX + dx * scale,
    y: throwerY + dy * scale,
  }
}

function moveToward(agent, tx, ty, maxSpeed, dtSec, limitTurn = true) {
  // rola 'defense': praca nóg obrońcy (agility + defensiveCutterMovement) wpływa na to,
  // ile gruntu traci przy zmianie kierunku cuttera — patrz mobilityMultiplier.
  const moved = integrateAgentMotion(agent, tx, ty, maxSpeed, dtSec, limitTurn, 'defense')
  return { ...agent, ...moved }
}

function cutterIsCutting(offenseAgent) {
  const s = offenseAgent?.state
  return s === CUTTER_STATE.ACTIVE_CUT || s === CUTTER_STATE.INITIATING_CUT
}

function cutterHeadingChanged(agent, offenseAgent) {
  if (!offenseAgent) return false
  const tx = offenseAgent.x
  const ty = offenseAgent.y
  const lx = agent.lastTargetX
  const ly = agent.lastTargetY
  if (lx == null) return cutterIsCutting(offenseAgent)
  const moved = Math.hypot(tx - lx, ty - ly)
  const cutStart = cutterIsCutting(offenseAgent) && agent.lastCutterState !== offenseAgent.state
  return moved > 1.2 || cutStart
}

function cushionedMarkGoal(agent, targetX, targetY, desiredDistM, preferredDx = 0, preferredDy = 0) {
  let dx = agent.x - targetX
  let dy = agent.y - targetY
  let dist = Math.hypot(dx, dy)
  // Z bliska wektor offsetu jest szumem — trzymaj shade w preferowanym kierunku (force).
  if (dist < 0.85) {
    const pref = Math.hypot(preferredDx, preferredDy)
    if (pref > 1e-6) {
      dx = preferredDx
      dy = preferredDy
      dist = pref
    } else if (dist < 1e-6) {
      dx = 1
      dy = 0
      dist = 1
    }
  }
  const desired = Math.max(0.5, desiredDistM)
  return {
    x: targetX + (dx / dist) * desired,
    y: targetY + (dy / dist) * desired,
  }
}

/**
 * Realny cushion krycia 1-na-1 (m) — o ile obrońca odpuszcza dystans do swojego gracza.
 *
 * UWAGA na historię tej funkcji: wcześniej kończyła się `Math.max(0, desired - 2.1)`, a
 * wywołujący dodawał `+ 2.1` z powrotem. Ponieważ podstatystyki defensywne są clampowane
 * do 70-95 (playerStats.js: CATEGORY_STAT_RANGES.defensive), `desired` wychodziło zawsze
 * 0.79-1.24, czyli PO odjęciu 2.1 zawsze 0 — cała wariancja umiejętności (a także
 * `cushionDeltaM`, czyli instrukcje tight_mark / loose_mark i dyrektywy trenera) była
 * zerowana i KAŻDY obrońca krył z identycznym cushionem 2.1 m. Jedynym działającym
 * czynnikiem było zmęczenie, bo tylko ono potrafiło przebić próg 2.1.
 * Stąd „obrona nie zależy od OVR" w audycie (scripts/engine-parity.mjs: bloki 2/mecz,
 * completion 95%+). Teraz zwracany jest wprost realny cushion.
 */
function coverageCushionM(player, defenseTactics = null) {
  const stamina = player?.currentStamina ?? 100
  const mods = mergeTraitAndCoachMods(player, defenseTactics, 'defense')
  // 70 -> ~2.2 m, 80 -> ~1.8 m, 95 -> ~1.4 m: lepszy obrońca stoi bliżej i zostawia
  // mniej miejsca, nie musząc jeszcze nic „wygrywać".
  let desired =
    4.4 -
    (subStat(player, 'defensive', 'defensiveCutterMovement') / 100) * 3.2 +
    (mods.cushionDeltaM ?? 0)
  if (stamina < 50) desired += 0.8 + ((50 - stamina) / 50) * 1.6
  // Od in (denyUnder): mniejszy cushion / bliżej under; od out: większy cushion.
  desired += (mods.denyUnderBias ?? 0) * -0.4
  return Math.max(0.9, desired)
}

/**
 * Tick obrońcy w fazie setup (przed rzutem).
 * Poach: rzadki high-risk leave assignment (głównie handler D przy lane).
 */
/** Jak mocno force przechyla shade w bok względem kierunku na najgroźniejszą przestrzeń.
 *  Obrona ma stronę, której broni — kierunek zagrożenia jej nie kasuje, tylko dominuje. */
const SHADE_FORCE_BLEND = 0.35
/** Jak mocno bias trenerski (shade deep/under) przechyla kierunek shade. */
/**
 * Siła kierunkowego shadingu (shade_deep / shade_under) — mnożnik przesunięcia celu
 * obrońcy wzdłuż osi ataku.
 *
 * Przy 1.0 instrukcja przesuwała cel o ~0.6 m, a REALIZOWANE ustawienie wychodziło
 * 0.11-0.34 m, bo obrońca goni ruchomy cel i nie dociąga go w pełni. W nowym modelu
 * freeness (wyścig do przestrzeni) 0.34 m to różnica czasów 0.05 s, czyli contest
 * o dwie setne — poniżej szumu percepcji. Shading musi przesuwać obrońcę rzędu
 * 1.5-2 m, żeby atak w ogóle zobaczył zmienioną przestrzeń.
 *
 * Skalibrowane na 3 (tmp-sweep/shade2.mjs, 16 rozproszonych seedów na wariant):
 *   1 -> shade_deep: krótkie 16.8%, długie 26.3%
 *   3 -> shade_deep: krótkie 21.3%, długie 25.1%, completion 93.6%   <- wybrane
 *   6 -> shade_deep: krótkie 21.1%, długie 24.7% (bez zysku ponad 3)
 * Baza bez instrukcji: krótkie 15.9%, długie 27.8%, completion 92.6%.
 *
 * `shade_under` przesuwa obronę poprawnie i monotonicznie (-0.36 / -0.57 / -0.74 m),
 * ale atak NIE odpowiada pójściem w głąb na żadnej skali — zamknięcie unders samo
 * z siebie nie tworzy głębokiego cutu, ktoś tam musi pobiec. Do zbadania osobno.
 */
export const SHADE_SHIFT_CAL = { scale: 3 }
export const SHADE_BIAS_CAL = { gain: 1.2 }

export function tickDefenderBrain(agent, ctx) {
  const {
    targetOffense,
    throwerAgent,
    disc,
    forceSide,
    dtSec,
    ms = 0,
    isMarkerOnThrower = false,
    defenseStyle = 'person',
    possessionTeam = 'home',
    stallCount = 1,
    rng = null,
    activePoachers = 0,
    defenseTactics = null,
    /** Mapa przestrzeni z actionSimulator — budowana RAZ na tick dla całej obrony. */
    spaceCells = null,
  } = ctx

  const player = agent.player ?? agent
  const delay = reactionDelayMs(player)
  const coachMods = mergeTraitAndCoachMods(player, defenseTactics, 'defense')
  const defProfile = defenseMods(defenseStyle)
  let state = agent.state ?? DEFENDER_STATE.COVERING_CUTTER
  let reactUntil = agent.reactUntil ?? 0
  let pendingTarget = agent.pendingTarget ?? null
  let poachUntil = agent.poachUntil ?? 0
  let poachedFromId = agent.poachedFromId ?? null

  if (isMarkerOnThrower && throwerAgent) {
    state = DEFENDER_STATE.MARKING_STALL
    const attackSign = ctx.attackSign ?? 1
    const goal = forceMarkPosition(throwerAgent.x, throwerAgent.y, forceSide, attackSign)
    const dist = Math.hypot(agent.x - goal.x, agent.y - goal.y)
    // Z daleka sprint do marka; z bliska shuffle / hold.
    const base = defenderSpeedMps(player)
    const speed = dist > 4 ? base * 1.05 : dist > 1.2 ? base * 0.7 : base * 0.45
    return {
      ...moveToward(agent, goal.x, goal.y, speed, dtSec),
      state,
      reactUntil: 0,
      pendingTarget: null,
      poachUntil: 0,
      poachedFromId: null,
      nextPoachCheckMs: agent.nextPoachCheckMs ?? 0,
      lastTargetX: throwerAgent.x,
      lastTargetY: throwerAgent.y,
      lastCutterState: throwerAgent.state,
      isActiveMark: true,
    }
  }

  const discPos = disc ?? throwerAgent
  const distToDisc = discPos
    ? Math.hypot(agent.x - discPos.x, agent.y - discPos.y)
    : 99
  const inLane =
    discPos &&
    isCloggingThrowLane(
      agent.x,
      agent.y,
      discPos,
      throwerAgent ?? discPos,
      possessionTeam,
    )
  const distToLane = inLane ? 1.5 : 8
  const sepToMark = targetOffense
    ? Math.hypot(agent.x - targetOffense.x, agent.y - targetOffense.y)
    : 0

  // Aktywny poach — krótki wypad w lane, potem recover na marka.
  if (ms < poachUntil && poachedFromId) {
    state = DEFENDER_STATE.POACHING
    // Cel poacha: realnie groźna, nieobsadzona przestrzeń — nie stały punkt przed dyskiem.
    // Dzięki temu „deep help" i zamykanie open side wychodzą z układu boiska, a nie
    // z reguły. Zostawiony zawodnik robi się przez to widoczny jako wolna opcja (jego
    // cień znika z mapy), więc poach ma realną cenę.
    const attackSignPoach = ctx.attackSign ?? 1
    const poachCell = spaceCells?.length ? poachTargetCell(spaceCells, agent) : null
    const laneX = poachCell ? poachCell.x : discPos ? discPos.x + attackSignPoach * 3.5 : agent.x
    const laneY = poachCell ? poachCell.y : discPos?.y ?? agent.y
    const next = moveToward(agent, laneX, laneY, defenderSpeedMps(player) * 1.05, dtSec)
    return {
      ...next,
      state,
      reactUntil,
      pendingTarget: null,
      poachUntil,
      poachedFromId,
      nextPoachCheckMs: poachUntil + 1800,
      lastTargetX: targetOffense?.x,
      lastTargetY: targetOffense?.y,
      lastCutterState: targetOffense?.state,
      markTargetId: agent.markTargetId ?? targetOffense?.id ?? null,
    }
  }

  // Person: tylko dump/handler D. AP/Clam: każdy blisko dysku (lane poach).
  const marksDumpOrHandler =
    !!targetOffense &&
    (targetOffense.isDump === true ||
      targetOffense.fieldRole === 'dump' ||
      targetOffense.fieldRole === 'handler' ||
      (targetOffense.stackIndex != null && targetOffense.stackIndex <= 1))
  const styleAllowsLanePoach =
    defenseStyle === 'all_person' ||
    defenseStyle === 'clam' ||
    defProfile.baitDeep === true ||
    (defProfile.maxPoachers ?? 1) >= 2
  const canPoachRole =
    distToDisc <= 9 && (styleAllowsLanePoach || marksDumpOrHandler)

  const poachProbe =
    !isMarkerOnThrower &&
    targetOffense &&
    state !== DEFENDER_STATE.POACHING &&
    ms >= (agent.nextPoachCheckMs ?? 0)
  if (poachProbe) {
    const attempt = shouldAttemptPoach(player, {
      defenseStyle,
      distToDisc,
      distToLane,
      separationToMark: sepToMark,
      stallCount,
      canPoachRole,
      activePoachers,
      rng,
      defenseTactics,
    })
    if (attempt) {
      // Krótki poach (~0.55–0.8 s) — nie stój w lane całą akcję.
      poachUntil = ms + 550 + subStat(player, 'mental', 'reactions') * 2.5
      poachedFromId = targetOffense.id ?? targetOffense.player?.id
      state = DEFENDER_STATE.POACHING
      const attackSignPoach = ctx.attackSign ?? 1
      const laneX = discPos ? discPos.x + attackSignPoach * 3.5 : agent.x
      const laneY = discPos?.y ?? agent.y
      const next = moveToward(agent, laneX, laneY, defenderSpeedMps(player) * 1.05, dtSec)
      return {
        ...next,
        state,
        reactUntil,
        pendingTarget: null,
        poachUntil,
        poachedFromId,
        nextPoachCheckMs: poachUntil + 1800,
        lastTargetX: targetOffense?.x,
        lastTargetY: targetOffense?.y,
        lastCutterState: targetOffense?.state,
        markTargetId: agent.markTargetId ?? targetOffense?.id ?? null,
      }
    }
  }

  // Clam / AP: bardziej agresywne shade na open under / deny under.
  let shadeOpen = (defProfile.denyUnderBias ?? 0.2) + (coachMods.denyUnderBias ?? 0)
  if (defProfile.baitDeep && targetOffense) {
    shadeOpen = 0.55 + (coachMods.helpDeepBias ?? 0) * 0.35
  }
  shadeOpen = Math.max(0, Math.min(0.85, shadeOpen))

  // Daleko od marka — nie zamrażaj się na reakcji; najpierw dogoń człowieka.
  const behindMark = sepToMark > 4.2
  const chaseHard = sepToMark > 3.2
  if (
    targetOffense &&
    cutterHeadingChanged(agent, targetOffense) &&
    !behindMark &&
    !chaseHard
  ) {
    reactUntil = ms + delay
    pendingTarget = { x: targetOffense.x, y: targetOffense.y }
  }

  const attackSign = ctx.attackSign ?? 1
  const layout = forceMarkLayoutSide(normalizeForceMark(forceSide), throwerAgent?.y)
  // Bez sztucznego „+2.1" — coverageCushionM zwraca teraz realny cushion (patrz komentarz
  // przy tej funkcji: poprzedni round-trip -2.1/+2.1 zerował wpływ statystyk i instrukcji).
  const baseCushion = coverageCushionM(player, defenseTactics)
  const adjustedCushion =
    baseCushion * (1 - shadeOpen * 0.35)

  // Której przestrzeni broni ten obrońca. Nie ma tu reguły „ostatni w stacku kryje deep" —
  // to wychodzi z geometrii: ostatni w stacku ma wolne deep tuż obok siebie, więc deep jest
  // dla niego najgroźniejsze; zawodnik z przodu ma deep 30 m dalej, więc jego obrońca stoi
  // neutralniej. Ta sama mapa, którą atakujący czyta w cutterBrain.
  const threatCell =
    targetOffense && spaceCells?.length
      ? threatCellForMark(targetOffense, perceiveSpaceMap(spaceCells, player, 'defense', rng), {
          speed: maxSpeedMps(targetOffense.player ?? targetOffense),
        })
      : null

  /** Shade 1-na-1: cushion + lekki force / od-in / od-out — nie cel w środku torsu. */
  function shadeGoalAt(tx, ty, cushionM) {
    const preferDy = layout === 'home' ? -0.85 : layout === 'away' ? 0.85 : 0
    const preferDx = -attackSign * 0.9
    const cushion = Math.max(0.35, cushionM)
    let goal = null
    if (threatCell) {
      // Stań MIĘDZY krytym zawodnikiem a przestrzenią, która jest dla niego najgroźniejsza.
      let vx = threatCell.x - tx
      let vy = threatCell.y - ty
      const len = Math.hypot(vx, vy)
      if (len > 1e-6) {
        vx = vx / len + preferDx * SHADE_FORCE_BLEND
        vy = vy / len + preferDy * SHADE_FORCE_BLEND
        // BIAS TRENERSKI wzdłuż osi ataku — shade deep / shade under.
        //
        // Przy przepisaniu shadeGoalAt na kierunek ku komórce zagrożenia wypadł stąd
        // dawny człon `deepShift - underShift` i instrukcje przestały działać KIERUNKOWO:
        // zmieniały już tylko dystans krycia. Zmierzone: przesunięcie obrońcy wzdłuż osi
        // ataku wynosiło +-0.03 m przy każdej instrukcji (czyli zero), a cushion rósł
        // z 1.38 m przy shade_under do 1.97 m przy shade_deep. Obrońca stał więc DALEJ,
        // ale nie GŁĘBIEJ — a cień zależy od rzutu przesunięcia na kierunek do
        // przestrzeni, więc redystrybucja krycia nie zachodziła.
        vx += ((coachMods.helpDeepBias ?? 0) - (coachMods.denyUnderBias ?? 0)) * attackSign * SHADE_BIAS_CAL.gain
        const l2 = Math.hypot(vx, vy) || 1
        goal = { x: tx + (vx / l2) * cushion, y: ty + (vy / l2) * cushion }
      }
    }
    if (!goal) goal = cushionedMarkGoal(agent, tx, ty, cushion, preferDx, preferDy)
    if (layout === 'home') goal = { ...goal, y: goal.y + 0.35 }
    else if (layout === 'away') goal = { ...goal, y: goal.y - 0.35 }
    const deepShift = (coachMods.helpDeepBias ?? 0) * 1.1 * attackSign * SHADE_SHIFT_CAL.scale
    const underShift = (coachMods.denyUnderBias ?? 0) * 0.9 * attackSign * SHADE_SHIFT_CAL.scale
    if (discPos) {
      goal = { ...goal, x: goal.x + deepShift - underShift }
    }
    return goal
  }

  let goal = { x: agent.x, y: agent.y }
  let stateOut = DEFENDER_STATE.COVERING_CUTTER

  if (ms < reactUntil && agent.pendingTarget && !behindMark && !chaseHard) {
    // Krótki hip-turn: trzymaj pozycję, nie sprintuj w starą stronę.
    goal = { x: agent.x, y: agent.y }
    stateOut = DEFENDER_STATE.RECOVERING
  } else if (targetOffense) {
    stateOut = DEFENDER_STATE.COVERING_CUTTER
    const tx = targetOffense.x
    const ty = targetOffense.y
    if (behindMark || chaseHard) {
      // Dogoń człowieka — cushion dopiero z bliska.
      goal = { x: tx, y: ty }
      pendingTarget = null
      reactUntil = 0
    } else if (cutterIsCutting(targetOffense)) {
      if ((defProfile.helpDeepBias ?? 0) > 0.35) {
        const deepPull = Math.min(0.22, defProfile.helpDeepBias * 0.2)
        goal = shadeGoalAt(
          tx * (1 - deepPull) + (discPos?.x ?? tx) * deepPull,
          ty,
          Math.max(0.45, adjustedCushion * 0.75),
        )
      } else {
        goal = shadeGoalAt(tx, ty, Math.max(0.45, adjustedCushion * 0.7))
      }
      pendingTarget = null
    } else {
      goal = shadeGoalAt(tx, ty, adjustedCushion)
    }
  }

  const speed =
    defenderSpeedMps(player) * (behindMark ? 1.14 : chaseHard ? 1.08 : 1)
  // Przy gonitwie za markiem: mniejszy limit skrętu — priorytet domknięcie dystansu.
  const next = moveToward(
    agent,
    goal.x,
    goal.y,
    speed,
    dtSec,
    !(behindMark || chaseHard),
  )
  return {
    ...next,
    state: stateOut,
    reactUntil: chaseHard || behindMark ? 0 : reactUntil,
    pendingTarget:
      ms < reactUntil && !behindMark && !chaseHard ? pendingTarget : null,
    poachUntil: 0,
    poachedFromId: null,
    nextPoachCheckMs: poachProbe ? ms + 1100 : agent.nextPoachCheckMs ?? 0,
    lastTargetX: targetOffense?.x,
    lastTargetY: targetOffense?.y,
    lastCutterState: targetOffense?.state,
    markTargetId: agent.markTargetId ?? targetOffense?.id ?? null,
  }
}

/**
 * Ruch obrońcy w strefie (cup/wing/middle/deep): trzyma slot względem AKTUALNEJ
 * pozycji dysku, zamiast gonić najbliższego zawodnika ataku jak w markingu 1:1.
 * Wcześniej każdy defAgent (zone lub nie) leciał przez resolvePersonMarkTarget, co
 * dla zone (personMark=false, brak matchupów) spadało do "goń najbliższego" — cały
 * cup rojem zbiegał się na jednego zawodnika ataku. Marker (fieldRole==='zone_marker')
 * NIE przechodzi przez tę funkcję — dalej idzie przez zwykły tickDefenderBrain z
 * isMarkerOnThrower=true (śledzi realnie throwera, forceMarkPosition), bo to jedyny
 * slot strefy, który faktycznie kryje konkretną osobę.
 */
export function tickZoneDefenderBrain(agent, ctx) {
  const { disc, throwerAgent, dtSec, attackSign = 1, defenseStyle = 'zone_cup' } = ctx
  const player = agent.player ?? agent
  const zoneKind = defenseMods(defenseStyle).zoneKind ?? 'cup'
  const discPos = disc ?? throwerAgent ?? { x: agent.x, y: agent.y }
  const anchor = zoneStructuralTarget(agent.fieldRole, agent.roleSlotIndex ?? 0, {
    discX: discPos.x,
    discY: discPos.y,
    attackSign,
    zoneKind,
  })
  const next = moveToward(agent, anchor.x, anchor.y, defenderSpeedMps(player), dtSec)
  return {
    ...next,
    state: DEFENDER_STATE.COVERING_CUTTER,
    reactUntil: 0,
    pendingTarget: null,
    poachUntil: 0,
    poachedFromId: null,
    nextPoachCheckMs: agent.nextPoachCheckMs ?? 0,
    lastTargetX: anchor.x,
    lastTargetY: anchor.y,
    lastCutterState: null,
    markTargetId: null,
    isActiveMark: false,
  }
}

/**
 * Dispatcher: sloty strefy (poza markerem) idą przez tickZoneDefenderBrain, marker
 * strefy i cała reszta (person / clam / AP) — przez zwykły tickDefenderBrain jak
 * dotychczas. Jeden punkt wejścia dla actionSimulator.js, żeby obie kopie pętli
 * tickowej (setup + lot) nie mogły się rozjechać w tym rozróżnieniu.
 */
export function tickDefenseAgent(agent, ctx) {
  if (ZONE_SLOT_ROLES.has(agent.fieldRole)) {
    if (agent.fieldRole === 'zone_marker') {
      return tickDefenderBrain(agent, { ...ctx, isMarkerOnThrower: true })
    }
    return tickZoneDefenderBrain(agent, ctx)
  }
  return tickDefenderBrain(agent, ctx)
}

export function createDefenderAgent(player, x, y, extra = {}) {
  return {
    player,
    id: player.id,
    x,
    y,
    state: DEFENDER_STATE.COVERING_CUTTER,
    reactUntil: 0,
    pendingTarget: null,
    ...extra,
  }
}
