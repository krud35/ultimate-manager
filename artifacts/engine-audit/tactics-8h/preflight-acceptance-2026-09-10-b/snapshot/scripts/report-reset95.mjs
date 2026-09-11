import fs from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'artifacts/engine-audit'
const names = ['control', 'safe', 'layout', 'combined', 'execution', 'moderate', 'errors14', 'errors10', 'validation', 'defaults', 'validation-v2', 'defaults-v2', 'fast-validation']
const rows = []
for (const name of names) {
  const file = JSON.parse(fs.readFileSync(`${dir}/reset95-${name}.json`))
  assert.deepEqual(file.balance.changedDuringRun, [])
  for (const [mode, data] of Object.entries(file.modes)) {
    const resets = data.summary.types.dump_swing
    rows.push({ name, mode, seeds: data.matches.map(m => m.seed), configuration: file.balance.configuration,
      summary: data.summary, attempts: resets.attempts, completions: resets.completions,
      resetPct: 100 * resets.completions / resets.attempts })
  }
}
const final = rows.filter(r => ['validation-v2', 'defaults-v2'].includes(r.name) && r.mode === 'full')
assert.equal(final.length, 2)
const sum = key => final.reduce((n, r) => n + r[key], 0)
const resetPct = 100 * sum('completions') / sum('attempts')
assert.ok(resetPct >= 94 && resetPct <= 96, `Reset target missed: ${resetPct}`)
assert.ok(final.every(r => r.summary.throwLimits === 0), 'Artificial point limits')
assert.deepEqual(final[0].configuration, final[1].configuration)
const pilotSeeds = new Set(rows.filter(r => r.mode === 'full' && !r.name.endsWith('-v2')).flatMap(r => r.seeds))
const seeds = final.flatMap(r => r.seeds)
assert.equal(new Set(seeds).size, seeds.length)
assert.ok(seeds.every(s => !pilotSeeds.has(s)), 'Validation reuses calibration seeds')
const types = {}, diagnoses = {}
for (const r of final) {
  for (const [type, counts] of Object.entries(r.summary.types)) {
    types[type] ??= { attempts: 0, completions: 0 }
    for (const k of ['attempts', 'completions']) types[type][k] += counts[k]
  }
  for (const [cause, n] of Object.entries(r.summary.resetDiagnoses)) diagnoses[cause] = (diagnoses[cause] ?? 0) + n
}
const all = Object.values(types).reduce((a, t) => ({ attempts: a.attempts + t.attempts, completions: a.completions + t.completions }), { attempts: 0, completions: 0 })
const summary = { resetPct, attempts: sum('attempts'), completions: sum('completions'),
  matches: final.reduce((n, r) => n + r.summary.matches, 0), completionPct: 100 * all.completions / all.attempts,
  types, resetDiagnoses: diagnoses, rows }
summary.overallWithinPreviousTarget = summary.completionPct >= 90 && summary.completionPct <= 93
const fast = rows.filter(r => r.mode === 'fast')
summary.fast = { matches: fast.reduce((n, r) => n + r.summary.matches, 0),
  attempts: fast.reduce((n, r) => n + r.attempts, 0), completions: fast.reduce((n, r) => n + r.completions, 0) }
summary.fast.resetPct = 100 * summary.fast.completions / summary.fast.attempts
assert.ok(summary.fast.resetPct >= 94 && summary.fast.resetPct <= 96, 'Fast reset target missed')
fs.writeFileSync(`${dir}/reset95-summary.json`, JSON.stringify(summary, null, 2) + '\n')
const f = n => n.toFixed(2)
const scenarios = JSON.parse(fs.readFileSync('artifacts/scenarios/reset95-final.json')).summaries.filter(r => r.layer === 'execution')
fs.writeFileSync(`${dir}/RESET-94-96.md`, [
  '# Resety 94–96% — kalibracja 2026-09-09', '',
  `Końcowa walidacja: **${f(resetPct)}%**, ${summary.completions}/${summary.attempts} resetów w ${summary.matches} pełnych meczach. Wszystkie podania: ${f(summary.completionPct)}%.`, '',
  summary.overallWithinPreviousTarget ? 'Ogólne completion pozostaje w poprzednim paśmie 90–93%.'
    : `Ogólne completion przekracza wcześniejszą górną granicę 93% o ${f(summary.completionPct - 93)} punktu procentowego. Cel resetów został osiągnięty; poprzednie pasmo wszystkich podań nie zostało ściśle utrzymane w tej próbce.`, '',
  `Fast bez zmiany parametrów: ${f(summary.fast.resetPct)}%, ${summary.fast.completions}/${summary.fast.attempts} resetów w ${summary.fast.matches} meczach (control + fast-validation + defaults).`, '',
  'Pasmo dotyczy agregatu podań sklasyfikowanych jako dump_swing, nie każdego pojedynczego meczu ani wyłącznie zawodników z rolą dump. Klasyfikacji podań nie zmieniono.', '',
  '| Próba | Tryb | Mecze | Resety udane/próby | Reset completion | Wszystkie podania | Limity punktów |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.name} | ${r.mode} | ${r.summary.matches} | ${r.completions}/${r.attempts} | ${f(r.resetPct)}% | ${f(r.summary.completionPct)}% | ${r.summary.throwLimits} |`), '',
  '## Diagnoza', '',
  'W próbie kontrolnej: 239 resetów, 29 strat — 14 bez kontaktu, 7 outów, 5 dropów i 3 bloki. W 11 z 14 minięć odbiorca znajdował się nad ziemią przy niskim dysku przed upływem 1.2 s. Ten wskaźnik jest poszlaką, a nie samodzielnym dowodem przyczyny każdej straty.',
  'Konkretny reset 5.64 m, seed 742459: celowanie bez błędu, świeża obserwacja, odbiorca przewiduje osiągalny chwyt. Mimo to wykonuje layout przy dysku około 1 m nad ziemią; lot ciała utrwala prędkość i odbiorca mija okno chwytu. Stary warunek oceniał odległość do bieżącej pozycji dysku, pomijając możliwość zwykłego dobiegu do nadlatującego podania.', '',
  '## Zmiana mechaniki', '',
  'Ofensywny layout wymaga teraz, żeby przewidywany zwykły chwyt był nieosiągalny. Gdy zawodnik przewiduje chwyt w biegu, kontynuuje bieg i może korygować kierunek. Nadal może wykonać ratunkowy layout po pogorszeniu sytuacji; obrońca może atakować dysk przed odbiorcą. Zasięg chwytu, geometria kontaktu i losowanie skuteczności nie zostały powiększone.',
  'Eksperyment safe osobno ograniczał niepewność pamięci odbiorcy, wymagał zapasu prędkości i kontaktu przed planowanym końcem dostarczenia; combined łączył go z poprawką layoutów. Ten dodatkowy filtr nie trafił do końcowego kodu. Po usunięciu zbędnych layoutów sama poprawka dała 99.63% resetów i 93.65% wszystkich podań w kalibracji. Sprawdzono więc większy rozrzut sytuacyjny: execution (próg 12, nachylenie 0.14) oraz moderate (próg 8, nachylenie 0.08). To błąd punktu dostarczenia zależny od marginesu wykonania, nie automatyczne losowanie straty. Wybrane ustawienia są zapisane poniżej i w każdym artefakcie JSON.', '',
  'Wariant errors14 osiągnął cel w pilocie (94.48%), lecz w 12 kolejnych meczach dał tylko 92.10% resetów. W 46 z 59 strat resetów odnotowano błąd celowania. Nie zaakceptowano tego wyniku; częstotliwość pomyłek obniżono i wykonano walidację v2 na kolejnych, rozłącznych seedach.', '',
  'Ostatecznie przywrócono próg 12 i nachylenie 0.14 m/punkt oraz skalibrowano sporadyczne błędy wykonania: szansa przy throwing 60 wynosi 9%, przy 80 około 5%, przy 95 około 2%; wielkość pomyłki 1.8–4 m, z zachowaniem limitu 40% długości podania. To szansa pomyłki, nie straty — odbiorca może skorygować bieg i złapać niedokładny rzut. Dotyczy całego geometrycznego silnika, bo poprzednia bardzo łagodna kalibracja częściowo kompensowała wadliwe layouty. Fast nie używa computeMissDistanceM i zachowuje dotychczasową kalibrację.', '',
  '```json', JSON.stringify(final[0].configuration, null, 2), '```', '',
  '## Pozostałe typy podań', '',
  '| Typ | Udane/próby | Completion |', '|---|---:|---:|',
  ...Object.entries(types).map(([type, t]) => `| ${type} | ${t.completions}/${t.attempts} | ${f(100 * t.completions / t.attempts)}% |`), '',
  `Rozpoznania strat resetów w walidacji: ${JSON.stringify(diagnoses)}. unknown_no_contact nie przesądza o przyczynie.`, '',
  '## Metoda i ograniczenia', '',
  'Osobne seedy kalibracyjne i walidacyjne, zamrożone kopie źródeł, pełne mecze z rotacjami i adaptacją taktyki. Każdy artefakt przechowuje konfigurację, hashe kodu, argumenty i pustą listę changedDuringRun. Defaults sprawdza ustawienia domyślne bez flag strojących.',
  'Kontrolowane 17 sytuacji ×2 warstwy ×128 losowań. Poniżej warstwa wykonania dla końcowej kalibracji. Spadek skuteczności względem samej poprawki layoutu wynika z przywróconych błędów wykonania, szczególnie u zmęczonego rzucającego. Test regresji odtwarza niepotrzebny layout, potwierdza bieg do osiągalnego podania oraz dostępność ratunkowego i obronnego layoutu. Test błędu rzutu sprawdza narastanie przesunięcia przy gorszym marginesie, limit odchylenia oraz malejącą częstość pomyłek dla wyższego throwing.', '',
  'Sprawdzenie geometrii 4 dodatkowych meczów dla wariantu błędów 0.14: 1090 chwytów i 85 strat; poprawne kontakty, ciągłość ruchu i brak sztucznych zakończeń punktów. Końcowa korekta 0.14 →0.09 zmienia tylko częstość pomyłek celowania. Sprawdzenia dobiegu, percepcji, omijania, resetów, 33 atrybutów i realizmu oraz ESLint: OK. Produkcyjny build: OK, z ostrzeżeniem o dużych chunkach.', '',
  '| Sytuacja | Udane/próby |', '|---|---:|',
  ...scenarios.map(r => `| ${r.case} | ${r.completed}/${r.n} |`), '',
  'Cel jest parametrem projektu. Próbka dotyczy drużyn demonstracyjnych i nie potwierdza całego rozkładu skuteczności we wszystkich ligach, ustawieniach i poziomach umiejętności.', '',
  'Odtworzenie raportu: `node scripts/report-reset95.mjs`. Dokładne polecenia symulacji znajdują się w balance.args plików reset95-*.json.', '',
].join('\n'))
console.log(JSON.stringify({ resetPct, attempts: summary.attempts, completions: summary.completions, matches: summary.matches, completionPct: summary.completionPct }))
