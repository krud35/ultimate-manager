# Lot dysku — pierwszy etap wdrożenia

Data: 2026-09-09. Zmiany dotyczą pełnego silnika. Fast zachowuje dotychczasowy model statystyczny. To wdrożenie spójnego modelu kinematycznego, jeszcze nie gotowa aerodynamika dysku.

## Co zmieniono

- Planowanie i wykonanie korzystają z `discTrajectory.js`: wspólne tempo przelotu, wysokość i krzywizna. Wybrany kształt, bazowa wysokość, amplituda i czas przechodzą do wykonania; celowanie i kontrola kształtu nadal mogą wprowadzić błąd.
- Ocena opcji uwzględnia ocenę wybranego toru przez zawodnika, zamiast automatycznie przyznawać wartość najlepszego dostępnego toru.
- Tor bazowy nie korzysta już z dekoracyjnego łuku `fieldViz`. Rzut prosty ma zerową amplitudę; obrót rzutu i wiatru obraca jego tor bez zmiany kształtu.
- Wiatr działa od początku lotu jako stopniowo narastający dryf. Jego wielkość zależy od czasu i wysokości planu; nie ma progu wyłączającego lekki wiatr ani odmiennego mnożnika osi Y.
- Wstępny wynik rzutu nie przestawia zawodników przed rozstrzygnięciem geometrycznym. Funkcja kompatybilności `applyFlightResolutionToAgents` zachowuje pozycje.
- Ślad lotu dostaje stan końcowy z rozstrzygnięcia geometrycznego. Udany chwyt skraca ślad do chwili najbliższego kontaktu odbiorcy i zachowuje stan zawodników z tej chwili. Niezłapany dysk dostaje krótką fazę opadania, podczas której zawodnicy hamują.
- Losowy `wind drop` z modelu statystycznego nie odwraca już udanego chwytu ustalonego przez geometrię pełnego silnika.

## Pomiary

Porównanie tych samych ustawień i seedów: 8 meczów fast, 4 pełne; wiatr 20 mph w kierunku 0°, zablokowana pogoda, stała taktyka, normalne rotacje. Dane: [przed](before.json), [po](after.json).

| Miara pełnego silnika | Przed | Po |
|---|---:|---:|
| Celne podania | 79,16% | 95,53% |
| Straty na punkt | 1,516 | 0,327 |
| Bloki na mecz | 23,50 | 5,00 |
| Dropy na mecz | 1,25 | 0,50 |
| Niecelne podania na mecz | 11,25 | 2,75 |
| Czas obliczeń na mecz | 5,00 s | 6,59 s |
| Klatki na mecz | 35 083 | 37 445 |

Fast zachował agregaty wynikowe tej próby (96,30% celnych podań). Nie jest to dowód identyczności każdej klatki lub każdego zdarzenia wszystkich możliwych meczów.

Wzrost skuteczności nie oznacza osiągnięcia realizmu. Zmieniono kilka powiązanych mechanizmów, więc ta próba nie izoluje ich pojedynczego wpływu. Wskazuje natomiast, że dotychczasowy balans był silnie zależny od usuniętych korekt. Szczególnie alarmujące są hucki: 92 celne na 94 próby po zmianie. Nie należy przywracać sztucznego przestawiania graczy, aby obniżyć skuteczność; trzeba poprawić ocenę kontaktu, niepewność odczytu lotu i błędy wykonania.

Czas pełnej symulacji wzrósł około 32%. Zmieniły się przebiegi meczów i liczba klatek; pomiar nie izoluje kosztu samego nowego samplera. To mała próba, bez twierdzenia o statystycznie ustalonym poziomie skuteczności lub wydajności.

## Weryfikacja

- `node scripts/check-disc-flight.mjs`: zgodność obrotu toru i wiatru, narastanie dryfu, lekki wiatr, przekazanie planu, opadanie, ciągłość ruchu i zgodność zdarzeń ze śladem w 4 pełnych meczach. Ostatni przebieg: 863 chwytów, 39 strat.
- `node scripts/check-engine-realism.mjs`: dotychczasowe regresje stall, miejsca strat, zmęczenia, ruchu, podnoszenia dysku i percepcji; 8 meczów fast.
- ESLint zmienionych plików modelu i nowego skryptu: poprawny.
- `npm run build`: poprawny, w tym kontrola importów i eksportów. Pozostaje ostrzeżenie bundlera o rozmiarze głównego pakietu.

## Ograniczenia i następna kolejność

1. Urealnić aerodynamiczną odpowiedź na wiatr. Obecny model dodaje dryf do zadanego toru, nie wylicza względnej prędkości powietrza, siły nośnej, spinu ani orientacji dysku. Współczynniki dryfu są przybliżeniem wymagającym kalibracji. Stały profil wysokości i sinusoidalna krzywizna nadal pozostają uproszczeniami.
2. Przenieść rozstrzyganie chwytu na bieżący kontakt w czasie lotu. Obecnie końcowe okno kontaktu jest oceniane zbiorczo, a udany ślad skracany do najbliższego kontaktu. To nie jest jeszcze obsługa pierwszego legalnego kontaktu dowolnego zawodnika. Odbicie, ponowny chwyt, swobodne szybowanie po minięciu odbiorcy i pełna obsługa wyjścia w aut wymagają oddzielnego modelu. Opadanie po stracie jest przybliżeniem balistycznym.
3. Skalibrować geometrię i zachowania: zasięgi, czas oraz błąd odczytu lotu, wybór punktu przechwytu, błędy rzutu. Zawodnicy nadal mają zbyt dokładną wiedzę o docelowym dryfie. Porównać krótkie i długie podania, różne kierunki i siłę wiatru oraz poziomy umiejętności; następnie zbadać koszt obliczeń.
4. Dopiero na tej podstawie przebudować atrybuty i AI offense/defense. Rozdzielić fizyczną zdolność wykonania od percepcji i decyzji, aby np. czytanie gry nie zwiększało bezpośrednio prędkości biegu. Tego etapu jeszcze nie wdrożono.

Nie zmieniono modelu atrybutów, traitów ani morale. W repozytorium pozostają wcześniejsze zmiany innych części projektu; niniejszy raport obejmuje wyłącznie etap lotu dysku.
