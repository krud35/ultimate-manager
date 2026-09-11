# Kalibracja prostych sytuacji — 9 września 2026

Zrealizowano punkty 1–3: kontrolowane sytuacje, rejestr każdej straty i kalibrację mechaniki dobiegu z oddzielnym sprawdzeniem reakcji, wykonania rzutu i chwytu. To kalibracja mechanizmów, nie zakończony balans całych meczów ani dopasowanie do empirycznych statystyk ligi.

**Metoda.** 17 sytuacji × 128 seedów × 2 warstwy × 6 wariantów = 26 112 przebiegów. Warstwa idealna wyłącza błąd wykonania toru, ale zachowuje percepcję, ruch, kontakt, losowy chwyt i lądowanie. Warstwa wykonania używa resolveThrow(executionOnly), błędu celowania i wykonania łuku. Obie korzystają z produkcyjnej pętli runContinuousThrowSimulation; kontrolowane wejście zaczyna się w chwili wypuszczenia dysku. Nie jest to pełne posiadanie z naturalną decyzją i ustawianiem 7 na 7.

Seedy sparowano między wariantami. Liczniki seedów mieszane są deterministycznym hashem przed produkcyjnym LCG; oddzielne strumienie obsługują wykonanie, tor i kontakt. Walidacja używa rozłącznych seedów. Ten sam seed kontaktu nie gwarantuje identycznego rzutu RNG po zmianie liczby kontaktów. Zawodnicy mają neutralne traity, morale 72 i atrybuty 80; warianty zmieniają wyłącznie wszystkie atrybuty throwing na 60 lub catching na 60. Planowany tor pozostaje wspólny. To lokalna analiza wrażliwości, nie pełny audyt wszystkich statystyk, morale i traitów.

**Przyjęte poprawki.**

- Prędkość dobiegu zależy od czasu do przewidywanego kontaktu: 0,15 s wyprzedzenia i 0,08 m bufora. Integrator zachowuje ograniczenia przyspieszenia i hamowania. Usuwa to przestrzeliwanie punktu oczekiwania i oscylacje przy długim locie.
- Plan ruchu przy linii wybiera miejsce na obie stopy wewnątrz boiska, z odjęciem wysunięcia ręki od pozostałego zasięgu. Nie zakłada automatycznej pozycji toe-in podczas biegu. Toe-in nadal rozstrzyga rzeczywisty kontakt i lądowanie.
- Planowanie przechwytu uwzględnia kontynuację lotu do 12 s po nominalnym czasie, zgodnie z budżetem symulatora. Dłuższy czas do rzeczywistego chwytu obniża ocenę rzutu. Wcześniej lot pod wiatr mógł zostać uznany za nieosiągalny, choć późniejszy chwyt był możliwy.
- Do diagnozy trafia pełny wynik wykonania. Kara zmęczenia pokazuje sumę i trzy składniki, zamiast raportować wyłącznie 3,5 punktu kary accuracy.

**Skuteczność po wykonaniu rzutu, liczba zakończonych podań / 128.** Kontrola sprint wyłącza wyłącznie regulację prędkości dobiegu; zawiera pozostałe poprawki. Nie jest kopią całego silnika sprzed tej pracy.

| Sytuacja | Sprint | Kalibracja | Niezależna próba | Rzut 60 | Chwyt 60 | Reakcja ×0,5 |
|---|---:|---:|---:|---:|---:|---:|
| Incut 8 m | 127 | 127 | 128 | 127 | 127 | 127 |
| Reset 7 m | 128 | 128 | 128 | 128 | 128 | 128 |
| Start w stronę celu | 128 | 128 | 128 | 128 | 128 | 128 |
| Start od celu | 127 | 127 | 128 | 124 | 127 | 127 |
| Wymuszony huck w podwójne krycie | 72 | 124 | 125 | 109 | 122 | 124 |
| Otwarty huck 33 m | 66 | 120 | 123 | 106 | 118 | 120 |
| Odbiór przy linii | 128 | 128 | 128 | 128 | 128 | 128 |
| Łuk wychodzący i wracający | 128 | 128 | 128 | 128 | 128 | 128 |
| Dysk poza zasięgiem za boiskiem | 0 | 0 | 0 | 0 | 0 | 0 |
| Legalny toe-in | 128 | 128 | 128 | 128 | 128 | 128 |
| Lądowanie zbyt daleko za linią | 0 | 0 | 0 | 0 | 0 | 0 |
| Odzyskanie po zbiciu | 128 | 128 | 128 | 128 | 128 | 128 |
| Wiatr 20 mph / 0° | 126 | 126 | 126 | 125 | 122 | 126 |
| Wiatr 20 mph / 90° | 124 | 124 | 127 | 122 | 124 | 124 |
| Wiatr 20 mph / 180° | 127 | 125 | 125 | 122 | 124 | 125 |
| Reset z błędem 1,2 m | 128 | 128 | 128 | 128 | 128 | 128 |
| Incut, energia 20/100 | 82 | 82 | 79 | 80 | 78 | 83 |

Nie ma założenia, że każda poprawka podniesie skuteczność każdego rzutu. Np. wiatr 180° daje 127→125/128. Globalne skrócenie reakcji daje w końcowej próbie jedynie +1 chwyt zmęczonego incutu, bez poprawy pozostałych scenariuszy; pozostawiono mnożnik 1. Rzut 60 obniża otwarty huck ze 120 do 106, chwyt 60 do 118. Nie podwyższano globalnej skuteczności chwytu ani celności.

**Rejestr strat w wariancie kalibrowanym, warstwa wykonania.**

| Sytuacja | Zakończenie i liczba |
|---|---|
| Incut 8 m | landing_drop: 1 |
| Reset 7 m | brak strat |
| Start w stronę celu | brak strat |
| Start od celu | drop: 1 |
| Wymuszony huck w podwójne krycie | not_in_reach: 3, lane_block: 1 |
| Otwarty huck 33 m | drop: 4, not_in_reach: 4 |
| Odbiór przy linii | brak strat |
| Łuk wychodzący i wracający | brak strat |
| Dysk poza zasięgiem za boiskiem | out_of_bounds: 128 |
| Legalny toe-in | brak strat |
| Lądowanie zbyt daleko za linią | out_of_bounds: 128 |
| Odzyskanie po zbiciu | brak strat |
| Wiatr 20 mph / 0° | landing_drop: 2 |
| Wiatr 20 mph / 90° | not_in_reach: 2, drop: 2 |
| Wiatr 20 mph / 180° | drop: 1, landing_drop: 2 |
| Reset z błędem 1,2 m | brak strat |
| Incut, energia 20/100 | not_in_reach: 44, drop: 1, landing_drop: 1 |

Incut traci raz przy lądowaniu, reset nie traci. Otwarty huck ma 4 dropy i 4 braki kontaktu. Wszystkie cztery braki kontaktu znikają w sparowanym idealnym locie: to dowód wrażliwości całego odbioru na wykonanie toru, nie samodzielny dowód winy odbierającego. Wymuszony błąd resetu 1,2 m zostaje skorygowany w każdej próbie.

Przy energii 20/100 suma kar wykonania wynosi 38,61 punktu: accuracy 3,5, performance 26,22, collapse 8,89. Wynik 82/128 (walidacja 79/128) wobec 126/128 na idealnym torze; 44 straty to brak kontaktu, w 43 z tych par idealny lot zostaje złapany. To mocny sygnał do osobnej kalibracji nakładających się kar zmęczenia. Nie usuwano ich arbitralnie bez docelowej krzywej sprawności i danych o rotacji/staminie.

Każda strata obu warstw ma wpis w loss-ledger.json: case, seed, zakończenie, porównanie z idealnym lotem i sprintem, błędy toru, kary zmęczenia, kontakty, odczyty odbierającego i lądowanie. Nieznane przyczyny zachowują etykietę unknown_no_contact/unknown_boundary_cause. Lista czynników nie jest dowodem przyczynowości. Pełne ślady klatek dla pierwszych dwóch seedów każdej sytuacji znajdują się w plikach przebiegów.

**Decyzje i pozostałe ograniczenia.** 16 odczytów na sytuację w stałym ustawieniu, ze skanami od 0 do 1040 ms; to osobne próby scanThrowOptions. Podwójne krycie odrzucone 16/16, otwarty huck i reset wybrane 16/16. Scena outside nie wymusza decyzji rzutu za linię: skaner sam wybiera cel do ustawionego odbierającego. Próby decyzyjne używają zdrowych zawodników 80, także przy etykiecie fatigued_incut; nie mierzą decyzji zmęczonego zawodnika.

Wymuszony huck w podwójne krycie jest nadal skuteczny 124/128, choć występuje 13 dotknięć lane_block i tylko jedna ostateczna strata po bloku. To nie potwierdza poprawnego balansu obrony. Do dalszej pracy: czas i pozycja próby obrońcy, odzyskanie po dotknięciu, nakładanie się ciał i definicja presji przy chwycie. Obecne wykrycie contested porównuje kontakty w wąskim oknie części ticka; fizycznie bliski obrońca nie musi zwiększyć trudności chwytu. Nie należy dopasowywać tego do oczekiwanego procentu tylko przez mnożnik skuteczności.

Próby lotu z wiatrem badają spójność planu i wykonania. Nie kalibrują współczynników aerodynamicznych na pomiarach realnego dysku. Próba toe-in jest kontrolowanym krótkim lotem przy lądowaniu, a odzyskanie po zbiciu zawiera pomocnika; nie stanowią rozkładu sytuacji meczowych.

**Odtwarzanie i kontrola.**

```powershell
node scripts/calibrate-situations.mjs --n 128 --output artifacts/scenarios/calibrated.json
node scripts/calibrate-situations.mjs --n 128 --approach sprint --output artifacts/scenarios/control-sprint.json
node scripts/calibrate-situations.mjs --n 128 --offset 81000 --output artifacts/scenarios/validation-independent.json
node scripts/calibrate-situations.mjs --n 128 --throw-skill 60 --output artifacts/scenarios/isolated-throw60.json
node scripts/calibrate-situations.mjs --n 128 --catch-skill 60 --output artifacts/scenarios/isolated-catch60.json
node scripts/calibrate-situations.mjs --n 128 --read-scale 0.5 --output artifacts/scenarios/isolated-reaction-half.json
node scripts/report-situation-calibration.mjs
```

Skrypt raportu sprawdza zgodność hashy źródeł, par seedów, ich rozłączność z walidacją oraz regresje: bezpieczna linia, legalny toe-in, negatywne outy, powrót dysku i poprawa dobiegu. Pozostałe pliki JSON w tym katalogu są pośrednimi eksperymentami, czasem ze starszymi fixtures i liniowymi seedami; nie należy mieszać ich z powyższym końcowym zestawem.

**Weryfikacja tej zmiany.** Przeszły check-disc-intercept (w tym nowe regresje bezpiecznego podparcia i ograniczonego hamowania), check-recommendations, check-player-behavior, check-engine-realism (8 meczów fast) oraz check-disc-flight (4 pełne mecze: 951 chwytów, 124 straty). Targetowany ESLint i build przeszły; build zgłasza ostrzeżenie o dużym bundle. Pełne mecze służą kontroli integracji i nie są dowodem poprawnego balansu ligowego. Wyniki walidacji opisują tę sesję; przy kolejnych zmianach należy uruchomić te komendy ponownie.
