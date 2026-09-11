# Planowanie drogi i ruch bez dysku — 9 września 2026

**Status walidacji: NIEZALICZONA — jeden punkt doszedł do awaryjnego limitu. Poprawa geometrii nie oznacza zakończenia balansu.**

Rozszerzono wcześniejsze omijanie przy odbiorze o koszt drogi w planie przechwytu oraz ruch cutterów i obrońców bez dysku. Nie strojono współczynników celności, chwytu ani bloków.

Planer sprawdza przeszkodę na całej drodze do rozpatrywanego punktu. Dodaje koszt wydłużenia trasy i skrętu przy bocznym punkcie obejścia. Zajęty punkt odbioru przesuwa do obrysu gracza i ponownie ocenia, czy ręka dosięga dysku. Rzucający uwzględnia obserwowanych partnerów i przeciwników; odbiorca korzysta z własnej percepcji i pamięci. Plan nie otrzymuje przyszłych rzeczywistych pozycji graczy.

Lokalne omijanie działa teraz także podczas cutów, powrotów na pozycję, drobnych kroków oczekiwania i ruchu obrony. Ruch czyta wspólne pozycje sprzed kroku. Drobne losowe kroki oczekiwania przechodzą przez integrator przyspieszenia i hamowania zamiast bezpośrednio zmieniać współrzędne. Nie ma odsuwania sylwetek po wyniku kontaktu.

Diagnostyka rzutu zapisuje plannedDetourSec i plannedAvoidedId; odczyty odbiorcy również zapisują koszt obejścia. Sama obecność przeszkody w diagnozie nie dowodzi przyczyny straty.

## Kontrolowane sytuacje

17 sytuacji × 2 warstwy × 256 seedów × 3 warianty = 26 112 przebiegów. Kontrola wyłącza planning i offBall; zachowuje wcześniejsze omijanie podczas lotu. Pierwsze dwa warianty mają te same seedy; trzeci rozłączne. Tabela: chwyty / 256 w warstwie wykonania.

| Sytuacja | Kontrola | Nowa wersja | Inne seedy |
|---|---:|---:|---:|
| incut | 252 | 252 | 256 |
| reset | 254 | 254 | 256 |
| turn_toward | 256 | 256 | 256 |
| turn_away | 254 | 254 | 256 |
| double_coverage | 222 | 216 | 224 |
| deep_open | 252 | 252 | 250 |
| sideline | 256 | 256 | 256 |
| returning_arc | 256 | 256 | 256 |
| outside | 0 | 0 | 0 |
| toe_in | 256 | 256 | 255 |
| toe_out | 0 | 0 | 0 |
| tip_recovery | 256 | 256 | 256 |
| wind_0 | 248 | 248 | 252 |
| wind_90 | 247 | 247 | 255 |
| wind_180 | 252 | 252 | 253 |
| aim_error_reset | 256 | 256 | 256 |
| fatigued_incut | 236 | 236 | 244 |

Podwójne krycie, nakładanie sylwetek podczas lotu: 27.76% / 25.64% / 25.65%. Proste próby bez przeszkód nie zmieniły wyniku w sparowanej kontroli.

W warstwie wykonania 28 wcześniejszych chwytów zmieniło się w straty (interception: 22, not_in_reach: 2, landing_drop: 3, lane_block: 1), a 22 wcześniejsze straty w chwyty. Wszystkie zmiany wyników dotyczą double_coverage. To zmiana dynamiki kontaktów, nie jednokierunkowa kara za tłok.

## Pełne mecze

Po 8 meczów kontroli i końcowej wersji, offset 52400, standardowa pogoda, adaptacja i rotacja. Dodatkowe 8 meczów z offsetem 61437: 20 mph, kierunek 90°, rozłączne seedy. Zespoły demonstracyjne nie są równe. Wszystkie sześć serii ma identyczne hashe plików silnika, modeli graczy i danych składów; nie wykryto zmian tych źródeł w czasie przebiegów.

| Wskaźnik | Kontrola | Nowa wersja | Walidacja 20 mph / 90° |
|---|---:|---:|---:|
| Celne podania (%) | 84.43 | 84.99 | 85.78 |
| Klatki lotu z nakładaniem sylwetek (%) | 20.86 | 9.89 | 10.51 |
| Bloki/mecz | 13.50 | 15.88 | 17.75 |
| Straty/punkt | 1.79 | 1.70 | 1.75 |
| Podania/punkt | 11.53 | 11.36 | 12.32 |
| Hold (%) | 34.62 | 48.63 | 47.21 |
| Stall-out/mecz | 0.00 | 0.00 | 0.00 |
| Awaryjne limity | 0.00 | 0.00 | 1.00 |

Wskaźnik nakładania liczy klatki IN_FLIGHT z przynajmniej jedną parą nakładających się kół o promieniu połowy szerokości barków. Pomija różnicę wysokości ponad 1,5 m. Nie mierzy fauli ani fazy przygotowania rzutu; nie dowodzi usunięcia wszystkich kolizji. Mianowniki znajdują się w route-summary.json.

**Otwarta regresja.** Seed 105437, wiatr 20 mph / 90°, punkt 13: 120 celnych podań bez straty, w tym 112 dumpów/swingów, 6 standardowych i 2 hucki. Najdłuższa seria resetów wynosi 42; ślady reprezentują 511,26 s. Dysk kończy przy x=2,14 m. To powtarzalna pętla wyboru bezpiecznych podań, nie dowód fizycznego unieruchomienia. Silnik następnie przyznaje punkt przez istniejący fallback throw_limit. Kontrola z wyłączonym nowym planowaniem i ruchem bez dysku na tym samym seedzie nie osiąga limitu (najdłuższy punkt: 39 podań). Nie zwiększono limitu ani nie wymuszono losowej straty, aby ukryć problem. Dane: route-limit-enabled.json i route-limit-control.json; odtwarzanie: node scripts/diagnose-route-limit.mjs oraz wariant --control.

## Weryfikacja i ograniczenia

Test check-route-planning weryfikuje dodatkowy czas obejścia, zajęty punkt chwytu, niezmienioną otwartą drogę, obrót sceny oraz ograniczony fizycznie ruch obrońcy bez przesuwania przeszkody. Przeszły check-disc-intercept, check-body-traffic, check-player-behavior, check-recommendations i check-engine-realism (8 meczów fast), targetowany ESLint i build. Build zgłasza istniejący duży bundle.

Przeszedł check-disc-flight: 4 pełne mecze, 1240 chwytów i 242 straty, weryfikacja wspólnego toru, ciągłości pozycji, kontaktu i posiadania po przejęciu. Ta próba nie obejmuje problematycznego seeda walidacji; testy regresyjne przeszły, lecz kryterium balansu bez limitów nie zostało spełnione.

Koszt drogi jest przybliżeniem dla jednej najbliższej przeszkody, nie pełnym wyszukiwaniem trasy. Planer nie przewiduje wszystkich przyszłych ruchów przeciwników, a lokalne omijanie nie rozwiązuje twardych kolizji, początkowego nakładania ani wszystkich layoutów. Różnica skuteczności sama w sobie nie dowodzi lepszego balansu. Osiem meczów na wariant oraz brak zewnętrznych danych meczowych nie pozwalają uznać całej ligi za empirycznie skalibrowaną.

Najpilniejsza dalsza poprawka: ocena całego posiadania po serii resetów, z ponownym otwieraniem kierunku ataku i koordynacją cutów. Hipoteza wymaga sprawdzenia opcji odrzuconych przez rzucającego: sama kara za dump może wymusić zły rzut zamiast naprawić brak możliwości progresji. Następnie pozostające nakładanie przy przecinających się trasach, koszt obliczeń i diagnoza unknown_no_contact.

Czasy serii uruchamianych równolegle nie są porównywalnym benchmarkiem. route-pilot oraz serie route-control/final/validation są wcześniejsze: w czasie pracy zmieniono generowanie osobowości i traitów. Końcowe porównanie korzysta wyłącznie z powtórzonych serii route-v2. Pomiar route-timing wykonano po zmianie traitów.

Orientacyjnie, po dwa mecze na tych samych seedach, sekwencyjnie: 12.70 → 17.33 s/mecz; 0.291 → 0.452 ms/klatkę. Zmieniają się liczba i długość akcji. Próba nie izoluje kosztu poszczególnych funkcji i obejmuje diagnostykę; nie jest stabilnym benchmarkiem wydajności.

## Odtwarzanie

```powershell
node scripts/balance-engine.mjs --situations --n 256 --no-route-planning --no-offball-traffic --output artifacts/scenarios/route-v2-control.json
node scripts/balance-engine.mjs --situations --n 256 --output artifacts/scenarios/route-v2-final.json
node scripts/balance-engine.mjs --situations --n 256 --offset 81000 --output artifacts/scenarios/route-v2-validation.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 52400 --no-route-planning --no-offball-traffic --output artifacts/engine-audit/route-v2-control.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 52400 --output artifacts/engine-audit/route-v2-final.json
node scripts/balance-engine.mjs --fast 0 --full 8 --offset 61437 --wind 20 --direction 90 --output artifacts/engine-audit/route-v2-validation.json
node scripts/check-route-planning.mjs
node scripts/report-route-balance.mjs
```
