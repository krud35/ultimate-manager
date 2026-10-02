# Optymalizacja obliczeń pełnego silnika meczowego

Zmiana ogranicza powtarzaną pracę podczas wybierania miejsca przechwytu i
omijania zawodników. Punktem odniesienia jest pełny silnik po dodaniu opcji
`collectFrames`, a nie starszy, uproszczony model `fastMode`.

## Co zmieniono

- `bodyTraffic.js`: odległości, względne pozycje i rozmiary przeszkód są liczone
  raz dla jednej decyzji przechwytu. Kolejne rozważane punkty korzystają z tych
  samych danych. Zwykły ruch nadal używa aktualnych pozycji w każdym kroku.
- Test zajęcia miejsca celu zaczyna się od porównania współrzędnych; dokładna
  odległość jest potrzebna tylko w pobliskich przypadkach. Analiza korytarza
  ruchu zachowuje dotychczasowe reguły. Bliskie przypadki nadal korzystają z
  tego samego `Math.hypot` i tych samych ostrych warunków granicznych.
- `discIntercept.js`: obiekt kandydata powstaje tylko wtedy, gdy może zostać
  wybrany. Kolejność kandydatów i rozstrzyganie remisów pozostają takie same.
- `flightKinematics.js`: poprawki wynikające z jednej obserwacji dysku są liczone
  raz na decyzję. Każdy zawodnik nadal ma własną percepcję; nie dostaje informacji
  o przyszłym, rzeczywistym położeniu dysku.

Dane pomocnicze przeszkód nie są współdzielone pomiędzy krokami ruchu ani
decyzjami. Nie zmieniono częstotliwości fizyki i AI, losowań, zasięgu chwytu,
zmęczenia ani reguł kontaktów. Optymalizacja działa z zapisem powtórek i bez niego.

## Testy

`scripts/test-engine-optimization.mjs` porównuje nowy kod z zachowaną wersją
sprzed optymalizacji: 48 000 porównań omijania przeszkód, przypadki graniczne
i 240 decyzji przechwytu. Sprawdza dokładną równość, bez tolerancji numerycznej.

Przeszły także testy ruchu w tłoku, planowania trasy, przechwytów, mechaniki meczu
oraz zgodności trybu z powtórkami i bez powtórek. Lint trzech zmienionych modułów
i kompilacja produkcyjna przeszły. Kompilacja nadal ostrzega o dużym pakiecie
aplikacji.

```powershell
node --import ./scripts/register-engine-comparison.mjs scripts/test-engine-optimization.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-body-traffic.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-route-planning.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-disc-intercept.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-engine-realism.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-full-no-replay.mjs
npm run build
```

## Sposób pomiaru

```powershell
node --expose-gc --import ./scripts/register-engine-comparison.mjs scripts/bench-engine-optimization.mjs --out=artifacts/engine-optimization/final
```

Benchmark ładuje dwa osobne zestawy modułów, aby odizolować rejestry i pamięć
podręczną silników. Trzy pierwotne moduły znajdują się w
`artifacts/engine-optimization/baseline/`. Pozostały kod jest wspólną wersją
źródłową. Raport zapisuje sumy SHA-256 starych i nowych modułów.

Po rozgrzaniu obu wariantów benchmark wykonuje pary pełnych meczów na tych
samych składach i ziarnach losowania. Wersje liczą naprzemiennie te same punkty,
a wariant liczony jako pierwszy zmienia się przy kolejnym punkcie. Obie sesje
mają odrębne generatory losowe i pozostają w pamięci przez całą parę. Podstawowy
pomiar obejmuje trzy ziarna i po dwa powtórzenia bez zapisu klatek. Dodatkowa
para pełnych meczów sprawdza wariant oglądany, z zapisem powtórki.

Po każdym punkcie porównywany jest dokładny skrót stanu sesji, nowych zdarzeń
i statystyk panelu zawodników. Na końcu porównywana jest też cała historia
zdarzeń oraz następne losowanie. Dla oglądanego meczu porównanie obejmuje
wszystkie zapisane klatki. Czas obejmuje tylko inicjalizację i obliczenia silnika;
porównania, serializacja kontrolna, statystyki panelu i wymuszone odśmiecanie
są poza pomiarem. Dodatkowo `process.cpuUsage` mierzy zużyty czas procesora
w trakcie obliczeń, bez czasu oczekiwania na dostęp do CPU. Obejmuje wątki
procesu i nadal zależy m.in. od częstotliwości CPU, kompilacji JIT i odśmiecania.
To pomiar w Node, nie FPS przeglądarki.

Optymalizacja nie przenosi obliczeń do osobnego wątku. Skrócenie ich czasu może
zmniejszyć długość blokowania interfejsu, ale go nie eliminuje.

## Wynik — 21 września 2026

Node 24.19.0, Intel Core Ultra 5 125U. Toronto Rush kontra Seattle Cascades,
historyczne składy UFA. Łącznie 14 pełnych symulacji, czyli 7 par.

| Wariant i średnia na mecz | Przed | Po | Redukcja |
| --- | ---: | ---: | ---: |
| Bez powtórki: czas obliczeń, 6 par | 39,88 s | 33,18 s | **16,8%** |
| Bez powtórki: zużyty czas CPU, 6 par | 42,73 s | 36,18 s | **15,3%** |
| Z powtórką: czas obliczeń, 1 para | 25,46 s | 21,01 s | **17,5%** |
| Z powtórką: zużyty czas CPU, 1 para | 28,86 s | 23,93 s | **17,1%** |

Czas CPU sumuje pracę wątków procesu, dlatego może przekraczać czas zegarowy.
W każdej z sześciu par bez powtórki czas zegarowy był krótszy po zmianie.
Wynik z powtórką pochodzi z jednej pary, więc ma mniejszą reprezentatywność.
Nie należy porównywać bezpośrednio czasów między wierszami z różnymi wariantami:
liczba prób i obciążenie komputera były różne.

| Ziarno | Powtórzenie | Przed, bez powtórki | Po, bez powtórki |
| --- | ---: | ---: | ---: |
| 70000 | 1 | 35,39 s | 29,88 s |
| 70001 | 1 | 45,82 s | 39,63 s |
| 70002 | 1 | 55,32 s | 43,98 s |
| 70000 | 2 | 46,98 s | 38,63 s |
| 70001 | 2 | 30,53 s | 25,68 s |
| 70002 | 2 | 25,28 s | 21,26 s |

Wszystkie **193 porównania punktów** zakończyły się zgodnością. Zgodne były
także całe końcowe sesje, historia zdarzeń, statystyki, następne losowanie oraz
klatki w parze z powtórką. Powtórzenia tych samych ziaren dały identyczne stany
końcowe. Wyniki dla ziaren 70000, 70001 i 70002 to odpowiednio 14–15, 15–10
i 15–13. Zweryfikowano, że sumy SHA-256 obecnego kodu odpowiadają wersji
zmierzonej w benchmarku.

Wcześniejsze próby liczenia całych meczów kolejno miały duży rozrzut zależny
od obciążenia komputera; nie wchodzą do powyższych średnich. Końcowe porównanie
przeplata obliczenia punktów i raportuje także czas CPU. To lokalny pomiar,
bez gwarancji takiego samego procentowego zysku na każdym urządzeniu.

Surowe wyniki i skróty stanów: [benchmark.json](../artifacts/engine-optimization/final/benchmark.json).
