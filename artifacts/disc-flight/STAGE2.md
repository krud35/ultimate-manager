# Etap 2 — kontakt z lecącym dyskiem

2026-09-09. Wdrożono chronologiczne rozstrzyganie kontaktu w pełnym silniku. Zmiana modelu aerodynamicznego pozostaje do wykonania: najpierw trzeba było usunąć zależność wyniku od zbliżeń graczy pochodzących z różnych chwil.

## Zmiany

- Nowy `src/matchEngine/ai/discContact.js` sprawdza przecięcie odcinka lotu z przybliżoną elipsoidą zasięgu zawodnika. Uwzględnia przemieszczenie dysku i zawodnika między klatkami. Dysk nie musi znaleźć się w zasięgu dokładnie w chwili próbkowania, żeby przelot został wykryty.
- Kandydaci do zagrania są porządkowani według momentu kontaktu wewnątrz kroku. Zagrany wcześniej dysk nie może zostać później odebrany przez zawodnika, który dopiero dobiegł. Przy dokładnym remisie kolejność jest losowana bez stałego pierwszeństwa ataku lub obrony.
- Po kontakcie odbiorca próbuje utrzymać dysk, a obrońca wykonać blok. Używane są dotychczasowe formuły umiejętności, zmęczenia i modyfikatorów zawodnika. Obrońca nadal musi zakończyć czas reakcji. Samo znalezienie się niedaleko dysku nie daje już bloku.
- Każdy zawodnik ma jedną próbę podczas lotu. Nieudana próba obrońcy pozwala kontynuować lot; nieutrzymanie dysku przez odbiorcę daje drop i opadanie. Trafienie, drop i blok zapisują punkt, czas oraz zawodnika kontaktu.
- Chwyt kończy bieżący przebieg. Usunięto cofanie śladu i odtwarzanie wcześniejszego stanu zawodników po zbiorczej ocenie końcówki lotu.
- Pionowy zasięg uwzględnia aktualne wybicie, bez dodawania drugiego, potencjalnego skoku. Naprawiono identyfikację roli podczas oceny próby powietrznej: obrońca korzysta z wariantu obronnego. Zawodnik nie wyskakuje pionowo do dysku znajdującego się w jego zasięgu stojącym.

## Wyniki i weryfikacja

Ta sama próba co w etapie 1: 8 meczów fast i 4 pełne, offset seedów 7400, zablokowany wiatr 20 mph / 0°, stała taktyka, normalne rotacje. [Przed](stage2-before.json), [po](stage2-after.json).

| Pełny silnik | Przed | Po |
|---|---:|---:|
| Celne podania | 95,53% | 73,63% |
| Straty na punkt | 0,327 | 2,323 |
| Bloki na mecz | 5,00 | 8,25 |
| Dropy na mecz | 0,50 | 5,50 |
| Niecelne podania na mecz | 2,75 | 40,25 |
| Czas obliczeń na mecz | 6,59 s | 5,16 s |

To duża zmiana balansu, nie potwierdzenie osiągnięcia realizmu. Większość dodatkowych strat wynika z braku kontaktu, nie z bloków. Dawna bramka chwytu pozwalała odbiorcy znajdować się znacznie dalej od dysku niż nowa koperta ręki. Model celowania, odczytu i dobiegu wymaga dostosowania do tej geometrii. Nie zwiększano zasięgu tylko po to, aby odzyskać poprzednią skuteczność.

Przebiegi meczów i liczba klatek zmieniły się, więc porównanie czasu nie izoluje wydajności samej detekcji kontaktu. Fast zachował agregaty wynikowe próby.

Przeszły: regresje lotu i kontaktu (przelot między próbkami, kolejność, obrót osi, brak kontaktu ponad rzeczywistym zasięgiem, kontakt po rzeczywistym wybiciu), 4 pełne mecze kontroli śladów — 656 chwytów i 211 strat, dotychczasowe regresje silnika z 8 meczami fast, ESLint zmienionych plików i budowanie aplikacji z kontrolą eksportów. Pozostaje ostrzeżenie o rozmiarze pakietu aplikacji.

## Co pozostaje

- To przybliżona koperta zasięgu, nie kolizja z animowaną dłonią. Kontakt jest interpolowany w kroku 20 ms, a stan zawodników i klatka końcowa pozostają na siatce kroków. Współczynniki trudności chwytu nadal wymagają kalibracji dla nowego znaczenia zasięgu.
- Obsługiwany jest wyznaczony odbiorca i wszyscy obrońcy. Przypadkowy chwyt przez innego atakującego, ponowne zagranie po zbiciu, chwyt w fazie opadania i poziomy layout nie są jeszcze modelowane.
- Bieg nadal w dużej mierze kieruje zawodnika do przewidywanego punktu docelowego. Następny krok powinien wyznaczać osiągalne miejsce kontaktu na torze, z czasem reakcji i przyspieszeniem. Pomiar wskazuje pilną potrzebę tego kroku, ale sam nie dowodzi, że tłumaczy on wszystkie niecelne podania.
- Wiatr nadal działa przez narastający dryf z etapu 1. Względna prędkość powietrza, siła nośna, orientacja i spin wymagają osobnego wdrożenia. Atrybuty, traity i morale nie zostały przebudowane.

Starszy zbiorczy resolver pozostaje dostępny do porównań diagnostycznych, ale nie rozstrzyga już bieżącej symulacji.
