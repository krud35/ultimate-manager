/**
 * Benchmark: czy dynamiczna adaptacja taktyk AI poprawia wynik?
 *
 * Runda 1: równe składy | AI1 fixed vs AI2 adaptive
 * Runda 2: AI1 lepszy skład | AI1 fixed vs AI2 adaptive
 * Runda 3: równe składy | obu adaptive
 * Runda 4: AI1 lepszy skład | obu adaptive
 *
 * Env:
 *   MATCHES=100   — meczów na rundę
 *   POINTS=9      — skrócony mecz (domyślnie 9; pełny UFA = 15)
 *   WORKERS=8     — równoległe workery na rundę
 *
 * Run: node scripts/bench-ai-tactics-adapt.mjs
 */
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MATCH_CONFIG } from '../src/matchEngine/index.js'

const MATCHES_PER_ROUND = Number(process.env.MATCHES ?? 100)
const POINTS_TO_WIN = Number(process.env.POINTS ?? 9)
const WORKERS = Math.max(
  1,
  Number(process.env.WORKERS ?? Math.min(8, os.cpus()?.length || 4)),
)
const STRONGER_DELTA = 3.5
const ROSTER_SIZE = 18

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'bench-ai-tactics-adapt-worker.mjs')

MATCH_CONFIG.pointsToWin = POINTS_TO_WIN

function pct(n, d) {
  if (!d) return '0.0%'
  return `${((100 * n) / d).toFixed(1)}%`
}

function emptyAgg() {
  return {
    n: 0,
    homeWins: 0,
    awayWins: 0,
    draws: 0,
    homeGoals: 0,
    awayGoals: 0,
    homeChangedAny: 0,
    awayChangedAny: 0,
    homeAttackChanges: 0,
    awayAttackChanges: 0,
    homeDefenseChanges: 0,
    awayDefenseChanges: 0,
    homeHuckChanges: 0,
    awayHuckChanges: 0,
    adaptiveSideWins: 0,
    fixedSideWins: 0,
    avgHomeOvr: 0,
    avgAwayOvr: 0,
  }
}

function mergeAgg(into, part) {
  for (const k of Object.keys(into)) {
    into[k] += part[k] ?? 0
  }
  return into
}

function runWorkerBatch(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { workerData })
    let agg = null
    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        // handled by parent progress tracker via separate channel — ignore here
      } else if (msg.type === 'result') {
        agg = msg.agg
      }
    })
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited ${code}`))
      else if (!agg) reject(new Error('Worker finished without result'))
      else resolve(agg)
    })
  })
}

async function runRoundParallel(roundCfg, roundIndex) {
  const batches = []
  const base = Math.floor(MATCHES_PER_ROUND / WORKERS)
  let rem = MATCHES_PER_ROUND % WORKERS
  let offset = 0

  for (let w = 0; w < WORKERS; w += 1) {
    const n = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem -= 1
    if (n <= 0) continue
    batches.push({
      matches: n,
      seedBase: (20260807 + roundIndex * 1_000_003 + offset * 17) >>> 0,
      homeStronger: roundCfg.homeStronger,
      aiHome: roundCfg.aiHome,
      aiAway: roundCfg.aiAway,
      mode: roundCfg.mode,
      strongerDelta: STRONGER_DELTA,
      rosterSize: ROSTER_SIZE,
      pointsToWin: POINTS_TO_WIN,
    })
    offset += n
  }

  const t0 = Date.now()
  process.stdout.write(`${roundCfg.short}: start (${batches.length} workers, ${MATCHES_PER_ROUND} meczów)...\n`)

  const parts = await Promise.all(batches.map((b) => runWorkerBatch(b)))
  const agg = emptyAgg()
  for (const p of parts) mergeAgg(agg, p)

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  process.stdout.write(`${roundCfg.short}: done in ${elapsed}s  H${agg.homeWins}-A${agg.awayWins}\n`)
  return summarizeRound(roundCfg.title, roundCfg.desc, agg, roundCfg.expect)
}

function summarizeRound(title, desc, agg, expect) {
  const n = agg.n
  const homeWr = pct(agg.homeWins, n)
  const awayWr = pct(agg.awayWins, n)
  const gd = (agg.homeGoals - agg.awayGoals) / Math.max(1, n)
  const avgHs = (agg.homeGoals / Math.max(1, n)).toFixed(2)
  const avgAs = (agg.awayGoals / Math.max(1, n)).toFixed(2)

  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log(desc)
  console.log('-'.repeat(72))
  console.log(`Mecze: ${n}  |  do ${POINTS_TO_WIN} pkt (skrócony bench; pełny UFA=15)`)
  console.log(
    `OVR śr. AI1(home)=${(agg.avgHomeOvr / n).toFixed(1)}  AI2(away)=${(agg.avgAwayOvr / n).toFixed(1)}`,
  )
  console.log(`AI1 (home) W-L: ${agg.homeWins}-${agg.awayWins}  (${homeWr} wygranych)`)
  console.log(`AI2 (away) W-L: ${agg.awayWins}-${agg.homeWins}  (${awayWr} wygranych)`)
  console.log(`Śr. wynik: ${avgHs}–${avgAs}  |  GD home: ${gd >= 0 ? '+' : ''}${gd.toFixed(2)}`)
  console.log(
    `Zmiany taktyk AI1: any ${pct(agg.homeChangedAny, n)} (atk ${pct(agg.homeAttackChanges, n)}, def ${pct(agg.homeDefenseChanges, n)}, huck ${pct(agg.homeHuckChanges, n)})`,
  )
  console.log(
    `Zmiany taktyk AI2: any ${pct(agg.awayChangedAny, n)} (atk ${pct(agg.awayAttackChanges, n)}, def ${pct(agg.awayDefenseChanges, n)}, huck ${pct(agg.awayHuckChanges, n)})`,
  )
  if (expect) console.log(`Oczekiwanie: ${expect}`)

  let verdict = ''
  if (title.includes('Runda 1')) {
    const adaptiveEdge = agg.awayWins - agg.homeWins
    if (agg.awayChangedAny < n * 0.15) {
      verdict =
        'Adaptacja rzadko się odpala — trudno ocenić jakość reakcji (za mało zmian).'
    } else if (adaptiveEdge >= n * 0.08) {
      verdict = `AI2 (adaptive) wygrywa wyraźnie częściej (+${adaptiveEdge} W) — adaptacja pomaga przy równych składach.`
    } else if (adaptiveEdge <= -n * 0.08) {
      verdict = `AI2 (adaptive) przegrywa częściej (${adaptiveEdge} W) — adaptacja szkodzi lub jest zbyt agresywna.`
    } else {
      verdict = `Remisowy układ (±${Math.abs(adaptiveEdge)} W) — adaptacja nie daje wyraźnej przewagi przy równych składach.`
    }
  } else if (title.includes('Runda 2')) {
    const gapClosed = agg.awayWins / Math.max(1, n)
    if (gapClosed >= 0.42) {
      verdict = `Słabszy AI2 (adaptive) trzyma się dobrze (${pct(agg.awayWins, n)}) — adaptacja rekompensuje gorszy skład.`
    } else if (gapClosed >= 0.32) {
      verdict = `AI1 (lepszy, fixed) wygrywa częściej, ale AI2 adaptive nie pada całkowicie (${pct(agg.awayWins, n)}).`
    } else {
      verdict = `Przewaga składu AI1 dominuje (${pct(agg.homeWins, n)}) — adaptacja słabo rekompensuje różnicę OVR.`
    }
  } else if (title.includes('Runda 3')) {
    const imbalance = Math.abs(agg.homeWins - agg.awayWins)
    if (imbalance <= n * 0.12) {
      verdict = `Oba adaptive ≈ 50/50 (ΔW=${imbalance}) — system stabilny, bez silnego biasu home/away.`
    } else {
      verdict = `Skew ${homeWr} vs ${awayWr} (ΔW=${imbalance}) — możliwy bias strony lub szum.`
    }
  } else if (title.includes('Runda 4')) {
    if (agg.homeWins >= agg.awayWins + n * 0.08) {
      verdict = `Lepszy skład + adaptive wygrywa (${homeWr}) — jakość składu wciąż ważniejsza niż sam fakt adaptacji obu stron.`
    } else if (agg.awayWins > agg.homeWins) {
      verdict = `Słabszy away wygrywa mimo gorszego OVR — niespodzianka / szum / efekt pull.`
    } else {
      verdict = `Lekka przewaga silniejszego (${homeWr}) — obie strony adaptive, różnica składu wciąż widoczna.`
    }
  }
  console.log(`Wniosek: ${verdict}`)
  return { ...agg, verdict, homeWr, awayWr, gd }
}

const rounds = [
  {
    short: 'R1',
    title: 'Runda 1 — równe składy | fixed vs adaptive',
    desc: 'AI1 (home): stała taktyka cały mecz. AI2 (away): dynamiczna adaptacja między punktami. Identyczne OVR i startowe style.',
    homeStronger: false,
    aiHome: false,
    aiAway: true,
    mode: 'fixed_vs_adaptive',
    expect: 'Jeśli adaptacja pomaga → AI2 > ~50% wygranych.',
  },
  {
    short: 'R2',
    title: 'Runda 2 — AI1 lepszy skład | fixed vs adaptive',
    desc: `AI1 (home): +${STRONGER_DELTA} do skilli, stała taktyka. AI2 (away): bazowy skład, adaptacja.`,
    homeStronger: true,
    aiHome: false,
    aiAway: true,
    mode: 'fixed_vs_adaptive',
    expect: 'Czy adaptacja AI2 zawęża lukę wynikającą z OVR?',
  },
  {
    short: 'R3',
    title: 'Runda 3 — równe składy | adaptive vs adaptive',
    desc: 'Obie strony adaptują. Identyczne OVR i startowe style — baseline szumu / biasu strony.',
    homeStronger: false,
    aiHome: true,
    aiAway: true,
    mode: 'both_adaptive',
    expect: 'Powinno być blisko 50/50.',
  },
  {
    short: 'R4',
    title: 'Runda 4 — AI1 lepszy skład | adaptive vs adaptive',
    desc: `Obie strony adaptują. AI1 ma +${STRONGER_DELTA} skilli — czy przewaga składu utrzymuje się?`,
    homeStronger: true,
    aiHome: true,
    aiAway: true,
    mode: 'both_adaptive',
    expect: 'AI1 powinien wygrywać częściej dzięki OVR.',
  },
]

console.log('AI tactics adaptation bench')
console.log(
  `Meczy/rundę: ${MATCHES_PER_ROUND}  |  pointsToWin: ${POINTS_TO_WIN}  |  workers: ${WORKERS}`,
)
console.log(`Roster: ${ROSTER_SIZE}  |  stronger delta: +${STRONGER_DELTA}`)

const wall0 = Date.now()
const summaries = []

for (let i = 0; i < rounds.length; i += 1) {
  summaries.push(await runRoundParallel(rounds[i], i))
}

console.log('\n' + '#'.repeat(72))
console.log('PODSUMOWANIE KOŃCOWE')
console.log('#'.repeat(72))
for (let i = 0; i < summaries.length; i += 1) {
  const s = summaries[i]
  const r = rounds[i]
  console.log(
    `${r.short}: AI1 ${s.homeWins}-${s.awayWins} AI2 (${s.homeWr} / ${s.awayWr}) | ` +
      `zmiany AI1 ${pct(s.homeChangedAny, s.n)} AI2 ${pct(s.awayChangedAny, s.n)}`,
  )
  console.log(`     ${s.verdict}`)
}

const [r1, r2, r3, r4] = summaries
console.log('\nOcena jakości adaptacji:')
const r1AdaptiveWr = r1.awayWins / Math.max(1, r1.n)
const r3Balance = Math.abs(r3.homeWins - r3.awayWins) / Math.max(1, r3.n)
const r2AdaptiveWr = r2.awayWins / Math.max(1, r2.n)
const r4StrongWr = r4.homeWins / Math.max(1, r4.n)

if (r1.awayChangedAny < r1.n * 0.1) {
  console.log('• Adaptacja prawie nie zmienia taktyk — efekt trudny do zmierzenia.')
} else if (r1AdaptiveWr >= 0.54) {
  console.log('• R1: adaptive bije fixed przy równych składach — reakcja taktyczna pomaga.')
} else if (r1AdaptiveWr <= 0.46) {
  console.log('• R1: adaptive przegrywa z fixed — obecne reguły adaptacji raczej szkodzą.')
} else {
  console.log('• R1: brak wyraźnej przewagi adaptive nad fixed przy równych składach.')
}

if (r2AdaptiveWr >= 0.4) {
  console.log(
    '• R2: adaptive na słabszym składzie utrzymuje przyzwoity WR — częściowa kompensacja OVR.',
  )
} else {
  console.log('• R2: adaptacja nie rekompensuje zauważalnie gorszego składu.')
}

if (r3Balance <= 0.12) {
  console.log('• R3: adaptive vs adaptive zrównoważone — brak silnego biasu home/away.')
} else {
  console.log('• R3: wynik odbiega od 50/50 — sprawdź bias pull/home.')
}

if (r4StrongWr >= 0.55) {
  console.log('• R4: przy obustronnej adaptacji lepszy skład nadal wygrywa częściej.')
} else {
  console.log('• R4: przewaga OVR słabo przekłada się na wynik przy obustronnej adaptacji.')
}

console.log(`\nCzas całkowity: ${((Date.now() - wall0) / 1000).toFixed(1)}s`)
