/**
 * Macierz: taktyki ofensywne × taktyki defensywne (równe składy, bez adaptacji).
 *
 * Obie drużyny: ten sam atak A.
 * Drużyna A: obrona bazowa (person). Drużyna D: obrona testowa D.
 * Różnica wyniku = ile D jest lepsza/gorsza od person przy ataku A.
 *
 * WR A wysoki ⇒ D słabo trzyma ten atak.
 * WR D wysoki (niski WR A) ⇒ D skutecznie kontruje A.
 *
 * Env:
 *   PER_CELL=10   — meczów na komórkę (A×D)
 *   POINTS=9
 *   WORKERS=8
 *
 * Run: node scripts/bench-tactics-matchup.mjs
 */
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES, MATCH_CONFIG } from '../src/matchEngine/index.js'

const PER_CELL = Number(process.env.PER_CELL ?? 10)
const POINTS_TO_WIN = Number(process.env.POINTS ?? 9)
const WORKERS = Math.max(
  1,
  Number(process.env.WORKERS ?? Math.min(8, os.cpus()?.length || 4)),
)
const ROSTER_SIZE = 18
const BASELINE_ATTACK = ATTACK_STYLES.VERTICAL_STACK
const BASELINE_DEFENSE = DEFENSE_STYLES.PERSON
const FORCE = FORCE_SIDES.FORCE_FOREHAND

const ATTACKS = Object.values(ATTACK_STYLES)
const DEFENSES = Object.values(DEFENSE_STYLES)

MATCH_CONFIG.pointsToWin = POINTS_TO_WIN

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'bench-tactics-matchup-worker.mjs')

const SHORT = {
  [ATTACK_STYLES.VERTICAL_STACK]: 'Vert',
  [ATTACK_STYLES.HORIZONTAL_STACK]: 'Horiz',
  [ATTACK_STYLES.SPLIT_STACK]: 'Split',
  [ATTACK_STYLES.SIDE_STACK]: 'Side',
  [ATTACK_STYLES.MOTION_OFFENSE]: 'Motion',
  [ATTACK_STYLES.HEX_OFFENSE]: 'Hex',
  [ATTACK_STYLES.ZONE_OFFENSE]: 'ZoneO',
  [DEFENSE_STYLES.PERSON]: 'Person',
  [DEFENSE_STYLES.ZONE_CUP]: 'Cup',
  [DEFENSE_STYLES.ZONE_WALL]: 'Wall',
  [DEFENSE_STYLES.CLAM]: 'Clam',
  [DEFENSE_STYLES.ALL_PERSON]: 'AllP',
}

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { workerData })
    let agg = null
    worker.on('message', (msg) => {
      if (msg.type === 'result') agg = msg.agg
    })
    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exit ${code}`))
      else if (!agg) reject(new Error('No result'))
      else resolve(agg)
    })
  })
}

/** Kolejka jobów z limitem równoległości. */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function pct(n, d) {
  if (!d) return '0%'
  return `${((100 * n) / d).toFixed(0)}%`
}

function pad(s, w) {
  const t = String(s)
  return t.length >= w ? t.slice(0, w) : t + ' '.repeat(w - t.length)
}

function padL(s, w) {
  const t = String(s)
  return t.length >= w ? t.slice(0, w) : ' '.repeat(w - t.length) + t
}

const cells = []
for (const attack of ATTACKS) {
  for (const defense of DEFENSES) {
    cells.push({ attack, defense })
  }
}

console.log('Tactics matchup matrix (Offense × Defense)')
console.log(
  `Komórek: ${cells.length} (${ATTACKS.length}×${DEFENSES.length})  |  meczów/komórkę: ${PER_CELL}  |  łącznie: ${cells.length * PER_CELL}`,
)
console.log(`pointsToWin: ${POINTS_TO_WIN}  |  workers: ${WORKERS}`)
console.log(
  `Obie strony ten sam atak; obrona ref=${SHORT[BASELINE_DEFENSE]} vs testowana D; force=${FORCE}`,
)
console.log(`(baselineAttack param=${SHORT[BASELINE_ATTACK]} nieużywany — obie grają testowanym A)`)
console.log('Swap home/away co drugi mecz. Bez adaptacji AI.\n')

const wall0 = Date.now()
let done = 0

const results = await mapPool(cells, WORKERS, async (cell, idx) => {
  const agg = await runWorker({
    matches: PER_CELL,
    seedBase: (20260807 + idx * 10007) >>> 0,
    attackStyle: cell.attack,
    defenseStyle: cell.defense,
    rosterSize: ROSTER_SIZE,
    pointsToWin: POINTS_TO_WIN,
    baselineAttack: BASELINE_ATTACK,
    baselineDefense: BASELINE_DEFENSE,
    forceSide: FORCE,
  })
  done += 1
  const wr = pct(agg.homeWins, agg.n)
  process.stdout.write(
    `\r[${done}/${cells.length}] ${SHORT[cell.attack]} vs ${SHORT[cell.defense]} → atk WR ${wr}   `,
  )
  return agg
})
process.stdout.write('\n\n')

// Macierz: wiersz = atak, kolumna = obrona
// Wartość: WR drużyny ataku (%), avg GD ataku
const wrMatrix = {}
const gdMatrix = {}
const avgAtkScore = {}
const avgDefScore = {}

for (const agg of results) {
  const a = agg.attackStyle
  const d = agg.defenseStyle
  if (!wrMatrix[a]) {
    wrMatrix[a] = {}
    gdMatrix[a] = {}
    avgAtkScore[a] = {}
    avgDefScore[a] = {}
  }
  wrMatrix[a][d] = (100 * agg.homeWins) / agg.n
  gdMatrix[a][d] = (agg.homeGoals - agg.awayGoals) / agg.n
  avgAtkScore[a][d] = agg.homeGoals / agg.n
  avgDefScore[a][d] = agg.awayGoals / agg.n
}

console.log('='.repeat(78))
console.log('WR drużyny A (%): obie grają atakiem z wiersza; A ma Person, D ma obronę z kolumny')
console.log('Wyżej = testowana obrona słabo trzyma ten atak (gorzej niż Person)')
console.log('Niżej = testowana obrona skutecznie kontruje ten atak')
console.log('='.repeat(78))
const colW = 8
let header = pad('Atk\\Def', 8)
for (const d of DEFENSES) header += padL(SHORT[d], colW)
header += padL('śr.', colW)
console.log(header)
console.log('-'.repeat(8 + colW * (DEFENSES.length + 1)))

const attackAvgWr = {}
for (const a of ATTACKS) {
  let row = pad(SHORT[a], 8)
  let sum = 0
  for (const d of DEFENSES) {
    const v = wrMatrix[a][d]
    sum += v
    row += padL(v.toFixed(0), colW)
  }
  attackAvgWr[a] = sum / DEFENSES.length
  row += padL(attackAvgWr[a].toFixed(0), colW)
  console.log(row)
}
let foot = pad('śr.D', 8)
const defenseAvgWrAllowed = {} // jak często atak wygrywa vs ta obrona (= słabość D)
for (const d of DEFENSES) {
  let sum = 0
  for (const a of ATTACKS) sum += wrMatrix[a][d]
  defenseAvgWrAllowed[d] = sum / ATTACKS.length
  foot += padL(defenseAvgWrAllowed[d].toFixed(0), colW)
}
foot += padL('', colW)
console.log(foot)

console.log('\n' + '='.repeat(78))
console.log('GD drużyny ATAKU (śr. różnica bramek na mecz) — + = atak punktuje więcej')
console.log('='.repeat(78))
header = pad('Atk\\Def', 8)
for (const d of DEFENSES) header += padL(SHORT[d], colW)
header += padL('śr.', colW)
console.log(header)
console.log('-'.repeat(8 + colW * (DEFENSES.length + 1)))

const attackAvgGd = {}
for (const a of ATTACKS) {
  let row = pad(SHORT[a], 8)
  let sum = 0
  for (const d of DEFENSES) {
    const v = gdMatrix[a][d]
    sum += v
    const s = (v >= 0 ? '+' : '') + v.toFixed(1)
    row += padL(s, colW)
  }
  attackAvgGd[a] = sum / DEFENSES.length
  const s = (attackAvgGd[a] >= 0 ? '+' : '') + attackAvgGd[a].toFixed(1)
  row += padL(s, colW)
  console.log(row)
}
foot = pad('śr.D', 8)
const defenseAvgGd = {}
for (const d of DEFENSES) {
  let sum = 0
  for (const a of ATTACKS) sum += gdMatrix[a][d]
  defenseAvgGd[d] = sum / ATTACKS.length
  const s = (defenseAvgGd[d] >= 0 ? '+' : '') + defenseAvgGd[d].toFixed(1)
  foot += padL(s, colW)
}
console.log(foot)

// Rankingi
const attacksRanked = [...ATTACKS].sort((x, y) => attackAvgWr[y] - attackAvgWr[x])
const defensesRanked = [...DEFENSES].sort(
  (x, y) => defenseAvgWrAllowed[x] - defenseAvgWrAllowed[y],
) // niższy WR ataku = lepsza obrona

console.log('\n' + '#'.repeat(78))
console.log('RANKING ATAKÓW (śr. WR drużyny z Person vs lepsze obrony — wyżej = atak trudniejszy do zatrzymania)')
console.log('#'.repeat(78))
attacksRanked.forEach((a, i) => {
  console.log(
    `${i + 1}. ${pad(SHORT[a], 8)}  WR ${attackAvgWr[a].toFixed(1)}%  GD ${attackAvgGd[a] >= 0 ? '+' : ''}${attackAvgGd[a].toFixed(2)}`,
  )
})

console.log('\n' + '#'.repeat(78))
console.log('RANKING OBRON (niższy WR przeciwnika z Person = obrona lepsza od Person)')
console.log('#'.repeat(78))
defensesRanked.forEach((d, i) => {
  const held = 100 - defenseAvgWrAllowed[d]
  console.log(
    `${i + 1}. ${pad(SHORT[d], 8)}  wygrywa ${held.toFixed(1)}%  |  Person-strona WR ${defenseAvgWrAllowed[d].toFixed(1)}%  |  GD Person-strony ${defenseAvgGd[d] >= 0 ? '+' : ''}${defenseAvgGd[d].toFixed(2)}`,
  )
})

// Najlepsze / najgorsze matchupy
const pairs = []
for (const a of ATTACKS) {
  for (const d of DEFENSES) {
    pairs.push({
      a,
      d,
      wr: wrMatrix[a][d],
      gd: gdMatrix[a][d],
      atkPts: avgAtkScore[a][d],
      defPts: avgDefScore[a][d],
    })
  }
}
pairs.sort((x, y) => y.wr - x.wr)

console.log('\n' + '#'.repeat(78))
console.log('Obrona SŁABA vs atak (Person-strona wygrywa — top 8)')
console.log('#'.repeat(78))
for (const p of pairs.slice(0, 8)) {
  console.log(
    `${SHORT[p.a]} vs ${SHORT[p.d]}: Person-strona WR ${p.wr.toFixed(0)}%  GD ${p.gd >= 0 ? '+' : ''}${p.gd.toFixed(1)}  (${p.atkPts.toFixed(1)}–${p.defPts.toFixed(1)})`,
  )
}

console.log('\n' + '#'.repeat(78))
console.log('Obrona SILNA vs atak (testowana D wygrywa — bottom 8 WR Person-strony)')
console.log('#'.repeat(78))
for (const p of pairs.slice(-8).reverse()) {
  console.log(
    `${SHORT[p.d]} trzyma ${SHORT[p.a]}: Person-strona WR ${p.wr.toFixed(0)}%  GD ${p.gd >= 0 ? '+' : ''}${p.gd.toFixed(1)}  (${p.atkPts.toFixed(1)}–${p.defPts.toFixed(1)})`,
  )
}

// Kontrujący: dla każdego ataku — najlepsza obrona przeciwko niemu
console.log('\n' + '#'.repeat(78))
console.log('KONTRY: najlepsza obrona przeciw każdemu atakowi (najniższy WR Person-strony)')
console.log('#'.repeat(78))
for (const a of ATTACKS) {
  const bestD = [...DEFENSES].sort((x, y) => wrMatrix[a][x] - wrMatrix[a][y])[0]
  const worstD = [...DEFENSES].sort((x, y) => wrMatrix[a][y] - wrMatrix[a][x])[0]
  console.log(
    `${pad(SHORT[a], 8)}  →  najlepiej trzyma ${SHORT[bestD]} (Person WR ${wrMatrix[a][bestD].toFixed(0)}%)  |  najgorzej trzyma ${SHORT[worstD]} (Person WR ${wrMatrix[a][worstD].toFixed(0)}%)`,
  )
}

console.log(`\nCzas: ${((Date.now() - wall0) / 1000).toFixed(1)}s`)
