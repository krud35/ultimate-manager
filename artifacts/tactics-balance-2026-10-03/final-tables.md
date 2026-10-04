# Tabele uzupełniające: pełne mecze przed / po

Źródło agregatów: C:\Users\marod\ultimate-manager-ufa\artifacts\engine-audit\tactics-balance-2026-10-03-validation; comparison wygenerowano 2026-10-03T20:15:08.775Z.
Wspólna próba: 246 pełnych par, 492 meczów na wersję; plan 498 meczów na wersję.

Zapis `przed → po [n/plan]`: n to liczba różnych seedów z metryką w pełnych parach obu wersji, plan to liczba seedów dla danego kontekstu. Każdy seed obejmuje zamianę stron. Brak wartości oznacza brak sparowanego pomiaru; [0/0] oznacza kontekst nieobecny w przekazanej kolejce.
Wyniki są opisowe. Przy n<3 pominięto przedziały; n=3 nadal nie wystarcza do mocnych wniosków o balansie. Nie wyliczono zbiorczych CI ani testów istotności. A/B oznaczają tożsamości drużyn, nie gospodarzy/gości.

## Macierz bez wiatru

Konwersja ataku A przeciw obronie B: punkty / posiadania, %. Każda komórka ma własne n.

| Atak A / obrona B | Person | All person | Cup | Wall | Clam |
| --- | --- | --- | --- | --- | --- |
| Vertical | 47,77 → 48,36 [3/3] | 51,90 → 51,00 [3/3] | 64,21 → 56,17 [3/3] | 62,68 → 55,21 [3/3] | 42,78 → 45,29 [3/3] |
| Horizontal | 55,76 → 42,62 [3/3] | 52,55 → 49,31 [3/3] | 50,58 → 55,69 [3/3] | 59,65 → 57,20 [3/3] | 48,21 → 49,69 [3/3] |
| Split | 49,90 → 41,53 [3/3] | 51,17 → 47,18 [3/3] | 55,59 → 49,06 [3/3] | 48,86 → 50,53 [3/3] | 50,79 → 42,65 [3/3] |
| Side | 50,52 → 46,91 [3/3] | 48,11 → 47,32 [3/3] | 62,30 → 49,92 [3/3] | 53,76 → 49,86 [3/3] | 44,25 → 40,83 [3/3] |
| Motion | 44,83 → 48,01 [3/3] | 47,45 → 42,48 [3/3] | 40,52 → 41,65 [3/3] | 51,40 → 38,84 [3/3] | 39,07 → 44,60 [3/3] |
| HEX | 39,89 → 41,59 [3/3] | 38,67 → 47,90 [3/3] | 27,96 → 35,98 [2/3] | 21,11 → 31,02 [1/3] | 40,98 → 42,35 [3/3] |
| Zone O | 53,70 → 46,43 [3/3] | 54,94 → 48,12 [3/3] | 60,45 → 60,95 [3/3] | 56,98 → 55,29 [3/3] | 57,81 → 51,20 [3/3] |

## Wyniki przy ustalonym wietrze: zmiana wersji silnika

Konwersja A, %. Obie wersje grają przy tym samym wietrze. Δ wersji to po−przed w pp; nie jest efektem wiatru względem ciszy. Ostatnia kolumna zawiera zapisany eksploracyjny przedział bootstrapu dla zmiany wersji, nie zakres min–max wyników ani dowód istotności.

| Atak / obrona | Wiatr | Konwersja A przed → po [n/plan] | Δ wersji, pp | Bootstrap Δ wersji, pp (opisowo) |
| --- | --- | --- | --- | --- |
| Vertical / Person | cross14 (14,00 mph, 90,00°) | 50,76 → 49,05 [3/3] | -1,71 | -19,82 … 8,30 |
| Vertical / Clam | axial24 (24,00 mph, 180,00°) | 48,96 → 45,15 [3/3] | -3,81 | -4,75 … -3,27 |
| Horizontal / Person | axial14 (14,00 mph, 0,00°) | 53,71 → 51,90 [3/3] | -1,82 | -16,22 … 12,69 |
| Horizontal / Wall | axial24 (24,00 mph, 180,00°) | 55,74 → 46,78 [3/3] | -8,97 | -12,52 … -4,04 |
| Split / Clam | axial14 (14,00 mph, 0,00°) | 46,39 → 38,71 [3/3] | -7,68 | -20,15 … 11,81 |
| Side / All person | axial24 (24,00 mph, 180,00°) | 52,11 → 40,11 [3/3] | -11,99 | -18,25 … -0,13 |
| Motion / Person | cross14 (14,00 mph, 90,00°) | 40,96 → 47,76 [3/3] | 6,80 | 3,38 … 8,75 |
| HEX / Cup | cross24 (24,00 mph, 270,00°) | 41,11 → 44,59 [3/3] | 3,48 | -7,05 … 13,26 |
| Zone O / Cup | axial24 (24,00 mph, 180,00°) | 52,80 → 47,69 [3/3] | -5,11 | -14,88 … 3,49 |
| Zone O / Wall | cross14 (14,00 mph, 90,00°) | 61,35 → 47,24 [3/3] | -14,11 | -19,12 … -10,42 |

Zaplanowane konteksty wiatru w przekazanej kolejce: 10.

## Efekt wiatru względem ciszy: sparowane porównanie

Każda wartość jest różnicą wiatr−cisza obliczoną najpierw wewnątrz tego samego seeda, pary rosterów i taktyki, osobno w każdej wersji. Wymaga pełnych home/away przy obu pogodach w obu wersjach. Strzałka oznacza efekt wiatru przed → efekt wiatru po, w pp. Renderer nie odejmuje średnich z niezależnych lub niedopasowanych komórek.

| Atak / obrona | Wiatr − cisza | Efekt konwersji A [n/plan] | Efekt completion A [n/plan] | Efekt huck A [n/plan] | Zmiana efektu konwersji, pp | Bootstrap zmiany efektu, pp (opisowo) |
| --- | --- | --- | --- | --- | --- | --- |
| Vertical / Person | cross14 (14,00 mph, 90,00°) − calm | 2,99 → 0,69 [3/3] | -0,20 → -0,51 [3/3] | -0,35 → -0,25 [3/3] | -2,30 | -29,04 … 15,74 |
| Vertical / Clam | axial24 (24,00 mph, 180,00°) − calm | 6,18 → -0,14 [3/3] | -0,08 → -1,00 [3/3] | 0,95 → -0,52 [3/3] | -6,32 | -14,98 … 1,15 |
| Horizontal / Person | axial14 (14,00 mph, 0,00°) − calm | -2,05 → 9,27 [3/3] | 0,19 → 1,34 [3/3] | -0,36 → 0,74 [3/3] | 11,32 | -9,58 … 31,47 |
| Horizontal / Wall | axial24 (24,00 mph, 180,00°) − calm | -3,91 → -10,43 [3/3] | -0,05 → -2,41 [3/3] | 1,03 → 2,55 [3/3] | -6,52 | -8,48 … -5,29 |
| Split / Clam | axial14 (14,00 mph, 0,00°) − calm | -4,40 → -3,93 [3/3] | 0,12 → -0,54 [3/3] | 0,12 → 0,28 [3/3] | 0,47 | -18,13 … 33,59 |
| Side / All person | axial24 (24,00 mph, 180,00°) − calm | 4,00 → -7,21 [3/3] | 0,21 → -1,51 [3/3] | -0,45 → -0,09 [3/3] | -11,21 | -28,17 … 1,93 |
| Motion / Person | cross14 (14,00 mph, 90,00°) − calm | -3,87 → -0,25 [3/3] | -0,72 → -0,09 [3/3] | -1,17 → -1,93 [3/3] | 3,62 | -2,58 … 10,58 |
| HEX / Cup | cross24 (24,00 mph, 270,00°) − calm | 13,80 → 14,52 [2/3] | 0,02 → 0,51 [2/3] | -0,18 → -2,19 [2/3] | 0,72 | — (n<3) |
| Zone O / Cup | axial24 (24,00 mph, 180,00°) − calm | -7,65 → -13,26 [3/3] | -2,99 → -3,75 [3/3] | 1,78 → 1,29 [3/3] | -5,61 | -24,83 … 5,55 |
| Zone O / Wall | cross14 (14,00 mph, 90,00°) − calm | 4,37 → -8,05 [3/3] | -0,36 → -2,70 [3/3] | 0,20 → -0,36 [3/3] | -12,43 | -24,44 … 2,14 |

Dopasowane kontrasty pogodowe: 29/30; niedopasowane: 1. Pełny kontrast wykorzystuje 4 mecze na wersję, ale pozostaje jedną repliką seedową.
Przy n<3 zakresów nie podano. Także n=3 daje wyłącznie opis tej małej próby, bez wniosku o ogólnej odporności taktyki na wiatr.

## Instrukcje rzutowe: efekt względem neutralnego

W tej i kolejnych tabelach efektów każda liczba jest treatment−neutral wewnątrz wersji. Strzałka pokazuje zmianę tego efektu po poprawkach. Wskaźniki procentowe są wyrażone w pp, czas w ms. Brak dopasowanego neutralnego bloku pozostaje brakiem pomiaru.

| Instrukcja | Completion A, pp | Huck A, pp | Czas trzymania dysku A, ms | Konwersja A, pp |
| --- | --- | --- | --- | --- |
| safe_throws | 1,71 → -1,56 [3/3] | 1,14 → -0,01 [3/3] | -143,36 → 31,10 [3/3] | 7,51 → -7,01 [3/3] |
| take_risks | 0,06 → -1,82 [3/3] | 1,89 → 0,61 [3/3] | 2,21 → 0,09 [3/3] | 1,89 → -5,06 [3/3] |

## Poach: efekt względem neutralnego

Poach dotyczy obrońców A; jego wynik sportowy oceniamy przez atak B. Udział poachu to czas stanu POACHING / czas obrony, nie prawdopodobieństwo pojedynczej próby.

| Ustawienie A | Poach A, pp | Konwersja B, pp | Completion B, pp |
| --- | --- | --- | --- |
| poach-ban-monotonicity: low (no_poach) | 0,05 → 0,00 [3/3] | -7,71 → 0,00 [3/3] | -1,12 → 0,00 [3/3] |
| poach-ban-monotonicity: high (poach) | 4,39 → 4,06 [3/3] | -6,58 → -1,85 [3/3] | -0,84 → -1,12 [3/3] |
| reset-poach-isolation: low (reset=1) | 0,00 → 3,28 [3/3] | 0,00 → 5,90 [3/3] | 0,00 → 0,72 [3/3] |
| reset-poach-isolation: high (no_poach) | 0,00 → 0,00 [3/3] | 0,00 → 0,00 [3/3] | 0,00 → 0,00 [3/3] |
| poach/no_poach: poach (poach) | 4,14 → 4,17 [3/3] | -2,81 → -6,66 [3/3] | -1,06 → -0,55 [3/3] |
| poach/no_poach: no_poach (no_poach) | -0,14 → -0,14 [3/3] | -8,19 → 5,43 [3/3] | -1,60 → 0,72 [3/3] |

## Aktualny plan kariery: efekt względem neutralnego

Badany jest streamlinedPlan; low/high oznacza wartość osi −1/+1. Presja A jest oceniana przez zachowanie obrony A i konwersję przeciwnika B.

| Oś / poziom | Metryka zachowania | Efekt przed → po [n/plan] | Konwersja właściwej drużyny, pp |
| --- | --- | --- | --- |
| Tempo / low | Czas trzymania dysku A, ms | 213,35 → 188,27 [3/3] | A: 6,90 → -2,43 [3/3] |
| Tempo / high | Czas trzymania dysku A, ms | -158,59 → -220,38 [3/3] | A: 2,52 → 2,97 [3/3] |
| Ryzyko / low | Huck A, pp | 1,26 → -0,50 [3/3] | A: -4,92 → -6,54 [3/3] |
| Ryzyko / high | Huck A, pp | 0,99 → -0,58 [3/3] | A: -3,70 → 4,58 [3/3] |
| Kierunek / low | Dystans rzutu A, m | 0,32 → 0,26 [3/3] | A: -6,65 → -0,95 [3/3] |
| Kierunek / high | Dystans rzutu A, m | 0,14 → 0,77 [3/3] | A: -2,42 → 2,78 [3/3] |
| Presja / low | Odstęp krycia A, m | 0,31 → 0,30 [3/3] | B: 5,44 → -2,53 [3/3] |
| Presja / high | Odstęp krycia A, m | -0,12 → -0,13 [3/3] | B: 2,73 → -4,12 [3/3] |

## Role: tylko pomiar ruchu

Poniżej porównanie wersji przy tym samym ustawieniu roli, bez odejmowania neutralnego. Agregat obejmuje wszystkich zawodników grających wskazaną rolę, nie wyłącznie zmieniany slot. Nie opisuje udziału w kontaktach z dyskiem, jakości odbiorów ani przyczynowego efektu zamiany roli.

| Slot / poziom | Agregat roli A | Ruch, m/min zawodnika | Czas cutu, % ataku | Clearing, % ataku |
| --- | --- | --- | --- | --- |
| slot-0 / neutral | primary_handler | 153,51 → 150,40 [3/3] | 30,99 → 34,31 [3/3] | 17,28 → 19,16 [3/3] |
| slot-0 / reset_handler | reset_handler | 143,44 → 144,93 [3/3] | 20,11 → 21,15 [3/3] | 16,57 → 18,14 [3/3] |
| slot-3 / neutral | primary_cutter | 155,50 → 156,62 [3/3] | 34,85 → 36,67 [3/3] | 1,70 → 2,11 [3/3] |
| slot-3 / secondary_cutter | secondary_cutter | 160,41 → 156,92 [3/3] | 33,42 → 33,14 [3/3] | 1,75 → 1,90 [3/3] |
| slot-3 / continuation_cutter | continuation_cutter | 151,02 → 153,92 [3/3] | 28,74 → 32,09 [3/3] | 1,67 → 2,08 [3/3] |
| slot-3 / filler_cutter | filler_cutter | 134,72 → 135,64 [3/3] | 0,00 → 0,00 [3/3] | 0,00 → 0,00 [3/3] |

## Force: efekt obrony A względem neutralnego

Zmiana force A dotyczy przeciwnych rzutów B. Wartości procentowe są efektami treatment−neutral w pp.

| Force A | Konwersja B, pp | Rzuty break B, pp | Completion B, pp |
| --- | --- | --- | --- |
| force_backhand | 3,53 → 0,87 [3/3] | -5,76 → 1,10 [3/3] | 0,74 → 0,32 [3/3] |
| force_middle | -2,76 → -0,85 [3/3] | -34,22 → -24,34 [3/3] | -0,16 → -0,16 [3/3] |
| force_sideline | -1,59 → 6,91 [3/3] | -0,34 → 20,00 [3/3] | 0,37 → 1,33 [3/3] |
| force_straight | 0,38 → 0,91 [3/3] | -54,59 → -45,34 [3/3] | 0,93 → 1,03 [3/3] |

## Braki i ograniczenia

Komórki z choć jednym dopasowanym blokiem: 83/83; bez wspólnej pełnej pary: 0.
Wykluczone bloki: 3; niedopasowane kontrasty neutralne: 0.
Problemy globalne dopasowania: brak.
Sport obejmuje tylko kompletne poprawne pary w obu wersjach; poprawę awarii trzeba oceniać osobno na wszystkich zaplanowanych próbach. Liczba rzutów, klatek i sekund-zawodnika jest ekspozycją, nie liczbą niezależnych powtórzeń. Brak wind-context w tej kolejce nie został dopisany jako wykonany test.
