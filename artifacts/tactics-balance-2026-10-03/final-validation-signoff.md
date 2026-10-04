# Niezależny signoff końcowej walidacji

Sprawdzono końcowy `validation/comparison/comparison.json` wygenerowany 2026-10-03 o 20:15:08 UTC, zamrożone pliki obu wersji, aktualne źródła oraz osobno wszystkie 996 surowych wyników. Bez zmian źródeł, głównego raportu, snapshotów i bez nowych meczów.

**Dane i pochodzenie: PASS.** Nie stwierdzono rozbieżności podważającej końcowe porównanie. To potwierdzenie danych i wdrożonego kandydata, nie dowód globalnego zbalansowania wszystkich taktyk.

## Pochodzenie i liczebność

- BEFORE: 400/400 zapisanych hashy źródeł zgodnych ze snapshotem. AFTER: 401/401 zgodnych ze snapshotem oraz 401/401 zgodnych z bieżącymi plikami projektu. Kontrola live dotyczy AFTER, nie oczekuje zgodności starego BEFORE z poprawionym silnikiem.
- Worker i instrumentacja obu wersji zgadzają się ze swoimi deklaracjami. Kolejki oraz rostery root/before/after są identyczne bajtowo; manifest używa prawidłowego compact-JSON hasha kolejki. `globalIssues=[]`, brak problemów wersji. Rozszerzenie instrumentacji AFTER jest dokładnie dozwoloną zmianą zapisu terminalnego failure.
- W każdej wersji zapisano 498 zakończonych meczów. Brak brakujących plików, duplikatów, obcych zadań i błędów odczytu. BEFORE ma 495 poprawnych meczów i 3 mecze z guardem; każdy generuje dwa wpisy hardError, łącznie 6 wpisów, lecz **3 zdarzenia**, nie 6 awarii. AFTER ma 498 poprawnych meczów, bez hard errors i guardów.
- Niezależne zliczenie surowych wyników potwierdziło **246 wspólnych pełnych par / 492 mecze na wersję / 984 mecze w sparowanej estymacji**. Trzy bloki wykluczają błędy BEFORE: HEX/cup seed0 oraz HEX/wall seed0 i seed2. Poza estymacją pozostają również ich poprawne połówki: 3 mecze BEFORE i 6 AFTER.
- Alarmy displacement: BEFORE A=2/B=0, AFTER A=0/B=0. Nonfinite: zero dla obu drużyn i obu wersji. Pomiar ruchu obecny we wszystkich 498 meczach każdej wersji. Zera dotyczą tej próby i obserwacji co 100 ms, nie każdego możliwego scenariusza.
- Wspólne pary wg kohorty: matrix132, career36, roles18, force24, interaction18, instruction18. Spokojne HEX/cup ma n=2, HEX/wall n=1, więc bez CI. Efekty pogody: **29/30** sparowanych kontrastów; brak jednego cross24 HEX/cup wynika z niepoprawnego spokojnego counterpartu BEFORE, nie z nieukończenia AFTER.

## Rzeczywisty streamlinedPlan

Kolejka ustawia plan drużyny A na obie linie, drużyna B ma neutralny plan. Worker przekazuje plan przez normalizację, a kompilator planu nadpisuje stare dyrektywy i instrukcje. `risk` jest pakietem creativity/selectivity/breakAppetite, `direction` łączy huckAppetite i głębokość ustawienia, `pressure` łączy cushion, poach, helpDeep i pomoc przy resecie. Nie wolno nazywać tych efektów izolowanym testem jednej starej dyrektywy.

Poniżej efekty AFTER względem neutralnego planu, n=3 pary seedowe na poziom. Jednostki procentowe to punkty procentowe, nie względne procenty. Małe bootstrapowe CI są eksploracyjne.

| Oś / warunki | Sprawdzona obserwacja | Granica wniosku |
|---|---|---|
| Tempo / calm | Patient wydłuża trzymanie o 188,3 ms, fast skraca o 220,4 ms | Kierunek zachowania jest zgodny; nie oznacza automatycznie lepszej konwersji |
| Risk / cross14 | Safe zmienia udział break-pass o −2,28 pp, bold o +5,02 pp | Oba CI tych efektów obejmują zero; sama próbka nie dowodzi ogólnej przewagi bold |
| Direction / axial14 | Huck rośnie dla short o +1,269 pp i deep o +1,396 pp; dystans odpowiednio +0,260 i +0,768 m | **Brak monotonicznego potwierdzenia short→mixed→deep.** Nie opisywać kierunku jako w pełni zwalidowanego; CI różnicy dystansu deep obejmuje zero |
| Pressure / cross24 | Aggressive zwiększa poach A o +6,731 pp, cautious zmniejsza o −0,163 pp; cushion odpowiednio −0,128/+0,302 m | Wzrost poachu jest widoczny, lecz konwersja przeciwnika B przy aggressive wynosi −4,122 pp względem neutralnego, CI [−17,858; +8,534]; skuteczności presji nie rozstrzygnięto |

## Force i role

Force zmienia drużyna A, więc skutek jej obrony ocenia się przede wszystkim po ataku B. AFTER versus neutralny force: konwersja B backhand +0,869 pp, middle −0,854 pp, sideline +6,907 pp, straight +0,913 pp. Każdy wariant ma n=3 i inny przypisany kontekst pogody; wszystkie CI obejmują zero. Nie jest to ranking force między pogodami. Mechaniczna zgodność mark/open/break/grip ma osobne testy. Zmiany break-pass % między wersjami obejmują również poprawioną klasyfikację open/break, a nie wyłącznie inne wybory podań.

Role holdoutu obejmują tylko zmianę slotu0 primary_handler→reset_handler i slotu3 primary_cutter→secondary/continuation/filler, w horizontal/person/calm, z n=3. Role są przypisywane rzeczywistym graczom aktywnej linii, nie bieżącej kolejności wokół dysku. Dostępne agregaty ruchu i wyniki drużyny nie dowodzą optymalności indywidualnych decyzji każdej roli ani pełnego pokrycia wszystkich ról/formacji.

## Kontrola głównego raportu

**Końcowy raport: PASS, bez istotnych błędów i bez blockerów.** Odczytano całość sfinalizowanego `docs/tactics-balance-2026-10-03-results.md` (SHA-256 `04e65a64e34a09102d67fb9e9d49ee7211f18a743fe5a5b4756f94c2e3048400`, kontrola 2026-10-03 20:32 UTC). Liczebności, wykluczenia, wybrane wyniki macierzy, sparowane efekty pogody, osie streamlinedPlan, agregaty ról, force oraz niekorzystne wskaźniki diagnostyczne odpowiadają końcowym danym. Dodatkowe zliczenie checkpointów potwierdza 13 111/13 250 obserwowanych składów punktu, zero brakujących obserwacji i zero składów innych niż 7 na 7 w obu wersjach.

Raport jawnie odróżnia naprawione mechanizmy od niepewnego balansu, wskazuje małe n, wspólne składy, brak monotonicznego potwierdzenia osi direction, niekorzystne efekty instrukcji i reset poachu, brak rankingu force oraz niepełne pokrycie ról/pogody. Nie ukrywa wykluczonych awarii ani wzrostu alarmów resetów i zmian celu. Wcześniejsze doprecyzowanie HEX zostało uwzględnione: trzy przednie cele dotyczą środka boiska, a kompresja przy narożnikach jest opisana osobno. Niniejszy signoff nie rozszerza deklarowanej walidacji na wszystkie możliwe ustawienia ani nie zastępuje niewykonanego klikanego testu interfejsu.
