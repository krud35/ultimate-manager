import assert from 'node:assert/strict'
import fs from 'node:fs'
import { throwFatiguePenalty } from '../src/matchEngine/stamina.js'
import { makeDeflection, sampleDeflection } from '../src/matchEngine/ai/discDeflection.js'
import { createDiscTrajectory } from '../src/matchEngine/ai/discTrajectory.js'

let previous = Infinity
for (let energy = 0; energy <= 100; energy += 0.1) {
  const penalty = throwFatiguePenalty(energy)
  assert.ok(Number.isFinite(penalty) && penalty >= 0 && penalty <= 24)
  assert.ok(penalty <= previous + 1e-10)
  if (Number.isFinite(previous)) assert.ok(previous - penalty < 0.05)
  previous = penalty
}
assert.equal(throwFatiguePenalty(80), 0)
// A swat goes down, loses kinetic energy and remains live until grounding.
const velocity = { x: 8, y: 2, z: -1 }
const blocked = makeDeflection({ x: 30, y: 18, z: 1.5, envelope: 0.2 }, velocity, 500, true)
const start = blocked.samples[0]
assert.ok(start.vz < 0 && Math.hypot(start.vx, start.vy, start.vz) < Math.hypot(8, 2, -1))
const plan = createDiscTrajectory({ fromX: 20, fromY: 18, toX: 40, toY: 18,
  totalFlightMs: 1500, startHeightM: 1.1, peakHeightM: 2, endHeightM: 1.1 })
assert.equal(sampleDeflection(blocked, plan, 500).z, 1.5)
assert.equal(sampleDeflection(blocked, plan, 2500).z, 0)

const read = name => JSON.parse(fs.readFileSync(`artifacts/scenarios/${name}.json`))
const current = read('balance-accepted'), holdout = read('balance-accepted-validation')
const weakDefense = read('balance-defender60'), control = read('balance-control')
const summary = (d, c) => d.summaries.find(r => r.case === c && r.layer === 'execution')
const seeds = new Set(current.rows.map(r => r.seed))
assert.ok(holdout.rows.every(r => !seeds.has(r.seed)))
for (const d of [current, holdout]) {
  assert.equal(d.rows.length, 17 * 2 * d.n)
  assert.ok(summary(d, 'double_coverage').completed < summary(d, 'deep_open').completed)
  assert.ok(d.rows.filter(r => ['outside', 'toe_out'].includes(r.case)).every(r => !r.success))
  const intercepted = d.rows.filter(r => r.reason === 'interception')
  assert.ok(intercepted.length > 0)
  for (const r of intercepted) {
    assert.ok(!r.success && r.diagnosis.causeConfirmed)
    assert.ok([10, 11].includes(r.contact.playerId))
    if (r.landing) assert.ok(r.landing.ms >= r.contact.ms)
  }
}
assert.ok(summary(weakDefense, 'double_coverage').completed > summary(current, 'double_coverage').completed)
assert.ok(summary(current, 'fatigued_incut').completed > summary(control, 'fatigued_incut').completed)
const fatigueResults = [read('balance-energy0'), current, read('balance-energy40'), read('balance-energy60')]
for (let i = 1; i < fatigueResults.length; i++) {
  assert.ok(summary(fatigueResults[i], 'fatigued_incut').completed > summary(fatigueResults[i - 1], 'fatigued_incut').completed)
}
console.log('OK: ciągła krzywa zmęczenia, żywe zbicie w dół, przejęcia, poziom obrony, niezależne seedy, negatywne outy i monotoniczność scenariuszy')
