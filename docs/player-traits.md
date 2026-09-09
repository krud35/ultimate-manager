# Player traits

New players receive two personality traits and one or two playing styles. Overall
rating and skills do not affect the count or personality RNG. Optional `archetype`
IDs and their 2x style weights are defined in `src/models/traitDesign.js`. These
weights are used by the new UltiLeague archetype generator. Existing saves are not
assigned new archetypes. Unknown archetypes use uniform weights.

The profile displays style, personality and attribute-derived strengths separately.
Strength badges grant no modifiers. Speed, catching, timing, jumping and huck
ability no longer earn a second trait bonus for already high attributes.

## Migration (traitsGen 4)

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
