/**
 * Konwersja statów sezonu UFA (źródło: ufaalmanac / watchufa) → profil gry.
 */

import {
  SKILLS_GEN_VERSION,
  applyHistoricalOvrFromUfa,
  balanceTeamPlayerSkills,
  buildPlayerSkillsFromProfile,
} from '../models/playerStats.js'
import { TRAITS_GEN_VERSION, rollTraitsForPlayer } from '../models/playerTraits.js'
import { rollThrowingHandForPlayer, dominantHandFromThrowingHand } from '../models/playerProfile.js'

function teamMaxFromRows(active) {
  return {
    goals: Math.max(...active.map((r) => r.gls), 1),
    assists: Math.max(...active.map((r) => r.ast), 1),
    blocks: Math.max(...active.map((r) => r.blk), 1),
    throwingYards: Math.max(...active.map((r) => r.throwingYards), 1),
    receivingYards: Math.max(...active.map((r) => r.receivingYards), 1),
  }
}

function isActiveRawRow(r) {
  return (
    (r.ha ?? 0) > 0 ||
    (r.gls ?? 0) + (r.ast ?? 0) + (r.blk ?? 0) > 0 ||
    (r.throwingYards ?? 0) + (r.receivingYards ?? 0) > 80
  )
}

/**
 * @param {string} teamName
 * @param {object[]} rawRows
 * @param {number} idStart
 * @param {{
 *   mode?: 'historical'|'equalized',
 *   balance?: boolean,
 *   statMax?: { goals: number, assists: number, blocks: number, throwingYards: number, receivingYards: number }|null,
 * }} [options]
 * - historical: atrybuty ze statów Almanac + absolutne OVR (bez wyrównania składów)
 * - equalized: lekka kompresja + balanceTeamPlayerSkills (legacy)
 */
export function buildTeamRoster(teamName, rawRows, idStart, options = {}) {
  const mode = options.mode ?? 'equalized'
  const balance = options.balance ?? mode !== 'historical'
  const active = rawRows.filter(isActiveRawRow)
  const teamMax = options.statMax ?? teamMaxFromRows(active)

  const players = active.map((row, index) => {
    const playerId = idStart + index
    const ufaReference = {
      goals: row.gls,
      assists: row.ast,
      blocks: row.blk,
      throwingYards: row.throwingYards,
      receivingYards: row.receivingYards,
    }
    const throwingHand = rollThrowingHandForPlayer(playerId)

    return {
      id: playerId,
      jersey: row.jersey,
      firstName: row.firstName,
      lastName: row.lastName,
      team: teamName,
      throwingHand,
      dominantHand: dominantHandFromThrowingHand(throwingHand),
      ufaReference,
      skills: buildPlayerSkillsFromProfile({
        playerId,
        ufaReference,
        teamMax,
        mode,
      }),
      skillsGen: SKILLS_GEN_VERSION,
      seasonStats: {
        goals: 0,
        assists: 0,
        blocks: 0,
      },
    }
  })

  if (mode === 'historical') {
    applyHistoricalOvrFromUfa(players)
  } else if (balance) {
    balanceTeamPlayerSkills(players, teamName)
  }

  for (const player of players) {
    player.traits = rollTraitsForPlayer(player)
    player.traitsGen = TRAITS_GEN_VERSION
  }

  return players
}

export { isActiveRawRow, teamMaxFromRows }
