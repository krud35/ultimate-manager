# Balans przestrzeni przy odbiorze dysku — 9 września 2026

Przyjęto lokalne omijanie zawodników przy dobiegu do dysku. Zawodnik respektuje miejsce już zajęte przez inną sylwetkę, zamiast kierować środek własnego ciała dokładnie w ten sam punkt. Nie zmieniono współczynników celności, chwytu ani blokowania.

**Mechanika.** Obie drużyny korzystają ze wspólnego snapshotu pozycji sprzed kroku. Promień sylwetki wynika z połowy szerokości barków. Do omijania dodano 0,12 m marginesu; przeszkody na trasie rozpatrywane są w odcinku zależnym od żądanej prędkości i horyzontu 0,5 s. To lokalne sterowanie ruchem, a nie prognoza intencji wszystkich graczy.

Jeśli ktoś jest już bliżej zajętego punktu odbioru, dobieg kończy się przy jego obrysie. Przeszkodę na drodze zawodnik omija z boku. Zmienia się wyłącznie cel i żądana prędkość: pozycję nadal wyznacza integrator z ograniczeniami przyspieszenia, hamowania i skrętu. Nie ma teleportowania, odsuwania po wyniku ani zwiększania zasięgu chwytu. Dla celu wewnątrz boiska manewr omijania nie wyznacza nowego punktu poza linią; rzeczywiste cele poza boiskiem pozostają dozwolone.

**Pomiar przestrzeni.** Liczymy odsetek klatek IN_FLIGHT, w których obrysy przynajmniej jednej pary zawodników nakładają się w rzucie na boisko. Obrys jest kołem z promieniem połowy szerokości barków; pomijamy pary z różnicą wysokości ponad 1,5 m. To przybliżony wskaźnik geometrii, nie liczba zderzeń ani fauli. Mianowniki są zapisane w space-summary.json i surowych wynikach. Zmiana długości lotów również zmienia mianownik.

**Kontrolowane sytuacje: 17 × 2 warstwy × 256 seedów × 3 warianty = 26 112 przebiegów.** Kontrola wyłącza wyłącznie body traffic. Pierwsze dwa warianty mają identyczne seedy, trzeci rozłączny zbiór. Poniżej warstwa wykonania, liczba chwytów / 256.

| Sytuacja | Kontrola | Omijanie | Niezależne seedy |
|---|---:|---:|---:|
| incut | 252 | 252 | 256 |
| reset | 254 | 254 | 256 |
| turn_toward | 256 | 256 | 256 |
| turn_away | 254 | 254 | 256 |
| double_coverage | 232 | 222 | 230 |
| deep_open | 252 | 252 | 250 |
| sideline | 256 | 256 | 256 |
| returning_arc | 256 | 256 | 256 |
| outside | 0 | 0 | 0 |
| toe_in | 256 | 256 | 255 |
| toe_out | 0 | 0 | 0 |
| tip_recovery | 256 | 256 | 256 |
| wind_0 | 248 | 248 | 252 |
| wind_90 | 247 | 247 | 255 |
| wind_180 | 252 | 252 | 253 |
| aim_error_reset | 256 | 256 | 256 |
| fatigued_incut | 236 | 236 | 244 |

Podwójne krycie: odsetek klatek z nakładaniem sylwetek 77.24% → 27.76% → 25.79% (kontrola → omijanie → niezależna próba). Otwarty huck i proste incuty bez przeszkód nie wymagają zmiany dobiegu. Nie stroimy modelu do z góry wymaganego procentu chwytów w jednym ustawieniu.

**Pełne mecze.** Kontrola i przyjęta wersja: po 8 pełnych meczów, te same seedy (offset 32400), rotacja i adaptacja AI, pogoda generowana standardowo. Średni początkowy wiatr wynosi 15,75 mph. Walidacja: 8 innych seedów, stałe 20 mph / 90°. Składy demonstracyjne są różne; wynik meczu nie jest testem równych drużyn.

| Wskaźnik | Kontrola | Omijanie | Walidacja 20 mph |
|---|---:|---:|---:|
| Klatki z nakładaniem sylwetek (%) | 26.72 | 17.33 | 17.24 |
| Celne podania (%) | 85.33 | 82.44 | 82.11 |
| Bloki na mecz | 12.88 | 17.50 | 21.00 |
| Straty na punkt | 1.54 | 1.88 | 1.92 |
| Hold (%) | 38.95 | 32.02 | 43.55 |
| Podania na punkt | 10.51 | 10.72 | 10.73 |
| Awaryjne limity rzutów | 0.00 | 0.00 | 0.00 |

Mniejsza celność nie jest sama w sobie dowodem poprawy. Uzasadnieniem przyjęcia zmiany jest ograniczenie niefizycznego zajmowania tego samego miejsca, zachowanie kontrolowanych prostych podań i brak teleportów. Próba ośmiu meczów nie ustala docelowych norm ligi ani siły każdego zespołu.

**Presja i diagnoza strat.** Pozostawiono contestedMiss = 0,018. Dla catching 80 jego samodzielny wpływ na szansę nieutrzymania dysku wynosi około 1,14 punktu procentowego; dodatkowo działają rzeczywiste kontakty obrońców, przejęcia, zasięg i lądowanie. Nie zwiększano tej kary jednocześnie ze zmianą geometrii.

Diagnoza rzutu zawiera bodyAvoidanceTicks i do 64 próbek bodyAvoidance: zawodnika omijanego, pierwotny punkt przechwytu, wybrany cel ruchu i żądaną prędkość. space-losses.json zapisuje każdą stratę obu warstw przyjętych scenariuszy oraz wynik tej samej pary w kontroli. Obecność manewru omijania nie oznacza automatycznie, że spowodował stratę; unknown_no_contact pozostaje nieustaloną przyczyną.

**Weryfikacja.** Przeszły testy zajętego punktu, zachowania otwartej przestrzeni, obrotu sceny, hamowania przed nieruchomym ciałem i omijania przy linii. Przeszły również check-disc-intercept, check-recommendations, check-player-behavior, check-engine-realism (8 meczów fast) i check-disc-flight (4 pełne mecze: 771 chwytów, 150 strat), w tym kontrola ciągłości pozycji i przejęć. Targetowany ESLint i build przeszły; build nadal ostrzega o dużym bundle.

**Odtwarzanie.**

```powershell
node scripts/balance-engine.mjs --situations --n 256 --no-body-traffic --output artifacts/scenarios/space-control-final.json
node scripts/balance-engine.mjs --situations --n 256 --output artifacts/scenarios/space-final.json
node scripts/balance-engine.mjs --situations --n 256 --offset 81000 --output artifacts/scenarios/space-validation.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 32400 --no-body-traffic --output artifacts/engine-audit/space-control.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 32400 --output artifacts/engine-audit/space-final.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 41400 --wind 20 --direction 90 --output artifacts/engine-audit/space-validation.json
node scripts/check-body-traffic.mjs
node scripts/report-space-balance.mjs
```

**Granice.** Omijanie dotyczy obecnie zawodników bezpośrednio walczących o lecący dysk. Nie jest twardym modelem kolizji: początkowe nakładanie się pozycji, ruch pozostałych graczy i layouty nadal mogą pozostawić wspólną przestrzeń. W pełnych meczach pozostaje około 17% takich klatek. Model oceny czasu przechwytu nadal upraszcza koszt omijania; zapisy nowej diagnostyki pozwalają wskazać przypadki rozbieżności planu i dobiegu. Następna sensowna praca to uwzględnienie przeszkód w planowaniu przechwytu oraz ruchu pozostałych zawodników, przed kolejnym strojeniem skuteczności.

space-pilot zawiera wcześniejszy wariant ochrony manewru przy linii; nie jest końcowym wynikiem. Czasy z równolegle uruchamianych pomiarów nie są wiarygodnym benchmarkiem wydajności. Brak zewnętrznego zbioru obserwacji meczowych ogranicza możliwość stwierdzenia pełnego balansu realistycznego.

Orientacyjny pomiar sekwencyjny, po dwa mecze na tych samych seedach: 9.07 → 10.48 s/mecz; 0.280 → 0.270 ms/klatkę. Liczba akcji i długość meczów zmieniają się wraz z zachowaniem graczy. To zbyt mała próba do wniosku o przyspieszeniu lub braku kosztu; pomiar obejmuje również diagnostykę ekspozycji sylwetek.
