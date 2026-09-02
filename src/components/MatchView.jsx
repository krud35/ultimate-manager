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
import AutoSimOverlay from './match/AutoSimOverlay'
import FieldView2D from './FieldView2D'
import { resolveMatchColors } from '../data/teamColors.js'
import MatchDashboard from './MatchDashboard'
import TeamNewsView from './match/TeamNewsView'
import TacticsOverlay from './match/TacticsOverlay'
import DressingRoomView from './match/DressingRoomView'
import RoundResultsView from './match/RoundResultsView'
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

/** Etapy dnia meczowego od zakończenia meczu do wyjścia — auto-advance do "postMatch" ich nie dotyczy. */
const POST_MATCH_STAGES = new Set(['postMatch', 'dressingRoomPost', 'roundResults'])

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
  league = null,
  onMatchLockChange = null,
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
  /**
   * AUTO-SYMULACJA DO KOŃCA — punkt po punkcie pełnym silnikiem, jako ekran ładowania.
   *
   * Wcześniej ten przycisk przełączał mecz na silnik statystyczny (fastMode) w połowie
   * gry. Zmierzone: te same drużyny i seedy dawały 87.5% wygranych gospodarza w pełnym
   * ticku i 58.3% w fastMode — przy czym wynik silniejszej drużyny się nie zmieniał,
   * a SŁABSZA dostawała ~4 punkty na mecz. Prowadzenie zbudowane w jednym silniku było
   * więc oddawane w drugim.
   */
  const autoSimRef = useRef(false)
  const autoSimTimerRef = useRef(null)
  /** Migawki policzonych punktów czekające na pokazanie — liczenie wyprzedza ekran. */
  const autoSimQueueRef = useRef([])
  const autoSimComputingRef = useRef(false)
  const [autoSimProgress, setAutoSimProgress] = useState(null)
  useEffect(
    () => () => {
      autoSimRef.current = false
      if (autoSimTimerRef.current != null) window.clearTimeout(autoSimTimerRef.current)
      autoSimQueueRef.current = []
    },
    [],
  )
  /** Numer punktu, dla którego już otworzyliśmy modal taktyki automatycznie (bez powtórek). */
  const tacticsAutoOpenedForRef = useRef(null)
  /** Tryb "punkt po punkcie": bez animacji boiska, ręczne tempo (gracz klika kolejny punkt). */
  const [pointByPointMode, setPointByPointMode] = useState(false)
  const [returnPulse, setReturnPulse] = useState(false)
  /** Etapy dnia meczowego: przygotowanie -> team news -> mecz -> po meczu. */
  const [stage, setStage] = useState('prep')
  const [tacticsModalOpen, setTacticsModalOpen] = useState(false)
  const [showFullStats, setShowFullStats] = useState(false)

  /** Poza "prep" blokujemy nawigację w App.jsx — nie da się porzucić meczu w trakcie. */
  useEffect(() => {
    onMatchLockChange?.(stage !== 'prep')
  }, [stage, onMatchLockChange])
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

  /** Punkt po punkcie, bez animacji: symuluje 1 punkt (fastMode) i zatrzymuje się. */
  function handleSimulateNextPoint() {
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
      console.error('[MatchView] simulate next point failed:', err)
      fastForwardSkipRef.current = false
      return
    }
    scrubInjuredFromPlayerTactics()
    const played = sessionRef.current.pointIndex - 1
    setReviewPointIndex(played)
    publishStamina(sessionRef.current)
    bump()
  }

  function handleEnterPointByPoint() {
    setPointByPointMode(true)
    setTacticsModalOpen(false)
  }

  function handleExitPointByPoint() {
    setPointByPointMode(false)
    setTacticsModalOpen(false)
  }

  /** Etap "prep": zatwierdza siódemki startowe i przechodzi do team news (bez rozgrywania punktu). */
  function handleContinueToTeamNews() {
    setStage('teamNews')
  }

  /** Etap "szatnia": wchodzimy w mecz i otwieramy wybór taktyki na PIERWSZY punkt.
   *  Punkt 1 nie startuje sam — gracz najpierw ustawia skład i taktykę, tak samo jak
   *  przed każdym kolejnym punktem. */
  function handleKickoff() {
    tacticsAutoOpenedForRef.current = null
    setStage('live')
    setTacticsModalOpen(true)
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
    setStage('postMatch')
    bump()
  }

  /** Odstęp między punktami auto-symulacji. Sam punkt liczy się ~0.4 s (blokująco),
   *  więc odliczamy od CHWILI POKAZANIA poprzedniego, a nie stałym interwałem — inaczej
   *  wolniejszy punkt nakładałby się na następny. */
  const AUTO_SIM_POINT_MS = 1000

  const autoSimLabels = useMemo(
    () => ({
      title: t.autoSimTitle,
      pointsPlayed: t.autoSimPointsPlayed,
      stop: t.autoSimStop,
      completion: t.autoSimCompletion,
      throws: t.autoSimThrows,
      turnovers: t.autoSimTurnovers,
      hucks: t.autoSimHucks,
      yards: t.autoSimYards,
      goal: t.autoSimGoal,
      goalShort: t.autoSimGoalShort,
      assist: t.autoSimAssist,
      assistShort: t.autoSimAssistShort,
    }),
    [t],
  )

  function stopAutoSim() {
    autoSimQueueRef.current = []
    autoSimRef.current = false
    if (autoSimTimerRef.current != null) {
      window.clearTimeout(autoSimTimerRef.current)
      autoSimTimerRef.current = null
    }
    setAutoSimProgress(null)
  }

  /** Siódemka z danego punktu jako gotowa lista zawodników — rozwiązywana ze składu
   *  SESJI w chwili liczenia, żeby ekran nie musiał dopasowywać identyfikatorów. */
  function sevenFrom(team, ids) {
    const byId = new Map((team?.players ?? []).map((p) => [p.id, p]))
    return (ids ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      // Zawodnik nie ma pola `name` — nazwisko składa się z firstName/lastName
      // (patrz playerLabel w point.js). Skrót „J. Zuraw" jak w panelu składu.
      .map((p) => ({
        id: p.id,
        name: `${p.firstName?.[0] ?? ''}. ${p.lastName ?? ''}`.trim(),
        jersey: p.jersey ?? null,
      }))
  }

  /** PRODUCENT: liczy kolejny punkt i odkłada migawkę. Oddaje wątek między punktami,
   *  żeby przeglądarka zdążyła przerysować ekran (punkt to ~0.4 s blokującego CPU). */
  function autoSimProduce() {
    if (!autoSimRef.current || autoSimComputingRef.current) return
    const session = sessionRef.current
    if (!session || session.status === 'finished') return
    if (autoSimQueueRef.current.length >= 3) return
    autoSimComputingRef.current = true
    try {
      // rotate: true po OBU stronach — automatyczne zmiany ze zmęczenia
      // (autoSubstituteTacticsForTeam). ai zostaje per strona, więc taktyka gracza
      // nie jest nadpisywana przez AI; gracz po prostu nie jest o nic pytany.
      playNextPoint(
        sessionRef.current,
        tacticsUpdateForPoint(),
        pointAiOptions({ rotateHome: true, rotateAway: true }),
      )
    } catch (err) {
      console.error('[MatchView] auto sim step failed:', err)
      autoSimComputingRef.current = false
      stopAutoSim()
      return
    }
    const s2 = sessionRef.current
    const pointIndex = s2.pointIndex - 1
    // Siódemki bierzemy z tego samego źródła co normalna gra — ze zdarzenia point_start.
    const pointEvents = slicePointEvents(s2.events ?? [], pointIndex)
    const lineups = fieldLineupIdsFromPointEvents(pointEvents)
    // Zdarzenie SCORE niesie throwerId (asysta) i receiverId (zdobywca). Punkt przyznany
    // z limitu rzutów żadnego z nich nie ma — wtedy po prostu nikogo nie oznaczamy.
    const scoreEv = pointEvents.find((e) => e.type === EVENT.SCORE)
    autoSimQueueRef.current.push({
      home: s2.homeScore ?? 0,
      away: s2.awayScore ?? 0,
      points: pointIndex,
      pointIndex,
      homeSeven: sevenFrom(s2.home, lineups.homeLineupIds),
      awaySeven: sevenFrom(s2.away, lineups.awayLineupIds),
      scorerId: scoreEv?.receiverId ?? null,
      assistId: scoreEv?.throwerId ?? null,
      finished: s2.status === 'finished',
    })
    autoSimComputingRef.current = false
    // Kolejny punkt liczymy dopiero po oddaniu wątku — inaczej seria długich punktów
    // zamroziłaby ekran na kilka sekund.
    window.setTimeout(autoSimProduce, 0)
  }

  /** KONSUMENT: pokazuje jedną migawkę na sekundę, niezależnie od tego, jak długo
   *  liczył się dany punkt. Wcześniej ekran szedł w tempie LICZENIA (max(0, 1000-spent)),
   *  więc długie punkty odpalały następny natychmiast — stąd nierówne przeskoki
   *  i "dwa naraz". */
  function autoSimShow() {
    if (!autoSimRef.current) return
    const next = autoSimQueueRef.current.shift()
    if (next) {
      // Każdy pokazany punkt musi przeskoczyć na SWÓJ koniec, inaczej playbackStep
      // zostaje na 0 i computeDisplayedMatchScore nie zalicza zdobyczy tego punktu —
      // wynik szedł wtedy stale o jeden do tyłu (14 zamiast 15 po ostatnim punkcie).
      // Ten sam mechanizm, którego używa pominięcie animacji w normalnej grze.
      fastForwardSkipRef.current = true
      scrubInjuredFromPlayerTactics()
      setReviewPointIndex(next.pointIndex)
      publishStamina(sessionRef.current)
      setAutoSimProgress(next)
      bump()
      if (next.finished && autoSimQueueRef.current.length === 0) {
        // Ostatni punkt ma zostać na ekranie przez pełny takt — inaczej wynik końcowy
        // mignąłby i zniknął w tej samej klatce, w której się pojawił.
        autoSimTimerRef.current = window.setTimeout(() => {
          autoSimRef.current = false
          autoSimTimerRef.current = null
          setAutoSimProgress(null)
          bump()
        }, AUTO_SIM_POINT_MS)
        return
      }
    }
    // Nie ma czego pokazać, nie ma czego liczyć i nikt nie liczy — koniec.
    if (
      !next &&
      autoSimQueueRef.current.length === 0 &&
      !autoSimComputingRef.current &&
      sessionRef.current?.status === 'finished'
    ) {
      autoSimRef.current = false
      autoSimTimerRef.current = null
      setAutoSimProgress(null)
      bump()
      return
    }
    autoSimProduce()
    autoSimTimerRef.current = window.setTimeout(autoSimShow, AUTO_SIM_POINT_MS)
  }

  /** Symuluje pozostałe punkty PEŁNYM silnikiem, punkt po punkcie, jako ekran ładowania
   *  wyniku końcowego — z podglądem postępu, bez pytania gracza o taktykę. */
  function handleSimulateToEnd() {
    if (!sessionRef.current || sessionRef.current.status === 'finished') return
    if (autoSimRef.current) return
    const lineupCheck = validatePlayerLineup()
    if (!lineupCheck.ok) return
    fastForwardSkipRef.current = true
    lastRenderedPositionsRef.current = null
    setHoldPose(null)
    setFieldPlaying(false)
    setPointPlaybackComplete(true)
    setTacticsModalOpen(false)
    autoSimRef.current = true
    const startIdx = Math.max(1, sessionRef.current.pointIndex - 1)
    const startLineups = fieldLineupIdsFromPointEvents(
      slicePointEvents(sessionRef.current.events ?? [], startIdx),
    )
    setAutoSimProgress({
      home: sessionRef.current.homeScore ?? 0,
      away: sessionRef.current.awayScore ?? 0,
      points: sessionRef.current.pointIndex - 1,
      pointIndex: startIdx,
      homeSeven: sevenFrom(sessionRef.current.home, startLineups.homeLineupIds),
      awaySeven: sevenFrom(sessionRef.current.away, startLineups.awayLineupIds),
      scorerId: null,
      assistId: null,
      finished: false,
    })
    autoSimQueueRef.current = []
    autoSimProduce()
    autoSimShow()
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

  /**
   * Auto-przejście do ekranu pomeczowego, gdy mecz się kończy — czy to w trakcie
   * normalnej rozgrywki ("live"), czy przez "Symuluj do końca meczu" kliknięte
   * jeszcze na etapie "prep" (mecz może się skończyć bez odwiedzenia "live").
   */
  useEffect(() => {
    if (!POST_MATCH_STAGES.has(stage) && matchFinished) {
      setStage('postMatch')
    }
  }, [stage, matchFinished])

  function resetMatch() {
    setPointByPointMode(false)
    setTacticsModalOpen(false)
    setShowFullStats(false)
    setStage('prep')
    sessionRef.current = null
    setInstantResult(null)
    setReviewPointIndex(null)
    setPointPlaybackComplete(true)
    leagueSubmittedRef.current = false
    tacticsAutoOpenedForRef.current = null
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
    tacticsAutoOpenedForRef.current = null
    setPointByPointMode(false)
    setTacticsModalOpen(false)
    setShowFullStats(false)
    setStage('prep')
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
    if (fastForwardSkipRef.current) {
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
    if (pointByPointMode || !result?.events?.length || activeReviewPoint == null || !reviewPointEvents.length) {
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
    pointByPointMode,
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

  // Panel staminy nie musi być klatka-idealny — throttle do ~10x/s zamiast przeliczania
  // (z klonowaniem map + replayem eventów punktu) na każdym ticku RAF (60-144+/s).
  const staminaClipElapsedBucket = Math.round((clipElapsed ?? 0) / 100) * 100

  const playbackStaminaMaps = useMemo(() => {
    if (!reviewPointEvents.length) {
      return session?.stamina ?? result?.stamina ?? null
    }
    if (pointPlaybackComplete || pointByPointMode) {
      return session?.stamina ?? result?.stamina ?? null
    }
    const progress =
      fieldPlaying && actionClip
        ? clipProgress01(staminaClipElapsedBucket, actionClip, playbackSpeed)
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
    pointByPointMode,
    fieldPlaying,
    actionClip,
    staminaClipElapsedBucket,
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
    if (pointPlaybackComplete || pointByPointMode) return reviewPointEvents
    const end = Math.min(reviewPointEvents.length, Math.max(1, playbackStep + 1))
    return reviewPointEvents.slice(0, end)
  }, [reviewPointEvents, pointPlaybackComplete, pointByPointMode, playbackStep])

  const pointStatsComplete =
    pointPlaybackComplete ||
    pointByPointMode ||
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
    !pointByPointMode

  /** Po zdobyciu punktu — od razu otwórz wybór składu/taktyki na kolejny punkt. */
  useEffect(() => {
    if (stage !== 'live') return
    if (!matchLive || !canPlayPoint || !pointPlaybackComplete || fieldPlaying) return
    // W trakcie auto-symulacji gracz nic nie wybiera — okno taktyk by tylko migało.
    if (autoSimProgress) return
    if (tacticsAutoOpenedForRef.current === activeReviewPoint) return
    tacticsAutoOpenedForRef.current = activeReviewPoint
    setTacticsModalOpen(true)
  }, [
    stage,
    matchLive,
    canPlayPoint,
    pointPlaybackComplete,
    fieldPlaying,
    activeReviewPoint,
    autoSimProgress,
  ])

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

  // Team news: potwierdzone siódemki startowe obu drużyn wg roli przy odbiorze/wykonaniu pulla.
  const homeStartRole = session ? pointStartRoleForTeam('home', session.pullTeam) : 'offense'
  const awayStartRole = homeStartRole === 'offense' ? 'defense' : 'offense'
  const homeSideTactics = playerSide === 'home' ? matchTactics : aiTacticsRef.current
  const awaySideTactics = playerSide === 'away' ? matchTactics : aiTacticsRef.current
  const homeStartingIds = homeSideTactics
    ? lineupIdsForPointStart(homeSideTactics, homeStartRole)
    : []
  const awayStartingIds = awaySideTactics
    ? lineupIdsForPointStart(awaySideTactics, awayStartRole)
    : []

  // Szatnia: cały skład drużyny gracza (reakcje wszystkich, nie tylko grającej siódemki).
  const matchdayRoster = playerRosterForValidation()

  const finalHomeScore = result?.homeScore ?? session?.homeScore ?? 0
  const finalAwayScore = result?.awayScore ?? session?.awayScore ?? 0
  const playerFinalScore = playerSide === 'home' ? finalHomeScore : finalAwayScore
  const opponentFinalScore = playerSide === 'home' ? finalAwayScore : finalHomeScore
  const matchOutcome =
    playerFinalScore > opponentFinalScore
      ? 'win'
      : playerFinalScore < opponentFinalScore
        ? 'loss'
        : 'draw'

  return (
    <div className={`space-y-6 ${returnPulse ? 'opacity-0 transition-opacity duration-300' : ''}`}>
      {autoSimProgress && (
        <AutoSimOverlay
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={autoSimProgress.home}
          awayScore={autoSimProgress.away}
          pointsPlayed={autoSimProgress.points}
          stats={matchStats}
          homeSeven={autoSimProgress.homeSeven}
          awaySeven={autoSimProgress.awaySeven}
          scorerId={autoSimProgress.scorerId}
          assistId={autoSimProgress.assistId}
          onStop={stopAutoSim}
          labels={autoSimLabels}
        />
      )}
      {isLeagueMatch && (
        <div className="rounded-lg border border-ufa-gold/40 bg-ufa-panel/80 px-4 py-2 text-sm text-ufa-muted">
          {t.leagueMatch} ·  {leagueFixture.round} ·{' '}
          <span className="text-ufa-text">{homeTeam.name}</span> vs{' '}
          <span className="text-ufa-text">{awayTeam.name}</span>
        </div>
      )}

      {stage === 'prep' && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ufa-text">
                {isLeagueMatch ? t.leagueMatch : t.simMatch}
              </h2>
              <p className="mt-1 text-sm text-ufa-muted">
                {t.matchupSubtitle(
                  homeTeam.name,
                  homeTeam.players.length,
                  awayTeam.name,
                  awayTeam.players.length,
                  MATCH_CONFIG.pointsToWin,
                )}{' '}
                · O: {oAttackLabel}/{oDefenseLabel} · D: {dAttackLabel}/{dDefenseLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-ufa-muted">
                {t.seedOptional}
                <input
                  type="text"
                  inputMode="numeric"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder={t.seedRandomPlaceholder}
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

          {session && (
            <div className="mt-6">
              <LineupSelector
                session={session}
                playerTeam={playerTeamObj}
                playerSide={playerSide}
                pullTeam={session.pullTeam}
                tactics={matchTactics}
                onTacticsChange={handleMatchTacticsChange}
                staminaMap={playerStaminaMap}
                onPlayPoint={canPlayPoint ? handleContinueToTeamNews : null}
                onEnterPointByPoint={null}
                lineupError={lineupSubmitError}
                playDisabled={!lineupCheck.ok}
                playLabel={t.goToMatch}
                onSimulateToEnd={null}
                editDefaultLines
                leaguePlayerStats={leaguePlayerStats}
              />
            </div>
          )}
        </div>
      )}

      {stage === 'teamNews' && (
        <TeamNewsView
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeStartingIds={homeStartingIds}
          awayStartingIds={awayStartingIds}
          onContinue={() => setStage('dressingRoomPre')}
        />
      )}

      {stage === 'dressingRoomPre' && (
        <DressingRoomView mode="pre" roster={matchdayRoster} onContinue={handleKickoff} />
      )}

      {stage === 'live' && (
        <div className="space-y-4 league-fade-in">
          <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ufa-text">
                {homeTeam.name}
                <span className="mx-2 tabular-nums text-ufa-accent">
                  {displayedScore.home}–{displayedScore.away}
                </span>
                {awayTeam.name}
              </h2>
              <button
                type="button"
                onClick={() => setShowFullStats((v) => !v)}
                className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
              >
                {showFullStats ? t.hideFullStats : t.fullStats}
              </button>
            </div>
            {showFullStats && (
              <div className="mt-4">
                <MatchDashboard
                  matchStats={matchStats}
                  homeName={homeTeam.name}
                  awayName={awayTeam.name}
                  homeScore={displayedScore.home}
                  awayScore={displayedScore.away}
                  matchEvents={result?.events ?? session?.events ?? null}
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 sm:p-6 shadow-xl shadow-black/30">
            {pointByPointMode ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canPlayPoint || !lineupCheck.ok}
                    onClick={handleSimulateNextPoint}
                    className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
                  >
                    {t.simNextPoint}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTacticsModalOpen(true)}
                    className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
                  >
                    {t.tacticsAndSubs}
                  </button>
                  <button
                    type="button"
                    onClick={handleExitPointByPoint}
                    className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-muted hover:bg-ufa-panel-hover"
                  >
                    {t.exitPointByPoint}
                  </button>
                </div>
                {lineupSubmitError ? (
                  <p className="mt-3 text-sm text-red-400">{lineupSubmitError}</p>
                ) : null}
              </div>
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
                  {showLineupPanel && (
                    <button
                      type="button"
                      onClick={() => setTacticsModalOpen(true)}
                      className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
                    >
                      {t.tacticsAndSubs}
                    </button>
                  )}
                </div>
                <FieldView2D
                  className="field-view-2d--fullscreen mt-3"
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

          {session && session.lastPoint && (
            <p className="text-center text-sm text-ufa-muted">
              {t.pointN(session.lastPoint.pointIndex)}{' '}
              <span className="text-ufa-text font-medium">
                {session.lastPoint.scoringTeam === 'home' ? homeTeam.name : awayTeam.name}
              </span>{' '}
              · {t.throwsN(session.lastPoint.throws)} ·{' '}
              <span className="text-ufa-accent">{t.historyBelow}</span>
            </p>
          )}

          {showFullStats && reviewPointEvents.length > 0 && (
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

          {showFullStats && result && (
            <BoxScoreTable
              variant="full"
              rows={result.boxScore}
              homeTeamName={homeTeam.name}
              awayTeamName={awayTeam.name}
            />
          )}
        </div>
      )}

      {stage === 'postMatch' && (
        <div className="space-y-4 league-fade-in">
          <MatchDashboard
            matchStats={matchStats}
            homeName={homeTeam.name}
            awayName={awayTeam.name}
            homeScore={displayedScore.home}
            awayScore={displayedScore.away}
            matchEvents={result?.events ?? session?.events ?? null}
          />

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setStage('dressingRoomPost')}
              className="rounded-md bg-ufa-accent px-6 py-2.5 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
            >
              {t.postMatchContinue}
            </button>
            <p className="text-center text-sm text-ufa-gold font-medium">
              {isLeagueMatch ? t.resultSaved : t.matchOver}
            </p>
          </div>

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

          {result && (
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
        </div>
      )}

      {stage === 'dressingRoomPost' && (
        <DressingRoomView
          mode="post"
          roster={matchdayRoster}
          outcome={matchOutcome}
          onContinue={isLeagueMatch ? () => setStage('roundResults') : resetMatch}
        />
      )}

      {stage === 'roundResults' && (
        <RoundResultsView
          league={league}
          fixture={leagueFixture}
          playerTeamId={playerTeamId}
          onContinue={handleReturnToLeague}
        />
      )}

      <TacticsOverlay open={tacticsModalOpen} onClose={() => setTacticsModalOpen(false)}>
        {session && (
          <LineupSelector
            session={session}
            playerTeam={playerTeamObj}
            playerSide={playerSide}
            pullTeam={session.pullTeam}
            tactics={matchTactics}
            onTacticsChange={handleMatchTacticsChange}
            staminaMap={playerStaminaMap}
            onPlayPoint={
              canPlayPoint
                ? () => {
                    ;(pointByPointMode ? handleSimulateNextPoint : handlePlayNextPoint)()
                    setTacticsModalOpen(false)
                  }
                : null
            }
            onEnterPointByPoint={
              !pointByPointMode && canPlayPoint
                ? () => {
                    handleEnterPointByPoint()
                    setTacticsModalOpen(false)
                  }
                : null
            }
            lineupError={lineupSubmitError}
            playDisabled={!lineupCheck.ok}
            playLabel={t.playPoint(session.pointIndex)}
            onSimulateToEnd={
              canPlayPoint
                ? () => {
                    handleSimulateToEnd()
                    setTacticsModalOpen(false)
                  }
                : null
            }
            editDefaultLines={false}
            leaguePlayerStats={leaguePlayerStats}
          />
        )}
      </TacticsOverlay>

      {/* tick forces re-render when session mutates */}
      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </div>
  )
}
