# Terminalne przerwanie meczu po limicie akcji

## Potwierdzony problem

Pełna próba bazowa zawierała sześć meczów z odtworzonym dojściem do limitu. Dotychczasowy fallback w `point.js` przyznawał wtedy punkt na podstawie pozycji dysku, również drużynie bez posiadania. Taki punkt nie był skutkiem prawidłowego chwytu w polu punktowym. Analogiczny fallback istniał w fastMode.

## Wdrożenie

- Obie ścieżki rzucają `PointSimulationLimitError`, bez dopisywania SCORE ani POINT_END. Produkcyjny limit 120 akcji pozostaje bez zmian.
- Błąd zawiera `code=POINT_SIMULATION_LIMIT`, `failure` z numerem punktu, liczbą rzutów/akcji, limitem, trybem, posiadaniem, pozycją dysku i przyczyną; `partialEvents` zawiera zdarzenia niedokończonego punktu.
- `playNextPoint` zachowuje zdarzenia jako diagnostykę i przełącza sesję na `failed`. Nie dodaje punktu, nie zmienia numeru punktu, nie losuje kontuzji po nieukończonym punkcie. Dalsze wznowienie, zmiana taktyki i `runRemainingMatch` odrzucają tę sesję przed mutacją lub pobraniem RNG.
- `sessionToResult` oznacza taki wynik `diagnosticsOnly`; `leagueRecordFromEngineResult` odrzuca go zamiast tworzyć rekord zwycięstwa.
- Snapshot wejściowych graczy i współdzielonych facilities jest przechowywany w WeakMap od początku meczu. Przy terminalnej awarii najpierw odłączane są drużyny diagnostyczne, następnie przywracane oryginalne obiekty i ich zagnieżdżone referencje. Cofnięcie obejmuje również efekty wcześniejszych punktów niedokończonego meczu. Usuwane są nowe pola i przywracane pola usunięte przez normalizację. Snapshot znika po sukcesie lub awarii.
- Normalne mutacje udanego meczu pozostają bez zmian. Istniejący `applyStaminaToTeamPlayers` płytko kopiuje obiekty graczy: stats i istniejący workload pozostają współdzielone, a końcowe wartości skalarne trafiają do graczy w sesji/wyniku. Nie rozszerzano tego kontraktu.
- MatchView zatrzymuje automatyczną symulację i pokazuje komunikat przerwania z przyciskiem rozpoczęcia całego meczu od nowa. Nie oferuje kontynuowania nieudanej sesji. Reset usuwa także stan automatycznego odtwarzania widza.
- Rejestr modyfikatorów taktycznych jest czyszczony przy wyczerpaniu limitu.

## Walidacja

`node scripts/test-tactics-action-limit.mjs` — PASS, około 6 sekund. Obejmuje full i fast, prawdziwą pojedynczą akcję przy testowym limicie 1, brak fikcyjnego gola/zwycięstwa, niezmienność diagnostyki i RNG po próbie wznowienia, czyszczenie rejestru, odrzucenie wyniku przez ligę, rollback graczy i facilities po wcześniejszym prawidłowym punkcie oraz zachowanie referencji. Zakończenie ograniczone do jednego punktu sprawdza zachowane PP/workload i końcowe stamina, morale, formę, lojalność oraz zmęczenie. Nadpisania limitu i punktów do zwycięstwa są lokalne dla testu i przywracane w `finally`; nie rozgrywano pełnych meczów regulaminowych w tym teście.

Lint nowych plików, point.js, matchSession.js i leagueEngine.js — PASS. MatchView ma te same dwa błędy nieużywanych zmiennych i cztery ostrzeżenia zależności hooków co HEAD, co sprawdzono oddzielnie na źródle z HEAD; ta poprawka nie dodała komunikatów.

`npm run build -- --configLoader native` — PASS, 424 moduły, 8,62 s. Zwykłe wywołanie build zatrzymało się na odmowie odczytu katalogu nadrzędnego przez bundler konfiguracji w sandboxie; natywny loader rozwiązał problem bez zmiany źródła. Pozostało ostrzeżenie o dużym pliku wynikowym. Named exports — PASS, 370 plików.

Niezależny read-only przegląd agenta `guard_case_2` sprawdził brak kontynuacji failed, brak zapisu do ligi, rollback oraz kontrakt sukcesu. Nie wykonywano ręcznej interakcji w przeglądarce; walidacja UI obejmuje przegląd kodu i kompilację. Wyniki odtworzeń pełnych meczów kandydata będą zapisane osobno przez koordynatora.

## Wcześniejszy przegląd catch/poach

Nie znaleziono regresji w bezpośrednim przeliczeniu fizycznego punktu chwytu na discPosition: uwzględnia zmianę stron i finalFrame przy collectFrames=false, a fastMode zachowuje swój model abstrakcyjny. Flaga resetPoachDone jest zachowana przy kolejnych podaniach i zerowana przez migawkę roli ofensywnej po zmianie posiadania. Czas aktywnego poacha nie jest przenoszony między rzutami; podanie kończy bieżący wypad, a flaga zapobiega jego ponownemu uruchomieniu w tym samym posiadaniu, zgodnie z testem regresyjnym.
