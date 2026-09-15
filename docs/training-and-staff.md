# Regular training and club staff

## Player workflow

Training now includes a repeating weekly plan, two daily sessions and an optional additional session. Choose balanced, preseason, congested, tournament, youth or recovery. Override a dated slot, assign a group, or choose a template for a future calendar week. Match days cannot contain club sessions. Automatic adaptation schedules light preparation before games and recovery after games. Post-match recovery becomes a top-up scrimmage for players with less than 30% participation; exhausted or injured players remain on recovery.

Individual rules support rest, reduced, normal and extra intensity, automatic rest below a chosen freshness threshold, U21 workloads and a three-day restricted return after injury. Groups include handlers, cutters, O-line, D-line and U21. The individual focus guides session growth; the additional individual session consumes its own slot and workload.

The training screen shows freshness, accumulated fatigue, rhythm, seven-day workload, a qualitative overload indicator and a forecast. Forecasts are estimates on cloned data, capped at 28 days, with assumed match load; they do not predict future injuries. Session reports remain in Training; regular plans generate a weekly inbox summary and immediate injury reports.

Club plan and finances includes named staff, three role skills, specialties, weekly wages and dated contracts. Four legacy roles remain; assistant coach and analyst begin vacant. The monthly recruitment market offers three price/skill tiers and checks club reputation and available cash. Hiring charges four wages plus up to eight weeks of the previous employee's severance. Renewals keep the current wage. AI uses the same recruitment API for upgrades, renews affordable contracts and can hire an assistant. Contract expiry and 30-day warnings reach the user's inbox.

Delegating the plan requires an employed assistant. It selects a lighter schedule for congested weeks and high average fatigue. Coaches and analysts improve relevant session quality, with a capped bonus; the physio influences recovery. The director provides a squad-needs review instead of a generic training bonus.

## State and integration

- `playerWorkload.js`: one shared load ledger for training and matches. `developmentFatigue` retains accumulated fatigue; `matchStamina` retains physical freshness; `matchSharpness` is rhythm. Live point energy remains separate.
- `addPlayerLoad` charges freshness and accumulated fatigue immediately. `recoverPlayerDay` runs once per date, pays daily recovery after actual load, and retains 35 days of history. Repeated heavy days increase accumulated cost. Video has negligible load; recovery adds a bounded recovery bonus.
- `applyPostMatchStaminaWear` registers actual points played through the same ledger. Unused substitutes receive no match load. Low rhythm increases decision noise in the existing per-point modifier registry, independently of physical energy.
- `trainingSchedule.js`: pure date resolution, match adaptation, group eligibility, forecasts and editable plans. League and cup fixtures across competitions are included. National matches run before club training and recovery; players with match load are excused from active club sessions that day.
- `teamTraining.js`: executes each club/date once, uses identical individual rules for AI and user teams and keeps existing growth/injury systems. Sync and async range helpers interleave sessions and daily development, rather than processing all sessions before all recovery.
- `clubStaff.js`: staff profiles and contracts. Numeric `team.staff` role levels remain compatibility fields for the existing academy/scouting/medical hooks. `weeklyClubOperatingCost` includes actual staff payroll.
- The two new UI components use existing `ufa-*` theme tokens. Integration in `TrainingView`, `ClubManagementPanel` and `CalendarView` preserves the concurrent UI redesign.

## Existing careers

Staff management is available under **Club → Club staff**, separately from the board's strategy, finances, facilities and sponsors. Recruitment and contracts use the career's current date.

Staff names use the four WMUCC 2026 Grand Master / Great Grand Master Open and Women divisions (46 teams, 1,045 roster entries), supplemented by the existing country dictionaries. Source rosters and provenance are in `src/data/staffNameSources.json`; refresh with `node scripts/import-wmucc-staff-names.mjs`. Only names and source-team context are imported. Names are recombined for fictional staff; generated roles, ages and abilities are not claims about source players.

Seeded independent name draws replace the old 64-combination dictionary. Country aliases merge equivalent pools, and small national dictionaries have a reduced selection share to limit repetition. Current staff and individual market batches avoid internal duplicate names; this is not a global uniqueness registry. Legacy generated names are upgraded once while preserving IDs, wages, contracts and abilities. Names remain stable after JSON save/load. Validate using `node scripts/test-staff-names.mjs`.

Migration is lazy and idempotent. Existing nonempty weekly/one-off plans remain active until a repeating template is selected; activating the new planner replaces their execution without deleting the old plan data or stacking both systems. Empty plans start on balanced. Existing staff levels become named people at the same wage, with contracts ending in July of the following season. Existing fatigue/freshness are retained and rhythm starts at the neutral value 65.

Daily and session processing markers persist through JSON saves. Editing a processed day cannot execute it again. Training familiarity retains fractional gains; weekly maintenance also retains fractional decay.

## Validation

Run with Node's repository module-resolution loader:

```powershell
node --import ./scripts/register-world-tests.mjs scripts/test-training-system.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-playing-development.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-world-economy.mjs
npm run build
```

The dedicated suite covers daily/range/async equivalence, save/replay protection, match rescheduling and cups, return from injury, groups, video/recovery, staff costs/contracts, forecast isolation, rhythm effects and a 26-week real session schedule with registered weekly match participation. The season workload test uses prescribed participation rather than simulating full matches; it is a balancing check, not an end-to-end league outcome claim.

`artifacts/training-preview.html` is an isolated Vite development harness for manual UI checks. It renders the actual Training and Club Management components with generated sample data and writes no career save.
