import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { makeRosters, selectedQueue, candidates } from './tactics-audit-plan.mjs'
import { makeTeam } from './tactics-audit-support.mjs'
import { selectConfigs } from './tactics-audit-report.mjs'

const root = process.cwd(), output = path.resolve(process.argv[2] ?? 'artifacts/engine-audit/tactics-8h/preflight-acceptance')
const rosters = makeRosters(), [a, b] = rosters.pairs[0].map(id => rosters.teams[id])
for (let i = 0; i < a.players.length; i++) assert.deepEqual({ ...a.players[i], id: 0 }, { ...b.players[i], id: 0 }, 'Paired roster differs beyond ID')
const game = makeTeam(a, { instructions: ['dump_first'], directives: { possessionTempo: -.5 } })
assert.equal(game.tactics.oLineCoachDirectives.possessionTempo, -.5)
assert.ok(Object.values(game.tactics.oLinePlayerInstructions).some(v => v.includes('dump_first')))
const holdout = selectedQueue('holdout', candidates.slice(0, 1), 18)
assert.equal(new Set(holdout.map(j => j.home.split('-')[1] + j.awayConfig.id)).size, 18, 'Each roster family needs all sentinels')
assert.ok(holdout.every(j => j.home.startsWith('holdout-') && j.away.startsWith('holdout-')))
assert.deepEqual(selectConfigs([], candidates, 4).selected, [], 'No data must not select winners')

const run = argv => new Promise(resolve => {
  const fd = fs.openSync(path.join(output, 'acceptance-process.log'), 'a')
  const child = spawn(process.execPath, ['scripts/tactics-audit.mjs', ...argv, '--output', output], { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd] })
  child.once('close', code => { fs.closeSync(fd); resolve(code) })
})
const prep = spawnSync(process.execPath, ['scripts/tactics-audit.mjs', '--prepare', '--smoke', '--output', output], { cwd: root, encoding: 'utf8', windowsHide: true })
assert.equal(prep.status, 0, prep.stderr)
const started = run(['--run'])
let paused = false
const timer = setInterval(() => {
  const file = path.join(output, 'coordinator.jsonl')
  if (!paused && fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('job-start')) {
    paused = true; fs.writeFileSync(path.join(output, 'PAUSE'), 'acceptance pause')
  }
}, 100)
assert.equal(await started, 0); clearInterval(timer)
let m = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')))
assert.equal(m.status, 'PAUSED'); assert.equal(m.activeWorkers.length, 0)
const elapsed = m.elapsedMs
assert.equal(await run(['--resume']), 0)
m = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')))
assert.equal(m.status, 'FINISHED'); assert.equal(m.integrity.status, 'PASS'); assert.ok(m.elapsedMs >= elapsed)
assert.equal(m.activeWorkers.length, 0)
const results = fs.readdirSync(path.join(output, 'jobs')).map(f => JSON.parse(fs.readFileSync(path.join(output, 'jobs', f))))
assert.equal(new Set(results.map(r => r.job.id)).size, results.length)
const control = results.find(r => r.job.phase === 'controls')
assert.equal(control.checkpoints[0].used.home.oLineCoachDirectives.possessionTempo, -.5)
assert.ok(Object.values(control.checkpoints[0].used.home.oLinePlayerInstructions).some(v => v.includes('dump_first')))
assert.ok(fs.existsSync(path.join(output, 'REPORT.md')))
assert.ok(results.every(r => ['complete', 'complete_point_sample'].includes(r.status) && !r.hardErrors?.length))
assert.equal(results.find(r => r.job.phase === 'coaches').status, 'complete', 'Full game must finish')
const failureOut = `${output}-fault`
const failurePrep = spawnSync(process.execPath, ['scripts/tactics-audit.mjs', '--prepare', '--smoke', '--output', failureOut], { cwd: root, encoding: 'utf8', windowsHide: true })
assert.equal(failurePrep.status, 0, failurePrep.stderr)
const failureManifest = path.join(failureOut, 'manifest.json')
const bad = JSON.parse(fs.readFileSync(failureManifest))
bad.queues.integrity[0].homeConfig.profile = '__intentional_acceptance_fault__'
fs.writeFileSync(failureManifest, JSON.stringify(bad))
const failed = spawnSync(process.execPath, ['scripts/tactics-audit.mjs', '--run', '--output', failureOut], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90000 })
assert.equal(failed.status, 1)
assert.equal(JSON.parse(fs.readFileSync(failureManifest)).status, 'FAILED')
assert.ok(fs.existsSync(path.join(failureOut, 'REPORT.md')))
const acceptance = { status: 'PASS', output, at: new Date().toISOString(),
  checks: ['mirrored fixtures', 'heldout roster/opponent crossing', 'empty selection', 'pause acknowledgement', 'resume no duplication', 'native/adapter/observer equivalence', 'actual instructions and directives', 'full production match', 'failure report', 'final report'],
  fullMatch: results.find(r => r.job.phase === 'coaches').timings,
  hashes: Object.fromEntries(['tactics-audit.mjs', 'tactics-audit-worker.mjs', 'tactics-audit-support.mjs', 'tactics-audit-plan.mjs', 'tactics-audit-report.mjs'].map(f => [f, createHash('sha256').update(fs.readFileSync(path.join(root, 'scripts', f))).digest('hex')])) }
fs.writeFileSync(path.join(output, 'ACCEPTANCE.json'), JSON.stringify(acceptance, null, 2))
console.log(JSON.stringify(acceptance))
