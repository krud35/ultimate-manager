import assert from 'node:assert/strict'
import { buildScoutingAnalysis, saveScoutingAnalysis } from '../src/matchEngine/scoutingAnalysis.js'
import { simulateMatch } from '../src/matchEngine/match.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

const start = (pointIndex, attackTeam = 'home') => ({ type: 'point_start', pointIndex, attackTeam,
  homePointStartRole: attackTeam === 'home' ? 'offense' : 'defense', awayPointStartRole: attackTeam === 'away' ? 'offense' : 'defense', homeLineupIds: [1, 2], awayLineupIds: [3, 4] })
const pass = (side, from, to, success = true) => [
  { type: 'throw_attempt', possessionTeam: side, throwerId: side === 'home' ? 1 : 3, receiverId: side === 'home' ? 2 : 4, releasePoint: from, stallCount: 5 },
  { type: success ? 'throw_success' : 'throw_fail', possessionTeam: side, receiverId: side === 'home' ? 2 : 4, catchPoint: to, turnoverPoint: to, yardsGained: 20, isHuck: true, isDrop: !success },
]
const result = { events: [
  start(1), ...pass('home', { x: 60, y: 10 }, { x: 90, y: 12 }),
  { type: 'score', team: 'home', throwerId: 1, receiverId: 2 }, { type: 'point_end', scoringTeam: 'home' },
  start(2, 'away'), ...pass('away', { x: 30, y: 10 }, { x: 50, y: 12 }, false),
  { type: 'turnover', newPossession: 'home', turnoverPoint: { x: 50, y: 12 } },
  ...pass('home', { x: 40, y: 27 }, { x: 10, y: 25 }),
  { type: 'score', team: 'home', throwerId: 1, receiverId: 2 }, { type: 'point_end', scoringTeam: 'home' },
  start(3), { type: 'stall_out', possessionTeam: 'home', throwerId: 1 },
  { type: 'turnover', newPossession: 'away', turnoverPoint: { x: 45, y: 10 } },
  { type: 'score', team: 'away', reason: 'action_limit' }, { type: 'point_end', scoringTeam: 'away' },
] }
const report = buildScoutingAnalysis(result)
assert.equal(report.home.all.attempts, 2)
assert.equal(report.home.offense.attempts, 1)
assert.equal(report.home.defense.attempts, 1, 'Post-turnover offense stays in D-line')
assert.equal(report.home.defense.pointsWon, 1)
assert.equal(report.home.all.turnovers, 1, 'Stall is counted once')
assert.equal(report.home.players[1].all.turnovers, 1)
assert.equal(report.away.all.turnovers, 1, 'Throw failure + turnover counts once')
assert.equal(report.away.players[4].all.drops, 1)
assert.equal(report.home.players[2].all.goals, 2)
assert.equal(report.home.players[1].all.assists, 2)
assert.equal(report.home.players[1].all.pointsPlayed, 3)
assert.equal(report.home.all.pressureCompletions, 2)
assert.deepEqual(report.marks.filter(m => m.kind === 'goals' && m.side === 'home').map(m => [m.x, m.y]), [[90, 12], [90, 12]], 'Normalize both field axes across side changes')
assert.equal(report.marks.filter(m => m.kind === 'goals').length, 2, 'No invented map location for forced scores')

const league = { playerTeamId: 'a', currentDate: '2026-09-10', teamsById: { a: { name: 'A' }, b: { name: 'B' } } }
const record = { fixtureId: 'first', homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 1, scoutingAnalysis: report }
saveScoutingAnalysis(league, record)
saveScoutingAnalysis(league, record)
assert.equal(league.teamsById.a.scoutingAnalysis.total.games, 1, 'Duplicate result must not accumulate')
saveScoutingAnalysis(league, { ...record, fixtureId: 'second' })
const saved = JSON.parse(JSON.stringify(league.teamsById.a.scoutingAnalysis))
assert.equal(saved.last.fixtureId, 'second')
assert.equal(saved.total.games, 2)
assert.equal(saved.total.all.attempts, 4)
assert.equal(saved.total.players[1].defense.attempts, 2)
assert.equal(saved.total.marks, undefined, 'Aggregate stores no growing event list')
assert.equal(league.teamsById.b.scoutingAnalysis, undefined, 'Do not store analytics for all AI clubs')
saveScoutingAnalysis(league, { ...record, fixtureId: 'forfeit', scoutingAnalysis: undefined })
assert.equal(league.teamsById.a.scoutingAnalysis.last.report, null)
assert.equal(league.teamsById.a.scoutingAnalysis.total.games, 2)

for (const fastMode of [true, false]) {
  const match = simulateMatch({ homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam), seed: 724, fastMode })
  const actual = buildScoutingAnalysis(match)
  for (const side of ['home', 'away']) {
    assert.equal(actual[side].all.goals, match[`${side}Score`])
    assert.equal(actual[side].all.pointsWon, match[`${side}Score`])
    assert.equal(actual[side].all.attempts, match.matchStats[side].throwAttempts)
    assert.equal(actual[side].all.completions, match.matchStats[side].completions)
    assert.equal(actual[side].offense.attempts + actual[side].defense.attempts, actual[side].all.attempts)
    for (const [id, p] of Object.entries(actual[side].players)) {
      const box = match.boxScore.find(row => String(row.playerId) === id)
      assert.ok(box, `Missing box score for ${id}`)
      for (const key of ['goals', 'assists', 'attempts', 'completions', 'catches', 'drops']) assert.equal(p.all[key], box[key], `${fastMode ? 'Fast' : 'Full'} ${p.name}: ${key}`)
    }
  }
  console.log(`${fastMode ? 'Fast' : 'Full'} engine: ${match.homeScore}:${match.awayScore}; report ${JSON.stringify(actual).length} bytes`)
}
console.log('Scouting analysis: roles, coordinates, counters, persistence and both engine modes passed.')
