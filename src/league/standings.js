export function createEmptyStanding(teamId) {
  return {
    teamId,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }
}

export function createStandings(teamIds) {
  const standings = {}
  for (const id of teamIds) {
    standings[id] = createEmptyStanding(id)
  }
  return standings
}

export function pointDifferential(standing) {
  return standing.pointsFor - standing.pointsAgainst
}

/** Sort: wygrane malejąco, potem bilans punktów. */
export function standingsTable(standings, teamNameById) {
  return Object.values(standings)
    .map((row) => {
      const teamName =
        typeof teamNameById === 'function' ? teamNameById(row.teamId) : row.teamId
      return {
        ...row,
        name: teamName,
        teamName,
        diff: pointDifferential(row),
      }
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.diff - a.diff
    })
}

export function applyGameToStandings(standings, homeTeamId, awayTeamId, homeScore, awayScore) {
  const home = standings[homeTeamId]
  const away = standings[awayTeamId]
  if (!home || !away) return standings

  home.pointsFor += homeScore
  home.pointsAgainst += awayScore
  away.pointsFor += awayScore
  away.pointsAgainst += homeScore

  if (homeScore > awayScore) {
    home.wins += 1
    away.losses += 1
  } else {
    away.wins += 1
    home.losses += 1
  }

  return standings
}
