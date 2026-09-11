/**
 * Czy rozkaz indywidualny w ogóle zmienia zachowanie ZAWODNIKA?
 *
 * Design sparowany split-squad (patrz worker): w drużynie home parzyste id dostają rozkaz,
 * nieparzyste nie. Raportowana wartość to
 *
 *     efekt = (A − B) w warunku z rozkazem  −  (A − B) w przebiegu bazowym
 *
 * czyli różnica między grupą instruowaną a kontrolną, oczyszczona z wrodzonej asymetrii
 * obu połówek składu. Baseline puszczany jest kilka razy na różnych seedach — rozrzut
 * tych powtórzeń daje podłogę szumu, a próg zaliczenia to `max(minDelta, 2 × rozrzut)`.
 *
 * Sondy mierzą zachowanie (kąt cutu, cushion, poach, czas trzymania dysku), nie wynik
 * drużyny: rozkaz ma zmieniać to, co zawodnik ROBI.
 *
 * Env:
 *   MATCHES=20     — meczów na warunek
 *   POINTS=7       — punktów do wygranej
 *   REPLICAS=3     — powtórzeń baseline (estymacja szumu)
 *   WORKERS=10
 *   ONLY=cut_deep,poach  — ogranicz do wybranych rozkazów
 *
 * Run: node scripts/bench-player-instructions.mjs
 */
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLAYER_INSTRUCTION_IDS } from '../src/matchEngine/playerInstructions.js'

const MATCHES = Number(process.env.MATCHES ?? 20)
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
const WORKER_PATH = path.join(__dirname, 'bench-player-instructions-worker.mjs')

/**
 * Próg istotności per METRYKA, w jej własnych jednostkach — "o ile musi się zmienić
 * zachowanie zawodnika, żeby to była realna zmiana, a nie drgnięcie".
 *
 * Jeden wspólny próg względny (15% bazy) nie działał: dla staminy (baza 88) dawał absurdalne
 * 13 punktów, dla shade (baza 0.09 m) — 0.01 m, czyli poniżej szumu. Progi są tu dobrane po
 * zmierzeniu wartości bazowych i drukowane obok nich w raporcie, więc każdy da się sprawdzić.
 * Ostateczny próg to i tak max(ten próg, 2 × rozrzut baseline) — szum nigdy nie przechodzi.
 */
const MIN_DELTA = {
  deepThrowShare: 3, // pp, baza ~16 — trzy punkty to widoczna zmiana repertuaru rzutów
  breakShare: 5, // pp, baza ~44
  resetShare: 2, // pp, baza ~9
  tightSepShare: 2, // pp, baza ~13
  holdMs: 250, // ćwierć sekundy dłużej/krócej z dyskiem widać w podglądzie akcji
  cutFwdPerCutM: 0.9, // m na cut, baza ~6
  cutInitPer1k: 0.35, // inicjacji cutu na 1000 ticków, baza ~2.5
  waitLaneM: 0.6, // m w poprzek boiska — pół kroku w bok to inne ustawienie
  cushionM: 0.22, // m — na 1.6 m bazowego cushionu to wyraźnie ciaśniej/luźniej
  shadeM: 0.25, // m wzdłuż osi ataku; baza bliska zeru, więc próg jest bezwzględny
  poachShare: 0.1, // pp ticków w poachu; baza ~0.15 pp, patrz uwaga przy no_poach
  // Poniższe trzy nie bramkują dziś żadnego rozkazu — zostają jako metryki diagnostyczne
  // w pełnej macierzy (ile zawodnik biegał, jak szybko, ile go to kosztowało staminy).
  moveSpeedMps: 0.3,
  runMPer1k: 3,
  staminaMean: 1.5,
}

/** Sonda per rozkaz: [metryka, kierunek]. Próg bierze się z MIN_DELTA. */
const PROBES = {
  // Nie huckShare: etykieta "huck" pada dopiero od HUCK_MIN_M = 35 m i przy bazie ~7%
  // rzutów jest zbyt rzadka, by uczciwie zmierzyć przechył. Realny dystans jest gęstszy.
  throw_hucks: ['deepThrowShare', +1],
  no_hucks: ['deepThrowShare', -1],
  break_mark: ['breakShare', +1],
  no_break_mark: ['breakShare', -1],
  dump_first: ['resetShare', +1],
  look_downfield: ['resetShare', -1],
  safe_throws: ['tightSepShare', -1],
  take_risks: ['tightSepShare', +1],
  cut_deep: ['cutFwdPerCutM', +1],
  cut_under: ['cutFwdPerCutM', -1],
  play_fast: ['holdMs', -1],
  play_slow: ['holdMs', +1],
  dominate: ['cutInitPer1k', +1],
  wait_your_turn: ['cutInitPer1k', -1],
  take_space: ['waitLaneM', -1],
  give_space: ['waitLaneM', +1],
  tight_mark: ['cushionM', -1],
  loose_mark: ['cushionM', +1],
  shade_deep: ['shadeM', +1],
  shade_under: ['shadeM', -1],
  // Baza poachów to ~0.15% ticków obrońcy — zakaz może zdjąć najwyżej tyle. Jeśli poach ma
  // być realną decyzją trenera, trzeba osobno podnieść bazę w tacticsBehavior.js.
  poach: ['poachShare', +1],
  no_poach: ['poachShare', -1],
}

/** Wszystkie metryki, jakie liczymy — raport pokazuje je obok sondy właściwej. */
const METRICS = {
  huckShare: (s) => pct(s.huck, s.thr),
  // Etykieta „huck" pada dopiero od HUCK_MIN_M = 35 m i przy bazie ~8% jest zbyt rzadka,
  // by uczciwie mierzyć przechył. Realny dystans, na jakim gra rzucający, jest gęstszy.
  deepThrowShare: (s) => pct(s.deep, s.succ),
  meanThrowM: (s) => ratio(s.yards, s.succ),
  breakShare: (s) => pct(s.brk, s.brk + s.open),
  resetShare: (s) => pct(s.reset, s.succ),
  tightSepShare: (s) => pct(s.sepTight, s.sepN),
  holdMs: (s) => ratio(s.holdMs, s.holdN),
  cutFwdPerCutM: (s) => ratio(s.cutFwdM, s.cutInits),
  cutInitPer1k: (s) => ratio(s.cutInits * 1000, s.offTicks),
  waitLaneM: (s) => ratio(s.waitLaneSum, s.waitTicks),
  cushionM: (s) => ratio(s.cushionSum, s.cushionN),
  shadeM: (s) => ratio(s.shadeSum, s.shadeN),
  poachShare: (s) => pct(s.poachTicks, s.defTicks),
  runMPer1k: (s) => ratio(s.runM * 1000, s.allTicks),
  moveSpeedMps: (s) => ratio(s.runM, s.moveTicks * 0.02),
  staminaMean: (s) => ratio(s.staminaSum, s.staminaN),
}

function pct(a, b) {
  return b ? (a / b) * 100 : 0
}
function ratio(a, b) {
  return b ? a / b : 0
}

/** Różnica grupa-z-rozkazem minus grupa-kontrolna, dla każdej metryki. */
function paired(acc) {
  const out = {}
  for (const [name, fn] of Object.entries(METRICS)) out[name] = fn(acc.A) - fn(acc.B)
  return out
}

/**
 * Bezwzględne wartości metryk w grupie kontrolnej. Bez nich próg jest nieczytelny:
 * „1.50" znaczy co innego przy bazie 3 (połowa zachowania) niż przy bazie 40 (4%).
 */
function absolute(acc) {
  const out = {}
  for (const [name, fn] of Object.entries(METRICS)) out[name] = fn(acc.B)
  return out
}

function runWorker(instruction, seedBase) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        instruction,
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

const instructions = (ONLY ?? PLAYER_INSTRUCTION_IDS).filter((id) => {
  if (!PROBES[id]) {
    process.stderr.write(`! brak sondy dla ${id} — pomijam\n`)
    return false
  }
  return true
})

/** Kolejka zadań: REPLICAS przebiegów bazowych + po jednym na rozkaz. */
const jobs = [
  ...Array.from({ length: REPLICAS }, (_, r) => ({
    kind: 'base',
    replica: r,
    instruction: null,
    seedBase: (SEED + r * 104729) >>> 0,
  })),
  ...instructions.map((id) => ({ kind: 'instr', instruction: id, seedBase: SEED })),
]

const results = []
let done = 0
const queue = [...jobs]

async function lane() {
  while (queue.length) {
    const job = queue.shift()
    const msg = await runWorker(job.instruction, job.seedBase)
    results.push({ ...job, paired: paired(msg.acc), abs: absolute(msg.acc), acc: msg.acc })
    done += 1
    process.stderr.write(
      `[${done}/${jobs.length}] ${job.instruction ?? `baseline#${job.replica}`}\n`,
    )
  }
}

const t0 = Date.now()
await Promise.all(Array.from({ length: WORKERS }, lane))

// --- agregacja ---
const bases = results.filter((r) => r.kind === 'base').map((r) => r.paired)
const baseAbs = {}
{
  const absRuns = results.filter((r) => r.kind === 'base').map((r) => r.abs)
  for (const name of Object.keys(METRICS)) {
    baseAbs[name] = absRuns.reduce((a, b) => a + b[name], 0) / absRuns.length
  }
}
const baseMean = {}
const baseSpread = {}
for (const name of Object.keys(METRICS)) {
  const vals = bases.map((b) => b[name])
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  baseMean[name] = mean
  // Rozrzut powtórzeń baseline = podłoga szumu tej metryki przy tej liczbie meczów.
  baseSpread[name] = Math.max((max - min) / 2, 1e-9)
}

const lines = []
const say = (s = '') => {
  lines.push(s)
  console.log(s)
}

say(`# Wpływ rozkazów indywidualnych na zachowanie zawodnika`)
say(
  `# ${MATCHES} meczów/warunek, do ${POINTS} pkt, baseline ×${REPLICAS}, roster ${ROSTER_SIZE}, seed ${SEED}`,
)
say(
  `# efekt = (A−B) z rozkazem − (A−B) baseline;  próg = max(MIN_DELTA metryki, 2 × rozrzut baseline)`,
)
say('')
say(
  ['rozkaz'.padEnd(16), 'sonda'.padEnd(15), 'efekt'.padStart(9), 'próg'.padStart(8), 'szum'.padStart(8), '  wynik'].join(''),
)
say('-'.repeat(74))

let passed = 0
const rows = []
for (const id of instructions) {
  const r = results.find((x) => x.instruction === id)
  const [metric, dir] = PROBES[id]
  const effect = r.paired[metric] - baseMean[metric]
  const noise = baseSpread[metric]
  const threshold = Math.max(MIN_DELTA[metric] ?? 0, 2 * noise)
  const ok = dir > 0 ? effect >= threshold : effect <= -threshold
  if (ok) passed += 1
  rows.push({ id, metric, dir, effect, threshold, noise, ok })
  say(
    [
      id.padEnd(16),
      `${metric}${dir > 0 ? '↑' : '↓'}`.padEnd(15),
      effect.toFixed(2).padStart(9),
      threshold.toFixed(2).padStart(8),
      noise.toFixed(2).padStart(8),
      baseAbs[metric].toFixed(2).padStart(9),
      ok ? '  PASS' : '  FAIL',
    ].join(''),
  )
}
say('-'.repeat(74))
say(`PASS ${passed}/${instructions.length}`)

say('')
say('## Pełna macierz metryk (efekt = (A−B) z rozkazem − (A−B) baseline)')
const metricNames = Object.keys(METRICS)
say(['rozkaz'.padEnd(16), ...metricNames.map((m) => m.slice(0, 13).padStart(14))].join(''))
say(['[baza abs]'.padEnd(16), ...metricNames.map((m) => baseAbs[m].toFixed(2).padStart(14))].join(''))
say(['[szum ±]'.padEnd(16), ...metricNames.map((m) => baseSpread[m].toFixed(2).padStart(14))].join(''))
for (const id of instructions) {
  const r = results.find((x) => x.instruction === id)
  say(
    [
      id.padEnd(16),
      ...metricNames.map((m) => (r.paired[m] - baseMean[m]).toFixed(2).padStart(14)),
    ].join(''),
  )
}

say('')
say(`czas: ${((Date.now() - t0) / 1000).toFixed(0)} s`)

fs.writeFileSync(path.join(__dirname, 'bench-player-instructions-results.txt'), lines.join('\n') + '\n')
process.exitCode = passed === instructions.length ? 0 : 1
