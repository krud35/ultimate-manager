// Standalone Node runner with Vite-compatible extension/directory and CJS resolution.
import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
const lzPath=createRequire(import.meta.url).resolve('lz-string')
const bridge='data:text/javascript,'+encodeURIComponent(`import { createRequire } from 'node:module';const lz=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(lzPath)});export const {compressToUTF16,decompressFromUTF16}=lz;`)
registerHooks({resolve(specifier,context,next){if(specifier==='lz-string')return{url:bridge,shortCircuit:true};try{return next(specifier,context)}catch(e){if(e.code==='ERR_UNSUPPORTED_DIR_IMPORT')return next(`${specifier}/index.js`,context);if(e.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.js'))return next(`${specifier}.js`,context);throw e}}})
globalThis.localStorage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}}
const {DOMESTIC_LEAGUES,defaultWorldConfig,setCountryMode}=await import('../src/data/domesticLeagues.js')
const {FRANCE_CLUBS}=await import('../src/data/world/franceClubs.js')
const {allocateFrenchRegions}=await import('../src/league/frenchRegions.js')
const {createDomesticSeason,finishDomesticSeason}=await import('../src/career/domesticWorld.js')
const {prepareFrenchPlayoffs}=await import('../src/league/frenchPlayoffs.js')
const {applyMatchResultToLeague}=await import('../src/league/leagueEngine.js')
const {getPlayerFixtureOnDate,areCompetitionsComplete}=await import('../src/league/dayEngine.js')
const {initializeInternationalClubCups}=await import('../src/career/internationalClubCups.js')
const {reconcileDomesticCalendar}=await import('../src/league/domesticCalendar.js')
const meta=DOMESTIC_LEAGUES.filter(l=>l.countryId==='fr')
assert.deepEqual(meta.map(l=>l.teams.length),[16,16,12,12,12,12])
assert.equal(FRANCE_CLUBS.length,80)
assert(FRANCE_CLUBS.every(t=>t.coordinates?.length===2))
assert.equal(new Set(FRANCE_CLUBS.map(t=>t.id)).size,80)
const config=setCountryMode({...defaultWorldConfig(),leagues:{},international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false}},'fr','playable')
const clubs=meta.flatMap(l=>l.teams).map(t=>({...t,players:Array.from({length:7},(_,i)=>({id:`${t.id}-${i}`,stats:{},matchStamina:100})),finances:{transferBudget:100000,salaryBudget:1000}}))
const world={teamsById:Object.fromEntries(clubs.map(t=>[t.id,t])),worldConfig:config}
const player=clubs.find(t=>t.tier===3&&!t.parentClubId)
let career={world,playerTeamId:player.id,seasonYear:2026}
const initialRegions=clubs.filter(t=>t.tier===3)
assert.deepEqual(allocateFrenchRegions(initialRegions,true),Object.fromEntries(initialRegions.map(t=>[t.id,t.domesticLeagueId])))
for(let year=2026;year<2031;year++) {
  career.seasonYear=year
  career.league=createDomesticSeason(world,player.id,year,year*17)
  const league=career.league,comps=[league,...league.otherLeagues]
  assert.equal(comps.find(c=>c.cup).cup.seeds.length,80)
  assert.equal(comps.find(c=>c.cup).cup.roundDates.length,7)
  assert(comps.flatMap(c=>c.fixtures).every(f=>!!f.date))
  for(const c of comps.filter(c=>c.tier===3))assert(c.fixtures.filter(f=>f.competition==='league').every(f=>f.date<=`${year+1}-04-30`))
  prepareFrenchPlayoffs(league);assert.equal(league.frenchPlayoffs.status,'awaiting-standings')
  assert.throws(()=>finishDomesticSeason(career),/playoffs must finish/)
  for(const c of comps) {
    c.teamIds.forEach((id,i)=>{c.standings[id].wins=100-i})
    for(const f of c.fixtures.filter(f=>f.competition==='league'))f.status='completed'
  }
  prepareFrenchPlayoffs(league)
  assert.equal(league.frenchPlayoffs.paths.length,2)
  assert.equal(league.fixtures.filter(f=>f.frenchPlayoff).length,10)
  assert.equal(new Set(league.frenchPlayoffs.paths.flatMap(p=>p.seeds)).size,12)
  for(const path of league.frenchPlayoffs.paths) {
    const [q1,q2,s1,s2]=path.matchIds.map(id=>league.fixtures.find(f=>f.id===id))
    assert.equal(s1.homeTeamId,path.seeds[0]);assert.equal(s2.homeTeamId,path.seeds[3])
    assert.deepEqual([q1.homeTeamId,q1.awayTeamId],[path.seeds[1],path.seeds[5]])
    assert.deepEqual([q2.homeTeamId,q2.awayTeamId],[path.seeds[4],path.seeds[2]])
    const savedPlayer=league.playerTeamId;league.playerTeamId=q1.homeTeamId
    assert.equal(getPlayerFixtureOnDate(league,q1.date)?.id,q1.id);league.playerTeamId=savedPlayer
  }
  const before=JSON.stringify(comps.map(c=>c.standings))
  assert(!areCompetitionsComplete(league))
  for(let round=0;round<3;round++) {
    for(const f of league.fixtures.filter(f=>f.frenchPlayoff&&f.status==='scheduled')) {
      assert.equal(new Date(f.date+'T12:00:00Z').getUTCDay(),3)
      assert(f.date>=`${year+1}-05-01`&&f.date<=`${year+1}-05-31`)
      applyMatchResultToLeague(league,{fixtureId:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeScore:15,awayScore:8,winner:f.homeTeamId,competition:f.competition,date:f.date,boxScore:[]})
    }
  }
  assert.equal(league.frenchPlayoffs.status,'complete')
  assert.equal(JSON.stringify(comps.map(c=>c.standings)),before,'playoffs must not alter league tables')
  assert.equal(league.frenchPlayoffs.promotedTeamIds.length,2)
  // Real cup progression including byes, all 79 played ties.
  const owner=comps.find(c=>c.cup);owner.teamsById=world.teamsById
  let cupGames=0
  for(let round=0;round<7;round++)for(const f of owner.fixtures.filter(f=>f.competition==='cup'&&f.status!=='completed'&&f.homeTeamId&&f.awayTeamId)) {
    applyMatchResultToLeague(owner,{fixtureId:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeScore:15,awayScore:8,winner:f.homeTeamId,competition:'cup',date:f.date,boxScore:[]});cupGames++
  }
  assert.equal(cupGames,79);assert.equal(owner.cup.status,'complete')
  assert(areCompetitionsComplete(league))
  // Exercise JSON save/load before applying movements.
  career=JSON.parse(JSON.stringify(career));career.world=world
  finishDomesticSeason(career);const history=world.domesticHistory.length;finishDomesticSeason(career);assert.equal(world.domesticHistory.length,history)
  for(const l of meta)assert.equal(Object.values(world.teamsById).filter(t=>t.domesticLeagueId===l.id).length,l.tier===3?12:16)
  assert.equal(world.domesticMovements.filter(m=>m.type==='promotions').length,4)
  assert.equal(world.domesticMovements.filter(m=>m.type==='relegations').length,4)
}
console.log('French pyramid: 80 clubs, seven-round cup, seeded playoffs, player fixtures, save/load and five balanced season rollovers passed.')
const oldWorld={teamsById:Object.fromEntries(clubs.slice(0,14).map(t=>[t.id,{...t,tier:1,domesticLeagueId:'fr-1'}])),worldConfig:{...config,leagues:{'fr-1':'playable'}}}
const oldSeason=createDomesticSeason(oldWorld,clubs[0].id,2026,11)
assert.equal(oldSeason.teamIds.length,14)
assert(!oldSeason.frenchPyramid && !oldSeason.frenchPlayoffs)
const {createCareer}=await import('../src/career/careerModel.js')
const actual=createCareer(0,{competition:'domestic',seasonYear:2026,managerName:'France QA',playerTeamId:player.id,worldConfig:config})
assert.equal(Object.values(actual.world.teamsById).filter(t=>t.countryId==='fr').length,80)
assert.equal(actual.world.teamsById[player.id].coordinates.length,2)
assert.equal(actual.league.frenchPlayoffs.status,'awaiting-standings')
assert(actual.world.domesticLeagueCatalog.every(l=>l.frenchPyramid))
console.log('Actual French career creation and compatibility with the old 14-club French league passed.')
actual.world.worldConfig.international={nationals:true,europe:true,paucc:true,aoucc:true,wucc:true}
initializeInternationalClubCups(actual)
reconcileDomesticCalendar(actual.league)
for(const comp of [actual.league,...actual.league.otherLeagues])for(const f of comp.fixtures.filter(f=>f.competition==='league'))assert(f.date<=`2027-${comp.tier===3?'04-30':'05-07'}`)
console.log('French calendar also fits international club cup reservations.')
