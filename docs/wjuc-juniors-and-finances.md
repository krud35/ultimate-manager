# WJUC juniors and club finances

## Junior population

`src/data/wjucJuniors.json` contains 392 players from the 18 included Open national teams at WJUC 2026. Israel's team is excluded from this import. Refresh with `node scripts/import-wjuc-juniors.mjs`.

Names, national team, jersey and tournament goals/assists/games come from the public source. Age (16–18 at introduction), skills and potential use the game's existing prospect model and are explicitly marked as generated. Tournament statistics are kept separately from career statistics. Netherlands and Sweden are now available in the youth scouting geography; their strength values are game balancing estimates.

World academy initialization prepares the regional pool before a scout is sent. Each career imports the WJUC identities once, including an idempotent migration for existing worlds. Existing registrations with matching names/IDs are skipped to avoid creating a second player. A persisted import marker prevents reintroducing signed, retired or departed players. Later cohorts remain procedurally generated. Scouting creates observation snapshots of existing players, never a fresh player for each discovery.

## Finances

Club → Finances contains the budget allocation control, operating costs, cash forecast, match settlement and recent cash ledger previously shown on the board. Board strategy, objectives, facilities and sponsor management remain on the board.

The player contract table includes senior and academy players plus incoming/outgoing loans. Search, squad filters and sorting by expiry/wage/name are available. Expand a row for signature date, remaining weeks, base wage commitments, loan dates/share, conditional bonuses and promises. Base wage totals exclude conditional bonuses and account for loan shares and return dates. Reading the contract overview does not create or change contracts.

## Checks

```powershell
node scripts/test-wjuc-juniors.mjs
node scripts/test-club-contract-overview.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-world-economy.mjs
node scripts/audit-local-league-data.mjs
npm run build
```

The local data audit records a snapshot in `docs/local-league-data-audit.json`. Data collection may continue in another task. New domestic datasets are present locally but are not yet wired into the new-career domestic league system.
