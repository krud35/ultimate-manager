import { ensureYouthCohort, clubYouthCountry, claimRegionalYouth, youthWillJoin, discoverRegionalYouth } from './youthPopulation.js'
import { getTransferBudget, adjustTransferBudget } from './transfers/clubFinances.js'
/**
 * Akademia U21: własna pula prospektów per drużyna, zamiast dawnego jednorazowego
 * dosypywania wolnych agentów po emeryturach (youthIntake.js).
 *
 * Jesienny i wiosenny nabór (`runAcademyIntake`) odkrywa juniorów ze wspólnej puli.
 * Misje skautingowe mogą odkrywać dodatkowych kandydatów. Przyjęcie do akademii
 * oraz awans do seniorów są osobnymi decyzjami.
 * Prospekt, którego menedżer nie awansuje do seniorów zanim skończy 21 lat, trafia
 * na wolny rynek (`world.freeAgents`) — tak jak dziś, ale jako nadwyżka realnego
 * pipeline'u, a nie cały mechanizm.
 */

import {
  SKILLS_GEN_VERSION,
  buildBalancedSubStats,
  buildPlayerArchetypeTiers,
  getOverallRating,
  normalizePlayerSkills,
} from '../models/playerStats.js'
import { rollTraitsForPlayer } from '../models/playerTraits.js'
import {
  ensurePlayerDevelopment,
  applyOffseasonCampGrowth,
  computePotential,
} from './playerDevelopment.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerLoyalty } from '../models/playerLoyalty.js'
import { ensurePlayerInjury } from '../models/playerInjury.js'
import { AI_ROSTER_HARD_CAP, ensureWorldFreeAgents, PLAYER_STATUS } from './transfers/freeAgency.js'
import { refreshPlayerMarketValue } from './transfers/playerValue.js'
import { aiAutoPlayerContractTerms } from './transfers/playerNegotiation.js'
import { signPlayerContract, weeklyWageFromOvr } from './transfers/playerContracts.js'
import { getFacilityLevel } from './clubFacilities.js'
import { worldTeamsList } from './worldState.js'
import { eucsTeamCountry } from '../data/eucsLeagueTeams.js'
import {
  ACADEMY_COUNTRIES,
  academyCountryStrength,
  pickAcademyName,
} from '../data/academyScoutGeography.js'

export const ACADEMY_GEN_VERSION = 1
export const ACADEMY_JOIN_AGE_MIN = 16
export const ACADEMY_JOIN_AGE_MAX = 18
export const ACADEMY_AGE_OUT = 21
/** Pierwszy kontrakt zawodnika z akademii płaci jak za ten OVR, niezależnie od realnego —
 * to jego pierwszy profesjonalny kontrakt, nie ma jeszcze siły przetargowej gwiazdy. */
export const ROOKIE_WAGE_OVR_CAP = 68

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Jamie',
  'Taylor', 'Reese', 'Parker', 'Skyler', 'Blake', 'Hayden', 'Logan', 'Noah', 'Ethan', 'Owen',
  'Leo', 'Miles', 'Kai', 'Felix', 'Theo', 'Marcus', 'Julian', 'Adrian', 'Silas', 'Nico',
]

const LAST_NAMES = [
  'Brooks', 'Hayes', 'Reed', 'Cole', 'Bennett', 'Foster', 'Griffin', 'Harper', 'Lane', 'West',
  'North', 'Stone', 'Rivera', 'Keller', 'Vaughn', 'Pratt', 'Nash', 'Crowe', 'Bishop', 'Vance',
  'Monroe', 'Adler', 'Quincy', 'Sato', 'Nguyen', 'Patel', 'Okoye', 'Berg', 'Diaz', 'Shaw',
]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(...parts) {
  let h = 2166136261
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

function scaleSkillsToTargetOvr(skills, targetOvr) {
  const nested = normalizePlayerSkills(skills)
  for (let pass = 0; pass < 8; pass += 1) {
    const current = getOverallRating(nested)
    if (Math.abs(current - targetOvr) <= 0.5) break
    const factor = targetOvr / Math.max(1, current)
    for (const cat of Object.keys(nested)) {
      const block = nested[cat]
      if (!block || typeof block !== 'object') continue
      for (const key of Object.keys(block)) {
        if (typeof block[key] !== 'number') continue
        block[key] = Math.max(40, Math.min(99, Math.round(block[key] * factor)))
      }
    }
  }
  return nested
}

// --- lazy init ---

export function ensureTeamAcademy(team) {
  if (!team) return []
  if (!Array.isArray(team.academyPlayers)) team.academyPlayers = []
  return team.academyPlayers
}

/**
 * Kandydaci "pod obserwacją" — odkryci przez nabór lub kampanię `academyProspect`
 * (patrz scouting.js), ale jeszcze nie zaakceptowani do akademii. Znajomość każdego
 * (0-100, rośnie co tydzień) żyje w `team.scouting.players[id]`, ten sam mechanizm co dla
 * zwykłych zawodników — tu trzymamy tylko same obiekty zawodników.
 */
export function ensureTeamAcademyCandidates(team) {
  if (!team) return []
  if (!Array.isArray(team.academyCandidates)) team.academyCandidates = []
  return team.academyCandidates
}

/** Sprowadza obserwowanego kandydata do akademii (bez kontraktu — jak nabór organiczny). */
export function academyCapacity(team) { return 20 + 2 * getFacilityLevel(team, 'academy') }
export function academyAnnualPlaces(team) { return 8 + Math.floor(getFacilityLevel(team, 'academy') * 0.8) }
export function academyRecruitmentCost(player) { return Math.round(4000 + Math.max(0, (player.potential ?? 65) - 60) * 400) }

export function signAcademyCandidate(team, candidateId, { world = null, seasonYear = null } = {}) {
  if (!team) return { ok: false, error: 'missing_team' }
  const candidate = ensureTeamAcademyCandidates(team).find(p => p.id === candidateId)
    ?? world?.regionalYouth?.find(p => p.id === candidateId)
  if (!candidate || (candidate.offerExpires && team.managementDate > candidate.offerExpires)) return { ok: false, error: 'unavailable' }
  if (ensureTeamAcademy(team).length >= academyCapacity(team)) return { ok: false, error: 'academy_full' }
  const year = seasonYear ?? world?.templateSeasonYear ?? candidate.cohortYear ?? 2025
  if (team.academyAdmissionYear !== year) { team.academyAdmissionYear = year; team.academyAdmissions = 0 }
  if ((team.academyAdmissions ?? 0) >= academyAnnualPlaces(team)) return { ok: false, error: 'annual_limit' }
  if (candidate.age >= ACADEMY_AGE_OUT) return { ok: false, error: 'too_old' }
  if (candidate.regionalYouth && (!world || !world.regionalYouth?.some(p => p.id === candidateId))) return { ok: false, error: 'unavailable' }
  if (!youthWillJoin(team, candidate)) return { ok: false, error: 'declined' }
  const cost = academyRecruitmentCost(candidate)
  if (getTransferBudget(team) < cost) return { ok: false, error: 'insufficient_funds' }
  const player = candidate.regionalYouth ? claimRegionalYouth(world, candidateId) : candidate
  team.academyCandidates = ensureTeamAcademyCandidates(team).filter(p => p.id !== candidateId)
  player.inAcademy = true
  player.status = PLAYER_STATUS.ACADEMY
  player.academyJoinedSeason = year
  player.academySource = candidate.observationOnly ? 'scouted' : 'intake'
  ensureTeamAcademy(team).push(player)
  team.academyAdmissions = (team.academyAdmissions ?? 0) + 1
  adjustTransferBudget(team, -cost, 'academy_recruitment')
  return { ok: true, player, cost }
}

/** Kończy obserwację kandydata bez sprowadzania go do akademii. */
export function rejectAcademyCandidate(team, candidateId) {
  if (!team) return { ok: false, error: 'missing_team' }
  const candidates = ensureTeamAcademyCandidates(team)
  const idx = candidates.findIndex((p) => p.id === candidateId)
  if (idx < 0) return { ok: false, error: 'not_a_candidate' }
  const [candidate] = candidates.splice(idx, 1)
  return { ok: true, player: candidate }
}

export function ensureWorldAcademy(world) {
  if (!world?.teamsById) return world
  for (const team of worldTeamsList(world)) ensureTeamAcademy(team)
  return world
}

/** The inherited youth squad is seeded once, including when upgrading an older save. */
export function initializeWorldAcademies(world, seasonYear) {
  ensureWorldAcademy(world)
  for (const team of worldTeamsList(world)) {
    if (team.academyRosterInitialized) continue
    team.academyRosterInitialized = true
    if (team.academyPlayers.length) continue
    const rng = mulberry32(hashSeed(world.templateSeasonYear, team.id, 'initial-academy'))
    for (let i = 0; i < Math.min(5, academyCapacity(team)); i++) {
      const player = createAcademyProspect(rng, { teamId: team.id, seasonYear,
        source: 'foundation', countryId: clubYouthCountry(team), index: i })
      player.age = 16 + Math.floor(rng() * 2)
      team.academyPlayers.push(player)
    }
  }
  return world
}

export function worldAcademyPlayersList(world) {
  const out = []
  for (const team of worldTeamsList(world)) {
    for (const player of ensureTeamAcademy(team)) out.push({ team, player })
  }
  return out
}

// --- prospect generation ---

/**
 * Pasmo docelowego OVR: baseline losowe pasmo, przesunięte przez poziom akademii/źródło.
 * Ukryta siła frisbee kraju (`countryStrength` 0-100) NIE przesuwa już zakresu — zamiast
 * tego kształtuje PRAWDOPODOBIEŃSTWO trafienia lepszego pasma: wysoka szansa na
 * "przeciętnego" kandydata zawsze dominuje, ale silne kraje wyraźnie podnoszą szansę na
 * pasmo "gwiazda" (i odwrotnie dla słabych krajów).
 */
function rollProspectOvrBand(rng, { countryStrength = 50 } = {}) {
  const r = rng()
  // Ready-made elite teenagers are exceptional. Geography changes frequency, not a free OVR bonus.
  // The shared attribute model has a minimum OVR of 67 after normalization.
  if (r < 0.003 + countryStrength / 10000) return { min: 78, max: 80 }
  if (r < 0.15 + countryStrength / 1000) return { min: 73, max: 76 }
  return { min: 67, max: 72 }
}

/** Podbija tier sub-statu proporcjonalnie do wagi profilu poszukiwanego zawodnika
 * (patrz `PLAYER_SEARCH_PROFILES` w scouting.js) — bez profilu zwraca tier kategorii
 * bez zmian, czyli zachowanie identyczne jak przed dodaniem profili. */
const ACADEMY_PROFILE_BIAS_STRENGTH = 0.35
function profileBiasedTier(cat, key, baseTiers, profileWeights) {
  const base = baseTiers[cat]
  if (!profileWeights) return base
  const match = profileWeights.find((w) => w.category === cat && w.key === key)
  if (!match) return base
  return Math.max(0, Math.min(1, base + match.weight * ACADEMY_PROFILE_BIAS_STRENGTH))
}

/**
 * Buduje jednego prospekta akademii. Potencjał liczony przez prawdziwy
 * `computePotential`/`ensurePlayerDevelopment` (nie ad-hoc wzór), bo player.potential
 * zostaje niewypełniony przed wywołaniem — to jest właśnie ulepszenie względem youthIntake.js.
 */
export function createAcademyProspect(rng, { seasonYear, teamId, source = 'intake', countryId = null, profileWeights = null, intakeMult = 1, index = 0 } = {}) {
  const id = `academy-${teamId}-${seasonYear}-${hashSeed(teamId, seasonYear, source, index, rng())}`
  const scoutedCountry = countryId ? ACADEMY_COUNTRIES[countryId] : null
  const countryStrength = scoutedCountry ? academyCountryStrength(countryId) : 50
  const nationality = scoutedCountry ? scoutedCountry.nameEn : eucsTeamCountry(teamId)
  const { min, max } = source === 'foundation' ? { min: 67, max: 70 } : rollProspectOvrBand(rng, { intakeMult, source, countryStrength })
  const targetOvr = Math.max(40, Math.min(88, min + Math.floor(rng() * Math.max(1, max - min + 1))))
  const tiers = buildPlayerArchetypeTiers(rng)
  let skills = buildBalancedSubStats(hashSeed(id, 'skills'), (cat, key) =>
    profileBiasedTier(cat, key, tiers, profileWeights),
  )
  skills = scaleSkillsToTargetOvr(skills, targetOvr)
  const age = ACADEMY_JOIN_AGE_MIN + Math.floor(rng() * (ACADEMY_JOIN_AGE_MAX - ACADEMY_JOIN_AGE_MIN + 1))
  const name = countryId ? pickAcademyName(rng, countryId) : { firstName: pick(rng, FIRST_NAMES), lastName: pick(rng, LAST_NAMES) }

  const player = {
    id,
    firstName: name.firstName,
    lastName: name.lastName,
    jersey: 1 + Math.floor(rng() * 99),
    age,
    skills,
    skillsGen: SKILLS_GEN_VERSION,
    status: PLAYER_STATUS.ACADEMY,
    inAcademy: true,
    academyJoinedSeason: seasonYear ?? null,
    academySource: source,
    academyCountry: countryId,
    nationality,
    ufaReference: {
      goals: 0,
      assists: 0,
      blocks: 0,
      throwingYards: 0,
      receivingYards: 0,
      randomGenerated: true,
    },
    contract: null,
  }

  rollTraitsForPlayer(player)
  ensurePlayerDevelopment(player) // player.potential jest puste -> liczone realnym computePotential
  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  ensurePlayerLoyalty(player)
  ensurePlayerInjury(player)
  refreshPlayerMarketValue(player)
  return player
}

// --- sezonowy nabór organiczny ---

/**
 * Dwie fale obserwacji w sezonie. Każdy klub poznaje 4–8 juniorów z regionalnej
 * puli; zapis fali zapobiega ponownemu naborowi przy zapisie/odczycie.
 * @returns {{ createdByTeam: Record<string, number>, created: object[] }}
 */
export function runAcademyIntake(world, { seasonYear, wave = 'autumn', date = `${wave === 'spring' ? seasonYear + 1 : seasonYear}-${wave === 'spring' ? '03' : '09'}-01` } = {}) {
  ensureWorldAcademy(world)
  ensureYouthCohort(world, seasonYear)
  const createdByTeam = {}, created = []
  for (const team of worldTeamsList(world)) {
    const key = `${seasonYear}-${wave}`
    team.academyIntakeWaves ??= []
    if (team.academyIntakeWaves.includes(key)) continue
    team.academyIntakeWaves = [...team.academyIntakeWaves.slice(-3), key]
    const rng = mulberry32(hashSeed(team.id, key, 'intake'))
    const count = 4 + Math.floor(rng() * 5)
    const candidates = discoverRegionalYouth(world, team, clubYouthCountry(team), count, rng, { date, cohortYear: seasonYear })
    for (const p of candidates) p.academyIntakeWave = wave
    created.push(...candidates)
    createdByTeam[team.id] = candidates.length
  }
  return { createdByTeam, created }
}

// --- wiek 21 / wolny rynek ---

/** Przenosi prospekta z akademii na wolny rynek — bez zakładania obecności w team.players. */
function moveAcademyPlayerToFreeAgency(team, player, world) {
  ensureWorldFreeAgents(world)
  const pool = ensureTeamAcademy(team)
  const idx = pool.findIndex((p) => p.id === player.id)
  if (idx >= 0) pool.splice(idx, 1)
  player.status = PLAYER_STATUS.FREE_AGENT
  player.inAcademy = false
  player.contract = null
  world.freeAgents.push(player)
  return player
}

/**
 * Zwalnia 21-latków i kończy obserwację kandydatów, którzy wyrośli z akademii.
 * Cykl sezonu starzy cały świat wcześniej i przekazuje agePlayers: false.
 * Domyślne starzenie pozostaje dla samodzielnych wywołań i starszych narzędzi.
 */
export function sweepAgedOutAcademyPlayers(world, { playerTeamId, agePlayers = true } = {}) {
  ensureWorldAcademy(world)
  ensureWorldFreeAgents(world)
  const releasedToFreeAgency = []

  for (const team of worldTeamsList(world)) {
    const pool = ensureTeamAcademy(team)
    if (agePlayers) {
      for (const p of [...pool, ...ensureTeamAcademyCandidates(team)]) p.age = (p.age ?? ACADEMY_JOIN_AGE_MIN) + 1
    }
    const candidates = ensureTeamAcademyCandidates(team)
    team.academyCandidates = candidates.filter(p => p.age < ACADEMY_AGE_OUT)
    for (const p of candidates.filter(p => p.age >= ACADEMY_AGE_OUT)) {
      p.status = PLAYER_STATUS.FREE_AGENT
      p.inAcademy = false
      p.contract = null
      world.freeAgents.push(p)
    }
    if (team.id !== playerTeamId) continue

    const agedOut = pool.filter((p) => p.age >= ACADEMY_AGE_OUT)
    for (const p of agedOut) {
      moveAcademyPlayerToFreeAgency(team, p, world)
      releasedToFreeAgency.push(p)
    }
  }

  return { releasedToFreeAgency }
}

// --- AI: awans / zwolnienie ---

/**
 * AI: co sezon część prospektów awansuje do seniorów (kontrakt rookie), a 21-latkowie
 * nieawansowani trafiają na wolny rynek. Wzorowane na `processAiContractCycle`.
 */
export function runAiAcademyPromotionPass(world, { playerTeamId, seed = 1, league = null } = {}) {
  ensureWorldAcademy(world)
  ensureWorldFreeAgents(world)
  let promoted = 0
  let released = 0
  let salt = (seed >>> 0) || 1

  for (const team of worldTeamsList(world)) {
    if (team.id === playerTeamId) continue
    const pool = [...ensureTeamAcademy(team)]
    if (!pool.length) continue

    const players = team.players ?? []
    const seniorAvg =
      players.reduce((s, p) => s + getOverallRating(p.skills), 0) / Math.max(1, players.length)

    for (const prospect of pool) {
      salt = (Math.imul(salt, 1664525) + 1013904223) >>> 0
      const roll = (salt % 1000) / 1000
      const ovr = getOverallRating(prospect.skills)
      const agedOut = prospect.age >= ACADEMY_AGE_OUT
      const rosterHasRoom = (team.players?.length ?? 0) < AI_ROSTER_HARD_CAP
      const worthPromoting = prospect.age >= 18 && ovr >= seniorAvg - 6
      const promotionChance = agedOut ? 0.85 : 0.3

      if (rosterHasRoom && worthPromoting && roll < promotionChance) {
        const result = promoteAcademyPlayer(team, prospect.id, { league })
        if (result.ok) {
          promoted += 1
          continue
        }
      }
      if (agedOut) {
        moveAcademyPlayerToFreeAgency(team, prospect, world)
        released += 1
      }
    }
  }

  return { promoted, released }
}

// --- akcje menedżera ---

/** Awans prospekta do seniorów — podpisuje kontrakt rookie i przenosi do team.players. */
export function promoteAcademyPlayer(team, playerId, { league = null } = {}) {
  if (!team) return { ok: false, error: 'missing_team' }
  const pool = ensureTeamAcademy(team)
  const idx = pool.findIndex((p) => p.id === playerId)
  if (idx < 0) return { ok: false, error: 'not_in_academy' }
  const player = pool[idx]
  if ((team.players?.length ?? 0) >= AI_ROSTER_HARD_CAP) return { ok: false, error: 'roster_full' }

  const auto = aiAutoPlayerContractTerms({
    player,
    sellerTeam: null,
    buyerTeam: team,
    league,
    renew: false,
  })
  if (!auto.ok || !auto.terms) {
    return { ok: false, error: 'no_contract_terms' }
  }
  // Pierwszy profesjonalny kontrakt — niska pensja niezależnie od realnego OVR
  // (rookie jeszcze nic nie udowodnił w seniorach, nie ma siły przetargowej gwiazdy).
  const rookieOvr = getOverallRating(player.skills)
  const terms = { ...auto.terms, years: 1, weeklyWage: Math.round(weeklyWageFromOvr(rookieOvr) * 0.85) }
  const signed = signPlayerContract(team, player, { ...terms, signedDate: null })
  if (!signed.ok) return { ok: false, error: signed.error ?? 'contract_failed' }

  pool.splice(idx, 1)
  player.status = PLAYER_STATUS.ACTIVE
  player.inAcademy = false
  if (team.boardObjective) team.boardObjective.graduates = (team.boardObjective.graduates ?? 0) + 1
  team.players = team.players ?? []
  team.players.push(player)
  refreshPlayerMarketValue(player)
  return { ok: true, player, contract: signed.contract }
}

/** Ręczne zwolnienie prospekta na wolny rynek (przed 21. rokiem życia). */
export function releaseAcademyPlayer(team, playerId, world) {
  if (!team || !world) return { ok: false, error: 'missing' }
  const pool = ensureTeamAcademy(team)
  const player = pool.find((p) => p.id === playerId)
  if (!player) return { ok: false, error: 'not_in_academy' }
  moveAcademyPlayerToFreeAgency(team, player, world)
  return { ok: true, player }
}

// --- offseason: rozwój prospektów ---

/**
 * Lżejsza wersja `applyOffseasonDevelopment` dla akademii — parę sesji wzrostu wg
 * fokusu (bez lojalności/kontraktu, których prospekt nie ma) plus przeliczenie
 * potencjału, żeby lata w akademii faktycznie coś znaczyły.
 */
export function applyAcademyOffseasonDevelopment(world, { seed } = {}) {
  const rng = mulberry32(((seed ?? 2025) >>> 0) ^ 0x9e3779b9)
  let developed = 0

  for (const { player } of worldAcademyPlayersList(world)) {
    const perf01 = 0.5
    for (let w = 0; w < 2; w += 1) {
      applyOffseasonCampGrowth(player, rng)
    }
    const ovr = getOverallRating(player.skills)
    player.potential = computePotential(player, ovr, perf01)
    player.developmentFatigue = 0
    developed += 1
  }

  return { developed }
}
