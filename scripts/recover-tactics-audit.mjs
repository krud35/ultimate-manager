import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { atomic } from './tactics-audit-support.mjs'

const out = path.resolve(process.argv[2]), manifestFile = path.join(out, 'manifest.json')
const m = JSON.parse(fs.readFileSync(manifestFile))
assert.equal(m.status, 'RUNNING')
assert.equal(m.phase, 'validation')
assert.equal(m.activeWorkers.length, 0, 'Recovery requires all recorded workers to have exited')
try { process.kill(m.pid, 0); throw new Error(`PID ${m.pid} exists; do not recover an active coordinator`) }
catch (e) { if (e.code !== 'ESRCH') throw e }
const hash = data => createHash('sha256').update(data).digest('hex')
for (const [file, expected] of Object.entries(m.hashes)) {
  assert.equal(hash(fs.readFileSync(path.join(out, 'snapshot', file))), expected, `Changed snapshot: ${file}`)
}
const ledger = fs.readFileSync(path.join(out, 'coordinator.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s))
assert.equal(ledger.at(-1).event, 'phase-end')
assert.equal(ledger.at(-1).phase, 'development')
const stamp = new Date().toISOString().replaceAll(':', '-'), archive = path.join(out, 'recovery', stamp)
fs.mkdirSync(archive, { recursive: true })
fs.copyFileSync(manifestFile, path.join(archive, 'manifest.before.json'))
const changed = []
for (const name of ['tactics-audit.mjs', 'tactics-audit-report.mjs']) {
  const rel = path.join('scripts', name), dest = path.join(out, 'snapshot', rel)
  fs.copyFileSync(dest, path.join(archive, `${name}.before`))
  const data = fs.readFileSync(path.resolve('scripts', name))
  changed.push({ file: rel, before: m.hashes[rel], after: hash(data) })
  atomic(dest, data.toString('utf8')); m.hashes[rel] = hash(data)
}
const lock = path.join(out, 'coordinator.lock')
if (fs.existsSync(lock)) fs.renameSync(lock, path.join(archive, 'coordinator.lock.before'))
m.recoveries ??= []
m.recoveries.push({ at: new Date().toISOString(), reason: 'Coordinator absent after development; bounded-memory result reader installed. No worker, engine, roster, candidate or selection-rule changes.', changed,
  previousStatus: m.status, retainedElapsedMs: m.elapsedMs, priorPid: m.pid })
m.status = 'PAUSED'; m.resumeFromPhase = 'validation'; m.pid = null
atomic(manifestFile, m)
console.log(JSON.stringify({ status: m.status, resumeFromPhase: m.resumeFromPhase, remainingMinutes: (m.durationMs - m.elapsedMs) / 60000, archive, changed }))
