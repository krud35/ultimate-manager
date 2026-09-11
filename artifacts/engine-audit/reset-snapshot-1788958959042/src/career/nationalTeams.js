/**
 * Kadry narodowe — fundament pod Mistrzostwa Europy/Świata reprezentacji (patrz projekt:
 * kalendarz co 2 lata na przemian ME/MŚ zaczynając od ME 2027, kwalifikacje w stylu
 * piłkarskim podczas przerw reprezentacyjnych, faza finałowa budowana na wzorcu
 * pyramidCup.js). Ten plik to FAZA 1 tego planu: stan bazowy w karierze, dobór/dogenerowanie
 * składu, i zwolnienie dogenerowanych zawodników na wolny rynek po turnieju. Kwalifikacje,
 * kalendarz przerw reprezentacyjnych i faza finałowa to kolejne fazy.
 *
 * Celowo niezależne od piramidy EUCS: skanuje WSZYSTKICH zawodników świata przez
 * `worldTeamsList`/`world.freeAgents` po `player.nationality`, nie po przynależności do
 * konkretnej ligi/piramidy — więc przetrwa bez zmian przyszłe zastąpienie jednej ligi
 * europejskiej ligami krajowymi (patrz projekt, sekcja o zgodności wstecznej).
 */
import {
  ACADEMY_COUNTRIES,
  academyCountryStrength,
  pickAcademyName,
} from '../data/academyScoutGeography.js'
import {
  buildBalancedSubStats,
  buildPlayerArchetypeTiers,
  getOverallRating,
  normalizePlayerSkills,
  SKILLS_GEN_VERSION,
} from '../models/playerStats.js'
import { rollTraitsForPlayer } from '../models/playerTraits.js'
import { ensurePlayerDevelopment } from './playerDevelopment.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerLoyalty } from '../models/playerLoyalty.js'
import { ensurePlayerInjury } from '../models/playerInjury.js'
import { refreshPlayerMarketValue } from './transfers/playerValue.js'
import { ensureWorldFreeAgents, PLAYER_STATUS } from './transfers/freeAgency.js'
import { worldTeamsList } from './worldState.js'

/** Pierwszy turniej: ME 2027 bez kwalifikacji (kadra startuje za krótko po starcie kariery
 * EUCS w 2026, żeby zmieścić pełny cykl) — uczestnicy dobrani wprost wg startowego
 * coefficientu. Od MŚ 2029 każdy kolejny turniej ma pełny cykl kwalifikacyjny. */
export const FIRST_EURO_YEAR = 2027

export const NATIONAL_SQUAD_SIZE_MIN = 16
export const NATIONAL_SQUAD_SIZE_MAX = 24

const FILLER_AGE_MIN = 23
const FILLER_AGE_MAX = 32

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

/** Skaluje wygenerowane substaty tak, żeby wypadkowy OVR trafił w zadany cel (kilka
 * przybliżających przebiegów) — ten sam mechanizm co lokalne kopie w academy.js/playerStats.js. */
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

/**
 * Leniwa inicjalizacja `career.nationalTeams` — wołana przy pierwszym dostępie, tak jak
 * `ensureTeamAcademy`/`ensureWorldFreeAgents` gdzie indziej w kodzie (bez potrzeby hakowania
 * `createEucsCareer`/rehydratacji zapisu w tej fazie).
 */
export function ensureCareerNationalTeams(career) {
  if (!career) return null
  if (!career.nationalTeams || typeof career.nationalTeams !== 'object') {
    career.nationalTeams = {}
  }
  const nt = career.nationalTeams
  if (!nt.countryStrength || typeof nt.countryStrength !== 'object') {
    // Kopia startowa z rejestru statycznego — od teraz żyje w stanie kariery i będzie
    // ewoluować wynikami kwalifikacji/turniejów (Faza 4 planu), niezależnie per zapis.
    nt.countryStrength = Object.fromEntries(
      Object.entries(ACADEMY_COUNTRIES).map(([id, entry]) => [id, entry.strength]),
    )
  }
  if (!nt.nextTournament || typeof nt.nextTournament !== 'object') {
    nt.nextTournament = { kind: 'euro', year: FIRST_EURO_YEAR }
  }
  if (nt.qualifying === undefined) nt.qualifying = null
  if (nt.finals === undefined) nt.finals = null
  if (!Array.isArray(nt.history)) nt.history = []
  if (!nt.squadsByCountry || typeof nt.squadsByCountry !== 'object') nt.squadsByCountry = {}
  return nt
}

/** Ukryty coefficient kraju (0-100) — czyta stan kariery, spada do statycznej wartości bazowej
 * dla zapisów/krajów, których jeszcze nie dotknęła żadna kadra narodowa. */
export function getCountryStrength(career, countryId) {
  const nt = ensureCareerNationalTeams(career)
  if (nt?.countryStrength && countryId in nt.countryStrength) return nt.countryStrength[countryId]
  return academyCountryStrength(countryId)
}

/** Trwała, tłumiona zmiana coefficientu po wyniku kwalifikacji/turnieju (Faza 4) — dodatnia
 * lub ujemna delta, przycięta do sensownego zakresu żeby kraj nigdy nie spadł/wzrósł do skraju. */
export function updateCountryStrength(career, countryId, delta) {
  const nt = ensureCareerNationalTeams(career)
  const current = getCountryStrength(career, countryId)
  const next = Math.max(5, Math.min(99, Math.round(current + delta)))
  nt.countryStrength[countryId] = next
  return next
}

/** Pasmo OVR dogenerowanego seniora kadry — silniejszy kraj = wyraźnie wyższa szansa na
 * mocniejsze pasmo (ten sam probabilistyczny mechanizm co rollProspectOvrBand w academy.js),
 * ale progi przesunięte na poziom gotowego zawodnika-seniora z ławki reprezentacji, nie
 * surowego nastoletniego prospekta. */
function rollFillerOvrBand(rng, strength) {
  const s = strength / 100
  const starChance = Math.max(0.03, Math.min(0.3, 0.06 + s * 0.2))
  const midChance = Math.max(0.2, Math.min(0.55, 0.35 + s * 0.15))
  const r = rng()
  if (r < starChance) return { min: 68, max: 78 }
  if (r < starChance + midChance) return { min: 60, max: 70 }
  return { min: 50, max: 62 }
}

function createNationalTeamFillerPlayer(rng, countryId, strength, index) {
  const { firstName, lastName } = pickAcademyName(rng, countryId)
  const { min, max } = rollFillerOvrBand(rng, strength)
  const targetOvr = Math.max(45, Math.min(88, min + Math.floor(rng() * Math.max(1, max - min + 1))))
  const id = `nationalfiller-${countryId}-${hashSeed(countryId, index, rng())}`
  const tiers = buildPlayerArchetypeTiers(rng)
  let skills = buildBalancedSubStats(hashSeed(id, 'skills'), (cat) => tiers[cat])
  skills = scaleSkillsToTargetOvr(skills, targetOvr)
  const age = FILLER_AGE_MIN + Math.floor(rng() * (FILLER_AGE_MAX - FILLER_AGE_MIN + 1))
  const country = ACADEMY_COUNTRIES[countryId]

  const player = {
    id,
    firstName,
    lastName,
    jersey: 1 + Math.floor(rng() * 99),
    age,
    skills,
    skillsGen: SKILLS_GEN_VERSION,
    // Dogenerowani są od razu FREE_AGENT — turniej ich tylko "pożycza" (patrz
    // releaseGeneratedSquadToFreeAgency), nigdy nie trafiają do żadnego klubu automatycznie.
    status: PLAYER_STATUS.FREE_AGENT,
    nationality: country?.nameEn ?? null,
    isNationalTeamGenerated: true,
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
  ensurePlayerDevelopment(player)
  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  ensurePlayerLoyalty(player)
  ensurePlayerInjury(player)
  refreshPlayerMarketValue(player)
  return player
}

/**
 * Buduje kadrę kraju: najlepsi zawodnicy tej narodowości (kluby świata + wolni agenci) wg
 * OVR, ucięci do `max` (domyślnie 24). Jeśli realnych jest mniej niż `min` (domyślnie 16),
 * dogenerowuje różnicę proceduralnie (jakość zależna od coefficientu kraju — patrz
 * `rollFillerOvrBand`). Realny zawodnik nigdy nie opuszcza swojego klubu — to tylko
 * referencja do wspólnej puli na czas meczu/turnieju, nie transfer.
 */
export function selectNationalSquad(world, career, countryId, options = {}) {
  const min = options.min ?? NATIONAL_SQUAD_SIZE_MIN
  const max = options.max ?? NATIONAL_SQUAD_SIZE_MAX
  const seasonYear = options.seasonYear ?? null
  const nt = ensureCareerNationalTeams(career)
  const country = ACADEMY_COUNTRIES[countryId]
  if (!country) {
    return { countryId, countryName: null, players: [], generatedPlayerIds: [] }
  }

  const nameEn = country.nameEn
  const pool = []
  for (const team of worldTeamsList(world)) {
    for (const p of team.players ?? []) {
      if (p.nationality === nameEn) pool.push(p)
    }
  }
  for (const p of world?.freeAgents ?? []) {
    if (p.nationality === nameEn) pool.push(p)
  }
  pool.sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))

  const real = pool.slice(0, max)
  const generatedPlayers = []
  if (real.length < min) {
    const need = min - real.length
    const strength = getCountryStrength(career, countryId)
    const rng = mulberry32(hashSeed('national-squad-fill', countryId, seasonYear ?? 0, career?.slotIndex ?? 0))
    for (let i = 0; i < need; i += 1) {
      generatedPlayers.push(createNationalTeamFillerPlayer(rng, countryId, strength, i))
    }
  }

  const players = [...real, ...generatedPlayers]
  // Skład "zamrożony" na czas okna/turnieju (jak ogłoszenie kadry w piłce) — pełne obiekty
  // dogenerowanych trzymane tutaj (nie tylko id), żeby releaseGeneratedSquadToFreeAgency
  // mogło je później dopisać do world.freeAgents bez odtwarzania z ziarna.
  nt.squadsByCountry[countryId] = {
    playerIds: players.map((p) => p.id),
    generatedPlayers,
    asOfDate: seasonYear ?? null,
  }

  return {
    countryId,
    countryName: nameEn,
    players,
    generatedPlayerIds: generatedPlayers.map((p) => p.id),
  }
}

/**
 * Po zakończeniu udziału kadry w rozgrywkach (odpadnięcie w kwalifikacjach / koniec turnieju
 * — wołane z przyszłych faz kwalifikacyjnej/finałowej) dogenerowani zawodnicy trafiają na
 * wolny rynek: stają się realnym, skautowalnym transferem zamiast znikać. Realni ligowi
 * zawodnicy w składzie nie są tu ruszani — nigdy nie opuścili swojego klubu.
 */
export function releaseGeneratedSquadToFreeAgency(world, career, countryId) {
  const nt = ensureCareerNationalTeams(career)
  const squad = nt.squadsByCountry[countryId]
  if (!squad?.generatedPlayers?.length) return { released: [] }
  ensureWorldFreeAgents(world)
  const released = squad.generatedPlayers
  world.freeAgents.push(...released)
  squad.generatedPlayers = []
  return { released }
}
