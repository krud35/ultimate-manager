/**
 * Zarządzanie sezonem ligowym — terminarz, tabela, symulacja meczów tła.
 */

import { simulateBackgroundMatch } from './backgroundSimulator.js'
import { flattenWeekSchedule, generateRoundRobinSchedule } from './scheduleGenerator.js'
import { initStandings, updateStandings } from './standings.js'

const STATUS_SCHEDULED = 'SCHEDULED'
const STATUS_COMPLETED = 'COMPLETED'

/**
 * @param {object} [options]
 * @returns {object}
 */
export function createSeasonState(options = {}) {
  const teamIds = options.teamIds ?? []
  const scheduleWeeks = generateRoundRobinSchedule(teamIds)

  return {
    teamIds,
    playerTeamId: options.playerTeamId ?? null,
    teamsById: options.teamsById ?? {},
    currentWeek: options.currentWeek ?? 1,
    totalWeeks: scheduleWeeks.length,
    scheduleWeeks,
    matches: flattenWeekSchedule(scheduleWeeks),
    standings: initStandings(teamIds),
    simSeedBase: options.simSeedBase ?? 20250805,
    status: 'active',
  }
}

function weekBlock(seasonState, week = seasonState.currentWeek) {
  return seasonState.scheduleWeeks.find((w) => w.week === week) ?? null
}

function isPlayerMatch(seasonState, match) {
  const pid = seasonState.playerTeamId
  if (!pid) return false
  return match.homeTeamId === pid || match.awayTeamId === pid
}

function teamForSimulation(seasonState, teamId) {
  let team = seasonState.teamsById[teamId]
  if (!team) {
    team = { id: teamId, teamId, players: [] }
    seasonState.teamsById[teamId] = team
    return team
  }
  if (!team.id) team.id = teamId
  return team
}

/** Zapisuje zmutowany skład z powrotem do stanu sezonu (ta sama referencja graczy). */
function persistTeamsAfterBackgroundSim(seasonState, homeTeamId, awayTeamId, homeTeam, awayTeam) {
  seasonState.teamsById[homeTeamId] = {
    ...seasonState.teamsById[homeTeamId],
    ...homeTeam,
    id: homeTeam.id ?? homeTeamId,
    players: homeTeam.players ?? seasonState.teamsById[homeTeamId]?.players ?? [],
  }
  seasonState.teamsById[awayTeamId] = {
    ...seasonState.teamsById[awayTeamId],
    ...awayTeam,
    id: awayTeam.id ?? awayTeamId,
    players: awayTeam.players ?? seasonState.teamsById[awayTeamId]?.players ?? [],
  }
}

function matchSimSeed(seasonState, matchId) {
  let h = seasonState.simSeedBase >>> 0
  for (let i = 0; i < matchId.length; i += 1) {
    h = (Math.imul(h, 31) + matchId.charCodeAt(i)) >>> 0
  }
  return h
}

function applySimResultToMatch(match, result) {
  match.status = STATUS_COMPLETED
  match.homeScore = result.homeScore
  match.awayScore = result.awayScore
  match.winnerTeamId = result.winnerTeamId
}

/**
 * Symuluje mecze AI bieżącego tygodnia, aktualizuje tabelę, przesuwa tydzień.
 * @param {object} seasonState
 * @returns {object}
 */
export function advanceToNextWeek(seasonState) {
  if (seasonState.status !== 'active') return seasonState

  const block = weekBlock(seasonState, seasonState.currentWeek)
  if (!block) {
    seasonState.status = 'complete'
    return seasonState
  }

  for (const match of block.matches) {
    if (match.status !== STATUS_SCHEDULED) continue
    if (isPlayerMatch(seasonState, match)) continue

    const homeTeam = teamForSimulation(seasonState, match.homeTeamId)
    const awayTeam = teamForSimulation(seasonState, match.awayTeamId)
    const result = simulateBackgroundMatch(homeTeam, awayTeam, {
      seed: matchSimSeed(seasonState, match.id),
    })

    persistTeamsAfterBackgroundSim(
      seasonState,
      match.homeTeamId,
      match.awayTeamId,
      result.homeTeam,
      result.awayTeam,
    )

    applySimResultToMatch(match, result)
    updateStandings(seasonState.standings, {
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    })
  }

  if (seasonState.currentWeek >= seasonState.totalWeeks) {
    seasonState.status = 'complete'
  } else {
    seasonState.currentWeek += 1
  }

  return seasonState
}

export { generateRoundRobinSchedule, initStandings, updateStandings, simulateBackgroundMatch }
