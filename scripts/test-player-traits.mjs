import assert from 'node:assert/strict'
import { TRAIT_DEFS, TRAITS_GEN_VERSION, rollTraitsForPlayer, ensurePlayerTraits,
  getTraitMods, playerSkillBadges } from '../src/models/playerTraits.js'
import { ARCHETYPE_TRAIT_PREFERENCES } from '../src/models/traitDesign.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { maxSpeedMps, aerialContestChance, decisionNoiseAmplitude } from '../src/matchEngine/ai/statFormulas.js'
import { setPossessionPlayerMods, clearPointPlayerMods } from '../src/matchEngine/playerMods.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'
import { stylePassBonus, uplineSpaceBonus, giveAndGoOfferBonus, isClutchPoint } from '../src/matchEngine/ai/traitBehavior.js'
import { simulatePoint, simulatePointFast } from '../src/matchEngine/point.js'
import { createRng } from '../src/matchEngine/rng.js'

const make = traits => ({ ...structuredClone(demoHomeTeam.players[0]), traits, traitsGen: TRAITS_GEN_VERSION })
const kind = (traits, name) => traits.filter(id => TRAIT_DEFS[id].kind === name)
let basePreferred = 0, biasedPreferred = 0
for (let id = 1; id <= 3000; id++) {
  const base = rollTraitsForPlayer({ id, skills: {} })
  assert.equal(kind(base, 'personality').length, 2)
  assert([1, 2].includes(kind(base, 'style').length))
  assert.equal(new Set(base).size, base.length)
  const other = rollTraitsForPlayer({ id, archetype: 'deep_handler', skills: demoHomeTeam.players[0].skills })
  assert.deepEqual(kind(base, 'personality'), kind(other, 'personality'))
  assert.deepEqual(rollTraitsForPlayer({ id, skills: demoHomeTeam.players[0].skills }), base)
  const preferred = ARCHETYPE_TRAIT_PREFERENCES.deep_handler
  basePreferred += base.filter(t => preferred.includes(t)).length
  biasedPreferred += other.filter(t => preferred.includes(t)).length
}
assert(biasedPreferred > basePreferred * 1.4, 'Archetype favors style only')

const old = make(['loyal', 'sky_baller', 'layout_machine', 'glory_hunter', 'track_star'])
old.traitsGen = 3
getTraitMods(old) // warm cache before migration
ensurePlayerTraits(old)
assert.deepEqual(old.traits, ['loyal', 'layout_machine', 'selfish'])
assert.equal(getTraitMods(old).speedMult, 1)
const migrated = structuredClone(old)
ensurePlayerTraits(old)
assert.deepEqual(old, migrated)
const empty = make(['big_man', 'smart'])
empty.traitsGen = 3
ensurePlayerTraits(empty)
assert.deepEqual(empty.traits, [])
ensurePlayerTraits(empty)
assert.deepEqual(empty.traits, [])
for (const pair of [['content', 'ambitious'], ['curious', 'impatient'], ['relaxed', 'stoic'], ['wants_the_disc', 'disciplined']]) {
  const p = make(pair); ensurePlayerTraits(p); assert.deepEqual(p.traits, pair)
}
for (const pair of [['deny_deep', 'deny_under'], ['attack_turnover', 'settle_turnover'], ['coachable', 'uncoachable']]) {
  const p = make(pair); ensurePlayerTraits(p); assert.equal(p.traits.length, 1)
}

const neutral = make([])
assert.equal(maxSpeedMps(make(['track_star', 'quick', 'deep_threat'])), maxSpeedMps(neutral))
assert.equal(aerialContestChance(make(['big_man', 'glue_hands', 'layout_machine']), 1.5), aerialContestChance(neutral, 1.5))
assert(getTraitMods(make(['layout_machine'])).layoutAttemptMult > 1)
assert(Array.isArray(playerSkillBadges(neutral)))
const calm = make(['composed']), clutch = make(['clutch'])
assert.equal(decisionNoiseAmplitude(calm, 1), decisionNoiseAmplitude(neutral, 1))
assert(decisionNoiseAmplitude(calm, 8) < decisionNoiseAmplitude(neutral, 8))
assert.equal(decisionNoiseAmplitude(clutch, 8), decisionNoiseAmplitude(neutral, 8))
assert(!isClutchPoint(4, 4)); assert(!isClutchPoint(14, 3)); assert(isClutchPoint(13, 12))
setPossessionPlayerMods([clutch], null, [], null, { isClutchPoint: true })
assert(decisionNoiseAmplitude(clutch, 8) < decisionNoiseAmplitude(neutral, 8))
clearPointPlayerMods()
const attack = getTraitMods(make(['attack_turnover']))
const settle = getTraitMods(make(['settle_turnover']))
assert.equal(stylePassBonus(attack, { forward: 20 }), 0)
assert(stylePassBonus(attack, { forward: 20, afterTurnover: true }) > stylePassBonus(settle, { forward: 20, afterTurnover: true }))
assert(stylePassBonus(getTraitMods(make(['swing_first'])), { lateral: 15, forward: 0 }) > 0)
assert(uplineSpaceBonus(getTraitMods(make(['upline_seeker'])), 5, 3) > 0)
assert.equal(uplineSpaceBonus(getTraitMods(make(['upline_seeker'])), -5, 3), 0)
const go = getTraitMods(make(['give_and_go']))
assert(giveAndGoOfferBonus(go, 1, 1, 500) > 0)
assert.equal(giveAndGoOfferBonus(go, 1, 2, 500), 0)
assert.equal(giveAndGoOfferBonus(go, 1, 1, 3000), 0)
assert(mergeTraitAndCoachMods(make(['deny_deep']), null, 'defense').denyUnderBias < 0)
assert(mergeTraitAndCoachMods(make(['deny_under']), null, 'defense').denyUnderBias > 0)

// Real spatial and fast point simulation exercise context wiring, not just modifiers.
for (const simulate of [simulatePoint, simulatePointFast]) {
  const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
  const styles = ['give_and_go', 'upline_seeker', 'swing_first', 'attack_turnover', 'settle_turnover', 'deny_deep', 'deny_under']
  for (const team of [home, away]) team.players.forEach((p, i) => { p.traits = [styles[i % styles.length], 'clutch']; p.traitsGen = TRAITS_GEN_VERSION })
  const result = simulate({ homeTeam: home, awayTeam: away, pullTeam: 'away', pointIndex: 26,
    homeScore: 13, awayScore: 12, rng: createRng(91) })
  assert(['home', 'away'].includes(result.scoringTeam))
  assert(result.events.length > 0)
}
console.log(`Trait checks passed: ${Object.keys(TRAIT_DEFS).length} traits; archetype preference ${basePreferred} -> ${biasedPreferred}`)
