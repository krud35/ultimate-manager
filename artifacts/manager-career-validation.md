# Kariera trenera i cele zarządu — 2026-09-09

## Zakres

- Strategia jest własnością zarządu i nie ma już przełącznika w interfejsie. Dodano walkę o awans, stabilność finansową i utrzymanie w lidze. Przy generowaniu klubu awans dotyczy niższych lig EUCS, utrzymanie dotyczy EUCS; UFA korzysta z pozostałych strategii. Istniejące strategie i cele w zapisach są zachowane.
- Strategia, zaufanie zarządu, priorytety celów i terminy są na początku panelu zarządzania klubem, przed finansami.
- Pierwsze objęcie klubu, wczytanie starszej kariery i nowa posada tworzą wiadomość powitalną z oczekiwaniami zarządu. Ponowne wczytanie nie powiela wiadomości.
- Panel kariery umożliwia rezygnację, przyjęcie dostępnej oferty oraz dalszą symulację bez klubu. Historia zatrudnienia i reputacja są zapisywane z karierą.
- Zmiana ligi w EUCS zachowuje aktualne wyniki, terminarze, kluby i zawodników. Nie tworzy nowego świata. UFA i EUCS pozostają osobnymi światami kariery.
- Niedokończone negocjacje poprzedniego klubu i oczekujące skutki jego wydarzeń są wycofywane przy odejściu. Były klub przejmuje AI.

## Reguły oceny i zatrudnienia

Zarząd ocenia pracę raz w miesiącu. Wyniki sportowe, zadłużenie i postęp rozwoju akademii wpływają na ocenę, z większą wagą głównego celu strategii. Ostrzeżenia pojawiają się przy zaufaniu najwyżej 30/100. Zwolnienie wymaga zaufania najwyżej 15/100, dwóch wcześniejszych ostrzeżeń i co najmniej 14 dni od ostatniego ostrzeżenia. Miesięczny rytm ocen zwykle daje około miesiąca między kolejnymi krokami. Poprawa zaufania powyżej 40 usuwa ostrzeżenia.

Reputacja startowa wynosi 60/40/22 dla lig EUCS 1/2/3 oraz 40 dla UFA. Uwzględnia tylko nowe zwycięstwa i porażki podczas własnej kadencji (+1,1/-0,9), a nie wyniki poprzedniego trenera. Rezygnacja kosztuje 2 punkty, zwolnienie 8. Zakres to 5–95; wyniki są rozliczane podczas oceny miesięcznej i odejścia.

Oferty zależą od poziomu ligi, reputacji klubu i trenera, jego strategii, zaufania zarządu i pozycji w tabeli. Maksymalnie cztery kluby są widoczne jednocześnie. Oferta jest ponownie sprawdzana przy przyjęciu; sam identyfikator dowolnego klubu nie pozwala go objąć. Najniższe progi obejmują odbudowę klubów niższego szczebla. To uproszczony rynek pracy, bez pełnych kontraktów i zwolnień wszystkich trenerów AI; dolne cztery pozycje tabeli służą także jako kandydaci do odbudowy przed pierwszym meczem.

## Weryfikacja

81 zakończonych pomyślnie testów:

- manager-career: 11 — powitanie, blokada strategii, rezygnacja, wycofanie negocjacji, ostrzeżenia i zwolnienie, odbudowa zaufania, zapis/odczyt, reputacja i ograniczenia ofert, zmiana ligi, symulacja i kolejny sezon bez klubu w UFA/EUCS.
- world-economy: 13.
- world-lifecycle: 14, w tym zgodność symulacji dziennej i przyspieszonej.
- events-news: 15.
- finance-balance: 9.
- season-wage-reserve: 9.
- budget-allocation: 10.

Uruchomienie: `node --import ./scripts/register-world-tests.mjs scripts/test-<nazwa>.mjs`.

ESLint nowych modułów kariery i obu paneli: poprawny. Szersza kontrola App.jsx nadal wskazuje wcześniejsze, nieużywane `handleLeagueChange`.

`npm run build`: poprawny, z ostrzeżeniem Vite o dużym głównym pakiecie.

Kontrola przeglądarkowa na izolowanym podglądzie komponentów, bez modyfikowania zapisów użytkownika: widoczne priorytety, brak przełącznika strategii, anulowanie rezygnacji, potwierdzenie odejścia, stan bez klubu, potwierdzenie i przyjęcie posady Montreal Royal. Przycisk symulacji bez zatrudnienia i przejścia sezonu sprawdzono na poziomie modelu w testach automatycznych, nie w tym podglądzie komponentów.
