# Primary handler, „dominuj grę” i ciągłość cutów — 27.09.2026

Pomiar po poprawkach ciągłości cutów. 28 par meczów do 5 punktów, te same składy demo i seedy 92701–92704, siedem formacji, obrona person, bez wiatru, rotacji i adaptacji AI. W wariancie rozkazu tylko primary handler gospodarzy w O-Line i D-Line ma „dominuj grę”; przeciwnik pozostaje bez rozkazu. Liczymy wyłącznie próby podań gospodarzy. Losowania rozchodzą się po zmianie decyzji, więc nie jest to porównanie identycznych akcji. To mała próba diagnostyczna, bez oceny istotności statystycznej.

Wykluczone pary (inna obsada primary handlera albo nie wszystkie jego rzuty z rozkazem): []. Kontuzje są zapisane w surowych wynikach; filtry zapobiegają przypisywaniu efektu rozkazu zastępcy bez instrukcji.

Łącznie 1431 prób bazowych i 1323 z rozkazem. Udział PH jako rzucającego: 20.5 → 22.8%; jako celu podania: 13.2 → 15.0%; jako jednej ze stron podania: 33.7 → 37.8%. Cel podania obejmuje też próby nieudane; to nie jest udział w czasie posiadania dysku.

| Formacja | Pary | PH rzuca, % bez → rozkaz | Podania do PH, % bez → rozkaz |
|---|---:|---:|---:|
| vertical_stack | 4 | 21.7 → 26.2 | 14.3 → 15.2 |
| horizontal_stack | 4 | 18.7 → 20.3 | 7.9 → 10.5 |
| split_stack | 4 | 20.4 → 20.6 | 13.9 → 14.7 |
| side_stack | 4 | 22.3 → 20.3 | 13.5 → 13.7 |
| motion_offense | 4 | 18.9 → 21.5 | 11.1 → 11.0 |
| hex_offense | 4 | 24.3 → 28.3 | 20.1 → 22.8 |
| zone_offense | 4 | 16.2 → 23.0 | 9.2 → 14.9 |

## Co robi rozkaz

Rola primary handlera daje mnożnik 1,45 przy wyborze początkowego rzucającego oraz premię 16 punktów do oceny odbiorcy w promieniu 18 m. Nie oznacza to 45% więcej wszystkich rzutów: po chwycie rzuca posiadacz dysku. Rozkaz nominalnie mnoży skłonność do cutu przez 2,2, obniża próg jego rozpoczęcia o 28, rozszerza skan o 3 m, dodaje jedną dostrzeganą opcję, mnoży wagę wyboru rzucającego przez 1,3 i obniża próg akceptacji podania o 4. Wykonanie instrukcji osłabia te wartości zależnie od zawodnika. Dla badanego PH mnożnik cutu wynosił około 2,03, a wagi rzucającego 1,26. Rozkaz nie zwiększa bezpośrednio oceny podań kolegów do tego handlera, więc nie gwarantuje dominującego udziału w rozegraniu.

## Poprawka cutterów

- Continuation cutter może otrzymać wolne miejsce od początku okna po chwycie (0–700 ms), zamiast dopiero po 1200 ms. W tym oknie ma pierwszeństwo przed oczekującymi cutterami; trwające cuty zachowują pierwszeństwo.
- Stan trwającego lub rozpoczynanego cutu zachowuje rezerwację przy następnym podaniu, nawet gdy nie ma już chwilowej flagi isActive. Zmiana posiadacza dysku nie zeruje biegu z powodu bramki czasowej roli.
- Reorganizacja po chwycie nie przerywa rozpoczynanego cutu tylko dlatego, że zawodnik znajduje się w korytarzu podania. Limit miejsc, odpoczynek po czyszczeniu oraz późny start nowych cutów fillera pozostają zachowane.

Sześć meczów kontrolnych do 3 punktów (vertical/horizontal/motion, po dwa seedy): akcje z rozpoczynanym lub trwającym cutem w pierwszych 700 ms: 80.7 → 87.0%. Udział próbek ruchu off-ball cutterów w tych stanach: 23.2 → 28.0%. Podania do fillerów: 4.9 → 2.9%. Porównanie zawiera 306 i 339 prób podania obu zespołów. Nie jest to pomiar liczby nowych cutów ani gwarancja poprawy każdej akcji.

Walidacja: test-cutter-offer-continuity, test-tactical-behavior-fixes oraz test-full-no-replay. Kontrola ESLint zmienionych modułów i kompilacja produkcyjna.
