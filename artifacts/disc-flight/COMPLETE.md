# Ultimate Manager — dysk, przestrzeń i zachowanie zawodników

Stan: 9 września 2026. Raport zamykający prace od geometrii dysku do szczegółowych atrybutów i decyzji. Starsze REPORT.md, STAGE2.md i STAGE3.md dokumentują kolejne stany kodu; ich sekcje „pozostaje” nie opisują w całości obecnego stanu.

## Ocena

Największym problemem była niespójność między decyzją, możliwościami fizycznymi i rozstrzygnięciem. Rzucający oceniał inną sytuację niż później realizował lot; zawodnicy przeceniali czas dobiegu, a abstrakcyjny wynik podania mógł zastępować rzeczywisty kontakt. Poprawki usuwają te sprzeczności. Obecny model daje zawodnikom wyraźnie sensowniejsze podstawy rozumienia przestrzeni, ale pozostaje przybliżeniem gry, z istotnym udziałem reguł i losowości.

Nie uznaję kalibracji realizmu za zakończoną. Zbliżenie fast i pełnego silnika nie dowodzi zgodności z prawdziwym ultimate. W pomiarach nadal występuje za wiele strat względem przyjętych roboczo oczekiwań oraz różnice struktury podań między trybami. Zakres 90–93% celnych podań czy 70–85% hold jest hipotezą do sprawdzenia na danych zawodów, a nie potwierdzoną normą.

Kod konfiguracji opisuje boisko 100 × 37 m, strefy po 18 m, siedmiu graczy, stall do 10 i mecz do 15 punktów. Dane źródłowe rosterów UFA nie oznaczają tutaj symulacji przepisów zawodowej ligi UFA.

| Obszar | Ocena obecnego modelu | Zmiana praktyczna |
|---|---|---|
| Lot i kontakt | Spójniejsza geometria; aerodynamika nadal uproszczona | Wspólny tor planowania i wykonania, kontakt w rzeczywistym czasie, dalszy lot niezłapanego dysku |
| Ruch | Wspólne ograniczenia fizyczne obu stron | Przyspieszenie, hamowanie, skręt i zmęczenie zamiast premii szybkości od umiejętności taktycznej |
| Atak bez dysku | Ocena przyszłej przestrzeni, nadal lokalna | Czas dobiegu, rezerwowane miejsca kolegów, koszt przecinania tras, clearing i ponowne rozważanie cutu |
| Rzucający | Oddzielona percepcja, wybór i wykonanie | Ocena dostępnego czasu odbiorcy, ryzyka toru, stalla, poprawki na wiatr i trudności rzutu |
| Obrona | Ustawianie i reakcja mają własne przyczyny | Pozycjonowanie, force, poach, koszt obrotu, opóźnienie reakcji; umiejętność obrony nie zwiększa Vmax |
| Atrybuty | 33 wartości o bardziej rozdzielonych rolach | 13 nowych pól; trzy stare szerokie umiejętności ruchowe nadal wymagają ostrożnej interpretacji |
| Fast | Model zastępczy, nie symulacja przestrzenna | Wspólne nowe atrybuty w wykonaniu i separacji, osobna korekta trudności i długości podań |

## Dysk: co faktycznie zostało zmienione

1. **Plan i wykonanie korzystają z tego samego modelu toru.** Wykonanie dokłada błąd rzutu i kontroli łuku. Krzywizna uwzględnia technikę oraz dominującą rękę. Rzucający porównuje prześwit, stronę dolotu, czas zawisu i trudność wykonania.
2. **Wiatr jest liczony względem ruchu dysku.** Kierunek wiatru w kodzie jest kierunkiem wektora przepływu. Siła nośna i opór zależą od prędkości powietrza względem dysku; odpowiedź obejmuje także wysokość, nie tylko przesunięcie X/Y. Jednostki mph/m/s są normalizowane z jednoznacznym pierwszeństwem speedMph. Lekki wiatr nie jest całkowicie wyłączony, a długi dump nie dostaje odporności tylko przez etykietę rzutu.
3. **Rzucający kompensuje przewidywany dryf.** windControl steruje wielkością poprawki celowania oraz błędami wykonania. Poprawka jest przybliżeniem na podstawie przewidywanego końca lotu; nie jest idealnym rozwiązaniem odwrotnym ani dodatkowym przesunięciem odbiorcy.
4. **Niezłapany dysk leci dalej.** Osiągnięcie planowanego punktu dostarczenia nie oznacza automatycznego chwytu ani zniknięcia dysku. Dalszy lot zachowuje pozycję i prędkość, podlega grawitacji, nośności i oporowi do kontaktu z ziemią. Obliczenia mają limit bezpieczeństwa 12 sekund po nominalnym końcu.
5. **Kontakty mają kolejność czasową.** Sprawdzany jest odcinek ruchu dysku i zawodnika między klatkami. Chwyt lub blok wymaga realnego kontaktu, a zdarzenia i ślad ruchu korzystają z tego samego rozstrzygnięcia. Zasięg uwzględnia aktualnie wykonany wyskok.
6. **Dysk może złapać inny atakujący.** Poza rzucającym sprawdzani są wszyscy atakujący. Statystyka udanego odbioru przypada faktycznemu łapiącemu; zapis zachowuje również intendedReceiverId. Prosta kontrola pozycji ciała odrzuca chwyt spoza boiska.
7. **Odbiorca może poczekać na łatwiejszy chwyt.** Jeżeli za chwilę dysk znajdzie się bliżej środka zasięgu i nie ma bezpośredniej presji obrony, nie musi próbować na pierwszym możliwym kontakcie z granicą zasięgu. Pod presją próbuje od razu.

Struktura sił wykorzystuje standardowy podział na nośność i opór zależne od względnej prędkości; kontekst badawczy: [Study on Improved Flight Coefficient Estimation and Trajectory Analysis of a Flying Disc through Onboard Magnetometer Measurements](https://pmc.ncbi.nlm.nih.gov/articles/PMC6210097/). Współczynniki w grze są przybliżeniem, nie parametrami dopasowanymi do pomiarów konkretnego dysku. Nominalny tor nadal jest kinematyczny: profil wysokości, tempo postępu i krzywizna są zadane, a wpływ wiatru jest tłumioną poprawką. Pełna integracja sił dotyczy końcówki po planowanym punkcie dostarczenia. To model hybrydowy, nie pełna aerodynamika 6-DOF.

Pozostają: stała orientacja dysku zamiast momentów obrotowych i ewolucji spinu, uproszczony overhead, brak lokalnych podmuchów przestrzennych. Po nieudanym kontakcie działa końcówka balistyczna; nie ma ponownych chwytów po bobble ani realistycznego odbicia od dłoni. Nie ma poziomego layoutu z ułożeniem ciała. Kontrola boiska nie zastępuje pełnych reguł pierwszego kontaktu z podłożem i lądowania po wyskoku.

## Jak zawodnik podejmuje decyzję

**Rzucający:** skanuje ograniczoną liczbę opcji w zasięgu wynikającym z vision. Ocenia zysk pola, szansę punktu, separację, linię boczną, open/break side, ryzyko toru i stall. decisionMaking wpływa na rozpoznawanie ryzyka i błąd oceny, composure na presję. Czas decyzji zależy od sytuacji, a nie tylko jednej stałej zwłoki. Dla punktu dostarczenia porównuje czas lotu z czasem dobiegu odbiorcy, uwzględniając jego prędkość, kierunek, rozpędzanie i skręt. Wybrany kształt jest dodatkowo oceniany pod kątem przewidywanego spóźnienia odbiorcy. Potem technika, touch, releaseControl, power, morale, zmęczenie i wiatr wpływają na wykonanie.

**Cutter:** ocenia dostępność miejsca, korytarz podania, przyszłą zajętość przez kolegów, zysk i czas dobiegu. Przewidywane przecięcie tras w najbliższych dwóch sekundach obniża ocenę, mocniej przy lepszej orientacji przestrzennej. Ruch kolegów trafia do tej oceny jako rzeczywiste vx/vy. Timing, znajomość systemu, instrukcje i liczba aktywnych cutterów wpływają na rozpoczęcie. Cut jest ponownie oceniany co około 300 ms; istnieją progi zmiany celu, rezygnacji i clearingu. Deep cut ma okres zaangażowania, więc zawodnik nie zawraca natychmiast po ruszeniu.

**Handler/reset:** wybór roli, dostępności i miejsca resetu korzysta z układu kolegów, podroli, odległości i mapy przestrzeni. Zastany atrybut handlerMovement ma duży udział w doborze składu/podroli; nie należy interpretować go jako osobnego fizycznego modelu footworku resetowego. To jeden z obszarów do dalszego rozdzielenia.

**Obrońca:** dobiera odstęp przez positioning, reaguje na zmianę kierunku i kosztuje go obrót ciała. Force i instrukcje określają bronioną stronę. Ocena zagrożonej przestrzeni jest odświeżana co 250 ms, zamiast nowego losowania co klatkę. Poach porównuje przewidywane możliwości przechwytu. Marking wpływa na dokładność ustawienia marka i utrudnienie wypuszczenia. Prędkość maksymalna pochodzi z fizycznego speed, cech i energii, nie z poziomu krycia.

**Gracz w locie dysku:** szuka najwcześniejszego osiągalnego punktu toru, a jeśli żadnego nie znajduje, wybiera próbę o najmniejszym spóźnieniu. Początkowo korzysta z planowanego toru; reakcje, anticipation i właściwe dla strony discReading sterują przejściem do odczytu rzeczywistego lotu. Plan jest aktualizowany co około 200 ms. Nie gwarantuje chwytu: decydują rzeczywisty dobieg, kontakt i wykonanie.

**Fizyka ruchu:** obie strony mają ten sam integrator. speed odpowiada za Vmax, acceleration za rozpędzanie, agility i balance za skręt oraz kontrolę nawrotu. Limit przyspieszenia dotyczy długości wektora, więc bieg po skosie nie daje premii wynikającej z osi boiska. Przybliżony czas dobiegu używa tych samych parametrów, ale nie symuluje krok po kroku całej przyszłej trasy.

## Wszystkie 33 atrybuty

Nowe pola oznaczono **nowy**. Wartości nadal korzystają z dotychczasowych zakresów kategorii; nie wprowadzono rewolucji skali 0–100 ani przelosowania zapisanych zawodników.

| Kategoria / atrybut | Znaczenie i obecny wpływ |
|---|---|
| Rzut — backhand | Jakość techniki backhandu, udział w kontroli lotu i wyborze techniki |
| Rzut — forehand | Jakość forehandu, technika na open/break side i kontrola lotu |
| Rzut — huck | Umiejętność długiego podania, jakość/łuk głębokiego rzutu; nadal częściowo łączy dystans i technikę |
| Rzut — hammer | Wykonanie overhead/hammer; nie jest osobnym modelem aerodynamiki odwróconego dysku |
| Rzut — power, **nowy** | Dystans bez dodatkowej kary celności: kara rośnie powyżej 20 + 0,4 × power metrów; nie zwiększa automatycznie prędkości każdego rzutu |
| Rzut — touch, **nowy** | Wyczucie podania: udział w jakości wykonania łuku i rzutu oraz dozowaniu tempa w ścieżce dobierającej je przy wypuszczeniu |
| Rzut — releaseControl, **nowy** | Powtarzalność wykonania łuku/krzywizny i udział w celności |
| Rzut — windControl, **nowy** | Poprawka celowania na wiatr, ograniczenie kar wykonania i trudności pogodowej |
| Fizyczne — speed | Prędkość maksymalna; fast uwzględnia ją w oszacowaniu separacji |
| Fizyczne — endurance | Koszt wysiłku, utrzymywanie energii i regeneracja przez istniejący model staminy |
| Fizyczne — agility | Zmiana kierunku, plant i część kosztu wysiłku |
| Fizyczne — jump | Wysokość wybicia i możliwości gry w powietrzu; nie zmienia długości ramion |
| Fizyczne — acceleration, **nowy** | Rozpędzanie i planowany czas dobiegu; w fast także separacja |
| Fizyczne — balance, **nowy** | Kontrola zmiany kierunku wraz z agility; bez fikcyjnego zwiększania Vmax |
| Mentalne — vision | Zasięg skanu, liczba dostrzeganych opcji, czytanie korytarzy i czas percepcji |
| Mentalne — composure | Presja stalla, spokój decyzji i wykonania |
| Mentalne — reactions | Opóźnienie reakcji obrońcy, rozpoczęcie ruchu i odczytu błędu lotu |
| Mentalne — decisionMaking | Błąd oceny, rozpoznanie ryzyka i czas wyboru podania |
| Mentalne — anticipation, **nowy** | Rozpoznanie momentu cutu i rzeczywistego lotu; w fast udział w separacji |
| Mentalne — spatialAwareness, **nowy** | Percepcja wolnej/zarezerwowanej przestrzeni, ruchu kolegów i tłoku |
| Atak — cutterMovement | Dobór geometrii/kąta cutu, rola i szeroka ocena umiejętności; nie mnoży fizycznej szybkości |
| Atak — handlerMovement | Głównie dobór składu/podroli oraz agregaty; ograniczony bezpośredni wpływ na bieżącą geometrię resetu |
| Atak — offensiveSystemsKnowledge | Ustawienie w strukturze, dokładność slotu, czytanie mapy i priorytet cutu |
| Atak — catching | Prawdopodobieństwo opanowania dysku po osiągalnym kontakcie, trudność chwytu i próby w powietrzu |
| Atak — cutTiming, **nowy** | Priorytet/moment oferty oraz przewaga odbiorcy w oszacowaniu fast |
| Atak — discReading, **nowy** | Tempo odczytu rzeczywistego toru przy dobiegu do chwytu |
| Obrona — defensiveCutterMovement | Dobór składu i agregaty; dawne zwiększanie sprawności ruchowej zastąpiono fizyką i positioning. Zachowane pole kompatybilności |
| Obrona — defensiveHandlerMovement | Ocena specjalizacji w składzie i presja w istniejącym modelu stalla; nie jest już mnożnikiem prędkości pościgu |
| Obrona — defensiveSystemsKnowledge | Czytanie przestrzeni i rozumienie ustawienia obronnego |
| Obrona — blocking | Wykonanie kontaktu obronnego, blok i próba zagrania w powietrzu |
| Obrona — positioning, **nowy** | Odstęp od krytego zawodnika i udział w separacji fast |
| Obrona — marking, **nowy** | Dokładność strony marka i udział w presji na wykonanie rzutu |
| Obrona — discReading, **nowy** | Tempo odczytu toru podczas próby przechwytu |

Indeks odniesień w kodzie: [attribute-references.json](attribute-references.json). Jest statyczny; pola czytane przez dynamiczny wybór kategorii i agregaty wymagają również oceny ręcznej. Obecność nazwy w pliku nie stanowi sama w sobie dowodu efektu w meczu.

### Migracja, rozwój i prezentacja

Nowe atrybuty powstają ze średnich istniejących pól: power z huck/backhand, touch i windControl z backhand/forehand, releaseControl z forehand/hammer, acceleration ze speed/agility, balance z agility, anticipation z vision/reactions, spatialAwareness z vision/decisionMaking, cutTiming z cutterMovement/systemu ataku, czytanie ataku z catching/systemu, positioning z krycia cuttera/systemu obrony, marking z krycia handlera/blocking, czytanie obrony z blocking/systemu.

Rodzice służą wyłącznie uzupełnieniu brakującego pola. Po zapisaniu nowe atrybuty są niezależne i mogą się rozwijać osobno. Generatory, rozwój i prezentacja używające list kategorii obejmują rozszerzony zestaw. Generowanie na podstawie danych źródłowych dziedziczy profil rodziców dla nowych pól. SKILLS_GEN_VERSION pozostaje 6. Nie ma zamierzonej regeneracji poprawnych starych wartości; normalizacja nadal stosuje istniejące ograniczenia zakresów. Częściowe i niepoprawne profile mają bezpieczne wartości zastępcze.

Profil zawodnika wyświetla nowe atrybuty i polskie objaśnienia. **OVR i średnie kategorii mogą się nieco zmienić**, ponieważ obejmują teraz więcej pól, nawet gdy stare 20 wartości pozostają takie same. To może pośrednio wpłynąć na wyceny, wybór składu i rozwój. Nie zweryfikowano tu pełnego wielosezonowego balansu ekonomii kariery.

## Morale, cechy i pozostałe wpływy

| Źródło | Wpływ |
|---|---|
| Morale | Wspólny odczyt atrybutów niefizycznych skaluje je względem morale 72. Mnożnik wynosi 0,906 przy 25 i 1,054 przy 99, z ograniczeniem końcowej wartości. Fizyczne speed/acceleration/agility/jump/balance/endurance nie są w ten sposób zmieniane |
| Energia podczas punktu | Wpływa na wykonanie, decyzje, chwyty i utrzymanie krycia. Poniżej 60 centralny mnożnik ruchu obniża Vmax, przyspieszenie i wybicie; cechy modulują odporność. Koszt sprintu i plantów jest rozliczany po właściwej stronie posiadania |
| Zmęczenie ogólne | Ogranicza pułap/startową energię meczu; zmiany i odpoczynek oddziałują pośrednio na zachowanie przez dostępne możliwości |
| Forma | Pozostaje wskaźnikiem występów, bez osobnego mnożnika umiejętności. Nie dodano pętli „dobry wynik → lepszy skill → jeszcze lepszy wynik” |
| Cechy | Modyfikują preferencje, progi akceptacji, szum decyzji, ruch, reakcję, presję, wykonanie i kanały kariery. Nie wszystkie są bezpośrednią cechą zachowania na boisku |
| Taktyka i instrukcje | System ataku/obrony, force, szerokość/głębokość ustawienia, priorytet cutu, huck/dump, poach, tempo i wybór ryzyka. Mody meczowe łączą cechy, dyrektywy i instrukcje dla aktualnej roli |
| Rola i podrola | Zmieniają zadanie zawodnika, jego miejsce w strukturze oraz dostępność oferty/resetu; także wybór składu decyduje o tym, kto wykonuje te zadania |
| Dominująca ręka i technika | Zmieniają naturalny kierunek krzywizny i możliwości wykonania na danej stronie |
| Budowa ciała | standingReachCm, ewentualnie heightCm, określa zasięg. Przy braku danych stosowany jest wspólny domyślny zasięg 2,2 m. Nie wymyślono różnic morfologii dla rosterów bez danych |
| Urazy i dostępność | Wpływają na możliwość udziału, skład i ryzyko dalszej gry; nie dodano animowanego utykania ani osobnej biomechaniki urazu |
| Sytuacja | Pozycje, prędkości, tor dysku, wiatr, linie boiska, strefa punktowa, stall, wynik i decyzje taktyczne tworzą kontekst wyboru |
| Losowość | Nadal obejmuje percepcję, wybór i wykonanie. Stały seed odtwarza stan danego kodu; zmiana kolejności decyzji lub częstotliwości odczytu zmienia przebieg losowań |

Pełny katalog **82 cech**, z rzeczywistymi różnicami modyfikatorów względem zawodnika bez cech: [TRAITS.md](TRAITS.md), a pliki konsumujące każdy efekt: [trait-effects.json](trait-effects.json). Każda cecha zmienia co najmniej jeden modyfikator. To nie dowód, że wszystkie mają równą lub dostatecznie dużą siłę. Cechy zmieniające tylko formę/morale/rozwój mogą wpływać głównie na karierę, a premia do statystycznego bloku nie zastępuje kontaktu w pełnym silniku.

## Fast, pomiary i wydajność

Fast pozostaje modelem statystycznym. Używa wspólnych umiejętności wykonania, a separację przybliża przez cutTiming/positioning, acceleration, speed i anticipation. Obecna korekta gapOffset = −12 zbliża trudność do pełnego silnika; advanceMult = 0,8 skraca podania inne niż huck. To jawna kalibracja modelu zastępczego, nie poprawa fizyki. Dopasowanie ogólnej skuteczności nie gwarantuje jednakowej wartości każdego atrybutu, cechy i taktyki w obu trybach.

Końcowy pomiar i liczby: [final-parity.txt](final-parity.txt). Próba obejmuje 40 fast i 20 pełnych meczów oraz rozproszone seedy. Gospodarze używają horizontal stack, goście vertical stack, obie strony person defense; pogoda jest generowana. Jej rozkład nie jest identyczny między liczebnie różnymi próbami. Dystanse dotyczą udanych podań. Hold oznacza zdobycie punktu przez drużynę zaczynającą w ataku, również po odzyskaniu dysku; nie jest czystym pierwszym posiadaniem. Mała liczba drużyn i brak danych turniejowych ograniczają wnioski o realizmie.

| Końcowa próba | Fast (40 meczów) | Pełny (20 meczów) |
|---|---:|---:|
| Celne podania | 84,70% | 84,51% |
| Hold | 51,52% | 47,98% |
| Straty / punkt | 1,20 | 1,83 |
| Podania / punkt | 7,87 | 11,83 |
| Udane podania do 10 m | 43,05% | 50,55% |
| Udane podania ponad 25 m | 8,69% | 9,60% |
| Średni dystans udanego podania | 12,51 m | 12,32 m |
| Udział hucków we wszystkich próbach | 13,21% | 6,16% |
| Udział dumpów we wszystkich próbach | 20,87% | 19,84% |
| Bloki / mecz | 14,18 | 12,10 |
| Czas obliczeń / mecz | 108 ms | 5250 ms |

Różnica completion to 0,19 punktu procentowego, lecz pełny silnik rozgrywa dłuższe punkty i ma więcej strat na punkt. Fast wciąż wybiera huck częściej. 15 z 28 ocenianych komórek wynikowych jest poza orientacyjnymi pasmami; nie są one kryterium zdania kontroli poprawności kodu. W pełnym trybie koszt wynosi około 5,25 s na mecz na tym środowisku; ten pojedynczy pomiar nie jest gwarancją czasu w przeglądarce gracza.

Profil complete-full.cpuprofile wskazał ponowne wyliczanie zagrożonej przestrzeni jako istotny koszt. Odczyt co 250 ms zmniejsza koszt i stabilizuje decyzję obrońcy. **Nie jest to optymalizacja neutralna**: zmienia częstotliwość oceny i konsumpcję RNG. Pozostałe koszty to pętla ruchu, mapa przestrzeni, stamina oraz tworzenie śladów zawodników. Czas meczu należy interpretować razem z liczbą akcji/klatek — większa liczba strat wydłuża symulację.

Pliki complete-initial.json, complete-after.json, complete-validation.json i complete-calm.json są pomiarami pośrednimi, a nie wynikami końcowego kodu. pre-wind-compensation-parity.txt i pre-vector-movement-parity.txt także opisują wcześniejsze stany. Nie należy liczyć z nich jednej procentowej „poprawy CPU” bez uwzględnienia zmienionych meczów i warunków.

## Kontrole i ograniczenia weryfikacji

- check-player-behavior.mjs: 33 pola, zgodność poprawnych starych wartości, brak mutacji wejścia, migracja i zapis JSON, częściowe profile, przyspieszenie, niezależność przyspieszenia od kierunku osi, morale kontra fizyka, energia, wpływ wybranych atrybutów na decyzje/wykonanie, przecinające się trasy, kompensacja wiatru i 20 trajektorii w różnych wiatrach do ziemi.
- check-disc-intercept.mjs: rozpędzanie, nawrót, wcześniejszy przechwyt, symetria obrotu, ograniczenia zasięgu i opóźniony odczyt błędu rzutu.
- check-engine-realism.mjs: stall zależny od marka, miejsce straty, strony zmęczenia, ciągłość ruchu, podniesienie dysku, percepcja i osiem meczów fast.
- check-disc-flight.mjs: wspólny tor, kontakt między klatkami, kolejność kontaktów, zgodność zdarzeń ze śladem i kontrola teleportów w czterech pełnych meczach.
- ESLint zmienianych modułów silnika, modelu atrybutów, profilu oraz nowych skryptów; budowanie aplikacji z kontrolą lokalnych importów i eksportów.

Wynik końcowy: cztery skrypty kontroli mechaniki przeszły. Kontrola pełnych meczów objęła **1077 chwytów i 174 straty**, w tym zgodność faktycznie łapiącego z odbiorcą zdarzenia. Build przeszedł kontrolę importów/eksportów 274 plików i zbudował 320 modułów. Celowany lint silnika, atrybutów, profilu i skryptów przeszedł; oddzielna kontrola worldState.js potwierdziła trzy istniejące błędy opisane poniżej. Wersja Node i sumy kontrolne 78 istotnych plików: [validation-manifest.json](validation-manifest.json).

Kontrole scenariuszy nie są dowodem poprawności wszystkich zachowań. Nie wykonano wizualnej oceny pełnych meczów ani wielosezonowej symulacji kariery. Repozytorium zawiera wcześniejsze błędy lint, w tym trzy nieużywane zmienne/importy w worldState.js; nie są naprawą tego zadania. Build ma ostrzeżenie o wielkości głównego pakietu aplikacji.

## Rekomendacje projektowe wynikające z audytu

1. **Kalibrację oprzeć na sytuacjach, potem na statystyce meczowej.** Rozdzielić straty: odbiorca nie zdążył, błędny wybór toru, błąd wykonania, presja marka, drop i blok. Dobre podanie w czysty incut powinno być łatwiejsze od długiego rzutu w podwójne krycie bez ukrytego bonusu wyniku. Obecne zakresy wyniku wymagają źródłowego zestawu danych i segmentacji według wiatru/poziomu gry.
   W istniejącym resolveThrow pozostały również abstrakcyjne sprzężenia: część kary zmęczenia odbiorcy trafia do throwScore, a umiejętność przypisanego obrońcy do defenseScore. Przy dalszym rozdzielaniu wykonania rzutu od odbioru powinny przejść odpowiednio do dobiegu/chwytu i rzeczywistej presji, z osobnym dopasowaniem modelu fast. Obecna przebudowa nie usuwa wszystkich takich zależności jednym ruchem.
2. **Rozwinąć percepcję kierunkową.** Obecny gracz stopniowo poznaje rzeczywisty tor, lecz nie ma pełnego modelu kierunku patrzenia, zasłonięcia widoku i zapamiętanej informacji. Docelowo anticipation ma przewidywać rozwój, vision odpowiadać za dostrzeżenie, discReading za estymację lotu, a decisionMaking za wybór przy tej niepełnej wiedzy.
3. **Dopracować współpracę i kolejne zagranie.** Ocena trasy jest lokalna i dwusekundowa, bez symulacji kolizji ciał ani wspólnego uzgadniania ofert. Rzucający ocenia głównie bieżące podanie; warto wyceniać jakość następnej pozycji, szansę kontynuacji i koszt zamknięcia przy linii. Obrona potrzebuje pełniejszego przekazywania krycia i komunikacji pomocy.
4. **Uprościć stare szerokie atrybuty przy następnej wersji danych.** Zamiast stale dokładać pola, przemianować cutterMovement na routeCraft, handlerMovement na resetMovement, defensiveCutterMovement na matchupReading, a defensiveHandlerMovement na resetDefense. Dać im konkretne decyzje: kąt/zwód, okno resetu, interpretacja ustawienia bioder i zamykanie upline. Migrację z zachowanymi wartościami można zrobić osobno, bez dublowania positioning, marking i fizycznej agility.
5. **Budowę ciała trzymać poza umiejętnościami.** Wzrost, zasięg ramion, masa i dominująca ręka to parametry ciała, a nie trenowalne „skille”. Oddzielne breakThrow, lowRelease, pivotFootwork, layoutTechnique lub communication mają sens dopiero z odpowiadającym im modelem działania. Nie warto tworzyć kolejnych liczb działających jedynie jako ukryty bonus celności.
6. **Cechy traktować przede wszystkim jako styl.** Ryzykant częściej podejmuje trudną próbę, lecz nie powinien mieć z tego powodu lepszych rąk. Bezpieczny handler częściej wybiera reset, a jego umiejętność techniczna nadal wynika z atrybutów. Dla obecnych 82 cech potrzebne są osobne porównania kierunku i siły efektu, szczególnie par dodatnia/ujemna i kombinacji z rozkazami.
7. **Dalsza fizyka powinna odpowiadać problemom obserwowanym w grze.** Najpierw ponowne zagranie po dotknięciu, poziomy layout i legalność chwytu przy linii, następnie ewolucja orientacji dysku i spin. Pełny kosztowny model bryły bez danych do dopasowania współczynników nie rozwiąże sam problemu złych wyborów przestrzeni.

Zaimplementowane zmiany tworzą spójniejszy fundament do tych prac. Raport nie ukrywa pozostałych uproszczeń ani nie przedstawia zgodności dwóch przybliżeń jako potwierdzonego realizmu sportowego.
