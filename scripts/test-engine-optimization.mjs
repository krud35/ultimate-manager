import assert from 'node:assert/strict'
import { createRng } from '../src/matchEngine/rng.js'
import * as optimized from '../src/matchEngine/ai/bodyTraffic.js'
import * as original from '../src/matchEngine/ai/bodyTraffic.js?engineBaseline'
import { selectDiscIntercept } from '../src/matchEngine/ai/discIntercept.js'
import { selectDiscIntercept as originalIntercept } from '../src/matchEngine/ai/discIntercept.js?engineBaseline'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'

const rng = createRng(92319)
const random = (a, b) => a + rng.float() * (b - a)
const player = structuredClone(demoHomeTeam.players[0])
let checks = 0
for (let i = 0; i < 3000; i++) {
  const agent = { id: 'runner', player, x: random(-1, 101), y: random(-1, 38), z: i % 17 ? 0 : 2,
    vx: random(-8, 8), vy: random(-8, 8), diving: i % 31 === 0 }
  const others = Array.from({ length: 14 }, (_, j) => ({ id: j === 0 ? agent.id : j,
    x: agent.x + random(-10, 10), y: agent.y + random(-10, 10), z: j % 5 ? 0 : 2,
    player: { body: { shoulderWidthCm: [28, 42, 65, null, 99][j % 5] } } }))
  const traffic = optimized.prepareBodyTraffic(agent, others)
  for (const target of [{ x: agent.x, y: agent.y }, { x: random(0, 100), y: random(0, 37) },
    { x: others[1].x, y: others[1].y }, { x: 100.01, y: -0.01 }]) {
    const speed = random(0, 9)
    for (const planning of [false, true]) {
      const expected = original.bodyAwareTarget(agent, target, others, speed, planning)
      assert.deepEqual(optimized.bodyAwareTarget(agent, target, others, speed, planning), expected)
      assert.deepEqual(optimized.bodyAwareTarget(agent, target, others, speed, planning, traffic), expected)
      checks += 2
    }
  }
}
// Strict contact boundaries, co-location, stable ordering of equally near bodies.
const agent = { id: 1, player, x: 20, y: 0.3, vx: 4, vy: 0 }
for (const gap of [0, 0.01, 0.0100000001, 0.54, 0.5400000001, 1.5]) {
  const others = [{ id: 2, x: 20 + gap, y: 0.3 }, { id: 3, x: 20 + gap, y: 0.3 }]
  const target = { x: 21, y: 0.3 }
  assert.deepEqual(optimized.bodyAwareTarget(agent, target, others, 4, true,
    optimized.prepareBodyTraffic(agent, others)), original.bodyAwareTarget(agent, target, others, 4, true))
}
for (const enabled of [false, true]) {
  optimized.BODY_TRAFFIC_CALIBRATION.enabled = original.BODY_TRAFFIC_CALIBRATION.enabled = enabled
  for (const role of ['offense', 'defense']) for (let i = 0; i < 60; i++) {
    const runner = { ...agent, x: random(10, 90), y: random(0, 37), vx: random(-5, 5), vy: random(-5, 5) }
    const x = random(5, 95), y = random(-1, 38)
    const options = { agent: runner, player, role, speed: random(3, 8), elapsedMs: 0, totalMs: 1600,
      sample: ms => ({ x: x + ms / 500, y, z: Math.max(0, 3 - ms / 500) }),
      blockers: [{ id: 2, x: x + 1, y }, { id: 3, x: x - 1, y: y + 0.2 }] }
    assert.deepEqual(selectDiscIntercept(options), originalIntercept(options))
  }
}
console.log(`PASS ${checks} exact steering comparisons, boundaries, and 240 intercept decisions`)
