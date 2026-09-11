# Godzinny audyt realizmu silnika — projekt

Status: DESIGN. Nie uruchomiono testu ani nie zmieniono mechaniki silnika. Dokument określa przyszły przebieg; runner i dodatkowe sondy wymagają przygotowania przed startem.

## Cel i granice wniosku

Przez 60 minut czasu rzeczywistego sprawdzić, czy pełny silnik tworzy wiarygodne posiadania i mecze: zawodnicy rozumieją przestrzeń, oferują podania, wybierają rozsądne rozwiązania, reagują na dysk i przeciwników, a wyniki zależą od umiejętności, stanu zawodnika oraz taktyki. Udane podanie może być złą decyzją; przegrana akcja może być dobrym zagraniem ze złym wykonaniem.

To audyt zamrożonej wersji, bez strojenia w trakcie godziny. Pełny silnik jest przedmiotem oceny ruchu; fast służy do osobnego sprawdzenia zgodności statystycznej.

Punkt odniesienia z poprzedniej walidacji: resety 94.54% (727/769), wszystkie podania 93.24% w 12 meczach. To wynik poprzedniej wersji/pomiaru, a nie niezależny dowód realizmu. Aktualne hashe kodu zostaną zapisane przy uruchomieniu. Cele projektowe pozostają: ogólne completion 90–93%, resety 94–96%, oceniane w referencyjnej kohorcie, nie osobno dla każdego meczu, poziomu zawodników i skrajnego wiatru.

Obecny kod ma boisko 100 ×37 m, strefy po 18 m i mecz do 15 punktów. Porównanie z prawdziwymi rozgrywkami wymaga zgodnego formatu, poziomu i definicji statystyk. Nie należy utożsamiać nazw drużyn UFA z pełną zgodnością zasad silnika z tymi rozgrywkami.

## Harmonogram: dokładnie 60 minut

| Czas od startu | Moduł | Przeznaczenie |
|---|---|---|
| 00:00–04:00 | Kontrola pomiaru | Manifest, powtarzalność, neutralność sond, pomiar tempa i pamięci |
| 04:00–10:00 | Kontrolowane sytuacje | Zwykłe zagrania, trudne decyzje, przejścia między fazami |
| 10:00–30:00 | Pełne mecze | Rzeczywisty ciąg posiadania, składy, taktyki, zmęczenie i rotacje |
| 30:00–42:00 | Taktyki i założenia trenerskie | Odrębny materiał bazowy pod późniejszy pomiar i balans |
| 42:00–49:00 | Wpływ cech zawodników | Sparowane zmiany atrybutów, traitów, morale i formy |
| 49:00–54:00 | Warunki trudne i symetria | Wiatr, zmęczenie, granice boiska, odbicia, presja czasu, transformacje |
| 54:00–57:00 | Fast i materiał do oceny | Te same zestawienia w fast; wybór i przygotowanie powtórek |
| 57:00–60:00 | Raport | Agregaty, niepewność, pokrycie, błędy i lista priorytetów |

Harmonogram oznacza budżety czasu, nie obietnicę określonej liczby meczów. W dotychczasowych pomiarach pełny mecz często zajmował około 20–50 s; nowe sondy mogą ten czas wydłużyć. Zakładamy około 35–60 pełnych meczów i kilka tysięcy kontrolowanych zagrań. Liczby po wykonaniu będą raportowane, nie dopisywane do planu jako osiągnięte.

### Kontrola zegara i zasobów

- Domyślnie jeden proces wykonuje pełne symulacje. Osobny lekki koordynator kontroluje czas, zapis i pamięć. Więcej workerów tylko po pomiarze zasobów, nie kosztem ryzyka wyczerpania RAM.
- Używamy zegara monotonicznego. Od 57:00 nie uruchamiamy symulacji; do 60:00 kończymy raport. Przed każdą nową pracą rezerwujemy czas na jej przewidywany koszt i zapis. Prace uruchomione późno mogą zostać przerwane na granicy punktu.
- `initMatchSession` + `playNextPoint` pozwalają zapisywać wyniki po punktach. Niedokończony mecz oznaczamy `censored`; nie dopisujemy zwycięzcy, punktu ani straty. Nie wchodzi do completion kohorty pełnych meczów. Timeout i przyczyna przerwania pozostają widoczne w raporcie, aby wolne/patologiczne mecze nie znikały z oceny.
- Koordynator ma twardy watchdog dla zawieszonego punktu/procesu. Ostatni zapis i identyfikatory odtwarzania pozostają dostępne. Watchdog nie jest mechanizmem sportowego rozstrzygnięcia.
- Wolny czas modułu przechodzi do kolejnego; rezerwa raportowania pozostaje stała. Przy niedoborze czasu najpierw pomijamy dodatkowe powtórzenia. Nie redukujemy po cichu wymaganych kategorii ani nie wybieramy prób po ich skuteczności.
- Limit RAM/dysku zapisujemy w manifeście po sprawdzeniu dostępnych zasobów. Przetwarzanie śladów i zapis są przyrostowe; nie przechowujemy wszystkich klatek całej godziny w RAM. Po przekroczeniu limitu dysku zostają agregaty, pierwsze dowody błędów i lista pominiętych śladów.

## 1. Kontrola wiarygodności pomiaru

Zamrozić źródła, konfigurację, roster, taktyki i wersję runtime. Manifest zawiera wszystkie seedy i kolejkę prób oraz aktualną listę atrybutów/traitów. Losowanie kolejności i próbkowanie diagnostyczne mają własny RNG, niezależny od RNG meczu. Nowe seedy nie pochodzą z poprzednich kalibracji.

Ten sam krótki zestaw sytuacji i jeden mecz odtworzyć z sondami oraz bez nich. Porównać sportowe zdarzenia i stan ruchu, pomijając czas CPU i dodatkowe pola diagnostyczne. Rozbieżność oznacza skażenie pomiaru. Sondy nie mogą zmieniać kolejności obliczeń AI, konsumować RNG ani udostępniać zawodnikom dodatkowej wiedzy.

Uruchomienie w innym porządku procesów nie może zmieniać wyników tego samego seeda. Wymagane są świeże instancje graczy i wyczyszczone pamięci percepcji/rejestry. Manifest ujawnia także migrację atrybutów: obecnie m.in. `routeCraft`, `resetMovement`, `matchupReading`, `resetDefense`, zamiast ich dawnych aliasów.

## 2. Kontrolowane sytuacje: od ustawienia do skutku

Zachować istniejące 17 scenariuszy lotu, ale dodać wejście kilka sekund PRZED rzutem. Test zaczynający się dopiero w momencie wypuszczenia nie sprawdza, czy zawodnicy potrafili przygotować sytuację.

| Rodzina | Próby i pytania |
|---|---|
| Bezpieczny reset | Stojący i biegnący odbiorca, reset za plecami, boczny swing, presja marka; czy powstaje czytelna oferta i czy nie pojawia się zbędny layout? |
| Reset–upline–kontynuacja | Zamknięty pierwszy kierunek, zmiana oferty, powrót do struktury; czy atak gra dalej po złapaniu? |
| Incut i minięcie okna | Bieg do dysku, ruch od dysku, nawrót, hamowanie; czy decyzja respektuje bezwładność? |
| Dwóch cutterów | Wspólny korytarz, przecięcie tras, clearing; czy gracze uwalniają miejsce zamiast biec w tę samą pozycję? |
| Przestrzeń za obroną | Wolny deep oraz ten sam deep z pomocą obrońcy; czy zmieniają się cel i decyzja o rzucie? |
| Mark i break | Forehand/backhand, wyjście na otwartą stronę, zasłonięty release; czy obrońca rzeczywiście zamyka kierunek? |
| Obrona zespołowa | Person, cup, wall, clam; ruch dysku przez środek i swing, przekazanie krycia, reakcja pomocy |
| Linia i strefa punktowa | Bliski out, toe-in/toe-out, dysk wychodzący i wracający, zatłoczona strefa |
| Strata i szybki atak | Przejęcie, dysk na ziemi, podniesienie, nowy marker i pierwsze podanie; poprawna zmiana ról i posiadania |
| Presja czasu | Taki sam układ przy stallu 2, 5 i 8; wzrost akceptowanego ryzyka bez fikcyjnego resetowania licznika |
| Błąd wykonania | Celny rzut, chybienie kierunku, błąd wysokości/krzywizny, zbicie; czy odbiorca reaguje na obserwację, a nie przyszłość? |

Każda rodzina ma co najmniej jeden wariant prosty i jeden utrudniony. Minimum 32 seedy na wariant; preferowane 128, o ile budżet pozwala. Próby „idealne wykonanie” i „normalne wykonanie” mają osobne wyniki; nie wyłączamy automatycznie całej losowości catch/defense pod etykietą „idealny rzut”.

## 3. Pełne mecze — podstawowa kohorta

Minimum **24 pełne mecze referencyjne**: 3 zestawienia składów ×2 zestawienia taktyczne ×2 seedy ×2 zamiany home/away. Większa próba dokłada całe rundy tej macierzy. Dodatkowo minimum 4 pełne mecze w module taktyk i 4 w trudnych warunkach. Niespełnienie minimum daje wynik „niepełne pokrycie”, nawet jeśli completion wygląda dobrze.

Składy wybieramy z zamrożonego świata ligowego, a nie wyłącznie Seattle/Boston: dwie zbliżone mocne drużyny, dwie zbliżone drużyny środka stawki, mocniejsza kontra słabsza. Dobór przed startem na podstawie rozkładu umiejętności, ról i głębokości składu. OVR jest opisem, nie jedynym kryterium. Snapshot świata powstaje bez modyfikacji zapisu kariery użytkownika.

Zestawienia taktyczne: (A) horizontal/vertical przeciw person, (B) zone offense przeciw cup/wall. Początkowe ustawienia, force i instrukcje są jawne; adaptacja AI, rotacje, normalne zmęczenie oraz produkcyjny pipeline morale/formy/urazów pozostają włączone. Raport zapisuje faktycznie użyte taktyki i ich zmiany. Split, side, motion, hex i clam obejmujemy kontrolowanymi scenariuszami oraz powtórzeniami dodatkowej kolejki — nie deklarujemy pełnej walidacji meczowej każdej kombinacji.

Pogoda w kohorcie referencyjnej: balans spokojnych i umiarkowanych warunków 0–15 mph z jawnymi kierunkami. Zamiana drużyn nie jest testem lustrzanej geometrii, a ten sam seed po zamianie nie gwarantuje tych samych zdarzeń. Wyniki są analizowane jako sparowane mecze, nie identyczne podania.

Osobno raportujemy: początek i koniec meczu, O-line i D-line po przejęciu, równe i nierówne zestawienia, taktykę, siłę/składowe wiatru oraz stan zawodników. Naturalnych meczów nie mieszamy z eksperymentami sztucznie obniżającymi energię.

## 4. Co dokładnie mierzymy

| Warstwa | Miary i interpretacja |
|---|---|
| Ruch | Droga i prędkość, przyspieszenie/hamowanie, zmiana kierunku, stanie bez oferty, oscylacje celu, clearing, zbędne skoki/layouty, nakładanie sylwetek i czas nakładania |
| Przestrzeń | Liczba graczy w korytarzu rzutu, równoczesne cuty w ten sam obszar, dostępność resetu, szerokość/głębokość ataku, pozycja pomocy, odbudowa struktury po podaniu |
| Decyzja | Opcje widziane i odrzucone, wiek obserwacji, wybrany cel/technika/tor, czas otwartego okna do rzutu, pominięta bezpieczna oferta, wymuszony rzut, zbędne zwlekanie |
| Wykonanie | Błąd celowania i kształtu, termin reakcji, minięcie przewidywanego okna, chwyt stojąc/w biegu/layout, kontakt obrońcy, odzyskanie dysku po zbiciu |
| Obrona | Utrzymanie force, zamykanie resetu, cushion i separacja w czasie, reakcja na zmianę kierunku, przejęcie/pomoc, ochrona deep, powrót po nieudanym poachu |
| Posiadanie | Podania, rzeczywisty zysk terenu i straty na posiadanie, czas posiadania, reset-chain, A→B→A, tempo po turnie, konwersja wejścia w strefę |
| Mecz | Completion wszystkich typów, hold/break/clean hold z jawną definicją, wynik, rotacje, obciążenie i energia, różnice końcówki, timeouty i limity |

Mierzymy SETUP, IN_FLIGHT i przejścia, nie tylko lot. Obecne `bodyExposure` obejmuje wyłącznie IN_FLIGHT i nie jest detektorem faulu; do audytu potrzebne jest rozszerzenie pomiaru, nie zmiana resolvera kontaktów.

Reset to `dump_swing` według klasyfikacji zagrania; rola `isDump` jest osobnym wymiarem. Każdy wynik ma licznik, mianownik oraz liczbę niezależnych meczów. „Blok”, „drop” i „bez kontaktu” to obserwowane zakończenia; aim_error/wiatr/fatigue mogą być współwystępującymi czynnikami, a nie automatycznie potwierdzoną przyczyną.

### Ocena decyzji niezależna od końcowego completion

Logować stan przed skanem, wiedzę gracza, wybraną opcję i alternatywy. Dla ograniczonej próbki analizować, czy istniała wyraźnie bezpieczniejsza opcja o podobnym celu taktycznym albo sensowna możliwość poczekania. Sam wysoki score we własnej funkcji AI nie dowodzi dobrej decyzji.

Ocena ma dwa poziomy: „rozsądne przy dostępnej wiedzy” oraz „co rzeczywiście było na boisku”. Ukryta lub nieaktualna opcja nie może automatycznie obciążać gracza za brak wszechwiedzy. Dobre decyzje ze złym wykonaniem oraz złe decyzje zakończone sukcesem trafiają do osobnych kategorii.

Do 24 wybranych stanów odtworzyć alternatywę na niezależnych kopiach stanu i z kilkoma lokalnymi seedami. Odtwarzanie zaczyna się z początku akcji/punktu, żeby zachować pamięć percepcji i rejestry; sam JSON pozycji zawodników nie jest pełnym stanem. Wyniki kontrfaktyczne są pomocniczym pomiarem, nie dowodem, co na pewno zrobiłby przeciwnik. Nigdy nie trafiają z powrotem do produkcyjnej decyzji AI.

## 5. Atrybuty, traity i stan zawodnika

Testujemy jedną zmianę naraz, na tych samych startowych stanach. Atrybut bazowy oraz ±10, przycięte do legalnego zakresu; raport podaje rzeczywistą zmianę po normalizacji. Pełne umiejętności zapisane jawnie, bez przypadkowego przeliczania dzieci po zmianie rodzica/aliasu.

W kontrolowanych sytuacjach pokryć wszystkie aktualne atrybuty: minimum 2 konteksty ×3 poziomy ×16 seedów na atrybut. Każdy ma z góry zdefiniowaną miarę pośrednią i kontekst, w którym powinien działać. Brak efektu po sufitowym resecie nie świadczy o martwym atrybucie.

| Rodzina | Oczekiwany rodzaj wpływu |
|---|---|
| Technika, touch, releaseControl, power, windControl | Odpowiednio kierunek, dozowanie/kształt, zasięg i reakcja na wiatr; nie wspólne +completion do wszystkiego |
| Speed, acceleration, agility, balance, endurance | Dobieg, start, nawrót, kontrola ruchu i utrata wydolności; wzrost szybkości nie musi polepszać każdego ciasnego nawrotu |
| Vision, anticipation, spatialAwareness, reactions, decisionMaking, composure | Widoczność i świeżość opcji, reakcja, wybór przestrzeni i zachowanie pod stallem |
| RouteCraft, resetMovement, cutTiming, wiedza systemowa | Lepsza oferta, timing i współpraca; nie modyfikowanie prędkości dysku |
| Catching, discReading, jump | Pewność kontaktu, odczyt lotu i osiągnięta wysokość; nie wydłużanie ramion przez morale |
| MatchupReading, resetDefense, positioning, marking, blocking | Zachowanie krycia/marka, zamknięcie okna i skuteczny kontakt |

Traity/instrukcje: przed godziną wybrać z aktualnego rejestru co najmniej 12 mechanicznie różnych par on/off, obejmujących layout, high-disc attack, fake, ruch/reset, huck/shape, poach/mark oraz ryzyko/tempo. Mierzyć zachowanie na ekspozycję (np. layout na okazję), nie surową liczbę na mecz. Wykluczyć konflikty traitów i uwzględnić właściwą rolę oraz warunki aktywacji. To nie jest pełna walidacja wszystkich traitów.

Morale np. 35/65/90, energia 25/60/100 i forma w legalnych zakresach są osobnymi osiami. Stan ustawiać we właściwym miejscu pipeline’u, by inicjalizacja go nie nadpisała, a modyfikator nie został zastosowany dwukrotnie. Sprawdzać również zestawienie niskiej energii z presją czasu. Różnice widoczne w naturalnych meczach są obserwacyjne; kierunek przyczynowy ustalamy w sparowanych sytuacjach. Ten budżet nie wystarczy do potwierdzenia meczowego wpływu każdego atrybutu.

## 5a. Taktyki i trener — baza pod następny etap

Zgodnie z dodatkową decyzją użytkownika wydzielamy 12 minut na pomiar działania taktyk. Celem jest wykryć martwe ustawienia, błędny kierunek wpływu, nieszczelność zakresu działania i pierwsze interakcje. Nie stroimy siły taktyk i nie wymagamy równego win rate wszystkich stacków.

### Zakres i porównania

- Wszystkie 7 systemów ataku z aktualnego rejestru: vertical, horizontal, split, side, motion, hex, zone offense. Każdy wobec person i zone cup w kontrolowanych punktach z tego samego startowego układu dysku, tego samego składu i stanu zawodników. Minimum 2 seedy na komórkę; preferowane 4–8, gdy pozostaje czas.
- Wszystkie 5 ustawień obrony: person, all_person, zone_cup, zone_wall, clam. Każde wobec horizontal oraz zone offense. Wspólne komórki z poprzednią macierzą wykonujemy raz. Raport nie zakłada, że podobnie nazwane warianty są identyczne — pokaże, czy ich ślady się różnią.
- Wszystkie aktualne założenia trenerskie: osobno wartość bazowa i legalne skrajności, na dwóch seedach krótkich punktów/posiadań. Suwaki −1/0/+1; toggle 0/1, bez nielegalnego poziomu −1. Baseline może być współdzielony tylko przy identycznym składzie, stanie, konfiguracji i seedzie.
- Force forehand/backhand/middle/sideline/straight: kontrolowane sytuacje po obu stronach boiska i mark na odpowiedniej stronie dysku.
- 4 pełne mecze diagnostyczne: dwie pary baseline/treatment na dwóch seedach z tymi samymi zespołami. Zmiana jednej z góry wybranej osi, np. person →zone cup. Adaptacja taktyki wyłączona w parze, rotacje pozostają identycznie skonfigurowane. To test przeniesienia zachowania na cały mecz, nie ranking skuteczności.

W pomiarze izolującym taktykę stałe są przeciwnik, roster, energia, morale, forma, force i pozostałe dyrektywy. W kohorcie naturalnej adaptacja pozostaje włączona; oba rodzaje prób mają osobne etykiety. Nie porównujemy stacka granego przez elitarnych handlerów z innym stackiem granym przez słabszy skład jako dowodu przewagi systemu.

### Miary przypisane do ustawień

| Ustawienie / grupa | Co ma być widoczne w zachowaniu |
|---|---|
| System ataku | Szerokość/głębokość ustawienia, pozycja resetów, liczba i kierunki cutów, clearing, kontynuacja, zajętość korytarzy; osobno kształt startowy i organizacja po 2–3 podaniach |
| Person / all_person | Przydziały i przekazania krycia, separacja, powrót do zawodnika po zmianie kierunku dysku |
| Cup / wall / clam | Obsada ról, przesuwanie całej obrony, dziury między warstwami, ochrona środka/deep, reakcja na swing i wejście dysku do środka |
| creativity, huckAppetite, breakAppetite | Rodzaj rozważanych i wybranych podań, kierunek/technika, ryzyko i wykorzystanie istniejących okazji |
| passSelectivity, possessionTempo | Czas decyzji przy dostępnej opcji, progi przyjmowania ryzyka, pominięte okna, stalls i resety |
| stackDepth | Głębokość ustawienia i punktów ofert względem dysku, z uwzględnieniem granic/strefy |
| coverageShade, cushionDepth | Broniona strona i odległość krycia w stosunku do zawodnika, podania under/deep oddawane świadomie |
| markShape | Ustawienie i geometria marka, zamknięte kierunki oraz rzeczywista presja release |
| poachSeeking, helpDeep, poachResetHandler | Czas w pomocy, decyzje opuszczenia krycia, broniony obszar, okna pozostawione przeciwnikowi i czas powrotu |

Miary są na okazję lub czas ekspozycji: brak hucków nie dowodzi martwego huckAppetite, jeśli nie powstał żaden realny deep look. „Brak okazji” ma własny status i wywołuje kontrolowany scenariusz z taką okazją w ramach budżetu.

### Zakres instrukcji i interakcje

Każda obserwacja przechowuje pochodzenie linii O/D, aktualną fazę offense/defense, role graczy, wiedzę systemową, compliance oraz dyrektywy zadane i efektywne. O-line po stracie musi korzystać ze swoich założeń obronnych; D-line po przejęciu ze swoich założeń ofensywnych. Sprawdzić brak przecieku ustawień do drugiej linii i właściwą kolejność priorytetów wobec instrukcji indywidualnych.

W małej próbce 2×2 sprawdzić maksymalnie cztery interakcje zapisane przed startem: tempo ×selectivity, stackDepth ×system, poachSeeking ×helpDeep, reset poach ×force. Dalsze kombinacje pozostają do późniejszego balansu. Liczba wszystkich systemów ×obron ×suwaków ×cech jest zbyt duża, by wiarygodnie pokryć ją w godzinę.

Materiał do następnego etapu: macierz system ataku ×obrona, sparowane różnice miar z mianownikami, profile zachowania każdej dyrektywy, efekty uboczne i brakujące ekspozycje. Zapisujemy również koszt: utratę struktury, odsłonięty obszar, zmęczenie i spowolnienie decyzji. Wyższe completion lub więcej bloków nie oznacza automatycznie lepszej taktyki.

## 6. Trudne warunki i testy niezmienników

- Wiatr 0/10/20/30 mph, wzdłuż, przeciwnie i w poprzek kierunku podania. Analizować składowe względem rzutu; 30 mph to osobna próba skrajna bez wymagania 94–96% resetów.
- Długie posiadanie z wieloma resetami, końcówka meczu, cienka ławka, energia niska, zatłoczona strefa, brak łatwej oferty, przejęcie pod własną strefą.
- Out i powrót dysku, toe-in/toe-out, dysk zbity i odzyskany, poprawna pozycja wznowienia oraz przypisanie faktycznego łapiącego/obrońcy.
- Obrót o 180° razem z wiatrem i kierunkiem ataku powinien zachować rozwiązanie odpowiednio przekształconej sytuacji. Nie obracać całego prostokątnego boiska o 90° bez zamiany wymiarów. Odbicie lustrzane wymaga również zamiany handedness/krzywizny/force; inaczej nie jest symetrią fizyczną.
- Brak NaN, teleportów, nielegalnych zmian posiadania, punktu bez legalnego chwytu, sztucznego wyniku po limicie; zachowanie geometrii ciała. Tolerancje numeryczne i ruchu definiujemy przed testem, z uwzględnieniem dt, zmęczenia, skoku oraz layoutu.

## 7. Progi, statystyka i werdykt

**Twarde błędy:** nawet jeden nielegalny punkt/stan posiadania, teleport ponad ustaloną fizyczną tolerancję, NaN, wynik z throw/action limitu albo złamanie powtarzalności daje FAIL danej mechaniki. Nie przerywa automatycznie pozostałych modułów; zapisujemy pierwszy ślad i kontynuujemy niezależne diagnozy. Uszkodzone środowisko, awaria sond lub brak zasobów daje INVALID/INCOMPLETE, nie ocenę sportową silnika.

**Cele projektu:** completion 90–93% i resety 94–96% w referencyjnych warunkach; raport osobno pokazuje mocne i średnie drużyny oraz wagi ich udziału. Podajemy zarówno wynik na wszystkie podania, jak i średnią z równymi wagami z góry określonych komórek, żeby łatwe mecze/duża liczba krótkich podań nie ukryły trudnych przypadków. Nie wymuszamy tego pasma w stresie ani w każdej małej podgrupie.

**Alarmy heurystyczne do przeglądu**, nie prawa prawdziwego ultimate: ponad 8 kolejnych resetów z mniej niż 3 m zysku netto; wielokrotna zmiana celu w krótkim oknie bez nowej informacji; ponad 2 s bez oferty mimo widocznej dostępnej przestrzeni; utrzymujący się konflikt tras/nałożenie sylwetek. Dokładne definicje okien i tolerancji są częścią manifestu przed startem. Alarm sam w sobie nie jest potwierdzeniem błędu ani faulu.

95% przedziały ufności obliczać przez bootstrap po meczach lub kompletnych sparowanych blokach. Dla sytuacji kontrolowanych po niezależnych seedach, nie po klatkach. Minimum 500 resetów z co najmniej 8 meczów do oceny pasma resetów; 1000 podań z minimum 12 meczów do oceny globalnej. To progi raportowania, nie gwarancja wąskiego CI. Szeroki przedział przecinający granice pasma oznacza wynik niejednoznaczny. Nie uznawać setek podań z jednego meczu za setki niezależnych meczów.

Kierunkowe efekty cech oceniać na sparowanych różnicach i rozkładach. Ustalić główne hipotezy przed startem; pozostałe są eksploracyjne. Przy szerokim przeglądzie atrybutów korygować wielokrotne porównania lub oznaczać sygnały do osobnego potwierdzenia. Nie deklarować regresji po różnicy jednej–dwóch losowych strat.

Raport rozdziela: (1) poprawność mechaniki, (2) cele statystyczne, (3) wiarygodność zachowania, (4) wpływ cech, (5) pokrycie i wydajność. Każda część ma PASS/FAIL/INCONCLUSIVE. Nie będzie jednej zielonej oceny realizmu za samo completion.

## 8. Odniesienie do prawdziwych meczów i oglądanie gry

Przed właściwym uruchomieniem przygotować, jeśli dostępne, zamrożony zbiór obserwacji rzeczywistych meczów zgodnego formatu: poziom, sezon, definicje podań/resetów/hold, mianowniki i źródła. Nieznany wiatr zostaje nieznany; z samego box score nie wnioskujemy o ruchu ani decyzjach. Istniejący `calibration-reference.mjs` pomaga walidować wejście na poziomie podań, ale nie dostarcza sam danych referencyjnych.

Bez takiej próbki godzina może wykryć błędy, ocenić spójność i zgodność z celami projektowymi. Empiryczna zgodność z prawdziwą grą pozostanie INCONCLUSIVE. Nie wpisujemy wymyślonych norm hold%, liczby hucków czy separacji.

W godzinie przygotować pakiet do oceny wizualnej: 24 powtórki przez próbkowanie warstwowe (zwykły sukces, strata, dłuższy setup, obrona/przejście — po 6) oraz do 24 najbardziej diagnostycznych alarmów. Reguły kwalifikacji, pierwszeństwo nakładających się kategorii i seed selektora ustalamy przed startem; przypisanie sukcesu/straty następuje oczywiście po zakończeniu akcji. Losowanie wewnątrz kategorii nie zależy od oceny jakości zagrania. Częstość problemów szacujemy z uwzględnieniem udziałów kategorii w całej próbie, nie z surowego odsetka w 24 klipach. Najgorsze przypadki służą diagnozie. Przy braku okazji pokazać brak pokrycia, nie duplikaty.

Każda powtórka obejmuje akcję przed rzutem, lot i następne zagranie; układ boiska, wysokość dysku, cele ruchu, prędkości, wiek obserwacji, stall i oś zdarzeń. Osobno widok rzeczywistego stanu i wiedzy rzucającego. Pierwszy przebieg może zatrzymywać się przed wynikiem do oceny decyzji, drugi pokazuje skutek. Przegląd człowieka nastąpi po godzinie; automatyczny raport nie będzie udawał, że wszystkie klipy obejrzano.

## 9. Co trzeba przygotować przed odpaleniem

Istnieje baza: `snapshot-engine.mjs`, `balance-engine.mjs`, `engine-realism.mjs`, `calibrate-situations.mjs`, testy geometrii i ruchu, `THROW_SCAN_DIAGNOSTICS`, `throwDiagnosis`, `styleEvidence`, `calibration-reference.mjs`.

Potrzebne są dodatki testowe: manifest i koordynator godzinny, wybór składów spoza demo, sterowanie taktykami/pogodą bez stałych nadpisań obecnego harnessu, checkpoint po punktach, sondy setupu/alternatyw i pośrednich efektów cech, rozliczanie ekspozycji, selektor śladów oraz raport z CI i pokryciem. W module taktyk wykorzystać podejście sparowane i sondy z `bench-player-instructions.mjs` oraz `bench-coach-directives.mjs`, ale dopasować liczbę workerów, długość prób i stan startowy do budżetu; nie uruchamiać ich nieograniczonych konfiguracji domyślnych. Obecny callback skanu nie zawiera całej wiedzy obrońców, wszystkich powodów odrzucenia i kompletnego stanu do replay — trzeba go uzupełnić w sposób neutralny dla symulacji.

Nie uruchamiać obecnych benchmarków z arbitralnie większą liczbą meczów i nie nazywać tego realizacją tego projektu. Przygotowanie runnera jest etapem przed godziną; test nie korzysta z automatycznego dopasowywania parametrów.

## Wynik do przekazania po godzinie

Proponowany katalog: `artifacts/engine-audit/hour-realism/<run-id>/`.

- `manifest.json`, `jobs.jsonl`: wersja, seedy, zasoby, próby wykonane/pominięte/przerwane, czasy.
- `matches.jsonl`, `situations.jsonl`, `effects.json`, `summary.json`: liczniki, mianowniki, podgrupy, sparowane efekty, CI i pokrycie.
- `tactics-baseline.json`, `coach-effects.json`, `tactics-coverage.csv`: macierz systemów i obron, zachowanie zadane/efektywne, próby on/off, ekspozycje i luka w pokryciu pod przyszły balans.
- `anomalies.jsonl`, `replays/`, `review.html`: odtwarzalne akcje, klasyfikacja dowodu, materiał wizualny.
- `REPORT.md`: odpowiedź, co działa, co jest błędem, co jest podejrzeniem, a czego nie udało się sprawdzić. Lista maksymalnie 10 problemów uporządkowanych według częstości, kosztu sportowego i pewności diagnozy; każdy z przykładem oraz proponowaną naprawą i testem regresji.

Próby odtwarzane później z replay mają jawny osobny czas i nie zwiększają próby głównej. Test nie zapisuje zmian w karierze, nie zmienia balansu i nie wdraża automatycznych poprawek.
