import fs from 'node:fs'
import path from 'node:path'
const directory = path.resolve(process.argv[2])
const read = file => JSON.parse(fs.readFileSync(path.join(directory, file)))
const manifest = read('manifest.json')
const progress = fs.existsSync(path.join(directory, 'progress.json')) ? read('progress.json') : null
const phases = {}, reference = { matches: 0, attempts: 0, completions: 0, resetAttempts: 0, resetCompletions: 0 }, failures = []
for (const f of fs.readdirSync(path.join(directory, 'jobs'))) {
  if (!f.endsWith('.json')) continue
  const r = read(`jobs/${f}`)
  phases[r.job.phase] ??= { jobs: 0, complete: 0, rows: 0 }; const p = phases[r.job.phase]
  p.jobs++; p.rows += r.rows?.length ?? 0
  if (r.status?.startsWith('complete')) p.complete++
  else failures.push({ id: r.job.id, status: r.status, error: r.error })
  if (r.job.phase === 'reference' && r.status === 'complete') {
    reference.matches++; for (const k of ['attempts', 'completions', 'resetAttempts', 'resetCompletions']) reference[k] += r.stats[k]
  }
}
const events = fs.readFileSync(path.join(directory, 'jobs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
const active = events.filter(e => e.event === 'start' && !events.some(end => end.id === e.id && end.event === 'end')).map(e => {
  const file = path.join(directory, 'checkpoints', e.id + '.json')
  return { id: e.id, phase: e.phase, elapsedSec: (Date.now() - Date.parse(manifest.startedAt) - e.elapsedMs) / 1000,
    checkpoint: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null }
})
for (const a of active) if (a.checkpoint) { const { points, score, status } = a.checkpoint; a.checkpoint = { points, score, status } }
console.log(JSON.stringify({ status: manifest.status, elapsedMinutes: (Date.now() - Date.parse(manifest.startedAt)) / 60000,
  progress, phases, reference: { ...reference, completion: reference.attempts ? 100 * reference.completions / reference.attempts : null,
    resetCompletion: reference.resetAttempts ? 100 * reference.resetCompletions / reference.resetAttempts : null }, failures, active }, null, 2))
