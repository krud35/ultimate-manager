import { createCutterAgent, tickCutterBrain, CUTTER_STATE } from '../src/matchEngine/ai/cutterBrain.js'
import assert from 'node:assert/strict'
import { TRAIT_DEFS, TRAITS_GEN_VERSION, getTraitMods, ensurePlayerTraits } from '../src/models/playerTraits.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { executeThrowShape, decisionNoiseAmplitude, maxSpeedMps } from '../src/matchEngine/ai/statFormulas.js'
import { createRng } from '../src/matchEngine/rng.js'
const make = traits => ({ ...structuredClone(demoHomeTeam.players[0]), traits, traitsGen: TRAITS_GEN_VERSION })
const base = make([])
assert.equal(getTraitMods(make(['layout_machine'])).injuryChanceMult, getTraitMods(base).injuryChanceMult)
assert.equal(getTraitMods(make(['force_happy'])).badDecisionMult, getTraitMods(base).badDecisionMult)
const pair = make(['good_insides', 'good_arounds']); ensurePlayerTraits(pair)
assert.deepEqual(pair.traits, ['good_insides', 'good_arounds'])
assert.equal(TRAIT_DEFS.thinks_fast.kind, 'personality')
assert.equal(decisionNoiseAmplitude(make(['thinks_fast']), 6), decisionNoiseAmplitude(base, 6))
for (const id of ['long_cuts','quick_cuts','thinks_fast']) assert.equal(maxSpeedMps(make([id])), maxSpeedMps(base))
for (const technique of ['backhand','forehand','hammer']) for (const curve of ['reverse','natural','straight']) {
 const run = p => executeThrowShape(p, { technique, curve, loftStat: 75, rng: createRng(27) })
 const standard=run(base)
 for (const id of ['good_insides','good_arounds']) {
  const result=run(make([id]))
  const matches=technique!=='hammer' && curve===(id==='good_insides'?'reverse':'natural')
  assert.equal(result.executionError, standard.executionError, 'No unrelated arc bonus')
  if(matches) assert(Math.abs(result.curveError)<Math.abs(standard.curveError))
  else assert.deepEqual(result, standard)
 }
}
console.log('Style specialties: compatible inside/around, selective execution bonus, no extra injury/decision penalty, no speed/intelligence bonus passed')

// Same deep cut, same situation/seed: quick cuts turn back while long cuts commit.
const cut = trait => {
 const agent = { ...createCutterAgent(make([trait]), 45, 18), state: CUTTER_STATE.ACTIVE_CUT,
  stateMs: 1900, cutReviewMs: 0, cutKind: 'deep', cutScore: -100, targetX: 75, targetY: 18 }
 return tickCutterBrain(agent, { dtSec: 0.04, disc: { x: 30, y: 18 }, throwerPos: { x: 30, y: 18 },
  possessionTeam: 'home', forceSide: 'force_forehand', situation: { separation: 8, throwWindowScore: 80 },
  rng: createRng(41), teammates: [], defenders: [], elapsedMs: 1900 })
}
assert.equal(cut('long_cuts').cutKind, 'deep')
assert.equal(cut('quick_cuts').cutKind, 'in')
assert(cut('long_cuts').targetX > cut('quick_cuts').targetX)
console.log('Actual cutter state transition: long cuts continue out; quick cuts return in sooner')
