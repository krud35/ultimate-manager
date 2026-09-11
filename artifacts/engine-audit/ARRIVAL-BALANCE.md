# Dynamiczne okno przechwytu i wiek obserwacji

Naprawa dotyczy fałszywie osiągalnych bliskich przechwytów przy znaczącej prędkości zawodnika. Samo znajdowanie się dziś w zasięgu przyszłego punktu nie gwarantuje, że zawodnik pozostanie w nim do przylotu dysku.

## Zmiana

Po wstępnej ocenie analitycznej selectDiscIntercept sprawdza osiągalne kandydatury w horyzoncie do 0,8 s przez projekcję ruchu w krokach do 20 ms. Używa integrateAgentMotion, zachowuje początkową prędkość, ograniczenia skrętu, przyspieszenia i hamowania oraz lokalne omijanie. Dodatni motionGap wyklucza osiągalność tego okna. Nie poszerza zasięgu kontaktu i nie wymaga zatrzymania do chwytu.

arrivalSpeed współdzieli z ruchem rzeczywistym dotychczasową prośbę o tempo dojścia do punktu. Wersja pośrednia dodawała dodatkowe ograniczenie prędkości oparte na drodze hamowania; pogarszało ono proste incuty i zostało usunięte. Końcowa poprawka sprawdza rzeczywistą wykonalność ruchu, zamiast nakazywać wszystkim odbiorcom dodatkowe hamowanie.

W ocenie rzutu stara obserwacja otrzymuje miękki koszt niepewności. Rośnie on z wiekiem obserwacji i zapamiętaną prędkością; anticipation ogranicza niepewność, decisionMaking wpływa na uwzględnienie jej w ocenie. Świeży odczyt ma koszt zero. Nie przekazujemy rzucającemu ukrytej prawdziwej pozycji ani nie blokujemy wszystkich podań do chwilowo niewidocznego partnera. Niepewność jest zapisana w plannedArrival.uncertaintyM.

## Przypadek Mourada

Test zawiera pozycję i prędkość z analizowanej straty: po 400 ms lotu odbiorca biegnie z vx≈1,66 i vy≈5,36 m/s. Dla bliskiego celu i okna 180 ms stary wzór zwraca zero czasu dobiegu. Projekcja ruchu pokazuje około 0,297 m braku względem zadanego zasięgu 0,7 m. Nowy planer odrzuca okno, stary je przyjmuje; po wyzerowaniu prędkości okno staje się osiągalne. Test obejmuje też obrót sceny i legalny chwyt w ruchu po 20 ms.

Nie jest to twierdzenie, że historyczne podanie musi teraz zakończyć się chwytem. Tam równocześnie wystąpiły stara obserwacja i błąd wykonania. Pomocniczy replay z idealną znajomością zapisanego toru pozwala na kontakt zarówno staremu, jak i nowemu sterowaniu — potwierdza fizyczną możliwość odbioru, lecz pomija percepcję i nie dowodzi usunięcia wszystkich przyczyn tej konkretnej straty. Poprawiono wykazaną fałszywą ocenę okna oraz koszt starego odczytu.

## Pomiary końcowe

Odizolowana kopia: artifacts/engine-audit/reset-snapshot-1788958959042. Kontrola wyłącza tylko ARRIVAL_CALIBRATION.kinematics i observationRisk. Po 4 pełne mecze na tych samych seedach, offset 94437, 20 mph / 90°. Kolejne 4 mecze mają rozłączne seedy, offset 182451 i standardową pogodę. Źródła w pięciu seriach mają zgodne hashe i nie zmieniały się podczas pracy. Cztery mecze na wariant nie wyznaczają norm ligi.

| Wskaźnik | Kontrola | Poprawka | Inne seedy/pogoda |
|---|---:|---:|---:|
| Completion (%) | 83.16 | 85.23 | 84.01 |
| Completion dump/swing (%) | 79.09 | 85.54 | 82.55 |
| Unknown no contact / wszystkie próby (%) | 7.72 | 6.17 | 6.68 |
| Straty/punkt | 1.64 | 1.67 | 1.86 |
| Podania/punkt | 9.72 | 11.28 | 11.60 |
| Bloki/mecz | 14.25 | 17.50 | 20.75 |
| Awaryjne limity | 0.00 | 0.00 | 0.00 |

Kryterium braku awaryjnych limitów: spełnione. Wzrost completion jest wynikiem próby, nie gwarantowanym przyrostem dla każdego zespołu. Nie zmieniano parametrów celności, chwytu ani blokowania.

17 sytuacji × 2 warstwy × 128 seedów × 2 warianty = 8704 przebiegi. Poniżej warstwa wykonania, chwyty / 128.

| Sytuacja | Kontrola | Poprawka |
|---|---:|---:|
| incut | 127 | 127 |
| reset | 128 | 128 |
| turn_toward | 128 | 128 |
| turn_away | 127 | 127 |
| double_coverage | 110 | 107 |
| deep_open | 127 | 127 |
| sideline | 128 | 128 |
| returning_arc | 128 | 128 |
| outside | 0 | 0 |
| toe_in | 128 | 128 |
| toe_out | 0 | 0 |
| tip_recovery | 128 | 128 |
| wind_0 | 125 | 125 |
| wind_90 | 124 | 124 |
| wind_180 | 127 | 127 |
| aim_error_reset | 128 | 128 |
| fatigued_incut | 121 | 121 |

## Weryfikacja i ograniczenia

Przeszły testy okna chwytu, planowania przechwytu i obejścia przeszkód, stanów cutterów, 33 atrybutów i check-engine-realism (8 meczów fast), targetowany ESLint oraz produkcyjny build. Build ostrzega o dużym bundle. check-disc-flight przeszedł na końcowej kopii kodu: 4 pełne mecze, 975 chwytów i 170 strat, kontrola kontaktu i ciągłości ruchu.

Projekcja kosztuje do 40 kroków na sprawdzaną bliską kandydaturę. Dalekie okna pozostają analityczne, pozycje przeszkód pochodzą z dostępnego odczytu, a przyszłe zamiary przeciwników nie są znane. Projekcja nie zastępuje detekcji kontaktu ani pełnego modelu lotu/skoku. Czasy równoległych serii nie izolują kosztu obliczeniowego zmiany. Błędy unknown_no_contact nie zostały w całości wyeliminowane.

Starsze arrival-control/final/validation oraz arrival-v2-pilot są pomiarami wersji pośrednich. Końcowe wnioski opierają się na seriach arrival-v2-control/final/validation z tej samej kopii kodu.

## Odtwarzanie

```powershell
Set-Location C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/reset-snapshot-1788958959042
node scripts/check-arrival-window.mjs
node scripts/balance-engine.mjs --fast 0 --full 4 --offset 94437 --wind 20 --direction 90 --legacy-arrival --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/arrival-v2-control.json
node scripts/balance-engine.mjs --fast 0 --full 4 --offset 94437 --wind 20 --direction 90 --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/arrival-v2-final.json
node scripts/balance-engine.mjs --fast 0 --full 4 --offset 182451 --output C:/Users/marod/ultimate-manager-ufa/artifacts/engine-audit/arrival-v2-validation.json
node scripts/balance-engine.mjs --situations --n 128 --legacy-arrival --output C:/Users/marod/ultimate-manager-ufa/artifacts/scenarios/arrival-v2-control.json
node scripts/balance-engine.mjs --situations --n 128 --output C:/Users/marod/ultimate-manager-ufa/artifacts/scenarios/arrival-v2-final.json
Set-Location C:/Users/marod/ultimate-manager-ufa
node scripts/report-arrival-balance.mjs
```
