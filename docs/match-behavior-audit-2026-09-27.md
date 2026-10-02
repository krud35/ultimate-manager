# Audyt zachowań meczowych — 27.09.2026

Badany stan: bieżący katalog roboczy, wraz z zastanymi niezacommitowanymi zmianami silnika. Audyt nie zmienia kodu rozgrywki. Dodane skrypty i wyniki służą odtworzeniu pomiarów.

## Najważniejsze ustalenia

Silnik rzeczywiście symuluje ruch, role, formacje i preferencje podań. Największe ograniczenia udziału zawodników powstają jednak przed indywidualną decyzją: centralny wybór aktywnych cutterów może wykluczyć zawodnika zarówno z ruchu do podania, jak i z listy odbiorców. Są też niespójności między rolą wynikającą z aktualnego slotu i modyfikatorami zapisanej podroli oraz między geometrią handlerów i flagą resetu.

### 1. Niespójna rola po zmianie rodziny slotu — wysoki priorytet

`layoutToAgents` rozwiązuje podrolę z uwzględnieniem bieżącego slotu: zapisany `reset_handler` w slocie pierwszego cuttera staje się `primary_cutter`. Jednak `mergeTraitAndCoachMods` odczytuje bezpośrednio zapisaną mapę `playerSubRoles`, bez uwzględnienia slotu. W odtworzonym przypadku agent jest więc primary cutterem, ale dostaje mnożnik inicjacji cutów **0,12** i `preferDumpRole=true` pochodzące z reset handlera. To dotyczy sytuacji, gdy zapis i aktualna rodzina slotu są różne, np. zawodnik ma inną funkcję w siódemkach lub po zmianie formacji.

Źródła: `src/matchEngine/ai/actionSimulator.js:655`, `src/matchEngine/playerSubRoles.js:164`, `src/matchEngine/coachDirectives.js:726`, `src/matchEngine/playerMods.js:63`. Reprodukcja: `mechanisms.json → roleMismatch`.

Kierunek naprawy: ustalić jedną efektywną podrolę na aktualny skład i używać jej w ruchu, wyborze podania, rejestrze modyfikatorów oraz statystykach.

### 2. Continuation/filler tracą dobre okazje przez sztywną kolejkę — wysoki priorytet

`assignActiveCutters` nie dopuszcza continuation przed 1,2 s po chwycie (lub 4,5 s poza kontynuacją), a filler przed 6,5 s. Następnie szereguje zawodników według podroli i indeksu, bez oceny okna podania ani instrukcji `dominate`. Czas upłynięcia bramki nie gwarantuje miejsca, bo wyższe role nadal mają pierwszeństwo.

Równolegle `subRoleAllowsInitiateCut` dopuszcza continuation w reorganizacji i filler przy wyjątkowej okazji. Odtworzona scena z oknem 100/100 i separacją 12 m spełnia tę regułę, ale zawodników nadal wyklucza kolejka. Nieaktywny cutter wraca do ustawienia i jest odrzucany przez rzucającego jako `inactive_or_crossfield_stationary`. Ograniczenie liczby równoległych cutów staje się zatem również zakazem podania do wolnego gracza.

Źródła: `src/matchEngine/ai/activeCutters.js:4`, `src/matchEngine/ai/cutterBrain.js:722`, `src/matchEngine/ai/throwerBrain.js:791`, `src/matchEngine/playerSubRoles.js:284`. Reprodukcja: `mechanisms.json → eligibility`.

Kierunek naprawy: zachować limit tras, ale dopuścić wyraźną okazję i rozdzielić „może rozpocząć cut” od „może otrzymać podanie”. Instrukcja priorytetu powinna uczestniczyć w przydziale miejsc.

### 3. Wspólny cel resetu osłabia geometrię trzech handlerów — średni priorytet

W `layoutToAgents` zarówno primary handler, jak i reset handler dostają `isDump=true`. `formationStructuralTarget` obsługuje tę flagę przed rozgałęzieniem formacji, odsyłając wszystkich do wspólnej funkcji resetu. W horizontal stack z dyskiem w (40,18) i jednakowym losowaniem sloty handlerów 1 i 2 powinny wskazywać (40,12,75) oraz (40,24,25), ale z `isDump=true` oba wskazują (38,5,10).

To dowód zbieżności **bazowych celów**, nie dowód, że obaj zawodnicy zawsze stoją w jednym miejscu. Bieżące wyjścia do resetu, unikanie innych graczy i faza po pullu mogą rozdzielić ich ruch. Mimo to własne ustawienia handlerów dla horizontal/motion/zone są w tej gałęzi pomijane; również hex zachowuje podział handler–cutter zamiast w pełni wymiennych funkcji.

Źródła: `src/matchEngine/ai/actionSimulator.js:657`, `src/matchEngine/ai/tacticsBehavior.js:373`, `src/matchEngine/ai/offenseReorganization.js:88`, `src/matchEngine/offenseLineSlots.js:11`. Reprodukcja: `mechanisms.json → handlerSlots`.

Kierunek naprawy: oddzielić predyspozycję do resetu od konkretnego slotu resetowego i rozdzielać pozycje handlerów zgodnie z formacją.

### 4. Uproszczony wybór rzutu pomija preferencje przy wysokim stallu — średni priorytet

`pickThrowType` kończy się w gałęzi wysokiego stallu, zanim odczyta modyfikatory instrukcji i dyrektyw. W 1000 sparowanych losowaniach przy stallu 8 instrukcje `throw_hucks` i `no_hucks` dały **identyczne 1000 decyzji**, w tym po 121 hucków. Przy stallu 1 rozkłady były różne: 227 i 53 hucki, 177 zmienionych decyzji.

Ta obserwacja dotyczy funkcji wyboru typu rzutu w uproszczonym silniku, nie pełnej symulacji przestrzennej. Presja stallu może uzasadniać osłabienie rozkazów, ale tutaj wpływ na wybór typu znika całkowicie.

Źródło: `src/matchEngine/throwTypes.js:126`. Reprodukcja: `mechanisms.json → highStall`.

## Ruch zawodników

- Krok pełnej symulacji wynosi 20 ms. Pozycja i prędkość przechodzą pomiędzy rzutami; lot dysku i próba chwytu są częścią symulacji.
- Ruch uwzględnia maksymalną prędkość, przyspieszenie, zwrotność, hamowanie przed ostrym zwrotem, zmęczenie i cechy gracza. Przyspieszenie jest ograniczane jako długość wektora, więc bieg po skosie nie otrzymuje dodatkowej premii.
- Cutter przechodzi przez `WAITING`, `INITIATING_CUT`, `ACTIVE_CUT`, `CLEARING`. Cel biegu wynika z formacji, dostępnej przestrzeni, presji obrońców, postępu w stronę strefy i instrukcji deep/under. Po chwycie występuje reorganizacja i poszukiwanie kontynuacji.
- Obrońcy mają osobne stany marka, krycia cuttera, walki o dysk, powrotu i poachu. W person działają opóźnienie reakcji, odstęp krycia, ustawienie od under/deep i pomoc; obrona strefowa korzysta z celów wynikających ze slotów.
- Zawodnik bez statusu aktywnego nadal przemieszcza się do pozycji formacji. `WAITING` nie jest równoważne bezruchowi; obejmuje również rzucającego. Odsetka tych klatek nie należy interpretować jako czasu bezczynności cutterów.

Źródła: `src/matchEngine/ai/playerMovement.js`, `cutterBrain.js`, `defenderBrain.js`, `spaceMap.js`, `bodyTraffic.js`, `discIntercept.js`. W tym audycie sprawdzono kod i dane symulacji; nie wykonano oględzin animacji w interfejsie.

## Jakie rzuty występują

Silnik rozróżnia cztery klasy taktyczne, niezależnie od techniki i kształtu lotu:

| Klasa | Sposób klasyfikacji w pełnym silniku |
|---|---|
| Standard | Zwykłe podanie do przodu, które nie spełnia warunków pozostałych klas. |
| Dump/swing | Postęp do przodu poniżej 3 m, niezależnie od podroli odbiorcy. |
| Huck | Po przejściu powyższego warunku: postęp lub dystans lotu co najmniej 35 m. Długie podanie w bok może więc pozostać dump/swing. |
| Over the top | Wspólna kategoria hammer/scoober; warunki m.in. break side, 12–18 m, separacja ≥4 m, stall ≥2, wysoka umiejętność rzucającego i losowa bramka. |

Technika ma wartości `forehand` i `backhand`, powiązane z force, stroną podania oraz dominującą ręką. Hammer/scoober nie są osobnymi pełnoprawnymi technikami w tym enumie: overhead korzysta z odrębnego profilu i atrybutu hammer. Kształt lotu obejmuje łuk płaski/normalny/górą i krzywiznę prostą/naturalną/odwrotną. Sam wysoki łuk nie oznacza hammera. Pull ma osobną ścieżkę i nie jest uwzględniony w tabelach podań.

Rzucający ocenia percepcję i zasięg skanu, separację, ruch odbiorcy, dostępność punktu chwytu, ryzyko przechwytu, tłok, zysk terenu, reset, stall, wiatr oraz modyfikatory taktyczne. Pełna symulacja nie losuje wyłącznie etykiety rzutu. Uproszczony silnik używa wag i statystycznego rozstrzygnięcia; nie nadaje się do pomiaru rzeczywistych tras zawodników.

Źródła: `src/matchEngine/ai/throwerBrain.js:122`, `src/matchEngine/throwTechnique.js:7`, `src/matchEngine/ai/throwShape.js:104`, `src/matchEngine/ai/flightKinematics.js`.

## Role, formacje i dyrektywy

| Rola | Implementowana intencja |
|---|---|
| Primary handler | Preferowany początkowy rzucający, następnie opcja wsparcia/resetu. |
| Reset handler | Wcześniejsze szukanie resetu, zwiększona waga dumpa, mocno obniżona skłonność do inicjacji cutu. |
| Primary cutter | Pierwszeństwo i zwiększona częstość inicjowania wyjść. |
| Secondary cutter | Drugie pierwszeństwo i umiarkowane zwiększenie aktywności. |
| Continuation cutter | Oferty po chwycie i bardzo dobre okna, z opisanym wcześniej dodatkowym ograniczeniem kolejki. |
| Filler cutter | Wypełnienie struktury i wyjątkowe okazje; w praktyce bardzo ograniczony udział. |

| Formacja | Handlery | Limit aktywnych cutterów | Główna odmienność |
|---|---:|---:|---|
| Vertical | 2 | 2 | Środkowy stack, pasy open/break. |
| Horizontal | 3 | 3 | Cutters w poprzek, większa preferencja głębokiej gry. |
| Split | 2 | 2 | Dwie grupy, przestrzeń do izolacji. |
| Side | 2 | 1 | Izolacja jednego cuttera, reszta po przeciwnej stronie. |
| Motion | 3 | 3 | Bliskie oferty wokół dysku, silna preferencja kontynuacji. |
| Hex | 2 | 3 | Cele wokół dysku po sześciokącie, nadal strukturalne role. |
| Zone offense | 3 | 2 | Handlerzy, popperzy i skrzydła; preferencja swingów. |

Limit oznacza miejsca dla zawodników niebędących rzucającym ani dumpem, nie całkowitą liczbę biegnących osób. Niektóre role nie są jeszcze uprawnione do zajęcia miejsca mimo wolnej pojemności.

Instrukcje indywidualne nadpisują odpowiadające im osie dyrektyw, zamiast zwyczajnie się z nimi sumować. Siła podporządkowania jest skalowana znajomością systemu i cechami osobowości; nie jest bezwzględnym zakazem. Osobne zestawy O-Line/D-Line wybierane są według roli na początku punktu i pozostają właściwe dla tej linii po stracie/przechwycie. Aktualna faza ataku/obrony nadal zmienia używane modyfikatory zachowania.

Dyrektywy mają połączenia z głębokością podań, breakiem, selektywnością, tempem, głębokością stacka, odstępem i ustawieniem krycia, kształtem marka, poachem i asekuracją deep. Instrukcja `dominate` rzeczywiście zwiększa zasięg skanowania i liczbę dostrzeganych opcji przez rejestr modyfikatorów zawodnika; potwierdzono wzrost o 2,178 m i jedną opcję w kontrolowanej próbie. Jej wpływ na rozpoczęcie cutu ogranicza wcześniejszy przydział aktywnych miejsc.

## Pomiary i ograniczenia

Zakończono **28 meczów do 5 punktów**: 7 formacji × 4 seedy, razem **4084 próby rzutu** i **10 533 040 próbek zawodnik–klatka**. W odczytanych współrzędnych i prędkościach nie wykryto NaN ani nieskończoności; najwyższa zarejestrowana prędkość wyniosła 7,06 m/s. To kontrola poprawności danych, nie dowód braku kolizji, nienaturalnych tras lub błędów animacji.

Przesiew instrukcji i dyrektyw objął **208 meczów do 3 punktów**: 22 instrukcje + 24 warianty dyrektyw + 6 neutralnych baseline, po 4 mecze. Osiem instrukcji i osiem wariantów dyrektyw przekroczyło heurystyczny próg zmiany we właściwym kierunku. Pozostałe wyniki są nierozstrzygające; część ma efekt przeciwny do oczekiwania. Ta krótka próba nie wystarcza do uznania wszystkich pozostałych ustawień za niedziałające. Ujemny wariant poachResetHandler jest z założenia obcinany do zera, a pojedyncza metryka poachu nie opisuje całej dyrektywy creativity.

Przykłady zmierzonych różnic: `play_slow` wydłużyło czas do rzutu o około 781 ms względem skorygowanego baseline; `tight_mark` zmniejszyło odstęp krycia o 0,29 m; `poach` zwiększyło udział czasu w stanie poachu o 3,45 pp. Dyrektywa `markShape` zmieniła kąt marka o −5,40° i +7,90° na przeciwnych biegunach. W ustawieniach formacji udział hucków wyniósł 0,4% w vertical, 4,1% w horizontal i 4,4% w hex. Filler był odnotowany jako odbiorca tylko 2 razy na 528 prób vertical i ani razu na 606 prób side stack. Liczby udziału ról nie są znormalizowane przez czas gry lub dostępne okazje.

Pełne tabele: [measurements.md](../artifacts/match-behavior-2026-09-27/measurements.md). Surowe dane: `matches.json`, `settings.json`, `mechanisms.json`, agregaty `summary.json` w tym samym katalogu. Wyniki krótkich meczów są opisem tej próby; nie są oszacowaniem ligi, realizmu sportowego ani przewagi formacji.

Istniejący `scripts/check-player-behavior.mjs` przerwał na linii 20: oczekuje 33 atrybutów, aktualny model ma 34. Nie można zgłaszać zaliczenia jego późniejszych kontroli fizyki. Dedykowane reprodukcje powyższych mechanizmów zakończyły się poprawnie. Zebrane zdarzenia nie przechowują bezpośrednio `plannedShape`, więc pola arc/curve w pierwszym pomiarze są oznaczone jako unknown; nie należy wyciągać z nich proporcji kształtów lotu.

Zalecana kolejność dalszej pracy: ujednolicić efektywną podrolę; oddzielić aktywność cutu od dostępności do podania; rozdzielić cele handlerów; ujednolicić wpływ rozkazów pod presją stallu; odświeżyć test atrybutów. Następnie powtórzyć porównania z większą liczbą pełnych meczów, normalizacją udziału przez czas na boisku i liczbę dostępnych okazji oraz osobnymi scenami przeciw obronom strefowym.
