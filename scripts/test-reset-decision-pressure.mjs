import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { effectiveDecisionStall } from '../src/matchEngine/ai/throwerDecision.js'
import { createRng } from '../src/matchEngine/rng.js'

function scene({ initialRealStall = 1, resetChain = 0, ticks = 1, abort = false,
  markerFar = false, requireForwardPass = false, echo = false, shortCutter = false,
  implicitRealStall = false } = {}) {
  const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
  const offense = home.players.slice(0, 7), defense = away.players.slice(0, 7)
  for (const player of [...offense, ...defense]) {
    player.traits = []; player.currentStamina = 100; player.morale = 72
  }
  home.tactics = { attackStyle: 'horizontal_stack' }
  away.tactics = { defenseStyle: 'person', forceSide: 'force_forehand' }
  const positions = [[50, 18], [46, 26], [46, 11], [60, 18], [58, 29], [62, 7], [65, 24]]
  if (shortCutter) positions[3] = [52, 23]
  const seeds = new Map(), matchups = new Map()
  for (let i = 0; i < 7; i++) {
    const [x, y] = positions[i]
    seeds.set(offense[i].id, { id: offense[i].id, role: 'offense', x, y, vx: 0, vy: 0,
      state: shortCutter && i === 3 ? 'ACTIVE_CUT' : 'WAITING', targetX: x, targetY: y })
    seeds.set(defense[i].id, { id: defense[i].id, role: 'defense', x: i === 0 ? (markerFar ? 30 : 51) : x + 3,
      y: i === 0 ? (markerFar ? 5 : 18) : y + 2, vx: 0, vy: 0, state: i === 0 ? 'MARKING_STALL' : 'COVERING_CUTTER' })
    matchups.set(offense[i].id, defense[i])
  }
  const scans = [], commits = [], oldObserver = THROW_SCAN_DIAGNOSTICS.observe
  const originalRandom = Math.random, fallback = createRng(99231)
  THROW_SCAN_DIAGNOSTICS.observe = row => scans.push(structuredClone(row))
  Math.random = () => fallback.float()
  try {
    const result = runContinuousThrowSimulation({ rng: createRng(72931), thrower: offense[0],
      offenseLineup: offense, defenseLineup: defense, offenseTeam: home, defenseTeam: away,
      personMatchups: matchups, seedStates: seeds, possessionTeam: 'home', discPosition: 50, discYMeters: 18,
      stallCount: effectiveDecisionStall(initialRealStall, resetChain),
      ...(implicitRealStall ? {} : { hardStallCount: initialRealStall }),
      startStallClock: { markerId: defense[0].id, elapsedMs: (initialRealStall - 1) * 1000 },
      requireForwardPass, lastThrowerId: echo ? offense[3].id : null,
      maxTicks: ticks, ...(abort ? { onThrowCommitted: decision => { commits.push({ ...decision }); return { abort: true } } } : {}) })
    return { result, scans, commits, echoId: offense[3].id }
  } finally {
    THROW_SCAN_DIAGNOSTICS.observe = oldObserver
    Math.random = originalRandom
  }
}

const normal = scene(), pressure = scene({ resetChain: 3 })
assert.equal(normal.scans.length, 1)
assert.equal(pressure.scans.length, 1)
assert.equal(normal.scans[0].hardStallCount, 1)
assert.equal(pressure.scans[0].hardStallCount, 1)
assert.ok(normal.scans[0].threshold - pressure.scans[0].threshold > 40,
  'three resets must reach the real option evaluator as decision stall 7, not disappear at stall 1')
const implicit = scene({ implicitRealStall: true })
assert.deepEqual(implicit.scans, normal.scans, 'legacy callers without a separate hard stall have zero offset')

const normalClock = scene({ ticks: 180, abort: true })
const growingClock = scene({ ticks: 180, abort: true, resetChain: 2 })
assert.equal(normalClock.result.stallCount, 4)
assert.equal(growingClock.result.stallCount, 4, 'decision pressure does not advance the legal clock')
for (const row of growingClock.scans) {
  assert.equal(row.hardStallCount, 1 + Math.floor(row.setupElapsedMs / 1000))
}
assert.ok(growingClock.scans.find(s => s.hardStallCount === 3).threshold < growingClock.scans[0].threshold,
  'decision pressure must keep increasing with the real clock, rather than freeze at its initial value')
assert.ok(growingClock.commits.length > 0 && normalClock.commits.length > 0)
assert.ok(growingClock.commits[0].throwMs + 500 < normalClock.commits[0].throwMs,
  'reset pressure must reach the real release gate, not just a diagnostic/helper value')
assert.notEqual(growingClock.commits[0].receiver.id, normalClock.commits[0].receiver.id,
  'the controlled action must demonstrate an actual changed choice as well as changed scores')
assert.equal(growingClock.commits[0].stallCount, 1 + Math.floor(growingClock.commits[0].throwMs / 1000),
  'committed throws retain the physical stall for accuracy and event accounting')

const highPressure = scene({ ticks: 500, abort: true, resetChain: 4 })
assert.equal(highPressure.result.stallOut, true)
assert.equal(highPressure.result.stallCount, 10)
assert.equal(highPressure.result.frames.at(-1).ms, 9000, 'virtual urgency cannot cause an early stall-out')
assert.ok(highPressure.scans.every(s => s.hardStallCount < 10 && s.threshold === highPressure.scans[0].threshold),
  'decision stall is capped while the physical clock still runs to ten')
const noMarker = scene({ ticks: 80, abort: true, resetChain: 4, markerFar: true })
assert.equal(noMarker.result.stallOut, false)
assert.equal(noMarker.result.stallCount, 0, 'pressure without a legal marker cannot manufacture a count')
assert.ok(noMarker.scans.every(s => s.hardStallCount === 0))
assert.ok(noMarker.commits.length > 0)
assert.ok(noMarker.commits.every(d => d.stallCount === 0))
const alreadyExpired = scene({ initialRealStall: 10, resetChain: 4 })
assert.equal(alreadyExpired.result.stallOut, true)
assert.equal(alreadyExpired.scans.length, 0, 'real stall ten terminates before another scan')

for (const echo of [false, true]) {
  const early = scene({ resetChain: 4, shortCutter: true, echo, requireForwardPass: !echo })
  const late = scene({ initialRealStall: 8, resetChain: 4, shortCutter: true, echo, requireForwardPass: !echo })
  const reason = echo ? 'echo' : 'no_progress'
  assert.ok(early.scans[0].rejected.some(r => r.id === early.echoId && r.reason === reason),
    `virtual stall nine must not unlock ${reason} at real stall one`)
  assert.ok(!late.scans[0].rejected.some(r => r.id === late.echoId && r.reason === reason),
    `actual late-stall urgency still unlocks ${reason}`)
}
console.log(JSON.stringify({
  initialAcceptanceThreshold: { normal: normal.scans[0].threshold, pressured: pressure.scans[0].threshold },
  firstRelease: [normalClock, growingClock].map(({ commits }) => ({
    ms: commits[0].throwMs, receiver: commits[0].receiver.id, realStall: commits[0].stallCount,
  })),
}))
console.log('PASS reset pressure reaches scoring, choice and release; zero offset, growing clock, hard limit and anti-loop gates retained')
