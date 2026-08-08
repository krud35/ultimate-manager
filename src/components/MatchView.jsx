import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demoAwayTeam, demoHomeTeam } from '../data/demoMatchTeams'
import { teamById, teamForMatchEngine } from '../data/ufaLeagueTeams.js'
import {
  EVENT,
  initMatchSession,
  listPointIndices,
  MATCH_CONFIG,
  playNextPoint,
  sessionToResult,
  simulateMatch,
  slicePointEvents,
  TACTICS_MODIFIERS,
  pointStartRoleForTeam,
  fieldStateAtEventStep,
  buildMatchStatsFromEvents,
  tacticsForTeam,
  fieldLineupIdsFromPointEvents,
  filterPlayersToPointLineup,
  buildFieldActionClip,
  sampleFieldActionClip,
  buildClipPlaybackTimeline,
  resolvePlaybackRenderFrame,
  fieldStateToRenderFrame,
  playbackStepAdvanceDelta,
  computeDisplayedMatchScore,
  PLAYBACK_SPEED_OPTIONS,
  poseToRenderFrame,
  renderedFrameToInitialPlayerPositions,
  pruneInitialPositionsToLineup,
  FIELD_SHORT_TRANSITION_MS,
  computeStaminaDuringPointPlayback,
  clipProgress01,
  lineupIdsForPointStart,
  validateLineupForSubmit,
  lineupValidationMessage,
  stripInjuredPlayersFromTactics,
  normalizeTactics,
} from '../matchEngine'
import { BoxScoreTable } from './BoxScoreTable'
import PointHistory from './PointHistory'
import LineupSelector from './LineupSelector'
import PointStaminaPanel from './PointStaminaPanel'
import FieldView2D from './FieldView2D'
import { resolveMatchColors } from '../data/teamColors.js'
import MatchDashboard from './MatchDashboard'
import MatchFastSimPanel, { fastSimDelayMs } from './MatchFastSimPanel'
import { yieldToUi } from './SimulationProgressOverlay'
import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'
import { pickCopy, UI_LANG } from '../ui/locale'

function eventLabel(event, homeName, awayName, t, lang = UI_LANG.PL) {
  switch (event.type) {
    case EVENT.MATCH_START:
      return t.eventStart(event.pointsToWin, event.homeTeam, event.awayTeam)
    case EVENT.POINT_START:
      return t.eventPointStart(
        event.pointIndex,
        event.pullTeam === 'home' ? homeName : awayName,
      )
    case EVENT.PULL:
      return t.eventPull(event.teamName)
    case EVENT.POSSESSION:
      return t.eventPossession(event.teamName, event.discPosition)
    case EVENT.SEPARATION:
    case EVENT.STALL_PRESSURE:
    case EVENT.STALL_OUT:
      return pickCopy(event, 'narrative', lang) || event.type
    case EVENT.THROW_ATTEMPT:
      return (
        pickCopy(event, 'narrative', lang) ||
        `${event.throwerName} → ${event.receiverName} · ${
          lang === UI_LANG.EN ? 'D' : 'obrona'
        }: ${event.defenderName}`
      )
    case EVENT.THROW_SUCCESS:
      return (
        pickCopy(event, 'narrative', lang) ||
        (lang === UI_LANG.EN
          ? `✓ Complete · pos ${event.discPosition} (${event.throwScore} vs ${event.defenseScore})`
          : `✓ Udany rzut · pozycja ${event.discPosition} (${event.throwScore} vs ${event.defenseScore})`)
      )
    case EVENT.THROW_FAIL:
      return (
        pickCopy(event, 'narrative', lang) ||
        (lang === UI_LANG.EN
          ? `✗ Incomplete · ${event.throwScore} vs ${event.defenseScore}`
          : `✗ Nieudany · ${event.throwScore} vs ${event.defenseScore}`)
      )
    case EVENT.TURNOVER:
      return event.reason === 'stall_out'
        ? t.eventStallOut(event.teamName, event.discPosition)
        : t.eventTurnover(event.teamName, event.discPosition)
    case EVENT.SCORE:
      return pickCopy(event, 'narrative', lang) || t.eventScore(event.teamName, event.reason)
    case EVENT.POINT_END:
      return t.eventPointEnd(event.throws)
    case EVENT.INJURY: {
      const label =
        lang === UI_LANG.EN
          ? event.labelEn ?? event.label
          : event.label ?? event.labelEn
      return (
        pickCopy(event, 'narrative', lang) ||
        t.eventInjury(event.playerName, label, event.daysRemaining)
      )
    }
    case EVENT.MATCH_END:
      return t.eventMatchEnd(event.homeScore, event.awayScore, event.winnerName)
    default:
      return event.type
  }
}

function filterLogEvents(events, verbose) {
  if (verbose) return events
  const keep = new Set([
    EVENT.MATCH_START,
    EVENT.POINT_START,
    EVENT.PULL,
    EVENT.TURNOVER,
    EVENT.SCORE,
    EVENT.INJURY,
    EVENT.MATCH_END,
  ])
  return events.filter((e) => keep.has(e.type))
}

/** Komentarz do bieżącej akcji na boisku (narracja eventu / wyniku rzutu). */
function commentaryForFieldAction(events, step, phase, homeName, awayName, t, lang) {
  if (!events?.length || step == null || step < 0) return null
  const ev = events[Math.min(step, events.length - 1)]
  if (!ev) return null

  if (ev.type === EVENT.THROW_ATTEMPT) {
    const result = events[step + 1]
    const hasResult =
      result &&
      (result.type === EVENT.THROW_SUCCESS || result.type === EVENT.THROW_FAIL)
    if (hasResult && (phase === 'flight' || phase === 'release')) {
      if (phase === 'flight') return eventLabel(result, homeName, awayName, t, lang)
      return eventLabel(ev, homeName, awayName, t, lang)
    }
  }

  return eventLabel(ev, homeName, awayName, t, lang)
}

function parseSeed(seedInput) {
  const trimmed = seedInput.trim()
  if (trimmed === '') return null
  const seed = Number.parseInt(trimmed, 10)
  return Number.isFinite(seed) ? seed : null
}

/** Kopia taktyki na mecz — edycje w meczu nie ruszają wzorca kariery. */
function cloneTacticsForMatch(tactics) {
  if (!tactics) return null
  return normalizeTactics(JSON.parse(JSON.stringify(tactics)))
}

export default function MatchView({
  homeTactics,
  onHomeTacticsChange: _onHomeTacticsChange,
  onMatchStaminaChange,
  leagueFixture = null,
  playerTeamId = null,
  onLeagueMatchComplete = null,
  onReturnToLeague = null,
  homeTeam: homeTeamProp = null,
  awayTeam: awayTeamProp = null,
  leaguePlayerStats = null,
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  const [seedInput, setSeedInput] = useState('')
  const [verbose, setVerbose] = useState(false)
  const [tick, setTick] = useState(0)
  const sessionRef = useRef(null)
  const [instantResult, setInstantResult] = useState(null)
  const [reviewPointIndex, setReviewPointIndex] = useState(null)
  const [playbackStep, setPlaybackStep] = useState(0)
  const [fieldPlaying, setFieldPlaying] = useState(false)
  const [clipElapsed, setClipElapsed] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const lastRenderedPositionsRef = useRef(null)
  const [holdPose, setHoldPose] = useState(null)
  const playbackPointRef = useRef(null)
  const leagueSubmittedRef = useRef(false)
  const fastForwardSkipRef = useRef(false)
  /** Sterowanie pętlą szybkiej symulacji (mutowalne — sprawdzane między punktami). */
  const fastSimControlRef = useRef({ running: false, paused: false, abort: false })
  const [fastSim, setFastSim] = useState(null)
  const [fastSimSpeed, setFastSimSpeed] = useState(2)
  const fastSimSpeedRef = useRef(2)
  fastSimSpeedRef.current = fastSimSpeed
  const [returnPulse, setReturnPulse] = useState(false)
  const [pointPlaybackComplete, setPointPlaybackComplete] = useState(true)
  /** Taktyka / składy tylko na ten mecz (nie zapisują się do career.homeTactics). */
  const [matchTacticsBundle, setMatchTacticsBundle] = useState({
    key: null,
    tactics: null,
  })
  /** Zawsze aktualna taktyka meczowa — pętla szybkiej symulacji nie może trzymać starego closure. */
  const matchTacticsRef = useRef(null)
  const playerSideRef = useRef('home')

  const isLeagueMatch = !!leagueFixture
  const matchTacticsKey = String(leagueFixture?.id ?? 'demo-match')

  // Reset kopii meczowej przy nowym meczu / fixturze (wzór = homeTactics z kariery)
  if (
    homeTactics &&
    (matchTacticsBundle.key !== matchTacticsKey || !matchTacticsBundle.tactics)
  ) {
    setMatchTacticsBundle({
      key: matchTacticsKey,
      tactics: cloneTacticsForMatch(homeTactics),
    })
  }

  const matchTactics = matchTacticsBundle.tactics ?? homeTactics
  matchTacticsRef.current = matchTactics

  const handleMatchTacticsChange = useCallback(
    (nextTactics) => {
      setMatchTacticsBundle((prev) => ({
        key: prev.key ?? matchTacticsKey,
        tactics: normalizeTactics(nextTactics),
      }))
    },
    [matchTacticsKey],
  )

  const homeTeam = useMemo(() => {
    if (homeTeamProp) return homeTeamProp
    if (leagueFixture) {
      const t = teamById(leagueFixture.homeTeamId)
      return t ? teamForMatchEngine(t) : demoHomeTeam
    }
    return demoHomeTeam
  }, [homeTeamProp, leagueFixture])

  const awayTeam = useMemo(() => {
    if (awayTeamProp) return awayTeamProp
    if (leagueFixture) {
      const t = teamById(leagueFixture.awayTeamId)
      return t ? teamForMatchEngine(t) : demoAwayTeam
    }
    return demoAwayTeam
  }, [awayTeamProp, leagueFixture])

  const matchKitColors = useMemo(
    () => resolveMatchColors(homeTeam, awayTeam),
    [homeTeam, awayTeam],
  )

  const playerSide =
    playerTeamId && homeTeam.id === playerTeamId
      ? 'home'
      : playerTeamId && awayTeam.id === playerTeamId
        ? 'away'
        : 'home'
  playerSideRef.current = playerSide

  const playerTeamObj = playerSide === 'home' ? homeTeam : awayTeam
  const aiTeam = playerSide === 'home' ? awayTeam : homeTeam
  const aiTacticsRef = useRef(null)
  if (!aiTacticsRef.current && aiTeam?.players) {
    aiTacticsRef.current = tacticsForTeam(aiTeam)
  }

  const homeTeamForViz = useMemo(
    () => ({
      ...homeTeam,
      tactics:
        homeTeam.tactics ??
        (playerSide === 'home' ? matchTactics : aiTacticsRef.current),
    }),
    [homeTeam, matchTactics, playerSide],
  )

  const awayTeamForViz = useMemo(
    () => ({
      ...awayTeam,
      tactics:
        awayTeam.tactics ??
        (playerSide === 'away' ? matchTactics : aiTacticsRef.current),
    }),
    [awayTeam, matchTactics, playerSide],
  )

  const session = sessionRef.current
  const liveResult = session ? sessionToResult(session) : null
  const result = instantResult ?? liveResult

  const displayEvents = useMemo(
    () => (result ? filterLogEvents(result.events, verbose) : []),
    [result, verbose],
  )

  const bump = () => setTick((t) => t + 1)

  function publishStamina(source) {
    onMatchStaminaChange?.(source?.stamina ?? null)
  }

  const matchOptions = () => ({
    homeTeam,
    awayTeam,
    homeTactics: playerSide === 'home' ? matchTactics : aiTacticsRef.current,
    awayTactics: playerSide === 'away' ? matchTactics : aiTacticsRef.current,
    seed: isLeagueMatch ? leagueFixture.id.length * 9973 : parseSeed(seedInput),
  })

  function pointAiOptions(overrides = {}) {
    return {
      rotateHome: playerSide !== 'home',
      rotateAway: playerSide !== 'away',
      aiHome: playerSide !== 'home',
      aiAway: playerSide !== 'away',
      ...overrides,
    }
  }

  function tacticsUpdateForPoint() {
    const t = matchTacticsRef.current
    return playerSideRef.current === 'home'
      ? { homeTactics: t }
      : { awayTactics: t }
  }

  function startInteractiveMatch() {
    setInstantResult(null)
    setReviewPointIndex(null)
    setPointPlaybackComplete(true)
    sessionRef.current = initMatchSession(matchOptions())
    publishStamina(sessionRef.current)
    bump()
  }

  function playerRosterForValidation() {
    const sideTeam = playerSide === 'home' ? homeTeam : awayTeam
    const sessionSide =
      sessionRef.current?.[playerSide]?.players ?? sideTeam?.players ?? []
    return sessionSide
  }

  function scrubInjuredFromPlayerTactics() {
    const current = matchTacticsRef.current
    if (!current) return
    const roster = playerRosterForValidation()
    const next = stripInjuredPlayersFromTactics(current, roster)
    const oChanged =
      JSON.stringify(next.lineupWhenOffenseStartPlayerIds) !==
      JSON.stringify(current.lineupWhenOffenseStartPlayerIds)
    const dChanged =
      JSON.stringify(next.lineupWhenDefenseStartPlayerIds) !==
      JSON.stringify(current.lineupWhenDefenseStartPlayerIds)
    if (oChanged || dChanged) handleMatchTacticsChange(next)
  }

  function validatePlayerLineup() {
    if (!session || !matchTactics) return { ok: false, reason: 'empty' }
    const roster = playerRosterForValidation()
    const role = pointStartRoleForTeam(playerSide, session.pullTeam)
    const current = validateLineupForSubmit(
      lineupIdsForPointStart(matchTactics, role),
      roster,
    )
    if (!current.ok) return current
    const beforeKickoff =
      session.status === 'break' && session.homeScore === 0 && session.awayScore === 0
    if (beforeKickoff) {
      const otherRole = role === 'offense' ? 'defense' : 'offense'
      const other = validateLineupForSubmit(
        lineupIdsForPointStart(matchTactics, otherRole),
        roster,
      )
      if (!other.ok) {
        return {
          ...other,
          reason: other.reason === 'duplicate' ? 'duplicate' : other.reason,
          message:
            other.reason === 'injured'
              ? t.injuredInLineup(
                  otherRole === 'offense' ? 'O-Line' : 'D-Line',
                  other.injuredNames,
                )
              : other.reason === 'duplicate'
                ? t.duplicateInLineup(otherRole === 'offense' ? 'O-Line' : 'D-Line')
                : t.needSeven(otherRole === 'offense' ? 'O-Line' : 'D-Line'),
        }
      }
    }
    return current
  }

  function handlePlayNextPoint() {
    if (!sessionRef.current || sessionRef.current.status === 'finished') return
    const lineupCheck = validatePlayerLineup()
    if (!lineupCheck.ok) return
    lastRenderedPositionsRef.current = null
    setHoldPose(null)
    setPointPlaybackComplete(false)
    fastForwardSkipRef.current = false
    try {
      playNextPoint(sessionRef.current, tacticsUpdateForPoint(), pointAiOptions())
    } catch (err) {
      console.error('[MatchView] playNextPoint failed:', err)
      setPointPlaybackComplete(true)
      return
    }
    scrubInjuredFromPlayerTactics()
    const played = sessionRef.current.pointIndex - 1
    setReviewPointIndex(played)
    bump()
  }

  function handleFastForwardPoint() {
    if (fieldPlaying || (!pointPlaybackComplete && reviewPointEvents.length > 0)) {
      fastForwardSkipRef.current = true
      setFieldPlaying(false)
      setClipElapsed(0)
      setHoldPose(null)
      setPlaybackStep(Math.max(0, reviewPointEvents.length - 1))
      setPointPlaybackComplete(true)
      publishStamina(sessionRef.current)
      return
    }
    if (!sessionRef.current || sessionRef.current.status === 'finished') return
    const lineupCheck = validatePlayerLineup()
    if (!lineupCheck.ok) return
    fastForwardSkipRef.current = true
    lastRenderedPositionsRef.current = null
    setHoldPose(null)
    setFieldPlaying(false)
    setPointPlaybackComplete(true)
    try {
      playNextPoint(sessionRef.current, tacticsUpdateForPoint(), pointAiOptions())
    } catch (err) {
      console.error('[MatchView] fast-forward point failed:', err)
      fastForwardSkipRef.current = false
      return
    }
    scrubInjuredFromPlayerTactics()
    const played = sessionRef.current.pointIndex - 1
    setReviewPointIndex(played)
    bump()
  }

  function handleSimulateAll() {
    const finished = simulateMatch({
      ...matchOptions(),
      ...pointAiOptions({ rotateHome: true, rotateAway: true }),
    })
    setInstantResult(finished)
    publishStamina(finished)
    sessionRef.current = null
    setReviewPointIndex(finished.pointsPlayed || 1)
    bump()
  }

  function handleSimulateRest() {
    if (!sessionRef.current || sessionRef.current.status === 'finished') return
    if (fastSimControlRef.current.running) return
    const lineupCheckStart = validatePlayerLineup()
    if (!lineupCheckStart.ok) return

    void runFastSimRest()
  }

  async function runFastSimRest() {
    const control = { running: true, paused: false, abort: false }
    fastSimControlRef.current = control

    setInstantResult(null)
    setFieldPlaying(false)
    setHoldPose(null)
    setPointPlaybackComplete(true)
    setFastSim({
      active: true,
      paused: false,
      finished: false,
      lastPoint: sessionRef.current?.lastPoint ?? null,
    })

    const delayMs = () => fastSimDelayMs(fastSimSpeedRef.current)

    try {
      while (
        sessionRef.current &&
        sessionRef.current.status !== 'finished' &&
        !control.abort
      ) {
        while (control.paused && !control.abort) {
          await new Promise((r) => setTimeout(r, 40))
        }
        if (control.abort || !sessionRef.current) break
        if (sessionRef.current.status === 'finished') break

        fastForwardSkipRef.current = true
        lastRenderedPositionsRef.current = null
        setHoldPose(null)
        setFieldPlaying(false)
        setPointPlaybackComplete(true)

        try {
          playNextPoint(
            sessionRef.current,
            tacticsUpdateForPoint(),
            pointAiOptions({ rotateHome: true, rotateAway: true }),
          )
        } catch (err) {
          console.error('[MatchView] fast sim point failed:', err)
          break
        }

        const sideTactics = sessionRef.current?.[playerSideRef.current]?.tactics
        if (sideTactics) handleMatchTacticsChange(sideTactics)
        scrubInjuredFromPlayerTactics()
        const played = sessionRef.current.pointIndex - 1
        setReviewPointIndex(played)
        publishStamina(sessionRef.current)
        setFastSim({
          active: true,
          paused: control.paused,
          finished: sessionRef.current.status === 'finished',
          lastPoint: sessionRef.current.lastPoint,
        })
        bump()
        await yieldToUi()
        await new Promise((r) => setTimeout(r, delayMs()))
      }
    } finally {
      const finished = sessionRef.current?.status === 'finished'
      control.running = false
      if (finished) {
        setFastSim((prev) =>
          prev
            ? {
                ...prev,
                active: true,
                paused: false,
                finished: true,
                lastPoint: sessionRef.current?.lastPoint ?? prev.lastPoint,
              }
            : null,
        )
        // Krótko pokaż finał, potem zdejmij panel (wynik zostaje w sesji / box score).
        window.setTimeout(() => {
          setFastSim(null)
        }, 900)
      } else if (control.abort) {
        setFastSim(null)
        setPointPlaybackComplete(true)
        bump()
      } else {
        setFastSim(null)
      }
    }
  }

  function handleFastSimPause() {
    fastSimControlRef.current.paused = true
    setFastSim((prev) => (prev ? { ...prev, paused: true } : prev))
  }

  function handleFastSimResume() {
    fastSimControlRef.current.paused = false
    setFastSim((prev) => (prev ? { ...prev, paused: false } : prev))
  }

  function handleFastSimStop() {
    fastSimControlRef.current.abort = true
    fastSimControlRef.current.paused = false
  }

  const oAttackLabel =
    TACTICS_MODIFIERS.attack[matchTactics?.oLineAttackStyle ?? matchTactics?.attackStyle]
      ?.label ?? '—'
  const oDefenseLabel =
    TACTICS_MODIFIERS.defense[matchTactics?.oLineDefenseStyle ?? matchTactics?.defenseStyle]
      ?.label ?? '—'
  const dAttackLabel =
    TACTICS_MODIFIERS.attack[matchTactics?.dLineAttackStyle ?? matchTactics?.attackStyle]
      ?.label ?? '—'
  const dDefenseLabel =
    TACTICS_MODIFIERS.defense[matchTactics?.dLineDefenseStyle ?? matchTactics?.defenseStyle]
      ?.label ?? '—'

  const inBreak =
    session && session.status === 'break' && session.pointIndex > 1
  const beforeFirstPoint =
    session && session.status === 'break' && session.homeScore === 0 && session.awayScore === 0
  const canPlayPoint = session && session.status === 'break'
  const matchLive = session && session.status !== 'finished'
  const matchFinished =
    result?.status === 'finished' || session?.status === 'finished'

  function resetMatch() {
    fastSimControlRef.current = { running: false, paused: false, abort: true }
    setFastSim(null)
    sessionRef.current = null
    setInstantResult(null)
    setReviewPointIndex(null)
    setPointPlaybackComplete(true)
    leagueSubmittedRef.current = false
    onMatchStaminaChange?.(null)
    if (homeTactics) {
      setMatchTacticsBundle({
        key: matchTacticsKey,
        tactics: cloneTacticsForMatch(homeTactics),
      })
    }
    bump()
  }

  function handleReturnToLeague() {
    setReturnPulse(true)
    window.setTimeout(() => {
      resetMatch()
      onReturnToLeague?.()
    }, 320)
  }

  useEffect(() => {
    leagueSubmittedRef.current = false
    fastSimControlRef.current = { running: false, paused: false, abort: true }
    setFastSim(null)
    if (!isLeagueMatch || leagueFixture.status === 'completed') return
    setInstantResult(null)
    setReviewPointIndex(null)
    sessionRef.current = initMatchSession(matchOptions())
    publishStamina(sessionRef.current)
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueFixture?.id])

  useEffect(() => {
    if (!isLeagueMatch || !matchFinished || !result || leagueSubmittedRef.current) return
    leagueSubmittedRef.current = true
    onLeagueMatchComplete?.(result, leagueFixture)
  }, [isLeagueMatch, matchFinished, result, leagueFixture, onLeagueMatchComplete])

  const pointIndices = useMemo(
    () => (result?.events ? listPointIndices(result.events) : []),
    [result?.events],
  )

  const activeReviewPoint =
    reviewPointIndex ?? pointIndices[pointIndices.length - 1] ?? null

  const reviewPointEvents = useMemo(() => {
    if (!result?.events || activeReviewPoint == null) return []
    return slicePointEvents(result.events, activeReviewPoint)
  }, [result?.events, activeReviewPoint])

  const reviewPullTeam = useMemo(() => {
    const start = reviewPointEvents.find((e) => e.type === EVENT.POINT_START)
    return start?.pullTeam ?? MATCH_CONFIG.firstPointPullTeam
  }, [reviewPointEvents])

  useEffect(() => {
    if (!reviewPointEvents.length) return
    if (fastSimControlRef.current.running || fastForwardSkipRef.current) {
      fastForwardSkipRef.current = false
      playbackPointRef.current = activeReviewPoint
      setPlaybackStep(Math.max(0, reviewPointEvents.length - 1))
      setFieldPlaying(false)
      setClipElapsed(0)
      setPointPlaybackComplete(true)
      publishStamina(sessionRef.current)
      return
    }
    if (playbackPointRef.current === activeReviewPoint) return
    playbackPointRef.current = activeReviewPoint
    setPlaybackStep(0)
    setClipElapsed(0)
    lastRenderedPositionsRef.current = null
    setHoldPose(null)
    setFieldPlaying(true)
    setPointPlaybackComplete(false)
  }, [activeReviewPoint, reviewPointEvents.length])

  useEffect(() => {
    if (!reviewPointEvents.length) return
    if (fieldPlaying) return
    if (playbackStep >= reviewPointEvents.length - 1) {
      setPointPlaybackComplete(true)
      publishStamina(sessionRef.current)
    }
  }, [fieldPlaying, playbackStep, reviewPointEvents.length])

  useEffect(() => {
    if (!fieldPlaying || reviewPointEvents.length === 0) return undefined
    if (playbackStep >= reviewPointEvents.length - 1) {
      setFieldPlaying(false)
      return undefined
    }

    const currentEv = reviewPointEvents[playbackStep]
    if (['throw_success', 'throw_fail'].includes(currentEv?.type)) {
      const skip = window.setTimeout(() => {
        setPlaybackStep((s) => s + 1)
      }, 0)
      return () => window.clearTimeout(skip)
    }

    const clip = buildFieldActionClip(
      reviewPointEvents,
      playbackStep,
      homeTeamForViz,
      awayTeamForViz,
      reviewPullTeam,
      lastRenderedPositionsRef.current,
    )

    if (!clip) {
      const timer = window.setTimeout(() => {
        setPlaybackStep((s) => s + 1)
      }, Math.max(80, FIELD_SHORT_TRANSITION_MS / playbackSpeed))
      return () => window.clearTimeout(timer)
    }

    let start = performance.now()
    let raf
    /** RAF: progress 0→1 w klipie; sampleFieldActionClip LERP-uje ticki symulacji (prev→current). */
    const tick = (now) => {
      const elapsed = now - start
      setClipElapsed(elapsed)
      const simElapsed = elapsed * playbackSpeed
      if (simElapsed >= clip.totalDurationMs) {
        const endFrame = sampleFieldActionClip(clip, clip.totalDurationMs)
        if (endFrame) {
          const initial = renderedFrameToInitialPlayerPositions(endFrame)
          if (initial) lastRenderedPositionsRef.current = initial
          setHoldPose({
            discX: endFrame.discX,
            discY: endFrame.discY,
            players: endFrame.players.map((p) => ({
              id: p.id,
              fieldId: p.fieldId ?? p.id,
              teamId: p.teamId,
              x: p.x,
              y: p.y,
            })),
          })
        }
        setClipElapsed(0)
        const nextStep = playbackStep + playbackStepAdvanceDelta(reviewPointEvents, playbackStep)
        if (nextStep >= reviewPointEvents.length - 1) {
          setFieldPlaying(false)
        }
        setPlaybackStep(nextStep)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    setClipElapsed(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fieldPlaying, playbackStep, reviewPointEvents, homeTeamForViz, awayTeamForViz, reviewPullTeam, playbackSpeed])

  const fieldState = useMemo(() => {
    if (!reviewPointEvents.length) return null
    return fieldStateAtEventStep(
      reviewPointEvents,
      playbackStep,
      homeTeamForViz,
      awayTeamForViz,
      reviewPullTeam,
    )
  }, [reviewPointEvents, playbackStep, reviewPullTeam, homeTeamForViz, awayTeamForViz])

  const actionClip = useMemo(() => {
    if (!fieldPlaying || !reviewPointEvents.length) return null
    return buildFieldActionClip(
      reviewPointEvents,
      playbackStep,
      homeTeamForViz,
      awayTeamForViz,
      reviewPullTeam,
      lastRenderedPositionsRef.current,
    )
  }, [fieldPlaying, reviewPointEvents, playbackStep, homeTeamForViz, awayTeamForViz, reviewPullTeam])

  const playbackTimeline = useMemo(() => {
    if (!actionClip) return null
    return buildClipPlaybackTimeline(actionClip, sampleFieldActionClip)
  }, [actionClip])

  const reviewLineupIds = useMemo(
    () => fieldLineupIdsFromPointEvents(reviewPointEvents),
    [reviewPointEvents],
  )

  const renderFrame = useMemo(() => {
    if (!fieldState) return null
    let frame
    if (fieldPlaying && playbackTimeline?.length) {
      const simElapsed = clipElapsed * playbackSpeed
      frame =
        resolvePlaybackRenderFrame(playbackTimeline, simElapsed) ??
        fieldStateToRenderFrame(fieldState)
    } else if (holdPose) {
      frame = poseToRenderFrame(holdPose, fieldState) ?? fieldStateToRenderFrame(fieldState)
    } else {
      frame = fieldStateToRenderFrame(fieldState)
    }
    if (!frame?.players?.length) return frame
    return {
      ...frame,
      players: filterPlayersToPointLineup(
        frame.players,
        reviewLineupIds.homeLineupIds,
        reviewLineupIds.awayLineupIds,
      ),
    }
  }, [
    fieldState,
    fieldPlaying,
    playbackTimeline,
    clipElapsed,
    playbackSpeed,
    holdPose,
    reviewLineupIds,
  ])

  const fieldCommentary = useMemo(
    () =>
      commentaryForFieldAction(
        reviewPointEvents,
        playbackStep,
        renderFrame?.phase,
        homeTeam.name,
        awayTeam.name,
        t,
        lang,
      ),
    [reviewPointEvents, playbackStep, renderFrame?.phase, homeTeam.name, awayTeam.name, t, lang],
  )

  useEffect(() => {
    if (!fieldPlaying || !renderFrame?.players?.length) return
    const snap = renderedFrameToInitialPlayerPositions(renderFrame)
    if (!snap) return
    const pruned = pruneInitialPositionsToLineup(
      snap,
      reviewLineupIds.homeLineupIds,
      reviewLineupIds.awayLineupIds,
    )
    if (pruned) lastRenderedPositionsRef.current = pruned
  }, [renderFrame, fieldPlaying, reviewLineupIds])

  const displayedScore = useMemo(() => {
    if (fastSim?.active || !result?.events?.length || activeReviewPoint == null || !reviewPointEvents.length) {
      return {
        home: session?.homeScore ?? result?.homeScore ?? 0,
        away: session?.awayScore ?? result?.awayScore ?? 0,
      }
    }
    return computeDisplayedMatchScore(
      result.events,
      activeReviewPoint,
      reviewPointEvents,
      playbackStep,
      { fieldPlaying, clipElapsed, actionClip, playbackSpeed },
    )
  }, [
    fastSim?.active,
    result?.events,
    result?.homeScore,
    result?.awayScore,
    session?.homeScore,
    session?.awayScore,
    activeReviewPoint,
    reviewPointEvents,
    playbackStep,
    fieldPlaying,
    clipElapsed,
    actionClip,
    playbackSpeed,
  ])

  const matchStats = useMemo(() => {
    if (result?.matchStats) return result.matchStats
    if (result?.events?.length) return buildMatchStatsFromEvents(result.events)
    return null
  }, [result?.matchStats, result?.events])

  const wind = session?.wind ?? result?.wind ?? null

  const reviewPointMeta = useMemo(() => {
    if (!reviewPointEvents.length) return {}
    const end = reviewPointEvents.find((e) => e.type === EVENT.POINT_END)
    return {
      scoringTeam: end?.scoringTeam,
      throws: end?.throws,
    }
  }, [reviewPointEvents])

  const reviewHomeLineup = useMemo(() => {
    const ids = new Set(reviewLineupIds.homeLineupIds ?? [])
    const roster = session?.home?.players ?? homeTeam.players
    return roster.filter((p) => ids.has(p.id))
  }, [session?.home?.players, homeTeam.players, reviewLineupIds.homeLineupIds])

  const reviewAwayLineup = useMemo(() => {
    const ids = new Set(reviewLineupIds.awayLineupIds ?? [])
    const roster = session?.away?.players ?? awayTeam.players
    return roster.filter((p) => ids.has(p.id))
  }, [session?.away?.players, awayTeam.players, reviewLineupIds.awayLineupIds])

  const playbackStaminaMaps = useMemo(() => {
    if (!reviewPointEvents.length) {
      return session?.stamina ?? result?.stamina ?? null
    }
    if (pointPlaybackComplete || fastSim?.active) {
      return session?.stamina ?? result?.stamina ?? null
    }
    const progress =
      fieldPlaying && actionClip
        ? clipProgress01(clipElapsed, actionClip, playbackSpeed)
        : 0
    return (
      computeStaminaDuringPointPlayback({
        pointEvents: reviewPointEvents,
        stepIndex: playbackStep,
        clipProgress: progress,
        homeLineup: reviewHomeLineup,
        awayLineup: reviewAwayLineup,
      }) ??
      session?.stamina ??
      result?.stamina ??
      null
    )
  }, [
    reviewPointEvents,
    pointPlaybackComplete,
    fastSim?.active,
    fieldPlaying,
    actionClip,
    clipElapsed,
    playbackSpeed,
    playbackStep,
    reviewHomeLineup,
    reviewAwayLineup,
    session?.stamina,
    result?.stamina,
  ])

  const fieldStaminaReady =
    !!playbackStaminaMaps &&
    (reviewHomeLineup.length > 0 || reviewAwayLineup.length > 0)

  const pointStatsEvents = useMemo(() => {
    if (!reviewPointEvents.length) return []
    if (pointPlaybackComplete || fastSim?.active) return reviewPointEvents
    const end = Math.min(reviewPointEvents.length, Math.max(1, playbackStep + 1))
    return reviewPointEvents.slice(0, end)
  }, [reviewPointEvents, pointPlaybackComplete, fastSim?.active, playbackStep])

  const pointStatsComplete =
    pointPlaybackComplete ||
    !!fastSim?.active ||
    pointStatsEvents.some((e) => e.type === EVENT.POINT_END || e.type === EVENT.SCORE)

  useEffect(() => {
    if (!playbackStaminaMaps) return
    onMatchStaminaChange?.(playbackStaminaMaps)
  }, [playbackStaminaMaps, onMatchStaminaChange])

  const playerStaminaMap =
    playerSide === 'home' ? playbackStaminaMaps?.home : playbackStaminaMaps?.away

  const showLineupPanel =
    matchLive &&
    canPlayPoint &&
    pointPlaybackComplete &&
    !fieldPlaying &&
    (!fastSim?.active || !!fastSim?.paused)

  const homeNextPointRole = session
    ? pointStartRoleForTeam(playerSide, session.pullTeam)
    : 'offense'

  const lineupCheck = useMemo(() => {
    if (!matchTactics || !session) return { ok: false, reason: 'empty' }
    const roster =
      session?.[playerSide]?.players ??
      (playerSide === 'home' ? homeTeam?.players : awayTeam?.players) ??
      []
    const role = homeNextPointRole
    const current = validateLineupForSubmit(
      lineupIdsForPointStart(matchTactics, role),
      roster,
    )
    if (!current.ok) return current
    if (beforeFirstPoint) {
      const otherRole = role === 'offense' ? 'defense' : 'offense'
      const other = validateLineupForSubmit(
        lineupIdsForPointStart(matchTactics, otherRole),
        roster,
      )
      if (!other.ok) {
        const label = otherRole === 'offense' ? 'O-Line' : 'D-Line'
        return {
          ...other,
          message:
            other.reason === 'injured'
              ? t.injuredInLineup(label, other.injuredNames)
              : other.reason === 'duplicate'
                ? t.duplicateInLineup(label)
                : t.needSeven(label),
        }
      }
    }
    return current
  }, [
    matchTactics,
    homeNextPointRole,
    session,
    tick,
    beforeFirstPoint,
    playerSide,
    homeTeam,
    awayTeam,
  ])

  const lineupSubmitError = lineupValidationMessage(lineupCheck)

  const pointAnimating = fieldPlaying || (!pointPlaybackComplete && reviewPointEvents.length > 0)

  return (
    <div className={`space-y-6 ${returnPulse ? 'opacity-0 transition-opacity duration-300' : ''}`}>
      {isLeagueMatch && (
        <div className="rounded-lg border border-ufa-gold/40 bg-ufa-panel/80 px-4 py-2 text-sm text-ufa-muted">
          {t.leagueMatch} ·  {leagueFixture.round} ·{' '}
          <span className="text-ufa-text">{homeTeam.name}</span> vs{' '}
          <span className="text-ufa-text">{awayTeam.name}</span>
        </div>
      )}
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">
              {isLeagueMatch ? t.leagueMatch : t.simMatch}
            </h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {homeTeam.name} ({homeTeam.players.length} zaw.) vs {awayTeam.name} (
              {awayTeam.players.length} zaw.) · do {MATCH_CONFIG.pointsToWin} pkt · O:{' '}
              {oAttackLabel}/{oDefenseLabel} · D: {dAttackLabel}/{dDefenseLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ufa-muted">
              Seed (opcjonalnie)
              <input
                type="text"
                inputMode="numeric"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="losowo"
                disabled={!!session}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text w-28 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-ufa-muted cursor-pointer">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
                className="rounded border-ufa-border"
              />
              {t.fullThrowLog}
            </label>
            {!session && !isLeagueMatch && (
              <>
                <button
                  type="button"
                  onClick={startInteractiveMatch}
                  className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
                >
                  {t.pointByPointMatch}
                </button>
                <button
                  type="button"
                  onClick={handleSimulateAll}
                  className="rounded-md border border-ufa-border bg-ufa-bg px-4 py-2 text-sm font-medium text-ufa-text hover:bg-ufa-panel-hover"
                >
                  {t.simRest}
                </button>
              </>
            )}
          </div>
        </div>

        {(result || session) && (
          <div className="mt-6 space-y-3">
            <MatchDashboard
              matchStats={matchStats}
              homeName={homeTeam.name}
              awayName={awayTeam.name}
              homeScore={displayedScore.home}
              awayScore={displayedScore.away}
              matchEvents={result?.events ?? session?.events ?? null}
            />

            <div className="space-y-3">
              {fastSim?.active ? (
                <MatchFastSimPanel
                  homeName={homeTeam.name}
                  awayName={awayTeam.name}
                  homeScore={session?.homeScore ?? result?.homeScore ?? 0}
                  awayScore={session?.awayScore ?? result?.awayScore ?? 0}
                  pointsToWin={MATCH_CONFIG.pointsToWin}
                  lastPoint={fastSim.lastPoint}
                  paused={!!fastSim.paused}
                  finished={!!fastSim.finished}
                  speed={fastSimSpeed}
                  onSpeedChange={setFastSimSpeed}
                  onPause={handleFastSimPause}
                  onResume={handleFastSimResume}
                  onStop={handleFastSimStop}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ufa-muted">{t.simTempo}</span>
                      {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => setPlaybackSpeed(speed)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums ${
                            playbackSpeed === speed
                              ? 'bg-ufa-accent text-ufa-bg'
                              : 'border border-ufa-border text-ufa-muted hover:bg-ufa-panel-hover'
                          }`}
                        >
                          {speed}×
                        </button>
                      ))}
                    </div>
                    {pointAnimating && (
                      <button
                        type="button"
                        onClick={handleFastForwardPoint}
                        className="rounded-md border border-ufa-accent/50 bg-ufa-accent/10 px-3 py-1.5 text-xs font-semibold text-ufa-accent hover:bg-ufa-accent/20"
                      >
                        {t.finishPoint}
                      </button>
                    )}
                  </div>
                  <FieldView2D
                    fieldState={fieldState}
                    renderFrame={renderFrame}
                    fieldPointKey={activeReviewPoint}
                    wind={wind}
                    homeLabel={homeTeam.name.split(' ').pop()}
                    awayLabel={awayTeam.name.split(' ').pop()}
                    homeColor={matchKitColors.homeColor}
                    awayColor={matchKitColors.awayColor}
                    commentary={fieldCommentary}
                  />
                </>
              )}
              {fieldStaminaReady && (
                <PointStaminaPanel
                  homeName={homeTeam.name}
                  awayName={awayTeam.name}
                  homePlayers={reviewHomeLineup}
                  awayPlayers={reviewAwayLineup}
                  staminaMaps={playbackStaminaMaps}
                  pointEvents={pointStatsEvents}
                  pointComplete={pointStatsComplete}
                  pointIndex={activeReviewPoint}
                />
              )}
            </div>
          </div>
        )}

        {session && session.lastPoint && !fastSim?.active && (
          <p className="mt-4 text-center text-sm text-ufa-muted">
            {t.pointN(session.lastPoint.pointIndex)}{' '}
            <span className="text-ufa-text font-medium">
              {session.lastPoint.scoringTeam === 'home'
                ? homeTeam.name
                : awayTeam.name}
            </span>{' '}
            · {t.throwsN(session.lastPoint.throws)} ·{' '}
            <span className="text-ufa-accent">{t.historyBelow}</span>
          </p>
        )}
      </div>

      {showLineupPanel && (
        <LineupSelector
          session={session}
          playerTeam={playerTeamObj}
          playerSide={playerSide}
          pullTeam={session.pullTeam}
          tactics={matchTactics}
          onTacticsChange={handleMatchTacticsChange}
          staminaMap={playerStaminaMap}
          onPlayPoint={canPlayPoint && !fastSim?.active ? handlePlayNextPoint : null}
          onFastForwardPoint={canPlayPoint && !fastSim?.active ? handleFastForwardPoint : null}
          lineupError={lineupSubmitError}
          playDisabled={!lineupCheck.ok}
          playLabel={
            beforeFirstPoint ? t.playPoint1 : t.playPoint(session.pointIndex)
          }
          showSimRest={!fastSim?.active}
          onSimulateRest={handleSimulateRest}
          editDefaultLines={!!beforeFirstPoint}
          leaguePlayerStats={leaguePlayerStats}
        />
      )}

      {matchFinished && (
        <div className="flex flex-col items-center gap-3 league-fade-in">
          {isLeagueMatch ? (
            <button
              type="button"
              onClick={handleReturnToLeague}
              className="rounded-md bg-ufa-accent px-6 py-2.5 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
            >
              {t.returnHub}
            </button>
          ) : (
            <button
              type="button"
              onClick={resetMatch}
              className="rounded-md border border-ufa-border bg-ufa-panel px-5 py-2 text-sm font-medium text-ufa-text hover:bg-ufa-panel-hover"
            >
              {t.newMatch}
            </button>
          )}
        </div>
      )}

      {matchFinished && (
        <p className="text-center text-sm text-ufa-gold font-medium -mt-4">
          {isLeagueMatch ? t.resultSaved : t.matchOver}
        </p>
      )}

      {reviewPointEvents.length > 0 && (
        <PointHistory
          events={reviewPointEvents}
          pointIndex={activeReviewPoint}
          pointIndices={pointIndices}
          onSelectPointIndex={setReviewPointIndex}
          scoringTeam={reviewPointMeta.scoringTeam}
          throws={reviewPointMeta.throws}
          homeTeamName={homeTeam.name}
          awayTeamName={awayTeam.name}
        />
      )}

      {result && !matchFinished && (
        <BoxScoreTable
          variant="full"
          rows={result.boxScore}
          homeTeamName={homeTeam.name}
          awayTeamName={awayTeam.name}
        />
      )}

      {result && matchFinished && (
        <BoxScoreTable
          variant="full"
          rows={result.boxScore}
          homeTeamName={homeTeam.name}
          awayTeamName={awayTeam.name}
        />
      )}

      {result && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
          <div className="border-b border-ufa-border px-6 py-4">
            <h3 className="font-semibold text-ufa-text">{t.matchLog}</h3>
            <p className="text-xs text-ufa-muted mt-1">
              {t.pointsEvents(result.pointsPlayed, result.events.length)}
              {verbose ? '' : t.abbreviated}
            </p>
          </div>
          <ul className="max-h-[480px] overflow-y-auto divide-y divide-ufa-border/60 px-4 py-2 text-sm font-mono">
            {displayEvents.map((event) => (
              <li
                key={event.id}
                className={`py-2 px-2 ${
                  event.type === EVENT.SCORE
                    ? 'text-ufa-accent font-semibold'
                    : event.type === EVENT.MATCH_END
                      ? 'text-ufa-gold'
                      : 'text-ufa-muted'
                }`}
              >
                {eventLabel(event, homeTeam.name, awayTeam.name, t, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* tick forces re-render when session mutates */}
      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </div>
  )
}
