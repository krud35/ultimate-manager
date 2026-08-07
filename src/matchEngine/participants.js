import { MATCH_CONFIG } from './config.js'
import { lineupIdsForPointStart } from './lineups.js'
import { isPersonDefense as isPersonDefenseStyle } from './tacticsModifiers.js'

import { staminaParticipationFactor } from './stamina.js'
import { weightedLegacyStat, readLegacySkill } from '../models/playerStats.js'
import { getPlayerMorale, moraleSkillMultiplier } from '../models/playerMorale.js'
import { mergeTraitAndCoachMods } from './coachDirectives.js'

function weightedScore(rng, players, weights, scoreBoostFn = null) {
  const entries = players.map((p) => {
    let score = weightedLegacyStat(p.skills, weights)
    score *= moraleSkillMultiplier(getPlayerMorale(p))
    score += rng.float() * 15
    score *= staminaParticipationFactor(p.currentStamina ?? 100)
    if (scoreBoostFn) score *= scoreBoostFn(p) ?? 1
    return { player: p, score }
  })
  entries.sort((a, b) => b.score - a.score)
  return entries[0]?.player ?? players[0]
}

/** Kto rzuca — preferencja handlerów (throwing, vision) + primary_handler. */
export function pickThrower(rng, lineup, tactics = null) {
  const w = MATCH_CONFIG.skillCheck.throwWeights
  return weightedScore(rng, lineup, w, (p) => {
    const mods = mergeTraitAndCoachMods(p, tactics, 'offense')
    return mods.throwerPickWeightMult ?? 1
  })
}

/** Kto odbiera — preferencja cutterów (catching, speed); nie ten sam co rzucający jeśli możliwe. */
export function pickReceiver(rng, lineup, thrower) {
  const pool = lineup.filter((p) => p.id !== thrower.id)
  const w = { catching: 0.45, speed: 0.35, throwing: 0.1, vision: 0.1 }
  return weightedScore(rng, pool.length ? pool : lineup, w)
}

/** Obrońca w strefie — najlepszy na dany moment. */
export function pickDefender(rng, defenseLineup) {
  const w = MATCH_CONFIG.skillCheck.defenseWeights
  return weightedScore(rng, defenseLineup, w)
}

function shufflePlayers(players, rng) {
  const list = [...players]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.float() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * Person: każdy zawodnik ataku ma jednego obrońcę; jeden obrońca max jeden przydział
 * (przy równych składach 7v7 — czyste 1:1).
 * @returns {Map<number, object>} offensePlayerId → defender
 */
export function createPersonMatchups(rng, offenseLineup, defenseLineup) {
  const matchup = new Map()
  if (!offenseLineup.length || !defenseLineup.length) return matchup

  const offense = shufflePlayers(offenseLineup, rng)
  const defense = shufflePlayers(defenseLineup, rng)
  const assignedDefenderIds = new Set()

  for (let i = 0; i < offense.length; i += 1) {
    const off = offense[i]
    let defender = defense.find((d) => !assignedDefenderIds.has(d.id))
    if (!defender) {
      defender = defense[i % defense.length]
    } else {
      assignedDefenderIds.add(defender.id)
    }
    matchup.set(off.id, defender)
  }

  return matchup
}

export function defenderForPersonMark(personMatchups, receiver, defenseLineup, rng) {
  const marked = personMatchups?.get(receiver.id)
  if (marked) return marked
  return pickDefender(rng, defenseLineup)
}

export function personMatchupPairs(personMatchups, offenseLineup) {
  return offenseLineup.map((off) => {
    const def = personMatchups.get(off.id)
    return {
      offenseId: off.id,
      offenseName: `${off.firstName} ${off.lastName}`,
      defenderId: def?.id ?? null,
      defenderName: def ? `${def.firstName} ${def.lastName}` : '—',
    }
  })
}

export function isPersonDefense(defenseStyle) {
  return isPersonDefenseStyle(defenseStyle)
}

export function activeLineup(team, lineupSize = MATCH_CONFIG.lineupSize) {
  return team.players.slice(0, Math.min(lineupSize, team.players.length))
}

/**
 * Siódemka na cały punkt — wybór zależy od tego, czy drużyna zaczyna w ataku czy obronie.
 * @param {'offense'|'defense'} roleAtPointStart
 */
export function lineupForPoint(team, roleAtPointStart) {
  const tactics = team.tactics
  if (!tactics) return activeLineup(team)

  const idList = lineupIdsForPointStart(tactics, roleAtPointStart)

  const resolved = (idList ?? [])
    .map((id) => team.players.find((p) => p.id === id))
    .filter(Boolean)

  const unique = []
  const seen = new Set()
  for (const p of resolved) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      unique.push(p)
    }
  }

  if (unique.length === 0) return activeLineup(team)
  return unique.slice(0, MATCH_CONFIG.lineupSize)
}

export function buildPointLineups(homeTeam, awayTeam, attackTeamId) {
  const homeRole = attackTeamId === 'home' ? 'offense' : 'defense'
  const awayRole = attackTeamId === 'away' ? 'offense' : 'defense'
  return {
    home: lineupForPoint(homeTeam, homeRole),
    away: lineupForPoint(awayTeam, awayRole),
  }
}

/** Handler reset — krótkie podanie do innego throwera (dump/swing). */
export function pickDumpReceiver(rng, lineup, thrower) {
  const handlers = lineup.filter((p) => p.id !== thrower.id)
  const pool = handlers.length ? handlers : lineup
  const w = { throwing: 0.4, vision: 0.35, catching: 0.15, speed: 0.1 }
  return weightedScore(rng, pool, w)
}

export function getLineupForTeam(pointLineups, teamId) {
  return pointLineups[teamId] ?? []
}
