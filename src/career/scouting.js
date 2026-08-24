/**
 * Scouting: znajomość (0–100) drużyn przeciwnych i pojedynczych zawodników (w tym
 * wolnych agentów). Wzorowane na clubFacilities.js — obiekt klubowy `scoutingDept`
 * steruje limitem równoległych misji i ich kosztem. Misje rozwiązują się, gdy
 * obserwowana drużyna rozegra najbliższy mecz (dossier na wolnego agenta rozwiązuje
 * się po stałym opóźnieniu, bo nie ma meczu do obejrzenia). Bez kontaktu znajomość
 * z czasem spada do niskiej podłogi (nigdy do zera — liga i tak się trochę zna).
 */

import { getFixturesOnDate } from '../league/index.js'
import { addDays, formatISODate, parseISODate } from '../league/seasonCalendar.js'
import { getFacilityLevel } from './clubFacilities.js'
import { adjustTransferBudget, getTransferBudget } from './transfers/clubFinances.js'
import { getOverallRating, getSubStat } from '../models/playerStats.js'
import { worldTeamById, worldTeamsList } from './worldState.js'
import { createAcademyProspect, ensureTeamAcademyCandidates } from './academy.js'
import { eucsTeamTier } from '../data/eucsLeagueTeams.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'

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

export const SCOUTING_GEN_VERSION = 1

export const SCOUT_KNOWLEDGE_MIN = 0
export const SCOUT_KNOWLEDGE_MAX = 100
export const SCOUT_KNOWLEDGE_FLOOR_TEAM = 20
export const SCOUT_KNOWLEDGE_FLOOR_PLAYER = 5
export const SCOUT_DECAY_GRACE_WEEKS = 4
export const SCOUT_DECAY_PER_WEEK = 3

export const SCOUT_MATCH_GAIN_KNOWLEDGE = 15
export const SCOUT_MATCH_GAIN_TACTICS = 8
export const SCOUT_MATCH_GAIN_PLAYER = 10
export const SCOUT_MATCH_TOP_PLAYERS = 3

export const SCOUT_MISSION_KINDS = ['tactics', 'keyPlayers', 'player', 'academyProspect', 'playerSearch']

export const SCOUT_MISSION_GAIN = {
  tactics: { tacticsKnowledge: 30, knowledge: 10 },
  keyPlayers: { knowledge: 15, perPlayer: 25, topN: 4 },
  player: { knowledge: 40 },
}

export const SCOUT_MISSION_BASE_COST = {
  tactics: 8_000,
  keyPlayers: 11_000,
  player: 13_000,
  academyProspect: 20_000,
  playerSearch: 15_000,
}

/** Bezpiecznik: misja bez pasującego meczu (offseason) rozwiązuje się po tylu dniach. */
export const SCOUT_MISSION_EXPIRY_DAYS = 21
/** Dossier na wolnego agenta (brak klubu -> brak meczu) trwa tyle dni. */
export const SCOUT_MISSION_DOSSIER_DAYS = 5

/**
 * Misja `academyProspect` to kampania rozłożona na MIESIĄCE (nie tygodnie): skaut
 * wyjeżdża do wybranego kraju na 1/3/6/12 miesięcy (wybór gracza), z cotygodniowym-
 * -teraz-comiesięcznym raportem na 1. dzień kalendarzowego miesiąca (wzorem
 * `processMonthlyTvPayouts`). Bez kandydatów natychmiast po wysłaniu — pierwsza partia
 * pojawia się dopiero w raporcie z 1. miesiąca. Co miesiąc (łącznie z pierwszym) losowana
 * jest nowa partia 1-5 kandydatów, każdy z losową wiedzą startową 20-80%; kandydaci z
 * poprzednich miesięcy zyskują +25-45pp wiedzy. Jakość kandydata (pasmo OVR) zależy od
 * ukrytej siły frisbee w wybranym kraju — patrz `rollProspectOvrBand` w academy.js.
 */
export const ACADEMY_DURATIONS_MONTHS = [1, 3, 6, 12]
/** Mnożnik kosztu wg długości wyjazdu — ekonomia skali, nie liniowo. */
export const ACADEMY_DURATION_COST_MULT = { 1: 1.0, 3: 2.2, 6: 3.8, 12: 6.5 }
export const ACADEMY_NEW_CANDIDATES_MIN_PER_MONTH = 1
export const ACADEMY_NEW_CANDIDATES_MAX_PER_MONTH = 5
export const ACADEMY_MAX_CANDIDATES = 20
export const ACADEMY_KNOWLEDGE_REVEAL_MIN = 20
export const ACADEMY_KNOWLEDGE_REVEAL_MAX = 80
export const ACADEMY_KNOWLEDGE_GROWTH_MIN = 25
export const ACADEMY_KNOWLEDGE_GROWTH_MAX = 45
/** Odwołanie skauta z wyjazdu — wraca po 2-3 dniach, kandydaci już namierzeni zostają. */
export const ACADEMY_RECALL_MIN_DAYS = 2
export const ACADEMY_RECALL_MAX_DAYS = 3

/**
 * Misja `playerSearch` to kampania szukająca REALNYCH, już istniejących zawodników
 * w lidze (nie generuje nikogo nowego jak akademia) pasujących do zadanego profilu
 * umiejętności (np. "deep threat"). Shortlist ustala się raz przy wysłaniu skauta
 * (na podstawie ukrytego dopasowania), po czym wiedza o tych samych kandydatach
 * rośnie co tydzień (30→50→70→90 po 3 tygodniach) — krótsza kampania niż akademia,
 * bo to gotowi zawodnicy, nie surowy potencjał do odkrycia.
 */
export const PLAYER_SEARCH_CAMPAIGN_WEEKS = 3
export const PLAYER_SEARCH_SHORTLIST_SIZE = 5
export const PLAYER_SEARCH_INITIAL_KNOWLEDGE = 30
export const PLAYER_SEARCH_WEEKLY_KNOWLEDGE_GAIN = 20

export const PLAYER_SEARCH_PROFILES = [
  {
    id: 'huckSpecialist',
    labelPl: 'Specjalista od hucków',
    labelEn: 'Huck specialist',
    weights: [
      { category: 'throwing', key: 'huck', weight: 0.5 },
      { category: 'throwing', key: 'backhand', weight: 0.2 },
      { category: 'throwing', key: 'hammer', weight: 0.15 },
      { category: 'mental', key: 'vision', weight: 0.15 },
    ],
  },
  {
    id: 'deepThreat',
    labelPl: 'Deep threat',
    labelEn: 'Deep threat',
    weights: [
      { category: 'physical', key: 'speed', weight: 0.35 },
      { category: 'physical', key: 'jump', weight: 0.25 },
      { category: 'offensive', key: 'cutterMovement', weight: 0.25 },
      { category: 'offensive', key: 'catching', weight: 0.15 },
    ],
  },
  {
    id: 'handler',
    labelPl: 'Rozgrywający',
    labelEn: 'Handler',
    weights: [
      { category: 'mental', key: 'vision', weight: 0.3 },
      { category: 'mental', key: 'decisionMaking', weight: 0.25 },
      { category: 'offensive', key: 'handlerMovement', weight: 0.25 },
      { category: 'throwing', key: 'backhand', weight: 0.2 },
    ],
  },
  {
    id: 'lockdownDefender',
    labelPl: 'Twardy obrońca',
    labelEn: 'Lockdown defender',
    weights: [
      { category: 'defensive', key: 'blocking', weight: 0.35 },
      { category: 'defensive', key: 'defensiveCutterMovement', weight: 0.25 },
      { category: 'defensive', key: 'defensiveHandlerMovement', weight: 0.2 },
      { category: 'mental', key: 'reactions', weight: 0.2 },
    ],
  },
  {
    id: 'twoWayAthlete',
    labelPl: 'Dwukierunkowy atleta',
    labelEn: 'Two-way athlete',
    weights: [
      { category: 'physical', key: 'speed', weight: 0.2 },
      { category: 'physical', key: 'endurance', weight: 0.2 },
      { category: 'offensive', key: 'offensiveSystemsKnowledge', weight: 0.2 },
      { category: 'defensive', key: 'defensiveSystemsKnowledge', weight: 0.2 },
      { category: 'mental', key: 'composure', weight: 0.2 },
    ],
  },
  {
    id: 'bigMan',
    labelPl: 'Wysoki / sky-baller',
    labelEn: 'Big man / sky-baller',
    weights: [
      { category: 'physical', key: 'jump', weight: 0.4 },
      { category: 'offensive', key: 'catching', weight: 0.3 },
      { category: 'throwing', key: 'huck', weight: 0.15 },
      { category: 'defensive', key: 'blocking', weight: 0.15 },
    ],
  },
]

export function playerSearchProfile(profileId) {
  return PLAYER_SEARCH_PROFILES.find((p) => p.id === profileId) ?? null
}

export function profileFitScore(skills, profileId) {
  const profile = playerSearchProfile(profileId)
  if (!profile) return 0
  let sum = 0
  let wSum = 0
  for (const { category, key, weight } of profile.weights) {
    sum += getSubStat(skills, category, key) * weight
    wSum += weight
  }
  return wSum > 0 ? sum / wSum : 0
}

function clampKnowledge(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(SCOUT_KNOWLEDGE_MIN, Math.min(SCOUT_KNOWLEDGE_MAX, v))
}

function addDaysIso(iso, days) {
  if (!iso) return null
  return formatISODate(addDays(parseISODate(iso), days))
}

export function ensureTeamScouting(team) {
  if (!team) return team
  if (
    !team.scouting ||
    typeof team.scouting !== 'object' ||
    team.scouting.scoutingGen !== SCOUTING_GEN_VERSION
  ) {
    team.scouting = {
      scoutingGen: SCOUTING_GEN_VERSION,
      opponents: team.scouting?.opponents ?? {},
      players: team.scouting?.players ?? {},
      pendingMissions: team.scouting?.pendingMissions ?? [],
      shortlist: team.scouting?.shortlist ?? [],
    }
  }
  if (!team.scouting.opponents || typeof team.scouting.opponents !== 'object') {
    team.scouting.opponents = {}
  }
  if (!team.scouting.players || typeof team.scouting.players !== 'object') {
    team.scouting.players = {}
  }
  if (!Array.isArray(team.scouting.pendingMissions)) team.scouting.pendingMissions = []
  if (!Array.isArray(team.scouting.shortlist)) team.scouting.shortlist = []
  return team.scouting
}

export function ensureWorldScouting(world) {
  if (!world?.teamsById) return world
  for (const team of worldTeamsList(world)) {
    ensureTeamScouting(team)
  }
  return world
}

function opponentEntry(team, opponentTeamId) {
  const scouting = ensureTeamScouting(team)
  if (!scouting.opponents[opponentTeamId]) {
    scouting.opponents[opponentTeamId] = { knowledge: 0, tacticsKnowledge: 0, weeksSinceContact: 0 }
  }
  return scouting.opponents[opponentTeamId]
}

function playerEntry(team, playerId) {
  const scouting = ensureTeamScouting(team)
  if (!scouting.players[playerId]) {
    scouting.players[playerId] = { knowledge: 0, weeksSinceContact: 0 }
  }
  return scouting.players[playerId]
}

function bumpKnowledge(entry, field, amount) {
  entry[field] = clampKnowledge((entry[field] ?? 0) + amount)
  entry.weeksSinceContact = 0
}

function topPlayersByOvr(team, n) {
  return [...(team?.players ?? [])]
    .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
    .slice(0, n)
}

export function getOpponentKnowledge(team, opponentTeamId) {
  return Math.max(
    SCOUT_KNOWLEDGE_FLOOR_TEAM,
    clampKnowledge(team?.scouting?.opponents?.[opponentTeamId]?.knowledge ?? 0),
  )
}

export function getOpponentTacticsKnowledge(team, opponentTeamId) {
  return Math.max(
    SCOUT_KNOWLEDGE_FLOOR_TEAM,
    clampKnowledge(team?.scouting?.opponents?.[opponentTeamId]?.tacticsKnowledge ?? 0),
  )
}

export function getPlayerKnowledge(team, playerId) {
  return clampKnowledge(team?.scouting?.players?.[playerId]?.knowledge ?? 0)
}

export function pendingScoutMissions(team) {
  return team?.scouting?.pendingMissions ?? []
}

export function hasPendingScoutMission(team, { kind, opponentTeamId = null, targetPlayerId = null }) {
  return pendingScoutMissions(team).some(
    (m) =>
      m.kind === kind &&
      (opponentTeamId == null || m.opponentTeamId === opponentTeamId) &&
      (targetPlayerId == null || m.targetPlayerId === targetPlayerId),
  )
}

// --- shortlist ---

export function isPlayerShortlisted(team, playerId) {
  return ensureTeamScouting(team).shortlist.includes(playerId)
}

export function addToShortlist(team, playerId) {
  const scouting = ensureTeamScouting(team)
  if (!scouting.shortlist.includes(playerId)) scouting.shortlist.push(playerId)
  return scouting.shortlist
}

export function removeFromShortlist(team, playerId) {
  const scouting = ensureTeamScouting(team)
  scouting.shortlist = scouting.shortlist.filter((id) => id !== playerId)
  return scouting.shortlist
}

/** @returns {boolean} nowy stan (true = dodany, false = usunięty) */
export function toggleShortlist(team, playerId) {
  const scouting = ensureTeamScouting(team)
  if (scouting.shortlist.includes(playerId)) {
    removeFromShortlist(team, playerId)
    return false
  }
  addToShortlist(team, playerId)
  return true
}

// --- pasywny przyrost (mecze drużyny gracza) ---

export function recordMatchKnowledgeGain(world, playerTeamId, opponentTeamId) {
  const team = worldTeamById(world, playerTeamId)
  const opponent = worldTeamById(world, opponentTeamId)
  if (!team || !opponent || playerTeamId === opponentTeamId) return
  const entry = opponentEntry(team, opponentTeamId)
  bumpKnowledge(entry, 'knowledge', SCOUT_MATCH_GAIN_KNOWLEDGE)
  bumpKnowledge(entry, 'tacticsKnowledge', SCOUT_MATCH_GAIN_TACTICS)
  for (const p of topPlayersByOvr(opponent, SCOUT_MATCH_TOP_PLAYERS)) {
    bumpKnowledge(playerEntry(team, p.id), 'knowledge', SCOUT_MATCH_GAIN_PLAYER)
  }
}

/**
 * Wołane obok `messagesFromNewPlayerMatches` — ten sam diff `prevHistory`/`nextHistory`,
 * żeby pasywny przyrost trafiał zarówno z rozegranych, jak i auto-zasymulowanych meczów gracza.
 */
export function recordMatchKnowledgeGainForNewMatches(world, playerTeamId, prevHistory, nextHistory) {
  if (!world || !playerTeamId) return
  const prevIds = new Set((prevHistory ?? []).map((e) => e.fixtureId))
  for (const entry of nextHistory ?? []) {
    if (!entry?.playedByPlayer) continue
    if (prevIds.has(entry.fixtureId)) continue
    if (entry.homeTeamId !== playerTeamId && entry.awayTeamId !== playerTeamId) continue
    const opponentTeamId = entry.homeTeamId === playerTeamId ? entry.awayTeamId : entry.homeTeamId
    recordMatchKnowledgeGain(world, playerTeamId, opponentTeamId)
  }
}

// --- rozpad w czasie ---

export function decayScoutingKnowledge(world, playerTeamId) {
  const team = worldTeamById(world, playerTeamId)
  if (!team) return
  const scouting = ensureTeamScouting(team)
  for (const entry of Object.values(scouting.opponents)) {
    entry.weeksSinceContact = (entry.weeksSinceContact ?? 0) + 1
    if (entry.weeksSinceContact > SCOUT_DECAY_GRACE_WEEKS) {
      entry.knowledge = Math.max(SCOUT_KNOWLEDGE_FLOOR_TEAM, entry.knowledge - SCOUT_DECAY_PER_WEEK)
      entry.tacticsKnowledge = Math.max(
        SCOUT_KNOWLEDGE_FLOOR_TEAM,
        entry.tacticsKnowledge - SCOUT_DECAY_PER_WEEK,
      )
    }
  }
  for (const entry of Object.values(scouting.players)) {
    entry.weeksSinceContact = (entry.weeksSinceContact ?? 0) + 1
    if (entry.weeksSinceContact > SCOUT_DECAY_GRACE_WEEKS) {
      entry.knowledge = Math.max(SCOUT_KNOWLEDGE_FLOOR_PLAYER, entry.knowledge - SCOUT_DECAY_PER_WEEK)
    }
  }
}

// --- misje skautingowe ---

export function scoutMissionCapacity(team) {
  const level = getFacilityLevel(team, 'scoutingDept')
  return 1 + Math.floor(level / 3)
}

export function scoutMissionCost(kind, team) {
  const level = getFacilityLevel(team, 'scoutingDept')
  const base = SCOUT_MISSION_BASE_COST[kind] ?? 10_000
  const levelMultiplier = 1.3 - level * 0.04
  return Math.max(1_000, Math.round((base * levelMultiplier) / 500) * 500)
}

/**
 * Mnożnik geograficzny dla skautingu akademii: im dalej od "domu" (Europa dla drużyn
 * UltiLeague/EUCS, USA dla reszty — UFA), tym drożej. USA ma dodatkową zniżkę "krajową"
 * dla drużyn UFA, bo to jedyny wyraźny pojedynczy kraj domowy w tej grze (UltiLeague jest
 * panEuropejska, więc cała Europa liczy się jako "dom", bez dalszej zniżki per kraj).
 */
function academyGeoCostMultiplier(team, countryId) {
  const continent = ACADEMY_COUNTRIES[countryId]?.continent ?? null
  const isEucsTeam = eucsTeamTier(team?.id) != null
  if (isEucsTeam) {
    if (continent === 'europe') return 1.0
    if (continent === 'africa' || continent === 'asia') return 1.2
    if (continent === 'northAmerica' || continent === 'southAmerica') return 1.4
    return 1.6 // oceania
  }
  if (countryId === 'us') return 0.8
  if (continent === 'northAmerica') return 1.0
  if (continent === 'southAmerica') return 1.2
  if (continent === 'europe' || continent === 'africa') return 1.4
  return 1.6 // asia / oceania
}

/** Koszt misji `academyProspect`: bazowy koszt × poziom działu skautingu × odległość × długość. */
export function academyScoutMissionCost(team, countryId, durationMonths) {
  const level = getFacilityLevel(team, 'scoutingDept')
  const base = SCOUT_MISSION_BASE_COST.academyProspect ?? 20_000
  const levelMultiplier = 1.3 - level * 0.04
  const geoMultiplier = academyGeoCostMultiplier(team, countryId)
  const durationMultiplier = ACADEMY_DURATION_COST_MULT[durationMonths] ?? 1
  return Math.max(
    1_000,
    Math.round((base * levelMultiplier * geoMultiplier * durationMultiplier) / 500) * 500,
  )
}

function newMissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `scout-${crypto.randomUUID()}`
  return `scout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * @param {object} team
 * @param {{ kind: 'tactics'|'keyPlayers'|'player'|'academyProspect'|'playerSearch', opponentTeamId?: string|null, targetPlayerId?: string|null, countryId?: string|null, durationMonths?: number|null, profileId?: string|null, world?: object|null, date: string }} params
 */
export function queueScoutMission(
  team,
  {
    kind,
    opponentTeamId = null,
    targetPlayerId = null,
    countryId = null,
    durationMonths = null,
    profileId = null,
    world = null,
    date,
  },
) {
  if (!team || !SCOUT_MISSION_KINDS.includes(kind)) {
    return { ok: false, error: 'invalid_kind' }
  }
  if ((kind === 'tactics' || kind === 'keyPlayers') && !opponentTeamId) {
    return { ok: false, error: 'missing_opponent' }
  }
  if (kind === 'player' && !targetPlayerId) {
    return { ok: false, error: 'missing_target' }
  }
  if (kind === 'academyProspect' && !countryId) {
    return { ok: false, error: 'missing_country' }
  }
  if (kind === 'academyProspect' && !ACADEMY_DURATIONS_MONTHS.includes(durationMonths)) {
    return { ok: false, error: 'invalid_duration' }
  }
  if (kind === 'playerSearch' && !profileId) {
    return { ok: false, error: 'missing_profile' }
  }
  const scouting = ensureTeamScouting(team)
  if (scouting.pendingMissions.length >= scoutMissionCapacity(team)) {
    return { ok: false, error: 'capacity' }
  }
  const cost =
    kind === 'academyProspect'
      ? academyScoutMissionCost(team, countryId, durationMonths)
      : scoutMissionCost(kind, team)
  const budget = getTransferBudget(team)
  if (budget < cost) {
    return { ok: false, error: 'insufficient_funds', cost, remainingBudget: budget }
  }
  adjustTransferBudget(team, -cost)
  const mission = {
    id: newMissionId(),
    kind,
    opponentTeamId,
    targetPlayerId,
    countryId,
    profileId,
    queuedAtDate: date ?? null,
    expiresAtDate: date ? addDaysIso(date, SCOUT_MISSION_EXPIRY_DAYS) : null,
  }
  if (kind === 'playerSearch') {
    const pool = [
      ...worldTeamsList(world)
        .filter((t) => t.id !== team.id)
        .flatMap((t) => t.players ?? []),
      ...(world?.freeAgents ?? []),
    ]
    const ranked = pool
      .map((p) => ({ id: p.id, fit: profileFitScore(p.skills, profileId) }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, PLAYER_SEARCH_SHORTLIST_SIZE)
    const candidateIds = ranked.map((r) => r.id)
    for (const id of candidateIds) {
      playerEntry(team, id).knowledge = PLAYER_SEARCH_INITIAL_KNOWLEDGE
    }
    mission.candidateIds = candidateIds
    mission.weeksTotal = PLAYER_SEARCH_CAMPAIGN_WEEKS
    mission.weeksElapsed = 0
    mission.expiresAtDate = null
  }
  if (kind === 'academyProspect') {
    // Bez kandydatów natychmiast — pierwsza partia pojawia się dopiero w raporcie z
    // 1. miesiąca (patrz advanceAcademyCampaigns). Gotowość liczona przez
    // monthsElapsed>=monthsTotal, nie przez datę.
    mission.durationMonths = durationMonths
    mission.monthsTotal = durationMonths
    mission.monthsElapsed = 0
    mission.lastProcessedYm = null
    mission.candidateIds = []
    mission.expiresAtDate = null
  }
  scouting.pendingMissions.push(mission)
  return { ok: true, mission, cost, remainingBudget: getTransferBudget(team) }
}

/**
 * Comiesięczny postęp kampanii `academyProspect` — wzorzec 1:1 z `processMonthlyTvPayouts`
 * (dzień kalendarzowy === 1, idempotentne przez `mission.lastProcessedYm`). Wołane
 * CODZIENNIE (nie tylko w weekTick), bo sama funkcja gates on dzień miesiąca.
 * Co miesiąc (łącznie z pierwszym): losuje 1-5 nowych kandydatów (do twardego limitu
 * `ACADEMY_MAX_CANDIDATES`), każdy z losową wiedzą startową 20-80%; kandydaci z
 * poprzednich miesięcy tej misji zyskują +25-45pp wiedzy.
 */
export function advanceAcademyCampaigns(team, dateIso) {
  if (!dateIso) return []
  const day = Number(String(dateIso).slice(8, 10))
  if (day !== 1) return []
  const ym = String(dateIso).slice(0, 7)
  const scouting = ensureTeamScouting(team)
  const reports = []
  for (const mission of scouting.pendingMissions) {
    if (mission.kind !== 'academyProspect' || mission.recalling) continue
    if (mission.lastProcessedYm === ym) continue
    mission.lastProcessedYm = ym
    mission.monthsElapsed = (mission.monthsElapsed ?? 0) + 1

    const existingIds = mission.candidateIds ?? []
    const growthRng = mulberry32(hashSeed(mission.id, 'academy-growth', mission.monthsElapsed))
    for (const candidateId of existingIds) {
      const growth =
        ACADEMY_KNOWLEDGE_GROWTH_MIN +
        Math.floor(growthRng() * (ACADEMY_KNOWLEDGE_GROWTH_MAX - ACADEMY_KNOWLEDGE_GROWTH_MIN + 1))
      bumpKnowledge(playerEntry(team, candidateId), 'knowledge', growth)
    }

    const countRng = mulberry32(hashSeed(mission.id, 'academy-new-count', mission.monthsElapsed))
    const desiredCount =
      ACADEMY_NEW_CANDIDATES_MIN_PER_MONTH +
      Math.floor(
        countRng() * (ACADEMY_NEW_CANDIDATES_MAX_PER_MONTH - ACADEMY_NEW_CANDIDATES_MIN_PER_MONTH + 1),
      )
    const room = Math.max(0, ACADEMY_MAX_CANDIDATES - existingIds.length)
    const newCount = Math.min(desiredCount, room)

    const newCandidateIds = []
    if (newCount > 0) {
      const seasonYear = mission.queuedAtDate ? Number(String(mission.queuedAtDate).slice(0, 4)) : null
      const profileWeights = mission.profileId ? playerSearchProfile(mission.profileId)?.weights ?? null : null
      const genRng = mulberry32(hashSeed(mission.id, 'academy-gen', mission.monthsElapsed))
      const revealRng = mulberry32(hashSeed(mission.id, 'academy-reveal', mission.monthsElapsed))
      for (let i = 0; i < newCount; i += 1) {
        const candidate = createAcademyProspect(genRng, {
          seasonYear,
          teamId: team.id,
          source: 'scouted',
          countryId: mission.countryId,
          profileWeights,
          index: existingIds.length + i,
        })
        ensureTeamAcademyCandidates(team).push(candidate)
        const reveal =
          ACADEMY_KNOWLEDGE_REVEAL_MIN +
          Math.floor(revealRng() * (ACADEMY_KNOWLEDGE_REVEAL_MAX - ACADEMY_KNOWLEDGE_REVEAL_MIN + 1))
        bumpKnowledge(playerEntry(team, candidate.id), 'knowledge', reveal)
        newCandidateIds.push(candidate.id)
      }
      mission.candidateIds = [...existingIds, ...newCandidateIds]
    }

    reports.push({
      missionId: mission.id,
      countryId: mission.countryId,
      profileId: mission.profileId,
      monthNumber: mission.monthsElapsed,
      monthsTotal: mission.monthsTotal,
      candidateIds: mission.candidateIds ?? [],
      newCandidateIds,
    })
  }
  return reports
}

/**
 * Cotygodniowy postęp kampanii `playerSearch` (wołane obok `advanceAcademyCampaigns`
 * na weekTick): podbija wiedzę o każdym namierzonym realnym zawodniku ze stałej
 * shortlisty ustalonej przy wysłaniu skauta — w przeciwieństwie do akademii tu lista
 * się nie zmienia (nie generujemy nowych ludzi, tylko odkrywamy istniejących).
 */
export function advancePlayerSearchCampaigns(team) {
  const scouting = ensureTeamScouting(team)
  const reports = []
  for (const mission of scouting.pendingMissions) {
    if (mission.kind !== 'playerSearch' || mission.recalling) continue
    mission.weeksElapsed = (mission.weeksElapsed ?? 0) + 1
    for (const candidateId of mission.candidateIds ?? []) {
      bumpKnowledge(playerEntry(team, candidateId), 'knowledge', PLAYER_SEARCH_WEEKLY_KNOWLEDGE_GAIN)
    }
    reports.push({
      missionId: mission.id,
      profileId: mission.profileId,
      weekNumber: mission.weeksElapsed,
      weeksTotal: mission.weeksTotal,
      candidateIds: mission.candidateIds ?? [],
    })
  }
  return reports
}

/**
 * Odwołuje skauta z wyjazdu przed zakończeniem kampanii — wraca po 2-3 dniach (bez
 * dalszego postępu obserwacji), już namierzeni kandydaci zostają widoczni w akademii.
 */
export function recallScoutMission(team, missionId, date) {
  const scouting = ensureTeamScouting(team)
  const mission = scouting.pendingMissions.find((m) => m.id === missionId)
  if (!mission) return { ok: false, error: 'not_found' }
  if (!['academyProspect', 'playerSearch'].includes(mission.kind)) {
    return { ok: false, error: 'not_recallable' }
  }
  if (mission.recalling) return { ok: false, error: 'already_recalling' }
  const rng = mulberry32(hashSeed(mission.id, 'academy-recall'))
  const returnDays =
    ACADEMY_RECALL_MIN_DAYS +
    Math.round(rng() * (ACADEMY_RECALL_MAX_DAYS - ACADEMY_RECALL_MIN_DAYS))
  mission.recalling = true
  mission.recallReturnDate = date ? addDaysIso(date, returnDays) : null
  return { ok: true, mission }
}

export function findPlayerTeamId(world, playerId) {
  for (const team of worldTeamsList(world)) {
    if ((team.players ?? []).some((p) => p.id === playerId)) return team.id
  }
  return null
}

function findCompletedFixtureForTeam(league, date, teamId) {
  if (!league || !date || !teamId) return null
  const fixtures = getFixturesOnDate(league, date) ?? []
  return (
    fixtures.find(
      (f) => f.status === 'completed' && (f.homeTeamId === teamId || f.awayTeamId === teamId),
    ) ?? null
  )
}

function applyMissionResult(team, world, mission) {
  const result = { ...mission, knowledgeGained: 0, tacticsGained: 0, revealedPlayers: [] }
  if (mission.kind === 'tactics') {
    const entry = opponentEntry(team, mission.opponentTeamId)
    bumpKnowledge(entry, 'tacticsKnowledge', SCOUT_MISSION_GAIN.tactics.tacticsKnowledge)
    bumpKnowledge(entry, 'knowledge', SCOUT_MISSION_GAIN.tactics.knowledge)
    result.tacticsGained = SCOUT_MISSION_GAIN.tactics.tacticsKnowledge
    result.knowledgeGained = SCOUT_MISSION_GAIN.tactics.knowledge
  } else if (mission.kind === 'keyPlayers') {
    const opponent = worldTeamById(world, mission.opponentTeamId)
    const entry = opponentEntry(team, mission.opponentTeamId)
    bumpKnowledge(entry, 'knowledge', SCOUT_MISSION_GAIN.keyPlayers.knowledge)
    result.knowledgeGained = SCOUT_MISSION_GAIN.keyPlayers.knowledge
    for (const p of topPlayersByOvr(opponent, SCOUT_MISSION_GAIN.keyPlayers.topN)) {
      bumpKnowledge(playerEntry(team, p.id), 'knowledge', SCOUT_MISSION_GAIN.keyPlayers.perPlayer)
      result.revealedPlayers.push({ playerId: p.id, knowledge: getPlayerKnowledge(team, p.id) })
    }
  } else if (mission.kind === 'player') {
    bumpKnowledge(playerEntry(team, mission.targetPlayerId), 'knowledge', SCOUT_MISSION_GAIN.player.knowledge)
    result.knowledgeGained = SCOUT_MISSION_GAIN.player.knowledge
    result.revealedPlayers.push({
      playerId: mission.targetPlayerId,
      knowledge: getPlayerKnowledge(team, mission.targetPlayerId),
    })
  } else if (mission.kind === 'academyProspect') {
    result.academyConcluded = true
    result.academyRecalled = !!mission.recalling
    result.candidateIds = mission.candidateIds ?? []
  } else if (mission.kind === 'playerSearch') {
    result.playerSearchConcluded = true
    result.playerSearchRecalled = !!mission.recalling
    result.profileId = mission.profileId
    result.candidateIds = mission.candidateIds ?? []
  }
  return result
}

/**
 * Rozwiązuje misje gotowe na dany dzień: drużyna/klub celu rozegrała dziś mecz,
 * dossier na wolnego agenta minęło swój czas, albo misja wygasła (offseason safety-net).
 * @returns {object[]} lista rozwiązanych misji z wynikami (do zbudowania wiadomości w skrzynce)
 */
export function resolveScoutMissions(world, playerTeamId, league, date) {
  const team = worldTeamById(world, playerTeamId)
  if (!team || !date) return []
  const scouting = ensureTeamScouting(team)
  if (!scouting.pendingMissions.length) return []

  const resolved = []
  const stillPending = []

  for (const mission of scouting.pendingMissions) {
    const expired = !!mission.expiresAtDate && date >= mission.expiresAtDate
    let ready = expired

    if (!ready) {
      if (mission.kind === 'academyProspect') {
        ready = mission.recalling
          ? !!mission.recallReturnDate && date >= mission.recallReturnDate
          : (mission.monthsElapsed ?? 0) >= (mission.monthsTotal ?? 1)
      } else if (mission.kind === 'playerSearch') {
        ready = mission.recalling
          ? !!mission.recallReturnDate && date >= mission.recallReturnDate
          : (mission.weeksElapsed ?? 0) >= (mission.weeksTotal ?? PLAYER_SEARCH_CAMPAIGN_WEEKS)
      } else if (mission.kind === 'player') {
        const clubId = findPlayerTeamId(world, mission.targetPlayerId)
        if (!clubId) {
          const readyAt = mission.queuedAtDate
            ? addDaysIso(mission.queuedAtDate, SCOUT_MISSION_DOSSIER_DAYS)
            : date
          ready = date >= readyAt
        } else {
          ready = !!findCompletedFixtureForTeam(league, date, clubId)
        }
      } else {
        ready = !!findCompletedFixtureForTeam(league, date, mission.opponentTeamId)
      }
    }

    if (ready) {
      resolved.push(applyMissionResult(team, world, mission))
    } else {
      stillPending.push(mission)
    }
  }

  scouting.pendingMissions = stillPending
  return resolved
}
