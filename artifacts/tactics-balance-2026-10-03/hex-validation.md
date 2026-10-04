# HEX: ciągłość geometrii między ustawieniem i ofertą po chwycie

Naprawa po nocnym baseline, na podstawie powtarzalnych reset-loopów i diagnostyki candidate-v1. Snapshot candidate-v1 oraz wyniki baseline pozostały niezmienione. Nie uruchamiano w tej podpracy pełnych meczów; efekty meczowe ocenia koordynator w oddzielnym holdoucie.

## Potwierdzony mechanizm

`layoutOffenseHex` ustawia sześciu kolegów na promieniu 9 m pod kątami `[0,60,120,180,-120,-60]` względem rzucającego. `stackIndex` wynika z kolejności z aktualnym rzucającym na początku, natomiast podrole wynikają ze stałego przydziału w składzie. W efekcie po chwycie cuttera pierwsi dwaj gracze pierścienia są handlerami.

`formationStructuralTarget` obsługiwał `isDump` i awaryjny dwuhandlerowy reset przed gałęzią HEX. Zamieniał więc pierwszy lub pierwsze dwa przednie wierzchołki w cele 1,5 m za dyskiem. Osobna reorganizacja po chwycie ponownie wybierała cel wyłącznie z resetowych komórek mapy, nawet gdy dostała prawidłowy slot formacji.

Sonda wszystkich siedmiu aktualnych rzucających na środku boiska:

| Rzucający | Przednie wierzchołki layoutu | Przednie cele struktury przed poprawką | Po poprawce |
|---|---:|---:|---:|
| Każdy z 2 handlerów | 3 | 2 | 3 |
| Każdy z 5 cutterów | 3 | 1 | 3 |

Przy rzucającym będącym cutterem aktywne role primary/secondary/continuation zajmowały pozostałe tylne sloty; jedyny zachowany przedni slot otrzymywał filler. To nie dowodzi, że każda jego okazja powinna być dopuszczona przez selekcję rzutu — dowodzi utraty zamierzonej geometrii przez nadpisanie slotów.

Scena referencyjna: `candidate-v1/reproduction/diagnostic-points/matrix-00028-configured-a/point-06.json`, skan 1057. Atak w kierunku malejącego X, rzucający p13 w X=55,290. Handler p5 ma cel X=56,790, handler p6 pozostaje za dyskiem; secondary p2 i continuation p9 mają cele około X=59,790 / 64,290, jedyny przedni pas X=50,790 zajmuje nieaktywny filler p16. Skład startowy potwierdza podrole niezależnie od aktualnej kolejności layoutu.

## Zmiana

- `hexSlotTarget` współdzieli dotychczasowe sześć kątów i promień między `fieldViz` oraz `formationStructuralTarget`.
- HEX rozstrzyga własny cel strukturalny przed ogólną obsługą dump/reset. Nie zmieniono kolejności kątów ani przypisań podról.
- W `cutterBrain` wybór wsparcia/resetu po chwycie w HEX zachowuje jego istniejący slot strukturalny. Pozostają stany, fizyka ruchu, specjalizacje handlerów i ich preferencje decyzji. Inne formacje nadal korzystają z dotychczasowego poszukiwania resetu.
- Nie zmieniono limitów aktywnych cutterów, wag rzutów, atrybutów, selekcji odbiorcy, bonusów taktyk ani rezultatów.

## Walidacja

`node scripts/test-hex-structural-continuity.mjs` — PASS:

- 7 rzucających × 2 kierunki ataku, 84 wierzchołki: cele live zgadzają się z zadeklarowanym pierścieniem i layoutem, pozostaje 6 oddzielnych miejsc i 3 przednie wierzchołki.
- Zachowane dwie specjalizacje handlerów, podrole i przydzielona aktywność cutterów.
- 24 krótkie sceny rzeczywistego mózgu handlera po chwycie: support/reset zachowuje slot, rozpoczyna fizyczny ruch do przodu, bez skoku pozycji.
- Pełna pętla akcji z przeniesionym stanem poprzedniej akcji, nowym rzucającym-cutterem i jego rzeczywistą pozycją jako punktem przyjęcia: obaj handlerzy zachowują przednie oferty w obu kierunkach (4 oferty), a trzy przednie cele wsparcia nie znikają. Jest to deterministyczna scena granicy akcji, nie pełny mecz ani pomiar skuteczności samego chwytu.
- 6 kontroli innych formacji: dwuhandlerowe ustawienia nadal szukają resetu za dyskiem także po chwycie.

432 kontrolowane wywołania non-HEX przed/po mają identyczne wyniki (6 formacji × 2 strony × 3 szerokości dysku × 6 slotów × 2 ustawienia `isDump`). Dane odniesienia zachowane w `non-hex-structural-before.json`.

Parametry generatora tych kontroli: `disc={x:50,y}`, `throwerPos={x:50,y}`, `forceSide='force_forehand'`, `handlerSlotIndex=stackIndex%3`, `rng.float()=0.5`; `attackStyle`, `possessionTeam`, `y`, `stackIndex` i `isDump` są zapisane w każdym rekordzie. Jawny indeks handlera jest istotny przy odtwarzaniu stron resetu.

`test-tactical-behavior-fixes.mjs`, `test-cutter-offer-continuity.mjs` i ESLint zmienianych plików — PASS. Wpływ na cztery niepoprawne przypadki candidate-v1 i niezależne seedy wymaga oddzielnego pomiaru pełnego silnika; ten dokument nie deklaruje usunięcia wszystkich reset-loopów.
