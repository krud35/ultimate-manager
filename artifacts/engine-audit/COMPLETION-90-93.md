# Completion 90–93% — kalibracja 2026-09-09

Cel użytkownika: 90–93% ukończonych podań w agregacie pełnych meczów. Wynik końcowych prób: **90.60%**, 4655/5138 podań, 20 meczów.

To cel projektowy, nie niezależnie ustalona norma ligi. Nie oznacza, że każdy mecz, poziom graczy, typ podania albo pogoda osiągnie to samo pasmo.

| Próba | Tryb | Mecze | Podania | Completion | Bloki/mecz | Limity punktów |
|---|---|---:|---:|---:|---:|---:|
| control | full | 4 | 1233 | 84.35% | 19.25 | 0 |
| offense | full | 4 | 916 | 86.68% | 11.00 | 0 |
| pilot | full | 4 | 1175 | 88.60% | 8.00 | 0 |
| precise | full | 4 | 1234 | 90.60% | 5.75 | 1 |
| selective | full | 4 | 1115 | 90.76% | 7.00 | 0 |
| validation | full | 8 | 1852 | 90.28% | 5.38 | 0 |
| wind | full | 4 | 961 | 90.95% | 7.00 | 0 |
| fast-pilot | fast | 8 | 1802 | 91.56% | 8.88 | 0 |
| fast-validation | fast | 16 | 3353 | 91.20% | 7.94 | 0 |
| defaults | fast | 8 | 1645 | 91.55% | 7.63 | 0 |
| defaults | full | 4 | 1210 | 90.66% | 7.75 | 0 |

## Co zmieniono

- Śledzenie dysku: aktualizacja celu co 80 zamiast 200 ms, czas narastania korekty toru ×0.5. Początkowy czas reakcji, zasłanianie dysku i zależność od discReading/anticipation pozostają. Obie strony używają tego samego modelu; odbiorca nie otrzymuje przyszłej rzeczywistej trajektorii.
- Błąd sytuacyjny celowania: próg marginesu 12 → 0, przesunięcie 0.14 → 0.04 m na punkt deficytu. Losowe pomyłki zależne od umiejętności, błąd wysokości/krzywizny, wiatr, zmęczenie i presja pozostają.
- Zbicie po geometrycznym kontakcie: baza 0.10 → 0.05, wkład umiejętności 0.28 → 0.14. To jawna kalibracja częstości skutecznego zagrania obrony; nie zmiana zasięgu ręki ani wyłączenie przechwytów.
- Decyzja przy stall <5: opcja z niepewnością zapamiętanej pozycji >0.5 m odpada do kolejnego odczytu. Pod presją czasu zostaje dostępna z karą za ryzyko. Aktualna obserwacja ma niepewność 0.
- Fast: gapOffset −12 → −6, osobno dopasowany do nowego celu. Pozostałe parametry fast bez zmian.

## Co pokazały porównania

Control, offense i pilot używają tej samej zamrożonej wersji oraz tych samych seedów. Offense zmienia odczyt i celowanie (próg 8, nachylenie 0.08); pilot dodatkowo zmniejsza szansę bloku. Wyniki kolejnych pełnych meczów rozchodzą się po pierwszej zmianie zdarzenia — różnicy pojedynczych liczników nie należy traktować jak bezpośredniego przypisania przyczyn.
Precise i selective mają docelowe celowanie (0/0.04), różnią się filtrem niepewności. Precise przekroczył cel, ale jeden punkt skończył limitem; nie został wybrany. Selective nie miał limitów i trafił do walidacji bez dalszego strojenia.
Validation: 8 nowych seedów, naturalnie generowana pogoda, adaptacja taktyki i rotacje. Wind: 4 kolejne seedy, stały boczny wiatr 20 mph. Defaults: końcowe ustawienia bez flag kalibracyjnych, zamienione drużyny home/away. Zespoły demonstracyjne Seattle/Boston; nie jest to przegląd całej ligi.

## Struktura końcowych podań

| Typ | Udane / próby | Completion |
|---|---:|---:|
| standard | 3040/3342 | 90.96% |
| huck | 363/401 | 90.52% |
| dump_swing | 1221/1363 | 89.58% |
| over_the_top | 31/32 | 96.88% |

Rozpoznania: {"completed":4655,"boundary":79,"unknown_no_contact":237,"block":124,"drop":43}. unknown_no_contact oznacza brak potwierdzonego kontaktu, a nie dowód konkretnego błędu AI.

## Weryfikacja i ograniczenia

- Kontrolowane sytuacje: 17 przypadków ×2 warstwy ×64 losowania. Incut, reset i zmęczony incut: 64/64 w warstwie wykonania; podwójne krycie: 54/64. Out i toe-out: 0/64, toe-in i powrót dysku zza linii: 64/64.
- Osobne 128 losowań na przypadek przy throwing 60 i 95 zachowują różnice wykonania; podwójne krycie 114/128 →128/128. Proste podania są blisko sufitu. Ten mały zestaw nie dowodzi poprawnego wpływu każdego atrybutu i traitu w całej lidze.
- Sprawdzenia dobiegu/bezwładności, odczytu, omijania graczy, resetów, 33 atrybutów i realizmu: OK. Test odczytu zaktualizowany z dotychczasowego okna 200 ms do 80 ms; nadal sprawdza brak znajomości błędu rzutu przy wypuszczeniu.
- Niezależne sprawdzenie geometrii 4 meczów: 878 chwytów, 85 strat, każdy wymagany kontakt potwierdzony, brak teleportów i limitów punktów. ESLint zmienianych modułów i produkcyjny build: OK; build zgłasza istniejące duże chunki.
- Źródła były zamrażane, ponieważ inne zadanie równolegle zmieniało telemetrykę stylów gry. Każdy wynik zawiera hashe źródeł, konfigurację, argumenty i pustą listę changedDuringRun. Końcowa próba defaults dodatkowo weryfikuje integrację ustawień domyślnych.
- Cel osiągnięty dla agregatu; resety oraz pojedyncze mecze mogą wypaść poniżej 90%. Pozostałe minięcia dysku i selektywność hucków nadal wymagają osobnego audytu realizmu.

Odtworzenie końcowej próby: `node scripts/balance-engine.mjs --fast 8 --full 4 --offset 628357 --swap --progress --output artifacts/engine-audit/completion90-defaults.json`.
Artyfakty comparison: completion90-*.json, scenarios/completion90-*.json. Raport: `node scripts/report-completion90.mjs`.
