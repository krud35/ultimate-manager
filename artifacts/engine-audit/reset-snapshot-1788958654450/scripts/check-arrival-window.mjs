import assert from 'node:assert/strict'
import { arrivalWindowGap, observationUncertaintyM, ARRIVAL_CALIBRATION } from '../src/matchEngine/ai/arrivalMotion.js'
import { selectDiscIntercept, interceptTravelSec } from '../src/matchEngine/ai/discIntercept.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'

const player = { ...structuredClone(demoHomeTeam.players.find(p => p.id === 1025)), traits: [] }
const agent = { id: player.id, player, x: 55.92416030698856, y: 29.834752353830062,
  vx: 1.6605838663853207, vy: 5.364328715353202 }
const support = { x: 56.517201115665046, y: 29.613148591609512 }
assert.equal(interceptTravelSec(agent, support, 7, 8, 0.7), 0, 'Legacy estimate reproduces zero travel time')
const moving = arrivalWindowGap(agent, support, player, 'offense', 7, 0.18, 0.7)
const stopped = arrivalWindowGap({ ...agent, vx: 0, vy: 0 }, support, player, 'offense', 7, 0.18, 0.7)
assert.ok(moving > 0 && stopped <= 0, 'Running out of the catch window must differ from being stopped there')
const rotate = p => ({ ...p, x: 50 - (p.y - 25), y: 18 + (p.x - 55), vx: -(p.vy ?? 0), vy: p.vx ?? 0 })
assert.ok(Math.abs(arrivalWindowGap(rotate(agent), rotate(support), player, 'offense', 7, 0.18, 0.7) - moving) < 1e-8)
const immediate = { ...agent, x: 50, y: 18, vx: 3, vy: 0 }
const contact = selectDiscIntercept({ agent: immediate, player, role: 'offense', speed: 7,
  elapsedMs: 0, totalMs: 100, sample: () => ({ x: 50.2, y: 18, z: 1.1 }) })
assert.ok(contact.reachable && contact.atMs === 20, 'A moving player may catch without stopping')
const unknown = { vx: 0, vy: 2.22, observationAgeMs: 680 }
assert.equal(observationUncertaintyM({ ...unknown, observationAgeMs: 0 }, player), 0)
assert.ok(observationUncertaintyM(unknown, player) > observationUncertaintyM({ ...unknown, observationAgeMs: 200 }, player))
assert.equal(ARRIVAL_CALIBRATION.kinematics, true)
console.log(`OK: historical overshoot gap ${moving.toFixed(3)} m, stationary reachable, rotation, moving catch and observation age`)
