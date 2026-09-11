import assert from 'node:assert/strict'
import { tickFlightContestAgent, FLIGHT_APPROACH_CALIBRATION } from '../src/matchEngine/ai/flightKinematics.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'

const saved = FLIGHT_APPROACH_CALIBRATION.purposefulLayout
const player = { ...structuredClone(demoHomeTeam.players[0]), traits: [], currentStamina: 100 }
const agent = { id: player.id, player, x: 20, y: 18, vx: 3, vy: 0, z: 0, vz: 0 }
const disc = { x: 21.6, y: 18, z: 1, timeToDisc: 200 }
const step = (reachable, role = 'offense') => tickFlightContestAgent(agent,
  { x: 23, y: 18, reachable }, player, role, disc, { float: () => 0 })
try {
  FLIGHT_APPROACH_CALIBRATION.purposefulLayout = false
  assert.equal(step(true).diving, true, 'Reproduce a needless dive for a reachable low disc')
  FLIGHT_APPROACH_CALIBRATION.purposefulLayout = true
  const runner = step(true)
  assert.ok(!runner.diving && runner.z === 0, 'Keep running when a standing catch is reachable')
  assert.ok(runner.x > agent.x, 'Avoiding the dive must not stop the approach')
  assert.equal(step(false).diving, true, 'A desperate offensive layout remains available')
  assert.equal(step(true, 'defense').diving, true, 'Defender may attack the disc before the receiver')
} finally { FLIGHT_APPROACH_CALIBRATION.purposefulLayout = saved }
console.log('OK: reachable running catch, unnecessary dive reproduction, desperate layout and defensive attack')
