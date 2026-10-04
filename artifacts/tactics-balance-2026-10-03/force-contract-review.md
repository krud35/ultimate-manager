# Kontrakt force — przegląd przed wdrożeniem

2026-10-03, przed 06:00 Europe/Warsaw. Przegląd READ-ONLY kodu i istniejącej reprodukcji. Nie zmieniono źródeł, testów ani baseline; nie uruchamiano nowych sond ani meczów. Uzupełnia punkt 4 w `engine-review.md`, nie jest wynikiem eksperymentu balansu.

## Co wynika z repo

- `tacticsModifiers.js:238–280` opisuje FH jako wymuszenie forehandu **u RH**, middle jako kierunek do środka, sideline jako kierunek do najbliższej linii, straight jako mark na wprost oddający krótkie podania w obie strony.
- `scripts/smoke-match-stats.mjs:43–65` świadomie wymaga, aby przy tym samym force FH otwarta technika LH była **backhandem**. Force FH/BH jest więc nazwą strony dla praworęcznego, nie poleceniem adaptowania markera do ręki aktualnego rzucającego. Zachować ten kontrakt.
- Współrzędne są globalne: szerokość 37 m, `cy=18.5`. `point.js:477` przekazuje `geo(possession)` do `runThrowMotionSimulation`; `actionSimulator.js:895` z tego wylicza znak ataku. Nie ma normalizacji, która obracałaby Y na stały kierunek ataku. `geoTeam` zmienia etykietę geometryczną, nie rękę gracza i nie współrzędną Y.
- Marker blokuje break side: potwierdzają to komentarze i obliczenia `markShapeBias` w `forceMarkPosition`. Jego offset Y i `breakSideSign` powinny mieć ten sam znak, a `openSideSign` przeciwny.

## Proponowany pojedynczy kontrakt geometryczny

Nie używać etykiet `home/away` jednocześnie jako drużyn, stron markera i gripów. Wspólny helper powinien oddawać **znak otwartej strony w globalnym Y** oraz przeciwny znak break. Nie wymaga nowej zależności od dominującej ręki.

Niech `a` oznacza rzeczywisty znak ataku ±1, `t` Y rzucającego, a `o` otwartą stronę w Y. Konwencja zgodna z dotychczasowym RH przy ataku +X:

| Force | `o` poza remisem w środku | Znak offsetu Y markera | Technika na open dla RH / LH |
|---|---|---|---|
| FH | `a` | `-a` | FH / BH |
| BH | `-a` | `a` | BH / FH |
| Middle | `sign(cy-t)` | `-o` | FH / BH, jeśli `a*o>0`; odwrotnie, jeśli `<0` |
| Sideline | `sign(t-cy)` | `-o` | jak wyżej; przeciwna do middle w tym samym miejscu |
| Straight | 0 | 0 | z kierunku konkretnego podania; brak jednej wymuszanej techniki |

FH/BH po zmianie kierunku ataku muszą odwrócić globalne Y, jeśli zachowujemy obietnicę UI „FH u RH”. Middle/sideline zachowują cel geometryczny w Y przy samej zmianie kierunku X; zmienia się za to technika umożliwiająca rzut. Jest to wniosek z kontraktu UI i globalnych współrzędnych, a nie wynik nowych meczów.

Ocena lane powinna używać `receiverY - throwerY`, nigdy `receiverY - cy`. Dla niezerowego `o` wartość `(receiverY-throwerY)*o` wskazuje open/break. Rękę stosować **raz**, na etapie techniki. Najprostsza migracja zachowuje `resolveActiveForceGrip` jako stronę odpowiadającą technice RH: zwraca FH, gdy `a*o>0`, BH w przeciwnym razie; istniejąca pojedyncza zamiana dla LH zostaje w `resolveThrowTechnique`. Alternatywnie helper może zwracać technikę rzeczywistej ręki, ale wtedy nie wolno jej ponownie odwracać.

## Potwierdzone rozbieżności i ryzyka

1. `breakSideSign` zwraca znak przeciwny do aktualnego offsetu markera FH/BH. `openSideSign` wskazuje więc w stronę ciała markera. Zgubiono też `throwerY` w `breakSideSign`, więc sideline nie reaguje poprawnie na zmianę linii.
2. `forceMarkPosition` dla middle zasłania kierunek środka, a dla sideline kierunek najbliższej linii. To jest odwrotność opisów UI, niezależnie od doboru siły markera.
3. `evaluatePlayerSituation:87–100` klasyfikuje względem połowy boiska; przeciwne lokalne lane przy y=5 lub 32 dostają tę samą etykietę. To błąd odniesienia, nie dowód, że każda taka opcja powinna mieć określoną skuteczność.
4. `resolveActiveForceGrip` traktuje middle i sideline identycznie. Dodatkowo `resolveMiddleForceGrip` zmienia wynik dla LH, a `resolveThrowTechnique` robi drugą zamianę. W efekcie przy middle i tym samym Y open technika wychodzi taka sama dla obu rąk. To sprzeczne z wymienionym kontraktem geometrycznym.
5. Żaden z powyższych helperów Y/gripu nie otrzymuje znaku ataku. Samo naprawienie minusów dla +X pozostawi błędną geometrię FH/BH dla -X i błędny grip middle/sideline.
6. `fieldViz` zamienia force na `home/away/middle`, po czym podaje tę uproszczoną wartość do `forceMarkPosition`. Traci w ten sposób m.in. rozróżnienie straight/middle i dynamiczne sideline. To dodatkowa niespójność inicjalizacji/widoku; pełny `actionSimulator` następnie ustawia thrower marker jeszcze raz. Nie przypisywać zatem całego błędu widoku końcowej fizyce meczu.

## Minimalne miejsca poprawki po 06:00

1. `throwTechnique.js`: jedna definicja stron (Y rzucającego + znak ataku), wrapper `forceMarkLayoutSide` o jasno opisanym znaczeniu **strony markera**, poprawione `resolveActiveForceGrip`/`resolveThrowTechnique`. Zachować migrację starych identyfikatorów force. Nie zmieniać tu wartości kary break 0.65/+10 — najpierw naprawić to, które rzuty ją dostają.
2. `defenderBrain.js:68 forceMarkPosition`: użyć strony break; zachować radius 0.55, istniejące wielkości shade i działanie markShape. `tickZoneDefenderBrain:803` musi podać `attackSign` do open-side helpera. Zwykły downfield `shadeGoalAt:530` ma osobną logikę threat/cushion; nie zmieniać jej wag przy okazji. Jego wywołanie layout helpera również musi otrzymać kontekst rzucającego i kierunek.
3. `offenseReorganization.js`: `breakSideSign`, `openSideSign`, `resetLateralSign` i konsumenci. `pickBreakSideClearTarget` ma dostęp do `disc.y`; `resetSlotTarget` do `oy` i `attackSign`. `computeDynamicOffenseTarget:140` powinien używać **oy rzucającego**, nie Y poruszającego się cuttera. Tak samo `tacticsBehavior.js:369` w strukturze ataku.
4. `spatialEvaluator.js`: wspólna strona i lokalne przesunięcie od `throwerPos?.y ?? disc?.y`; znak ataku z już geometrycznego `possessionTeam` albo jawnego parametru. Nie używać Y odbiorcy jako zastępczego Y rzucającego w scenie, która ma dysk.
5. `throwerBrain.js:915` przekazuje technice kierunek oraz lokalny kierunek podania dla straight/remisu. `resolution.js:263/274` oraz jego rzeczywiści wywołujący muszą stosować ten sam kontekst; nie zgadywać kierunku ataku ze znaku `throwDx`, bo reset bywa rzutem do tyłu. Wybrana technika w decyzji i wykonaniu musi pozostać identyczna.
6. Spójność pozostałych konsumentów: `actionSimulator.js:631 shadeMarkBesideOffense` (znak ataku i Y rzucającego, nie automatycznie krytego cuttera); `fieldViz.js:408/428/566` (zachować pełny force do markera); `cutterBrain.js:153/442` (legacy fallback, dostarczyć discY/attackSign). `fieldMotion` wywołuje `forceMarkPosition` z kierunkiem, więc korzysta z centralnej poprawki; sam import layout helpera nie oznacza aktywnego konsumenta.

## Decyzje jeszcze niedookreślone — rozstrzygnąć jawnie

- Dokładnie `t=cy`: nie ma bliższej linii ani kierunku do środka. Rekomendowany symetryczny fallback to `o=0` i marker na wprost, bez losowania. To wybór projektowy, nie potwierdzona intencja istniejącego UI. Nie utrwalać automatycznie obecnego `>=` wybierającego jedną połowę.
- Podanie dokładnie wzdłuż osi ataku lub w bardzo wąskim pasie wokół niej: binarne `isOpenSide` nie ma stanu neutralnego. Ustalić epsilon i traktowanie remisu w jednym helperze; dotychczasowe 0.8 m nie jest dowodem poprawnego nowego progu. Konserwatywny neutralny fallback bez bocznej kary break ogranicza ryzyko przypadkowej kary dla każdego prostego podania. Trudność przejścia obok rzeczywistego markera ma osobne mechanizmy.
- Straight ma oddawać obie strony short; nie dodawać kary break do jednej połowy w celu wybrania techniki. Technika może wynikać z lokalnej strony rzutu i ręki, a trudność deep nadal z istniejącej logiki straight. Przy rzucie idealnie na osi można zachować dotychczasowy deterministyczny fallback, dokumentując go.
- Opisy middle wspominają „flat trap na sideline”. Sama korekta kierunku nie implementuje nowej przełączanej strategii trap. Nie dodawać jej bez osobnego dowodu i projektu.
- Downfield krycie własną pozycją ma brać otwartą stronę; obecny threat-based blend miesza kilka przesunięć. Korekta nazwy layout/znaków nie uzasadnia strojenia tego blendu ani rozkładu cupa bez regresji ruchu.

## Minimalne asercje po wdrożeniu

Macierz bez pełnych meczów: 5 force × atak ±1 × ręka RH/LH × Y={5,18.5,32}; odbiorcy lokalnie ±3 m oraz na osi. Dodatkowo kilka pozycji tuż przy liniach dla clampowania. Nie potrzeba losowych tysięcy scen.

- Poza neutralnymi przypadkami: `openSign === -breakSign`, offset markera zgodny z break; lokalne ±3 m mają przeciwne etykiety; otwarta etykieta wskazuje przeciwną stronę niż marker. Marker zachowuje 0.55 m przed clampowaniem i skończone wartości.
- Middle otwiera kierunek środka, sideline kierunek linii; odbicie Y `37-y` odwraca ich znaki. Zmiana kierunku X odwraca FH/BH, ale nie cel middle/sideline. Obrót całej sceny o 180° zachowuje etykiety i techniki; zwykłe odbicie przestrzeni i zamiana RH↔LH powinny zachować fizyczny sens techniki.
- FH/BH dają na open odpowiednio FH/BH dla RH i odwrotnie dla LH w obu kierunkach. Middle i sideline mają przeciwne gripy, a LH odwraca technikę dokładnie raz. Straight ma obie strony open, ale przeciwne lokalne strony mogą użyć różnych technik.
- Reset, clear target, cele struktury i kotwice strefy korzystają z Y **rzucającego**: przeniesienie samego cuttera przez środek nie zmienia force. Zamiana linii dysku zmienia dynamiczny force spójnie u wszystkich konsumentów.
- `markShapeBias` ±1 zachowuje stronę force dla niezerowego shade; różni kąt/radius zgodnie z istniejącą intencją. Sprawdzić też neutralny straight/środek, aby nie wprowadzić ukrytej preferencji jednej strony.
- Jeden test integracyjny decyzja→wykonanie→pozycja markera w obu kierunkach, z `sidesSwapped`, wykrywa zgubiony kontekst. Potem pełne sparowane mecze na osobnych seedach oceniają skutki, bez wymuszania identycznych wyników FH/BH/middle/sideline.

Istniejąca sonda mechanizmów potwierdza niespójności obecnej wersji, ale sama nie jest wystarczającą regresją: nie przekazuje attackSign do helperów Y/gripu, używa tylko Y=5/32 i nie porównuje decyzji z wykonaniem. Wyniki meczów baseline pozostają nietknięte.
