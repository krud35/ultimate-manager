import assert from 'node:assert/strict'
import { createCareer, startNextSeason } from '../src/career/careerModel.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'
import { eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { addManagerWelcome, ensureManagerCareer, managerJobOffers, leaveManagerJob, acceptManagerJob, processManagerCareer } from '../src/career/managerCareer.js'
import { clubObjectives } from '../src/career/clubObjectives.js'
import { welcomeForMessage } from '../src/career/clubWelcome.js'
import { setClubStrategy } from '../src/career/clubManagement.js'
import { writeSlot, getSlot } from '../src/career/saveStore.js'
globalThis.localStorage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}}
let passed=0
function test(n,f){f();passed++;console.log('OK '+n)}
const base=createCareer(0,{managerName:'Manager test',playerTeamId:'toronto-rush',seasonYear:2025})
const clone=()=>structuredClone(base)
test('Joining creates one welcome with strategy and prioritised goals; strategy cannot be changed',()=>{
 const c=clone(),t=c.world.teamsById[c.playerTeamId],strategy=t.clubStrategy
 const before=c.inbox.length;addManagerWelcome(c);assert.equal(c.inbox.length,before)
 assert(c.inbox.some(x=>x.id.startsWith('manager-welcome-')&&x.body.includes('Priorytet 1')))
 assert.equal(clubObjectives(t)[0].priority,1)
 assert(!setClubStrategy(t,strategy==='contend'?'development':'contend'));assert.equal(t.clubStrategy,strategy)
})
test('Welcome cards preserve appointment finances; legacy cards identify current data without mutation',()=>{
 const c=clone(),msg=c.inbox.find(m=>m.id.startsWith('manager-welcome-'))
 const snapshot=structuredClone(welcomeForMessage(msg,c))
 assert.equal(snapshot.funds.cash,snapshot.funds.transferBudget+snapshot.funds.seasonPayrollBudget)
 c.world.teamsById[c.playerTeamId].finances.cash+=10000
 assert.deepEqual(welcomeForMessage(msg,c),snapshot)
 const old=structuredClone(msg);delete old.payload.welcome
 const before=JSON.stringify(c),fallback=welcomeForMessage(old,c)
 assert(fallback.currentData);assert.equal(fallback.teamId,c.playerTeamId)
 assert.equal(JSON.stringify(c),before)
 assert.equal(welcomeForMessage({id:'board-warning-test',payload:{kind:'manager_career'}},c),null)
})

test('Resignation removes control, preserves world and offers a real alternative',()=>{
 const c=clone(),before=JSON.stringify(c),r=leaveManagerJob(c);assert(r.ok)
 assert.equal(JSON.stringify(c),before);assert.equal(r.career.playerTeamId,null);assert.equal(r.career.league.playerTeamId,null)
 assert.equal(r.career.managerCareer.status,'unemployed');assert(managerJobOffers(r.career).length>0)
 const offer=managerJobOffers(r.career)[0],joined=acceptManagerJob(r.career,offer.id)
 assert(joined.ok);assert.equal(joined.career.playerTeamId,offer.teamId)
 assert.equal(joined.career.league.playerTeamId,offer.teamId)
 assert.equal(joined.career.world.teamsById[offer.teamId].boardObjective.confidence,60)
 assert(joined.career.inbox[0].id.startsWith('manager-welcome-'))
 assert(!acceptManagerJob(r.career,'forged-top-club').ok)
})

test('Leaving withdraws unresolved negotiations and follow-ups of the former club',()=>{
 const c=clone();c.inbox.push(...['pending','counter','awaiting_reply','accepted'].map(status=>({id:status,payload:{kind:'outgoing_club_offer',status}})))
 c.pendingEventFollowUps=[{id:'old-club-event'}]
 const next=leaveManagerJob(c).career
 for(const id of ['pending','counter','awaiting_reply'])assert.equal(next.inbox.find(m=>m.id===id).payload.status,'withdrawn')
 assert.equal(next.inbox.find(m=>m.id==='accepted').payload.status,'accepted')
 assert.deepEqual(next.pendingEventFollowUps,[])
})
test('Dismissal requires two warnings and time to improve; reload cannot repeat warnings',()=>{
 let c=clone(),t=c.world.teamsById[c.playerTeamId];t.boardObjective.confidence=10
 c.league.currentDate='2025-09-01';c=processManagerCareer(c);assert.equal(c.managerCareer.warnings.length,1)
 const inbox=c.inbox.length;c=processManagerCareer(structuredClone(c));assert.equal(c.inbox.length,inbox)
 c.league.currentDate='2025-10-01';c=processManagerCareer(c);assert.equal(c.managerCareer.warnings.length,2);assert(c.playerTeamId)
 c.league.currentDate='2025-11-01';c=processManagerCareer(c);assert.equal(c.playerTeamId,null)
 assert.equal(c.managerCareer.history.at(-1).reason,'dismissed')
})
test('Board recovery clears warnings and keeps the appointment',()=>{
 let c=clone();c.world.teamsById[c.playerTeamId].boardObjective.confidence=10
 c.league.currentDate='2025-09-01';c=processManagerCareer(c)
 c.world.teamsById[c.playerTeamId].boardObjective.confidence=55;c.league.currentDate='2025-10-01';c=processManagerCareer(c)
 assert(c.playerTeamId);assert.equal(c.managerCareer.warnings.length,0)
})
test('Save/reload preserves unemployment, reputation and employment history',()=>{
 const c=leaveManagerJob(clone()).career;writeSlot(2,{...c,slotIndex:2})
 const loaded=getSlot(2);assert(loaded);assert.equal(loaded.playerTeamId,null)
 assert.equal(loaded.league.playerTeamId,null);assert.deepEqual(loaded.managerCareer,c.managerCareer)
 assert(managerJobOffers(loaded).length>0)
})
test('Unemployment can advance calendar and transition to the next season',()=>{
 let c=leaveManagerJob(clone()).career
 c=advanceCareerDay(c,{autoSimulatePlayer:true}).career;assert.equal(c.playerTeamId,null)
 c.league.currentDate='2026-07-31';c.league.status='complete'
 for(const f of c.league.fixtures)f.status='completed'
 c=startNextSeason(c);assert.equal(c.playerTeamId,null);assert.equal(c.league.playerTeamId,null);assert.equal(c.seasonYear,2026)
})
const eucs=createCareer(1,{managerName:'Lower tier',competition:'eucs',playerTeamId:eucsTeamsForTier(3)[0].id,seasonYear:2025})
test('Poor lower-tier reputation cannot obtain first-tier jobs',()=>{
 const c=leaveManagerJob(eucs).career;ensureManagerCareer(c).reputation=10
 const offers=managerJobOffers(c);assert(offers.length>0);assert(offers.every(o=>o.tier===3))
})
test('Reputation tracks only new results and poor performance limits subsequent offers',()=>{
 let c=structuredClone(eucs);const m=ensureManagerCareer(c),rep=m.reputation
 const row=c.league.standings[c.playerTeamId];row.losses+=10
 c=leaveManagerJob(c).career;assert(c.managerCareer.reputation<rep)
 assert(managerJobOffers(c).every(o=>o.tier!==1))
 const before=c.managerCareer.reputation;processManagerCareer(c);assert.equal(c.managerCareer.reputation,before)
})
test('Switching divisions preserves schedules, results, clubs and player ownership',()=>{
 const c=structuredClone(eucs);ensureManagerCareer(c).reputation=95
 managerJobOffers(c)
 const id=eucsTeamsForTier(1)[0].id;c.world.teamsById[id].boardObjective.confidence=10
 const offers=managerJobOffers(c),offer=offers.find(o=>o.tier===1);assert(offer)
 const target=c.league.otherLeagues.find(l=>l.teamIds.includes(offer.teamId)),fixtures=structuredClone(target.fixtures)
 const oldIds=[...c.league.teamIds],players=Object.values(c.world.teamsById).flatMap(t=>t.players.map(p=>p.id)).sort()
 const r=acceptManagerJob(c,offer.id);assert(r.ok);assert.equal(r.career.pyramid.tier,1)
 assert.deepEqual(r.career.league.fixtures,fixtures);assert(r.career.league.otherLeagues.some(l=>l.teamIds.includes(oldIds[0])))
 assert.deepEqual(Object.values(r.career.world.teamsById).flatMap(t=>t.players.map(p=>p.id)).sort(),players)
 const continued=advanceCareerDay(r.career,{autoSimulatePlayer:true}).career
 assert.equal(continued.playerTeamId,offer.teamId)
})
test('Unemployed EUCS manager can enter another season without a phantom club or cup win',()=>{
 let c=leaveManagerJob(structuredClone(eucs)).career
 c.league.currentDate='2026-07-31';c.league.status='complete'
 for(const l of [c.league,...c.league.otherLeagues]) for(const f of l.fixtures)f.status='completed'
 c=startNextSeason(c);assert.equal(c.playerTeamId,null);assert.equal(c.league.playerTeamId,null)
 assert.equal(c.pyramid.tier,3);assert(!c.seasonHistory.at(-1).cupWinner)
 assert(managerJobOffers(c).length>0)
})
console.log('Passed '+passed+' manager career tests')
