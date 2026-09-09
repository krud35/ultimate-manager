# Rozwój przez grę i lista wypożyczeń

Wzrost meczowy jest dodatkiem do dotychczasowego treningu. Źródłem udziału w grze jest rzeczywiste `pointsPlayed` z box score podzielone przez sumę punktów obu zespołów. Silnik nie raportuje minut; mechanika nie zamienia występu na arbitralną liczbę minut. Brak udziału daje zero doświadczenia meczowego.

Doświadczenie narasta ułamkowo. Jeden pełny punkt doświadczenia zwiększa jeden atrybut o 1, a nie cały OVR. Premia za udział osiąga limit przy połowie rozegranych punktów, więc nadmierna eksploatacja nie daje nieograniczonego zysku.

Uwzględnione czynniki:

- Wiek: mnożnik 1,25 do 20 lat; 1,1 do 23; 0,75 do 26; 0,4 do 29; 0,15 później.
- Liga: 1,15 / 1 / 0,8 dla EUCS 1 / 2 / 3; 1,05 dla UFA.
- Siła rywali w stosunku do zawodnika: ograniczony mnożnik 0,8–1,2.
- Forma: ograniczony mnożnik 0,6–1,2; dobra forma bez występów nie generuje doświadczenia.
- Zmęczenie i miejsce do potencjału ograniczają przyrost. Po osiągnięciu potencjału premia meczowa wynosi zero.

Wspólna obsługa obejmuje ligę gracza, pozostałe ligi i puchar. Walkowery nie dają doświadczenia. Identyfikatory rozegranych meczów i pozostałe ułamki doświadczenia są zapisywane z karierą.

Juniorzy regenerują 2 punkty zmęczenia na dzień, 4 przy odpoczynku; leczą też kontuzje. Kontuzjowani nie otrzymują wzrostu dziennego ani tygodniowych sesji i minut U21. Zawodnik odpoczywający również nie otrzymuje dodatkowej sesji U21.

AI przegląda składy raz w tygodniu, także poza oknem transferowym. Ocenia do ośmiu ostatnich meczów aktualnego klubu, najwyżej 90 dni wstecz. Wymaga przynajmniej czterech meczów dostępności i udziału poniżej 12%. Nie wystawia wypożyczonych, obecnie kontuzjowanych, siedmiu najwyżej ocenianych graczy ani zawodników klubów z kadrą najwyżej 16 osób.

Perspektywiczny rezerwowy ma najwyżej 24 lata, potencjał co najmniej 3 punkty ponad średnią najlepszych 21 zawodników klubu i co najmniej 5 punktów powyżej własnego OVR. Trafia na listę wypożyczeń; pozostali niegrający rezerwowi na transferową. AI przestaje automatycznie oferować zawodnika, gdy warunki przestają obowiązywać. Kluby AI nie kupują w zwykłym automatycznym przebiegu rynku talentów wystawionych do wypożyczenia.

Gracz ustawia listę wypożyczeń w profilu zawodnika. Podgląd i zdejmowanie z listy znajdują się też w transferach. Obie listy są rozłączne. Wystawienie na wypożyczenie zwiększa częstotliwość i wagę zapytań AI; kluby zainteresowane wypożyczeniem muszą mieć miejsce w swojej pierwszej rotacji 21 graczy według OVR. To ocena szans na grę, nie gwarancja występów.

Weryfikacja: 51 testów — 6 rozwoju i list, 14 regresji cyklu świata, 7 akademii, 15 wydarzeń i 9 finansów. Build aplikacji poprawny. Testy porównują kierunek wpływu gry, wieku, formy i ligi, zabezpieczenie przed ponownym rozliczeniem, regenerację i wybór list przez AI. Nie stanowią wielosezonowej kalibracji tempa wzrostu OVR.
