# Etapy 1–2: spójność świata i wydajność rynku

## Zmiany

- Wspólny krok dnia w `src/career/calendarSimulation.js` dla przycisku Dalej, symulacji do meczu i symulacji do daty. Mecze, treningi, płace, raporty, negocjacje i wiadomości są przetwarzane chronologicznie. Zatrzymanie przed meczem nie nalicza efektów dnia ponownie.
- Starzenie seniorów, akademii, kandydatów i wolnych agentów; nowy nabór po starzeniu. Emerytury obejmują również wolnych agentów. Kandydaci, którzy wyrośli z akademii, przechodzą na wolny rynek.
- Raporty akademii po pełnych miesiącach od wyjazdu, z obsługą końców miesięcy, lat przestępnych i zaległości starszych zapisów.
- Aktualny poziom ligi klubu steruje TV i budżetem nowego sezonu. Wczytanie zapisu odtwarza tę informację ze składu piramidy. Cel populacji skaluje się z liczbą klubów.
- Koniec kontraktu jest obsługiwany w kalendarzu. AI ma możliwość wcześniejszego przedłużenia; nieprzedłużeni zawodnicy odchodzą. Wygasający kontrakt na wypożyczeniu kończy również wypożyczenie.
- Usunięte dodatkowe fale transferów wywoływane wejściem w zakładkę. Zachowana fala końca sezonu; jej historia wypożyczeń jest teraz zapisywana.
- Wspólny indeks OVR, rankingów i cen w przebiegu rynku; unieważnianie danych klubów po transferze. Listy do 12 kandydatów transferowych i 8 wypożyczeniowych na kupującego; do 240 ocen transferowych i 80 wypożyczeniowych na wywołanie; 3 dni przerwy po nieudanej negocjacji. Powtórne przetworzenie dat i zakresów nie uruchamia rynku ponownie.

## Weryfikacja

`node --import ./scripts/register-world-tests.mjs scripts/test-world-lifecycle.mjs`

14 testów zaliczonych. Obejmują m.in. własność zawodników, wygaśnięcie wypożyczenia, daty raportów, migrację przynależności ligowej, brak ponownego naliczania oraz identyczny świat i skrzynkę w obu trybach przewijania — także z rzeczywistym meczem.

Kompilacja: `npm run build` zaliczona. Vite zgłasza ostrzeżenie o wielkości głównego pakietu. Nowe moduły, testy i zmienione moduły rynku przechodzą ESLint. W czterech istniejących plikach pozostają wcześniejsze błędy nieużywanych deklaracji (potwierdzone również dla wersji HEAD): App.jsx, careerModel.js, freeAgency.js, worldState.js. TransfersView ma wcześniejsze ostrzeżenia zależności hooków.

## Benchmark

`node --import ./scripts/register-world-tests.mjs scripts/bench-world-market.mjs`

30 prób każdego scenariusza, identyczne światy początkowe i ziarna przed/po. Klonowanie świata, mecze, zapis i renderowanie są poza pomiarem. Czas zależy od obciążenia komputera.

| Kluby / scenariusz | Mediana przed | Mediana po | P95 przed | P95 po |
|---|---:|---:|---:|---:|
| 16 / otwarte okno | 21,79 ms | 4,63 ms | 33,15 ms | 8,92 ms |
| 16 / budżet każdego klubu 40 tys. | 34,46 ms | 1,78 ms | 47,52 ms | 6,12 ms |
| 48 / otwarte okno | 54,69 ms | 6,62 ms | 92,62 ms | 16,26 ms |
| 48 / budżet każdego klubu 40 tys. | 146,02 ms | 9,28 ms | 253,99 ms | 17,28 ms |

Zamknięty rynek nadal kosztuje poniżej 0,1 ms mediany. W zwykłym scenariuszu 48 klubów liczba transferów w próbach zmieniła się z 51 na 49; w sztucznym scenariuszu niskich budżetów z 23 na 9. Krótkie listy i ograniczenia prób celowo zmieniają proces wyboru, więc identyczne ziarno nie gwarantuje starej historii transferowej. To pomiar wydajności i kontrola regresji, nie kalibracja balansu na 10–20 sezonów.

Nie wdrożono regionalnych roczników, pojemności akademii ani przebudowy ekonomii na gotówkę i zobowiązania — należą do kolejnych etapów.
