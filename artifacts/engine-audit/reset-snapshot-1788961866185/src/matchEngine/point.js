import { recordStyleThrow } from './styleEvidence.js'
import { isClutchPoint } from './ai/traitBehavior.js'
import { getTraitMods } from '../models/playerTraits.js'
import { MATCH_CONFIG } from './config.js'
import { recordBlock, recordDrop, recordGoal, recordTurnover, recordThrowResult, recordRunMeters } from './boxScore.js'
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
  computeMissDistanceM,
  isInEndzone,
  resolveThrow,
  MISS_CALIBRATION,
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
import { sampleFastHoldMs, fastRescanMs, fastTurnoverPoint } from './fastPossession.js'
import {
  offenseRoleSlot,
  receiverFieldYMeters,
} from './fieldPlayback.js'
import { attackDirectionX, fieldCenterY, clampFieldY } from './fieldDimensions.js'
import { effectiveDecisionStall } from './ai/throwerDecision.js'
import {
  STALL_MAX,
  stallThrowModifiers,
  stallCountFromHoldMs,
  decisionStallFromHoldMs,
  activeStallCount,
} from './stall.js'
import {
  applyStaminaFromMotionTrace,
  buildPointPlayersById,
  cloneStaminaMaps,
  getStamina,
  motionFatigueModifiers,
  syncLineupStaminaFromMaps,
  staminaMapsForGeometry,
} from './stamina.js'
import { runThrowMotionSimulation } from './ai/motionPipeline.js'
import { resolveCatchPointFromMotionTrace, resolveTurnoverPointFromMotionTrace } from './motionFromTicks.js'
import { offenseFieldPositionsFromStates } from './ai/offenseReorganization.js'
import { recordPointPlayedForPlayers } from '../models/playerStats.js'
import { setPossessionPlayerMods, clearPointPlayerMods } from './playerMods.js'
import {
  lineStylesForPointStart,
  pointStartRoleForTeam,
} from './lineups.js'

function playerLabel(p) {
  return `${p.firstName} ${p.lastName}`
}

/**
 * Faza 4b planu 3D (kill-switch). Gdy true: wynik rzutu (complete/block/drop) i kredyt
 * za blok decyduje realna geometria 3D po zakończeniu lotu (actionSimulator.js:
 * computeGeometricResolution — kto NAPRAWDĘ był najbliżej dysku, łącznie z poaczerami),
 * a nie sam abstrakcyjny resolveThrow. throwScore/defenseScore z resolveThrow nie znikają
 * — margines steruje tym, o ile metrów rzut "chybia" zamierzonego celu (patrz
 * computeMissDistanceM), więc jakość wykonania rzutu nadal realnie wpływa na wynik,
 * tylko przez fizykę toru, nie przez bezpośrednią bramkę. Domyślnie false: zero zmiany
 * zachowania względem stanu przed Fazą 4b, dopóki nie przejdzie dedykowanej rekalibracji
 * (tmp-*.mjs balance harness) i nie zostanie świadomie włączone. Obiekt (nie zwykły
 * const) — pozwala skryptowi kalibrującemu przełączać flagę w locie, bez edycji pliku.
 */
export const RESOLUTION_MODE = { useGeometric: true }

/**
 * Szacunek dystansu przebiegniętego przez zawodnika w punkcie (m) — cały ruch po
 * boisku (cuty, powroty, obrona), nie tylko trasa dysku. fastMode nie trzyma klatek
 * ruchu (motionTrace), więc to jedyne dostępne źródło "distance run" spójne dla
 * WSZYSTKICH meczów ligowych (nie tylko granych przez gracza pełnym silnikiem).
 */
function estimateRunMetersForPoint(rng, throwCount = 0) {
  const base = 90 + rng.float() * 60
  const extra = Math.min(60, throwCount * 6)
  return base + extra
}

function recordPointRunMeters(boxScore, lineup, rng, throwCount) {
  if (!boxScore) return
  for (const player of lineup ?? []) {
    recordRunMeters(boxScore, player.id, estimateRunMetersForPoint(rng, throwCount))
  }
}

/**
 * Symuluje jeden punkt (pull → wymiany aż punkt lub limit rzutów).
 */
export function simulatePoint({
  homeTeam,
  awayTeam,
  pullTeam,
  pointIndex,
  homeScore = 0,
  awayScore = 0,
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
  const geoStaminaMaps = maps => staminaMapsForGeometry(maps, sidesSwapped)

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
  /** Czas posiadania jest niezależny od legalnego liczenia markera. */
  let holdMs = 0
  let stallClock = { markerId: null, elapsedMs: 0 }
  let pickupPending = false
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
  let transitionPasses = 0

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
        geoStaminaMaps(stamina),
        motionTrace,
        playersById,
        geo(possession),
        geoStaminaMaps(baseline),
      )
    } else if (simResult?.frames?.length) {
      applyStaminaFromMotionTrace(
        geoStaminaMaps(stamina),
        { frames: simResult.frames, tickMs: simResult.tickMs ?? 200 },
        playersById,
        geo(possession),
        geoStaminaMaps(baseline),
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

    // Mody (cechy + dyrektywy + rozkazy) zależą od tego, kto ma dysk — patrz playerMods.js.
    // Stempel PRZED wyjściem dla obrony strefowej: matchupy person są opcjonalne, mody nie.
    setPossessionPlayerMods(
      getLineupForTeam(pointLineups, possession),
      teamById(possession).tactics,
      getLineupForTeam(pointLineups, defId),
      defTeam.tactics,
      { isClutchPoint: isClutchPoint(homeScore, awayScore, MATCH_CONFIG.pointsToWin) },
    )

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
    securedBy = null,
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
    discHolder = securedBy
    holdMs = 0
    stallCount = 0
    stallClock = { markerId: null, elapsedMs: 0 }
    pickupPending = !securedBy
    discYMeters = discY
    resetChain = 0
    postResetClearout = false
    lastThrowerId = null
    transitionPasses = 2
    // Zachowaj geometrię i pęd; stare cele taktyczne nie obowiązują po zmianie O/D.
    if (liveAgentStates) liveAgentStates = new Map([...liveAgentStates].map(([id, state]) => [id, {
      ...state, role: state.role === 'offense' ? 'defense' : 'offense',
      state: null, stateMs: 0, targetX: state.x, targetY: state.y,
    }]))
    events.push(
      createEvent(EVENT.TURNOVER, {
        newPossession: possession,
        teamName: teamById(possession).name,
        discPosition,
        discYMeters: discY,
        reason,
        turnoverPoint: { x: absX, y: discY },
        discHolderId: securedBy?.id ?? null,
        pickupPending,
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
    // Dysk podnosi najbliższy zawodnik nowej ofensywy, nie wylosowany handler.
    if (liveAgentStates && !securedBy) {
      let nearest = Infinity
      for (const player of getLineupForTeam(pointLineups, possession)) {
        const state = liveAgentStates.get(player.id)
        if (!state) continue
        const distance = Math.hypot(state.x - absX, state.y - discY)
        if (distance < nearest) { nearest = distance; discHolder = player }
      }
    }
  }

  let actionCount = 0
  // Odmowa rzutu też zużywa budżet obliczeń; brak markera nie może zawiesić meczu.
  while (actionCount++ < MATCH_CONFIG.maxThrowsPerPoint && !scoringTeam) {
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
    stallCount = activeStallCount(stallClock)

    const staminaBaseline = stamina ? cloneStaminaMaps(stamina) : null
    const simStaminaMaps = stamina ? cloneStaminaMaps(stamina) : null

    const defenseLineupForMark = getLineupForTeam(
      pointLineups,
      possession === 'home' ? 'away' : 'home',
    )
    const markerDefender = isPersonDefense(defenseStyle)
      ? defenderForPersonMark(personMatchups, thrower, defenseLineupForMark, rng)
      : pickDefender(rng, defenseLineupForMark)

    if (stallCount >= STALL_MAX) {
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
      Math.max(1, stallCount),
      resetChain,
    )

    const sim = runThrowMotionSimulation({
      behaviorBoxScore: boxScore,
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
      startStallClock: stallClock,
      pickupPending,
      offenseTeam,
      defenseTeam,
      wind,
      staminaMaps: geoStaminaMaps(simStaminaMaps),
      seedStates: liveAgentStates,
      postResetClearout,
      lastThrowerId,
      afterTurnover: transitionPasses > 0,
      hardStallCount: Math.max(1, stallCount),
      requireForwardPass: resetChain >= 3,
      onThrowCommitted: (decision, live) => {
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
          decision.separation ??
          resolveSeparation({ receiver: recv, defender, rng, stallCount: stallForResolve })

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
          executionOnly: true,
          marker: live?.defenseAgents?.find(a => a.id === decision.markerId)?.player ?? null,
          markerDistanceM: (() => {
            const m = live?.defenseAgents?.find(a => a.id === decision.markerId)
            const t = live?.offenseAgents?.find(a => a.id === thrower.id)
            return m && t ? Math.hypot(m.x - t.x, m.y - t.y) : Infinity
          })(),
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
          stallCount: liveStall,
          markerId: decision.markerId ?? markerDefender?.id ?? null,
          isOpenSide: decision.isOpenSide ?? true,
          throwTechnique: decision.throwTechnique ?? null,
          throwDx,
          throwDy,
          throwDistanceM,
          windRelation: result.windRelation ?? null,
        }

        // Faza 4b: gorszy rzut (mały/ujemny margines) przesuwa realny cel lotu — geometria
        // po locie decyduje, czy taki tor faktycznie kończy się złapaniem. Blok na torze
        // (lane block) to już definitywna, oddzielna decyzja — nie przesuwaj celu w tym
        // wypadku, zostaw synchroniczny wynik jak dziś.
        let adjustedTarget = null
        if (RESOLUTION_MODE.useGeometric && !result.isLaneBlock) {
          // Miss ograniczony do ułamka DŁUGOŚCI TEGO rzutu — bez tego stały, absolutny
          // miss w metrach jest niezauważalny na hucku (20m+) ale katastrofalny na
          // krótkim dumpie/swingu (2-4m), gdzie ten sam miss to nierealny procent
          // dystansu (zmierzone: dump_swing completion 100%→76.9% po włączeniu geometrii,
          // zanim dodano ten cap).
          const rawMissDistanceM = computeMissDistanceM(
            result.throwScore,
            result.defenseScore,
            result.throwStat,
            rng,
          )
          const missDistanceM = Math.min(
            rawMissDistanceM,
            throwDistanceM * MISS_CALIBRATION.missDistanceFractionCap,
          )
          if (missDistanceM > 0) {
            const angle = rng.float() * Math.PI * 2
            adjustedTarget = {
              x: catchX + Math.cos(angle) * missDistanceM,
              y: catchY + Math.sin(angle) * missDistanceM,
            }
          }
        }

        return {
          resolution: {
            ...result,
            success: result.success,
            isBlock: result.isBlock,
            isOut: result.isOut,
            // Drop = odbiorca dosięgnął dysku i nie utrzymał (osobny krok chwytu albo
            // wiatr), a nie „każde niepowodzenie, które nie było blokiem" — to ostatnie
            // obejmowało też „nie dobiegł", czyli coś bez winy odbiorcy.
            isDrop: !!(result.isDrop || result.isWindDrop),
            isLaneBlock: !!result.isLaneBlock,
          },
          trajectory: profile.trajectory,
          throwType,
          defender: creditedDefender,
          separation,
          ...(adjustedTarget
            ? { adjustedToX: adjustedTarget.x, adjustedToY: adjustedTarget.y }
            : null),
        }
      },
    })
    postResetClearout = false
    liveAgentStates = sim.endStates ?? liveAgentStates
    holdMs = sim.holdMsAtEnd ?? holdMs
    stallClock = sim.stallClock ?? stallClock
    pickupPending = sim.pickupPending ?? false
    stallCount = sim.stallCount ?? stallCountFromHoldMs(holdMs)
    const eventMarkerId = sim.markerId ?? markerDefender?.id ?? null

    if (sim.stallOut) {
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
      receiver: intendedReceiver,
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
    const receiver = sim.receiver ?? intendedReceiver
    const attemptStall = commitStallCount ?? stallCount
    const ctx = narrativeContext()

    // Faza 4b (kill-switch, patrz RESOLUTION_MODE.useGeometric powyżej): gdy włączone,
    // prawdziwy wynik i kredytowany obrońca pochodzą z realnej geometrii 3D po locie
    // (sim.geometricResolution — actionSimulator.js), nie z result.success/isBlock.
    // Blok NA TORZE też pochodzi z geometrii (dysk realnie przeszedł przez zasięg
    // obrońcy — patrz laneBlockChance w actionSimulator.js); abstrakcyjny rollLaneBlock
    // z resolveThrow zostaje wyłącznie dla fastMode, który geometrii nie ma.
    // Wiatr wpływa na tor i błąd wykonania; osobny losowy wind drop nie nadpisuje chwytu.
    let finalSuccess = result.success
    let finalIsBlock = result.isBlock
    let finalIsDrop = !!result.isDrop || !!result.isWindDrop
    let finalDefender = defender
    let finalIsLaneBlock = !!result.isLaneBlock
    if (RESOLUTION_MODE.useGeometric && sim.geometricResolution) {
      const geo = sim.geometricResolution
      finalSuccess = geo.success
      finalIsBlock = finalSuccess ? false : geo.isBlock
      // Drop = odbiorca dosięgnął dysku i go nie utrzymał.
      // W przeciwieństwie do „nie dobiegł" ma konkretnego winnego, więc idzie do statystyk.
      finalIsDrop = !finalSuccess && !finalIsBlock && !!geo.isDrop
      finalIsLaneBlock = geo.reason === 'lane_block'
      if (geo.defenderId != null && geo.defenderId !== defender.id) {
        finalDefender = defenseLineup.find((d) => d.id === geo.defenderId) ?? defender
      }
    }

    if (simStaminaMaps) {
      syncLineupStaminaFromMaps(simStaminaMaps, offenseLineup, possession)
      syncLineupStaminaFromMaps(simStaminaMaps, defenseLineup, defendingTeamId())
    }

    if (separation.outcome === 'open' && receiver.id === intendedReceiver.id) {
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
        holdMs: sim.holdMsAtEnd,
        releasePoint: { x: sim.discX, y: sim.discY },
        targetPoint: { x: sim.discX + commitThrowDx, y: sim.discY + commitThrowDy },
        throwDistanceM: Math.hypot(commitThrowDx, commitThrowDy),
        separationOutcome: separation.outcome,
        isOpenSide: commitIsOpenSide,
        throwTechnique: commitThrowTechnique ?? sim.throwTechnique ?? null,
        leadingPass: sim.leadingPass ?? null,
        throwerSubRole: sim.throwerSubRole ?? null,
        receiverSubRole: sim.receiverSubRole ?? null,
        intendedReceiverId: sim.intendedReceiverId ?? receiver.id,
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

    if (finalSuccess) {
      discPosition = discAfter
      // Dysk zostaje tam, gdzie faktycznie doszło do chwytu — inaczej odbiorca
      // przeskakuje na pozycję wyliczoną z roli w formacji.
      discYMeters = catchPoint?.y ?? receiverFieldY
      const yardsGained = yardsFromPositions(discPositionBefore, discPosition)
      holdMs = 0
      stallCount = 0
      stallClock = { markerId: null, elapsedMs: 0 }

      lastThrowerId = thrower.id
      transitionPasses = Math.max(0, transitionPasses - 1)
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
      if (boxScore) {
        recordThrowResult(boxScore, thrower.id, { success: true, receiverId: receiver.id, yardsGained })
        recordStyleThrow(boxScore, thrower, 'full', { type: throwType, success: true, curve: sim.motionTrace?.plannedShape?.curve ?? sim.plannedShape?.curve ?? null, technique: sim.throwTechnique, tactics: offenseTeam.tactics })
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
          leadingPass: sim.leadingPass ?? null,
          throwerSubRole: sim.throwerSubRole ?? null,
          receiverSubRole: sim.receiverSubRole ?? null,
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

      if (sim.geometricResolution?.scoresPoint ?? isInEndzone(discPosition, possession)) {
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
      if (boxScore && finalIsBlock) {
        recordBlock(boxScore, finalDefender.id)
      }
      if (boxScore && finalIsDrop) {
        recordDrop(boxScore, receiver.id)
      }
      if (boxScore) {
        recordTurnover(boxScore, thrower.id)
      }

      // Dysk zostaje w miejscu bloku / dropu — nie wraca do miejsca rzutu.
      const turnoverPoint = resolveTurnoverPointFromMotionTrace(motionTrace, {
        receiverId: receiver.id,
        defenderId: finalDefender.id,
        isBlock: finalIsBlock,
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
      if (boxScore) {
        recordThrowResult(boxScore, thrower.id, { success: false })
        recordStyleThrow(boxScore, thrower, 'full', { type: throwType, success: false, curve: sim.motionTrace?.plannedShape?.curve ?? sim.plannedShape?.curve ?? null, technique: sim.throwTechnique, tactics: offenseTeam.tactics })
      }

      const failNarrative = buildThrowNarrative({
        phase: 'fail',
        ...ctx,
        throwerName: playerLabel(thrower),
        receiverName: playerLabel(receiver),
        defenderName: playerLabel(finalDefender),
        throwType,
        isBlock: finalIsBlock,
        success: false,
      })

      events.push(
        createEvent(EVENT.THROW_FAIL, {
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
          throwerId: thrower.id,
          defenderId: finalDefender.id,
          receiverId: receiver.id,
          possessionTeam: possession,
          discPositionBefore,
          isHuck,
          stallCount: attemptStall,
          throwType,
          trajectory: profile.trajectory,
          turnoverMeters,
          isBlock: finalIsBlock,
          isDrop: finalIsDrop,
          isLaneBlock: finalIsLaneBlock,
          isOpenSide: commitIsOpenSide,
          throwTechnique: commitThrowTechnique ?? sim.throwTechnique ?? null,
          leadingPass: sim.leadingPass ?? null,
          throwerSubRole: sim.throwerSubRole ?? null,
          receiverSubRole: sim.receiverSubRole ?? null,
          windRelation: commitWindRelation,
          isWindDrop: !!result.isWindDrop,
          ...failNarrative,
          turnoverPoint: { x: absFieldX, y: absFieldY },
          discYMeters: absFieldY,
        }),
      )
      applyTurnoverAtPosition({
        reason: finalIsBlock ? 'block' : finalIsDrop ? 'drop' : 'throwaway',
        fieldX: absFieldX,
        discY: absFieldY,
        securedBy: sim.geometricResolution?.securedInterception ? finalDefender : null,
      })
      if (sim.geometricResolution?.interceptionScoresPoint) {
        scoringTeam = possession
        events.push(createEvent(EVENT.SCORE, { team: possession, teamName: teamById(possession).name,
          receiverId: finalDefender.id, reason: 'interception' }))
        if (boxScore) recordGoal(boxScore, null, finalDefender.id)
      }
    }
  }

  if (!scoringTeam) {
    scoringTeam = discPosition >= 50 ? possession : possession === 'home' ? 'away' : 'home'
    events.push(
      createEvent(EVENT.SCORE, {
        team: scoringTeam,
        teamName: teamById(scoringTeam).name,
        reason: throwCount >= MATCH_CONFIG.maxThrowsPerPoint ? 'throw_limit' : 'action_limit',
      }),
    )
  } else if (boxScore && lastScoringThrowerId != null && lastScoringReceiverId != null) {
    recordGoal(boxScore, lastScoringThrowerId, lastScoringReceiverId)
  }

  recordPointPlayedForPlayers(
    [...pointLineups.home, ...pointLineups.away],
    boxScore,
  )
  recordPointRunMeters(boxScore, pointLineups.home, rng, throwCount)
  recordPointRunMeters(boxScore, pointLineups.away, rng, throwCount)

  events.push(
    createEvent(EVENT.POINT_END, {
      pointIndex,
      scoringTeam,
      throws: throwCount,
      staminaSnapshot: stamina ? cloneStaminaMaps(stamina) : null,
    }),
  )

  // Mody meczowe kończą się razem z punktem — poza meczem obowiązują same cechy.
  clearPointPlayerMods()

  return {
    scoringTeam,
    nextPullTeam: scoringTeam,
    events,
    throwCount,
  }
}

/**
 * Dystans hucka w fastMode: 40-100m (prawdziwy głęboki rzut, nie 12-40m tabeli
 * kategorii dystansu), przycięty do tego, ile realnie zostało do końca boiska.
 * Wcześniej HUCK miał stały baseYards()=32m, co nigdy nie trafiało w kategorię
 * "huck" (≥40m) — zawsze liczyło się jako "long".
 */
function sampleFastHuckDistanceM(rng, discPosition) {
  const remainingM = Math.max(3, MATCH_CONFIG.field.max - discPosition)
  const target = 40 + rng.float() * 60
  return Math.min(target, remainingM)
}

/**
 * pickReceiver/pickDumpReceiver losują JEDNEGO kandydata wg samego skilla, bez
 * względu na to, kto akurat ma lepszą separację — thrower nigdy "nie rozgląda się"
 * po opcjach, w przeciwieństwie do pełnego silnika (scanThrowOptions, które realnie
 * porównuje kandydatów). To główny powód, dla którego fastMode miał completion%
 * daleko poniżej realnych 92-96% nawet po dodaniu abort-fallbacku (audyt:
 * tmp-completion-possession-report.mjs). Tu bierzemy kilku kandydatów i wybieramy
 * tego z najlepszą separacją — liczba kandydatów maleje ze stallem (pod presją
 * thrower bierze co jest, nie przebiera), analogicznie do acceptanceThresholdForStall
 * w throwerDecision.js.
 */
function pickBestReceiverOption(rng, pickFn, offenseLineup, thrower, defenseLineup, defenseStyle, personMatchups, stallCount) {
  const candidateCount = stallCount < 4 ? 3 : stallCount < 7 ? 2 : 1
  let best = null
  for (let i = 0; i < candidateCount; i += 1) {
    const candidate = pickFn(rng, offenseLineup, thrower)
    const candidateDefender = isPersonDefense(defenseStyle)
      ? defenderForPersonMark(personMatchups, candidate, defenseLineup, rng)
      : pickDefender(rng, defenseLineup)
    const separation = resolveSeparation({
      receiver: candidate,
      defender: candidateDefender,
      rng,
      stallCount,
    })
    if (!best || separation.margin > best.separation.margin) {
      best = { receiver: candidate, defender: candidateDefender, separation }
    }
    if (separation.outcome === 'open') break
  }
  return best
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
  homeScore = 0,
  awayScore = 0,
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
  /** Zawodnik z dyskiem; po udanym rzucie = odbiorca. Po turnoverze/pullu — null
   * (pierwszy rzut w posiadaniu losowany). Wcześniej brakowało tego w fastMode: co
   * rzut na nowo losowano throwera od zera (pickThrower na argmax po skillu), więc
   * dysk teleportował się do najlepszego handlera niezależnie od tego, kto go
   * faktycznie złapał — jeden zawodnik zgarniał prawie wszystkie asysty w meczu. */
  let discHolder = null

  function defendingTeamId() {
    return possession === 'home' ? 'away' : 'home'
  }

  function setupPersonMatchupsForPossession() {
    personMatchups = null
    const defId = defendingTeamId()
    const defStyle = stylesForTeam(defId).defenseStyle
    // Ten sam stempel modów co w simulatePoint — fastMode idzie przez resolution.js
    // i stall.js, które też czytają mody zawodnika (patrz playerMods.js).
    setPossessionPlayerMods(
      getLineupForTeam(pointLineups, possession),
      teamById(possession).tactics,
      getLineupForTeam(pointLineups, defId),
      teamById(defId).tactics,
      { isClutchPoint: isClutchPoint(homeScore, awayScore, MATCH_CONFIG.pointsToWin) },
    )
    if (!isPersonDefense(defStyle)) return
    personMatchups = createPersonMatchups(
      rng,
      getLineupForTeam(pointLineups, possession),
      getLineupForTeam(pointLineups, defId),
    )
  }
  setupPersonMatchupsForPossession()

  let discYMeters = fieldCenterY()
  let estimatedDurationMs = 0
  let transitionPasses = 0
  const geoSideFor = side => pointIndex % 2 === 0 ? (side === 'home' ? 'away' : 'home') : side

  function applyTurnoverAtPosition(turnoverThrowerId, turnoverPoint = null, reason = 'stall_out') {
    if (boxScore && turnoverThrowerId) recordTurnover(boxScore, turnoverThrowerId)
    const absX = turnoverPoint?.x ?? discMetersFromState(discPosition, geoSideFor(possession))
    discYMeters = turnoverPoint?.y ?? discYMeters
    possession = possession === 'home' ? 'away' : 'home'
    discPosition = discPositionFromFieldMeters(absX, geoSideFor(possession))
    discHolder = null
    transitionPasses = 2
    events.push(
      createEvent(EVENT.TURNOVER, {
        newPossession: possession,
        teamName: teamById(possession).name,
        discPosition,
        discYMeters,
        turnoverPoint: { x: absX, y: discYMeters },
        reason,
      }),
    )
    setupPersonMatchupsForPossession()
  }

  let actionCount = 0
  while (actionCount++ < MATCH_CONFIG.maxThrowsPerPoint && !scoringTeam) {
    const offenseTeam = teamById(possession)
    const defenseTeam = teamById(defendingTeamId())
    const offenseLineup = getLineupForTeam(pointLineups, possession)
    const defenseLineup = getLineupForTeam(pointLineups, defendingTeamId())
    const attackStyle = stylesForTeam(possession).attackStyle
    const defenseStyle = stylesForTeam(defendingTeamId()).defenseStyle

    const thrower = discHolder ?? pickThrower(rng, offenseLineup, offenseTeam.tactics)
    let holdMs = sampleFastHoldMs(rng) * (getTraitMods(thrower).decisionTimeMult ?? 1)
    // Fast zakłada mark od początku looku. Liczenie startuje od „jeden”, a nie zera.
    let stallCount = Math.min(STALL_MAX, 1 + Math.floor(holdMs / 1000))

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
      afterTurnover: transitionPasses > 0,
    })

    const primaryPickFn = throwType === THROW_TYPE.DUMP_SWING ? pickDumpReceiver : pickReceiver
    let picked = pickBestReceiverOption(
      rng,
      primaryPickFn,
      offenseLineup,
      thrower,
      defenseLineup,
      defenseStyle,
      personMatchups,
      stallCount,
    )
    let receiver = picked.receiver
    let defender = picked.defender
    let separation = picked.separation
    let effectiveThrowType = throwType

    // Jak w pełnym silniku (simulatePoint, sekcja throwCommit): przy tight separacji
    // z "abort" thrower rozpoznaje złą okazję i nie forsuje rzutu — resetuje do dumpa
    // zamiast próbować. fastMode nigdy tego nie sprawdzał (separation.abort był martwym
    // polem tutaj), więc zawsze rzucał niezależnie od jakości separacji — stąd
    // nierealistycznie krótkie posiadania i completion% poniżej realnych 92-96%
    // (audyt: tmp-completion-possession-report.mjs).
    while (separation.outcome === 'tight' && separation.abort && stallCount < STALL_MAX) {
      holdMs += fastRescanMs(thrower) * (getTraitMods(thrower).decisionTimeMult ?? 1)
      stallCount = Math.min(STALL_MAX, 1 + Math.floor(holdMs / 1000))
      if (stallCount >= STALL_MAX) break
      effectiveThrowType = THROW_TYPE.DUMP_SWING
      picked = pickBestReceiverOption(
        rng,
        pickDumpReceiver,
        offenseLineup,
        thrower,
        defenseLineup,
        defenseStyle,
        personMatchups,
        stallCount,
      )
      receiver = picked.receiver
      defender = picked.defender
      separation = picked.separation
    }

    estimatedDurationMs += holdMs
    if (stallCount >= STALL_MAX) {
      events.push(createEvent(EVENT.STALL_OUT, {
        stallCount: STALL_MAX, holdMs, throwerId: thrower.id, throwerName: playerLabel(thrower),
        possessionTeam: possession, discPosition,
      }))
      applyTurnoverAtPosition(thrower.id)
      continue
    }

    // Bez geometrii markera: rozkład open/break-side zbliżony do realnego (~70/30).
    const isOpenSide = rng.float() > 0.3

    const profile = throwProfile(effectiveThrowType)
    const isHuckThrow = effectiveThrowType === THROW_TYPE.HUCK
    // Huck to prawdziwy głęboki rzut (40-100m w granicach boiska), nie stałe 32m —
    // patrz sampleFastHuckDistanceM.
    const estDistanceM = isHuckThrow
      ? sampleFastHuckDistanceM(rng, discPosition)
      : Math.max(3, Math.abs(profile.baseYards()) * MATCH_CONFIG.fastCalibration.advanceMult)
    // Chwyt force_middle/force_sideline zależy od aktualnej strony boiska.
    // Zachowujemy Y po poprzednim chwycie lub stracie.
    const throwerY = discYMeters

    /**
     * WEKTOR RZUTU W UKŁADZIE BOISKA — wejście dla classifyThrowWind().
     *
     * Wcześniej stało tu `throwDx: estDistanceM, throwDy: 0` dla KAŻDEGO rzutu OBU drużyn.
     * classifyThrowWind() nie wie, kto atakuje — patrzy wyłącznie na wektor rzutu — więc
     * przy wietrze wzdłuż boiska (directionDeg 0, w = (1,0)) wychodziło along = 1 i każdy
     * rzut w meczu lądował w gałęzi DOWNWIND, która daje BONUS do celności. Gałąź UPWIND
     * (kara −11 × deepFactor) była nieosiągalna. Dlatego wiatr w lidze nie robił nic:
     * completion trzymało się 93–96% niezależnie od siły wiatru, podczas gdy pełny silnik
     * schodził przy 20 mph do 81%. Analogicznie computeThrowAdvance() nie dostawał wektora
     * wcale (dx = dy = 0 → len < 0.5 → CROSSWIND z along01 = 0), więc wiatr nie wpływał
     * też na zdobywane jardy.
     *
     * Strony zmieniają się co punkt tak samo jak w simulatePoint() — bez tego gospodarz
     * atakowałby cały mecz w tę samą stronę i przy wietrze wzdłuż boiska miałby stałą
     * przewagę. Długość wektora nie jest tu istotna (throwDistanceM podajemy osobno,
     * więc kategoria dystansu i DISTANCE_GAP_TABLE zostają nietknięte) — liczy się
     * wyłącznie kierunek.
     */
    const sidesSwapped = pointIndex % 2 === 0
    const geoSide = sidesSwapped ? (possession === 'home' ? 'away' : 'home') : possession
    const attackSign = geoSide === 'home' ? 1 : -1
    const lateral = (rng.float() * 2 - 1) * MATCH_CONFIG.fastCalibration.lateralFrac
    // Dump/swing leci w bok i lekko do tyłu — inaczej niż rzut do przodu.
    const isDump = effectiveThrowType === THROW_TYPE.DUMP_SWING
    const throwDx = isDump
      ? -attackSign * estDistanceM * 0.35
      : attackSign * estDistanceM
    const throwDy = (isDump ? Math.sign(lateral || 1) * 0.9 : lateral) * estDistanceM

    // Jeden cel rzutu dla skuteczności, udanego chwytu i miejsca straty.
    // Dotąd dystans resolveThrow i przesunięcie dysku były osobnymi modelami.
    const releasePoint = { x: discMetersFromState(discPosition, geoSide), y: discYMeters }
    const targetPosition = computeThrowAdvance(discPosition, effectiveThrowType, {
      attackStyle, defenseStyle, rng, forwardProgressM: null, wind, throwDx, throwDy, thrower,
      explicitYards: isHuckThrow ? estDistanceM : profile.baseYards() * MATCH_CONFIG.fastCalibration.advanceMult,
      windSensitivityMult: MATCH_CONFIG.fastCalibration.windMult,
    })
    const targetPoint = { x: discMetersFromState(targetPosition, geoSide), y: clampFieldY(discYMeters + throwDy) }
    const actualDx = targetPoint.x - releasePoint.x
    const actualDy = targetPoint.y - releasePoint.y
    const throwDistanceM = Math.hypot(actualDx, actualDy)
    estimatedDurationMs += throwDistanceM / 14 * 1000

    const result = resolveThrow({
      thrower,
      receiver,
      defender,
      rng,
      defenseStyle,
      throwType: effectiveThrowType,
      separation,
      stallCount,
      forceSide: resolveMarkForceSide(defenseTeam, null),
      isOpenSide,
      throwerY,
      wind,
      throwDx: actualDx,
      throwDy: actualDy,
      throwDistanceM,
      skillSensitivityMult: MATCH_CONFIG.fastCalibration.skillMult,
      gapOffset: MATCH_CONFIG.fastCalibration.gapOffset,
      windSensitivityMult: MATCH_CONFIG.fastCalibration.windMult,
      windSkillSlope: MATCH_CONFIG.fastCalibration.windSkillSlope,
      windSkillRef: MATCH_CONFIG.fastCalibration.windSkillRef,
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
        throwType: effectiveThrowType,
        stallCount,
        separationOutcome: separation.outcome,
        isOpenSide,
        releasePoint,
        targetPoint,
        throwDistanceM,
        holdMs,
        flightMs: throwDistanceM / 14 * 1000,
      }),
    )

    if (result.success) {
      discPosition = targetPosition
      discYMeters = targetPoint.y
      const yardsGained = yardsFromPositions(discPositionBefore, discPosition)
      const isHuck = isHuckType(effectiveThrowType, yardsGained)

      if (matchStats) {
        recordThrowAttempt(matchStats, possession, { success: true, yardsGained, isHuck })
      }
      if (boxScore) {
        recordThrowResult(boxScore, thrower.id, { success: true, receiverId: receiver.id, yardsGained })
        recordStyleThrow(boxScore, thrower, 'fast', { type: effectiveThrowType, success: true, technique: result.throwTechnique, tactics: offenseTeam.tactics })
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
          throwType: effectiveThrowType,
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
          catchPoint: targetPoint,
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
      } else {
        discHolder = receiver
        transitionPasses = Math.max(0, transitionPasses - 1)
      }
    } else {
      const lossPoint = fastTurnoverPoint(releasePoint, targetPoint, result, rng)
      if (boxScore && result.isBlock) recordBlock(boxScore, defender.id)
      if (boxScore && (result.isDrop || result.isWindDrop)) recordDrop(boxScore, receiver.id)

      const isHuck = isHuckType(effectiveThrowType, 0)
      if (matchStats) {
        recordThrowAttempt(matchStats, possession, {
          success: false,
          isHuck,
          turnoverMeters: lossPoint.x,
        })
      }
      if (boxScore) {
        recordThrowResult(boxScore, thrower.id, { success: false })
        recordStyleThrow(boxScore, thrower, 'fast', { type: effectiveThrowType, success: false, technique: result.throwTechnique, tactics: offenseTeam.tactics })
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
          throwType: effectiveThrowType,
          isBlock: result.isBlock,
          isDrop: !!(result.isDrop || result.isWindDrop),
          turnoverPoint: lossPoint,
          turnoverMeters: lossPoint.x,
          throwScore: result.throwScore,
          defenseScore: result.defenseScore,
        }),
      )
      applyTurnoverAtPosition(thrower.id, lossPoint,
        result.isBlock ? 'block' : result.isDrop || result.isWindDrop ? 'drop' : 'throwaway')
    }
  }

  if (!scoringTeam) {
    scoringTeam = discPosition >= 50 ? possession : possession === 'home' ? 'away' : 'home'
    events.push(
      createEvent(EVENT.SCORE, {
        team: scoringTeam,
        teamName: teamById(scoringTeam).name,
        reason: throwCount >= MATCH_CONFIG.maxThrowsPerPoint ? 'throw_limit' : 'action_limit',
      }),
    )
  } else if (boxScore && lastScoringThrowerId != null && lastScoringReceiverId != null) {
    recordGoal(boxScore, lastScoringThrowerId, lastScoringReceiverId)
  }

  recordPointPlayedForPlayers([...pointLineups.home, ...pointLineups.away], boxScore)
  recordPointRunMeters(boxScore, pointLineups.home, rng, throwCount)
  recordPointRunMeters(boxScore, pointLineups.away, rng, throwCount)

  events.push(
    createEvent(EVENT.POINT_END, {
      pointIndex,
      scoringTeam,
      throws: throwCount,
      estimatedDurationMs,
    }),
  )

  clearPointPlayerMods()

  return {
    scoringTeam,
    nextPullTeam: scoringTeam,
    events,
    throwCount,
    estimatedDurationMs,
  }
}
