# Godzinny audyt silnika

Status: PREPARED. Start: —. Koniec: w toku. Czas: 0.00 min.

## Wynik główny

Referencyjne pełne mecze: **0**. Completion: **—%** (0/0), 95% CI brak wystarczającej próby; cel 90–93%, werdykt INCONCLUSIVE. Resety: **—%** (0/0), 95% CI brak wystarczającej próby; cel 94–96%, werdykt INCONCLUSIVE.

Średnia completion z równymi wagami 6 komórek: —%. Przerwane mecze są wyłączone z tego wyniku i jawnie wykazane niżej.

## Pokrycie

| Moduł | Wykonane / kolejka | Pełne mecze |
|---|---:|---:|
| integrity | 0/4 | 0 |
| situations | 0/9 | 0 |
| reference | 0/120 | 0 |
| tactics | 0/124 | 0 |
| effects | 0/543 | 0 |
| stress | 0/8 | 0 |
| fast | 0/24 | 0 |

Kolejka zawiera także dodatkowe powtórzenia; nie każde niewykonane zadanie jest brakującym minimum. Szczegóły: missing-coverage.json oraz effects.json. Pełne mecze — pokrycie minimum: INCOMPLETE.

## Podania i straty

| Typ | Próby | Completion |
|---|---:|---:|


Diagnozy zakończeń: {}. Nie utożsamiamy etykiety zakończenia z potwierdzoną przyczyną.

## Zachowanie

Średni czas do rzutu: — ms. Udział resetów: —%. Hucków: —%. Statyczne przebywanie zawodników bez dysku: —% czasu ofensywnych agentów (obejmuje uzasadnione czekanie). Skanów: 0; bez wybranej opcji: 0; obserwacje starsze niż 500 ms: —%.

Alarmy: 0 łańcuchów resetów, 0 przemieszczeń, 0 odwróceń celu. To materiał do diagnozy, nie automatycznie potwierdzone błędy decyzji.

## Taktyki i cechy

Profile taktyk: tactics-baseline.json. Sparowane efekty dyrektyw: coach-effects.json. Próby cech: effects.json (0 sytuacji, 0 osi). Małe próby są eksploracyjne; brak okazji nie dowodzi martwego ustawienia. Wyniki nie stanowią rankingu taktyk ani zakończonego balansu.

## Integralność i ograniczenia

Neutralność sond / powtarzalność: INCONCLUSIVE. NaN/Infinity: 0; sztuczne wyniki z limitu: 0. Pozostałe niezmienniki nie są automatycznie uznane za PASS.

- No compatible real-match reference dataset supplied; external realism inconclusive.
- Controlled execution adapter omits point-level commitment guards; full matches use production point pipeline.
- Counterfactual alternate-action branches and automatic legal-possession oracle not implemented; review remains required.
- Trait probes modify one trait on both lineups; they measure global trait exposure, not an isolated individual causal effect.
- Coach point probes set both teams identically; they measure behavior response, not win advantage.
- Full-matrix interaction and full-field rotation probes remain uncovered unless separately recorded.

Przerwane/błędne zadania: brak.

## Materiał do przeglądu

review.html: 6 powtórek z losowania warstwowego. Przy tej implementacji próbkujemy kandydatów o minimalnym hashu z każdego zadania; replay-index.json podaje identyfikatory i seedy. Pełne źródła są w snapshot/, wejścia w inputs/. Ślady do odtworzenia zaczynamy od początku zadania/punktu z seedem; sam stan pozycji nie wystarcza.

Ocenę wzrokową i wnioski przyczynowe dopisujemy po obejrzeniu materiału. Nie potwierdzamy empirycznej zgodności z rzeczywistymi meczami bez zgodnego zbioru referencyjnego.
