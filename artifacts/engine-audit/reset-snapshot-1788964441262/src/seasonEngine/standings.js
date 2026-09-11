/**
 * Tabela ligowa sezonu — inicjalizacja, aktualizacja po meczu, sortowanie.
 */

function emptyHeadToHead() {
  return {}
}

function ensureH2H(row, opponentId) {
  if (!row.headToHead[opponentId]) {
    row.headToHead[opponentId] = { wins: 0, losses: 0 }
  }
  return row.headToHead[opponentId]
}

function recomputePointDiff(row) {
  row.pointDiff = row.pointsFor - row.pointsAgainst
}

/**
 * @param {string[]} teamIds
 * @returns {Record<string, object>}
 */
export function initStandings(teamIds) {
  const standings = {}
  for (const teamId of teamIds) {
    standings[teamId] = {
      teamId,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      headToHead: emptyHeadToHead(),
    }
  }
  return standings
}

/**
 * @param {Record<string, object>} currentStandings
 * @param {{ homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number }} matchResult
 * @returns {Record<string, object>}
 */
export function updateStandings(currentStandings, matchResult) {
  const { homeTeamId, awayTeamId, homeScore, awayScore } = matchResult
  const home = currentStandings[homeTeamId]
  const away = currentStandings[awayTeamId]
  if (!home || !away) return currentStandings

  home.played += 1
  away.played += 1
  home.pointsFor += homeScore
  home.pointsAgainst += awayScore
  away.pointsFor += awayScore
  away.pointsAgainst += homeScore
  recomputePointDiff(home)
  recomputePointDiff(away)

  const homeH2h = ensureH2H(home, awayTeamId)
  const awayH2h = ensureH2H(away, homeTeamId)

  if (homeScore > awayScore) {
    home.wins += 1
    away.losses += 1
    homeH2h.wins += 1
    awayH2h.losses += 1
  } else if (awayScore > homeScore) {
    away.wins += 1
    home.losses += 1
    awayH2h.wins += 1
    homeH2h.losses += 1
  }

  return currentStandings
}

/** Wygrane (DESC) → różnica punktów (DESC) → bezpośredni pojedynek. */
export function sortStandings(standings) {
  return Object.values(standings).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff

    const aVsB = a.headToHead[b.teamId]?.wins ?? 0
    const bVsA = b.headToHead[a.teamId]?.wins ?? 0
    if (bVsA !== aVsB) return bVsA - aVsB

    return a.teamId.localeCompare(b.teamId)
  })
}
