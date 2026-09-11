import fs from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'artifacts/engine-audit'
const names = ['control', 'offense', 'pilot', 'precise', 'selective', 'validation', 'wind', 'fast-pilot', 'fast-validation', 'defaults']
const files = Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(`${dir}/completion90-${name}.json`))]))
const rows = names.flatMap(name => Object.entries(files[name].modes).map(([mode, data]) => {
  assert.deepEqual(files[name].balance.changedDuringRun, [], `${name}: changing sources`)
  const attempts = data.matches.reduce((n, m) => n + m.attempts, 0)
  const completed = data.matches.reduce((n, m) => n + m.completions, 0)
  return { name, mode, attempts, completed, ...data.summary }
}))
const accepted = rows.filter(r => ['selective', 'validation', 'wind', 'defaults'].includes(r.name) && r.mode === 'full')
const attempts = accepted.reduce((n, r) => n + r.attempts, 0)
const completed = accepted.reduce((n, r) => n + r.completed, 0)
const completionPct = 100 * completed / attempts
const finalConfig = files.defaults.balance.configuration
for (const key of ['block', 'approach', 'arrival', 'miss']) {
  assert.deepEqual(finalConfig[key], files.validation.balance.configuration[key], `Default ${key} differs from validated candidate`)
}
assert.equal(finalConfig.fast.gapOffset, -6)
assert.ok(completionPct >= 90 && completionPct <= 93)
assert.equal(accepted.reduce((n, r) => n + r.throwLimits, 0), 0)
const validationSeeds = new Set(files.validation.modes.full.matches.map(m => m.seed))
assert.ok(files.selective.modes.full.matches.every(m => !validationSeeds.has(m.seed)))
const combinedTypes = {}
const combinedDiagnoses = {}
for (const row of accepted) {
  for (const [key, value] of Object.entries(row.types)) {
    combinedTypes[key] ??= { attempts: 0, completions: 0 }
    combinedTypes[key].attempts += value.attempts
    combinedTypes[key].completions += value.completions
  }
  for (const [key, value] of Object.entries(row.diagnoses)) combinedDiagnoses[key] = (combinedDiagnoses[key] ?? 0) + value
}
const f = n => n.toFixed(2)
const summary = { rows, acceptedFull: { matches: accepted.reduce((n, r) => n + r.matches, 0), attempts, completed, completionPct, types: combinedTypes, diagnoses: combinedDiagnoses }, configuration: finalConfig }
fs.writeFileSync(`${dir}/completion90-summary.json`, JSON.stringify(summary, null, 2) + '\n')
const lines = [
  '# Completion 90–93% — kalibracja 2026-09-09', '',
  `Cel użytkownika: 90–93% ukończonych podań w agregacie pełnych meczów. Wynik końcowych prób: **${f(completionPct)}%**, ${completed}/${attempts} podań, ${summary.acceptedFull.matches} meczów.`, '',
  'To cel projektowy, nie niezależnie ustalona norma ligi. Nie oznacza, że każdy mecz, poziom graczy, typ podania albo pogoda osiągnie to samo pasmo.', '',
  '| Próba | Tryb | Mecze | Podania | Completion | Bloki/mecz | Limity punktów |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.name} | ${r.mode} | ${r.matches} | ${r.attempts} | ${f(r.completionPct)}% | ${f(r.blocksPerMatch)} | ${r.throwLimits} |`), '',
  '## Co zmieniono', '',
  '- Śledzenie dysku: aktualizacja celu co 80 zamiast 200 ms, czas narastania korekty toru ×0.5. Początkowy czas reakcji, zasłanianie dysku i zależność od discReading/anticipation pozostają. Obie strony używają tego samego modelu; odbiorca nie otrzymuje przyszłej rzeczywistej trajektorii.',
  '- Błąd sytuacyjny celowania: próg marginesu 12 → 0, przesunięcie 0.14 → 0.04 m na punkt deficytu. Losowe pomyłki zależne od umiejętności, błąd wysokości/krzywizny, wiatr, zmęczenie i presja pozostają.',
  '- Zbicie po geometrycznym kontakcie: baza 0.10 → 0.05, wkład umiejętności 0.28 → 0.14. To jawna kalibracja częstości skutecznego zagrania obrony; nie zmiana zasięgu ręki ani wyłączenie przechwytów.',
  '- Decyzja przy stall <5: opcja z niepewnością zapamiętanej pozycji >0.5 m odpada do kolejnego odczytu. Pod presją czasu zostaje dostępna z karą za ryzyko. Aktualna obserwacja ma niepewność 0.',
  '- Fast: gapOffset −12 → −6, osobno dopasowany do nowego celu. Pozostałe parametry fast bez zmian.', '',
  '## Co pokazały porównania', '',
  'Control, offense i pilot używają tej samej zamrożonej wersji oraz tych samych seedów. Offense zmienia odczyt i celowanie (próg 8, nachylenie 0.08); pilot dodatkowo zmniejsza szansę bloku. Wyniki kolejnych pełnych meczów rozchodzą się po pierwszej zmianie zdarzenia — różnicy pojedynczych liczników nie należy traktować jak bezpośredniego przypisania przyczyn.',
  'Precise i selective mają docelowe celowanie (0/0.04), różnią się filtrem niepewności. Precise przekroczył cel, ale jeden punkt skończył limitem; nie został wybrany. Selective nie miał limitów i trafił do walidacji bez dalszego strojenia.',
  'Validation: 8 nowych seedów, naturalnie generowana pogoda, adaptacja taktyki i rotacje. Wind: 4 kolejne seedy, stały boczny wiatr 20 mph. Defaults: końcowe ustawienia bez flag kalibracyjnych, zamienione drużyny home/away. Zespoły demonstracyjne Seattle/Boston; nie jest to przegląd całej ligi.', '',
  '## Struktura końcowych podań', '',
  '| Typ | Udane / próby | Completion |', '|---|---:|---:|',
  ...Object.entries(combinedTypes).map(([key, v]) => `| ${key} | ${v.completions}/${v.attempts} | ${f(100 * v.completions / v.attempts)}% |`), '',
  `Rozpoznania: ${JSON.stringify(combinedDiagnoses)}. unknown_no_contact oznacza brak potwierdzonego kontaktu, a nie dowód konkretnego błędu AI.`, '',
  '## Weryfikacja i ograniczenia', '',
  '- Kontrolowane sytuacje: 17 przypadków ×2 warstwy ×64 losowania. Incut, reset i zmęczony incut: 64/64 w warstwie wykonania; podwójne krycie: 54/64. Out i toe-out: 0/64, toe-in i powrót dysku zza linii: 64/64.',
  '- Osobne 128 losowań na przypadek przy throwing 60 i 95 zachowują różnice wykonania; podwójne krycie 114/128 →128/128. Proste podania są blisko sufitu. Ten mały zestaw nie dowodzi poprawnego wpływu każdego atrybutu i traitu w całej lidze.',
  '- Sprawdzenia dobiegu/bezwładności, odczytu, omijania graczy, resetów, 33 atrybutów i realizmu: OK. Test odczytu zaktualizowany z dotychczasowego okna 200 ms do 80 ms; nadal sprawdza brak znajomości błędu rzutu przy wypuszczeniu.',
  '- Niezależne sprawdzenie geometrii 4 meczów: 878 chwytów, 85 strat, każdy wymagany kontakt potwierdzony, brak teleportów i limitów punktów. ESLint zmienianych modułów i produkcyjny build: OK; build zgłasza istniejące duże chunki.',
  '- Źródła były zamrażane, ponieważ inne zadanie równolegle zmieniało telemetrykę stylów gry. Każdy wynik zawiera hashe źródeł, konfigurację, argumenty i pustą listę changedDuringRun. Końcowa próba defaults dodatkowo weryfikuje integrację ustawień domyślnych.',
  '- Cel osiągnięty dla agregatu; resety oraz pojedyncze mecze mogą wypaść poniżej 90%. Pozostałe minięcia dysku i selektywność hucków nadal wymagają osobnego audytu realizmu.', '',
  'Odtworzenie końcowej próby: `node scripts/balance-engine.mjs --fast 8 --full 4 --offset 628357 --swap --progress --output artifacts/engine-audit/completion90-defaults.json`.',
  'Artyfakty comparison: completion90-*.json, scenarios/completion90-*.json. Raport: `node scripts/report-completion90.mjs`.', '',
]
fs.writeFileSync(`${dir}/COMPLETION-90-93.md`, lines.join('\n'))
console.log(JSON.stringify(summary.acceptedFull))
