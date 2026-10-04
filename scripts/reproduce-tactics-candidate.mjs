import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
const root = path.resolve('artifacts/engine-audit')
const baseline = path.join(root, 'tactics-balance-2026-10-03-v2')
const variant = process.argv[2]
if (!/^[a-z0-9-]+$/.test(variant ?? '')) throw new Error('Immutable variant name required')
const workers = Number(process.argv[3] ?? 3)
if (!Number.isInteger(workers) || workers < 1 || workers > 3) throw new Error('Use 1–3 workers')
const version = path.join(root, 'tactics-balance-2026-10-03-validation', variant)
const config = JSON.parse(fs.readFileSync(path.join(version, 'version.json')))
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
if (hash(config.worker) !== config.workerHash) throw new Error('Worker changed')
for (const [file, expected] of Object.entries(config.sourceHashes)) {
  if (hash(path.join(config.sourceRoot, file)) !== expected) throw new Error(`Source changed: ${file}`)
}
const directory = path.join(version, 'reproduction')
for (const folder of ['inputs', 'jobs', 'logs']) fs.mkdirSync(path.join(directory, folder), { recursive: true })
const lock = path.join(directory, 'run.lock')
fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' })
fs.copyFileSync(path.join(baseline, 'rosters.json'), path.join(directory, 'rosters.json'))
const ids = [
  'matrix-00028-configured-a', 'matrix-00062-configured-a', 'matrix-00063-configured-a',
  'matrix-00063-configured-b', 'matrix-00254-configured-a', 'matrix-00254-configured-b',
  'interaction-00222-low-b', 'instruction-00414-shade_under-a', 'force-00667-configured-b',
  'matrix-00064-configured-a', 'matrix-00085-configured-a',
]
const queue = JSON.parse(fs.readFileSync(path.join(baseline, 'queue.json'))).flatMap(group => group.jobs)
const results = []
let cursor = 0
async function lane() {
  while (cursor < ids.length) {
    const id = ids[cursor++]
    const job = queue.find(job => job.id === id)
    if (!job) throw new Error(`Missing original job: ${id}`)
    const input = path.join(directory, 'inputs', id + '.json')
    fs.writeFileSync(input, JSON.stringify({ ...job, budgetMs: 900000, keepReplays: false }))
    const resultFile = path.join(directory, 'jobs', id + '.json')
    if (!fs.existsSync(resultFile)) {
      const fd = fs.openSync(path.join(directory, 'logs', id + '.log'), 'a')
      const child = spawn(process.execPath, ['--max-old-space-size=768', config.worker, input, directory],
        { windowsHide: true, stdio: ['ignore', fd, fd] })
      console.log(JSON.stringify({ started: id, pid: child.pid, at: new Date().toISOString() }))
      const timer = setTimeout(() => child.kill(), 905000)
      try { await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) }) }
      finally { clearTimeout(timer); fs.closeSync(fd) }
    }
    const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile)) : { status: 'missing' }
    const row = { id, status: result.status, score: result.score, points: result.points,
      failure: result.failure, error: result.error, hardErrors: result.hardErrors,
      motionAlarms: Object.values(result.sides ?? {}).reduce((n, side) => n + (side.motion?.displacementAlarms ?? 0), 0),
      wallMs: result.timings?.wallMs }
    results.push(row)
    fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify({ variant, at: new Date().toISOString(), planned: ids.length, results }, null, 2))
    console.log(JSON.stringify(row))
  }
}
try { await Promise.all(Array.from({ length: workers }, lane)) }
finally { fs.unlinkSync(lock) }
if (results.some(row => row.status !== 'complete' || row.hardErrors?.length || row.motionAlarms)) process.exitCode = 1
