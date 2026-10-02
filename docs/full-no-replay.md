# Pełna symulacja bez zapisu powtórek

Opcja `collectFrames: false` wyłącza zapisywanie osi czasu zawodników. Nie włącza
`fastMode`: fizyka, decyzje AI, kontakty, losowania i zmęczenie nadal są liczone
w pełnym modelu. Domyślna wartość to `true`, także dla starszych sesji.

```js
const session = initMatchSession({ homeTeam, awayTeam, seed, collectFrames: false })
playNextPoint(session)

// Opcja pojedynczego punktu ma pierwszeństwo i nie zmienia ustawienia sesji.
playNextPoint(session, {}, { collectFrames: true })

const result = simulateMatch({ homeTeam, awayTeam, seed, collectFrames: false })
runRemainingMatch(session, {}, { collectFrames: false })
```

Przyciski symulowania punktu, całego meczu i pozostałej części meczu używają teraz
tej opcji. Oglądane punkty nadal zapisują powtórkę. Przy przeglądaniu punktu bez
klatek interfejs pokazuje informację o braku powtórki i zachowuje historię oraz
statystyki.

## Zachowanie danych sportowych

- Dwa małe, ponownie używane bufory pozycji wystarczają do rozstrzygania kontaktów
  pomiędzy krokami. Nie przechowujemy pełnej historii pozycji zawodników.
- Krótka historia położenia dysku istnieje tylko podczas jednej akcji, ponieważ
  wyznaczenie miejsca wznowienia po aucie korzysta z toru lotu.
- Zmęczenie jest sumowane podczas symulacji na osobnych mapach i kopiach
  zawodników. Zachowuje kolejność obliczeń dotychczasowego przeliczania klatek
  i nie zmienia staminy widzianej przez bieżące decyzje AI.
- Ślad akcji zachowuje końcową pozycję, rozstrzygnięcie i sumy przebiegniętych
  metrów. `frames` pozostaje pustą tablicą. Panel statystyk korzysta z sum,
  gdy nie ma klatek. Dane do odtworzenia całej akcji nie są dostępne.

## Sprawdzenie zgodności

`scripts/test-full-no-replay.mjs` porównuje pełny stan sesji po każdym punkcie,
statystyki panelu zawodników i następne losowanie generatora. Pomija wyłącznie
dane przechowywane na potrzeby odtwarzania i ustawienie zapisu klatek. Scenariusze
obejmują wiatr 0, 18 i 28 mph oraz przejście oglądanie → symulacja → oglądanie.

```powershell
node --import ./scripts/register-world-tests.mjs scripts/test-full-no-replay.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-engine-realism.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-pull-and-active-cutters.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-disc-intercept.mjs
npm run build
```

## Pomiar wydajności

```powershell
node --expose-gc --import ./scripts/register-world-tests.mjs scripts/bench-full-no-replay.mjs --out=artifacts/full-no-replay/final
```

Benchmark rozgrzewa oba warianty, a następnie rozgrywa Toronto Rush przeciwko
Seattle Cascades na historycznych składach UFA. Dla trzech ziaren wykonuje po
dwa powtórzenia obu wariantów, zmieniając kolejność ich uruchamiania. Przy każdym
punkcie sprawdza zgodność stanu i statystyk, a po meczu także generatora losowego.

Czas obejmuje inicjalizację i obliczenia punktów, bez serializacji kontrolnej,
porównań i wymuszonego odśmiecania pamięci. Pamięć oznacza przyrost zajętej sterty
po odśmieceniu, gdy ukończona sesja nadal jest dostępna; nie jest to pomiar
szczytowej pamięci ani całego procesu. Pomiar działa w Node, bez renderowania
boiska. Czas zależy od obciążenia komputera i nie jest pomiarem płynności UI.

Wyłączenie klatek nie usuwa pracy AI i fizyki ani nie przenosi obliczeń poza
główny wątek przeglądarki.

## Wynik pomiaru — 21 września 2026

Node 24.19.0, Intel Core Ultra 5 125U, 12 pełnych symulacji (6 par).

| Średnia na mecz | Z klatkami | Bez klatek | Zmiana |
| --- | ---: | ---: | ---: |
| Czas obliczeń | 27,09 s | 27,34 s | 0,9% dłużej |
| Zachowana pamięć sterty | 247,7 MiB | 25,4 MiB | 89,8% mniej |
| Zapisane klatki | 58 383 | 0 | 100% mniej |

Wyniki potwierdzają dużą oszczędność pamięci, ale nie potwierdzają przyspieszenia
obliczeń. Czasy pojedynczych prób mają duży rozrzut (około 18–41 s); różnicy
średnich 0,25 s nie należy interpretować jako stabilnej zmiany szybkości.

| Ziarno | Powtórzenie | Z klatkami | Bez klatek |
| --- | ---: | ---: | ---: |
| 70000 | 1 | 31,90 s | 32,42 s |
| 70001 | 1 | 32,22 s | 33,04 s |
| 70002 | 1 | 40,51 s | 28,86 s |
| 70000 | 2 | 17,78 s | 26,40 s |
| 70001 | 2 | 17,85 s | 18,82 s |
| 70002 | 2 | 22,30 s | 24,49 s |

Wszystkie 164 porównania stanu po punkcie i statystyk panelu oraz wszystkie
porównania generatora losowego zakończyły się zgodnością. Wyniki meczów dla
kolejnych ziaren wyniosły 14–15, 15–10 i 15–13 w obu wariantach i powtórzeniach.
Surowe pomiary: [benchmark.json](../artifacts/full-no-replay/final/benchmark.json).

Test zgodności obu wariantów, testy mechaniki, pulli i przechwytów oraz kompilacja
produkcyjna przeszły. Lint zmienionych plików nadal zgłasza dwa błędy i cztery
ostrzeżenia w `MatchView.jsx`; porównanie z wersją HEAD potwierdziło, że wszystkie
istniały wcześniej. Kompilacja zachowuje ostrzeżenie o dużym pakiecie aplikacji.

Kolejny etap, optymalizację obliczeń CPU z osobnym porównaniem wersji silnika,
opisuje [raport optymalizacji silnika](match-engine-optimization.md).
