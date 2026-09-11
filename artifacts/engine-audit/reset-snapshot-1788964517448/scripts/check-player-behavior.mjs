import assert from 'node:assert/strict'
import { normalizePlayerSkills, PLAYER_STAT_CATEGORIES, getSubStat, SKILLS_GEN_VERSION } from '../src/models/playerStats.js'
import { DETAILED_ATTRIBUTES } from '../src/models/detailedAttributes.js'
import { maxSpeedMps, standingReachM, jumpHeightM, executeThrowShape, subStat, decisionNoiseAmplitude } from '../src/matchEngine/ai/statFormulas.js'
import { integrateAgentMotion } from '../src/matchEngine/ai/playerMovement.js'
import { routeConflict } from '../src/matchEngine/ai/routeAwareness.js'
import { resolveThrow } from '../src/matchEngine/resolution.js'
import { resolveSeparation } from '../src/matchEngine/separation.js'
import { createRng } from '../src/matchEngine/rng.js'
import { createDiscTrajectory, sampleDiscTrajectory, sampleContinuedDisc } from '../src/matchEngine/ai/discTrajectory.js'
import { discAirAcceleration } from '../src/matchEngine/ai/discAerodynamics.js'
import { normalizeWind } from '../src/matchEngine/wind.js'
import { scoreThrowShape } from '../src/matchEngine/ai/throwShape.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

const original = structuredClone(demoHomeTeam.players[0].skills)
for (const [cat, keys] of Object.entries(DETAILED_ATTRIBUTES)) for (const key of Object.keys(keys)) delete original[cat]?.[key]
const saved = JSON.stringify(original), normalized = normalizePlayerSkills(original)
assert.equal(JSON.stringify(original), saved)
assert.equal(Object.values(PLAYER_STAT_CATEGORIES).flat().length, 33)
assert.equal(SKILLS_GEN_VERSION, 6, 'Migracja nie powinna przelosowywać istniejących profili')
for (const [category, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) for (const key of keys) {
  assert.ok(Number.isFinite(normalized[category][key]))
  if (Number.isFinite(original[category]?.[key])) assert.equal(normalized[category][key], original[category][key])
}
assert.deepEqual(normalizePlayerSkills(JSON.parse(JSON.stringify(normalized))), normalized)
assert.ok(Number.isFinite(getSubStat({ throwing: { backhand: NaN } }, 'throwing', 'backhand')))
assert.ok(Number.isFinite(getSubStat({ throwing: { backhand: 80 } }, 'throwing', 'forehand')))
const make = (cat, key, value) => {
  const player = { ...structuredClone(demoHomeTeam.players[0]), skills: structuredClone(normalized), currentStamina: 100, morale: 72, traits: [] }
  player.skills[cat][key] = value
  return player
}
const slow = make('physical', 'acceleration', 70), quick = make('physical', 'acceleration', 95)
const move = p => integrateAgentMotion({ x: 0, y: 0, vx: 0, vy: 0, player: p }, 10, 0, maxSpeedMps(p), 0.02, true, 'offense')
assert.ok(move(quick).vx > move(slow).vx)
assert.equal(maxSpeedMps(quick), maxSpeedMps(slow))
const diagonal = integrateAgentMotion({ x: 0, y: 0, vx: 0, vy: 0, player: quick },
  10, 10, maxSpeedMps(quick), 0.02, true, 'offense')
assert.ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - move(quick).vx) < 1e-10,
  'Przyspieszenie nie może zależeć od obrotu osi boiska')
const jumper = make('physical', 'jump', 95), lowJump = make('physical', 'jump', 70)
assert.ok(jumpHeightM(jumper) > jumpHeightM(lowJump))
assert.equal(standingReachM(jumper), standingReachM(lowJump))
assert.equal(standingReachM({ ...jumper, body: { standingReachCm: 238 } }), 2.38)
const lowMorale = { ...quick, morale: 25 }, highMorale = { ...quick, morale: 99 }
assert.equal(maxSpeedMps(lowMorale), maxSpeedMps(highMorale))
assert.ok(subStat(highMorale, 'mental', 'composure') > subStat(lowMorale, 'mental', 'composure'))
assert.ok(maxSpeedMps({ ...quick, currentStamina: 10 }) < maxSpeedMps(quick))
assert.equal(maxSpeedMps(make('defensive', 'positioning', 70)), maxSpeedMps(make('defensive', 'positioning', 95)))
assert.ok(decisionNoiseAmplitude(make('mental', 'decisionMaking', 95), 7) < decisionNoiseAmplitude(make('mental', 'decisionMaking', 65), 7))
const execute = p => executeThrowShape(p, { arc: 'over', curve: 'reverse', loftStat: 80, rng: createRng(31) })
assert.ok(Math.abs(execute(make('throwing', 'releaseControl', 95)).curveError) < Math.abs(execute(make('throwing', 'releaseControl', 60)).curveError))
const resolve = (p, wind = { speedMph: 20, directionDeg: 180 }, distance = 45) => resolveThrow({
  thrower: p, receiver: demoHomeTeam.players[1], defender: demoAwayTeam.players[0], rng: createRng(51),
  throwType: 'huck', separation: { outcome: 'open' }, stallCount: 2, throwDistanceM: distance,
  throwDx: distance, throwDy: 0, wind })
assert.ok(resolve(make('throwing', 'windControl', 95)).throwScore >= resolve(make('throwing', 'windControl', 60)).throwScore)
assert.ok(resolve(make('throwing', 'power', 95), null, 65).throwScore > resolve(make('throwing', 'power', 60), null, 65).throwScore)
const sep = receiver => resolveSeparation({ receiver, defender: demoAwayTeam.players[0], rng: createRng(19) })
assert.notDeepEqual(sep(make('offensive', 'cutTiming', 70)), sep(make('offensive', 'cutTiming', 95)))
assert.ok(routeConflict({ id: 1, x: 0, y: 0 }, { x: 10, y: 0 }, 5,
  [{ id: 2, x: 5, y: -5, vx: 0, vy: 5 }]) > 0)
assert.equal(routeConflict({ id: 1, x: 0, y: 0 }, { x: 10, y: 0 }, 5,
  [{ id: 2, x: 5, y: 10, vx: 0, vy: 5 }]), 0)
assert.equal(normalizeWind({ speedMph: 0, speedMps: 12 }).speedMps, 0)
const head = discAirAcceleration({ x: 10, y: 0, z: 0 }, { x: -5, y: 0 })
const tail = discAirAcceleration({ x: 10, y: 0, z: 0 }, { x: 5, y: 0 })
assert.ok(head.x < tail.x && head.z > tail.z)
// Better wind reading must move the predicted arrival toward the receiver,
// independently of the random accuracy roll.
for (const directionDeg of [0, 90, 180, 270]) {
  const ctx = { fromX: 0, fromY: 0, toX: 35, toY: 5, perpX: 0, perpY: 1,
    basePeakM: 4, baseFlightMs: 3000, baseAmplitudeM: 1, releaseHeightM: 1.1,
    deliveryHeightM: 1.2, loftStat: 80, wind: { speedMph: 20, directionDeg } }
  const miss = windControl => {
    const { plan } = scoreThrowShape({ arc: 'normal', curve: 'straight' }, { ...ctx, windControl })
    const end = sampleDiscTrajectory(plan, plan.totalMs)
    return Math.hypot(end.x - ctx.toX, end.y - ctx.toY)
  }
  assert.ok(miss(95) < miss(60), `Kompensacja wiatru: ${directionDeg}`)
}
for (const speedMph of [0, 3, 10, 20, 28]) for (const directionDeg of [0, 90, 180, 270]) {
  const plan = createDiscTrajectory({ fromX: 0, fromY: 0, toX: 35, toY: 5, totalFlightMs: 3000,
    startHeightM: 1.1, peakHeightM: 4, endHeightM: 1.2, wind: { speedMph, directionDeg } })
  const end = sampleDiscTrajectory(plan, 3000), after = sampleContinuedDisc(plan, 3020)
  assert.ok(Math.hypot(after.x - end.x, after.y - end.y, after.z - end.z) < 1)
  for (let ms = 0; ms <= 15000; ms += 20) {
    const sample = sampleContinuedDisc(plan, ms)
    assert.ok([sample.x, sample.y, sample.z].every(Number.isFinite) && sample.z >= 0)
  }
  assert.equal(sampleContinuedDisc(plan, 15000).z, 0)
}
console.log('OK: 33 atrybuty, migracja, zapis, fizyka/morale, przyspieszenie, decyzje, wykonanie, wiatr i 20 torów do ziemi')
