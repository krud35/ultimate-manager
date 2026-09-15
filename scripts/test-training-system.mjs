import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { ensurePlayerWorkload, addPlayerLoad, recoverPlayerDay, trainingParticipation, workloadRisk } from '../src/models/playerWorkload.js'
import { applyDailyDevelopment } from '../src/career/playerDevelopment.js'
import { processTeamTrainingsForDate, processTeamTrainingsDateRange, processTeamTrainingsDateRangeAsync } from '../src/career/teamTraining.js'
import { ensureTrainingSchedule, setTrainingTemplate, setTrainingSlot, resolveTrainingDay, playerSessionPlan, trainingDateAdd, forecastTrainingPlayer } from '../src/career/trainingSchedule.js'
import { ensureClubStaff, staffMarket, hireClubStaff, releaseClubStaff, renewClubStaff, staffPayroll, processStaffContracts, staffSessionQuality } from '../src/career/clubStaff.js'
import { ensureClubManagement, weeklyClubOperatingCost } from '../src/career/clubManagement.js'
import { applyPostMatchStaminaWear } from '../src/matchEngine/stamina.js'
import { setPossessionPlayerMods, clearPointPlayerMods } from '../src/matchEngine/playerMods.js'
import { decisionNoiseAmplitude } from '../src/matchEngine/ai/statFormulas.js'
import { staffWeeklyCosts } from '../src/career/economyBalance.js'
const world=createWorldFromTemplate(2025),original=Object.values(world.teamsById)[0]
let passed=0
async function test(name,fn){await fn();console.log('OK '+name);passed++}
const team=()=>{const t=structuredClone(original);t.teamTraining={weekly:[],oneOff:[],sessionLog:[],tacticsFamiliarity:38};t.players=t.players.slice(0,12);t.academyPlayers=[];for(const p of t.players){p.developmentFatigue=0;p.matchStamina=100;p.matchSharpness=65;p.trainingFocus='balanced';p.injury=null;delete p.workload}return t}
const league=t=>({teamsById:{[t.id]:t},playerTeamId:t.id,currentDate:'2025-09-01',simSeedBase:99,fixtures:[],playerStats:{}})

await test('Daily recovery uses actual individual effort, runs once, and survives save/load',()=>{
 const p=structuredClone(original.players[0]);p.developmentFatigue=40;p.matchStamina=50
 const rest=structuredClone(p),active=structuredClone(p);addPlayerLoad(active,14);recoverPlayerDay(active,'2025-09-01');recoverPlayerDay(rest,'2025-09-01')
 assert(rest.matchStamina>active.matchStamina);assert(rest.developmentFatigue<active.developmentFatigue)
 const saved=JSON.parse(JSON.stringify(active));assert.equal(recoverPlayerDay(saved,'2025-09-01'),false);assert.deepEqual(saved,active)
 assert(rest.matchStamina<=100-rest.developmentFatigue*.5)
})
await test('Match participation has real workload and rhythm; unused substitutes have no wear',()=>{
 const p=team().players[0];p.stats={pointsPlayedMatch:18};applyPostMatchStaminaWear(p)
 assert(p.matchStamina<100);assert(p.matchSharpness>65);assert(p.workload.pendingMatch>0)
 const bench=team().players[0];bench.stats={pointsPlayedMatch:0};applyPostMatchStaminaWear(bench);assert.equal(bench.matchStamina,100)
})
await test('Calendar follows rescheduled matches, cup dates, pre/post match days and slot overrides',()=>{
 const t=team(),l=league(t);setTrainingTemplate(t,'balanced');l.fixtures=[{id:'m',homeTeamId:t.id,awayTeamId:'other',date:'2025-09-06'}]
 assert.equal(resolveTrainingDay(t,'2025-09-06',l)[0].type,'match');assert.equal(resolveTrainingDay(t,'2025-09-05',l)[0].type,'matchPrep')
 assert.equal(resolveTrainingDay(t,'2025-09-07',l)[0].type,'recovery')
 l.fixtures[0].date='2025-09-07';assert.equal(resolveTrainingDay(t,'2025-09-06',l)[0].type,'matchPrep')
 assert(setTrainingSlot(t,'2025-09-03',2,'video'));assert.equal(resolveTrainingDay(t,'2025-09-03',l)[2].type,'video')
 assert.equal(setTrainingSlot(t,'2025-02-30',0,'physical'),false)
 l.cup={matches:[{homeTeamId:t.id,date:'2025-09-09'}]};assert.equal(resolveTrainingDay(t,'2025-09-09',l)[0].type,'match')
})
await test('Starters recover, unused substitutes train, rehab and group restrictions apply',()=>{
 const t=team(),l=league(t);setTrainingTemplate(t,'balanced');l.fixtures=[{homeTeamId:t.id,date:'2025-09-06'}]
 const plan=resolveTrainingDay(t,'2025-09-07',l)[0],p=t.players[0]
 p.recentPlayingTime=[{date:'2025-09-06',share:.7}];assert.equal(playerSessionPlan(p,plan,t).type,'recovery')
 p.recentPlayingTime=[{date:'2025-09-06',share:0}];assert.equal(playerSessionPlan(p,plan,t).type,'scrimmage')
 p.injury={daysRemaining:4};assert.equal(trainingParticipation(p,plan.date).reason,'rehab')
 p.injury=null;ensurePlayerWorkload(p).returnUntil='2025-09-09';assert.equal(trainingParticipation(p,plan.date).multiplier,.5)
 p.trainingGroup='handlers';assert.equal(playerSessionPlan(p,{...plan,group:'cutters'},t).load,0)
})
await test('Legacy plans are preserved until activation, then cannot double count',()=>{
 const t=team();t.teamTraining.weekly=[{id:'old',weekday:1,enabled:true,focuses:['physical','throwing'],intensity:'high'}]
 assert.equal(ensureTrainingSchedule(t).legacy,true);assert.equal(resolveTrainingDay(t,'2025-09-01'),null)
 setTrainingTemplate(t,'recovery');assert.equal(ensureTrainingSchedule(t).legacy,false)
 const l=league(t);processTeamTrainingsForDate(l,'2025-09-01');assert.equal(t.players[0].workload?.pending??0,0)
})
await test('Day-by-day, synchronous range and async range produce identical saved state',async()=>{
 const a=league(team());setTrainingTemplate(a.teamsById[a.playerTeamId],'balanced')
 const b=structuredClone(a),c=structuredClone(a)
 for(let d='2025-09-01';d<'2025-09-15';d=trainingDateAdd(d,1)){processTeamTrainingsForDate(a,d);applyDailyDevelopment(a,{date:d,tag:`day-${d}`})}
 processTeamTrainingsDateRange(b,'2025-09-01','2025-09-15');await processTeamTrainingsDateRangeAsync(c,'2025-09-01','2025-09-15')
 assert.deepEqual(b,a);assert.deepEqual(c,a)
 const saved=JSON.stringify(a);processTeamTrainingsForDate(a,'2025-09-14');applyDailyDevelopment(a,{date:'2025-09-14'});assert.equal(JSON.stringify(a),saved)
})
await test('Forecast cannot change the actual player or consume a session',()=>{
 const t=team(),l=league(t);setTrainingTemplate(t,'balanced');ensurePlayerWorkload(t.players[0]);const before=JSON.stringify(t)
 const result=forecastTrainingPlayer(t.players[0],t,l,'2025-09-01','2025-09-08');assert(result.freshness>=0&&result.freshness<=100);assert.equal(JSON.stringify(t),before)
})
await test('Low rhythm affects actual match decisions independently of freshness',()=>{
 const p=team().players[0];p.matchSharpness=65;setPossessionPlayerMods([p],null,[],null);const ready=decisionNoiseAmplitude(p)
 p.matchSharpness=10;setPossessionPlayerMods([p],null,[],null);assert(decisionNoiseAmplitude(p)>ready);assert.equal(p.matchStamina,100);clearPointPlayerMods()
})
await test('Video has negligible load; overloaded players still receive recovery; vacant staff cannot delegate',()=>{
 const t=team(),l=league(t);setTrainingTemplate(t,'recovery');const s=ensureTrainingSchedule(t)
 setTrainingSlot(t,'2025-09-01',0,'video');processTeamTrainingsForDate(l,'2025-09-01')
 assert(t.players.every(p=>(p.workload?.pending??0)<1))
 const p=t.players[0];p.developmentFatigue=80;p.matchStamina=40
 setTrainingSlot(t,'2025-09-02',0,'recovery');processTeamTrainingsForDate(l,'2025-09-02');assert.equal(p.workload.recovery,4)
 s.delegated=true;s.template='balanced';s.overrides={};t.staff={assistantCoach:0}
 l.fixtures=[{homeTeamId:t.id,date:'2025-09-04'},{homeTeamId:t.id,date:'2025-09-06'}]
 assert.equal(resolveTrainingDay(t,'2025-09-02',l)[0].type,'physical')
 t.staff.assistantCoach=1;assert.equal(resolveTrainingDay(t,'2025-09-02',l)[0].type,'video')
})
await test('Staff migration preserves cost, hiring costs include severance, expiry and renewals work',()=>{
 const t=team();t.staff={youthCoach:1,chiefScout:2,physio:3,sportingDirector:1};delete t.staffMembers;ensureClubManagement(t,2025)
 assert.equal(staffPayroll(t),staffWeeklyCosts[1]*2+staffWeeklyCosts[2]+staffWeeklyCosts[3]);const before=JSON.stringify(t.staffMembers);ensureClubStaff(t);assert.equal(JSON.stringify(t.staffMembers),before)
 t.finances.cash=100_000_000;t.finances.transferLimit=100_000_000;t.finances.transferBudget=100_000_000
 const candidate=staffMarket(t,'assistantCoach','2025-09-01')[0],cash=t.finances.cash
 assert(hireClubStaff(t,'assistantCoach',candidate.id,'2025-09-01').ok);assert.equal(t.finances.cash,cash-candidate.weeklyWage*4)
 assert(t.staff.assistantCoach>0);assert(staffSessionQuality(t,['throwing'])>1)
 assert(renewClubStaff(t,'assistantCoach','2025-09-02').ok);assert.equal(t.staffMembers.assistantCoach.expiresOn,'2027-09-01')
 assert(releaseClubStaff(t,'assistantCoach','2025-09-03').ok);assert.equal(t.staff.assistantCoach,0)
 t.staffMembers.physio.expiresOn='2025-09-04';assert(processStaffContracts(t,'2025-09-04').some(n=>n.expired&&n.role==='physio'));assert.equal(t.staff.physio,0)
 assert(Number.isFinite(weeklyClubOperatingCost(t)))
})
await test('Over a season, repeated heavy load accumulates; recovery weeks remove fatigue slowly',()=>{
 const healthy=team().players[0],heavy=structuredClone(healthy)
 for(let i=0;i<182;i++){
   const date=trainingDateAdd('2025-09-01',i),dow=i%7
   if(dow===5){healthy.stats={pointsPlayedMatch:16};heavy.stats={pointsPlayedMatch:16};applyPostMatchStaminaWear(healthy);applyPostMatchStaminaWear(heavy)}
   else {addPlayerLoad(healthy,[9,14,19,8,3,0,0][dow]);addPlayerLoad(heavy,38)}
   recoverPlayerDay(healthy,date);recoverPlayerDay(heavy,date)
 }
 assert(heavy.developmentFatigue>healthy.developmentFatigue+30);assert(heavy.matchStamina<healthy.matchStamina);assert.equal(workloadRisk(heavy),'high')
 const fatigue=heavy.developmentFatigue;for(let i=0;i<7;i++)recoverPlayerDay(heavy,trainingDateAdd('2025-09-01',182+i))
 assert(heavy.developmentFatigue<fatigue);assert(heavy.developmentFatigue>0)
 console.log(JSON.stringify({season:{balancedFatigue:healthy.developmentFatigue,heavyFatigueAfterRecovery:heavy.developmentFatigue,balancedFreshness:healthy.matchStamina}}))
})
await test('Actual 26-week schedule supports weekly games, protected rest and persistent history',()=>{
 const t=team(),l=league(t);setTrainingTemplate(t,'balanced')
 l.fixtures=Array.from({length:26},(_,i)=>({id:`season-${i}`,date:trainingDateAdd('2025-09-06',i*7),homeTeamId:t.id,awayTeamId:'opponent'}))
 let games=0,readiness=0,injuries=0
 for(let i=0;i<182;i++){
   const date=trainingDateAdd('2025-09-01',i),match=l.fixtures.some(f=>f.date===date)
   if(match){games++;readiness+=t.players.reduce((a,p)=>a+(p.matchStamina??100),0)/t.players.length;for(const p of t.players){const share=p.injury?.daysRemaining>0?0:.5;p.stats={pointsPlayedMatch:share?15:0};applyPostMatchStaminaWear(p);p.recentPlayingTime=[{date,share}]}}
   const r=processTeamTrainingsForDate(l,date);injuries+=r.reports.reduce((a,r)=>a+r.injuries.length,0);applyDailyDevelopment(l,{date,tag:`day-${date}`})
 }
 assert.equal(games,26);assert(readiness/games>65);assert(t.players.every(p=>p.workload.history.length===35));assert(t.players.every(p=>Number.isFinite(p.matchSharpness)))
 console.log(JSON.stringify({actualSeason:{games,averagePregameFreshness:Math.round(readiness/games),trainingInjuries:injuries,players:t.players.length}}))
})
console.log(`${passed} training/staff checks passed`)
