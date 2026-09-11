import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { AI_COACH_ARCHETYPES } from '../src/matchEngine/aiCoachProfile.js'
import { createRng } from '../src/matchEngine/rng.js'
import { atomic } from './tactics-audit-support.mjs'

export function readResults(out, phase = null) {
  const results = []
  for (const f of fs.readdirSync(path.join(out, 'jobs'))) {
    if (!f.endsWith('.json') || (phase && !f.startsWith(`${phase}-`))) continue
    try {
      // Detailed traces and checkpoints remain on disk. Never retain the entire
      // multi-gigabyte corpus merely to select configurations or write a report.
      const r = JSON.parse(fs.readFileSync(path.join(out, 'jobs', f), 'utf8'))
      results.push({ job: r.job, status: r.status, stats: r.stats, pointOutcomes: r.pointOutcomes,
        hardErrors: r.hardErrors, error: r.error, replayCandidates: r.replayCandidates, timings: r.timings })
    } catch { results.push({ job: { id: f }, status: 'corrupt' }) }
  }
  return results
}
export function measure(r) {
  const side = r.job.swap ? 'away' : 'home', other = side === 'home' ? 'away' : 'home'
  const s = r.stats?.side?.[side] ?? {}, points = r.pointOutcomes ?? []
  const possessions = points.reduce((n, p) => n + p.possession[side], 0)
  const scores = points.filter(p => p.scorer === side).length
  const opponentScores = points.filter(p => p.scorer === other).length
  return { attempts: s.attempts ?? 0, completions: s.completions ?? 0, resetAttempts: s.resetAttempts ?? 0, resetCompletions: s.resetCompletions ?? 0,
    hucks: s.hucks ?? 0, holdMs: s.holdMs ?? 0, holdN: s.holdN ?? 0, widthSum: s.widthSum ?? 0, shapeN: s.shapeN ?? 0,
    possessions, scores, opponentScores, margin: scores - opponentScores, utility: possessions ? scores / possessions : null }
}
const ok = r => ['complete', 'complete_point_sample'].includes(r.status) && !(r.hardErrors?.length)
export function summarize(rows) {
  const good = rows.filter(ok), sum = {}
  for (const r of good) for (const [k, v] of Object.entries(measure(r))) if (k !== 'utility') sum[k] = (sum[k] ?? 0) + v
  const pct = (n, d) => d ? 100 * n / d : null
  return { jobs: rows.length, complete: good.length, failedOrCensored: rows.length - good.length, ...sum,
    conversionPct: pct(sum.scores, sum.possessions), completionPct: pct(sum.completions, sum.attempts),
    resetPct: pct(sum.resetCompletions, sum.resetAttempts), huckPct: pct(sum.hucks, sum.attempts),
    meanHoldMs: sum.holdN ? sum.holdMs / sum.holdN : null, meanWidthM: sum.shapeN ? sum.widthSum / sum.shapeN : null }
}
export function pairedBlocks(rows) {
  const map = new Map()
  for (const r of rows) if (r.job.block) { const group = map.get(r.job.block) ?? []; group.push(r); map.set(r.job.block, group) }
  return [...map.entries()].filter(([, rs]) => rs.length === 2 && rs.every(ok) && new Set(rs.map(r => r.job.swap)).size === 2)
    .map(([id, rs]) => ({ id, round: rs[0].job.round, summary: summarize(rs) }))
}
function bootstrap(values, seed = 48119) {
  if (values.length < 2) return null
  const rng = createRng(seed), means = []
  for (let i = 0; i < 2000; i++) {
    let n = 0; for (let j = 0; j < values.length; j++) n += values[Math.floor(rng.float() * values.length)]
    means.push(n / values.length)
  }
  means.sort((a, b) => a - b)
  return [means[50], means[1949]]
}
export function selectConfigs(rows, configs, max, perFamily = 1) {
  const cards = configs.map(c => {
    const rs = rows.filter(r => (r.job.candidate ?? r.job.coach) === c.id), blocks = pairedBlocks(rs)
    const summary = summarize(rs)
    return { config: c, blocks: blocks.length, summary,
      eligible: blocks.length >= 2 && !rs.some(r => r.hardErrors?.length),
      // Conservative exploration heuristic, not a significance test or promotion verdict.
      score: blocks.length ? Math.min(...blocks.map(b => b.summary.conversionPct ?? 0)) * .35 + blocks.reduce((s, b) => s + (b.summary.conversionPct ?? 0), 0) / blocks.length * .65 : -Infinity }
  })
  // Only compare the common number of completed opening rounds; slow candidates are not penalized as sporting failures.
  const covered = cards.filter(c => c.eligible), common = Math.min(...covered.map(c => c.blocks))
  for (const c of covered) {
    const blocks = pairedBlocks(rows.filter(r => (r.job.candidate ?? r.job.coach) === c.config.id)).sort((a, b) => a.round - b.round).slice(0, common)
    c.selectionBlocks = common
    c.score = Math.min(...blocks.map(b => b.summary.conversionPct ?? 0)) * .35 + blocks.reduce((s, b) => s + (b.summary.conversionPct ?? 0), 0) / blocks.length * .65
  }
  covered.sort((a, b) => b.score - a.score || a.config.id.localeCompare(b.config.id))
  const selected = [], familyCount = {}
  for (const c of covered) {
    const family = c.config.family ?? c.config.id
    if ((familyCount[family] ?? 0) >= perFamily) continue
    selected.push(c.config); familyCount[family] = (familyCount[family] ?? 0) + 1
    if (selected.length === max) break
  }
  return { selected, cards, rule: '>=2 complete mirrored blocks; equal common opening-round count; .65 mean + .35 worst-block conversion; family cap; stable ID tie break. Exploratory, not proof of tactical intention.' }
}
export function writeReport(out) {
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'))), results = readResults(out)
  const group = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].filter(Boolean).map(k => [k, summarize(rows.filter(r => key(r) === k))]))
  const phases = group(results, r => r.job.phase)
  const coverage = Object.fromEntries(Object.entries(m.queues).map(([phase, jobs]) => [phase, {
    planned: jobs.length, recorded: results.filter(r => r.job.phase === phase).length,
    ...phases[phase], missingIds: jobs.filter(j => !results.some(r => r.job.id === j.id)).map(j => j.id),
  }]))
  atomic(path.join(out, 'coverage.json'), coverage)
  atomic(path.join(out, 'failures.json'), results.filter(r => !ok(r)).map(r => ({ id: r.job.id, status: r.status, error: r.error, hardErrors: r.hardErrors })))
  atomic(path.join(out, 'control-effects.json'), { groups: group(results.filter(r => r.job.phase === 'controls'), r => `${r.job.control}|${r.job.context ?? 'state'}|${r.job.value}`),
    evidence: results.filter(r => r.job.phase === 'controls').map(r => ({ id: r.job.id, requested: r.job.homeConfig, checkpointFile: `checkpoints/${r.job.id}.json`, completeResult: `jobs/${r.job.id}.json` })),
    inference: 'Descriptive paired context responses. No frame-level independent samples; no blanket dead-control verdict.' })
  atomic(path.join(out, 'tactics-matrix.json'), group(results.filter(r => r.job.phase === 'matrix'), r => r.job.cell))
  const coachCards = AI_COACH_ARCHETYPES.map(p => {
    const rs = results.filter(r => r.job.phase === 'coaches' && r.job.coach === p.id), blocks = pairedBlocks(rs)
    return { id: p.id, label: p.label, ...summarize(rs), blocks: blocks.length,
      conversionBlockCI: bootstrap(blocks.map(b => b.summary.conversionPct)),
      context: group(rs, r => r.job.home), verdict: blocks.length < 2 ? 'INSUFFICIENT_DATA' : 'SCREENING_REQUIRES_BEHAVIOR_REVIEW' }
  })
  atomic(path.join(out, 'coach-cards.json'), coachCards)
  const finals = results.filter(r => r.job.phase === 'holdout')
  const finalIds = [...new Set(finals.map(r => r.job.candidate))]
  const finalCards = finalIds.map(id => {
    const rs = finals.filter(r => r.job.candidate === id), blocks = pairedBlocks(rs)
    return { id, ...summarize(rs), completeBlocks: blocks.length,
      conversionBlockCI: bootstrap(blocks.map(b => b.summary.conversionPct)),
      matchup: group(rs, r => r.job.awayConfig.id), verdict: blocks.length < 6 ? 'INSUFFICIENT_DATA' : 'HOLDOUT_MEASURED_REQUIRES_CAUSAL_REVIEW' }
  })
  const contrasts = []
  for (const a of finalIds) for (const b of finalIds) if (a < b) {
    const aa = pairedBlocks(finals.filter(r => r.job.candidate === a)), bb = pairedBlocks(finals.filter(r => r.job.candidate === b))
    const diffs = aa.flatMap(x => { const y = bb.find(z => z.round === x.round); return y ? [x.summary.conversionPct - y.summary.conversionPct] : [] })
    const ci = bootstrap(diffs)
    contrasts.push({ a, b, commonBlocks: diffs.length, differencePp: diffs.length ? diffs.reduce((s, v) => s + v, 0) / diffs.length : null,
      ci95: ci, status: 'EXPLORATORY_MULTIPLE_COMPARISONS_NO_AUTOMATIC_PROMOTION' })
  }
  atomic(path.join(out, 'holdout-results.json'), { cards: finalCards, contrasts })
  const clips = results.flatMap(r => r.replayCandidates ?? [])
  const random = clips.filter(c => c.category !== 'alarm').sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 48)
  const alarm = clips.filter(c => c.category === 'alarm').sort((a, b) => b.severity - a.severity).slice(0, 48)
  atomic(path.join(out, 'replay-index.json'), { random, diagnostic: alarm, reviewedByHuman: false })
  const number = n => n == null ? '—' : n.toFixed(2)
  const lines = ['# Audyt taktyk i archetypów AI', '', `Status: ${m.status}. Integralność: ${m.integrity?.status ?? 'UNKNOWN'}.`,
    `Czas aktywny: ${number(m.elapsedMs / 60000)} min. Wyniki zapisane: ${results.length}.`, '',
    '## Pokrycie', '', '| Moduł | Zapisane | Ukończone | Zaplanowane |', '|---|---:|---:|---:|',
    ...Object.entries(coverage).map(([p, c]) => `| ${p} | ${c.recorded} | ${c.complete ?? 0} | ${c.planned} |`), '',
    '## Obecne archetypy — screening', '', '| Trener | Pełne pary | Completion % | Punkty / posiadania % |', '|---|---:|---:|---:|',
    ...coachCards.map(c => `| ${c.label} | ${c.blocks} | ${number(c.completionPct)} | ${number(c.conversionPct)} |`), '',
    '## Finał na odrębnych danych', '', '| Profil | Pełne pary | Completion % | Resety % | Punkty / posiadania % |', '|---|---:|---:|---:|---:|',
    ...finalCards.map(c => `| ${c.id} | ${c.completeBlocks} | ${number(c.completionPct)} | ${number(c.resetPct)} | ${number(c.conversionPct)} |`), '',
    'Średnie opisowe obejmują ukończone zadania; przedziały i kontrasty wyłącznie kompletne pary. Nie ogłaszamy zwycięzcy na podstawie samego completion ani nie utożsamiamy braku istotności z brakiem działania.', '',
    '## Granice wnioskowania', '', ...m.limitations.map(x => `- ${x}`), '',
    'Pełne ustawienia wejściowe, użyte taktyki, efektywne dyrektywy, stany adaptacji i geometria są w plikach jobs oraz replays. Raport wymaga końcowej interpretacji i przeglądu powtórek; żaden kandydat nie został wdrożony.', '']
  atomic(path.join(out, 'REPORT.md'), lines.join('\n'))
  atomic(path.join(out, 'REBUILD-PLAN.md'), ['# Materiał do przebudowy trenerów', '',
    '1. Najpierw naprawić błędy integralności i przypadki ustawień niewidocznych w zachowaniu.',
    '2. Porównać karty obecnych trenerów z ich użytymi taktykami; podobnych zachowaniem kandydatów rozważyć do połączenia.',
    '3. Zestawić ablations z reakcjami na wspólne historie: oddzielić wybór stylu, instrukcje, skład i adaptację.',
    '4. Ocenić finalne konfiguracje w niszach kadrowych i złych matchupach; nie promować przy zbyt małej próbie.',
    '5. Przed wdrożeniem potwierdzić zamierzoną sygnaturę na powtórkach i uzupełnić brakujące mechaniki percepcji.', '',
    'To automatycznie przygotowana kolejność przeglądu. Konkretne decyzje zachować/połączyć/przebudować wymagają końcowej analizy dowodów.', ''].join('\n'))
  return { phases, finalCards, reportHash: createHash('sha256').update(lines.join('\n')).digest('hex') }
}
