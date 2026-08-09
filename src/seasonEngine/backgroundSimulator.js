/**
 * Szybka symulacja meczu ligowego (bez silnika 50 Hz) — pierwszy do 15 punktów.
 * Style drużyn + rotacja siódemek O/D ze względu na skill i zmęczenie.
 */

import { createRng } from '../matchEngine/rng.js'
import { MATCH_CONFIG } from '../matchEngine/config.js'
import { buildPointLineups } from '../matchEngine/participants.js'
import { attackMods, defenseMods } from '../matchEngine/tacticsModifiers.js'
import { lineStylesForPointStart } from '../matchEngine/lineups.js'
import { coachDirectivesForLine } from '../matchEngine/coachDirectives.js'
import { autoRotateTacticsForTeam, tacticsForTeam } from '../matchEngine/aiLineup.js'
import {
  applyPostMatchStaminaWear,
  createStaminaMap,
  getStamina,
  clampStamina,
  regenBenchStamina,
  residualCostFromSprintMeters,
  STAMINA_CONFIG,
  initialStaminaForPlayer,
  staminaRoleFamily,
} from '../matchEngine/stamina.js'
import {
  ensurePlayerStats,
  getCategoryOverall,
  normalizePlayerSkills,
  readLegacySkill,
  recordPointPlayedForPlayers,
  resetPlayersMatchStats,
} from '../models/playerStats.js'
import {
  applyMoraleForMatchTeams,
  applyMoraleToStat,
  ensurePlayerMorale,
  getPlayerMorale,
  moraleSkillMultiplier,
} from '../models/playerMorale.js'
import {
  applyFormForMatchTeams,
  ensurePlayerForm,
} from '../models/playerForm.js'
import { applyLoyaltyForMatchTeams } from '../models/playerLoyalty.js'
import { ensurePlayerTraits } from '../models/playerTraits.js'
import {
  ensurePlayerInjury,
  tryMatchAiInjury,
} from '../models/playerInjury.js'
import { homeAdvantageMods } from '../league/homeAdvantage.js'
import { medicalInjuryChanceMult, ensureTeamFacilities } from '../career/clubFacilities.js'
import { getPlayerFullName } from '../data/mockPlayers.js'

export const BACKGROUND_MATCH_POINT_CAP = 15

function ensureTeamTactics(team, staminaMap) {
  if (!team) return team
  team.tactics = tacticsForTeam(team, { staminaMap })
  return team
}

function prepareTeamsForMatch(homeTeam, awayTeam, homeStamina, awayStamina) {
  for (const player of homeTeam?.players ?? []) {
    ensurePlayerStats(player)
    ensurePlayerMorale(player)
    ensurePlayerForm(player)
    ensurePlayerTraits(player)
    ensurePlayerInjury(player)
  }
  for (const player of awayTeam?.players ?? []) {
    ensurePlayerStats(player)
    ensurePlayerMorale(player)
    ensurePlayerForm(player)
    ensurePlayerTraits(player)
    ensurePlayerInjury(player)
  }
  resetPlayersMatchStats(homeTeam?.players)
  resetPlayersMatchStats(awayTeam?.players)
  ensureTeamTactics(homeTeam, homeStamina)
  ensureTeamTactics(awayTeam, awayStamina)
}

function simAttribute(player, statKey, skillKey) {
  const fromStats = player?.stats?.[statKey]
  if (typeof fromStats === 'number' && Number.isFinite(fromStats)) {
    return applyMoraleToStat(fromStats, getPlayerMorale(player))
  }
  const skills = normalizePlayerSkills(player.skills ?? player)
  return applyMoraleToStat(readLegacySkill(skills, skillKey), getPlayerMorale(player))
}

function weightedPick(rng, players, weightFn) {
  if (!players?.length) return null
  const weights = players.map((p) => Math.max(1, weightFn(p) + rng.float() * 12))
  let roll = rng.float() * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < players.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return players[i]
  }
  return players[players.length - 1]
}

function goalWeight(player) {
  const catching = simAttribute(player, 'catching', 'catching')
  const offense = getCategoryOverall(normalizePlayerSkills(player.skills ?? {}), 'offensive')
  return catching * 0.85 + offense * 0.2 + 10
}

function assistWeight(player) {
  const throwing = simAttribute(player, 'throwing', 'throwing')
  const vision = simAttribute(player, 'vision', 'vision')
  return throwing * 0.7 + vision * 0.25 + 10
}

function blockWeight(player) {
  const defense = simAttribute(player, 'defense', 'defense')
  const speed = simAttribute(player, 'speed', 'speed')
  return defense * 0.75 + speed * 0.15 + 8
}

function turnoversInPoint(rng, offenseTeamRatings, defenseTeamRatings) {
  const pressure =
    defenseTeamRatings.defense /
    Math.max(1, defenseTeamRatings.defense + offenseTeamRatings.attack * 0.85)
  let count = 0
  if (rng.float() < 0.22 + pressure * 0.35) count += 1
  if (rng.float() < 0.1 + pressure * 0.18) count += 1
  if (rng.float() < 0.04) count += 1
  return count
}

function recordScoringStats(rng, scoringLineup) {
  if (!scoringLineup?.length) return

  const scorer = weightedPick(rng, scoringLineup, goalWeight)
  if (!scorer) return
  ensurePlayerStats(scorer)
  scorer.stats.goals += 1

  const assistPool = scoringLineup.filter((p) => p.id !== scorer.id)
  const assister = weightedPick(rng, assistPool.length ? assistPool : scoringLineup, assistWeight)
  if (assister) {
    ensurePlayerStats(assister)
    assister.stats.assists += 1
  }
}

function recordBlockStats(rng, defendingLineup, turnoverCount) {
  if (!defendingLineup?.length || turnoverCount <= 0) return
  for (let i = 0; i < turnoverCount; i += 1) {
    const blocker = weightedPick(rng, defendingLineup, blockWeight)
    if (!blocker) continue
    ensurePlayerStats(blocker)
    blocker.stats.blocks += 1
  }
}

/** Rating z zawodników na boisku + wpływ stylu linii (O/D wg startu punktu). */
export function resolveLineupRatings(lineup, tactics, role) {
  const players = lineup ?? []
  if (!players.length) return { attack: 50, defense: 50 }

  let attackSum = 0
  let defenseSum = 0
  for (const player of players) {
    const skills = normalizePlayerSkills(player.skills ?? player)
    const moraleMult = moraleSkillMultiplier(getPlayerMorale(player))
    attackSum +=
      (getCategoryOverall(skills, 'offensive') * 0.55 +
        getCategoryOverall(skills, 'throwing') * 0.35 +
        getCategoryOverall(skills, 'mental') * 0.1) *
      moraleMult
    defenseSum +=
      (getCategoryOverall(skills, 'defensive') * 0.65 +
        getCategoryOverall(skills, 'physical') * 0.25 +
        getCategoryOverall(skills, 'mental') * 0.1) *
      moraleMult
  }

  let attack = attackSum / players.length
  let defense = defenseSum / players.length

  const styles = lineStylesForPointStart(tactics, role)
  const atk = attackMods(styles.attackStyle)
  const def = defenseMods(styles.defenseStyle)
  attack *= 1 + (atk.throwAccuracyBonus ?? 0) * 0.004
  attack *= 0.92 + (atk.advanceMultiplier ?? 1) * 0.08
  defense *= 1 + ((def.defenseBonus ?? 0) + (def.blockBonus ?? 0)) * 0.0035
  if (def.personMark === false) defense *= 1.02

  const coach = coachDirectivesForLine(tactics, role)
  attack *= 1 + coach.huckAppetite * 0.025
  attack *= 1 + coach.creativity * 0.015
  attack *= 1 + coach.breakAppetite * 0.012
  attack *= 1 + coach.possessionTempo * 0.01
  defense *= 1 + Math.abs(coach.coverageShade) * 0.012

  return { attack, defense }
}

/** @deprecated użyj resolveLineupRatings — zostawione dla kompatybilności */
export function resolveTeamRatings(team) {
  if (team == null) return { attack: 50, defense: 50 }
  if (Number.isFinite(team.attackRating) && Number.isFinite(team.defenseRating)) {
    return { attack: team.attackRating, defense: team.defenseRating }
  }
  return resolveLineupRatings(team.players ?? [], team.tactics, 'offense')
}

function recordBackgroundPoint({
  rng,
  lineups,
  homeScored,
  homeRatings,
  awayRatings,
}) {
  const onField = [...lineups.home, ...lineups.away]
  recordPointPlayedForPlayers(onField)

  const scoringLineup = homeScored ? lineups.home : lineups.away
  const defendingLineup = homeScored ? lineups.away : lineups.home
  const offenseRatings = homeScored ? homeRatings : awayRatings
  const defenseRatings = homeScored ? awayRatings : homeRatings

  recordScoringStats(rng, scoringLineup)

  const turnovers = turnoversInPoint(rng, offenseRatings, defenseRatings)
  recordBlockStats(rng, defendingLineup, turnovers)
}

function snapshotMatchCounters(players) {
  const map = {}
  for (const p of players ?? []) {
    map[p.id] = {
      goals: p.stats?.goals ?? 0,
      assists: p.stats?.assists ?? 0,
      blocks: p.stats?.blocks ?? 0,
    }
  }
  return map
}

function boxScoreFromMatchDelta(players, before) {
  const rows = {}
  for (const p of players ?? []) {
    const prev = before[p.id] ?? { goals: 0, assists: 0, blocks: 0 }
    rows[p.id] = {
      playerId: p.id,
      goals: Math.max(0, (p.stats?.goals ?? 0) - prev.goals),
      assists: Math.max(0, (p.stats?.assists ?? 0) - prev.assists),
      blocks: Math.max(0, (p.stats?.blocks ?? 0) - prev.blocks),
      turnovers: 0,
      pointsPlayed: p.stats?.pointsPlayedMatch ?? 0,
    }
  }
  return rows
}

function applyBackgroundFatigue(team, staminaMap, onField, role, rng) {
  const onFieldIds = new Set(onField.map((p) => p.id))
  for (const p of onField) {
    const family = staminaRoleFamily(p, team.tactics)
    const sprintM =
      (family === 'handler'
        ? STAMINA_CONFIG.bgEstimatedHandlerSprintM
        : STAMINA_CONFIG.bgEstimatedCutterSprintM) *
      (role === 'defense' ? 0.6 : 1)
    const cost = residualCostFromSprintMeters(
      sprintM,
      role,
      p,
      family,
      team.tactics,
    )
    staminaMap[p.id] = clampStamina(getStamina(staminaMap, p.id) - cost)
  }
  regenBenchStamina(staminaMap, team.players, onFieldIds, rng)
}

/**
 * @param {object} homeTeam
 * @param {object} awayTeam
 * @param {{ seed?: number, homeAdvantage?: boolean }} [options]
 */
export function simulateBackgroundMatch(homeTeam, awayTeam, options = {}) {
  const rng = createRng(options.seed ?? null)

  const homeStamina = createStaminaMap(homeTeam.players ?? [], (p) => initialStaminaForPlayer(p))
  const awayStamina = createStaminaMap(awayTeam.players ?? [], (p) => initialStaminaForPlayer(p))

  prepareTeamsForMatch(homeTeam, awayTeam, homeStamina, awayStamina)

  const beforeCounters = snapshotMatchCounters([
    ...(homeTeam.players ?? []),
    ...(awayTeam.players ?? []),
  ])

  let homeScore = 0
  let awayScore = 0
  const cap = BACKGROUND_MATCH_POINT_CAP
  let pullTeam = MATCH_CONFIG.firstPointPullTeam

  while (homeScore < cap && awayScore < cap) {
    homeTeam.tactics = autoRotateTacticsForTeam(homeTeam, homeStamina, rng)
    awayTeam.tactics = autoRotateTacticsForTeam(awayTeam, awayStamina, rng)

    const attackTeamId = pullTeam === 'home' ? 'away' : 'home'
    const lineups = buildPointLineups(homeTeam, awayTeam, attackTeamId)

    const homeRole = attackTeamId === 'home' ? 'offense' : 'defense'
    const awayRole = attackTeamId === 'away' ? 'offense' : 'defense'

    let homeRatings = resolveLineupRatings(lineups.home, homeTeam.tactics, homeRole)
    let awayRatings = resolveLineupRatings(lineups.away, awayTeam.tactics, awayRole)

    if (options.homeAdvantage) {
      const { ratingMult } = homeAdvantageMods(homeTeam)
      homeRatings = {
        attack: homeRatings.attack * ratingMult,
        defense: homeRatings.defense * ratingMult,
      }
    }

    const chanceHomeScores =
      attackTeamId === 'home'
        ? homeRatings.attack /
          Math.max(1, homeRatings.attack + awayRatings.defense)
        : 1 -
          awayRatings.attack /
            Math.max(1, awayRatings.attack + homeRatings.defense)

    const homeActuallyScored = rng.float() < chanceHomeScores
    if (homeActuallyScored) homeScore += 1
    else awayScore += 1

    recordBackgroundPoint({
      rng,
      lineups,
      homeScored: homeActuallyScored,
      homeRatings,
      awayRatings,
    })

    applyBackgroundFatigue(homeTeam, homeStamina, lineups.home, homeRole, rng)
    applyBackgroundFatigue(awayTeam, awayStamina, lineups.away, awayRole, rng)

    pullTeam = homeActuallyScored ? 'home' : 'away'
  }

  const winnerTeamId =
    homeScore > awayScore ? homeTeam.id ?? homeTeam.teamId : awayTeam.id ?? awayTeam.teamId

  const moraleBox = boxScoreFromMatchDelta(
    [...(homeTeam.players ?? []), ...(awayTeam.players ?? [])],
    beforeCounters,
  )
  applyMoraleForMatchTeams(homeTeam, awayTeam, homeScore, awayScore, moraleBox)
  applyFormForMatchTeams(homeTeam, awayTeam, moraleBox, homeScore, awayScore)
  applyLoyaltyForMatchTeams(homeTeam, awayTeam, homeScore, awayScore, moraleBox)
  for (const player of homeTeam.players ?? []) applyPostMatchStaminaWear(player)
  for (const player of awayTeam.players ?? []) applyPostMatchStaminaWear(player)

  const injuries = []
  const rngFn = () => rng.float()
  for (const side of [
    { team: homeTeam, stamina: homeStamina },
    { team: awayTeam, stamina: awayStamina },
  ]) {
    ensureTeamFacilities(side.team)
    const injuryMult = medicalInjuryChanceMult(side.team)
    for (const player of side.team.players ?? []) {
      const pp = player.stats?.pointsPlayedMatch ?? 0
      if (pp <= 0) continue
      const stam = getStamina(side.stamina, player.id)
      const hit = tryMatchAiInjury(player, stam, rngFn, {
        chanceMult: injuryMult,
        team: side.team,
        medicalLevel: side.team?.facilities?.medicalCenter,
      })
      if (!hit) continue
      injuries.push({
        playerId: player.id,
        name: getPlayerFullName(player),
        daysRemaining: hit.daysRemaining,
        label: hit.label,
        source: 'match',
        teamId: side.team.id ?? side.team.teamId ?? null,
      })
    }
  }

  return {
    homeScore,
    awayScore,
    winnerTeamId,
    homeTeam,
    awayTeam,
    players: [...(homeTeam.players ?? []), ...(awayTeam.players ?? [])],
    injuries,
  }
}
