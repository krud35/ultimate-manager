import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createCareer, persistCareer } from '../src/career/careerModel.js'
import { prepareCareerEdition } from '../src/career/gameplayEdition.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'
import { compactStreamlinedTactics } from '../src/career/streamlinedTactics.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { coachDirectivesForLine } from '../src/matchEngine/coachDirectives.js'
import { instructionsForPlayer } from '../src/matchEngine/playerInstructions.js'
import { clubBudgetAllocation, canAffordContract, clubCash } from '../src/career/clubEconomy.js'
import { clubTrackQuote, upgradeClubTrack, completeClubTrack } from '../src/career/streamlinedClub.js'
import { ensureClubStaff, staffPayroll, processStaffContracts } from '../src/career/clubStaff.js'
import { signPlayerContract, ensurePlayerContract, processSeasonEndContractObligations } from '../src/career/transfers/playerContracts.js'
import { recruitmentCandidates, startRecruitment, processRecruitmentMandates, wageWithinLimit } from '../src/career/streamlinedRecruitment.js'
import { promisePlayingTime, processStreamlinedStories, academyMilestone } from '../src/career/streamlinedStories.js'
import { pickRandomEventMessage, applyRandomEventChoice, currentRandomEventChoices } from '../src/career/randomEvents.js'
import { requiresCareerDecision } from '../src/career/streamlinedDecisions.js'
import { managerJobOffers, leaveManagerJob } from '../src/career/managerCareer.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { evaluatePlayerContractOffer } from '../src/career/transfers/playerNegotiation.js'
globalThis.localStorage = { data: {}, getItem(k) { return this.data[k] ?? null }, setItem(k, v) { this.data[k] = v }, removeItem(k) { delete this.data[k] } }
const checks = [], test = (name, fn) => { fn(); checks.push(name); console.log(`PASS ${name}`) }
const meta = [...DOMESTIC_LEAGUES].sort((a, b) => a.teams.length - b.teams.length)[0]
const c = createCareer(0, { managerName: 'Rebuild QA', competition: 'domestic', seasonYear: 2025, playerTeamId: meta.teams[0].id, gameplayEdition: 'streamlined', worldConfig: { leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, l.id === meta.id ? 'playable' : 'off'])), international: { nationals: false, europe: false, paucc: false, aoucc: false, wucc: false } } })
const team = c.world.teamsById[c.playerTeamId], date = c.league.currentDate
test('v1 migration is additive and economics wait for the next season', () => {
  const old = { gameplayEdition: 'streamlined', editionVersion: 1, seasonYear: 2025, homeTactics: { oLineCoachDirectives: { huckAppetite: 1 } }, world: { teamsById: { x: { players: [], facilities: { academy: 9 }, facilityProject: { paid: true } } } }, playerTeamId: 'x', league: { currentDate: date } }
  prepareCareerEdition(old)
  assert.equal(old.homeTactics.streamlinedPlan.offense.direction, 1)
  assert.equal(old.world.teamsById.x.facilities.academy, 9)
  assert.deepEqual(old.world.teamsById.x.facilityProject, { paid: true })
  assert(!old.world.teamsById.x.streamlinedClub.economyActive)
  const snapshot = JSON.stringify(old); prepareCareerEdition(old); assert.equal(JSON.stringify(old), snapshot)
  old.seasonYear++; prepareCareerEdition(old); assert(old.world.teamsById.x.streamlinedClub.economyActive)
  const classic = { gameplayEdition: 'classic', homeTactics: { coachDirectives: { huckAppetite: .2 } } }
  const before = JSON.stringify(classic); prepareCareerEdition(classic); assert.equal(JSON.stringify(classic), before)
})
test('four-axis plans compile for both lines; exceptions override and obsolete controls leave saves', () => {
  const t = compactStreamlinedTactics({ ...c.homeTactics, streamlinedPlan: { offense: { tempo: 1, risk: 1, direction: 1, pressure: 1 }, defense: { tempo: -1, risk: -1, direction: -1, pressure: -1 }, exceptions: { 7: 'no_hucks' } } })
  assert.equal(coachDirectivesForLine(t, 'offense').possessionTempo, 1)
  assert.equal(coachDirectivesForLine(t, 'defense').possessionTempo, -1)
  assert.deepEqual(instructionsForPlayer(t, 7, 'offense'), ['no_hucks'])
  assert.deepEqual(instructionsForPlayer(t, '7', 'defense'), ['no_hucks'])
  assert.equal(normalizeTactics(t).oLineCoachDirectives.huckAppetite, .85)
  const defensive = normalizeTactics({ ...t, _pointStartRole: 'defense', lineupWhenOffenseStartPlayerIds: [1, 2, 3, 4, 5, 6, 7], lineupWhenDefenseStartPlayerIds: [7, 6, 5, 4, 3, 2, 1], dLineAttackStyle: 'vertical_stack' })
  assert.equal(defensive.playerSubRoles[7], 'primary_handler')
  assert.equal(defensive.playerSubRoles[6], 'reset_handler')
  assert.notEqual(defensive.playerSubRoles[7], defensive.playerSubRoles[1])
  const saved = persistCareer(c, { homeTactics: normalizeTactics(t) })
  for (const key of ['coachDirectives', 'oLineCoachDirectives', 'playerSubRoles', 'playerInstructions']) assert(!Object.hasOwn(saved.homeTactics, key))
  assert.deepEqual(compactStreamlinedTactics(null).streamlinedPlan.exceptions, {})
})
test('automatic reserve reconciles cash and blocks unfunded wages for human and AI teams', () => {
  for (const club of Object.values(c.world.teamsById).filter(t => t.simulationMode !== 'off').slice(0, 2)) {
    const a = clubBudgetAllocation(club)
    assert(club.streamlinedClub.economyActive)
    assert.equal(a.cash, a.automaticReserve + a.transferBudget)
    assert(!canAffordContract(club, null, 1e12).ok)
    assert(!canAffordContract(club, null, NaN).ok)
    assert.equal(canAffordContract(club, null, 0).ok, a.transferBudget >= 0)
  }
})
test('three facility tracks retain stronger assets, charge once and preserve paid construction', () => {
  const t = structuredClone(team); t.finances.cash = 100_000_000; t.facilities.trainingCenter = 9; t.facilities.medicalCenter = 2; t.facilities.chillRoom = 3
  const q = clubTrackQuote(t, 'preparation'); assert.equal(q.targets.trainingCenter, 9); assert(q.cost > 0); assert(q.upkeepDelta > 0)
  const cash = clubCash(t); assert(upgradeClubTrack(t, 'preparation', date).ok); assert.equal(clubCash(t), cash - q.cost)
  assert(!upgradeClubTrack(t, 'recruitment', date).ok)
  assert.equal(completeClubTrack(t, date), null)
  const end = t.streamlinedClub.project.completesOn; assert(completeClubTrack(t, end)); assert.equal(t.facilities.trainingCenter, 9); assert.equal(t.facilities.medicalCenter, 4)
  assert.equal(completeClubTrack(t, end), null); assert.equal(clubCash(t), cash - q.cost)
  t.facilityProject = { completesOn: '2099-01-01' }; assert(!upgradeClubTrack(t, 'recruitment', date).ok)
})
test('staff renewal requires an approved cap and preserves secondary contracts until expiry', () => {
  const t = structuredClone(team); t.finances.cash = 100_000_000
  const members = ensureClubStaff(t); members.physio.expiresOn = '2025-09-20'; members.youthCoach.expiresOn = '2025-09-20'
  t.streamlinedClub.staffRenewalCap = null; processStaffContracts(t, '2025-09-01'); assert.equal(members.physio.expiresOn, '2025-09-20')
  t.streamlinedClub.staffRenewalCap = staffPayroll(t) - 1; processStaffContracts(t, '2025-09-01'); assert.equal(members.physio.expiresOn, '2025-09-20')
  t.streamlinedClub.staffRenewalCap = staffPayroll(t); processStaffContracts(t, '2025-09-01'); assert.equal(members.physio.expiresOn, '2026-09-20'); assert.equal(members.youthCoach.expiresOn, '2025-09-20')
})
test('squad roles survive normalization and promises use real available matches exactly once', () => {
  const t = structuredClone(team); t.finances.cash = 100_000_000; const p = t.players[0]
  assert(signPlayerContract(t, p, { weeklyWage: 500, years: 2, squadRole: 'starter', signedDate: date }).ok)
  ensurePlayerContract(p); assert.equal(p.contract.squadRole, 'starter')
  p.recentPlayingTime = Array.from({ length: 6 }, (_, i) => ({ teamId: t.id, available: false, date: `2025-09-${String(i + 1).padStart(2, '0')}`, share: 0 }))
  const career = { ...c, world: { teamsById: { [t.id]: t } } }, morale = p.morale
  processStreamlinedStories(career, '2025-09-07'); assert.equal(p.morale, morale)
  p.recentPlayingTime.forEach(r => { r.available = true; r.share = .1 })
  processStreamlinedStories(career, '2025-09-08'); assert.equal(p.morale, morale - 3)
  processStreamlinedStories(career, '2025-09-08'); assert.equal(p.morale, morale - 3)
  assert.equal(p.playingTimeHistory.length, 1)
  assert(!processStreamlinedStories(career, '2025-09-07').some(m => m.payload.kind === 'weekly_bulletin'))
})
test('shortlist stays within approved budget and delegation stops at unapproved counters', () => {
  for (const limit of [49, 50, 99, 499, 549, 1999, 2049, 9999, 10499]) assert(wageWithinLimit(limit) <= limit)
  assert.equal(wageWithinLimit(10499), 10000)
  const clone = structuredClone(c), t = clone.world.teamsById[clone.playerTeamId]; t.finances.cash = 100_000_000
  const rows = recruitmentCandidates(clone, { maxFee: 20_000_000, maxWage: 100_000, years: 2 })
  assert(rows.length > 0 && rows.length <= 5)
  const row = rows.find(r => !r.freeAgent) ?? rows[0]
  const result = startRecruitment(clone, row, { maxFee: 20_000_000, maxWage: 100_000, years: 2, role: 'starter', delegated: true }); assert(result.ok, result.error)
  const playerId = Object.values(clone.world.teamsById).find(x => x.id !== t.id && x.simulationMode !== 'off').players[0].id
  const msg = { id: 'mandate', type: 'transfer_offer', payload: { kind: 'outgoing_club_offer', status: 'counter', playerId, counterAmount: 200, mandate: { active: true, maxFee: 100, maxWage: 1000, years: 2, role: 'rotation' } } }
  clone.inbox = [msg]; const stopped = processRecruitmentMandates(clone)
  assert(stopped.inbox[0].payload.delegationPaused); assert(requiresCareerDecision(stopped.inbox[0])); assert.equal(stopped.inbox[0].payload.counterAmount, 200)
  const seller = Object.values(clone.world.teamsById).find(x => x.players.some(p => p.id === playerId))
  clone.inbox = [{ ...msg, payload: { ...msg.payload, sellerTeamId: seller.id, status: 'club_agreed', agreedFee: 100, playerDemands: { minWeeklyWage: 1000 }, mandate: { active: true, maxFee: 100, maxWage: 100_000, years: 2, role: 'starter' } } }]
  const continued = processRecruitmentMandates(clone), contract = continued.inbox.find(m => m.payload.kind === 'outgoing_player_contract')
  assert(contract); assert.equal(contract.payload.squadRole, 'starter'); assert.equal(contract.payload.weeklyWage, 100_000); assert(!requiresCareerDecision(continued.inbox.find(m => m.id === 'mandate')))
})
test('a larger promised role improves the same wage offer but creates a real playing-time obligation', () => {
  const input = { player: team.players[0], sellerTeam: team, buyerTeam: team, league: c.league, weeklyWage: team.players[0].contract.weeklyWage, years: 2, seed: 73, renew: true }
  const reserve = evaluatePlayerContractOffer({ ...input, squadRole: 'reserve' }), starter = evaluatePlayerContractOffer({ ...input, squadRole: 'starter' })
  assert(starter.chance >= reserve.chance)
  const p = { id: 1 }; promisePlayingTime(p, { role: 'starter', date }); assert.equal(p.playingTimePromise.target, .5)
})
test('legacy bonus obligations deduct cash once and expire on their original end date', () => {
  const t = structuredClone(team), p = t.players[0]; t.players = [p]; t.finances.cash = 100_000_000
  p.contract.bonuses = [{ type: 'goals_season', amount: 1000, target: 1, expiresOn: '2026-07-31' }]
  const opts = { seasonYear: 2025, playerStats: { [p.id]: { goals: 10 } } }, w = { teamsById: { [t.id]: t } }, before = clubCash(t)
  processSeasonEndContractObligations(w, opts); assert.equal(clubCash(t), before - 1000)
  processSeasonEndContractObligations(w, opts); assert.equal(clubCash(t), before - 1000)
  processSeasonEndContractObligations(w, { ...opts, seasonYear: 2026 }); assert.equal(clubCash(t), before - 1000)
})
test('playing-time events record a real promise without a free morale reward', () => {
  const cloned = structuredClone(c), p = cloned.world.teamsById[cloned.playerTeamId].players[0]
  const before = p.morale, context = { playerId: p.id, playerName: 'QA', streamlinedRole: true }
  cloned.inbox = [{ id: 'role-event', type: 'random_event', payload: { kind: 'decision', status: 'pending', templateId: 'playing_time_request', context } }]
  const r = applyRandomEventChoice(cloned, 'role-event', 'promise'); assert(r.ok)
  const updated = r.world.teamsById[cloned.playerTeamId].players[0]
  assert.equal(updated.morale, before); assert.equal(updated.playingTimePromise.target, .25)
  assert(!currentRandomEventChoices('playing_time_request', context)[0].hint.includes('+6'))
  const suppressed = { ...cloned, pendingEventFollowUps: [{}, {}, {}] }
  assert.equal(pickRandomEventMessage(suppressed, { rng: () => 0 }), null)
  assert.equal(academyMilestone({ recentPlayingTime: [{ teamId: team.id, available: true, share: .1 }] }, team.id)[1], 'Debut completed')
})
test('unemployment retains a rebuilding route after two weeks', () => {
  const left = leaveManagerJob(c, { dismissed: true }).career
  left.managerCareer.reputation = 5; left.managerCareer.history.at(-1).to = '2025-08-01'; left.league.currentDate = '2025-09-01'
  const offers = managerJobOffers(left); assert(offers.some(o => o.recovery && o.required === 5))
})
test('opposite plans produce different behavior in the same seeded full match engine', () => {
  const run = axis => {
    Math.random = createRng(902).float
    const plan = compactStreamlinedTactics({ streamlinedPlan: { offense: { tempo: axis, risk: axis, direction: axis, pressure: axis }, defense: { tempo: axis, risk: axis, direction: axis, pressure: axis } } })
    const session = initMatchSession({ homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam), homeTactics: plan, seed: 901, collectFrames: false })
    for (let i = 0; i < 2; i++) playNextPoint(session, {}, { aiHome: false, aiAway: true, rotateHome: true, rotateAway: true, collectFrames: false })
    return session.events.map(e => [e.type, e.throwType, e.outcome, e.throwerId, e.receiverId])
  }
  const slow = run(-1), fast = run(1); assert.notDeepEqual(slow, fast); assert(slow.length && fast.length)
})
writeFileSync('artifacts/career-edition-baseline/rebuild-checks.json', JSON.stringify({ passed: checks.length, checks }, null, 2))
console.log(`${checks.length} rebuild checks passed`)
