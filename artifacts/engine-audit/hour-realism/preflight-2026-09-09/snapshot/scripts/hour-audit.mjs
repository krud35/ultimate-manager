import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { UFA_LEAGUE_TEAMS } from '../src/data/ufaLeagueTeams.js'
import { ensurePlayerStats, PLAYER_STAT_CATEGORIES } from '../src/models/playerStats.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { COACH_SLIDER_KEYS, COACH_DIRECTIVE_KIND } from '../src/matchEngine/coachDirectives.js'
import { TRAIT_DEFS } from '../src/models/playerTraits.js'
import { writeHourReport } from './hour-audit-report.mjs'

const args = process.argv.slice(2), value = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hash = data => createHash('sha256').update(data).digest('hex')
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)])
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2))
const seedBase = 190731709
const phases = [
  { id: 'integrity', end: 4 }, { id: 'situations', end: 10 }, { id: 'reference', end: 30 },
  { id: 'tactics', end: 42 }, { id: 'effects', end: 49 }, { id: 'stress', end: 54 }, { id: 'fast', end: 57 },
]
const sceneDefs = [
  { id: 'reset_stationary' }, { id: 'reset_moving', moving: true }, { id: 'reset_upline', x: 28 },
  { id: 'incut', moving: true, x: 50 }, { id: 'crowded', x: 65, hard: true },
  { id: 'deep', x: 25 }, { id: 'mark_break', y: 6 }, { id: 'zone_structure', layout: true },
  { id: 'sideline', y: .5 }, { id: 'endzone', x: 78 }, { id: 'turnover_pickup', pickup: true },
  ...[2, 5, 8].map(stall => ({ id: `stall_${stall}`, stall })),
]
function queueFor(rosters) {
  const queues = Object.fromEntries(phases.map(p => [p.id, []])); let counter = 0
  const add = (phase, job) => queues[phase].push({ id: `${phase}-${String(++counter).padStart(5, '0')}`, phase,
    kind: 'match', seed: seedBase + counter * 7919, observe: true, ...job })
  add('integrity', { pair: 'neutrality', observe: false, seed: seedBase, adaptive: false })
  add('integrity', { pair: 'neutrality', observe: true, seed: seedBase, adaptive: false })
  add('integrity', { pair: 'determinism', observe: true, seed: seedBase, adaptive: false })
  add('integrity', { kind: 'check', script: 'check-engine-realism.mjs' })
  add('situations', { kind: 'flight', n: 128 })
  // Round-robin by seed: each round covers every scene before adding repeats.
  for (let r = 0; r < 8; r++) add('situations', { kind: 'setups', cases: sceneDefs.flatMap(c => [false, true].flatMap(hard =>
    Array.from({ length: 4 }, (_, i) => ({ ...c, hard, seed: seedBase + 50000 + r * 4 + i, id: `${c.id}-${hard ? 'hard' : 'easy'}` })))) })
  for (let round = 0; round < 5; round++) for (let seedIndex = 0; seedIndex < 2; seedIndex++)
    for (let group = 0; group < 3; group++) for (let tactical = 0; tactical < 2; tactical++) for (const swap of [false, true]) {
      const [home, away] = rosters.pairs[group]
      add('reference', { home, away, group, tactical, swap, round, seedIndex,
        pair: `reference-${round}-${seedIndex}-${group}-${tactical}`, seed: seedBase + 100000 + round * 1009 + seedIndex * 101 + group * 17 + tactical,
        wind: { speedMph: [0, 7, 14][(group + seedIndex + tactical) % 3], directionDeg: [0, 90, 180][(seedIndex + tactical) % 3] },
        homePatch: { attack: tactical ? 'zone_offense' : 'horizontal_stack', defense: tactical ? 'zone_cup' : 'person' },
        awayPatch: { attack: tactical ? 'zone_offense' : 'vertical_stack', defense: tactical ? 'zone_wall' : 'person' } })
    }
  // Whole-match tactical pairs first, followed by the complete short-point matrix.
  for (let seed = 0; seed < 2; seed++) for (const defense of ['person', 'zone_cup']) add('tactics', {
    kind: 'match', pair: `defense-full-${seed}`, treatment: defense, seed: seedBase + 200000 + seed,
    adaptive: false, homePatch: { defense }, awayPatch: { attack: 'horizontal_stack' } })
  const cells = new Set()
  for (const attack of Object.values(ATTACK_STYLES)) for (const defense of ['person', 'zone_cup']) cells.add(`${attack}|${defense}`)
  for (const defense of Object.values(DEFENSE_STYLES)) for (const attack of ['horizontal_stack', 'zone_offense']) cells.add(`${attack}|${defense}`)
  for (let r = 0; r < 2; r++) for (const cell of cells) {
    const [attack, defense] = cell.split('|')
    add('tactics', { kind: 'match', points: 1, rotate: false, adaptive: false, cell, pair: `system-${r}`, seed: seedBase + 210000 + r,
      homePatch: { attack }, awayPatch: { defense } })
  }
  for (let r = 0; r < 2; r++) for (const directive of COACH_SLIDER_KEYS) for (const v of COACH_DIRECTIVE_KIND[directive] === 'toggle' ? [0, 1] : [0, -1, 1]) {
    add('tactics', { points: 1, adaptive: false, rotate: false, directive, value: v, pair: `coach-${directive}-${r}`,
      seed: seedBase + 220000 + r, homePatch: { directives: { [directive]: v } }, awayPatch: { directives: { [directive]: v } } })
  }
  for (const force of Object.values(FORCE_SIDES)) for (const y of [4, 33]) add('tactics', { kind: 'setups', force,
    awayPatch: { force }, cases: [0, 1].map(i => ({ id: `force-${force}-${y}`, y, hard: true, seed: seedBase + 230000 + i })) })
  // All atomics get two distinct contexts and all 3 levels before extra repeats.
  for (let r = 0; r < 16; r++) for (const [category, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) for (const key of keys) {
    add('effects', { kind: 'effects', attribute: `${category}.${key}`, repeat: r,
      variants: [0, -10, 10].map(delta => ({ category, key, delta })),
      cases: [{ id: 'open-moving', moving: true, seed: seedBase + 300000 + r },
        { id: 'pressure-wind', hard: true, stall: 5, wind: { speedMph: 15, directionDeg: 90 }, seed: seedBase + 310000 + r }] })
  }
  // Interleave state/trait coverage ahead of attribute repetitions beyond the first.
  const extra = []
  const traits = ['layout_machine', 'huck_lover', 'dump_guy', 'creative_thrower', 'deep_threat', 'under_cutter',
    'aggressive_cutter', 'hesitant_cutter', 'poacher', 'physical_mark', 'disciplined', 'safe_hands']
  for (const trait of traits) { if (!TRAIT_DEFS[trait]) throw new Error(`Unknown trait ${trait}`)
    extra.push({ kind: 'effects', trait, variants: [0, 1].map(v => ({ trait, value: v })),
      cases: Array.from({ length: 16 }, (_, i) => ({ id: i % 2 ? 'pressure' : 'open', hard: !!(i % 2), moving: true, seed: seedBase + 320000 + i })) }) }
  for (const [state, levels] of [['morale', [35, 65, 90]], ['energy', [25, 60, 100]], ['form', [25, 72, 99]]])
    extra.push({ kind: 'effects', state, variants: levels.map(v => ({ state, value: v })),
      cases: Array.from({ length: 16 }, (_, i) => ({ id: i % 2 ? 'pressure' : 'open', hard: !!(i % 2), stall: i % 2 ? 8 : 1, seed: seedBase + 330000 + i })) })
  const before = queues.effects.length
  for (const job of extra) add('effects', job)
  const inserted = queues.effects.splice(before); queues.effects.splice(Object.values(PLAYER_STAT_CATEGORIES).flat().length, 0, ...inserted)
  for (let i = 0; i < 4; i++) add('stress', { wind: { speedMph: [20, 30, 20, 30][i], directionDeg: [0, 90, 180, 270][i] },
    lockWind: true, benchSize: i > 1 ? 10 : undefined, energy: i > 1 ? 35 : undefined, group: 'stress' })
  for (const script of ['check-disc-intercept.mjs', 'check-arrival-window.mjs', 'check-route-planning.mjs', 'check-reset-cuts.mjs']) add('stress', { kind: 'check', script })
  for (let i = 0; i < 24; i++) { const reference = queues.reference[i]; add('fast', { ...reference, id: `fast-${reference.id}`, phase: 'fast', fast: true, observe: false, referenceId: reference.id }) }
  return queues
}

if (args.includes('--prepare')) {
  const out = path.resolve(value('--output', `artifacts/engine-audit/hour-realism/${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`))
  for (const dir of ['', 'jobs', 'inputs', 'checkpoints', 'replays', 'logs', 'snapshot']) fs.mkdirSync(path.join(out, dir), { recursive: true })
  const teams = structuredClone(UFA_LEAGUE_TEAMS)
  for (const t of teams) for (const p of t.players) ensurePlayerStats(p)
  const profiles = teams.map(t => {
    const values = t.players.map(p => Object.values(p.skills).flatMap(Object.values).filter(Number.isFinite))
    const avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)
    return { id: t.id, n: t.players.length, handlers: t.players.filter(p => /handler/i.test(p.position ?? p.role ?? '')).length,
      mean: avg(values.map(avg)), top7: avg(values.map(avg).sort((a, b) => b - a).slice(0, 7)),
      categories: Object.fromEntries(Object.keys(PLAYER_STAT_CATEGORIES).map(c => [c, avg(t.players.flatMap(p => Object.values(p.skills[c])))])) }
  }).sort((a, b) => b.top7 - a.top7)
  const middle = Math.floor(profiles.length / 2)
  const rosters = { source: 'Frozen league template, initialized atomic skills; no user career accessed', profiles,
    selection: 'Top-seven atomic-skill mean; full category, role and depth profiles retained for interpretation',
    pairs: [[profiles[0].id, profiles[1].id], [profiles[middle - 1].id, profiles[middle].id], [profiles[0].id, profiles.at(-1).id]],
    teams: Object.fromEntries(teams.map(t => [t.id, t])) }
  save(path.join(out, 'rosters.json'), rosters)
  const files = ['package.json', ...list(path.join(root, 'src')), ...list(path.join(root, 'scripts'))].map(f => path.isAbsolute(f) ? path.relative(root, f) : f)
  const hashes = {}
  for (const relative of files) {
    const source = path.join(root, relative), dest = path.join(out, 'snapshot', relative), data = fs.readFileSync(source)
    hashes[relative] = hash(data); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data)
  }
  if (files.some(f => hash(fs.readFileSync(path.join(root, f))) !== hashes[f])) throw new Error('Source changed during snapshot')
  const queues = queueFor(rosters)
  save(path.join(out, 'manifest.json'), { status: 'PREPARED', preparedAt: new Date().toISOString(), durationMs: 3600000,
    phases, seedBase, hashes, node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model,
    totalMemory: os.totalmem(), availableMemory: os.freemem(), workers: 1, workerHeapMb: 1536, diskBudgetBytes: 4 * 1024 ** 3,
    queues, thresholds: { completion: [90, 93], reset: [94, 96], minReferenceMatches: 24, minTacticalMatches: 4, minStressMatches: 4,
      displacementAlarm: 'distance > 0.5m + max(12m/s, endpoint speeds) * dt; review required',
      overlapAlarm: 'centers <0.45m and height difference <0.8m; not foul detection', staleObservationMs: 500 },
    limitations: ['No compatible real-match reference dataset supplied; external realism inconclusive.',
      'Controlled execution adapter omits point-level commitment guards; full matches use production point pipeline.',
      'Counterfactual alternate-action branches and automatic legal-possession oracle not implemented; review remains required.',
      'Trait probes modify one trait on both lineups; they measure global trait exposure, not an isolated individual causal effect.',
      'Coach point probes set both teams identically; they measure behavior response, not win advantage.',
      'Full-matrix interaction and full-field rotation probes remain uncovered unless separately recorded.'] })
  console.log(out)
} else if (args.includes('--run')) {
  const out = path.resolve(value('--output', ''))
  const manifestFile = path.join(out, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile))
  if (manifest.status !== 'PREPARED') throw new Error('Run already started or not prepared; use a fresh run directory')
  const snapshot = path.join(out, 'snapshot')
  for (const [file, expected] of Object.entries(manifest.hashes)) if (hash(fs.readFileSync(path.join(snapshot, file))) !== expected) throw new Error(`Snapshot mismatch ${file}`)
  const started = performance.now(), startIso = new Date().toISOString()
  const append = row => fs.appendFileSync(path.join(out, 'jobs.jsonl'), JSON.stringify(row) + '\n')
  manifest.status = 'RUNNING'; manifest.startedAt = startIso; save(manifestFile, manifest)
  let interrupted = false
  process.on('SIGINT', () => { interrupted = true })
  async function execute(job, deadline) {
    const remaining = deadline - performance.now(); if (remaining < 3000) return false
    const budgetMs = Math.min(remaining - 700, job.kind === 'match' && !job.points ? 150000 : job.kind === 'flight' ? 180000 : 60000)
    job = { ...job, budgetMs }
    const input = path.join(out, 'inputs', `${job.id}.json`); save(input, job)
    const script = job.kind === 'check' ? job.script : job.kind === 'flight' ? 'calibrate-situations.mjs' : 'hour-audit-worker.mjs'
    const argv = ['--max-old-space-size=1536', path.join(snapshot, 'scripts', script)]
    if (job.kind === 'flight') argv.push('--n', String(job.n), '--offset', String(job.seed), '--output', path.join(out, 'flight.json').replaceAll('\\', '/'))
    else if (job.kind !== 'check') argv.push(input, out)
    const log = fs.openSync(path.join(out, 'logs', `${job.id}.log`), 'w')
    const t = performance.now(); append({ event: 'start', id: job.id, phase: job.phase, elapsedMs: t - started, budgetMs })
    await new Promise(resolve => {
      const child = spawn(process.execPath, argv, { cwd: snapshot, windowsHide: true, stdio: ['ignore', log, log] })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, budgetMs)
      child.on('error', error => { append({ event: 'spawn-error', id: job.id, error: error.message }); resolve() })
      child.on('close', code => { clearTimeout(timer); fs.closeSync(log)
        const file = path.join(out, 'jobs', `${job.id}.json`)
        if (!fs.existsSync(file)) save(file, { job, status: timedOut ? 'timeout' : code === 0 ? 'complete_external_check' : 'error', code,
          log: `logs/${job.id}.log`, timings: { wallMs: performance.now() - t } })
        append({ event: 'end', id: job.id, code, timedOut, elapsedMs: performance.now() - started, wallMs: performance.now() - t })
        resolve()
      })
    })
    console.log(JSON.stringify({ phase: job.phase, job: job.id, elapsedMinutes: +((performance.now() - started) / 60000).toFixed(2) }))
    save(path.join(out, 'progress.json'), { phase: job.phase, lastJob: job.id, elapsedMs: performance.now() - started, updatedAt: new Date().toISOString() })
    return true
  }
  for (const phase of manifest.phases) {
    if (interrupted) break
    const deadline = started + phase.end * 60000
    const queue = manifest.queues[phase.id]
    for (const job of queue) {
      if (interrupted || !(await execute(job, deadline))) break
      if (fs.statfsSync(out).bavail * fs.statfsSync(out).bsize < 1024 ** 3) { interrupted = true; manifest.stopReason = 'Less than 1 GiB disk free'; break }
    }
    // Preserve scheduled coverage windows; idle budget is observable, not counted as work.
    if (!interrupted && performance.now() < deadline) {
      console.log(JSON.stringify({ phase: phase.id, queueFinished: true, remainingSeconds: Math.round((deadline - performance.now()) / 1000) }))
      while (!interrupted && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - performance.now())))
    }
    if (phase.id === 'integrity') {
      const checks = queue.slice(0, 3).map(j => JSON.parse(fs.readFileSync(path.join(out, 'jobs', `${j.id}.json`))))
      manifest.integrity = { fingerprints: checks.map(c => c.fingerprint), status: checks.every(c => c.status === 'complete' && c.fingerprint === checks[0].fingerprint) ? 'PASS' : 'INVALID' }
      save(manifestFile, manifest)
      if (manifest.integrity.status !== 'PASS') { interrupted = true; manifest.stopReason = 'Observer neutrality or repeatability failed'; break }
    }
  }
  manifest.simulationsEndedAt = new Date().toISOString(); manifest.simulationWallMs = performance.now() - started
  manifest.status = interrupted ? 'INTERRUPTED' : 'REPORTING'; save(manifestFile, manifest)
  writeHourReport(out)
  while (!interrupted && performance.now() - started < 3600000) await new Promise(resolve => setTimeout(resolve, Math.min(1000, 3600000 - (performance.now() - started))))
  manifest.status = interrupted ? 'INTERRUPTED' : 'FINISHED'; manifest.finishedAt = new Date().toISOString(); manifest.elapsedMs = performance.now() - started
  save(manifestFile, manifest); writeHourReport(out)
  console.log(JSON.stringify({ finished: true, output: out, elapsedMs: manifest.elapsedMs, status: manifest.status }))
} else throw new Error('Use --prepare or --run --output <directory>')
