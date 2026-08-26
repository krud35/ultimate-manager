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
import {
  predictReceiverCatchPoint,
  DEEP_CUT_FLIGHT_SPEED_MPS,
  DEEP_CUT_MAX_LEAD_SEC,
} from './discFlightPredict.js'
import {
  createFlightContext,
  sampleFlightDisc,
  tickFlightContestAgent,
  tickOffenseAgentDuringFlight,
  flightComplete,
  applyFlightResolutionToAgents,
  finalDiscAfterFlight,
  LAYOUT_DIST_M,
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
import { HUCK_MIN_YARDS } from '../matchStats.js'

export const SIM_TICK_MS = 20
/** Stały krok symulacji (50 Hz); jedna ciągła pętla setup → lot */
const DT_SEC = SIM_TICK_MS / 1000
/** Pełny stall-out = 10 s krycia. */
const MAX_SETUP_MS = STALL_MAX * STALL_SECOND_MS + SIM_TICK_MS
// Musi być >= sufitu totalFlightMs w createFlightContext (flightKinematics.js) + margines,
// inaczej dłuższe loty (miękkie, dalekie rzuty) nie mieszczą się w budżecie ticków.
const MAX_FLIGHT_MS = 9700
/**
 * Jeśli obrońca jest dalej od swojej marki niż ten dystans na starcie rzutu,
 * doklejamy go do shade (inaczej po reorganizacji O / turnoverze „gubi” człowieka).
 */
const DEFENSE_REANCHOR_GAP_M = 5.5
/** Faza 4a (shadow mode): okno przed złapaniem, w którym śledzimy realną odległość 3D
 * każdego obrońcy/receivera do dysku — zbliżone do LAYOUT_TIME_MS (kiedy layout/skok
 * może się realnie zdarzyć). */
const CONTEST_WINDOW_MS = 260

function agentPlayerId(agent) {
  return agent?.player?.id ?? agent?.id ?? null
}

// Faza 4a (shadow mode) — opcjonalny log diagnostyczny do porównania geometrii z
// abstrakcyjnym resolveThrow bez dotykania point.js/kontraktu gry. Zero kosztu gdy nikt
// nie woła __getShadowContestLog (tmp-*.mjs harness). Nie jest to stan gry.
let __shadowContestLog = []
export function __getShadowContestLog() {
  return __shadowContestLog
}
export function __clearShadowContestLog() {
  __shadowContestLog = []
}

/**
 * Faza 4a (shadow mode) — zwija zebrane w oknie kontestu minimalne odległości 3D w jeden
 * podsumowujący obiekt do porównania z abstrakcyjnym resolveThrow (flight.resolution).
 * Czysto diagnostyczne: nic z tego nie wraca do gry ani nie zmienia stanu meczu.
 */
function summarizeShadowContest(shadowContest, flight) {
  if (!shadowContest || !flight) return null
  let nearestDefenderId = null
  let nearestDefenderMinDist3D = Infinity
  for (const [id, d] of shadowContest.defenders) {
    if (d < nearestDefenderMinDist3D) {
      nearestDefenderMinDist3D = d
      nearestDefenderId = id
    }
  }
  const assignedDefenderMinDist3D = shadowContest.defenders.get(flight.defenderId) ?? null
  const receiverMinDist3D = Number.isFinite(shadowContest.receiverMinDist3D)
    ? shadowContest.receiverMinDist3D
    : null
  const geometricSuccess = receiverMinDist3D != null && receiverMinDist3D <= LAYOUT_DIST_M
  const abstractSuccess = flight.resolution?.success ?? null
  return {
    receiverMinDist3D,
    assignedDefenderMinDist3D,
    nearestDefenderId,
    nearestDefenderMinDist3D: Number.isFinite(nearestDefenderMinDist3D)
      ? nearestDefenderMinDist3D
      : null,
    poacherWasClosest: nearestDefenderId != null && nearestDefenderId !== flight.defenderId,
    geometricSuccess,
    abstractSuccess,
    agreesWithAbstract: abstractSuccess == null ? null : geometricSuccess === abstractSuccess,
  }
}

/**
 * Faza 4b planu 3D: prawdziwa decyzja complete/block/drop na podstawie tego, kto
 * faktycznie był najbliżej dysku w 3D pod koniec lotu (nie statycznie przypisanego
 * obrońcy — patrz shadowContest, który śledzi WSZYSTKICH obrońców, więc poaczer bliżej
 * dysku niż przypisana marka realnie przejmuje kredyt za blok). Uproszczony tie-break:
 * obrońca WYRAŹNIE bliżej niż receiver (< 70% jego dystansu) wygrywa kontest mimo że
 * receiver technicznie w zasięgu — realny skill (jump/reach) już wpływa na te dystanse
 * przez Fazę 3 (prawdziwe łuki skoku), więc nie potrzeba tu osobnego rzutu kością.
 */
/** Mutowalny obiekt kalibracyjny — jak MISS_CALIBRATION w resolution.js, pozwala
 * skryptowi kalibrującemu testować wiele wartości w jednym procesie Node. */
export const GEOMETRIC_CALIBRATION = {
  // Wykalibrowane empirycznie (tmp-calibrate-geometric.mjs, grid-search jak przy
  // oryginalnej DISTANCE_GAP_TABLE) — DWIE rundy: pierwsza (catchReachM=3.0) trafiła
  // ~89.4% overall, zanim naprawiono samouzgodniony dobór sufitu predykcji leadu
  // (throwerBrain.js/discFlightPredict.js — patrz komentarz tam), co drastycznie
  // poprawiło realną zbieżność receivera do celu (9.6%→0.8% czystych niepowodzeń
  // geometrii dla standardowych rzutów). Po tej naprawie catchReachM=3.0 był już za
  // hojny (97%+); domknięte ponownie do 1.6m — finalnie: overall 94.9%, standard 95.6%
  // (baseline 94.9%), dump_swing 100% (dokładne trafienie).
  catchReachM: 1.6,
  contestRelativeThreshold: 0.15,
  contestAbsoluteThreshold: 1.2,
}

function computeGeometricResolution(shadowContest, flight) {
  const summary = summarizeShadowContest(shadowContest, flight)
  if (!summary || summary.receiverMinDist3D == null) return null
  const { catchReachM, contestRelativeThreshold, contestAbsoluteThreshold } = GEOMETRIC_CALIBRATION
  const receiverInReach = summary.receiverMinDist3D <= catchReachM
  const defenderInReach =
    summary.nearestDefenderMinDist3D != null && summary.nearestDefenderMinDist3D <= catchReachM
  // Próg 0.7x dawał zbyt dużo "wygranych" obrońcy przy krótkich, bliskich wymianach
  // (dump/swing, krótki standard) — tam receiver i obrońca naturalnie klastrują się
  // blisko dysku nawet przy normalnym, niezagrożonym złapaniu (realny dump prawie
  // zawsze się udaje, mimo obrońcy o krok). Wymaga teraz WYRAŹNEJ I bezwzględnej
  // przewagi — inaczej receiver zatrzymuje dysk. Dłuższych/kontestowanych
  // rzutów to prawie nie dotyczy (naturalna separacja przy złapaniu większa).
  const defenderWinsContest =
    defenderInReach &&
    summary.nearestDefenderMinDist3D < summary.receiverMinDist3D * contestRelativeThreshold &&
    summary.nearestDefenderMinDist3D < contestAbsoluteThreshold
  if (receiverInReach && !defenderWinsContest) {
    return { success: true, isBlock: false, defenderId: null }
  }
  return {
    success: false,
    isBlock: defenderInReach,
    defenderId: defenderInReach ? summary.nearestDefenderId : null,
  }
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
      z: 0,
      vz: 0,
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
        z: 0,
        vz: 0,
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
      z: a.z ?? 0,
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
        z: a.z ?? 0,
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
      z: 0,
      vz: 0,
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
  // Faza 4a planu 3D (shadow mode) — realny geometryczny kontest liczony z prawdziwych
  // pozycji 3D w oknie tuż przed złapaniem, TYLKO do logowania/porównania z abstrakcyjnym
  // resolveThrow (flight.resolution) — nie zmienia niczego w faktycznym wyniku gry. Śledzi
  // WSZYSTKICH obrońców (nie tylko statycznie przypisanego), więc łapie realny wpływ
  // poacha, jeśli faktycznie jest bliżej dysku niż przypisany obrońca.
  let shadowContest = null

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
      // Prosta linia do finalnego miejsca lądowania (flight.toX/toY), nie pościg za
      // bieżącą pozycją dysku na ścieżce — patrz komentarz w createFlightContext.
      const intercept = { x: flight.toX, y: flight.toY }
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
          // Reakcja na wypuszczony dysk zajmuje chwilę — dobrze pokonany obrońca (duży
          // margines separacji) stoi dłużej, zanim zacznie gonić nowy cel (patrz komentarz
          // w createFlightContext), zamiast biec pełną prędkością od pierwszego ticka lotu.
          if (flight.elapsedMs < (flight.defenderReactionDelayMs ?? 0)) {
            return { ...defAgent, state: DEFENDER_STATE.CONTESTING_DISC }
          }
          const contested = tickFlightContestAgent(
            defAgent,
            intercept,
            defAgent.player ?? throwDecision.defender,
            'defense',
            discSample,
            rng,
            flight.defenderSpeedMult ?? 1,
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

      if (discSample.timeToDisc <= CONTEST_WINDOW_MS) {
        if (!shadowContest) {
          shadowContest = { receiverMinDist3D: Infinity, defenders: new Map() }
        }
        const recvAgent = offenseAgents.find((a) => a.id === flight.receiverId)
        if (recvAgent) {
          const d3 = Math.hypot(
            discSample.x - recvAgent.x,
            discSample.y - recvAgent.y,
            discSample.z - (recvAgent.z ?? 0),
          )
          if (d3 < shadowContest.receiverMinDist3D) shadowContest.receiverMinDist3D = d3
        }
        for (const dAgent of defenseAgents) {
          const dId = agentPlayerId(dAgent)
          if (dId == null) continue
          const d3 = Math.hypot(
            discSample.x - dAgent.x,
            discSample.y - dAgent.y,
            discSample.z - (dAgent.z ?? 0),
          )
          const prev = shadowContest.defenders.get(dId)
          if (prev == null || d3 < prev) shadowContest.defenders.set(dId, d3)
        }
      }

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
        // Rzut w lead / punkt cutu (B), nie w bieżącą pozycję startu cutu (A). Samouzgodniony
        // dwuprzebiegowy dobór sufitu predykcji (ciasny -> hojny tylko jeśli WYNIK sam z
        // siebie wychodzi huck-owy) — patrz komentarz przy analogicznym wywołaniu w
        // throwerBrain.js.
        const catchPt =
          option.catchX != null && option.catchY != null
            ? { x: option.catchX, y: option.catchY }
            : (() => {
                const tight = predictReceiverCatchPoint(recvAgent, fromX, fromY)
                const tightDist = Math.hypot(tight.x - fromX, tight.y - fromY)
                if (tightDist < HUCK_MIN_YARDS) return tight
                return predictReceiverCatchPoint(
                  recvAgent,
                  fromX,
                  fromY,
                  DEEP_CUT_FLIGHT_SPEED_MPS,
                  DEEP_CUT_MAX_LEAD_SEC,
                )
              })()
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
          // Faza 4b planu 3D: gorszy rzut (mały/ujemny margines throwScore-defenseScore)
          // może przesunąć realny cel lotu (miss) — geometria po zakończeniu lotu decyduje
          // wtedy naprawdę, czy taki tor kończy się złapaniem. Patrz resolution.js:
          // computeMissDistanceM, point.js: onThrowCommitted.
          const finalToX = commit?.adjustedToX ?? toX
          const finalToY = commit?.adjustedToY ?? toY
          flight = createFlightContext({
            fromX,
            fromY,
            toX: finalToX,
            toY: finalToY,
            throwType: throwDecision.throwType,
            trajectory,
            receiverId: throwDecision.receiver.id,
            defenderId: flightDefender?.id,
            throwerId: thrower.id,
            receiver: throwDecision.receiver,
            receiverAgent: throwDecision.receiverAgent,
            separationMargin: commit?.separation?.margin ?? throwDecision.separation?.margin ?? null,
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
    geometricResolution: computeGeometricResolution(shadowContest, flight),
    geometricShadow: (() => {
      const g = summarizeShadowContest(shadowContest, flight)
      if (g) {
        const ra = throwDecision.receiverAgent
        const predictedLeadDist =
          ra != null ? Math.hypot(flight.toX - ra.x, flight.toY - ra.y) : null
        __shadowContestLog.push({
          ...g,
          throwType: throwDecision.throwType,
          receiverState: ra?.state ?? null,
          predictedLeadDist,
          totalFlightMs: flight.totalFlightMs,
          throwDistanceM: Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY),
        })
      }
      return g
    })(),
  }
}

/** @deprecated Użyj {@link runContinuousThrowSimulation} — zachowane dla kompatybilności (bez fazy lotu). */
export function runThrowSetupSimulation(params) {
  return runContinuousThrowSimulation({ ...params, onThrowCommitted: null })
}
