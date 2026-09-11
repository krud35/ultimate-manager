/**
 * Terminarz sezonu — system kołowy (każdy z każdym), mecze przypisane do tygodni.
 */

const MATCH_STATUS_SCHEDULED = 'SCHEDULED'

/**
 * @param {string[]} teamIds
 * @returns {{ week: number, matches: Array<{ id: string, week: number, homeTeamId: string, awayTeamId: string, status: string }> }[]}
 */
export function generateRoundRobinSchedule(teamIds) {
  if (!teamIds?.length) {
    return []
  }

  if (teamIds.length % 2 !== 0) {
    throw new Error('Liczba drużyn musi być parzysta')
  }

  const n = teamIds.length
  const fixed = teamIds[0]
  let rotating = teamIds.slice(1)
  const weeks = []

  for (let r = 0; r < n - 1; r += 1) {
    const weekNumber = r + 1
    const order = [fixed, ...rotating]
    const matches = []

    const flipHomeAway = r % 2 === 1
    for (let i = 0; i < n / 2; i += 1) {
      let homeTeamId = order[i]
      let awayTeamId = order[n - 1 - i]
      if (flipHomeAway) {
        ;[homeTeamId, awayTeamId] = [awayTeamId, homeTeamId]
      }
      matches.push({
        id: `w${weekNumber}-${homeTeamId}-vs-${awayTeamId}`,
        week: weekNumber,
        homeTeamId,
        awayTeamId,
        status: MATCH_STATUS_SCHEDULED,
      })
    }

    weeks.push({ week: weekNumber, matches })
    const last = rotating.pop()
    rotating = [last, ...rotating]
  }

  return weeks
}

export function flattenWeekSchedule(weeks) {
  return weeks.flatMap((w) => w.matches)
}
