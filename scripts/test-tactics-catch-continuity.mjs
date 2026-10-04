import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// A source override lets the same observable contract reject the frozen baseline.
const source = path.resolve(process.argv[2] ?? 'src')
const load = relative => import(pathToFileURL(path.join(source, relative)).href)
const { initMatchSession, playNextPoint } = await load('matchEngine/matchSession.js')
const { demoHomeTeam, demoAwayTeam } = await load('data/demoMatchTeams.js')
const { createRng } = await load('matchEngine/rng.js')
const { tacticsForTeam } = await load('matchEngine/aiLineup.js')
const { geoTeam } = await load('matchEngine/fieldDimensions.js')
const { discPositionFromFieldMeters } = await load('matchEngine/fieldViz.js')
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${label}: ${actual} != ${expected}`)
let catches = 0, continuations = 0
const directions = new Set()
const scenarios = [
  { seed: 400701, defenseStyle: 'person', wind: { speedMph: 0, directionDeg: 0 } },
  { seed: 400702, defenseStyle: 'zone_wall', wind: { speedMph: 24, directionDeg: 180 } },
  { seed: 400703, defenseStyle: 'zone_cup', wind: { speedMph: 18, directionDeg: 90 } },
]
for (const scenario of scenarios) for (const collectFrames of [true, false]) {
  Math.random = createRng(scenario.seed + 100).float
  const homeTeam = structuredClone(demoHomeTeam), awayTeam = structuredClone(demoAwayTeam)
  for (const team of [homeTeam, awayTeam]) {
    team.tactics = tacticsForTeam(team)
    for (const key of ['defenseStyle', 'oLineDefenseStyle', 'dLineDefenseStyle']) team.tactics[key] = scenario.defenseStyle
  }
  const session = initMatchSession({ homeTeam, awayTeam, homeTactics: homeTeam.tactics, awayTactics: awayTeam.tactics,
    seed: scenario.seed, wind: scenario.wind,
    windLocked: true, collectFrames })
  for (let point = 0; point < 2; point++) {
    const start = session.events.length
    playNextPoint(session, {}, { fastMode: false, rotateHome: true, rotateAway: true, aiHome: false, aiAway: false })
    for (const team of [session.home, session.away]) {
      assert.equal(team.tactics.oLineDefenseStyle, scenario.defenseStyle)
      assert.equal(team.tactics.dLineDefenseStyle, scenario.defenseStyle)
    }
    let anchor = null, swapped = false
    for (const event of session.events.slice(start)) {
      if (event.type === 'point_start') swapped = event.sidesSwapped
      if (event.type === 'throw_success') {
        assert.ok(event.catchPoint && Number.isFinite(event.catchPoint.x), 'Physical catch must retain its pivot')
        const geometry = geoTeam(event.possessionTeam, swapped)
        directions.add(geometry)
        near(event.discPosition, discPositionFromFieldMeters(event.catchPoint.x, geometry), 'catch X in match state')
        near(event.discYMeters, event.catchPoint.y, 'catch Y in match state')
        anchor = event
        catches++
      } else if (event.type === 'throw_attempt' && anchor) {
        assert.equal(event.throwerId, anchor.receiverId)
        near(event.releasePoint.x, anchor.catchPoint.x, 'catch to next release X')
        near(event.releasePoint.y, anchor.catchPoint.y, 'catch to next release Y')
        continuations++
        anchor = null
      } else if (['throw_fail', 'stall_out', 'turnover', 'score'].includes(event.type)) anchor = null
    }
  }
}
assert.ok(catches >= 10 && continuations >= 10, 'Insufficient physical catch/continuation exposure')
assert.deepEqual([...directions].sort(), ['away', 'home'])
console.log(`PASS catch continuity: ${catches} catches, ${continuations} subsequent releases; both directions, calm/axial/crosswind, person/wall/cup, frames on/off`)
