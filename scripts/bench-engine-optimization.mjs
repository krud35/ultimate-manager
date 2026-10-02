// node --expose-gc --import ./scripts/register-engine-comparison.mjs scripts/bench-engine-optimization.mjs
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector'
import { createCareer } from '../src/career/careerModel.js'
import { teamForMatchEngine } from '../src/data/ufaLeagueTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import * as current from '../src/matchEngine/matchSession.js'
import * as baseline from '../src/matchEngine/matchSession.js?engineBaseline'
import { buildPointLineStats } from '../src/matchEngine/pointLineStats.js'

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')))
const output = args.out ?? 'artifacts/engine-optimization'
const seeds = (args.seeds ?? '70000,70001,70002').split(',').map(Number)
const repeats = Number(args.repeats ?? 2)
const pointLimit = Number(args.points ?? Infinity)
const profileMode = args.profile
const hash = data => createHash('sha256').update(data).digest('hex')
const digest = value => hash(JSON.stringify(value, (_key, item) => item instanceof Map ? [...item] : item))
assert.ok(globalThis.gc, 'Use --expose-gc')
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
Math.random = createRng(20260921).float
const oldTimeout = globalThis.setTimeout, timers = []
globalThis.setTimeout = (...params) => { const t = oldTimeout(...params); timers.push(t); return t }
let career
try {
  career = createCareer(0, { managerName: 'Engine performance', competition: 'ufa',
    playerTeamId: 'toronto-rush', seasonYear: 2025, rosterMode: 'historical' })
} finally { globalThis.setTimeout = oldTimeout; timers.forEach(clearTimeout) }
const home = career.world.teamsById[career.playerTeamId]
const away = career.world.teamsById[career.league.teamIds.find(id => id !== home.id)]
mkdirSync(output, { recursive: true })
const report = { generatedAt: new Date().toISOString(), node: process.version, cpu: cpus()[0].model,
  home: home.name, away: away.name, seeds, repeats, runs: [], pairs: [], baselineSource: {}, optimizedSource: {},
  notes: ['Same full simulation and capture setting in each pair; no fastMode.',
    'Separate warmed module graphs; alternate versions at each point and reverse which runs first at the next point.',
    'Engine time excludes parity hashing, panel stats and explicit GC. Headless Node, not browser FPS.',
    'Exact per-point hashes include current session state, new events (including replay frames), panel stats; entire final session and next RNG value also checked.',
    'CPU time is process.cpuUsage during engine calls (all process threads); waiting for CPU is excluded but frequency, GC and JIT still affect results.',
    'Both sessions stay alive in each pair. Memory use is not compared by this benchmark.'] }
const baselineDirectory = process.env.ENGINE_BASELINE_DIR ?? 'artifacts/engine-optimization/baseline'
const sources = process.env.ENGINE_BASELINE_DIR
  ? JSON.parse(readFileSync(`${baselineDirectory}/manifest.json`, 'utf8').replace(/^\uFEFF/, ''))
  : ['bodyTraffic', 'discIntercept', 'flightKinematics'].map(name => ({ path: `src/matchEngine/ai/${name}.js`, file: `${name}.js.txt` }))
for (const entry of sources) {
  report.baselineSource[entry.path] = hash(readFileSync(`${baselineDirectory}/${entry.file}`))
  report.optimizedSource[entry.path] = hash(readFileSync(entry.path))
}
const save = () => writeFileSync(`${output}/benchmark.json`, JSON.stringify(report, null, 2))
function* simulate(version, seed, collectFrames, limit = pointLimit) {
  const engine = version === 'baseline' ? baseline : current
  const random = createRng(80000 + seed - 70000).float
  Math.random = random
  const homeTeam = teamForMatchEngine(structuredClone(home)), awayTeam = teamForMatchEngine(structuredClone(away))
  let start = performance.now()
  let cpuStart = process.cpuUsage()
  const session = engine.initMatchSession({ homeTeam, awayTeam, seed, collectFrames })
  let totalMs = performance.now() - start
  let cpu = process.cpuUsage(cpuStart), totalCpuMs = (cpu.user + cpu.system) / 1000
  const points = [], pointCpuMs = [], states = []
  while (session.status !== 'finished' && points.length < limit) {
    const before = session.events.length
    // Preserve independent ambient randomness when switching module graphs.
    Math.random = random
    start = performance.now()
    cpuStart = process.cpuUsage()
    engine.playNextPoint(session, {}, { rotateHome: true, rotateAway: true, aiHome: false, aiAway: true })
    const ms = performance.now() - start
    cpu = process.cpuUsage(cpuStart)
    const cpuMs = (cpu.user + cpu.system) / 1000
    totalMs += ms
    totalCpuMs += cpuMs
    points.push(ms)
    pointCpuMs.push(cpuMs)
    const events = session.events.slice(before)
    const state = digest({ ...session, events, panelStats: buildPointLineStats(events) })
    states.push(state)
    yield state
  }
  const finalState = digest(session), nextRandom = session.rng.float()
  return { version, seed, collectFrames, totalMs, totalCpuMs, points, pointCpuMs, states, finalState, nextRandom,
    score: [session.homeScore, session.awayScore], events: session.events.length }
}
function run(version, seed, collectFrames, limit = pointLimit) {
  const iterator = simulate(version, seed, collectFrames, limit)
  let step
  do { step = iterator.next() } while (!step.done)
  return step.value
}
for (const version of ['baseline', 'optimized']) run(version, 69999, false, 3)
console.log('Both versions warmed up')
if (profileMode) {
  const inspector = new Session()
  inspector.connect()
  const post = (method, params = {}) => new Promise((resolve, reject) => inspector.post(method, params,
    (error, data) => error ? reject(error) : resolve(data)))
  await post('Profiler.enable')
  await post('Profiler.start')
  const result = run(profileMode, seeds[0], false)
  const { profile } = await post('Profiler.stop')
  writeFileSync(`${output}/${profileMode}.cpuprofile`, JSON.stringify(profile))
  inspector.disconnect()
  console.log(`${profileMode}: ${(result.totalMs / 1000).toFixed(2)} s (profiled, diagnostic only)`)
} else {
  for (const collectFrames of args.capture === 'true' ? [true] : args.capture === 'false' ? [false] : [false, true]) {
    // Primary workload: full simulation without replay. One extra complete pair
    // verifies that the same optimization preserves watched match frames too.
    const modeRepeats = collectFrames ? 1 : repeats
    const modeSeeds = collectFrames ? seeds.slice(0, 1) : seeds
    for (let repeat = 0; repeat < modeRepeats; repeat++) for (const [index, seed] of modeSeeds.entries()) {
      const order = (repeat + index) % 2 ? ['optimized', 'baseline'] : ['baseline', 'optimized']
      globalThis.gc()
      const iterators = order.map(version => simulate(version, seed, collectFrames))
      const pair = []
      for (let point = 0; ; point++) {
        const steps = []
        for (const position of point % 2 ? [1, 0] : [0, 1]) steps[position] = iterators[position].next()
        assert.equal(steps[0].done, steps[1].done, 'same number of points')
        if (steps[0].done) {
          pair.push(steps[0].value, steps[1].value)
          break
        }
        assert.equal(steps[0].value, steps[1].value, `seed=${seed} point=${point + 1} replay=${collectFrames}`)
      }
      assert.equal(pair[0].finalState, pair[1].finalState, 'complete final state including event history and frames')
      assert.equal(pair[0].nextRandom, pair[1].nextRandom, 'RNG continuity')
      for (const result of pair) {
        const { states, ...row } = result
        report.runs.push({ repeat, ...row })
        save()
        console.log(`${result.version} seed=${seed} repeat=${repeat + 1} replay=${collectFrames}: ${(result.totalMs / 1000).toFixed(2)} s, CPU ${(result.totalCpuMs / 1000).toFixed(2)} s, ${result.score.join('-')}, ${result.points.length} points`)
      }
      const before = pair.find(r => r.version === 'baseline'), after = pair.find(r => r.version === 'optimized')
      report.pairs.push({ seed, repeat, collectFrames, parity: true, points: before.points.length,
        baselineMs: before.totalMs, optimizedMs: after.totalMs, timeReductionPct: 100 * (1 - after.totalMs / before.totalMs),
        baselineCpuMs: before.totalCpuMs, optimizedCpuMs: after.totalCpuMs,
        cpuReductionPct: 100 * (1 - after.totalCpuMs / before.totalCpuMs) })
      save()
    }
  }
  const mean = (rows, key) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length
  report.summary = [false, true].filter(c => report.runs.some(r => r.collectFrames === c)).map(collectFrames => {
    const before = report.runs.filter(r => r.collectFrames === collectFrames && r.version === 'baseline')
    const after = report.runs.filter(r => r.collectFrames === collectFrames && r.version === 'optimized')
    return { collectFrames, pairs: before.length, baselineMs: mean(before, 'totalMs'), optimizedMs: mean(after, 'totalMs'),
      timeReductionPct: 100 * (1 - mean(after, 'totalMs') / mean(before, 'totalMs')),
      baselineCpuMs: mean(before, 'totalCpuMs'), optimizedCpuMs: mean(after, 'totalCpuMs'),
      cpuReductionPct: 100 * (1 - mean(after, 'totalCpuMs') / mean(before, 'totalCpuMs')) }
  })
  save()
  console.log(JSON.stringify(report.summary, null, 2))
}
