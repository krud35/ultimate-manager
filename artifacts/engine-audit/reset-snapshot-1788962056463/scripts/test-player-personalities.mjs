import assert from 'node:assert/strict'
import { PLAYER_PERSONALITIES, personalityTraitWeight } from '../src/models/playerPersonalities.js'
import { TRAIT_DEFS, rollTraitsForPlayer, personalityTypeForPlayer, ensurePlayerTraits } from '../src/models/playerTraits.js'
assert.equal(Object.keys(PLAYER_PERSONALITIES).length, 30)
for (const preferred of Object.values(PLAYER_PERSONALITIES)) {
 assert.equal(new Set(preferred).size, 3)
 preferred.forEach(id => assert.equal(TRAIT_DEFS[id].kind, 'personality'))
}
const counts = [0, 0, 0, 0], types = {}
for (let id = 1; id <= 12000; id++) {
 const player = { id }
 const traits = rollTraitsForPlayer(player)
 const mental = traits.filter(t => TRAIT_DEFS[t].kind === 'personality')
 const type = personalityTypeForPlayer(player)
 assert(PLAYER_PERSONALITIES[type].includes(mental[0]))
 assert([1, 2, 3].includes(mental.length))
 assert.equal(new Set(traits).size, traits.length)
 counts[mental.length]++
 types[type] = (types[type] ?? 0) + 1
 if (id < 100) {
  const changed = { id, archetype: 'deep_cutter', tier: 3, potential: 95, skills: { mental: { composure: 95 } } }
  assert.equal(personalityTypeForPlayer(changed), type)
  assert.deepEqual(rollTraitsForPlayer(changed).filter(t => TRAIT_DEFS[t].kind === 'personality'), mental)
  ensurePlayerTraits(player)
  assert.equal(player.personalityType, type)
  const saved = structuredClone(player)
  ensurePlayerTraits(player)
  assert.deepEqual(player, saved)
 }
}
counts.slice(1).forEach((count, i) => assert(Math.abs(count / 12000 - [0.25, 0.5, 0.25][i]) < 0.02))
assert.equal(Object.keys(types).length, 30)
Object.values(types).forEach(count => assert(Math.abs(count / 12000 - 1 / 30) < 0.012))
assert.equal(personalityTraitWeight('charismatic', ['shy'], []), 0.25)
assert(personalityTraitWeight('clutch', ['clutch'], ['composed']) < personalityTraitWeight('clutch', ['clutch'], []))
for (const traits of [[], ['workhorse'], ['shy', 'charismatic'], ['showman', 'anxious']]) {
 const old = { id: 3, traits: [...traits], traitsGen: 4 }
 ensurePlayerTraits(old)
 assert.deepEqual(old.traits, traits)
 assert.equal(old.personalityType, undefined)
}
const invalid = { traits: ['workhorse', 'lazy'] }
ensurePlayerTraits(invalid)
assert.deepEqual(invalid.traits, ['workhorse'])
console.log('Personality tests passed: 30 types; counts for 1/2/3 traits:', counts.slice(1))
