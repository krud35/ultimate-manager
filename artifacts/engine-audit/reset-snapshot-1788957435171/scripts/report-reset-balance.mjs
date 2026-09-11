import fs from 'node:fs'
import assert from 'node:assert/strict'

const load = path => JSON.parse(fs.readFileSync(path))
const names = ['reset-control', 'reset-final', 'reset-validation']
const data = names.map(n => load(`artifacts/engine-audit/${n}.json`))
const situations = ['reset-control', 'reset-final'].map(n => load(`artifacts/scenarios/${n}.json`))
for (const d of [...data, ...situations]) {
  assert.deepEqual(d.balance.changedDuringRun, [])
  assert.deepEqual(d.balance.sourceHashes, data[0].balance.sourceHashes)
}
const modes = data.map(d => d.modes.full)
assert.deepEqual(modes[0].matches.map(r => r.seed), modes[1].matches.map(r => r.seed))
const seeds = new Set(modes[0].matches.map(r => r.seed))
assert.ok(modes[2].matches.every(r => !seeds.has(r.seed)))
assert.deepEqual(situations[0].rows.map(r => [r.case, r.layer, r.seed, r.success, r.reason]),
  situations[1].rows.map(r => [r.case, r.layer, r.seed, r.success, r.reason]))
const pct = (a, b) => b ? 100 * a / b : 0
const f = n => Number(n).toFixed(2)
const summaries = modes.map(d => {
  const exposure = d.matches.reduce((s, r) => ({ frames: s.frames + r.bodyExposure.flightFrames,
    overlaps: s.overlaps + r.bodyExposure.overlapFrames }), { frames: 0, overlaps: 0 })
  return { ...d.summary, exposure, overlapPct: pct(exposure.overlaps, exposure.frames),
    dumpPct: pct(d.summary.types.dump_swing?.attempts ?? 0, d.matches.reduce((s, r) => s + r.attempts, 0)) }
})
const probes = ['before', 'after'].map(n => load(`artifacts/engine-audit/reset-${n}.json`))
const probeSummary = probes.map(d => {
  const active = d.scans.flatMap(s => s.players.filter(a => !a.isDump && a.id !== s.throwerId && a.state === 'ACTIVE_CUT'))
  const rejects = {}, selected = {}
  for (const s of d.scans) {
    for (const r of s.rejected) rejects[r.reason] = (rejects[r.reason] ?? 0) + 1
    const chosen = s.options.find(o => o.id === s.selectedId)
    if (chosen) { const key = chosen.isDump ? 'reset' : 'other'; selected[key] = (selected[key] ?? 0) + 1 }
  }
  return { scans: d.scans.length, active: active.length, zeroClock: active.filter(a => a.stateMs === 0).length,
    longestPointThrows: Math.max(...d.counts.map(p => p.throws)), limits: d.counts.filter(p => ['throw_limit', 'action_limit'].includes(p.score?.reason)).length,
    rejects, selected }
})
const passed = summaries.slice(1).every(s => s.throwLimits === 0)
fs.writeFileSync('artifacts/engine-audit/reset-summary.json', JSON.stringify({ names, passed, summaries, probeSummary }, null, 2))
const metrics = [['completionPct', 'Celne podania (%)'], ['dumpPct', 'Dumpy/swingi wśród prób (%)'],
  ['turnoversPerPoint', 'Straty/punkt'], ['throwsPerPoint', 'Podania/punkt'], ['overlapPct', 'Klatki lotu z nakładaniem sylwetek (%)'],
  ['blocksPerMatch', 'Bloki/mecz'], ['stallOutsPerMatch', 'Stall-out/mecz'], ['throwLimits', 'Awaryjne limity']]
const lines = ['# Przerywanie cutów po resecie — diagnoza i poprawka', '',
  `Status próby balansu: **${passed ? 'zaliczona — bez awaryjnych limitów w 16 meczach nowej wersji' : 'niezaliczona — pozostają awaryjne limity'}**. Nie jest to stwierdzenie pełnej kalibracji całej ligi.`, '',
  '## Przyczyna i zmiana', '',
  'Gałąź postResetClearout w cutterBrain działała przed obsługą ACTIVE_CUT, INITIATING_CUT i CLEARING. W każdym kroku 20 ms ponownie losowała kierunek i długość trasy oraz zerowała stateMs. Nie tylko przerywała plan biegu: omijała też normalną ocenę cutu, nawrót, zakończenie i zwalnianie miejsca. Działała również mimo zajętego limitu aktywnych cutterów.', '',
  'Reset uruchamia teraz tę gałąź wyłącznie dla zawodnika WAITING, który może rozpocząć cut według istniejącej reguły canStartCut. Nowa próba przechodzi przez INITIATING_CUT, więc korzysta z czasu reakcji zawodnika. Aktywny bieg utrzymuje cel do zwykłej oceny; clearing może się skończyć. Nie zmieniono celności, chwytu, kary za reset, progów wyboru podań ani limitu 120 akcji.', '',
  'Test check-reset-cuts odtwarza stary błąd za pomocą przełącznika procesu. Sprawdza zachowanie celu i zegara, etap inicjacji, clearing, ograniczenie przy zajętych slotach oraz możliwość zakończenia aktywnego cutu mimo utrzymywanego sygnału resetu.', '',
  '## Diagnostyka decyzji', '',
  'THROW_SCAN_DIAGNOSTICS.observe jest opcjonalnym odbiornikiem danych; bez niego nie przechowujemy skanów. Zapis obejmuje widziane lub pamiętane pozycje, stany i cele odbiorców, wybrane ID, oceny opcji oraz powody wybranych odrzuceń. Diagnostyka nie losuje i nie modyfikuje opcji.', '',
  `Seed 105437, 20 mph / 90°, aktualne źródła: najdłuższy punkt ${probeSummary[0].longestPointThrows} → ${probeSummary[1].longestPointThrows} podań. W skanach przy requireForwardPass zegar aktywnego cuttera był równy zero w ${probeSummary[0].zeroClock}/${probeSummary[0].active} obserwacji przed poprawką i ${probeSummary[1].zeroClock}/${probeSummary[1].active} po niej. Liczba tych skanów: ${probeSummary[0].scans} → ${probeSummary[1].scans}. Są to obserwacje, nie unikalne cuty ani niezależne próby.`, '',
  'Najczęściej rejestrowane odrzucenia dotyczą separacji oraz zejścia z linii podania. Sam licznik odrzuceń nie dowodzi, że należało wykonać odrzucony rzut. Potwierdzonym błędem jest restart stanu ruchu; nie uzasadnia on globalnego łagodzenia wymagań wobec podań.', '',
  'Poprzedni raport ROUTE-BALANCE opisywał 120 podań na tym seedzie. Od tamtej próby zmieniły się również inne pliki silnika i traitów w workspace. Nie przywracano tych zmian. Kontrola w tym raporcie wyłącza tylko naprawę restartowania cutów na bieżącym kodzie; historyczne 120 podań nie jest jej wynikiem.', '',
  '## Próby', '',
  'Kontrola i poprawka: po 8 pełnych meczów, te same seedy (offset 94437), wiatr 20 mph / 90°, standardowa adaptacja AI i rotacja. Walidacja: 8 rozłącznych seedów (offset 182451), standardowo generowana pogoda. Hashe plików silnika, modeli i danych składów zgadzają się między seriami; źródła nie zmieniły się podczas symulacji.', '',
  '| Wskaźnik | Kontrola | Poprawka | Inne seedy/pogoda |', '|---|---:|---:|---:|',
  ...metrics.map(([key, label]) => `| ${label} | ${summaries.map(s => f(s[key])).join(' | ')} |`), '',
  '17 kontrolowanych sytuacji × 2 warstwy × 128 seedów × 2 warianty = 8704 przebiegi. Wyniki chwytów i przyczyny zakończenia są identyczne dla każdej sparowanej próby. Te sytuacje zaczynają się przy wypuszczeniu dysku, więc sprawdzają brak regresji wykonania; błąd przygotowania ataku pokrywają test stanów i pełne mecze.', '',
  'Nakładanie sylwetek oznacza odsetek klatek IN_FLIGHT z choć jedną nakładającą się parą obrysów, nie faule ani liczbę kolizji. Pomiar nie obejmuje przygotowania rzutu. Czasy pełnych serii uruchamianych równolegle nie służą do porównania wydajności.', '',
  '## Ograniczenia', '',
  'canStartCut wykorzystuje liczbę aktywnych cutterów ze wspólnego początku kroku; nie jest ścisłą rezerwacją slotów między kilkoma równocześnie ruszającymi zawodnikami. Pozostaje lokalne omijanie zamiast twardych kolizji oraz uproszczone przewidywanie przeciwników. Brak limitów w próbie nie gwarantuje ich braku dla wszystkich składów i seedów.', '',
  '## Odtwarzanie', '', '```powershell',
  'node scripts/check-reset-cuts.mjs',
  'node scripts/diagnose-route-limit.mjs --legacy-reset-cuts --scans --output artifacts/engine-audit/reset-before.json',
  'node scripts/diagnose-route-limit.mjs --scans --output artifacts/engine-audit/reset-after.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 94437 --wind 20 --direction 90 --legacy-reset-cuts --output artifacts/engine-audit/reset-control.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 94437 --wind 20 --direction 90 --output artifacts/engine-audit/reset-final.json',
  'node scripts/balance-engine.mjs --fast 0 --full 8 --offset 182451 --output artifacts/engine-audit/reset-validation.json',
  'node scripts/balance-engine.mjs --situations --n 128 --legacy-reset-cuts --output artifacts/scenarios/reset-control.json',
  'node scripts/balance-engine.mjs --situations --n 128 --output artifacts/scenarios/reset-final.json',
  'node scripts/report-reset-balance.mjs', '```', '']
fs.writeFileSync('artifacts/engine-audit/RESET-BALANCE.md', lines.join('\n'))
console.log(JSON.stringify({ passed, summaries: summaries.map(s => ({ completion: s.completionPct, dump: s.dumpPct, throwsPerPoint: s.throwsPerPoint, limits: s.throwLimits })), probeSummary }))
if (!passed) process.exitCode = 2
