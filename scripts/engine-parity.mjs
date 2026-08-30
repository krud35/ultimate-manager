/**
 * Parity + realizm silnika meczowego.
 *
 * Silnik ma DWIE niezależne ścieżki:
 *   - pełny tick (`simulatePoint`)      — mecze gracza, realni agenci 20 ms
 *   - fast      (`simulatePointFast`)   — liga / AI, bez symulacji przestrzennej
 *
 * Bez wspólnego punktu odniesienia rozjeżdżały się do stanu, w którym ta sama drużyna
 * grała w praktyce w dwie różne dyscypliny (audyt: hold% 52,6% vs 78,0%, udział hucków
 * 10,9% vs 0,5%). Ten skrypt mierzy OBA silniki tymi samymi metrykami i zestawia je z
 * pasmami z realnego club ultimate (WFDF/USAU: EUCF, USAU Club Nationals, WUCC — NIE UFA,
 * które ma inne boisko, stall 7 i inne reguły).
 *
 * Użycie:
 *   node scripts/engine-parity.mjs            # domyślnie 20 fast + 10 pełnych
 *   node scripts/engine-parity.mjs 40 20
 */
import { simulateMatch } from '../src/matchEngine/index.js'
import { createRng } from '../src/matchEngine/rng.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
} from '../src/matchEngine/tacticsModifiers.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

/**
 * Pasma z realnych meczów club ultimate na poziomie elity (EUCF / USAU Nationals / WUCC).
 * Wartości przybliżone — chodzi o rząd wielkości i kierunek, nie o pojedyncze zawody.
 */
/**
 * ROZKŁAD DYSTANSÓW RZUTU — metryka pierwszej kategorii.
 *
 * Do tej pory harness mierzył wyłącznie UDZIAŁY TYPÓW rzutu (standard/huck/reset/OTT).
 * To okazało się mylące: silnik trafiał w pasmo hucków (8-10%) mając jednocześnie 32%
 * wszystkich podań powyżej 25 m i tylko 14% poniżej 10 m. Typ rzutu jest etykietą
 * nadawaną po fakcie, a o jakości selekcji decyduje realny dystans — więc mierzymy go
 * wprost, od punktu wypuszczenia do punktu chwytu.
 */
const TARGETS = {
  shortThrowPct: [50, 60],
  midThrowPct: [30, 35],
  longThrowPct: [5, 10],
  completionPct: [90, 93],
  holdPct: [70, 85],
  standardSharePct: [45, 62],
  dumpSharePct: [22, 38],
  huckSharePct: [7, 16],
  ottSharePct: [0.5, 4],
  turnoversPerPoint: [0.45, 0.85],
  throwsPerPoint: [7, 12],
  stallAtThrowMedian: [2, 4],
  stallOutsPerMatch: [0, 1.5],
  blocksPerMatch: [5, 16],
}

function tacticsFor(attackStyle, defenseStyle) {
  const dirs = {
    creativity: 0,
    coverageShade: 0,
    huckAppetite: 0,
    passSelectivity: 0,
    breakAppetite: 0,
    possessionTempo: 0,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
  }
  return normalizeTactics({
    oLineAttackStyle: attackStyle,
    dLineAttackStyle: attackStyle,
    oLineDefenseStyle: defenseStyle,
    dLineDefenseStyle: defenseStyle,
    oLineCoachDirectives: dirs,
    dLineCoachDirectives: dirs,
    coachDirectives: dirs,
    forceSide: dirs.forceSide,
    lineupWhenOffenseStartPlayerIds: [],
    lineupWhenDefenseStartPlayerIds: [],
  })
}

/**
 * Seedy ROZPROSZONE po wielu bazach, nie ciągłe 70000+.
 *
 * Ciągły blok seedów trafiał w wąski wycinek losowania POGODY: średni wiatr 9.9 mph,
 * podczas gdy rozproszona próbka daje 16.2 mph. Skutek był poważny — te same drużyny
 * demo dawały completion 90.3% na seedach 70000+ i 86.4% na innym paśmie. Parity
 * raportował więc silnik „w paśmie 90-93" na próbce spokojnej pogody, a realny sezon
 * ligowy wychodził 84.7%. Kalibracja pod takie narzędzie stroi silnik pod bezwietrzną
 * pogodę i rozjeżdża go w rozgrywce.
 */
const SEED_BASES = [11000, 23000, 31000, 44000, 52000, 61000, 70000, 88000]
function seedFor(i) {
  return SEED_BASES[i % SEED_BASES.length] + Math.floor(i / SEED_BASES.length) * 37
}

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function measure(matches, fastMode) {
  const throwsPerPoint = []
  const turnoversPerPoint = []
  const stallAtThrow = []
  const byType = {}
  const throwDistances = []
  let lastRelease = null
  let attempts = 0
  let completions = 0
  let blocks = 0
  let stallOuts = 0
  let holds = 0
  let oPoints = 0
  let totalMs = 0
  let pointsPlayed = 0

  for (let i = 0; i < matches; i += 1) {
    const home = structuredClone(demoHomeTeam)
    const away = structuredClone(demoAwayTeam)
    home.tactics = tacticsFor(ATTACK_STYLES.HORIZONTAL_STACK, DEFENSE_STYLES.PERSON)
    away.tactics = tacticsFor(ATTACK_STYLES.VERTICAL_STACK, DEFENSE_STYLES.PERSON)
    const t0 = Date.now()
    // Uwaga: `rng` i `seed` są równoważne (initMatchSession przyjmuje oba); seed trzyma
    // powtarzalność między przebiegami, co jest warunkiem porównywalności obu silników.
    const res = simulateMatch({ homeTeam: home, awayTeam: away, seed: seedFor(i), fastMode })
    totalMs += Date.now() - t0
    pointsPlayed += res.pointsPlayed ?? 0

    let throws = 0
    let turnovers = 0
    let pullTeam = null
    for (const e of res.events ?? []) {
      switch (e.type) {
        case 'point_start':
          throws = 0
          turnovers = 0
          pullTeam = e.pullTeam ?? null
          break
        case 'throw_attempt': {
          lastRelease = {
            x: e.actionSim?.discX,
            y: e.actionSim?.discY,
          }
          throws += 1
          attempts += 1
          byType[e.throwType] = byType[e.throwType] ?? { a: 0, s: 0 }
          byType[e.throwType].a += 1
          if (e.stallCount != null) stallAtThrow.push(e.stallCount)
          break
        }
        case 'throw_success':
          if (e.catchPoint && Number.isFinite(lastRelease?.x)) {
            throwDistances.push(
              Math.hypot(e.catchPoint.x - lastRelease.x, e.catchPoint.y - lastRelease.y),
            )
          }
          completions += 1
          byType[e.throwType] = byType[e.throwType] ?? { a: 0, s: 0 }
          byType[e.throwType].s += 1
          break
        case 'throw_fail':
          turnovers += 1
          if (e.isBlock) blocks += 1
          break
        case 'stall_out':
          stallOuts += 1
          turnovers += 1
          break
        case 'score':
          if (pullTeam && e.team) {
            oPoints += 1
            // Drużyna odbierająca pull = przeciwna do pullującej; jej punkt = hold.
            if (e.team !== pullTeam) holds += 1
          }
          throwsPerPoint.push(throws)
          turnoversPerPoint.push(turnovers)
          break
        default:
          break
      }
    }
  }

  const share = (type) => (attempts ? (100 * (byType[type]?.a ?? 0)) / attempts : 0)
  const distPct = (pred) =>
    throwDistances.length
      ? (100 * throwDistances.filter(pred).length) / throwDistances.length
      : null

  return {
    msPerMatch: totalMs / matches,
    pointsPerMatch: pointsPlayed / matches,
    completionPct: attempts ? (100 * completions) / attempts : 0,
    shortThrowPct: distPct((d) => d < 10),
    midThrowPct: distPct((d) => d >= 10 && d < 25),
    longThrowPct: distPct((d) => d >= 25),
    avgThrowDistM: throwDistances.length
      ? throwDistances.reduce((x, y) => x + y, 0) / throwDistances.length
      : null,
    holdPct: oPoints ? (100 * holds) / oPoints : 0,
    standardSharePct: share('standard'),
    dumpSharePct: share('dump_swing'),
    huckSharePct: share('huck'),
    ottSharePct: share('over_the_top'),
    turnoversPerPoint:
      turnoversPerPoint.reduce((s, v) => s + v, 0) / (turnoversPerPoint.length || 1),
    throwsPerPoint: throwsPerPoint.reduce((s, v) => s + v, 0) / (throwsPerPoint.length || 1),
    stallAtThrowMedian: median(stallAtThrow),
    stallOutsPerMatch: stallOuts / matches,
    blocksPerMatch: blocks / matches,
    huckCompletionPct: byType.huck?.a ? (100 * byType.huck.s) / byType.huck.a : null,
  }
}

const fastMatches = Number(process.argv[2] ?? 20)
const fullMatches = Number(process.argv[3] ?? 10)

console.log(`fast: ${fastMatches} meczów, pełny tick: ${fullMatches} meczów…\n`)
const fast = measure(fastMatches, true)
const full = measure(fullMatches, false)

const inBand = (v, band) => (v == null || !band ? null : v >= band[0] && v <= band[1])
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toFixed(2) : String(v))
const mark = (ok) => (ok === null ? ' ' : ok ? 'ok' : 'XX')

const rows = [
  ['completion%', 'completionPct'],
  ['rzuty krótkie 0-10m%', 'shortThrowPct'],
  ['rzuty średnie 10-25m%', 'midThrowPct'],
  ['rzuty długie 25m+%', 'longThrowPct'],
  ['śr. dystans rzutu m', 'avgThrowDistM'],
  ['hold%', 'holdPct'],
  ['udział standard%', 'standardSharePct'],
  ['udział dump%', 'dumpSharePct'],
  ['udział huck%', 'huckSharePct'],
  ['udział OTT%', 'ottSharePct'],
  ['turnovery/punkt', 'turnoversPerPoint'],
  ['rzutów/punkt', 'throwsPerPoint'],
  ['stall przy rzucie (med)', 'stallAtThrowMedian'],
  ['stall-outy/mecz', 'stallOutsPerMatch'],
  ['bloki/mecz', 'blocksPerMatch'],
]

console.log(
  'metryka'.padEnd(26) +
    'FAST'.padStart(9) +
    '  '.padEnd(4) +
    'PEŁNY'.padStart(9) +
    '  '.padEnd(4) +
    'cel'.padStart(12) +
    '   rozjazd',
)
console.log('-'.repeat(84))
let worstGap = 0
let offTarget = 0
for (const [label, key] of rows) {
  const band = TARGETS[key]
  const f = fast[key]
  const u = full[key]
  const gap = f != null && u != null ? Math.abs(f - u) : null
  if (gap != null && band) {
    const width = band[1] - band[0]
    worstGap = Math.max(worstGap, width > 0 ? gap / width : 0)
  }
  if (inBand(f, band) === false) offTarget += 1
  if (inBand(u, band) === false) offTarget += 1
  console.log(
    label.padEnd(26) +
      fmt(f).padStart(9) +
      ` ${mark(inBand(f, band))} ` +
      fmt(u).padStart(9) +
      ` ${mark(inBand(u, band))} ` +
      (band ? `${band[0]}–${band[1]}` : '—').padStart(12) +
      '   ' +
      fmt(gap),
  )
}
console.log('-'.repeat(84))
console.log(
  `wydajność: fast ${fast.msPerMatch.toFixed(0)} ms/mecz, pełny ${full.msPerMatch.toFixed(0)} ms/mecz ` +
    `(${(full.msPerMatch / fast.msPerMatch).toFixed(1)}× wolniej)`,
)
console.log(
  `punktów/mecz: fast ${fast.pointsPerMatch.toFixed(1)}, pełny ${full.pointsPerMatch.toFixed(1)}   |   ` +
    `huck completion: fast ${fmt(fast.huckCompletionPct)}%, pełny ${fmt(full.huckCompletionPct)}%`,
)
console.log(`\nkomórek poza pasmem: ${offTarget} / ${rows.length * 2}`)
