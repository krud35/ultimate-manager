import assert from 'node:assert/strict'
import { selectDiscIntercept } from '../src/matchEngine/ai/discIntercept.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { tickDefenderBrain } from '../src/matchEngine/ai/defenderBrain.js'
import { BODY_TRAFFIC_CALIBRATION } from '../src/matchEngine/ai/bodyTraffic.js'

const player = demoHomeTeam.players[0]
const agent = { id: 1, player, x: 35, y: 18, vx: 0, vy: 0 }
const params = { agent, player, role: 'offense', speed: 7, elapsedMs: 0, totalMs: 4000,
  sample: () => ({ x: 40, y: 18, z: 1.1 }) }
const open = selectDiscIntercept(params)
const blocked = selectDiscIntercept({ ...params, blockers: [{ id: 2, player, x: 37.5, y: 18 }] })
assert.ok(open.reachable && blocked.reachable)
assert.ok(blocked.detourSec > 0 && blocked.atMs > open.atMs)
assert.deepEqual(selectDiscIntercept({ ...params, blockers: [{ id: 2, x: 37.5, y: 25 }] }), open)
const occupied = selectDiscIntercept({ ...params, blockers: [{ id: 2, player, x: 40, y: 18 }] })
assert.ok(occupied.reachable)
assert.ok(Math.hypot(occupied.x - 40, occupied.y - 18) >= 0.5)
assert.ok(occupied.support.reachRemaining < open.support.reachRemaining)
const rotate = p => ({ ...p, x: 50 - (p.y - 18), y: 18 + (p.x - 35), vx: -(p.vy ?? 0), vy: p.vx ?? 0 })
const turned = selectDiscIntercept({ ...params, agent: rotate(agent), sample: () => rotate(params.sample()),
  blockers: [rotate({ id: 2, player, x: 37.5, y: 18 })] })
assert.equal(turned.atMs, blocked.atMs)
assert.ok(Math.abs(turned.detourSec - blocked.detourSec) < 1e-9)

// Off-ball defense uses the same avoidance request without moving obstacles.
const defender = { id: 3, player, x: 35, y: 18, vx: 2, vy: 0 }
const thrower = { id: 4, player, x: 38, y: 18, isThrower: true }
const obstacle = { id: 5, player, x: 35.6, y: 18 }
const ctx = { targetOffense: thrower, throwerAgent: thrower, disc: thrower, isMarkerOnThrower: true,
  dtSec: 0.02, forceSide: 'forehand', ms: 1000, trafficAgents: [defender, obstacle, thrower] }
const moved = tickDefenderBrain(defender, ctx)
BODY_TRAFFIC_CALIBRATION.offBall = false
const control = tickDefenderBrain(defender, ctx)
BODY_TRAFFIC_CALIBRATION.offBall = true
assert.ok(Math.hypot(moved.x - defender.x, moved.y - defender.y) < 0.15)
assert.notDeepEqual([moved.vx, moved.vy], [control.vx, control.vy])
assert.equal(obstacle.x, 35.6)
console.log('OK: detour time, occupied catch support, open route, rotation and off-ball defense')
