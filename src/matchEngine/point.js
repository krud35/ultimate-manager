import { MATCH_CONFIG } from './config.js'
import { recordBlock, recordGoal, recordTurnover } from './boxScore.js'
import {
  buildPointLineups,
  createPersonMatchups,
  defenderForPersonMark,
  getLineupForTeam,
  isPersonDefense,
  personMatchupPairs,
  pickDefender,
  pickDumpReceiver,
  pickReceiver,
  pickThrower,
} from './participants.js'
import {
  computeThrowAdvance,
  isInEndzone,
  resolveThrow,
} from './resolution.js'
import { createEvent, EVENT } from './events.js'
import {
  recordThrowAttempt,
  yardsFromPositions,
} from './matchStats.js'
import { discMetersFromState, discPositionFromFieldMeters, resolveMarkForceSide } from './fieldViz.js'
import {
  pickThrowType,
  throwProfile,
  buildThrowNarrative,
  isHuckType,
  THROW_TYPE,
} from './throwTypes.js'
import { resolveSeparation } from './separation.js'
import {
  offenseRoleSlot,
  receiverFieldYMeters,
} from './fieldPlayback.js'
import { attackDirectionX, fieldCenterY } from './fieldDimensions.js'
import { effectiveDecisionStall } from './ai/throwerDecision.js'
import {
  STALL_MAX,
  stallThrowModifiers,
  stallCountFromHoldMs,
  decisionStallFromHoldMs,
  isStallOutHoldMs,
} from './stall.js'
import {
  applyStaminaFromMotionTrace,
  buildPointPlayersById,
  cloneStaminaMaps,
  getStamina,
  motionFatigueModifiers,
  syncLineupStaminaFromMaps,
} from './stamina.js'
import { runThrowMotionSimulation } from './ai/motionPipeline.js'
import { resolveCatchPointFromMotionTrace, resolveTurnoverPointFromMotionTrace } from './motionFromTicks.js'
import { offenseFieldPositionsFromStates } from './ai/offenseReorganization.js'
import { recordPointPlayedForPlayers } from '../models/playerStats.js'
import {
  lineStylesForPointStart,
  pointStartRoleForTeam,
} from './lineups.js'

function playerLabel(p) {
  return `${p.firstName} ${p.lastName}`
}

/**
 * Symuluje jeden punkt (pull → wymiany aż punkt lub limit rzutów).
 */
export function simulatePoint({
  homeTeam,
  awayTeam,
  pullTeam,
  pointIndex,
  rng,
  boxScore = null,
  matchStats = null,
  stamina = null,
  wind = null,
}) {
  const events = []
  const attackTeamId = pullTeam === 'home' ? 'away' : 'home'
  let possession = attackTeamId
  let discPosition = MATCH_CONFIG.field.positionAfterPull

  /**
   * Zmiana stron co punkt (jak w realnym ultimate) — niezależnie od tego, kto zdobył
   * poprzedni punkt. `possession`/`stamina`/boxScore/matchStats zostają kluczowane po
   * realnej drużynie (home/away); `geo()` daje tylko etykietę do funkcji geometrycznych
   * (kierunek ataku, przeliczenie discPosition ↔ metry boiska), żeby żadna drużyna nie
   * atakowała cały mecz w tym samym fizycznym kierunku.
   * Wiatr NIE jest tu odwracany — to osobny, świadomy czynnik (patrz harness Fazy 0).
   */
  const sidesSwapped = pointIndex % 2 === 0
  const geo = (side) => (sidesSwapped ? (side === 'home' ? 'away' : 'home') : side)
  const geoStaminaMaps = (maps) =>
    sidesSwapped && maps ? { ...maps, home: maps.away, away: maps.home } : maps

  const homePointRole = pointStartRoleForTeam('home', pullTeam)
  const awayPointRole = pointStartRoleForTeam('away', pullTeam)
  const stampLine = (team, role) => ({
    ...team,
    _pointStartRole: role,
    tactics: team?.tactics
      ? { ...team.tactics, _pointStartRole: role }
      : { _pointStartRole: role },
  })
  const homeTeamOnPoint = stampLine(homeTeam, homePointRole)
  const awayTeamOnPoint = stampLine(awayTeam, awayPointRole)

  const teamById = (id) => (id === 'home' ? homeTeamOnPoint : awayTeamOnPoint)
  const stylesForTeam = (teamId) =>
    lineStylesForPointStart(
      teamById(teamId).tactics,
      teamId === 'home' ? homePointRole : awayPointRole,
    )
  const pointLineups = buildPointLineups(homeTeamOnPoint, awayTeamOnPoint, attackTeamId)

  const homeLineupIds = pointLineups.home.map((p) => p.id)
  const awayLineupIds = pointLineups.away.map((p) => p.id)
  const homeLineStyles = stylesForTeam('home')
  const awayLineStyles = stylesForTeam('away')

  events.push(
    createEvent(EVENT.POINT_START, {
      pointIndex,
      pullTeam,
      attackTeam: attackTeamId,
      homeLineupIds,
      awayLineupIds,
      homePointStartRole: homePointRole,
      awayPointStartRole: awayPointRole,
      homeAttackStyle: homeLineStyles.attackStyle,
      homeDefenseStyle: homeLineStyles.defenseStyle,
      awayAttackStyle: awayLineStyles.attackStyle,
      awayDefenseStyle: awayLineStyles.defenseStyle,
      sidesSwapped,
      staminaSnapshot: stamina ? cloneStaminaMaps(stamina) : null,
    }),
  )
  events.push(
    createEvent(EVENT.PULL, {
      team: pullTeam,
      teamName: teamById(pullTeam).name,
    }),
  )
  events.push(
    createEvent(EVENT.POSSESSION, {
      team: possession,
      teamName: teamById(possession).name,
      discPosition,
      discYMeters: fieldCenterY(),
    }),
  )

  let throwCount = 0
  let scoringTeam = null
  let lastScoringThrowerId = null
  let lastScoringReceiverId = null
  let personMatchups = null
  /** Zawodnik z dyskiem; po udanym rzucie = odbiorca. Po turnoverze / pullu — null (pierwszy rzut losowany). */
  let discHolder = null
  /** Czas trzymania dysku w ms — stall = floor(holdMs/1000). */
  let holdMs = 0
  let stallCount = 0
  let discYMeters = fieldCenterY()
  /** Pozycje ofensywy między rzutami (po złapaniu — bez snapu do stacka). */
  /** Stan zawodników z końca poprzedniego rzutu — zapewnia płynne przejście między rzutami. */
  let liveAgentStates = null
  /** Po dump/reset (+0m) — wymuszone głębokie cięcia w następnej symulacji setupu. */
  let postResetClearout = false
  /** Ile podań z rzędu nie dało postępu — podbija agresję mimo zerowania stalla. */
  let resetChain = 0
  /** Kto podał do obecnego posiadacza — blokuje natychmiastowe odbicie dysku. */
  let lastThrowerId = null

  function narrativeContext() {
    return {
      possessionTeam: possession,
      homeName: homeTeam.name,
      awayName: awayTeam.name,
    }
  }

  function defendingTeamId() {
    return possession === 'home' ? 'away' : 'home'
  }

  function syncPlayerStamina(player) {
    if (!player || !stamina) return
    const side = possession === 'home' ? 'home' : 'away'
    const map = side === 'home' ? stamina.home : stamina.away
    player.currentStamina = getStamina(map, player.id)
  }

  function applyThrowStaminaFromTrace(motionTrace, simResult, offenseLineup, defenseLineup, baseline) {
    if (!stamina) return
    const playersById = buildPointPlayersById(offenseLineup, defenseLineup, possession)
    const defSide = defendingTeamId()
    if (motionTrace?.frames?.length) {
      applyStaminaFromMotionTrace(
        stamina,
        motionTrace,
        playersById,
        possession,
        baseline,
      )
    } else if (simResult?.frames?.length) {
      applyStaminaFromMotionTrace(
        stamina,
        { frames: simResult.frames, tickMs: simResult.tickMs ?? 200 },
        playersById,
        possession,
        baseline,
      )
    }
    syncLineupStaminaFromMaps(stamina, offenseLineup, possession)
    syncLineupStaminaFromMaps(stamina, defenseLineup, defSide)
  }

  function setupPersonMatchupsForPossession() {
    personMatchups = null
    const defId = defendingTeamId()
    const defTeam = teamById(defId)
    const defStyle = stylesForTeam(defId).defenseStyle
    if (!isPersonDefense(defStyle)) return

    const offenseLineup = getLineupForTeam(pointLineups, possession)
    const defenseLineup = getLineupForTeam(pointLineups, defId)
    personMatchups = createPersonMatchups(rng, offenseLineup, defenseLineup)

    events.push(
      createEvent(EVENT.PERSON_MATCHUPS, {
        pointIndex,
        defenseTeam: defendingTeamId(),
        defenseTeamName: defTeam.name,
        pairs: personMatchupPairs(personMatchups, offenseLineup),
      }),
    )
  }

  setupPersonMatchupsForPossession()

  function applyTurnoverAtPosition({
    reason = null,
    turnoverThrowerId = null,
    discY = discYMeters,
    fieldX = null,
  } = {}) {
    if (boxScore && turnoverThrowerId) {
      recordTurnover(boxScore, turnoverThrowerId)
    }
    // Absolutna pozycja dysku na boisku zostaje — zmieniamy tylko kodowanie
    // względem nowej drużyny w posiadaniu.
    const absX =
      fieldX != null && Number.isFinite(fieldX)
        ? fieldX
        : discMetersFromState(discPosition, geo(possession))
    possession = possession === 'home' ? 'away' : 'home'
    discPosition = discPositionFromFieldMeters(absX, geo(possession))
    discHolder = null
    holdMs = 0
    stallCount = 0
    discYMeters = discY
    resetChain = 0
    postResetClearout = false
    lastThrowerId = null
    // Role O/D się odwracają — stare seed'y powodowały krycie „po indeksie” z daleka.
    liveAgentStates = null
    events.push(
      createEvent(EVENT.TURNOVER, {
        newPossession: possession,
        teamName: teamById(possession).name,
        discPosition,
        discYMeters: discY,
        reason,
        turnoverPoint: { x: absX, y: discY },
      }),
    )
    events.push(
      createEvent(EVENT.POSSESSION, {
        team: possession,
        teamName: teamById(possession).name,
        discPosition,
        discYMeters: discY,
      }),
    )
    setupPersonMatchupsForPossession()
  }

  while (throwCount < MATCH_CONFIG.maxThrowsPerPoint && !scoringTeam) {
    const offenseTeam = teamById(possession)
    const defenseTeam = teamById(possession === 'home' ? 'away' : 'home')
    const offenseLineup = getLineupForTeam(pointLineups, possession)
    const defenseLineup = getLineupForTeam(
      pointLineups,
      possession === 'home' ? 'away' : 'home',
    )

    const attackStyle = stylesForTeam(possession).attackStyle
    const defenseStyle = stylesForTeam(
      possession === 'home' ? 'away' : 'home',
    ).defenseStyle

    const thrower = discHolder ?? pickThrower(rng, offenseLineup, offenseTeam.tactics)
    syncPlayerStamina(thrower)
    stallCount = stallCountFromHoldMs(holdMs)

    const staminaBaseline = stamina ? cloneStaminaMaps(stamina) : null
    const simStaminaMaps = stamina ? cloneStaminaMaps(stamina) : null

    const defenseLineupForMark = getLineupForTeam(
      pointLineups,
      possession === 'home' ? 'away' : 'home',
    )
    const markerDefender = isPersonDefense(defenseStyle)
      ? defenderForPersonMark(personMatchups, thrower, defenseLineupForMark, rng)
      : pickDefender(rng, defenseLineupForMark)

    if (isStallOutHoldMs(holdMs)) {
      events.push(
        createEvent(EVENT.STALL_OUT, {
          stallCount: STALL_MAX,
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          defenderId: markerDefender?.id,
          defenderName: markerDefender ? playerLabel(markerDefender) : null,
          markerId: markerDefender?.id ?? null,
          possessionTeam: possession,
          discPosition,
          discYMeters,
          ...buildThrowNarrative({
            phase: 'stall_out',
            stallOut: true,
            ...narrativeContext(),
            throwerName: playerLabel(thrower),
            defenderName: markerDefender ? playerLabel(markerDefender) : '',
          }),
        }),
      )
      applyTurnoverAtPosition({
        reason: 'stall_out',
        turnoverThrowerId: thrower.id,
        discY: discYMeters,
      })
      continue
    }

    let throwCommit = null
    const decisionStallBase = effectiveDecisionStall(
      decisionStallFromHoldMs(holdMs),
      resetChain,
    )

    const sim = runThrowMotionSimulation({
      rng,
      thrower,
      offenseLineup,
      defenseLineup,
      personMatchups,
      possessionTeam: geo(possession),
      discPosition,
      discYMeters,
      stallCount: decisionStallBase,
      startHoldMs: holdMs,
      offenseTeam,
      defenseTeam,
      wind,
      staminaMaps: geoStaminaMaps(simStaminaMaps),
      seedStates: liveAgentStates,
      postResetClearout,
      lastThrowerId,
      hardStallCount: Math.max(stallCount, decisionStallFromHoldMs(holdMs)),
      requireForwardPass: resetChain >= 3,
      onThrowCommitted: (decision) => {
        const recv =
          decision.receiver?.id
            ? offenseLineup.find((p) => p.id === decision.receiver.id) ?? decision.receiver
            : null
        if (!recv?.skills) return { abort: true }

        const liveStall =
          decision.stallCount ??
          stallCountFromHoldMs(decision.holdMs ?? holdMs) ??
          decisionStallFromHoldMs(holdMs)
        const stallForResolve = Math.max(1, liveStall)

        let throwType =
          decision.throwType ??
          pickThrowType({
            rng,
            thrower,
            discPosition,
            stallCount: stallForResolve,
            defenseStyle,
            attackStyle,
            defender: markerDefender,
            separation: decision.separation,
            tactics: offenseTeam.tactics,
          })

        if (
          stallForResolve >= 7 &&
          throwType !== THROW_TYPE.DUMP_SWING &&
          decision.throwType === THROW_TYPE.DUMP_SWING
        ) {
          throwType = THROW_TYPE.DUMP_SWING
        }

        const defender =
          decision.defender ??
          (isPersonDefense(defenseStyle)
            ? defenderForPersonMark(personMatchups, recv, defenseLineup, rng)
            : pickDefender(rng, defenseLineup))

        const separation =
          decision.separation ?? resolveSeparation({ receiver: recv, defender, rng })

        if (
          throwType !== THROW_TYPE.DUMP_SWING &&
          separation.outcome === 'tight' &&
          separation.abort
        ) {
          throwCommit = { abort: true, throwType, defender, separation, receiver: recv }
          return { abort: true }
        }

        const throwerFieldX = discMetersFromState(discPosition, geo(possession))
        const catchX = decision.catchX ?? throwerFieldX
        const catchY = decision.catchY ?? discYMeters
        const throwDx = catchX - throwerFieldX
        const throwDy = catchY - discYMeters
        const throwDistanceM = Math.hypot(throwDx, throwDy)

        const stallMods = stallThrowModifiers({
          thrower,
          defender,
          stallCount: stallForResolve,
          separation,
          rng,
          fatigueComposurePenalty: motionFatigueModifiers(thrower.currentStamina ?? 100)
            .composurePenalty,
        })

        const result = resolveThrow({
          thrower,
          receiver: recv,
          defender,
          rng,
          attackStyle,
          defenseStyle,
          throwType,
          separation,
          stallCount: stallForResolve,
          forcedContested: stallMods.forcedContested,
          forceSide: resolveMarkForceSide(defenseTeam, null),
          isOpenSide: decision.isOpenSide ?? true,
          throwTechnique: decision.throwTechnique ?? null,
          throwerY: discYMeters,
          laneThreats: decision.laneThreats ?? null,
          wind,
          throwDx,
          throwDy,
          throwDistanceM,
        })

        const profile = throwProfile(throwType)
        const creditedDefender =
          result.isLaneBlock && result.laneBlocker ? result.laneBlocker : defender
        throwCommit = {
          throwType,
          defender: creditedDefender,
          separation,
          result,
          profile,
          receiver: recv,
          stallMods,
          stallCount: stallForResolve,
          markerId: decision.markerId ?? markerDefender?.id ?? null,
          isOpenSide: decision.isOpenSide ?? true,
          throwTechnique: decision.throwTechnique ?? null,
          throwDx,
          throwDy,
          throwDistanceM,
          windRelation: result.windRelation ?? null,
        }

        return {
          resolution: {
            success: result.success,
            isBlock: result.isBlock,
            isOut: result.isOut,
            isDrop: !result.success && !result.isBlock,
            isLaneBlock: !!result.isLaneBlock,
          },
          trajectory: profile.trajectory,
          throwType,
          defender: creditedDefender,
          separation,
        }
      },
    })
    postResetClearout = false
    liveAgentStates = sim.endStates ?? liveAgentStates
    holdMs = sim.holdMsAtEnd ?? holdMs
    stallCount = sim.stallCount ?? stallCountFromHoldMs(holdMs)
    const eventMarkerId = sim.markerId ?? markerDefender?.id ?? null

    if (sim.stallOut || (sim.stallAbort && isStallOutHoldMs(holdMs))) {
      applyThrowStaminaFromTrace(null, sim, offenseLineup, defenseLineup, staminaBaseline)
      events.push(
        createEvent(EVENT.STALL_OUT, {
          stallCount: STALL_MAX,
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          defenderId: eventMarkerId,
          defenderName: markerDefender ? playerLabel(markerDefender) : null,
          markerId: eventMarkerId,
          possessionTeam: possession,
          discPosition,
          discYMeters,
          motionTrace: sim.motionTrace ?? null,
          ...buildThrowNarrative({
            phase: 'stall_out',
            stallOut: true,
            ...narrativeContext(),
            throwerName: playerLabel(thrower),
            defenderName: markerDefender ? playerLabel(markerDefender) : '',
          }),
        }),
      )
      applyTurnoverAtPosition({
        reason: 'stall_out',
        turnoverThrowerId: thrower.id,
        discY: discYMeters,
      })
      continue
    }

    if (sim.stallAbort) {
      applyThrowStaminaFromTrace(null, sim, offenseLineup, defenseLineup, staminaBaseline)
      events.push(
        createEvent(EVENT.STALL_PRESSURE, {
          stallCount: Math.max(1, stallCount),
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          receiverId: null,
          receiverName: '—',
          defenderId: eventMarkerId,
          defenderName: markerDefender ? playerLabel(markerDefender) : '—',
          markerId: eventMarkerId,
          possessionTeam: possession,
          staminaSnapshot: stamina ? cloneStaminaMaps(stamina) : null,
          motionTrace: sim.motionTrace ?? null,
          holdStartMs: sim.holdStartMs ?? 0,
          ...buildThrowNarrative({
            phase: 'abort',
            ...narrativeContext(),
            throwerName: playerLabel(thrower),
            receiverName: '—',
            defenderName: markerDefender ? playerLabel(markerDefender) : '—',
            throwType: THROW_TYPE.STANDARD,
            stallCount: Math.max(1, stallCount),
          }),
        }),
      )
      continue
    }

    if (sim.commitAbort || throwCommit?.abort) {
      const receiver = throwCommit?.receiver ?? sim.receiver
      const defender = throwCommit?.defender ?? sim.defender
      const throwType = throwCommit?.throwType ?? sim.throwType ?? THROW_TYPE.STANDARD
      events.push(
        createEvent(EVENT.STALL_PRESSURE, {
          stallCount: Math.max(1, stallCount),
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          receiverId: receiver?.id ?? null,
          receiverName: receiver ? playerLabel(receiver) : '—',
          defenderId: eventMarkerId ?? defender?.id ?? null,
          defenderName: markerDefender
            ? playerLabel(markerDefender)
            : defender
              ? playerLabel(defender)
              : '—',
          markerId: eventMarkerId,
          possessionTeam: possession,
          motionTrace: sim.motionTrace ?? null,
          holdStartMs: sim.holdStartMs ?? 0,
          ...buildThrowNarrative({
            phase: 'abort',
            ...narrativeContext(),
            throwerName: playerLabel(thrower),
            receiverName: receiver ? playerLabel(receiver) : '—',
            defenderName: defender ? playerLabel(defender) : '',
            throwType,
            stallCount: Math.max(1, stallCount),
          }),
        }),
      )
      applyThrowStaminaFromTrace(null, sim, offenseLineup, defenseLineup, staminaBaseline)
      continue
    }

    if (!throwCommit) {
      continue
    }

    const {
      receiver,
      defender,
      throwType,
      separation,
      profile,
      result,
      stallMods,
      stallCount: commitStallCount,
      markerId: commitMarkerId,
      isOpenSide: commitIsOpenSide = true,
      throwTechnique: commitThrowTechnique = null,
      throwDx: commitThrowDx = 0,
      throwDy: commitThrowDy = 0,
      windRelation: commitWindRelation = null,
    } = throwCommit
    const attemptStall = commitStallCount ?? stallCount
    const ctx = narrativeContext()

    if (simStaminaMaps) {
      syncLineupStaminaFromMaps(simStaminaMaps, offenseLineup, possession)
      syncLineupStaminaFromMaps(simStaminaMaps, defenseLineup, defendingTeamId())
    }

    if (separation.outcome === 'open') {
      events.push(
        createEvent(EVENT.SEPARATION, {
          outcome: separation.outcome,
          receiverId: receiver.id,
          defenderId: defender.id,
          possessionTeam: possession,
          ...buildThrowNarrative({
            phase: 'separation_open',
            ...ctx,
            receiverName: playerLabel(receiver),
            defenderName: playerLabel(defender),
            throwType,
          }),
        }),
      )
    }

    const discPositionBefore = discPosition

    const attemptNarrative = buildThrowNarrative({
      phase: 'attempt',
      ...ctx,
      throwerName: playerLabel(thrower),
      receiverName: playerLabel(receiver),
      defenderName: playerLabel(defender),
      throwType,
      separationOutcome: separation.outcome,
      stallCount: attemptStall,
      forcedContested: stallMods.forcedContested,
    })

    const motionTrace = sim.motionTrace

    applyThrowStaminaFromTrace(
      motionTrace,
      sim,
      offenseLineup,
      defenseLineup,
      staminaBaseline,
    )

    const lineupIds = possession === 'home' ? homeLineupIds : awayLineupIds
    const receiverFieldY = receiverFieldYMeters(
      receiver,
      offenseRoleSlot(lineupIds, receiver.id, thrower.id),
      attackStyle,
      { throwType, discYMeters },
    )

    events.push(
      createEvent(EVENT.THROW_ATTEMPT, {
        throwerId: thrower.id,
        throwerName: playerLabel(thrower),
        receiverId: receiver.id,
        receiverName: playerLabel(receiver),
        defenderId: defender.id,
        defenderName: playerLabel(defender),
        markerId: commitMarkerId ?? eventMarkerId,
        discPosition,
        discPositionBefore,
        possessionTeam: possession,
        defenseStyle,
        attackStyle,
        personMark: isPersonDefense(defenseStyle),
        throwType,
        trajectory: profile.trajectory,
        stallCount: attemptStall,
        holdStartMs: sim.holdStartMs ?? 0,
        separationOutcome: separation.outcome,
        isOpenSide: commitIsOpenSide,
        throwTechnique: commitThrowTechnique ?? sim.throwTechnique ?? null,
        windRelation: commitWindRelation,
        ...attemptNarrative,
        targetFieldY: receiverFieldY,
        motionTrace,
        staminaBeforeThrow: stamina ? cloneStaminaMaps(staminaBaseline) : null,
        staminaAfterThrow: stamina ? cloneStaminaMaps(stamina) : null,
        actionSim: motionTrace
          ? {
              tickMs: motionTrace.tickMs,
              throwMs: motionTrace.throwMs,
              frames: motionTrace.frames,
              discX: motionTrace.discX,
              discY: motionTrace.discY,
            }
          : {
              tickMs: sim.tickMs,
              throwMs: sim.throwMs,
              frames: sim.frames,
              discX: sim.discX,
              discY: sim.discY,
            },
      }),
    )

    throwCount += 1

    const throwerFieldX = discMetersFromState(discPositionBefore, geo(possession))
    const catchPoint = resolveCatchPointFromMotionTrace(motionTrace, receiver.id, true)
    const forwardProgressM = catchPoint
      ? (catchPoint.x - throwerFieldX) * attackDirectionX(geo(possession))
      : null

    const discAfter = computeThrowAdvance(discPositionBefore, throwType, {
      attackStyle,
      defenseStyle,
      rng,
      forwardProgressM,
      wind,
      throwDx: commitThrowDx,
      throwDy: commitThrowDy,
      thrower,
    })
    const yardsIfSuccess = yardsFromPositions(discPositionBefore, discAfter)
    const isHuck = isHuckType(throwType, yardsIfSuccess)

    if (result.success) {
      discPosition = discAfter
      // Dysk zostaje tam, gdzie faktycznie doszło do chwytu — inaczej odbiorca
      // przeskakuje na pozycję wyliczoną z roli w formacji.
      discYMeters = catchPoint?.y ?? receiverFieldY
      const yardsGained = yardsFromPositions(discPositionBefore, discPosition)
      holdMs = 0
      stallCount = 0

      lastThrowerId = thrower.id
      if (yardsGained < 2) {
        postResetClearout = true
        resetChain += 1
      } else {
        postResetClearout = false
        resetChain = 0
      }

      if (matchStats) {
        recordThrowAttempt(matchStats, possession, {
          success: true,
          yardsGained,
          isHuck,
          stallCount: attemptStall,
        })
      }

      const successNarrative = buildThrowNarrative({
        phase: 'success',
        ...ctx,
        throwerName: playerLabel(thrower),
        receiverName: playerLabel(receiver),
        throwType,
        yardsGained,
        success: true,
      })

      events.push(
        createEvent(EVENT.THROW_SUCCESS, {
          discPosition,
          discPositionBefore,
          possessionTeam: possession,
          receiverId: receiver.id,
          yardsGained,
          isHuck,
          stallCount: attemptStall,
          throwType,
          trajectory: profile.trajectory,
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
          isOpenSide: commitIsOpenSide,
          throwTechnique: commitThrowTechnique ?? sim.throwTechnique ?? null,
          windRelation: commitWindRelation,
          ...successNarrative,
          discYMeters,
          catchPoint,
        }),
      )

      const lastEv = events[events.length - 1]
      if (lastEv?.type === EVENT.THROW_SUCCESS) {
        lastEv.offenseFieldPositions = offenseFieldPositionsFromStates(
          liveAgentStates,
          offenseLineup,
        )
      }

      if (isInEndzone(discPosition, possession)) {
        scoringTeam = possession
        lastScoringThrowerId = thrower.id
        lastScoringReceiverId = receiver.id
        events.push(
          createEvent(EVENT.SCORE, {
            team: scoringTeam,
            teamName: teamById(scoringTeam).name,
            throwerId: thrower.id,
            receiverId: receiver.id,
          }),
        )
      } else {
        discHolder = receiver
      }
    } else {
      if (boxScore && result.isBlock) {
        recordBlock(boxScore, defender.id)
      }
      if (boxScore) {
        recordTurnover(boxScore, thrower.id)
      }

      // Dysk zostaje w miejscu bloku / dropu — nie wraca do miejsca rzutu.
      const turnoverPoint = resolveTurnoverPointFromMotionTrace(motionTrace, {
        receiverId: receiver.id,
        defenderId: defender.id,
        isBlock: result.isBlock,
      })
      const absFieldX =
        turnoverPoint?.x ?? discMetersFromState(discPositionBefore, geo(possession))
      const absFieldY = turnoverPoint?.y ?? discYMeters
      const turnoverMeters = absFieldX

      if (matchStats) {
        recordThrowAttempt(matchStats, possession, {
          success: false,
          isHuck,
          turnoverMeters,
          stallCount: attemptStall,
        })
      }

      const failNarrative = buildThrowNarrative({
        phase: 'fail',
        ...ctx,
        throwerName: playerLabel(thrower),
        receiverName: playerLabel(receiver),
        defenderName: playerLabel(defender),
        throwType,
        isBlock: result.isBlock,
        success: false,
      })

      events.push(
        createEvent(EVENT.THROW_FAIL, {
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
          throwerId: thrower.id,
          defenderId: defender.id,
          receiverId: receiver.id,
          possessionTeam: possession,
          discPositionBefore,
          isHuck,
          stallCount: attemptStall,
          throwType,
          trajectory: profile.trajectory,
          turnoverMeters,
          isBlock: result.isBlock,
          isOpenSide: commitIsOpenSide,
          throwTechnique: commitThrowTechnique ?? sim.throwTechnique ?? null,
          windRelation: commitWindRelation,
          isWindDrop: !!result.isWindDrop,
          ...failNarrative,
          turnoverPoint: { x: absFieldX, y: absFieldY },
          discYMeters: absFieldY,
        }),
      )
      applyTurnoverAtPosition({
        reason: result.isBlock ? 'block' : 'drop',
        fieldX: absFieldX,
        discY: absFieldY,
      })
    }
  }

  if (!scoringTeam) {
    scoringTeam = discPosition >= 50 ? possession : possession === 'home' ? 'away' : 'home'
    events.push(
      createEvent(EVENT.SCORE, {
        team: scoringTeam,
        teamName: teamById(scoringTeam).name,
        reason: 'throw_limit',
      }),
    )
  } else if (boxScore && lastScoringThrowerId != null && lastScoringReceiverId != null) {
    recordGoal(boxScore, lastScoringThrowerId, lastScoringReceiverId)
  }

  recordPointPlayedForPlayers(
    [...pointLineups.home, ...pointLineups.away],
    boxScore,
  )

  events.push(
    createEvent(EVENT.POINT_END, {
      pointIndex,
      scoringTeam,
      throws: throwCount,
      staminaSnapshot: stamina ? cloneStaminaMaps(stamina) : null,
    }),
  )

  return {
    scoringTeam,
    nextPullTeam: scoringTeam,
    events,
    throwCount,
  }
}

/**
 * Statystyczny stall (bez klatkowania ruchu) — rozkład przechylony w stronę niskiego
 * stalla (większość rzutów leci szybko), z rzadkim ogonem do stall-outu.
 */
function sampleFastStallCount(rng) {
  const roll = rng.float()
  if (roll < 0.98) {
    // Trójkątny-ish rozkład 1..9 wyśrodkowany nisko, zgodny z kalibracją resolveThrow
    // (stallCount=2 = "typowy, niewymuszony rzut").
    const r = (rng.float() + rng.float()) / 2
    return Math.max(1, Math.min(9, Math.round(1 + r * 6)))
  }
  return STALL_MAX
}

/**
 * Lekka symulacja punktu bez klatkowania ruchu (bez `runThrowMotionSimulation`) —
 * do trybu "symuluj resztę meczu" / silnika ligowego, gdzie boisko nie jest renderowane.
 * Używa TYCH SAMYCH funkcji rdzenia (resolveSeparation, pickThrowType, resolveThrow,
 * computeThrowAdvance) co pełny silnik — różni się tylko tym, JAK dochodzi do inputów
 * (stall/receiver/side statystycznie zamiast z klatkowej symulacji ruchu 14 agentów).
 * Stamina: celowo NIE aktualizuje `stamina.sprintM` per rzut — `applyFatigueAfterPoint`
 * (rotation.js) ma wbudowany fallback na lekki model kosztu per punkt, gdy sprintM
 * jest puste (dokładnie ten sam używany przez dawny backgroundSimulator.js).
 */
export function simulatePointFast({
  homeTeam,
  awayTeam,
  pullTeam,
  pointIndex,
  rng,
  boxScore = null,
  matchStats = null,
  wind = null,
}) {
  const events = []
  const attackTeamId = pullTeam === 'home' ? 'away' : 'home'
  let possession = attackTeamId
  let discPosition = MATCH_CONFIG.field.positionAfterPull

  const homePointRole = pointStartRoleForTeam('home', pullTeam)
  const awayPointRole = pointStartRoleForTeam('away', pullTeam)
  const stampLine = (team, role) => ({
    ...team,
    _pointStartRole: role,
    tactics: team?.tactics
      ? { ...team.tactics, _pointStartRole: role }
      : { _pointStartRole: role },
  })
  const homeTeamOnPoint = stampLine(homeTeam, homePointRole)
  const awayTeamOnPoint = stampLine(awayTeam, awayPointRole)

  const teamById = (id) => (id === 'home' ? homeTeamOnPoint : awayTeamOnPoint)
  const stylesForTeam = (teamId) =>
    lineStylesForPointStart(
      teamById(teamId).tactics,
      teamId === 'home' ? homePointRole : awayPointRole,
    )
  const pointLineups = buildPointLineups(homeTeamOnPoint, awayTeamOnPoint, attackTeamId)

  events.push(
    createEvent(EVENT.POINT_START, {
      pointIndex,
      pullTeam,
      attackTeam: attackTeamId,
      homeLineupIds: pointLineups.home.map((p) => p.id),
      awayLineupIds: pointLineups.away.map((p) => p.id),
      homePointStartRole: homePointRole,
      awayPointStartRole: awayPointRole,
      fastMode: true,
    }),
  )
  events.push(createEvent(EVENT.PULL, { team: pullTeam, teamName: teamById(pullTeam).name }))
  events.push(
    createEvent(EVENT.POSSESSION, {
      team: possession,
      teamName: teamById(possession).name,
      discPosition,
    }),
  )

  let throwCount = 0
  let scoringTeam = null
  let lastScoringThrowerId = null
  let lastScoringReceiverId = null
  let personMatchups = null

  function defendingTeamId() {
    return possession === 'home' ? 'away' : 'home'
  }

  function setupPersonMatchupsForPossession() {
    personMatchups = null
    const defId = defendingTeamId()
    const defStyle = stylesForTeam(defId).defenseStyle
    if (!isPersonDefense(defStyle)) return
    personMatchups = createPersonMatchups(
      rng,
      getLineupForTeam(pointLineups, possession),
      getLineupForTeam(pointLineups, defId),
    )
  }
  setupPersonMatchupsForPossession()

  function applyTurnoverAtPosition(turnoverThrowerId) {
    if (boxScore && turnoverThrowerId) recordTurnover(boxScore, turnoverThrowerId)
    const absX = discMetersFromState(discPosition, possession)
    possession = possession === 'home' ? 'away' : 'home'
    discPosition = discPositionFromFieldMeters(absX, possession)
    events.push(
      createEvent(EVENT.TURNOVER, {
        newPossession: possession,
        teamName: teamById(possession).name,
        discPosition,
      }),
    )
    setupPersonMatchupsForPossession()
  }

  while (throwCount < MATCH_CONFIG.maxThrowsPerPoint && !scoringTeam) {
    const offenseTeam = teamById(possession)
    const defenseTeam = teamById(defendingTeamId())
    const offenseLineup = getLineupForTeam(pointLineups, possession)
    const defenseLineup = getLineupForTeam(pointLineups, defendingTeamId())
    const attackStyle = stylesForTeam(possession).attackStyle
    const defenseStyle = stylesForTeam(defendingTeamId()).defenseStyle

    const thrower = pickThrower(rng, offenseLineup, offenseTeam.tactics)
    const stallCount = sampleFastStallCount(rng)

    if (stallCount >= STALL_MAX) {
      events.push(
        createEvent(EVENT.STALL_OUT, {
          stallCount: STALL_MAX,
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          possessionTeam: possession,
          discPosition,
        }),
      )
      applyTurnoverAtPosition(thrower.id)
      continue
    }

    const markerDefender = isPersonDefense(defenseStyle)
      ? defenderForPersonMark(personMatchups, thrower, defenseLineup, rng)
      : pickDefender(rng, defenseLineup)

    const throwType = pickThrowType({
      rng,
      thrower,
      discPosition,
      stallCount,
      defenseStyle,
      attackStyle,
      defender: markerDefender,
      separation: null,
      tactics: offenseTeam.tactics,
    })

    const receiver =
      throwType === THROW_TYPE.DUMP_SWING
        ? pickDumpReceiver(rng, offenseLineup, thrower)
        : pickReceiver(rng, offenseLineup, thrower)

    const defender = isPersonDefense(defenseStyle)
      ? defenderForPersonMark(personMatchups, receiver, defenseLineup, rng)
      : pickDefender(rng, defenseLineup)

    const separation = resolveSeparation({ receiver, defender, rng })
    // Bez geometrii markera: rozkład open/break-side zbliżony do realnego (~70/30).
    const isOpenSide = rng.float() > 0.3

    const profile = throwProfile(throwType)
    const estDistanceM = Math.max(3, Math.abs(profile.baseYards()))

    const result = resolveThrow({
      thrower,
      receiver,
      defender,
      rng,
      defenseStyle,
      throwType,
      separation,
      stallCount,
      forceSide: resolveMarkForceSide(defenseTeam, null),
      isOpenSide,
      wind,
      throwDx: estDistanceM,
      throwDy: 0,
      throwDistanceM: estDistanceM,
    })

    throwCount += 1
    const discPositionBefore = discPosition

    events.push(
      createEvent(EVENT.THROW_ATTEMPT, {
        throwerId: thrower.id,
        throwerName: playerLabel(thrower),
        receiverId: receiver.id,
        receiverName: playerLabel(receiver),
        defenderId: defender.id,
        defenderName: playerLabel(defender),
        discPosition,
        discPositionBefore,
        possessionTeam: possession,
        defenseStyle,
        attackStyle,
        throwType,
        stallCount,
        separationOutcome: separation.outcome,
        isOpenSide,
      }),
    )

    if (result.success) {
      const discAfter = computeThrowAdvance(discPositionBefore, throwType, {
        attackStyle,
        defenseStyle,
        rng,
        forwardProgressM: null,
        wind,
        thrower,
      })
      discPosition = discAfter
      const yardsGained = yardsFromPositions(discPositionBefore, discPosition)
      const isHuck = isHuckType(throwType, yardsGained)

      if (matchStats) {
        recordThrowAttempt(matchStats, possession, { success: true, yardsGained, isHuck })
      }

      events.push(
        createEvent(EVENT.THROW_SUCCESS, {
          discPosition,
          discPositionBefore,
          possessionTeam: possession,
          receiverId: receiver.id,
          receiverName: playerLabel(receiver),
          yardsGained,
          isHuck,
          throwType,
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
        }),
      )

      if (isInEndzone(discPosition, possession)) {
        scoringTeam = possession
        lastScoringThrowerId = thrower.id
        lastScoringReceiverId = receiver.id
        events.push(
          createEvent(EVENT.SCORE, {
            team: scoringTeam,
            teamName: teamById(scoringTeam).name,
            throwerId: thrower.id,
            receiverId: receiver.id,
          }),
        )
      }
    } else {
      if (boxScore && result.isBlock) recordBlock(boxScore, defender.id)

      const isHuck = isHuckType(throwType, 0)
      if (matchStats) {
        recordThrowAttempt(matchStats, possession, {
          success: false,
          isHuck,
          turnoverMeters: discPositionBefore,
        })
      }

      events.push(
        createEvent(EVENT.THROW_FAIL, {
          throwerId: thrower.id,
          throwerName: playerLabel(thrower),
          defenderId: defender.id,
          defenderName: playerLabel(defender),
          receiverId: receiver.id,
          receiverName: playerLabel(receiver),
          possessionTeam: possession,
          discPositionBefore,
          isHuck,
          throwType,
          isBlock: result.isBlock,
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
        }),
      )
      applyTurnoverAtPosition(thrower.id)
    }
  }

  if (!scoringTeam) {
    scoringTeam = discPosition >= 50 ? possession : possession === 'home' ? 'away' : 'home'
    events.push(
      createEvent(EVENT.SCORE, {
        team: scoringTeam,
        teamName: teamById(scoringTeam).name,
        reason: 'throw_limit',
      }),
    )
  } else if (boxScore && lastScoringThrowerId != null && lastScoringReceiverId != null) {
    recordGoal(boxScore, lastScoringThrowerId, lastScoringReceiverId)
  }

  recordPointPlayedForPlayers([...pointLineups.home, ...pointLineups.away], boxScore)

  events.push(
    createEvent(EVENT.POINT_END, {
      pointIndex,
      scoringTeam,
      throws: throwCount,
    }),
  )

  return {
    scoringTeam,
    nextPullTeam: scoringTeam,
    events,
    throwCount,
  }
}
