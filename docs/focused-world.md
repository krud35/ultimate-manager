# Focused domestic simulation

New domestic careers use one main country/league system and up to four additional active systems. France anywhere in the active selection reduces the additional limit to three. Selected depth includes all higher tiers; regional groups share one depth. Existing legacy careers retain their previous configuration.

All remaining leagues exist as background competitions with persistent clubs, players, schedules, standings and promotion/relegation. Background clubs do not offer transfers or manager appointments. Internally their team `simulationMode` remains `off` for existing business guards, while their competition mode is `background`.

AI-only domestic matches use deterministic simplified results with player statistics and workload. Background players retain daily recovery and injury updates, with the expensive development pass run weekly. Active clubs keep normal training and development. Player matches and international club matches use the detailed engine.

Background cup participants receive detailed training and domestic match simulation in the seven days before pending international fixtures. This does not unlock transfers or reset their roster or fatigue. There is no temporary-attention badge in the interface. National-team simulation remains unchanged.

Additional active systems and depths can be scheduled in the domestic leagues view for the next season. Taking another active club makes its system the main system. Promotion/relegation expands active depth when needed to keep the player's club active.

The creator's load estimate is comparative, not a measured speed benchmark. Retaining all player identities means this primarily reduces ongoing simulation work rather than database size.

Validation: `node scripts/test-focused-world.mjs`, `node scripts/test-career-ui.mjs`, and `node scripts/test-country-catalog.mjs`.
