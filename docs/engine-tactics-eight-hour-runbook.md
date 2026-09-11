# Uruchamianie audytu taktyk

Runner: `scripts/tactics-audit.mjs`; projekt: `engine-tactics-eight-hour-test-design.md`.

Badanie używa kopii `src` i `scripts`, oddzielnych rosterów development/validation/holdout, pełnego silnika punktów i meczów oraz lokalnego koordynatora. Nie wywołuje modelu, nie wymaga ręcznych decyzji między etapami i nie zmienia produkcyjnego balansu.

## Przygotowanie i start

1. `node scripts/check-tactics-audit.mjs artifacts/engine-audit/tactics-8h/<preflight-id>`
2. `node scripts/tactics-audit.mjs --prepare --preflight artifacts/engine-audit/tactics-8h/<preflight-id> --output artifacts/engine-audit/tactics-8h/<run-id>`
3. Uruchomić `node <pełna-ścieżka-run-id>/snapshot/scripts/tactics-audit.mjs --run --output <pełna-ścieżka-run-id>` jako proces w tle, z logami do plików i ukrytym oknem na Windows.

Odbiór sprawdza identyczność sparowanych rosterów, rozdzielenie holdoutu, zgodność adaptera z produkcyjną ścieżką, neutralność sond, rzeczywiste przekazanie instrukcji, pełny mecz, pauzę/wznowienie i raport po wymuszonej awarii. Próby te nie wchodzą do zbioru badawczego. Zmiana runnera unieważnia zapisany odbiór.

## Pauza i zakończenie

- `node scripts/tactics-audit.mjs --pause --output <run-id>`: koordynator zatrzymuje swoje workery i dopiero potem potwierdza PAUSED.
- `node <run-id>/snapshot/scripts/tactics-audit.mjs --resume --output <run-id>`: zachowuje ukończone zadania, pozostałe powtarza od tego samego seeda. Czas wcześniejszej pracy nie jest odzyskiwany.
- `node scripts/tactics-audit.mjs --stop --output <run-id>`: kończy badanie z raportem STOPPED.
- `node <run-id>/snapshot/scripts/tactics-audit.mjs --report --output <run-id>`: ponownie tworzy raport z zapisanych wyników.

Status i ślady działania: `manifest.json`, `progress.json`, `coordinator.jsonl`, `logs/`, `checkpoints/`. Nie należy usuwać blokady koordynatora ani zmieniać manifestu podczas pracy. Awaria całego komputera może pozostawić RUNNING i blokadę; przed odzyskaniem trzeba sprawdzić, czy procesy rzeczywiście nie działają.

## Zakres pierwszego wykonania

Wersja wykonawcza prowadzi kontrole przez produkcyjne punkty. Ustalony atak i przejścia po zmianie posiadania są obserwowane naturalnie; nie udajemy gwarantowanego pokrycia każdego rodzaju okazji. Cała macierz 7 × 5, wszystkie zarejestrowane dyrektywy i instrukcje oraz obecne archetypy mają zaplanowane próby. Budżet czasu może ograniczyć liczbę powtórzeń; brakujące zadania są jawne w coverage.json.

Katalog zawiera 64 konfiguracje ośmiu rodzin. Development wybiera do dwóch wariantów na rodzinę; validation do czterech rodzin. Holdout porównuje je z dwoma stałymi profilami: balanced_pro i tactical_mastermind. Podział składów i seedów jest odrębny, a finalne konfiguracje zamrożone przed finałem. Kandydaci używają istniejących mechanik i prostej polityki utrzymania planu; nowe mechaniki percepcji nie są symulowane fikcyjnymi bonusami.

Selekcja jest eksploracyjna. Automatyczny raport dostarcza wyniki, przedziały blokowe, kontrasty i powtórki, ale nie wdraża trenerów ani nie deklaruje potwierdzenia wszystkich hipotez projektu. Zamierzona sygnatura, interpretacja przyczyn strat i decyzje zachować/połączyć/przebudować wymagają końcowego przeglądu. Wszystkie ograniczenia są również zapisane w manifeście.

Raport końcowy powstaje lokalnie bez dalszych wywołań asystenta. Ten runner sam nie wysyła wiadomości w aplikacji ani do innych osób.
