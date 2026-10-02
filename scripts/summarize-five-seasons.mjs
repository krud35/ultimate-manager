import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const folder = resolve(process.argv[2] ?? 'artifacts/five-seasons-2026-09-21')
const report = JSON.parse(readFileSync(resolve(folder, 'results.json'), 'utf8'))
const auditPath = resolve(folder, 'manager-audit.json')
const audit = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : null
const managerAudit = audit?.benchmarkStartedAt === report.startedAt ? audit.managerAudit : null
const dismissal = (report.managerHistory ?? managerAudit?.manager?.history)?.find(h => h.reason === 'dismissed')
const seasons = report.seasons
const sum = fn => seasons.reduce((total, s) => total + fn(s), 0)
const timing = (s, name, field = 'selfMs') => s.functions?.[name]?.[field] ?? 0
const matchMs = s => ['simulateMatch', 'backgroundMatch', 'simulateFixtureMatch', 'simulateAdHocMatch'].reduce((n, name) => n + timing(s, name), 0)
const seconds = ms => (ms / 1000).toFixed(2)
const minutes = ms => (ms / 60000).toFixed(2)
const duration = ms => {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
const number = n => n.toLocaleString('pl-PL')
const allDaysMs = sum(s => s.totalDayMs ?? 0)
const categories = [
  ['Terminarz: wykrywanie zmian i korekty', sum(s => timing(s, 'reconcileDomesticCalendar'))],
  ['Silnik fast (wszystkie mecze)', sum(s => timing(s, 'simulateMatch'))],
  ['Uproszczone mecze w tle', sum(s => timing(s, 'backgroundMatch'))],
  ['Przygotowanie meczu i budowa wyniku', sum(s => timing(s, 'simulateFixtureMatch') + timing(s, 'simulateAdHocMatch'))],
  ['Zastosowanie wyników ligowych/pucharowych', sum(s => timing(s, 'applyMatchResultToLeague'))],
  ['Trening drużynowy', sum(s => timing(s, 'processTeamTrainingsForDate'))],
  ['Codzienny rozwój i regeneracja', sum(s => timing(s, 'applyDailyDevelopment'))],
  ['Wiadomości Ultiworld', sum(s => timing(s, 'processUltiworldTick'))],
]
categories.push(['Pozostałe obliczenia dnia i narzut pomiaru', allDaysMs - categories.reduce((n, [, ms]) => n + ms, 0)])
const aggregate = name => {
  const calls = sum(s => timing(s, name, 'calls'))
  const ms = sum(s => timing(s, name, 'ms'))
  return { calls, ms, meanMs: ms / (calls || 1) }
}
const fast = aggregate('simulateMatch'), background = aggregate('backgroundMatch'), player = aggregate('playerFast')
const total = {
  status: report.status, completedSeasons: seasons.filter(s => s.status === 'complete').length,
  days: sum(s => s.days.length), totalDayMs: allDaysMs,
  creationMs: report.creation?.ms ?? 0,
  transitionsMs: report.transitions.reduce((n, t) => n + t.finalizationMs + t.nextSeasonMs, 0),
  calendarMs: sum(s => timing(s, 'reconcileDomesticCalendar')), calendarCalls: sum(s => timing(s, 'reconcileDomesticCalendar', 'calls')),
  calendarPasses: sum(s => s.calendarPasses.length), movedFixtures: sum(s => s.calendarPasses.reduce((n, p) => n + p.moved, 0)),
  matchMs: sum(matchMs), fast, background, playerFast: player, categories,
  managerDismissal: dismissal ?? null,
}
writeFileSync(resolve(folder, 'summary.json'), JSON.stringify(total, null, 2))
const rows = seasons.map(s => `| ${s.year}/${String(s.year + 1).slice(-2)} | ${s.days.length} | ${duration(s.totalDayMs)} | ${seconds(timing(s, 'reconcileDomesticCalendar'))} | ${s.calendarPasses.length} | ${seconds(matchMs(s))} | ${timing(s, 'simulateMatch', 'calls')} | ${timing(s, 'backgroundMatch', 'calls')} |`).join('\n')
const slowDays = seasons.flatMap(s => s.days).sort((a, b) => b.ms - a.ms).slice(0, 10)
const byMonth = new Map()
for (const s of seasons) for (const d of s.days) {
  const month = d.date.slice(0, 7)
  const row = byMonth.get(month) ?? { month, days: 0, ms: 0, newsMs: 0, matchMs: 0, calendarMs: 0 }
  row.days++; row.ms += d.ms
  row.newsMs += timing(d, 'processUltiworldTick')
  row.matchMs += matchMs(d)
  row.calendarMs += timing(d, 'reconcileDomesticCalendar')
  byMonth.set(month, row)
}
writeFileSync(resolve(folder, 'monthly.json'), JSON.stringify([...byMonth.values()], null, 2))
const text = `# Pięć sezonów — wydajność kalendarza i meczów

Stan: **${report.status}**. Ukończone sezony: **${total.completedSeasons}/${report.requestedSeasons}**.
Klub początkowy: **${report.startingClub.name}**. Świat krajowy, model skupiony na Polsce,
pozostałe ligi w tle, domyślne puchary i reprezentacje. Początkowo
${report.creation?.world.clubs} klubów, ${report.creation?.world.seniorPlayers} zawodników seniorskich,
${report.creation?.world.leagues} lig. Jedna ciągła kariera, start w sierpniu 2026.

${dismissal ? `**Ograniczenie porównania:** trener został zwolniony z ${dismissal.teamName} dnia
${dismissal.to}. ${managerAudit ? `Przy kontroli ${managerAudit.date} pozostawał bez pracy i nie miał ofert.` : 'Zmiany statusu trenera są zapisane w managerEvents w results.json.'}
Dalsze lata mierzą działający świat po zwolnieniu. Wiersz „mecze gracza” obejmuje
wyłącznie okres rzeczywistego prowadzenia klubu; nie jest to pięć sezonów pracy
w jednym klubie. Zwolnienie zmienia też udział uproszczonych meczów względem fast.
Świat, puchary i pozostałe mecze są nadal symulowane normalnie. Wyniki kariery
nie były korygowane, aby sztucznie utrzymać trenera na stanowisku.` : ''}

## Sezony

| Sezon | Kroki dnia | Całość (min:s) | Terminarz (s) | Korekty / kontrole | Mecze z przygotowaniem (s) | Mecze fast | Mecze tła |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows}

Łącznie ${number(total.days)} kroków dnia: **${duration(allDaysMs)} (min:s)**, czyli ${minutes(allDaysMs)} min.
Utworzenie świata: ${seconds(total.creationMs)} s. Finalizacje sezonów i starty
kolejnych: ${seconds(total.transitionsMs)} s, mierzone osobno od dni.

Rozmiar populacji zawodników również zmieniał się w tej karierze:

| Sezon | Kluby na starcie | Seniorzy na starcie | Seniorzy na końcu |
|---|---:|---:|---:|
${seasons.map(s => `| ${s.year}/${String(s.year + 1).slice(-2)} | ${s.worldStart.clubs} | ${s.worldStart.seniorPlayers} | ${s.worldEnd?.seniorPlayers ?? 'w trakcie'} |`).join('\n')}

To pomiar rozwijającej się kariery z emeryturami, kontraktami i transferami,
a nie wielokrotne odtworzenie identycznego zestawu danych.

## Terminarz

Łączny czas: **${seconds(total.calendarMs)} s**, czyli
**${(100 * total.calendarMs / allDaysMs).toFixed(2)}%** obliczeń dni.
Wywołań: ${total.calendarCalls}; pełnych kontroli po zmianie rezerwacji: ${total.calendarPasses};
przesuniętych meczów: ${total.movedFixtures}. Tworzenie nowych sezonów nie jest w tych liczbach.
Nowe rundy nadal wymagają obsługi, ale zwykły dzień kończy się na porównaniu rezerwacji.

## Mecze

| Rodzaj | Liczba | Łącznie (s) | Średnio (ms/mecz) |
|---|---:|---:|---:|
| Silnik fast, wszystkie | ${number(fast.calls)} | ${seconds(fast.ms)} | ${fast.meanMs.toFixed(2)} |
| W tym klub aktualnie prowadzony przez gracza | ${number(player.calls)} | ${seconds(player.ms)} | ${player.meanMs.toFixed(2)} |
| Uproszczone mecze lig w tle | ${number(background.calls)} | ${seconds(background.ms)} | ${background.meanMs.toFixed(2)} |

Wiersz klubu gracza jest podzbiorem wszystkich meczów fast. Czasy silników obejmują
ich obliczenia, a przygotowanie danych, budowa rekordu i zastosowanie wyniku są
rozliczone osobno poniżej. Żaden mecz pełnym silnikiem nie jest dopuszczany przez
narzędzie: każdy taki przypadek przerwałby test. Uproszczony model tła jest zwykłym
zachowaniem tej konfiguracji świata, odrębnym od silnika fast.
Walkowery zakończone przed uruchomieniem silnika nie są doliczane do jego wywołań.

### Rozrzut czasów silnika fast

| Sezon | Średnia (ms) | Mediana (ms) | 95% meczów do (ms) | Najwolniejszy (ms) | Średnia meczów gracza (ms) |
|---|---:|---:|---:|---:|---:|
${seasons.map(s => {
  const f = s.functions?.simulateMatch ?? {}, p = s.functions?.playerFast ?? {}
  return `| ${s.year}/${String(s.year + 1).slice(-2)} | ${(f.meanMs ?? 0).toFixed(1)} | ${(f.medianMs ?? 0).toFixed(1)} | ${(f.p95Ms ?? 0).toFixed(1)} | ${(f.maxMs ?? 0).toFixed(1)} | ${p.calls ? p.meanMs.toFixed(1) : '—'} |`
}).join('\n')}

Czasy obejmują także ewentualne pauzy odśmiecania pamięci i wpływ obciążenia komputera.

## Gdzie trafia czas

Kategorie nie nakładają się: odejmowany jest czas zagnieżdżonych mierzonych funkcji.

| Czynność | Czas (s) | Udział w dniach |
|---|---:|---:|
${categories.map(([name, ms]) => `| ${name} | ${seconds(ms)} | ${(100 * ms / allDaysMs).toFixed(2)}% |`).join('\n')}

## Najwolniejsze dni

| Data | Czas (s) |
|---|---:|
${slowDays.map(d => `| ${d.date} | ${seconds(d.ms)} |`).join('\n')}

## Miesiące

| Miesiąc | Dni | Całość (s) | Średnio na dzień (s) | Mecze (s) | Ultiworld (s) | Terminarz (s) |
|---|---:|---:|---:|---:|---:|---:|
${[...byMonth.values()].map(m => `| ${m.month} | ${m.days} | ${seconds(m.ms)} | ${seconds(m.ms / m.days)} | ${seconds(m.matchMs)} | ${seconds(m.newsMs)} | ${seconds(m.calendarMs)} |`).join('\n')}

## Warunki i granice pomiaru

- ${report.environment.cpu}, Node ${report.environment.node}, RAM ${report.environment.ramGiB.toFixed(1)} GiB.
- To czas obliczeń na PC, bez interfejsu, kompresji i zapisów kariery. Prawdziwe
  zapisy użytkownika nie były odczytywane ani zmieniane.
- Działa rzeczywista ścieżka dnia i zmiany sezonu, trening, rozwój, regeneracja,
  transfery, finanse, wiadomości i reprezentacje. Zdarzenia losowe są wyłączone
  tak jak przy automatycznym przewijaniu. Obsługa finałów używa akcji „Zignoruj”.
- Po ewentualnym zwolnieniu trener przyjmuje pierwszą dostępną ofertę, aby test
  mógł iść dalej. Takie decyzje są zapisane w results.json (${report.decisions.filter(d => d.action === 'accept-job').length} zmian pracy).
- Nowy sezon zaczyna się 1 sierpnia, poprzedni kończy się według reguł gry
  po dojściu do 31 lipca. Liczymy faktyczne kroki, nie sztuczne 365 wywołań rocznie.
- Podczas pomiaru repozytorium miało lokalne zmiany silnika z równoległego zadania.
  Kod załadowany do procesu jest mierzony wraz z tymi zmianami; raport zapisuje
  commit, listę zmienionych plików i skróty instrumentowanych źródeł.
- System nie był izolowany od innych procesów. Podane czasy zależą od obciążenia
  komputera. Dodane liczniki mają mały, nieodjęty narzut.
- Szczytowe RSS procesu: ${report.peakRssMiB.toFixed(0)} MiB. Proces ma limit sterty
  10 GB; RSS obejmuje także tymczasowe kopie i pamięć czekającą na odzyskanie.
  Nie jest to minimalne zapotrzebowanie gry ani pomiar pamięci przeglądarki.

Źródło danych: results.json; zestawienie liczb: summary.json.

## Powtórzenie

\`\`\`text
node --max-old-space-size=10000 --import ./scripts/register-world-tests.mjs scripts/bench-five-seasons.mjs
node scripts/summarize-five-seasons.mjs
\`\`\`
`
writeFileSync(resolve(folder, 'REPORT.md'), text)
console.log(JSON.stringify(total, null, 2))
