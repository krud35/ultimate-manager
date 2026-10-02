// Set ENGINE_BASELINE_DIR=artifacts/engine-optimization-2/baseline and use
// --import ./scripts/register-engine-comparison.mjs to load the captured engine.
import assert from 'node:assert/strict'
import { createRng } from '../src/matchEngine/rng.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { perceivePlayers } from '../src/matchEngine/ai/playerPerception.js'
import { perceivePlayers as oldPerception } from '../src/matchEngine/ai/playerPerception.js?engineBaseline'
import { integrateAgentMotion, prepareMotionParameters } from '../src/matchEngine/ai/playerMovement.js'
import { integrateAgentMotion as oldMotion } from '../src/matchEngine/ai/playerMovement.js?engineBaseline'
import { arrivalWindowGap } from '../src/matchEngine/ai/arrivalMotion.js'
import { arrivalWindowGap as oldArrival } from '../src/matchEngine/ai/arrivalMotion.js?engineBaseline'
import { plannedFlightSampler } from '../src/matchEngine/ai/flightKinematics.js'
import { createDiscTrajectory, sampleContinuedDisc } from '../src/matchEngine/ai/discTrajectory.js'
import * as stamina from '../src/matchEngine/stamina.js'
import * as oldStamina from '../src/matchEngine/stamina.js?engineBaseline'
import { createMotionStaminaAccumulator } from '../src/matchEngine/motionStamina.js'

assert.ok(process.env.ENGINE_BASELINE_DIR?.includes('engine-optimization-2'), 'Select the pre-change baseline')
const rng = createRng(220926)
const random = (a, b) => a + rng.float() * (b - a)
const makePlayer = () => structuredClone(demoHomeTeam.players[0])

for (let scenario = 0; scenario < 60; scenario++) {
  const player = makePlayer()
  const observer = { id: 'observer', player, x: 50, y: 18 }
  const targets = Array.from({ length: 14 }, (_, id) => ({ id, x: random(40, 60), y: random(8, 28),
    vx: random(-5, 5), vy: random(-5, 5) }))
  targets[0] = { id: 0, x: 54, y: 18, vx: 0, vy: 0 } // exactly 4 m
  const blockers = [{ id: 'blocker', x: 52, y: 18 }, ...targets]
  for (let tick = 0; tick < 40; tick++) {
    const ms = tick < 35 ? tick * 100 : (tick - 35) * 100 // reset perception clock too
    const focus = tick % 3 ? { x: 50 + Math.cos(tick / 3) * 10, y: 18 + Math.sin(tick / 3) * 10, lock: true } : null
    assert.deepEqual(perceivePlayers(observer, targets, blockers, ms, focus),
      oldPerception(observer, targets, blockers, ms, focus), `perception ${scenario}/${tick}`)
  }
}
console.log('PASS 2400 perception comparisons: occlusion, peripheral view, memory expiry, clock reset, 4 m boundary')

for (let trial = 0; trial < 1000; trial++) {
  const player = makePlayer()
  player.currentStamina = [0, 29.99, 30, 59.99, 60, 100][trial % 6]
  const agent = { player, id: player.id, x: random(0, 100), y: random(0, 37), vx: random(-8, 8), vy: random(-8, 8) }
  const role = trial % 2 ? 'offense' : 'defense'
  const target = { x: random(0, 100), y: random(0, 37) }
  const speed = random(0, 9), requested = trial % 5 ? random(0, speed) : 0
  const params = [agent, target.x, target.y, speed, 0.02, true, role, requested]
  const expected = oldMotion(...params)
  assert.deepEqual(integrateAgentMotion(...params), expected)
  assert.deepEqual(integrateAgentMotion(...params, prepareMotionParameters(player, role)), expected)
  if (trial < 120) {
    const blockers = [{ id: 'blocker', x: agent.x + 0.5, y: agent.y }]
    const seconds = [0, 0.019, 0.02, 0.35, 0.8][trial % 5]
    assert.equal(arrivalWindowGap(agent, target, player, role, speed, seconds, 0.5, blockers),
      oldArrival(agent, target, player, role, speed, seconds, 0.5, blockers))
  }
}
console.log('PASS 2000 exact movement comparisons and 120 arrival forecasts at different fatigue levels')

const trajectory = { fromX: 10, fromY: 18, toX: 30, toY: 24, totalFlightMs: 1600,
  startHeightM: 1.2, peakHeightM: 3.5, endHeightM: 1.2 }
let sampleChecks = 0
for (const wind of [0, 18, 28]) for (const planned of [false, true]) {
  const actual = createDiscTrajectory({ ...trajectory, wind: { speedMph: wind, directionDeg: 90 } })
  const plan = createDiscTrajectory({ ...trajectory, totalFlightMs: 1900 })
  const flight = { trajectoryPlan: actual, plannedShape: planned ? { plan } : null,
    totalFlightMs: 1600, elapsedMs: 80, landingX: 30, landingY: 24, trueLandingX: 32, trueLandingY: 22 }
  const check = () => {
    const sampler = plannedFlightSampler(flight)
    assert.equal(plannedFlightSampler(flight), sampler, 'reuse sampler within a tick')
    for (let ms = 0; ms <= 7000; ms += 20) {
      const known = flight.plannedShape?.plan
      const p = sampleContinuedDisc(known ?? flight.trajectoryPlan, ms / flight.totalFlightMs * (known?.totalMs ?? flight.totalFlightMs))
      const expected = known ? p : { ...p,
        x: p.x + (flight.landingX ?? flight.toX) - (flight.trueLandingX ?? flight.toX),
        y: p.y + (flight.landingY ?? flight.toY) - (flight.trueLandingY ?? flight.toY) }
      assert.deepEqual(sampler(ms), expected)
      assert.equal(sampler(ms), sampler(ms), 'sample is shared, not recalculated')
      sampleChecks++
    }
    return sampler
  }
  let prior = check()
  for (const change of [() => { flight.elapsedMs += 20 }, () => { flight.deflection = { atMs: 100 } },
    () => { flight.landingX += 2 }, () => { flight.totalFlightMs += 100 },
    () => { flight.plannedShape = { plan: createDiscTrajectory({ ...trajectory, toY: 15 }) } }]) {
    change()
    assert.notEqual(plannedFlightSampler(flight), prior, 'invalidate on tick/deflection/plan changes')
    prior = check()
  }
}
console.log(`PASS ${sampleChecks} planned trajectory samples, strong wind, continuation and invalidation`)

for (let trial = 0; trial < 30; trial++) {
  const player = makePlayer(), oldPlayer = structuredClone(player)
  player.matchStamina = oldPlayer.matchStamina = random(40, 100)
  player.developmentFatigue = oldPlayer.developmentFatigue = random(0, 60)
  const side = trial % 2 ? 'home' : 'away', possession = trial % 3 ? 'home' : 'away'
  const initial = { home: {}, away: {}, sprintM: { home: {}, away: {} } }
  initial[side][player.id] = random(0, 100)
  initial.sprintM[side][player.id] = random(0, 200)
  const maps = structuredClone(initial), oldMaps = structuredClone(initial)
  const motion = {}, oldKinematics = {}, parameters = stamina.prepareTickStamina(player)
  const frames = []
  let x = 20, y = 18
  for (let tick = 0; tick < 300; tick++) {
    x += tick % 31 ? random(-0.15, 0.15) : 5 // include position jumps > human speed
    y += random(-0.1, 0.1)
    const dt = [0.02, 0.1, 0.01][tick % 3]
    assert.equal(stamina.applyTickStaminaDrain(maps, player, side, possession, motion, x, y, dt, parameters),
      oldStamina.applyTickStaminaDrain(oldMaps, oldPlayer, side, possession, oldKinematics, x, y, dt))
    assert.deepEqual(maps, oldMaps)
    assert.deepEqual(motion, oldKinematics)
    frames.push({ ms: tick * 20, players: [{ id: player.id, teamId: side, x, y }] })
  }
  const traceMaps = structuredClone(initial), expected = structuredClone(initial)
  const tracePlayers = { [player.id]: structuredClone(player) }, oldPlayers = structuredClone(tracePlayers)
  stamina.applyStaminaFromMotionTrace(traceMaps, { frames }, tracePlayers, possession, initial)
  oldStamina.applyStaminaFromMotionTrace(expected, { frames }, oldPlayers, possession, initial)
  assert.deepEqual(traceMaps, expected)
  const streamed = structuredClone(initial), untouched = structuredClone(tracePlayers)
  const accumulator = createMotionStaminaAccumulator(initial, tracePlayers, possession)
  for (const frame of frames) accumulator.sample(frame.ms, frame.players)
  accumulator.apply(streamed)
  assert.deepEqual(streamed, expected)
  assert.deepEqual(tracePlayers, untouched, 'stream accounting must not mutate live player energy')
}
console.log('PASS 9000 fatigue ticks plus 30 trace/stream comparisons: exact energy, sprint totals and ceilings')
