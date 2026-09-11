import fs from 'node:fs'
import path from 'node:path'
import { readResults, summarize, measure } from './tactics-audit-report.mjs'
const out = path.resolve(process.argv[2]), rows = readResults(out)
const good = r => ['complete', 'complete_point_sample'].includes(r.status) && !r.hardErrors?.length
const compact = rs => {
  const s = summarize(rs)
  return { n: s.complete, completion: s.completionPct, conversion: s.conversionPct, reset: s.resetPct,
    hucks: s.huckPct, holdMs: s.meanHoldMs, width: s.meanWidthM, throwsPerScore: s.scores ? s.attempts / s.scores : null,
    wins: rs.filter(good).filter(r => measure(r).margin > 0).length }
}
const grouped = (rs, key) => Object.fromEntries([...new Set(rs.map(key))].map(k => [k, compact(rs.filter(r => key(r) === k))]))
const final = JSON.parse(fs.readFileSync(path.join(out, 'holdout-results.json')))
const controls = rows.filter(r => r.job.phase === 'controls')
const effects = {}
for (const key of [...new Set(controls.map(r => r.job.control))]) {
  const rs = controls.filter(r => r.job.control === key && good(r))
  const levels = [...new Set(rs.map(r => String(r.job.value)))]
  const caseId = r => `${r.job.seed}|${r.job.context ?? ''}`
  const sets = levels.map(l => new Set(rs.filter(r => String(r.job.value) === l).map(caseId)))
  const common = [...(sets[0] ?? [])].filter(id => sets.every(s => s.has(id)))
  effects[key] = { pairedContexts: common.length, levels: Object.fromEntries(levels.map(l => [l, compact(rs.filter(r => String(r.job.value) === l && common.includes(caseId(r))))])) }
}
const matrix = rows.filter(r => r.job.phase === 'matrix')
const adaptation = { ordinaryHold: { n: 0, changedDefense: 0, changedAttack: 0 }, recovery: {}, signals: {} }
for (const f of fs.readdirSync(path.join(out, 'jobs')).filter(f => f.startsWith('adaptation-'))) {
  const r = JSON.parse(fs.readFileSync(path.join(out, 'jobs', f)))
  if (r.job.kind !== 'adaptation') continue
  for (const x of r.rows ?? []) {
    if (x.history === 'ordinary_hold') {
      adaptation.ordinaryHold.n++
      if (x.before.dLineDefenseStyle !== x.after.dLineDefenseStyle) adaptation.ordinaryHold.changedDefense++
      if (x.before.oLineAttackStyle !== x.after.oLineAttackStyle) adaptation.ordinaryHold.changedAttack++
    }
    if (x.history === 'panic_recovery' && x.step === 8) {
      const a = adaptation.recovery[x.profile] ??= { n: 0, maxHuck: 0, maxTempo: 0, stillPanic: 0, meanHuck: 0 }
      a.n++; const d = x.after.oLineCoachDirectives
      if (d.huckAppetite >= .99) a.maxHuck++
      if (d.possessionTempo >= .99) a.maxTempo++
      if (x.state.panicLevel > 0) a.stillPanic++
      a.meanHuck += d.huckAppetite / 128
    }
  }
}
const data = {
  holdout: grouped(rows.filter(r => r.job.phase === 'holdout'), r => r.job.candidate),
  contrasts: final.contrasts,
  coaches: grouped(rows.filter(r => r.job.phase === 'coaches'), r => r.job.coach),
  attack: grouped(matrix, r => r.job.homeConfig.attack), defense: grouped(matrix, r => r.job.awayConfig.defense),
  matrix: grouped(matrix, r => r.job.cell), effects,
  ablations: grouped(rows.filter(r => r.job.ablation), r => r.job.ablation),
  ablationByCoach: grouped(rows.filter(r => r.job.ablation), r => `${r.job.coach}|${r.job.ablation}`), adaptation,
}
fs.writeFileSync(path.join(out, 'INTERPRETATION-DATA.json'), JSON.stringify(data, null, 2))
console.log(JSON.stringify({ holdout: data.holdout, contrasts: data.contrasts, attack: data.attack, defense: data.defense,
  ablations: data.ablations, adaptation: data.adaptation, controlKeys: Object.keys(effects),
  coreControls: Object.fromEntries(Object.entries(effects).filter(([k]) => ['huckAppetite', 'possessionTempo', 'stackDepth', 'passSelectivity', 'breakAppetite', 'poachSeeking', 'helpDeep', 'dump_first', 'throw_hucks', 'cut_deep', 'cut_under'].includes(k))) }, null, 2))
