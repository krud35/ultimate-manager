/**
 * Czy założenie trenerskie zmienia zachowanie DRUŻYNY, która je dostała?
 *
 * Odpowiednik scripts/bench-player-instructions.mjs dla dyrektyw. Różnica jest w designie:
 * dyrektywa obejmuje cały skład, więc nie da się podzielić drużyny na grupę testową i
 * kontrolną. Zamiast tego bliźniacze drużyny w tym samym meczu (worker zamienia strony co
 * drugi mecz), a raportowana wartość to
 *
 *     efekt = (D − C) z dyrektywą  −  (D − C) w przebiegu bazowym
 *
 * gdzie D to drużyna z ustawieniem, C kontrolna. Przebieg bazowy (obie neutralne) leci
 * kilka razy na różnych seedach; rozrzut powtórzeń to podłoga szumu.
 *
 * Sondy mierzą zachowanie (głębokość stacka, cushion, kąt marka, udział poachów), nie
 * wynik meczu — dyrektywa ma zmieniać to, co drużyna ROBI.
 *
 * Env:
 *   MATCHES=24     — meczów na warunek
 *   POINTS=7
 *   REPLICAS=3     — powtórzeń baseline
 *   WORKERS=10
 *   ONLY=helpDeep,markShape
 *
 * Run: node scripts/bench-coach-directives.mjs
 */
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MATCHES = Number(process.env.MATCHES ?? 24)
const POINTS = Number(process.env.POINTS ?? 7)
const REPLICAS = Number(process.env.REPLICAS ?? 3)
const ROSTER_SIZE = 18
const SEED = 424242
const WORKERS = Math.max(
  1,
  Number(process.env.WORKERS ?? Math.min(10, os.cpus()?.length || 4)),
)
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map((s) => s.trim()) : null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'bench-coach-directives-worker.mjs')

function pct(a, b) {
  return b ? (a / b) * 100 : 0
}
function ratio(a, b) {
  return b ? a / b : 0
}

const METRICS = {
  /** m przed dyskiem, wzdłuż osi ataku — jak głęboko stoi stack. */
  stackDepthM: (s) => ratio(s.stackDepthSum, s.stackDepthN),
  cushionM: (s) => ratio(s.cushionSum, s.cushionN),
  /** ° od osi ataku: mały kąt = mark przed rzucającym, duży = rozciągnięty w bok. */
  markAngleDeg: (s) => ratio(s.markAngleSum, s.markAngleN),
  poachShare: (s) => pct(s.poachTicks, s.defTicks),
  /** % ticków obrońcy AKTUALNEGO resetu spędzonych w poachu. */
  resetPoachShare: (s) => pct(s.resetPoachTicks, s.resetDefTicks),
  /** Odstęp obrońcy od aktualnego resetu (m) — rośnie, gdy schodzi zamknąć throwing lane. */
  resetGapM: (s) => ratio(s.resetGapSum, s.resetDefTicks),
  /** Cushion najgłębszego obrońcy — sonda help deep. */
  deepCushionM: (s) => ratio(s.deepCushionSum, s.deepCushionN),
  deepThrowShare: (s) => pct(s.deep, s.succ),
  breakShare: (s) => pct(s.brk, s.brk + s.open),
  resetShare: (s) => pct(s.reset, s.succ),
  tightSepShare: (s) => pct(s.sepTight, s.sepN),
  holdMs: (s) => ratio(s.holdMs, s.holdN),
}

/**
 * Próg istotności per metryka, w jej własnych jednostkach — patrz analogiczny komentarz
 * w bench-player-instructions.mjs. Ostateczny próg to max(ten, 2 × rozrzut baseline).
 */
const MIN_DELTA = {
  stackDepthM: 1.5, // m — pół kroku nie robi różnicy w ustawieniu stacka
  cushionM: 0.22,
  markAngleDeg: 4, // °
  poachShare: 0.1, // pp
  resetPoachShare: 1.5, // pp
  resetGapM: 0.4, // m
  deepCushionM: 0.3,
  deepThrowShare: 3,
  breakShare: 5,
  resetShare: 2,
  tightSepShare: 2,
  holdMs: 250,
}

/**
 * Warunki: [klucz dyrektywy, wartość, metryka sondy, kierunek].
 * Bieguny testowane osobno — suwak musi działać w obie strony, nie tylko w jedną.
 */
const CONDITIONS = [
  // ── faza ataku ──
  ['huckAppetite', +1, 'deepThrowShare', +1],
  ['huckAppetite', -1, 'deepThrowShare', -1],
  ['breakAppetite', +1, 'breakShare', +1],
  ['breakAppetite', -1, 'breakShare', -1],
  ['passSelectivity', +1, 'tightSepShare', +1],
  ['passSelectivity', -1, 'tightSepShare', -1],
  ['possessionTempo', +1, 'holdMs', -1],
  ['possessionTempo', -1, 'holdMs', +1],
  ['stackDepth', +1, 'stackDepthM', +1],
  ['stackDepth', -1, 'stackDepthM', -1],
  // ── faza obrony ──
  ['coverageShade', +1, 'cushionM', +1],
  ['coverageShade', -1, 'cushionM', -1],
  ['cushionDepth', +1, 'cushionM', +1],
  ['cushionDepth', -1, 'cushionM', -1],
  ['markShape', +1, 'markAngleDeg', +1],
  ['markShape', -1, 'markAngleDeg', -1],
  ['poachSeeking', +1, 'poachShare', +1],
  ['poachSeeking', -1, 'poachShare', -1],
  ['helpDeep', +1, 'deepCushionM', +1],
  ['helpDeep', -1, 'deepCushionM', -1],
  ['poachResetHandler', 1, 'resetGapM', +1],
  // `creativity` nie ma czystej sondy zachowania: rozlewa się po progu akceptacji, szumie
  // decyzyjnym, hero throwach i poachach naraz. Zostaje w macierzy diagnostycznej.
  ['creativity', +1, 'poachShare', +1],
]

function runWorker(directive, value, seedBase) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        directive,
        value,
        matches: MATCHES,
        pointsToWin: POINTS,
        seedBase,
        rosterSize: ROSTER_SIZE,
      },
    })
    worker.on('message', resolve)
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exit ${code}`))
    })
  })
}

function paired(agg) {
  const out = {}
  for (const [name, fn] of Object.entries(METRICS)) out[name] = fn(agg.D) - fn(agg.C)
  return out
}
function absolute(agg) {
  const out = {}
  for (const [name, fn] of Object.entries(METRICS)) out[name] = fn(agg.C)
  return out
}

const conditions = ONLY
  ? CONDITIONS.filter(([key]) => ONLY.includes(key))
  : CONDITIONS

const jobs = [
  ...Array.from({ length: REPLICAS }, (_, r) => ({
    kind: 'base',
    replica: r,
    directive: null,
    value: 0,
    seedBase: (SEED + r * 104729) >>> 0,
  })),
  ...conditions.map(([key, value, metric, dir]) => ({
    kind: 'cond',
    directive: key,
    value,
    metric,
    dir,
    seedBase: SEED,
  })),
]

const results = []
let done = 0
const queue = [...jobs]

async function lane() {
  while (queue.length) {
    const job = queue.shift()
    const msg = await runWorker(job.directive, job.value, job.seedBase)
    results.push({ ...job, paired: paired(msg.agg), abs: absolute(msg.agg) })
    done += 1
    process.stderr.write(
      `[${done}/${jobs.length}] ${
        job.directive ? `${job.directive} ${job.value > 0 ? '+' : ''}${job.value}` : `baseline#${job.replica}`
      }\n`,
    )
  }
}

const t0 = Date.now()
await Promise.all(Array.from({ length: WORKERS }, lane))

const bases = results.filter((r) => r.kind === 'base')
const baseMean = {}
const baseSpread = {}
const baseAbs = {}
for (const name of Object.keys(METRICS)) {
  const vals = bases.map((b) => b.paired[name])
  baseMean[name] = vals.reduce((a, b) => a + b, 0) / vals.length
  baseSpread[name] = Math.max((Math.max(...vals) - Math.min(...vals)) / 2, 1e-9)
  baseAbs[name] =
    bases.reduce((a, b) => a + b.abs[name], 0) / bases.length
}

const lines = []
const say = (s = '') => {
  lines.push(s)
  console.log(s)
}

say('# Wpływ założeń trenerskich na zachowanie drużyny')
say(
  `# ${MATCHES} meczów/warunek, do ${POINTS} pkt, baseline ×${REPLICAS}, roster ${ROSTER_SIZE}, seed ${SEED}`,
)
say('# efekt = (D−C) z dyrektywą − (D−C) baseline;  próg = max(MIN_DELTA metryki, 2 × rozrzut baseline)')
say('')
say(
  ['dyrektywa'.padEnd(20), 'sonda'.padEnd(18), 'efekt'.padStart(9), 'próg'.padStart(8), 'szum'.padStart(8), 'baza'.padStart(9), '  wynik'].join(''),
)
say('-'.repeat(84))

let passed = 0
for (const job of conditions) {
  const [key, value, metric, dir] = job
  const r = results.find((x) => x.directive === key && x.value === value)
  const effect = r.paired[metric] - baseMean[metric]
  const noise = baseSpread[metric]
  const threshold = Math.max(MIN_DELTA[metric] ?? 0, 2 * noise)
  const ok = dir > 0 ? effect >= threshold : effect <= -threshold
  if (ok) passed += 1
  say(
    [
      `${key} ${value > 0 ? '+' : ''}${value}`.padEnd(20),
      `${metric}${dir > 0 ? '↑' : '↓'}`.padEnd(18),
      effect.toFixed(2).padStart(9),
      threshold.toFixed(2).padStart(8),
      noise.toFixed(2).padStart(8),
      baseAbs[metric].toFixed(2).padStart(9),
      ok ? '  PASS' : '  FAIL',
    ].join(''),
  )
}
say('-'.repeat(84))
say(`PASS ${passed}/${conditions.length}`)

say('')
say('## Pełna macierz metryk (efekt = (D−C) z dyrektywą − (D−C) baseline)')
const names = Object.keys(METRICS)
say(['warunek'.padEnd(20), ...names.map((m) => m.slice(0, 13).padStart(15))].join(''))
say(['[baza abs]'.padEnd(20), ...names.map((m) => baseAbs[m].toFixed(2).padStart(15))].join(''))
say(['[szum ±]'.padEnd(20), ...names.map((m) => baseSpread[m].toFixed(2).padStart(15))].join(''))
for (const [key, value] of conditions) {
  const r = results.find((x) => x.directive === key && x.value === value)
  say(
    [
      `${key} ${value > 0 ? '+' : ''}${value}`.padEnd(20),
      ...names.map((m) => (r.paired[m] - baseMean[m]).toFixed(2).padStart(15)),
    ].join(''),
  )
}

say('')
say(`czas: ${((Date.now() - t0) / 1000).toFixed(0)} s`)

fs.writeFileSync(path.join(__dirname, 'bench-coach-directives-results.txt'), lines.join('\n') + '\n')
process.exitCode = passed === conditions.length ? 0 : 1
