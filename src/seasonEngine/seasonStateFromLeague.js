import { PLAYER_TEAM_ID } from '../data/ufaLeagueTeams.js'
import { teamFromLeague } from '../career/worldState.js'
import { sortStandings } from './standings.js'

function mapFixtureToSeasonMatch(fixture) {
  return {
    id: fixture.id,
    week: fixture.round,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    status: fixture.status === 'completed' ? 'COMPLETED' : 'SCHEDULED',
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    winnerTeamId: fixture.winnerTeamId ?? null,
  }
}

function leagueStandingsToSeason(leagueStandings) {
  const standings = {}
  for (const [teamId, row] of Object.entries(leagueStandings ?? {})) {
    const pointsFor = row.pointsFor ?? 0
    const pointsAgainst = row.pointsAgainst ?? 0
    standings[teamId] = {
      teamId,
      played: (row.wins ?? 0) + (row.losses ?? 0),
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      pointsFor,
      pointsAgainst,
      pointDiff: pointsFor - pointsAgainst,
      headToHead: {},
    }
  }
  return standings
}

/** Buduje `seasonState` zgodny z seasonEngine na podstawie stanu ligi w UI. */
export function buildSeasonStateFromLeague(league) {
  const teamIds = league.teamIds ?? Object.keys(league.teamsById ?? {})
  const teamsById = Object.fromEntries(
    teamIds.map((id) => {
      const t = teamFromLeague(league, id)
      return [
        id,
        t
          ? {
              id: t.id,
              name: t.name,
              shortName: t.shortName,
              primaryColor: t.primaryColor,
              awayColor: t.awayColor,
              players: t.players,
              finances: t.finances ?? null,
              modifiers: t.modifiers ?? null,
            }
          : { id, name: id, players: [] },
      ]
    }),
  )

  const schedule = (league.fixtures ?? []).map(mapFixtureToSeasonMatch)

  return {
    teamIds,
    playerTeamId: league.playerTeamId ?? PLAYER_TEAM_ID,
    teamsById,
    currentWeek: league.currentRound ?? 1,
    totalWeeks: league.totalRounds ?? 0,
    scheduleWeeks: [],
    schedule,
    matches: schedule,
    standings: leagueStandingsToSeason(league.standings),
    leaguePlayerStats: league.playerStats ?? {},
    seasonLabel: league.seasonLabel ?? 'UFA',
    status: league.status === 'complete' ? 'complete' : 'active',
    simSeedBase: league.simSeedBase,
  }
}

export function teamStandingsRank(seasonState, teamId) {
  const sorted = sortStandings(seasonState.standings ?? {})
  const idx = sorted.findIndex((r) => r.teamId === teamId)
  return idx >= 0 ? idx + 1 : null
}

export function teamDisplayName(seasonState, teamId, lang) {
  const team = seasonState.teamsById?.[teamId]
  if (!team) return teamId
  if (lang) {
    if (lang === 'en') return team.nameEn ?? team.name ?? teamId
    return team.namePl ?? team.name ?? teamId
  }
  return team.name ?? teamId
}
