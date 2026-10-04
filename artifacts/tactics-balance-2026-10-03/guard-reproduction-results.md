# Reprodukcje guardów i alarmów ruchu po 06:00

Zakończono 9 pełnych meczów diagnostycznych: wszystkie 6 meczów z twardym błędem oraz 3 mecze z alarmem ruchu. Źródła silnika i support importowane wyłącznie z niezmienionego `artifacts/engine-audit/tactics-balance-2026-10-03-v2/snapshot`. Maksymalnie dwa procesy równocześnie; ostatni zakończył się około 06:12 Europe/Warsaw. **9/9 zgodnych fingerprintów, pointOutcomes, metryk obu stron, hardErrors i liczników fallback RNG.** To dokładne reprodukcje, nie nowe niezależne próbki balansu.

Nowe artefakty: `artifacts/engine-audit/tactics-balance-2026-10-03-diagnostics/`. `PROVENANCE.json` zapisuje wersję kopii i hashe; każdy `*-validation.json` porównuje wynik z oryginałem. `*-point-summary.json` zapisuje powód każdego gola i liczniki zdarzeń. `diagnostic-points/<job>/point-XX.json` zachowuje metadane wszystkich zdarzeń punktu z guardem, ostatnie 512 skanów decyzji i klatki końcowych 24 prób rzutu co 100 ms. `GUARD-ANALYSIS.json` zawiera policzone sekwencje. Wewnętrzny licznik iteracji nie jest eksportowany przez silnik; nie mylić liczników eventów z liczbą iteracji.

## Guardy: potwierdzone punkty i przebieg

Wszystkie sześć zakończyło się **`throw_limit`, dokładnie po 120 próbach rzutu**. Nie są to przypadki wyczerpania budżetu przez odmowy rzutu lub stalle.

| Mecz | Seed | Kontekst HEX vs obrona | Punkt | Celne / straty | Rzuty HEX / resety HEX |
|---|---:|---|---:|---:|---:|
| matrix-00028-configured-a | 100301502 | wall, 0 mph | 13 | 118 / 2 | 104 / 63 |
| matrix-00062-configured-a | 100301501 | cup, 24 mph / 270° | 24 | 104 / 16 | 84 / 46 |
| matrix-00063-configured-a | 100301502 | wall, 24 mph / 180° | 8 | 116 / 4 | 114 / 71 |
| matrix-00063-configured-b | 100301502 | wall, 24 mph / 180° | 3 | 112 / 8 | 99 / 62 |
| matrix-00254-configured-a | 100311502 | wall, 0 mph | 9 | 115 / 5 | 100 / 62 |
| matrix-00254-configured-b | 100311502 | wall, 0 mph | 17 | 119 / 1 | 110 / 67 |

Przykłady stagnacji: `00028` ma ciąg 89 celnych podań HEX, z czego 57 resetów, od próby 32 do 120; zaczyna przy x=56,12, dochodzi do x=73,99, kończy przy x=35,41 mimo ataku w dodatnim kierunku X. `00254-b` ma 109 celnych podań HEX bez straty, 66 resetów, zanim pojawi się jedyna strata; `00254-a` ma serię 84 celnych podań i 52 resetów. `00062` przy silnym bocznym wietrze zawiera więcej zmian posiadania, więc nie należy opisywać go jako jednej długiej bezbłędnej pętli.

W końcowych 512 skanach `00028` wybrano opcję w 385 skanach; 285 wyborów miało ujemny forwardProgress. To kolejne obserwacje tych samych akcji, **nie 385 osobnych rzutów**. W 15 skanach wybrano opcję cofającą mimo zapisanej innej, osiągalnej opcji z postępem >=3 m. Przykład serial 1264: `requireForwardPass=true`, hardStallCount=1, próg 80,023; wybrano p5 (-4,416 m, score 185,37), choć p13 miał +5,881 m, score 145,59, reachable=true. Nie dowodzi to automatycznie złej decyzji w każdej takiej sytuacji: opcja cofająca miała wyższą ocenę, a reachable nie jest gwarancją bezpieczeństwa rzutu. Potwierdza jednak, że pod koniec nie brakowało absolutnie wszystkich możliwych ofert do przodu.

## Potwierdzone mechanizmy wymagające naprawy

**Rzeczywisty chwyt jest ponownie przeliczany na sztuczny postęp.** Frozen `point.js:943` wywołuje `computeThrowAdvance` po uzyskaniu faktycznego catchPoint z symulacji lotu. Frozen `throwTypes.js:291–303` następnie stosuje mnożniki obrony i wiatru, ucina cofnięcie do -8 m i zaokrągla pozycję do całych metrów. Przy kolejnym rzucie `actionSimulator.js` ustawia rzucającego na ponownie wyliczonym discX. Y pozostaje zgodne z faktycznym chwytem, X może przeskoczyć.

Dowód w `00028` punkt 13: throw_success event 1233 ma catchPoint x=58,35119295394309, y=35,23557270160623; następny throw_attempt event 1234 ma releasePoint x=63,06243324085136, dokładnie ten sam Y. Skok wynosi **4,711 m** bez ruchu zawodnika z dyskiem. W tym punkcie suma podpisanych różnic X między chwytem a następnym wypuszczeniem wynosi +56,47 m. To także wyjaśnia, dlaczego suma geometrycznych dystansów udanych podań nie zgadza się z różnicą pierwszej i ostatniej pozycji serii; nie interpretować tej rozbieżności jako samego ruchu cutterów.

Zalecenie: pełny silnik powinien ustalać `discPosition` bezpośrednio z `discPositionFromFieldMeters(catchPoint.x, geo(possession))`, zachowując zmianę stron co punkt. Nie stosować drugi raz pogody i obrony do już rozegranego fizycznego chwytu. Tabelaryczne `computeThrowAdvance` pozostaje właściwe dla fastMode lub wyraźnej ścieżki bez geometrii. Regresja powinna sprawdzać ciągłość catch→następny thrower dla obu kierunków ataku, obu parzystości punktu, cofnięcia ponad 8 m i różnych warunków wiatru. To potwierdzona wada fizyki, ale nie jedyna przyczyna słabej progresji HEX.

**Zamierzona eskalacja decyzji po podaniach bez postępu nie dociera do AI.** Frozen `point.js:458–495` liczy `effectiveDecisionStall(realStall, resetChain)` i przekazuje wynik jako `stallCount` do `runThrowMotionSimulation`. Tam parametr jest niewykorzystywany poza domyślną wartością hardStallCount; `actionSimulator.js:1163` zastępuje go `Math.max(1, liveStall)`. Jawnie przekazany hardStallCount zachowuje realny stall, więc wzrost z resetChain znika. `requireForwardPass` dochodzi osobno do skanera, lecz dump pozostaje wyjątkiem od filtra; seria może dalej składać się z cofających resetów. W przykładzie serial 1264 `requireForwardPass=true` oznacza co najmniej trzy podania bez postępu, ale próg nadal wynosi 80,023 przy realnym stallu 1; zamierzony effectiveDecisionStall dla (1,3) to 7.

Zalecenie: jawnie rozdzielić rzeczywisty zegar od presji decyzyjnej wynikającej z resetChain. Przekazać chain/offset do symulatora i stosować go wyłącznie do oceny decyzji. Po przywróceniu eskalacji trzeba poprawić również `scanThrowOptions` callsite: hardStallCount ma odzwierciedlać liveStall, nie `Math.max(hardStallCount, decisionStall)`, żeby sztuczna presja nie znosiła ograniczeń echo/no_progress ani fizycznie nie skracała stall count. Sprawdzić efekt reprodukcją i osobnymi seedami. Samo przywrócenie martwej ścieżki nie dowodzi, że wszystkie guardy znikną.

**Guard przyznaje sztuczny punkt.** Frozen `point.js:1137–1146` wybiera scorer na podstawie discPosition >=50, a nie faktycznego chwytu w polu punktowym; analogiczna ścieżka występuje w fastMode. To potwierdzony problem reprezentowania awarii. Nie podnosić limitu tylko po to, by ukryć stagnację, i nie traktować takich punktów jako normalnej konwersji. Wyniki wszystkich sześciu meczów oraz odpowiadających im par pozostają wyłączone z estymacji balansu.

## Alarmy ruchu: trzy konkretne skoki przy aktywacji

Wszystkie trzy odtworzone alarmy dotyczą **continuation_cutter**, stanu WAITING i przełączenia `isActive:false→true` przy 4400→4500 ms. Zapis `*-motion-alarms.json` zawiera pełne dwie klatki, zawodnika, dt, dystans i ID eventu. Są to skoki wewnątrz jednej akcji, niezależne od opisanej wyżej nieciągłości pozycji dysku między akcjami.

| Mecz | Punkt / event | Gracz | Pozycja 4400→4500 ms | Dystans w 100 ms |
|---|---|---|---|---:|
| interaction-00222-low-b | 18 / 559 | development-balanced-0-b-p4 | y=-1,5109→0,5 | 2,0136 m |
| instruction-00414-shade_under-a | 18 / 859 | development-balanced-1-a-p9 | x=102,5789→99,5 | 3,0796 m |
| force-00667-configured-b | 3 / 102 | development-balanced-2-a-p9 | y=-1,4692→0,5 | 1,9697 m |

Przed skokiem prędkość jest już skierowana do środka i cel leży w boisku. Frozen `cutterBrain.js:776–782` zwraca ruch nieaktywnego cuttera przed końcowym clampem. Po aktywacji continuation przy 4500 ms (`activeCutters.js:31`) zawodnik przechodzi przez końcowy `clampAgentPosition` (`cutterBrain.js:1180`), który natychmiast przenosi go z istniejącej pozycji poza linią do 0,5/99,5. To wspólny błąd ciągłości ruchu, nie dowód wpływu shade_under czy force_straight.

Zalecenie: ruch zawodnika wracającego z legalnego wybiegu poza pole musi pozostać ciągły. Ograniczanie celu nie powinno teleportować istniejącej pozycji. Samo dodanie clampu do wszystkich early-returnów może jedynie przenieść skok na wcześniejszą klatkę; regresja musi zaczynać zawodnika poza linią i sprawdzać płynny powrót przed i po zmianie aktywności.

## Granice wniosków

Reprodukcje potwierdzają fizyczne błędy, martwą ścieżkę anty-pętli i rzeczywistą stagnację. Nie wykazano jednego błędnego waypointu wyjaśniającego wszystkie mecze HEX ani podstaw do stałego bonusu przeciw strefie. Selekcja sześciu znanych awarii nie służy do estymowania częstości guardów po poprawce. Zmiany balansu ocenić na osobnych seedach i pełnych parach; ponownie sprawdzić progresję, zachowanie resetu jako opcji ratunkowej, wiatr i aktualny plan kariery. Etap reprodukcji nie zmieniał źródeł produkcyjnych, snapshotu ani limitu rzutów.

## Wdrożenie presji decyzyjnej i regresja

Po reprodukcjach naprawiono wyłącznie martwą ścieżkę presji w `src/matchEngine/ai/actionSimulator.js`. Symulator zachowuje dodatni offset pomiędzy przekazanym `stallCount` i bazowym `max(1, hardStallCount)`, dodaje go do rosnącego zegara decyzji i ogranicza wynik do 9. Skaner otrzymuje jako `hardStallCount` wyłącznie rzeczywisty `liveStall`, włącznie z zerem bez legalnego markera. Rzeczywisty zegar nadal rozstrzyga stall-out, ograniczenia echo/no_progress oraz stall zapisany w wykonanym rzucie. Nie zmieniono limitu prób ani mechanizmu sztucznego punktu; zachowano współbieżne poprawki poach/force w tym pliku.

`node scripts/test-reset-decision-pressure.mjs` — PASS. To deterministyczne pojedyncze akcje pełnego symulatora, bez uruchamiania dodatkowych meczów. Test obejmuje brak offsetu (także starsze wywołanie bez jawnego hardStall), przekazanie offsetu do rzeczywistej oceny, wzrost presji z biegnącym czasem, legalny limit i brak markera. W kontrolowanym układzie próg przy rzeczywistym stallu 1 zmienił się z 81,23 do 20,07224 po trzech resetach. W drugim układzie dwa resety przesunęły pierwszy zatwierdzony rzut z 2600 do 1060 ms i zmieniły odbiorcę z 1007 na 1005; zapisany rzeczywisty stall wynosił odpowiednio 3 i 2. To dowód wpływu na decyzję i moment rzutu, nie tylko na wartość helpera.

Przy czterech resetach i celowym anulowaniu wykonania rzutów rzeczywisty limit nadal następuje dokładnie po 9000 ms przy stallu 10; start z rzeczywistym 10 kończy akcję przed skanem. Bez legalnego markera skaner i wykonane decyzje zachowują realne 0. Przy wirtualnym 9 i realnym 1 konkretna krótka oferta pozostaje odrzucona przez echo/no_progress, natomiast realny 8 zgodnie z regułami odblokowuje te bramki. Celowany ESLint dla zmienionego pliku i nowego testu — PASS.

Te regresje potwierdzają działanie naprawionej ścieżki i oddzielenie presji od legalności. Nie rozstrzygają jeszcze, czy wzrosła konwersja HEX ani czy zniknęły guardy; potrzebne są zaplanowane pełne pary na osobnych seedach oraz odtworzenie znanych awarii po całym zestawie poprawek.

## Kolejne pętle w candidate-v1 i priorytet bezpiecznej progresji

Odczytano cztery zapisane nieukończone punkty z `candidate-v1/reproduction/diagnostic-points`; żadnych nowych meczów w tej analizie. Zestawienie znajduje się w `candidate-v1-guard-summary.json`, a skrypt odczytu w `analyze-candidate-guards.mjs` w tym samym katalogu co ten raport. Są to wybrane reprodukcje awarii, nie próba do estymacji częstości.

Najmocniejszy przypadek: `matrix-00063-configured-a`, punkt 14, zawiera 120 celnych podań HEX bez straty, 67 resetów i **-19,19 m netto**. Mediana trzymania dysku to 360 ms. W zdarzeniach jest 88 natychmiastowych odbić A→B→A, a najdłuższy ciąg kolejnych odbić liczy 53. W ostatnich 512 skanach 311 ma `requireForwardPass=true`; 135 z tych skanów wybiera postęp <2,5 m. W 34 spośród tych 135 istnieje inna oferta >=2,5 m, fizycznie oznaczona jako `reachable`, z oceną ponad progiem akceptacji. Przykład serial 274, realny stall 1: dump -0,88 m / score 159,07 wygrywa z osiągalnym cutterem +4,23 m / score 150,33, próg wynosi 18. Są to wielokrotne skany akcji, nie 135 osobnych rzutów.

Przyczyna semantyczna: dump był wyjątkiem od odrzucania `no_progress`, ale po przejściu filtrów nadal wygrywał zwykły ranking, nawet jeśli wymagany postęp był bezpiecznie dostępny. Przywrócona presja decyzyjna obniżała też próg i czas wypuszczenia resetu. Naprawa w `throwerBrain.js` nie zmienia wag ani limitu percepcji: przy `requireForwardPass` i realnym stallu <8 wybiera najpierw zaakceptowaną, fizycznie osiągalną ofertę >=2,5 m **z tego samego dostrzeżonego zbioru**. Zaakceptowany dump jest zachowany jako opcja awaryjna, jeśli żadna taka oferta nie przejdzie walidacji. Realny stall >=8 oraz `requireForwardPass=false` zachowują zwykły ranking. Kopia tablicy roboczej utrzymuje komplet diagnostycznych opcji także po odłożeniu resetu.

`node scripts/test-tactics-forward-priority.mjs` — PASS: produkcyjny `scanThrowOptions`, oba kierunki ataku i obie ręczności; identyczne oceny i geometria przy zmianie samego priorytetu; reset przy kryciu, niedostępnej fizycznie ofercie, braku ofert lub ograniczeniu percepcji; brak decyzji przy całkowitym wyczerpaniu opcji. Osobny przypadek sprawdza zachowanie resetu po tym, gdy pozostała oferta dostaje -Infinity podczas walidacji, oraz widoczny forward poza nieposzerzonym `perceivedOptionLimit`. Regresja presji `test-reset-decision-pressure.mjs` i celowany ESLint — PASS. Nie zmieniono snapshotu candidate-v1.

To nie jest pełne wyjaśnienie każdej stagnacji: w `00028` punkt 6 tylko 20/464 skanów HEX miało wymaganą progresję i żaden ich wybór nie złamał tego warunku. W tym samym punkcie 32 kolejne celne podania (27 resetów) tracą netto 25,10 m. Bieżący `resetChain` zeruje się po pojedynczym odzyskaniu >=2 m, więc para cofnięcie–częściowe odzyskanie może nie zostać rozpoznana jako stagnacja. Ten licznik nie został tutaj zmieniony. Równoległa analiza geometrii slotów HEX ma oddzielny zakres; efekty zestawu poprawek wymagają kolejnej pełnej walidacji.
