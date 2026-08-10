/**
 * Szybki rating ataku/obrony drużyny (0-100) do wyświetlenia w UI (np. profil drużyny) —
 * nie jest to symulacja meczu, tylko zagregowana ocena składu + stylu/suwaków.
 * Wydzielone z dawnego backgroundSimulator.js (usuniętego po przejściu ligi na
 * simulateMatch z fastMode — patrz league/leagueEngine.js).
 */
import { lineStylesForPointStart } from '../matchEngine/lineups.js'
import { attackMods, defenseMods } from '../matchEngine/tacticsModifiers.js'
import { coachDirectivesForLine } from '../matchEngine/coachDirectives.js'
import { getCategoryOverall, normalizePlayerSkills } from '../models/playerStats.js'
import { getPlayerMorale, moraleSkillMultiplier } from '../models/playerMorale.js'

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
  attack *= 1 + (atk.throwDepthBias ?? 0) * 0.05
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

/** Rating całej drużyny (cały roster jako "linia", tryb offense) do kart/profili. */
export function resolveTeamRatings(team) {
  if (team == null) return { attack: 50, defense: 50 }
  if (Number.isFinite(team.attackRating) && Number.isFinite(team.defenseRating)) {
    return { attack: team.attackRating, defense: team.defenseRating }
  }
  return resolveLineupRatings(team.players ?? [], team.tactics, 'offense')
}
