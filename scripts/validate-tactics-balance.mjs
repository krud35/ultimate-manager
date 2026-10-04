import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseline = path.join(root, 'artifacts/engine-audit/tactics-balance-2026-10-03-v2')
const out = path.join(root, 'artifacts/engine-audit/tactics-balance-2026-10-03-validation')
const args = process.argv.slice(2)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha = contents => createHash('sha256').update(contents).digest('hex')
const save = (file, value) => {
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2))
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); break }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 10) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}
if (args.includes('--prepare')) {
  if (fs.existsSync(path.join(out, 'manifest.json'))) throw new Error('Validation already prepared; do not replace it')
  const queue = read(path.join(baseline, 'queue.json'))
  const selected = queue.filter(group => group.core && group.round === 0 && (
    ['matrix', 'force', 'roles', 'career'].includes(group.cohort)
    || (group.cohort === 'instruction' && ['safe_throws|take_risks', 'poach|no_poach'].includes(group.factor))
    || (group.cohort === 'interaction' && ['reset-poach-isolation', 'poach-ban-monotonicity'].includes(group.factor))))
  const heldoutQueue = []
  for (let replicate = 0; replicate < 3; replicate++) for (const group of selected) {
    const id = `holdout-${replicate}-${group.id}`
    heldoutQueue.push({ ...group, id, round: replicate, originalGroup: group.id, jobs: group.jobs.map(job => ({
      ...job, id: `holdout-${replicate}-${job.id}`, block: `holdout-${replicate}-${job.block}`, contrast: id,
      round: replicate, seed: job.seed + 200000000 + replicate * (group.cohort === 'matrix' ? 10000 : 100000),
      home: `holdout-balanced-${replicate}-a`, away: `holdout-balanced-${replicate}-b`,
      split: 'holdout', firstOffense: replicate % 2 ? 'b' : 'a', keepReplays: false, budgetMs: 900000,
    })) })
  }
  fs.mkdirSync(out, { recursive: true })
  save(path.join(out, 'queue.json'), heldoutQueue)
  fs.copyFileSync(path.join(baseline, 'rosters.json'), path.join(out, 'rosters.json'))
  save(path.join(out, 'manifest.json'), { schema: 1, preparedAt: new Date().toISOString(), baseline,
    purpose: 'Fresh paired full-engine before/after validation; all 35 calm matchups, 10 wind sentinels, forces, roles, four career axes and corrected instruction/poach mechanisms.',
    independentReplicates: 3, gamesPerVersion: heldoutQueue.reduce((n, group) => n + group.jobs.length, 0),
    queueHash: sha(JSON.stringify(heldoutQueue)), rosterHash: sha(fs.readFileSync(path.join(out, 'rosters.json'))),
    limitations: ['Synthetic holdout-balanced roster family only.', 'First offense A/B/A; home/away mirror does not make two independent seeds.',
      'No claim of equal tactical win rates; invalid games remain visible and are excluded from score comparisons.'] })
  console.log(JSON.stringify(read(path.join(out, 'manifest.json'))))
} else if (args.includes('--run')) {
  const phase = args[args.indexOf('--phase') + 1]
  if (!['before', 'after'].includes(phase)) throw new Error('--phase before|after required')
  const version = path.join(out, phase), manifest = read(path.join(out, 'manifest.json'))
  const config = read(path.join(version, 'version.json'))
  const queue = read(path.join(out, 'queue.json')), jobs = queue.flatMap(group => group.jobs)
  if (sha(JSON.stringify(queue)) !== manifest.queueHash) throw new Error('Queue changed')
  if (sha(fs.readFileSync(path.join(out, 'rosters.json'))) !== manifest.rosterHash) throw new Error('Rosters changed')
  if (sha(fs.readFileSync(config.worker)) !== config.workerHash) throw new Error('Worker changed')
  if (sha(fs.readFileSync(path.join(version, 'instrumentation.mjs'))) !== config.instrumentationHash) throw new Error('Instrumentation changed')
  if (sha(fs.readFileSync(path.join(version, 'rosters.json'))) !== manifest.rosterHash) throw new Error('Version rosters changed')
  for (const [relative, hash] of Object.entries(config.sourceHashes)) {
    if (sha(fs.readFileSync(path.join(config.sourceRoot, relative))) !== hash) throw new Error(`Source changed: ${relative}`)
  }
  const workerCount = Number(args[args.indexOf('--workers') + 1] ?? 3)
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 6) throw new Error('Use 1–6 workers')
  for (const folder of ['jobs', 'inputs', 'logs', 'attempts']) fs.mkdirSync(path.join(version, folder), { recursive: true })
  const lock = path.join(version, 'run.lock')
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' })
  const active = new Map()
  let next = 0, completed = 0, failures = 0, stop = false
  const progress = () => save(path.join(version, 'progress.json'), { at: new Date().toISOString(), phase,
    pid: process.pid, completed, planned: jobs.length, failures, active: [...active].map(([id, child]) => ({ id, pid: child.pid })), stop })
  process.on('SIGTERM', () => { stop = true; for (const child of active.values()) child.kill() })
  process.on('SIGINT', () => { stop = true; for (const child of active.values()) child.kill() })
  async function lane() {
    while (!stop && next < jobs.length) {
      if (fs.existsSync(path.join(out, 'STOP'))) { stop = true; break }
      const job = jobs[next++]
      const resultFile = path.join(version, 'jobs', `${job.id}.json`)
      if (fs.existsSync(resultFile)) {
        const result = read(resultFile)
        if (result.status === 'complete') { completed++; if (result.hardErrors?.length) failures++; continue }
        // An engine-declared terminal failure is evidence, not an interrupted
        // infrastructure attempt. Preserve it when resuming other missing jobs.
        if (result.failure?.code === 'POINT_SIMULATION_LIMIT') { failures++; continue }
        fs.renameSync(resultFile, path.join(version, 'attempts', `${job.id}-${Date.now()}.json`))
      }
      const input = path.join(version, 'inputs', `${job.id}.json`)
      save(input, job)
      const log = fs.openSync(path.join(version, 'logs', `${job.id}.log`), 'a')
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--max-old-space-size=768', config.worker, input, version], {
          cwd: root, windowsHide: true, stdio: ['ignore', log, log],
        })
        active.set(job.id, child); progress()
        const timer = setTimeout(() => child.kill(), job.budgetMs + 5000)
        child.once('error', reject)
        child.once('close', code => { clearTimeout(timer); active.delete(job.id); resolve(code) })
      })
      fs.closeSync(log)
      if (!fs.existsSync(resultFile)) save(resultFile, { job, status: stop ? 'interrupted' : 'error', code })
      const result = read(resultFile)
      if (result.status === 'complete') completed++
      if (result.status !== 'complete' || result.hardErrors?.length) failures++
      progress()
    }
  }
  const ticker = setInterval(progress, 10000)
  try { await Promise.all(Array.from({ length: workerCount }, lane)); progress() }
  finally { clearInterval(ticker); fs.unlinkSync(lock) }
  console.log(JSON.stringify({ phase, completed, failures, stop }))
} else {
  console.log('Use --prepare or --run --phase before|after --workers 3; version.json is required for each immutable variant.')
}
