# Ciągły powrót cuttera zza linii — walidacja

2026-10-03, po baseline. Zmieniono wyłącznie zachowanie granic ruchu w `src/matchEngine/ai/cutterBrain.js` oraz dodano `scripts/test-cutter-boundary-continuity.mjs`. Zachowano wcześniejszą poprawkę force, cele taktyczne i wagi oraz istniejącą fizykę przyspieszenia/skrętu/prędkości.

## Potwierdzona przyczyna

Deterministyczne odtworzenia pełnych meczów w `artifacts/engine-audit/tactics-balance-2026-10-03-diagnostics/*-motion-alarms.json` zawierają trzy skoki continuation cuttera przy `isActive=false→true`, 4400→4500 ms:

- `interaction-00222-low-b`: `development-balanced-0-b-p4`, y=-1.510903→0.5;
- `instruction-00414-shade_under-a`: `development-balanced-1-a-p9`, x=102.578873→99.5;
- `force-00667-configured-b`: `development-balanced-2-a-p9`, y=-1.469212→0.5.

W każdym przypadku cel był wewnątrz boiska, a prędkość skierowana do środka. Nieaktywny early return zachowywał pozycję wyliczoną przez `integrateAgentMotion`; gałąź aktywna na końcu clampowała CAŁĄ pozycję. Sama zmiana aktywności teleportowała zawodnika do wewnętrznego marginesu 0.5 m.

## Poprawka

- Końcowy zwrot zachowuje fizyczne x/y. Cel jest ograniczony do pola; ciało może chwilowo wybiec poza linię przez bezwładność i musi wrócić biegiem.
- Nieaktywny zawodnik za linią kontynuuje powrót również wtedy, gdy do slotu zostało mniej niż 0.6 m. Ograniczany jest ewentualny zapisany cel `structureSlot`, nie pozycja.
- WAITING za linią korzysta z integracji ruchu również przy drift≤1.5 m; nie przechodzi w jitter/postój poza polem. Raportowany target odzwierciedla cel powrotu.
- Bieżące targetX/Y oraz cele po `crowdAwareTarget` i jitterze są ograniczane przed ruchem. Zapobiega to wypchnięciu legalnego celu poza boisko przez lokalną korektę tłoku. Istniejące `bodyAwareTarget` może nadal uwzględniać fizyczny promień zawodnika.
- Nie dodano korekty pozycji do wcześniejszego return ani do integratora. Nie zmieniono opóźnień rozpoczęcia cutu, stanów poachu, prędkości maksymalnych czy wag taktycznych.

Read-only przegląd drugiego agenta potwierdził, że trzeba uwzględnić próg postoju 0.6 m w nieaktywnej gałęzi oraz cele po crowd/jitter; same usunięcie końcowego clamp nie rozwiązywałoby tych sąsiednich przypadków.

## Sprawdzenia

`node scripts/test-cutter-boundary-continuity.mjs` — **PASS**:

- 18 sekwencji inactive→active i powrotu: dt=20/100 ms, wszystkie cztery krawędzie, narożniki oraz współrzędne/prędkości z trzech alarmów;
- każdy krok jest skończony, przemieszczenie≤maxSpeed×dt, wektor prędkości≤maxSpeed; aktywacja nie usuwa pozostałego dystansu powrotu, zawodnik ostatecznie wraca do środka;
- powrót z tuż za każdą linią przy dystansie<0.6 m od slotu, zarówno inactive, jak i aktywny WAITING;
- naturalny wybieg przez linię z prędkością skierowaną na zewnątrz — po aktywacji pozostaje ciągły;
- legalne cele i ruch przy krawędziach po crowd/jitter w WAITING i ACTIVE_CUT, z body avoidance włączonym oraz wyłączonym.

`node scripts/test-cutter-offer-continuity.mjs` — **PASS**: zachowanie trwających tras, continuation, limitu cutterów, priorytetu filler i odpoczynku.

`node scripts/check-reset-cuts.mjs` — **PASS**: aktywna trasa resetu, inicjacja, clearing, pojemność slotów i zakończenie cutu; test odtwarza także dawny błąd resetu.

ESLint `cutterBrain.js` i nowego testu — **PASS**. `git diff --check` dla tych zmian — **PASS**.

## Porównanie z zamrożonym silnikiem

`cutter-boundary-before-after.json` zapisuje odtworzenie tego samego pojedynczego stanu alarmowego (pozycja/prędkość pierwszego alarmu, dt=100 ms, demo continuation cutter, bez zmiany seeda). To sonda przyczyny, nie pełny replay meczu ani izolowana ocena wyniku taktyki.

| Wersja | Przemieszczenie / 100 ms | Limit fizyczny | Końcowe Y |
|---|---:|---:|---:|
| Frozen baseline | 2.014558 m | 0.6444 m | 0.5 — skok na linię |
| Bieżący kandydat | 0.283581 m | 0.6444 m | -1.251519 — ciągły powrót |

Bieżący kandydat zawiera także wcześniejszą poprawkę geometrii force, dlatego drobna różnica wektora kierowania nie jest izolowaną estymacją tej jednej zmiany. Przekroczenie limitu oraz skok na 0.5 w frozen baseline bezpośrednio odtwarzają problem clampowania ciała.

Pełne odtworzenia trzech meczów i sparowane mecze końcowego kandydata pozostają po stronie koordynatora zadania. Ta walidacja nie zastępuje ich i nie ocenia nowego balansu wyników.
