import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
const lzPath=createRequire(import.meta.url).resolve('lz-string')
const bridge='data:text/javascript,'+encodeURIComponent(`import { createRequire } from 'node:module';const lz=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(lzPath)});export const {compressToUTF16,decompressFromUTF16}=lz;`)
registerHooks({resolve(specifier,context,next){if(specifier==='lz-string')return{url:bridge,shortCircuit:true};try{return next(specifier,context)}catch(e){if(e.code==='ERR_UNSUPPORTED_DIR_IMPORT')return next(`${specifier}/index.js`,context);if(e.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.js'))return next(`${specifier}.js`,context);throw e}}})
globalThis.localStorage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}}
const {DOMESTIC_LEAGUES,defaultWorldConfig}=await import('../src/data/domesticLeagues.js')
const {createCareer,startNextSeason}=await import('../src/career/careerModel.js')
const {advanceCareerDay,simulateCareerUntil}=await import('../src/career/calendarSimulation.js')
const {careerForStorage,rehydrateCareerWorld}=await import('../src/career/worldState.js')
const {scheduleSeasonalHolidays}=await import('../src/career/seasonalAvailability.js')
const {playerSessionPlan}=await import('../src/career/trainingSchedule.js')
const {applyOffseasonDevelopment}=await import('../src/career/playerDevelopment.js')
const {selectNationalSquad}=await import('../src/career/nationalTeams.js')
let passed=0,failed=0
async function test(name,fn){try{await fn();passed++;console.log(`OK ${name}`)}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`)}}
const meta=DOMESTIC_LEAGUES.find(l=>l.teams.length===2)
const config={leagues:Object.fromEntries(DOMESTIC_LEAGUES.map(l=>[l.id,l.id===meta.id?'playable':'off'])),international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false},christmasBreak:true}
let tiny=createCareer(0,{competition:'domestic',managerName:'Runtime QA',playerTeamId:meta.teams[0].id,seasonYear:2025,worldConfig:config})
const holidayBase=structuredClone(tiny)
await test('Actual chronological season: three engine matches, training, daily recovery, save reload and rollover',async()=>{
  let days=0,observedMatchLoad=false,observedTraining=false,reloaded=false
  while(tiny.league.status!=='complete'&&days<380){
    const previous=tiny.league.currentDate
    const result=advanceCareerDay(tiny,{autoSimulatePlayer:true,allowRandomEvents:false});tiny=result.career
    assert(!result.blocked,`blocked ${previous}`);assert(tiny.league.currentDate>previous,`stalled ${previous}`);days++
    const players=Object.values(tiny.world.teamsById).flatMap(t=>t.players)
    observedMatchLoad ||= players.some(p=>p.workload?.history?.some(d=>d.matchLoad>0))
    observedTraining ||= Object.values(tiny.world.teamsById).some(t=>(t.teamTraining?.sessionLog?.length??0)>0)
    for(const p of players){assert(Number.isFinite(p.matchStamina)&&p.matchStamina>=0&&p.matchStamina<=100);assert(Number.isFinite(p.developmentFatigue)&&p.developmentFatigue>=0&&p.developmentFatigue<=100)}
    if(days===120){const saved=JSON.parse(JSON.stringify(careerForStorage(tiny))),first=players[0];tiny=rehydrateCareerWorld(saved);assert.equal(tiny.league.teamsById,tiny.world.teamsById);assert.equal(tiny.world.teamsById[Object.keys(tiny.world.teamsById)[0]].players.find(p=>p.id===first.id)?.developmentFatigue,first.developmentFatigue);reloaded=true}
    if(days%60===0){console.log(`Progress tiny season: ${days} days, ${tiny.league.currentDate}, matches ${tiny.league.matchHistory.length}`);await new Promise(resolve=>setTimeout(resolve,0))}
  }
  assert.equal(tiny.league.status,'complete');assert(days<=366);assert(observedMatchLoad);assert(observedTraining);assert(reloaded)
  assert.equal(tiny.league.matchHistory.length,3);assert(tiny.league.cup.championTeamId)
  tiny=startNextSeason(tiny);assert.equal(tiny.seasonYear,2026);assert.equal(tiny.league.currentDate,'2026-08-01');assert.equal(tiny.league.calendar.mode,'domestic')
})
await test('Individual ordinary, summer-club and national-qualifying holidays exclude club training',()=>{
  const ordinary=structuredClone(holidayBase);scheduleSeasonalHolidays(ordinary,'2026-06-01');let t=Object.values(ordinary.world.teamsById)[0],p=t.players[0]
  assert.equal(p.holidayFrom,'2026-06-01');assert.equal(p.holidayUntil,'2026-06-14');assert.equal(playerSessionPlan(p,{date:'2026-06-06',type:'physical'},t).reason,'holiday')
  const summer=structuredClone(holidayBase);t=Object.values(summer.world.teamsById)[0];summer.internationalClubCups={editions:[{kind:'wucc',seasonYear:2025,phase:'groups',teamIds:[t.id]}]};scheduleSeasonalHolidays(summer,'2026-06-01');assert.equal(t.players[0].holidayFrom,'2026-07-01');assert.equal(t.players[0].holidayUntil,'2026-07-14')
  const national=structuredClone(holidayBase);national.world.worldConfig.international.nationals=true;national.nationalTeams={nextTournament:{kind:'euro',year:2027},qualifying:{campaigns:[{groups:[{countryIds:[meta.countryId]}]}]}}
  const ids=new Set(selectNationalSquad(national.world,national,meta.countryId,{seasonYear:2026}).players.map(p=>p.id))
  scheduleSeasonalHolidays(national,'2026-06-01');t=Object.values(national.world.teamsById).find(t=>t.players.some(p=>ids.has(p.id)));assert(t);p=t.players.find(p=>ids.has(p.id))
  assert.equal(p.holidayFrom,'2026-07-15');assert.equal(p.holidayUntil,'2026-07-28');assert.equal(playerSessionPlan(p,{date:'2026-07-08',type:'physical'},t).reason,'nationalTeam')
})
await test('Offseason development preserves domestic fatigue and freshness instead of resetting',()=>{
  const c=structuredClone(holidayBase),team=Object.values(c.world.teamsById)[0],p=team.players[0];p.trainingFocus='balanced';p.developmentFatigue=77;p.matchStamina=29;p.injury={daysRemaining:8,type:'strain'}
  applyOffseasonDevelopment(c.world,{playerTeamId:team.id,skipAiPlans:true,seed:881});assert(p.developmentFatigue>=77);assert.equal(p.matchStamina,29);assert.equal(p.injury.daysRemaining,8)
})
await test('Default Poland fast-forward reaches first fixture; Continue plays it with shared workload',async()=>{
  const conf=defaultWorldConfig(),league=DOMESTIC_LEAGUES.find(l=>conf.leagues[l.id]==='playable')
  let c=createCareer(1,{competition:'domestic',managerName:'Poland QA',playerTeamId:league.teams[0].id,seasonYear:2025,worldConfig:conf})
  const first=await simulateCareerUntil(c,{untilMatch:true,maxDays:40,onProgress:({daysAdvanced,currentDate})=>{if(daysAdvanced%12===0)console.log(`Progress Poland: ${daysAdvanced} days, ${currentDate}`)}});c=first.career
  assert(first.daysAdvanced>0&&first.daysAdvanced<=40);const date=c.league.currentDate
  const next=advanceCareerDay(c,{autoSimulatePlayer:true,allowRandomEvents:false});c=next.career;assert(!next.blocked);assert(c.league.currentDate>date)
  assert(c.league.matchHistory.some(m=>m.homeTeamId===c.playerTeamId||m.awayTeamId===c.playerTeamId));assert(c.world.teamsById[c.playerTeamId].players.some(p=>p.workload?.history?.some(d=>d.matchLoad>0)))
  const loaded=rehydrateCareerWorld(JSON.parse(JSON.stringify(careerForStorage(c))));assert.equal(loaded.league.internationalClubCups,loaded.internationalClubCups)
})
console.log(`Career runtime: ${passed} passed, ${failed} failed`)
if(failed)process.exitCode=1
