import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
const lzPath=createRequire(import.meta.url).resolve('lz-string')
const bridge='data:text/javascript,'+encodeURIComponent(`import { createRequire } from 'node:module';const lz=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(lzPath)});export const {compressToUTF16,decompressFromUTF16}=lz;`)
registerHooks({resolve(specifier,context,next){if(specifier==='lz-string')return{url:bridge,shortCircuit:true};try{return next(specifier,context)}catch(e){if(e.code==='ERR_UNSUPPORTED_DIR_IMPORT')return next(`${specifier}/index.js`,context);if(e.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.js'))return next(`${specifier}.js`,context);throw e}}})
const {buildDomesticCalendar}=await import('../src/league/domesticCalendar.js')
const {maybeStartNationalTeamSeason}=await import('../src/career/nationalTeamSeason.js')
const {resolveQualifyingGroupStage,buildQualifyingPlayoff}=await import('../src/career/nationalTeamQualifying.js')
const {resolveFinalsGroupStage,buildFinalsKnockout}=await import('../src/career/nationalTeamFinals.js')

let checked=0
const gap=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000
for(let seasonYear=2025;seasonYear<=2033;seasonYear++)for(const kind of ['euro','world']) {
  const calendar=buildDomesticCalendar({seasonYear,teamIds:['one','two']})
  const career={seasonYear,world:{teamsById:{},worldConfig:{international:{nationals:true}}},nationalTeams:{nextTournament:{kind,year:seasonYear+2}}}
  maybeStartNationalTeamSeason(career,{seasonYear,calendar})
  const qualifying=career.nationalTeams.qualifying
  assert(qualifying,`${kind} ${seasonYear}: qualifying missing`)
  for(const campaign of qualifying.campaigns) {
    const games=campaign.fixtures
    assert(games.every(f=>f.date>=`${seasonYear+1}-07-02`&&f.date<=`${seasonYear+1}-07-15`))
    const teamIds=new Set(games.flatMap(f=>[f.homeTeamId,f.awayTeamId]))
    for(const teamId of teamIds){const dates=games.filter(f=>f.homeTeamId===teamId||f.awayTeamId===teamId).map(f=>f.date).sort();assert.equal(new Set(dates).size,dates.length);for(let i=1;i<dates.length;i++)assert(gap(dates[i],dates[i-1])>=2)}
    resolveQualifyingGroupStage(campaign,{totalSpots:campaign.zoneTotalSpots??qualifying.totalSpots})
    buildQualifyingPlayoff(campaign,[campaign.playoffDate])
    for(const f of campaign.playoff.matches){assert(f.date<=`${seasonYear+1}-07-15`);assert(f.date>=`${seasonYear+1}-07-02`);assert(games.every(g=>gap(f.date,g.date)>=2),`${kind} ${seasonYear}: playoff overlaps groups`)}
  }
  // The following season's tournament must use its new calendar, never old qualifiers' dates.
  const nextYear=seasonYear+1,nextCalendar=buildDomesticCalendar({seasonYear:nextYear,teamIds:['one','two']})
  career.seasonYear=nextYear
  maybeStartNationalTeamSeason(career,{seasonYear:nextYear,calendar:nextCalendar})
  const finals=career.nationalTeams.finals
  assert(finals,`${kind} ${seasonYear}: finals missing`)
  const seeds=resolveFinalsGroupStage(finals)
  buildFinalsKnockout(finals,seeds)
  const games=[...finals.fixtures,...finals.knockout.matches]
  assert(games.every(f=>f.date>=`${nextYear+1}-07-02`&&f.date<=`${nextYear+1}-07-15`))
  const final=finals.knockout.matches.find(f=>f.round==='final')
  assert.equal(final.date,`${nextYear+1}-${kind==='world'?'07-14':'07-12'}`)
  assert(finals.knockout.matches.filter(f=>f.round==='semifinal').every(f=>gap(final.date,f.date)>=2))
  const bronze=finals.knockout.matches.find(f=>f.round==='bronze')
  if(bronze)assert(gap(final.date,bronze.date)>=1)
  checked++
}
console.log(`Passed ${checked} national qualifying/finals calendar combinations (2025–2033, Europe and world)`)
