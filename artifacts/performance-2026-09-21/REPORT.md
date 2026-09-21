# Profil wydajności Ultimate Manager — 21.09.2026

**Aktualizacja:** codzienne układanie terminarza zostało poprawione. Wyniki poniżej
opisują pierwotny profil; pomiary po poprawce i zakres weryfikacji są w
[CALENDAR-FIX.md](CALENDAR-FIX.md).

## Najważniejsze wyniki

1. **Zapis dużego świata jest najdroższą pojedynczą operacją:** po 30 dniach domyślnego świata kompresja jednej kariery trwała **85,34 s**, wobec **0,43 s** serializacji JSON. Odczyt i odtworzenie kariery: **4,09 s**. Dane mają **100,99 MiB JSON / 8,78 MiB po kompresji UTF-16**.
2. **Przewijanie dni świata krajowego:** `reconcileDomesticCalendar` zajmuje **54,7% próbkowanego czasu**. Codzienna rekonstrukcja terminarza, parsowanie dat i generowanie kandydatów są kosztowniejsze od samych symulacji meczowych w tym scenariuszu.
3. **Pełny mecz:** główne koszty to `selectDiscIntercept` (**27,5% z wywołaniami**) i `bodyAwareTarget` (**15,1% czasu własnego**). Są zagnieżdżone; tych udziałów nie należy dodawać.
4. **Tworzenie świata:** generowanie cech (`rollTraitsForPlayer`) zajmuje **67,3%** profilu domyślnego świata; same `normalizeTraitId` i `conflictsWith` łącznie **57,6% czasu własnego**.

## Warunki i ograniczenia

- Sprzęt: **Intel Core Ultra 5 125U, 14 procesorów logicznych, około 15,3 GiB RAM**, Windows x64, **Node 24.19.0**.
- Kod gry: commit `34bdbd4ec8f858088f917b9198be8ad3ad1e6a32`. Kod produkcyjny nie był zmieniany na potrzeby pomiaru.
- Testy uruchamiano kolejno, bez nakładania własnych benchmarków. Nie izolowano całego systemu operacyjnego ani jego zarządzania energią.
- Czasy to czas rzeczywisty wywołań (wall-clock), obejmujący m.in. garbage collection. Nie obejmują renderowania React/SVG, inicjalizacji importów aplikacji, instalacji PWA ani sieci.
- To **pomiary PC w Node**, nie wyniki Androida ani przeglądarkowego FPS. Worker i `localStorage` w przeglądarce mają dodatkowe koszty, których tutaj nie zmierzono.
- Kariery wygenerowano testowo. `localStorage` jest atrapą w RAM; rzeczywiste zapisy użytkownika i limity przeglądarki nie były dotykane ani sprawdzane.
- Automatyczny zapis podczas tworzenia kariery wyłączono w narzędziu pomiarowym, aby nie mieszać go z symulacją. Przygotowanie zapisu, prawdziwy `lz-string`, odczyt JSON i `rehydrateCareerWorld` zmierzono osobno.
- Kalendarz: `advanceCareerDay({autoSimulatePlayer: true, allowRandomEvents: false})`, jak przy przewijaniu dni, bez oczekiwania na UI i bez checkpointów zapisu. Nie obejmuje finalizacji sezonu. Wydarzenia Ultiworld nadal działają zgodnie z kodem gry.
- Pełny/szybki mecz: ta sama para zespołów UFA, różne ziarna losowości, rotacja obu stron, `aiHome: false`, `aiAway: true` (zachowanie zespołu gracza). Ligowe mecze AI w kalendarzu korzystają ze swoich ustawień produkcyjnych.
- Wariant 3 slotów to **trzy kopie tej samej kariery**, test skalowania rozmiaru; nie trzy niezależne kariery.
- Dla zapisu sprawdzono identyczność JSON po kompresji/dekompresji, liczbę odtworzonych slotów i tożsamość klubu. Wszystkie testowane mecze i kroki kalendarza ukończyły się.

## Czasy bez profilera — pierwszy przebieg

### UFA: 16 klubów, Toronto Rush, sezon 2025

| Element | Wynik | Próba |
|---|---:|---|
| Utworzenie kariery bez zapisu | średnio **1,70 s** | 3 kariery, 1,63–1,77 s |
| Pełny mecz | średnio **32,00 s** | 3 mecze, 16,95 / 33,33 / 45,71 s |
| Pojedynczy punkt pełnego meczu | mediana **0,945 s**, p95 **2,685 s**, maksimum **4,516 s** | 82 punkty |
| Szybki mecz | średnio **0,335 s** | 10 meczów, 0,283–0,395 s |
| Przewinięcie 60 dni | **31,83 s** obliczeń dni | 01.08–29.09.2025, stan końcowy 30.09 |
| Pojedynczy dzień | mediana **0,227 s**, p95 **1,415 s**, maksimum **1,743 s** | 60 dni |

Szybki mecz korzysta z innego modelu niż pełny; różnica czasu nie jest dowodem, że można zastąpić nim pełny mecz bez zmiany wyników i zachowania zawodników.

### Pomiar kontrolny i zmienność

Powtórzono 3 pełne i 10 szybkich meczów bez profilera oraz 60 dni UFA. Wyniki i liczby zdarzeń meczowych były takie same dla odpowiadających sobie ziaren. Czasy zauważalnie się zmieniły:

| Element | Pierwszy przebieg | Kontrolny |
|---|---:|---:|
| Pełny mecz — średnia 3 | 32,00 s | **25,62 s** |
| Pełny mecz — poszczególne ziarna | 16,95 / 33,33 / 45,71 s | **31,86 / 24,31 / 20,69 s** |
| Punkt pełnego meczu — mediana / p95 | 0,945 / 2,685 s | **0,818 / 1,826 s** |
| Szybki mecz — średnia 10 | 0,335 s | **0,167 s** |
| 60 dni UFA | 31,83 s | **15,92 s** |
| Zapis 1 slotu UFA po 60 dniach | mediana 11,52 s | **11,12 s** |

Dlatego wynik praktyczny dla pełnego meczu podajemy jako **około 26–32 s średnio**, z obserwowanym zakresem **17–46 s**; dla szybkiego meczu **0,17–0,34 s średnio**. Nie ustalono przyczyny wahań — mogą zależeć od rozgrzania/optimizacji V8, obciążenia systemu lub warunków pracy CPU. Nie są wynikiem wdrożonej optymalizacji. Kalendarze pierwszego i kontrolnego UFA mogą mieć nieco inny przebieg losowych wydarzeń; narzędzie kontrolne resetuje RNG przed kalendarzem.

Dla świata krajowego jest jeden przebieg czasowy bez profilera i osobny profil CPU. Sam profil kalendarza trwał 60,01 s wobec 32,58 s bez profilera; do tabel czasu nie użyto wyników profilowanych. Dalsze porównania przed/po zmianie należy robić parami na identycznym obciążeniu i stabilnych ustawieniach urządzenia.

### Świat krajowy: domyślna konfiguracja Polski

Konfiguracja `focused`, główny kraj `pl`, bez dodatkowych krajów, z domyślnymi rozgrywkami międzynarodowymi i ligami tła. Klub testowy `dom-pl-2b`. Świat: **604 kluby i 13 541 seniorów** (bez doliczania akademii i odrębnych pul reprezentacyjnych).

| Element | Wynik | Próba |
|---|---:|---|
| Utworzenie kariery bez zapisu | **23,18 s** | 1 kariera |
| Przewinięcie 30 dni | **32,58 s** obliczeń dni | 01–30.08.2026, stan końcowy 31.08 |
| Pojedynczy dzień | mediana **0,855 s**, p95 **1,871 s**, maksimum **3,102 s** | 30 dni |
| Dzień z meczami ligi gracza | średnio **1,014 s** | 11 dni |
| Dzień bez meczów ligi gracza | średnio **1,128 s** | 19 dni; mogą istnieć inne mecze |

### Zapis i odczyt

W tabeli zapis oznacza przygotowanie struktury + JSON + kompresję; **bez fizycznego zapisu do pamięci przeglądarki**. Odczyt obejmuje dekompresję, JSON.parse i odtworzenie świata. Dla UFA podano mediany 3 powtórzeń, dla świata krajowego jedno powtórzenie.

| Stan | Sloty | JSON | Skompresowane UTF-16 | Zapis — obliczenia | Odczyt — obliczenia |
|---|---:|---:|---:|---:|---:|
| Nowa UFA | 1 | 3,09 MiB | 0,46 MiB | **1,48 s** | **0,128 s** |
| Nowa UFA | 3 | 9,28 MiB | 1,12 MiB | **5,93 s** | **0,401 s** |
| UFA po 60 dniach | 1 | 17,60 MiB | 2,04 MiB | **11,52 s** | **0,579 s** |
| UFA po 60 dniach | 3 | 52,80 MiB | 5,03 MiB | **38,30 s** | **1,770 s** |
| Świat krajowy po 30 dniach | 1 | 100,99 MiB | 8,78 MiB | **85,76 s** | **4,087 s** |

Dokładny rozkład zapisu świata krajowego: przygotowanie **0,18 ms**, JSON.stringify **427,73 ms**, kompresja **85 335,31 ms**; dekompresja **2916,19 ms**, JSON.parse **483,48 ms**, rehydratacja **686,87 ms**.

W produkcji kompresja działa zwykle w `saveCompressionWorker.js`. Powyższe 85 s **nie oznacza 85 s zablokowanego UI**. Serializacja JSON nadal odbywa się przed wysłaniem danych do workera. Wolna kompresja ogranicza tempo utrwalania postępu; kolejka wielokrotnych zapisów wymaga osobnego testu przeglądarkowego.

Największe części JSON świata krajowego po 30 dniach:

- `world`: 83,45 MB, z czego dane klubów `teamsById`: 79,52 MB;
- pola `players` wszystkich klubów: 72,84 MB;
- `league`: 20,89 MB, głównie `otherLeagues`: 19,94 MB;
- pola nakładają się hierarchicznie — nie należy ich sumować. Te liczby są w MB dziesiętnych, tabela powyżej w MiB.

W kontrolnej karierze UFA po 60 dniach największym polem seniorów było `playingStyleMatches`: **4,74 MB**, następnie `workload`: **1,70 MB**. Warto zatem sprawdzić strukturę historii i duplikację danych przed rozważaniem usuwania funkcjonalności. Ten pomiar dotyczy UFA, nie ekstrapolacji na cały świat krajowy.

## Najdroższe funkcje — profile V8

Próbkowanie co około 1 ms. **Self** to czas własny, **inclusive** obejmuje wywoływane funkcje. Udziały odnoszą się do konkretnego profilowanego etapu, nie do całej gry. Czas rodzica zawiera czas dzieci. Profiler i stan rozgrzania V8 wpływają na szybkość, więc czasy użytkowe pochodzą z przebiegów bez profilera.

### Kalendarz świata krajowego

| Funkcja | Udział | Interpretacja |
|---|---:|---|
| `reconcileDomesticCalendar` — `src/league/domesticCalendar.js:52` | **54,7% inclusive** | Ponowne planowanie wszystkich lig każdego dnia |
| `parseISODate` — `src/league/seasonCalendar.js:7` | **27,0% self** | Tworzenie i parsowanie dat, głównie pod terminarzem |
| `addDays` — `src/league/seasonCalendar.js:21` | **8,6% self**, 34,6% inclusive | Generowanie kandydatów dat; zawiera parsowanie |
| `applyDailyDevelopment` — `src/career/playerDevelopment.js:436` | **15,1% inclusive** | Rozwój, regeneracja i obsługa zawodników |
| `processUltiworldTick` — `src/career/ultiworld.js:2789` | **8,9% inclusive** | Wydarzenia medialne i ich wpływ na świat |
| `structuredClone` | **8,2% self** | Kopiowanie danych, w tym świata i ligi w `runWorldEventArticle` |
| `advanceCalendarDay` — `src/league/dayEngine.js:371` | **8,1% inclusive** | Mecze i pozostała obsługa kalendarza ligowego |
| `processTeamTrainingsForDate` — `src/career/teamTraining.js:867` | **4,8% inclusive** | Treningi aktywnych klubów |

`reconcileDomesticCalendar` buduje 67 kandydatów dat dla każdego nierozgranego meczu przez `map`, zanim `find` wybierze pierwszy odpowiedni. Ponownie sortuje i przegląda mecze wszystkich rozgrywek, szuka kalendarza klubu i wielokrotnie parsuje daty w `gap`. Wywołanie następuje w każdym `advanceCareerDay`.

### Pełny mecz UFA — profil jednego meczu

| Funkcja | Self | Inclusive |
|---|---:|---:|
| `bodyAwareTarget` — `src/matchEngine/ai/bodyTraffic.js:8` | **15,1%** | 15,3% |
| `selectDiscIntercept` — `src/matchEngine/ai/discIntercept.js:41` | **9,0%** | **27,5%** |
| `runContinuousThrowSimulation` — `src/matchEngine/ai/actionSimulator.js:790` | 5,5% | 89,7% |
| `tickCutterBrain` — `src/matchEngine/ai/cutterBrain.js:651` | 4,8% | 12,2% |
| Garbage collector | **4,5%** | 4,5% |
| `perceivePlayers` — `src/matchEngine/ai/playerPerception.js:6` | 3,5% | 4,1% |
| `interceptForAgent` — `src/matchEngine/ai/flightKinematics.js:407` | 2,7% | **31,5%** |
| `scanThrowOptions` — `src/matchEngine/ai/throwerBrain.js` | — | 6,7% |

`selectDiscIntercept` przeszukuje przyszły tor w krokach 40 ms, wykonując dla kolejnych kandydatów ocenę dobiegu i przeszkód. `bodyAwareTarget` skanuje innych zawodników i wielokrotnie oblicza odległości. Nie jest to koszt renderowania boiska.

### Szybki mecz i UFA

- W profilu 10 szybkich meczów: `simulatePointFast` **42,6%**, `preparePointTeams` **27,3%**, `simulatePull` **16,3%**, `getCategoryOverall` **10,3%** inclusive. Pull jest częścią punktu, więc udziałów nie sumujemy.
- Kalendarz UFA: `simulateFixtureMatch` **56,0%**, `processTeamTrainingsForDate` **16,3%**, `applyDailyDevelopment` **9,7%** inclusive. Ta struktura kosztów różni się od świata krajowego.

### Tworzenie świata krajowego

- `rollTraitsForPlayer`, `src/models/playerTraits.js:780`: **67,3% inclusive**.
- `normalizeTraitId`, `src/models/playerTraits.js:759`: **36,6% self**.
- `conflictsWith`, `src/models/playerTraits.js:695`: **21,0% self / 56,7% inclusive**.
- `conflictsWith` normalizuje stałe pary konfliktów cech przy każdym sprawdzeniu; generowanie cech wielokrotnie filtruje pule i tworzy zbiory. To dobry kandydat do przygotowania stałych indeksów, bez zmiany zasad losowania.

## Kolejność optymalizacji wynikająca z pomiarów

1. **Zapis:** osobne sloty, zapis zmienionych danych, pomiar alternatyw dla `lz-string`, kontrola kolejki workera, zgodna migracja starych karier. Najpierw zachować wszystkie informacje i potwierdzić round-trip; nie usuwać historii w ciemno.
2. **Terminarz:** generować kandydatów dat do pierwszego trafienia, ograniczyć powtarzanie parsowania, zbudować indeks klub → rozgrywki, przeliczać po istotnej zmianie rezerwacji/terminów zamiast zawsze od nowa. Testy muszą zachować minimalne przerwy, przerwy świąteczne i reakcję na nowe puchary.
3. **Cechy zawodników:** przygotować znormalizowane konflikty i pule raz; ograniczyć wielokrotną walidację niezmienionych cech. Zachować strumienie RNG i wyniki dla tych samych danych.
4. **Pełny mecz:** optymalizować powtarzane obliczenia przechwytu i omijania w ramach tej samej decyzji; zachować model percepcji, kolizji i częstotliwość symulacji. Wydzielić obliczenia do workera dla responsywności UI — to nie jest samo w sobie skrócenie obliczeń.
5. **Świat i trening:** ograniczyć pełne `structuredClone(world)` / `structuredClone(league)` do faktycznie zmienianych gałęzi, sprawdzić buforowanie ocen zawodników z poprawnym unieważnianiem po treningu i zmianach formy.

Nie ma jeszcze pomiarów dowodzących zysku z tych zmian — to priorytety na podstawie profilu, nie obietnica konkretnego przyspieszenia. Nie zmieniano reguł gry ani nie wdrażano optymalizacji.

## Odtworzenie pomiarów

Uruchamiać kolejno, z katalogu repozytorium:

```powershell
node --expose-gc --import ./scripts/register-world-tests.mjs scripts/profile-performance.mjs --scenario=ufa --days=60 --matches=3 --repeats=3
node --expose-gc --import ./scripts/register-world-tests.mjs scripts/profile-performance.mjs --scenario=domestic --days=30 --repeats=1 --slots=1 --only=create,calendar,save-aged
node --expose-gc --import ./scripts/register-world-tests.mjs scripts/profile-performance.mjs --scenario=domestic --days=30 --repeats=1 --only=create,calendar --profile
```

`--tag=nazwa` pozwala zachować kolejny przebieg w osobnym pliku. `--out=katalog` zmienia katalog wyników. Tworzenie kariery jest wymaganym przygotowaniem także przy ograniczeniu `--only`. Wersja 2 narzędzia dodatkowo resetuje RNG przed każdym meczem i kalendarzem, aby zakres wcześniejszych faz nie wpływał na kolejne. Pierwsze pliki `ufa-baseline.json` i `ufa-profile.json` powstały przed tym doprecyzowaniem; służą jako osobne obserwacje, nie porównanie identycznego stanu końcowego.

Pliki `.json` zawierają poszczególne pomiary, środowisko, zakres, czasy punktów/dni, rozmiary zapisów i rankingi CPU. Pliki `.cpuprofile` można otworzyć w narzędziach profilujących V8/Chrome; są lokalnymi artefaktami ignorowanymi przez Git.
