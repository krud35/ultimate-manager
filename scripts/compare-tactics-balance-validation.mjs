import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PRIMARY_METRICS, motionMetrics, makeBlock, describe } from './tactics-balance-report.mjs'

const finite = n => typeof n === 'number' && Number.isFinite(n)
const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null
const groupsOf = q => Array.isArray(q) ? q : q?.groups ?? q?.queue ?? []
const grouped = (rows, fn) => {
  const groups = new Map()
  for (const row of rows) { const key = fn(row), list = groups.get(key) ?? []; list.push(row); groups.set(key, list) }
  return groups
}
const countBy = (rows, fn) => Object.fromEntries([...grouped(rows, fn)].map(([key, values]) => [key, values.length]))
const contextKeys = ['cohort', 'factor', 'level', 'context', 'weather', 'wind', 'attack', 'defense', 'family', 'split',
  'homeConfig', 'awayConfig', 'rotate', 'lockWind', 'observe']
const contextOf = job => Object.fromEntries(contextKeys.map(k => [k, job[k] ?? null]))
const pairSignature = job => stable(Object.fromEntries(Object.entries(job).filter(([k]) => !['id', 'swap'].includes(k))))
const measurementSignature = m => stable(['version', 'fullEngine', 'fastMode', 'motionSampleMs', 'matchRuleOverride',
  'lineupPolicy', 'roleBasis'].map(k => m?.[k] ?? null))
const ratio = (a, b, scale = 100) => finite(a) && finite(b) && b > 0 ? scale * a / b : null
const subtract = (a, b) => finite(a) && finite(b) ? a - b : null

// Only one raw JSON is alive at a time. Never retain checkpoint, replay, scan,
// actual-player or per-frame trees. Sides contain aggregate counters only.
function readCompact(file) {
  const raw = read(file)
  return { job: raw.job, status: raw.status, identity: raw.identity, score: raw.score,
    matchStatus: raw.matchStatus, measurement: raw.measurement, sides: raw.sides,
    hardErrors: raw.hardErrors, warnings: raw.warnings, error: raw.error,
    failure: raw.failure ? Object.fromEntries(['code', 'pointIndex', 'throwCount', 'actionCount', 'limit', 'mode',
      'possessionTeam', 'discPosition', 'reason'].map(k => [k, raw.failure[k]])) : null,
    pointOutcomes: raw.pointOutcomes?.map(p => ({ possessions: p?.possessions })),
  }
}

function readVersion(root, phase, planned, rootHashes) {
  const directory = path.join(root, phase), issues = [], files = [], readErrors = []
  const queueFile = path.join(directory, 'queue.json'), rosterFile = path.join(directory, 'rosters.json')
  const queueHash = sha(queueFile), rosterHash = sha(rosterFile)
  if (!queueHash) issues.push('missing-version-queue')
  else if (queueHash !== rootHashes.queue) issues.push('version-queue-hash-mismatch')
  if (!rosterHash) issues.push('missing-version-rosters')
  else if (rosterHash !== rootHashes.rosters) issues.push('version-roster-hash-mismatch')
  const jobsDir = path.join(directory, 'jobs')
  if (fs.existsSync(jobsDir)) for (const filename of fs.readdirSync(jobsDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const compact = readCompact(path.join(jobsDir, filename))
      if (!compact.job?.id) { readErrors.push({ file: filename, reason: 'missing-job-id' }); continue }
      files.push(compact)
    } catch (error) { readErrors.push({ file: filename, reason: error.message }) }
  }
  const byId = grouped(files, r => r.job.id)
  const duplicateIds = [...byId].filter(([, rs]) => rs.length !== 1).map(([id]) => id)
  const unique = new Map([...byId].filter(([, rs]) => rs.length === 1).map(([id, rs]) => [id, rs[0]]))
  const invalid = new Map()
  for (const [id, r] of unique) {
    const expected = planned.get(id), reasons = []
    if (!expected) reasons.push('unplanned-job')
    else if (stable(r.job) !== stable(expected)) reasons.push('job-does-not-match-queue')
    if (r.status !== 'complete' || r.matchStatus !== 'finished') reasons.push('not-full-finished-match')
    if (!Array.isArray(r.hardErrors)) reasons.push('unknown-hard-error-status')
    else if (r.hardErrors.length) reasons.push('hard-errors')
    if (r.measurement?.fullEngine !== true || r.measurement?.fastMode !== false || r.measurement?.matchRuleOverride !== false
      || r.job.testPoints != null) reasons.push('not-regulation-full-engine')
    const identity = expected?.swap ? { home: 'b', away: 'a' } : { home: 'a', away: 'b' }
    if (!['home', 'away'].every(s => r.identity?.[s] === identity[s] && r.sides?.[s])) reasons.push('identity-or-side-mismatch')
    if (!Array.isArray(r.score) || r.score.length !== 2 || !r.score.every(finite)) reasons.push('invalid-score')
    if (reasons.length) invalid.set(id, reasons)
  }
  const versionFile = path.join(directory, 'version.json')
  let source = null
  if (fs.existsSync(versionFile)) {
    const version = read(versionFile)
    source = { phase: version.phase ?? phase, sourceRoot: version.sourceRoot ?? null,
      createdAt: version.createdAt ?? null, workerHash: version.workerHash ?? null,
      instrumentationHash: version.instrumentationHash ?? null,
      sourceHash: createHash('sha256').update(stable(version.sourceHashes ?? null)).digest('hex') }
  }
  return { phase, directory, issues, queueHash, rosterHash, source, files, byId, unique, invalid,
    coverage: { plannedGames: planned.size, recordedFiles: files.length, uniquePlannedResults: [...unique.keys()].filter(id => planned.has(id)).length,
      missingJobIds: [...planned.keys()].filter(id => !byId.has(id)), duplicateJobIds: duplicateIds,
      unplannedJobIds: [...byId.keys()].filter(id => !planned.has(id)), readErrors,
      byStatus: countBy(files, r => r.status ?? 'unknown'),
      invalidJobs: [...invalid].map(([id, reasons]) => ({ id, reasons })),
    } }
}

function instrumentationCompatibility(before, after) {
  const issues = [], sources = {}, evidence = {}
  for (const version of [before, after]) {
    const file = path.join(version.directory, 'instrumentation.mjs')
    const declaredHash = version.source?.instrumentationHash ?? null
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null
    const actualHash = bytes ? createHash('sha256').update(bytes).digest('hex') : null
    evidence[version.phase] = { file, declaredHash, actualHash }
    if (!declaredHash) issues.push(`${version.phase}:missing-instrumentation-hash`)
    if (!bytes) issues.push(`${version.phase}:missing-instrumentation-source`)
    else if (declaredHash && actualHash !== declaredHash) issues.push(`${version.phase}:instrumentation-source-hash-mismatch`)
    sources[version.phase] = bytes
  }
  if (issues.length) return { status: 'UNVERIFIED', issues, evidence }
  if (sources.before.equals(sources.after)) return { status: 'BYTE_IDENTICAL', issues, evidence }

  // The configured AFTER observer adds evidence for a point that terminates
  // without a fabricated goal. Accept exactly those three single edits, with
  // every other byte (including whitespace) unchanged. No general hash waiver.
  let expected = sources.before.toString('utf8')
  const edits = [
    ['end(events, score) {', 'end(events, score, failure = null) {'],
    ['const guard = scores.some', 'const guard = !!failure || scores.some'],
    ['const summary = { point, score, scores, guard,', 'const summary = { point, score, scores, guard, failure,'],
  ]
  const validUtf8 = Buffer.from(expected, 'utf8').equals(sources.before)
  let uniqueAnchors = true
  for (const [from, to] of edits) {
    if (expected.split(from).length !== 2) { uniqueAnchors = false; break }
    expected = expected.replace(from, to)
  }
  if (validUtf8 && uniqueAnchors && Buffer.from(expected, 'utf8').equals(sources.after)) {
    return { status: 'COMPATIBLE_TERMINAL_FAILURE_EXTENSION', issues, evidence,
      compatibility: 'Exactly three terminal-failure observer edits; full finished-match counters and all other source bytes unchanged.' }
  }
  return { status: 'INCOMPATIBLE', issues: ['instrumentation-hash-mismatch'], evidence }
}

function countExposure(rows, valueOf, exposureOf = null, scale = 1000) {
  const known = rows.map(r => ({ value: valueOf(r), exposure: exposureOf?.(r) })).filter(r => finite(r.value))
  const sum = known.length ? known.reduce((n, r) => n + r.value, 0) : null
  const exposed = exposureOf ? known.filter(r => finite(r.exposure) && r.exposure > 0) : []
  const exposure = exposed.length ? exposed.reduce((n, r) => n + r.exposure, 0) : null
  const exposedCount = exposed.length ? exposed.reduce((n, r) => n + r.value, 0) : null
  return { knownGames: known.length, unknownGames: rows.length - known.length, count: sum,
    gamesWithAny: known.length ? known.filter(r => r.value > 0).length : null,
    gamesWithAnyPct: ratio(known.filter(r => r.value > 0).length, known.length),
    exposureGames: exposed.length, exposure, rate: ratio(exposedCount, exposure, scale), rateScale: scale }
}

function quality(rows) {
  const hard = r => Array.isArray(r.hardErrors) ? r.hardErrors.length : null
  const guard = r => r.failure?.code === 'POINT_SIMULATION_LIMIT' ? 1 : Array.isArray(r.hardErrors)
    ? r.hardErrors.filter(e => /artificial score|action.?limit|throw.?limit|action\/throw limit/i.test(String(e))).length : null
  const sideOf = (r, identity) => {
    const expected = r.job.swap === false ? { home: 'a', away: 'b' }
      : r.job.swap === true ? { home: 'b', away: 'a' } : null
    return expected && ['home', 'away'].every(s => r.identity?.[s] === expected[s])
      ? ['home', 'away'].find(s => expected[s] === identity) : undefined
  }
  const side = (r, identity) => r.sides?.[sideOf(r, identity)]
  const motionValue = (r, identity, name) => {
    const m = side(r, identity)?.motion
    return m?.playerSeconds > 0 && finite(m[name]) ? m[name] : null
  }
  return { assessedUniqueResults: rows.length, statuses: countBy(rows, r => r.status ?? 'unknown'),
    hardErrors: countExposure(rows, hard), guards: countExposure(rows, guard),
    terminalFailures: rows.filter(r => r.failure).map(r => ({ id: r.job.id, status: r.status, failure: r.failure })),
    exceptions: rows.filter(r => r.error).map(r => ({ id: r.job.id, status: r.status, error: String(r.error).slice(0,600) })),
    failures: rows.filter(r => hard(r) > 0).map(r => ({ id: r.job.id, errors: r.hardErrors })),
    // Most engine guards do not identify the offending team. Do not invent side attribution.
    unattributedHardErrors: countExposure(rows, r => Array.isArray(r.hardErrors)
      ? r.hardErrors.filter(e => !/^(home|away):/.test(String(e))).length : null),
    sides: Object.fromEntries(['a', 'b'].map(identity => [identity, {
      identifiedGames: rows.filter(r => side(r, identity)).length,
      explicitlyAttributedHardErrors: countExposure(rows, r => {
        const s = sideOf(r, identity)
        return s && Array.isArray(r.hardErrors) ? r.hardErrors.filter(e => String(e).startsWith(`${s}:`)).length : null
      }),
      motion: Object.fromEntries(['nonfinite', 'displacementAlarms', 'targetReversals'].map(name => [name,
        countExposure(rows, r => motionValue(r, identity, name), r => side(r, identity)?.motion?.playerSeconds)])),
      resetChainAlarms: countExposure(rows, r => side(r, identity)?.possessions > 0 ? side(r, identity)?.resetChainAlarms : null,
        r => side(r, identity)?.possessions, 100),
    }])) }
}

function qualityChange(before, after) {
  const counter = (a, b) => ({ beforeKnownGames: a.knownGames, afterKnownGames: b.knownGames,
    countDelta: subtract(b.count, a.count), gamesWithAnyPctDelta: subtract(b.gamesWithAnyPct, a.gamesWithAnyPct),
    beforeExposure: a.exposure, afterExposure: b.exposure, rateDelta: subtract(b.rate, a.rate), rateScale: a.rateScale })
  return { hardErrors: counter(before.hardErrors, after.hardErrors), guards: counter(before.guards, after.guards),
    unattributedHardErrors: counter(before.unattributedHardErrors, after.unattributedHardErrors),
    sides: Object.fromEntries(['a', 'b'].map(identity => [identity, {
      explicitlyAttributedHardErrors: counter(before.sides[identity].explicitlyAttributedHardErrors, after.sides[identity].explicitlyAttributedHardErrors),
      resetChainAlarms: counter(before.sides[identity].resetChainAlarms, after.sides[identity].resetChainAlarms),
      motion: Object.fromEntries(Object.keys(before.sides[identity].motion).map(k => [k,
        counter(before.sides[identity].motion[k], after.sides[identity].motion[k])])),
    }])) }
}

function metricComparison(blocks, beforeOf, afterOf, allowCI) {
  // A metric requires exposure in both games AND versions. Never compare means
  // from different subsets just because one version lacks a measurement.
  const complete = blocks.map(b => ({ seed: b.seed, before: beforeOf(b), after: afterOf(b) }))
    .filter(b => finite(b.before) && finite(b.after))
  const summarize = get => {
    const result = describe(complete.map(b => ({ seed: b.seed, value: get(b) })))
    const { independentSeeds, ...rest } = result
    return { ...rest, distinctSeeds: independentSeeds,
      ...(!allowCI ? { ci95: null, status: 'DESCRIPTIVE_MIXED_CONTEXTS' } : {}) }
  }
  return { pairedBlocks: complete.length, missingBlocks: blocks.length - complete.length,
    before: summarize(b => b.before), after: summarize(b => b.after), delta: summarize(b => b.after - b.before) }
}

function summarize(blocks, allowCI = false) {
  const sideSummary = identity => {
    const roles = [...new Set(blocks.flatMap(b => ['before', 'after'].flatMap(v => Object.keys(b[v][identity].roles ?? {}))))].sort()
    return { metrics: Object.fromEntries(PRIMARY_METRICS.map(metric => [metric,
      metricComparison(blocks, b => b.before[identity].metrics[metric], b => b.after[identity].metrics[metric], allowCI)])),
    roles: Object.fromEntries(roles.map(role => [role, Object.fromEntries(Object.keys(motionMetrics()).map(metric => [metric,
      metricComparison(blocks, b => b.before[identity].roles?.[role]?.metrics[metric], b => b.after[identity].roles?.[role]?.metrics[metric], allowCI)]))])) }
  }
  return { matchedPairs: blocks.length, gamesPerVersion: blocks.length * 2,
    distinctSeeds: new Set(blocks.map(b => b.seed).filter(s => s != null)).size,
    distinctRosterPairs: new Set(blocks.map(b => stable([b.job.home, b.job.away]))).size,
    firstOffenseCounts: countBy(blocks, b => b.job.firstOffense ?? 'unknown'),
    a: sideSummary('a'), b: sideSummary('b') }
}

function pairedBlock(id, jobs, before, after, globalIssues) {
  const reasons = [...globalIssues], records = {}
  if (jobs.length !== 2 || jobs.filter(j => j.swap === false).length !== 1 || jobs.filter(j => j.swap === true).length !== 1) reasons.push('queue-not-one-home-away-pair')
  if (new Set(jobs.map(pairSignature)).size !== 1) reasons.push('queue-pair-context-mismatch')
  if (jobs.some(j => j.seed == null || !j.home || !j.away)) reasons.push('unknown-seed-or-rosters')
  for (const version of [before, after]) {
    for (const issue of version.issues) reasons.push(`${version.phase}:${issue}`)
    records[version.phase] = []
    for (const job of jobs) {
      const matches = version.byId.get(job.id)
      if (!matches) reasons.push(`${version.phase}:missing:${job.id}`)
      else if (matches.length !== 1) reasons.push(`${version.phase}:duplicate:${job.id}`)
      else {
        records[version.phase].push(matches[0])
        for (const reason of version.invalid.get(job.id) ?? []) reasons.push(`${version.phase}:${job.id}:${reason}`)
      }
    }
  }
  if (!reasons.length && new Set([...records.before, ...records.after].map(r => measurementSignature(r.measurement))).size !== 1) reasons.push('measurement-context-mismatch')
  if (reasons.length) return { excluded: { id, jobs: jobs.map(j => j.id), reasons } }
  const block = { id, job: jobs[0], seed: String(jobs[0].seed), jobIds: jobs.map(j => j.id),
    measurement: measurementSignature(records.before[0].measurement) }
  for (const phase of ['before', 'after']) {
    const rs = records[phase]
    block[phase] = { a: makeBlock(id, rs), b: makeBlock(id, rs.map(r => ({ ...r, identity: {
      home: r.identity.home === 'a' ? 'b' : 'a', away: r.identity.away === 'a' ? 'b' : 'a' } }))) }
    if (!block[phase].a || !block[phase].b) return { excluded: { id, jobs: block.jobIds, reasons: ['missing-side-measurements'] } }
  }
  return { block }
}

function treatmentEffects(blocks) {
  const effects = [], unmatched = []
  for (const [contrast, values] of grouped(blocks.filter(b => b.job.cohort !== 'matrix'), b => b.job.contrast)) {
    const baseline = values.find(b => b.job.baseline === true || b.job.isBaseline === true)
      ?? values.find(b => stable(b.job.level) === stable(b.job.baselineLevel ?? 'neutral'))
    if (!baseline) { unmatched.push({ contrast, reason: 'no-matched-neutral-pair', blocks: values.map(v => v.id) }); continue }
    for (const treatment of values.filter(b => b !== baseline)) {
      if (treatment.seed !== baseline.seed || stable([treatment.job.home, treatment.job.away, treatment.job.wind, treatment.job.firstOffense])
        !== stable([baseline.job.home, baseline.job.away, baseline.job.wind, baseline.job.firstOffense])) {
        unmatched.push({ contrast, block: treatment.id, reason: 'neutral-seed-roster-weather-kickoff-mismatch' }); continue
      }
      const effect = { id: treatment.id, job: treatment.job, seed: treatment.seed, baseline: baseline.id, baselineLevel: baseline.job.level }
      for (const phase of ['before', 'after']) effect[phase] = Object.fromEntries(['a', 'b'].map(identity => [identity, {
        metrics: Object.fromEntries(PRIMARY_METRICS.map(k => [k, subtract(treatment[phase][identity].metrics[k], baseline[phase][identity].metrics[k])])), roles: {},
      }]))
      effects.push(effect)
    }
  }
  return { cells: [...grouped(effects, e => stable([contextOf(e.job), e.baselineLevel]))].map(([, values]) => ({
    context: contextOf(values[0].job), baselineLevel: values[0].baselineLevel, ...summarize(values, true),
    evidence: values.map(v => ({ seed: v.seed, baseline: v.baseline, treatment: v.id })),
  })), unmatched }
}

function weatherEffects(blocks, plannedJobs, excluded) {
  // Matrix wind sentinels vary only weather. Other cohorts change instructions,
  // roles or career factors alongside their weather and are not this estimand.
  const planned = [...grouped(plannedJobs.filter(j => j.cohort === 'matrix'), j => j.block)]
    .map(([id, jobs]) => ({ id, job: jobs[0] }))
  const metadata = new Set(['id', 'block', 'contrast', 'swap', 'originalGroup', 'context', 'weather', 'wind'])
  const signature = job => stable(Object.fromEntries(Object.entries(job).filter(([k]) => !metadata.has(k))))
  const calmByContext = grouped(planned.filter(b => b.job.weather === 'calm' && b.job.wind?.speedMph === 0), b => signature(b.job))
  const winds = planned.filter(b => b.job.weather !== 'calm')
  const validById = new Map(blocks.map(b => [b.id, b])), excludedById = new Map(excluded.map(b => [b.id, b.reasons]))
  const effects = new Map(), unmatched = []
  for (const wind of winds) {
    const candidates = calmByContext.get(signature(wind.job)) ?? []
    const evidence = { windBlock: wind.id, calmBlock: candidates.length === 1 ? candidates[0].id : null,
      seed: wind.job.seed == null ? null : String(wind.job.seed), context: contextOf(wind.job) }
    if (!finite(wind.job.wind?.speedMph) || wind.job.wind.speedMph <= 0 || !finite(wind.job.wind?.directionDeg)) {
      unmatched.push({ ...evidence, reason: 'invalid-wind-context' }); continue
    }
    if (candidates.length !== 1) {
      unmatched.push({ ...evidence, reason: candidates.length ? 'ambiguous-calm-counterpart' : 'no-exact-calm-counterpart',
        candidateBlocks: candidates.map(c => c.id) }); continue
    }
    const windy = validById.get(wind.id), calm = validById.get(candidates[0].id)
    if (!windy || !calm) {
      unmatched.push({ ...evidence, reason: 'incomplete-or-invalid-weather-blocks', unavailable: {
        ...(!windy ? { wind: excludedById.get(wind.id) ?? ['no-complete-both-version-block'] } : {}),
        ...(!calm ? { calm: excludedById.get(candidates[0].id) ?? ['no-complete-both-version-block'] } : {}),
      } }); continue
    }
    if (windy.measurement !== calm.measurement) {
      unmatched.push({ ...evidence, reason: 'weather-measurement-context-mismatch' }); continue
    }
    const effect = { id: windy.id, job: windy.job, seed: windy.seed, baseline: calm.id,
      baselineWind: calm.job.wind, windJobs: windy.jobIds, calmJobs: calm.jobIds }
    for (const phase of ['before', 'after']) effect[phase] = Object.fromEntries(['a', 'b'].map(identity => [identity, {
      metrics: Object.fromEntries(PRIMARY_METRICS.map(k => [k, subtract(windy[phase][identity].metrics[k], calm[phase][identity].metrics[k])])), roles: {},
    }]))
    effects.set(effect.id, effect)
  }
  return { scope: 'matrix', plannedComparisons: winds.length, matchedComparisons: effects.size,
    cells: [...grouped(winds, w => stable(contextOf(w.job)))].map(([, plannedCell]) => {
      const values = plannedCell.map(w => effects.get(w.id)).filter(Boolean)
      const plannedCalm = calmByContext.get(signature(plannedCell[0].job)) ?? []
      return { context: contextOf(plannedCell[0].job), baselineWeather: 'calm',
        baselineWind: values[0]?.baselineWind ?? (plannedCalm.length === 1 ? plannedCalm[0].job.wind : null),
        plannedComparisons: plannedCell.length, matchedComparisons: values.length,
        unmatchedComparisons: plannedCell.length - values.length, ...summarize(values, true),
        homeAwayPairsPerVersion: values.length * 2, gamesPerVersion: values.length * 4,
        evidence: values.map(v => ({ seed: v.seed, windBlock: v.id, calmBlock: v.baseline,
          windJobs: v.windJobs, calmJobs: v.calmJobs, rosterA: v.job.home, rosterB: v.job.away, firstOffense: v.job.firstOffense })),
      }
    }), unmatched }
}

export function buildComparison(validationRoot) {
  const root = path.resolve(validationRoot), queueFile = path.join(root, 'queue.json'), rosterFile = path.join(root, 'rosters.json')
  const queueInput = read(queueFile), queue = groupsOf(queueInput), jobs = queue.flatMap(g => g.jobs ?? [])
  // The preparer/runner hashes compact JSON.stringify(parsedQueue) in the
  // manifest. Keep the raw hash separately for exact root/version file equality.
  const planned = new Map(jobs.map(j => [j.id, j])), rootHashes = { queue: sha(queueFile),
    queueCompactJson: createHash('sha256').update(JSON.stringify(queueInput)).digest('hex'), rosters: sha(rosterFile) }
  const manifestFile = path.join(root, 'manifest.json'), manifest = fs.existsSync(manifestFile) ? read(manifestFile) : {}
  const globalIssues = []
  if (planned.size !== jobs.length) globalIssues.push('duplicate-planned-job-ids')
  if (!rootHashes.rosters) globalIssues.push('missing-shared-rosters')
  if (manifest.queueHash && manifest.queueHash !== rootHashes.queueCompactJson) globalIssues.push('canonical-queue-hash-mismatch')
  if (manifest.rosterHash && manifest.rosterHash !== rootHashes.rosters) globalIssues.push('canonical-roster-hash-mismatch')
  const before = readVersion(root, 'before', planned, rootHashes), after = readVersion(root, 'after', planned, rootHashes)
  const instrumentation = instrumentationCompatibility(before, after)
  for (const issue of instrumentation.issues) {
    const version = [before, after].find(v => issue.startsWith(`${v.phase}:`))
    if (version) version.issues.push(issue.slice(version.phase.length + 1))
    else globalIssues.push(issue)
  }
  const blocks = [], excluded = []
  for (const [id, pair] of grouped(jobs, j => j.block)) {
    const result = pairedBlock(id, pair, before, after, globalIssues)
    if (result.block) blocks.push(result.block); else excluded.push(result.excluded)
  }
  const commonIds = new Set(blocks.flatMap(b => b.jobIds))
  const versions = Object.fromEntries([before, after].map(v => {
    const rows = [...v.unique].filter(([id]) => planned.has(id)).map(([, r]) => r)
    const valid = r => !globalIssues.length && !v.issues.length && !v.invalid.has(r.job.id)
    return [v.phase, { ...v.coverage, queueHash: v.queueHash, rosterHash: v.rosterHash, source: v.source, issues: v.issues,
      validCompleteGames: rows.filter(valid).length,
      validCompleteWithoutCommonPair: rows.filter(r => valid(r) && !commonIds.has(r.job.id)).map(r => r.job.id),
      qualityAllRecorded: quality(rows), qualityCommonPairs: quality(rows.filter(r => commonIds.has(r.job.id))),
      qualityByCohort: Object.fromEntries([...grouped(rows, r => planned.get(r.job.id)?.cohort ?? 'unknown')].map(([cohort, rs]) => [cohort, quality(rs)])),
    }]
  }))
  const cells = [...grouped(blocks, b => stable(contextOf(b.job)))].map(([, values]) => ({
    context: contextOf(values[0].job), ...summarize(values, true),
    evidence: values.map(b => ({ block: b.id, seed: b.seed, round: b.job.round, rosterA: b.job.home, rosterB: b.job.away, jobs: b.jobIds })),
  }))
  return { schema: 1, generatedAt: new Date().toISOString(), root, rootHashes, globalIssues, instrumentation,
    plannedGroups: queue.length, plannedGamesPerVersion: jobs.length, matchedPairs: blocks.length,
    matchedGamesPerVersion: commonIds.size, excludedBlocks: excluded, versions,
    qualityChanges: {
      allRecorded: qualityChange(versions.before.qualityAllRecorded, versions.after.qualityAllRecorded),
      commonPairs: qualityChange(versions.before.qualityCommonPairs, versions.after.qualityCommonPairs),
    },
    overall: summarize(blocks),
    byCohort: Object.fromEntries([...grouped(blocks, b => b.job.cohort)].map(([cohort, bs]) => [cohort, summarize(bs)])),
    cells, treatmentEffects: treatmentEffects(blocks), weatherEffects: weatherEffects(blocks, jobs, excluded),
    caveats: [
      'Sport: only complete regulation home/away pairs available and valid in BOTH versions, with exact canonical queue jobs and matching roster files.',
      'Manifest queueHash follows the producer: SHA-256 of JSON.stringify(parsed queue), preserving key order. Root/version queue files are additionally required to match byte-for-byte; rosterHash remains a raw-file hash.',
      'Instrumentation source bytes must match their declared hashes and be identical across versions, except the exact three-edit terminal-failure observer extension. Every unrelated source change blocks sport comparisons.',
      'Each metric is first the equal-weight mean of two games; before/after/delta use the SAME exposed pairs. Missing metric denominators remain null.',
      'CI uses the existing deterministic 2000-replicate whole-seed bootstrap within one context. Fewer than three seeds or unknown seeds gives null. Three seeds is exploratory.',
      'Different contexts reuse rosters and often seeds. Overall/cohort tables are descriptive with NO pooled CI; distinct seeds does not count independent player populations.',
      'A and B are roster identities, not home/away. A attack metrics describe attack A vs defense B; match margin includes the reverse phase. Defensive instructions on A should be assessed also through B attack.',
      'All-recorded quality includes partial/invalid games and excludes ambiguous duplicate results. Missing files, unreadable files, unobserved metrics and unknown hard-error status are explicit, never zero failures.',
      'All-recorded quality deltas are descriptive and can have different sample sizes/exposures; common-pair quality has the matched sport sample. Inconsistent identities make side attribution unknown.',
      'Unattributed hard errors/guards cannot be assigned to either team. Motion alarms are separately reported for A and B and are diagnostic signals, not automatic proof of a bug.',
      'Motion alarm rates use observed player-seconds; reset-chain rates use possessions. Exposures are denominators, not independent observations.',
      'Roles have aggregate motion only. No claim about role touches/optimal decisions without corresponding observations. Weather cells are controlled by queue wind; unreliable per-throw wind labels are not inferred.',
      'Treatment effects are treatment minus neutral within each version, then after minus before; no automatic balance changes or significance-based tuning.',
      'Weather effects pair matrix wind minus calm within the same seed, rosters, kickoff and every other job setting except weather/context/ID metadata. Both home/away blocks must be complete and valid in BOTH versions; each contrast uses four games per version. Missing or mismatched counterparts remain explicit.',
      'Wind-minus-calm CI is exploratory within one weather/tactics context, null below three seeds. Several winds can reuse the same calm block; neither those contrasts nor players within them are independent populations.',
      ...(manifest.limitations ?? []),
    ],
    resources: { retained: 'Aggregate result counters only; raw checkpoint/replay/frame trees released after each read.', peakRssMiB: process.resourceUsage().maxRSS / 1024 },
  }
}

const fmt = n => finite(n) ? n.toFixed(3) : '—'
const label = x => String(x ?? '—').replaceAll('|', '/').replaceAll('\n', ' ')
const triplet = m => `${fmt(m?.before?.mean)} → ${fmt(m?.after?.mean)} (${fmt(m?.delta?.mean)})`
function markdown(report) {
  const lines = ['# Porównanie pełnych meczów przed / po', '',
    `Utworzono: ${report.generatedAt}. Zaplanowano ${report.plannedGamesPerVersion} meczów na wersję. Wspólna próba: **${report.matchedPairs} pełnych par / ${report.matchedGamesPerVersion} meczów na wersję**.`, '',
    '## Pokrycie i jakość', '', '| Wersja | Zapisane pliki | Pełne poprawne | Brakujące | Duplikaty | Błędy odczytu | Mecze z hard error / znany status | Guard / znany status |',
    '|---|---:|---:|---:|---:|---:|---|---|']
  for (const [phase, v] of Object.entries(report.versions)) {
    const q = v.qualityAllRecorded
    lines.push(`| ${phase} | ${v.recordedFiles} | ${v.validCompleteGames} | ${v.missingJobIds.length} | ${v.duplicateJobIds.length} | ${v.readErrors.length} | ${q.hardErrors.gamesWithAny ?? '—'} / ${q.hardErrors.knownGames} | ${q.guards.gamesWithAny ?? '—'} / ${q.guards.knownGames} |`)
  }
  lines.push('', 'Alarms: licznik / liczba meczów z pomiarem; częstość na 1000 obserwowanych sekund-zawodnika.', '',
    '| Wersja / tożsamość | Displacement | /1000 s | Nonfinite | Zmiany celu |', '|---|---|---:|---|---|')
  for (const [phase, v] of Object.entries(report.versions)) for (const [identity, q] of Object.entries(v.qualityAllRecorded.sides)) {
    const m = q.motion
    lines.push(`| ${phase} / ${identity.toUpperCase()} | ${m.displacementAlarms.count ?? '—'} / ${m.displacementAlarms.knownGames} | ${fmt(m.displacementAlarms.rate)} | ${m.nonfinite.count ?? '—'} / ${m.nonfinite.knownGames} | ${m.targetReversals.count ?? '—'} / ${m.targetReversals.knownGames} |`)
  }
  lines.push('', '## Wyniki w tym samym kontekście', '',
    'W komórkach: przed → po (różnica). Wskaźniki procentowe mają różnicę w punktach procentowych. Wszystkie metryki, ekspozycje, role A/B, CI i dowody parowania są w comparison.json.', '',
    '| Moduł / czynnik / poziom | Atak A / obrona B / wiatr | Pary / seedy | A pkt/posiadania % | B pkt/posiadania % | A completion % | A marża |',
    '|---|---|---:|---|---|---|---|')
  for (const c of report.cells) lines.push(`| ${label(c.context.cohort)} / ${label(c.context.factor)} / ${label(c.context.level)} | ${label(c.context.attack)} / ${label(c.context.defense)} / ${label(c.context.weather)} | ${c.matchedPairs} / ${c.distinctSeeds} | ${triplet(c.a.metrics.conversionPct)} | ${triplet(c.b.metrics.conversionPct)} | ${triplet(c.a.metrics.completionPct)} | ${triplet(c.a.metrics.margin)} |`)
  if (!report.cells.length) lines.push('| Brak wspólnych pełnych par | — | 0 | — | — | — | — |')
  lines.push('', '## Ruch i decyzje', '', '| Moduł / czynnik / poziom | Pary | A cut % | A poach % | B poach % | A brak wyboru % | A reset scan % |', '|---|---:|---|---|---|---|---|')
  for (const c of report.cells) lines.push(`| ${label(c.context.cohort)} / ${label(c.context.factor)} / ${label(c.context.level)} | ${c.matchedPairs} | ${triplet(c.a.metrics.cutPct)} | ${triplet(c.a.metrics.poachPct)} | ${triplet(c.b.metrics.poachPct)} | ${triplet(c.a.metrics.noSelectionPct)} | ${triplet(c.a.metrics.selectedResetScanPct)} |`)
  lines.push('', '## Ograniczenia', '', ...report.caveats.map(c => `- ${c}`), '',
    `Problemy globalnego dopasowania: ${report.globalIssues.join(', ') || 'brak'}. Wykluczono ${report.excludedBlocks.length} bloków; szczegółowe przyczyny są w JSON.`, '')
  return lines.join('\n')
}

export function writeComparison(validationRoot, outputDirectory = path.join(validationRoot, 'comparison')) {
  const output = path.resolve(outputDirectory), root = path.resolve(validationRoot)
  if (['before', 'after'].some(phase => output === path.join(root, phase) || output.startsWith(path.join(root, phase) + path.sep))) {
    throw new Error('Comparison output must be outside immutable before/after version directories')
  }
  const report = buildComparison(root)
  fs.mkdirSync(output, { recursive: true })
  for (const [name, body] of [['comparison.json', JSON.stringify(report, null, 2)], ['COMPARISON.md', markdown(report)]]) {
    const target = path.join(output, name), temporary = `${target}.${process.pid}.tmp`
    fs.writeFileSync(temporary, body + '\n'); fs.renameSync(temporary, target)
  }
  return { output, matchedPairs: report.matchedPairs, matchedGamesPerVersion: report.matchedGamesPerVersion,
    beforeMissing: report.versions.before.missingJobIds.length, afterMissing: report.versions.after.missingJobIds.length,
    peakRssMiB: process.resourceUsage().maxRSS / 1024 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'artifacts/engine-audit/tactics-balance-2026-10-03-validation'
  console.log(JSON.stringify(writeComparison(root, process.argv[3])))
}
