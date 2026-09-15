import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { applyMatchResultToLeague } from '../src/league/leagueEngine.js'
import { initializeInternationalClubCups, advanceInternationalClubCups, internationalClubFixtures, recordInternationalClubCupResult, completeInternationalClubSeason, pendingInternationalPlayerFixture, internationalCoefficientRanking, snapshotInternationalQualification, internationalRegisteredTeam, qualifyInternationalClubs } from '../src/career/internationalClubCups.js'
const countries=['pl','de','fr','gb','be','us','ca','co','jp','au','nz','za']
function career(n=48,international={europe:true,paucc:true,aoucc:true,wucc:true}){
 const teams=Array.from({length:n},(_,i)=>({id:`club-${i}`,name:`Club ${i}`,countryId:countries[i%countries.length],domesticLeagueId:`league-${countries[i%countries.length]}`,reputation:80-i/2,players:Array.from({length:14},(_,j)=>({id:`p-${i}-${j}`,stats:{},matchStamina:100})),finances:{transferBudget:100000,salaryBudget:1000}}))
 const teamsById=Object.fromEntries(teams.map(t=>[t.id,t]))
 return {seasonYear:2025,playerTeamId:teams[0]?.id,world:{teamsById,worldConfig:{international}},league:{teamsById,fixtures:[],standings:Object.fromEntries(teams.map((t,i)=>[t.id,{teamId:t.id,wins:n-i,pointsFor:100,pointsAgainst:50}])),matchHistory:[],currentDate:'2025-08-01'}}
}
const simulateMatch=(_a,_b,seed)=>({homeScore:15,awayScore:seed%14,boxScore:[]})
let checks=0
function test(name,fn){fn();console.log(`OK ${name}`);checks++}
test('Disabled competitions create no fixtures; WUCC is every four years',()=>{
 const c=career(48,{europe:false,paucc:false,aoucc:false,wucc:false});initializeInternationalClubCups(c);assert.equal(internationalClubFixtures(c).length,0)
 c.world.worldConfig.international.wucc=true;c.seasonYear=2026;initializeInternationalClubCups(c);assert.equal(internationalClubFixtures(c).length,0)
 c.seasonYear=2029;initializeInternationalClubCups(c);assert(c.internationalClubCups.editions.some(e=>e.kind==='wucc'))
})
test('Draw is deterministic, no duplicate fixtures after save reload, and WUCC includes Africa',()=>{
 const c=career();initializeInternationalClubCups(c);const original=JSON.stringify(c.internationalClubCups)
 const second=career();initializeInternationalClubCups(second);assert.equal(JSON.stringify(second.internationalClubCups),original)
 const reload=JSON.parse(JSON.stringify(c));initializeInternationalClubCups(reload);assert.equal(reload.league.fixtures.length,c.league.fixtures.length)
 const wucc=c.internationalClubCups.editions.find(e=>e.kind==='wucc');assert(wucc.teamIds.some(id=>c.world.teamsById[id].countryId==='za'))
 const eu=c.internationalClubCups.editions.find(e=>e.kind==='europe');assert(eu.fixtures.every(f=>[2,3,4].includes(new Date(f.date+'T12:00:00Z').getUTCDay())))
})
test('Player fixtures pause automatic progression; record and prizes are idempotent',()=>{
 const c=career(12,{europe:true,paucc:false,aoucc:false,wucc:false});initializeInternationalClubCups(c)
 advanceInternationalClubCups(c,'2026-07-15',{simulateMatch});const f=pendingInternationalPlayerFixture(c,'2026-07-15');assert(f)
 assert(recordInternationalClubCupResult(c,f.id,{homeScore:15,awayScore:10}));const snapshot=JSON.stringify(c)
 assert.equal(recordInternationalClubCupResult(c,f.id,{homeScore:15,awayScore:10}),false);assert.equal(JSON.stringify(c),snapshot)
 advanceInternationalClubCups(c,'2026-07-15',{simulateMatch,simulatePlayer:true});assert(completeInternationalClubSeason(c))
})
test('Full season resolves all groups and knockouts; no duplicate results, trophies or coefficients',()=>{
 const c=career();initializeInternationalClubCups(c);advanceInternationalClubCups(c,'2026-07-15',{simulateMatch,simulatePlayer:true});assert(completeInternationalClubSeason(c))
 assert.equal(c.internationalClubCups.history.length,2);assert.equal(new Set(internationalClubFixtures(c).map(f=>f.id)).size,internationalClubFixtures(c).length)
 for(const e of c.internationalClubCups.editions){assert(e.championTeamId);assert(e.fixtures.every(f=>f.status==='completed'));assert.equal(c.world.teamsById[e.championTeamId].trophies.filter(t=>t.id===`trophy:${e.id}`).length,1)}
 const before=JSON.stringify(c);advanceInternationalClubCups(c,'2026-07-15',{simulateMatch,simulatePlayer:true});assert.equal(JSON.stringify(c),before)
 assert(internationalCoefficientRanking(c,'countries',2026).length>0)
})
test('Cup squads survive reload and exclude later signings; new season qualification snapshot persists',()=>{
 const c=career();initializeInternationalClubCups(c);const e=c.internationalClubCups.editions.find(e=>e.kind==='wucc'),id=e.teamIds[0]
 const old=internationalRegisteredTeam(c,e,id,'2026-07-03').players.length;c.world.teamsById[id].players.push({id:'late-transfer'})
 assert.equal(internationalRegisteredTeam(c,e,id,'2026-07-04').players.length,old)
 snapshotInternationalQualification(c);c.seasonYear=2026;initializeInternationalClubCups(c)
 assert(c.internationalClubCups.editions.filter(e=>e.seasonYear===2026).every(e=>e.qualification.source==='previous-season'))
})
test('Small fields of every size complete with valid byes and no self-matches',()=>{
 for(let n=2;n<=35;n++) {const c=career(n,{europe:true,paucc:false,aoucc:false,wucc:false});for(const t of Object.values(c.world.teamsById))t.countryId='pl';initializeInternationalClubCups(c);advanceInternationalClubCups(c,'2026-07-15',{simulateMatch,simulatePlayer:true});assert(completeInternationalClubSeason(c),`size ${n}`);assert(internationalClubFixtures(c).every(f=>f.homeTeamId!==f.awayTeamId))}
})
test('Four-year summer cycle avoids national-team July window and continental/WUCC double participation',()=>{
 const c=career()
 for(let year=2025;year<2030;year++) {
   c.seasonYear=year;initializeInternationalClubCups(c);advanceInternationalClubCups(c,`${year+1}-07-15`,{simulateMatch,simulatePlayer:true})
   const editions=c.internationalClubCups.editions.filter(e=>e.seasonYear===year)
   if((year+1-2026)%4===0){assert(editions.some(e=>e.kind==='wucc'));assert(!editions.some(e=>['paucc','aoucc'].includes(e.kind)))}else{assert(editions.some(e=>e.kind==='paucc'));assert(editions.some(e=>e.kind==='aoucc'))}
   assert(editions.filter(e=>e.kind!=='europe').flatMap(e=>e.fixtures).every(f=>f.date>=`${year+1}-06-15`&&f.date<=`${year+1}-06-30`))
   snapshotInternationalQualification(c)
 }
 assert.equal(c.internationalClubCups.history.length,13)
})
test('League result routing preserves domestic standings',()=>{
 const c=career(2,{europe:true,paucc:false,aoucc:false,wucc:false});for(const t of Object.values(c.world.teamsById))t.countryId='pl';initializeInternationalClubCups(c)
 const before=JSON.stringify(c.league.standings),f=internationalClubFixtures(c)[0]
 applyMatchResultToLeague(c.league,{fixtureId:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeScore:15,awayScore:4,boxScore:[]})
 assert.equal(JSON.stringify(c.league.standings),before);assert(completeInternationalClubSeason(c));assert.equal(c.league.matchHistory.length,1)
})
test('Actual match engine writes shared player workload and goals on original world rosters',()=>{
 const world=createWorldFromTemplate(2025),originals=Object.values(world.teamsById).slice(0,2)
 const c=career(0,{europe:true,paucc:false,aoucc:false,wucc:false});c.world.teamsById=Object.fromEntries(originals.map((t,i)=>{t.countryId='pl';t.domesticLeagueId='pl-1';t.reputation=50+i;return[t.id,t]}));c.league.teamsById=c.world.teamsById;c.playerTeamId=null
 initializeInternationalClubCups(c);advanceInternationalClubCups(c,'2026-06-30',{simulatePlayer:true})
 assert(completeInternationalClubSeason(c));assert(originals.some(t=>t.players.some(p=>(p.workload?.pendingMatch??0)>0)))
 assert(originals.some(t=>t.players.some(p=>(p.stats?.goals??0)>0)))
})
test('Qualification remembers previous top tier through promotions; lower champions need cup or defending-title route',()=>{
 const c=career(6,{europe:true,paucc:false,aoucc:false,wucc:false}),teams=c.world.teamsById
 for(const [i,t] of Object.values(teams).entries()){t.countryId='pl';t.tier=i<2?1:2;t.domesticLeagueId=`pl-${t.tier}`;t.reputation=i<2?10:100-i}
 Object.assign(c.league,{id:'pl-1',countryId:'pl',tier:1,teamIds:['club-0','club-1'],standings:{'club-0':{teamId:'club-0',wins:8},'club-1':{teamId:'club-1',wins:7}}})
 c.league.otherLeagues=[{id:'pl-2',countryId:'pl',tier:2,teamIds:['club-2','club-3','club-4','club-5'],standings:Object.fromEntries([2,3,4,5].map(i=>[`club-${i}`,{teamId:`club-${i}`,wins:20-i}]))}]
 initializeInternationalClubCups(c)
 assert.deepEqual(new Set(qualifyInternationalClubs(c,'europe',2025)),new Set(['club-0','club-1']))
 c.league.cup={countryId:'pl',championTeamId:'club-4'}
 c.internationalClubCups.history.push({kind:'europe',seasonYear:2024,championTeamId:'club-5'})
 snapshotInternationalQualification(c)
 assert.equal(c.internationalClubCups.domesticSnapshot.teamMeta['club-2'].tier,2)
 assert.equal(c.internationalClubCups.domesticSnapshot.teamMeta['club-0'].countryId,'pl')
 // Promotion/relegation and fresh standings must not rewrite earned qualification.
 teams['club-2'].tier=1;teams['club-2'].domesticLeagueId='pl-1';teams['club-1'].tier=2;teams['club-1'].domesticLeagueId='pl-2'
 c.league.teamIds=['club-2','club-0'];c.league.standings={'club-2':{teamId:'club-2',wins:0},'club-0':{teamId:'club-0',wins:0}}
 c.league.otherLeagues[0].teamIds=['club-1','club-3','club-4','club-5']
 snapshotInternationalQualification(c)
 assert.equal(c.internationalClubCups.domesticSnapshot.teamMeta['club-2'].tier,2)
 const qualified=new Set(qualifyInternationalClubs(c,'europe',2026))
 assert.deepEqual(qualified,new Set(['club-0','club-1','club-4','club-5']))
 assert(!qualified.has('club-2'));assert(!qualified.has('club-3'))
})
console.log(`Passed ${checks} international club cup checks`)
