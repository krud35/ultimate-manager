import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const root = 'artifacts/scenarios/'
const names = ['control-sprint', 'calibrated', 'validation-independent', 'isolated-throw60', 'isolated-catch60', 'isolated-reaction-half']
const data = Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(root + name + '.json'))]))
const current = data.calibrated
const key = r => `${r.case}/${r.layer}/${r.seed}`
const indices = Object.fromEntries(names.map(name => [name, new Map(data[name].rows.map(r => [key(r), r]))]))
// Verify that comparisons use the same source, paired seeds and scenario count.
for (const name of names) {
  const d = data[name]
  assert.equal(d.rows.length, 17 * 2 * d.n)
  assert.equal(new Set(d.rows.map(key)).size, d.rows.length)
  assert.deepEqual(d.hashes, current.hashes)
  if (name !== 'validation-independent') assert.deepEqual(d.rows.map(key), current.rows.map(key))
}
for (const [file, hash] of Object.entries(current.hashes)) {
  const path = file.includes('/') ? file : `src/matchEngine/ai/${file}.js`
  assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'), hash, `Stale artifact: ${path}`)
}
const trainingSeeds = new Set(current.rows.map(r => r.seed))
assert.ok(data['validation-independent'].rows.every(r => !trainingSeeds.has(r.seed)))
for (const name of ['calibrated', 'validation-independent']) {
  const d = data[name]
  assert.ok(d.rows.filter(r => ['outside', 'toe_out'].includes(r.case)).every(r => !r.success))
  assert.ok(d.rows.filter(r => r.case === 'sideline').every(r => r.success), 'Sideline support regression')
  assert.ok(d.rows.some(r => r.case === 'returning_arc' && r.outsideAir && r.success))
  assert.ok(d.rows.some(r => r.case === 'toe_in' && r.success && r.diagnosis.toeIn))
  assert.ok(d.rows.every(r => Number.isFinite(r.durationMs) && r.durationMs > 0))
  assert.ok(d.decisions.filter(r => r.case === 'double_coverage').every(r => !r.selected))
}
const sum = (name, c, layer = 'execution') => data[name].summaries.find(r => r.case === c && r.layer === layer)
assert.ok(sum('calibrated', 'deep_open').completed > sum('control-sprint', 'deep_open').completed)

const losses = current.rows.filter(r => !r.success).map(row => {
  const ideal = indices.calibrated.get(`${row.case}/ideal/${row.seed}`)
  const control = indices['control-sprint'].get(key(row))
  const diagnosis = row.diagnosis
  const comparison = row.layer === 'ideal' ? 'ideal_flight_loss'
    : ideal.success ? 'execution_sensitive_loss' : 'loss_also_present_with_ideal_flight'
  return { case: row.case, layer: row.layer, seed: row.seed, outcome: row.reason,
    cause: diagnosis.cause, causeConfirmed: diagnosis.causeConfirmed,
    comparison, idealOutcome: ideal.reason, sprintOutcome: control.reason,
    missM: diagnosis.missM, arcExecutionError: diagnosis.arcExecutionError,
    curveExecutionError: diagnosis.curveExecutionError,
    fatiguePenalty: diagnosis.fatiguePenalty, fatigueComponents: diagnosis.fatigueComponents,
    contact: row.contact, landing: row.landing, contacts: diagnosis.contacts,
    receiverReads: diagnosis.receiverReads,
    interpretation: row.reason === 'not_in_reach'
      ? 'Brak kontaktu jest potwierdzony. Sparowany idealny lot izoluje łączną wrażliwość na wykonanie, nie dowodzi osobno błędu celowania, percepcji ani ruchu.'
      : row.reason === 'out_of_bounds'
        ? 'W negatywnych fixtures outside/toe_out strata jest oczekiwana; zapis kontaktu/lądowania określa miejsce. Ogólna przyczyna w silniku pozostaje nieustalona.'
        : 'Przebieg zawiera nieudany chwyt, lądowanie lub kontakt obrońcy; wcześniejsze dotknięcia mogą zostać odzyskane.' }
})
fs.writeFileSync(root + 'loss-ledger.json', JSON.stringify({ source: 'calibrated.json', hashes: current.hashes, losses }, null, 2))

const labels = { incut: 'Incut 8 m', reset: 'Reset 7 m', turn_toward: 'Start w stronę celu', turn_away: 'Start od celu',
  double_coverage: 'Wymuszony huck w podwójne krycie', deep_open: 'Otwarty huck 33 m', sideline: 'Odbiór przy linii',
  returning_arc: 'Łuk wychodzący i wracający', outside: 'Dysk poza zasięgiem za boiskiem', toe_in: 'Legalny toe-in',
  toe_out: 'Lądowanie zbyt daleko za linią', tip_recovery: 'Odzyskanie po zbiciu', wind_0: 'Wiatr 20 mph / 0°',
  wind_90: 'Wiatr 20 mph / 90°', wind_180: 'Wiatr 20 mph / 180°', aim_error_reset: 'Reset z błędem 1,2 m', fatigued_incut: 'Incut, energia 20/100' }
const ids = Object.keys(labels)
const count = (c, reason) => current.rows.filter(r => r.case === c && r.layer === 'execution' && r.reason === reason).length
const lines = [
  '# Kalibracja prostych sytuacji — 9 września 2026', '',
  'Zrealizowano punkty 1–3: kontrolowane sytuacje, rejestr każdej straty i kalibrację mechaniki dobiegu z oddzielnym sprawdzeniem reakcji, wykonania rzutu i chwytu. To kalibracja mechanizmów, nie zakończony balans całych meczów ani dopasowanie do empirycznych statystyk ligi.', '',
  '**Metoda.** 17 sytuacji × 128 seedów × 2 warstwy × 6 wariantów = 26 112 przebiegów. Warstwa idealna wyłącza błąd wykonania toru, ale zachowuje percepcję, ruch, kontakt, losowy chwyt i lądowanie. Warstwa wykonania używa resolveThrow(executionOnly), błędu celowania i wykonania łuku. Obie korzystają z produkcyjnej pętli runContinuousThrowSimulation; kontrolowane wejście zaczyna się w chwili wypuszczenia dysku. Nie jest to pełne posiadanie z naturalną decyzją i ustawianiem 7 na 7.', '',
  'Seedy sparowano między wariantami. Liczniki seedów mieszane są deterministycznym hashem przed produkcyjnym LCG; oddzielne strumienie obsługują wykonanie, tor i kontakt. Walidacja używa rozłącznych seedów. Ten sam seed kontaktu nie gwarantuje identycznego rzutu RNG po zmianie liczby kontaktów. Zawodnicy mają neutralne traity, morale 72 i atrybuty 80; warianty zmieniają wyłącznie wszystkie atrybuty throwing na 60 lub catching na 60. Planowany tor pozostaje wspólny. To lokalna analiza wrażliwości, nie pełny audyt wszystkich statystyk, morale i traitów.', '',
  '**Przyjęte poprawki.**', '',
  '- Prędkość dobiegu zależy od czasu do przewidywanego kontaktu: 0,15 s wyprzedzenia i 0,08 m bufora. Integrator zachowuje ograniczenia przyspieszenia i hamowania. Usuwa to przestrzeliwanie punktu oczekiwania i oscylacje przy długim locie.',
  '- Plan ruchu przy linii wybiera miejsce na obie stopy wewnątrz boiska, z odjęciem wysunięcia ręki od pozostałego zasięgu. Nie zakłada automatycznej pozycji toe-in podczas biegu. Toe-in nadal rozstrzyga rzeczywisty kontakt i lądowanie.',
  '- Planowanie przechwytu uwzględnia kontynuację lotu do 12 s po nominalnym czasie, zgodnie z budżetem symulatora. Dłuższy czas do rzeczywistego chwytu obniża ocenę rzutu. Wcześniej lot pod wiatr mógł zostać uznany za nieosiągalny, choć późniejszy chwyt był możliwy.',
  '- Do diagnozy trafia pełny wynik wykonania. Kara zmęczenia pokazuje sumę i trzy składniki, zamiast raportować wyłącznie 3,5 punktu kary accuracy.', '',
  '**Skuteczność po wykonaniu rzutu, liczba zakończonych podań / 128.** Kontrola sprint wyłącza wyłącznie regulację prędkości dobiegu; zawiera pozostałe poprawki. Nie jest kopią całego silnika sprzed tej pracy.', '',
  '| Sytuacja | Sprint | Kalibracja | Niezależna próba | Rzut 60 | Chwyt 60 | Reakcja ×0,5 |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...ids.map(c => `| ${labels[c]} | ${names.map(n => sum(n, c).completed).join(' | ')} |`), '',
  'Nie ma założenia, że każda poprawka podniesie skuteczność każdego rzutu. Np. wiatr 180° daje 127→125/128. Globalne skrócenie reakcji daje w końcowej próbie jedynie +1 chwyt zmęczonego incutu, bez poprawy pozostałych scenariuszy; pozostawiono mnożnik 1. Rzut 60 obniża otwarty huck ze 120 do 106, chwyt 60 do 118. Nie podwyższano globalnej skuteczności chwytu ani celności.', '',
  '**Rejestr strat w wariancie kalibrowanym, warstwa wykonania.**', '',
  '| Sytuacja | Zakończenie i liczba |', '|---|---|',
  ...ids.map(c => `| ${labels[c]} | ${Object.entries(sum('calibrated', c).reasons).filter(([reason]) => reason !== 'catch').map(([reason, n]) => `${reason}: ${n}`).join(', ') || 'brak strat'} |`), '',
  `Incut traci raz przy lądowaniu, reset nie traci. Otwarty huck ma ${count('deep_open', 'drop')} dropy i ${count('deep_open', 'not_in_reach')} braki kontaktu. Wszystkie cztery braki kontaktu znikają w sparowanym idealnym locie: to dowód wrażliwości całego odbioru na wykonanie toru, nie samodzielny dowód winy odbierającego. Wymuszony błąd resetu 1,2 m zostaje skorygowany w każdej próbie.`, '',
  'Przy energii 20/100 suma kar wykonania wynosi 38,61 punktu: accuracy 3,5, performance 26,22, collapse 8,89. Wynik 82/128 (walidacja 79/128) wobec 126/128 na idealnym torze; 44 straty to brak kontaktu, w 43 z tych par idealny lot zostaje złapany. To mocny sygnał do osobnej kalibracji nakładających się kar zmęczenia. Nie usuwano ich arbitralnie bez docelowej krzywej sprawności i danych o rotacji/staminie.', '',
  'Każda strata obu warstw ma wpis w loss-ledger.json: case, seed, zakończenie, porównanie z idealnym lotem i sprintem, błędy toru, kary zmęczenia, kontakty, odczyty odbierającego i lądowanie. Nieznane przyczyny zachowują etykietę unknown_no_contact/unknown_boundary_cause. Lista czynników nie jest dowodem przyczynowości. Pełne ślady klatek dla pierwszych dwóch seedów każdej sytuacji znajdują się w plikach przebiegów.', '',
  '**Decyzje i pozostałe ograniczenia.** 16 odczytów na sytuację w stałym ustawieniu, ze skanami od 0 do 1040 ms; to osobne próby scanThrowOptions. Podwójne krycie odrzucone 16/16, otwarty huck i reset wybrane 16/16. Scena outside nie wymusza decyzji rzutu za linię: skaner sam wybiera cel do ustawionego odbierającego. Próby decyzyjne używają zdrowych zawodników 80, także przy etykiecie fatigued_incut; nie mierzą decyzji zmęczonego zawodnika.', '',
  'Wymuszony huck w podwójne krycie jest nadal skuteczny 124/128, choć występuje 13 dotknięć lane_block i tylko jedna ostateczna strata po bloku. To nie potwierdza poprawnego balansu obrony. Do dalszej pracy: czas i pozycja próby obrońcy, odzyskanie po dotknięciu, nakładanie się ciał i definicja presji przy chwycie. Obecne wykrycie contested porównuje kontakty w wąskim oknie części ticka; fizycznie bliski obrońca nie musi zwiększyć trudności chwytu. Nie należy dopasowywać tego do oczekiwanego procentu tylko przez mnożnik skuteczności.', '',
  'Próby lotu z wiatrem badają spójność planu i wykonania. Nie kalibrują współczynników aerodynamicznych na pomiarach realnego dysku. Próba toe-in jest kontrolowanym krótkim lotem przy lądowaniu, a odzyskanie po zbiciu zawiera pomocnika; nie stanowią rozkładu sytuacji meczowych.', '',
  '**Odtwarzanie i kontrola.**', '',
  '```powershell',
  'node scripts/calibrate-situations.mjs --n 128 --output artifacts/scenarios/calibrated.json',
  'node scripts/calibrate-situations.mjs --n 128 --approach sprint --output artifacts/scenarios/control-sprint.json',
  'node scripts/calibrate-situations.mjs --n 128 --offset 81000 --output artifacts/scenarios/validation-independent.json',
  'node scripts/calibrate-situations.mjs --n 128 --throw-skill 60 --output artifacts/scenarios/isolated-throw60.json',
  'node scripts/calibrate-situations.mjs --n 128 --catch-skill 60 --output artifacts/scenarios/isolated-catch60.json',
  'node scripts/calibrate-situations.mjs --n 128 --read-scale 0.5 --output artifacts/scenarios/isolated-reaction-half.json',
  'node scripts/report-situation-calibration.mjs', '```', '',
  'Skrypt raportu sprawdza zgodność hashy źródeł, par seedów, ich rozłączność z walidacją oraz regresje: bezpieczna linia, legalny toe-in, negatywne outy, powrót dysku i poprawa dobiegu. Pozostałe pliki JSON w tym katalogu są pośrednimi eksperymentami, czasem ze starszymi fixtures i liniowymi seedami; nie należy mieszać ich z powyższym końcowym zestawem.', '',
  '**Weryfikacja tej zmiany.** Przeszły check-disc-intercept (w tym nowe regresje bezpiecznego podparcia i ograniczonego hamowania), check-recommendations, check-player-behavior, check-engine-realism (8 meczów fast) oraz check-disc-flight (4 pełne mecze: 951 chwytów, 124 straty). Targetowany ESLint i build przeszły; build zgłasza ostrzeżenie o dużym bundle. Pełne mecze służą kontroli integracji i nie są dowodem poprawnego balansu ligowego. Wyniki walidacji opisują tę sesję; przy kolejnych zmianach należy uruchomić te komendy ponownie.'
]
fs.writeFileSync(root + 'CALIBRATION.md', lines.join('\n') + '\n')
console.log(`OK: ${names.length} zgodnych wariantów, ${losses.length} strat opisanych; ${root}CALIBRATION.md`)
