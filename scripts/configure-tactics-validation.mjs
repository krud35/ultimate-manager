import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = path.join(root, 'artifacts/engine-audit')
const out = path.join(artifactRoot, 'tactics-balance-2026-10-03-validation')
const baseline = path.join(artifactRoot, 'tactics-balance-2026-10-03-v2')
const diagnostics = path.join(artifactRoot, 'tactics-balance-2026-10-03-diagnostics')
const phase = process.argv[2]
if (!['before', 'after'].includes(phase)) throw new Error('Use before|after')
const variant = process.argv[3] ?? phase
if (!/^[a-z0-9-]+$/.test(variant)) throw new Error('Invalid immutable variant name')
const version = path.join(out, variant)
if (fs.existsSync(path.join(version, 'version.json'))) throw new Error('Immutable version already configured')
fs.mkdirSync(version, { recursive: true })
const snapshot = phase === 'before' ? path.join(baseline, 'snapshot') : path.join(version, 'snapshot')
if (phase === 'after') {
  fs.mkdirSync(path.join(snapshot, 'scripts'), { recursive: true })
  fs.cpSync(path.join(root, 'src'), path.join(snapshot, 'src'), { recursive: true, errorOnExist: true, force: false })
  fs.copyFileSync(path.join(root, 'scripts/tactics-audit-support.mjs'), path.join(snapshot, 'scripts/tactics-audit-support.mjs'))
}
const oldPrefix = pathToFileURL(path.join(baseline, 'snapshot')).href
const newPrefix = pathToFileURL(snapshot).href
const worker = path.join(version, 'worker.mjs')
let workerSource = fs.readFileSync(path.join(diagnostics, 'diagnostic-worker.mjs'), 'utf8').replaceAll(oldPrefix, newPrefix)
let instrumentation = fs.readFileSync(path.join(diagnostics, 'instrumentation.mjs'), 'utf8')
if (phase === 'after') {
  // New engine failures replace fabricated goals. Retain the incomplete point
  // only as diagnostic evidence; it must never enter full-match estimates.
  const anchor = '} catch (error) {\n  result.status = error.code'
  if (!workerSource.includes(anchor)) throw new Error('Diagnostic error anchor missing')
  workerSource = workerSource.replace(anchor, `} catch (error) {
  if (error.code === 'POINT_SIMULATION_LIMIT') {
    result.failure = error.failure
    result.matchStatus = 'failed'
    hard('Point simulation limit: no score awarded')
    diagnostic.end(error.partialEvents ?? [], result.score, error.failure)
  }
  result.status = error.code`)
  instrumentation = instrumentation.replace('end(events, score) {', 'end(events, score, failure = null) {')
    .replace("const guard = scores.some", "const guard = !!failure || scores.some")
    .replace('const summary = { point, score, scores, guard,', 'const summary = { point, score, scores, guard, failure,')
}
fs.writeFileSync(worker, workerSource)
fs.writeFileSync(path.join(version, 'instrumentation.mjs'), instrumentation)
fs.copyFileSync(path.join(out, 'rosters.json'), path.join(version, 'rosters.json'))
fs.copyFileSync(path.join(out, 'queue.json'), path.join(version, 'queue.json'))
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const sourceHashes = {}
function hashTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) hashTree(filename)
    else sourceHashes[path.relative(snapshot, filename)] = sha(filename)
  }
}
hashTree(path.join(snapshot, 'src'))
sourceHashes['scripts/tactics-audit-support.mjs'] = sha(path.join(snapshot, 'scripts/tactics-audit-support.mjs'))
const config = { phase, variant, createdAt: new Date().toISOString(), sourceRoot: snapshot, sourceHashes,
  worker, workerHash: sha(worker), instrumentationHash: sha(path.join(version, 'instrumentation.mjs')) }
fs.writeFileSync(path.join(version, 'version.json'), JSON.stringify(config, null, 2))
fs.writeFileSync(path.join(version, 'manifest.json'), JSON.stringify({ status: 'VALIDATION',
  source: config.sourceRoot, phase, limitations: ['Fresh paired holdout; three independent roster/seed replicates per context.'] }))
console.log(JSON.stringify({ phase, worker, sourceFiles: Object.keys(sourceHashes).length }))
