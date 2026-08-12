export function createBoxScore(players) {
  const byId = {}
  for (const player of players) {
    byId[player.id] = {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId ?? null,
      goals: 0,
      assists: 0,
      blocks: 0,
      turnovers: 0,
      pointsPlayed: 0,
      attempts: 0,
      completions: 0,
      throwMeters: 0,
      catches: 0,
      catchMeters: 0,
      runMeters: 0,
    }
  }
  return byId
}

export function recordGoal(boxScore, throwerId, receiverId) {
  if (boxScore[receiverId]) boxScore[receiverId].goals += 1
  if (boxScore[throwerId]) boxScore[throwerId].assists += 1
}

export function recordBlock(boxScore, defenderId) {
  if (boxScore[defenderId]) boxScore[defenderId].blocks += 1
}

export function recordTurnover(boxScore, throwerId) {
  if (boxScore[throwerId]) boxScore[throwerId].turnovers += 1
}

/** Próba rzutu — zawsze +1 attempts; przy sukcesie +completions/throwMeters/catchMeters. */
export function recordThrowResult(boxScore, throwerId, { success, receiverId = null, yardsGained = 0 } = {}) {
  const row = boxScore[throwerId]
  if (!row) return
  row.attempts += 1
  if (!success) return
  row.completions += 1
  row.throwMeters += Math.max(0, yardsGained)
  if (receiverId != null && boxScore[receiverId]) {
    boxScore[receiverId].catches += 1
    boxScore[receiverId].catchMeters += Math.max(0, yardsGained)
  }
}

export function recordRunMeters(boxScore, playerId, meters) {
  const row = boxScore[playerId]
  if (row && Number.isFinite(meters)) row.runMeters += Math.max(0, meters)
}

/** Lista statystyk posortowana do tabeli (G+A malejąco). */
export function boxScoreRows(boxScore) {
  return Object.values(boxScore).sort((a, b) => {
    const ptsA = a.goals + a.assists
    const ptsB = b.goals + b.assists
    if (ptsB !== ptsA) return ptsB - ptsA
    return b.blocks - a.blocks
  })
}

/** Tylko zawodnicy z golem — podgląd w trakcie meczu. */
export function scorerRows(boxScore) {
  return boxScoreRows(boxScore).filter((row) => row.goals > 0)
}
