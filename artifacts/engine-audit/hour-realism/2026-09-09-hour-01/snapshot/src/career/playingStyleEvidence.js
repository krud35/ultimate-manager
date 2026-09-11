/** Persist only observed evidence; old matches and unavailable metrics add nothing. */
export function recordPlayingStyleMatch(league, match) {
 if(match.forfeited || !(match.fixtureId ?? match.id)) return
 const key = `${match.date ?? league.currentDate ?? ''}|${match.fixtureId ?? match.id}`
 const rows = new Map((match.boxScore ?? []).map(row=>[String(row.playerId),row]))
 for(const teamId of [match.homeTeamId,match.awayTeamId]) for(const player of league.teamsById?.[teamId]?.players ?? []) {
  const row=rows.get(String(player.id));if(!row || (!row.styleEvidence && !(row.pointsPlayed>0)))continue
  const history=player.playingStyleMatches ?? []
  if(history.some(entry=>entry.key===key))continue
  player.playingStyleMatches=[...history.slice(-11),{key,date:match.date ?? league.currentDate ?? null,
   teamId,pointsPlayed:row.pointsPlayed ?? 0,evidence:structuredClone(row.styleEvidence ?? {version:1,modes:{}})}]
 }
}
