import assert from 'node:assert/strict'
import { normalizePlayerSkills, getSubStat, rollSubStatForPlayer, PLAYER_STAT_CATEGORIES } from '../src/models/playerStats.js'
import { ATTRIBUTE_ALIASES } from '../src/models/attributeAliases.js'
import { playerBody } from '../src/models/playerBody.js'
import { resolveThrow } from '../src/matchEngine/resolution.js'
import { createRng } from '../src/matchEngine/rng.js'
import { perceivePlayers, resetPlayerPerception } from '../src/matchEngine/ai/playerPerception.js'
import { continuationValue, coordinateSwitches } from '../src/matchEngine/ai/teamCoordination.js'
import { eligibleReceiver, groundedInBounds, advanceCatchLanding } from '../src/matchEngine/ai/catchRules.js'
import { firstDiscContact } from '../src/matchEngine/ai/discContact.js'
import { makeDeflection, sampleDeflection } from '../src/matchEngine/ai/discDeflection.js'
import { createDiscTrajectory } from '../src/matchEngine/ai/discTrajectory.js'
import { discAttitude } from '../src/matchEngine/ai/discAttitude.js'
import { tickFlightContestAgent } from '../src/matchEngine/ai/flightKinematics.js'
import { getTraitMods } from '../src/models/playerTraits.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

const p = { ...structuredClone(demoHomeTeam.players[0]), traits: [], morale: 72, currentStamina: 100 }
const old = structuredClone(p.skills)
for (const [category, aliases] of Object.entries(ATTRIBUTE_ALIASES)) for (const [legacy, canonical] of Object.entries(aliases)) {
  old[category][legacy] = 87; delete old[category][canonical]
}
const saved = JSON.stringify(old), migrated = normalizePlayerSkills(old)
assert.equal(Object.values(PLAYER_STAT_CATEGORIES).flat().length, 33)
assert.equal(JSON.stringify(old), saved)
for (const [cat, aliases] of Object.entries(ATTRIBUTE_ALIASES)) for (const [legacy, key] of Object.entries(aliases)) {
  assert.equal(migrated[cat][key], 87)
  assert.equal(getSubStat(old, cat, key), 87)
  assert.equal(getSubStat(migrated, cat, legacy), 87)
  assert.equal(rollSubStatForPlayer(42, cat, key), rollSubStatForPlayer(42, cat, legacy))
}
assert.deepEqual(normalizePlayerSkills(JSON.parse(JSON.stringify(migrated))), migrated)
const execute = (receiver, defender, marker = null, markerDistanceM = Infinity) => resolveThrow({
  thrower: p, receiver, defender, marker, markerDistanceM, executionOnly: true,
  throwType: 'standard', throwDistanceM: 16, throwDx: 16, throwDy: 0, stallCount: 3,
  separation: { outcome: 'open' }, rng: createRng(71), wind: null })
const receiver = structuredClone(demoHomeTeam.players[1]), defender = structuredClone(demoAwayTeam.players[0])
const base = execute(receiver, defender)
assert.deepEqual(execute({ ...receiver, currentStamina: 0 }, { ...defender, skills: {}, currentStamina: 0 }), base,
  'Wykonanie rzutu nie może zależeć od staminy odbiorcy ani odległego kryjącego')
assert.ok(execute(receiver, defender, defender, 0.6).defenseScore > execute(receiver, defender, defender, 10).defenseScore)
const observer = { id: p.id, player: p, x: 0, y: 0 }, target = { id: 'target', x: 10, y: 0, vx: 0, vy: 0 }
const focus = { x: 10, y: 0, lock: true }
assert.equal(perceivePlayers(observer, [target], [], 0, focus).length, 1)
const remembered = perceivePlayers(observer, [{ ...target, x: 20 }], [{ x: 5, y: 0 }], 250, focus)[0]
assert.equal(remembered.x, 10); assert.equal(remembered.observationAgeMs, 250)
assert.equal(perceivePlayers(observer, [target], [{ x: 5, y: 0 }], 3500, focus).length, 0)
resetPlayerPerception(p)
assert.equal(perceivePlayers(observer, [{ ...target, x: -10 }], [], 0, focus).length, 0)
const future = [{ id: 'next', x: 20, y: 12 }], point = { x: 10, y: 12 }
assert.ok(continuationValue(point, 'receiver', future, [], 1) > continuationValue(point, 'receiver', future, [{ x: 20, y: 12 }], 1))
const defs = [{ id: 1, x: 5, y: 10, player: { ...p, id: 1 } }, { id: 2, x: 7, y: 10, player: { ...p, id: 2 } }]
const attackers = [{ id: 3, x: 8, y: 10 }, { id: 4, x: 4, y: 10 }]
const assignments = new Map([[3, defs[0].player], [4, defs[1].player]])
assert.equal(coordinateSwitches(defs, attackers, assignments, 0), 1)
assert.equal(assignments.get(3).id, 2); assert.equal(assignments.get(4).id, 1)
assert.equal(coordinateSwitches(defs, attackers, assignments, 100), 0)
assert.equal(playerBody({ ...p, morale: 25 }).standingReachM, playerBody({ ...p, morale: 99 }).standingReachM)
assert.equal(groundedInBounds({ x: 10, y: 0.01, player: p }), false)
assert.equal(eligibleReceiver({ x: 10, y: 10, z: 1, lastGroundInBounds: false, player: p }), false)
const landing = advanceCatchLanding({ x: 99.99, y: 10, z: 0.01, vz: -1, vx: 5, vy: 0, player: p }, 0.02)
assert.equal(landing.z, 0); assert.equal(groundedInBounds(landing), true)
assert.ok(landing.toeInContact, 'Bliskie lądowanie może być legalne przez toe-in')
const outsideLanding = advanceCatchLanding({ x: 100.6, y: 10, z: 0.01, vz: -1, vx: 5, vy: 0, player: p }, 0.02)
assert.equal(groundedInBounds(outsideLanding), false, 'Toe-in nie może ratować zbyt odległego lądowania')
const standing = { x: 0, y: 0, z: 0 }, prone = { ...standing, diving: true, diveHeading: 0 }
const disc = { x: 1.7, y: 0, z: 0.5 }, reach = { horizontal: 1.14, standing: 2.2 }
assert.equal(firstDiscContact(disc, disc, standing, standing, reach), null)
assert.ok(firstDiscContact(disc, disc, prone, prone, reach))
const dive = tickFlightContestAgent({ ...standing, id: p.id, player: p, vx: 4, vy: 0 },
  { x: 1.8, y: 0, atMs: 100 }, p, 'offense', { x: 1.8, y: 0, z: 0.5, timeToDisc: 100 }, { float: () => 0 })
assert.ok(dive.diving && dive.x > 0 && dive.x < 0.2)
const plan = createDiscTrajectory({ fromX: 0, fromY: 0, toX: 20, toY: 0, totalFlightMs: 2000,
  startHeightM: 1, endHeightM: 1, peakHeightM: 2, amplitudeM: 1 })
const tip = makeDeflection({ x: 10, y: 0, z: 1 }, { x: 8, y: 0, z: -1 }, 500)
assert.equal(sampleDeflection(tip, plan, 500).x, 10)
assert.ok(sampleDeflection(tip, plan, 520).z > 0)
assert.equal(sampleDeflection(tip, plan, 12500).z, 0)
assert.ok(discAttitude(plan, 3000).spinRadSec < discAttitude(plan, 0).spinRadSec)
assert.notDeepEqual(discAttitude(plan, 3000).normal, discAttitude(plan, 0).normal)
for (const trait of ['huck_lover', 'dump_guy', 'safe_hands', 'creative_thrower', 'hammer_happy']) {
  const mods = getTraitMods({ traits: [trait] })
  for (const key of ['huckAccuracy', 'dumpAccuracy', 'ottAccuracy', 'standardAccuracy', 'huckBlockRisk', 'ottBlockRisk']) assert.equal(mods[key], 0)
}
console.log('OK: migracja nazw, niezależne wykonanie rzutu, presja marka, pole widzenia/pamięć, kontynuacja, switch, budowa ciała, lądowanie, layout, zbicie i spin')
