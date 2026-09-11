# Poprawki po audycie prostych sytuacji

Wdrożono kolejno problemy wskazane w `SIMPLE-SITUATIONS-AUDIT.md`. Nie zmieniano globalnych współczynników chwytu, błędu celowania ani zmęczenia. Zmiany decyzji i dobiegu wpływają jednak na balans, więc wcześniejsze wyniki nie stanowią kalibracji obecnego kodu.

1. **Obowiązkowe sprawdzenie wybranego rzutu.** Wstępnie analizowane są najlepsze opcje, ale każdy późniejszy zwycięzca i każda opcja zastępcza również musi otrzymać plan i kontrolę osiągalności. Obecność obrońców nie jest warunkiem tej kontroli. Po ocenie geometria może zmienić ranking i wybór jest ponawiany. Brak planu/odbiorcy oznacza odrzucenie. Przed stallem 7 wymagane jest osiągalne okno; później trudna próba ma jawny status `forced_late`. Nielegalny kontakt jest odrzucany niezależnie od stalla.

2. **Legalne miejsce podparcia.** Planista odróżnia punkt kontaktu z dyskiem od celu ruchu ciała. Korzysta ze wspólnej geometrii podparcia i toe-in, szuka legalnej pozycji przy linii, pomniejsza pozostały zasięg o konieczne wychylenie. Nie zabrania lotu poza boiskiem. Próbkowanie planu zagęszczono ze 120 do 40 ms; pozostaje to przybliżenie. Prognoza jest konserwatywnie oparta na chwycie z podparciem, bez zakładania idealnego przyszłego layoutu lub skoku.

3. **Aktualność decyzji.** Stara opcja może otworzyć bramkę czasową, ale nie uprawnia do wypuszczenia. W takim przypadku następny krok wymusza nowy skan. Ukryte pozycje nie są ujawniane: skan nadal korzysta z pamięci i percepcji. Zapis obejmuje czas decyzji/wypuszczenia, wiek obserwacji oraz migawkę odbiorcy. Pusty wynik skanowania respektuje nominalne 250 ms zamiast uruchamiać kosztowną ocenę co 20 ms.

4. **Reset.** Usunięto nadpisania zastępujące najlepszy reset słabszą opcją do przodu. Postęp nadal wpływa na ranking. `resetFirstStallBias` przyspiesza lub opóźnia tolerancję dla samego resetu; nie obniża progów wszystkich innych podań. Każda zaakceptowana alternatywa przechodzi tę samą kontrolę geometrii.

5. **Wolny dysk po zbiciu.** Atak ponownie wybiera zawodnika do pościgu co 200 ms. Kandydat musi zaobserwować zbicie oraz przewidywać osiągalny, legalny kontakt. Zmiana następuje przy przewadze czasu co najmniej 250 ms albo braku osiągalnej opcji obecnego gracza. Pierwotny adresat pozostaje metadanymi; `recoveryReceiverId` kieruje nowym pościgiem. To lokalny przydział zadania, nie pełny model komunikacji drużyny. Oryginalny rzucający nadal podlega istniejącemu wyłączeniu z kontaktów w tej akcji.

6. **Czas kontaktu i toe-in.** Stan ciała jest interpolowany do `contact.fraction`; legalność i podparcie nie są już pobierane wyłącznie z końca kroku. Dla chwytu w powietrzu pozostała część kroku jest rozgrywana od stanu w chwili chwytu. Pierwsze lądowanie zapisuje swój czas i podparcie. Bryła kontaktu i stopa pozostają przybliżone; nie wprowadzono pełnej biomechaniki.

7. **Diagnostyka.** Oddzielono `outcome`, `cause`, `causeConfirmed` i obserwowane czynniki. Sam brak kontaktu nie jest już nazywany spóźnieniem: używane są `unknown_no_contact` lub `unknown_unvalidated`. Nielegalna i wymuszona nieosiągalna opcja mają odrębne etykiety. Aut nie dowodzi błędu rzucającego — zachowuje nieznaną przyczynę wraz z historią dotknięć. Rejestrowane są błędy celu/łuku/krzywizny, presja, kara zmęczenia, planowane podparcie oraz do 64 odczytów odbiorcy: wiedza, cel ruchu i rzeczywiste pozycje dla późniejszej analizy. Dane rzeczywiste służą diagnostyce, nie wyborom gracza. Po wypełnieniu limitu ostatni zapis jest aktualizowany; to próbka, nie kompletny ślad każdego przeliczenia.

Najdroższe planowanie pomija opcje, które nawet przy górnej granicy możliwej premii za kształt nie osiągnęłyby żadnego progu akceptacji. Nie pomija kontroli faktycznie wybieranego rzutu. Nie zmierzono końcowego kosztu CPU ani zmiany liczby strat.

Weryfikacja: przegląd kodu, celowany ESLint siedmiu zmienionych modułów oraz kontrola whitespace. Build: poprawne importy/eksporty 291 plików i kompilacja 337 modułów. Pozostało ostrzeżenie wielkości pakietu. Początkowy build w ograniczonym środowisku nie mógł odczytać katalogu nadrzędnego; build z przyznanym uprawnieniem przeszedł.

**Nie uruchamiano testów, symulacji meczowych ani pomiarów balansu.** Nie deklarujemy potwierdzonej poprawy completion, hold ani realizmu w oglądanym meczu. Kolejna ocena powinna wykorzystywać nowe dane diagnostyczne; globalna kalibracja nadal pozostaje otwarta.
