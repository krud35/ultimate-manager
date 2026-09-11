import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { phases, candidates, makeRosters, makeQueues, selectedQueue } from './tactics-audit-plan.mjs'
import { atomic } from './tactics-audit-support.mjs'
import { readResults, selectConfigs, writeReport } from './tactics-audit-report.mjs'

const args = process.argv.slice(2)
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.resolve(arg('--output', `artifacts/engine-audit/tactics-8h/${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`))
const hash = x => createHash('sha256').update(x).digest('hex')
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)])
const read = file => JSON.parse(fs.readFileSync(path.join(out, file)))
const save = (file, x) => atomic(path.join(out, file), x)
const log = x => fs.appendFileSync(path.join(out, 'coordinator.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...x }) + '\n')

if (args.includes('--prepare')) {
  if (fs.existsSync(path.join(out, 'manifest.json'))) throw new Error('Output already contains an audit; choose a new directory')
  for (const d of ['', 'snapshot', 'inputs', 'jobs', 'logs', 'checkpoints', 'replays', 'attempts']) fs.mkdirSync(path.join(out, d), { recursive: true })
  const smoke = args.includes('--smoke'), rosters = makeRosters(), queues = makeQueues(smoke)
  save('rosters.json', rosters); save('candidate-configs.json', candidates)
  const hashes = {}
  for (const file of [path.join(root, 'package.json'), ...list(path.join(root, 'src')), ...list(path.join(root, 'scripts'))]) {
    const rel = path.relative(root, file), dest = path.join(out, 'snapshot', rel), data = fs.readFileSync(file)
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data); hashes[rel] = hash(data)
  }
  const free = fs.statfsSync(out)
  if (free.bavail * free.bsize < 3 * 1024 ** 3) throw new Error('Need at least 3 GiB free disk')
  save('manifest.json', { schema: 1, status: 'PREPARED', preparedAt: new Date().toISOString(), smoke,
    durationMs: smoke ? 1800000 : 28800000, phases: smoke ? phases.map((p, i) => ({ ...p, end: (i + 1) * 3 })) : phases,
    workers: Math.min(2, Math.max(1, Math.floor(os.freemem() / (1600 * 1024 ** 2)))), workerHeapMb: 1536,
    node: process.version, availableMemory: os.freemem(), cpu: os.cpus()[0]?.model, hashes,
    rosterHash: hash(fs.readFileSync(path.join(out, 'rosters.json'))), catalogHash: hash(JSON.stringify(candidates)),
    queueHash: hash(JSON.stringify(queues)), diskBudgetBytes: 6 * 1024 ** 3, queues, elapsedMs: 0,
    limitations: [
      'Automatyczne metryki przestrzeni są wskaźnikami wymagającymi oceny powtórek, nie niezależnym sędzią poprawności decyzji.',
      'Kontrole i macierz korzystają z produkcyjnych punktów: przejścia i ustalony atak pojawiają się naturalnie. Brak gwarancji 16 niezależnych okazji każdego rodzaju w każdej komórce.',
      'Kandydaci są ograniczonymi konfiguracjami istniejących mechanik oraz polityką stabilności. Brakujące mechaniki nie otrzymują fikcyjnych wyników.',
      'Selekcja jest eksploracyjna na podstawie skuteczności posiadania, najgorszego bloku i różnorodności rodzin. Sygnatura intencji wymaga końcowego przeglądu; brak automatycznej promocji.',
      'Próby syntetycznej adaptacji pokazują reakcję na agregaty. Dobry drop i zła decyzja nie są dziś rozróżniane przez niezależną geometryczną ocenę trenera.',
      'Kontrola losowej adaptacji ma stałą częstość 25%, nie częstość idealnie dopasowaną do każdego trenera.',
      'Kontrasty są eksploracyjne, bez automatycznych deklaracji istotności po wielu porównaniach. Nie przeprowadzono zewnętrznej walidacji na danych prawdziwych meczów.',
      'Brak pełnej serializacji sesji: przerwany mecz wznawiany od tego samego seeda, z archiwizacją próby i zachowaniem zużytego czasu.',
    ] })
  console.log(JSON.stringify({ prepared: out, jobs: Object.fromEntries(Object.entries(queues).map(([p, q]) => [p, q.length])) }))
} else if (args.includes('--pause') || args.includes('--stop')) {
  fs.writeFileSync(path.join(out, args.includes('--pause') ? 'PAUSE' : 'STOP'), new Date().toISOString())
  console.log('Requested; coordinator acknowledges only after its workers exit.')
} else if (args.includes('--report')) {
  console.log(JSON.stringify(writeReport(out)))
} else if (args.includes('--run') || args.includes('--resume')) {
  const m = read('manifest.json'), resume = args.includes('--resume')
  if (m.status !== (resume ? 'PAUSED' : 'PREPARED')) throw new Error(`Unexpected state ${m.status}`)
  const lockFile = path.join(out, 'coordinator.lock')
  const lock = fs.openSync(lockFile, 'wx'); fs.writeSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); fs.closeSync(lock)
  const active = new Map(), costs = { point: [], full: [], adaptation: [] }, completed = new Set()
  const before = resume ? m.elapsedMs : 0, started = performance.now() - before
  let requested = null, ticker
  const elapsed = () => performance.now() - started
  const persist = () => { m.elapsedMs = elapsed(); m.activeWorkers = [...active.entries()].map(([id, c]) => ({ id, pid: c.pid })); save('manifest.json', m) }
  const stop = reason => { requested ??= reason; for (const c of active.values()) c.kill() }
  process.on('SIGINT', () => stop('PAUSED')); process.on('SIGTERM', () => stop('PAUSED'))
  const control = () => {
    if (fs.existsSync(path.join(out, 'PAUSE'))) stop('PAUSED')
    if (fs.existsSync(path.join(out, 'STOP'))) stop('STOPPED')
    if (elapsed() >= m.durationMs - (m.smoke ? 10000 : 1200000)) stop('TIME_BUDGET')
  }
  try {
    for (const [rel, h] of Object.entries(m.hashes)) if (hash(fs.readFileSync(path.join(out, 'snapshot', rel))) !== h) throw new Error(`Snapshot mismatch: ${rel}`)
    if (hash(fs.readFileSync(path.join(out, 'rosters.json'))) !== m.rosterHash) throw new Error('Roster hash mismatch')
    if (resume && fs.existsSync(path.join(out, 'PAUSE'))) fs.unlinkSync(path.join(out, 'PAUSE'))
    for (const r of readResults(out)) if (['complete', 'complete_point_sample'].includes(r.status)) completed.add(r.job.id)
    m.status = 'RUNNING'; m.pid = process.pid; m.startedAt ??= new Date().toISOString(); m.lastResumedAt = new Date().toISOString(); persist()
    ticker = setInterval(() => { control(); persist() }, 5000)
    log({ event: 'start', resume, pid: process.pid, remainingMs: m.durationMs - before })
    const snapshot = path.join(out, 'snapshot')
    async function execute(job, deadline) {
      const type = job.kind === 'adaptation' ? 'adaptation' : job.points ? 'point' : 'full'
      const sorted = costs[type].slice(-24).sort((a, b) => a - b)
      const estimate = sorted.length ? sorted[Math.floor((sorted.length - 1) * .9)] * 1.4 : type === 'full' ? 160000 : type === 'adaptation' ? 10000 : 45000
      if (deadline - performance.now() < estimate + 3000 || requested) return false
      if (completed.has(job.id)) return true
      const prior = path.join(out, 'jobs', `${job.id}.json`)
      if (fs.existsSync(prior)) {
        const archived = path.join(out, 'attempts', `${job.id}-${Date.now()}.json`)
        fs.renameSync(prior, archived)
      }
      const budgetMs = Math.min(deadline - performance.now() - 1000, type === 'full' ? 240000 : type === 'adaptation' ? 120000 : Math.max(60000, (job.points ?? 1) * 45000))
      const input = path.join(out, 'inputs', `${job.id}.json`)
      atomic(input, { ...job, budgetMs })
      const fd = fs.openSync(path.join(out, 'logs', `${job.id}.log`), 'a'), t = performance.now()
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [`--max-old-space-size=${m.workerHeapMb}`, path.join(snapshot, 'scripts/tactics-audit-worker.mjs'), input, out],
          { cwd: snapshot, windowsHide: true, stdio: ['ignore', fd, fd] })
        active.set(job.id, child); log({ event: 'job-start', id: job.id, pid: child.pid, budgetMs })
        let timeout = false
        const timer = setTimeout(() => { timeout = true; child.kill() }, budgetMs)
        child.once('error', reject)
        child.once('close', code => {
          clearTimeout(timer); active.delete(job.id); fs.closeSync(fd)
          if (!fs.existsSync(prior)) atomic(prior, { job, status: requested ? 'interrupted' : timeout ? 'timeout' : 'error', code, timings: { wallMs: performance.now() - t } })
          const r = JSON.parse(fs.readFileSync(prior))
          if (['complete', 'complete_point_sample'].includes(r.status)) { completed.add(job.id); costs[type].push(performance.now() - t) }
          log({ event: 'job-end', id: job.id, status: r.status, code, wallMs: performance.now() - t })
          if (r.hardErrors?.length) m.hardErrorJobs = [...(m.hardErrorJobs ?? []), job.id]
          resolve()
        })
      })
      return true
    }
    for (const phase of m.phases) {
      if (requested) break
      if (phase.end * 60000 <= before) continue
      m.phase = phase.id; persist()
      if (!m.smoke && phase.id === 'validation' && !m.selectionDevelopment) {
        const selection = selectConfigs(readResults(out).filter(r => r.job.phase === 'development'), candidates, 16, 2)
        m.selectionDevelopment = selection.selected
        save('selection-development.json', selection)
        m.queues.validation = selectedQueue('validation', selection.selected, 24); persist()
      }
      if (!m.smoke && phase.id === 'holdout' && !m.selectionFinal) {
        const selection = selectConfigs(readResults(out).filter(r => r.job.phase === 'validation'), m.selectionDevelopment ?? [], 4, 1)
        const refs = [{ id: 'reference-balanced', profile: 'balanced_pro', family: 'reference' }, { id: 'reference-mastermind', profile: 'tactical_mastermind', family: 'reference' }]
        m.selectionFinal = [...selection.selected, ...refs]
        save('selection-log.json', { ...selection, references: refs, frozenAt: new Date().toISOString(), hash: hash(JSON.stringify(m.selectionFinal)) })
        m.queues.holdout = selectedQueue('holdout', m.selectionFinal, 128); persist()
      }
      const deadline = started + phase.end * 60000, queue = m.queues[phase.id].filter(j => !completed.has(j.id))
      // Workers consume complete mirrored blocks together; admission reserves both jobs in parallel.
      const groups = []
      for (let i = 0; i < queue.length; i++) {
        const j = queue[i], next = queue[i + 1]
        if (j.block && next?.block === j.block && j.swap === false && next.swap === true) { groups.push([j, next]); i++ }
        else groups.push([j])
      }
      let nextGroup = 0
      const worker = async () => {
        while (!requested && nextGroup < groups.length) {
          const group = groups[nextGroup++]
          // Mirrored pairs occupy one scheduling lane and run serially, reserving twice the measured cost.
          const isPair = group.length === 2
          const remaining = deadline - performance.now()
          if (isPair && remaining < (group[0].points ? 120000 : 360000)) break
          for (const job of group) if (!(await execute(job, deadline))) return
          if (fs.statfsSync(out).bavail * fs.statfsSync(out).bsize < 1024 ** 3) { stop('DISK_LIMIT'); break }
        }
      }
      await Promise.all(Array.from({ length: phase.id === 'integrity' ? 1 : m.workers }, () => worker()))
      if (phase.id === 'integrity' && !requested) {
        const rs = m.queues.integrity.map(j => read(`jobs/${j.id}.json`))
        m.integrity = { status: rs.every(r => r.status === 'complete_point_sample' && r.fingerprint === rs[0].fingerprint) ? 'PASS' : 'INVALID', fingerprints: rs.map(r => r.fingerprint) }
        persist(); if (m.integrity.status !== 'PASS') throw new Error('Native/adapter/observer equivalence failed')
      }
      log({ event: 'phase-end', phase: phase.id, elapsedMs: elapsed() })
    }
    clearInterval(ticker)
    m.status = requested === 'PAUSED' ? 'PAUSED' : requested === 'STOPPED' ? 'STOPPED' : requested && requested !== 'TIME_BUDGET' ? 'FAILED' : 'FINISHED'
    m.stopReason = requested; m.finishedAt = m.status === 'PAUSED' ? null : new Date().toISOString(); persist()
    const summary = writeReport(out); save('summary.json', summary)
    log({ event: 'final', status: m.status, elapsedMs: elapsed() })
    console.log(JSON.stringify({ status: m.status, report: path.join(out, 'REPORT.md') }))
  } catch (e) {
    stop('FAILED'); clearInterval(ticker)
    await Promise.all([...active.values()].map(c => new Promise(resolve => c.once('close', resolve))))
    m.status = 'FAILED'; m.error = e.stack; persist()
    try { writeReport(out) } catch (reportError) { save('REPORT.md', `# Audit failed\n\n${e.stack}\n\nReport error: ${reportError.stack}\n`) }
    log({ event: 'failure', error: e.stack }); process.exitCode = 1
  } finally {
    clearInterval(ticker); fs.unlinkSync(lockFile)
  }
} else {
  console.log('Usage: node scripts/tactics-audit.mjs --prepare|--run|--pause|--stop|--resume|--report --output DIR [--smoke]')
}
