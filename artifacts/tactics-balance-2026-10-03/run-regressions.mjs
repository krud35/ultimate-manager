import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const directory = path.resolve(process.argv[2] ?? 'artifacts/tactics-balance-2026-10-03/regression')
fs.mkdirSync(directory, { recursive: true })
const tests = [
  'test-tactics-force-geometry.mjs', 'test-tactics-poach-regression.mjs', 'test-tactics-risk-window.mjs',
  'test-tactics-catch-continuity.mjs', 'test-cutter-boundary-continuity.mjs', 'test-reset-decision-pressure.mjs',
  'test-tactical-behavior-fixes.mjs', 'test-cutter-offer-continuity.mjs', 'test-pull-and-active-cutters.mjs',
  'check-reset-cuts.mjs', 'check-route-planning.mjs', 'test-new-playing-styles.mjs', 'test-style-specialties.mjs',
  'test-full-no-replay.mjs',
  'test-tactics-action-limit.mjs', 'test-tactics-forward-priority.mjs', 'test-hex-structural-continuity.mjs',
]
const results = []
for (const name of tests) {
  const started = Date.now()
  const result = spawnSync(process.execPath, ['--max-old-space-size=768', `scripts/${name}`],
    { encoding: 'utf8', windowsHide: true, timeout: 300000 })
  fs.writeFileSync(path.join(directory, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''))
  const row = { name, exitCode: result.status, error: result.error?.message, wallMs: Date.now() - started }
  results.push(row)
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
  console.log(JSON.stringify(row))
}
if (results.some(row => row.exitCode !== 0)) process.exitCode = 1
