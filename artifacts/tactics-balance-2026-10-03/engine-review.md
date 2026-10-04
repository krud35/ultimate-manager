# Audyt silnika: taktyki, instrukcje, ruch i wiatr

Data: 2026-10-03. Przegląd read-only; nie zmieniono silnika. Reprodukcje poniżej wykonano na aktualnym kodzie. Testy funkcji są diagnostyką przyczyn, a nie substytutem zaplanowanych pełnych meczów.

Wszystkie cztery reprodukcje są uruchamialne razem: `node scripts/probe-tactics-balance-mechanisms.mjs`. Skrypt drukuje JSON. Asercje sprawdzają deterministyczność, zakresy i warunki scen, natomiast obserwacje opisują wykryte rozbieżności; skrypt nie utrwala błędów jako oczekiwanego wyniku. Bieżące progi okna odczytuje z kodu, żeby porównanie po poprawce nie nadal raportowało starych liczb.

## Potwierdzone problemy do naprawy po etapie testów

### 1. Dyrektywa poachu na resecie gubi swój stan — wysoki priorytet

Plik: `src/matchEngine/ai/defenderBrain.js`, uruchomienie w okolicy linii 380–407, końcowy zwrot 621–634.

`resetPoachOn` ustawia lokalnie `poachUntil`, `poachedFromId`, `state = POACHING` i `resetPoachDone = true`. Kod nie wraca jednak do gałęzi obsługującej aktywny poach, która leży wcześniej. Końcowy `return` zwraca zwykłe krycie, zeruje czas poachu i pomija flagę wykonania. W tym samym ticku lokalne `state = POACHING` dodatkowo blokuje zwykłą losową próbę poachu.

Reprodukcja: pierwszy zawodnik `demoHomeTeam`, bez cech; obrońca `(45,17)`, kryty reset `(45,18)`, dysk i rzucający `(40,18)`, `force_forehand`, `person`, seed 8103, 250 ticków po 20 ms. `poachSeeking=-1` izoluje zachowanie dyrektywy `poachResetHandler`.

| Wariant | Ticks POACHING | Ticks resetPoachDone | Ruch i stany |
|---|---:|---:|---|
| poachResetHandler=0 | 0 / 250 | 0 / 250 | referencja |
| poachResetHandler=1 | 0 / 250 | 0 / 250 | identyczne 1:1 z referencją |

Naprawa powinna rzeczywiście rozpocząć ograniczony czasowo ruch poachu, zachować flagę jednorazowości i następnie wrócić do krytego zawodnika. Testować oddzielnie zgodność z `no_poach` i celowo niezależnym `helpDeep`.

Metryki pełnego silnika: liczba okazji przy krytym resecie <=14 m od dysku; inicjacje poachu / okazję; czas poachu; czas odzyskania krycia; dostępność i skuteczność rzutu do porzuconego resetu; blokady w opuszczonym lane. Sam udział stanów POACHING w całym meczu może ukryć brak działania.

### 2. Instrukcja „nie poachuj” potrafi osłabić istniejący zakaz

Pliki: `src/matchEngine/playerInstructions.js` (`INSTRUCTION_OVERRIDES`, `no_poach`), `src/matchEngine/coachDirectives.js` (`effectiveCoachDirectives`), `src/matchEngine/ai/tacticsBehavior.js` (`shouldAttemptPoach`).

`no_poach` wycisza `poachSeeking`; usuwa tym samym twardą bramkę `poachSeekingMode <= -0.55`. Własny efekt instrukcji to mnożnik interpolowany przez compliance, bez analogicznej bramki. Dodanie dodatkowego zakazu do już zakazującej taktyki włącza zatem drobną szansę poachu.

Reprodukcja: pierwszy gracz demoHomeTeam bez cech, `poachSeeking=-1`, `person`, odległość do dysku 4 m, do lane 1 m, separacja krytego 1 m, stall 2, uprawniona rola, zero aktywnych poacherów, seed 554, 10 000 wywołań `shouldAttemptPoach`.

| Instrukcja osobista | Efektywny mode | Mnożnik | Poach / 10 000 |
|---|---:|---:|---:|
| brak | -0.652 | 0.348 | 0 |
| no_poach | 0 | 0.3046 | 77 |
| poach | 0 | 1.549 | 1195 |

To nie dowodzi, że każdy zakaz ma oznaczać absolutne zero dla każdego zawodnika. Dowodzi jednak niepożądanej niemonotoniczności. Rozkaz osobisty powinien mieć świadomie dobraną, zgodną semantykę compliance.

### 3. Okna safe_throws / take_risks używają innej skali niż ich źródło

Pliki: `src/matchEngine/ai/throwerBrain.js:983`–996 i `src/matchEngine/ai/spatialEvaluator.js:125`–137.

`throwWindowScore` jest ograniczony do 0–100. Scoring pewnych/ryzykownych rzutów porównuje go z 0.35, 0.25 i 0.55. W rezultacie kara za słabe okno i premia za półotwarte okno są praktycznie martwe. Pozostałe człony instrukcji — separacja, break, OTT, próg akceptacji — działają, więc prosty test „instrukcje dają różne wyniki” tego nie znajdzie.

Diagnostyka 5000 scen z seedem 333: x odbiorcy `25 + rng()*45`, y `2 + rng()*33`; sześciu kolegów i siedmiu obrońców w kwadracie ±6 m od odbiorcy, dysk `(40,18.5)`, `force_forehand`, pierwszy gracz demoHomeTeam. Zakres otrzymanych okien 19.175–62.593. Przedział 25–55: **4814 scen**, przedział 0.25–0.55: **0 scen**.

Naprawa: spójna skala punktowa lub jawna normalizacja raz. Testować tę samą opcję z separacją i resztą parametrów stałymi oraz oknami po obu stronach granic, a potem pełne mecze dla obu instrukcji. Przed doborem nowych wag najpierw przywrócić działanie istniejącego członu.

### 4. Geometria force ma sprzeczne kierunki i absolutny test strony

Pliki: `src/matchEngine/ai/offenseReorganization.js` (`breakSideSign`, `openSideSign`), `src/matchEngine/ai/defenderBrain.js:68` (`forceMarkPosition`), `src/matchEngine/ai/spatialEvaluator.js:82`–95, `src/matchEngine/throwTechnique.js` (`forceMarkLayoutSide`, `resolveActiveForceGrip`).

Potwierdzone niespójności:

- Forehand: marker stoi po stronie -Y rzucającego, evaluator uznaje +Y boiska za open, lecz `openSideSign` zwraca -1. Backhand ma analogiczną odwrotność. Z tego helpera korzystają cele struktury ataku oraz obrót łuku strefy.
- `breakSideSign(force_sideline)` wywołuje `forceMarkLayoutSide` bez Y rzucającego. Wybiera więc tę samą połowę przy obu liniach. `openSideSign(force_sideline, y)` daje +1 zarówno przy y=5, jak i y=32.
- `isOpenSide` jest rozstrzygane względem środka boiska y=18.5, a nie rzucającego / konkretnego lane. Dwa symetryczne rzuty po przeciwnych stronach markera dostają tę samą etykietę.
- Force middle ustawia markera bliżej środka boiska, czyli fizycznie przesłania kierunek, który nazwa każe oddawać. Force sideline ustawia go bliżej linii. Należy uzgodnić jeden kontrakt: marker blokuje break side, a `openSideSign` wskazuje przeciwną stronę; dopiero potem stroić obronę.
- `resolveActiveForceGrip` używa identycznego rozwiązania dla middle i sideline mimo ich przeciwnych celów. Wymaga weryfikacji po ujednoliceniu kierunków, także dla lewej ręki i obu kierunków ataku.

Liczbowa reprodukcja: rzucający `(40,y)`, odbiorcy `(52,y-3)` / `(52,y+3)`, brak innych graczy; `evaluatePlayerSituation` i `forceMarkPosition`.

| Force | Y dysku | Offset markera Y | openSideSign | isOpenSide odbiorcy -3 / +3 |
|---|---:|---:|---:|---|
| forehand | 5 | -0.458 | -1 | false / false |
| forehand | 32 | -0.458 | -1 | true / true |
| backhand | 5 | +0.458 | +1 | true / true |
| backhand | 32 | +0.458 | +1 | false / false |
| middle | 5 | +0.433 | -1 | true / true |
| middle | 32 | -0.433 | +1 | true / true |
| sideline | 5 | -0.458 | +1 | false / false |
| sideline | 32 | +0.458 | +1 | false / false |

Skutek nie jest wyłącznie kosmetyczny: etykieta open/break steruje techniką rzutu, karą celności, preferencją breaków i wymaganą separacją. Nie należy maskować tego wzmacnianiem całych taktyk na podstawie samych wyników.

Metryki: zgodność znaku markera, helpera i klasyfikacji lane; właściwe odbicie przy zmianie linii; średnie Y celów/odbiorów; udział breaków; kierunek rotacji cup; celność według force i położenia dysku; pary lewo/prawo i home/away przy tym samym materiale zawodniczym.

## Dalsze hipotezy — nie traktować jako potwierdzone błędy balansu

- `creativity` ma zmianę progu akceptacji rzędu 0.12 punktu przy progu około 60. To dużo mniejsza skala niż osobiste instrukcje +5/-8. Pozostałe efekty kreatywności istnieją. Potrzebny pomiar per okazję przed zmianą wagi.
- `COACH_DIRECTIVE_PHASE` opisuje kreatywność jako ofensywną, ale `coachDirectiveMods` od niej uzależnia także poachChanceMult. Opis samej kreatywności wspomina poachy. Najpierw ustalić spójne znaczenie w UI, nie usuwać automatycznie zachowania.
- Część liczb w `TACTICS_MODIFIERS` to pozostałości dawnych modeli (`throwAccuracyBonus`, `throwRandomSpreadBonus`, `defenseBonus`, `blockBonus`, `spaceCreateBias` nie ma konsumentów poza deklaracją). Ich strojenie nie naprawi pełnego silnika. Geometria, tempo, reakcja, scoring i fizyczny lot mają aktywnych konsumentów.
- `tickZoneDefenderBrain` nie stosuje instrukcji tight/loose/shade do slotów niemarkujących. To może być właściwe dla strefy, ale należy traktować te konfiguracje jako potencjalnie nieadekwatne, zamiast oczekiwać identycznego efektu jak w person.
- Sama powtarzalność jednego seeda nie zapewnia porównania tych samych okazji po zmianie taktyki. Różne ścieżki decyzji zużywają RNG inaczej; pomiary kierunkowe powinny mieć odpowiednią liczbę par i osobne sondy geometryczne.

## Wymagania dla długiego testu

1. `fastMode:false`, a brak zapisu animacji tylko przez `collectFrames:false`. Działa wtedy pełna symulacja ruchu, decyzji i lotu.
2. Wyłączyć adaptację AI i rotację w bazowej macierzy. Test adaptacji i zmęczenia wykonać osobno. Rejestrować efektywną taktykę O/D po każdym turnoverze, a nie tylko ustawienia z wejścia.
3. `windLocked:true` w próbach kontrolowanych. Samo ustawienie `wind.speedMph=0` nie wyłącza driftu: `driftWind` ma minimum 2 mph. Próby naturalnego driftu nazwać i analizować oddzielnie.
4. Każdą taktykę mierzyć przeciw każdej obronie, w obu kierunkach wiatru i z zamianą składów. Silnik zamienia strony w kolejnych punktach, więc metryki upwind/downwind muszą używać `geoTeam`, nie surowego home/away.
5. Dla instrukcji i podról mieć mianowniki: czas gry, liczba posiadania dysku, aktywne okna cutu, liczba dostępnych deep/reset/break looków. Udział hucków w wszystkich rzutach może spaść mimo większej skłonności do deep, jeżeli jednocześnie rośnie liczba krótkich celnych podań.
6. Zapisać rzadkie anomalie i reprezentatywne replaye: brak ruchu przy aktywnym celu, limit aktywnych cutterów, skupienie handlerów, spóźniony cup, utrata krycia bez stanu poach, niemożliwy chwyt, ciągłe resety bez zysku.
7. Wyniki: hold%, break%, completion%, strata na posiadanie, punkty/posiadanie, przewaga punktowa i przedziały ufności po parach seedów. Nie celować we wspólne 50% dla każdej pary. Mierzyć interakcję styl × obrona × wiatr i brak jednej uniwersalnej strategii.
8. Oddzielić naprawy martwych instrukcji/skali/geometrii od strojenia. Po naprawach uruchomić ponownie te same scenariusze; dopiero pozostałe stabilne nierównowagi uzasadniają korekty wag.

## Wykonane istniejące testy

Wszystkie wymienione testy zakończyły się powodzeniem na audytowanym kodzie:

- `node scripts/test-tactical-behavior-fixes.mjs`: role runtime, registry modyfikatorów, instrukcje D-Line po turnoverze, nienaruszanie zapisu, cele handlerów, filler, przeciwne instrukcje przy stallach 1/5/6/7/8/9, integracja pełnego i uproszczonego punktu.
- `node scripts/test-cutter-offer-continuity.mjs`: kontynuacja tras, aktywne sloty i odpoczynek.
- `node scripts/test-pull-and-active-cutters.mjs`: pull, odbicia stron, skill, widoczność, granice, limit aktywnych cutterów; obejmuje pełne punkty.
- `node scripts/check-reset-cuts.mjs`: aktywna trasa resetu i zakończenie cutu.
- `node scripts/check-route-planning.mjs`: czas obejścia przeszkody i ruch obrony.
- `node scripts/test-new-playing-styles.mjs` oraz `test-style-specialties.mjs`: cechy, zwody, double move, specjalizacje, przejścia cutterów.
- `node scripts/test-full-no-replay.mjs`: pełny silnik z replayem i bez niego identyczny; po trzy punkty dla seedów 731 (0 mph), 70000 (28 mph, 90°), 70001 (18 mph, 180°), oraz przełączanie zapisu między punktami.

Zielone testy nie przeczą czterem reprodukcjom powyżej: żaden z tych testów nie sprawdza skutecznego rozpoczęcia reset-poachu, monotoniczności osobistego zakazu, skali okna instrukcji ani wspólnego kontraktu kierunków force.

## Przegląd planu długiej serii

Sprawdzono `scripts/tactics-balance-plan.mjs`. Plan przeplata macierz, instrukcje, dyrektywy, role, force, karierę i interakcje; zawiera pary z zamianą stron oraz blokadę wiatru. Istniejąca interakcja `instruction-overrides-poach` zmienia jednocześnie dyrektywę i instrukcję, więc nie odizoluje niemonotoniczności dodatkowego zakazu.

Zalecane dwa pierwsze kontrasty interakcji, przed obecnymi:

- `poach-ban-monotonicity`: wspólne `poachSeeking=-1`, poziomy brak instrukcji / `no_poach` / `poach`. Wynik osobistego zakazu porównywać bezpośrednio z samym zakazem drużyny.
- `reset-poach-isolation`: wspólne `poachSeeking=-1`, poziomy `poachResetHandler=0` / `=1` / `=1` + `no_poach`. Pierwsza para izoluje niedziałającą dyrektywę, trzecia pozwala świadomie ocenić konflikt po naprawie.

Istotne ograniczenie pętli `instruction`: `context='zone_cup'` ustawia obronę **przeciwnika**. To poprawna oś dla instrukcji ofensywnych, ale badana drużyna nadal broni `person`. Jeśli chcemy kontrolować tight/loose/shade/poach także w strefie, dla instrukcji defensywnych należy dodatkowo zmienić `homeConfig.defense`, nie tylko `awayConfig.defense`.

## Dodatek: prawdziwy limit rzutów w niepełnym składzie v1

Osobna deterministyczna reprodukcja `directive-00198-neutral-a` potwierdziła 120 rzeczywistych rzutów w punkcie 25 i sztuczny punkt przyznany przez fallback. Trzy kontuzje bez zastępstw zostawiły home w konfiguracji 4 na 7; kompaktowanie slotów dało trzech reset handlerów i jednego filler cuttera. Szczegóły, capture, fingerprint oraz rozdzielenie problemu badania od dalszych hipotez produkcyjnych są w [action-limit-review.md](action-limit-review.md). Baseline v1 jest diagnostyczny i wykluczony z kalibracji; ocena typowego ataku wymaga nowej serii z pełnymi składami.
