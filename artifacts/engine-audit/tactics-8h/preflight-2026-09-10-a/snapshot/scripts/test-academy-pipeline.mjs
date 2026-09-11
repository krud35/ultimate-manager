import assert from 'node:assert/strict'
import { createCareer } from '../src/career/careerModel.js'
import { initializeWorldAcademies, runAcademyIntake, signAcademyCandidate, promoteAcademyPlayer, academyAnnualPlaces } from '../src/career/academy.js'
import { processClubManagement } from '../src/career/clubManagement.js'
import { youthWillJoin, ensureYouthCohort } from '../src/career/youthPopulation.js'
import { getOverallRating } from '../src/models/playerStats.js'
import { eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} }
let passed = 0
const test = (name, fn) => { fn(); console.log('OK '+name); passed++ }
const base = createCareer(0,{playerTeamId:'toronto-rush',seasonYear:2025})
test('All new UFA and EUCS clubs inherit five weak young academy players',()=>{
 const eucs=createCareer(1,{competition:'eucs',playerTeamId:eucsTeamsForTier(3)[0].id,seasonYear:2025})
 for(const c of [base,eucs])for(const t of Object.values(c.world.teamsById)){
  assert.equal(t.academyPlayers.length,5)
  for(const p of t.academyPlayers){assert(p.age>=16&&p.age<=17);assert(getOverallRating(p.skills)<=72);assert(p.inAcademy);assert.equal(p.contract,null);assert(!t.players.some(s=>s.id===p.id))}
 }
})
test('Initialization survives reload and does not refill a deliberately emptied academy',()=>{
 const w=structuredClone(base.world),t=w.teamsById[base.playerTeamId]
 t.academyPlayers=[];initializeWorldAcademies(w,2026);assert.equal(t.academyPlayers.length,0)
 delete t.academyRosterInitialized;initializeWorldAcademies(w,2026);assert.equal(t.academyPlayers.length,5)
 const ids=t.academyPlayers.map(p=>p.id);initializeWorldAcademies(w,2026);assert.deepEqual(t.academyPlayers.map(p=>p.id),ids)
})
test('Autumn and spring discover juniors once, with correct dates and no automatic registration',()=>{
 const w=structuredClone(base.world),t=w.teamsById[base.playerTeamId]
 const initial=t.academyPlayers.length
 const autumn=runAcademyIntake(w,{seasonYear:2025});assert(Object.values(autumn.createdByTeam).every(n=>n>=4&&n<=8))
 assert.equal(t.academyPlayers.length,initial);assert(t.academyCandidates.every(p=>p.status==='observed_junior'&&!p.inAcademy&&p.observationOnly))
 assert.equal(runAcademyIntake(w,{seasonYear:2025}).created.length,0)
 const spring=runAcademyIntake(w,{seasonYear:2025,wave:'spring'});assert(Object.values(spring.createdByTeam).every(n=>n>=4&&n<=8))
 assert(t.academyCandidates.filter(p=>p.academyIntakeWave==='spring').every(p=>p.offerExpires==='2026-04-30'))
 assert.equal(runAcademyIntake(structuredClone(w),{seasonYear:2025,wave:'spring'}).created.length,0)
})
test('Observed junior must join academy before signing a senior contract; the registry has one owner',()=>{
 const w=structuredClone(base.world),t=w.teamsById[base.playerTeamId];t.players=t.players.slice(0,20)
 runAcademyIntake(w,{seasonYear:2025});t.managementDate='2025-09-01'
 const junior=t.academyCandidates.find(p=>youthWillJoin(t,p));assert(junior)
 assert.equal(promoteAcademyPlayer(t,junior.id).error,'not_in_academy')
 const signed=signAcademyCandidate(t,junior.id,{world:w,seasonYear:2025});assert(signed.ok)
 assert(!w.regionalYouth.some(p=>p.id===junior.id));assert(!Object.values(w.teamsById).some(club=>club.academyCandidates.some(p=>p.id===junior.id)))
 const promoted=promoteAcademyPlayer(t,junior.id);assert(promoted.ok)
 assert(promoted.player.contract);assert(!promoted.player.inAcademy);assert(!t.academyPlayers.some(p=>p.id===junior.id));assert.equal(t.players.filter(p=>p.id===junior.id).length,1)
})
test('Recruitment still enforces annual caps and observation expiry',()=>{
 const w=structuredClone(base.world),t=w.teamsById[base.playerTeamId];runAcademyIntake(w,{seasonYear:2025})
 const p=t.academyCandidates[0];t.academyAdmissionYear=2025;t.academyAdmissions=academyAnnualPlaces(t);t.managementDate='2025-09-01'
 assert.equal(signAcademyCandidate(t,p.id,{world:w,seasonYear:2025}).error,'annual_limit')
 t.academyAdmissions=0;t.managementDate='2025-12-01'
 assert.equal(signAcademyCandidate(t,p.id,{world:w,seasonYear:2025}).error,'unavailable')
})
test('Calendar management sends one bilingual inbox notification for each intake',()=>{
 const c=structuredClone(base)
 for(const date of ['2025-09-01','2026-03-01']){
  const result=processClubManagement(c,date)
  const messages=result.inboxMessages.filter(m=>m.payload?.kind==='academy_intake');assert.equal(messages.length,1);assert(messages[0].bodyEn)
  assert.equal(processClubManagement(c,date).inboxMessages.filter(m=>m.payload?.kind==='academy_intake').length,0)
 }
})
test('Legacy regional cohorts expand once and preserve existing players',()=>{
 const w=structuredClone(base.world);w.youthCohortYears=[2025];delete w.youthCohortVersions
 const ids=(w.regionalYouth??[]).map(p=>p.id);ensureYouthCohort(w,2025)
 const count=w.regionalYouth.length;assert(count>ids.length);assert(ids.every(id=>w.regionalYouth.some(p=>p.id===id)))
 ensureYouthCohort(w,2025);assert.equal(w.regionalYouth.length,count)
 assert.equal(new Set(w.regionalYouth.map(p=>p.id)).size,count)
})
console.log(`Passed ${passed} academy pipeline tests`)
