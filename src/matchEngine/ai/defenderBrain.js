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
import { defenseMods, shouldAttemptPoach } from './tacticsBehavior.js'
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

function defenderSpeedMps(player) {
  return maxSpeedMps(player) * 0.94
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
  const moved = integrateAgentMotion(agent, tx, ty, maxSpeed, dtSec, limitTurn)
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

function coverageCushionM(player, defenseTactics = null) {
  const stamina = player?.currentStamina ?? 100
  const mods = mergeTraitAndCoachMods(player, defenseTactics, 'defense')
  let desired =
    2.5 -
    (subStat(player, 'defensive', 'defensiveCutterMovement') / 100) * 1.8 +
    (mods.cushionDeltaM ?? 0)
  desired = Math.max(0.35, desired)
  if (stamina < 50) desired += 0.8 + ((50 - stamina) / 50) * 1.6
  // Od in (denyUnder): mniejszy cushion / bliżej under; od out: większy cushion.
  desired += (mods.denyUnderBias ?? 0) * -0.4
  return Math.max(0, desired - 2.1)
}

/**
 * Tick obrońcy w fazie setup (przed rzutem).
 * Poach: rzadki high-risk leave assignment (głównie handler D przy lane).
 */
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
  const baseCushion = coverageCushionM(player, defenseTactics) + 2.1
  const adjustedCushion =
    baseCushion * (1 - shadeOpen * 0.35)

  /** Shade 1-na-1: cushion + lekki force / od-in / od-out — nie cel w środku torsu. */
  function shadeGoalAt(tx, ty, cushionM) {
    const preferDy = layout === 'home' ? -0.85 : layout === 'away' ? 0.85 : 0
    const preferDx = -attackSign * 0.9
    let goal = cushionedMarkGoal(
      agent,
      tx,
      ty,
      Math.max(0.35, cushionM),
      preferDx,
      preferDy,
    )
    if (layout === 'home') goal = { ...goal, y: goal.y + 0.35 }
    else if (layout === 'away') goal = { ...goal, y: goal.y - 0.35 }
    const deepShift = (coachMods.helpDeepBias ?? 0) * 1.1 * attackSign
    const underShift = (coachMods.denyUnderBias ?? 0) * 0.9 * attackSign
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
