# Ocena pierwszego kandydata po 06:00

Kandydat `artifacts/engine-audit/tactics-balance-2026-10-03-validation/candidate-v1` jest zamrożony i pozostaje niezmieniony. To etap diagnostyczny, nie końcowa wersja „after”.

11 pełnych prób na oryginalnych seedach: siedem meczów ukończonych prawidłowo, cztery przerwane jawnym limitem, zero alarmów ruchu w obu drużynach. Wszystkie pięć meczów, które miały alarmy ruchu w baseline, zakończyło się bez takich alarmów. Jedynie trzy pierwotne alarmy były wcześniej odtworzone klatka w klatkę i przypisane do aktywacji cuttera; pozostałych dwóch nie należy przedstawiać jako identycznie zdiagnozowanego błędu.

Z sześciu wcześniejszych błędnych meczów ukończyły się dwa: `matrix-00062-configured-a` (10:15) i `matrix-00254-configured-b` (15:4). Pozostałe `00028-a`, `00063-a`, `00063-b`, `00254-a` nadal osiągnęły 120 rzutów. Tym razem wynik nie dostał fikcyjnego punktu: zapisano terminalną awarię z częściową diagnostyką. Nie traktować nieukończonych wyników 0:5, 1:12, 13:1 i 0:9 jako wyników meczu.

**Kandydat nie został przyjęty jako końcowy.** Naprawy force, poachu, okien ryzyka, ciągłości chwytu/ruchu, presji resetów i obsługi awarii przechodzą regresję mechaniczną, ale nie usunęły wszystkich problemów progresji HEX przeciw wall.

Nowe konkretne ustalenia do dalszego sprawdzenia:

- `requireForwardPass` zachowuje reset jako bezwarunkowo preferowaną opcję nawet przy zaakceptowanym, fizycznie osiągalnym podaniu do przodu. W `00063-a`, punkt 14, wystąpiło 120 celnych podań, 67 resetów, 88 natychmiastowych odbić A→B→A, netto −19,19 m. W 34 zapisanych skanach z presją wybrano cofnięcie mimo innej osiągalnej oferty do przodu powyżej progu. Naprawa ma honorować priorytet progresji przy zachowanym bezpiecznym resecie jako opcji zapasowej; nie zwiększać wag ani zakresu percepcji.
- Początkowy layout HEX ma sześć wierzchołków wokół dysku, lecz ogólna reguła resetu w celach strukturalnych nadpisuje przednie wierzchołki handlerami za dyskiem. W sondzie wszystkich siedmiu rzucających daje to dwa cele do przodu przy rzucającym-handlerze i tylko jeden przy rzucającym-cutterze zamiast trzech w pierwotnym układzie. Ten ostatni cel przypada nieaktywnemu fillerowi. To hipoteza przyczynowa poparta konkretną niezgodnością layoutu i późniejszego ruchu; naprawa ma zachować deklarowany sześciokąt, istniejące role i kąty, a następnie przejść ponowne pełne mecze.

Walidacja na nowych seedach „before” została łagodnie wstrzymana po 98/498 meczach na czas tych odtworzeń. Po potwierdzeniu zakończenia procesów wznowiono tę samą kolejkę i snapshot, bez zmiany danych. Nie uruchomiono jeszcze końcowej serii „after”.
