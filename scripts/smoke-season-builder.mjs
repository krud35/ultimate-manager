/**
 * Szybki test buildera sezonów (node --experimental-json-modules lub Vite).
 */
import { getOverallRating } from '../src/models/playerStats.js'
import {
  HISTORICAL_YEARS,
  buildRawLeagueTeams,
  buildSeasonLeagueTemplate,
} from '../src/data/seasonLeagueBuilder.js'

console.log('years', HISTORICAL_YEARS.join(','))

const raw2013 = buildRawLeagueTeams(2013)
console.log(
  '2013 raw',
  raw2013.realTeamCount,
  'real +',
  raw2013.fictionalCount,
  'fic =',
  raw2013.teams.length,
)

const hist = buildSeasonLeagueTemplate({ year: 2013, rosterMode: 'historical', seed: 42 })
console.log(
  '2013 hist',
  hist.teams.length,
  hist.teams.filter((t) => t.isFictional).length,
  'fic teams;',
  hist.teams[0].name,
  hist.teams[0].players[0]?.firstName,
)

const rnd = buildSeasonLeagueTemplate({ year: 2025, rosterMode: 'random', seed: 99 })
const ovrs = rnd.teams.flatMap((t) => t.players.map((p) => getOverallRating(p.skills)))
ovrs.sort((a, b) => a - b)
const bands = {
  bulk: ovrs.filter((o) => o >= 74 && o <= 83).length,
  good: ovrs.filter((o) => o >= 84 && o <= 88).length,
  elite: ovrs.filter((o) => o >= 89 && o <= 94).length,
  other: ovrs.filter((o) => o < 74 || o > 94).length,
}
console.log('2025 random OVR bands', bands, 'min', ovrs[0], 'max', ovrs[ovrs.length - 1])
console.log('ok')
