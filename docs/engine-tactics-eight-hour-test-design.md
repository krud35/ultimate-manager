# Ośmiogodzinny eksperyment taktyk i archetypów AI

Status: DESIGN, 2026-09-10. Nie uruchomiono symulacji. Runner, sondy i konfiguracje eksperymentalne wymagają przygotowania przed przyszłym startem. Nie zmieniamy produkcyjnego balansu w trakcie badania.

## 1. Co ma rozstrzygnąć eksperyment

Przygotować podstawę przebudowy trenerów: które sposoby gry silnik rzeczywiście potrafi wykonać, w jakich warunkach są skuteczne, które obecne archetypy warto zachować lub połączyć, a którym brakuje mechaniki wykonawczej.

Każdą hipotezę oceniamy w łańcuchu:

**profil trenera → ustawienie zapisane → ustawienie efektywne → decyzja zawodnika → ruch/wykonanie → wynik posiadania.**

Rozróżniamy pięć rozstrzygnięć: działa zgodnie z intencją; działa tylko w określonym kontekście; ustawienie nie dociera do wykonania; mechanika działa, lecz pomysł jest nieskuteczny; materiał nie wystarcza. Brak istotności nie oznacza braku działania. Zwycięstwo nie dowodzi poprawności decyzji.

## 2. Punkty zaczepienia i ryzyka wynikające z kodu

- `src/matchEngine/aiCoachProfile.js`: 15 archetypów, cztery listy preferowanych stylów, force, dwa zestawy biasów, adaptability i conservatism. Wybór stylu łączy preferencje, dopasowanie składu i zgodność z huckAppetite. `flatStart` pomija preferencje w wyborze stylu. Opisy mindsetów nie sterują już wyborem stylu.
- Nakładanie profilu w `applyAiCoachProfileToIdentity` dotyczy sześciu osi i force. Rejestr `coachDirectives.js` ma 12 osi. Trzeba oddzielnie zbadać możliwości zawodników oraz możliwości ich wyrażenia przez obecny profil trenera.
- `aiLineup.js`: `aiCoachProfile: null` zachowuje bazową tożsamość klubu. To nie jest automatycznie neutralny trener. Gotowe taktyki mogą też zachować wcześniejsze style zamiast nowego wyboru profilu.
- `aiTacticsAdapt.js`: reakcje na wynik, serię punktów i opóźnione ustawienia przeciwnika mogą zmieniać styl i dyrektywy. Część zmian przechodzi między liniami. Ścieżka dodawania instrukcji po analizie punktu operuje na instrukcjach O-Line. Sprawdzamy zachowanie D-Line po odzyskaniu dysku oraz O-Line po stracie.
- Tryb paniki kumuluje przesunięcia suwaków. Trzeba zmierzyć nasycenie, powrót po poprawie wyniku, utratę tożsamości i koszt zbyt częstych zmian. Zwykły hold przeciwnika może uruchamiać ocenę słabej obrony — potrzebny osobny scenariusz.
- Istniejący `bench-ai-tactics-adapt-worker.mjs` zawiera profil ze starszym schematem pól. Nie używamy go bez migracji jako dowodu działania aktualnych 15 archetypów.
- Istniejący benchmark matchupów porównuje obrony przy wspólnym ataku obu stron. Jego wynik nie jest samodzielnym rankingiem stacków.

Poprzedni audyt jest punktem odniesienia, nie próbą testową: 48 meczów, completion 92,77%, resety 94,41%. Fast różnił się od pełnego silnika, dlatego nie kwalifikuje trenerów do finału. Dotychczasowy brak efektu niektórych atrybutów w wąskich scenariuszach wymaga nowych okazji do ich użycia, a nie uznania ich za martwe.

## 3. Wspólna metodologia

### Zamrożenie i kontrola porównań

Przed startem zapisujemy snapshot kodu, runtime, hash konfiguracji, rejestry stylów/instrukcji/atrybutów, rosterów, kolejki i reguł selekcji. Zmiany kodu podczas badania nie trafiają do snapshotu.

Wszystkie szczegółowe statystyki, traity, parametry fizyczne, role, morale, energia, forma i znajomość systemu muszą być zmaterializowane przed klonowaniem i zmianą identyfikatorów. Nie wolno pozostawić generowania cech zależnego od ID. Tożsamość klubowa, jitter profilu i kryzys sezonowy są jawnie zamrażane; badamy je osobno, nie jako ukryty losowy bonus.

Blok porównawczy ma ten sam roster, przeciwnika, warunki i seed scenariusza; zmienia jeden czynnik na jednej stronie. Pełne mecze mają rewanż z zamianą stron i rozpoczynającej linii. Ten sam seed nie gwarantuje identycznych późniejszych losowań po zmianie decyzji: nie deklarujemy dokładnego kontrfaktycznego odtworzenia, jeśli runner nie odtwarza pełnego stanu i RNG.

Neutralna kontrola ma jawnie określoną tożsamość, style, wszystkie dyrektywy, instrukcje i zasady rotacji. Oprócz niej używamy aktualnego `balanced_pro`, stałych przeciwników specjalistycznych oraz kontrolnej polityki zmian losowych z podobną częstością zmian. Kontrola losowa nie trafia do proponowanych trenerów.

### Składy i warunki

Sześć równoważnych pod względem budżetu umiejętności rodzin: zrównoważona; mocni handlerzy/reset; szybcy cutterzy/continuation; głębia i gra w powietrzu; obrońcy z dobrym czytaniem i pomocą; techniczna, lecz wolniejsza drużyna. Każda ma kilka niezależnych realizacji zawodników. Dopasowanie składu nie jest uzasadniane samym wewnętrznym wynikiem styleFit: oceniamy zachowanie na boisku.

Rdzeń: równy poziom, normalna energia i morale, brak wiatru. Osobne warstwy: różnica poziomów, wiatr boczny i wzdłużny w obu kierunkach, zmęczenie, niska znajomość systemu i niższe morale. Intensywności oraz jednostki zgodne z konfiguracją silnika, zapisane przed startem. Nie krzyżujemy wszystkich czynników ze wszystkimi: macierz pokrycia ma wskazać jawnie, które interakcje zbadano.

Finał wykorzystuje pełne mecze do 15 punktów, standardowe przepisy, zmęczenie i produkcyjne rotacje. Krótkie posiadania służą przyczynowości; nie dowodzą działania adaptacji w pełnym meczu.

## 4. Harmonogram: 480 minut aktywnego czasu

| Czas | Moduł | Wynik |
|---|---|---|
| 00:00–00:15 | Integralność i przepustowość | Wiarygodność sond, wydajność, ostateczne limity zasobów |
| 00:15–01:10 | Dyrektywy i instrukcje | Mapa ustawienie → zachowanie, konflikty i compliance |
| 01:10–02:10 | Stacki i obrony | Macierz 7 × 5 oraz wybrane interakcje |
| 02:10–03:05 | Aktualne archetypy | Karty 15 profili i izolacja ich składników |
| 03:05–03:50 | Adaptacja i zarządzanie | Reakcje na wspólne historie, panika, rotacje |
| 03:50–05:40 | Poszukiwanie konfiguracji | Ograniczony, automatyczny screening kandydatów |
| 05:40–07:40 | Zamknięty finał | Pełne mecze na niewidzianych danych |
| 07:40–08:00 | Raport i dowody | Agregaty, niepewność, karty trenerów i powtórki |

To budżety czasu, nie obietnica liczby meczów. Kolejka ma z góry ustalone rundy zrównoważonego pokrycia. Wydajność wpływa wyłącznie na liczbę rund, nie na wybór korzystnych wyników. Niewykorzystany czas może zasilić kolejne moduły; nie wolno zabrać rezerwy raportowania ani skrócić finału na rzecz poszukiwania.

Przy dwóch workerach jedna minuta meczu oznacza około dwóch meczów na minutę ścienną. Sondy i obciążenie komputera zmienią ten koszt. Po preflight runner dobiera możliwy plan spośród wcześniej zapisanych poziomów pokrycia. Jeżeli minimum się nie mieści, raportuje ograniczenie — nie zastępuje pełnego silnika trybem fast.

## 5. Moduł ustawień i instrukcji

Lista pochodzi z rejestrów snapshotu, nie z ręcznie wybranego podzbioru. Skale: −1/0/+1, trójstanowe według definicji, przełączniki 0/1; wszystkie warianty force. Każda instrukcja osobno, następnie tylko zaplanowane konflikty i pary komplementarne.

Każdy wariant otrzymuje minimum 16 niezależnych seedów na kontekst, docelowo 32. Co najmniej dwa konteksty: okazja do wykonania i brak okazji/kontekst nieodpowiedni. Powtarzamy właściwe fazy dla obu linii. Brak okazji nie liczy się jako odmowa wykonania.

| Rodzina | Sytuacja i oczekiwany dowód działania |
|---|---|
| Huck, selektywność, ryzyko | Wolna głębia kontra kryta głębia; zmiana wyboru przy zachowaniu oceny ryzyka |
| Break, kreatywność, force | Otwarta strona break kontra pułapka; wybór strony i techniki, faktyczne odebranie linii przez marka |
| Tempo, reset | Reset dostępny/niedostępny, różny stall; czas do decyzji, kontynuacja, koszt czekania |
| StackDepth, deep/under, przestrzeń | Głębokość startowa, moment wejścia, clear po niewybraniu, wolny korytarz dla drugiego zawodnika |
| Shade, cushion, tight/loose | Ochrona deep kosztem under i odwrotnie; odległość, orientacja, dozwolone i zabrane podania |
| Poach, pomoc, obrona resetu | Korzystne okno pomocy kontra pozostawienie groźnego odbiorcy; powrót, komunikacja i koszt odsłonięcia |
| Dominate/give_space, take_space/wait | Udział w akcjach względem roli, podwójne cuty, blokowanie przestrzeni kolegi |

Logujemy: pole wejściowe, normalizację, źródło nadpisania, linię i fazę, efektywną wartość, compliance, dostępne opcje i decyzję. Kierunek oczekiwanego efektu wynika z definicji danej kontrolki; nie zakładamy, że dodatnia wartość zawsze oznacza lepszą albo ostrożniejszą grę.

Interakcje: instrukcja zgodna/sprzeczna z trenerem; trait zgodny/sprzeczny; wysoka/niska umiejętność wykonania; znajomość systemu; morale; energia. Zmieniamy pojedynczą cechę w sklonowanym graczu. Szczególnie sprawdzamy routeCraft, resetMovement, matchupReading i resetDefense w dedykowanych sytuacjach. Endurance wymaga dłuższej ekspozycji, power okazji do dalekiego rzutu. Rozdzielamy atrybut nadrzędny od szczegółowego, aby migracja danych nie maskowała efektu.

## 6. Stacki, obrony i rozumienie przestrzeni

Rdzeń obejmuje wszystkie 35 par: vertical, horizontal, split, side, motion, hex, zone_offense przeciw person, all_person, cup, wall i clam. W fixture zmieniamy atak jednej strony i obronę drugiej, pozostałe ustawienia są kontrolowane. Minimum 16 seedów na komórkę dla każdego z trzech stanów: otwarcie po pullu, ustalony atak oraz przejście po stracie/odzyskaniu. Łącznie 1680 scenariuszy jako plan minimalnego pokrycia; próby niedokończone pozostają jawne.

Mierzymy strukturę rzeczywistą, nie zgodność samej etykiety:

- rozstawienie, głębokość i szerokość, zajęcie korytarzy rzutu oraz wejście dwóch cutterów w to samo okno;
- czas stworzenia pierwszej i kolejnej opcji, separację przy faktycznym oknie rzutu, clear po niewybraniu, odbudowę po zmianie strony;
- ciągłość podań, szerokość swingów, postęp ku strefie na posiadanie, puste posiadania bez postępu i zagrożenie stallem;
- utrzymanie zadań obronnych, podwojenia, niepilnowane strefy/odbiorców, przekazania krycia, reakcję na swing i zmianę posiadania;
- legalność przy linii, miejsce dostępnego chwytu, wpływ wiatru na wykonalność opcji; podanie lecące poza boiskiem nie jest automatycznie błędem.

Odległość lub zwrot celu co klatkę jest wskaźnikiem, nie samodzielnym dowodem błędu. Alarm przestrzenny wymaga czasu trwania, kontekstu i śladu. Definicje progów zapisujemy przed startem, a raport pokazuje wrażliwość na ich zmianę.

Interakcje rozszerzone: stack × tempo/głębokość, obrona × force/pomoc, profil składu × styl oraz wiatr × huck. Nie wykonujemy pełnego iloczynu wszystkich suwaków. Wybrane kombinacje skrajne służą wykrywaniu sprzeczności, nie ustalaniu uniwersalnego optimum.

## 7. Aktualnych 15 trenerów i izolacja przyczyn

Każdy profil przechodzi rzeczywistą ścieżkę inicjalizacji przez tożsamość, dobór składu, style, instrukcje i pełny mecz. Nie wpisujemy wcześniej gotowych stylów, które omijają jego wybory. Porównujemy profil bazowy bez jittera oraz osobną próbę produkcyjnego jittera.

Minimum: dwa sparowane bloki na profil, czyli 60 pełnych meczów dla 15 profili; cel rozszerzony: cztery bloki, 120 meczów. To screening i wykrywanie dużych problemów, nie wystarczająca próba do ogłoszenia rankingu 15 trenerów. Składy i przeciwnicy przydzieleni zrównoważonym planem, nie dobierani po wynikach.

W kontrolowanych punktach badamy wyłączenie kolejno: preferencji stylów, biasów dyrektyw, instrukcji indywidualnych, doboru składu/podról, adaptacji oraz rotacji. Osobne bramki utrzymują pozostałe mechanizmy identyczne; globalne wyłączenie AI nie jest poprawną izolacją samej adaptacji. Pełne mecze najważniejszych porównań dopiero przy dostępnej dodatkowej rundzie.

Wynik: które profile są odróżnialne zachowaniem, co tworzy różnicę, kiedy dopasowanie składu zaciera preferencje i kiedy adaptacja zmienia wszystkie profile w podobną politykę. Podobieństwo liczymy na cechach zachowania po uwzględnieniu kontekstu, nie na samych suwakach lub nazwach.

## 8. Adaptacja: ten sam problem dla każdego trenera

Wspólne historie punktów i stanów: zwykły hold przeciwnika; powtarzalna utrata resetu; dobre podanie zakończone dropem; złe podanie przypadkiem złapane; jeden pechowy punkt kontra trwały problem; odsłonięta głębia; zmiana obrony przeciwnika; zmęczenie kluczowego handlera; prowadzenie i przegrywanie; wejście do paniki i poprawa wyniku; kryzys sezonowy przy różnych lossStreak.

Mierzymy opóźnienie, adekwatność i częstotliwość reakcji, czas utrzymania planu, powrót po poprawie sytuacji, zmiany między liniami oraz koszt utraty zgrania. Rejestr decyzji pokazuje dane dostępne trenerowi. Osobno oznaczamy dostęp do metadanych taktyki rywala: to nie jest dowód rozpoznania jego gry z ruchu zawodników.

Porównania: adaptacja obecna; zamrożony plan początkowy; kontrola losowych zmian o podobnej częstości; kandydat z progami reakcji i minimalnym czasem utrzymania planu. Punkty po decyzji odtwarzamy z tego samego stanu, jeśli pełny stan jest serializowalny; w przeciwnym razie używamy niezależnych dopasowanych powtórzeń i oznaczamy ograniczenie.

Nie oceniamy reakcji jedynie po tym, czy następny punkt wygrano. Decyzja powinna rozwiązywać rozpoznany problem bez nadmiernego odsłonięcia innego obszaru. Ręcznie ocenione przykłady po zakończeniu będą potrzebne do sprawdzenia jakości automatycznych etykiet.

## 9. Rodziny kandydatów do przebudowy

To hipotezy, nie gotowe zwycięskie archetypy. Trener powinien mieć priorytet, wymagania kadrowe, sygnały zmiany, ograniczenia ryzyka i plan awaryjny.

| Rodzina | Sygnatura i warunki | Koszt / reakcja awaryjna |
|---|---|---|
| Kontrola posiadania | Handlerzy, reset–swing, cierpliwe otwieranie strony | Ryzyko jałowej wymiany; przy braku postępu zmiana punktu ataku |
| Flow i continuation | Szybkie kolejne opcje, skoordynowany clear, sprawni cutterzy | Koszt energii i chaos; spowolnienie po utracie struktury |
| Selektywna głębia | Tworzenie i wykorzystanie wolnego deep, mocny rzucający/odbiorca | Nie wymusza hucka przy zabranej głębi; under i reset jako odpowiedź |
| Izolacja i break | Tworzenie przestrzeni najlepszemu matchupowi, techniczny handler | Unikanie zagłodzenia reszty składu; swing przeciw podwojeniu |
| Presja i kontra | Odbieranie pierwszej opcji, szybki atak D-Line po odzyskaniu | Ryzyko minięcia i przemęczenia; przejście do kontroli, gdy kontra wygasa |
| Kontrola strefowa | Cup/wall, ograniczanie groźnych korytarzy, świadome oddawanie krótkich podań | Koszt szerokich swingów; zmiana kształtu lub person po rozbiciu |
| Hybryda i pomoc | Clam/poach, czytanie ruchu i przekazania krycia | Nie może polegać na przypadkowym porzucaniu graczy; uproszczenie zadań przy chaosie |
| Pragmatyk | Dobór do składu i rozpoznanego rywala, stabilne progi adaptacji | Koszt zmian; nie ma dostępu do przyszłych wyników ani ukrytych ocen rywala |

Nie wymagamy zachowania liczby 15 ani równego win rate każdego trenera. Specjalista może mieć wyraźne dobre i złe matchupy. „Mógłby działać” oznacza konkretnie nazwaną brakującą zdolność wykonawczą i scenariusz odbioru po jej dodaniu, nie domniemany sukces po podniesieniu statystyk.

### Automatyczne poszukiwanie bez modelu

Przed startem przygotowujemy jawny katalog: maksymalnie osiem rodzin × osiem wariantów. Warianty zmieniają tylko dozwolone ustawienia oraz zdefiniowane progi polityki; żadnego generowania kodu, dopisywania bonusów ani modyfikacji fizyki podczas biegu. Polityki wymagające nowej mechaniki pozostają hipotezami poza rankingiem.

Każda konfiguracja ma identyczny budżet pierwszej rundy scenariuszy. Kolejne rundy otrzymują kandydaci według zarejestrowanej selekcji: najpierw poprawność i realizacja intencji, potem skuteczność posiadania i odporność na złe matchupy. Zachowujemy różnorodność zachowania; maksymalnie jeden finalista z rodziny. Nierozstrzygnięte remisy rozstrzyga stała kolejność ID, nie ręczna decyzja podczas pracy.

Podział danych jest zapisany z góry: development do screeningu, validation do selekcji, holdout wyłącznie do finału. Rozdzielone są seedy i realizacje rosterów; holdout zawiera też nieużyte wcześniej kombinacje przeciwnika i warunków. Współdzielenie zawodników pomiędzy podziałami jest niedozwolone. Po selekcji zapisujemy hash maksymalnie czterech kandydatów i dwóch aktualnych profili referencyjnych. Finał nie może ich dostrajać.

## 10. Finał, metryki i siła wniosków

Do sześciu finalistów gra przeciw trzem stałym przeciwnikom kontrolnym: zrównoważonemu, presji indywidualnej i strefowemu. Te polityki są zamrożone przed screeningiem. Docelowo 12 sparowanych bloków na finalistę, 24 mecze; przy sześciu daje to 144 pełne mecze. Minimum sześć bloków na finalistę, 72 mecze łącznie. Plan rozkłada przeciwników i składy równomiernie, z kontrolowaną warstwą pogody. Niedobór bloków oznacza niepełne pokrycie, a nie milczące usunięcie wolnego lub słabego trenera.

Główne wyniki: szansa zdobycia punktu z posiadania, hold/break, różnica punktów i straty na 100 posiadań. Wynik meczu jest dodatkowym miernikiem. Definicje mianowników i linii startowej są zapisane w schemacie danych.

Drugorzędne: completion z podziałem na typ i trudność, reset completion, progresja, udział i jakość deep/break, stall, czas decyzji, koszt energetyczny, udział zawodników w ataku, przestrzeń i stabilność zadań obronnych. Cel 90–93% i 94–96% resetów pozostaje kontrolą kohorty referencyjnej, nie obowiązkiem dla każdej taktyki w każdych warunkach. Sam wzrost completion kosztem braku postępu nie kwalifikuje kandydata.

Nie przyjmujemy oceny expected completion z samego algorytmu wyboru podań za niezależną prawdę. Obok wyniku logujemy geometrie okazji, dostępność alternatyw oraz klasy przyczyn strat: zła selekcja, brak opcji wskutek ruchu, wykonanie rzutu, chwyt, blok, granica boiska i nieustalone. Nieustalone przypadki pozostają w mianownikach.

Przedziały ufności liczymy blokowym bootstrapem sparowanych meczów/scenariuszy; nie traktujemy podań ani klatek jako niezależnych meczów. Raport pokazuje liczebność efektywną, efekt w punktach procentowych, rozrzut między rosterami oraz pokrycie matchupów. Eksploracyjne liczne porównania oznaczamy osobno i kontrolujemy FDR; w finale mała lista hipotez ustalona przed jego startem.

Praktyczny próg promowania: zgodna z intencją, powtarzalna zmiana zachowania oraz przynajmniej +3 pp skuteczności posiadania w deklarowanej niszy; przedział sparowanej różnicy powinien wykluczać zero. Odporność: pogorszenie ogólne większe niż 3 pp wymaga jawnego uzasadnienia specjalizacją, nie ukrycia w średniej. To progi projektowe, nie empiryczne normy ultimate. Jeśli przedziały nie pozwalają rozstrzygnąć progu, status brzmi „obiecujący, wymaga większej próby”. Osiem godzin nie gwarantuje mocy wykrycia małych różnic dla każdego z 15 profili.

## 11. Wykonanie autonomiczne i bezpieczne wznowienie

- Jeden lokalny koordynator Node, domyślnie dwa workery, procesy Windows uruchamiane bez widocznych okien. Preflight ustala limity RAM, dysku i timeoutów. Monitoring procesów i zapisy są lokalnym kodem; nie wywołują modelu ani API.
- Po starcie nie ma cyklicznego sprawdzania przez asystenta, ręcznej selekcji ani pytań pomiędzy modułami. Przygotowanie i końcowe omówienie używają modelu; sam ośmiogodzinny bieg nie zużywa usage modelu. Powiadomienie końcowe można ustawić dopiero przy przyszłym starcie, bez okresowego odpytywania modelem.
- Monotoniczny limit 480 minut aktywnej pracy, z rezerwą ostatnich 20 minut na raport. Pauza nie zużywa pozostałego budżetu. Nowy blok wpuszczamy tylko, gdy mieści się jego oszacowany ostrożnie koszt wraz z rewanżem i zapisem. Timeoutów nie liczymy jako porażek sportowych.
- Checkpoint po punkcie i ukończonym zadaniu, zapis do pliku tymczasowego i atomowa podmiana; wersja schematu, hash wejścia i ID próby. Wznawianie z pełnego stanu tylko po dowodzie powtarzalności; inaczej niedokończony mecz rusza od seeda, z deduplikacją wyników. Wcześniej zużyty czas pozostaje zużyty.
- Wbudowane pause/stop przez plik sterujący lub IPC, potwierdzenie zatrzymania workerów, rejestr własnych PID i zatrzymanie wyłącznie własnego drzewa procesów. Stan PAUSED zapisujemy po potwierdzeniu, nie gdy dzieci nadal pracują.
- Ograniczone ponowienia awarii technicznych, brak zmiany seeda w celu „naprawienia” słabego wyniku. Powtarzalny błąd mechaniki blokuje dany wniosek i zostawia reprodukcję; niezależne moduły mogą kontynuować. Skażenie sond lub utrata integralności wspólnego stanu przerywa badanie z raportem błędu.
- Cenzurowane mecze, niepełne pary i czas wykonania pozostają widoczne. Analiza sportowa używa pełnych par; osobny raport pokazuje, czy odpadanie prób zależało od stylu. Nie wolno ukryć patologicznie wolnego systemu przez analizę tylko ukończonych meczów.
- Ślady zbierane przyrostowo: agregaty dla wszystkich prób, ograniczone próbki pełnego ruchu. Do 96 powtórek: połowa losowana warstwowo niezależnie od wyniku, połowa diagnostyczna. Manifest informuje, kiedy brakowało miejsca na dodatkowy ślad.

## 12. Artefakty końcowe i gotowość do przyszłego startu

Przyszły katalog `artifacts/engine-audit/tactics-8h/<run-id>/`:

- `REPORT.md`: co działa, co jest pozorne, co przebudować w pierwszej kolejności; oddzielone wyniki od hipotez.
- `control-effects.json`: pełna mapa żądanych i efektywnych ustawień, compliance i reakcji, wraz z pokryciem.
- `tactics-matrix.json`: 35 par, konteksty, efekty, niepewność i alarmy przestrzenne.
- `coach-cards.json` oraz czytelne karty: każdy obecny archetyp, wymagania kadrowe, sygnatura, dobre/złe matchupy, źródło efektu i decyzja zachować/połączyć/przebudować/odblokować mechanikę/brak danych.
- `candidate-configs.json`, `selection-log.json`, `holdout-results.json`: cała historia selekcji, zamrożeni finaliści i niezależny finał, bez automatycznego wdrożenia do gry.
- `coverage.json`, `failures.json`, manifest, checkpointy i indeks powtórek: odtwarzalność i lista brakujących dowodów.
- `REBUILD-PLAN.md`: proponowane archetypy jako polityki z warunkami, zmiany schematu profilu i mechanik zawodników oraz scenariusze odbioru każdej zmiany.

Przed uruchomieniem konieczne są: zgodny z aktualnym schematem adapter profili, niezależne przełączniki składników AI, sondy ustawień i przestrzeni, przygotowane fixture oraz podziały danych, katalog kandydatów, deterministyczna selekcja, raportowanie i obsługa pause/resume. Krótki odbiór techniczny ma sprawdzić neutralność sond, odtworzenie seeda, wymuszoną awarię i wznowienie bez podwójnego liczenia. Jego prób nie zaliczamy do wyników badawczych.

Po ośmiu godzinach otrzymamy automatyczny materiał do decyzji projektowych. Ocena wizualna wybranych akcji i interpretacja końcowa następują po zakończeniu; raport nie może twierdzić, że autonomiczny bieg zastąpił tę ocenę ani że dowiódł zgodności z prawdziwymi meczami bez zewnętrznej walidacji.
