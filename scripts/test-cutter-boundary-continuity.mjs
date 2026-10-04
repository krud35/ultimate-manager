import assert from 'node:assert/strict'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { createCutterAgent, tickCutterBrain, CUTTER_STATE } from '../src/matchEngine/ai/cutterBrain.js'
import { maxSpeedMps } from '../src/matchEngine/ai/statFormulas.js'
import { BODY_TRAFFIC_CALIBRATION } from '../src/matchEngine/ai/bodyTraffic.js'
import { formationStructuralTarget } from '../src/matchEngine/ai/tacticsBehavior.js'
import { createRng } from '../src/matchEngine/rng.js'

const player = structuredClone(demoHomeTeam.players[3])
player.traits = []
player.currentStamina = 100
player.skills.offensive.offensiveSystemsKnowledge = 100 // deterministic formation slot
const speedLimit = maxSpeedMps(player)
const ctx = {
  dtSec: .02, disc: { x: 40, y: 18.5 }, throwerPos: { x: 40, y: 18.5 },
  possessionTeam: 'home', forceSide: 'force_forehand', stackIndex: 4,
  attackStyle: 'vertical_stack', activeCutters: 2, maxCutters: 2,
  situation: { separation: 0, throwWindowScore: 0, cloggingLevel: 0, inThrowLane: false },
  rng: createRng(61039), teammates: [], defenders: [],
}
const legalTarget = (agent, label) => {
  assert.ok(agent.targetX >= .5 && agent.targetX <= 99.5, `${label}: target X ${agent.targetX}`)
  assert.ok(agent.targetY >= .5 && agent.targetY <= 36.5, `${label}: target Y ${agent.targetY}`)
}
const outside = p => p.x < .5 || p.x > 99.5 || p.y < .5 || p.y > 36.5
const move = (agent, context, label) => {
  const before = { x: agent.x, y: agent.y }
  const next = tickCutterBrain(agent, context)
  const displacement = Math.hypot(next.x - before.x, next.y - before.y)
  assert.ok(displacement <= speedLimit * context.dtSec + 1e-8,
    `${label}: displacement ${displacement} exceeds ${speedLimit * context.dtSec}`)
  assert.ok(Math.hypot(next.vx, next.vy) <= speedLimit + 1e-8, `${label}: speed bound`)
  assert.ok([next.x, next.y, next.vx, next.vy].every(Number.isFinite), `${label}: finite motion`)
  legalTarget(next, label)
  return next
}
const agentAt = (point, slot = { x: 50, y: 18.5 }) => ({
  ...createCutterAgent(player, point.x, point.y), ...point,
  state: CUTTER_STATE.WAITING, isActive: false, subRole: 'continuation_cutter',
  targetX: slot.x, targetY: slot.y, structureSlot: slot, structureFlow: false,
})

// Positions/velocities from the three independently replayed baseline alarms.
const alarmPositions = [
  { x: 69.66954713266782, y: -1.5109031729774778, vx: -1.0600844782697703, vy: 2.1939326909333894 },
  { x: 102.57887275862436, y: 13.74547855086488, vx: -2.3349164300313685, vy: .6589681403933244 },
  { x: 22.561023170502235, y: -1.4692122914335946, vx: -.45312672158904926, vy: 3.4023225695586876 },
]
const edges = [
  { x: -2, y: 18.5, vx: 3, vy: 0 }, { x: 102, y: 18.5, vx: -3, vy: 0 },
  { x: 50, y: -2, vx: 0, vy: 3 }, { x: 50, y: 39, vx: 0, vy: -3 },
  { x: -2, y: -2, vx: 2, vy: 2 }, { x: 102, y: 39, vx: -2, vy: -2 },
]
let activationCases = 0
for (const dtSec of [.02, .1]) for (const point of [...alarmPositions, ...edges]) {
  let agent = agentAt(point)
  const context = { ...ctx, dtSec, rng: createRng(61039) }
  agent = move(agent, context, 'inactive outside')
  assert.ok(outside(agent), 'the first movement step must not snap the body onto the field')
  agent = move({ ...agent, isActive: true }, context, 'activation outside')
  assert.ok(outside(agent), 'activation must preserve the remaining physical return distance')
  for (let i = 0; i < Math.ceil(12 / dtSec) && outside(agent); i++) {
    agent = move(agent, context, `return ${i}`)
  }
  assert.ok(!outside(agent), 'player eventually runs back into the field')
  activationCases++
}
console.log(`PASS ${activationCases} continuous activations/returns, including all four edges and three alarm positions`)

// Just outside the line, but less than the old 0.6 m inactive / 1.5 m active
// stopping distances from the formation slot: neither branch may wait outside.
const nearEdge = [
  { point: { x: -.01, y: 18.5 }, disc: { x: 9.5, y: 18.5 }, stackIndex: 4 },
  { point: { x: 100.01, y: 18.5 }, disc: { x: 95, y: 18.5 - 9 * Math.sqrt(3) / 2 }, stackIndex: 2 },
  { point: { x: 50, y: -.01 }, disc: { x: 45.5, y: .5 + 9 * Math.sqrt(3) / 2 }, stackIndex: 6 },
  { point: { x: 50, y: 37.01 }, disc: { x: 45.5, y: 36.5 - 9 * Math.sqrt(3) / 2 }, stackIndex: 2 },
]
for (const isActive of [false, true]) for (const fixture of nearEdge) {
  const context = { ...ctx, attackStyle: 'hex_offense', stackIndex: fixture.stackIndex,
    disc: fixture.disc, throwerPos: fixture.disc, rng: createRng(61040) }
  const slot = formationStructuralTarget({ ...context, ...fixture.point })
  assert.ok(Math.hypot(slot.x - fixture.point.x, slot.y - fixture.point.y) < .6, 'near-line fixture')
  let agent = { ...agentAt({ ...fixture.point, vx: 0, vy: 0 }, slot), isActive }
  const start = { x: agent.x, y: agent.y }
  agent = move(agent, context, 'near-line first step')
  assert.ok(Math.hypot(agent.x - start.x, agent.y - start.y) > 0, 'must begin a physical return')
  assert.ok(outside(agent), 'must not snap even from just outside')
  for (let i = 0; i < 300 && outside(agent); i++) agent = move(agent, context, `near-line return ${i}`)
  assert.ok(!outside(agent), 'near-line agent re-enters instead of remaining parked outside')
}
console.log('PASS near-line returns despite inactive/WAITING stop thresholds at every edge')

// A player may legally carry momentum beyond the painted line. Switching the
// cut slot must not erase that excursion or its return path.
for (const point of [
  { x: .05, y: 18.5, vx: -5, vy: 0 }, { x: 99.95, y: 18.5, vx: 5, vy: 0 },
  { x: 50, y: .05, vx: 0, vy: -5 }, { x: 50, y: 36.95, vx: 0, vy: 5 },
]) {
  let agent = move(agentAt(point), ctx, 'inertial excursion')
  assert.ok(agent.x < 0 || agent.x > 100 || agent.y < 0 || agent.y > 37, 'momentum crosses the painted line')
  agent = move({ ...agent, isActive: true }, ctx, 'activation during excursion')
  assert.ok(outside(agent), 'activation does not erase the excursion')
}
console.log('PASS natural inertial excursions remain continuous across activation')

// Local crowd avoidance can push a legal navigation target beyond a boundary;
// keep the corrected target legal without clamping the physical position.
const savedOffBall = BODY_TRAFFIC_CALIBRATION.offBall
try {
  for (const offBall of [false, true]) for (const state of [CUTTER_STATE.WAITING, CUTTER_STATE.ACTIVE_CUT]) for (const fixture of nearEdge) {
    BODY_TRAFFIC_CALIBRATION.offBall = offBall
    const context = { ...ctx, attackStyle: 'hex_offense', stackIndex: fixture.stackIndex,
      disc: fixture.disc, throwerPos: fixture.disc, rng: createRng(61041) }
    const slot = formationStructuralTarget({ ...context, ...fixture.point })
    const inwardX = Math.sign(50 - slot.x), inwardY = Math.sign(18.5 - slot.y)
    const agent = { ...agentAt({ ...slot, vx: 0, vy: 0 }, slot), isActive: true, state }
    // Neighbour is inward of the agent, so yielding pushes towards the boundary.
    const neighbour = { ...agent, id: 'crowd-neighbour', x: slot.x + inwardX * .4, y: slot.y + inwardY * .4 }
    context.defenders = [neighbour]
    const next = move(agent, context, 'crowd/jitter at boundary')
    assert.ok(!outside(next), 'stationary legal player is not directed beyond the field by yielding/jitter')
  }
} finally {
  BODY_TRAFFIC_CALIBRATION.offBall = savedOffBall
}
console.log('PASS legal crowd-adjusted goals and near-line idle movement, with body avoidance on/off')
