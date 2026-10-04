# Poprawka geometrii force — wdrożenie i walidacja

2026-10-03, po zakończeniu baseline. Wdrożono wspólny kontrakt opisany w `force-contract-review.md`. Nie zmieniono wag taktyk, premii, kary break (0.65 celności / +10 block risk), promienia markera (0.55 m), rozmiarów formacji ani długości resetów. Nie uruchamiano tutaj pełnych meczów; sparowaną walidację wyników prowadzi koordynator zadania na oddzielnych seedach.

## Zachowanie po zmianie

- FH/BH odnoszą się do strony praworęcznego rzucającego, zgodnie z UI. Obrót ataku odwraca globalne Y markera i open side. Zmiana RH na LH nie przestawia obrońcy, a technikę odwraca dokładnie raz.
- Middle otwiera kierunek środka i zasłania sideline; sideline działa przeciwnie. Oba odnoszą się do Y rzucającego. Kierunek ataku określa, który grip realizuje tę samą stronę boiska.
- Open/break jest oceniane lokalnie względem rzucającego, nie względem y=18.5. Marker, cele ataku, reset, clear, obrót cupa, inicjalizacja pola i technika korzystają z tego samego helpera.
- Zachowano surowy identyfikator force w `fieldViz`, zamiast zamieniać go wcześnie na `home/away/middle` i gubić straight/sideline.
- `point.js` przekazuje do wykonania rzeczywisty znak ataku przez `geo(possession)` oraz pozycję rzucającego z klatki zatwierdzenia decyzji. Fast path również przekazuje swój rzeczywisty `attackSign`. Kierunek nie jest zgadywany ze znaku `throwDx`, bo reset może lecieć do tyłu.

## Jawne rozstrzygnięcia neutralnych przypadków

1. Middle/sideline dokładnie na środku mają stronę 0 i mark na wprost. Nie losują ani nie preferują jednej linii.
2. Podanie dokładnie na osi Y rzucającego jest neutralne: `isOpenSide=true`, bez dodatkowej bocznej kary break. Tolerancja `1e-9` jest wyłącznie numeryczna, nie nowym pasem taktycznym. Faktyczną przeszkodę markera nadal sprawdza geometria toru.
3. Straight oraz neutralne middle/sideline oddają obie strony; technika wynika z rzeczywistego `throwDy`, znaku ataku i ręki. Dokładnie na osi zachowano fallback RH→FH / LH→BH.
4. Neutralny force nie zapada formacji do jednego Y: układ naprzemiennych slotów przyjmuje deterministyczną orientację zgodną z atakiem. Reset preferuje miejsce w kierunku środka, a w idealnym remisie znak ataku. To wybór slotu, nie etykieta open/break ani premia do podań.
5. `markShapeBias` nie wprowadza bocznego shade przy neutralnym markerze. Dla force kierunkowego zachowuje istniejące zmiany kąta i nie odwraca strony.
6. Nie dodano nowej strategii „flat trap na sideline” dla middle. Sformułowanie istniejącego UI pozostaje szersze od tej korekty geometrii.

## Pliki

| Plik | Zakres |
|---|---|
| `src/matchEngine/throwTechnique.js` | `forceOpenSideY`, `isForceOpenSide`, wrapper strony markera, grip RH i jedna zamiana ręki, kierunek neutralnego rzutu |
| `src/matchEngine/ai/defenderBrain.js` | Wyłącznie geometria markera, kontekst helpera w shade, kontekst open side cupa; zmiany stanów poachu należą do osobnego agenta |
| `src/matchEngine/ai/offenseReorganization.js` | Open/break/reset/clear i struktura według Y rzucającego oraz znaku ataku |
| `src/matchEngine/ai/spatialEvaluator.js` | Lokalne lane względem rzucającego |
| `src/matchEngine/ai/tacticsBehavior.js` | Wyłącznie openSign w `formationStructuralTarget`; bez strojenia i bez edycji poachu |
| `src/matchEngine/ai/throwerBrain.js` | Wyłącznie kontekst techniki przy skanowaniu: throwerY/attackSign/throwDy; zmiana skali risk scoringu należy do koordynatora |
| `src/matchEngine/resolution.js` | Ten sam kontekst w niezależnym odtworzeniu techniki wykonania |
| `src/matchEngine/point.js` | Geometria rzeczywistego rzucającego podczas zatwierdzenia oraz znak ataku w obu ścieżkach |
| `src/matchEngine/ai/actionSimulator.js` | Początkowe shade przy cutterze używa Y rzucającego i kierunku ataku |
| `src/matchEngine/ai/cutterBrain.js` | Kontekst force w istniejącym legacy fallbacku cutu |
| `src/matchEngine/fieldViz.js` | Pełny force w inicjalizacji/resync person; właściwy mark i obrót cup/wall w inicjalizacji |
| `scripts/test-tactics-force-geometry.mjs` | Nowa regresja geometryczna oraz rzeczywisty scan→execution |
| `scripts/probe-tactics-balance-mechanisms.mjs` | Tylko dodatkowy throwerY/attackSign w wywołaniach helperów sondy geometrii. Stary baseline ignoruje nieznane argumenty. Zachowano zmianę odczytu progów risk scoringu wykonaną przez koordynatora |

`fieldMotion.js` pozostał bez zmian: jego aktywne wywołania już przekazują `attackSign` do centralnego markera. Nie usuwano przy okazji starych, niezwiązanych problemów lint.

## Wyniki sprawdzeń

`node scripts/test-tactics-force-geometry.mjs` — **PASS**, exit 0:

- 180 scen lane: 5 force × 2 kierunki × RH/LH × Y={5,18.5,32} × lokalne Y={-3,0,+3}; zgodność markera, helperów, evaluatora, techniki i wykonania, niezmieniona kara break.
- Promień, blokowana strona i obrót całej sceny o 180° dla `markShapeBias=-1/0/+1`.
- Lokalne lane przy y=2/35, migracja starszych nazw force, pozycje przy y=0.5/36.5, granice reset/clear oraz niezależność strony force od Y cuttera.
- Inicjalizacja person/cup/wall zachowuje tę samą pozycję markera co runtime; cup korzysta z tej samej strony.
- **80 rzeczywistych decyzji `scanThrowOptions` → niezależne `resolveThrow`**, obejmujących obie ręce, `sidesSwapped`, wszystkie force i neutralne strony. Wykonanie odtwarza technikę bez podawania gotowego `throwTechnique`, więc test wykrywa zgubiony kontekst.

ESLint dla 11 zmienionych plików źródłowych oraz nowego testu i sondy — **PASS**, exit 0. W pierwszym przebiegu dodatkowo sprawdzono niezmieniony `fieldMotion.js`: zgłosił stare nieużywane symbole. Nie włączano ich naprawy do tego zadania.

`node scripts/smoke-match-stats.mjs` — **FAIL istniejącej asercji statystyk**, po przejściu trzech asercji techniki RH/FH, RH/break i LH/open. Test oczekuje `defenderReactionDelayMs({id:999,skills:{}}) === 200`, a aktualny wzór daje 188. Bezpośredni odczyt **zamrożonego baseline** `snapshot/src/matchEngine/ai/statFormulas.js` potwierdził ten sam wynik 188. Nie zmieniono testu ani wzoru w celu uzyskania zielonego wyniku. Nowa macierz niezależnie sprawdza technikę i wykonanie, których starszy smoke nie zdążył w całości wykonać.

## Granice dowodu

To potwierdza spójność mechaniki i przepływu kontekstu. Nie dowodzi konkretnej przewagi wynikowej FH, BH, middle ani sideline i nie uzasadnia strojenia ich wag. Pełne sparowane mecze po zmianach oraz ewentualne anomalie HEX są osobną walidacją. Neutralne przypadki są jawnymi decyzjami projektowymi, a nie wynikiem estymacji ze zwycięstw baseline.
