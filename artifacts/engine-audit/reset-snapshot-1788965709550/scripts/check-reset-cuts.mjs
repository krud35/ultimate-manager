import assert from 'node:assert/strict'
import { tickCutterBrain, CUTTER_STATE, RESET_CUT_CALIBRATION } from '../src/matchEngine/ai/cutterBrain.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'

const player = { ...structuredClone(demoHomeTeam.players[0]), traits: [] }
const base = { id: player.id, player, x: 40, y: 18, vx: 3, vy: 0, targetX: 52, targetY: 23,
  state: CUTTER_STATE.ACTIVE_CUT, stateMs: 100, cutKind: 'deep', cutReviewMs: 0 }
const ctx = { dtSec: 0.02, disc: { x: 30, y: 18 }, throwerPos: { x: 30, y: 18 }, possessionTeam: 'home',
  forceSide: 'forehand', situation: { separation: 5, isOpenSide: true }, rng: createRng(811),
  elapsedMs: 1500, postResetClearout: true, activeCutters: 1, maxCutters: 2, teammates: [], defenders: [] }
const run = (agent, extra = {}) => tickCutterBrain(structuredClone(agent), { ...ctx, rng: createRng(811), ...extra })
const active = run(base)
assert.equal(active.state, CUTTER_STATE.ACTIVE_CUT)
assert.equal(active.stateMs, 120)
assert.deepEqual([active.targetX, active.targetY], [base.targetX, base.targetY])
const initiating = run({ ...base, state: CUTTER_STATE.INITIATING_CUT, stateMs: 0 })
assert.equal(initiating.stateMs, 20)
assert.deepEqual([initiating.targetX, initiating.targetY], [base.targetX, base.targetY])
const clearing = run({ ...base, state: CUTTER_STATE.CLEARING })
assert.equal(clearing.state, CUTTER_STATE.CLEARING)
assert.equal(clearing.stateMs, 120)
const waiting = { ...base, state: CUTTER_STATE.WAITING, stateMs: 0 }
const started = run(waiting, { activeCutters: 0 })
assert.equal(started.state, CUTTER_STATE.INITIATING_CUT)
assert.equal(run(waiting, { activeCutters: 2 }).state, CUTTER_STATE.WAITING)
// Reproduces the old fault: same active route is restarted and retargeted.
RESET_CUT_CALIBRATION.stable = false
try {
  const legacy = run(base)
  assert.equal(legacy.stateMs, 0)
  assert.notDeepEqual([legacy.targetX, legacy.targetY], [base.targetX, base.targetY])
} finally { RESET_CUT_CALIBRATION.stable = true }
let agent = structuredClone(base), leftActive = false
const rng = createRng(823)
for (let i = 0; i < 400; i++) {
  agent = tickCutterBrain(agent, { ...ctx, rng, elapsedMs: 1500 + i * 20 })
  if (agent.state !== CUTTER_STATE.ACTIVE_CUT) { leftActive = true; break }
}
assert.ok(leftActive, 'Reset must not prevent an active cut from finishing')
console.log('OK: reset preserves active route, initiation, clearing, cutter capacity and cut completion; legacy fault reproduced')
