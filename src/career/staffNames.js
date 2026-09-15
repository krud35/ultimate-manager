import sources from '../data/staffNameSources.json' with { type: 'json' }
import { ACADEMY_COUNTRIES, ACADEMY_NATIONALITY_NAMES } from '../data/academyScoutGeography.js'

// Pool geography describes the source club, not an individual's nationality.
const pools = new Map()
const countryAliases = { 'United States of America': 'United States', USA: 'United States', 'United Kingdom': 'Great Britain', 'Republic of Korea': 'South Korea' }
function add(country, firstNames, lastNames) {
  country = countryAliases[country] ?? country
  if (!pools.has(country)) pools.set(country, { firstNames: new Set(), lastNames: new Set() })
  const pool = pools.get(country)
  firstNames.forEach(name => pool.firstNames.add(name))
  lastNames.forEach(name => pool.lastNames.add(name))
}
for (const team of sources.teams) {
  add(team.country, team.players.map(p => p.firstName), team.players.map(p => p.lastName))
}
for (const [id, pool] of Object.entries(ACADEMY_NATIONALITY_NAMES)) {
  add(ACADEMY_COUNTRIES[id].nameEn, pool.firstNames, pool.lastNames)
}
const globalPool = {
  firstNames: [...new Set([...pools.values()].flatMap(p => [...p.firstNames]))],
  lastNames: [...new Set([...pools.values()].flatMap(p => [...p.lastNames]))],
}
for (const [country, pool] of pools) {
  pools.set(country, { firstNames: [...pool.firstNames], lastNames: [...pool.lastNames] })
}

// Avalanche hashing avoids adjacent IDs repeatedly selecting adjacent names.
function randomFor(seed) {
  let state = 2166136261
  for (const c of seed) state = Math.imul(state ^ c.codePointAt(0), 16777619)
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (random, values) => values[Math.floor(random() * values.length)]
const normalize = name => name.normalize('NFC').toLocaleLowerCase('en')

/** Stable across reloads; no dependence on rendering order or Math.random(). */
export function generateStaffName(id, country, excluded = []) {
  const random = randomFor(`staff-name-v2|${id}`)
  const entry = ACADEMY_COUNTRIES[String(country).toLowerCase()]
    ?? Object.values(ACADEMY_COUNTRIES).find(c => c.nameEn === country || c.labelEn === country)
  const localPool = pools.get(entry?.nameEn ?? countryAliases[country] ?? country)
  // Small national dictionaries must not dominate a large recruitment market.
  const localShare = localPool ? Math.min(0.65, localPool.firstNames.length * localPool.lastNames.length / 40000) : 0
  const pool = localPool && random() < localShare ? localPool : globalPool
  const used = new Set(excluded.map(normalize))
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${pick(random, pool.firstNames)} ${pick(random, pool.lastNames)}`
    if (!used.has(normalize(name))) return name
  }
  // A bounded fallback for callers that have exhausted a small national pool.
  for (const first of globalPool.firstNames) {
    for (const last of globalPool.lastNames) {
      const name = `${first} ${last}`
      if (!used.has(normalize(name))) return name
    }
  }
  throw new Error('Staff name pool exhausted')
}

export function isLegacyStaffName(member) {
  return !member.nameGenerationVersion
    && /^(Alex|Jordan|Sam|Robin|Morgan|Taylor|Casey|Jamie) (Nowak|Miller|Martin|Kowalski|Bennett|Andersson|Garcia|Wilson)$/.test(member.name)
}
