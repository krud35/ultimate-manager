import { focusedSelection } from './focusedWorld.js'
import { FRANCE_CLUBS } from './world/franceClubs.js'
import { FRENCH_REGIONS, allocateFrenchRegions } from '../league/frenchRegions.js'
import catalog from './world/worldLeagueTeams.json' with { type: 'json' }
import usauTeams from './usau/usauPyramidTeams.json' with { type: 'json' }
import usau from './usau/usauRealRosters.json' with { type: 'json' }
import cuc from './cuc/cucRealRosters.json' with { type: 'json' }
import buoc from './buoc/buocRealRosters.json' with { type: 'json' }
import psgu from './psgu/psguRealRosters.json' with { type: 'json' }
import eucsTeams from './eucs/eucsPyramidTeams.json' with { type: 'json' }
import eucs from './eucs/eucsRealRosters.json' with { type: 'json' }
import { ACADEMY_CONTINENTS, ACADEMY_COUNTRIES } from './academyScoutGeography.js'
import additions from './world/userClubAdditions.json' with { type: 'json' }
import ukAdditions from './world/ukOpenClubAdditions.json' with { type: 'json' }
import balticAdditions from './world/balticClubAdditions.json' with { type: 'json' }

export const domesticKey = s => String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const countryId = name => Object.keys(ACADEMY_COUNTRIES).find(id => ACADEMY_COUNTRIES[id].nameEn === name || ACADEMY_COUNTRIES[id].labelEn === name)
const teams = new Map()
function add(country, tier, source, roster = []) {
  const cid = ACADEMY_COUNTRIES[country] ? country : countryId(country)
  if (!cid || !source.name) return
  const key = `${cid}-${domesticKey(source.name.replace(/\s+open$/i, ''))}`
  if (teams.has(key)) {
    if (!teams.get(key).rawPlayers.length && roster.length) teams.get(key).rawPlayers = roster
    if (source.city) teams.get(key).city = source.city
    return
  }
  teams.set(key, { id: `dom-${key}`, name: source.name, countryId: cid, country: ACADEMY_COUNTRIES[cid].nameEn,
    tier: Number(tier) || 1, city: source.city ?? null, region: source.region ?? null, rawPlayers: roster, sourceId: source.id ?? null })
}
for (const team of usauTeams.teams) add('us', team.tier, team, usau.teams[team.id]?.players ?? [])
for (const [id, roster] of Object.entries(cuc.teams)) add('ca', 1, { id, name: roster.name ?? id.replace(/^cuc-/, '').split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ') }, roster.players)
for (const [tier, ids] of Object.entries(buoc.tiers)) for (const id of ids) add('be', tier, { id, ...buoc.teams[id] }, buoc.teams[id].players)
for (const [id, team] of Object.entries(psgu.teams)) add('pl', 1, { id, ...team }, team.players)
for (const league of Object.values(catalog.leagues)) for (const [tier, entries] of Object.entries(league.tiers)) {
  for (const team of entries) add(team.country ?? league.country, tier, team)
}
// Reuse European rosters in their own countries; the old cross-border pyramid is not instantiated.
for (const team of eucsTeams.teams) add(team.country, 1, team, eucs.teams[team.id]?.players ?? [])
// Explicit adjustments use the local source seeding, not randomly generated abilities.
const findTeam = (cid, name) => [...teams.values()].find(t => t.countryId === cid && t.name === name)
const remove = (cid, name) => { const team = findTeam(cid, name); if (team) teams.delete(team.id.slice(4)) }
findTeam('be', 'XL Open 1').tier = 2
remove('be', 'White Foxes Open')
remove('cz', 'Sunset')
remove('ie', 'Sligo Sirocco')
for (const name of ['Geelong Mudlarks', 'Extinction', 'Equinox', 'Quoll']) findTeam('au', name).tier = 1
// Screenshot aliases retain existing roster identities instead of creating a second club.
const aliases = { ch: { 'Freespeed Basel': 'Freespeed', 'Disc Club Panthers': 'Panthers Bern', 'Flying Angels': 'Flying Angels Bern', 'Zürich Ultimate': 'ZU', Ratrac: 'Ratrac Bern Ultimate' } }
for (const source of [...ukAdditions.clubs, ...additions.clubs, ...balticAdditions.clubs]) {
  const existing = findTeam(source.countryId, aliases[source.countryId]?.[source.name] ?? source.name)
  if (existing) Object.assign(existing, { name: source.name, city: source.city ?? existing.city, region: source.region ?? existing.region })
  else add(source.countryId, 1, source)
}
// New large countries get balanced levels, each at most 20 clubs (38 league rounds).
for (const cid of ['gb', 'ch', 'in', 'ph', 'za']) {
  const entries = [...teams.values()].filter(t => t.countryId === cid)
  const levels = Math.ceil(entries.length / 20), size = Math.ceil(entries.length / levels)
  entries.forEach((team, i) => { team.tier = Math.floor(i / size) + 1 })
}
const grouped = new Map()
for (const team of teams.values()) {
  const group = ['es', 'pt'].includes(team.countryId) ? 'iberia' : team.countryId
  const id = `${group}-${team.tier}`
  team.domesticLeagueId = id
  if (!grouped.has(id)) grouped.set(id, { id, countryId: group, tier: team.tier, hidden: group === 'fr',
    name: `${group === 'iberia' ? 'Liga Iberyjska' : ACADEMY_COUNTRIES[group].labelEn} ${team.tier}`, teams: [] })
  grouped.get(id).teams.push(team)
}
// Remove the last catalogue seed from odd-sized levels. Keep the source entry for audit.
export const EXCLUDED_ODD_LEAGUE_CLUBS = []
for (const league of grouped.values()) {
  if (league.teams.length % 2) EXCLUDED_ODD_LEAGUE_CLUBS.push(league.teams.pop())
}
export const REGIONAL_LEAGUES = {
  baltic: { labelPl: 'Baltic League — Litwa, Łotwa i Estonia', labelEn: 'Baltic League — Lithuania, Latvia and Estonia', name: 'Baltic League', continent: 'europe' },
  iberia: { labelPl: 'Hiszpania i Portugalia — Liga Iberyjska', labelEn: 'Spain and Portugal — Iberian League', name: 'Liga Iberyjska', continent: 'europe' },
  centralEurope: { labelPl: 'Danube League — Austria, Słowacja, Serbia i Węgry', labelEn: 'Danube League — Austria, Slovakia, Serbia and Hungary', name: 'Danube League', continent: 'europe' },
  nordic: { labelPl: 'Scandinavian League — Dania, Szwecja i Finlandia', labelEn: 'Scandinavian League — Denmark, Sweden and Finland', name: 'Scandinavian League', continent: 'europe' },
}
// Merge the current even-sized levels, preserving the clubs already selected for them.
for (const [group, members] of Object.entries({ baltic: ['lt','lv','ee'], centralEurope: ['at','sk','rs','hu'], nordic: ['dk','se','fi'], za: ['za'], ph: ['ph'] })) {
  const entries = [...grouped.values()].filter(l => members.includes(l.countryId))
  const clubs = entries.flatMap(l => l.teams)
  for (const league of entries) grouped.delete(league.id)
  const id = group + '-1'
  for (const club of clubs) { club.domesticLeagueId = id; club.tier = 1 }
  grouped.set(id, { id, countryId: group, tier: 1, name: (REGIONAL_LEAGUES[group]?.name ?? ACADEMY_COUNTRIES[group].labelEn) + ' 1', teams: clubs })
}
// Replace the provisional French catalogue with the supplied results-based pyramid.
const oldFrench = [...grouped.values()].filter(l=>l.countryId==='fr').flatMap(l=>l.teams)
for (const [id, league] of grouped) if (league.countryId==='fr') grouped.delete(id)
const french = FRANCE_CLUBS.map(t=>({ ...t, rawPlayers: oldFrench.find(old=>domesticKey(old.name)===domesticKey(t.name))?.rawPlayers ?? [] }))
const promotedNames = ['Disjonctés','Roazhon Ultimate','Friselis','Jets']
const n1 = french.filter(t=>t.sourceTier===1 || promotedNames.includes(t.name))
const n2 = french.filter(t=>t.sourceTier===2 && !promotedNames.includes(t.name)).sort((a,b)=>b.strengthScore-a.strengthScore).slice(0,16)
const regional = french.filter(t=>!n1.includes(t)&&!n2.includes(t))
const allocation = allocateFrenchRegions(regional)
for (const meta of [{id:'fr-1',name:'France Nationale 1',tier:1,teams:n1},{id:'fr-2',name:'France Nationale 2',tier:2,teams:n2}, ...FRENCH_REGIONS.map(r=>({...r,tier:3,teams:regional.filter(t=>allocation[t.id]===r.id)}))]) {
  for(const t of meta.teams) { t.tier=meta.tier; t.domesticLeagueId=meta.id }
  grouped.set(meta.id,{...meta,countryId:'fr',frenchPyramid:true})
}
export const DOMESTIC_LEAGUES = [...grouped.values()].filter(l => l.teams.length >= 2).sort((a, b) => a.countryId.localeCompare(b.countryId) || a.tier - b.tier)
export const DOMESTIC_COUNTRIES = [...new Set(DOMESTIC_LEAGUES.filter(l => !l.hidden).map(l => l.countryId))].map(id => ({
  id, labelPl: REGIONAL_LEAGUES[id]?.labelPl ?? ACADEMY_COUNTRIES[id].labelPl,
  labelEn: REGIONAL_LEAGUES[id]?.labelEn ?? ACADEMY_COUNTRIES[id].labelEn,
  continent: REGIONAL_LEAGUES[id]?.continent ?? ACADEMY_COUNTRIES[id].continent,
  leagues: DOMESTIC_LEAGUES.filter(l => l.countryId === id),
}))
export const DOMESTIC_CONTINENTS = ACADEMY_CONTINENTS.map(continent => ({
  ...continent, countries: DOMESTIC_COUNTRIES.filter(country => country.continent === continent.id),
})).filter(continent => continent.countries.length)
export function setCountryMode(input, id, mode) {
  const group = DOMESTIC_COUNTRIES.find(c => c.id === id)
  if (!group || !['playable', 'transfers', 'off'].includes(mode)) return input
  return { ...input, leagues: { ...input.leagues, ...Object.fromEntries(group.leagues.map(l => [l.id, mode])) } }
}
export function defaultWorldConfig() {
  return { leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, l.countryId === 'pl' ? 'playable' : 'off'])),
    international: { nationals: true, europe: true, paucc: true, aoucc: true, wucc: true } }
}
export function setCountryDepth(input, id, tier) {
  const group = DOMESTIC_COUNTRIES.find(c => c.id === id)
  if (!group || !group.leagues.some(l => l.tier === Number(tier))) return input
  if(input.simulationModel === "focused") return normalizeWorldConfig({...input,depths:{...input.depths,[id]:Number(tier)}})
  const mode = normalizeWorldConfig(input).leagues[group.leagues[0].id]
  if (mode === 'off') return input
  return { ...input, leagues: { ...input.leagues, ...Object.fromEntries(group.leagues.map(l => [l.id, l.tier <= Number(tier) ? mode : 'off'])) } }
}
export function normalizeWorldConfig(input = {}) {
  if(input.simulationModel === "focused") return focusedSelection({ ...defaultWorldConfig(), ...input, international:{...defaultWorldConfig().international,...input.international} },DOMESTIC_COUNTRIES)
  const config = { ...defaultWorldConfig(), ...input, leagues: { ...(input.leagues ?? defaultWorldConfig().leagues) }, international: { ...defaultWorldConfig().international, ...input.international } }
  for (const league of DOMESTIC_LEAGUES) if (!['playable', 'transfers', 'off'].includes(config.leagues[league.id])) config.leagues[league.id] = 'off'
  // Active levels form a prefix from tier 1. Parallel regional groups activate together.
  for (const league of DOMESTIC_LEAGUES.filter(l => config.leagues[l.id] !== 'off')) {
    const mode = config.leagues[league.id]
    for (const sibling of DOMESTIC_LEAGUES.filter(l => l.countryId === league.countryId && l.tier <= league.tier)) {
      if (config.leagues[sibling.id] === 'off' || mode === 'playable') config.leagues[sibling.id] = mode
    }
  }
  return config
}
export function estimateWorldCost(input) {
  const config = normalizeWorldConfig(input)
  let playableClubs = 0, backgroundClubs = 0, players = 0
  for (const league of DOMESTIC_LEAGUES) {
    const mode = config.leagues[league.id]
    if (mode === 'off') continue
    if (mode === 'playable') playableClubs += league.teams.length
    else backgroundClubs += league.teams.length
    // Missing rosters average 22.5 players (uniform 16–29); known rosters fill to 16.
    players += league.teams.reduce((n, t) => n + (t.rawPlayers.length ? Math.max(16, t.rawPlayers.length) : 22.5), 0)
  }
  const internationalCost = Object.values(config.international).filter(Boolean).length * 4
  const score = playableClubs * 4 + backgroundClubs * .6 + internationalCost
  return { playableClubs, backgroundClubs, clubs: playableClubs + backgroundClubs, players: Math.round(players), score,
    gameSpeed: score < 400 ? 'fast' : score < 900 ? 'medium' : 'low',
    load: score < 150 ? 'low' : score < 400 ? 'medium' : 'high', relativeSpeed: Math.round(100 / Math.max(1, score / 80)) }
}
