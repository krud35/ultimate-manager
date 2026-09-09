import { eucsTeamTier } from '../data/eucsLeagueTeams.js'

/** Live membership is persisted on the club; templates only seed a new world. */
export function currentEucsTier(team) {
  return team?.competitionTier ?? eucsTeamTier(team?.id)
}

export function syncCompetitionMembership(world, pyramid) {
  if (!world?.teamsById || !pyramid) return
  for (const tier of [1, 2, 3]) {
    for (const id of pyramid[`tier${tier}Ids`] ?? pyramid[tier] ?? []) {
      if (world.teamsById[id]) world.teamsById[id].competitionTier = tier
    }
  }
}
