import fs from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'artifacts/engine-audit'
const names = ['control', 'safe', 'layout', 'combined', 'execution', 'moderate', 'validation', 'defaults', 'fast-validation']
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
const final = rows.filter(r => ['validation', 'defaults'].includes(r.name) && r.mode === 'full')
assert.equal(final.length, 2)
const sum = key => final.reduce((n, r) => n + r[key], 0)
const resetPct = 100 * sum('completions') / sum('attempts')
assert.ok(resetPct >= 94 && resetPct <= 96, `Reset target missed: ${resetPct}`)
assert.ok(final.every(r => r.summary.throwLimits === 0), 'Artificial point limits')
assert.deepEqual(final[0].configuration, final[1].configuration)
const pilotSeeds = new Set(rows.find(r => r.name === 'control' && r.mode === 'full').seeds)
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
fs.writeFileSync(`${dir}/reset95-summary.json`, JSON.stringify(summary, null, 2) + '\n')
const f = n => n.toFixed(2)
fs.writeFileSync(`${dir}/RESET-94-96.md`, [
  '# Resety 94–96% — kalibracja 2026-09-09', '',
  `Końcowa walidacja: **${f(resetPct)}%**, ${summary.completions}/${summary.attempts} resetów w ${summary.matches} pełnych meczach. Wszystkie podania: ${f(summary.completionPct)}%.`, '',
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
  '```json', JSON.stringify(final[0].configuration, null, 2), '```', '',
  '## Pozostałe typy podań', '',
  '| Typ | Udane/próby | Completion |', '|---|---:|---:|',
  ...Object.entries(types).map(([type, t]) => `| ${type} | ${t.completions}/${t.attempts} | ${f(100 * t.completions / t.attempts)}% |`), '',
  `Rozpoznania strat resetów w walidacji: ${JSON.stringify(diagnoses)}. unknown_no_contact nie przesądza o przyczynie.`, '',
  '## Metoda i ograniczenia', '',
  'Osobne seedy kalibracyjne i walidacyjne, zamrożone kopie źródeł, pełne mecze z rotacjami i adaptacją taktyki. Każdy artefakt przechowuje konfigurację, hashe kodu, argumenty i pustą listę changedDuringRun. Defaults sprawdza ustawienia domyślne bez flag strojących.',
  'Kontrolowane 17 sytuacji ×2 warstwy ×128 losowań: zwykły reset, incut i zmęczony incut po 128/128 udanych w warstwie wykonania. Podwójne krycie 114/128; out i toe-out 0/128, toe-in i powrót dysku zza linii 128/128. Test regresji odtwarza niepotrzebny layout, potwierdza bieg do osiągalnego podania oraz dostępność ratunkowego i obronnego layoutu.',
  'Cel jest parametrem projektu. Próbka dotyczy drużyn demonstracyjnych i nie potwierdza całego rozkładu skuteczności we wszystkich ligach, ustawieniach i poziomach umiejętności.', '',
  'Odtworzenie raportu: `node scripts/report-reset95.mjs`. Dokładne polecenia symulacji znajdują się w balance.args plików reset95-*.json.', '',
].join('\n'))
console.log(JSON.stringify({ resetPct, attempts: summary.attempts, completions: summary.completions, matches: summary.matches, completionPct: summary.completionPct }))
