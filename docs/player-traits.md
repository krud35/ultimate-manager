# Player traits

New players receive 1–3 personality traits (25% / 50% / 25%) and 1–6 playing styles (3–6 for explicit all-rounders), according to age. Overall
rating and skills do not affect the count or personality RNG. Optional `archetype`
IDs and their 2x style weights are defined in `src/models/traitDesign.js`. These
weights are used by the new UltiLeague archetype generator. Existing saves are not
assigned new archetypes. Unknown archetypes use uniform weights.

Thirty equally likely hidden personality types bias trait selection. The first trait comes
from the type’s three preferred traits; later draws use weights 4 / 1 / 0.25 for
preferred / neutral / unlikely traits. Overlapping effect groups multiply weight by
0.35. Direct conflicts remain forbidden. Type/count/style have separate RNG streams.
The type has no gameplay modifiers. Existing players are not assigned a type on load.

The profile displays individual style, personality and attribute-derived strengths separately.
The playing archetype and personality type are hidden.
Strength badges grant no modifiers. Speed, catching, timing, jumping and huck
ability no longer earn a second trait bonus for already high attributes.

## Migration (traitsGen 6)

Loading preserves existing personality. Version changes never reroll an existing
array, including an empty array. Only missing traits or explicit `force` generate.

Aliases: checkdown → dump_guy; glory_hunter → selfish; sky_baller → layout_machine;
man_d_specialist → shutdown; showboat → creative_thrower; vocal → leader.
Duplicate aliases collapse. Previous aliases remain supported.

Attribute traits removed from the active pool: track_star, quick, elite_huck,
glue_hands, vertical_threat, smart, good_timing, lockdown, field_general, big_man.
Most are displayed as derived strengths; big_man requires actual height data.
turnover_prone is removed because turnovers are an outcome, not an independent skill.
No missing slots are refilled during migration.

## Behavior

- give_and_go: temporary post-pass offer preference, with existing space/traffic guards.
- upline_seeker: reset-space scoring favors nearby upfield cells.
- swing_first: passing scores favor lateral switches.
- attack_turnover / settle_turnover: opposite preferences during the first two
  completed passes after a turnover; inactive after the pull.
- deny_deep / deny_under: opposite defensive shading, merged with coach instructions.
- layout_machine: more layout attempts and injury risk, no aerial success multiplier.
- composed / nervous: pressure component of decisions; no low-stall decision bonus.
- clutch: conditional on a score within two points and either team within two
  points of the match target; inactive in ordinary points.

The spatial simulator implements movement preferences. The fast simulator has no
upline/give-and-go movement trajectories; swing and transition preferences are
approximated through throw-type weights. This is not a replacement for later
multi-match balance calibration (stage 6).

## Checks

```
node --import ./scripts/register-world-tests.mjs scripts/test-player-traits.mjs
node --import ./scripts/register-world-tests.mjs scripts/test-roster-generation.mjs
node --import ./scripts/register-world-tests.mjs scripts/check-player-behavior.mjs
```

Tests cover deterministic generation, OVR-independent personality, archetype style
weights, alias migration without rerolls, removal of physical bonus stacking,
pressure/clutch context, new style preferences and spatial/fast point smoke tests.

## Conditional style weights

Attacks the disc high uses the weakest of jump, cutTiming and catching to weight
its generation (0.25 / 1 / 2 / 4 at thresholds 75 / 80 / 85). This intentionally
affects playing style only; personality still ignores skills. Full style categories
and effects are listed in playing-styles.md.

## Initial style generation (phase 1)

Configuration: src/models/playingStyleGeneration.js. Category selection uses role
weights, then archetype preferences and ability weights select a compatible trait
inside that category. Unknown archetypes use equal category weights and the regular
count distribution; missing age defaults to the 23–26 band (25). No archetype is
assigned by this fallback.

| Age | Regular count weights, 1 / 2 / 3 / 4 / 5 / 6 (%) | All-rounder (%) |
|---|---|---|
| ≤19 | 65 / 30 / 5 / 0 / 0 / 0 | 0 / 0 / 80 / 20 / 0 / 0 |
| 20–22 | 30 / 45 / 20 / 5 / 0 / 0 | 0 / 0 / 60 / 30 / 10 / 0 |
| 23–26 | 10 / 25 / 40 / 20 / 5 / 0 | 0 / 0 / 30 / 45 / 20 / 5 |
| 27–30 | 5 / 15 / 30 / 30 / 15 / 5 | 0 / 0 / 15 / 40 / 30 / 15 |
| ≥31 | 0 / 10 / 25 / 35 / 20 / 10 | 0 / 0 / 10 / 30 / 35 / 25 |

| Family | Thrower | Receiver | Offense | Defense |
|---|---:|---:|---:|---:|
| Handler | 55 | 10 | 25 | 10 |
| Cutter | 10 | 55 | 25 | 10 |
| Defender | 10 | 20 | 15 | 55 |
| All-rounder / unknown | 25 | 25 | 25 | 25 |

Weights are conditional on eligibility, not guaranteed final population shares.
The first specialist style uses its primary category. At least two categories
for 3+ styles; at most four from one category. All-rounders always draw from the
least populated available category: 1–1–1–0, 1–1–1–1, 2–1–1–1, 2–2–1–1.
Existing traits are never refilled or rerolled on load, including empty lists.
In-season acquisition, retention, loss and replacement now run from observed match
practice. See [playing-style-evidence.md](playing-style-evidence.md) for thresholds,
save behavior and the explicit simulation coverage limits.

Validation: node scripts/test-playing-style-generation.mjs
