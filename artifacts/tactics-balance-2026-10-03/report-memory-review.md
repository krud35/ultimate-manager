# Raport taktyk — ograniczenie pamięci bez zmiany statystyki

**Wynik: PASS.** LIVE `scripts/tactics-balance-report.mjs` odrzuca diagnostykę każdego meczu bezpośrednio po jego odczycie. W jednej porównawczej próbie szczyt RSS spadł z **242,09 do 75,27 MiB (−68,9%)**, a wszystkie wyniki raportu pozostały identyczne poza czasem jego wygenerowania.

Nie zmieniono snapshotów, manifestów biegu, kontrolera, kolejki, silnika ani działającej symulacji. Wersja zamrożona nadal jest dostępna. Nowy plik LIVE może służyć jako analizator po zakończeniu biegu lub jako uzgodniona wersja zastępcza.

## Zakres zmiany

Nowa funkcja `readReportResult` czyta pojedynczy JSON i zachowuje wyłącznie:

- `job`, `status`, `score`, `sides`, `identity`;
- `pointOutcomes[].possessions`, potrzebne tylko do istniejącego mechanizmu zastępczego dla starszych wyników bez licznika posiadań;
- `hardErrors`, `warnings`, `error`, `timings`.

Nie pozostawia odwołań do dużych drzew `checkpoints`, efektywnych ustawień, modów, próbek percepcji, zawodników ani powtórek. `sides` zachowano w całości, dzięki czemu wszystkie dotychczas używane metryki ruchu, ról i decyzji pozostają dostępne. Nie zmieniono żadnego wzoru, mianownika, filtra poprawności, grupowania, warunku parowania ani bootstrapu.

Nadal parsowany jest jeden cały plik naraz, więc chwilowy koszt zależy również od największego pliku. Po odczycie pamięć rośnie z małymi danymi potrzebnymi analizie, a nie ze wszystkimi checkpointami wszystkich spotkań. Nie jest to parser strumieniowy JSON i nie gwarantuje stałego limitu RAM przy dowolnym rozmiarze danych.

## Jedna próba porównawcza

Zamrożono 64 rzeczywiste pliki v2, obejmujące kompletne grupy wszystkich siedmiu kohort; łącznie 38,15 MiB JSON. QA korzysta z hardlinków, bez kopiowania treści dużych plików. Dodano 14 małych, jawnie syntetycznych wyników do kontroli trzech seedów CI, starszego mianownika posiadań, brakujących pomiarów, ostrzeżeń i nieprawidłowego składu.

Obie wersje uruchomiono kolejno, po jednym razie, w oddzielnych procesach z limitem sterty 768 MiB. Stara wersja była odczytana bez zmian ze snapshotu v2. Porównano wszystkie pola `summary.json` i `coverage.json` po usunięciu wyłącznie `generatedAt`; porównano również cały `REPORT.md` po pominięciu znacznika czasu. **Pełna zgodność.**

| Pomiar | Przed | Po |
|---|---:|---:|
| Szczyt RSS procesu | 242,09 MiB | 75,27 MiB |
| Zajęta sterta po raporcie, przed wymuszonym GC | 80,06 MiB | 12,05 MiB |
| Zajęta sterta po GC | 4,89 MiB | 4,97 MiB |
| Czas raportu | 1,66 s | 1,40 s |
| Poprawne pełne mecze / kompletne pary | 77 / 38 | 77 / 38 |
| Kontrasty / wykluczone wyniki | 21 / 1 | 21 / 1 |

Syntetyczny kontrast zachował efekt 10 pp i CI `[10, 10]` dla trzech niezależnych seedów. Brak ruchu pozostał `null`; komunikat błędu składu i ostrzeżenia pozostały zachowane, a nieważny mecz oraz jego para zostały wykluczone.

## Pełny odczyt tylko nową wersją

Na zamrożonej liście wszystkich **219** dostępnych rzeczywistych wyników v2 nowy raport osiągnął **120,78 MiB szczytu RSS**, 29,52 MiB sterty przed GC i czas 3,73 s. Potwierdził 219 pełnych meczów, 109 pełnych par, 26 komórek macierzy, 53 kontrasty oraz brak błędów odczytu i nieważnych wyników.

Odczyt monitora z `2026-10-03T00:06:30.420Z` zawierał 210 meczów. Dokładnie 210 plików zamrożonej listy miało czas zapisu nie późniejszy od tego odczytu; zgadzały się również wszystkie liczebności kohort. Pozostałe dziewięć plików powstało później i jest jawnie wymienionych w sprawdzeniu liczebności. Nie porównywano zmieniającego się katalogu jakby był jednym stanem.

Wynik dla 219 meczów jest pomiarem, nie obietnicą konkretnej pamięci dla 700 lub większej liczby. Ciężki mechanizm utrzymywania całej diagnostyki został jednak usunięty; nie wykonywano kolejnego kosztownego pomiaru starej wersji ani nowych symulacji.

## Dowody i wersje

- `report-memory-qa/INPUTS.json`: zamrożone listy plików i hashe.
- `report-memory-qa/PARITY.json`: pełna zgodność starego i nowego raportu.
- `report-memory-qa/before/memory.json`, `after/memory.json`: pomiary pojedynczej próby porównawczej.
- `report-memory-qa/FULL-COUNT-CHECK.json`: zgodność pełnego nowego odczytu z monitorem.
- `report-memory-qa/full-after/memory.json`: pomiar 219 rzeczywistych wyników.
- Raporty QA pozostają w podkatalogach `before`, `after` i `full-after`; zawierają wyłącznie właściwe dla nich próbki i nie zastępują raportu bieżącej serii.

SHA-256 przed: `09bd240b7a846beb6ca8411bbd1f0964a37e93ad8a0181ea10cb88e55468583a`.

SHA-256 po: `0bd6f37deeb02f2a8f342ac742e5cadaf0f601e0c3872d62f84a7483aadbcf19`.

Kontrola składni i ESLint zmienionego pliku: PASS.
