# Ultimate Manager — poprawki po audycie silnika

Stan po wdrożeniu mechaniki i neutralnych optymalizacji, przed kalibracją selekcji podań oraz celności. Pomiary dotyczą dwóch drużyn demonstracyjnych, wielu rozproszonych seedów i zasad club przyjętych w projekcie. Nie dowodzą jeszcze reprezentatywności całej ligi.

## Co zmieniono

1. **Pełny silnik: stall zależy od markera.** Czas trzymania dysku jest osobny od liczenia. Marker musi być w promieniu 3 m; odejście lub zmiana markera resetuje liczenie. „Jeden” rozpoczyna liczenie, „dziesięć” następuje po dziewięciu odstępach. Zegar zachowuje stan między kolejnymi skanami tej samej akcji. Pliki: `stall.js`, `point.js`, `ai/actionSimulator.js`.
2. **Pełny silnik: ciągłość po stracie.** Zawodnicy zachowują pozycje i prędkości przy zmianie ról. Najbliższy zawodnik nowej ofensywy dochodzi do dysku, zwalnia i go podnosi; przed podniesieniem dysk pozostaje na ziemi. Usunięto ponowne ustawianie obrońców przy ciągłym stanie ruchu. Odtwarzanie nowych śladów respektuje te pozycje oraz rzeczywisty stall (`fieldMotion.js`, `motionFromTicks.js`).
3. **Fast: wspólna geometria rzutu i straty.** Wypuszczenie, cel, chwyt i strata korzystają z jednego wektora. Nieudany huck nie oddaje automatycznie dysku w miejscu rzucającego. Drop kończy się przy celu; block i throwaway mają jawnie przybliżone miejsca zakończenia lotu. Wektor używany przy rozstrzygnięciu odpowiada mierzonemu dystansowi. Pliki: `point.js`, nowy `fastPossession.js`.
4. **Fast: czas kolejnych prób zamiast osobnej kostki na stall-out.** Odrzucenie ciasnej opcji i szukanie resetu zużywa czas. Zachowano przybliżony rozkład pierwszego spojrzenia; nie jest to rozkład potwierdzony danymi turniejowymi.
5. **Zmęczenie obu ścieżek.** Fast korzysta z szacowanego czasu punktu mimo istnienia pustej mapy sprintów. Pełny silnik zapisuje energię i sprinty do właściwej drużyny również po zmianie stron. Przed naprawą dwa punkty wystarczały, aby obie mapy energii zawierały po siedem identyfikatorów przeciwnika. Pliki: `rotation.js`, `stamina.js`, `matchSession.js`, `point.js`.
6. **Zabezpieczenie pętli punktu.** Limit obejmuje też akcje bez rzutu; jego wymuszone rozstrzygnięcia są osobno liczone w pomiarach.

Zmiany 1–6 wpływają na zachowanie i statystyki. Nie należy przypisywać ich skutków neutralnym optymalizacjom.

## Wydajność i kontrola neutralności

Profil fast wskazał przygotowanie składów: około 66,5% czasu włącznie z wywołaniami, w tym dopasowanie stylu około 41,1%. Ranking zawodników liczy teraz ocenę raz na zawodnika, a przygotowanie punktu współdzieli wyliczoną tożsamość AI między rotacją i adaptacją. W pełnym silniku połączono obliczenie percepcji i ocenę komórek zagrożenia, zachowując kolejność losowań, bez kopiowania całej mapy dla każdego obrońcy.

Osobny etap przed poprawkami mechaniki porównał skróty wszystkich zdarzeń i unikalnych klatek ruchu: **identyczne 16/16 meczów fast oraz 8/8 pełnych** (`before.json`, `optimized.json`). Regresja percepcji dodatkowo sprawdza wybraną komórkę i kolejny wynik RNG w 140 przypadkach.

Fast w tej parze pomiarów: **163,7 → 77,0 ms/mecz**, około 53% mniej czasu. Pełny: 5666 → 6810 ms/mecz; pomiar jest zmienny i nie wykazuje przyspieszenia. Nie zmieniano częstotliwości skanów, rozdzielczości mapy ani kroku 20 ms. Końcowe pomiary czasu poniżej obejmują również zmienione zachowanie i inną liczbę akcji.

## Parity: ten sam harness, 40 fast / 20 pełnych

| Metryka | Fast przed | Fast po | Pełny przed | Pełny po |
|---|---:|---:|---:|---:|
| Celne podania % | 96,00 | 95,46 | 91,80 | 92,19 |
| Hold % | 73,95 | 81,55 | 66,29 | 72,64 |
| Straty / punkt | 0,37 | 0,30 | 0,62 | 0,67 |
| Rzuty / punkt | 5,74 | 6,55 | 7,60 | 8,52 |
| Bloki / mecz | 1,70 | 2,73 | 11,15 | 13,10 |
| Stall-outy / mecz | 3,73 | 0,00 | 0,00 | 0,00 |
| Mediana stalla przy rzucie | 1 | 2 | 1 | 2 |
| Krótkie udane podania <10 m % | brak pomiaru | 22,03 | 22,74 | 29,84 |
| Średnie udane podania 10–25 m % | brak pomiaru | 66,34 | 53,67 | 52,10 |
| Długie udane podania ≥25 m % | brak pomiaru | 11,63 | 23,59 | 18,06 |
| Średni dystans udanego podania m | brak pomiaru | 15,65 | 18,39 | 16,65 |
| Czas ms/mecz | 145 | 78 | 5698 | 5395 |

Końcowy pełny wydruk: `parity-final.txt`. Początkowy średni wiatr: 10,68 mph fast i 10,00 mph pełny — liczby meczów są różne. To nie jest bezpośrednia para o identycznym rozkładzie pogody. Dodatkowy zestaw `final.json` wykorzystuje offset 3700; `before.json` zawiera odpowiadający mu stan sprzed poprawek.

Pasma harnessu pozostają hipotezami, a nie normą WFDF. W szczególności nie ma tu nowego źródła turniejowego uzasadniającego 50–60% krótkich podań albo uniwersalne 90–93% celności niezależnie od wiatru i poziomu drużyn. Nie zmieniono stałych tylko po to, żeby tabela miała mniej odchyleń.

W końcowym zestawie z offsetem 3700 (16 fast / 8 pełnych, średni początkowy wiatr odpowiednio 15,88 / 15,75 mph) celność wyniosła **94,40 / 86,21%**, hold **76,92 / 53,43%**, a straty na punkt **0,37 / 1,24**. Dobry wynik pełnego silnika w podstawowym parity nie przenosi się zatem automatycznie na mocniejszy wiatr.

| Dodatkowa miara, offset 3700 | Fast | Pełny |
|---|---:|---:|
| Czas trzymania dysku p50 / p90, s | 1,90 / 4,73 | 1,94 / 3,48 |
| Czas punktu p50 / p90, s | 21,18 / 41,06 (szacunek) | 28,68 / 61,90 (zarejestrowane akcje) |
| Pierwszy rzut po stracie p50 / p90, s | 1,90 / 4,88 (bez dojścia) | 2,48 / 4,44 |
| Resety wśród rzutów przy stallu ≥5, % | 63,71 (463 próby) | 61,11 (54 próby) |
| Klatki / mecz | 0 | 43 324 |
| Snapshoty zawodników / mecz | 0 | 606 540 |
| Zakończenia przez limit awaryjny | 0 | 0 |

## Wiatr i atrybuty: kontrolowany pilotaż

Każdy wariant: 8 fast / 4 pełne, offset 7400, pogoda zablokowana przez cały mecz, adaptacja taktyki wyłączona, rotacja zawodników włączona. Zmiany atrybutów dotyczą wszystkich gospodarzy, z ograniczeniem wartości do 100. Surowe wyniki i szczegóły: `controlled/*.json`.

| Wariant | Celność fast % | Celność pełny % | Śr. przewaga gospodarzy fast | Śr. przewaga gospodarzy pełny |
|---|---:|---:|---:|---:|
| Cisza | 96,61 | 93,04 | -1,38 | -1,50 |
| 10 mph | 95,31 | 91,91 | -0,63 | 2,50 |
| 20 mph | 96,30 | 79,16 | -2,25 | -5,75 |
| 20 mph, kierunek odwrócony | 94,26 | 77,20 | -2,38 | -1,50 |
| 20 mph, drużyny zamienione | 95,03 | 74,28 | -0,25 | 3,75 |
| 20 mph, huck +10 | 94,98 | 76,55 | -0,75 | -3,00 |
| 20 mph, endurance +10 | 95,83 | 77,93 | -2,38 | 4,25 |

Najważniejszy sygnał: przy silnym wietrze nadal występuje duża różnica między ścieżkami. Ta mała próba nie określa jeszcze prawidłowej wartości kary wiatru. Nie można też wyciągać wniosku o ujemnym wpływie huck +10 na zawodnika z niższej celności całego meczu: zmieniają się wybory, rywale, liczba podań i przebieg losowań. Wyniki atrybutów oraz symetrii wymagają większej próby i statystyk rozdzielonych na drużyny oraz rzuty upwind/downwind; obecna tabela służy wykrywaniu kierunku dalszych badań.

## Nowe pomiary i ograniczenia

`scripts/engine-realism.mjs` zapisuje rozkłady dystansów prób i udanych podań, czasu trzymania dysku, liczby rzutów w posiadaniu, czasu posiadania, pierwszego rzutu po stracie, podział strat i ich tercje boiska oraz resety przy stallu ≥5. Osobno liczy klatki, snapshoty zawodników i wymuszone zakończenia punktu. `--wind` blokuje pogodę, `--fixed-tactics` zachowuje rotację, a `--frozen` wyłącza także rotację.

Czas pełnego punktu oznacza sumę zarejestrowanych akcji; nie obejmuje całego czasu organizacyjnego meczu ani nie stanowi stopera zawodów. Czas fast jest oszacowaniem z czasu decyzji i lotu, bez rzeczywistego dojścia po dysk. Nie należy zestawiać tych miar jako równoważnych. Fast nie tworzy klatek ruchu.

Otwarte kwestie przed kalibracją:

- Fast nadal ma mało strat, wysoką celność i dyskretny model długości podań. Trzeba osobno zbadać selekcję i szansę wykonania, szczególnie pod wiatr.
- Geometria strat fast jest przybliżeniem wymagającym danych o miejscach strat; block nie rozróżnia jeszcze dokładnie obrony markera i obrony na trasie.
- Pełny silnik traktuje blok jako dysk do podniesienia; rozróżnienie zbicia i przechwytu pozostaje do rozwinięcia.
- Naprawa stalla nie jest dowodem, że rozkład późnych resetów jest już realistyczny. Brak stall-outów w próbce nie oznacza, że nigdy nie wystąpią.
- Rotacja składu, adaptacja AI i pogoda wymagają oddzielnych eksperymentów; pilotażu ze stałą taktyką nie należy utożsamiać z domyślnym parity.

## Weryfikacja

Polecenia do powtórzenia:

```text
node scripts/check-engine-realism.mjs
node scripts/check-named-exports.mjs
node scripts/engine-parity.mjs 40 20
node scripts/engine-realism.mjs --fast 16 --full 8 --offset 3700 --output artifacts/engine-audit/final.json
node scripts/engine-wind-attributes.mjs 8 4
npm run build
```

Końcowy wynik: regresje **PASS**, eksporty **PASS** (261 plików), build **PASS** (307 modułów; ostrzeżenie o wielkości pakietu). Regresje sprawdzają zasady liczenia, położenie strat, zależność zmęczenia od czasu, własność map energii po zmianie stron, ciągłość ruchu, podniesienie dysku, odtwarzanie jego stanu i brak trace w 8 meczach fast. Nie zastępują ręcznej oceny animacji meczu.

Repozytorium ma istniejące problemy lint: pełny przebieg zgłosił 112 błędów i 51 ostrzeżeń. Kontrola zmienianych plików mechaniki/harnessów wskazała jedynie wcześniejszy nieużywany parametr `possessionTeam` w `stamina.js`; `fieldMotion.js` ma dodatkowo 10 wcześniejszych błędów nieużywanych nazw. Nie porządkowano niezwiązanych fragmentów. Starszy `smoke-match-stats.mjs` zatrzymuje się na oczekiwaniu reakcji 200 ms wobec 188 ms; formuła reakcji i model statystyk nie były zmieniane w tym wdrożeniu.

Pliki `repaired.json`, `parity-after.txt` oraz `optimized-timing.json` to etapy pośrednie, a nie końcowy wynik. Zmiany pozostają lokalne, bez commita.
