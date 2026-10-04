# Metoda porównania walidacji przed / po

Narzędzie: `scripts/compare-tactics-balance-validation.mjs`.
Test: `scripts/test-compare-tactics-balance-validation.mjs`.
W istniejącym `scripts/tactics-balance-report.mjs` dopisano wyłącznie eksport czystych helperów; bez zmian wzorów ani skutków ubocznych importu. Nie zmieniono produkcji, snapshotów, kolejki, rosterów ani aktywnych workerów.

## Uruchomienie

```text
node scripts/compare-tactics-balance-validation.mjs artifacts/engine-audit/tactics-balance-2026-10-03-validation
```

Domyślnie zapisuje `comparison/comparison.json` i `comparison/COMPARISON.md` pod katalogiem walidacji. Opcjonalny drugi argument wskazuje inny katalog raportu. Narzędzie odmawia zapisu wewnątrz katalogów wersji `before` lub `after`. Raport można wygenerować przed końcem pomiaru: brakujące pliki pozostają brakujące, metryki bez ekspozycji mają `null`.

## Parowanie i estimand

- Źródłem tożsamości zadań jest wspólna `queue.json`. Kontrola obejmuje hash kolejki i rosterów w obu wersjach, manifest, dokładną treść zadania, seed, obie strony, status pełnego zakończonego meczu, brak hard errors i zgodny kontekst instrumentacji. Duplikaty, nieczytelne pliki i nieznany status błędów nie przechodzą do próby sportowej.
- Blok musi zawierać dokładnie dwa zaplanowane mecze (swap false/true), oba poprawne w obu wersjach. Utrata jednej połowy wyklucza cały blok z wyników sportowych. Wskaźniki jakości nadal ujawniają niepoprawne zapisane mecze.
- A/B oznacza tożsamość rosteru, a nie gospodarzy/gości. Metryki obu drużyn są liczone oddzielnie. Atak A można zestawić z obroną B; marża obejmuje również odwrotne fazy posiadania. Instrukcje defensywne A ocenia się także przez atak B.
- Metryka bloku jest równoważną średnią dwóch meczów, zgodną z dotychczasowym raportem; nie jest ilorazem połączonych liczników. Średnie przed, po i różnica używają identycznej próby bloków z dostępną metryką w obu połowach obu wersji.
- `cells` rozdziela kontekst ataku, obrony, pogody, konfiguracji, poziomu oraz modułu (matrix, force, instruction, interaction, career, roles). Obie strony mają pełen zestaw dotychczasowych metryk sportu, ruchu i decyzji oraz metryki ruchu według roli. `treatmentEffects` liczy dodatkowo treatment minus neutral w każdej wersji i zmianę tej różnicy.
- CI: identyczny z istniejącym raportem deterministyczny bootstrap 2000 razy, całymi klastrami seedów. Tylko wewnątrz jednego kontekstu; mniej niż 3 seedy daje `null`. Trzy seedy oznaczają analizę eksploracyjną. Zbiorcze `overall` i `byCohort` celowo nie mają CI: konteksty ponownie używają rosterów/seedów i nie są niezależnymi populacjami graczy. Raport jawnie pokazuje liczby różnych seedów, par rosterów i pierwszego posiadania.

## Jakość i ograniczenia obserwacji

- `qualityAllRecorded` obejmuje unikalne zaplanowane wyniki, również częściowe lub niepoprawne. `qualityCommonPairs` obejmuje wyłącznie wspólne poprawne pary. `qualityByCohort` ułatwia lokalizację problemów. `qualityChanges` podaje jawne różnice liczników, procentu meczów z alarmem i częstości wraz z liczbą obserwowanych meczów/ekspozycją po obu stronach. Zmiany all-recorded przy niepełnym pokryciu są opisowe, bez interpretacji przyczynowej.
- Guardy i hard errors mają liczbę meczów ze znanym statusem oraz liczbę statusów nieznanych. Brak plików jest osobnym polem pokrycia; nie jest zerem błędów. Ogólny guard bez strony nie jest arbitralnie przypisywany obu drużynom. Niespójna tożsamość powoduje nieznane przypisanie alarmów do strony.
- Nowe terminalne `failure.code === 'POINT_SIMULATION_LIMIT'` jest dokładnie jednym zdarzeniem guard, nawet jeśli ten sam problem powtórzono w hardErrors. Zachowany mały obiekt failure ujawnia punkt, limit, liczniki akcji/rzutów, tryb i pozycję dysku. Starszy sztuczny punkt oraz wtórny possession mismatch nie są dwoma guardami. Pełny mecz oznaczony failed pozostaje poza próbą sportową.
- Alarmy ruchu A i B: nonfinite, displacement i zmiany celu, z częstością na 1000 obserwowanych sekund-zawodnika. Reset-chain: na 100 posiadań. Ekspozycje są mianownikami, nie nowymi niezależnymi próbami. Alarm pozostaje sygnałem diagnostycznym, nie automatycznie potwierdzonym błędem.
- Dla ról dostępne są agregaty ruchu; brak podstaw do wnioskowania o dotknięciach dysku lub optymalności indywidualnych decyzji. Pogoda jest kontrolowana przez kolejkę, bez wymyślania brakujących etykiet upwind/downwind z niepewnego `windRelations`.
- Odczyt surowych JSON jest sekwencyjny. Zatrzymywane są tylko agregaty; checkpointy, replaye, klatki i drzewa percepcji nie trafiają do raportu. Pamięć rośnie z małymi agregatami liczby meczów, nie z sumą drzew checkpointów.

## Weryfikacja

PASS, test syntetyczny: 6 par (12 meczów na wersję), nierówne mianowniki w dwóch połowach, prawidłowe A/B po zamianie stron, delta metryki i treatment-minus-neutral, CI dla 3 seedów i brak CI poniżej 3, brak pomiaru w jednej wersji wyklucza daną metrykę z obu średnich, alarmy obu stron, guard poza próbą sportową, niezgodny seed/identity/roster, brak wyniku, jedna połowa, duplikat, nieczytelny JSON, nieznane hard errors, całkowicie nieistniejąca wersja after i blokada zapisu do wersji.

PASS, parity: niezależna kopia 6 rzeczywistych pełnych meczów (3 pary), wszystkie główne metryki przed/po dokładnie równe staremu raportowi, wszystkie delty zero lub `null`. Końcowy przebieg z terminalnym guardem, deduplikacją i starszym guardem z wtórnym mismatch: `artifacts/tactics-balance-2026-10-03/comparison-qa/run-pDnt3x/QA.json`; peak RSS procesu 85.49 MiB. Kopie i wcześniejsze QA zachowano.

PASS, lint trzech skryptów. `git diff --check` bez błędów whitespace (istnieją ostrzeżenia LF/CRLF).

Próbny odczyt aktualnej walidacji: 98 zapisanych wyników before, 400 brakujących before, 498 brakujących after, 0 wspólnych par; brak wyników sportowych i brak pozornych zer dla after. Peak RSS 60.70 MiB, około 2.14 s. Raport kontrolny: `artifacts/tactics-balance-2026-10-03/comparison-current-check/`. To sprawdzenie narzędzia, nie końcowy wynik walidacji; pełne przed/po trzeba wygenerować ponownie po zakończeniu obu wersji.

## Korekta zgodności instrumentacji przed finalnym pomiarem

Potwierdzono błąd pierwotnej porównywarki: odrzucała każdą różnicę `instrumentationHash`, w tym świadome rozszerzenie observera AFTER o dowód terminalnego zakończenia punktu. Naprawiono wyłącznie narzędzie porównawcze i jego test; konfigurator, źródła produkcyjne, instrumentacja i zamrożone wersje pozostały niezmienione.

Kontrola nadal jest ścisła:

1. Odczytuje rzeczywiste bajty `before/instrumentation.mjs` i `after/instrumentation.mjs`, oblicza SHA-256 i sprawdza każdą deklarację z właściwego `version.json`. Brak źródła/hashu lub zmiana bez aktualizacji deklaracji blokuje porównanie, z jawną przyczyną.
2. Identyczne źródła mają status `BYTE_IDENTICAL`.
3. Dla różnych hashy akceptuje tylko dokładny wynik trzech pojedynczych zamian w źródle BEFORE: parametr `failure = null` w `end`, `!!failure ||` przed dotychczasowym wyrażeniem guard oraz pole `failure` w summary. Każdy anchor musi wystąpić dokładnie raz. Cała pozostała treść musi być identyczna bajtowo, łącznie z odstępami i końcami linii. Nie normalizuje ani nie usuwa fragmentów źródła. Status: `COMPATIBLE_TERMINAL_FAILURE_EXTENSION`.
4. Dowolna dodatkowa różnica nadal daje `instrumentation-hash-mismatch`. Pola `instrumentation.evidence` zachowują ścieżki, zadeklarowane i rzeczywiste hashe, a raport wyjaśnia podstawę zgodności.

Niezależny dowód na rzeczywistych plikach frozen BEFORE i final AFTER: ich hashe zgodne z oryginalnymi deklaracjami to odpowiednio `52981dfded460afad1e869ebd2fe68661a4d9aeb53dd80ec1cb4358296f4e8c3` oraz `22fd3a393854d3ac962aeefe33ac757023e3ca50a57a51322a057c7acfaf98a3`. Porównywarka potwierdziła dokładne dozwolone rozszerzenie. Na niezależnej kopii tych observerów oraz tych samych 6 rzeczywistych pełnych meczów dopuściła wszystkie 3 pary i zachowała dokładnie wszystkie metryki oraz delty. Jest to dowód zgodności narzędzia, nie efekt sportowy nowego silnika.

PASS regresje negatywne: poprawnie przeliczony hash przy zmianie licznika `completions`, zmiana źródła przy starym hashu, niemal identyczne lecz inne `failure = false`, dodatkowy komentarz. Każdy przypadek blokuje wspólne wyniki sportowe. Dotychczasowe testy parowania, braków, błędów, terminalnych guardów i parity również PASS; ESLint obu zmienionych skryptów PASS.

Końcowy zapis QA tej korekty: `comparison-qa/run-q2I3Wb/QA.json`, peak RSS 117.29 MiB. Ponowny odczyt aktualnej walidacji: before 6 brakujących wyników, after 498 brakujących, 0 wspólnych par, bez blokady zgodnego rozszerzenia instrumentacji; peak RSS 115.83 MiB. Późniejszy przegląd ujawnił niezależną blokadę hasha kolejki, opisaną poniżej; ten wcześniejszy przebieg nie potwierdzał jeszcze pełnej poprawności walidacji manifestu. Raport kontrolny zapisano w `comparison-current-check/`.

## Korekta schematu hasha kolejki

Potwierdzono drugi błąd narzędzia: porównywało manifest.queueHash z hashem surowych bajtów pretty-printed `queue.json`. Producent i runner (`validate-tactics-balance.mjs`) liczą `SHA-256(JSON.stringify(parsedQueue))`. Dotychczasowe syntetyczne fixture'y zapisywały zwarty JSON, więc oba hashe przypadkowo były równe i nie wykrywały tego błędu.

Porównywarka zachowuje teraz dwa jawne hashe: `rootHashes.queue` dla dokładnej identyczności plików root/before/after oraz `rootHashes.queueCompactJson` do kontroli deklaracji manifestu. Compact JSON jest liczony na pełnym sparsowanym wejściu, z zachowaniem kolejności kluczy, dokładnie jak producent — bez sortowania kluczy ani alternatywnego formatu. Schemat rosterHash pozostaje surowym hashem pliku. Nie zmieniono zamrożonych kolejek, manifestów, instrumentacji ani wyników.

Rzeczywiste wartości:

- queue raw: `9a9405c0d32fe5f7444135da7bc84590014d6b1551ead6965479b0d0af032700`;
- queue compact JSON i manifest.queueHash: `56e937187329c320e5f10fa6c52734b08b143986261981bb0f386995b9c79da2`;
- roster raw: `60d9a3a1cbb80d21a96ac19bd0fb048b931d32492c3d3f680b6fde6c398ca883`.

Testy zapisują teraz kolejkę pretty-printed i manifest zgodnie z producentem. Dodatkowo:

- PASS: niezależna kopia rzeczywistych plików wejścia/manifestu/observerów, **498 wyników BEFORE** i **pusty AFTER**. `globalIssues=[]`, brak problemów wersji, BEFORE nie ma braków, AFTER ma 498 braków, wspólna próba sportowa wynosi zero. Kopiowano tylko małe agregaty, czytając surowe mecze pojedynczo i odrzucając drzewa checkpointów.
- PASS: semantyczna zmiana seeda we wszystkich trzech identycznych kopiach kolejki nadal daje `canonical-queue-hash-mismatch` i zero dopuszczonych par. Samo zgodne hashowanie plików wersji nie omija manifestu.
- PASS: przeformatowanie wyłącznie kolejki AFTER nadal daje `version-queue-hash-mismatch`, mimo niezmienionej treści JSON i poprawnego manifestu root.
- PASS: wszystkie wcześniejsze regresje parowania, ekspozycji, guardów, ścisłej zgodności instrumentacji i parity; ESLint obu skryptów.

Dowody: `comparison-qa/run-PSSXLM/QA.json` i `comparison-qa/run-PSSXLM/real-inputs-before-complete/proof.json`, peak RSS całego procesu QA 152.46 MiB.

Odczyt bieżącej walidacji po korekcie zapisano osobno w `comparison-queue-hash-check/`, zachowując stary `holdout-before-complete/`: `globalIssues=[]`, observer zgodny przez dokładne rozszerzenie terminal-failure, BEFORE 498 zapisanych/495 poprawnych, AFTER 19 zapisanych/19 poprawnych, **9 wspólnych pełnych par / 18 meczów na wersję**. Brakujące 479 wyników AFTER pozostają jawne. Peak RSS porównywarki 115.79 MiB. To chwilowy stan pokrycia podczas pracy AFTER, nie końcowa ocena balansu.

## Sparowany efekt wiatru względem ciszy

Dodano `weatherEffects` bez zmian silnika, kolejek, snapshotów ani aktywnych pomiarów. Zakres to kontrolowane sentinele pogodowe macierzy: 10 kontekstów wiatru × 3 powtórzenia. Pozostałe kohorty nie są automatycznie przedstawiane jako eksperyment pogodowy, bo zmieniają inne czynniki lub nie mają odpowiedniego spokojnego wariantu.

Dla każdego seeda najpierw liczone są średnie jego pełnych par home/away, osobno w obu wersjach. Następnie `before = wind_before − calm_before`, `after = wind_after − calm_after`, `delta = after − before`. Nie odejmuje się średnich komórek z różnych zbiorów seedów. Każda metryka A/B używa tych samych dostępnych kontrastów w obu wersjach; brak ekspozycji w dowolnej niezbędnej połowie pozostawia metrykę niedostępną. Różnice wskaźników procentowych są w punktach procentowych.

Parowanie wymaga dokładnej zgodności wszystkich ustawień zadania, w tym ataku/obrony, pełnych homeConfig/awayConfig, seeda, rosterów, pierwszego posiadania i polityk pomiaru. Pomijane są wyłącznie id/block/contrast/swap/originalGroup, etykieta context oraz sam weather/wind. Cisza musi być oznaczona `calm` i mieć prędkość wiatru zero. Ponadto kontekst instrumentacji wyników wind/calm musi się zgadzać. Oba bloki muszą przejść istniejącą kontrolę pełnych, poprawnych par w OBU wersjach. Pojedynczy kontrast oznacza 4 mecze na wersję (dwa wind i dwa calm), łącznie 8 zapisanych meczów.

Schema dla renderera:

- `weatherEffects`: `scope='matrix'`, `plannedComparisons`, `matchedComparisons`, `cells`, `unmatched`.
- Każda cell zachowuje pełny kontekst wiatru, `baselineWeather='calm'`, zweryfikowany `baselineWind` lub `null`, liczby planned/matched/unmatchedComparisons oraz standardowe `a/b.metrics.<metryka>.before/after/delta`, `pairedBlocks`, `distinctSeeds` i evidence parowania.
- `matchedPairs` w tej sekcji oznacza liczbę kontrastów seedowych; `homeAwayPairsPerVersion=2*n`, `gamesPerVersion=4*n`. Nie są to nowe niezależne obserwacje.
- Także brakujące komórki są zapisane z n=0 i null metrykami. `unmatched` ujawnia windBlock, calmBlock gdy znany, seed, kontekst, przyczynę i szczegółowe powody braku lub nieważności obu bloków. Nieznany counterpart nie jest zerowym efektem.
- CI pozostaje eksploracyjnym bootstrapem całych seedów wewnątrz jednego kontekstu, `null` przy n<3. Kilka wiatrów może użyć tej samej spokojnej pary, więc nie należy traktować różnych kontrastów ani graczy jako niezależnych populacji.

PASS syntetyczna kontrola anulowania wspólnych różnic seeda i wersji: n=3, A completion wind−calm **−8 → −4 pp, delta +4 pp**, B delta −2 pp. Usunięcie jednej połowy calm AFTER pozostawia n=2 w obu ocenach: **−6 → −3 pp, delta +3 pp**, CI null. Gdyby narzędzie odejmowało niesparowane średnie, test nie uzyskałby tych wartości. Osobno PASS odrzucenie różnego seeda, instrukcji taktycznej, pierwszego posiadania i rosteru, przy zachowaniu indywidualnej ważności wszystkich bloków sportowych. Wszystkie wcześniejsze testy i ESLint obu skryptów również PASS.

Końcowy zestaw QA: `comparison-qa/run-KvG9ZF/QA.json`, peak RSS 159.02 MiB. Mały gotowy raport dla niezależnego renderera: `comparison-qa/run-KvG9ZF/weather-clean/comparison/comparison.json`. Kontrola rzeczywistych wejść BEFORE498/AFTERempty daje 10 komórek, 30 zaplanowanych kontrastów, 0 dopasowanych i 30 jawnych braków.

Kontrolny odczyt bieżących danych zapisano w `comparison-weather-check/`: BEFORE498, AFTER143, globalIssues=[], 10 komórek/30 zaplanowanych kontrastów; jeden kontrast gotowy, 29 oczekuje na kompletne poprawne bloki, wszystkie CI null. Wszystkie 30 planowanych wariantów mają dokładny spokojny counterpart; żaden brak nie wynika z niezgodnych ustawień kolejki. Peak RSS 197.43 MiB. To weryfikacja narzędzia podczas pomiaru, nie wniosek o sile taktyk względem wiatru.
