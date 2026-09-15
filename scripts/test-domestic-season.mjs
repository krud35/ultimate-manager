// Standalone Node runner with Vite-compatible extension/directory and CJS resolution.
import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
const lzPath=createRequire(import.meta.url).resolve('lz-string')
const bridge='data:text/javascript,'+encodeURIComponent(`import { createRequire } from 'node:module';const lz=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(lzPath)});export const {compressToUTF16,decompressFromUTF16}=lz;`)
registerHooks({resolve(specifier,context,next){if(specifier==='lz-string')return{url:bridge,shortCircuit:true};try{return next(specifier,context)}catch(e){if(e.code==='ERR_UNSUPPORTED_DIR_IMPORT')return next(`${specifier}/index.js`,context);if(e.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.js'))return next(`${specifier}.js`,context);throw e}}})
globalThis.localStorage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}}
const {createDomesticSeason,finishDomesticSeason}=await import('../src/career/domesticWorld.js')
const {reconcileDomesticCalendar}=await import('../src/league/domesticCalendar.js')
const {advanceCupAfterMatch,syncCupMatchesIntoFixtures}=await import('../src/league/cupBracket.js')
const {DOMESTIC_LEAGUES,defaultWorldConfig,normalizeWorldConfig}=await import('../src/data/domesticLeagues.js')
const {initializeInternationalClubCups,advanceInternationalClubCups,internationalClubFixtures,snapshotInternationalQualification}=await import('../src/career/internationalClubCups.js')
const {createCareer,startNextSeason}=await import('../src/career/careerModel.js')
const {applyMatchResultToLeague}=await import('../src/league/leagueEngine.js')
const {advanceCalendarDay}=await import('../src/league/dayEngine.js')
let passed=0,failed=0
function test(name,fn){try{fn();passed++;console.log(`OK ${name}`)}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`)}}
const weekday=d=>new Date(`${d}T12:00:00Z`).getUTCDay()
const gap=(a,b)=>Math.abs((Date.parse(a)-Date.parse(b))/86400000)
function world(n,config={}){
 const meta=DOMESTIC_LEAGUES.find(l=>l.id==='pl-1')??DOMESTIC_LEAGUES[0]
 const teams=Array.from({length:n},(_,i)=>({id:`test-${String(i).padStart(2,'0')}`,name:`Test ${i}`,countryId:meta.countryId,domesticLeagueId:meta.id,tier:1,reputation:80-i,players:Array.from({length:14},(_,j)=>({id:`p-${i}-${j}`,stats:{},matchStamina:100})),finances:{transferBudget:100000,salaryBudget:1000}}))
 return {teamsById:Object.fromEntries(teams.map(t=>[t.id,t])),worldConfig:{leagues:Object.fromEntries(DOMESTIC_LEAGUES.map(l=>[l.id,l.id===meta.id?'playable':'off'])),international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false,...config},christmasBreak:true}}
}
function verifyDomesticSchedule(league,n){
 const games=league.fixtures.filter(f=>f.competition==='league')
 assert.equal(games.length,n*(n-1));assert.equal(new Set(games.map(f=>f.id)).size,games.length)
 for(const id of league.teamIds){const teamGames=games.filter(f=>[f.homeTeamId,f.awayTeamId].includes(id));assert.equal(teamGames.length,2*(n-1));for(const other of league.teamIds.filter(t=>t!==id)){assert.equal(teamGames.filter(f=>f.homeTeamId===id&&f.awayTeamId===other).length,1);assert.equal(teamGames.filter(f=>f.homeTeamId===other&&f.awayTeamId===id).length,1)}}
 for(const f of games){assert([0,1,5,6].includes(weekday(f.date)));assert(f.date>=`${league.seasonYear}-08-14`&&f.date<=`${league.seasonYear+1}-05-31`)}
 for(const f of league.cup.matches)assert([2,3,4].includes(weekday(f.date)))
 for(const id of league.teamIds){const dates=[...games.filter(f=>[f.homeTeamId,f.awayTeamId].includes(id)).map(f=>f.date),...league.cup.roundDates].sort();for(let i=1;i<dates.length;i++)assert(gap(dates[i],dates[i-1])>=3,`${id}: ${dates[i-1]} -> ${dates[i]}`)}
 assert(league.calendar.nationalTournamentFinals.dates.every(d=>d>=`${league.seasonYear+1}-07-02`&&d<=`${league.seasonYear+1}-07-14`))
}
for(const n of [2,3,16,17,20])test(`Domestic ${n}-club season: complete home/away pairs, weekends, midweek cups and 72h rest`,()=>{const w=world(n);const l=createDomesticSeason(w,Object.keys(w.teamsById)[0],2025,412);verifyDomesticSchedule(l,n)})
test('Default world configuration includes playable clubs',()=>{assert(Object.values(normalizeWorldConfig().leagues).includes('playable'))})
test('Domestic cup byes and knockout progress finish for 2,3,16,17,20 clubs',()=>{
 for(const n of [2,3,16,17,20]){const w=world(n),l=createDomesticSeason(w,Object.keys(w.teamsById)[0],2025,412);let matches=0;for(let pass=0;pass<12&&l.cup.status!=='complete';pass++){const due=l.cup.matches.filter(f=>f.status!=='completed'&&f.homeTeamId&&f.awayTeamId);assert(due.length>0,`stalled ${n}`);for(const f of due){advanceCupAfterMatch(l.cup,{fixtureId:f.id,homeScore:15,awayScore:8,winner:f.homeTeamId});matches++}syncCupMatchesIntoFixtures(l)}assert.equal(l.cup.status,'complete');assert.equal(matches,n-1)}
})
test('Five domestic season creations and finalized history stay idempotent',()=>{
 const w=world(16);for(let year=2025;year<2030;year++){const l=createDomesticSeason(w,Object.keys(w.teamsById)[0],year,412+year);verifyDomesticSchedule(l,16);const c={world:w,league:l,seasonYear:year,playerTeamId:l.playerTeamId};finishDomesticSeason(c);finishDomesticSeason(c)}assert.equal(w.domesticHistory.length,5)
})
test('League plus continental finalists retain 72h gaps through all generated rounds',()=>{
 const w=world(16,{europe:true}),l=createDomesticSeason(w,Object.keys(w.teamsById)[0],2025,412),c={world:w,league:l,playerTeamId:null,seasonYear:2025}
 initializeInternationalClubCups(c);reconcileDomesticCalendar(l)
 const results=(a,b)=>a.id<b.id?{homeScore:15,awayScore:8,boxScore:[]}:{homeScore:8,awayScore:15,boxScore:[]}
 for(let pass=0;pass<10;pass++){for(const f of l.cup.matches.filter(f=>f.status!=='completed'&&f.homeTeamId&&f.awayTeamId)){const r=results({id:f.homeTeamId},{id:f.awayTeamId});advanceCupAfterMatch(l.cup,{fixtureId:f.id,...r,winner:r.homeScore>r.awayScore?f.homeTeamId:f.awayTeamId})}syncCupMatchesIntoFixtures(l)}
 advanceInternationalClubCups(c,'2026-06-30',{simulatePlayer:true,simulateMatch:results});reconcileDomesticCalendar(l)
 for(const id of l.teamIds){const games=l.fixtures.filter(f=>[f.homeTeamId,f.awayTeamId].includes(id)&&!f.bye).sort((a,b)=>a.date.localeCompare(b.date));for(let i=1;i<games.length;i++)assert(gap(games[i].date,games[i-1].date)>=3,`${id}: ${games[i-1].competition} ${games[i-1].date} -> ${games[i].competition} ${games[i].date}`)}
 snapshotInternationalQualification(c);assert(c.internationalClubCups.domesticSnapshot)
 assert(internationalClubFixtures(c).every(f=>f.status==='completed'))
})
test('Completed tiny season calendar reaches official end without hanging',()=>{
 const w=world(2),l=createDomesticSeason(w,Object.keys(w.teamsById)[0],2025,412)
 for(const f of l.fixtures)f.status='completed';for(const f of l.cup.matches)f.status='completed';l.cup.status='complete'
 let days=0;while(l.status!=='complete'&&days<400){const previous=l.currentDate;advanceCalendarDay(l,{autoSimulatePlayer:true});assert(l.currentDate>previous);days++}
 assert(days<=366);assert.equal(l.status,'complete');assert(l.currentDate>='2026-07-31')
})
test('Every local league can coexist with cups and future international knockout rounds',()=>{
 const teams=DOMESTIC_LEAGUES.flatMap(meta=>meta.teams.map((t,i)=>({...t,reputation:80-i,players:Array.from({length:7},(_,j)=>({id:`${t.id}-p${j}`,stats:{}})),finances:{transferBudget:100000,salaryBudget:1000}})))
 const w={teamsById:Object.fromEntries(teams.map(t=>[t.id,t])),worldConfig:{leagues:Object.fromEntries(DOMESTIC_LEAGUES.map(l=>[l.id,'playable'])),international:{nationals:true,europe:true,paucc:true,aoucc:true,wucc:true},christmasBreak:true}}
 const l=createDomesticSeason(w,teams[0].id,2025,987),c={world:w,league:l,playerTeamId:null,seasonYear:2025}
 initializeInternationalClubCups(c);reconcileDomesticCalendar(l)
 advanceInternationalClubCups(c,'2026-06-30',{simulatePlayer:true,simulateMatch:()=>({homeScore:15,awayScore:8,boxScore:[]})});reconcileDomesticCalendar(l)
 for(const comp of [l,...l.otherLeagues])for(const f of comp.fixtures.filter(f=>f.competition==='league'))assert([0,1,5,6].includes(weekday(f.date)))
 assert.equal(l.otherLeagues.length+1,DOMESTIC_LEAGUES.length)
})
test('Actual default domestic career creates registered world, managers and cup fixtures',()=>{
 const config=defaultWorldConfig(),meta=DOMESTIC_LEAGUES.find(l=>config.leagues[l.id]==='playable')
 const c=createCareer(0,{competition:'domestic',managerName:'Domestic QA',playerTeamId:meta.teams[0].id,seasonYear:2025,worldConfig:config})
 assert.equal(c.competition,'domestic');assert.equal(c.league.calendar.mode,'domestic');assert(c.world.managersById);assert(c.league.cup);assert(c.league.fixtures.some(f=>f.competition==='international-club'))
})
test('Career-model rollover preserves domestic world through three seasons',()=>{
 const meta=DOMESTIC_LEAGUES.filter(l=>DOMESTIC_LEAGUES.filter(other=>other.countryId===l.countryId).length===1).sort((a,b)=>a.teams.length-b.teams.length)[0],config={leagues:Object.fromEntries(DOMESTIC_LEAGUES.map(l=>[l.id,l.id===meta.id?'playable':'off'])),international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false},christmasBreak:true}
 let c=createCareer(1,{competition:'domestic',managerName:'Rollover QA',playerTeamId:meta.teams[0].id,seasonYear:2025,worldConfig:config})
 for(let year=2025;year<2027;year++){
   for(let pass=0;pass<8;pass++)for(const f of c.league.fixtures.filter(f=>f.status!=='completed'&&f.homeTeamId&&f.awayTeamId))applyMatchResultToLeague(c.league,{fixtureId:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeScore:15,awayScore:8,winner:f.homeTeamId,competition:f.competition,boxScore:[],date:f.date})
   c.league.currentDate=`${year+1}-07-31`;c.league.status='complete'
   c=startNextSeason(c);assert.equal(c.seasonYear,year+1);assert.equal(c.league.calendar.mode,'domestic');assert.equal(c.league.teamIds.length,meta.teams.length);assert.equal(c.competition,'domestic');assert(c.world.managersById[c.world.teamsById[c.playerTeamId].managerId])
 }
 assert.equal(c.world.domesticHistory.length,2)
})
console.log(`Domestic season: ${passed} passed, ${failed} failed`)
if(failed)process.exitCode=1
