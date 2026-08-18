/**
 * "Cieniowa" liga — poziomy piramidy europejskiej, którymi gracz aktualnie NIE zarządza.
 * Bez pełnych składów/finansów: tylko tożsamość drużyny + siła (z realnego winPct),
 * rozgrywana każdy-z-każdym x2 i rozstrzygana od razu (partia w tle, nikt jej nie ogląda).
 */
import { generateDoubleRoundRobinSchedule, flattenSchedule } from './schedule.js'
import { applyGameToStandings, createStandings, standingsTable } from './standings.js'
import {
  eucsTeamsForTier,
  buildEucsLeagueTemplate,
  eucsTeamById,
  eucsTeamStrength,
} from '../data/eucsLeagueTeams.js'

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

/** Drużyny cieniowe dla poziomu (tożsamość + siła = winPct realny, 0–100). */
export function shadowTeamsForTier(tier) {
  return eucsTeamsForTier(tier).map((t) => ({
    id: t.id,
    name: t.name,
    tier,
    strength: t.winPct ?? 50,
  }))
}

/** Buduje tożsamości cieniowe z listy id drużyn (np. po awansach/spadkach na nowy sezon). */
export function shadowTeamsFromIds(ids, tier) {
  return ids.map((id) => ({
    id,
    name: eucsTeamById(id)?.name ?? id,
    tier,
    strength: eucsTeamStrength(id),
  }))
}

/** @param {{id:string,name:string,tier:number,strength:number}[]} teams */
export function createShadowLeague(teams, seed) {
  const teamIds = teams.map((t) => t.id)
  const scheduleRounds = generateDoubleRoundRobinSchedule(teamIds)
  return {
    teamIds,
    teamsById: Object.fromEntries(teams.map((t) => [t.id, t])),
    fixtures: flattenSchedule(scheduleRounds),
    standings: createStandings(teamIds),
    seed,
  }
}

/**
 * Rozstrzyga pojedynczy mecz na bazie różnicy sił (logistyczne p. wygranej + realistyczny
 * wynik ultimate: zwycięzca 15, przegrany tym niżej im większa przewaga faworyta).
 */
export function simulateShadowMatchResult(strengthA, strengthB, seed) {
  const rng = mulberry32(seed)
  const diff = strengthA - strengthB
  const pA = 1 / (1 + Math.pow(10, -diff / 40))
  const aWins = rng() < pA
  const winnerScore = 15
  const closeness = 1 - Math.min(1, Math.abs(pA - 0.5) * 2)
  const base = 8 + closeness * 5
  const loserScore = Math.max(3, Math.min(14, Math.round(base + (rng() - 0.5) * 4)))
  return aWins
    ? { scoreA: winnerScore, scoreB: loserScore, winner: 'A' }
    : { scoreA: loserScore, scoreB: winnerScore, winner: 'B' }
}

/** Rozstrzyga cały sezon cieniowy w jednej partii (mutuje shadowLeague). */
export function simulateShadowSeason(shadowLeague) {
  for (const fixture of shadowLeague.fixtures) {
    if (fixture.status === 'completed') continue
    const home = shadowLeague.teamsById[fixture.homeTeamId]
    const away = shadowLeague.teamsById[fixture.awayTeamId]
    const seed = hashSeed(shadowLeague.seed, fixture.id)
    const result = simulateShadowMatchResult(home.strength, away.strength, seed)
    fixture.status = 'completed'
    fixture.homeScore = result.scoreA
    fixture.awayScore = result.scoreB
    fixture.winnerTeamId = result.winner === 'A' ? fixture.homeTeamId : fixture.awayTeamId
    applyGameToStandings(
      shadowLeague.standings,
      fixture.homeTeamId,
      fixture.awayTeamId,
      result.scoreA,
      result.scoreB,
    )
  }
  return shadowLeague
}

/** Finalna tabela cieniowej ligi w tym samym kształcie co standingsTable() dla ligi gracza. */
export function shadowStandingsTable(shadowLeague) {
  const nameById = shadowLeague.teamsById
  return standingsTable(shadowLeague.standings, (id) => nameById[id]?.name ?? id)
}

/**
 * Tabela cieniowej ligi „na dziś" — czysta funkcja (NIE mutuje shadowLeague), liczy
 * wyniki tylko dla kolejek <= round. Ten sam seed per-fixture co simulateShadowSeason,
 * więc wynik jest identyczny z tym co finalnie zapisze się w standings na koniec
 * sezonu — bezpieczne do podglądu w trakcie sezonu (np. widok Piramidy) bez ryzyka
 * rozjazdu między tym co gracz widział a tym co policzy się przy awansach/spadkach.
 */
export function shadowStandingsThroughRound(shadowLeague, round) {
  const standings = createStandings(shadowLeague.teamIds)
  for (const fixture of shadowLeague.fixtures) {
    if (round != null && fixture.round > round) continue
    if (fixture.status === 'completed') {
      applyGameToStandings(
        standings,
        fixture.homeTeamId,
        fixture.awayTeamId,
        fixture.homeScore,
        fixture.awayScore,
      )
      continue
    }
    const home = shadowLeague.teamsById[fixture.homeTeamId]
    const away = shadowLeague.teamsById[fixture.awayTeamId]
    const seed = hashSeed(shadowLeague.seed, fixture.id)
    const result = simulateShadowMatchResult(home.strength, away.strength, seed)
    applyGameToStandings(standings, fixture.homeTeamId, fixture.awayTeamId, result.scoreA, result.scoreB)
  }
  const nameById = shadowLeague.teamsById
  return standingsTable(standings, (id) => nameById[id]?.name ?? id)
}

/**
 * Escape hatch: generuje pełny (jednorazowy) skład dla drużyny cieniowej, gdy musi
 * zostać rozegrana „na serio" — mecz pucharowy z drużyną gracza, albo awans/spadek
 * do poziomu gracza na następny sezon. Deterministyczne po id drużyny + seed.
 */
export function ensureShadowTeamRoster(shadowTeam, seed) {
  const template = buildEucsLeagueTemplate({
    tier: shadowTeam.tier,
    teamIds: [shadowTeam.id],
    seed,
  })
  const team = template.teams[0] ?? null
  if (team) team.tacticalIdentity = template.tacticalByTeamId?.[team.id] ?? null
  return team
}
