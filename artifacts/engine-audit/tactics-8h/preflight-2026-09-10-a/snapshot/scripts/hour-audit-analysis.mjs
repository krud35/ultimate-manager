// Read-only analysis of frozen audit observations. Does not run the engine.
import fs from 'node:fs'
import path from 'node:path'
const out = path.resolve(process.argv[2])
const read = file => JSON.parse(fs.readFileSync(path.join(out, file)))
const manifest = read('manifest.json')
const jobs = fs.readdirSync(path.join(out, 'jobs')).filter(f => f.endsWith('.json')).flatMap(file => {
  try { return [read(`jobs/${file}`)] } catch { return [] }
})
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const pct = (a, b) => b ? a / b * 100 : null
const f = n => n == null ? '—' : Number(n).toFixed(2)
const full = jobs.filter(j => j.job.phase === 'reference' && j.status === 'complete')
function aggregate(rows) {
  const keys = ['attempts', 'completions', 'resetAttempts', 'resetCompletions', 'hucks', 'stalls', 'turnovers', 'holds', 'cleanHolds', 'goals', 'resetChainAlarms']
  const a = Object.fromEntries(keys.map(key => [key, rows.reduce((s, r) => s + (r.stats?.[key] ?? 0), 0)]))
  const pointCounts = rows.reduce((n, r) => n + (r.points ?? 0), 0)
  return { matches: rows.length, points: pointCounts, ...a, completion: pct(a.completions, a.attempts), resetCompletion: pct(a.resetCompletions, a.resetAttempts),
    resetShare: pct(a.resetAttempts, a.attempts), huckShare: pct(a.hucks, a.attempts), turnsPerPoint: pointCounts ? a.turnovers / pointCounts : null,
    holdShare: pct(a.holds, a.goals), cleanHoldShare: pct(a.cleanHolds, a.goals) }
}
const groups = [0, 1, 2].map(group => ({ group, ...aggregate(full.filter(r => r.job.group === group)) }))
const weather = [0, 7, 14].map(speed => ({ initialWindMph: speed, ...aggregate(full.filter(r => r.job.wind?.speedMph === speed)) }))
const fastPairs = jobs.filter(r => r.job.phase === 'fast' && r.status === 'complete').flatMap(r => {
  const ref = full.find(x => x.job.id === r.job.referenceId)
  if (!ref) return []
  const a = aggregate([r]), b = aggregate([ref])
  return [{ id: r.job.id, referenceId: ref.job.id, seed: r.job.seed,
    completionDeltaPp: a.completion - b.completion, resetCompletionDeltaPp: a.resetCompletion != null && b.resetCompletion != null ? a.resetCompletion - b.resetCompletion : null,
    turnsPerPointDelta: a.turnsPerPoint - b.turnsPerPoint, full: b, fast: a }]
})
const fastComparison = { pairs: fastPairs.length, note: 'Same roster/configuration seeds; trajectories and draws diverge across engines. Not event-level parity.',
  meanCompletionDeltaPp: mean(fastPairs.map(r => r.completionDeltaPp)), meanResetDeltaPp: mean(fastPairs.map(r => r.resetCompletionDeltaPp).filter(x => x != null)), rows: fastPairs }
const setups = jobs.filter(j => j.job.phase === 'situations').flatMap(j => j.rows ?? [])
const scenes = [...new Set(setups.map(r => r.case))].map(c => {
  const r = setups.filter(x => x.case === c), thrown = r.filter(x => x.selected), resolved = r.filter(x => x.success != null)
  return { case: c, n: r.length, selected: thrown.length, resolved: resolved.length, caught: resolved.filter(x => x.success).length,
    completionGivenResolvedThrow: pct(resolved.filter(x => x.success).length, resolved.length),
    selectedRate: pct(thrown.length, r.length), meanHoldMs: mean(thrown.map(x => x.holdMs).filter(Number.isFinite)),
    types: Object.fromEntries([...new Set(thrown.map(x => x.throwType))].map(t => [t, thrown.filter(x => x.throwType === t).length])) }
})
const effects = jobs.filter(j => j.job.phase === 'effects').flatMap(j => (j.rows ?? []).map(row => ({ ...row, jobId: j.job.id })))
const axis = v => v.category ? `${v.category}.${v.key}` : v.trait ?? v.state ?? v.instruction
const level = v => v.delta ?? v.value
function effectMetrics(row) {
  const m = row.metrics
  return { selected: +row.selected, catchPerOpportunity: +(row.success === true), holdMs: row.holdMs ?? null,
    movingMeters: m.movingMeters, maxSpeed: m.maxSpeed, targetReversals: m.targetReversals,
    meanWidth: m.shapeN ? m.widthSum / m.shapeN : null, meanDepth: m.shapeN ? m.depthSum / m.shapeN : null,
    poachPct: pct(m.poachSeconds, m.defenseSeconds), meanCushion: m.cushionN ? m.cushionSum / m.cushionN : null,
    layoutSeconds: m.layoutSeconds, stationaryPct: pct(m.stationaryOffSeconds, m.offenseSeconds) }
}
const effectSummary = [...new Set(effects.map(r => axis(r.variant)))].map(key => {
  const rows = effects.filter(r => axis(r.variant) === key)
  const levels = [...new Set(rows.map(r => level(r.variant)))].sort((a, b) => a - b)
  const low = rows.filter(r => level(r.variant) === levels[0]), high = rows.filter(r => level(r.variant) === levels.at(-1))
  const pairs = low.flatMap(a => { const b = high.find(b => b.seed === a.seed && b.case === a.case); return b ? [{ a: effectMetrics(a), b: effectMetrics(b), seed: a.seed, context: a.case }] : [] })
  const deltas = Object.fromEntries(Object.keys(pairs[0]?.a ?? {}).map(k => [k, mean(pairs.filter(p => typeof p.a[k] === 'number' && typeof p.b[k] === 'number').map(p => p.b[k] - p.a[k]))]))
  const unchanged = pairs.length && pairs.every(p => JSON.stringify(p.a) === JSON.stringify(p.b))
  return { axis: key, levels, rows: rows.length, pairedContexts: pairs.length, uniqueSeeds: new Set(pairs.map(p => p.seed)).size,
    contexts: [...new Set(pairs.map(p => p.context))], resolvedFlights: rows.filter(r => r.success != null).length,
    selectedThrows: rows.filter(r => r.selected).length, allMeasuredMetricsUnchanged: !!unchanged, highMinusLow: deltas,
    interpretation: 'Exploratory paired effect; no multiple-comparison significance claims. Catch per opportunity includes no-throw as zero; see selection separately.' }
})
const tactics = jobs.filter(j => j.job.phase === 'tactics' && j.status?.startsWith('complete'))
const tacticalMatrix = tactics.filter(j => j.job.cell).map(j => {
  const side = (s, which) => {
    const m = s.side?.[which] ?? {}
    return { attempts: m.attempts, completion: pct(m.completions, m.attempts), resetShare: pct(m.resetAttempts, m.attempts), huckShare: pct(m.hucks, m.attempts),
      meanWidth: m.shapeN ? m.widthSum / m.shapeN : null, meanDepth: m.shapeN ? m.depthSum / m.shapeN : null,
      poachPct: pct(m.poachSeconds, m.defenseSeconds), meanCushion: m.cushionN ? m.cushionSum / m.cushionN : null }
  }
  return { cell: j.job.cell, seed: j.job.seed, homeAttack: side(j.stats, 'home'), awayDefense: side(j.stats, 'away'),
    turnovers: j.stats.turnovers, note: 'Home starts with possession; one point can contain turnovers. Home attack and away defense exposed separately.' }
})
const samples = [], seen = new Set()
for (const job of jobs) for (const candidate of job.replayCandidates ?? []) {
  const replay = read(candidate.path), key = `${job.job.id}:${replay.pointIndex}:${replay.selectedAction}`
  if (seen.has(key)) continue; seen.add(key)
  const chosen = replay.clips[replay.selectedAction === 0 ? 0 : 1]
  const diagnosis = chosen?.resolution?.diagnosis
  samples.push({ jobId: job.job.id, seed: job.job.seed, point: replay.pointIndex, action: replay.selectedAction,
    path: candidate.path, category: candidate.category, outcome: replay.outcome, throwType: chosen?.throwType,
    holdMs: chosen?.throwMs, diagnosis: diagnosis ? { primary: diagnosis.primary, contributors: diagnosis.contributors,
      missM: diagnosis.missM, markerPressure: diagnosis.markerPressure, fatiguePenalty: diagnosis.fatiguePenalty,
      windPenalty: diagnosis.windPenalty, plannedLateness: diagnosis.plannedLateness, judgementLoss: diagnosis.judgementLoss,
      validationStatus: diagnosis.validationStatus, receiverObservation: diagnosis.receiverObservation,
      contacts: diagnosis.contacts, finalReads: diagnosis.receiverReads?.slice(-3) } : null })
}
const selectedResetLosses = samples.filter(s => s.outcome === 'throw_fail' && s.throwType === 'dump_swing')
const rowMechanics = jobs.flatMap(j => j.rows ?? []).reduce((a, r) => {
  a.nonfinite += r.metrics?.nonfinite ?? 0; a.displacementAlarms += r.metrics?.displacementAlarms ?? 0; return a
}, { nonfinite: 0, displacementAlarms: 0 })
const analysis = { generatedAt: new Date().toISOString(), runStatus: manifest.status, provisional: manifest.status !== 'FINISHED',
  groups, weather, fastComparison, scenes, effectSummary, tacticalMatrix, rowMechanics,
  selectedResetLosses, samples, caution: 'Replay samples are selected for stratified review/diagnostic severity; never use their loss-cause frequencies as population estimates.',
  sourceObservations: [
    { subject: 'form', file: 'src/models/playerForm.js', finding: 'Form is updated after matches; no direct form read found in matchEngine. Controlled state probe is expected to show no immediate action effect.' },
    { subject: 'role metadata', finding: 'Template players do not consistently store position/role. Manifest profile.handlers=0 is a missing-metadata artifact, not evidence of a roster with no handlers. Runtime roles are derived by lineup/subrole logic.' },
    { subject: 'controlled action exposure', finding: 'Two controlled contexts cannot expose every attribute equally; endurance needs sustained energy expenditure, hammer needs actual overhead throws, catch height needs aerial opportunities.' },
  ] }
fs.writeFileSync(path.join(out, 'analysis.json'), JSON.stringify(analysis, null, 2))
const md = `# Analiza obserwacji audytu\n\n${analysis.provisional ? '**WYNIKI WSTĘPNE — audyt trwa.**' : 'Analiza zamkniętej próby.'} Aktualizacja: ${analysis.generatedAt}.\n\n## Zestawienia składów\n\n| Grupa | Mecze | Podania | Completion | Resety | Reset completion | Straty / punkt |\n|---|---:|---:|---:|---:|---:|---:|\n${groups.map(g => `| ${g.group} | ${g.matches} | ${g.attempts} | ${f(g.completion)}% | ${g.resetAttempts} | ${f(g.resetCompletion)}% | ${f(g.turnsPerPoint)} |`).join('\n')}\n\nGrupy: 0 — mocne/zrównane, 1 — środek/zrównane, 2 — mocniejsze/słabsze według zamrożonych profili umiejętności. Ocena siły jest przybliżona; nie jest rzeczywistym rankingiem klubów.\n\n## Pogoda początkowa\n\n| Wiatr | Mecze | Completion | Reset completion |\n|---|---:|---:|---:|\n${weather.map(g => `| ${g.initialWindMph} mph | ${g.matches} | ${f(g.completion)}% | ${f(g.resetCompletion)}% |`).join('\n')}\n\nTo podział obserwacyjny. Składy i taktyki nie są identyczne pomiędzy grupami wiatru; wiatr może dryfować w meczu.\n\n## Wpływ cech — różnica wysoki minus niski poziom\n\n| Oś | Pary kontekst/seed | Złapanie na okazję (pp) | Czas do rzutu (ms) | Prędkość maks. (m/s) | Wszystkie mierzone efekty zerowe |\n|---|---:|---:|---:|---:|---|\n${effectSummary.map(e => `| ${e.axis} | ${e.pairedContexts} | ${f((e.highMinusLow.catchPerOpportunity ?? 0) * 100)} | ${f(e.highMinusLow.holdMs)} | ${f(e.highMinusLow.maxSpeed)} | ${e.allMeasuredMetricsUnchanged ? 'tak' : 'nie'} |`).join('\n')}\n\nPróby są eksploracyjne. Brak efektu nie potwierdza martwego atrybutu bez odpowiedniej ekspozycji. Prędkość maksymalna jest maksimum wszystkich agentów w akcji, więc sam ten licznik może nie wykryć zmiany szybkości badanego zawodnika. Złapanie na okazję uwzględnia brak rzutu jako zero; selection rate jest osobno w analysis.json.\n\n## Fast względem pełnego silnika\n\nSparowane konfiguracje: ${fastPairs.length}. Średnia różnica completion: ${f(fastComparison.meanCompletionDeltaPp)} pp, resetów: ${f(fastComparison.meanResetDeltaPp)} pp. To porównanie rozkładów, nie identycznych zdarzeń.\n\n## Przykłady strat resetów\n\n${selectedResetLosses.slice(0, 20).map(r => `- ${r.jobId}, punkt ${r.point}, akcja ${r.action}, seed ${r.seed}: ${r.diagnosis?.primary ?? 'brak diagnozy'}, miss ${f(r.diagnosis?.missM)} m, presja marka ${f(r.diagnosis?.markerPressure)}, spóźnienie planu ${f(r.diagnosis?.plannedLateness)}. Ślad: ${r.path}.`).join('\n') || 'Brak takich strat w zapisanej próbce powtórek.'}\n\nTo selekcja przykładów, nie reprezentatywny rozkład przyczyn strat. Same etykiety aim_error/fatigue/pressure są współczynnikami diagnostycznymi, nie eksperymentalnie potwierdzoną przyczyną.\n\n## Ograniczenia interpretacji\n\n- Forma nie ma znalezionego bezpośredniego odczytu w mechanice akcji; jest aktualizowana po meczu. Zerowy efekt w krótkiej próbie nie oznacza awarii sondy.\n- Pole handlers=0 w profilu rosterów oznacza brak stałej metadanej pozycji, a nie brak zawodników potrafiących grać jako handler.\n- Część atrybutów wymaga innych ekspozycji niż dwa krótkie konteksty; pełny test ich wpływu pozostaje do uzupełnienia.\n- Niezależne sprawdzenie sensowności decyzji wymaga obejrzenia powtórek i ewentualnych gałęzi alternatywnych. Wynik własnej funkcji AI nie jest wyrocznią.\n`
fs.writeFileSync(path.join(out, 'ANALYSIS.md'), md)
console.log(JSON.stringify({ provisional: analysis.provisional, matches: full.length, effects: effectSummary.length,
  samples: samples.length, resetLossSamples: selectedResetLosses.length, fastPairs: fastPairs.length }))
