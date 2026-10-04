import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { makeRosters } from './tactics-audit-plan.mjs'
import { makeBalancePlan } from './tactics-balance-plan.mjs'
import { atomic } from './tactics-audit-support.mjs'

const args = process.argv.slice(2)
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.resolve(arg('--output', 'artifacts/engine-audit/tactics-balance-2026-10-03'))
const sha = data => createHash('sha256').update(data).digest('hex')
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)])
const read = file => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'))
const retryableWrite = error => ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
// Windows readers/scanners may briefly deny replacement of an existing file.
// Retry the same atomic payload; never truncate the last good checkpoint.
function save(file, data) {
  for (let attempt = 0; ; attempt++) {
    try { return atomic(path.join(out, file), data) }
    catch (error) {
      if (!retryableWrite(error) || attempt >= 11) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(300, 20 * (attempt + 1)))
    }
  }
}
const log = event => fs.appendFileSync(path.join(out, 'coordinator.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')

if (args.includes('--prepare')) {
  if (fs.existsSync(path.join(out, 'manifest.json'))) throw new Error('Audit already exists; use --run to recover it')
  for (const dir of ['', 'snapshot', 'inputs', 'jobs', 'logs', 'checkpoints', 'replays', 'attempts']) fs.mkdirSync(path.join(out, dir), { recursive: true })
  const deadline = arg('--deadline', '2026-10-03T06:00:00+02:00')
  if (!(Date.parse(deadline) > Date.now())) throw new Error('Deadline must be in the future')
  const hashes = {}
  const acceptancePath = path.join(root, 'artifacts/engine-audit/tactics-balance-worker-smoke/ACCEPTANCE.json')
  const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8'))
  if (acceptance.status !== 'PASS' || acceptance.workerHash !== sha(fs.readFileSync(path.join(root, 'scripts/tactics-balance-worker.mjs')))) throw new Error('Worker acceptance missing or stale')
  const source = [path.join(root, 'package.json'), ...files(path.join(root, 'src')), ...files(path.join(root, 'scripts')).filter(f => f.endsWith('.mjs'))]
  for (const file of source) {
    const rel = path.relative(root, file), dest = path.join(out, 'snapshot', rel), data = fs.readFileSync(file)
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data); hashes[rel] = sha(data)
  }
  const rosters = makeRosters(), queue = makeBalancePlan({ rounds: Number(arg('--rounds', 8)) })
  save('rosters.json', rosters); save('queue.json', queue)
  save('manifest.json', { schema: 1, status: 'PREPARED', preparedAt: new Date().toISOString(), deadline,
    deadlineMs: Date.parse(deadline), workers: Number(arg('--workers', 2)), heapMb: 768, hashes, acceptance,
    rosterHash: sha(JSON.stringify(rosters)), queueHash: sha(JSON.stringify(queue)),
    plannedGroups: queue.length, plannedMatches: queue.reduce((n, g) => n + g.jobs.length, 0),
    fullEngine: true, fastMode: false, fullMatch: true, pointsToWin: 15, sourceRevision: arg('--revision', 'recorded-in-hashes'),
    cpu: os.cpus()[0]?.model, freeMemoryGb: os.freemem() / 2 ** 30,
    limitations: ['Fixed experimental tactics; adaptive coaches are not a randomized factor.', 'Sampling budget cannot guarantee every planned cell.', 'Mirror pairs share a seed; independent units are scenario-seed blocks.', 'Movement metrics are sampled diagnostic indicators, not an independent decision oracle.'],
  })
  console.log(JSON.stringify({ prepared: out, groups: queue.length, games: queue.reduce((n, g) => n + g.jobs.length, 0), deadline }))
} else if (args.includes('--run')) {
  const manifest = read('manifest.json'), queue = read('queue.json')
  if (['FINISHED', 'STOPPED'].includes(manifest.status)) throw new Error(`Already ${manifest.status}`)
  if (Date.now() >= manifest.deadlineMs) throw new Error('Sampling deadline has passed')
  if (sha(JSON.stringify(read('rosters.json'))) !== manifest.rosterHash || sha(JSON.stringify(queue)) !== manifest.queueHash) throw new Error('Inputs modified')
  for (const [rel, hash] of Object.entries(manifest.hashes)) if (sha(fs.readFileSync(path.join(out, 'snapshot', rel))) !== hash) throw new Error(`Snapshot modified: ${rel}`)
  const lockPath = path.join(out, 'coordinator.lock')
  // Never unlink a lock automatically: recovery first proves its process exited.
  const fd = fs.openSync(lockPath, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); fs.closeSync(fd)
  const active = new Map(), costs = [], completed = new Set()
  for (const g of queue) for (const j of g.jobs) {
    const file = path.join(out, 'jobs', `${j.id}.json`)
    if (fs.existsSync(file)) {
      try { if (JSON.parse(fs.readFileSync(file)).status === 'complete') completed.add(j.id) }
      catch (error) { log({ event: 'invalid-result-to-retry', id: j.id, error: error.message }) }
    }
  }
  manifest.status = 'RUNNING'; manifest.pid = process.pid; manifest.startedAt ??= new Date().toISOString()
  save('manifest.json', manifest)
  let stopReason = null, next = 0, finishedGroups = 0, errors = 0, consecutiveErrors = 0, ticker, fatalError = null
  const hardErrorJobs = []
  const stop = reason => { stopReason ??= reason; for (const child of active.values()) child.kill() }
  process.on('SIGINT', () => stop('INTERRUPTED')); process.on('SIGTERM', () => stop('INTERRUPTED'))
  const progress = () => {
    const data = { status: manifest.status, pid: process.pid, updatedAt: new Date().toISOString(),
    deadline: manifest.deadline, completed: completed.size, finishedGroups, attemptedGroups: next, errors, hardErrorJobs,
    activeWorkers: [...active].map(([id, c]) => ({ id, pid: c.pid })),
    recentMeanMatchMs: costs.length ? costs.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, costs.length) : null }
    try { save('progress.json', data) }
    catch (error) {
      if (!retryableWrite(error)) throw error
      // Status telemetry is advisory; keep matches running and try next tick.
      log({ event: 'progress-write-deferred', code: error.code })
    }
  }
  async function report() {
    const { writeReport } = await import(pathToFileURL(path.join(out, 'snapshot/scripts/tactics-balance-report.mjs')).href)
    return writeReport(out)
  }
  async function execute(job) {
    if (fs.existsSync(path.join(out, 'STOP'))) stop('USER_STOP')
    if (completed.has(job.id) || stopReason) return
    const file = path.join(out, 'jobs', `${job.id}.json`)
    if (fs.existsSync(file)) fs.renameSync(file, path.join(out, 'attempts', `${job.id}-${Date.now()}.json`))
    const input = path.join(out, 'inputs', `${job.id}.json`)
    const budgetMs = Math.min(job.budgetMs, manifest.deadlineMs - Date.now())
    save(`inputs/${job.id}.json`, { ...job, budgetMs })
    const logFd = fs.openSync(path.join(out, 'logs', `${job.id}.log`), 'a'), started = Date.now()
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`--max-old-space-size=${manifest.heapMb}`, path.join(out, 'snapshot/scripts/tactics-balance-worker.mjs'), input, out], { cwd: out, windowsHide: true, stdio: ['ignore', logFd, logFd] })
      active.set(job.id, child); log({ event: 'job-start', id: job.id, pid: child.pid })
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; child.kill() }, budgetMs + 2000)
      child.once('error', reject)
      child.once('close', code => {
        clearTimeout(timeout); active.delete(job.id); fs.closeSync(logFd)
        try {
        if (!fs.existsSync(file)) save(`jobs/${job.id}.json`, { job, status: timedOut ? 'timeout' : stopReason ? 'interrupted' : 'error', code, timings: { wallMs: Date.now() - started } })
        const result = JSON.parse(fs.readFileSync(file))
        if (result.status === 'complete') { completed.add(job.id); costs.push(Date.now() - started); consecutiveErrors = 0 }
        else { errors++; consecutiveErrors++ }
        if (result.hardErrors?.length) hardErrorJobs.push({ id: job.id, errors: result.hardErrors })
        log({ event: 'job-end', id: job.id, status: result.status, wallMs: Date.now() - started, hardErrors: result.hardErrors })
        if (consecutiveErrors >= 8) stop('REPEATED_FAILURE')
        resolve()
        } catch (error) { reject(error) }
      })
    })
  }
  try {
    ticker = setInterval(() => {
      try {
      if (Date.now() >= manifest.deadlineMs) stop('DEADLINE')
      if (fs.existsSync(path.join(out, 'STOP'))) stop('USER_STOP')
      progress()
      } catch (error) { fatalError = error; stop('STATUS_IO_ERROR') }
    }, 5000)
    log({ event: 'start', pid: process.pid, completed: completed.size })
    async function lane() {
      while (!stopReason && next < queue.length) {
        if (fs.existsSync(path.join(out, 'STOP'))) { stop('USER_STOP'); break }
        const group = queue[next++]
        const pending = group.jobs.filter(j => !completed.has(j.id))
        if (!pending.length) { finishedGroups++; continue }
        const sorted = costs.slice(-30).sort((a, b) => a - b)
        const estimate = sorted.length ? sorted[Math.floor((sorted.length - 1) * .9)] * 1.25 : 90000
        if (Date.now() + estimate * pending.length + 15000 >= manifest.deadlineMs) {
          log({ event: 'not-admitted', group: group.id, reason: 'insufficient-time-for-complete-contrast' }); continue
        }
        if (fs.statfsSync(out).bavail * fs.statfsSync(out).bsize < 1024 ** 3) { stop('DISK_LIMIT'); break }
        for (const job of pending) { if (stopReason) break; await execute(job) }
        if (group.jobs.every(j => completed.has(j.id))) finishedGroups++
        progress()
      }
    }
    await Promise.all(Array.from({ length: manifest.workers }, lane))
    if (fatalError) throw fatalError
    manifest.status = stopReason && !['DEADLINE', 'USER_STOP'].includes(stopReason) ? 'FAILED' : stopReason === 'USER_STOP' ? 'STOPPED' : 'FINISHED'
    manifest.stopReason = stopReason ?? (next >= queue.length ? 'QUEUE_OR_ADMISSION_EXHAUSTED' : 'COMPLETE')
    manifest.finishedAt = new Date().toISOString(); manifest.completed = completed.size
    save('manifest.json', manifest); progress(); await report()
    log({ event: 'finished', status: manifest.status, completed: completed.size })
  } catch (error) {
    stop('FAILED')
    await Promise.all([...active.values()].map(child => new Promise(resolve => child.once('close', resolve))))
    manifest.status = 'FAILED'; manifest.error = error.stack; save('manifest.json', manifest)
    try { await report() } catch { /* Original failure remains in manifest. */ }
    process.exitCode = 1
  } finally {
    clearInterval(ticker); fs.unlinkSync(lockPath)
  }
} else {
  console.log('Use --prepare [--deadline ISO --workers 2 --rounds 8] or --run --output DIR. Stop by creating OUTDIR/STOP.')
}
