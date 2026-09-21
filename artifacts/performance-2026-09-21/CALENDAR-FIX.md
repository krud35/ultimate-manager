# Poprawka codziennego planowania terminarza — 21.09.2026

## Zachowanie

Terminarz ligowy zachowuje ustalone daty. Codzienny krok porównuje zestaw rezerwacji
pucharowych i zasad kalendarza ze stanem ostatniej udanej kontroli. Gdy nic się nie
zmieniło, kończy pracę przed sortowaniem meczów i szukaniem nowych terminów.

Po pojawieniu się nowych ograniczeń sprawdzane są kolizje. Poprawne daty pozostają
bez zmian, a przeniesienie meczu uwzględnia również kolejnych przeciwników. Zachowane
są trzy dni odstępu, dni rozgrywek, przerwa świąteczna i francuskie terminy końcowe.
Rozegrane spotkania są nieruchome i od początku stanowią rezerwacje. Nieudana
korekta nie zostawia częściowo zmienionego terminarza.

Stan kontroli jest zapisywany razem z karierą i przetrwa kopiowanie kariery oraz
wczytanie JSON. Starsza kariera bez tego stanu zostaje sprawdzona przy pierwszym
kroku. Daty wcześniej przełożonych spotkań nie wracają samoczynnie do pierwotnych.

## Wyizolowany pomiar terminarza

38 lig, 602 kluby, 9519 spotkań ligowych i pucharowych, 30 dni. Obie wersje dostały
kopie tego samego początkowego terminarza. Trzy pary pomiarów w jednym procesie,
z naprzemienną kolejnością. Stara funkcja pochodzi z commita
`34bdbd4ec8f858088f917b9198be8ad3ad1e6a32`; została załadowana do pamięci bez
podmieniania plików projektu.

| Koszt obsługi terminarza przez 30 dni | Przed | Po |
|---|---:|---:|
| Średnia z 3 przebiegów | 31,482 s | 0,074 s |
| Zakres | 28,131–36,717 s | 0,063–0,084 s |
| Pełne sprawdzenia / planowanie | 30 | 0 |

**Około 427 razy mniej czasu dla tej czynności** w okresie bez nowych rezerwacji.
Pomiar obejmuje codzienne wykrywanie zmian. Nie obejmuje tworzenia terminarza,
losowania nowych rund, meczów, treningów, interfejsu ani zapisów. Nie oznacza
427-krotnego przyspieszenia całej gry. Wynik dotyczy PC / Node 24.19.0.

Powtórzenie:

```text
node --import ./scripts/register-world-tests.mjs scripts/bench-domestic-calendar.mjs
```

Dane: `domestic-calendar-comparison.json`.

## Całe przewijanie 30 dni kariery

Osobny przebieg domyślnego świata krajowego z ustalonym ziarnem losowości:

| Etap | Przed | Po |
|---|---:|---:|
| Utworzenie kariery | 41,81 s | 38,88 s |
| Obliczenia 30 kolejnych dni | 61,17 s | 25,34 s |

To wynik orientacyjny: pojedyncza para, bez interfejsu i zapisów. W trakcie pracy
w innym zadaniu zmieniał się także silnik meczowy; różnicy całego przewijania nie
można przypisać wyłącznie tej poprawce. Wyizolowany pomiar powyżej porównuje samą
starą i nową funkcję terminarza na tych samych danych i nie korzysta z silnika meczów.

Dane: `domestic-baseline-calendar-before.json`, `domestic-baseline-calendar-after.json`.

## Weryfikacja

- 10 nowych testów: stabilność dat, nowe rundy, propagacja kolizji, ligi w tle,
  zmiana daty/uczestnika pucharu, rezerwacje rund krajowych, zakończone mecze,
  stary zapis, JSON i kopiowanie, granice sezonu, święta, zmiana czasu, nieudana
  korekta, brak zmian UFA oraz pełny sezon dzień po dniu.
- W pełnym testowym sezonie 16 klubów: **4 kontrole planowania i 361 pominiętych
  dni**, wszystkie mecze zakończone, odstępy zachowane.
- Istniejące testy sezonów krajowych: 13/13.
- Istniejące testy pucharów międzynarodowych: 10/10.
- Test francuskiej piramidy: poprawny, w tym pięć sezonów, baraże i zgodność
  z pucharami międzynarodowymi.
- Kontrola jakości zmienionego pliku, kontrola importów i kompilacja produkcyjna:
  poprawne. Kompilacja nadal zgłasza ostrzeżenie o dużym pakiecie aplikacji.

Zmiana produkcyjna jest ograniczona do `src/league/domesticCalendar.js`.
