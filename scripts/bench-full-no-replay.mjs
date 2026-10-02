// Run without other CPU-heavy jobs:
// node --expose-gc --import ./scripts/register-world-tests.mjs scripts/bench-full-no-replay.mjs
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCareer } from '../src/career/careerModel.js'
import { teamForMatchEngine } from '../src/data/ufaLeagueTeams.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { createRng } from '../src/matchEngine/rng.js'
import { buildPointLineStats } from '../src/matchEngine/pointLineStats.js'

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')))
const repeats = Number(args.repeats ?? 2)
const seeds = (args.seeds ?? '70000,70001,70002').split(',').map(Number)
const output = args.out ?? 'artifacts/full-no-replay'
assert.ok(globalThis.gc, 'Use --expose-gc to measure retained heap')
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
Math.random = createRng(20260921).float
const originalTimeout = globalThis.setTimeout, timers = []
globalThis.setTimeout = (...args) => { const timer = originalTimeout(...args); timers.push(timer); return timer }
let career
try {
  career = createCareer(0, { managerName: 'Performance audit', competition: 'ufa',
    playerTeamId: 'toronto-rush', seasonYear: 2025, rosterMode: 'historical' })
} finally {
  globalThis.setTimeout = originalTimeout
  timers.forEach(clearTimeout)
}
const home = career.world.teamsById[career.playerTeamId]
const away = career.world.teamsById[career.league.teamIds.find(id => id !== home.id)]
const report = { generatedAt: new Date().toISOString(), node: process.version, cpu: cpus()[0].model,
  home: home.name, away: away.name, seeds, repeats,
  notes: ['Full physics and AI in both modes. No fastMode.',
    'Sequential paired runs, alternating mode order, after warming up both paths.',
    'Times exclude assertions, serialization and explicit GC; Node only, no rendering.',
    'Retained heap delta measured after GC, with the finished session still reachable.',
    'Parity compares every point: all session state except replay frames/final snapshots, capture option and RNG function; next RNG value checked at match end.'],
  runs: [], pairs: [] }
mkdirSync(output, { recursive: true })
const save = () => writeFileSync(`${output}/benchmark.json`, JSON.stringify(report, null, 2))
const sportingState = session => JSON.parse(JSON.stringify(session, (key, value) => {
    if (['frames', 'finalFrame', 'runMetersById', 'collectFrames', 'rng'].includes(key)) return undefined
  return value instanceof Map ? [...value] : value
}))
function run(seed, collectFrames, pointLimit = Infinity, expected = null) {
  Math.random = createRng(80000 + seed - 70000).float
  const homeTeam = teamForMatchEngine(structuredClone(home))
  const awayTeam = teamForMatchEngine(structuredClone(away))
  globalThis.gc()
  const heapBefore = process.memoryUsage().heapUsed
  let start = performance.now()
  const session = initMatchSession({ homeTeam, awayTeam, seed, collectFrames })
  let totalMs = performance.now() - start
  const points = [], states = []
  while (session.status !== 'finished' && points.length < pointLimit) {
    const before = session.events.length
    start = performance.now()
    playNextPoint(session, {}, { rotateHome: true, rotateAway: true, aiHome: false, aiAway: true })
    const ms = performance.now() - start
    totalMs += ms
    points.push(ms)
    // Kept outside timing; store only hashes in memory during timed runs.
    const state = { session: sportingState(session), lineStats: buildPointLineStats(session.events.slice(before)) }
    const serialized = JSON.stringify(state)
    const digest = hash(serialized)
    if (expected) assert.equal(digest, expected[points.length - 1], `parity seed=${seed}, point=${points.length}`)
    states.push(digest)
  }
  globalThis.gc()
  const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore
  const frames = session.events.reduce((n, e) => n + (e.motionTrace?.frames?.length ?? 0), 0)
  assert.equal(frames > 0, collectFrames)
  return { seed, collectFrames, totalMs, retainedHeapBytes, frames, points,
    score: [session.homeScore, session.awayScore], events: session.events.length,
    nextRandom: session.rng.float(), states }
}
// Stable digest of complete sporting state; avoid retaining multiple match copies.
import { createHash } from 'node:crypto'
const hash = value => createHash('sha256').update(value).digest('hex')
for (const capture of [true, false]) run(69999, capture, 2)
console.log('Warmup complete')
for (let repeat = 0; repeat < repeats; repeat++) {
  for (const [index, seed] of seeds.entries()) {
    const order = (repeat + index) % 2 ? [false, true] : [true, false]
    const paired = []
    for (const collectFrames of order) {
      const result = run(seed, collectFrames, Infinity, paired[0]?.states)
      paired.push(result)
      console.log(`repeat=${repeat + 1} seed=${seed} ${collectFrames ? 'replay' : 'no-replay'}: ${(result.totalMs / 1000).toFixed(2)} s, ${(result.retainedHeapBytes / 2 ** 20).toFixed(1)} MiB, ${result.frames} frames, ${result.score.join('-')}`)
      const { states, ...row } = result
      report.runs.push({ repeat, ...row })
      save()
    }
    assert.equal(paired[0].nextRandom, paired[1].nextRandom)
    const full = paired.find(r => r.collectFrames), lean = paired.find(r => !r.collectFrames)
    report.pairs.push({ repeat, seed, parity: true, replayMs: full.totalMs, noReplayMs: lean.totalMs,
      timeReductionPct: 100 * (1 - lean.totalMs / full.totalMs), speedup: full.totalMs / lean.totalMs })
    save()
  }
}
const summarize = mode => {
  const rows = report.runs.filter(r => r.collectFrames === mode)
  const mean = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length
  return { matches: rows.length, meanMs: mean('totalMs'), meanRetainedHeapBytes: mean('retainedHeapBytes'),
    meanFrames: mean('frames') }
}
report.summary = { replay: summarize(true), noReplay: summarize(false) }
report.summary.timeReductionPct = 100 * (1 - report.summary.noReplay.meanMs / report.summary.replay.meanMs)
report.summary.retainedHeapReductionPct = 100 * (1 - report.summary.noReplay.meanRetainedHeapBytes / report.summary.replay.meanRetainedHeapBytes)
save()
console.log(JSON.stringify(report.summary, null, 2))
