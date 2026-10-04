import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const COUNT_KEYS = [
  'throws', 'completions', 'distanceM', 'hucks', 'huckCompletions', 'resets', 'resetCompletions', 'breakAttempts', 'breakCompletions',
  'goals', 'holds', 'breaks', 'holdOpportunities', 'breakOpportunities', 'turnovers', 'stalls',
  'blocks', 'drops', 'holdMs', 'holdN', 'possessions', 'cleanHolds',
]
const PRIMARY_METRICS = ['conversionPct', 'holdPct', 'breakPct', 'margin', 'completionPct',
  'huckPct', 'huckCompletionPct', 'breakPassPct', 'breakPassCompletionPct', 'resetPct', 'resetCompletionPct', 'turnoversPer100Possessions', 'meanHoldMs',
  'meanThrowDistanceM', 'widthM', 'depthM', 'cushionM', 'stationaryOffPct', 'clearPct',
  'cutPct', 'poachPct', 'metersPerPlayerMinute', 'noSelectionPct', 'lateScanPct',
  'reachableResetScanPct', 'selectedResetScanPct', 'stalePerceptionPct',
  'opponentConversionPct', 'opponentCompletionPct', 'opponentHuckPct']
const finite = x => typeof x === 'number' && Number.isFinite(x)
const mean = xs => { const valid = xs.filter(finite); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null }
const pairMean = xs => xs.length === 2 && xs.every(finite) ? mean(xs) : null
const ratio = (a, b, multiplier = 100) => finite(a) && finite(b) && b > 0 ? multiplier * a / b : null
const key = x => JSON.stringify(x ?? null)
const groupBy = (rows, fn) => {
  const groups = new Map()
  for (const row of rows) { const k = fn(row); const values = groups.get(k) ?? []; values.push(row); groups.set(k, values) }
  return groups
}
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'))
function readReportResult(filename) {
  const raw = readJson(filename)
  // Release each match's large checkpoint/perception/replay trees immediately.
  // Only possession counts from point outcomes are used, as a legacy fallback.
  return {
    job: raw.job, status: raw.status, score: raw.score, sides: raw.sides, identity: raw.identity,
    pointOutcomes: Array.isArray(raw.pointOutcomes)
      ? raw.pointOutcomes.map(point => point == null ? point : { possessions: point.possessions })
      : raw.pointOutcomes,
    hardErrors: raw.hardErrors, warnings: raw.warnings, error: raw.error, timings: raw.timings,
  }
}
const sumCounts = (rows, keys = COUNT_KEYS) => Object.fromEntries(keys.map(k => {
  const values = rows.map(r => r?.[k]).filter(finite)
  return [k, values.length ? values.reduce((a, b) => a + b, 0) : null]
}))

function motionMetrics(m = {}) {
  return {
    widthM: ratio(m.widthMeterSeconds, m.shapeSeconds, 1),
    depthM: ratio(m.depthMeterSeconds, m.shapeSeconds, 1),
    cushionM: ratio(m.cushionMeterSeconds, m.cushionSeconds, 1),
    stationaryOffPct: ratio(m.stationaryOffSeconds, m.offenseSeconds),
    clearPct: ratio(m.clearSeconds, m.offenseSeconds),
    cutPct: ratio(m.cutSeconds, m.offenseSeconds),
    poachPct: ratio(m.poachSeconds, m.defenseSeconds),
    metersPerPlayerMinute: ratio(m.movingMeters, m.playerSeconds, 60),
  }
}

function decisionMetrics(d = {}) {
  return {
    noSelectionPct: ratio(d.noSelection, d.scans),
    lateScanPct: ratio(d.lateScans, d.scans),
    reachableResetScanPct: ratio(d.reachableResetScans, d.scans),
    selectedResetScanPct: ratio(d.selectedResetScans, d.scans),
    stalePerceptionPct: ratio(d.stalePlayers, d.perceivedPlayers),
  }
}

function measure(result, identity = 'a') {
  const side = ['home', 'away'].find(s => result.identity?.[s] === identity)
  if (!side) return null
  const opposite = side === 'home' ? 'away' : 'home'
  const raw = result.sides?.[side]
  const opponent = result.sides?.[opposite] ?? {}
  if (!raw) return null
  const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, finite(raw[k]) ? raw[k] : null]))
  if (!finite(counts.possessions)) {
    const values = (result.pointOutcomes ?? []).map(p => p.possessions?.[side]).filter(finite)
    if (values.length) counts.possessions = values.reduce((a, b) => a + b, 0)
  }
  const ownScore = result.score?.[side === 'home' ? 0 : 1]
  const otherScore = result.score?.[opposite === 'home' ? 0 : 1]
  const margin = finite(ownScore) && finite(otherScore) ? ownScore - otherScore : null
  return { side, identity, counts, motion: raw.motion ?? {}, decisions: raw.decisions ?? {}, roles: raw.roles ?? {}, metrics: {
    conversionPct: ratio(counts.goals, counts.possessions),
    holdPct: ratio(counts.holds, counts.holdOpportunities),
    breakPct: ratio(counts.breaks, counts.breakOpportunities),
    margin,
    completionPct: ratio(counts.completions, counts.throws),
    huckPct: ratio(counts.hucks, counts.throws),
    huckCompletionPct: ratio(counts.huckCompletions, counts.hucks),
    breakPassPct: ratio(counts.breakAttempts, counts.throws),
    breakPassCompletionPct: ratio(counts.breakCompletions, counts.breakAttempts),
    resetPct: ratio(counts.resets, counts.throws),
    resetCompletionPct: ratio(counts.resetCompletions, counts.resets),
    turnoversPer100Possessions: ratio(counts.turnovers, counts.possessions),
    meanHoldMs: ratio(counts.holdMs, counts.holdN, 1),
    meanThrowDistanceM: ratio(counts.distanceM, counts.throws, 1),
    opponentConversionPct: ratio(opponent.goals, opponent.possessions),
    opponentCompletionPct: ratio(opponent.completions, opponent.throws),
    opponentHuckPct: ratio(opponent.hucks, opponent.throws),
    ...motionMetrics(raw.motion), ...decisionMetrics(raw.decisions),
  } }
}

function seedOf(job) {
  // Missing seed is unknown replication, never a newly independent seed per job.
  return job.seed == null ? null : String(job.seed)
}

function random(seed = 1032026) {
  let state = seed >>> 0
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
}

function describe(values) {
  const observations = values.filter(v => finite(v.value))
  const seeded = observations.filter(v => v.seed != null)
  const clusters = [...groupBy(seeded, v => v.seed).values()].map(xs => xs.map(x => x.value))
  let ci95 = null
  if (clusters.length >= 3 && seeded.length === observations.length) {
    const rng = random(), bootstrap = []
    for (let i = 0; i < 2000; i++) {
      let sum = 0, count = 0
      for (let n = 0; n < clusters.length; n++) {
        const cluster = clusters[Math.floor(rng() * clusters.length)]
        sum += cluster.reduce((a, b) => a + b, 0); count += cluster.length
      }
      bootstrap.push(sum / count)
    }
    bootstrap.sort((a, b) => a - b)
    ci95 = [bootstrap[49], bootstrap[1949]]
  }
  return { mean: mean(observations.map(v => v.value)), blockCount: observations.length,
    independentSeeds: clusters.length, seedMean: mean(clusters.map(mean)), ci95,
    status: clusters.length < 3 || seeded.length !== observations.length ? 'DESCRIPTIVE_INSUFFICIENT_SEEDS' : 'EXPLORATORY_CLUSTER_BOOTSTRAP' }
}

function makeBlock(id, rows) {
  const job = rows[0].job
  const a = rows.map(r => measure(r, 'a')), b = rows.map(r => measure(r, 'b'))
  if (a.some(x => !x) || b.some(x => !x)) return null
  const roleIds = [...new Set(a.flatMap(x => Object.keys(x.roles)))]
  return { id, job, seed: seedOf(job), jobIds: rows.map(r => r.job.id),
    metrics: Object.fromEntries(PRIMARY_METRICS.map(k => [k, pairMean(a.map(x => x.metrics[k]))])),
    opponentMetrics: Object.fromEntries(PRIMARY_METRICS.map(k => [k, pairMean(b.map(x => x.metrics[k]))])),
    counts: sumCounts(a.map(x => x.counts)), opponentCounts: sumCounts(b.map(x => x.counts)),
    observedMotionGames: a.filter(x => (x.motion.playerSeconds ?? 0) > 0).length,
    observedDecisionGames: a.filter(x => (x.decisions.scans ?? 0) > 0).length,
    motionAlarms: sumCounts(a.map(x => x.motion), ['nonfinite', 'displacementAlarms', 'targetReversals']),
    roles: Object.fromEntries(roleIds.map(role => [role, {
      observedGames: a.filter(x => (x.roles[role]?.playerSeconds ?? 0) > 0).length,
      metrics: Object.fromEntries(Object.keys(motionMetrics()).map(k => [k, pairMean(a.map(x => motionMetrics(x.roles[role])[k]))])),
    }])),
  }
}

function summarize(blocks) {
  return { fullPairs: blocks.length, fullGames: blocks.length * 2,
    independentSeeds: new Set(blocks.map(b => b.seed).filter(x => x != null)).size,
    observedMotionGames: blocks.reduce((n, b) => n + b.observedMotionGames, 0),
    observedDecisionGames: blocks.reduce((n, b) => n + b.observedDecisionGames, 0),
    metrics: Object.fromEntries(PRIMARY_METRICS.map(k => [k, describe(blocks.map(b => ({ value: b.metrics[k], seed: b.seed })))])),
    opponentMetrics: Object.fromEntries(['conversionPct', 'holdPct', 'breakPct'].map(k => [k, describe(blocks.map(b => ({ value: b.opponentMetrics[k], seed: b.seed })))])),
    totals: sumCounts(blocks.map(b => b.counts)),
    motionAlarms: sumCounts(blocks.map(b => b.motionAlarms), ['nonfinite', 'displacementAlarms', 'targetReversals']),
    roles: Object.fromEntries([...new Set(blocks.flatMap(b => Object.keys(b.roles)))].map(role => [role,
      Object.fromEntries(Object.keys(motionMetrics()).map(k => [k, describe(blocks.filter(b => b.roles[role])
        .map(b => ({ value: b.roles[role].metrics[k], seed: b.seed })))]))])),
  }
}

function baselineLevel(blocks) {
  const explicit = blocks.find(b => b.job.baselineLevel != null)?.job.baselineLevel
  if (explicit != null) return key(explicit)
  const marked = blocks.find(b => b.job.baseline === true || b.job.isBaseline === true)
  if (marked) return key(marked.job.level)
  for (const level of ['neutral', 'baseline', 'default', 'none', 0, '0', 'auto']) {
    if (blocks.some(b => key(b.job.level) === key(level))) return key(level)
  }
  return null
}

function contrasts(blocks) {
  const matched = [], unmatched = []
  // Contrast ID is the experiment block. Style may itself be part of the treatment.
  const contextOf = b => key([b.job.contrast, b.job.seed ?? null, b.job.round ?? null,
    b.job.weather ?? b.job.wind ?? null,
    b.job.firstOffense ?? null, b.job.rosterFamily ?? b.job.family ?? null])
  for (const [context, contextBlocks] of groupBy(blocks.filter(b => b.job.contrast != null && b.job.cohort !== 'matrix'), contextOf)) {
    const byLevel = groupBy(contextBlocks, b => key(b.job.level)), baseline = baselineLevel(contextBlocks)
    if (baseline == null || byLevel.get(baseline)?.length !== 1) {
      unmatched.push({ context, reason: baseline == null ? 'missing-baseline' : 'duplicate-baseline', blockIds: contextBlocks.map(b => b.id) })
      continue
    }
    const base = byLevel.get(baseline)[0]
    for (const [level, treatments] of byLevel) {
      if (level === baseline) continue
      if (treatments.length !== 1) { unmatched.push({ context, level: JSON.parse(level), reason: 'duplicate-treatment' }); continue }
      const treatment = treatments[0]
      matched.push({ cohort: treatment.job.cohort, factor: treatment.job.factor ?? null,
        level: treatment.job.level, baselineLevel: base.job.level,
        weather: treatment.job.weather ?? treatment.job.wind ?? null,
        context: treatment.job.context ?? null, attack: treatment.job.attack ?? null,
        defense: treatment.job.defense ?? null, seed: treatment.seed,
        baselineAttack: base.job.attack ?? null, family: treatment.job.family ?? null,
        baseBlock: base.id, treatmentBlock: treatment.id,
        differences: Object.fromEntries(PRIMARY_METRICS.map(k => [k,
          finite(base.metrics[k]) && finite(treatment.metrics[k]) ? treatment.metrics[k] - base.metrics[k] : null])),
      })
    }
  }
  const rows = [...groupBy(matched, r => key([r.cohort, r.factor, r.level, r.baselineLevel, r.weather, r.context, r.attack, r.baselineAttack, r.defense, r.family]))]
    .map(([, pairs]) => {
      const { cohort, factor, level, baselineLevel: baseline, weather, context, attack, baselineAttack, defense, family } = pairs[0]
      return { cohort, factor, level, baselineLevel: baseline, weather, context, attack, baselineAttack, defense, family,
        matchedBlocks: pairs.length, independentSeeds: new Set(pairs.map(p => p.seed).filter(x => x != null)).size,
        effects: Object.fromEntries(PRIMARY_METRICS.map(k => [k, describe(pairs.map(p => ({ value: p.differences[k], seed: p.seed })))])),
        evidence: pairs.map(p => ({ seed: p.seed, baseline: p.baseBlock, treatment: p.treatmentBlock })),
        status: 'EXPLORATORY_NO_AUTOMATIC_BALANCE_CHANGE',
      }
    })
  return { rows, unmatched }
}

function plannedGroups(queue) {
  if (Array.isArray(queue)) return queue
  if (Array.isArray(queue?.groups)) return queue.groups
  if (Array.isArray(queue?.queue)) return queue.queue
  return []
}

function atomicWrite(filename, value) {
  const temporary = `${filename}.${process.pid}.tmp`
  fs.writeFileSync(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  fs.renameSync(temporary, filename)
}

const fmt = (x, digits = 2) => finite(x) ? x.toFixed(digits) : '—'
const label = x => String(typeof x === 'object' ? JSON.stringify(x) : x ?? '—').replaceAll('|', '/').replaceAll('\n', ' ')
const weatherLabel = w => typeof w === 'object' && w ? `${w.speedMph ?? '?'} mph / ${w.directionDeg ?? '?'}°` : label(w)

export function writeReport(outputDirectory) {
  const out = path.resolve(outputDirectory), manifestPath = path.join(out, 'manifest.json')
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {}
  const queuePath = path.join(out, 'queue.json'), queue = fs.existsSync(queuePath) ? readJson(queuePath) : []
  const groups = plannedGroups(queue), planned = groups.flatMap(g => g.jobs ?? [])
  const plannedIds = new Set(planned.map(j => j.id)), results = [], readErrors = []
  const jobsDirectory = path.join(out, 'jobs')
  if (fs.existsSync(jobsDirectory)) for (const filename of fs.readdirSync(jobsDirectory).filter(f => f.endsWith('.json')).sort()) {
    try {
      const r = readReportResult(path.join(jobsDirectory, filename))
      if (!r.job?.id) { readErrors.push({ file: filename, reason: 'missing-job-id' }); continue }
      results.push(r)
    } catch (error) { readErrors.push({ file: filename, reason: error.message }) }
  }
  const resultGroups = groupBy(results, r => r.job.id)
  const duplicatedResults = [...resultGroups].filter(([, rs]) => rs.length !== 1).map(([id]) => id)
  const duplicatedIds = new Set(duplicatedResults)
  const valid = r => r.status === 'complete' && !r.hardErrors?.length && !duplicatedIds.has(r.job.id)
    && ['home', 'away'].every(s => ['a', 'b'].includes(r.identity?.[s]) && r.sides?.[s])
    && r.identity.home !== r.identity.away && Array.isArray(r.score) && r.score.length === 2 && r.score.every(finite)
  const complete = results.filter(valid), blocks = [], incompleteBlocks = []
  const allBlocks = groupBy(results.filter(r => r.job.block != null), r => r.job.block)
  for (const [id, rs] of allBlocks) {
    const sameSeed = new Set(rs.map(r => key(r.job.seed))).size === 1
    const correctSwaps = rs.length === 2 && rs.some(r => r.job.swap === false) && rs.some(r => r.job.swap === true)
    const signature = job => key(['cohort', 'factor', 'level', 'contrast', 'attack', 'defense', 'weather', 'family', 'firstOffense'].map(k => job[k]))
    const sameContext = new Set(rs.map(r => signature(r.job))).size === 1
    const identitySwapped = rs.every(r => r.identity?.home === (r.job.swap ? 'b' : 'a'))
    if (correctSwaps && sameSeed && sameContext && identitySwapped && rs.every(valid)) {
      const block = makeBlock(id, rs)
      if (block) blocks.push(block)
      else incompleteBlocks.push({ id, reason: 'identity-or-side-missing', jobs: rs.map(r => r.job.id) })
    } else incompleteBlocks.push({ id, reason: !correctSwaps ? 'incomplete-or-duplicate-swaps' : !sameSeed ? 'seed-mismatch' : !sameContext ? 'context-mismatch' : !identitySwapped ? 'identity-swap-mismatch' : 'non-complete-or-invalid-match', jobs: rs.map(r => ({ id: r.job.id, status: r.status })) })
  }
  const pairJobIds = new Set(blocks.flatMap(b => b.jobIds)), recordedIds = new Set(results.map(r => r.job.id))
  const cohorts = [...new Set([...planned.map(j => j.cohort), ...results.map(r => r.job.cohort)].filter(Boolean))]
  const coverage = {
    generatedAt: new Date().toISOString(), plannedGroups: groups.length, plannedGames: planned.length,
    recordedGames: results.length, validCompleteGames: complete.length,
    completePairs: blocks.length, pairedGames: pairJobIds.size,
    missingJobIds: [...plannedIds].filter(id => !recordedIds.has(id)),
    unplannedJobIds: [...recordedIds].filter(id => !plannedIds.has(id)),
    completeWithoutPair: complete.filter(r => !pairJobIds.has(r.job.id)).map(r => r.job.id),
    duplicatePlannedIds: [...groupBy(planned, j => j.id)].filter(([, js]) => js.length > 1).map(([id]) => id),
    duplicatedResults, readErrors, incompleteBlocks,
    byStatus: Object.fromEntries([...groupBy(results, r => r.status ?? 'unknown')].map(([s, rs]) => [s, rs.length])),
    byCohort: Object.fromEntries(cohorts.map(cohort => [cohort, {
      plannedGames: planned.filter(j => j.cohort === cohort).length,
      recordedGames: results.filter(r => r.job.cohort === cohort).length,
      validCompleteGames: complete.filter(r => r.job.cohort === cohort).length,
      pairedGames: blocks.filter(b => b.job.cohort === cohort).length * 2,
      completePairs: blocks.filter(b => b.job.cohort === cohort).length,
      missingJobIds: planned.filter(j => j.cohort === cohort && !recordedIds.has(j.id)).map(j => j.id),
    }])),
  }
  const matrix = [...groupBy(blocks.filter(b => b.job.cohort === 'matrix'), b => key([b.job.attack, b.job.defense, b.job.weather ?? b.job.wind]))]
    .map(([, bs]) => ({ attack: bs[0].job.attack, defense: bs[0].job.defense,
      weather: bs[0].job.weather ?? bs[0].job.wind ?? null, ...summarize(bs) }))
  const settings = [...groupBy(blocks.filter(b => b.job.cohort !== 'matrix'), b => key([b.job.cohort, b.job.factor, b.job.level, b.job.weather ?? b.job.wind, b.job.attack, b.job.defense, b.job.family]))]
    .map(([, bs]) => ({ cohort: bs[0].job.cohort, factor: bs[0].job.factor, level: bs[0].job.level,
      weather: bs[0].job.weather ?? bs[0].job.wind ?? null, attack: bs[0].job.attack, defense: bs[0].job.defense, family: bs[0].job.family, ...summarize(bs) }))
  const contrastResults = contrasts(blocks)
  const failures = results.filter(r => !valid(r)).map(r => ({ id: r.job.id, cohort: r.job.cohort,
    status: r.status, hardErrors: r.hardErrors ?? [], error: r.error ?? null,
    invalidSchema: r.status === 'complete' && !r.hardErrors?.length ? true : undefined }))
  const warnings = results.filter(r => r.warnings?.length).map(r => ({ id: r.job.id, warnings: r.warnings }))
  const caveats = [
    'Analiza sportowa obejmuje wyłącznie ukończone pełne mecze w kompletnych parach zamiany stron. test_sample, censored, error oraz twarde błędy są wykluczone.',
    'Wskaźniki są średnimi najpierw z meczów rewanżowych, potem z bloków. Wskaźnik bloku wymaga pomiaru/mianownika w obu meczach. Rzuty i klatki nie są niezależnymi próbami.',
    'CI 95% pochodzi z bootstrapu całych seedów; przy mniej niż 3 seedach lub nieznanym seedzie nie jest podawany. Nawet 3 seedy nie gwarantują mocy wykrywania małych różnic.',
    'Statystyki dotyczą tożsamości A. W macierzy główny wynik to atak A przeciw obronie B; wynik meczu obejmuje również kontrolowany atak B przeciw obronie A.',
    'Efekty ustawień to treatment minus neutral w tym samym kontekście i seedzie. Porównania są eksploracyjne i nie uzasadniają automatycznej korekty balansu.',
    'Brak efektu, brak ekspozycji i brak pomiaru są różnymi sytuacjami. Metryki ruchu/decyzji bez obserwacji mają wartość null.',
    'Podrole są opisane ruchem. Jeśli brak danych o dotknięciach/ofertach per rola, raport nie wyprowadza z nich udziału w grze.',
    'Alarm przestrzenny jest sygnałem do obejrzenia śladu, nie samodzielnym dowodem błędu mechaniki.',
  ]
  const summary = { schema: 1, generatedAt: coverage.generatedAt, manifest: {
    status: manifest.status ?? null, startedAt: manifest.startedAt ?? null,
    deadline: manifest.deadline ?? manifest.deadlineUtc ?? manifest.deadlineAt ?? null,
    snapshot: manifest.snapshot ?? manifest.snapshotHash ?? null,
  }, coverage, overall: summarize(blocks), matrix, settings, contrasts: contrastResults,
  failures, warnings, caveats,
  estimand: 'Equal-weight completed pair means for focal identity a; uncertainty clustered by seed.',
  limitations: manifest.limitations ?? [],
  }
  const m = s => s.metrics
  const lines = ['# Nocny audyt balansu taktyk', '',
    `Stan biegu: ${label(manifest.status ?? 'nieznany')}. Raport utworzono ${coverage.generatedAt}.`,
    `Ukończone pełne mecze: **${complete.length}**; analiza obejmuje **${blocks.length} kompletnych par (${pairJobIds.size} meczów)**. Zaplanowano ${planned.length} meczów; brak plików dla ${coverage.missingJobIds.length}.`, '',
    '## Pokrycie', '', '| Moduł | Zaplanowane mecze | Zapisane | Ukończone pełne | Pełne pary |', '|---|---:|---:|---:|---:|',
    ...Object.entries(coverage.byCohort).map(([name, c]) => `| ${label(name)} | ${c.plannedGames} | ${c.recordedGames} | ${c.validCompleteGames} | ${c.completePairs} |`), '',
    `Statusy: ${Object.entries(coverage.byStatus).map(([s, n]) => `${s}: ${n}`).join(', ') || 'brak wyników'}. Pełne mecze bez kompletnej pary: ${coverage.completeWithoutPair.length}. Błędy odczytu: ${readErrors.length}.`, '',
    '## Macierz: atak A przeciw obronie B', '',
    'Wartości są średnimi pełnych par. Wynik meczu obejmuje obie fazy; skuteczność ataku A jest właściwym wskaźnikiem badanej komórki.', '',
    '| Atak | Obrona | Wiatr | Pary / seedy | Punkty/posiadania % | Hold % | Completion % | Huck % | Marża meczu |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
    ...matrix.map(s => `| ${label(s.attack)} | ${label(s.defense)} | ${weatherLabel(s.weather)} | ${s.fullPairs} / ${s.independentSeeds} | ${fmt(m(s).conversionPct.mean)} | ${fmt(m(s).holdPct.mean)} | ${fmt(m(s).completionPct.mean)} | ${fmt(m(s).huckPct.mean)} | ${fmt(m(s).margin.mean)} |`),
    ...(matrix.length ? [] : ['| Brak kompletnych par | — | — | 0 | — | — | — | — | — |']), '',
    '## Ustawienia: różnica względem neutralnego odniesienia', '',
    'Dodatnia różnica nie zawsze jest korzyścią: większy czas decyzji lub liczba strat mogą być kosztem. Szczegółowe konteksty, metryki ruchu i CI są w summary.json.', '',
    '| Moduł / czynnik | Poziom vs neutral | Wiatr / obrona B | Bloki / seedy | Δ pkt/posiadania A, pp | CI 95% | Δ pkt/posiadania B, pp | Δ huck A, pp | Δ czas decyzji A, ms |',
    '|---|---|---|---:|---:|---|---:|---:|---:|',
    ...contrastResults.rows.map(c => `| ${label(c.cohort)} / ${label(c.factor)} | ${label(c.level)} vs ${label(c.baselineLevel)} | ${weatherLabel(c.weather)} / ${label(c.defense)} | ${c.matchedBlocks} / ${c.independentSeeds} | ${fmt(c.effects.conversionPct.mean)} | ${c.effects.conversionPct.ci95?.map(v => fmt(v)).join(' … ') ?? 'brak'} | ${fmt(c.effects.opponentConversionPct.mean)} | ${fmt(c.effects.huckPct.mean)} | ${fmt(c.effects.meanHoldMs.mean, 0)} |`),
    ...(contrastResults.rows.length ? [] : ['| Brak dopasowanych kontrastów | — | — | 0 | — | brak | — | — | — |']), '',
    'Dla ustawień defensywnych A spadek skuteczności B jest oczekiwanym korzystnym kierunkiem; tabela obrony B opisuje przeciwnika ataku A, nie obronę badanej drużyny A.', '',
    '## Błędy i kolejność analizy', '',
    `Wykluczone wyniki: ${failures.length}; pliki z ostrzeżeniami: ${warnings.length}; niepełne/nieprawidłowe bloki: ${incompleteBlocks.length}; niedopasowane konteksty kontrolne: ${contrastResults.unmatched.length}.`, '',
    ...failures.slice(0, 15).map(f => `- ${label(f.id)}: ${label(f.status)}${f.hardErrors.length ? `; ${label(f.hardErrors.join('; '))}` : ''}${f.error ? `; ${label(f.error).slice(0, 220)}` : ''}.`),
    '- Najpierw sprawdzić twarde błędy i skuteczność interwencji, następnie obejrzeć ślady alarmów ruchu i decyzji.',
    '- Do zmian balansu wybierać powtarzalne mechanizmy ze zgodnymi efektami zachowania; słaby wynik pojedynczego seeda nie wystarcza.',
    '- Zmiany sprawdzić na tych samych seedach oraz oddzielnej serii nowych pełnych meczów. Ten raport sam nie wdraża poprawek.', '',
    '## Granice wnioskowania', '', ...caveats.map(c => `- ${c}`), '',
    'Dane: `summary.json` zawiera efekty, metryki i dowody parowania; `coverage.json` zawiera brakujące zadania i statusy. Surowe wyniki pozostają w `jobs/`.', '',
  ]
  atomicWrite(path.join(out, 'summary.json'), summary)
  atomicWrite(path.join(out, 'coverage.json'), coverage)
  atomicWrite(path.join(out, 'REPORT.md'), lines.join('\n'))
  return { report: path.join(out, 'REPORT.md'), completeGames: complete.length, completePairs: blocks.length,
    matrixCells: matrix.length, contrasts: contrastResults.rows.length, failures: failures.length }
}

// Pure helpers shared with paired before/after analysis; importing never writes a report.
export { PRIMARY_METRICS, motionMetrics, measure, makeBlock, describe }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/tactics-balance-report.mjs OUTDIR')
  console.log(JSON.stringify(writeReport(process.argv[2])))
}
