# Osobna wersja kariery: etapy 0–7

Przy zakładaniu kariery, na etapie wyboru rozgrywek, można wybrać **Klasyczna** albo **Uproszczona**. Domyślna pozostaje klasyczna. Wybór obowiązuje w ligach krajowych, UFA i EUCS; jest częścią zapisu, nie globalnym ustawieniem. Nie ma przycisku konwersji trwającej kariery.

## 0. Oddzielenie wersji i zabezpieczenia

- Brak `gameplayEdition` oznacza dotychczasową grę. Nowy tryb zapisuje `gameplayEdition: streamlined` i `editionVersion: 1`. Inicjalizacja treningu jest idempotentna i uruchamia się wyłącznie po jawnym wyborze nowej wersji.
- Istniejący świat, umiejętności, silnik meczu, finanse i historie nie są usuwane. Przejścia sezonu przenoszą metadane kariery przez dotychczasowy model zapisu.
- Ekran zapisów pokazuje wersję, pozwala pobrać kopię JSON oraz odtworzyć ją wyłącznie w pustym slocie. Błędne lub nowsze formaty kopii są odrzucane przed zapisem. Kopia zawiera także świat i nierozstrzygnięte wydarzenia.
- Testy używają własnej pamięci zapisów w Node, bez dostępu do karier użytkownika w przeglądarce. Punkt odniesienia treningu: 12 istniejących testów, w tym 26 tygodni sezonu, przeszło przed dalszą przebudową. Wyniki nowych kontroli i ich czasy zapisuje `artifacts/career-edition-baseline/checks.json`. Są to czasy testów, nie pomiar płynności interfejsu.

## 1. Przewijanie i odprawa

W wersji uproszczonej Dalej, Do meczu i Do daty korzystają z tej samej chronologii i polityki decyzji. Własny mecz nie jest automatycznie rozgrywany przez przewijanie do daty. Nieprzeczytany raport nie zatrzymuje gry, a przeczytana, nierozstrzygnięta decyzja nadal ją zatrzymuje. Decyzje są chronione przed limitem długości skrzynki oraz usunięciem. Negocjacja oczekująca na odpowiedź drugiej strony nie blokuje czasu.

Wydarzenia i ich kontynuacje działają także przy przewijaniu. Kontynuacja z brakującym szablonem lub kontekstem zostaje w zapisie ze znacznikiem diagnostycznym i informacją na odprawie. Opcjonalne zaproszenie do oglądania finału można otworzyć ze skrzynki; kolejne przewinięcie deleguje jego rozstrzygnięcie.

Odprawa pokazuje gotowość składu, aktualny cel i obciążenie treningowe oraz liczbę decyzji. Pozostałe systemy i zakładki pozostają dostępne.

## 2. Płynniejszy mecz

- Jeden ekran przygotowania, następnie gra; pominięte obowiązkowe ekrany prezentacji składów i przemówień. Klasyczna ścieżka pozostaje dostępna w klasycznych karierach.
- Automatyczna rotacja korzysta z istniejących ustawień zmian, respektując taktykę gracza. Tryby oglądania: skrót, pełny mecz oraz ręczne punkty.
- Skrót pokazuje pierwszy punkt, breaki, celne dalekie podania, urazy i końcówkę. Wszystkie punkty nadal liczy pełny silnik. Oglądanie nie daje innego wyniku sportowego.
- Można zatrzymać przebieg po bieżącym punkcie. Dodatkowe postoje: uraz własnego zawodnika, środek meczu (lider osiąga 8), końcówka (13), niski zapas energii co najmniej siedmiu zawodników. Potwierdzone postoje nie pojawiają się ponownie.
- Symulacja do końca pomija animacje i sztuczne sekundowe oczekiwanie między wynikami. Nadal używa pełnego silnika; nie usuwa kosztu obliczeń samego punktu.
- Po meczu raport zawiera trzy obserwacje: skuteczność O/D-line, wybrane podania oraz rodzaje strat. Odsyła do rzeczywistych punktów i powtórek. Punkty policzone bez animacji mają zapis zdarzeń, ale nie mają odtwarzalnej animacji. Pełne statystyki są rozwijane na żądanie.

## 3. Trening i gotowość

Gracz wybiera jeden z pięciu celów (taktyka, technika, fizyczność, młodzi, regeneracja) i trzy poziomy obciążenia. Sztab układa sesje od początku kariery. Mecze, dzień przed/po meczu, przeciążenie i gęsty terminarz mają pierwszeństwo. Mocne obciążenie dodaje pracę indywidualną; nie jest darmową premią do rozwoju.

Maksymalnie trzy projekty kierują rozwojem wybranych zawodników. Pozostali mają rozwój zrównoważony. Zmiana planu wpływa na przyszłe sesje; plan powtarza się do kolejnej zmiany. Projekty usuwają nieobecnych w kadrze zawodników. Widoczne są wykonane sesje, przyrosty atrybutów i znajomości taktyki oraz gotowość: uraz / odpoczynek / brak ogrania / gotowy. Szczegółowe atrybuty i kontrakty nadal są dostępne.

## Weryfikacja

Etapy 4–7 wprowadzają `editionVersion: 2`. Nowe kariery Uproszczone otrzymują wszystkie zasady od początku. Wczytane kariery Uproszczone v1 zachowują dotychczasowe reguły finansowe do następnego sezonu. Kariery Klasyczne i zapisy bez oznaczenia wersji nie są migrowane.

## 4. Taktyka

Cztery osie z trzema poziomami, osobno dla O-Line i D-Line: tempo, ryzyko podań, kierunek ataku i presja obronna. Pozostają ustawienia formacji, force, siódemki i tryb rotacji. Rola boiskowa wynika z miejsca w formacji; zawodnik może mieć jeden wyjątek dotyczący podań. Wyjątek ma pierwszeństwo przed planem zespołu.

Zapis zawiera `streamlinedPlan`; szczegółowe dyrektywy są wyliczane dla silnika. Stare suwaki, mapy instrukcji oraz ręczne tagi i priorytety zmian nie są drugim źródłem ustawień. Migracja zachowuje poprzednią taktykę w archiwum `streamlinedMigration.previousTactics`, a ekran klubu pokazuje podsumowanie. Różne plany mają różne zachowanie w tym samym pełnym silniku, bez zmiany silnika kariery Klasycznej.

## 5. Rekrutacja i akademia

Pierwszy widok transferów prowadzi od brakującej roli przez limit kwoty, pensji i lata do maksymalnie pięciu kandydatów. Wskazuje dopasowanie, koszt umowy przy ustawionym limicie i kompromis wieku/rozwoju. Nie uzupełnia listy zawodnikami przekraczającymi budżet, więc przy małych limitach wynik może być krótszy lub pusty. Pełny rynek pozostaje pod przyciskiem.

Delegacja dotyczy konkretnego zawodnika i dokładnych limitów, które można zobaczyć w skrzynce. Akceptuje klubowe i zawodnicze kontroferty mieszczące się w limicie; większa kwota, pensja, liczba lat lub niewystarczająca gotówka oddają sprawę graczowi. Gracz może przejąć negocjacje. Rejestracja po otwarciu okna wymaga dotychczasowego potwierdzenia.

Nowe kontrakty: pensja, lata i rola (rezerwowy, rotacja, podstawowy). W negocjacjach rotacja obniża próg oczekiwań płacowych o 2%, a rola podstawowa o 5%, w zamian za zobowiązanie do gry. Role przetrwają normalizację kontraktu i ponowne wczytanie. Istniejące bonusy i obietnice pozostają ważne; przy odnowieniu dziedziczą pierwotną datę wygaśnięcia. W nowym trybie bonusy są wydatkiem klubu, z ochroną przed powtórną wypłatą.

Akademia jest częścią planu kadry. Istniejące dwa nabory (1 września i 1 marca) pozostają źródłem kandydatów; prezentowane są trzy rekomendacje z naboru i trzy z własnej akademii. Pozostali juniorzy oraz opłacone kampanie są dostępni w pełnym widoku. Droga do seniorów: awans i trening z seniorami, debiut, rotacja, miejsce w składzie; etapy po debiucie wynikają z rzeczywistego udziału w punktach. Pierwszy kontrakt wychowanka trwa rok i nie gwarantuje minut.

## 6. Klub

Gotówka, zobowiązania i automatyczna rezerwa: pensje zawodników do końca sezonu oraz do ośmiu tygodni kosztów operacyjnych. Reszta jest dostępna na decyzje; nie ma ręcznego przesuwania środków po aktywacji nowych zasad. Zobowiązania obejmujące przyszłe sezony są informacją, a nie dodatkowym pobraniem gotówki. Te same reguły dostępności środków obowiązują kluby AI.

Trzy funkcje sztabu: trening, rekrutacja, zdrowie. Umiejętności i specjalizacje zachowują wpływ na istniejące mechaniki. Nowe zatrudnienie dotyczy prowadzącego dany obszar. Dotychczasowe umowy pomocnicze są respektowane do wygaśnięcia. Trzy główne umowy mogą odnawiać się na rok, po tej samej stawce, tylko przy zatwierdzonym limicie całego sztabu i dostępnych środkach; automat można wyłączyć.

Trzy ścieżki inwestycji: przygotowanie zespołu, pozyskiwanie talentów, infrastruktura. Każda ma trzy progi (odpowiadające co najmniej poziomom 4/7/10 istniejących obiektów). Wyższe odziedziczone poziomy nie są obniżane. Koszt jest sumą brakujących ulepszeń, a ekran pokazuje koszt teraz, utrzymanie, pozostałe środki, czas i konkretne efekty. Jedna budowa naraz; opłacone starsze projekty kończą się normalnie. Wartość aktywów pozostaje bez zmian, więc nie ma dopisywania rekompensaty.

## 7. Wątki kariery

Odprawa pokazuje do trzech aktualnych priorytetów: ostrzeżenie zarządu, zobowiązanie do gry, kontynuację wydarzenia, powrót po urazie lub cel klubu. Cele zarządu to jeden główny i maksymalnie dwa dodatkowe, oceniane przez istniejący system zarządu.

Obietnice z wydarzeń i nowych umów korzystają ze wspólnego licznika. Rotacja wymaga średnio 25%, a podstawowa rola 50% punktów w sześciu dostępnych meczach; urazy i tygodnie bez spotkań nie przybliżają kary. Dotrzymanie daje +1 morale, niedotrzymanie −3, raz na oceniony okres. Umowa rozpoczyna następny okres oceny. Zdarzenie obietnicy nie daje już natychmiastowej darmowej premii.

Nowe losowania dotyczą spraw związanych z kadrą, rehabilitacją i rozwojem, mają mniejszą częstość i limit aktywnych spraw. Prośba o minuty wymaga faktycznego braku gry. Drobne informacje zawiera niedzielny biuletyn; nowe losowe rozmowy pomeczowe nie zatrzymują kalendarza. Już zapisane zdarzenia i ich kontynuacje nie są usuwane. Po co najmniej dwóch tygodniach bez pracy kluby z dołu tabeli mogą zaoferować odbudowę kariery mimo niskiej reputacji. Widok lig zaczyna od kraju gracza, z możliwością otwarcia wszystkich krajów; odprawa eksponuje nadchodzący własny mecz międzynarodowy.

## Polecenia kontrolne

```
node --import ./scripts/register-world-tests.mjs scripts/test-streamlined-career.mjs
node scripts/test-streamlined-ui.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-streamlined-rebuild.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-events-news.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-full-no-replay.mjs
npm run build
```

Testy renderowania obejmują polskie i angielskie widoki treningu, kadry, zapisów, raportu, odprawy, taktyki, rekrutacji, klubu, sztabu i skrzynki. Nie zastępują interaktywnego rozegrania kariery. Ponowna próba podglądu przeglądarkowego przy etapach 4–7 zakończyła się przekroczeniem czasu narzędzia. Docelowe pomiary czasu użytkownika do pierwszego meczu i ocena atrakcyjności rozgrywki wymagają ręcznego playtestu; nie są potwierdzone testami automatycznymi.
