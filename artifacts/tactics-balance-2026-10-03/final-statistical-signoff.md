# Końcowy przegląd statystyczny — 2026-10-03

Źródło: `artifacts/engine-audit/tactics-balance-2026-10-03-validation/comparison/comparison.json`, wygenerowane `2026-10-03T20:15:08.775Z`. Przegląd tylko do odczytu; bez nowych meczów, testów silnika ani zmian produkcyjnych. Dla instrukcji rzutowych i reset-poachu odtworzono także kontrasty pojedynczych seedów z plików meczowych przy użyciu tej samej definicji równo ważonej pary home/away (`makeBlock`).

## Zgodność liczb i zakres wnioskowania

- Zaplanowano i zapisano 498 meczów BEFORE oraz 498 AFTER, łącznie 996. Brak brakujących, zduplikowanych i nieplanowanych wyników; `globalIssues=[]`, obie listy `versions.*.issues=[]`.
- Wszystkie pliki mają status `complete`, ale trzy mecze BEFORE zawierają błędy twarde. Poprawne pełne mecze: BEFORE 495/498, AFTER 498/498. Sam status `complete` nie oznacza poprawnego wyniku sportowego.
- Wspólna próba sportowa to **246 pełnych par home/away, czyli 492 mecze na wersję**. Wykluczone są trzy całe bloki: `holdout-0-matrix-00027-configured`, `holdout-0-matrix-00028-configured`, `holdout-2-matrix-00028-configured`. Poprawione wyniki tych bloków AFTER należą do oceny niezawodności, lecz nie do sparowanego sportowego przed/po.
- 83 komórki kontekstowe: **81 z n=3**, HEX/cup/calm z **n=2**, HEX/wall/calm z **n=1**. Wszystkie 24 kontrasty treatment−neutral mają n=3; brak niedopasowanych neutralnych bloków.
- Wspólna próba zawiera 145 odrębnych wartości seeda, ale tylko **3 pary syntetycznych rosterów** jednej rodziny. Nie są to 145 niezależnych populacji zawodników. W obrębie komórki jednostką replikacji jest seed z parą rosterów, a nie pojedynczy mecz, rzut ani klatka. Pierwsze posiadanie w zachowanych blokach: A 163, B 83; zamiana home/away nie równoważy tego dodatkowo.
- Brak CI dla agregatów overall/byCohort oraz wszystkich komórek n<3 został sprawdzony w końcowym JSON. CI przy n=3 ma status eksploracyjny; nie daje podstaw do wyboru zwycięskiej taktyki, deklaracji istotności ani dopasowywania wag. Przy tak małej próbie granice bootstrapu często pokrywają się ze skrajnymi wartościami trzech replik.
- Instrumentacja: `COMPATIBLE_TERMINAL_FAILURE_EXTENSION`, a nie identyczna bajtowo; comparator akceptuje wyłącznie opisaną rozszerzoną obserwację terminalnej awarii. Nie ma blokującej niezgodności źródeł pomiaru.

## Pięć ostrożnych wniosków do raportu głównego

1. **Usunięto zaobserwowane awarie, ale nie każdy wskaźnik zachowania się poprawił.** W całych 498 meczach na wersję: mecze z błędem twardym i guardem 3→0; alarmy skoku pozycji 2→0 (oba dawne alarmy dotyczyły A). Jednocześnie alarmy łańcucha resetów A wzrosły z 3 zdarzeń w 3 meczach do 13 w 12 meczach; po uwzględnieniu ekspozycji 0,02272→0,08978 na 100 posiadań. Zmiany celu ruchu A: 34,341→38,192, B: 27,501→34,695 na 1000 sekund-zawodnika. Są to sygnały diagnostyczne, nie automatyczny dowód nowego błędu; nie uzasadniają sformułowania „cały ruch i decyzje poprawione”. Wyniki 0/498 nie dowodzą, że ryzyko awarii wynosi zero.

2. **Naprawa jednostek instrukcji nie gwarantuje poprawy skuteczności podań.** Kontrast `safe_throws−neutral` completion A zmienił się z +1,7071 do −1,5636 pp, n=3; zmiana efektu −3,2706 pp, eksploracyjny CI [−7,3302; +0,6806]. Po poprawkach jedna replika była dodatnia, dwie ujemne (tabela poniżej). `take_risks−neutral`: +0,0586→−1,8237 pp, n=3; zmiana efektu −1,8823 pp, CI [−3,0637; −0,7150]. To obserwacja całych trajektorii meczowych, a nie izolowany test prawdopodobieństwa wybranego rzutu. Nie nazywać `safe_throws` dowiedzionym sposobem zwiększania completion ani stroić wag na tych trzech seedach.

3. **Reset-poach zaczął działać i w tej próbie miał koszt sportowy.** W izolacji dyrektywy włączenie reset-poachu względem neutralnego: udział czasu poachu obrońców A 0→+3,2845 pp, n=3. Konwersja przeciwnika B 0→+5,9000 pp, z replikami +8,7902, +0,9511 i +7,9585 pp. Dodatnia zmiana konwersji B jest niekorzystna dla obrony A; nie maskować jej jako poprawy. Wariant reset-poach z zakazem ma po poprawkach efekt poachu 0 pp względem neutralnego. Mechaniczna skuteczność dyrektywy i jej uniwersalna opłacalność to odrębne pytania.

4. **Zmiany wyników zależą od zestawienia; nie ma podstaw do ogłoszenia globalnego wyrównania taktyk.** Przy ciszy HEX przeciw all_person: konwersja A 38,6710%→47,8991%, delta +9,2281 pp, n=3, eksploracyjny CI delty [5,2222; 11,4881]. Równocześnie horizontal_stack przeciw person: 55,7628%→42,6247%, delta −13,1381 pp, n=3, CI [−18,7738; −6,6397]. To przykłady różnych zmian, a nie dowód ogólnych kontr lub rankingu taktyk. HEX/cup/calm 27,9559%→35,9757% ma jedynie n=2; HEX/wall/calm 21,1111%→31,0185% ma n=1 i jest szczególnie obciążony wykluczeniem wcześniejszych awarii. Nie deklarować na tej podstawie sprawdzonego balansu HEX przeciw strefom.

5. **Wiatr należy oceniać przez sparowane wiatr−cisza, a nie zmianę wersji w samej wietrznej komórce.** Dla horizontal_stack przeciw zone_wall przy wietrze osiowym 24 mph: efekt wiatru na konwersję A −3,9095 pp BEFORE→−10,4254 pp AFTER; zmiana efektu −6,5159 pp, n=3, eksploracyjny CI [−8,4786; −5,2873]. Analogicznie completion: −0,0494→−2,4117 pp, zmiana −2,3624 pp. W tym zestawieniu silnik po poprawkach pokazał większy koszt wiatru, bez dowodu, że dotyczy to każdej taktyki lub populacji rosterów. Dla HEX/cup/cross24 efekt konwersji +13,7998→+14,5203 pp ma n=2 i **brak CI**; dodatniego wyniku nie przedstawiać jako potwierdzonej przewagi w silnym wietrze.

## Rozrzut replik instrukcji i reset-poachu

Wartości są treatment−neutral w pp, obliczone osobno wewnątrz każdej wersji. Każdy kontrast wykorzystuje dwie pary home/away na wersję, ale pozostaje jedną repliką seedową.

| Kontrast i metryka | Seed | BEFORE | AFTER | Zmiana efektu |
| --- | --- | ---: | ---: | ---: |
| safe_throws, completion A | 301013916 | +0,0377 | +0,7183 | +0,6806 |
| safe_throws, completion A | 301113916 | +1,4396 | −1,7227 | −3,1622 |
| safe_throws, completion A | 301213916 | +3,6439 | −3,6863 | −7,3302 |
| take_risks, completion A | 301013916 | −1,4439 | −2,1589 | −0,7150 |
| take_risks, completion A | 301113916 | +0,6398 | −2,4240 | −3,0637 |
| take_risks, completion A | 301213916 | +0,9800 | −0,8881 | −1,8681 |
| reset-poach, konwersja B | 301015691 | 0 | +8,7902 | +8,7902 |
| reset-poach, konwersja B | 301115691 | 0 | +0,9511 | +0,9511 |
| reset-poach, konwersja B | 301215691 | 0 | +7,9585 | +7,9585 |

## Pokrycie pogody i ograniczenia odbioru raportu

`weatherEffects`: 10 zaplanowanych kontekstów, **29/30 kontrastów**, dziewięć kontekstów n=3 i HEX/cup/cross24 n=2. Brakuje sparowanego calm dla seeda `300301501`, ponieważ BEFORE `holdout-0-matrix-00027-configured-b` zawiera błędy twarde; windy blok nie jest sam w sobie brakujący. Każdy pełny kontrast pogodowy wymaga czterech meczów na wersję (wind home/away i calm home/away). Suma wykorzystanych ekspozycji wynosi 116 meczów na wersję; nie stanowi 116 niezależnych kontrastów. Weather cells zachowują te same seedy, rostery, rozpoczęcie posiadania i ustawienia poza pogodą.

Macierz 7×5 jest pełna dla ciszy, lecz pogoda obejmuje tylko 10 wybranych zestawień, a nie pełną macierz taktyk × kierunków × prędkości. Role mają zagregowane pomiary ruchu, nie pełny pomiar udziału jednostkowych zawodników w kontakcie z dyskiem lub jakości ich decyzji. Końcowa walidacja dotyczy jednej syntetycznej rodziny rosterów; nie dowodzi zachowania przy skrajnych umiejętnościach ani każdej wartości compliance. Duża liczba możliwych porównań zwiększa ryzyko wyboru efektownych wyników przypadkowych; pełne tabele i jawne wyniki niekorzystne powinny pozostać dostępne.

**Ocena przeglądu:** liczby i brakujące pokrycie w canonical comparison są spójne. Raport jest gotowy do wykorzystania jako opis tej próby i walidacja konkretnych mechanicznych poprawek, z powyższymi ograniczeniami. Brak statystycznego uzasadnienia dodatkowego strojenia balansu na podstawie samych komórek n=3.

## Kontrola końcowej redakcji raportu głównego

Przeczytano uzupełniony `docs/tactics-balance-2026-10-03-results.md` i ponownie porównano jego końcowe liczby z canonical comparison. **Nie znaleziono błędu liczbowego ani nadmiernego wniosku wymagającego poprawki w sprawdzanym zakresie.**

- Liczności 498+498, 246 wspólnych par, 83 komórek (81×n3, jedna n2, jedna n1), 29/30 kontrastów pogodowych, 145 wartości seeda i 3 pary rosterów są podane poprawnie. Raport rozdziela błędy od poprawnych pełnych meczów oraz niezawodność od warunkowego porównania sportowego.
- Sekcja `safe_throws` podaje ujemną średnią completion po poprawkach, mieszane znaki trzech replik i brak potwierdzonej przewagi instrukcji. Dodatkowo sprawdzono zamieszczoną tam konwersję A: +7,5126→−7,0119 pp względem neutralnego; zaokrąglenie +7,51→−7,01 jest poprawne.
- Koszt reset-poachu jest jednoznacznie nazwany kosztem obrony A: +5,90 pp konwersji B, z poprawnymi wartościami trzech seedów. Wzrost alarmów resetów i zmian celów jest jawny i nie został pomylony z dowiedzioną nową awarią.
- Tabela wiatru odczytuje właściwy kontrast wiatr−cisza, poprawne prędkości i kierunki oraz n=2 dla HEX/cup. Ograniczenia opisują niepełną macierz pogody, eksploracyjny charakter CI, ponowne użycie rosterów, wielokrotne porównania i brak podstaw do globalnego rankingu.

Przegląd nie wymaga dodatkowego testowania ani zmiany silnika. Obejmuje uczciwość wniosków i końcowe liczby statystyczne; nie stanowi ponownej walidacji wszystkich opisanych w raporcie mechanizmów produkcyjnych.
