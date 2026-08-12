import {
  layoutPlayersOnField,
  resolveFieldTactics,
  resolveMarkForceSide,
  discMetersFromState,
} from '../fieldViz.js'
import { forceMarkLayoutSide } from '../throwTechnique.js'
import { fieldCenterY } from '../fieldDimensions.js'
import { evaluatePlayerSituation } from './spatialEvaluator.js'
import { createCutterAgent, tickCutterBrain, CUTTER_STATE } from './cutterBrain.js'
import { scanThrowOptions, separationFromSituation } from './throwerBrain.js'
import { throwReleaseGateMs } from './throwerDecision.js'
import { tickDefenseAgent, DEFENDER_STATE, forceMarkPosition } from './defenderBrain.js'
import { defenderForPersonMark, isPersonDefense } from '../participants.js'
import { THROW_TYPE, throwProfile } from '../throwTypes.js'
import { discPositionHeld, discPositionInFlight } from '../discState.js'
import { predictCatchPointOnPath, predictReceiverCatchPoint } from './discFlightPredict.js'
import {
  createFlightContext,
  sampleFlightDisc,
  tickFlightContestAgent,
  tickOffenseAgentDuringFlight,
  flightComplete,
  applyFlightResolutionToAgents,
  finalDiscAfterFlight,
  samplePathAt,
} from './flightKinematics.js'
import {
  drainAgentsTickStamina,
  syncPlayerFromStaminaMap,
} from '../stamina.js'
import { maxConcurrentCutters, throwReleaseGateMultiplier, throwerPatienceBonusMs } from './tacticsBehavior.js'
import { attackMods } from '../tacticsModifiers.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import {
  STALL_MAX,
  STALL_SECOND_MS,
  stallCountFromHoldMs,
  decisionStallFromHoldMs,
  isStallOutHoldMs,
} from '../stall.js'
import { subRoleForAgent, HANDLER_SUB_ROLES } from '../playerSubRoles.js'

export const SIM_TICK_MS = 20
/** Stały krok symulacji (50 Hz); jedna ciągła pętla setup → lot */
const DT_SEC = SIM_TICK_MS / 1000
/** Pełny stall-out = 10 s krycia. */
const MAX_SETUP_MS = STALL_MAX * STALL_SECOND_MS + SIM_TICK_MS
const MAX_FLIGHT_MS = 4800
/**
 * Jeśli obrońca jest dalej od swojej marki niż ten dystans na starcie rzutu,
 * doklejamy go do shade (inaczej po reorganizacji O / turnoverze „gubi” człowieka).
 */
const DEFENSE_REANCHOR_GAP_M = 5.5

function agentPlayerId(agent) {
  return agent?.player?.id ?? agent?.id ?? null
}

/** Person-mark: obrońca → agent ofensywy (matchup, potem markTargetId, potem najbliższy). */
function resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups) {
  const defId = agentPlayerId(defAgent)
  if (personMatchups instanceof Map && defId != null) {
    for (const off of offenseAgents) {
      const mapped = personMatchups.get(agentPlayerId(off) ?? off.id)
      if (mapped != null && (mapped.id === defId || mapped === defId)) {
        return off
      }
    }
  }
  const markId = defAgent?.markTargetId
  if (markId != null) {
    const byMark = offenseAgents.find((o) => agentPlayerId(o) === markId || o.id === markId)
    if (byMark) return byMark
  }
  let best = offenseAgents[0] ?? null
  let bestD = Infinity
  for (const off of offenseAgents) {
    const d = Math.hypot((defAgent.x ?? 0) - (off.x ?? 0), (defAgent.y ?? 0) - (off.y ?? 0))
    if (d < bestD) {
      bestD = d
      best = off
    }
  }
  return best
}

function shadeMarkBesideOffense(off, forceSide, attackSign) {
  const layout = forceMarkLayoutSide(forceSide, off.y)
  const shade = layout === 'away' ? 0.9 : layout === 'home' ? -0.9 : 0
  return {
    x: off.x - attackSign * 2.2,
    y: off.y + shade,
  }
}

function layoutToAgents(layout, teamId, rosterLineup = [], tactics = null) {
  return layout.map((p, stackIndex) => {
    const rosterPlayer = rosterLineup.find((r) => r.id === p.id) ?? p
    const base = {
      player: rosterPlayer,
      id: p.id,
      x: p.x,
      y: p.y,
      teamId,
      fieldRole: p.fieldRole,
      stackIndex: p.stackIndex ?? stackIndex,
      roleSlotIndex: p.roleSlotIndex ?? 0,
      isThrower: p.fieldRole === 'thrower',
      markTargetId: p.markTargetId ?? null,
    }
    const subRole = subRoleForAgent(base, tactics)
    const preferDump = subRole === HANDLER_SUB_ROLES.RESET
    return {
      ...base,
      subRole,
      isDump: preferDump || (p.fieldRole === 'dump' && subRole !== HANDLER_SUB_ROLES.PRIMARY),
    }
  })
}

/** Stan zawodników na koniec symulacji — wejście do kolejnego rzutu (ciągłość ruchu). */
function snapshotAgentStates(offenseAgents, defenseAgents) {
  const map = new Map()
  const put = (agents, role) => {
    for (const a of agents) {
      if (a?.id == null) continue
      map.set(a.id, {
        id: a.id,
        x: a.x,
        y: a.y,
        vx: a.vx ?? 0,
        vy: a.vy ?? 0,
        state: a.state,
        stateMs: a.stateMs ?? 0,
        targetX: a.targetX ?? a.x,
        targetY: a.targetY ?? a.y,
        role,
      })
    }
  }
  put(offenseAgents, 'offense')
  put(defenseAgents, 'defense')
  return map
}

function snapshotFrame(ms, offenseAgents, defenseAgents, throwerId, disc = null, markerId = null, stallCount = null) {
  const players = [
    ...offenseAgents.map((a) => ({
      id: a.id,
      teamId: a.teamId ?? 'home',
      x: a.x,
      y: a.y,
      vx: a.vx ?? 0,
      vy: a.vy ?? 0,
      role: a.isThrower ? 'thrower' : a.fieldRole ?? 'stack',
      cutterState: a.state,
      layout: a.layout ?? false,
      motionPhase: a.layout ? 'layout' : undefined,
    })),
    ...defenseAgents.map((a) => {
      const id = a.id ?? a.player?.id
      const isActiveMark = markerId != null && id === markerId
      return {
        id,
        teamId: a.teamId ?? 'away',
        x: a.x,
        y: a.y,
        vx: a.vx ?? 0,
        vy: a.vy ?? 0,
        // Marker throwera + markTargetId z matchupu (nie tylko aktywny stall).
        role: isActiveMark
          ? 'marker'
          : a.fieldRole?.startsWith('zone_')
            ? a.fieldRole
            : 'defender',
        isActiveMark,
        markTargetId: isActiveMark ? throwerId : a.markTargetId ?? null,
        defenderState: a.state,
        layout: a.layout ?? false,
        motionPhase: a.layout ? 'layout' : a.state === DEFENDER_STATE.CONTESTING_DISC ? 'contest' : undefined,
      }
    }),
  ]
  return { ms, players, throwerId, disc, markerId, stallCount }
}

function buildMotionTracePayload({
  frames,
  throwMs,
  discX,
  discY,
  flight,
  possessionTeam,
  resolution,
  markerId = null,
  holdStartMs = 0,
}) {
  const totalMs = frames.length ? frames[frames.length - 1].ms : throwMs ?? 0
  return {
    tickMs: SIM_TICK_MS,
    throwMs: throwMs ?? 0,
    releaseMs: 0,
    flightMs: flight ? flight.totalFlightMs : 0,
    totalMs,
    discX,
    discY,
    throwPathPoints: flight?.throwPathPoints ?? null,
    frames,
    resolution: resolution ?? flight?.resolution ?? null,
    possessionTeam,
    markerId,
    holdStartMs,
  }
}

/**
 * Ciągła symulacja akcji rzutu (setup + lot w jednej pętli 20 ms).
 * `onThrowCommitted(decision)` — zwraca `{ resolution, trajectory, throwType, abort? }` lub null (bez lotu).
 */
export function runContinuousThrowSimulation({
  rng,
  thrower,
  offenseLineup,
  defenseLineup,
  personMatchups,
  possessionTeam,
  discPosition,
  discYMeters,
  stallCount,
  offenseTeam,
  defenseTeam,
  wind = null,
  /** Ms już naliczone w tym posiadaniu (po abortach) — stall kontynuuje. */
  startHoldMs = 0,
  maxTicks = null,
  staminaMaps = null,
  seedStates = null,
  postResetClearout = false,
  lastThrowerId = null,
  hardStallCount = stallCount,
  requireForwardPass = false,
  onThrowCommitted = null,
}) {
  const holdStartMs = Math.max(0, startHoldMs ?? 0)
  const setupBudgetMs = Math.max(
    SIM_TICK_MS,
    STALL_MAX * STALL_SECOND_MS - holdStartMs + SIM_TICK_MS,
  )
  const resolvedMaxTicks =
    maxTicks ??
    Math.ceil(setupBudgetMs / SIM_TICK_MS) + Math.ceil(MAX_FLIGHT_MS / SIM_TICK_MS)
  const discX = discMetersFromState(discPosition, possessionTeam)
  const discY = discYMeters ?? fieldCenterY()
  const disc = { x: discX, y: discY, position: discPosition }
  const postCatchReorg = seedStates instanceof Map && seedStates.size > 0
  const defenseTeamId = possessionTeam === 'home' ? 'away' : 'home'
  const tickKinematics = {}

  const homeSide = possessionTeam === 'home' ? offenseTeam : defenseTeam
  const awaySide = possessionTeam === 'home' ? defenseTeam : offenseTeam
  const { attackStyle, defenseStyle, personMark } = resolveFieldTactics(
    possessionTeam,
    homeSide,
    awaySide,
    null,
  )
  const forceSide = resolveMarkForceSide(defenseTeam, null)
  const attackSign = possessionTeam === 'home' ? 1 : -1

  const offenseLayout = layoutPlayersOnField(
    offenseLineup,
    possessionTeam,
    discX,
    true,
    {
      attackStyle,
      throwerId: thrower.id,
      attackSign,
      discYMeters: discY,
    },
  )

  const defenseLayout = layoutPlayersOnField(
    defenseLineup,
    possessionTeam === 'home' ? 'away' : 'home',
    discX,
    false,
    {
      defenseStyle,
      offenseLayout,
      personMark,
      attackSign,
      forceSide,
      personMatchups,
      defenseTactics: defenseTeam?.tactics,
    },
  )

  let offenseAgents = layoutToAgents(
    offenseLayout,
    possessionTeam,
    offenseLineup,
    offenseTeam?.tactics,
  ).map((a) => {
    const seed = seedStates?.get(a.id)
    // Po turnoverze seed ma starą rolę — nie bierz pozycji z przeciwnika.
    const carriesRole = seed?.role === 'offense'
    if (a.isThrower) {
      return {
        ...a,
        x: discX,
        y: discY,
        state: CUTTER_STATE.WAITING,
        vx: 0,
        vy: 0,
        player: a.player,
        subRole: a.subRole,
      }
    }
    const startX = carriesRole ? (seed.x ?? a.x) : a.x
    const startY = carriesRole ? (seed.y ?? a.y) : a.y
    const base = createCutterAgent(a.player, startX, startY)
    // Ciągłość między rzutami: zawodnik kontynuuje bieg z zachowaną prędkością i celem,
    // zamiast zaczynać od nowa w formacji.
    return {
      ...base,
      vx: carriesRole ? (seed.vx ?? 0) : 0,
      vy: carriesRole ? (seed.vy ?? 0) : 0,
      state: carriesRole ? (seed.state ?? base.state) : base.state,
      stateMs: carriesRole ? (seed.stateMs ?? 0) : 0,
      targetX: carriesRole ? (seed.targetX ?? base.targetX) : base.targetX,
      targetY: carriesRole ? (seed.targetY ?? base.targetY) : base.targetY,
      teamId: possessionTeam,
      fieldRole: a.fieldRole,
      stackIndex: a.stackIndex,
      isDump: a.isDump,
      isThrower: false,
      subRole: a.subRole,
    }
  })

  let defenseAgents = layoutToAgents(defenseLayout, defenseTeamId, defenseLineup).map((a) => {
    const seed = seedStates?.get(a.id)
    const carriesRole = seed?.role === 'defense'
    return {
      ...a,
      x: carriesRole ? (seed.x ?? a.x) : a.x,
      y: carriesRole ? (seed.y ?? a.y) : a.y,
      state: carriesRole ? (seed.state ?? DEFENDER_STATE.COVERING_CUTTER) : DEFENDER_STATE.COVERING_CUTTER,
      reactUntil: 0,
      pendingTarget: null,
      vx: carriesRole ? (seed.vx ?? 0) : 0,
      vy: carriesRole ? (seed.vy ?? 0) : 0,
      markTargetId: a.markTargetId ?? null,
    }
  })

  // Ustaw D przy swoich markach (matchupy ≠ kolejność layoutu).
  // Marker throwera zawsze; cutter D — gdy brak ciągłości albo zbyt daleko po reorg O.
  if (personMark && personMatchups instanceof Map) {
    for (const off of offenseAgents) {
      const defPlayer = personMatchups.get(off.player?.id ?? off.id)
      if (!defPlayer) continue
      const defAgent = defenseAgents.find((d) => agentPlayerId(d) === defPlayer.id)
      if (!defAgent) continue
      defAgent.markTargetId = off.id
      const carriesDefense = seedStates?.get(defAgent.id)?.role === 'defense'
      if (off.isThrower || off.player?.id === thrower.id) {
        const mark = forceMarkPosition(off.x, off.y, forceSide, attackSign)
        defAgent.x = mark.x
        defAgent.y = mark.y
        defAgent.vx = 0
        defAgent.vy = 0
        defAgent.state = DEFENDER_STATE.MARKING_STALL
      } else {
        const shade = shadeMarkBesideOffense(off, forceSide, attackSign)
        const dist = Math.hypot(defAgent.x - shade.x, defAgent.y - shade.y)
        if (!carriesDefense || dist > DEFENSE_REANCHOR_GAP_M) {
          defAgent.x = shade.x
          defAgent.y = shade.y
          defAgent.vx = 0
          defAgent.vy = 0
          defAgent.state = DEFENDER_STATE.COVERING_CUTTER
        }
      }
    }
  }

  const throwerAgent = offenseAgents.find((a) => a.isThrower)

  const markerOnThrower =
    isPersonDefense(defenseStyle) && personMatchups
      ? defenderForPersonMark(personMatchups, thrower, defenseLineup, rng)
      : null
  const zoneMarkerAgent = defenseAgents.find((a) => a.fieldRole === 'zone_marker')
  let markerId =
    markerOnThrower?.id ??
    zoneMarkerAgent?.id ??
    zoneMarkerAgent?.player?.id ??
    defenseAgents.reduce((best, a) => {
      if (!throwerAgent) return best
      const d = Math.hypot((a.x ?? 0) - throwerAgent.x, (a.y ?? 0) - throwerAgent.y)
      if (!best || d < best.d) return { id: a.id ?? a.player?.id, d }
      return best
    }, null)?.id ??
    null

  const frames = []
  let throwDecision = null
  let flight = null
  let commitMeta = null
  let stallOut = false
  let holdMsAtEnd = holdStartMs

  for (let tick = 0; tick < resolvedMaxTicks; tick += 1) {
    const ms = tick * SIM_TICK_MS
    const holdMs = holdStartMs + ms
    holdMsAtEnd = holdMs
    const liveStall = stallCountFromHoldMs(holdMs)
    const decisionStall = decisionStallFromHoldMs(holdMs)

    if (flight && flightComplete(flight)) {
      break
    }

    if (!flight && isStallOutHoldMs(holdMs)) {
      stallOut = true
      const heldDisc = throwerAgent
        ? discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
        : null
      frames.push(
        snapshotFrame(ms, offenseAgents, defenseAgents, thrower.id, heldDisc, markerId, STALL_MAX),
      )
      break
    }

    if (staminaMaps) {
      for (const agent of offenseAgents) {
        syncPlayerFromStaminaMap(staminaMaps, agent.player, possessionTeam)
        agent.currentStamina = agent.player?.currentStamina
      }
      for (const agent of defenseAgents) {
        syncPlayerFromStaminaMap(staminaMaps, agent.player, defenseTeamId)
        agent.currentStamina = agent.player?.currentStamina
      }
    }

    const offensePositions = offenseAgents.map((a) => ({
      id: a.id,
      player: a.player,
      x: a.x,
      y: a.y,
    }))
    const defensePositions = defenseAgents.map((a) => ({
      player: a.player,
      x: a.x,
      y: a.y,
    }))

    let discForAi = disc
    let discSample = null

    if (flight) {
      discSample = sampleFlightDisc(flight, flight.elapsedMs)
      discForAi = { x: discSample.x, y: discSample.y, position: discPosition }
      const intercept = predictCatchPointOnPath(
        samplePathAt,
        flight.throwPathPoints,
        discSample.u,
        flight.totalFlightMs,
        discSample.ms,
      )
      const throwerPos = { x: flight.fromX, y: flight.fromY }

      offenseAgents = offenseAgents.map((agent, idx) => {
        if (agent.id === flight.receiverId) {
          const contested = tickFlightContestAgent(
            agent,
            intercept,
            agent.player ?? throwDecision.receiver,
            'offense',
            discSample,
            rng,
          )
          return {
            ...contested,
            teamId: possessionTeam,
            fieldRole: agent.fieldRole,
            stackIndex: agent.stackIndex,
            isDump: agent.isDump,
            isThrower: false,
          }
        }
        return {
          ...tickOffenseAgentDuringFlight(agent, {
            discSample,
            throwerId: thrower.id,
            throwerPos,
            forceSide,
            possessionTeam,
            flight,
            rng,
            dtSec: DT_SEC,
            teammates: offensePositions,
          }),
          teamId: possessionTeam,
          fieldRole: agent.fieldRole,
          stackIndex: agent.stackIndex,
          isDump: agent.isDump,
          isThrower: agent.isThrower ?? false,
        }
      })

      defenseAgents = defenseAgents.map((defAgent) => {
        const isPrimary =
          defAgent.player?.id === flight.defenderId || defAgent.id === flight.defenderId
        if (isPrimary) {
          const contested = tickFlightContestAgent(
            defAgent,
            intercept,
            defAgent.player ?? throwDecision.defender,
            'defense',
            discSample,
            rng,
          )
          return {
            ...contested,
            state: DEFENDER_STATE.CONTESTING_DISC,
          }
        }
        const targetOff = personMark
          ? resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups)
          : resolvePersonMarkTarget(defAgent, offenseAgents, null)
        const isMarkerOnThrower =
          targetOff?.isThrower || targetOff?.player?.id === thrower.id
        return tickDefenseAgent(defAgent, {
          targetOffense: targetOff,
          throwerAgent,
          disc: discForAi,
          forceSide,
          dtSec: DT_SEC,
          ms,
          isMarkerOnThrower,
          defenseStyle,
          possessionTeam,
          stallCount: 1,
          rng,
          activePoachers: defenseAgents.filter((a) => a.state === DEFENDER_STATE.POACHING)
            .length,
          attackSign,
          defenseTactics: defenseTeam?.tactics,
        })
      })

      const adjusted = applyFlightResolutionToAgents(
        flight,
        offenseAgents,
        defenseAgents,
        discSample,
      )
      offenseAgents = adjusted.offenseAgents
      defenseAgents = adjusted.defenseAgents

      flight.elapsedMs += SIM_TICK_MS
    } else {
      const throwerPos = { x: discX, y: discY }
      const activeCutterCount = offenseAgents.filter(
        (a) =>
          !a.isThrower &&
          (a.state === CUTTER_STATE.ACTIVE_CUT || a.state === CUTTER_STATE.INITIATING_CUT),
      ).length

      offenseAgents = offenseAgents.map((agent, idx) => {
        if (agent.isThrower) {
          return { ...agent, x: discX, y: discY }
        }
        const situation = evaluatePlayerSituation(agent.player, {
          x: agent.x,
          y: agent.y,
          offensePositions,
          defensePositions,
          disc,
          forceSide,
          possessionTeam,
          throwerPos,
        })
        return {
          ...tickCutterBrain({ ...agent, player: agent.player }, {
            dtSec: DT_SEC,
            disc,
            possessionTeam,
            forceSide,
            situation,
            rng,
            stackIndex: agent.stackIndex ?? idx,
            isThrower: false,
            isDump: agent.isDump,
            postCatchReorg,
            throwerId: thrower.id,
            throwerPos,
            postResetClearout,
            elapsedMs: ms,
            teammates: offensePositions,
            activeCutters: activeCutterCount,
            attackStyle,
            maxCutters: maxConcurrentCutters(attackStyle),
            offenseTactics: offenseTeam?.tactics,
          }),
          teamId: possessionTeam,
          fieldRole: agent.fieldRole,
          stackIndex: agent.stackIndex,
          isDump: agent.isDump,
          isThrower: false,
        }
      })

      defenseAgents = defenseAgents.map((defAgent) => {
        const targetOff = personMark
          ? resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups)
          : resolvePersonMarkTarget(defAgent, offenseAgents, null)
        const isMarkerOnThrower =
          targetOff?.isThrower || targetOff?.player?.id === thrower.id
        const activePoachers = defenseAgents.filter(
          (a) => a.state === DEFENDER_STATE.POACHING,
        ).length
        return tickDefenseAgent(defAgent, {
          targetOffense: targetOff,
          throwerAgent,
          disc,
          forceSide,
          dtSec: DT_SEC,
          ms,
          isMarkerOnThrower,
          defenseStyle,
          possessionTeam,
          stallCount: decisionStall,
          rng,
          activePoachers,
          attackSign,
          defenseTactics: defenseTeam?.tactics,
        })
      })
    }

    if (staminaMaps) {
      drainAgentsTickStamina(
        staminaMaps,
        offenseAgents,
        possessionTeam,
        possessionTeam,
        tickKinematics,
        DT_SEC,
      )
      drainAgentsTickStamina(
        staminaMaps,
        defenseAgents,
        defenseTeamId,
        possessionTeam,
        tickKinematics,
        DT_SEC,
      )
    }

    let discSnapshot = null
    if (flight) {
      const sample =
        discSample ?? sampleFlightDisc(flight, Math.max(0, flight.elapsedMs - SIM_TICK_MS))
      if (flightComplete(flight)) {
        discSnapshot = finalDiscAfterFlight(flight, sample, offenseAgents, attackSign)
      } else {
        discSnapshot = discPositionInFlight(sample.x, sample.y, sample.z ?? 0)
      }
    } else if (throwerAgent) {
      discSnapshot = discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
    }

    frames.push(
      snapshotFrame(ms, offenseAgents, defenseAgents, thrower.id, discSnapshot, markerId, liveStall),
    )

    if (!flight) {
      const option = scanThrowOptions(thrower, offenseAgents, defenseAgents, {
        disc,
        stallCount: decisionStall,
        forceSide,
        possessionTeam,
        wind,
        rng,
        setupElapsedMs: ms,
        postCatchReorg,
        lastThrowerId,
        hardStallCount: Math.max(hardStallCount ?? 1, decisionStall),
        requireForwardPass,
        attackStyle,
        defenseStyle,
        offenseTactics: offenseTeam?.tactics,
      })

      const atkStyle = attackStyle
      const defStyle = defenseStyle
      const throwerCoach = mergeTraitAndCoachMods(thrower, offenseTeam?.tactics, 'offense')
      const gateBase =
        throwReleaseGateMs(decisionStall, option?.forwardProgress ?? 0, {
          postCatchReorg,
          isContinuationCut: option?.isContinuationCut === true,
          separation: option?.situation?.separation ?? 0,
          crowded: option?.traffic?.crowded === true,
          teammateCrowd: option?.traffic?.teammateCrowd ?? 0,
          continuationUrgency: attackMods(atkStyle).continuationUrgency ?? 0.15,
        }) *
          throwReleaseGateMultiplier(atkStyle, defStyle) *
          (throwerCoach.releaseGateMult ?? 1) +
        throwerPatienceBonusMs(thrower)
      // Jitter w górę częściej niż w dół — rzadziej „przyśpieszamy” set play.
      const releaseGateMs = gateBase * (0.95 + rng.float() * 0.25)
      if (option && ms >= Math.max(0, releaseGateMs)) {
        const defender = isPersonDefense(defenseStyle)
          ? defenderForPersonMark(personMatchups, option.player, defenseLineup, rng)
          : defenseLineup[0]
        const recvAgent =
          option.agent ??
          offenseAgents.find((a) => a.player?.id === option.player?.id)
        const fromX = throwerAgent?.x ?? discX
        const fromY = throwerAgent?.y ?? discY
        // Rzut w lead / punkt cutu (B), nie w bieżącą pozycję startu cutu (A).
        const catchPt =
          option.catchX != null && option.catchY != null
            ? { x: option.catchX, y: option.catchY }
            : predictReceiverCatchPoint(recvAgent, fromX, fromY)
        const toX = catchPt.x
        const toY = catchPt.y

        throwDecision = {
          receiver: option.player,
          receiverAgent: recvAgent,
          throwType: option.throwType ?? THROW_TYPE.STANDARD,
          throwTechnique: option.throwTechnique,
          isOpenSide: option.isOpenSide,
          defender,
          separation: separationFromSituation(option.situation, rng, decisionStall),
          throwMs: ms,
          holdMs,
          // Stall z zegara posiadania (1 s = 1); nie podbijaj sztucznie do 1 przed 1. sekundą.
          stallCount: Math.max(1, liveStall || stallCountFromHoldMs(Math.max(holdMs, 1000))),
          optionScore: option.score,
          catchX: toX,
          catchY: toY,
          laneThreats: option.laneThreats ?? option.traffic?.laneThreats ?? [],
          traffic: option.traffic ?? null,
          markerId,
        }

        if (onThrowCommitted) {
          const commit = onThrowCommitted(throwDecision, {
            offenseAgents,
            defenseAgents,
            ms,
          })
          if (commit?.abort) {
            // Odrzucony look — nie przerywaj setupu; stall płynie dalej.
            throwDecision = null
            continue
          }
          const trajectory =
            commit?.trajectory ?? throwProfile(throwDecision.throwType).trajectory
          if (commit?.throwType) throwDecision.throwType = commit.throwType
          if (commit?.defender) throwDecision.defender = commit.defender
          const flightDefender = throwDecision.defender ?? defender
          flight = createFlightContext({
            fromX,
            fromY,
            toX,
            toY,
            throwType: throwDecision.throwType,
            trajectory,
            receiverId: throwDecision.receiver.id,
            defenderId: flightDefender?.id,
            throwerId: thrower.id,
            receiver: throwDecision.receiver,
            resolution: commit?.resolution ?? null,
            throwMs: ms,
            weather: wind,
          })
          if (commit?.separation) throwDecision.separation = commit.separation
          commitMeta = commit
        } else {
          break
        }
      }
    }
  }

  if (stallOut || !throwDecision) {
    return {
      stallAbort: true,
      stallOut,
      frames,
      tickMs: SIM_TICK_MS,
      holdMsAtEnd,
      holdStartMs,
      stallCount: stallCountFromHoldMs(holdMsAtEnd),
      markerId,
      endStates: snapshotAgentStates(offenseAgents, defenseAgents),
      motionTrace: buildMotionTracePayload({
        frames,
        throwMs: null,
        discX,
        discY,
        flight: null,
        possessionTeam,
        markerId,
        holdStartMs,
      }),
    }
  }

  const motionTrace = buildMotionTracePayload({
    frames,
    throwMs: throwDecision.throwMs,
    discX,
    discY,
    flight,
    possessionTeam,
    resolution: flight?.resolution ?? commitMeta?.resolution ?? null,
    markerId,
    holdStartMs,
  })

  return {
    stallAbort: false,
    stallOut: false,
    commitAbort: false,
    commitMeta,
    receiver: throwDecision.receiver,
    throwType: throwDecision.throwType,
    throwTechnique: throwDecision.throwTechnique,
    isOpenSide: throwDecision.isOpenSide,
    defender: throwDecision.defender,
    separation: throwDecision.separation,
    throwMs: throwDecision.throwMs,
    holdMsAtEnd: throwDecision.holdMs ?? holdMsAtEnd,
    holdStartMs,
    stallCount: throwDecision.stallCount ?? stallCountFromHoldMs(throwDecision.holdMs ?? holdMsAtEnd),
    markerId,
    frames,
    tickMs: SIM_TICK_MS,
    discX,
    discY,
    motionTrace,
    endStates: snapshotAgentStates(offenseAgents, defenseAgents),
  }
}

/** @deprecated Użyj {@link runContinuousThrowSimulation} — zachowane dla kompatybilności (bez fazy lotu). */
export function runThrowSetupSimulation(params) {
  return runContinuousThrowSimulation({ ...params, onThrowCommitted: null })
}
