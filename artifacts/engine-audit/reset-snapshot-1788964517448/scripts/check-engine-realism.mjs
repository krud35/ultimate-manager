/** Regresje mechaniki audytu; uruchom bez runnera: node scripts/check-engine-realism.mjs */
import assert from 'node:assert/strict'
import { advanceStallClock } from '../src/matchEngine/stall.js'
import { fastTurnoverPoint } from '../src/matchEngine/fastPossession.js'
import { createRng } from '../src/matchEngine/rng.js'
import { initMatchSession, playNextPoint, simulateMatch } from '../src/matchEngine/matchSession.js'
import { applyFatigueAfterPoint } from '../src/matchEngine/rotation.js'
import { resetSprintMeters, staminaMapsForGeometry } from '../src/matchEngine/stamina.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { threatCellForMark, perceiveSpaceMap } from '../src/matchEngine/ai/spaceMap.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { sampleStateFromMotionTrace } from '../src/matchEngine/motionFromTicks.js'
import { sampleFieldActionClip } from '../src/matchEngine/fieldMotion.js'

const clock = { markerId: null, elapsedMs: 0 }, thrower = { x: 50, y: 18 }
const marker = { id: 1, x: 52, y: 18 }
assert.equal(advanceStallClock(clock, { ...marker, x: 60 }, thrower, 60000), 0)
assert.equal(advanceStallClock(clock, marker, thrower, 0), 1)
assert.equal(advanceStallClock(clock, marker, thrower, 8999), 9)
assert.equal(advanceStallClock(clock, marker, thrower, 1), 10)
assert.equal(advanceStallClock(clock, { ...marker, id: 2 }, thrower, 20), 1)
assert.equal(advanceStallClock(clock, { ...marker, id: 2, x: 54 }, thrower, 20), 0)
assert.equal(advanceStallClock(clock, marker, thrower, 20), 1)
assert.equal(advanceStallClock(clock, null, thrower, 60000), 0)

// Po przegranym hucku nie wracamy do miejsca wypuszczenia; odbicie stron
// musi odbić również punkt straty, bez nowego losowania.
for (const result of [{ isDrop: true }, { isBlock: true }, {}]) {
  const a = fastTurnoverPoint({ x: 15, y: 12 }, { x: 75, y: 25 }, result, createRng(123))
  const b = fastTurnoverPoint({ x: 85, y: 12 }, { x: 25, y: 25 }, result, createRng(123))
  assert.ok(Math.abs(a.x + b.x - 100) < 1e-9)
  assert.equal(a.y, b.y)
  assert.ok(a.x > 15)
  if (result.isDrop) assert.deepEqual(a, { x: 75, y: 25 })
}

const makeSession = () => initMatchSession({ homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam), seed: 41700 })
function fastFatigue(durationMs) {
  const s = makeSession()
  for (const side of ['home', 'away']) {
    const ids = s[side].players.slice(0, 7).map(p => p.id)
    s[side].tactics.lineupWhenOffenseStartPlayerIds = ids
    s[side].tactics.lineupWhenDefenseStartPlayerIds = ids
    for (const p of s[side].players) s.stamina[side][p.id] = 100
  }
  resetSprintMeters(s.stamina) // reprodukcja błędu: istniejąca, ale pusta mapa
  applyFatigueAfterPoint(s, 'home', null, { fastMode: true, durationMs })
  return s.away.players.slice(0, 7).map(p => 100 - s.stamina.away[p.id])
}
const shortCost = fastFatigue(10000), longCost = fastFatigue(60000)
assert.ok(longCost.every((v, i) => v >= shortCost[i]))
assert.ok(longCost.some((v, i) => v > shortCost[i]))
assert.ok(longCost.some(v => v > 5))
const maps = { home: { 1: 90 }, away: { 2: 80 }, sprintM: { home: { 1: 5 }, away: { 2: 8 } } }
const swapped = staminaMapsForGeometry(maps, true)
swapped.home[2] -= 3
swapped.sprintM.home[2] += 2
assert.equal(maps.away[2], 77)
assert.equal(maps.sprintM.away[2], 10)
let twoPoints = makeSession()
for (let i = 0; i < 2; i++) twoPoints = playNextPoint(twoPoints, {}, { fastMode: false })
for (const side of ['home', 'away']) {
  const ids = new Set(twoPoints[side].players.map(p => String(p.id)))
  assert.ok(Object.keys(twoPoints.stamina[side]).every(id => ids.has(id)), 'Energia zawodnika trafiła do przeciwnej drużyny')
}

// Fuzja percepcji ma zachować również stan RNG, nie tylko wybraną komórkę.
const cells = Array.from({ length: 79 }, (_, i) => ({ x: 5 + i, y: i % 37, ahead: i - 10, freeness: (i % 10) / 10 }))
for (const player of makeSession().home.players.slice(0, 7)) {
  for (let seed = 1; seed <= 20; seed++) {
    const a = createRng(seed), b = createRng(seed), mark = { x: 40, y: 18 }
    const old = threatCellForMark(mark, perceiveSpaceMap(cells, player, 'defense', a), { speed: 6 })
    const fused = threatCellForMark(mark, cells, { speed: 6, player, rng: b })
    assert.deepEqual(fused, old)
    assert.equal(a.float(), b.float())
  }
}

// Daleki marker zachowuje pozycję po chwycie. Podniesienie dysku wymaga dojścia.
for (const pickupPending of [false, true]) {
  const s = makeSession(), offense = s.home.players.slice(0, 7), defense = s.away.players.slice(0, 7)
  const seeds = new Map(), matchups = new Map()
  for (let i = 0; i < 7; i++) {
    seeds.set(offense[i].id, { id: offense[i].id, x: i === 0 ? (pickupPending ? 20 : 50) : 55 + i, y: 18, vx: 0, vy: 0, role: 'offense' })
    seeds.set(defense[i].id, { id: defense[i].id, x: 20 + i, y: 28, vx: 0, vy: 0, role: 'defense' })
    matchups.set(offense[i].id, defense[i])
  }
  const result = runContinuousThrowSimulation({ rng: createRng(991), thrower: offense[0], offenseLineup: offense,
    defenseLineup: defense, personMatchups: matchups, possessionTeam: 'home', discPosition: 50,
    discYMeters: 18, stallCount: 1, offenseTeam: s.home, defenseTeam: s.away, seedStates: seeds,
    maxTicks: 1, pickupPending })
  const frame = result.frames[0]
  for (const p of defense) {
    const before = seeds.get(p.id), after = frame.players.find(a => a.id === p.id)
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.5, 'Obrońca teleportował się do krycia')
  }
  assert.equal(frame.stallCount, 0)
  if (pickupPending) {
    assert.equal(frame.disc.state, 'ON_GROUND')
    assert.ok(frame.players.find(p => p.id === offense[0].id).x < 21)
    assert.equal(result.receiver, undefined)
  }
}

const locked = initMatchSession({ homeTeam: demoHomeTeam, awayTeam: demoAwayTeam, seed: 42901,
  wind: { speedMph: 20, directionDeg: 180 }, windLocked: true })
playNextPoint(locked, {}, { fastMode: true })
assert.equal(locked.wind.speedMph, 20)
assert.equal(locked.wind.directionDeg, 180)

let failedHucks = 0
for (const seed of [14700, 26700, 34700, 47700, 55700, 64700, 73700, 91700]) {
  const r = simulateMatch({ homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam), seed, fastMode: true })
  let attempt = null, fail = null
  for (const e of r.events) {
    assert.ok(!e.motionTrace?.frames?.length && !e.actionSim?.frames?.length, 'Fast uruchomił trace')
    if (e.type === 'throw_attempt') {
      attempt = e
      assert.ok(Number.isFinite(e.throwDistanceM))
      assert.ok(Math.abs(e.throwDistanceM - Math.hypot(e.targetPoint.x - e.releasePoint.x, e.targetPoint.y - e.releasePoint.y)) < 1e-9)
      assert.ok(e.stallCount < 10)
    }
    if (e.type === 'throw_success') assert.deepEqual(e.catchPoint, attempt.targetPoint)
    if (e.type === 'throw_fail') {
      fail = e
      if (attempt.throwType === 'huck' && attempt.throwDistanceM > 30) {
        assert.ok(Math.hypot(e.turnoverPoint.x - attempt.releasePoint.x, e.turnoverPoint.y - attempt.releasePoint.y) > 0.5)
        failedHucks++
      }
    }
    if (e.type === 'turnover' && fail) { assert.deepEqual(e.turnoverPoint, fail.turnoverPoint); fail = null }
  }
}
assert.ok(failedHucks > 0)
const trace = { preservePositions: true, totalMs: 2000, frames: [
  { ms: 0, stallCount: 0, disc: { state: 'ON_GROUND', x: 50, y: 18, z: 0 } },
  { ms: 1000, stallCount: 1, disc: { state: 'HELD', x: 50, y: 18, z: 1 } },
  { ms: 2000, stallCount: 2, disc: { state: 'HELD', x: 50, y: 18, z: 1 } },
] }
assert.equal(sampleStateFromMotionTrace(trace, 999, 2000).stallCount, 0)
assert.equal(sampleStateFromMotionTrace(trace, 1000, 2000).stallCount, 1)
const clip = { motionTrace: trace, totalDurationMs: 2000, setupMs: 2000, releaseMs: 0, flightMs: 0,
  tracks: {}, tacticalAll: [], discFromX: 50, discFromY: 18, stallStart: 0, stallEnd: 10, holdStartMs: 20000 }
assert.equal(sampleFieldActionClip(clip, 999).discState, 'ON_GROUND')
assert.equal(sampleFieldActionClip(clip, 999).displayStall, null)
assert.equal(sampleFieldActionClip(clip, 1000).displayStall, 1)
console.log('OK: stall, miejsce strat, zmęczenie, ciągłość ruchu, podniesienie dysku, RNG percepcji i 8 meczów fast')
