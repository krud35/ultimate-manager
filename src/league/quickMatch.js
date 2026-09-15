import { createRng } from '../matchEngine/rng.js'
import { getOverallRating } from '../models/playerStats.js'
import { addPlayerLoad } from '../models/playerWorkload.js'

export function backgroundMatch(league, fixture) {
  let seed = league.simSeedBase
  for (const c of fixture.id) seed = Math.imul(seed ^ c.charCodeAt(0), 31)
  const rng = createRng(seed >>> 0)
  const home = league.teamsById[fixture.homeTeamId], away = league.teamsById[fixture.awayTeamId]
  const available = team => team.players.filter(p => !p.injury?.daysRemaining)
  const freshRating = p => getOverallRating(p.skills) * (.7 + .3 * Math.min(p.matchStamina ?? 100, 100 - (p.developmentFatigue ?? 0) * .5) / 100)
  const rating = team => { const roster = available(team).sort((a, b) => freshRating(b) - freshRating(a)).slice(0, 18); return roster.reduce((n, p) => n + freshRating(p), 0) / Math.max(7, roster.length) }
  const homeWins = rng.float() < Math.max(.1, Math.min(.9, .53 + (rating(home) - rating(away)) / 35))
  const loserScore = 6 + Math.floor(rng.float() * 9)
  const homeScore = homeWins ? 15 : loserScore, awayScore = homeWins ? loserScore : 15
  const boxScore = []
  for (const team of [home, away]) {
    const selected = available(team).sort((a, b) => freshRating(b) - freshRating(a)).slice(0, 18)
    const rows = selected.map(p => ({ playerId: p.id, teamId: team.id, firstName: p.firstName, lastName: p.lastName, goals: 0, assists: 0, blocks: 0, turnovers: 0, pointsPlayed: 0 }))
    for (let point=0;point<homeScore+awayScore&&rows.length;point++) {
      const onField=Array.from({length:Math.min(7,rows.length)},(_,i)=>(point*7+i)%rows.length)
      for(const index of onField) rows[index].pointsPlayed++
      if(point<(team===home?homeScore:awayScore)) {
        const scorer=Math.floor(rng.float()*onField.length)
        const passer=(scorer+1+Math.floor(rng.float()*Math.max(1,onField.length-1)))%onField.length
        rows[onField[scorer]].goals++
        if(onField.length>1) rows[onField[passer]].assists++
      }
    }
    for (let i = 0; i < selected.length; i++) {
      const p = selected[i]
      addPlayerLoad(p, rows[i].pointsPlayed * 0.9, { match: true, sharpness: 2 })
      boxScore.push(rows[i])
    }
  }
  return { fixtureId: fixture.id, date: fixture.date, round: fixture.round, competition: fixture.competition,
    homeTeamId: home.id, awayTeamId: away.id, homeScore, awayScore, winner: homeWins ? home.id : away.id, boxScore, simplified: true }
}
