import assert from 'node:assert/strict'
import { bodyAwareTarget } from '../src/matchEngine/ai/bodyTraffic.js'
import { integrateAgentMotion } from '../src/matchEngine/ai/playerMovement.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'

const player = demoHomeTeam.players[0]
const a = { id: 1, player, x: 30, y: 18, vx: 3, vy: 0 }
const b = { id: 2, player, x: 32, y: 18, vx: 0, vy: 0 }
const target = { x: 32, y: 18, legal: true }
assert.deepEqual(bodyAwareTarget(a, target, [a], 3), { ...target, speed: 3 })
const occupied = bodyAwareTarget(a, target, [a, b], 3)
assert.ok(occupied.x < b.x - 0.42)
assert.equal(occupied.avoidedId, b.id)
assert.equal(a.x, 30, 'Steering must not move the body')
const step = integrateAgentMotion(a, occupied.x, occupied.y, 7, 0.02, true, 'offense', occupied.speed)
assert.ok(Math.hypot(step.x - a.x, step.y - a.y) <= 0.15)
let runner = { ...a }, minimumGap = Infinity
for (let i = 0; i < 150; i++) {
  const request = bodyAwareTarget(runner, target, [runner, b], 3)
  runner = { ...runner, ...integrateAgentMotion(runner, request.x, request.y, 7, 0.02, true, 'offense', request.speed) }
  minimumGap = Math.min(minimumGap, Math.hypot(runner.x - b.x, runner.y - b.y))
}
assert.ok(minimumGap >= 0.42, 'Approach passed through an occupied body')
assert.equal(runner.vx, 0)
const rotate = p => ({ ...p, x: 50 - (p.y - 18), y: 18 + (p.x - 30), vx: -(p.vy ?? 0), vy: p.vx ?? 0 })
const rotated = bodyAwareTarget(rotate(a), rotate(target), [rotate(a), rotate(b)], 3)
const expected = rotate(occupied)
assert.ok(Math.hypot(rotated.x - expected.x, rotated.y - expected.y) < 1e-9)
const far = { ...b, y: 25 }
assert.equal(bodyAwareTarget(a, target, [far], 3).avoidedId, undefined)
// A legal sideline target must not gain an out-of-bounds avoidance waypoint.
const sideline = bodyAwareTarget({ ...a, y: 0.3 }, { x: 35, y: 0.3 }, [{ ...b, x: 30.6, y: 0.4 }], 3)
assert.ok(sideline.y >= 0.146 - 1e-9)
console.log('OK: occupied target, unchanged open space, bounded movement, rotation and sideline detour')
