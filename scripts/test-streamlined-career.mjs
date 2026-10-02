import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createCareer, persistCareer } from '../src/career/careerModel.js'
import { prepareCareerEdition, gameplayEdition } from '../src/career/gameplayEdition.js'
import { exportCareerBackup, restoreCareerBackup } from '../src/career/careerBackup.js'
import { careerForStorage, rehydrateCareerWorld } from '../src/career/worldState.js'
import { requiresCareerDecision } from '../src/career/streamlinedDecisions.js'
import { mergeInbox } from '../src/career/inbox.js'
import { processPendingEventFollowUps } from '../src/career/randomEvents.js'
import { advanceCareerDay, simulateCareerUntil } from '../src/career/calendarSimulation.js'
import { resolveTrainingDay, trainingDateAdd } from '../src/career/trainingSchedule.js'
import { setWeekPlan, setDevelopmentProject, syncDevelopmentProjects, readiness } from '../src/career/streamlinedTraining.js'
import { processTeamTrainingsForDate } from '../src/career/teamTraining.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'
import { eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { UFA_LEAGUE_TEAMS } from '../src/data/ufaLeagueTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { buildCoachReport, matchIntervention, pointIsHighlight } from '../src/matchEngine/streamlinedMatch.js'

globalThis.localStorage = { data: {}, getItem(k) { return this.data[k] ?? null }, setItem(k,v) { this.data[k] = v }, removeItem(k) { delete this.data[k] } }
const metrics = {}, passed = []
async function test(name, fn) { const start = performance.now(); await fn(); metrics[name] = Math.round(performance.now() - start); passed.push(name); console.log(`OK ${name} (${metrics[name]} ms)`) }
const meta = [...DOMESTIC_LEAGUES].sort((a,b) => a.teams.length - b.teams.length)[0]
const config = { leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, l.id === meta.id ? 'playable' : 'off'])), international: { nationals: false, europe: false, paucc: false, aoucc: false, wucc: false } }
const options = { competition: 'domestic', managerName: 'Edition QA', playerTeamId: meta.teams[0].id, seasonYear: 2025, worldConfig: config }
let classic, simple
await test('New careers opt in; legacy and classic retain training and data', () => {
  classic = createCareer(0, options)
  simple = createCareer(1, { ...options, gameplayEdition: 'streamlined' })
  const legacy = structuredClone(classic); delete legacy.gameplayEdition
  const before = JSON.stringify(legacy)
  assert.equal(gameplayEdition(legacy), 'classic'); prepareCareerEdition(legacy); assert.equal(JSON.stringify(legacy), before)
  assert(!classic.world.teamsById[classic.playerTeamId].teamTraining.schedule?.streamlined)
  assert(simple.world.teamsById[simple.playerTeamId].teamTraining.schedule.streamlined)
  const reloaded = rehydrateCareerWorld(JSON.parse(JSON.stringify(careerForStorage(simple))))
  assert.equal(reloaded.gameplayEdition, 'streamlined'); assert.equal(reloaded.editionVersion, 2)
  assert.equal(persistCareer(reloaded).gameplayEdition, 'streamlined')
})
await test('Backups round trip only into empty slots and reject future versions', () => {
  const before = JSON.stringify(classic), backup = exportCareerBackup(simple)
  assert.throws(() => restoreCareerBackup(backup, 0), /empty slot/)
  const bad = JSON.parse(backup); bad.career.editionVersion = 999
  assert.throws(() => restoreCareerBackup(JSON.stringify(bad), 2), /newer/)
  const restored = restoreCareerBackup(backup, 2)
  assert.equal(restored.gameplayEdition, 'streamlined'); assert.equal(restored.slotIndex, 2)
  assert.deepEqual(restored.world.teamsById[restored.playerTeamId].teamTraining.schedule.streamlined, simple.world.teamsById[simple.playerTeamId].teamTraining.schedule.streamlined)
  assert.equal(JSON.stringify(classic), before)
})
await test('Read decisions still block; reports and queued negotiations do not', () => {
  assert(requiresCareerDecision({ type: 'random_event', read: true, payload: { kind: 'decision', status: 'pending' } }))
  assert(!requiresCareerDecision({ type: 'training_report' }))
  assert(!requiresCareerDecision({ type: 'transfer_offer', payload: { kind: 'sale_player_decision', status: 'pending' } }))
  assert(!requiresCareerDecision({ type: 'watchable_final', payload: { status: 'pending' } }))
  assert(!requiresCareerDecision({ type: 'transfer_offer', payload: { kind: 'outgoing_club_offer', status: 'club_agreed', contractQueued: true } }))
  assert(requiresCareerDecision({ type: 'transfer_offer', payload: { kind: 'pending_registration', status: 'pending_confirm' } }))
  const decision = { id: 'kept', date: '2020-01-01', type: 'random_event', read: true, payload: { kind: 'decision', status: 'pending' } }
  const incoming = Array.from({length: 90}, (_, i) => ({ id: `report-${i}`, date: '2025-10-01', type: 'training_report' }))
  assert(mergeInbox({ ...simple, inbox: [decision] }, incoming).some(m => m.id === 'kept'))
  const c = structuredClone(simple); c.inbox = [decision]; const before = JSON.stringify(c)
  assert(advanceCareerDay(c).blocked); assert.equal(JSON.stringify(c), before)
})
await test('Unknown follow-ups survive and are flagged only in streamlined careers', () => {
  const follow = { id: 'chain', dueDate: '2025-01-01', templateId: 'missing-template', ctx: { playerId: 'retained' } }
  const result = processPendingEventFollowUps({ ...simple, pendingEventFollowUps: [follow] }, {date: '2025-09-01'})
  assert.equal(result.pendingEventFollowUps[0].reviewRequired, 'missing_template')
  assert.deepEqual(result.pendingEventFollowUps[0].ctx, follow.ctx)
  assert.equal(processPendingEventFollowUps({ ...classic, pendingEventFollowUps: [follow] }, {date:'2025-09-01'}).pendingEventFollowUps.length, 0)
})
await test('Weekly workloads, match protection, project limit and no duplicate sessions', () => {
  const c = structuredClone(simple), t = c.world.teamsById[c.playerTeamId]
  for (const p of t.players) { p.developmentFatigue = 0; p.matchStamina = 100; p.injury = null; delete p.holidayUntil; delete p.nationalCampFrom }
  t.teamTraining.lastProcessedDate = null
  const l = { teamsById: {[t.id]:t}, playerTeamId:t.id, currentDate:'2025-09-01', fixtures:[], simSeedBase: 42 }
  const loads = []
  for (const intensity of ['light','normal','strong']) { setWeekPlan(t,{intensity}); loads.push(resolveTrainingDay(t,l.currentDate,l).reduce((n,p)=>n+p.load,0)) }
  assert(loads[0] < loads[1] && loads[1] < loads[2])
  l.fixtures = [{id:'game',homeTeamId:t.id,awayTeamId:'opponent',date:'2025-09-02'}]
  assert.equal(resolveTrainingDay(t,'2025-09-01',l)[0].type,'matchPrep')
  assert.equal(resolveTrainingDay(t,'2025-09-02',l)[0].type,'match')
  assert.equal(resolveTrainingDay(t,'2025-09-03',l)[0].type,'recovery')
  for (const p of t.players.slice(0,3)) assert(setDevelopmentProject(t,p.id,'throwing'))
  assert(!setDevelopmentProject(t,t.players[3].id,'physical'))
  assert(setDevelopmentProject(t,t.players[0].id,'')); assert.equal(t.players[0].trainingFocus,'balanced')
  const removed=t.players[1].id; t.players=t.players.filter(p=>p.id!==removed); syncDevelopmentProjects(t)
  assert(!t.teamTraining.schedule.streamlined.projects.some(p=>p.playerId===removed))
  processTeamTrainingsForDate(l,'2025-09-01',{playerTeamId:t.id}); const before=JSON.stringify(t)
  processTeamTrainingsForDate(l,'2025-09-01',{playerTeamId:t.id}); assert.equal(JSON.stringify(t),before)
  assert(t.teamTraining.sessionLog.length > 0)
  assert.equal(readiness({injury:{daysRemaining:3}}).id,'injured')
  assert.equal(readiness({matchStamina:30}).id,'rest'); assert.equal(readiness({matchSharpness:20}).id,'rhythm')
})
await test('Continue and date fast-forward stop on the same decision or match', async () => {
  const base=structuredClone(simple); base.inbox=[]
  const target=trainingDateAdd(base.league.currentDate, 8)
  Math.random=createRng(99).float
  const fast=await simulateCareerUntil(structuredClone(base),{targetDate:target})
  Math.random=createRng(99).float
  let manual=structuredClone(base),days=0
  while(manual.league.currentDate<target && days<8){const step=advanceCareerDay(manual);manual=step.career;if(step.blocked)break;days++}
  assert.equal(fast.career.league.currentDate,manual.league.currentDate)
  assert.equal(fast.daysAdvanced,days)
  for(const id of Object.keys(manual.world.teamsById)) {
    assert.deepEqual(fast.career.world.teamsById[id].finances,manual.world.teamsById[id].finances)
    const state=c=>c.world.teamsById[id].players.map(p=>[p.id,p.skills,p.matchStamina,p.developmentFatigue,p.workload])
    assert.deepEqual(state(fast.career),state(manual))
  }
})
await test('Coach observations cite real events and interventions are acknowledged once', () => {
  const events=[{type:'point_start',pointIndex:1,pullTeam:'away',homePointStartRole:'offense',awayPointStartRole:'defense'},{type:'throw_fail',possessionTeam:'home',isHuck:true,isBlock:true},{type:'point_end',pointIndex:1,scoringTeam:'away'}]
  const report=buildCoachReport({events},'home'); assert.equal(report.length,3)
  assert.deepEqual(report[2].points,[1]); assert(report[2].observation.includes('bloki rywala: 1'))
  assert(pointIsHighlight(events,2,0,1))
  const s={status:'break',pointIndex:10,homeScore:8,awayScore:1,events:[],stamina:{home:{}}}
  assert.equal(matchIntervention(s,'home').key,'interval'); assert.equal(matchIntervention(s,'home',new Set(['interval'])),null)
  assert.equal(matchIntervention({...s,status:'finished'},'home'),null)
})
await test('Both fast-forward controls stop before the player match and preserve its result', async () => {
  const base=structuredClone(simple); base.inbox=[]
  const fixture=base.league.fixtures.find(f=>f.homeTeamId===base.playerTeamId||f.awayTeamId===base.playerTeamId)
  assert(fixture); base.league.currentDate=fixture.date
  for(const opts of [{untilMatch:true},{targetDate:trainingDateAdd(fixture.date,10)}]) {
    const result=await simulateCareerUntil(structuredClone(base),opts)
    assert.equal(result.daysAdvanced,0); assert.equal(result.career.league.currentDate,fixture.date)
    assert.notEqual(result.career.league.fixtures.find(f=>f.id===fixture.id).status,'completed')
  }
})
await test('Both other competitions retain edition metadata on creation and reload', () => {
  for(const [competition, playerTeamId] of [['ufa',UFA_LEAGUE_TEAMS[0].id],['eucs',eucsTeamsForTier(1)[0].id]]) {
    const c=createCareer(2,{competition,playerTeamId,managerName:'QA',seasonYear:2025,gameplayEdition:'streamlined',worldConfig:{international:{nationals:false}}})
    assert.equal(c.gameplayEdition,'streamlined'); assert(c.world.teamsById[playerTeamId].teamTraining.schedule.streamlined)
    assert.equal(rehydrateCareerWorld(JSON.parse(exportCareerBackup(c)).career).gameplayEdition,'streamlined')
  }
})
writeFileSync('artifacts/career-edition-baseline/checks.json',JSON.stringify({passed:passed.length,checks:passed,durationMs:metrics},null,2))
console.log(`${passed.length} streamlined career checks passed`)
