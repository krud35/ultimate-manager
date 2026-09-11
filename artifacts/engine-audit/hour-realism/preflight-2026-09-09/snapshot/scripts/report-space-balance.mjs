import fs from 'node:fs'
import assert from 'node:assert/strict'

const load = p => JSON.parse(fs.readFileSync(p))
const scenarioNames = ['space-control-final', 'space-final', 'space-validation']
const scenarios = scenarioNames.map(n => load(`artifacts/scenarios/${n}.json`))
const matchNames = ['space-control', 'space-final', 'space-validation']
const matches = matchNames.map(n => load(`artifacts/engine-audit/${n}.json`).modes.full)
const pct = exposure => 100 * exposure.overlapFrames / exposure.flightFrames
const sumExposure = rows => rows.reduce((sum, r) => {
  const e = r.exposure ?? r.bodyExposure
  for (const key of ['flightFrames', 'overlapFrames', 'overlappingPairs']) sum[key] += e[key]
  return sum
}, { flightFrames: 0, overlapFrames: 0, overlappingPairs: 0 })
const rowsFor = (data, id) => data.rows.filter(r => r.case === id && r.layer === 'execution')
const completed = (d, id) => rowsFor(d, id).filter(r => r.success).length
const f = n => Number(n).toFixed(2)
const caseIds = scenarios[0].summaries.filter(r => r.layer === 'execution').map(r => r.case)
const trainingSeeds = new Set(scenarios[0].rows.map(r => r.seed))
assert.deepEqual(scenarios[0].rows.map(r => [r.case, r.layer, r.seed]), scenarios[1].rows.map(r => [r.case, r.layer, r.seed]))
assert.ok(scenarios[2].rows.every(r => !trainingSeeds.has(r.seed)))
assert.ok(pct(sumExposure(rowsFor(scenarios[1], 'double_coverage'))) < pct(sumExposure(rowsFor(scenarios[0], 'double_coverage'))))
for (const data of scenarios) {
  assert.ok(data.rows.filter(r => ['outside', 'toe_out'].includes(r.case)).every(r => !r.success))
  for (const row of data.rows) assert.ok(row.exposure.overlapFrames <= row.exposure.flightFrames)
}
assert.deepEqual(matches[0].matches.map(r => r.seed), matches[1].matches.map(r => r.seed))
const exposure = matches.map(d => sumExposure(d.matches))
assert.ok(pct(exposure[1]) < pct(exposure[0]))
assert.ok(matches.every(d => d.summary.throwLimits === 0))
const controlByKey = new Map(scenarios[0].rows.map(r => [`${r.case}/${r.layer}/${r.seed}`, r]))
const losses = scenarios[1].rows.filter(r => !r.success).map(r => ({
  case: r.case, seed: r.seed, layer: r.layer, reason: r.reason, diagnosis: r.diagnosis,
  controlReason: controlByKey.get(`${r.case}/${r.layer}/${r.seed}`).reason,
  exposure: r.exposure, contact: r.contact, landing: r.landing,
}))
fs.writeFileSync('artifacts/engine-audit/space-losses.json', JSON.stringify(losses, null, 2))
fs.writeFileSync('artifacts/engine-audit/space-summary.json', JSON.stringify({
  scenarios: scenarioNames, matches: matchNames,
  summaries: matches.map((d, i) => ({ ...d.summary, bodyExposure: exposure[i], overlapFramePct: pct(exposure[i]) })),
}, null, 2))
const metrics = [['completionPct', 'Celne podania (%)'], ['blocksPerMatch', 'Bloki na mecz'],
  ['turnoversPerPoint', 'Straty na punkt'], ['holdPct', 'Hold (%)'], ['throwsPerPoint', 'Podania na punkt'], ['throwLimits', 'Awaryjne limity rzutów']]
let timingNote = ''
if (fs.existsSync('artifacts/engine-audit/space-timing-enabled.json')) {
  const t = ['control', 'enabled'].map(n => load(`artifacts/engine-audit/space-timing-${n}.json`).modes.full)
  const perFrame = d => d.matches.reduce((s, r) => s + r.ms, 0) / d.matches.reduce((s, r) => s + r.frames, 0)
  timingNote = `Orientacyjny pomiar sekwencyjny, po dwa mecze na tych samych seedach: ${f(t[0].summary.msPerMatch / 1000)} → ${f(t[1].summary.msPerMatch / 1000)} s/mecz; ${perFrame(t[0]).toFixed(3)} → ${perFrame(t[1]).toFixed(3)} ms/klatkę. Liczba akcji i długość meczów zmieniają się wraz z zachowaniem graczy. To zbyt mała próba do wniosku o przyspieszeniu lub braku kosztu; pomiar obejmuje również diagnostykę ekspozycji sylwetek.`
}
const lines = ['# Balans przestrzeni przy odbiorze dysku — 9 września 2026', '',
  'Przyjęto lokalne omijanie zawodników przy dobiegu do dysku. Zawodnik respektuje miejsce już zajęte przez inną sylwetkę, zamiast kierować środek własnego ciała dokładnie w ten sam punkt. Nie zmieniono współczynników celności, chwytu ani blokowania.', '',
  '**Mechanika.** Obie drużyny korzystają ze wspólnego snapshotu pozycji sprzed kroku. Promień sylwetki wynika z połowy szerokości barków. Do omijania dodano 0,12 m marginesu; przeszkody na trasie rozpatrywane są w odcinku zależnym od żądanej prędkości i horyzontu 0,5 s. To lokalne sterowanie ruchem, a nie prognoza intencji wszystkich graczy.', '',
  'Jeśli ktoś jest już bliżej zajętego punktu odbioru, dobieg kończy się przy jego obrysie. Przeszkodę na drodze zawodnik omija z boku. Zmienia się wyłącznie cel i żądana prędkość: pozycję nadal wyznacza integrator z ograniczeniami przyspieszenia, hamowania i skrętu. Nie ma teleportowania, odsuwania po wyniku ani zwiększania zasięgu chwytu. Dla celu wewnątrz boiska manewr omijania nie wyznacza nowego punktu poza linią; rzeczywiste cele poza boiskiem pozostają dozwolone.', '',
  '**Pomiar przestrzeni.** Liczymy odsetek klatek IN_FLIGHT, w których obrysy przynajmniej jednej pary zawodników nakładają się w rzucie na boisko. Obrys jest kołem z promieniem połowy szerokości barków; pomijamy pary z różnicą wysokości ponad 1,5 m. To przybliżony wskaźnik geometrii, nie liczba zderzeń ani fauli. Mianowniki są zapisane w space-summary.json i surowych wynikach. Zmiana długości lotów również zmienia mianownik.', '',
  '**Kontrolowane sytuacje: 17 × 2 warstwy × 256 seedów × 3 warianty = 26 112 przebiegów.** Kontrola wyłącza wyłącznie body traffic. Pierwsze dwa warianty mają identyczne seedy, trzeci rozłączny zbiór. Poniżej warstwa wykonania, liczba chwytów / 256.', '',
  '| Sytuacja | Kontrola | Omijanie | Niezależne seedy |', '|---|---:|---:|---:|',
  ...caseIds.map(id => `| ${id} | ${scenarios.map(d => completed(d, id)).join(' | ')} |`), '',
  `Podwójne krycie: odsetek klatek z nakładaniem sylwetek ${scenarios.map(d => f(pct(sumExposure(rowsFor(d, 'double_coverage')))) + '%').join(' → ')} (kontrola → omijanie → niezależna próba). Otwarty huck i proste incuty bez przeszkód nie wymagają zmiany dobiegu. Nie stroimy modelu do z góry wymaganego procentu chwytów w jednym ustawieniu.`, '',
  '**Pełne mecze.** Kontrola i przyjęta wersja: po 8 pełnych meczów, te same seedy (offset 32400), rotacja i adaptacja AI, pogoda generowana standardowo. Średni początkowy wiatr wynosi 15,75 mph. Walidacja: 8 innych seedów, stałe 20 mph / 90°. Składy demonstracyjne są różne; wynik meczu nie jest testem równych drużyn.', '',
  '| Wskaźnik | Kontrola | Omijanie | Walidacja 20 mph |', '|---|---:|---:|---:|',
  `| Klatki z nakładaniem sylwetek (%) | ${exposure.map(e => f(pct(e))).join(' | ')} |`,
  ...metrics.map(([key, label]) => `| ${label} | ${matches.map(d => f(d.summary[key])).join(' | ')} |`), '',
  'Mniejsza celność nie jest sama w sobie dowodem poprawy. Uzasadnieniem przyjęcia zmiany jest ograniczenie niefizycznego zajmowania tego samego miejsca, zachowanie kontrolowanych prostych podań i brak teleportów. Próba ośmiu meczów nie ustala docelowych norm ligi ani siły każdego zespołu.', '',
  '**Presja i diagnoza strat.** Pozostawiono contestedMiss = 0,018. Dla catching 80 jego samodzielny wpływ na szansę nieutrzymania dysku wynosi około 1,14 punktu procentowego; dodatkowo działają rzeczywiste kontakty obrońców, przejęcia, zasięg i lądowanie. Nie zwiększano tej kary jednocześnie ze zmianą geometrii.', '',
  'Diagnoza rzutu zawiera bodyAvoidanceTicks i do 64 próbek bodyAvoidance: zawodnika omijanego, pierwotny punkt przechwytu, wybrany cel ruchu i żądaną prędkość. space-losses.json zapisuje każdą stratę obu warstw przyjętych scenariuszy oraz wynik tej samej pary w kontroli. Obecność manewru omijania nie oznacza automatycznie, że spowodował stratę; unknown_no_contact pozostaje nieustaloną przyczyną.', '',
  '**Weryfikacja.** Przeszły testy zajętego punktu, zachowania otwartej przestrzeni, obrotu sceny, hamowania przed nieruchomym ciałem i omijania przy linii. Przeszły również check-disc-intercept, check-recommendations, check-player-behavior, check-engine-realism (8 meczów fast) i check-disc-flight (4 pełne mecze: 771 chwytów, 150 strat), w tym kontrola ciągłości pozycji i przejęć. Targetowany ESLint i build przeszły; build nadal ostrzega o dużym bundle.', '',
  '**Odtwarzanie.**', '', '```powershell',
  'node scripts/balance-engine.mjs --situations --n 256 --no-body-traffic --output artifacts/scenarios/space-control-final.json',
  'node scripts/balance-engine.mjs --situations --n 256 --output artifacts/scenarios/space-final.json',
  'node scripts/balance-engine.mjs --situations --n 256 --offset 81000 --output artifacts/scenarios/space-validation.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 32400 --no-body-traffic --output artifacts/engine-audit/space-control.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 32400 --output artifacts/engine-audit/space-final.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 41400 --wind 20 --direction 90 --output artifacts/engine-audit/space-validation.json',
  'node scripts/check-body-traffic.mjs', 'node scripts/report-space-balance.mjs', '```', '',
  '**Granice.** Omijanie dotyczy obecnie zawodników bezpośrednio walczących o lecący dysk. Nie jest twardym modelem kolizji: początkowe nakładanie się pozycji, ruch pozostałych graczy i layouty nadal mogą pozostawić wspólną przestrzeń. W pełnych meczach pozostaje około 17% takich klatek. Model oceny czasu przechwytu nadal upraszcza koszt omijania; zapisy nowej diagnostyki pozwalają wskazać przypadki rozbieżności planu i dobiegu. Następna sensowna praca to uwzględnienie przeszkód w planowaniu przechwytu oraz ruchu pozostałych zawodników, przed kolejnym strojeniem skuteczności.', '',
  'space-pilot zawiera wcześniejszy wariant ochrony manewru przy linii; nie jest końcowym wynikiem. Czasy z równolegle uruchamianych pomiarów nie są wiarygodnym benchmarkiem wydajności. Brak zewnętrznego zbioru obserwacji meczowych ogranicza możliwość stwierdzenia pełnego balansu realistycznego.'
  , '', timingNote
]
fs.writeFileSync('artifacts/engine-audit/SPACE-BALANCE.md', lines.join('\n') + '\n')
console.log('OK: sparowane próby, redukcja nakładania, outy; SPACE-BALANCE.md, space-summary.json, space-losses.json')
