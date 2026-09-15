import assert from 'node:assert/strict'
import { DOMESTIC_LEAGUES, DOMESTIC_COUNTRIES, DOMESTIC_CONTINENTS, EXCLUDED_ODD_LEAGUE_CLUBS, defaultWorldConfig, setCountryMode, setCountryDepth, normalizeWorldConfig, estimateWorldCost } from '../src/data/domesticLeagues.js'
import additions from '../src/data/world/userClubAdditions.json' with { type: 'json' }
const teams = DOMESTIC_LEAGUES.flatMap(l => l.teams)
for (const [id, count] of Object.entries({ 'be-1':16,'be-2':16,'cz-1':16,'ie-1':16,'au-1':16,'au-2':16,'gb-1':16,'gb-2':14,'za-1':20,'ph-1':20,'centralEurope-1':16,'nordic-1':20,'baltic-1':16 })) assert.equal(DOMESTIC_LEAGUES.find(l => l.id === id)?.teams.length, count, id)
assert.equal(new Set(teams.map(t => t.id)).size, teams.length)
for (const club of additions.clubs.filter(c=>c.countryId!=='fr')) assert([...teams, ...EXCLUDED_ODD_LEAGUE_CLUBS].some(t => t.countryId === club.countryId && t.name === club.name && (!club.city || t.city === club.city)), `${club.countryId}: ${club.name}`)
assert(!DOMESTIC_COUNTRIES.some(c => ['hu','es','pt'].includes(c.id)))
assert(DOMESTIC_COUNTRIES.some(c=>c.id==='fr'&&c.leagues.length===6))
assert(teams.some(t => t.countryId === 'hu'))
for (const id of ['at','sk','rs','hu','dk','se','fi','lt','lv','ee']) assert(!DOMESTIC_COUNTRIES.some(c => c.id === id))
assert(!DOMESTIC_LEAGUES.some(l => ['za-2','ph-2'].includes(l.id)))
const baltic = DOMESTIC_LEAGUES.find(l => l.id === 'baltic-1')
assert.deepEqual(['lt','lv','ee'].map(id => baltic.teams.filter(t => t.countryId === id).length), [8,4,4])
for (const name of ['Salaspils','Ventspils FK','Valmiera','Ogre','Ultimate Saku','Tartu Turbulence','Tallinna Frisbeeklubi','Freeflyers']) assert(baltic.teams.some(t => t.name === name))
const iberia = DOMESTIC_LEAGUES.find(l => l.countryId === 'iberia')
assert.deepEqual([...new Set(iberia.teams.map(t => t.countryId))].sort(), ['es','pt'])
for (const c of DOMESTIC_COUNTRIES) for (const mode of ['playable','transfers','off']) {
  const config = setCountryMode(defaultWorldConfig(), c.id, mode)
  assert(c.leagues.every(l => config.leagues[l.id] === mode))
}
const off = setCountryMode(defaultWorldConfig(), 'za', 'off')
const transfers = setCountryMode(off, 'za', 'transfers')
const playable = setCountryMode(off, 'za', 'playable')
assert(estimateWorldCost(off).score < estimateWorldCost(transfers).score)
assert(estimateWorldCost(transfers).score < estimateWorldCost(playable).score)
assert.equal(estimateWorldCost(playable).playableClubs - estimateWorldCost(off).playableClubs, 20)
assert(DOMESTIC_LEAGUES.every(l => l.teams.length <= 20 && l.teams.length % 2 === 0))
assert.equal(DOMESTIC_CONTINENTS.flatMap(c => c.countries).length, DOMESTIC_COUNTRIES.length)
assert(DOMESTIC_CONTINENTS.every(c => c.countries.every(country => country.continent === c.id)))
console.log(`Country catalogue OK: ${DOMESTIC_COUNTRIES.length} selectable groups, ${DOMESTIC_LEAGUES.length} leagues, ${teams.length} clubs; ${additions.clubs.length} screenshot entries covered.`)
const { registerHooks } = await import('node:module')
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context) } catch (error) {
  if (error.code === 'ERR_UNSUPPORTED_DIR_IMPORT') return next(`${specifier}/index.js`, context)
  if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) return next(`${specifier}.js`, context)
  throw error
} } })
const { buildDomesticWorldTemplate, createDomesticSeason } = await import('../src/career/domesticWorld.js')
let config = { ...defaultWorldConfig(), leagues: {}, international: { nationals:false,europe:false,paucc:false,aoucc:false,wucc:false } }
for (const id of ['za', 'in', 'centralEurope', 'nordic', 'baltic', 'iberia', 'gb']) config = setCountryMode(config, id, 'playable')
const template = buildDomesticWorldTemplate(config, 2026, 4567)
const holidayPolicy = template.worldConfig.christmasBreakByCountry
assert(Object.values(holidayPolicy).includes(true) && Object.values(holidayPolicy).includes(false))
assert.deepEqual(buildDomesticWorldTemplate(config, 2026, 4567).worldConfig.christmasBreakByCountry, holidayPolicy)
for (const club of template.teams) {
  assert(club.players.length >= 24, club.name)
  assert(club.players.every(p => p.firstName && p.lastName), club.name)
}
const world = { teamsById: Object.fromEntries(template.teams.map(t => [t.id,t])), worldConfig: template.worldConfig }
const season = createDomesticSeason(world, template.teams.find(t => t.countryId === 'za').id, 2026, 4567)
assert.equal(season.cup.seeds.length, 20)
assert.equal([season,...season.otherLeagues].filter(l => l.countryId === 'za').flatMap(l => l.teamIds).length, 20)
// Legacy league ids remain usable after removal/merging in the new catalogue.
const legacy = { teamsById: Object.fromEntries(template.teams.slice(0, 4).map((t,i) => [t.id, { ...t, countryId:'hu', domesticLeagueId:'hu-1', tier:1, id:t.id, name:`Legacy ${i}` }])), worldConfig: { ...config, leagues:{'hu-1':'playable'} } }
const oldSeason = createDomesticSeason(legacy, Object.keys(legacy.teamsById)[0], 2027, 123)
assert.equal(oldSeason.id, 'hu-1')
assert.equal(oldSeason.teamIds.length, 4)
assert.equal(createDomesticSeason(JSON.parse(JSON.stringify(legacy)), oldSeason.playerTeamId, 2028, 124).id, 'hu-1')
console.log('Generated rosters, South African season and legacy catalogue rollover OK.')

for(const group of DOMESTIC_COUNTRIES) for(const depth of new Set(group.leagues.map(l=>l.tier))) {
  const selected=normalizeWorldConfig(setCountryDepth(setCountryMode(defaultWorldConfig(),group.id,'playable'),group.id,depth))
  for(const l of group.leagues)assert.equal(selected.leagues[l.id],l.tier<=depth?'playable':'off')
}
const onlyLower=normalizeWorldConfig({leagues:{'be-2':'playable'}})
assert.equal(onlyLower.leagues['be-1'],'playable')
const onlyRegion=normalizeWorldConfig({leagues:{'fr-3-nord':'transfers'}})
assert(DOMESTIC_LEAGUES.filter(l=>l.countryId==='fr').every(l=>onlyRegion.leagues[l.id]==='transfers'))
for(const depth of [1,2]) {
  const selected=setCountryDepth(setCountryMode({...defaultWorldConfig(),leagues:{},international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false}},'fr','playable'),'fr',depth)
  const template=buildDomesticWorldTemplate(selected,2026,789)
  assert.equal(template.teams.length,depth*16)
  const w={teamsById:Object.fromEntries(template.teams.map(t=>[t.id,t])),worldConfig:template.worldConfig}
  const l=createDomesticSeason(w,template.teams[0].id,2026,789)
  assert.equal(l.otherLeagues.length,depth-1)
  assert(!l.frenchPlayoffs)
  const {finishDomesticSeason}=await import('../src/career/domesticWorld.js')
  finishDomesticSeason({world:w,league:l,seasonYear:2026,playerTeamId:l.playerTeamId})
  assert.equal(w.domesticMovements.length,depth===1?0:4)
  assert.equal(createDomesticSeason(w,l.playerTeamId,2027,790).otherLeagues.length,depth-1)
}
console.log('League depth: upper-tier requirements, parallel regions, partial French seasons and rollover passed.')
