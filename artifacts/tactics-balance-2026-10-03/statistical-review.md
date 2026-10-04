# Przegląd statystyczny raportu końcowego — 2026-10-03

Zakres: read-only przegląd `compare-tactics-balance-validation.mjs`, helperów `tactics-balance-report.mjs`, bazowego `analysis/core/summary.json` oraz kanonicznej kolejki walidacji. Bez zmian silnika, snapshotów i pełnych symulacji. Liczby walidacji poniżej opisują plan; końcowe pokrycie trzeba pobrać z ostatniego comparison po zakończeniu obu wersji.

## Werdykt

Końcowy comparator poprawnie oddziela sparowaną ocenę sportową od jakości wszystkich zapisanych prób i wyłącza CI dla zbiorczych tabel `overall`/`byCohort`. To właściwa podstawa raportu. Nie znalazłem błędu w sposobie obliczania treatment-minus-neutral dla aktualnej kanonicznej kolejki. Najważniejsze ograniczenie: trzy niezależne realizacje rosterów/seedów na komórkę pozwalają opisywać kierunek i skalę obserwacji, ale nie udowadniają wyrównania taktyk ani drobnych przewag.

## Faktyczne jednostki próby

- Baseline core: **960 zapisanych meczów**, **956 pełnych poprawnych**, **477 pełnych poprawnych par = 954 mecze w próbie parowanej**. Dwa pozostałe poprawne mecze utraciły partnerów. Cztery niepoprawne mecze nie są porażkami sportowymi.
- Macierz core: 43 z 45 komórek mają 3 pary/3 seedy. HEX–zone_wall, calm ma **n=1**; HEX–zone_cup, cross24 ma **n=2**. Wszystkie 75 raportowanych kontrastów ustawień core mają n=3. Cienkich komórek HEX nie używać do ogłaszania przewagi/przegranej taktyki.
- Holdout zaplanowano jako **498 meczów na wersję**, **249 par na wersję**, **83 konteksty × 3 repliki**. Jest 147 różnych wartości seeda, ale tylko **3 pary rosterów** powtarzane między kontekstami. Każda pojedyncza komórka ma w planie 3 różne seedy i 3 różne pary rosterów. Nie określać całości jako 147 lub 249 niezależnych populacji zawodników.
- Pierwsze posiadanie jest A/B/A między replikami (166 bloków A, 83 B). Zamiana home/away jest kontrolą stron, nie drugą niezależną repliką ani pełnym zbalansowaniem pierwszego posiadania. Przed/po zachowuje tę samą politykę, więc sparowana różnica nadal jest właściwa dla tej próby.

## Przedziały i grupowanie

**Nie cytować pooled CI z bazowego `core/summary.json`.** Stary `tactics-balance-report` liczy `overall.metrics.conversionPct` jako 51,8069% i pokazuje CI 50,9442–52,6662 z 223 różnymi seedami. Taka liczba miesza heterogeniczne konteksty i wielokrotnie użyte trzy pary rosterów. Przedział nie opisuje niezależnej populacji drużyn ani ogólnego balansu. To konkretne ograniczenie starego narzędzia analitycznego; final comparator już blokuje analogiczne CI. Raport końcowy powinien pominąć stare pooled CI, a zbiorczą średnią podpisać wyłącznie jako opis zadanej kolejki testowej.

W obrębie pojedynczej komórki bootstrap klastrów seedów jest zgodny z parowaniem. Przy n=3 jego oznaczenie „95%” łatwo jednak przecenić: istnieje tylko 27 uporządkowanych losowań trzech klastrów ze zwracaniem, a każdy skrajny przypadek wybrania tego samego seeda trzykrotnie ma prawdopodobieństwo 1/27, większe niż 2,5%. Percentylowy zakres bywa więc po prostu zakresem trzech obserwowanych efektów. 2000 powtórzeń bootstrapu nie tworzy nowych niezależnych danych. Przedział całkowicie dodatni przy trzech dodatnich różnicach nie stanowi mocnego dowodu statystycznego.

Rekomendacja dla tekstu głównego: średnia sparowana, **n**, trzy efekty per replika lub ich min–max, a bootstrap zostawić w JSON jako eksploracyjny. Nie używać sformułowań „istotnie”, „udowodniona przewaga”, „95% pewności” ani „brak różnicy”, gdy CI obejmuje zero. Mechanistyczna regresja może potwierdzić konkretny błąd niezależnie od małej próby wyników meczów.

Nie sumować niepewności across contexts tak, jakby wszystkie obserwacje były niezależne. Gdyby potrzebny był jeden globalny przedział, należałoby resamplować przynajmniej całe repliki rosterów wraz ze wszystkimi ich kontekstami i zachować sparowanie wersji; przy tylko trzech takich replikach również byłaby to bardzo słaba inferencja. Obecne pominięcie globalnego CI jest lepszym rozwiązaniem raportowym.

## Jak czytać przed/po i treatment-neutral

Dla każdej repliki i tożsamości drużyny:

1. Metryka pojedynczego bloku jest równoważną średnią dwóch meczów z zamianą stron, pod warunkiem pomiaru w obu.
2. Zwykła zmiana wersji to `after(setting) − before(setting)` na tym samym seedzie i rosterze. To efekt całego pakietu poprawek przy danym ustawieniu; nie izoluje pojedynczej naprawy.
3. Efekt ustawienia w jednej wersji to `treatment − neutral` w tym samym eksperymencie.
4. Zmiana efektu ustawienia to `(after treatment − after neutral) − (before treatment − before neutral)`. Tak oblicza ją `treatmentEffects`, z zachowaniem parowania przed uśrednieniem.

Aktualna kolejka ma 42 niematrycowe identyfikatory kontrastu, każdy dokładnie z jednym poziomem neutralnym. Skrypt sprawdza zgodność seeda, rosterów, wiatru i pierwszego posiadania. Brak pełnego neutralnego bloku pozostaje `unmatched`; nie uzupełniać go neutralem innego seeda lub średnią wszystkich neutralnych meczów.

Ważne rozróżnienia:

- Pokazywać kierunek treatment-neutral zarówno przed, jak i po, jeśli twierdzimy, że instrukcja zaczęła działać. Sama zmiana wyniku wariantu po patchu może pochodzić z geometrii force, HEX lub innych wspólnych poprawek.
- Defensywne ustawienie A oceniać również przez atak **B**. `context.defense` jest obroną przeciwnika B z perspektywy ataku A; nie zawsze opisuje badane ustawienie defensywne A.
- Wynik/marża całego meczu obejmuje obie fazy. Do oceny atak A × obrona B używać przede wszystkim konwersji A, a marżę traktować pomocniczo.
- Różnica wskaźników procentowych to **punkty procentowe**. Przykładowo 40%→45% oznacza +5 pp; względne +12,5% nie jest tą samą miarą.
- Średnia ilorazów w równoważnych parach nie jest ilorazem sum wszystkich rzutów lub posiadań. Nie mieszać tych dwóch estymandów w kolumnach jednej tabeli.
- Wyższy completion wraz ze wzrostem resetów/utratą progresji nie jest automatyczną poprawą ataku. Podawać też konwersję, dystans/progresję lub symptomy łańcuchów resetu tam, gdzie są dostępne.

## Awarie, selekcja i pokrycie

Sport jest warunkowy na pełnym poprawnym zakończeniu obu meczów **w obu wersjach**. Jeżeli stary silnik osiągnął guard, a nowy zakończył mecz, poprawa niezawodności jest cenna, ale stary uszkodzony wynik nie jest poprawną referencją sportową. Taka para słusznie nie trafia do średniej wyników. Jawnie raportować liczbę wykluczonych bloków i przyczyny; wykluczenia zależne od taktyki nie są losowymi brakami.

`qualityCommonPairs` z definicji wyklucza hard errors, więc nie służy do dowodzenia spadku ich liczby. Do guardów używać `qualityAllRecorded` i mianownika wszystkich unikalnych zaplanowanych prób ze znanym statusem, najlepiej po pełnym zakończeniu kolejki. Na etapie niepełnego pomiaru różnica all-recorded jest opisowa, ponieważ wersje mogą mieć różne pokrycie i ekspozycje.

Przypadki wybrane do reprodukcji są celowo obciążone wykrytymi awariami. „X/Y dawnych awarii teraz przechodzi” jest poprawnym opisem testu regresji; nie jest oszacowaniem częstości błędów we wszystkich meczach. Częstość błędów należy oceniać osobno na świeżym holdoucie.

Liczba klatek, rzutów, sekund-zawodnika i posiadań to ekspozycje, nie niezależne replikacje. Role mają zagregowany pomiar ruchu; nie wyprowadzać z niego udziału w kontaktach z dyskiem ani optymalności pojedynczych decyzji. Niewykonane dyrektywy, warunki pogodowe, rodziny składów lub kombinacje ról jawnie oznaczyć jako brak pokrycia, bez ekstrapolacji z trzech zrównoważonych rosterów.

## Kontrola narzędzia bez zmian produkcji

Nie stwierdzono potrzeby zmiany produkcji ani final comparatora na podstawie tego przeglądu. Przed publikacją raportu: wygenerować comparison po zamknięciu obu wersji, sprawdzić `globalIssues`, pokrycie wszystkich 498 zadań/wersję, wykluczenia i metryczne `pairedBlocks`; pobrać rzeczywiste n dla każdej cytowanej komórki. Pooled CI starego baseline pominąć. Uzasadnienia napraw oprzeć na deterministycznych reprodukcjach, a rozmiary efektów sportowych opisać jako wyniki małej, sparowanej próby.
