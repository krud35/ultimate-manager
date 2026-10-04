# Audyt taktyk — 3 października 2026

**Status: zakończono badanie, wdrożono poprawki i ukończono walidację. Ostatni mecz po poprawkach zakończył się 3 października 2026 o 22:14 czasu warszawskiego.**

Po 1096 nocnych meczach wykonano osobną walidację: **498 meczów przed i 498 po zmianach**. W nowej próbie liczba meczów z błędem limitu akcji spadła z **3 do 0**, a alarmów skoku pozycji z **2 do 0**. Przeszło również **17 testów regresji i 11 pełnych reprodukcji wcześniejszych problemów**. Poprawiono potwierdzone błędy geometrii, decyzji, instrukcji i obsługi awarii. Wyniki sportowe pozostają zależne od zestawienia; mała liczba realizacji na kontekst nie pozwala ogłosić globalnego zbalansowania wszystkich taktyk.

## Zakres i materiał

Badanie wykonuje pełny silnik (`initMatchSession` → `playNextPoint`, `fastMode:false`) i pełne mecze do produkcyjnego warunku zwycięstwa. Silnik bazowy, składy, seedy i kolejka są zamrożone w `artifacts/engine-audit/tactics-balance-2026-10-03-v2`. Pomiar zakończył się 3 października o 05:58:28 czasu warszawskiego; poprawki produkcyjne rozpoczęto po 06:00. Projekt badania: [tactics-balance-2026-10-03-design.md](tactics-balance-2026-10-03-design.md).

Zapisano **1096 pełnych meczów**. Sześć zawierało sztuczny punkt przy limicie akcji; 1090 jest poprawnych indywidualnie. Do porównań wchodzą wyłącznie **544 kompletne poprawne pary, czyli 1088 meczów**. Dwa poprawne mecze pozbawione poprawnego rewanżu pozostają poza estymacją. Wszystkie 28 978 obserwowanych składów punktu miały rzeczywiste 7 na 7; wykonano 881 wymuszonych zmian kontuzjowanych zawodników. Nie wykryto nieskończonych/nieokreślonych współrzędnych. Sześć alarmów przemieszczenia pochodziło z pięciu meczów.

| Część badania | Zapisane mecze | Poprawne pełne pary | Mecze w estymacji |
|---|---:|---:|---:|
| Zaplanowany rdzeń | 960 | 477 | 954 |
| Rozszerzenia do końca okna czasowego | 136 | 67 | 134 |
| Razem | 1096 | 544 | 1088 |

| Moduł rdzenia | Zapisane mecze | Poprawne pary |
|---|---:|---:|
| 35 zestawień ataku z obroną i 10 kontekstów wiatrowych | 270 | 132 |
| 22 instrukcje, przeciwstawne poziomy i neutralne odniesienie | 198 | 99 |
| Dyrektywy trenerskie | 210 | 105 |
| Aktualny plan kariery: tempo, risk, direction, pressure | 72 | 36 |
| Role | 36 | 18 |
| Force | 48 | 24 |
| Wybrane interakcje | 126 | 63 |

Rdzeń identyfikuje `core:true` w grupie kolejki, nie sam numer rundy. Rewanż zamienia home/away, zachowując badaną tożsamość A. Pierwszy atak rozłożono A/B/A pomiędzy trzema niezależnymi seedami; nie jest to pełne czterokierunkowe odbicie każdego seeda. Jednostką niezależną jest seed/realizacja składu, a nie rzut, posiadanie czy klatka. Porównania ustawień wymagają kompletu wszystkich poziomów i rewanżów.

Raporty i pełne pokrycie: [rdzeń](../artifacts/tactics-balance-2026-10-03/baseline-core-report.md), [rozszerzenia](../artifacts/tactics-balance-2026-10-03/baseline-extensions-report.md), [podsumowanie pokrycia](../artifacts/tactics-balance-2026-10-03/baseline-coverage.json). Stara seria v1 została zachowana jako diagnostyczna i w całości wyłączona z kalibracji: nie zastępowała kontuzjowanych graczy, dopuszczając mniej niż siedmiu zawodników. v2 wymienia wyłącznie kontuzjowanych na tę samą rodzinę slotu.

## Co wynika z pełnych meczów bazowych

Wyniki zależą od zestawienia i warunków; nie ma podstaw, by sprowadzać wszystkie taktyki do równego win rate. Przykładowo vertical ma 51,15% punktów na posiadanie przeciw person, 62,04% przeciw cup i 45,38% przeciw clam; motion ma odpowiednio 51,79%, 50,58% i 42,57%. Każda z tych komórek zawiera trzy niezależne pary. Są to obserwacje z zamrożonego silnika, zawierającego opisane niżej błędy, a nie rekomendacja końcowego strojenia.

Wiatr nie daje jednolitego bonusu jednej formacji. W sparowanych kontekstach bazowych 14 mph poprzecznego wiatru zmienia konwersję vertical/person z 51,15% na 57,15%, a motion/person z 51,79% na 41,80%. To trzy seedy na kontekst i słaba moc statystyczna; sam znak różnicy nie dowodzi ogólnej przewagi przy każdym bocznym wietrze. Kierunek oznacza kierunek, **dokąd** wieje; rzeczywista relacja do ataku zmienia się wraz ze stronami boiska.

HEX przeciw strefom wyróżnia się dużą liczbą celnych podań bez progresji. HEX/cup w ciszy ma 95,01% celnych podań, ale tylko 23,02% punktów na posiadanie (trzy pary). HEX/wall ma 95,80% i 14,51%, lecz po odrzuceniu błędów pozostaje zaledwie **jedna** poprawna para. Nie traktujemy jej jako wiarygodnego rankingu siły. Wszystkie sześć błędnych meczów osiągnęło limit 120 rzeczywistych rzutów; nie był to brak 7 na 7 ani sam błąd obserwatora.

Aktualny `streamlinedPlan` badano osobno od ręcznych dyrektyw i podról, ponieważ kompilator planu kariery nadpisuje stare pola. Przykładowo oś tempa w rdzeniu skraca/wydłuża średni czas trzymania dysku o około −215/+130 ms względem neutralnego poziomu; nie oznacza to automatycznej poprawy wyniku. Efekt roli ocenia się na rzeczywistym slocie i ekspozycji zawodnika, nie na numerze w tablicy graczy.

## Potwierdzone błędy i zakres poprawek

1. **Force:** uzgodniono stronę otwartą, pozycję markera, cele ruchu, klasyfikację open/break i technikę rzutu. Uwzględniono kierunek ataku, lokalny kierunek podania względem rzucającego i dominującą rękę. Middle oraz sideline oddają przeciwne strony. Nie zmieniono wag ani promienia markowania.
2. **Ryzyko:** progi instrukcji `safe_throws` i `take_risks` korzystają teraz ze skali okna 0–100: 35 oraz 25–55 zamiast 0,35 i 0,25–0,55. Pozostałe współczynniki instrukcji zachowano.
3. **Pomoc przy resecie:** rozpoczęty poach zachowuje stan, trwa ograniczony czas i wraca do krycia. Flaga wykonania przechodzi między podaniami w tym samym posiadaniu i zeruje się po zmianie posiadania.
4. **Osobisty zakaz poachu:** `no_poach` nie osłabia silniejszego zakazu drużyny; zachowano świadomy dodatni wyjątek `poach` oraz niezależną pomoc głęboką.
5. **Pozycja dysku po chwycie:** pełny silnik zapisuje fizyczny punkt podparcia. Nie mnoży ponownie przebytego dystansu przez współczynniki obrony i wiatru, nie zaokrągla go ani nie ucina cofnięcia do ośmiu metrów. Ścieżka fast nadal korzysta ze swojego modelu abstrakcyjnego.
6. **Serie podań bez progresji:** istniejąca presja decyzyjna wynikająca z resetów dociera do oceny opcji. Rzeczywisty zegar nadal osobno steruje limitem czasu i bramkami zależnymi od późnego stallu.
7. **Ruch za linią:** aktywacja continuation cuttera nie przenosi jego ciała do granicy pola. Ograniczane są cele ruchu; zawodnik wraca fizycznie, także przy małej odległości do slotu.
8. **Wyczerpanie limitu akcji:** zamiast fikcyjnego punktu następuje jawna terminalna awaria symulacji. Taki wynik nie trafia do ligi; stan wejściowych zawodników i obiektów klubu jest odtwarzany, również po wcześniejszych legalnych punktach tego meczu. Interfejs pozwala uruchomić cały mecz od nowa. Test obejmuje pełny i szybki silnik, brak ponownego użycia uszkodzonej sesji oraz zachowanie normalnego rozliczania udanego meczu.
9. **Pierścień HEX:** ogólna obsługa dump/reset nadpisywała przednie miejsca handlerów celami za dyskiem, także po chwycie przez cuttera. Wspólny helper zachowuje dotychczasowe sześć wierzchołków i promień 9 m w ustawieniu oraz ruchu po chwycie. Nie zmieniono kątów, ról ani limitów aktywnych graczy. Na środku boiska dla każdego z siedmiu rzucających pozostają trzy przednie cele; wcześniej dla handlera były dwa, dla cuttera jeden.
10. **Wybór po serii resetów:** istniejące `requireForwardPass` nadaje pierwszeństwo osiągalnej, zaakceptowanej ofercie do przodu w niezmienionym limicie percepcji. Reset pozostaje wyjściem awaryjnym przy braku takiej oferty; od rzeczywistego stallu 8 działa zwykły ranking. Wcześniej wyjątek dla dumpa wygrywał również wtedy, gdy skaner już potwierdził dobrą możliwość progresji. Nie zwiększono punktacji rzutów ani zasięgu widzenia.

Nie dodano premii za etykietę kontrtaktyki, nie podniesiono limitu akcji w celu ukrycia pętli i nie zmieniono parametrów, aby wyrównać wyniki. Przywracane są istniejące reguły i spójność fizyczna.

## Dowody mechaniczne i regresja

Dziewięć pełnych reprodukcji zamrożonego silnika dało **9/9 zgodnych fingerprintów, wyników punktów i przebiegów RNG**: sześć błędów limitu oraz trzy pierwotne alarmy ruchu. [Raport reprodukcji](../artifacts/tactics-balance-2026-10-03/guard-reproduction-results.md) zawiera konkretne akcje i granice wniosków.

| Mechanizm | Przed | Po — sonda mechanizmu |
|---|---|---|
| Reset poach, 250 ticków | 0 ticków POACHING, utracona flaga | 131 ticków POACHING, zachowana flaga |
| Dodanie no_poach przy zakazie drużyny | 77 prób na 10 000 okazji zamiast 0 | 0 prób; dodatni wyjątek poach pozostaje |
| Słabe / półotwarte okna | praktycznie martwe gałęzie instrukcji | aktywne progi w poprawnej skali |
| Chwyt → następne wypuszczenie | w odtworzonej akcji skok X o 4,711 m | dokładnie ten sam punkt X/Y |
| Aktywacja cuttera za linią | 2,015 m w 100 ms przy limicie 0,644 m | 0,284 m, ciągły powrót |
| Presja po resetach w scenie testowej | rzut przy 2600 ms | inny wybór przy 1060 ms; legalny limit nadal 9000 ms |
| Przednie cele HEX po chwycie cuttera | 1 z 3 zamierzonych, handlerzy cofnięci za dysk | wszystkie 3; 432 kontrole pozostałych formacji identyczne |
| Dostępna progresja po serii resetów | zaakceptowany reset wygrywa z poprawną ofertą do przodu | progresja ma pierwszeństwo; bez legalnej oferty reset pozostaje |

Po ostatnich zmianach ponownie przeszło **17 celowych i istniejących testów**, obejmujących force, poach, ryzyko, chwyt, ruch przy granicy, presję resetów, trasy, cuty, pull, specjalizacje graczy, zgodność pełnej symulacji z klatkami i bez nich, terminalną awarię z odtworzeniem stanu, priorytet progresji oraz HEX. Podsumowania wyników JSON: `artifacts/tactics-balance-2026-10-03/regression-final/`; pełne logi w tym samym katalogu pozostają lokalne i są ignorowane przez Git. Końcowa sonda mechanizmów nie zgłasza rozbieżności; kontrola kodu zmienionego silnika i nowych testów przechodzi. Produkcyjna kompilacja przechodzi (424 moduły, istniejące ostrzeżenie wielkości pakietu).

Niezależny przegląd integracji potwierdził 1260 porównań geometrii oraz 112 scen wyboru dla siedmiu formacji. Zachowano istniejącą kompresję pierścienia przy narożnikach: gwarancja sześciu rozdzielnych pozycji dotyczy wnętrza pola, nie każdej możliwej pozycji przy linii. Przegląd interfejsu awarii obejmował kod i kompilację; nie wykonano osobnego klikanego testu przeglądarkowego. Dwa wcześniejsze błędy lint i cztery ostrzeżenia hooków w `MatchView` są identyczne względem HEAD.

## Końcowa walidacja pełnych meczów

Ukończono **498 meczów na wersję, 996 łącznie**, na nowych seedach i osobnych zrównoważonych składach holdout. Kolejka obejmuje wszystkie 35 zestawień bez wiatru, dziesięć kontekstów wiatrowych, force, wybrane role, cztery osie planu kariery oraz poprawiane instrukcje i interakcje poachu. Trzy realizacje mają lustrzane home/away. Wersja „przed” używa oryginalnego zamrożonego silnika; wersja „po” ma osobny snapshot i hashe.

| Miara wszystkich zaplanowanych meczów | Przed | Po |
|---|---:|---:|
| Zakończone / zaplanowane | 498 / 498 | 498 / 498 |
| Poprawne indywidualnie | 495 | 498 |
| Mecze z błędem limitu akcji | 3 | 0 |
| Alarmy skoku pozycji | 2 | 0 |
| Nieokreślone lub nieskończone współrzędne | 0 | 0 |
| Obserwowane składy punktu | 13 111 | 13 250 |
| Składy inne niż 7 na 7 | 0 | 0 |
| Wymuszone zmiany kontuzjowanych | 428 | 455 |

Trzy błędne mecze „przed” wygenerowały sześć komunikatów diagnostycznych; to **trzy awarie, nie sześć**. Nie ponawiano tych zakończonych meczów w celu uzyskania lepszego wyniku. Wynik 0/498 po zmianach opisuje tę próbę, nie dowodzi zerowego ryzyka awarii.

Porównanie sportowe obejmuje tylko pełne pary poprawne **w obu wersjach**: **246 par, czyli 492 mecze na wersję i 984 mecze łącznie**. Wykluczono trzy całe bloki z błędnym baseline: HEX/cup w pierwszej realizacji oraz HEX/wall w pierwszej i trzeciej. Oznacza to wyłączenie również trzech poprawnych rewanżów „przed” i sześciu poprawnych meczów „po”. Te wyniki nadal należą do powyższej oceny niezawodności. Sztuczne punkty starego silnika nie wchodzą do estymacji sportowej.

Wszystkie **83 komórki** mają wspólny pomiar: 81 z trzema parami seedowymi, HEX/cup/calm z dwiema, HEX/wall/calm z jedną. Wszystkie 24 kontrasty ustawienie−neutralne mają po trzy realizacje. Efekty pogody mają **29 z 30** planowanych kontrastów: brak jednego wynika z błędnego spokojnego meczu HEX/cup „przed”, a nie z nieukończenia meczu po zmianach. W zbiorze jest 145 różnych wartości seeda, ale tylko trzy pary syntetycznych składów; nie są to 145 niezależne populacje zawodników. Pierwszy atak zachowanych bloków przypadał A w 163, B w 83 blokach.

Podstawą obliczeń jest równo ważona para home/away, następnie średnia z dostępnych realizacji danego kontekstu. Dla ustawień obliczono różnicę względem neutralnego wewnątrz tej samej wersji, seeda i składu; dla pogody analogicznie wiatr−cisza. Nie odejmowano niedopasowanych średnich. Efekt pakietu zmian nie jest izolowanym efektem pojedynczej poprawki. Znane wcześniejsze awarie służą regresji, nie estymacji częstości awarii w nowych meczach.

Pierwszy kandydat, sprzed poprawek pierścienia HEX i wyboru progresji, usunął alarmy ruchu we wszystkich pięciu wybranych meczach, ale nadal zawieszał cztery z sześciu przypadków limitu. Został odrzucony jako rozwiązanie końcowe. Jego snapshot i pełne ślady zachowano w `candidate-v1`; posłużyły do wskazania dwóch dalszych przyczyn, zamiast podwyższenia limitu 120 rzutów. **`candidate-v2` ukończył 11/11 pełnych meczów: wszystkie sześć dawnych awarii i pięć przypadków alarmów ruchu, bez hard errors i bez alarmów przemieszczenia.** Końcowy snapshot `after` ma identyczne 401 hashy plików źródłowych i identyczną instrumentację jak ten kandydat.

## Efekty sportowe, wiatr i zachowanie po zmianach

Pełna macierz 7 × 5, wszystkie konteksty pogodowe oraz tabele instrukcji, planu, poachu, ról i force są w [tabelach końcowych](../artifacts/tactics-balance-2026-10-03/final-tables.md). Maszynowe źródło obliczeń: lokalne archiwum `artifacts/engine-audit/tactics-balance-2026-10-03-validation/comparison/comparison.json`, wygenerowane o 22:15 czasu warszawskiego. Surowe przebiegi, snapshoty oraz ten duży plik pozostają poza Git zgodnie z `.gitignore`; repozytorium zawiera raport, pełne tabele podsumowujące, małe raporty bazowe, wyniki regresji i skrypty badania. Poniżej wybrane przykłady, również niekorzystne; **pp oznacza punkty procentowe**.

### Zestawienia ataku i obrony

| Atak A / obrona B, bez wiatru | Konwersja A przed | Po | Zmiana, pp | Pary seedowe |
|---|---:|---:|---:|---:|
| Vertical / person | 47,77% | 48,36% | +0,59 | 3 |
| Vertical / cup | 64,21% | 56,17% | −8,04 | 3 |
| Horizontal / person | 55,76% | 42,62% | −13,14 | 3 |
| Horizontal / cup | 50,58% | 55,69% | +5,11 | 3 |
| Motion / person | 44,83% | 48,01% | +3,18 | 3 |
| Motion / wall | 51,40% | 38,84% | −12,56 | 3 |
| HEX / all person | 38,67% | 47,90% | +9,23 | 3 |
| HEX / cup | 27,96% | 35,98% | +8,02 | **2** |
| HEX / wall | 21,11% | 31,02% | +9,91 | **1** |
| Zone O / cup | 60,45% | 60,95% | +0,50 | 3 |

Konwersja oznacza punkty na posiadanie ataku A. W tej próbie różnice pomiędzy zestawieniami pozostały duże, a zmiany mają oba znaki. Nie przypisujemy przewagi z góry nazwie taktyki. Spadek konwersji nie jest sam w sobie błędem po naprawie fizyki i obrony; wzrost także nie dowodzi optymalnego balansu. Szczególnie wyniki HEX przeciw strefom są obciążone małą próbą i wykluczeniem wcześniejszych awarii. Nie uznano ich za sprawdzoną kontrę ani nie podnoszono parametrów do zadanej wartości wyniku.

### Wiatr względem ciszy

Każda liczba poniżej jest sparowaną różnicą wiatr−cisza w danej wersji, nie zmianą wersji przy samej wietrznej pogodzie. Kierunki osiowe nie oznaczają stałego wiatru w twarz przez cały mecz — kierunek ataku się zmienia.

| Zestawienie i wiatr | Efekt na konwersję A przed, pp | Po, pp | Pary seedowe |
|---|---:|---:|---:|
| Vertical / person, poprzeczny 14 mph, 90° | +2,99 | +0,69 | 3 |
| Horizontal / person, osiowy 14 mph, 0° | −2,05 | +9,27 | 3 |
| Horizontal / wall, osiowy 24 mph, 180° | −3,91 | −10,43 | 3 |
| Motion / person, poprzeczny 14 mph, 90° | −3,87 | −0,25 | 3 |
| Zone O / cup, osiowy 24 mph, 180° | −7,65 | −13,26 | 3 |
| HEX / cup, poprzeczny 24 mph, 270° | +13,80 | +14,52 | **2** |

Horizontal/wall i Zone O/cup po zmianach mają w tych warunkach również mniej celnych podań niż w ciszy: odpowiednio −2,41 i −3,75 pp. Dodatni wynik HEX/cup nie stanowi dowodu ogólnej przewagi przy silnym wietrze. Pełny kontrast pogodowy wymaga czterech meczów na wersję, ale pozostaje jedną repliką seedową. Nie rozszerzamy tych dziesięciu wybranych kontekstów na całą macierz taktyk i pogody.

### Instrukcje i dyrektywy

Naprawione jednostki okna podania przywróciły działanie gałęzi `safe_throws` i `take_risks`; same pełne mecze **nie potwierdziły**, że instrukcja bezpiecznych podań podnosi ogólną skuteczność. Efekt `safe_throws−neutral` na celność wyniósł +1,71 pp przed i **−1,56 pp po**, n=3. Po zmianach efekty poszczególnych seedów to +0,72, −1,72 i −3,69 pp; eksploracyjny przedział obejmuje zero. Efekt na konwersję A wyniósł +7,51 → −7,01 pp, z dużym rozrzutem. `take_risks−neutral` zmieniło celność o +0,06 → −1,82 pp. To wynik całych trajektorii meczu, nie izolowany pomiar jakości identycznego rzutu. Zachowano poprawkę jednostek; nie dostrajano wag na trzech seedach, aby wymusić oczekiwany znak.

Dodanie `no_poach` przy istniejącym silnym zakazie drużyny daje teraz **dokładnie neutralny wynik** w trzech sparowanych realizacjach, zgodnie z monotonicznością zakazu. Dodatni wyjątek `poach` pozostaje aktywny. Izolowane włączenie pomocy przy resecie zwiększa udział czasu poachu obrońców A z efektu 0 do **+3,28 pp**, ale w tym zestawieniu zwiększa też konwersję przeciwnika B o **+5,90 pp**. Efekty B na trzech seedach to +8,79, +0,95 i +7,96 pp: zaobserwowano koszt dla obrony, nie uniwersalny zysk z dyrektywy. Połączenie tej pomocy z `no_poach` pozostaje zablokowane. Działająca dyrektywa może być niekorzystna w konkretnym układzie; nie dodano jej sztucznego bonusu rekompensującego wynik.

### Aktualny plan kariery, role i force

`streamlinedPlan` jest pakietem ustawień kompilowanym do dyrektyw i instrukcji. Po zmianach spokojne tempo wydłuża trzymanie dysku o **188 ms**, a szybkie skraca o **220 ms** względem neutralnego. Ostrożna presja zwiększa odstęp krycia o **0,30 m**, agresywna zmniejsza o **0,13 m** i zwiększa udział poachu o **6,73 pp**. Te efekty zachowania są widoczne; nie przesądzają skuteczności sportowej. Efekt agresywnej presji na konwersję B wyniósł −4,12 pp, lecz eksploracyjny przedział obejmuje zero.

Oś kierunku nie uzyskała monotonicznego potwierdzenia: udział hucków wzrósł względem neutralnego zarówno dla short (+1,27 pp), jak deep (+1,40 pp); średni dystans rzutu odpowiednio o +0,26 i +0,77 m. Przedział efektu dystansu deep obejmuje zero. Oś ryzyka łączy kreatywność, selektywność i apetyt na break; sam udział hucków nie wystarcza do jej oceny. W badanym kontekście udział breaków dla safe/bold zmienił się o −2,28/+5,02 pp, ale oba przedziały obejmują zero. To obszary nierozstrzygnięte, nie dowiedzione usterki wymagające arbitralnego przestawienia wag.

Walidacja ról obejmuje slot 0 primary_handler → reset_handler oraz slot 3 primary_cutter → secondary/continuation/filler, w horizontal/person/calm, n=3. Dla reset_handler ruch wynosił 143,44 → 144,93 m/min zawodnika, a udział cutu 20,11 → 21,15%; dla continuation_cutter odpowiednio 151,02 → 153,92 m/min i 28,74 → 32,09%. Filler zachował 0% czasu cutu. Są to agregaty wszystkich graczy danej roli, a nie przyczynowy efekt samej podmiany jednego slotu. Nie zmierzono w tej walidacji pełnego udziału indywidualnych graczy w kontaktach z dyskiem ani jakości każdej decyzji roli.

Force zmienia obrona A, więc jego efekt oceniamy głównie przez atak B. Wszystkie cztery efekty na konwersję B mają przy n=3 przedziały obejmujące zero; poszczególne warianty występują też w różnych kontekstach pogody. Nie ustalono rankingu force. Testy mechaniczne potwierdzają zgodność stron i ręki rzucającego. Zmiany udziału podań break przed/po obejmują również naprawioną klasyfikację open/break, nie tylko zmianę decyzji zawodników.

### Diagnostyka, która nie poprawiła się jednoznacznie

Brak awarii i skoków pozycji nie oznacza, że wszystkie wskaźniki ruchu i decyzji się poprawiły. W całych 498 meczach alarmy łańcucha resetów A wzrosły z **3 zdarzeń w 3 meczach do 13 w 12 meczach**: 0,0227 → 0,0898 na 100 posiadań. Zmiany celu ruchu wzrosły z 34,34 do 38,19 dla A oraz z 27,50 do 34,70 dla B na 1000 sekund-zawodnika. Są to sygnały diagnostyczne, nie automatycznie błędy; pełne mecze po zmianach kończą się legalnie. Na tej podstawie nie deklarujemy usunięcia wszystkich długich serii resetów ani optymalności ruchu. Dalsze strojenie tych zachowań wymagałoby odrębnej próby, z konkretną reprodukcją niekorzystnego mechanizmu.

## Integralność danych i końcowa decyzja

Niezależnie odczytano wszystkie 996 surowych wyników. Nie ma brakujących, zduplikowanych, nieplanowanych ani nieczytelnych wyników; końcowy comparator zgłasza `globalIssues=[]`. Zweryfikowano 400 plików starego snapshotu, 401 nowego oraz zgodność **401/401 nowych plików z bieżącym kodem projektu**. Kolejki i składy obu wersji są identyczne bajtowo. Instrumentacja między wersjami różni się wyłącznie kontrolowanym rozszerzeniem zapisu terminalnej awarii; zgodność pozostałych pomiarów sprawdzono osobno.

W trakcie wznowienia zachowano dziewięć niedokończonych prób infrastrukturalnych „przed” i powtórzono je na tych samych wejściach. Nie miały wyjątku silnika i nie zostały pomylone z trzema zakończonymi błędnymi meczami. Podczas walidacji „po” zmniejszono liczbę równoległych symulacji z sześciu do czterech po spadku wolnej pamięci: aktywne mecze najpierw dokończyły grę, a wznowienie zachowało wyniki, źródła i seedy. Koordynator zakończył pracę; nie pozostała kolejka meczów do wykonania.

Przeglądy końcowe: [statystyka i niekorzystne wyniki](../artifacts/tactics-balance-2026-10-03/final-statistical-signoff.md), [pochodzenie danych, plan, force i role](../artifacts/tactics-balance-2026-10-03/final-validation-signoff.md), [11 reprodukcji problemów](../artifacts/tactics-balance-2026-10-03/final-known-cases.md). Regresja, kompilacja, kontrola zmienionego kodu i testy narzędzia porównującego przeszły; wcześniejsze niezależne ograniczenia testów podano niżej.

**Przyjęto końcowy pakiet napraw mechanicznych i pozostawiono go w kodzie projektu.** Nie wprowadzono dodatkowego strojenia wag według małych prób wyniku. Zebrano dowody na usunięcie konkretnych błędów i na zależność zachowania od ustawień; nie ma podstaw do deklaracji, że każda instrukcja jest opłacalna albo cały katalog taktyk jest już globalnie zbalansowany.

## Ograniczenia

- Z katalogu 5168 meczów wykonano 1096; czas nie pozwolił na cały iloczyn taktyk, kierunków wiatru, rodzin umiejętności i instrukcji. Rozszerzenia mają często tylko jedną realizację.
- Główne konteksty mają trzy realizacje seeda i składu; te same trzy pary składów są używane ponownie w różnych kontekstach. HEX/cup/calm ma dwie realizacje, HEX/wall/calm jedną, a kontrast pogodowy HEX/cup dwie. Przedziały bootstrap są eksploracyjne, a poniżej trzech seedów nie są podawane. Duża liczba porównań zwiększa ryzyko przypadkowych efektownych różnic.
- Starszy automatyczny raport bazowy zawiera zbiorczy przedział `pooledCI` z heterogenicznych kontekstów i wielokrotnie używanych rodzin składów. Nie interpretujemy go jako niezależnej próby populacyjnej. Końcowe porównanie wyłącza przedziały zbiorcze; podaje je wyłącznie dla kontekstu lub pełnego kontrastu na trzech realizacjach.
- Seedy są wspólne między wariantami danego kontrastu i jego pogodą, lecz nie między wszystkimi różnymi komórkami macierzy. Zmiana decyzji może rozdzielić późniejsze strumienie losowań.
- Wiatr w porównaniach jest kontrolowany i stały. Dziesięć wybranych kontekstów obejmuje 14 i 24 mph, kierunki osiowe i poprzeczne; nie jest to pełna macierz zmiennego wiatru w trakcie meczu.
- Zrównoważone syntetyczne składy ograniczają uogólnienie na wyspecjalizowane lub bardzo nierówne drużyny. Jedna noc nie dowodzi globalnego zbalansowania całego systemu.
- Wynik meczu zawiera obie fazy gry; właściwą miarą zestawienia atak A / obrona B jest konwersja posiadań A. W ustawieniach obronnych A istotna jest także konwersja przeciwnika B.
- Obserwator próbkuje ruch co 100 ms; poprawność każdego ticku sprawdzają dodatkowe testy mechaniczne, a brak alarmu w meczu nie dowodzi braku wszystkich możliwych błędów.
- Istniejący `smoke-match-stats.mjs` ma niezależną niezgodność oczekiwania 200 ms z bieżącym 188 ms czasu reakcji obrońcy, potwierdzoną również na zamrożonym baseline. Nie zmieniano oczekiwania w celu ukrycia tej usterki testu.

Nie pozostawiono uruchomionych symulacji ani nieukończonych pozycji zaplanowanej walidacji. Dalsze zwiększanie próby lub strojenie nierozstrzygniętych obszarów jest odrębnym badaniem; nie jest przedstawiane jako wykonane w ramach tej serii.

Nocną automatyzację `nocny-audyt-taktyk-i-poprawki-po-06-00` usunięto po ukończeniu zadania; dalsze wybudzenia zostały wyłączone.
