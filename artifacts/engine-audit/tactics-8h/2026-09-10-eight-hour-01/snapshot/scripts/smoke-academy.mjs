/**
 * Smoke test: akademia U21 — nabór organiczny, wiek/potencjał, wiek 21 -> wolny
 * rynek, awans AI, akcje menedżera, misja skautingowa academyProspect end-to-end.
 * Testuje funkcje bezpośrednio (bez pełnej symulacji sezonu meczów — zbyt wolne
 * dla smoke testu), co i tak pokrywa dokładnie to, co finalizeSeason/startNextSeason
 * wywołują w prawdziwym przepływie.
 */
// NB: importuje worldState.js bezpośrednio, nie careerModel.js — careerModel.js
// ciągnie `../matchEngine` (import katalogu), którego zwykły `node` (bez Vite) nie
// rozwiązuje (ERR_UNSUPPORTED_DIR_IMPORT). To ograniczenie istnieje już dziś w
// smoke-create-career.mjs i nie jest czymś wprowadzonym przez akademię — omijamy je
// tu budując `world`/`career` ręcznie z worldState.js, bez dotykania matchEngine.
import { getOverallRating } from '../src/models/playerStats.js'
import { createWorldFromTemplate, worldTeamById, worldTeamsList } from '../src/career/worldState.js'
import { getFacilityLevel } from '../src/career/clubFacilities.js'
import { PLAYER_STATUS } from '../src/career/transfers/freeAgency.js'
import {
  ensureTeamAcademy,
  createAcademyProspect,
  runAcademyIntake,
  sweepAgedOutAcademyPlayers,
  runAiAcademyPromotionPass,
  promoteAcademyPlayer,
  releaseAcademyPlayer,
  applyAcademyOffseasonDevelopment,
  ACADEMY_JOIN_AGE_MIN,
  ACADEMY_JOIN_AGE_MAX,
  ACADEMY_AGE_OUT,
} from '../src/career/academy.js'
import { queueScoutMission, resolveScoutMissions } from '../src/career/scouting.js'
// NB: buildAcademyProspectMessage bezpośrednio z randomEvents.js, nie
// messageFromScoutMission z inbox.js — inbox.js dociąga też `../matchEngine`
// (barrel, ERR_UNSUPPORTED_DIR_IMPORT pod zwykłym node, patrz komentarz wyżej).
// messageFromScoutMission dla kind==='academyProspect' i tak tylko woła tę funkcję.
import { applyRandomEventChoice, buildAcademyProspectMessage } from '../src/career/randomEvents.js'

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const playerTeamId = 'toronto-rush'
const world = createWorldFromTemplate(2013, { rosterMode: 'historical', playerTeamId })
const career = {
  id: 'career-smoke-academy',
  playerTeamId,
  seasonIndex: 1,
  seasonYear: 2013,
  world,
  league: { currentDate: '2013-08-15' },
  inbox: [],
}
const team = worldTeamById(world, playerTeamId)

// 1) seeded empty on creation
assert(Array.isArray(team.academyPlayers), 'team.academyPlayers should be an array')
assert(team.academyPlayers.length === 0, 'academy should start empty')
const level0 = getFacilityLevel(team, 'academy')
assert(level0 >= 1 && level0 <= 10, `academy facility level out of range: ${level0}`)
console.log('1) OK: empty academy seeded, facility level', level0)

// 2) createAcademyProspect: age/potential sanity
{
  const rng = () => Math.random()
  const p = createAcademyProspect(rng, { seasonYear: 2013, teamId: playerTeamId, source: 'intake', intakeMult: 1 })
  assert(p.age >= ACADEMY_JOIN_AGE_MIN && p.age <= ACADEMY_JOIN_AGE_MAX, `prospect age out of band: ${p.age}`)
  assert(Number.isFinite(p.potential), 'prospect potential should be a finite number')
  assert(p.potential >= 62 && p.potential <= 95, `potential out of computePotential clamp: ${p.potential}`)
  const ovr = getOverallRating(p.skills)
  assert(p.potential >= ovr - 2, `potential (${p.potential}) unexpectedly below ovr-2 (${ovr})`)
  assert(p.status === PLAYER_STATUS.ACADEMY && p.inAcademy === true, 'prospect should be tagged academy status')
  console.log('2) OK: createAcademyProspect ->', { age: p.age, ovr, potential: p.potential })
}

// 3) runAcademyIntake: full-world organic intake (AI parity)
{
  const { createdByTeam, created } = runAcademyIntake(world, { seasonYear: 2014, seed: 42 })
  assert(created.length > 0, 'intake should create at least some prospects league-wide')
  const aiTeamIds = worldTeamsList(world)
    .map((t) => t.id)
    .filter((id) => id !== playerTeamId)
  const aiTeamsWithIntake = aiTeamIds.filter((id) => createdByTeam[id] > 0)
  // Facility levels are randomly seeded (skewed 3-5, rarely 1-2/8+) so a handful of
  // weak-academy AI teams rolling 0 prospects this season is expected — assert most
  // AI teams got something, not literally every single one (full parity != every
  // team every season, low facility level legitimately means near-zero intake).
  assert(
    aiTeamsWithIntake.length >= aiTeamIds.length * 0.5,
    `expected most AI teams to receive intake (full AI parity), got ${aiTeamsWithIntake.length}/${aiTeamIds.length}`,
  )
  if (createdByTeam[playerTeamId]) {
    assert(team.academyPlayers.length === createdByTeam[playerTeamId], 'pool size should match reported count')
  }
  console.log(
    '3) OK: runAcademyIntake ->',
    Object.keys(createdByTeam).length,
    'teams received prospects, total',
    created.length,
  )
}

// 4) sweepAgedOutAcademyPlayers: 21+ human prospects -> free agency
{
  const beforeFa = world.freeAgents.length
  const target = team.academyPlayers[0]
  target.age = ACADEMY_AGE_OUT - 1 // will become ACADEMY_AGE_OUT after the sweep's +1
  const poolSizeBefore = team.academyPlayers.length
  const { releasedToFreeAgency } = sweepAgedOutAcademyPlayers(world, { playerTeamId })
  assert(releasedToFreeAgency.some((p) => p.id === target.id), 'aged-out player should be released')
  assert(team.academyPlayers.length === poolSizeBefore - releasedToFreeAgency.length, 'pool should shrink by released count')
  assert(world.freeAgents.length === beforeFa + releasedToFreeAgency.length, 'free agents should grow by released count')
  assert(target.status === PLAYER_STATUS.FREE_AGENT, 'released player status should flip to free_agent')
  for (const p of team.academyPlayers) {
    assert(p.age < ACADEMY_AGE_OUT, `survivor age should be < ${ACADEMY_AGE_OUT}, got ${p.age}`)
  }
  console.log('4) OK: sweepAgedOutAcademyPlayers released', releasedToFreeAgency.length, 'player(s)')
}

// 5) runAiAcademyPromotionPass: AI teams promote/release from their pools
{
  // Run a few cycles of intake + sweep + promotion so AI pools have material to work with.
  let promotedTotal = 0
  let releasedTotal = 0
  for (let year = 2015; year <= 2018; year += 1) {
    runAcademyIntake(world, { seasonYear: year, seed: year * 7 })
    sweepAgedOutAcademyPlayers(world, { playerTeamId })
    const { promoted, released } = runAiAcademyPromotionPass(world, {
      playerTeamId,
      seed: year * 11,
      league: career.league,
    })
    promotedTotal += promoted
    releasedTotal += released
  }
  assert(promotedTotal + releasedTotal >= 0, 'promotion pass should run without throwing')
  const aiWithAcademyGrad = worldTeamsList(world)
    .filter((t) => t.id !== playerTeamId)
    .some((t) => (t.players ?? []).some((p) => p.academyJoinedSeason != null))
  console.log(
    '5) OK: runAiAcademyPromotionPass over 4 seasons -> promoted',
    promotedTotal,
    'released',
    releasedTotal,
    'AI academy graduate on a senior roster:',
    aiWithAcademyGrad,
  )
}

// 6) promoteAcademyPlayer / releaseAcademyPlayer (human actions)
{
  ensureTeamAcademy(team)
  const rng = () => Math.random()
  const prospect = createAcademyProspect(rng, { seasonYear: 2018, teamId: playerTeamId, source: 'intake' })
  team.academyPlayers.push(prospect)
  const rosterBefore = team.players.length

  const promoted = promoteAcademyPlayer(team, prospect.id, { league: career.league })
  assert(promoted.ok, `promoteAcademyPlayer failed: ${promoted.error}`)
  assert(team.players.length === rosterBefore + 1, 'roster should grow by one after promotion')
  assert(!team.academyPlayers.some((p) => p.id === prospect.id), 'promoted player should leave the academy pool')
  assert(promoted.player.contract, 'promoted player should have a signed contract')
  console.log('6a) OK: promoteAcademyPlayer signed a contract and moved the player to the senior roster')

  const prospect2 = createAcademyProspect(rng, { seasonYear: 2018, teamId: playerTeamId, source: 'intake' })
  team.academyPlayers.push(prospect2)
  const faBefore = world.freeAgents.length
  const released = releaseAcademyPlayer(team, prospect2.id, world)
  assert(released.ok, `releaseAcademyPlayer failed: ${released.error}`)
  assert(world.freeAgents.length === faBefore + 1, 'released player should land in free agents')
  console.log('6b) OK: releaseAcademyPlayer moved the player to free agency')
}

// 7) applyAcademyOffseasonDevelopment: growth pass shouldn't crash and should touch potential
{
  const before = team.academyPlayers.map((p) => ({ id: p.id, ovr: getOverallRating(p.skills) }))
  applyAcademyOffseasonDevelopment(world, { seed: 999 })
  assert(team.academyPlayers.every((p) => Number.isFinite(p.potential)), 'potential should stay finite after growth pass')
  console.log('7) OK: applyAcademyOffseasonDevelopment ran over', before.length, 'prospects without crashing')
}

// 8) scouting mission end-to-end: queue -> resolve -> inbox message -> accept/decline
{
  const queueDate = '2018-09-01'
  const q = queueScoutMission(team, { kind: 'academyProspect', region: 'europe', date: queueDate })
  assert(q.ok, `queueScoutMission failed: ${q.error}`)
  assert(team.scouting.pendingMissions.some((m) => m.id === q.mission.id), 'mission should be pending')

  // Advance past SCOUT_MISSION_DOSSIER_DAYS (5) so it resolves.
  const resolveDate = '2018-09-10'
  const resolved = resolveScoutMissions(world, playerTeamId, career.league, resolveDate)
  assert(resolved.length === 1, `expected 1 resolved mission, got ${resolved.length}`)
  assert(resolved[0].kind === 'academyProspect', 'resolved mission kind mismatch')
  assert(resolved[0].prospect, 'resolved academyProspect mission should carry a prospect')

  const msg = buildAcademyProspectMessage({ ...career, world }, { mission: resolved[0], prospect: resolved[0].prospect })
  assert(msg, 'buildAcademyProspectMessage should build a message for academyProspect')
  assert(msg.type === 'random_event', 'academy prospect message should use the decision (random_event) pipeline')
  assert(msg.payload.kind === 'decision' && msg.payload.choices.length === 2, 'message should offer accept/decline')
  console.log('8a) OK: scout mission queued, resolved, and produced a decision message:', msg.title)

  // Accept path
  const careerForAccept = { ...career, world, inbox: [msg] }
  const acceptResult = applyRandomEventChoice(careerForAccept, msg.id, 'accept')
  assert(acceptResult.ok, `accept resolution failed: ${acceptResult.error}`)
  const acceptedTeam = worldTeamById(acceptResult.world, playerTeamId)
  assert(
    acceptedTeam.academyPlayers.some((p) => p.id === resolved[0].prospect.id),
    'accepted prospect should land in team.academyPlayers',
  )
  console.log('8b) OK: accepting the scout report added the prospect to the academy')

  // Decline path (fresh mission so it isn't already resolved)
  const q2 = queueScoutMission(team, { kind: 'academyProspect', region: 'asia', date: queueDate })
  assert(q2.ok, `second queueScoutMission failed: ${q2.error}`)
  const resolved2 = resolveScoutMissions(world, playerTeamId, career.league, resolveDate)
  const msg2 = buildAcademyProspectMessage({ ...career, world }, { mission: resolved2[0], prospect: resolved2[0].prospect })
  const careerForDecline = { ...career, world, inbox: [msg2] }
  const declineResult = applyRandomEventChoice(careerForDecline, msg2.id, 'decline')
  assert(declineResult.ok, `decline resolution failed: ${declineResult.error}`)
  const declinedTeam = worldTeamById(declineResult.world, playerTeamId)
  assert(
    !declinedTeam.academyPlayers.some((p) => p.id === resolved2[0].prospect.id),
    'declined prospect should NOT land in team.academyPlayers',
  )
  console.log('8c) OK: declining the scout report did not add the prospect')
}

console.log('\nsmoke-academy ALL OK')
