# Proste sytuacje i źródła strat — audyt statyczny

Stan kodu: 9 września 2026, po dodaniu autów i toe-in. Nie uruchamiano testów, symulacji, benchmarków ani kalibracji. Nie zmieniono współczynników ani zachowania silnika. Przykłady liczbowe poniżej są rachunkiem z formuł, nie wynikami rozegranych akcji.

## Wniosek

Najpierw trzeba uszczelnić wybór rzutu i diagnostykę, a dopiero później zmieniać skuteczność wykonania. Kod pozwala wybrać opcję bez pełnej kontroli osiągalności, ocenia ją na starszych obserwacjach i nie sprawdza legalnego podparcia. Późniejszy brak kontaktu często otrzymuje domyślną etykietę `receiver_late`. To nie wystarcza do stwierdzenia, że odbiorcy są po prostu za wolni.

Najmocniej potwierdzone są luki przepływu danych i warunków. Ich udział w liczbie strat pozostaje nieznany bez obserwacji przebiegów. Nie ma podstaw do podnoszenia globalnej celności, zasięgu czy szybkości na podstawie samego completion.

## Ocena prostych sytuacji

Założenie wspólne: poprawne profile, morale 72, brak cech i rozkazów, pełna energia; wiatr tylko w sytuacji, która go wymienia. Podane pozycje opisują scenariusz do rozumowania, nie wykonany eksperyment. Boisko ma 100 × 37 m, atak home w stronę rosnącego X.

| Sytuacja | Oczekiwane zachowanie | Co wynika z kodu | Ocena |
|---|---|---|---|
| Czysty incut: rzucający (35,18), odbiorca (45,18) biegnie do niego, brak obrońcy w torze | Prowadzenie na dostępne okno, dogodny chwyt | Wybór punktu uwzględnia ruch i czas dobiegu, ale ostatnia kontrola toru nie obejmuje każdej możliwej opcji. Osobny błąd wysokości/krzywizny może zmienić czas i miejsce kontaktu | Bazowy chwyt nie wygląda na główne źródło problemu. Podejrzane są wybór, nieaktualna geometria i wykonanie toru |
| Reset 6–8 m za rzucającym, otwarty handler | Rzucający potrafi sprawdzić reset i skorzystać z niego, gdy pole jest zamknięte | Kierunkowe skanowanie zaczyna się w stronę ataku; niewidziany reset może zniknąć z listy. Ponadto przy niskim stallu istnieje jawne zastąpienie najlepszego dumpa opcją do przodu o niższej ocenie | Potwierdzona preferencja terenu kosztem bezpieczeństwa; możliwe sztuczne opóźnianie resetu |
| Krótkie podanie do odbiorcy właśnie zawracającego | Uwzględnienie hamowania, nawrotu i krótkiego czasu reakcji | Dobieg ma koszt skrętu i rozpędzenia. Plan próbkowany jest jednak co 120 ms, a bieżący cel może pozostawać w cache do 200 ms | Sensowny fundament, ale ryzyko pominięcia krótkiego okna i zbyt późnej korekty. Nie jest to dowód zbyt niskiego Vmax |
| Huck około 35 m w podwójne krycie | Odrzucenie lub wybór toru i momentu dającego przewagę odbiorcy | Są kary za tor, presję i dolot, ale niesprawdzona opcja może wygrać po odrzuceniu sprawdzonych. Dodatkowo `contested` przy chwycie oznacza prawie jednoczesne przecięcie bryły zasięgu, a nie całe pojęcie podwójnego krycia | Blok może być prawidłową konsekwencją ryzyka; trzeba oddzielić świadomie trudny rzut od obejścia kontroli |
| Podanie przy linii: odbiorca blisko y=0, tor częściowo poza boiskiem | Dopuszczenie powrotu dysku; wybór punktu z legalnym chwytem lub osiągalnym toe-in | Lot nie jest przycinany. Planista ocenia dystans i wysokość, ale nie korzysta z reguł podparcia. Toe-in jest dodawany przy kontakcie/lądowaniu | Potwierdzona luka: „mogę dosięgnąć dysku” nie znaczy „mogę legalnie go złapać” |
| Ten sam rzut z wiatrem, pod wiatr i z bocznym wiatrem | Inna krzywizna, wysokość/czas lotu i odpowiednia kompensacja | Wiatr zmienia tor, rozrzut i wynik wykonania. Kompensacja planu istnieje, ale wykonanie zmienia łuk/czas. Diagnostyka mierzy głównie błąd celu, nie pełną różnicę torów | Kanały mogą być uzasadnione, lecz ich łączna siła nie jest skalibrowana. Nie można uznać każdej takiej straty za spóźnienie |
| Zbicie przy innym, bliższym zawodniku ataku | Najlepiej ustawiony gracz reaguje na wolny dysk | Wszyscy poza rzucającym mogą fizycznie dotknąć dysku. Bezpośredni pościg w ataku uruchamiany jest jednak przede wszystkim dla pierwotnego odbiorcy; pozostali kontynuują zwykłe zadania | Odzyskanie jest możliwe, ale współpraca po zbiciu nie odpowiada pełnej walce o wolny dysk |
| Ten sam prosty rzut przy energii 100 i 20 | Pogorszenie wykonania i ruchu, bez przypadkowego karania dwa razy za to samo zjawisko | Na wynik rzutu składają się osobno kara wydajności, załamanie przy wyczerpaniu i kara motionFatigue. Ruch oraz chwyt także mają własne kanały zmęczenia | Bardzo silna łączna kara jest potwierdzona; jej realizm wymaga kalibracji i rozpisania składników |

## Potwierdzone problemy, które należy usunąć przed balansem

### 1. Można wybrać rzut bez końcowej kontroli osiągalności — wysoki priorytet

`applyLaneReadToOptions` bada pierwsze 2–3 opcje i tylko te powyżej `readFloor`. Następnie wszystkie opcje są ponownie sortowane i może wygrać niesprawdzona. Funkcja pomija cały etap, gdy brak widzianych obrońców, choć odbiorca nadal może nie zdążyć. Alternatywy wybierane w regułach preferencji podań do przodu również nie przechodzą osobnej bramki końcowej.

Przykład przepływu: przy limicie dwóch badanych opcji A i B odpadają z powodu nieosiągalności, a C zachowuje ocenę powyżej progu. C zostaje wybrana bez `plannedArrival`. To logicznie dopuszczona ścieżka, nie pomiar częstości.

Naprawa: oddzielić kosztowny wybór kształtu od obowiązkowej kontroli wybranego rzutu. Sprawdzić zwycięzcę i każdą opcję zastępczą, także przy zerowej liczbie obrońców. Przy odrzuceniu przejść do następnej lub czekać; brak sprawdzenia nie może oznaczać pozytywnej oceny.

Źródło: [throwerBrain.js:534](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/throwerBrain.js:534), [ponowny wybór:1091](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/throwerBrain.js:1091).

### 2. Brak kontroli legalnego chwytu w planowaniu — wysoki priorytet

`selectDiscIntercept` sprawdza dobieg i wysokość. Nie sprawdza linii, miejsca wybicia, pierwszego podparcia ani osiągalności toe-in. Gracz może więc prawidłowo odrzucić rzut nieosiągalny fizycznie, a zaakceptować dosięgalny, lecz kończący się autem.

Naprawa: wspólna prognoza legalnego kontaktu dla planowania i wykonania. Toe-in powinien być planowaną, trudniejszą opcją z określonym miejscem podparcia, a nie dopiero ratunkiem przy odbiorze. Nie wolno zakazać wszystkich torów wychodzących poza boisko — poprawny warunek dotyczy kontaktu, nie samego lotu.

Źródło: [discIntercept.js:37](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/discIntercept.js:37), [catchRules.js:32](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/catchRules.js:32).

### 3. Diagnoza „receiver_late” nie potwierdza spóźnienia — wysoki priorytet

`diagnoseThrow` nadaje tę nazwę domyślnie każdej nierozpoznanej stracie. Dopiero później sprawdza planowane spóźnienie i błąd celu ponad 1,5 m. Brak planu nie jest oddzielną kategorią. Błąd wysokości, krzywizny, percepcji czy dobiegu może więc trafić do jednej szuflady. `inference: true` uczciwie zaznacza niepewność, lecz nie rozwiązuje braku danych.

Po dotknięciach `pendingTouch` opisuje ostatni nieudany kontakt, a nie pełny mechanizm straty. Aut nadpisuje powód, mimo że wcześniejszy blok/drop mógł go spowodować. To rozsądna informacja o końcu akcji, lecz nie wystarczająca przyczyna do kalibracji.

Naprawa: rozdzielić `outcome` od `cause`. Dla braku dowodu stosować `unknown_no_contact`, a osobno zapisywać brak planu, legalność, błąd celu/łuku/czasu, dostępne okna, reakcję odbiorcy i historię dotknięć. `receiver_late` wymaga wykazania, że istniało legalne okno, do którego odbiorca faktycznie nie dotarł.

Źródło: [throwDiagnosis.js](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/throwDiagnosis.js), [actionSimulator.js:1833](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/actionSimulator.js:1833).

### 4. Stan decyzji może być starszy od chwili rzutu — średni/wysoki priorytet

Opcja jest przechowywana w `scanCache`; nominalny skan ma odstęp 250 ms (w siatce 20 ms zwykle 260 ms). `option.agent` jest migawką percepcji. Przy wypuszczeniu ma pierwszeństwo przed wyszukaniem bieżącego agenta. Migawka może być jeszcze starsza z powodu braku widoczności. Bramka wypuszczenia nie wymusza odświeżenia osiągalności.

Przy prędkości 6 m/s przez 240 ms zawodnik pokonuje 1,44 m. To skala porównywalna z zasięgiem ręki. Samo używanie starej wiedzy jest częścią realizmu, ale obecnie nie oddzielono intencjonalnej niepewności od technicznego cache.

Naprawa: zachować czas obserwacji, przewidywać pozycję na moment wypuszczenia i ponownie ocenić wybrany rzut na dostępnej wtedy wiedzy. Nie zastępować tej wiedzy automatycznie pełnym stanem świata. W diagnostyce zapisać oba stany, żeby odróżnić błąd percepcji od błędu integratora.

Źródło: [actionSimulator.js:1617](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/actionSimulator.js:1617), [wybór recvAgent:1679](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/actionSimulator.js:1679), [playerPerception.js](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/playerPerception.js).

### 5. Po zbiciu brakuje wspólnego wyboru zawodnika do wolnego dysku — średni/wysoki priorytet

Zmiana toru unieważnia cache przechwytu, co jest poprawne. Nie zmienia jednak automatycznie organizacji ataku: gałąź pościgu wciąż wyróżnia `flight.receiverId`. Inni gracze mogą uratować dysk kontaktem, ale nie dostają pełnego mechanizmu przejęcia zadania na podstawie nowego czasu dotarcia. Obrona ma dodatkową logikę poach.

Naprawa: po zbiciu wybrać głównego gracza do wolnego dysku na podstawie legalnej osiągalności i obserwacji, z krótką histerezą. Pozostali zapewniają przestrzeń i kontynuację. Pierwotny adresat podania powinien pozostać metadanymi, nie obowiązkowym ratownikiem.

Źródło: [actionSimulator.js:1140](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/actionSimulator.js:1140), [interceptForAgent:396](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/flightKinematics.js:396).

### 6. Granice są oceniane w innym momencie niż kontakt — średni priorytet

`firstDiscContact` zwraca ułamek kroku i interpolowaną pozycję dysku. Toe-in, legalność oraz część punktacji korzystają z agenta na końcu kroku. Przy 7 m/s różnica do 20 ms to do 14 cm — istotne przy linii. Sam kontakt przestrzenny i `envelope` również nie opisują dokładnie tego samego momentu: trudność pochodzi z najbliższego zbliżenia w kroku, po pierwszym wejściu w zasięg.

Naprawa: wyznaczyć stan ciała i podparcia w czasie `contact.fraction`, a dla chwytu w powietrzu osobno pierwszy kontakt z ziemią. Nie naprawiać różnicy przez poszerzanie tolerancji linii. Jest to luka precyzji, nie dowód częstości błędnych autów.

Źródło: [discContact.js](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/discContact.js), [actionSimulator.js:1340](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/actionSimulator.js:1340).

## Mechanizmy wymagające kalibracji, nie automatycznej „naprawy”

**Chwyt po osiągnięciu dysku.** Dla catching=80, neutralnego morale, energii 100, bez bonusów i na wygodnej wysokości: idealny chwyt ma 99,8% po ograniczeniu sufitu; przy `reachStrain=1` około 97,93%; z dodatkową presją około 96,79%; przy tej presji i layout około 87,92%. Są to prawdopodobieństwa pojedynczej próby po wejściu w zasięg. Nie są completion całego rzutu, bo wcześniej może zabraknąć kontaktu, wystąpić aut albo blok; po nieudanej próbie możliwe jest odzyskanie. Dlatego podnoszenie samej bazy chwytu nie ma teraz uzasadnienia. [statFormulas.js:332](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/statFormulas.js:332).

**Precyzja rzutu.** Obecne wartości stałych, a nie stare komentarze, dają podstawową częstość dodatkowego błędu 4% dla throwStat=60, około 2,22% dla 80 oraz minimum 1,5% dla 95. Dodatkowy błąd wynosi 0,7–1,7 m. Osobno działa błąd sytuacyjny poniżej marginesu 12, błąd łuku/krzywizny i wiatr. Nie są to częstości strat. Komentarze wspominające 10% i 1,8–4 m są nieaktualne. [resolution.js:504](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/resolution.js:504), [executeThrowShape:189](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/statFormulas.js:189).

**Krótki czas na korektę.** Dla reactions=80 i mieszanego odczytu lotu=80, bez modyfikatorów, korekta błędu toru zaczyna się po 150 ms i osiąga pełną wagę po 710 ms. Przy 300 ms jej waga wynosi około 0,268 przed uwzględnieniem widoczności. To uderza proporcjonalnie mocniej w krótki reset niż długi huck. Równocześnie cel dobiegu ma cache do 200 ms. Opóźnienie jest potrzebne, lecz jego sumaryczna siła wymaga sprawdzenia. [flightKinematics.js:403](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/ai/flightKinematics.js:403).

**Próbkowanie dobiegu.** Planista bada punkty co 120 ms i konserwatywnie zakłada zasięg stojącego zawodnika. Kontakt wykonania jest wykrywany między klatkami i uwzględnia rzeczywisty skok/layout. Krótkie okno może wypaść pomiędzy próbkami. Z kolei użyty koszt skrętu i rozpędzenia jest przybliżeniem, nie przebiegiem integratora. Wniosek: nie wolno traktować samego `reachable` jako dokładnego dowodu. Najpierw zgodność obu modeli, potem zmiana progów.

**Reset i presja.** Przy niskim stallu najlepszy dump może zostać zastąpiony opcją do przodu z oceną aż o 12 punktów poniżej progu. To decyzja projektowa, która może zwiększać ryzyko. Nie należy jej maskować lepszymi rękami zawodników. Kierunkowe widzenie dodatkowo nie zapewnia stałej dostępności resetu, mimo starszego komentarza „zawsze musi widzieć dumpa”.

**Zmęczenie.** Przy energii 20 sama suma `staminaPerformancePenalty`, `staminaThrowCollapsePenalty` i `motionFatigueModifiers.throwAccuracyPenalty` wynosi około 38,61 punktu wyniku rzutu: 26,22 + 8,89 + 3,5. Dochodzą efekty presji/decisions, a ruch i chwyt pogarszają się osobno. To nie musi być błędem, ale jest silnym mechanizmem strat wymagającym osobnego scenariusza zmęczenia. Aktualny próg exhausted to 45, mimo komentarza o 40. [stamina.js:550](C:/Users/marod/ultimate-manager-ufa/src/matchEngine/stamina.js:550).

**Walka o chwyt.** `contested` wymaga obrońcy wśród kandydatów z różnicą `fraction < 0.1`, czyli około 2 ms w kroku 20 ms. To bardzo wąska definicja presji; bliski obrońca może nie zwiększyć trudności chwytu, choć może wcześniej zablokować dysk. Zmiana tego warunku zapewne wpłynie na trudność, ale przed pomiarem nie ma podstaw do ustalenia nowego promienia lub czasu.

## Co mówią wcześniejsze liczby

Istniejący [profile-match.json](C:/Users/marod/ultimate-manager-ufa/artifacts/recommendations/profile-match.json) opisuje jeden wcześniejszy mecz przy wietrze 20 mph: 354 próby, 290 ukończonych i 64 straty. Etykiety strat: receiver_late 28, boundary 16, execution_error 12, block 6, drop 2.

To dane historyczne sprzed obecnej obsługi autów/toe-in. Nie przedstawiają aktualnych częstości ani rozkładu przyczyn. Szczególnie 28 wpisów receiver_late nie dowodzi 28 błędów dobiegu. Ich użyteczny wniosek jest węższy: trzeba rozbić kategorię braku kontaktu, zamiast zaczynać od zwiększania catchingu.

## Kolejność dalszych zmian

1. Obowiązkowo sprawdzać wybrane podanie i każdą opcję zastępczą; rozróżniać niesprawdzone od nieosiągalnego.
2. Wprowadzić legalne okno chwytu i spójny czas kontaktu, wspólny dla planowania, toe-in i wykonania.
3. Rozdzielić wynik akcji od dowodów przyczyny; zapisywać stany przy decyzji, wypuszczeniu i najbliższym kontakcie.
4. Oddzielić celowe opóźnienie percepcji od wieku cache, a po zbiciu przekazywać zadanie do wolnego dysku.
5. Dopiero potem oceniać siłę preferencji resetu, czasu reakcji, błędu wykonania, chwytu i zmęczenia na osobnych scenariuszach.

Minimalny zapis potrzebny do dalszej oceny: `decisionAtMs`, `observationAtMs`, `releaseAtMs`, `validationStatus`, kandydat wybrany i odrzucony, planowany tor, błąd celu/łuku/czasu, obserwowany cel dobiegu w czasie, legalne okna kontaktu, najbliższy zasięg, punkty podparcia oraz chronologia dotknięć. Tych danych nie zastąpi jeden procent completion.

Nie ustalono empirycznie największego źródła strat. Ustalono konkretne ścieżki kodu, które mogą powodować nieuzasadnione ryzyko lub błędnie opisywać jego konsekwencje. To wystarcza do wskazania powyższych poprawek przed balansem, ale nie do ogłoszenia kalibracji zakończoną.
