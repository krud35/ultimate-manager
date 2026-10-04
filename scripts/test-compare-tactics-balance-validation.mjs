import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { buildComparison, writeComparison } from './compare-tactics-balance-validation.mjs'
import { writeReport, PRIMARY_METRICS } from './tactics-balance-report.mjs'

const base = path.resolve('artifacts/tactics-balance-2026-10-03/comparison-qa')
fs.mkdirSync(base, { recursive: true })
const output = fs.mkdtempSync(path.join(base, 'run-'))
const json = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const compactJsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const originalInstrumentation = `export const observer = {
  end(events, score) {
    const point = 1, scores = events
    const guard = scores.some(e => e.artificialScore)
    const summary = { point, score, scores, guard, completions: events.length }
    return summary
  }
}
`
const terminalInstrumentation = `export const observer = {
  end(events, score, failure = null) {
    const point = 1, scores = events
    const guard = !!failure || scores.some(e => e.artificialScore)
    const summary = { point, score, scores, guard, failure, completions: events.length }
    return summary
  }
}
`
const writeInstrumentation = (root, phase, source) => {
  const filename = path.join(root, phase, 'instrumentation.mjs')
  fs.writeFileSync(filename, source)
  json(path.join(root, phase, 'version.json'), { phase, instrumentationHash: hash(filename) })
}
const initialize = (root, queue, rosters = {}) => {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'queue.json'), JSON.stringify(queue, null, 2))
  json(path.join(root, 'rosters.json'), rosters)
  json(path.join(root, 'manifest.json'), { queueHash: compactJsonHash(queue), rosterHash: hash(path.join(root, 'rosters.json')) })
  for (const phase of ['before', 'after']) {
    fs.mkdirSync(path.join(root, phase, 'jobs'), { recursive: true })
    fs.copyFileSync(path.join(root, 'queue.json'), path.join(root, phase, 'queue.json'))
    fs.copyFileSync(path.join(root, 'rosters.json'), path.join(root, phase, 'rosters.json'))
    writeInstrumentation(root, phase, originalInstrumentation)
  }
}
const pair = (seed, level = 'neutral', factor = 'synthetic', cohort = 'instruction') => [false, true].map(swap => ({
  id: `${factor}-${seed}-${level}-${swap ? 'b' : 'a'}`, block: `${factor}-${seed}-${level}`,
  contrast: `${factor}-${seed}`, cohort, factor, level, round: seed - 1, seed, swap,
  attack: 'horizontal_stack', defense: 'person', weather: 'calm', wind: { speedMph: 0, directionDeg: 0 },
  home: `roster-${seed}-a`, away: `roster-${seed}-b`, family: 'holdout', split: 'holdout', firstOffense: seed === 2 ? 'b' : 'a',
  homeConfig: { attack: 'horizontal_stack', instructions: level === 'neutral' ? [] : ['safe_throws'] },
  awayConfig: { defense: 'person' }, observe: true, lockWind: true, rotate: false,
}))
const motion = (displacementAlarms = 0) => ({ playerSeconds: 100, movingMeters: 300, offenseSeconds: 50,
  defenseSeconds: 50, stationaryOffSeconds: 5, clearSeconds: 10, cutSeconds: 20, poachSeconds: 1,
  widthMeterSeconds: 200, depthMeterSeconds: 300, shapeSeconds: 10, cushionMeterSeconds: 80, cushionSeconds: 20,
  displacementAlarms, targetReversals: 2, nonfinite: 0 })
const side = (throws, completions, goals, alarms = 0) => ({ throws, completions, goals, possessions: 20,
  holds: 5, holdOpportunities: 10, breaks: 5, breakOpportunities: 10, turnovers: 10,
  hucks: 2, huckCompletions: 1, resets: 2, resetCompletions: 1, breakAttempts: 2, breakCompletions: 1,
  holdMs: 2000, holdN: 2, distanceM: 300, motion: motion(alarms), roles: { primary_cutter: motion() },
  resetChainAlarms: 0, decisions: { scans: 10, noSelection: 2, lateScans: 1, reachableResetScans: 4,
    selectedResetScans: 2, perceivedPlayers: 10, stalePlayers: 1 } })
const result = (job, phase) => {
  // Unequal attempts deliberately distinguish equal game means from pooled ratios.
  const throws = job.swap ? 10 : 100
  const completions = job.swap ? 5 : 90
  const gain = phase === 'after' ? (job.level === 'neutral' ? .1 : .2) : 0
  const a = side(throws, completions + throws * gain, 15, phase === 'before' ? 1 : 0)
  const b = side(20, 10, 10, phase === 'before' ? 2 : 0)
  return { job, status: 'complete', matchStatus: 'finished', identity: job.swap ? { home: 'b', away: 'a' } : { home: 'a', away: 'b' },
    sides: job.swap ? { home: b, away: a } : { home: a, away: b }, score: job.swap ? [10,15] : [15,10],
    hardErrors: [], warnings: [], measurement: { version: 2, fullEngine: true, fastMode: false, matchRuleOverride: false, motionSampleMs: 100 },
    checkpoints: [{ ignored: 'RAW_TREE_MUST_NOT_SURVIVE', nested: Array(1000).fill({ data: 'x'.repeat(100) }) }],
    replays: [{ ignored: 'RAW_TREE_MUST_NOT_SURVIVE' }], pointOutcomes: [],
  }
}
const writeResults = (root, jobs, phases = ['before', 'after']) => {
  for (const phase of phases) for (const job of jobs) json(path.join(root, phase, 'jobs', job.id + '.json'), result(job, phase))
}

const clean = path.join(output, 'clean')
const jobs = [1,2,3].flatMap(seed => ['neutral', 'configured'].flatMap(level => pair(seed, level)))
initialize(clean, jobs.map(job => ({ jobs: [job] }))); writeResults(clean, jobs)
const report = buildComparison(clean)
assert.equal(report.matchedPairs, 6)
const neutral = report.cells.find(c => c.context.level === 'neutral')
assert.equal(neutral.a.metrics.completionPct.before.mean, 70, 'mean of 90% and 50%, not ratio of pooled throws')
assert.equal(neutral.a.metrics.completionPct.after.mean, 80)
assert.equal(neutral.a.metrics.completionPct.delta.mean, 10)
assert.equal(neutral.b.metrics.completionPct.delta.mean, 0, 'identity B is independently mapped through swap')
assert.equal(neutral.distinctRosterPairs, 3)
assert.ok(neutral.a.metrics.completionPct.delta.ci95, 'CI exists for three seeded blocks in one context')
assert.equal(report.overall.a.metrics.completionPct.delta.ci95, null, 'no pooled CI across mixed levels/contexts')
assert.equal(report.versions.before.qualityAllRecorded.sides.a.motion.displacementAlarms.count, 12)
assert.equal(report.versions.before.qualityAllRecorded.sides.b.motion.displacementAlarms.count, 24)
assert.equal(report.qualityChanges.commonPairs.sides.b.motion.displacementAlarms.countDelta, -24)
assert.equal(report.treatmentEffects.cells[0].a.metrics.completionPct.delta.mean, 10, 'difference in treatment-minus-neutral effects')
assert.ok(!JSON.stringify(report).includes('RAW_TREE_MUST_NOT_SURVIVE'))
assert.equal(report.instrumentation.status, 'BYTE_IDENTICAL')
assert.notEqual(report.rootHashes.queue, report.rootHashes.queueCompactJson, 'pretty file hash and producer compact-JSON hash intentionally differ')
assert.deepEqual(report.globalIssues, [])
assert.throws(() => writeComparison(clean, path.join(clean, 'after', 'summary')), /outside immutable/)

const changedQueue = path.join(output, 'semantic-queue-change')
initialize(changedQueue, jobs.map(job => ({ jobs: [job] }))); writeResults(changedQueue, jobs)
const changed = read(path.join(changedQueue, 'queue.json'))
changed[0].jobs[0].seed++
// All raw copies agree, so only validation against the original producer hash
// can catch this semantic mutation. Never edit actual frozen input files.
for (const folder of ['', 'before', 'after']) json(path.join(changedQueue, folder, 'queue.json'), changed)
const changedReport = buildComparison(changedQueue)
assert.ok(changedReport.globalIssues.includes('canonical-queue-hash-mismatch'))
assert.equal(changedReport.matchedPairs, 0)
assert.ok(!changedReport.versions.before.issues.includes('version-queue-hash-mismatch'))
const reformattedQueue = path.join(output, 'version-queue-format-change')
initialize(reformattedQueue, jobs.map(job => ({ jobs: [job] }))); writeResults(reformattedQueue, jobs)
json(path.join(reformattedQueue, 'after/queue.json'), read(path.join(reformattedQueue, 'queue.json')))
const formatReport = buildComparison(reformattedQueue)
assert.deepEqual(formatReport.globalIssues, [], 'producer manifest ignores formatting of the root input')
assert.ok(formatReport.versions.after.issues.includes('version-queue-hash-mismatch'), 'version copies still require byte identity')
assert.equal(formatReport.matchedPairs, 0)

const compatible = path.join(output, 'instrumentation-compatible')
initialize(compatible, jobs.map(job => ({ jobs: [job] }))); writeResults(compatible, jobs)
writeInstrumentation(compatible, 'after', terminalInstrumentation)
let instrumentationReport = buildComparison(compatible)
assert.equal(instrumentationReport.matchedPairs, 6)
assert.equal(instrumentationReport.instrumentation.status, 'COMPATIBLE_TERMINAL_FAILURE_EXTENSION')
assert.equal(instrumentationReport.cells[0].a.metrics.completionPct.delta.mean, report.cells[0].a.metrics.completionPct.delta.mean)

// Even a correctly rehashed change to a counter is outside the compatibility
// allowance. A forged declared hash cannot hide changed bytes either.
writeInstrumentation(compatible, 'after', terminalInstrumentation.replace('completions: events.length', 'completions: events.length + 1'))
instrumentationReport = buildComparison(compatible)
assert.equal(instrumentationReport.matchedPairs, 0)
assert.ok(instrumentationReport.globalIssues.includes('instrumentation-hash-mismatch'))
writeInstrumentation(compatible, 'after', terminalInstrumentation)
fs.appendFileSync(path.join(compatible, 'after/instrumentation.mjs'), '// undeclared change\n')
instrumentationReport = buildComparison(compatible)
assert.equal(instrumentationReport.matchedPairs, 0)
assert.ok(instrumentationReport.versions.after.issues.includes('instrumentation-source-hash-mismatch'))
writeInstrumentation(compatible, 'after', terminalInstrumentation.replace('failure = null', 'failure = false'))
assert.equal(buildComparison(compatible).matchedPairs, 0, 'a near-match is not the exact permitted extension')
writeInstrumentation(compatible, 'after', terminalInstrumentation + '// unrelated comment\n')
assert.equal(buildComparison(compatible).matchedPairs, 0, 'compatibility requires every other byte unchanged')

// One lost half-game excludes its ENTIRE mirror pair from both versions. A zero
// denominator excludes that metric from both means, while other metrics survive.
const damaged = path.join(output, 'damaged')
initialize(damaged, jobs.map(job => ({ jobs: [job] }))); writeResults(damaged, jobs)
const alter = (phase, job, fn) => {
  const f = path.join(damaged, phase, 'jobs', job.id + '.json'), raw = read(f); fn(raw); json(f, raw)
}
const find = (seed, level, swap = false) => jobs.find(j => j.seed === seed && j.level === level && j.swap === swap)
alter('before', find(1, 'configured'), r => { r.hardErrors = ['Artificial score from action/throw limit', 'Possession mismatch']; r.sides.away.motion.displacementAlarms = 7 })
alter('after', find(2, 'configured'), r => { r.job.seed = 999 })
alter('after', find(3, 'configured'), r => { r.identity = { home: 'b', away: 'a' } })
alter('after', find(3, 'neutral'), r => { r.sides.home.decisions.scans = 0; r.sides.home.roles.primary_cutter.playerSeconds = 0 })
const damagedReport = buildComparison(damaged)
assert.equal(damagedReport.matchedPairs, 3)
assert.equal(damagedReport.versions.before.qualityAllRecorded.guards.gamesWithAny, 1, 'guard remains visible outside sport sample')
assert.equal(damagedReport.versions.before.qualityAllRecorded.unattributedHardErrors.count, 2)
assert.equal(damagedReport.versions.before.qualityAllRecorded.guards.count, 1, 'secondary mismatch error is not another guard event')
assert.equal(damagedReport.versions.before.qualityAllRecorded.sides.b.motion.displacementAlarms.count, 29, 'both-side invalid-game alarms retained')
assert.equal(damagedReport.versions.after.qualityAllRecorded.sides.b.identifiedGames, 11, 'inconsistent side identity is not attributed speculatively')
const cell = damagedReport.cells[0]
assert.equal(cell.a.metrics.noSelectionPct.pairedBlocks, 2)
assert.equal(cell.a.metrics.noSelectionPct.before.blockCount, 2)
assert.equal(cell.a.metrics.noSelectionPct.delta.ci95, null)
assert.equal(cell.a.roles.primary_cutter.metersPerPlayerMinute.pairedBlocks, 2)
assert.equal(cell.a.metrics.completionPct.pairedBlocks, 3)
assert.ok(damagedReport.excludedBlocks.some(b => b.reasons.some(r => r.includes('hard-errors'))))
assert.ok(damagedReport.excludedBlocks.some(b => b.reasons.some(r => r.includes('job-does-not-match-queue'))))
assert.ok(damagedReport.excludedBlocks.some(b => b.reasons.some(r => r.includes('identity-or-side-mismatch'))))

const incomplete = path.join(output, 'incomplete')
initialize(incomplete, jobs.map(job => ({ jobs: [job] })))
writeResults(incomplete, jobs, ['before'])
// after directory contains queue/rosters, but no results: no observed successes/errors.
let partial = buildComparison(incomplete)
assert.equal(partial.matchedPairs, 0)
assert.equal(partial.versions.after.missingJobIds.length, jobs.length)
assert.equal(partial.versions.after.qualityAllRecorded.hardErrors.count, null)
assert.equal(partial.overall.a.metrics.margin.delta.mean, null)
writeResults(incomplete, [jobs[0]], ['after'])
partial = buildComparison(incomplete)
assert.equal(partial.matchedPairs, 0, 'one leg is not a pair')
writeResults(incomplete, [jobs[1]], ['after'])
assert.equal(buildComparison(incomplete).matchedPairs, 1)
fs.copyFileSync(path.join(incomplete, 'after/jobs', jobs[0].id + '.json'), path.join(incomplete, 'after/jobs/duplicate.json'))
partial = buildComparison(incomplete)
assert.equal(partial.matchedPairs, 0, 'duplicate result cannot silently win last-write selection')
assert.equal(partial.versions.after.duplicateJobIds.length, 1)
json(path.join(incomplete, 'after/rosters.json'), { wrong: true })
assert.ok(buildComparison(incomplete).versions.after.issues.includes('version-roster-hash-mismatch'))
assert.equal(buildComparison(incomplete).versions.after.validCompleteGames, 0)

const unknown = path.join(output, 'unknown')
initialize(unknown, jobs.map(job => ({ jobs: [job] })))
const unknownResult = result(jobs[0], 'before'); delete unknownResult.hardErrors
json(path.join(unknown, 'before/jobs', jobs[0].id + '.json'), unknownResult)
fs.writeFileSync(path.join(unknown, 'before/jobs', jobs[1].id + '.json'), '{')
// Preserve the empty version directory instead of deleting any QA artifacts.
fs.renameSync(path.join(unknown, 'after'), path.join(unknown, 'after-not-created'))
const unknownReport = buildComparison(unknown)
assert.equal(unknownReport.versions.before.readErrors.length, 1)
assert.equal(unknownReport.versions.before.qualityAllRecorded.hardErrors.count, null)
assert.equal(unknownReport.versions.before.qualityAllRecorded.hardErrors.unknownGames, 1)
assert.equal(unknownReport.versions.after.missingJobIds.length, 12)
assert.ok(unknownReport.versions.after.issues.includes('missing-version-queue'))
assert.equal(unknownReport.qualityChanges.allRecorded.hardErrors.countDelta, null)

const guarded = path.join(output, 'terminal-guard')
initialize(guarded, jobs.map(job => ({ jobs: [job] }))); writeResults(guarded, jobs)
const failed = result(jobs[0], 'after')
failed.status = 'error'; failed.matchStatus = 'failed'
failed.failure = { code: 'POINT_SIMULATION_LIMIT', pointIndex: 3, throwCount: 2000, actionCount: 2000,
  limit: 2000, mode: 'full', possessionTeam: 'home', discPosition: 42, reason: 'throw_limit' }
failed.hardErrors = ['Point simulation limit: no score awarded', 'Artificial score from action/throw limit']
json(path.join(guarded, 'after/jobs', jobs[0].id + '.json'), failed)
const guardReport = buildComparison(guarded)
assert.equal(guardReport.matchedPairs, 5)
assert.equal(guardReport.versions.after.qualityAllRecorded.guards.count, 1, 'one terminal event is not double-counted through hardErrors')
assert.equal(guardReport.versions.after.qualityAllRecorded.guards.gamesWithAny, 1)
assert.equal(guardReport.versions.after.qualityAllRecorded.terminalFailures[0].failure.code, 'POINT_SIMULATION_LIMIT')
assert.equal(guardReport.qualityChanges.allRecorded.guards.countDelta, 1)
console.log('PASS pairing, weighted estimand, sides A/B, CI gates, missing exposure, guards, queue/roster/identity mismatch and duplicates')

const weatherJobs = [1,2,3].flatMap(seed => ['calm', 'cross14'].flatMap(weather =>
  pair(seed, 'configured', 'weather-matrix', 'matrix').map(job => ({ ...job, factor: 'horizontal_stack|person',
    id: `${job.id}-${weather}`, block: `${job.block}-${weather}`, contrast: `${job.contrast}-${weather}`,
    weather, wind: { speedMph: weather === 'calm' ? 0 : 14, directionDeg: weather === 'calm' ? 0 : 90 },
  }))))
const writeWeatherResults = (root, queueJobs, omit = () => false) => {
  for (const phase of ['before', 'after']) for (const job of queueJobs) {
    if (omit(phase, job)) continue
    const raw = result(job, phase), seed = job.round + 1
    const a = raw.sides[job.swap ? 'away' : 'home'], b = raw.sides[job.swap ? 'home' : 'away']
    a.throws = b.throws = 100
    // Seed-level performance and version effects are deliberately large. Their
    // common components must cancel BEFORE averaging the wind-minus-calm effect.
    const common = 25 + seed * 10 + (job.swap ? 5 : 0) + (phase === 'after' ? seed * 10 : 0)
    const windy = job.weather !== 'calm'
    a.completions = common + (windy ? -seed * (phase === 'before' ? 4 : 2) : 0)
    b.completions = common + (windy ? seed * (phase === 'before' ? 2 : 1) : 0)
    json(path.join(root, phase, 'jobs', job.id + '.json'), raw)
  }
}
const weatherClean = path.join(output, 'weather-clean')
initialize(weatherClean, weatherJobs.map(job => ({ jobs: [job] }))); writeWeatherResults(weatherClean, weatherJobs)
const weather = buildComparison(weatherClean).weatherEffects, windCell = weather.cells[0]
assert.equal(weather.scope, 'matrix'); assert.equal(weather.plannedComparisons, 3); assert.equal(weather.matchedComparisons, 3)
assert.deepEqual(weather.unmatched, [])
assert.equal(windCell.matchedPairs, 3); assert.equal(windCell.homeAwayPairsPerVersion, 6); assert.equal(windCell.gamesPerVersion, 12)
assert.equal(windCell.baselineWeather, 'calm'); assert.equal(windCell.a.metrics.completionPct.before.mean, -8)
assert.equal(windCell.a.metrics.completionPct.after.mean, -4); assert.equal(windCell.a.metrics.completionPct.delta.mean, 4)
assert.equal(windCell.b.metrics.completionPct.delta.mean, -2, 'both roster identities get independently paired effects')
assert.equal(windCell.a.metrics.completionPct.pairedBlocks, 3)
assert.ok(windCell.a.metrics.completionPct.delta.ci95)
assert.equal(windCell.evidence[0].windJobs.length, 2); assert.equal(windCell.evidence[0].calmJobs.length, 2)
// Save the exact comparator schema for the independently owned renderer QA.
writeComparison(weatherClean, path.join(weatherClean, 'comparison'))

const weatherMissing = path.join(output, 'weather-missing-calm')
initialize(weatherMissing, weatherJobs.map(job => ({ jobs: [job] })))
writeWeatherResults(weatherMissing, weatherJobs, (phase, job) => phase === 'after' && job.weather === 'calm' && job.seed === 3 && job.swap)
const missingWeather = buildComparison(weatherMissing).weatherEffects
assert.equal(missingWeather.matchedComparisons, 2)
assert.equal(missingWeather.cells[0].plannedComparisons, 3)
assert.equal(missingWeather.cells[0].a.metrics.completionPct.before.mean, -6)
assert.equal(missingWeather.cells[0].a.metrics.completionPct.after.mean, -3)
assert.equal(missingWeather.cells[0].a.metrics.completionPct.delta.mean, 3, 'same two seeds in BOTH version effects; no difference of unmatched cell means')
assert.equal(missingWeather.cells[0].a.metrics.completionPct.delta.ci95, null)
assert.ok(missingWeather.unmatched[0].unavailable.calm.some(reason => reason.startsWith('after:missing:')))

for (const mismatch of ['seed', 'tactics', 'kickoff', 'roster']) {
  const root = path.join(output, `weather-wrong-${mismatch}`), altered = structuredClone(weatherJobs)
  for (const job of altered.filter(j => j.weather !== 'calm' && j.seed === 3)) {
    if (mismatch === 'seed') job.seed = 999
    if (mismatch === 'tactics') job.homeConfig.instructions = ['take_risks']
    if (mismatch === 'kickoff') job.firstOffense = 'b'
    if (mismatch === 'roster') job.home = 'other-roster-a'
  }
  initialize(root, altered.map(job => ({ jobs: [job] }))); writeWeatherResults(root, altered)
  const compared = buildComparison(root)
  assert.equal(compared.matchedPairs, 6, 'all weather and calm blocks individually remain valid in both versions')
  assert.equal(compared.weatherEffects.matchedComparisons, 2, `${mismatch} mismatch forbids the weather contrast`)
  assert.ok(compared.weatherEffects.unmatched.some(row => row.reason === 'no-exact-calm-counterpart'))
  assert.ok(compared.weatherEffects.cells.every(c => c.a.metrics.completionPct.delta.ci95 === null))
}
console.log('PASS paired wind-minus-calm cancellation, missing calm, seed/tactics/kickoff/roster identity and exploratory CI gates')

// Parity against the existing report on a SMALL independent copy of real data.
const source = path.resolve('artifacts/engine-audit/tactics-balance-2026-10-03-validation')
let copiedGames = 0
let instrumentationProof = null
let realInputProof = null
if (fs.existsSync(path.join(source, 'queue.json'))) {
  const sourceJobs = read(path.join(source, 'queue.json')).flatMap(g => g.jobs)
  const candidateBlocks = new Map()
  for (const job of sourceJobs) { const group = candidateBlocks.get(job.block) ?? []; group.push(job); candidateBlocks.set(job.block, group) }
  const selected = []
  for (const pairJobs of candidateBlocks.values()) {
    if (pairJobs.length !== 2) continue
    let valid = true
    for (const job of pairJobs) {
      const file = path.join(source, 'before/jobs', job.id + '.json')
      if (!fs.existsSync(file)) { valid = false; break }
      const raw = read(file)
      if (raw.status !== 'complete' || raw.hardErrors?.length) { valid = false; break }
    }
    if (valid) selected.push(...pairJobs)
    if (selected.length === 6) break
  }
  assert.equal(selected.length, 6, 'six real full matches must be available for parity')
  const parity = path.join(output, 'real-parity')
  initialize(parity, selected.map(job => ({ jobs: [job] })), read(path.join(source, 'rosters.json')))
  for (const phase of ['before', 'after']) for (const job of selected) fs.copyFileSync(
    path.join(source, 'before/jobs', job.id + '.json'), path.join(parity, phase, 'jobs', job.id + '.json'))
  writeReport(path.join(parity, 'before'))
  const old = read(path.join(parity, 'before/summary.json')), compared = buildComparison(parity)
  for (const metric of PRIMARY_METRICS) {
    assert.equal(compared.overall.a.metrics[metric].before.mean, old.overall.metrics[metric].mean, `${metric}: existing report mean parity`)
    assert.equal(compared.overall.a.metrics[metric].after.mean, old.overall.metrics[metric].mean)
    assert.equal(compared.overall.a.metrics[metric].delta.mean, old.overall.metrics[metric].mean == null ? null : 0)
  }
  assert.equal(compared.matchedPairs, 3)
  copiedGames = selected.length
  console.log(`PASS exact existing-report parity on ${copiedGames} copied real games; identical-version deltas zero`)
  const observerVariant = ['after', 'candidate-v2', 'candidate-v1'].find(v => fs.existsSync(path.join(source, v, 'instrumentation.mjs')))
  if (observerVariant) {
    for (const [phase, variant] of [['before', 'before'], ['after', observerVariant]]) {
      const observerFile = path.join(source, variant, 'instrumentation.mjs')
      assert.equal(hash(observerFile), read(path.join(source, variant, 'version.json')).instrumentationHash,
        'actual frozen observer matches its original declaration')
      writeInstrumentation(parity, phase, fs.readFileSync(observerFile))
    }
    const actualExtension = buildComparison(parity)
    assert.equal(actualExtension.instrumentation.status, 'COMPATIBLE_TERMINAL_FAILURE_EXTENSION')
    assert.equal(actualExtension.matchedPairs, 3)
    assert.deepEqual(actualExtension.overall, compared.overall, 'real observer extension leaves every complete-pair metric unchanged')
    instrumentationProof = { variant: observerVariant, status: actualExtension.instrumentation.status,
      beforeHash: actualExtension.instrumentation.evidence.before.actualHash,
      afterHash: actualExtension.instrumentation.evidence.after.actualHash }
    console.log('PASS exact frozen observer extension; all copied complete-pair metrics unchanged')
  }
  if (sourceJobs.every(job => fs.existsSync(path.join(source, 'before/jobs', job.id + '.json')))) {
    // Reproduce the actual preparer's pretty-printed queue and compact manifest
    // hash, with ALL before results and an empty after. Retain only compact
    // counters from one raw file at a time; no checkpoint trees are copied.
    const actualInputs = path.join(output, 'real-inputs-before-complete')
    fs.mkdirSync(actualInputs, { recursive: true })
    for (const name of ['queue.json', 'rosters.json', 'manifest.json']) fs.copyFileSync(path.join(source, name), path.join(actualInputs, name))
    for (const phase of ['before', 'after']) {
      fs.mkdirSync(path.join(actualInputs, phase, 'jobs'), { recursive: true })
      for (const name of ['queue.json', 'rosters.json']) fs.copyFileSync(path.join(source, name), path.join(actualInputs, phase, name))
      for (const name of ['version.json', 'instrumentation.mjs']) fs.copyFileSync(
        path.join(source, phase === 'before' ? 'before' : observerVariant ?? 'before', name), path.join(actualInputs, phase, name))
    }
    for (const job of sourceJobs) {
      const raw = read(path.join(source, 'before/jobs', job.id + '.json'))
      json(path.join(actualInputs, 'before/jobs', job.id + '.json'), {
        job: raw.job, status: raw.status, identity: raw.identity, score: raw.score,
        matchStatus: raw.matchStatus, measurement: raw.measurement, sides: raw.sides,
        hardErrors: raw.hardErrors, warnings: raw.warnings, error: raw.error, failure: raw.failure,
        pointOutcomes: raw.pointOutcomes?.map(p => ({ possessions: p?.possessions })),
      })
    }
    const actual = buildComparison(actualInputs)
    assert.deepEqual(actual.globalIssues, [], 'actual producer manifest accepts the compact-JSON queue hash')
    assert.deepEqual(actual.versions.before.issues, [])
    assert.deepEqual(actual.versions.after.issues, [])
    assert.equal(actual.versions.before.uniquePlannedResults, sourceJobs.length)
    assert.equal(actual.versions.before.missingJobIds.length, 0)
    assert.equal(actual.versions.after.uniquePlannedResults, 0)
    assert.equal(actual.versions.after.missingJobIds.length, sourceJobs.length)
    assert.equal(actual.matchedPairs, 0, 'empty after must not manufacture a sport sample')
    assert.ok(actual.versions.before.validCompleteGames > 0, 'correct before records remain valid without an after sample')
    const plannedWindComparisons = sourceJobs.filter(j => j.cohort === 'matrix' && j.weather !== 'calm' && j.swap === false).length
    assert.equal(actual.weatherEffects.plannedComparisons, plannedWindComparisons)
    assert.equal(actual.weatherEffects.matchedComparisons, 0)
    assert.equal(actual.weatherEffects.unmatched.length, plannedWindComparisons, 'all unavailable wind/calm contrasts stay explicit')
    realInputProof = { plannedGames: sourceJobs.length, beforeRecorded: actual.versions.before.uniquePlannedResults,
      afterRecorded: actual.versions.after.uniquePlannedResults, globalIssues: actual.globalIssues,
      weatherEffects: { contexts: actual.weatherEffects.cells.length, plannedComparisons: plannedWindComparisons,
        matchedComparisons: actual.weatherEffects.matchedComparisons, unmatched: actual.weatherEffects.unmatched.length },
      queueFileHash: actual.rootHashes.queue, queueCompactJsonHash: actual.rootHashes.queueCompactJson,
      manifestQueueHash: read(path.join(actualInputs, 'manifest.json')).queueHash }
    json(path.join(actualInputs, 'proof.json'), realInputProof)
    console.log(`PASS actual producer input: before ${sourceJobs.length}, after empty, no global issues, zero paired sport sample`)
  }
}
json(path.join(output, 'QA.json'), { passed: true, copiedGames, instrumentationProof, realInputProof, peakRssMiB: process.resourceUsage().maxRSS / 1024 })
console.log(JSON.stringify({ output, copiedGames, peakRssMiB: process.resourceUsage().maxRSS / 1024 }))
