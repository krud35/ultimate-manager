# Niezależny przegląd integracji HEX i priorytetu progresu

Stan: aktualne współdzielone źródła po poprawce HEX oraz `requireForwardPass`. Przegląd tylko do odczytu; nie zmieniano źródeł ani testów, nie uruchamiano pełnych meczów i nie ingerowano w działający pomiar before.

**Nie znaleziono nowego błędu blokującego zamrożenie kandydata.** Poniższe krótkie regresje sprawdzają mechanikę integracji, nie dowodzą poprawy wyniku sportowego ani usunięcia wszystkich pętli resetów. To wymaga osobnego pełnego holdoutu i reprodukcji koordynatora.

## Sprawdzone ścieżki

1. `point.js` przekazuje geometryczną stronę przez `geo(possession)` do pętli akcji. `actionSimulator` wyznacza formację z rzeczywistych taktyk, tworzy layout, a `layoutToAgents` rozdziela bieżący `stackIndex` od stałej specjalizacji gracza w składzie. Po zmianie rzucającego pozycja/prędkość i rozpoczęta trasa pochodzą z poprzedniego stanu, natomiast indeks pierścienia pochodzi z nowego layoutu. Nie nadpisuje to roli handlera ani nie dodaje miejsc dla aktywnych cutterów.
2. `layoutOffenseHex` i `formationStructuralTarget` korzystają z tego samego `hexSlotTarget` z tym samym środkiem i kierunkiem ataku. Obsługa HEX następuje przed ogólną gałęzią dump/reset. Zachowuje to przednie wierzchołki handlerów również po chwycie cuttera.
3. `tickCutterBrain`: gdy reorganizacja wybiera rolę resetu w HEX, celem jest wspólny cel strukturalny, z nadal działającymi indywidualnymi przesunięciami slotu. Inne formacje zachowują poszukiwanie komórki resetowej. Czyszczenie pasa podania, kontynuowanie rozpoczętej trasy, pull flow oraz ruch wynikający z instrukcji nadal mają własne dotychczasowe reguły; poprawka nie wymusza natychmiastowego ustawienia wszystkich graczy na idealnym pierścieniu.
4. `point.js` ustawia `requireForwardPass` po trzech podaniach bez progresu. `actionSimulator` przekazuje oddzielnie presję decyzyjną i faktyczny stall. Skaner zachowuje zbiór widzianych graczy, limit rozważanych opcji i dotychczasowe wagi. Wybrana do priorytetu opcja musi przejść zwykłą akceptację, rzeczywistą walidację toru oraz mieć osiągalny chwyt i progres co najmniej 2,5 m.
5. Zaakceptowany reset pozostaje fallbackiem po wyczerpaniu odrzuconych lub nieosiągalnych prób progresu. Pusty zbiór nie tworzy sztucznej decyzji. Od rzeczywistego stallu 8 priorytet progresu jest wyłączony, więc działa zwykły wybór. Wirtualna presja nie odblokowuje wcześniej filtrów echo/no-progress ani nie przyznaje przedwczesnego stall-outu.

## Przeprowadzone weryfikacje

- `test-hex-structural-continuity.mjs`: PASS — 14 layoutów, 84 wierzchołki, 24 krótkie oferty handlerów, 4 oferty po chwycie w rzeczywistej pętli akcji, 6 kontroli resetów innych formacji.
- `test-tactics-forward-priority.mjs`: PASS — obie ręce i kierunki, bez zmiany scoringu w kontrolowanej scenie, osiągalny progres, kryty/nieosiągalny/niewidoczny odbiorca, zachowanie limitu percepcji, reset awaryjny, brak opcji i faktyczny późny stall.
- `test-reset-decision-pressure.mjs`: PASS — presja dociera do skanera i wypuszczenia, faktyczny zegar nie zostaje zastąpiony presją, brak legalnego markera nie tworzy liczenia, filtry anty-pętli zwalnia dopiero realny późny stall.
- `test-cutter-offer-continuity.mjs` i `test-cutter-boundary-continuity.mjs`: PASS — zachowane rozpoczęte trasy, pojemność cutów i ciągłość powrotu przez wszystkie krawędzie, w tym trzy pierwotne alarmy.
- Niezależna macierz geometrii: 7 aktualnych rzucających × 2 kierunki × 5 pozycji X (`0.5,18,50,82,99.5`) × 3 Y (`0.5,18.5,36.5`) × 6 wierzchołków = **1260 porównań**. Cel strukturalny dokładnie zgadza się z layoutem, wszystkie cele są skończone i wewnątrz granic nawigacji.
- Niezależne rozszerzenie sceny skanera na 7 formacji × 2 kierunki × 2 ręce: **112 scen**. Przy realnym stallu 8 i 9 włączenie requireForwardPass nie zmienia zwykłego wyboru ani ocen. Bez resetu nieosiągalny progres daje brak decyzji, a zaakceptowany osiągalny progres zostaje wybrany.
- **432 wartości non-HEX identyczne** z `non-hex-structural-before.json`. Parametry oryginalnego generatora: `disc=throwerPos={x:50,y:row.y}`, `forceSide='force_forehand'`, `handlerSlotIndex=row.stackIndex%3`, `rng.float()=0.5`, reszta parametrów z rekordu. Pierwsza próba bez jawnego handlerSlotIndex nie odtworzyła danych; po potwierdzeniu pełnej konfiguracji generatora zgodność jest dokładna. To brak parametru w metadanych starej sondy, nie błąd źródeł.

## Ograniczenia, których nie należy ukrywać

- Dotychczasowe przycinanie pierścienia przy końcach i narożnikach może zbiegać jego wierzchołki. W macierzy powyżej 56 z 210 layoutów miało mniej niż 6 różnych miejsc po zaokrągleniu do 1 µm. Obie ścieżki są zgodne, a poprawka nie stworzyła tego zachowania: zachowuje istniejący promień, kąty i clamp layoutu. Twierdzenie o sześciu odrębnych miejscach i trzech przednich slotach dotyczy swobodnej przestrzeni wewnątrz boiska, nie każdej pozycji przy linii. Nie uzasadnia to dodatkowego strojenia bez danych meczowych.
- `isDump` nadal oznacza specjalizację/ofertę handlera, a nie wyłącznie podanie wstecz. Przedni handler HEX może być osiągalnym progresem. Awaryjny reset nadal podlega dotychczasowej akceptacji i walidacji późnego stallu; nowa reguła nie jest globalnym zakazem wszystkich ryzykownych resetów przy presji decyzyjnej.
- Zmiana wyboru może wymagać walidacji większej liczby już dostrzeżonych opcji i zużyć inne losowania niż stary selektor. Test równości ocen kontrolowanej sceny nie oznacza identycznego całego strumienia RNG po zmianie decyzji. Wnioski o efekcie wymagają sparowanego holdoutu na tym samym seedzie/rosterze, z jawną liczbą ważnych par.
