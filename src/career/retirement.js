/**
 * Emerytury zawodników na granicy sezonów.
 */

import { getOverallRating } from '../models/playerStats.js'
import { getPlayerFullName } from '../data/mockPlayers.js'
import { worldTeamsList } from './worldState.js'
import { clearPlayerContractOnExit } from './transfers/playerContracts.js'
import { PLAYER_STATUS, ensureWorldFreeAgents } from './transfers/freeAgency.js'

/**
 * Bazowa szansa emerytury wg wieku.
 */
function baseRetireChance(age) {
  if (age >= 36) return 0.55
  if (age >= 34) return 0.28
  if (age >= 32) return 0.08
  return 0
}

/**
 * Czy zawodnik grał regularnie w sezonie (minutes / games proxy).
 */
function wasRegular(player, seasonStats) {
  const row = seasonStats?.[player.id]
  const games = row?.games ?? row?.appearances ?? 0
  const pp = row?.pointsPlayed ?? 0
  return games >= 12 || pp >= 80
}

/**
 * @returns {{ retired: object[], inboxMessages: object[] }}
 */
export function processSeasonRetirements(career, options = {}) {
  const world = career.world
  if (!world) return { retired: [], inboxMessages: [] }
  ensureWorldFreeAgents(world)

  const seasonStats =
    options.leaguePlayerStats ??
    career.league?.playerStats?.byPlayer ??
    career.league?.playerStats ??
    {}
  const statsMap =
    seasonStats?.byPlayer && typeof seasonStats.byPlayer === 'object'
      ? seasonStats.byPlayer
      : seasonStats

  const retired = []
  const inboxMessages = []
  let salt = (options.seed ?? (career.seasonYear ?? 2025) * 997) >>> 0

  for (const team of worldTeamsList(world)) {
    const keep = []
    for (const player of team.players ?? []) {
      const age = player.age ?? 25
      let chance = baseRetireChance(age)
      if (chance <= 0) {
        keep.push(player)
        continue
      }

      const ovr = getOverallRating(player.skills)
      const regular = wasRegular(player, statsMap)
      if (ovr >= 82 && regular) chance *= 0.35
      else if (ovr >= 78 && regular) chance *= 0.55
      else if (regular) chance *= 0.75
      else if (ovr < 72) chance *= 1.15

      salt = (Math.imul(salt, 1664525) + 1013904223) >>> 0
      const roll = (salt % 10000) / 10000
      if (roll >= chance) {
        keep.push(player)
        continue
      }

      clearPlayerContractOnExit(team, player)
      player.status = PLAYER_STATUS.RETIRED
      player.contract = null
      player.retiredAt = career.league?.currentDate ?? null
      player.retiredSeasonYear = career.seasonYear ?? null
      world.retiredPlayers.push(player)
      retired.push({
        player,
        teamId: team.id,
        teamName: team.name,
        name: getPlayerFullName(player),
      })

      if (team.id === career.playerTeamId) {
        const name = getPlayerFullName(player)
        inboxMessages.push({
          id: `retire-${player.id}-${career.seasonYear}`,
          type: 'club_news',
          title: `Emerytura · ${name}`,
          titleEn: `Retirement · ${name}`,
          body: `${name} (lat ${age}) zakończył karierę i opuszcza klub. Statystyki pozostają w all-time.`,
          bodyEn: `${name} (age ${age}) has retired and left the club. Stats remain on the all-time boards.`,
          date: career.league?.currentDate ?? null,
          read: false,
          payload: {
            kind: 'retirement',
            playerId: player.id,
            age,
            ovr,
          },
        })
      }
    }
    team.players = keep
  }

  return { retired, inboxMessages }
}
