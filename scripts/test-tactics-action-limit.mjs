import assert from 'node:assert/strict'
import { MATCH_CONFIG } from '../src/matchEngine/config.js'
import { initMatchSession, playNextPoint, runRemainingMatch, simulateMatch, sessionToResult, applySessionTactics } from '../src/matchEngine/matchSession.js'
import { PointSimulationLimitError } from '../src/matchEngine/simulationFailure.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { getTraitMods } from '../src/models/playerTraits.js'
import { playerMatchMods, setPlayerMods } from '../src/matchEngine/playerModsRegistry.js'
import { leagueRecordFromEngineResult } from '../src/league/leagueEngine.js'

const originalLimit = MATCH_CONFIG.maxThrowsPerPoint
const originalPointsToWin = MATCH_CONFIG.pointsToWin
const options = () => ({
  homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam),
  seed: 400701, collectFrames: false, windLocked: true,
  wind: { speedMph: 0, directionDeg: 0 },
})
const pointOptions = fastMode => ({ fastMode, collectFrames: false,
  rotateHome: false, rotateAway: false, aiHome: false, aiAway: false })
const fixture = { id: 'guard-test', homeTeamId: 'home-club', awayTeamId: 'away-club', status: 'scheduled' }
const fixtureBefore = structuredClone(fixture)
const failingPoint = (session, fastMode) => {
  const registryWitness = { id: 'registry-witness' }
  setPlayerMods(registryWitness, { stalePointMarker: true })
  let failure
  assert.throws(() => playNextPoint(session, {}, pointOptions(fastMode)), error => {
    failure = error
    return error instanceof PointSimulationLimitError
  })
  assert.equal(failure.code, 'POINT_SIMULATION_LIMIT')
  assert.equal(failure.failure.mode, fastMode ? 'fast' : 'full')
  assert.equal(session.status, 'failed')
  assert.equal(session.winner, null)
  assert.equal(session.failure, failure.failure)
  assert.ok(failure.partialEvents.some(event => event.type === 'point_start'))
  assert.ok(!failure.partialEvents.some(event => ['score', 'point_end', 'match_end'].includes(event.type)))
  assert.equal(playerMatchMods(registryWitness).stalePointMarker, undefined, 'clear tactical registry despite diagnostic detachment')
  for (const player of [...session.home.players, ...session.away.players]) {
    assert.deepEqual(playerMatchMods(player), getTraitMods(player), 'failed point must clear tactical player mods')
  }
  return failure
}

try {
  // Exercise real actions, not a fabricated result stub. The production cap is
  // restored in finally and remains unchanged in config.js.
  MATCH_CONFIG.maxThrowsPerPoint = 1
  for (const fastMode of [false, true]) {
    const rng = createRng(400701)
    let randomCalls = 0
    const countedRng = {
      float() { randomCalls++; return rng.float() },
      int(min, max) { randomCalls++; return rng.int(min, max) },
    }
    const inputs = options(), originalTeams = structuredClone([inputs.homeTeam, inputs.awayTeam])
    const originalHomePlayer = inputs.homeTeam.players[0]
    const session = initMatchSession({ ...inputs, rng: countedRng })
    const failure = failingPoint(session, fastMode)
    assert.equal(failure.failure.actionCount, 1)
    assert.equal(failure.failure.limit, 1)
    assert.equal(session.homeScore + session.awayScore, 0)
    assert.equal(session.pointIndex, 1)
    assert.equal(session.lastPoint, null)
    assert.deepEqual([inputs.homeTeam, inputs.awayTeam], originalTeams, 'failure restores caller-owned rosters')
    assert.equal(inputs.homeTeam.players[0], originalHomePlayer, 'restore keeps existing player references')
    assert.notEqual(session.home.players[0], originalHomePlayer, 'failed player diagnostics are detached')
    const result = sessionToResult(session)
    assert.equal(result.diagnosticsOnly, true)
    assert.equal(result.pointsPlayed, 0)
    assert.equal(result.winner, null)
    const checkpoint = JSON.stringify(result), rngCheckpoint = randomCalls
    for (const retry of [
      () => playNextPoint(session, { homeTactics: { altered: true } }, pointOptions(fastMode)),
      () => runRemainingMatch(session, { awayTactics: { altered: true } }, pointOptions(fastMode)),
      () => applySessionTactics(session, { homeTactics: { altered: true } }),
      () => leagueRecordFromEngineResult(fixture, result),
    ]) {
      assert.throws(retry, PointSimulationLimitError)
      assert.equal(JSON.stringify(sessionToResult(session)), checkpoint, 'retry must not mutate failed diagnostics')
      assert.equal(randomCalls, rngCheckpoint, 'retry must not consume more randomness')
    }
    assert.deepEqual(fixture, fixtureBefore, 'failed result never becomes a league record')
  }

  // Whole-match and run-remaining entry points must propagate failure, not loop
  // or return an apparently completed result. Zero actions makes this bounded.
  MATCH_CONFIG.maxThrowsPerPoint = 0
  for (const fastMode of [false, true]) {
    assert.throws(() => simulateMatch({ ...options(), ...pointOptions(fastMode) }), PointSimulationLimitError)
    const session = initMatchSession(options())
    assert.throws(() => runRemainingMatch(session, {}, pointOptions(fastMode)), PointSimulationLimitError)
    assert.equal(session.status, 'failed')
    assert.equal(session.homeScore + session.awayScore, 0)
  }

  // Successful points retain their ordinary lifecycle; a subsequent failure
  // neither awards another goal nor removes a legitimately completed point.
  MATCH_CONFIG.maxThrowsPerPoint = originalLimit
  for (const fastMode of [false, true]) {
    const inputs = options()
    inputs.homeTeam.facilities = { facilitiesGen: 1, medicalCenter: 50 }
    const originalTeams = structuredClone([inputs.homeTeam, inputs.awayTeam])
    const originalFacilities = inputs.homeTeam.facilities
    const originalPlayer = inputs.homeTeam.players[0], originalSkills = originalPlayer.skills
    const session = initMatchSession(inputs)
    playNextPoint(session, {}, pointOptions(fastMode))
    assert.equal(session.status, 'break')
    assert.equal(session.homeScore + session.awayScore, 1)
    assert.equal(session.pointIndex, 2)
    assert.equal(session.events.filter(event => event.type === 'score').length, 1)
    assert.equal(session.events.filter(event => event.type === 'point_end').length, 1)
    assert.notDeepEqual(inputs.homeTeam.facilities, originalTeams[0].facilities, 'fixture exercises facility normalization')
    const scoreBefore = [session.homeScore, session.awayScore], previousPoint = session.lastPoint
    MATCH_CONFIG.maxThrowsPerPoint = 0
    failingPoint(session, fastMode)
    assert.deepEqual([session.homeScore, session.awayScore], scoreBefore)
    assert.equal(session.lastPoint, previousPoint)
    assert.equal(session.pointIndex, 2)
    assert.equal(session.events.filter(event => event.type === 'score').length, 1)
    assert.equal(session.events.filter(event => event.type === 'point_end').length, 1)
    assert.deepEqual([inputs.homeTeam, inputs.awayTeam], originalTeams, 'failure rolls back the whole incomplete match')
    assert.equal(inputs.homeTeam.facilities, originalFacilities)
    assert.equal(inputs.homeTeam.players[0], originalPlayer)
    assert.equal(originalPlayer.skills, originalSkills, 'nested player identities also survive rollback')
    MATCH_CONFIG.maxThrowsPerPoint = originalLimit
  }

  // Bound finalization to one point: this verifies the established successful
  // career side effects without running a full regulation match.
  MATCH_CONFIG.pointsToWin = 1
  for (const fastMode of [false, true]) {
    const inputs = options()
    const originalPlayers = [...inputs.homeTeam.players, ...inputs.awayTeam.players]
    for (const player of originalPlayers) {
      player.workload = { history: [], pending: 0, pendingMatch: 0, recovery: 0, heavyDays: 0 }
      player.matchStamina = 100
      player.developmentFatigue = 0
      player.loyalty = 60
    }
    const session = initMatchSession(inputs)
    const before = structuredClone([...session.home.players, ...session.away.players])
    playNextPoint(session, {}, pointOptions(fastMode))
    assert.equal(session.status, 'finished')
    const players = [...session.home.players, ...session.away.players]
    // applyStaminaToTeamPlayers already shallow-copies player objects between
    // points. Preserve its existing nested aliases, rather than inventing a new
    // contract for primitive fields; those are returned on result.players.
    for (let i = 0; i < players.length; i++) {
      assert.ok(players[i].stats === originalPlayers[i].stats, 'success preserves shared player statistics')
      assert.ok(players[i].workload === originalPlayers[i].workload, 'success preserves existing workload ledger')
    }
    const played = players.filter(player => player.stats.pointsPlayedMatch > 0)
    assert.equal(played.length, 14)
    assert.ok(players.some((player, i) => player.stats.pointsPlayed > before[i].stats.pointsPlayed))
    for (const field of ['currentStamina', 'morale', 'form', 'loyalty', 'matchStamina', 'developmentFatigue']) {
      assert.ok(players.some((player, i) => player[field] !== before[i][field]), `success still updates returned ${field}`)
    }
    assert.ok(played.every(player => player.workload && Number.isFinite(player.workload.pendingMatch)))
    assert.ok(originalPlayers.some(player => player.workload.pendingMatch > 0), 'successful workload still reaches caller')
    const result = sessionToResult(session)
    assert.ok(!result.diagnosticsOnly)
    assert.ok(!result.failure)
    assert.equal(leagueRecordFromEngineResult(fixture, result, true, false).fixtureId, fixture.id)
  }
} finally {
  MATCH_CONFIG.maxThrowsPerPoint = originalLimit
  MATCH_CONFIG.pointsToWin = originalPointsToWin
}
console.log('PASS action limit: full/fast fail without score, terminal retries rejected, mods clear, failed match rolls back original players/facilities, league rejects failure, successful finalization preserves player side effects')
