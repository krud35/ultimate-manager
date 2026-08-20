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
import { getOverallRating } from '../models/playerStats.js'
import { worldTeamById, worldTeamsList } from './worldState.js'
import { createAcademyProspect, ensureTeamAcademyCandidates } from './academy.js'

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

export const SCOUT_MISSION_KINDS = ['tactics', 'keyPlayers', 'player', 'academyProspect']

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
}

/** Bezpiecznik: misja bez pasującego meczu (offseason) rozwiązuje się po tylu dniach. */
export const SCOUT_MISSION_EXPIRY_DAYS = 21
/** Dossier na wolnego agenta (brak klubu -> brak meczu) trwa tyle dni. */
export const SCOUT_MISSION_DOSSIER_DAYS = 5

/**
 * Misja `academyProspect` to kampania rozłożona na tygodnie, nie jednorazowy dossier:
 * skaut wyjeżdża w region na `ACADEMY_CAMPAIGN_WEEKS` tygodni, obserwując tych samych
 * `ACADEMY_CANDIDATES_PER_MISSION` kandydatów, o których wiedza rośnie co tydzień
 * (25→40→55→70→85 po 4 tygodniach) — na start mocno zamglona ocena, pod koniec prawie pewna.
 */
export const ACADEMY_CAMPAIGN_WEEKS = 4
export const ACADEMY_CANDIDATES_PER_MISSION = 3
export const ACADEMY_INITIAL_KNOWLEDGE = 25
export const ACADEMY_WEEKLY_KNOWLEDGE_GAIN = 15
/** Co tydzień szansa, że skaut namierzy jeszcze jednego kandydata (do limitu). */
export const ACADEMY_NEW_CANDIDATE_CHANCE = 0.35
export const ACADEMY_MAX_CANDIDATES_PER_MISSION = 6
/** Odwołanie skauta z wyjazdu — wraca po 2-3 dniach, kandydaci już namierzeni zostają. */
export const ACADEMY_RECALL_MIN_DAYS = 2
export const ACADEMY_RECALL_MAX_DAYS = 3

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

function newMissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `scout-${crypto.randomUUID()}`
  return `scout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * @param {object} team
 * @param {{ kind: 'tactics'|'keyPlayers'|'player'|'academyProspect', opponentTeamId?: string|null, targetPlayerId?: string|null, region?: string|null, date: string }} params
 */
export function queueScoutMission(team, { kind, opponentTeamId = null, targetPlayerId = null, region = null, date }) {
  if (!team || !SCOUT_MISSION_KINDS.includes(kind)) {
    return { ok: false, error: 'invalid_kind' }
  }
  if ((kind === 'tactics' || kind === 'keyPlayers') && !opponentTeamId) {
    return { ok: false, error: 'missing_opponent' }
  }
  if (kind === 'player' && !targetPlayerId) {
    return { ok: false, error: 'missing_target' }
  }
  if (kind === 'academyProspect' && !region) {
    return { ok: false, error: 'missing_region' }
  }
  const scouting = ensureTeamScouting(team)
  if (scouting.pendingMissions.length >= scoutMissionCapacity(team)) {
    return { ok: false, error: 'capacity' }
  }
  const cost = scoutMissionCost(kind, team)
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
    region,
    queuedAtDate: date ?? null,
    expiresAtDate: date ? addDaysIso(date, SCOUT_MISSION_EXPIRY_DAYS) : null,
  }
  if (kind === 'academyProspect') {
    const seasonYear = date ? Number(String(date).slice(0, 4)) : null
    const rng = mulberry32(hashSeed(mission.id, 'academy-campaign-seed'))
    const candidates = ensureTeamAcademyCandidates(team)
    const candidateIds = []
    for (let i = 0; i < ACADEMY_CANDIDATES_PER_MISSION; i += 1) {
      const candidate = createAcademyProspect(rng, {
        seasonYear,
        teamId: team.id,
        source: 'scouted',
        region,
        index: i,
      })
      candidates.push(candidate)
      candidateIds.push(candidate.id)
      playerEntry(team, candidate.id).knowledge = ACADEMY_INITIAL_KNOWLEDGE
    }
    mission.candidateIds = candidateIds
    mission.weeksTotal = ACADEMY_CAMPAIGN_WEEKS
    mission.weeksElapsed = 0
    // Gotowość liczona przez weeksElapsed>=weeksTotal, nie przez datę — bezpiecznik
    // SCOUT_MISSION_EXPIRY_DAYS (3 tyg.) zadziałałby przedwcześnie na 4-tyg. kampanii.
    mission.expiresAtDate = null
  }
  scouting.pendingMissions.push(mission)
  return { ok: true, mission, cost, remainingBudget: getTransferBudget(team) }
}

/**
 * Cotygodniowy postęp kampanii `academyProspect` (woływane obok `decayScoutingKnowledge`
 * na weekTick): podbija wiedzę o każdym obserwowanym kandydacie i zwraca listę raportów
 * (po jednym na aktywną kampanię tej drużyny) do zbudowania cotygodniowej wiadomości.
 */
export function advanceAcademyCampaigns(team) {
  const scouting = ensureTeamScouting(team)
  const reports = []
  for (const mission of scouting.pendingMissions) {
    if (mission.kind !== 'academyProspect' || mission.recalling) continue
    mission.weeksElapsed = (mission.weeksElapsed ?? 0) + 1
    for (const candidateId of mission.candidateIds ?? []) {
      bumpKnowledge(playerEntry(team, candidateId), 'knowledge', ACADEMY_WEEKLY_KNOWLEDGE_GAIN)
    }

    const newCandidateIds = []
    if ((mission.candidateIds?.length ?? 0) < ACADEMY_MAX_CANDIDATES_PER_MISSION) {
      const rng = mulberry32(hashSeed(mission.id, 'academy-new-candidate', mission.weeksElapsed))
      if (rng() < ACADEMY_NEW_CANDIDATE_CHANCE) {
        const seasonYear = mission.queuedAtDate
          ? Number(String(mission.queuedAtDate).slice(0, 4))
          : null
        const candidate = createAcademyProspect(rng, {
          seasonYear,
          teamId: team.id,
          source: 'scouted',
          region: mission.region,
          index: mission.candidateIds.length,
        })
        ensureTeamAcademyCandidates(team).push(candidate)
        mission.candidateIds = [...(mission.candidateIds ?? []), candidate.id]
        playerEntry(team, candidate.id).knowledge = ACADEMY_INITIAL_KNOWLEDGE
        newCandidateIds.push(candidate.id)
      }
    }

    reports.push({
      missionId: mission.id,
      region: mission.region,
      weekNumber: mission.weeksElapsed,
      weeksTotal: mission.weeksTotal,
      candidateIds: mission.candidateIds ?? [],
      newCandidateIds,
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
  if (mission.kind !== 'academyProspect') return { ok: false, error: 'not_recallable' }
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
          : (mission.weeksElapsed ?? 0) >= (mission.weeksTotal ?? ACADEMY_CAMPAIGN_WEEKS)
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
