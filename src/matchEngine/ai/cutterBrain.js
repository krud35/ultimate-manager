import { clampAgentPosition, evaluatePlayerSituation } from './spatialEvaluator.js'
import { attackDirectionX, clampFieldX, clampFieldY, fieldCenterY } from '../fieldDimensions.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'
import {
  breakSideSign,
  pickBreakSideClearTarget,
  spacingAdjustedTarget,
} from './offenseReorganization.js'
import {
  formationStructuralTarget,
  preferredCutKind,
  ATTACK_STYLES,
} from './tacticsBehavior.js'
import { maxSpeedMps, plantStopMs, subStat } from './statFormulas.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { integrateAgentMotion, repositionSpeedMps, waitingHoldSpeedMps } from './playerMovement.js'
import {
  subRoleForAgent,
  subRoleAllowsInitiateCut,
  HANDLER_SUB_ROLES,
} from '../playerSubRoles.js'

export const CUTTER_STATE = {
  WAITING: 'WAITING',
  INITIATING_CUT: 'INITIATING_CUT',
  ACTIVE_CUT: 'ACTIVE_CUT',
  CLEARING: 'CLEARING',
}

const ACTIVE_CUT_MS_BASE = 1600
const REORG_WINDOW_MS = 700
const CLEAR_MAX_MS = 1100
/** Ilu zawodników tnie naraz — reszta trzyma stack i pilnuje przestrzeni. */
const MAX_CONCURRENT_CUTTERS = 2
/** Bliżej dysku niż tyle metrów nie ma sensu inicjować cutu — trzeba najpierw odejść. */
const MIN_CUT_START_DIST_M = 7
const DEG = Math.PI / 180

function layoutSideFromForce(forceSide) {
  return forceMarkLayoutSide(normalizeForceMark(forceSide))
}

function vectorAtAngle(attackSign, angleDeg, length) {
  const rad = angleDeg * DEG
  const ax = Math.cos(rad) * attackSign
  const ay = Math.sin(rad)
  const d = Math.hypot(ax, ay) || 1
  return { dx: (ax / d) * length, dy: (ay / d) * length }
}

function pickDiagonalAngleDeg(situation, rng, kind, player) {
  const open = situation.isOpenSide
  const systems = subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const movement = subStat(player, 'offensive', 'cutterMovement')
  const craft = (systems + movement) / 2
  const minA = 12 + (craft - 50) * 0.06
  const maxA = 58 + (craft - 50) * 0.08
  let base = minA + rng.float() * Math.max(8, maxA - minA)
  if (kind === 'in') base *= 0.85 + rng.float() * 0.2
  const sideSign = open ? 1 : -1
  const ySign = situation.preferredCutSideY ?? (rng.float() < 0.5 ? 1 : -1)
  return sideSign * ySign * base
}

function estimateOpenSpaceTarget(agent, disc, attackSign, situation, rng) {
  const cy = fieldCenterY()
  const candidates = []
  for (let i = 0; i < 5; i += 1) {
    const angle = pickDiagonalAngleDeg(
      situation,
      rng,
      i % 2 === 0 ? 'in' : 'deep',
      agent?.player ?? agent,
    )
    const dist = 5 + rng.float() * 11
    const { dx, dy } = vectorAtAngle(attackSign, angle, dist)
    const x = clampFieldX(disc.x + dx)
    const y = clampFieldY(disc.y + dy)
    let score = situation.throwWindowScore ?? 40
    score -= Math.abs(y - cy) < 2 ? 8 : 0
    score -= Math.hypot(x - agent.x, y - agent.y) < 3 ? 6 : 0
    score += situation.isOpenSide ? (y - cy) * 0.4 : (cy - y) * 0.35
    candidates.push({ x, y, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] ?? { x: disc.x + attackSign * 6, y: disc.y }
}

function pickCutTarget(
  agent,
  disc,
  attackSign,
  situation,
  rng,
  forceSide,
  attackStyle,
  stackIndex,
  offenseTactics = null,
) {
  const side = layoutSideFromForce(forceSide)
  const cy = fieldCenterY()
  const openSpace = estimateOpenSpaceTarget(agent, disc, attackSign, situation, rng)
  const traitMods = mergeTraitAndCoachMods(agent?.player ?? agent, offenseTactics, 'offense')
  let kind = preferredCutKind(attackStyle, stackIndex, rng)
  const deepBias = traitMods.deepCutBias ?? 0
  const underBias = traitMods.underCutBias ?? 0
  if (deepBias > 0 || underBias > 0 || deepBias < 0 || underBias < 0) {
    const pDeep = Math.max(
      0.05,
      Math.min(0.95, (kind === 'deep' ? 0.55 : 0.45) + deepBias - underBias),
    )
    kind = rng.float() < pDeep ? 'deep' : 'in'
  }
  const inCut = kind === 'in'

  if (inCut) {
    const angle = pickDiagonalAngleDeg(
      { ...situation, preferredCutSideY: openSpace.y >= cy ? 1 : -1 },
      rng,
      'in',
      agent?.player ?? agent,
    )
    const dist = 4 + rng.float() * 7
    const { dx, dy } = vectorAtAngle(attackSign, angle, dist)
    const breakBias = side === 'away' ? -0.8 : side === 'home' ? 0.8 : 0
    return {
      kind: 'in',
      x: clampFieldX(disc.x + dx + breakBias),
      y: clampFieldY(disc.y + dy),
    }
  }

  const outAngle = pickDiagonalAngleDeg(
    { ...situation, isOpenSide: !situation.isOpenSide },
    rng,
    'deep',
    agent,
  )
  // Cut w głąb liczony od pozycji cuttera, nie od dysku — inaczej „głęboki” cut
  // z tyłu stacka kończył się bliżej dysku niż start i huck nigdy nie powstawał.
  const deepDist = Math.min(75, Math.max(20, situation.discDist + 20 + rng.float() * 35))
  // Downfield progres nie może zjadać kąt „diagonal” (do 58°, cos≈0.53) — realny głęboki
  // cut jest w miarę prosto w pole, więc kąt daje tylko boczny dryf, nie ucina deepDist.
  const rad = outAngle * DEG
  const downfieldFactor = Math.max(0.82, Math.cos(rad))
  const dx = deepDist * downfieldFactor * attackSign
  const dy = Math.sin(rad) * deepDist
  return {
    kind: 'deep',
    x: clampFieldX(disc.x + dx),
    y: clampFieldY(openSpace.y + dy * 0.45),
  }
}

function pickClearTarget(x, y, disc, attackSign, forceSide, rng) {
  return pickBreakSideClearTarget(x, y, disc, attackSign, forceSide, rng)
}

/** Pozycja resetu — kilka metrów za dyskiem, na otwartej stronie. */
function pickResetTarget(disc, throwerPos, attackSign, forceSide, rng) {
  const ox = throwerPos?.x ?? disc.x
  const oy = throwerPos?.y ?? disc.y
  const r = rng?.float ? rng.float() : 0.5
  const lateral = -breakSideSign(forceSide) || (oy >= fieldCenterY() ? -1 : 1)
  return {
    x: clampFieldX(ox - attackSign * (5 + r * 3)),
    y: clampFieldY(oy + lateral * (3 + r * 3)),
  }
}

/**
 * Co robi ten zawodnik po chwycie: czyści do stacka, oferuje się do dysku,
 * czy zostaje z tyłu jako reset. Każdy decyduje osobno, na podstawie własnej sytuacji.
 */
function pickPostCatchRole(agent, situation, isDump, stackIndex, rng, canCut, coachMods) {
  if (situation?.inThrowLane) return 'clear'
  if (isDump || coachMods?.preferDumpRole) return 'reset'
  if (!canCut) return 'clear'
  const priority = cutPriority(agent.player, situation, stackIndex)
  let offerChance = Math.max(0, Math.min(0.8, (priority - 38) / 55))
  offerChance = Math.max(0, Math.min(0.92, offerChance + (coachMods?.postCatchOfferBonus ?? 0)))
  return (rng?.float ? rng.float() : 0.5) < offerChance ? 'offer' : 'clear'
}

function cutPriority(player, situation, stackIndex) {
  const cutterMovement = subStat(player, 'offensive', 'cutterMovement')
  const systems = subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const catching = subStat(player, 'offensive', 'catching')
  const speed = subStat(player, 'physical', 'speed')
  let p =
    cutterMovement * 0.45 +
    speed * 0.18 +
    systems * 0.12 +
    catching * 0.1 +
    (situation.throwWindowScore ?? 0) * 0.22
  p -= (situation.cloggingLevel ?? 0) * 4
  p -= stackIndex * 0.8
  return p
}

export function tickCutterBrain(agent, tickCtx) {
  const {
    dtSec,
    disc,
    possessionTeam,
    forceSide,
    situation,
    rng,
    stackIndex = 0,
    isThrower = false,
    isDump = false,
    postCatchReorg = false,
    throwerId = null,
    throwerPos = null,
    postResetClearout = false,
    elapsedMs = 0,
    teammates = null,
    activeCutters = 0,
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    maxCutters = MAX_CONCURRENT_CUTTERS,
    offenseTactics = null,
  } = tickCtx

  if (isThrower) {
    return { ...agent, state: CUTTER_STATE.WAITING, vx: 0, vy: 0 }
  }

  const coachMods = mergeTraitAndCoachMods(agent.player ?? agent, offenseTactics, 'offense')
  const subRole = agent.subRole ?? subRoleForAgent(agent, offenseTactics)
  const attackSign = attackDirectionX(possessionTeam)

  const structuralTarget = () =>
    formationStructuralTarget({
      attackStyle,
      x: agent.x,
      y: agent.y,
      disc,
      throwerPos,
      forceSide,
      possessionTeam,
      stackIndex,
      isDump,
      rng,
    })

  const distToDisc = Math.hypot(
    agent.x - (throwerPos?.x ?? disc.x),
    agent.y - (throwerPos?.y ?? disc.y),
  )
  const alreadyCutting =
    agent.state === CUTTER_STATE.ACTIVE_CUT || agent.state === CUTTER_STATE.INITIATING_CUT
  const canStartCut =
    alreadyCutting ||
    (activeCutters < maxCutters && distToDisc >= MIN_CUT_START_DIST_M)

  let state = agent.state ?? CUTTER_STATE.WAITING
  let targetX = agent.targetX ?? agent.x
  let targetY = agent.targetY ?? agent.y
  let stateMs = (agent.stateMs ?? 0) + dtSec * 1000

  // Reorganizacja po chwycie trwa tylko chwilę — potem stack musi wrócić do cięcia,
  // inaczej cała ofensywa zostaje w CLEARING i ucieka od dysku do końca punktu.
  const reorgWindow = postCatchReorg && elapsedMs < REORG_WINDOW_MS

  if (reorgWindow && situation?.inThrowLane && state !== CUTTER_STATE.ACTIVE_CUT) {
    state = CUTTER_STATE.CLEARING
    stateMs = 0
    const clr = pickClearTarget(agent.x, agent.y, disc, attackSign, forceSide, rng)
    targetX = clr.x
    targetY = clr.y
  } else if (reorgWindow && state === CUTTER_STATE.WAITING) {
    const role = pickPostCatchRole(
      agent,
      situation,
      isDump,
      stackIndex,
      rng,
      canStartCut,
      coachMods,
    )
    stateMs = 0
    if (role === 'offer') {
      state = CUTTER_STATE.INITIATING_CUT
      const tgt = pickCutTarget(
        agent,
        disc,
        attackSign,
        situation,
        rng,
        forceSide,
        attackStyle,
        stackIndex,
        offenseTactics,
      )
      targetX = tgt.x
      targetY = tgt.y
      agent.cutKind = tgt.kind
      agent.continuationCut = true
    } else if (role === 'reset') {
      state = CUTTER_STATE.CLEARING
      const tgt = pickResetTarget(disc, throwerPos, attackSign, forceSide, rng)
      targetX = tgt.x
      targetY = tgt.y
    } else {
      const pref = structuralTarget()
      state = CUTTER_STATE.CLEARING
      targetX = pref.x
      targetY = pref.y
    }
  } else if (
    postResetClearout &&
    !isDump &&
    !coachMods.continuationOnlyCuts &&
    !coachMods.fillerCutsOnly &&
    throwerPos &&
    Math.hypot(agent.x - throwerPos.x, agent.y - throwerPos.y) < 24
  ) {
    state = CUTTER_STATE.ACTIVE_CUT
    stateMs = 0
    const sideMult = situation?.isOpenSide ? 1 : -1
    const angleDeg = (22 + rng.float() * 38) * sideMult
    const dist = 11 + rng.float() * 9
    const rad = angleDeg * (Math.PI / 180)
    const ax = Math.cos(rad) * attackSign
    const ay = Math.sin(rad)
    const d = Math.hypot(ax, ay) || 1
    targetX = clampFieldX(throwerPos.x + (ax / d) * dist)
    targetY = clampFieldY(throwerPos.y + (ay / d) * dist)
    agent.cutKind = rng.float() < 0.45 ? 'in' : 'deep'
    agent.continuationCut = true
    agent.forceClearout = true
  } else if (state === CUTTER_STATE.WAITING) {
    const player = agent.player ?? agent
    const stamina = player?.currentStamina ?? agent.currentStamina ?? 100
    const fatigueWaiting = stamina < 40
    const priority = cutPriority(player, situation, stackIndex) + (coachMods.cutOfferPriority ?? 0) * 2
    const clogged = (situation.cloggingLevel ?? 0) >= 2 || situation?.inThrowLane
    const timing = coachMods.timingCutBias ?? 0
    let cutRoll = (fatigueWaiting ? 0.006 : 0.022) * (coachMods.cutRollMult ?? 1)
    let priorityGate = (fatigueWaiting ? 72 : 64) + (coachMods.cutPriorityDelta ?? 0)
    let allowClogEscape = clogged
    if (timing > 0) {
      if (clogged) {
        // Dobry timing: nie uciekaj panicznie w lane — czekaj na czystszy moment.
        allowClogEscape = false
        cutRoll *= Math.max(0.35, 1 - timing * 0.7)
        priorityGate += timing * 6
      } else if ((situation.cloggingLevel ?? 0) === 0 && (situation.throwWindowScore ?? 0) > 0.45) {
        cutRoll *= 1 + timing * 0.55
        priorityGate -= timing * 4
      }
    }
    const roleAllows = subRoleAllowsInitiateCut(subRole, situation, { reorgWindow: false })
    if (
      !fatigueWaiting &&
      canStartCut &&
      roleAllows &&
      (allowClogEscape || priority > priorityGate || rng.float() < cutRoll)
    ) {
      state = CUTTER_STATE.INITIATING_CUT
      stateMs = 0
      const tgt = pickCutTarget(
        agent,
        disc,
        attackSign,
        situation,
        rng,
        forceSide,
        attackStyle,
        stackIndex,
        offenseTactics,
      )
      targetX = tgt.x
      targetY = tgt.y
      agent.cutKind = tgt.kind
      agent.continuationCut = tgt.kind === 'in' || tgt.kind === 'deep'
    }
  } else if (state === CUTTER_STATE.INITIATING_CUT) {
    state = CUTTER_STATE.ACTIVE_CUT
    stateMs = 0
    agent.continuationCut = true
  } else if (state === CUTTER_STATE.ACTIVE_CUT) {
    const player = agent.player ?? agent
    const plantMs = plantStopMs(player)
    const activeCutMs =
      (ACTIVE_CUT_MS_BASE + plantMs * 0.65) * (coachMods.clearActiveCutMult ?? 1)
    if (stateMs >= activeCutMs) {
      state = CUTTER_STATE.CLEARING
      stateMs = 0
      const clr = structuralTarget()
      const extra = coachMods.clearLaneExtraM ?? 0
      targetX = clampFieldX(clr.x + (extra ? -attackSign * extra * 0.35 : 0))
      targetY = clr.y
    }
  } else if (state === CUTTER_STATE.CLEARING) {
    const reachedClear = Math.hypot(targetX - agent.x, targetY - agent.y) < 2.5
    if (reachedClear || stateMs >= CLEAR_MAX_MS) {
      state = CUTTER_STATE.WAITING
      stateMs = 0
      agent.continuationCut = false
      agent.forceClearout = false
    }
  }

  let x = agent.x
  let y = agent.y
  let vx = agent.vx ?? 0
  let vy = agent.vy ?? 0

  const reorganizing = reorgWindow || state === CUTTER_STATE.CLEARING

  if (state === CUTTER_STATE.ACTIVE_CUT || state === CUTTER_STATE.CLEARING) {
    const player = agent.player ?? agent
    let speed
    if (reorganizing) {
      const dumpLike =
        isDump ||
        coachMods.preferDumpRole ||
        subRole === HANDLER_SUB_ROLES.RESET
      const dist = Math.hypot(targetX - agent.x, targetY - agent.y)
      // Reset handler: clear/dump truchtem–biegiem, nie sprintem jak cutter clearing lane.
      speed = dumpLike
        ? waitingHoldSpeedMps(player, dist)
        : repositionSpeedMps(player, dist)
    } else {
      const stamina = player?.currentStamina ?? 100
      let speedMult = stamina < 25 ? 0.8 : 1
      if (stamina < 50) {
        speedMult = 1 - (1 - speedMult) * (coachMods.lowStaminaMovePenaltyMult ?? 1)
      }
      if (agent.cutKind === 'deep') speedMult *= coachMods.deepSpeedMult ?? 1
      // Reset handler rzadko cutuje; gdy już, krótszy / wolniejszy wysiłek.
      if (subRole === HANDLER_SUB_ROLES.RESET) speedMult *= 0.72
      const movement = subStat(player, 'offensive', 'cutterMovement')
      // Craft ~0.90–1.02 — nie pomnażaj Vmax ponad realistyczny sprint.
      const craft = 0.9 + (movement / 100) * 0.12
      speed = maxSpeedMps(player) * speedMult * craft
    }
    const spaced = spacingAdjustedTarget(agent, targetX, targetY, teammates)
    const moved = integrateAgentMotion(
      { ...agent, x, y, vx, vy },
      spaced.x,
      spaced.y,
      speed,
      dtSec,
      true,
    )
    x = moved.x
    y = moved.y
    vx = moved.vx
    vy = moved.vy
  } else if (state === CUTTER_STATE.WAITING) {
    // Bez piłki zawodnik nie stoi bezczynnie: wraca truchtem / lekkim biegiem na slot
    // (nie sprint — sprint tylko na ACTIVE_CUT).
    const slot = structuralTarget()
    const spaced = spacingAdjustedTarget(agent, slot.x, slot.y, teammates)
    const drift = Math.hypot(spaced.x - agent.x, spaced.y - agent.y)
    if (drift > 1.5) {
      const moved = integrateAgentMotion(
        { ...agent, x, y, vx, vy },
        spaced.x,
        spaced.y,
        waitingHoldSpeedMps(agent.player ?? agent, drift),
        dtSec,
        true,
      )
      x = moved.x
      y = moved.y
      vx = moved.vx
      vy = moved.vy
    } else {
      x += (rng.float() - 0.5) * 0.15
      y += (rng.float() - 0.5) * 0.12
      vx *= 0.5
      vy *= 0.5
    }
  }

  const clamped = clampAgentPosition(x, y)
  return {
    ...agent,
    x: clamped.x,
    y: clamped.y,
    state,
    stateMs,
    targetX,
    targetY,
    vx,
    vy,
  }
}

export function createCutterAgent(player, x, y) {
  return {
    player,
    id: player.id,
    x,
    y,
    z: 0,
    vz: 0,
    state: CUTTER_STATE.WAITING,
    stateMs: 0,
    targetX: x,
    targetY: y,
    vx: 0,
    vy: 0,
  }
}

