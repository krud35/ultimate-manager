# Optymalizacja pięciu mechanizmów pełnego silnika

Punktem odniesienia jest silnik **po pierwszej optymalizacji** opisanej w
[poprzednim pomiarze](match-engine-optimization.md). Ten etap usuwa kolejne
powtarzane obliczenia bez zmiany częstotliwości fizyki, AI i zasad meczu.

## Zakres

1. **Wspólne dane kroku symulacji.** Tablica pozycji przeszkód, liczba
   poacherów i aktywnych cutterów oraz warunki przejścia po pullu powstają raz
   dla danej fazy kroku. Kolejni zawodnicy korzystają z tych samych danych.
2. **Widoczność.** Test zasłaniania zawodnika wykonuje się dopiero wtedy, gdy
   cel znajduje się w polu widzenia. Zachowano specjalną regułę bliskiego
   otoczenia i dokładne zachowanie na granicy 4 metrów.
3. **Prognoza dobiegnięcia.** Parametry mobilności, maksymalnej prędkości,
   przyspieszenia i zmęczenia są przygotowywane raz na krótką prognozę ruchu.
   Jej kolejne kroki nie zmieniają stanu zawodnika. Ruch w rzeczywistym meczu
   nadal odczytuje aktualne parametry.
4. **Planowany tor dysku.** Zawodnicy współdzielą próbki zamierzonego toru
   lotu w obrębie jednego kroku. Własne obserwacje, opóźnienia reakcji i
   poprawki przewidywania pozostają indywidualne. Pamięć próbek jest
   odświeżana przy zmianie kroku, planu, odbicia, czasu lotu lub przesunięcia
   miejsca lądowania. Plany są traktowane jako niezmienne, zgodnie z istniejącą
   pamięcią podręczną kontynuacji trajektorii; próbki służą tylko do odczytu.
5. **Zmęczenie.** Stałe dla akcji parametry wytrzymałości, regeneracji i
   pułapu energii są przygotowywane raz dla zawodnika. Prędkość jest liczona
   raz na aktualizację, a bazowy koszt regeneracji raz na moduł. Bieżąca
   energia, sprint i zaokrąglenia są nadal aktualizowane w tej samej kolejności.

Rozliczenia zmęczenia na żywo i po akcji pozostają odrębne: mają inną historię
próbek i moment aktualizacji. Ich połączenie zmieniłoby model. Optymalizacja
usuwa powtarzane wyliczanie parametrów w obu ścieżkach. Przygotowane parametry
nie są przenoszone między akcjami; zmiany kondycji między punktami są uwzględniane.

## Sprawdzenie zgodności

Test `scripts/test-engine-mechanisms.mjs` porównuje kod z zachowaną wersją
sprzed tego etapu, bez tolerancji numerycznej:

- 2400 przypadków widoczności i pamięci obserwacji;
- 2000 przypadków ruchu, także na progach zmęczenia;
- 120 prognoz dobiegnięcia z przeszkodą;
- 12 636 próbek planowanego lotu przy różnym wietrze, z kontynuacją toru;
- 9000 aktualizacji zmęczenia, także przy skokach pozycji;
- 30 porównań rozliczenia śladu ruchu i rozliczenia strumieniowego.

Sprawdzono również odświeżanie pamięci próbek lotu i brak modyfikowania
zawodników meczu przez strumieniowe rozliczenie powtórki. Przeszły testy
omijania zawodników, planowania trasy, przechwytów, okna dobiegnięcia, mechaniki
meczu i zgodności symulacji z zapisem powtórek oraz bez niego. Lint siedmiu
zmienionych modułów i kompilacja produkcyjna przeszły. Kompilacja zgłasza
istniejące ostrzeżenie o dużym pakiecie aplikacji.

```powershell
$env:ENGINE_BASELINE_DIR='artifacts/engine-optimization-2/baseline'
node --import ./scripts/register-engine-comparison.mjs scripts/test-engine-mechanisms.mjs
node --expose-gc --import ./scripts/register-engine-comparison.mjs scripts/bench-engine-optimization.mjs --out=artifacts/engine-optimization-2/final
```

## Sposób pomiaru

Manifest w `artifacts/engine-optimization-2/baseline/manifest.json` wskazuje
siedem zachowanych modułów sprzed zmian. Benchmark ładuje osobne grafy modułów
dla obu wersji, izolując ich rejestry i pamięci podręczne. Pozostałe źródła są
wspólne. Raport zapisuje sumy SHA-256 mierzonych modułów.

Po rozgrzaniu silników mierzone są trzy ziarna losowania, każde dwukrotnie
bez zapisu powtórki, oraz jedna dodatkowa para z zapisem powtórki. Wersje
wykonują naprzemiennie te same punkty; pierwszeństwo zmienia się co punkt.
Każda sesja ma własny generator losowy. Po każdym punkcie porównywany jest
skrót stanu, zdarzeń i statystyk panelu. Na końcu porównanie obejmuje całą
historię oraz następne losowanie, a w oglądanym meczu także wszystkie klatki.

Czas obejmuje inicjalizację i obliczenia silnika. Kontrolne porównania,
serializacja i wymuszone odśmiecanie są poza pomiarem. Czas CPU sumuje pracę
wątków procesu, więc może przekraczać czas zegarowy. Wynik zależy również od
kompilacji JIT, odśmiecania i obciążenia komputera. To pomiar w Node, nie FPS
przeglądarki. Pojedyncza para z powtórką ma mniejszą reprezentatywność.

## Wynik — 22 września 2026 (czas lokalny)

Node 24.19.0, Intel Core Ultra 5 125U. Toronto Rush kontra Seattle Cascades,
historyczne składy UFA. Łącznie 14 pełnych symulacji, czyli 7 par.

| Wariant i średnia na mecz | Przed | Po | Redukcja |
| --- | ---: | ---: | ---: |
| Bez powtórki: czas obliczeń, 6 par | 21,29 s | 20,28 s | **4,75%** |
| Bez powtórki: zużyty czas CPU, 6 par | 23,85 s | 23,73 s | 0,49% |
| Z powtórką: czas obliczeń, 1 para | 19,96 s | 18,85 s | **5,60%** |
| Z powtórką: zużyty czas CPU, 1 para | 23,38 s | 21,94 s | 6,15% |

| Ziarno | Powtórzenie | Przed, bez powtórki | Po, bez powtórki |
| --- | ---: | ---: | ---: |
| 70000 | 1 | 20,29 s | 20,24 s |
| 70001 | 1 | 19,64 s | 18,16 s |
| 70002 | 1 | 22,45 s | 22,71 s |
| 70000 | 2 | 20,86 s | 18,27 s |
| 70001 | 2 | 17,58 s | 17,06 s |
| 70002 | 2 | 26,93 s | 25,24 s |

Czas zegarowy zmalał w pięciu z sześciu par bez powtórki. Czas CPU poprawił
się w trzech i pogorszył w trzech; średnia zmiana o 0,49% jest zbyt mała,
aby traktować ją jako przekonujący dowód zmniejszenia całkowitej pracy CPU.
W tej serii zysk czasu oczekiwania jest umiarkowany. Wynik z powtórką pochodzi
z jednej pary. Nie należy przypisywać pojedynczym mechanizmom procentów
zmierzonych dla całego pakietu ani dodawać ich do zysku z poprzedniego etapu.
Warunki pomiarów między etapami były inne; wiarygodne porównanie to pary
przed/po w obrębie tej samej serii.

Wszystkie **193 porównania punktów** wykazały identyczność stanu, zdarzeń i
statystyk. Zgodne były całe końcowe sesje, następne losowanie i zapisane klatki
powtórki. Powtórzenia tych samych ziaren dały identyczne stany końcowe. Wyniki
dla ziaren 70000, 70001 i 70002 to odpowiednio 14–15, 15–10 i 15–13.
Zweryfikowano sumy SHA-256 wszystkich siedmiu obecnych modułów względem raportu.

Surowe wyniki: [benchmark.json](../artifacts/engine-optimization-2/final/benchmark.json).
