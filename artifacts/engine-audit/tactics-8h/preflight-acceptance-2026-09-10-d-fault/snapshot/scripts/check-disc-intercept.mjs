import assert from 'node:assert/strict'
import { interceptTravelSec, selectDiscIntercept } from '../src/matchEngine/ai/discIntercept.js'
import { interceptForAgent } from '../src/matchEngine/ai/flightKinematics.js'
import { createDiscTrajectory } from '../src/matchEngine/ai/discTrajectory.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { plannedCatchSupport, groundedInBounds } from '../src/matchEngine/ai/catchRules.js'
import { integrateAgentMotion } from '../src/matchEngine/ai/playerMovement.js'

const player = demoHomeTeam.players[0]
// A predicted toe pose used to steer a two-footed runner out before contact.
const nearLine = { player, x: 46, y: 0.3, vx: 2, vy: 0, lastGroundInBounds: true }
const support = plannedCatchSupport(nearLine, { x: 45, y: 0.05 }, 0.5)
assert.ok(support.legal && groundedInBounds({ ...nearLine, ...support }))
assert.equal(support.toeInContact, null)
// Pacing is a requested velocity, never an instantaneous physical speed cap.
const braking = integrateAgentMotion({ player, x: 30, y: 18, vx: 5, vy: 0 }, 40, 18, 7, 0.02, true, 'offense', 0)
assert.ok(braking.vx > 3 && braking.vx < 5)
const point = { x: 10, y: 0 }
const toward = interceptTravelSec({ x: 0, y: 0, vx: 5, vy: 0 }, point, 7, 4)
const away = interceptTravelSec({ x: 0, y: 0, vx: -5, vy: 0 }, point, 7, 4)
assert.ok(away > toward)
assert.ok(interceptTravelSec({ x: 0, y: 0 }, point, 7, 2) > interceptTravelSec({ x: 0, y: 0 }, point, 7, 5))
const params = { agent: { id: player.id, x: 5, y: 0, vx: 0, vy: 0 }, player,
  role: 'offense', speed: 7, elapsedMs: 0, totalMs: 3000,
  sample: ms => ({ x: ms / 250, y: 0, z: 1.1 }) }
const target = selectDiscIntercept(params)
assert.ok(target.reachable && target.atMs < params.totalMs)
assert.ok(target.x < params.sample(params.totalMs).x)
const rotated = selectDiscIntercept({ ...params, agent: { ...params.agent, x: 0, y: 5 },
  sample: ms => ({ x: 0, y: ms / 250, z: 1.1 }) })
assert.equal(rotated.atMs, target.atMs)
assert.equal(rotated.y, target.x)
const tooHigh = selectDiscIntercept({ ...params, sample: ms => ({ ...params.sample(ms), z: 10 }) })
assert.equal(tooHigh.reachable, false)
const impossible = selectDiscIntercept({ ...params, speed: 1, sample: () => ({ x: 100, y: 0, z: 1 }) })
assert.equal(impossible.reachable, false)

const base = { fromX: 0, fromY: 0, toX: 12, toY: 0, totalFlightMs: 3000,
  startHeightM: 1, peakHeightM: 2, endHeightM: 1 }
const plan = createDiscTrajectory(base)
const makeFlight = toY => ({ totalFlightMs: 3000, elapsedMs: 0, plannedShape: { plan },
  trajectoryPlan: createDiscTrajectory({ ...base, toY }) })
const straight = makeFlight(0), missed = makeFlight(10)
const read = flight => interceptForAgent(flight, params.agent, player, 'offense', 7)
assert.deepEqual(read(straight), read(missed), 'Błąd rzutu znany już przy wypuszczeniu')
const initial = read(missed)
missed.elapsedMs = 60
assert.equal(read(missed), initial, 'Cel przeliczony przed następnym odczytem')
missed.elapsedMs = 80
assert.notEqual(read(missed), initial, 'Śledzony dysk powinien być odczytany ponownie po 80 ms')
straight.elapsedMs = 1600; missed.elapsedMs = 1600
assert.notEqual(read(straight).y, read(missed).y)
console.log('OK: czas dobiegu, przyspieszenie, nawrót, wcześniejszy przechwyt, obrót, zasięg i opóźniony odczyt')
