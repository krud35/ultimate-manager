# Godzinny audyt silnika

Status: FINISHED. Start: 2026-09-09T15:33:52.455Z. Koniec: 2026-09-09T23:45:23.454Z. Czas: 60.00 min.

## Wynik główny

Referencyjne pełne mecze: **48**. Completion: **92.77%** (11614/12519), 95% CI 92.16–93.37%; cel 90–93%, werdykt INCONCLUSIVE. Resety: **94.41%** (3041/3221), 95% CI 93.64–95.17%; cel 94–96%, werdykt INCONCLUSIVE.

Średnia completion z równymi wagami 6 komórek: 92.81%. Przerwane mecze są wyłączone z tego wyniku i jawnie wykazane niżej.

## Pokrycie

| Moduł | Wykonane / kolejka | Pełne mecze |
|---|---:|---:|
| integrity | 4/4 | 3 |
| situations | 32/33 | 0 |
| reference | 48/120 | 48 |
| tactics | 141/141 | 4 |
| effects | 147/147 | 0 |
| stress | 8/8 | 4 |
| fast | 24/24 | 24 |

Kolejka zawiera także dodatkowe powtórzenia; nie każde niewykonane zadanie jest brakującym minimum. Szczegóły: missing-coverage.json oraz effects.json. Pełne mecze — pokrycie minimum: PASS.

## Podania i straty

| Typ | Próby | Completion |
|---|---:|---:|
| standard | 8265 | 92.80% |
| dump_swing | 3221 | 94.41% |
| huck | 898 | 86.86% |
| over_the_top | 135 | 91.11% |

Diagnozy zakończeń: {"completed":11614,"block":269,"unknown_no_contact":364,"boundary":210,"drop":62}. Nie utożsamiamy etykiety zakończenia z potwierdzoną przyczyną.

## Zachowanie

Średni czas do rzutu: 2589.52 ms. Udział resetów: 25.73%. Hucków: 7.17%. Statyczne przebywanie zawodników bez dysku: 10.75% czasu ofensywnych agentów (obejmuje uzasadnione czekanie). Skanów: 143802; bez wybranej opcji: 63428; obserwacje starsze niż 500 ms: 25.00%.

Alarmy: 0 łańcuchów resetów, 0 przemieszczeń, 32966 odwróceń celu. To materiał do diagnozy, nie automatycznie potwierdzone błędy decyzji.

## Taktyki i cechy

Profile taktyk: tactics-baseline.json. Sparowane efekty dyrektyw: coach-effects.json. Próby cech: effects.json (3696 sytuacji, 48 osi). Małe próby są eksploracyjne; brak okazji nie dowodzi martwego ustawienia. Wyniki nie stanowią rankingu taktyk ani zakończonego balansu.

## Integralność i ograniczenia

Neutralność sond / powtarzalność: PASS. NaN/Infinity: 0; sztuczne wyniki z limitu: 0. Pozostałe niezmienniki nie są automatycznie uznane za PASS.

- No compatible real-match reference dataset supplied; external realism inconclusive.
- Controlled execution adapter omits point-level commitment guards; full matches use production point pipeline.
- Counterfactual alternate-action branches and automatic legal-possession oracle not implemented; review remains required.
- Trait probes modify one trait on both lineups; they measure global trait exposure, not an isolated individual causal effect.
- Coach point probes set both teams identically; they measure behavior response, not win advantage.
- Full-matrix interaction and full-field rotation probes remain uncovered unless separately recorded.

Przerwane/błędne zadania: reference-00086 (timeout), reference-00087 (timeout), situations-00037 (censored).

## Materiał do przeglądu

review.html: 48 powtórek z losowania warstwowego. Przy tej implementacji próbkujemy kandydatów o minimalnym hashu z każdego zadania; replay-index.json podaje identyfikatory i seedy. Pełne źródła są w snapshot/, wejścia w inputs/. Ślady do odtworzenia zaczynamy od początku zadania/punktu z seedem; sam stan pozycji nie wystarcza.

Ocenę wzrokową i wnioski przyczynowe dopisujemy po obejrzeniu materiału. Nie potwierdzamy empirycznej zgodności z rzeczywistymi meczami bez zgodnego zbioru referencyjnego.
