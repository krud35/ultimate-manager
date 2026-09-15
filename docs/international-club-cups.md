# International club competitions

The formats are game rules inspired by club ultimate and football, not official WFDF regulations.

- Europe: annual August qualifiers, September–December groups, February–May knockout. Every match is scheduled on a Wednesday; the domestic scheduler reserves rest around it.
- PAUCC and AOUCC: centralized June 15–30 events in ordinary years.
- WUCC: June 15–30 every four years (2026, 2030, ...). When enabled, WUCC replaces that year's PAUCC/AOUCC edition. Its participants qualify from domestic results and coefficients, without requiring a continental tournament that summer. If WUCC is disabled, the continental events continue normally.
- July 2–14 remains available for national teams. UFA does not use these cups.

European fields have up to 32 group entrants and overflow national champions have a qualifying path. Smaller fields play qualifiers down to a valid group size; under eight entrants use knockout. Other continental fields have up to 16 entrants, WUCC up to 32. Seeding uses club coefficients; country coefficients and domestic positions allocate additional places. WUCC gives every available continent, including Africa, a route. Off-mode leagues can supply persistent minimal representative teams without simulating their domestic league.

National champions and ordinary extra places come from each country's highest existing division. A lower-division winner does not qualify through league position. Domestic cup winners and the defending international champion have separate routes, including from lower divisions. Qualification snapshots preserve country, division, table position and cup winner before promotion/relegation, so a promoted team cannot inherit the previous top-division champion's qualification and a relegated cup winner keeps its earned place. Duplicate routes consume only one berth.

Group draws prefer different countries when possible, with four seeded pots. The top two advance. Europe plays six group games per club; centralized events play three. Knockout matches are single-leg. Tables use wins, goal difference, goals scored and initial seeding as final tiebreaker.

Each result is identified by its edition and fixture ID. Replaying results cannot duplicate prize money, history, coefficients or trophies. Coefficients retain each edition's club points and country average, and the visible ranking weights the latest five seasons. Qualification snapshots must be taken before resetting domestic standings.

Summer rosters register on the first match; Europe's roster can register again in February. Transfers after registration are excluded. If departures leave fewer than seven players, emergency replacements fill only the legal minimum. Both interactive and automatic simulation must call `prepareInternationalClubMatch` to enforce registration and account for travel. The match engine shares roster player objects with the world, so its normal stamina and workload wear applies once. Results add box-score statistics, prize money and match history without charging match wear again.

## Integration

1. After creation/rollover: `initializeInternationalClubCups(career)`.
2. Before replacing old domestic standings: `snapshotInternationalQualification(career)`.
3. All fixtures are injected into `career.league.fixtures`, marked `competition: 'international-club'` and `internationalCupId`. The generic day simulator must skip their automatic simulation.
4. Before each day's training/recovery: `advanceInternationalClubCups(career, date)`. Player matches remain pending unless `simulatePlayer: true` is passed.
5. Interactive setup: `prepareInternationalClubMatch(career, fixture)` gives registered `home` and `away` team wrappers referencing original players.
6. Results: the international branch in `applyMatchResultToLeague` routes to `recordInternationalClubCupResult`; domestic standings are untouched.
7. New knockout fixtures are injected immediately. The domestic scheduler must recheck conflicts as rounds appear.
8. `InternationalCupsView` takes `{career, lang, onTeamClick}` and displays groups, all rounds, rankings and trophy history.

Validation: `node scripts/test-international-club-cups.mjs` tests disabled modes, deterministic draws/save reload, player blocking, idempotent effects, small fields 2–35, a five-season cycle, normal result routing and actual match-engine workload.
