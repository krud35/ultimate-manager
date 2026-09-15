# Focused domestic simulation

New domestic careers use one main country/league system and an unlimited number of additional active systems, including France. Selected depth includes all higher tiers; regional groups share one depth. Existing legacy careers retain their previous configuration.

By default, all remaining leagues exist as background competitions with persistent clubs, players, schedules, standings and promotion/relegation. Background clubs do not offer transfers or manager appointments. Internally their team `simulationMode` remains `off` for existing business guards, while their competition mode is `background`.

AI-only domestic matches use deterministic simplified results with player statistics and workload. Background players retain daily recovery and injury updates, with the expensive development pass run weekly. Active clubs keep normal training and development. Player matches and international club matches use the detailed engine.

Background cup participants receive detailed training and domestic match simulation in the seven days before pending international fixtures. This does not unlock transfers or reset their roster or fatigue. There is no temporary-attention badge in the interface. National-team simulation remains unchanged.

Background simulation can be disabled entirely. Inactive leagues then have no domestic fixtures, tables or daily development. Their club/player identities remain available for national teams, international cups and future activation. International participation still receives temporary attention.

Additional active systems, depths and the background toggle can be scheduled in the domestic leagues view for the next season. Taking another active club makes its system the main system. Promotion/relegation expands active depth when needed to keep the player's club active.

The creator displays Game speed: fast (score below 400), medium (below 900), or low, recommending at least medium. The estimate is comparative, not a measured device benchmark. Retaining all player identities means this primarily reduces ongoing simulation work rather than database size.

Validation: `node scripts/test-focused-world.mjs`, `node scripts/test-career-ui.mjs`, and `node scripts/test-country-catalog.mjs`.
