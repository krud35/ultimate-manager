import { addDays, formatISODate } from '../league/seasonCalendar.js'
import { ACADEMY_COUNTRIES, academyCountryStrength } from '../data/academyScoutGeography.js'
import { eucsTeamCountry } from '../data/eucsLeagueTeams.js'
import { createRng } from '../matchEngine/rng.js'
import { createAcademyProspect } from './academy.js'
import { getOverallRating } from '../models/playerStats.js'

function hash(value) {
  let h = 2166136261
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function clubYouthCountry(team) {
  const name = eucsTeamCountry(team.id)
  return Object.keys(ACADEMY_COUNTRIES).find(id => ACADEMY_COUNTRIES[id].nameEn === name) ?? 'us'
}

/** Shared finite rosters are generated once per cohort, never by sending a scout. */
export function ensureYouthCohort(world, year) {
  if (!world || !Number.isFinite(year)) return []
  world.regionalYouth ??= []
  world.youthCohortYears ??= []
  world.youthCohortVersions ??= {}
  if (world.youthCohortVersions[year] === 2) return world.regionalYouth
  const expanding = world.youthCohortYears.includes(year)
  if (!expanding) world.youthCohortYears.push(year)
  const teams = Object.values(world.teamsById ?? {})
  for (const countryId of Object.keys(ACADEMY_COUNTRIES)) {
    const local = teams.filter(t => clubYouthCountry(t) === countryId).length
    const regionalExtra = Math.round(teams.length * academyCountryStrength(countryId) / 1000)
    const previousCount = expanding ? Math.max(2, local * 5 + regionalExtra) : 0
    const count = Math.max(16, local * 20 + regionalExtra) - previousCount
    // Expand old saves once, without recreating any claimed or departed junior.
    const source = expanding ? 'regional-expanded' : 'regional'
    const rng = createRng(hash(`${world.templateSeasonYear}|youth|${year}|${countryId}|${source}`))
    for (let i = 0; i < count; i++) {
      const p = createAcademyProspect(() => rng.float(), { teamId: `region-${countryId}`,
        seasonYear: year, countryId, source, index: i })
      p.regionalYouth = true
      p.cohortYear = year
      p.inAcademy = false
      p.status = 'unattached_youth'
      world.regionalYouth.push(p)
    }
  }
  world.youthCohortVersions[year] = 2
  return world.regionalYouth
}

export function discoverRegionalYouth(world, team, countryId, count, rng, { date = team.managementDate, cohortYear = null } = {}) {
  if (!world) return []
  const known = new Set((team.academyCandidates ?? []).map(p => p.id))
  const pool = (world.regionalYouth ?? []).filter(p => p.academyCountry === countryId && p.age < 21 && (cohortYear == null || p.cohortYear === cohortYear) && !known.has(p.id))
  const discovered = []
  while (discovered.length < count && pool.length) {
    const [player] = pool.splice(Math.floor(rng() * pool.length), 1)
    // Observation snapshots are not a second player registration. Claims use the registry.
    const candidate = structuredClone(player)
    candidate.observationOnly = true
    candidate.status = 'observed_junior'
    candidate.inAcademy = false
    candidate.offerExpires = formatISODate(addDays(date ?? `${player.cohortYear}-08-01`, 60))
    discovered.push(candidate)
    ;(team.academyCandidates ??= []).push(candidate)
  }
  return discovered
}

export function claimRegionalYouth(world, playerId) {
  const index = (world?.regionalYouth ?? []).findIndex(p => p.id === playerId)
  if (index < 0) return null
  const [player] = world.regionalYouth.splice(index, 1)
  for (const t of Object.values(world.teamsById ?? {})) {
    t.academyCandidates = (t.academyCandidates ?? []).filter(p => p.id !== playerId)
  }
  delete player.observationOnly
  return player
}

export function ageRegionalYouth(world) {
  const keep = []
  for (const p of world.regionalYouth ?? []) {
    p.age++
    if (p.age < 21) keep.push(p)
    else if (getOverallRating(p.skills) >= 73) {
      p.status = 'free_agent'
      ;(world.freeAgents ??= []).push(p)
    } else world.youthDepartures = (world.youthDepartures ?? 0) + 1
  }
  world.regionalYouth = keep
  const live = new Map(keep.map(p => [p.id, p]))
  for (const t of Object.values(world.teamsById ?? {})) {
    t.academyCandidates = (t.academyCandidates ?? []).filter(p => !p.observationOnly || live.has(p.id))
    for (const p of t.academyCandidates) if (p.observationOnly) p.age = live.get(p.id).age
  }
}

export function youthWillJoin(team, player) {
  const reputation = team.reputation?.value ?? team.reputation ?? 55
  const level = team.facilities?.academy ?? 5
  const home = player.academyCountry === clubYouthCountry(team)
  const chance = Math.min(0.96, 0.4 + Number(reputation) / 300 + level * 0.025 + (home ? 0.12 : 0))
  return createRng(hash(`${team.id}|${player.id}|join`)).float() < chance
}
