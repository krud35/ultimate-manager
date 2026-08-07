/**
 * Lekka przewaga boiska domowego dla szybkiej symulacji tła.
 * Stadion klubu (poziom 1–10) lekko przesuwa ratingMult wokół baseline 1.04.
 */

import { stadiumHomeRatingMult, ensureTeamFacilities } from '../career/clubFacilities.js'

export const HOME_ADVANTAGE = {
  ratingMult: 1.04,
  scoreBias: 0.08,
}

/**
 * Modyfikatory używane przez backgroundSimulator.
 * @param {object} [homeTeam] — gdy podany, uwzględnia poziom stadionu
 */
export function homeAdvantageMods(homeTeam = null) {
  if (homeTeam) {
    ensureTeamFacilities(homeTeam)
    return {
      ...HOME_ADVANTAGE,
      ratingMult: stadiumHomeRatingMult(homeTeam),
    }
  }
  return { ...HOME_ADVANTAGE }
}

/**
 * Płytka kopia drużyny z lekko podbitymi skillami (opcjonalny hook poza ratingami).
 * Nie mutuje oryginału.
 */
export function applyHomeAdvantageToTeam(team, mods = HOME_ADVANTAGE) {
  if (!team) return team
  const mult = mods.ratingMult ?? 1.04

  const boostSkill = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value
    return Math.min(99, value * mult)
  }

  const players = (team.players ?? []).map((player) => {
    const skills = player.skills ? { ...player.skills } : null
    if (skills) {
      for (const key of Object.keys(skills)) {
        if (typeof skills[key] === 'number') skills[key] = boostSkill(skills[key])
      }
    }
    return {
      ...player,
      skills: skills ?? player.skills,
      attackRating: player.attackRating != null ? boostSkill(player.attackRating) : player.attackRating,
      defenseRating: player.defenseRating != null ? boostSkill(player.defenseRating) : player.defenseRating,
    }
  })

  return {
    ...team,
    players,
    attackRating: team.attackRating != null ? team.attackRating * mult : team.attackRating,
    defenseRating: team.defenseRating != null ? team.defenseRating * mult : team.defenseRating,
  }
}
