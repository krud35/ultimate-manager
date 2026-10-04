# Nocny audyt balansu taktyk — 3 października 2026

Status: projekt badania, nie raport wyników. Okno badawcze kończy się **2026-10-03 o 06:00 Europe/Warsaw, czyli 04:00 UTC**. Po nim następują analiza końcowa, poprawki i ich walidacja. W czasie zbierania bazowych danych kod rozgrywki pozostaje zamrożony; można poprawiać narzędzia audytu, lecz zmiana pomiaru wymaga nowej wersji manifestu. Nie zastępujemy pełnego silnika trybem `fastMode`.

## 1. Pytania i zakres wniosku

1. Czy formacje wytwarzają różne, sensowne przestrzenie, trasy i decyzje, a nie tylko odmienne etykiety lub premie?
2. Czy ta sama formacja osiąga inne wyniki przeciw różnym obronom, przy tej samej sile zawodników i porównywalnych warunkach?
3. Czy wiatr zmienia dostępne okazje oraz wybory w sposób zależny od geometrii rzutu, siły/techniki gracza i formacji?
4. Czy role, dyrektywy, instrukcje oraz obecne cztery osie planu kariery wpływają na deklarowane zachowanie? Czy koszt specjalizacji pozostaje widoczny?
5. Które problemy są błędem wykonania mechaniki, a które potencjalną nierównowagą wymagającą większej próby?

Nie zakładamy równego win rate wszystkich taktyk. Nie dodajemy sztucznej zasady „A pokonuje B”. Dobre i złe matchupy powinny wynikać z dostępnych przestrzeni, ryzyka, zdolności wykonania, czasu decyzji i kosztu energii. Jedna noc może wykryć duże różnice i błędy mechaniczne; nie gwarantuje rozstrzygnięcia każdego małego efektu.

## 2. Co aktualnie istnieje w kodzie

Źródła: `tacticsModifiers.js`, `coachDirectives.js`, `playerInstructions.js`, `playerSubRoles.js`, `defenseZoneRoles.js`, `offenseLineSlots.js`, `wind.js`, `matchSession.js`, `career/streamlinedTactics.js`.

| Warstwa | Katalog |
|---|---|
| Atak, 7 | `vertical_stack`, `horizontal_stack`, `split_stack`, `side_stack`, `motion_offense`, `hex_offense`, `zone_offense` |
| Obrona, 5 | `person`, `all_person`, `zone_cup`, `zone_wall`, `clam` |
| Force, 5 | `force_forehand`, `force_backhand`, `force_middle`, `force_sideline`, `force_straight` |
| Dyrektywy ataku, 6 | `creativity`, `huckAppetite`, `breakAppetite`, `passSelectivity`, `possessionTempo`, `stackDepth` |
| Dyrektywy obrony, 6 | `coverageShade`, `cushionDepth`, `markShape`, `poachSeeking`, `helpDeep`, `poachResetHandler` |
| Podrole ataku, 6 | `primary_handler`, `reset_handler`, `primary_cutter`, `secondary_cutter`, `continuation_cutter`, `filler_cutter` |
| Role strefy, 5 | `zone_marker`, `zone_cup`, `zone_wing`, `zone_middle`, `zone_deep`; liczby slotów 1/2/2/1/1 |
| Instrukcje, 22 | 11 przeciwstawnych par wymienionych niżej |
| Obecny plan kariery | osie `tempo`, `risk`, `direction`, `pressure`, każda −1/0/+1, osobno O-Line/D-Line; force; wyjątki `throw_hucks`, `no_hucks`, `dump_first`, `look_downfield` |

Dyrektywy `poachSeeking` i `helpDeep` są trójstanowe; `poachResetHandler` jest przełącznikiem 0/1. Pozostałe osie szczegółowe próbkujemy w −1/0/+1. Kierunek oczekiwanego zachowania bierze się z definicji kontrolki, nie z założenia, że „+1 jest lepsze”.

Plan kariery jest osobną ścieżką: kompilator wyprowadza szczegółowe dyrektywy z czterech osi i usuwa zapisane podrole. Wynik testu legacy dyrektyw nie dowodzi działania aktualnego planu UI. Potrzebne są dwa jawne typy fixture: szczegółowy bez `streamlinedPlan` oraz karierowy z tym planem jako źródłem ustawień. Przed startem sprawdzamy wartość żądaną, znormalizowaną i efektywną.

## 3. Integralność, składy i parowanie

### Bramka przed kosztowną symulacją

- Snapshot bieżącego katalogu roboczego, nie tylko HEAD; hash wszystkich użytych plików, seedy, skład, wersja Node, konfiguracja i termin UTC w manifeście.
- Ten sam seed i identyczne wejście dają identyczny wynik sportowy. Obserwator i zapis klatek nie mogą zmieniać losowania. Istniejący test `test-full-no-replay.mjs` sprawdza równoważność pełnego silnika z klatkami i bez; w audycie potwierdzamy reprezentatywne person/zone i wiatr.
- `initMatchSession` → `playNextPoint`, bez `fastMode`. Pełny mecz kończy się produkcyjnym warunkiem zwycięstwa; osiągnięcie limitu czasu, liczby punktów audytu lub błędu nie jest ukończonym meczem.
- Jawny przydział O/D, lineups, efektywnych podról i ról strefy. Rodzina slotu zależy od formacji: horizontal/motion/zone mają 3 handlerów; vertical/split/side/hex mają 2. Instrukcji nie przypisujemy na podstawie stałego `slice(0, 3)`.
- Sprawdzamy, czy O-Line zachowuje swój zestaw po stracie, D-Line po odzyskaniu, a faza atak/obrona dobiera właściwe działania. Sonda bez ekspozycji na badaną fazę nie może potwierdzić ani obalić działania kontrolki.

### Składy

Rdzeń to dwie kopie materializowanego składu z jawnymi wszystkimi umiejętnościami, stanem, cechami, ręką i budową ciała. Neutralne cechy i równe zasoby eliminują przewagę klubu. Zapisujemy realizowane średnie atrybutów, nie tylko nominalny OVR.

Następnie używamy kilku równobudżetowych rodzin: zrównoważona; handlerzy i reset; szybki ruch/flow; głębia i gra w powietrzu; czytająca obrona; techniczna. Nazwa rodziny nie zastępuje kontroli szczegółowych atrybutów. Podrole porównujemy przez zamianę ról między sklonowanymi graczami; nie przypisujemy różnicy umiejętności roli.

### Jednostka doświadczenia

Jednostką niezależną jest seed/realizacja składu w pełnym bloku meczów. Rzuty, posiadania i klatki w meczu są zależne. Ten sam seed jest narzędziem redukcji wariancji; po zmianie decyzji strumienie losowania mogą się rozejść, więc nie oznacza identycznej sekwencji zdarzeń.

Każde ustawienie ma rewanż z zamianą etykiet home/away, zachowaniem tożsamości badanej drużyny A oraz jawnie zapisanym pierwszym atakiem. Pierwszy atak zmieniamy niezależnie od zamiany stron. Dla najważniejszych efektów pełny blok obejmuje cztery kombinacje: A home/away × A pierwszy atak/obrona. Gdy budżet pozwala jedynie na dwumeczowe bloki, plan z góry równoważy pierwszy atak pomiędzy kolejnymi seedami i nie przedstawia takiego bloku jako pełnego czterokierunkowego odbicia.

W kontrastach ustawień neutral i wszystkie poziomy interwencji korzystają z tego samego kontekstu, rosteru, seeda, pierwszego ataku, wiatru i zamiany stron. Do kontrastu wchodzą tylko kompletne bloki wszystkich porównywanych poziomów. Rewanż utrzymuje absolutny wiatr; osobne odbicie geometrii wraz z wiatrem służy kontroli symetrii. Kod zmienia strony geometryczne w trakcie spotkania, dlatego relację do wiatru liczymy również per punkt/rzut, nie raz z etykiety drużyny.

## 4. Macierz taktyk i pogody

### Rdzeń 7 × 5

Każdy z 7 ataków przeciw każdej z 5 obron: 35 komórek. Zmieniamy atak A i obronę B; obrona A i atak B pozostają identyczną kontrolą. Główne metryki komórki dotyczą **atakujących posiadań A przeciw B**, nie połączonych statystyk obu drużyn. Końcowy wynik meczu pozostaje istotny, lecz zawiera również kontrolowaną drugą fazę.

Pełna pierwsza runda wszystkich 35 komórek ma pierwszeństwo przed pogłębianiem kilku komórek. Następne rundy zmieniają seedy/realizacje składu. Nie kierujemy budżetu wyłącznie do zwycięzców. Mocno wietrzne i bezwietrzne próby są w kolejce przeplatane, aby obcięcie czasu nie zostawiło wszystkich późniejszych modułów bez danych.

### Pogoda

`directionDeg` wskazuje kierunek **dokąd** wieje: 0° → +X, 90° → +Y, 180° → −X, 270° → −Y. Jednostką wejściową jest mph. Przy interpretacji rozróżniamy składową względem ataku i względem konkretnego rzutu. Światowa prędkość/direction są stałe w badaniu kontrolowanym (`windLocked`); naturalny dryf jest dodatkowym testem zachowania, a nie domyślnym zakłóceniem kontroli.

| Warstwa | Warunki | Priorytet i cel |
|---|---|---|
| Spokojnie | 0 mph | wszystkie 35 par; punkt odniesienia |
| Umiarkowanie | 12 mph, 0/90/180/270° | porównać wzdłużny/boczny i znaki, zwłaszcza przy force oraz dominującej ręce |
| Silnie | 18 mph, 0/90/180/270° | koszt dalekich rzutów, wysokości lotu, swingów, resetu i strefy |
| Skrajnie | 24 mph, wybrane pary i kąty 45/225° | reprodukcje awarii/granic możliwości; nie ustalać z tej warstwy ogólnego balansu |
| Progi | 6/7, 10/11, 15/16, 20/21 mph | krótka diagnostyka nieciągłości; progi pasm silnika różnią się od etykiet UI |

Docelowy pełny iloczyn rdzenia i pogody jest większy niż gwarantowany budżet. Kolejność rozszerzenia: wszystkie style w 0 mph; wszystkie style w co najmniej jednej wietrznej warstwie; odwrócony wiatr/strona; więcej seedów. Lista minimalnych par pogodowych jest zamrożona przed wynikami: vertical/person, horizontal/person, side/all_person, motion/person, hex/cup, zone_offense/cup, zone_offense/wall, split/clam, horizontal/wall, vertical/clam. Każda porównywana para otrzymuje neutralne odniesienie i wiatr z tym samym seedem.

Nie zakładamy, że strefa musi zawsze korzystać z wiatru, ani że pod wiatr wszystkie rzuty muszą być krótkie. Hipotezą jest zależność korzyści i kosztu od wykonalnych okien: strefa może wymuszać wiele podań, ale dawać łatwy reset; huck może być gorszy wykonawczo, a jednocześnie omijać szczególnie niebezpieczny rejon.

## 5. Dyrektywy, instrukcje, role i obecny plan

Testujemy pojedynczą interwencję przy stałych innych ustawieniach, następnie ograniczony zestaw interakcji. Obsługa wszystkich legalnych wartości i konfliktów ma mały test deterministyczny; pełne mecze ustalają zachowanie i koszty.

| Rodzina | Sparowane poziomy | Główna ekspozycja i dowód |
|---|---|---|
| Tempo | −1/0/+1; `play_slow`/neutral/`play_fast` | czas do wypuszczenia, kontynuacja po chwycie, stall, jakość dostępnych alternatyw |
| Głębia | −1/0/+1 huck, stackDepth; `throw_hucks`/`no_hucks`, `cut_deep`/`cut_under` | częstość i jakość okazji deep, głębokość tras, dystans zysku, straty według wiatru |
| Selektywność i kreatywność | −1/0/+1; `safe_throws`/`take_risks` | wybór półotwartych okien versus czekanie, progresja, koszt stallu |
| Break i reset | −1/0/+1 break; `break_mark`/`no_break_mark`; `dump_first`/`look_downfield` | strona względem force, moment resetu, odzyskana przestrzeń, jałowe serie podań |
| Krycie | −1/0/+1 shade/cushion/markShape; `tight_mark`/`loose_mark`; `shade_deep`/`shade_under` | relatywna pozycja obrońcy, oddana i zabrana opcja, recovery po minięciu |
| Pomoc | −1/0/+1 poach/helpDeep; 0/1 poachResetHandler; `poach`/`no_poach` | okazja pomocy, czas poza matchupem, utrata groźnego odbiorcy, powrót |
| Udział i przestrzeń | `dominate`/`wait_your_turn`, `take_space`/`give_space` | udział w inicjacji i ofertach na minutę, clear, dostępność pasa, wpływ na partnerów |
| Force | wszystkie 5 wariantów | person i strefa, obie strony boiska, oba kierunki crosswind, ręka lewa/prawa |

W każdej instrukcji przeciwną parę uzupełnia neutralne odniesienie. Konflikt to osobna próba neutral/A/B/A+B/B+A, aby sprawdzić udokumentowaną normalizację i kolejność. Nie oczekujemy jednoczesnego wykonania sprzecznych instrukcji. `dump_first` + `safe_throws` jest kombinacją komplementarną, nie konfliktem.

Instrukcje rzutowe nakładamy na właściwych handlerów lub wskazanego gracza; cuty/przestrzeń na cutterów; obronne na zawodników rzeczywiście broniących. Ustawienie dla wszystkich siedmiu zawodników jest testem skrajnym, a nie reprezentatywną oceną pojedynczego wyjątku trenera. Osobne dane dla O-Line w ataku/obronie oraz D-Line w obronie/ataku.

### Podrole i role strefowe

- Neutralny rozkład oraz rotacje tych samych graczy po PH/RH i PC/SC/CC/FC. Porównanie wewnątrz rodziny slotu; osobno legalna zmiana formacji, która zmienia rodzinę slotu.
- PH: udział w rozpoczęciu posiadania, wsparcie po oddaniu dysku; RH: dostępny reset i jego termin; PC/SC: inicjacja oraz otrzymane podania; CC: oferty po chwycie; FC: utrzymanie szerokości i wyjątkowo dobre okazje. Brak odbioru nie znaczy brak wykonanej roli.
- Czas na boisku, czas rzeczywistego ataku/obrony oraz liczba dostępnych okazji są mianownikami. Surowa liczba podań może mylić rolę z minutami i rotacją.
- W cup/wall/clam porównać automatyczny i ręczny legalny przydział 1/2/2/1/1; zamieniać graczy między slotami bez zmiany umiejętności. Potwierdzić stabilność po swingach, stracie, zmianie formacji i zmianach personalnych.
- Zła/niepełna/zduplikowana mapa ról jest testem normalizacji, nie sportową taktyką. Zapis ma pozostać niezmieniony przez runtime naprawę dopasowania do aktualnej siódemki.

### Obecny plan kariery

Każda z 4 osi: −1/0/+1 przy pozostałych równych zero; obie linie, neutral i konteksty person/cup. Cztery wyjątki: neutral, zgodny plan, sprzeczny plan. Sprawdzić zarówno efektywne ustawienia, jak i ruch/decyzje. Osobna interakcja direction × wind oraz pressure × stamina. Nie przywracamy skomplikowanego UI tylko dlatego, że silnik nadal ma dodatkowe regulatory.

### Interakcje priorytetowe

1. Huck/kierunek × wiatr × siła rzutu/odbiorca; deep shade × cut_under/cut_deep.
2. Tempo × znajomość taktyki/energia; kontrola resetu × dump_first.
3. Cup/wall × zone_offense/hex × force/crosswind; person/all_person × side/split.
4. PC/CC/FC × dominate/give_space i dobre okno; różne role przy dwóch/trzech handlerach.
5. Instrukcja kontra odpowiednia dyrektywa, trait zgodny/sprzeczny; jeden czynnik osobniczy naraz.

Zmęczenie i rotacja wymagają pełnych meczów. Krótkie setupy mogą izolować geometrię, ale uproszczony adapter rozstrzygnięcia setupu nie zastępuje produkcyjnego rozstrzygnięcia punktu.

## 6. Pomiar ruchu, decyzji i wyniku

| Obszar | Metryka i mianownik | Interpretacja |
|---|---|---|
| Wynik ataku | punkty / posiadania, hold / okazje hold, straty / 100 posiadań | główne miary; osobno obrona i typ linii |
| Wynik obrony | break / okazje break, wymuszone straty, bloki | nie przypisywać dropa automatycznie pracy obrony |
| Przebieg meczu | różnica punktów, wygrana, długość, energia/rotacje | wynik wspierający; pełny mecz zawiera oba ataki |
| Podania | completion, dystans, zysk netto, reset/huck/break share, completion w klasach | sam completion bez progresji nie jest sukcesem |
| Decyzja | czas do rzutu, stall, brak selekcji przy dostępnych opcjach, liczba i wiek dostrzeżonych opcji | percepcja dostępna wtedy, nie wiedza z przyszłości |
| Przestrzeń | szerokość/głębokość względem dysku, obsada pasów, odległość partnerów, lane overlap | osobno setup/lot/przejście i rola; średnia całego meczu może ukryć problem |
| Ruch | dystans i sprint / graczominutę, bezruch poza throwerem, clear time, czas do nowej oferty, częste nawroty celu | stan WAITING nie oznacza stania; rozróżnić zmianę celu od fizycznego zwrotu |
| Krycie | cushion i strona względem ataku, poach exposure, deep/under oddane, otwarty odbiorca po swing | samo większe oddalenie może być celową pomocą |
| Role | inicjacje, oferty, rzuty/odbiór, reset availability na okazję i minutę | mierzyć zgodność z funkcją, nie narzucać równego udziału |
| Warunki | rzeczywisty wiatr, relacja do rzutu, technika/ręka, dystans, wysokość lotu, separacja przy release/catch | porównanie jabłek z jabłkami; trudniejsze wybory mogą obniżyć completion |

Źródło expected completion/oceny opcji pochodzi z tego samego AI, dlatego nie jest niezależnym sędzią jakości. Dobry wynik po złym wyborze i drop po dobrym wyborze wymagają geometrii/opcji/śladu. Klasy przyczyn strat: brak opcji wskutek ruchu, wybór, wykonanie rzutu, chwyt, blok, granica, nieustalone; ostatnia klasa pozostaje w mianowniku.

Pełne klatki gromadzimy warstwowo w ograniczonej kohorcie: przynajmniej każda formacja/obrona, spokojnie i wiatr, role oraz ustawienia o dużym efekcie. Pozostałe mecze mogą używać `collectFrames: false`, nadal symulując ruch, lecz **bez twierdzenia, że zebrano ich trajektorie**. Losowe próbki niezależne od wyniku i najbardziej alarmujące akcje mają osobne indeksy. Przy wyciętych klatkach nie liczymy precyzyjnych prędkości ani przyspieszeń, których próbkowanie nie pozwala ocenić.

### Alarmy

- Twarde: NaN/Infinity, niedozwolony skład/liczba graczy, brak zakończenia/timeout, sztuczny punkt z limitu akcji/rzutów, pomylona tożsamość drużyny, pominięta interwencja. Nie stają się porażką sportową i blokują wniosek z dotkniętej próby.
- Miękkie: skoki położenia, długie nakładanie ciał, brak postępu/reset loop, persistent brak opcji, nieuzasadnione opuszczenie zadania. Zapisujemy czas trwania, fazę i klip. Pojedynczy zwrot celu ani bliskość dwóch graczy nie są samodzielnym dowodem błędu.
- Dla obserwatorów podajemy sampling, denominator, brakujące dane i pokrycie. Zera wynikające z braku pomiaru są `null`/„nie zmierzono”, nie dowodem braku zjawiska.

## 7. Analiza balansu i kryteria poprawki

Najpierw wynik każdego meczu, potem średnia dwóch rewanżów, potem średnie i niepewność po niezależnych blokach. Raport obok średniej ma liczbę pełnych meczów, par, seedów i rosterów, zakres warunków oraz odrzucone/cenzurowane próby. CI 95% przez resampling całych seedowych bloków; przy mniej niż 3 niezależnych seedach CI = brak. Taki próg chroni przed fikcyjną precyzją, ale nawet 3 seedy oznaczają słabą podstawę uogólnienia. Liczne porównania są eksploracyjne.

Efekt ustawienia to sparowana różnica względem neutral w tym samym kontekście. Efekt matchupu to interakcja: przewaga A nad odniesieniem przeciw D1 minus ta sama przewaga przeciw D2. Efekt pogody analogicznie: zmiana od spokojnej pogody dla taktyki minus zmiana dla odniesienia. Sam ranking osobno w dwóch warstwach nie dowodzi interakcji.

Kryteria decyzji:

1. **Naprawa błędu:** powtarzalna reprodukcja naruszenia kontraktu (np. instrukcja znika, rola z niewłaściwego slotu, błędny kierunek force). Wymaga potwierdzenia na śladzie/testem, nie minimalnej liczby zwycięstw.
2. **Kandydat do balansu:** zgodny efekt ruchu/decyzji i praktycznie duża różnica skuteczności w nazwanej niszy, orientacyjnie 3 pp punktów/posiadanie lub 1 punkt różnicy wyniku, potwierdzona w niezależnych seedach. Są to progi projektu, nie zewnętrzne normy ultimate.
3. **Koszt specjalizacji:** zwiększona korzyść ma wskazany koszt ryzyka, energii, progresji albo konkretnego matchupu. Brak kosztu w zbadanych warunkach jest sygnałem do sprawdzenia dominacji, nie automatycznym obowiązkiem osłabienia.
4. **Brak dowodu:** mało seedów, brak ekspozycji, mała liczba ukończonych par, sprzeczny kierunek metryk lub szeroka niepewność → zachować jako hipotezę. Nie zmieniać wag tylko po to, aby tabela stała się bardziej kolorowa.

Przy poprawkach najpierw realizacja ruchu i intencji, potem kalibracja wag. Brakującej zdolności nie maskujemy bonusami konkretnego ataku przeciw konkretnej obronie. Każda zmiana otrzymuje reprodukcję „przed”, przewidywany mechanizm, test „po” na tych samych seedach i oddzielną serię świeżych seedów. Sprawdzamy również przeciwne ustawienie oraz spokojnie/silny wiatr, aby nie naprawić niszy kosztem całego systemu.

## 8. Budżet do 06:00 i kolejność wykonania

### Operacyjna kolejka pierwszego biegu

`scripts/tactics-balance-plan.mjs` jest konkretyzacją projektu mieszczącą się w jednej nocy. Używa pięciu warstw: `calm` = 0 mph/0°, `cross14` = 14 mph/90°, `axial14` = 14 mph/0°, `cross24` = 24 mph/270°, `axial24` = 24 mph/180°. To przekrój spokojnie/normalnie/ekstremalnie; nie obejmuje osobnego silnego pasma 16–20 mph ani każdej pary przeciwnych kierunków przy tej samej intensywności. Rozszerzona tabela pogody z sekcji 4 pozostaje celem pokrycia, nie twierdzeniem o wykonaniu.

Operacyjna kolejka przeplata 7 kohort (`matrix`, `instruction`, `directive`, `roles`, `force`, `career`, `interaction`). Najpierw wykonuje **trzy rdzeniowe rundy po 320 meczów, łącznie 960**, na niezależnych seedach i realizacjach zrównoważonego składu, przy stałym kontekście każdego czynnika. Następnie przechodzi do dodatkowych warunków pogody, instrukcji przeciw cup i pozostałych rodzin składów. To rozdziela pierwsze powtórzenia od rozszerzania wszystkich wymiarów naraz.

| Kohorta rdzenia jednej rundy | Mecze |
|---|---:|
| Macierz: wszystkie 35 komórek spokojnie + 10 wybranych par w wietrze, każda z rewanżem | 90 |
| 11 par instrukcji, każda neutral/A/B w kontekście person z rewanżami | 66 |
| 12 dyrektyw, wszystkie zadeklarowane poziomy z rewanżami | 70 |
| 4 osie obecnego planu kariery, neutral/low/high z rewanżami | 24 |
| Podrole handlera i cuttera | 12 |
| 4 force przeciw neutralnemu forehand | 16 |
| 7 kombinacji/interakcji z neutralnym odniesieniem | 42 |

Grupa ustawienia zawiera neutral i wszystkie interwencje, każdą w pełnej parze; termin kontrolujemy na poziomie całej grupy. W macierzy kolejne warstwy pogody tej samej pary atak/obrona/rundy mają wspólny seed, dzięki czemu można liczyć sparowany efekt wiatru. Nie oznacza to, że seedy różnych par atak/obrona są wspólne: różnice między samymi komórkami pozostają porównaniem różnych realizacji losowych i wymagają ostrożności.

Pierwszy atak jest A w rundach parzystych i B w nieparzystych; oba rewanże danej rundy zachowują tę samą tożsamość pierwszego ataku. Jest to plan dwumeczowy, nie pełny blok czterech kombinacji w każdym seedzie. W pierwszych trzech rundach podział pierwszego ataku wynosi 2:1; pełne zrównoważenie wymaga następnej rundy albo dedykowanej kontroli. Role na pierwszą noc: PH/RH w slocie 0 oraz PC/SC/CC/FC w slocie 3 horizontal stack, plus filler neutral/dominate/wait. Nie obejmuje to automatycznie wszystkich ról strefowych i wszystkich formacji. Rotacja produkcyjna włączona jest w kohorcie kariery; kontrolowane pozostałe kohorty zachowują stały przydział zawodników, nadal symulując zmęczenie. Defensywne instrukcje w próbach cup stosują również obronę cup u badanej drużyny; w raporcie należy odróżniać obronę A od obrony przeciwnika B.

Kombinacje `instruction-overrides-*` badają skrzyżowane dyrektywy i instrukcje. Mogą potwierdzić zachowanie całej konfiguracji; sam ich wynik nie izoluje priorytetu nadpisania bez sprawdzenia efektywnych ustawień. `zone-tempo` ma neutralny atak zone_offense, aby porównanie nie mieszało zmiany formacji ze zmianą tempa. Dodane próby `poach-ban-monotonicity` i `reset-poach-isolation` służą konkretnym podejrzeniom poachu, nie zmianie wag na podstawie pierwszego wyniku.

Pilot techniczny dał 22,52 s dla 29-punktowego meczu vertical/person spokojnie oraz 16,90 s dla 18-punktowego vertical/cup przy cross14; oba pełne mecze bez twardych błędów. To szacunek wydajności z dwóch spotkań, nie p90 całego katalogu i nie wynik balansu. Przy 22,5 s/mecz i dwóch workerach 960 meczów wymaga około 180 min surowego czasu, przy 30 s — 240 min. Manifest i `coverage.json` rozstrzygają rzeczywistą liczbę wykonanych prób.

Godziny są maksymalnymi granicami, nie obietnicą liczby meczów. Uruchomienie późniejsze skraca część eksploracyjną, nie przesuwa 06:00. Termin w UTC i czas monotoniczny kontrolują jeden koordynator; nowe zadanie przyjmujemy tylko z rezerwą na całe parowanie i zapis. O godzinie 06:00 nie rozpoczynamy kolejnej bazowej próby. Aktywny nieukończony mecz otrzymuje status cenzurowany.

| Okno, Europe/Warsaw | Priorytet |
|---|---|
| Start–00:30 | integralność, walidacja efektywnych ustawień, pomiar kosztu pełnego meczu i pamięci |
| 00:30–02:15 | rdzeń 35 par, przeplatane kontrole osi/roli i reprezentatywny wiatr |
| 02:15–04:15 | kolejne seedy, dyrektywy/instrukcje, pogoda, role, interakcje i plan kariery |
| 04:15–05:40 | niezależne potwierdzenia dużych problemów oraz brakujące pary/pokrycie; bez strojenia produkcji |
| 05:40–06:00 | domknięcie par, indeks dowodów, agregacja, zamrożenie wniosków |
| Po 06:00 | poprawki uzasadnione danymi, regresja, ponowne pełne mecze i finalny raport |

Preflight wyznacza p90 czasu pełnego meczu i zużycia pamięci. Limit przyjęć grupy bazuje na p90 × liczba pozostałych meczów × margines 1,4. Początkowo 2 workery; zwiększenie tylko gdy pamięć i przepustowość to uzasadniają. Szacunek `dostępne sekundy × workery / (p90 × 1,4)` służy budżetowi, nie zapewnia liczebności.

Priorytety przy ograniczeniu czasu: prawidłowość i pełne pary → przekrojowa pierwsza runda → najważniejsze interakcje pogody/aktualnego UI/ról → niezależne seedy → drugorzędne kombinacje. Rozległy screening 64 hipotetycznych trenerów z wcześniejszego audytu nie ma pierwszeństwa nad testami systemu z tej prośby. Parametry adaptacji można diagnozować osobno; nie wolno nimi maskować stałej taktyki w rdzeniu. Produkcyjne rotacje są obecne w kohorcie pełnego meczu, a zamrożony skład jest odrębną kontrolą przyczynową.

## 9. Ograniczenia odziedziczonego harnessu, które trzeba usunąć lub ujawnić

| Dotychczasowe zachowanie | Konsekwencja |
|---|---|
| Plan 8h ze sztywnymi końcami faz | nie pasuje do terminu 06:00; sam skrócony timeout obciąłby późne warstwy |
| Controls/matrix po 1 punkcie, bez rewanżu | pełny silnik, ale nie pełny mecz ani dowód kosztu zmęczenia |
| `swap` zawsze daje focal team pierwszy atak | brak niezależnej kontroli pierwszego posiadania |
| `instructionRole` zakłada trzech handlerów | część instrukcji trafia w złego zawodnika w czterech formacjach |
| Szczegółowe interwencje bez jawnej kontroli `streamlinedPlan` | możliwość nadpisania przez aktualny kompilator kariery |
| Defensywne kontrole na drużynie rozpoczynającej atak | możliwy brak okazji; brak efektu nie oznacza martwej kontrolki |
| Brak bezpośrednich eksperymentów podról/strefy | nie spełnia zakresu obecnej prośby |
| Zsumowane dane obu zespołów w części wskaźników | nie wolno przypisywać całej różnicy badanej drużynie |
| Normalna pogoda skupiona poza macierzą | brak pełnej oceny styl × przeciwnik × wiatr |
| Tylko 0/7/14 mph w części starej kolejki | nie obejmuje silnego pasma 16–20 i ekstremalnego 21+ mph |

Te pozycje opisują przegląd starego narzędzia; nie stanowią twierdzenia, że nowy runner nadal zawiera błędy. Manifest i pokrycie faktycznego biegu rozstrzygają, co wykonano.

## 10. Materiał końcowy

W jednym katalogu: snapshot/hash, manifest z terminem, zamrożona kolejka, rostery, pliki wejściowe i wyniki per mecz, kontrolowane statusy, pokrycie, błędy, agregaty per drużyna i kompletna para, indeks śladów oraz raport po polsku. Raport oddziela pomiar bazowy, hipotezy, reprodukcje, zastosowane poprawki i wyniki po zmianie.

Zwięzła karta problemu: **kiedy występuje → dowód i liczebność → mechanizm → poprawka → wynik po poprawce → pozostała niepewność**. Jeśli zabrakło czasu na komórkę, jest jawnie „nie zbadano”, a nie „zbalansowane”.

## 11. Korekta operacyjna: nieważna seria v1 i metoda v2

W pierwszym biegu wykryto błąd narzędzia badawczego: w kohortach z `rotate: false` usunięcie kontuzjowanego zawodnika pozostawiało pusty slot, bez obowiązkowego uzupełnienia zdrowym rezerwowym. W reprodukcji `neutral-a`, punkt 25, faktyczna liczba graczy wynosiła 4 przeciw 7. Zmienia to zarówno wynik, jak i przestrzeń oraz decyzje, więc nie można interpretować takiej próby jako dowodu balansu taktycznego.

Serię **v1 zatrzymano i wyłączono w całości z analizy sportowej oraz strojenia balansu**, również wyniki wcześniej zapisane jako `complete`. Około 45 ukończonych spotkań to stan przy zgłoszeniu problemu; ostateczna liczba pozostaje w manifeście i surowych wynikach. Katalog `artifacts/engine-audit/tactics-balance-2026-10-03` zachowuje rolę diagnostyczną. Nie dopisujemy do niego poprawionych meczów, nie nadpisujemy jego snapshotu i nie łączymy jego seedowych bloków z nową serią. Wcześniejsze ukończenie bez zgłoszonego twardego błędu nie wystarcza, ponieważ metoda v1 nie kontrolowała tej nieprawidłowości.

Nowa seria w `artifacts/engine-audit/tactics-balance-2026-10-03-v2` używa **metody workera v2**: przy wyłączonej rotacji kontuzjowany zawodnik jest obowiązkowo zastępowany zdrowym, dostępnym rezerwowym. Pozostałe prawidłowe sloty zachowują swój przydział. Jest to obowiązkowe uzupełnienie składu, nie rotacja taktyczna według zmęczenia. Wybrany rezerwowy i przyczyna wejścia są zapisywani; jego role i instrukcje przechodzą tę samą materializację co pozostałych graczy. W kohorcie z produkcyjną rotacją nadal obowiązuje ta odrębna polityka.

Bramka integralności v2 wymaga przed każdym punktem dwóch **faktycznych siódemek**: 7 różnych, istniejących i uprawnionych zawodników na każdej stronie, bez `null`, duplikatów ani pozostawionych kontuzjowanych. Kontrola obejmuje skład po normalizacji i obowiązkowych zmianach oraz rzeczywiste identyfikatory graczy użytych w punkcie/śladzie. Samo posiadanie siedmiu wpisów w zapisanej taktyce nie jest dowodem gry 7 na 7. Niedostateczna liczba zdrowych rezerwowych lub inne niespełnienie warunku oznacza twardy błąd `invalid_lineup` i wyłączenie całego meczu, a przez to również niekompletnej pary; nie jest to sportowa porażka taktyki.

QA przed wznowieniem: odtworzyć problem z kontuzjami na tym samym seedzie; sprawdzić uzupełnienie brakujących slotów i niezmienność pozostałych; potwierdzić rzeczywiste 7 na 7 po zmianie oraz identyczne ustawienia interwencji; sprawdzić, że sztucznie pozostawiony niedobór graczy kończy się błędem wykluczanym przez raport. Rewanże muszą w całości pochodzić z tej samej metody i snapshotu.

Obecny generator raportu odrzuca każdy wynik ze statusem innym niż `complete` lub niepustym `hardErrors`, więc wykryty przez v2 `invalid_lineup` nie wymaga osobnej reguły statystycznej. Nie wykrywa jednak retrospektywnie wszystkich nieoznaczonych problemów v1; dlatego wykluczenie całej serii jest decyzją na poziomie badania, a końcowa analiza bazowa korzysta wyłącznie z v2. Osobno raportujemy liczbę skontrolowanych punktów, zdarzeń obowiązkowych zmian i błędów składu, jeśli worker te dane zapisuje.

Termin pozostaje **06:00 Europe/Warsaw (04:00 UTC), 3 października 2026**. Czas zużyty przez v1 nie przesuwa końca okna badawczego. Pokrycie trzech rund i rozszerzeń jest celem zależnym od pozostałego budżetu; raport podaje rzeczywiście ukończone, poprawne pary v2.
