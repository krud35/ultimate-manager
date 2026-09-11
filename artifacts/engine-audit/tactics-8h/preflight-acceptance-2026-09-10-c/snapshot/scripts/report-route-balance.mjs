import fs from 'node:fs'
import assert from 'node:assert/strict'

const load = p => JSON.parse(fs.readFileSync(p))
const names = ['route-v2-control', 'route-v2-final', 'route-v2-validation']
const scenarios = names.map(n => load(`artifacts/scenarios/${n}.json`))
const matchData = names.map(n => load(`artifacts/engine-audit/${n}.json`))
const matches = matchData.map(d => d.modes.full)
for (const d of [...scenarios, ...matchData]) {
  assert.deepEqual(d.balance.changedDuringRun, [])
  assert.deepEqual(d.balance.sourceHashes, matchData[0].balance.sourceHashes)
}
const exposure = rows => rows.reduce((sum, row) => {
  const e = row.exposure ?? row.bodyExposure
  for (const key of Object.keys(sum)) sum[key] += e[key]
  return sum
}, { flightFrames: 0, overlapFrames: 0, overlappingPairs: 0 })
const pct = e => 100 * e.overlapFrames / e.flightFrames
const f = x => Number(x).toFixed(2)
const caseRows = (d, id) => d.rows.filter(r => r.case === id && r.layer === 'execution')
assert.deepEqual(scenarios[0].rows.map(r => [r.case, r.layer, r.seed]), scenarios[1].rows.map(r => [r.case, r.layer, r.seed]))
const seeds = new Set(scenarios[0].rows.map(r => r.seed))
assert.ok(scenarios[2].rows.every(r => !seeds.has(r.seed)))
assert.deepEqual(matches[0].matches.map(r => r.seed), matches[1].matches.map(r => r.seed))
const matchSeeds = new Set(matches[0].matches.map(r => r.seed))
assert.ok(matches[2].matches.every(r => !matchSeeds.has(r.seed)))
assert.equal(matchData[2].options.direction, 90)
for (const d of scenarios) assert.ok(d.rows.filter(r => ['outside', 'toe_out'].includes(r.case)).every(r => !r.success))
const acceptancePassed = matches.every(d => d.summary.throwLimits === 0)
const summaries = matches.map(d => ({ ...d.summary, bodyExposure: exposure(d.matches), overlapFramePct: pct(exposure(d.matches)) }))
const control = new Map(scenarios[0].rows.map(r => [`${r.case}/${r.layer}/${r.seed}`, r]))
const changedLosses = {}
let recovered = 0
for (const r of scenarios[1].rows.filter(r => r.layer === 'execution')) {
  const old = control.get(`${r.case}/${r.layer}/${r.seed}`)
  if (old.success !== r.success) assert.equal(r.case, 'double_coverage')
  if (old.success && !r.success) changedLosses[r.reason] = (changedLosses[r.reason] ?? 0) + 1
  if (!old.success && r.success) recovered++
}
const losses = scenarios[1].rows.filter(r => !r.success).map(r => ({ case: r.case, layer: r.layer, seed: r.seed,
  reason: r.reason, controlReason: control.get(`${r.case}/${r.layer}/${r.seed}`).reason,
  diagnosis: r.diagnosis, contact: r.contact, landing: r.landing, exposure: r.exposure }))
fs.writeFileSync('artifacts/engine-audit/route-summary.json', JSON.stringify({ names, acceptancePassed, summaries }, null, 2))
fs.writeFileSync('artifacts/engine-audit/route-losses.json', JSON.stringify(losses, null, 2))
const metrics = [['completionPct', 'Celne podania (%)'], ['overlapFramePct', 'Klatki lotu z nakładaniem sylwetek (%)'],
  ['blocksPerMatch', 'Bloki/mecz'], ['turnoversPerPoint', 'Straty/punkt'], ['throwsPerPoint', 'Podania/punkt'],
  ['holdPct', 'Hold (%)'], ['stallOutsPerMatch', 'Stall-out/mecz'], ['throwLimits', 'Awaryjne limity']]
let timing = 'Pomiar sekwencyjny jeszcze niezapisany.'
if (fs.existsSync('artifacts/engine-audit/route-timing-enabled.json')) {
  const t = ['control', 'enabled'].map(n => load(`artifacts/engine-audit/route-timing-${n}.json`).modes.full)
  const stableRow = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'ms'))
  t.forEach((d, i) => assert.deepEqual(d.matches.map(stableRow), matches[i].matches.slice(0, 2).map(stableRow)))
  const perFrame = d => d.matches.reduce((s, r) => s + r.ms, 0) / d.matches.reduce((s, r) => s + r.frames, 0)
  timing = `Orientacyjnie, po dwa mecze na tych samych seedach, sekwencyjnie: ${f(t[0].summary.msPerMatch / 1000)} → ${f(t[1].summary.msPerMatch / 1000)} s/mecz; ${perFrame(t[0]).toFixed(3)} → ${perFrame(t[1]).toFixed(3)} ms/klatkę. Zmieniają się liczba i długość akcji. Próba nie izoluje kosztu poszczególnych funkcji i obejmuje diagnostykę; nie jest stabilnym benchmarkiem wydajności.`
}
const lines = ['# Planowanie drogi i ruch bez dysku — 9 września 2026', '',
  `**Status walidacji: ${acceptancePassed ? 'brak awaryjnych limitów' : 'NIEZALICZONA — jeden punkt doszedł do awaryjnego limitu. Poprawa geometrii nie oznacza zakończenia balansu'}.**`, '',
  'Rozszerzono wcześniejsze omijanie przy odbiorze o koszt drogi w planie przechwytu oraz ruch cutterów i obrońców bez dysku. Nie strojono współczynników celności, chwytu ani bloków.', '',
  'Planer sprawdza przeszkodę na całej drodze do rozpatrywanego punktu. Dodaje koszt wydłużenia trasy i skrętu przy bocznym punkcie obejścia. Zajęty punkt odbioru przesuwa do obrysu gracza i ponownie ocenia, czy ręka dosięga dysku. Rzucający uwzględnia obserwowanych partnerów i przeciwników; odbiorca korzysta z własnej percepcji i pamięci. Plan nie otrzymuje przyszłych rzeczywistych pozycji graczy.', '',
  'Lokalne omijanie działa teraz także podczas cutów, powrotów na pozycję, drobnych kroków oczekiwania i ruchu obrony. Ruch czyta wspólne pozycje sprzed kroku. Drobne losowe kroki oczekiwania przechodzą przez integrator przyspieszenia i hamowania zamiast bezpośrednio zmieniać współrzędne. Nie ma odsuwania sylwetek po wyniku kontaktu.', '',
  'Diagnostyka rzutu zapisuje plannedDetourSec i plannedAvoidedId; odczyty odbiorcy również zapisują koszt obejścia. Sama obecność przeszkody w diagnozie nie dowodzi przyczyny straty.', '',
  '## Kontrolowane sytuacje', '',
  '17 sytuacji × 2 warstwy × 256 seedów × 3 warianty = 26 112 przebiegów. Kontrola wyłącza planning i offBall; zachowuje wcześniejsze omijanie podczas lotu. Pierwsze dwa warianty mają te same seedy; trzeci rozłączne. Tabela: chwyty / 256 w warstwie wykonania.', '',
  '| Sytuacja | Kontrola | Nowa wersja | Inne seedy |', '|---|---:|---:|---:|',
  ...scenarios[0].summaries.filter(r => r.layer === 'execution').map(r => `| ${r.case} | ${scenarios.map(d => caseRows(d, r.case).filter(x => x.success).length).join(' | ')} |`), '',
  `Podwójne krycie, nakładanie sylwetek podczas lotu: ${scenarios.map(d => f(pct(exposure(caseRows(d, 'double_coverage')))) + '%').join(' / ')}. Proste próby bez przeszkód nie zmieniły wyniku w sparowanej kontroli.`, '',
  `W warstwie wykonania ${Object.values(changedLosses).reduce((a, b) => a + b, 0)} wcześniejszych chwytów zmieniło się w straty (${Object.entries(changedLosses).map(([k, v]) => k + ': ' + v).join(', ')}), a ${recovered} wcześniejsze straty w chwyty. Wszystkie zmiany wyników dotyczą double_coverage. To zmiana dynamiki kontaktów, nie jednokierunkowa kara za tłok.`, '',
  '## Pełne mecze', '',
  'Po 8 meczów kontroli i końcowej wersji, offset 52400, standardowa pogoda, adaptacja i rotacja. Dodatkowe 8 meczów z offsetem 61437: 20 mph, kierunek 90°, rozłączne seedy. Zespoły demonstracyjne nie są równe. Wszystkie sześć serii ma identyczne hashe plików silnika, modeli graczy i danych składów; nie wykryto zmian tych źródeł w czasie przebiegów.', '',
  '| Wskaźnik | Kontrola | Nowa wersja | Walidacja 20 mph / 90° |', '|---|---:|---:|---:|',
  ...metrics.map(([key, label]) => `| ${label} | ${summaries.map(d => f(d[key])).join(' | ')} |`), '',
  'Wskaźnik nakładania liczy klatki IN_FLIGHT z przynajmniej jedną parą nakładających się kół o promieniu połowy szerokości barków. Pomija różnicę wysokości ponad 1,5 m. Nie mierzy fauli ani fazy przygotowania rzutu; nie dowodzi usunięcia wszystkich kolizji. Mianowniki znajdują się w route-summary.json.', '',
  '**Otwarta regresja.** Seed 105437, wiatr 20 mph / 90°, punkt 13: 120 celnych podań bez straty, w tym 112 dumpów/swingów, 6 standardowych i 2 hucki. Najdłuższa seria resetów wynosi 42; ślady reprezentują 511,26 s. Dysk kończy przy x=2,14 m. To powtarzalna pętla wyboru bezpiecznych podań, nie dowód fizycznego unieruchomienia. Silnik następnie przyznaje punkt przez istniejący fallback throw_limit. Kontrola z wyłączonym nowym planowaniem i ruchem bez dysku na tym samym seedzie nie osiąga limitu (najdłuższy punkt: 39 podań). Nie zwiększono limitu ani nie wymuszono losowej straty, aby ukryć problem. Dane: route-limit-enabled.json i route-limit-control.json; odtwarzanie: node scripts/diagnose-route-limit.mjs oraz wariant --control.', '',
  '## Weryfikacja i ograniczenia', '',
  'Test check-route-planning weryfikuje dodatkowy czas obejścia, zajęty punkt chwytu, niezmienioną otwartą drogę, obrót sceny oraz ograniczony fizycznie ruch obrońcy bez przesuwania przeszkody. Przeszły check-disc-intercept, check-body-traffic, check-player-behavior, check-recommendations i check-engine-realism (8 meczów fast), targetowany ESLint i build. Build zgłasza istniejący duży bundle.', '',
  'Przeszedł check-disc-flight: 4 pełne mecze, 1240 chwytów i 242 straty, weryfikacja wspólnego toru, ciągłości pozycji, kontaktu i posiadania po przejęciu. Ta próba nie obejmuje problematycznego seeda walidacji; testy regresyjne przeszły, lecz kryterium balansu bez limitów nie zostało spełnione.', '',
  'Koszt drogi jest przybliżeniem dla jednej najbliższej przeszkody, nie pełnym wyszukiwaniem trasy. Planer nie przewiduje wszystkich przyszłych ruchów przeciwników, a lokalne omijanie nie rozwiązuje twardych kolizji, początkowego nakładania ani wszystkich layoutów. Różnica skuteczności sama w sobie nie dowodzi lepszego balansu. Osiem meczów na wariant oraz brak zewnętrznych danych meczowych nie pozwalają uznać całej ligi za empirycznie skalibrowaną.', '',
  'Najpilniejsza dalsza poprawka: ocena całego posiadania po serii resetów, z ponownym otwieraniem kierunku ataku i koordynacją cutów. Hipoteza wymaga sprawdzenia opcji odrzuconych przez rzucającego: sama kara za dump może wymusić zły rzut zamiast naprawić brak możliwości progresji. Następnie pozostające nakładanie przy przecinających się trasach, koszt obliczeń i diagnoza unknown_no_contact.', '',
  'Czasy serii uruchamianych równolegle nie są porównywalnym benchmarkiem. route-pilot oraz serie route-control/final/validation są wcześniejsze: w czasie pracy zmieniono generowanie osobowości i traitów. Końcowe porównanie korzysta wyłącznie z powtórzonych serii route-v2. Pomiar route-timing wykonano po zmianie traitów.', '', timing, '',
  '## Odtwarzanie', '', '```powershell',
  'node scripts/balance-engine.mjs --situations --n 256 --no-route-planning --no-offball-traffic --output artifacts/scenarios/route-v2-control.json',
  'node scripts/balance-engine.mjs --situations --n 256 --output artifacts/scenarios/route-v2-final.json',
  'node scripts/balance-engine.mjs --situations --n 256 --offset 81000 --output artifacts/scenarios/route-v2-validation.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 52400 --no-route-planning --no-offball-traffic --output artifacts/engine-audit/route-v2-control.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 52400 --output artifacts/engine-audit/route-v2-final.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 61437 --wind 20 --direction 90 --output artifacts/engine-audit/route-v2-validation.json',
  'node scripts/check-route-planning.mjs', 'node scripts/report-route-balance.mjs', '```', '']
fs.writeFileSync('artifacts/engine-audit/ROUTE-BALANCE.md', lines.join('\n'))
console.log(JSON.stringify(summaries.map(s => ({ completion: s.completionPct, overlap: s.overlapFramePct, blocks: s.blocksPerMatch, limits: s.throwLimits }))))
if (!acceptancePassed) {
  console.error('NIEZALICZONA walidacja balansu: awaryjny limit w route-v2-validation; szczegóły w ROUTE-BALANCE.md')
  process.exitCode = 2
}
