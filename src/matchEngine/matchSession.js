import { MATCH_CONFIG } from './config.js'
import { boxScoreRows, createBoxScore } from './boxScore.js'
import { createEvent, EVENT, resetEventIds } from './events.js'
import { createRng } from './rng.js'
import { simulatePoint } from './point.js'
import { attachTacticsToTeam } from './tacticsModifiers.js'
import {
  applyFatigueAfterPoint,
  autoRotateTacticsForTeam,
} from './rotation.js'
import { resolveAiTeamIdentity, tacticsForTeam } from './aiLineup.js'
import {
  analyzePointForSide,
  adaptAiTacticsBetweenPoints,
  createAiAdaptState,
  promoteAiAdaptObservation,
  updateAiAdaptObservation,
} from './aiTacticsAdapt.js'
import {
  applyStaminaToTeamPlayers,
  cloneStaminaMaps,
  createStaminaMap,
  getStamina,
  resetSprintMeters,
} from './stamina.js'
import { createMatchStats } from './matchStats.js'
import { generateWind, normalizeWind, driftWind } from './wind.js'
import { ensurePlayerStats, resetPlayersMatchStats } from '../models/playerStats.js'
import {
  applyMoraleForMatchTeams,
  ensurePlayerMorale,
} from '../models/playerMorale.js'
import {
  applyFormForMatchTeams,
  ensurePlayerForm,
} from '../models/playerForm.js'
import { applyLoyaltyForMatchTeams } from '../models/playerLoyalty.js'
import { ensurePlayerTraits } from '../models/playerTraits.js'
import {
  ensurePlayerInjury,
  tryMatchPointInjury,
  injuryLabelEn,
} from '../models/playerInjury.js'
import { medicalInjuryChanceMult, ensureTeamFacilities } from '../career/clubFacilities.js'
import { lineupForPoint } from './participants.js'
import { stripInjuredPlayersFromTactics } from './lineManager.js'
import { getPlayerFullName } from '../data/mockPlayers.js'

function prepareTeams(homeTeam, awayTeam, homeTactics, awayTactics) {
  const home = attachTacticsToTeam(
    homeTeam,
    homeTactics ?? tacticsForTeam(homeTeam),
  )
  const away = attachTacticsToTeam(
    awayTeam,
    awayTactics ?? tacticsForTeam(awayTeam),
  )
  return { home, away }
}

function rosterForStats(home, away) {
  return [
    ...home.players.map((p) => ({ ...p, teamId: 'home' })),
    ...away.players.map((p) => ({ ...p, teamId: 'away' })),
  ]
}

function isMatchFinished(homeScore, awayScore) {
  return (
    homeScore >= MATCH_CONFIG.pointsToWin ||
    awayScore >= MATCH_CONFIG.pointsToWin
  )
}

function finalizeMatch(session) {
  const { home, away, homeScore, awayScore } = session
  const winner =
    homeScore >= MATCH_CONFIG.pointsToWin
      ? 'home'
      : awayScore >= MATCH_CONFIG.pointsToWin
        ? 'away'
        : null

  session.events.push(
    createEvent(EVENT.MATCH_END, {
      homeScore,
      awayScore,
      winner,
      winnerName: winner === 'home' ? home.name : away.name,
    }),
  )
  session.status = 'finished'
  session.winner = winner
  applyMoraleForMatchTeams(
    home,
    away,
    homeScore,
    awayScore,
    session.boxScore,
  )
  applyFormForMatchTeams(home, away, session.boxScore, homeScore, awayScore)
  applyLoyaltyForMatchTeams(home, away, homeScore, awayScore, session.boxScore)
  return session
}

function resolveAiFlags(options) {
  const rotateAway = options.rotateAway ?? true
  const rotateHome = options.rotateHome ?? false
  return {
    rotateAway,
    rotateHome,
    aiHome: options.aiHome ?? rotateHome,
    aiAway: options.aiAway ?? rotateAway,
  }
}

function adaptAiSideBeforePoint(session, side) {
  const other = side === 'home' ? 'away' : 'home'
  session.aiAdaptState[side] = promoteAiAdaptObservation(session.aiAdaptState[side])

  const analysis = session.lastPoint
    ? analyzePointForSide(session.lastPoint.events, side, session.boxScore)
    : {}
  if (session.lastPoint) {
    analysis.weScored = session.lastPoint.scoringTeam === side
    analysis.theyScored = session.lastPoint.scoringTeam !== side
    if (analysis.weScored) analysis.offenseFailed = false
  }

  const { tactics, adaptSide } = adaptAiTacticsBetweenPoints({
    team: session[side],
    tactics: session[side].tactics,
    identity: resolveAiTeamIdentity(session[side]),
    adaptSide: session.aiAdaptState[side],
    pointAnalysis: analysis,
    matchStatsSide: session.matchStats?.[side] ?? null,
    side,
    ourScore: side === 'home' ? session.homeScore : session.awayScore,
    theirScore: side === 'home' ? session.awayScore : session.homeScore,
    rng: session.rng,
    isAi: true,
  })
  session[side].tactics = tactics
  session.aiAdaptState[side] = adaptSide
  // unused other kept for clarity of opponent context in adapt (via adaptSide.observed)
  void other
}

function preparePointTeams(session, { homeTactics, awayTactics, rotateAway, rotateHome, aiHome, aiAway }) {
  applySessionTactics(session, { homeTactics, awayTactics })

  if (rotateHome) {
    session.home.tactics = autoRotateTacticsForTeam(
      session.home,
      session.stamina.home,
      session.rng,
    )
  }

  if (rotateAway) {
    session.away.tactics = autoRotateTacticsForTeam(
      session.away,
      session.stamina.away,
      session.rng,
    )
  }

  // Adaptacja stylu / instrukcji / reakcja na przeciwnika — po rotacji składu, przed punktem
  if (session.lastPoint) {
    if (aiHome) adaptAiSideBeforePoint(session, 'home')
    if (aiAway) adaptAiSideBeforePoint(session, 'away')
  }

  applyStaminaToTeamPlayers(session.home, session.stamina.home)
  applyStaminaToTeamPlayers(session.away, session.stamina.away)
}

function recordAiObservationsAfterPoint(session, aiHome, aiAway) {
  if (!session.aiAdaptState) return
  if (aiHome) {
    session.aiAdaptState.home = updateAiAdaptObservation(
      session.aiAdaptState.home,
      session.away.tactics,
    )
  }
  if (aiAway) {
    session.aiAdaptState.away = updateAiAdaptObservation(
      session.aiAdaptState.away,
      session.home.tactics,
    )
  }
}

export function initMatchSession({
  homeTeam,
  awayTeam,
  homeTactics = null,
  awayTactics = null,
  seed = null,
  wind: windOverride = null,
}) {
  resetEventIds()
  const { home, away } = prepareTeams(homeTeam, awayTeam, homeTactics, awayTactics)
  for (const player of home.players) {
    ensurePlayerStats(player)
    ensurePlayerMorale(player)
    ensurePlayerForm(player)
    ensurePlayerTraits(player)
    ensurePlayerInjury(player)
  }
  for (const player of away.players) {
    ensurePlayerStats(player)
    ensurePlayerMorale(player)
    ensurePlayerForm(player)
    ensurePlayerTraits(player)
    ensurePlayerInjury(player)
  }
  resetPlayersMatchStats(home.players)
  resetPlayersMatchStats(away.players)
  home.tactics = stripInjuredPlayersFromTactics(home.tactics, home.players)
  away.tactics = stripInjuredPlayersFromTactics(away.tactics, away.players)
  const boxScore = createBoxScore(rosterForStats(home, away))
  const events = [
    createEvent(EVENT.MATCH_START, {
      homeTeam: home.name,
      awayTeam: away.name,
      pointsToWin: MATCH_CONFIG.pointsToWin,
      homeAttackStyle: home.tactics.oLineAttackStyle ?? home.tactics.attackStyle,
      homeDefenseStyle: home.tactics.oLineDefenseStyle ?? home.tactics.defenseStyle,
      homeDLineAttackStyle: home.tactics.dLineAttackStyle,
      homeDLineDefenseStyle: home.tactics.dLineDefenseStyle,
    }),
  ]

  const rng = createRng(seed)
  const wind = normalizeWind(windOverride ?? generateWind(rng))

  return {
    rng,
    home,
    away,
    wind,
    matchStats: createMatchStats(),
    homeScore: 0,
    awayScore: 0,
    pointIndex: 1,
    pullTeam: MATCH_CONFIG.firstPointPullTeam,
    events,
    boxScore,
    stamina: {
      home: createStaminaMap(home.players),
      away: createStaminaMap(away.players),
      sprintM: { home: {}, away: {} },
    },
    aiAdaptState: createAiAdaptState(),
    status: 'break',
    lastPoint: null,
    winner: null,
  }
}

export function applySessionTactics(session, { homeTactics, awayTactics } = {}) {
  if (homeTactics) session.home.tactics = homeTactics
  if (awayTactics) session.away.tactics = awayTactics
  return session
}

export function playNextPoint(session, tacticsUpdate = {}, options = {}) {
  if (session.status === 'finished') return session

  const { rotateAway, rotateHome, aiHome, aiAway } = resolveAiFlags(options)
  const pullBefore = session.pullTeam

  preparePointTeams(session, {
    homeTactics: tacticsUpdate.homeTactics,
    awayTactics: tacticsUpdate.awayTactics,
    rotateAway,
    rotateHome,
    aiHome,
    aiAway,
  })

  const staminaBeforePoint = cloneStaminaMaps(session.stamina)
  resetSprintMeters(session.stamina)

  const pointResult = simulatePoint({
    homeTeam: session.home,
    awayTeam: session.away,
    pullTeam: session.pullTeam,
    pointIndex: session.pointIndex,
    rng: session.rng,
    boxScore: session.boxScore,
    matchStats: session.matchStats,
    stamina: session.stamina,
    wind: session.wind,
  })

  session.events.push(...pointResult.events)

  if (pointResult.scoringTeam === 'home') session.homeScore += 1
  else session.awayScore += 1

  applyFatigueAfterPoint(session, pullBefore, staminaBeforePoint)

  const injuryEvents = rollInjuriesAfterPoint(session, pullBefore)
  if (injuryEvents.length) {
    session.events.push(...injuryEvents)
    pointResult.events.push(...injuryEvents)
    for (const side of ['home', 'away']) {
      session[side].tactics = stripInjuredPlayersFromTactics(
        session[side].tactics,
        session[side].players,
      )
    }
  }

  session.lastPoint = {
    pointIndex: session.pointIndex,
    scoringTeam: pointResult.scoringTeam,
    throws: pointResult.throwCount,
    events: pointResult.events,
  }

  // Opóźnienie 1 punktu: AI zapisuje taktykę przeciwnika; użyje jej dopiero przed kolejnym punktem
  recordAiObservationsAfterPoint(session, aiHome, aiAway)

  // Lekki płynny drift wiatru między punktami
  session.wind = driftWind(session.wind, session.rng)

  session.pullTeam = pointResult.nextPullTeam
  session.pointIndex += 1

  if (isMatchFinished(session.homeScore, session.awayScore)) {
    finalizeMatch(session)
  } else {
    session.status = 'break'
  }

  return session
}

/**
 * Roll kontuzji po punkcie dla graczy na boisku.
 * @returns {object[]} eventy EVENT.INJURY
 */
function rollInjuriesAfterPoint(session, pullTeamBeforePoint) {
  const attackTeamId = pullTeamBeforePoint === 'home' ? 'away' : 'home'
  const events = []
  const rng = () => session.rng.float()

  for (const side of ['home', 'away']) {
    const team = session[side]
    ensureTeamFacilities(team)
    const injuryMult = medicalInjuryChanceMult(team)
    const role = side === attackTeamId ? 'offense' : 'defense'
    const onField = lineupForPoint(team, role)
    const map = session.stamina[side]

    for (const player of onField) {
      if (!player) continue
      ensurePlayerInjury(player)
      const stamina = getStamina(map, player.id)
      const hit = tryMatchPointInjury(player, stamina, rng, { chanceMult: injuryMult })
      if (!hit) continue
      events.push(
        createEvent(EVENT.INJURY, {
          teamId: side,
          teamName: team.name,
          playerId: player.id,
          playerName: getPlayerFullName(player),
          label: hit.label,
          daysRemaining: hit.daysRemaining,
          pointIndex: session.pointIndex,
          labelEn: injuryLabelEn(hit.label),
          narrative: `${getPlayerFullName(player)} doznał kontuzji (${hit.label}) — out ${hit.daysRemaining} dni`,
          narrativeEn: `${getPlayerFullName(player)} suffered an injury (${injuryLabelEn(hit.label)}) — out ${hit.daysRemaining} days`,
        }),
      )
    }
  }
  return events
}

function sessionPlayers(session) {
  return [
    ...session.home.players.map((p) => ({
      ...p,
      teamSide: 'home',
      teamId: session.home.id ?? 'home',
    })),
    ...session.away.players.map((p) => ({
      ...p,
      teamSide: 'away',
      teamId: session.away.id ?? 'away',
    })),
  ]
}

export function sessionToResult(session) {
  return {
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    winner: session.winner,
    pointsPlayed: session.pointIndex - 1,
    events: session.events,
    players: sessionPlayers(session),
    boxScore: boxScoreRows(session.boxScore),
    stamina: session.stamina,
    matchStats: session.matchStats,
    wind: session.wind,
    config: { ...MATCH_CONFIG },
    status: session.status,
    lastPoint: session.lastPoint,
  }
}

export function simulateMatch(options) {
  const rotateHome = options.rotateHome ?? true
  const rotateAway = options.rotateAway ?? true
  const aiHome = options.aiHome ?? rotateHome
  const aiAway = options.aiAway ?? rotateAway
  let session = initMatchSession(options)
  // AI dobiera style + linie na start
  if (rotateHome) {
    session.home.tactics = autoRotateTacticsForTeam(
      { ...session.home, tactics: session.home.tactics },
      session.stamina.home,
      session.rng,
    )
  }
  if (rotateAway) {
    session.away.tactics = autoRotateTacticsForTeam(
      { ...session.away, tactics: session.away.tactics },
      session.stamina.away,
      session.rng,
    )
  }

  while (session.status !== 'finished') {
    session = playNextPoint(
      session,
      {
        homeTactics: session.home.tactics,
        awayTactics: session.away.tactics,
      },
      { rotateHome, rotateAway, aiHome, aiAway },
    )
  }
  return sessionToResult(session)
}

export function runRemainingMatch(session, tacticsUpdate = {}, options = {}) {
  applySessionTactics(session, tacticsUpdate)
  const rotateHome = options.rotateHome ?? true
  const rotateAway = options.rotateAway ?? true
  const aiHome = options.aiHome ?? rotateHome
  const aiAway = options.aiAway ?? rotateAway
  while (session.status !== 'finished') {
    session = playNextPoint(session, {}, { rotateHome, rotateAway, aiHome, aiAway })
  }
  return sessionToResult(session)
}
