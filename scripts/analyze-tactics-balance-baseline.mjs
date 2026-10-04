import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { writeReport } from './tactics-balance-report.mjs'

const out = path.resolve(process.argv[2] ?? 'artifacts/engine-audit/tactics-balance-2026-10-03-v2')
const read = file => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'))
const manifest = read('manifest.json'), queue = read('queue.json'), progress = read('progress.json')
assert.equal(progress.activeWorkers.length, 0, 'Wait until sampling ends')
assert.equal(manifest.status, 'FINISHED')
assert.ok(Date.now() >= Date.parse(manifest.deadline))
const reports = { all: writeReport(out) }
for (const [name, keep] of [['core', group => group.core], ['extensions', group => !group.core]]) {
  const view = path.join(out, 'analysis', name)
  fs.mkdirSync(path.join(view, 'jobs'), { recursive: true })
  const selected = queue.filter(keep)
  fs.writeFileSync(path.join(view, 'manifest.json'), JSON.stringify({ ...manifest,
    analysisView: { source: out, selection: name, method: 'Frozen queue group.core; immutable result hardlinks' } }))
  fs.writeFileSync(path.join(view, 'queue.json'), JSON.stringify(selected))
  for (const job of selected.flatMap(group => group.jobs)) {
    const source = path.join(out, 'jobs', `${job.id}.json`)
    const target = path.join(view, 'jobs', `${job.id}.json`)
    if (fs.existsSync(source) && !fs.existsSync(target)) fs.linkSync(source, target)
  }
  reports[name] = writeReport(view)
}
fs.writeFileSync(path.join(out, 'analysis', 'index.json'), JSON.stringify({ at: new Date().toISOString(), reports }, null, 2))
console.log(JSON.stringify(reports))
