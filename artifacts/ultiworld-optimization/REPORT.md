# Ultiworld: copying only the affected club or fixture

## Change

World events previously deep-copied the entire world and league before applying an effect. That included every roster and the accumulated match history. The league copy duplicated roster data again.

Each of the 13 impact event handlers now explicitly requests a writable copy of its selected club, or of its selected fixture for a postponement. Copying a club includes nested player and finance data because injury, loyalty and finance helpers mutate those fields. The outer world and roster map are shallow copies; unaffected clubs, fixtures and match histories retain their references. Events without a target create no copies.

The main league and loaded background leagues receive the updated club reference. Background leagues previously retained stale roster copies after an impact event. Detached or partial roster maps are updated without expanding their membership; leagues without loaded rosters remain untouched.

Event probabilities, selection, random-number consumption, text and effect calculations are unchanged.

## Validation

- 624 comparisons against `a671fcba`: all 13 impact templates, 12 seeds, normal careers, unemployed managers, empty rosters and legacy finances. World/main-league values, article text and inbox effects match. Generated message IDs/timestamps are normalized, and inbox links to the generated article are checked separately.
- Frozen input careers catch accidental mutation, including nested injury and finance data. Checks also verify that only the selected club/fixture is copied and history is shared.
- Additional checks cover missing targets, repeated edits, detached/partial background rosters and unloaded leagues.
- Existing event/news suite: 15 checks passed, including same-day Ultiworld idempotence and fixture postponement constraints.
- ESLint passed for both changed production modules. Production build passed (existing large-bundle warning).

Commands:

```text
node --import ./scripts/register-world-tests.mjs scripts/test-ultiworld-copying.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-ultiworld-copying.mjs --bench
node scripts/run-events-news.mjs
```

## Isolated performance measurement

Synthetic snapshot: 604 clubs with 23 players each, 9,502 fixtures, 2,000 match records with 46 box-score rows each, 38 leagues. Node v24.19.0. Three paired samples per event after warmup, alternating execution order. Both implementations receive the same snapshot and random seed. Raw samples are in `results.json`.

For a mix containing one execution of every impact template (sum of per-template mean times):

| | Previous | Updated |
|---|---:|---:|
| 13-event mix | 2,220.54 ms | 40.96 ms |
| Mean per event | 170.81 ms | 3.15 ms |

**54.2 times faster for this isolated event mix (98.2% less time).** Garbage collection and runtime noise remain included. This is a synthetic handler benchmark, not a replay of the previous five-season career and not a measured speedup for the entire game. The previous five-season run attributed 42.4% of daily simulation time to all of Ultiworld; that whole-run percentage must be remeasured separately.
