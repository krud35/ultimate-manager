// Bounded, reproducible paired audit. Full mode verifies spatial behavior separately
// from the fast mode used for background league matches. Outputs descriptive data.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildEucsLeagueTemplate } from '../src/data/eucsLeagueTeams.js'
import { getOverallRating } from '../src/models/playerStats.js'
import { simulateMatch } from '../src/matchEngine/matchSession.js'

const mean = a => a.reduce((s, x) => s + x, 0) / a.length
const strength = t => mean(t.players.map(p => getOverallRating(p.skills)))
const tiers = Object.fromEntries([1, 2, 3].map(tier => [tier, buildEucsLeagueTemplate({ tier, seed: 71 }).teams.sort((a, b) => strength(b) - strength(a))]))
const pairs = [[1, 2], [2, 3], [1, 3]]
const rows = []
for (const fastMode of [true, false]) for (const [higher, lower] of pairs) {
  const seeds = fastMode ? [17, 71, 137, 251] : [71]
  const row = { mode: fastMode ? 'fast' : 'spatial', higher, lower, games: 0, higherWins: 0, scores: [] }
  for (const seed of seeds) for (const reversed of [false, true]) {
    // Spread background fixtures across the middle of the distribution.
    const index = fastMode ? [17, 71, 137, 251].indexOf(seed) * 3 + 2 : 7
    const strong = tiers[higher][index], weak = tiers[lower][index]
    const home = reversed ? weak : strong, away = reversed ? strong : weak
    const result = simulateMatch({ homeTeam: structuredClone(home), awayTeam: structuredClone(away),
      seed, fastMode, wind: { speedMph: 0, directionDeg: 0 }, windLocked: true })
    assert.equal(result.status, 'finished')
    const higherScore = reversed ? result.awayScore : result.homeScore
    const lowerScore = reversed ? result.homeScore : result.awayScore
    row.games++
    row.higherWins += higherScore > lowerScore ? 1 : 0
    row.scores.push([higherScore, lowerScore])
  }
  row.meanHigherScore = +mean(row.scores.map(s => s[0])).toFixed(2)
  row.meanLowerScore = +mean(row.scores.map(s => s[1])).toFixed(2)
  rows.push(row)
  console.log(JSON.stringify(row))
}
mkdirSync('artifacts/roster-model', { recursive: true })
writeFileSync('artifacts/roster-model/matches.json', JSON.stringify(rows, null, 2))
console.log('Saved artifacts/roster-model/matches.json; paired sample, not precise win-probability estimates.')
