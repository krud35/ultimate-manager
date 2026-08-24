/**
 * Akademia U21: własna pula prospektów per drużyna, zamiast dawnego jednorazowego
 * dosypywania wolnych agentów po emeryturach (youthIntake.js).
 *
 * Nabór organiczny (`runAcademyIntake`) skaluje się z poziomem obiektu `academy`.
 * Celowany nabór (misja skautingowa `academyProspect`, patrz scouting.js) skaluje
 * się z `scoutingDept` i produkuje jednego kandydata do zaakceptowania w skrzynce.
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
import { academyIntakeMult, getFacilityLevel } from './clubFacilities.js'
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
 * Kandydaci "pod obserwacją" — wygenerowani przez trwającą kampanię `academyProspect`
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
export function signAcademyCandidate(team, candidateId) {
  if (!team) return { ok: false, error: 'missing_team' }
  const candidates = ensureTeamAcademyCandidates(team)
  const idx = candidates.findIndex((p) => p.id === candidateId)
  if (idx < 0) return { ok: false, error: 'not_a_candidate' }
  const [candidate] = candidates.splice(idx, 1)
  ensureTeamAcademy(team).push(candidate)
  return { ok: true, player: candidate }
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
function rollProspectOvrBand(rng, { intakeMult = 1, source = 'intake', countryStrength = 50 } = {}) {
  const shift = Math.round((intakeMult - 1) * 10)
  const scoutBonus = source === 'scouted' ? 4 : 0
  const s = countryStrength / 100
  const starChance = Math.max(0.03, Math.min(0.35, 0.08 + s * 0.22))
  const midChance = Math.max(0.15, Math.min(0.5, 0.3 + s * 0.15))
  const r = rng()
  let band
  if (r < starChance) band = { min: 72, max: 82 }
  else if (r < starChance + midChance) band = { min: 66, max: 76 }
  else band = { min: 58, max: 70 } // większość rolli — pasmo "przeciętny"
  return {
    min: Math.max(40, band.min + shift + scoutBonus),
    max: Math.max(45, band.max + shift + scoutBonus),
  }
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
  const { min, max } = rollProspectOvrBand(rng, { intakeMult, source, countryStrength })
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
 * Sezonowy nabór organiczny — bezpośredni zamiennik `spawnYouthFreeAgents`.
 * Pełna parytet AI: każda drużyna w lidze dostaje własnych prospektów.
 * @returns {{ createdByTeam: Record<string, number>, created: object[] }}
 */
export function runAcademyIntake(world, { seasonYear, seed } = {}) {
  ensureWorldAcademy(world)
  const createdByTeam = {}
  const created = []

  for (const team of worldTeamsList(world)) {
    const pool = ensureTeamAcademy(team)
    const mult = academyIntakeMult(team)
    // Baza podniesiona (dawniej 1 + poziom/4) — nabór organiczny był głównym wąskim
    // gardłem, przez które liga traciła ~16% zawodników w 5 sezonów (emerytury nie
    // miały skąd być odbudowywane, patrz ROSTER_STABILIZE_TARGET w careerModel.js).
    const baseCount = 2 + Math.floor(getFacilityLevel(team, 'academy') / 3)
    const count = Math.max(0, Math.round(baseCount * Math.min(2, Math.max(0.35, mult))))
    if (count <= 0) continue

    const rng = mulberry32(hashSeed(seed ?? seasonYear ?? 0, 'academy-intake', team.id))
    for (let i = 0; i < count; i += 1) {
      const prospect = createAcademyProspect(rng, {
        seasonYear,
        teamId: team.id,
        source: 'intake',
        intakeMult: mult,
        index: i,
      })
      pool.push(prospect)
      created.push(prospect)
    }
    createdByTeam[team.id] = count
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
 * Starzy cały pool akademii o rok (nie jest objęty `ageWorldPlayersOneYear`, bo ten
 * iteruje tylko `team.players`), po czym zwalnia 21-latków z drużyny gracza na wolny
 * rynek. Drużyny AI są obsłużone osobno w `runAiAcademyPromotionPass`.
 */
export function sweepAgedOutAcademyPlayers(world, { playerTeamId } = {}) {
  ensureWorldAcademy(world)
  ensureWorldFreeAgents(world)
  const releasedToFreeAgency = []

  for (const team of worldTeamsList(world)) {
    const pool = ensureTeamAcademy(team)
    for (const p of pool) p.age = (p.age ?? ACADEMY_JOIN_AGE_MIN) + 1
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
      const worthPromoting = (prospect.potential ?? ovr) >= seniorAvg - 4 || ovr >= seniorAvg - 6
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
  const rookieOvr = Math.min(getOverallRating(player.skills), ROOKIE_WAGE_OVR_CAP)
  const terms = { ...auto.terms, weeklyWage: Math.round(weeklyWageFromOvr(rookieOvr)) }
  const signed = signPlayerContract(team, player, { ...terms, signedDate: null })
  if (!signed.ok) return { ok: false, error: signed.error ?? 'contract_failed' }

  pool.splice(idx, 1)
  player.status = PLAYER_STATUS.ACTIVE
  player.inAcademy = false
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
