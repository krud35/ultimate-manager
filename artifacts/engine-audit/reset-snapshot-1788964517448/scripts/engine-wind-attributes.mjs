/** Kontrolowane eksperymenty, uruchamiane kolejno (bez konkurencji o CPU).
 * node scripts/engine-wind-attributes.mjs 16 8
 * To pomiar, nie test zgodności z nieudokumentowanym pasmem.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const fast = Number(process.argv[2] ?? 16), full = Number(process.argv[3] ?? 8)
if (![fast, full].every(n => Number.isInteger(n) && n >= 0)) throw new Error('Podaj nieujemne liczby meczów.')
const directory = path.join(root, 'artifacts/engine-audit/controlled')
fs.mkdirSync(directory, { recursive: true })
const cases = [
  ['calm', ['--wind', '0']],
  ['wind10', ['--wind', '10']],
  ['wind20', ['--wind', '20']],
  ['wind20-reversed', ['--wind', '20', '--direction', '180']],
  ['wind20-swapped', ['--wind', '20', '--swap']],
  ['huck-plus10', ['--wind', '20', '--attribute', 'throwing.huck', '--delta', '10']],
  ['endurance-plus10', ['--wind', '20', '--attribute', 'physical.endurance', '--delta', '10']],
]
const summary = {}
for (const [name, flags] of cases) {
  console.log(`Pomiar ${name}: ${fast} fast / ${full} pełnych`)
  const output = path.join(directory, name + '.json')
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/engine-realism.mjs'),
    '--fast', String(fast), '--full', String(full), '--offset', '7400', '--fixed-tactics', '--output', output, ...flags],
  { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `Błąd pomiaru ${name}`)
  const data = JSON.parse(fs.readFileSync(output, 'utf8'))
  summary[name] = Object.fromEntries(Object.entries(data.modes).map(([mode, value]) => [mode, value.summary]))
  for (const [mode, value] of Object.entries(summary[name])) {
    console.log(`${mode}: completion ${value.completionPct.toFixed(2)}%, hold ${value.holdPct.toFixed(2)}%, marża gospodarzy ${value.homeMargin.toFixed(2)}`)
  }
}
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
