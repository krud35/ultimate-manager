import assert from 'node:assert/strict'
import { createDiscTrajectory, sampleDiscTrajectory, trajectoryWindOffset, looseDiscLanding } from '../src/matchEngine/ai/discTrajectory.js'
import { scoreThrowShape } from '../src/matchEngine/ai/throwShape.js'
import { createFlightContext, sampleFlightDisc, applyFlightResolutionToAgents } from '../src/matchEngine/ai/flightKinematics.js'
import { simulateMatch } from '../src/matchEngine/matchSession.js'
import { createRng } from '../src/matchEngine/rng.js'
import { firstDiscContact } from '../src/matchEngine/ai/discContact.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const reach = { horizontal: 1, standing: 2 }
const standing = { x: 0, y: 0, z: 0 }
const crossed = firstDiscContact({ x: -3, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }, standing, standing, reach)
close(crossed.fraction, 1 / 3)
close(crossed.x, -1)
assert.equal(firstDiscContact({ x: -3, y: 0, z: 3 }, { x: 3, y: 0, z: 3 }, standing, standing, reach), null)
assert.ok(firstDiscContact({ x: -3, y: 0, z: 3 }, { x: 3, y: 0, z: 3 },
  { ...standing, z: 2 }, { ...standing, z: 2 }, reach))
const later = firstDiscContact({ x: -3, y: 0, z: 1 }, { x: 3, y: 0, z: 1 },
  { ...standing, x: 2 }, { ...standing, x: 2 }, reach)
assert.ok(crossed.fraction < later.fraction)
const rotatedContact = firstDiscContact({ x: 0, y: -3, z: 1 }, { x: 0, y: 3, z: 1 }, standing, standing, reach)
close(rotatedContact.fraction, crossed.fraction)
const base = { fromX: 10, fromY: 12, toX: 50, toY: 12, totalFlightMs: 3000,
  startHeightM: 1, peakHeightM: 3, endHeightM: 1.15, amplitudeM: 1.5, curveSign: 1 }
const wind = { speedMph: 20, directionDeg: 0 }
const plan = createDiscTrajectory({ ...base, wind })
const turned = createDiscTrajectory({ ...base, fromX: -12, fromY: 10, toX: -12, toY: 50,
  wind: { ...wind, directionDeg: 90 } })
for (let ms = 0; ms <= 3000; ms += 20) {
  const a = sampleDiscTrajectory(plan, ms), b = sampleDiscTrajectory(turned, ms)
  close(b.x, -a.y); close(b.y, a.x); close(b.z, a.z)
  assert.ok([a.x, a.y, a.z].every(Number.isFinite))
}
const short = trajectoryWindOffset(plan, 500), long = trajectoryWindOffset(plan, 4000)
assert.ok(long.dx > short.dx * 4)
close(short.dy, 0)
close(trajectoryWindOffset(plan, 0).dx, 0)
const calm = createDiscTrajectory({ ...base, amplitudeM: 0 })
for (let ms = 0; ms <= 3000; ms += 20) close(sampleDiscTrajectory(calm, ms).y, 12)
const light = createDiscTrajectory({ ...base, wind: { speedMph: 3, directionDeg: 0 } })
assert.ok(trajectoryWindOffset(light, 3000).dx > 0)

const shape = scoreThrowShape({ arc: 'flat', curve: 'straight', curveSign: 1 }, {
  fromX: 10, fromY: 12, toX: 50, toY: 12, perpX: 0, perpY: 1,
  basePeakM: 3, baseFlightMs: 3000, baseAmplitudeM: 1.5,
  releaseHeightM: 1, deliveryHeightM: 1.15, loftStat: 90, wind,
})
const flight = createFlightContext({ fromX: 10, fromY: 12, toX: 50, toY: 12,
  throwType: 'standard', trajectory: 'forward', plannedShape: shape,
  thrower: demoHomeTeam.players[0], receiver: demoHomeTeam.players[1],
  throwTechnique: 'backhand', rng: createRng(79), weather: wind,
  defenseAgents: [{ x: 25, y: 12, player: demoAwayTeam.players[0] }] })
assert.equal(flight.plannedShape, shape)
assert.equal(flight.throwArc, 'flat')
assert.equal(flight.throwCurve, 'straight')
assert.equal(flight.throwPathPoints.length, 2)
for (let ms = 0; ms <= flight.totalFlightMs; ms += 25) {
  assert.deepEqual(sampleFlightDisc(flight, ms), sampleDiscTrajectory(flight.trajectoryPlan, ms))
}
const offense = [{ id: 1, x: 30, y: 12 }], defense = [{ id: 2, x: 28, y: 13 }]
for (const success of [true, false]) {
  const unchanged = applyFlightResolutionToAgents({ resolution: { success, isBlock: !success } }, offense, defense)
  assert.equal(unchanged.offenseAgents, offense); assert.equal(unchanged.defenseAgents, defense)
}
const start = { x: 40, y: 20, z: 2 }, velocity = { x: 5, y: 1, z: -1 }
const landing = looseDiscLanding(start, velocity, 10)
assert.equal(landing.z, 0); assert.ok(landing.grounded); assert.ok(landing.x > start.x)
assert.equal(looseDiscLanding(start, velocity, 0).z, start.z)
assert.ok(!looseDiscLanding(start, velocity, 0.02).grounded)

let completed = 0, failed = 0
for (const [seed, speedMph] of [[18400, 0], [30400, 20], [38400, 0], [51400, 20]]) {
  const result = simulateMatch({ homeTeam: structuredClone(demoHomeTeam), awayTeam: structuredClone(demoAwayTeam),
    seed, fastMode: false, wind: { speedMph, directionDeg: 0 }, windLocked: true })
  let attempt = null
  let interceptor = null
  for (const event of result.events) {
    if (event.type === 'point_start' || event.type === 'score' || event.type === 'stall_out') interceptor = null
    if (event.type === 'throw_attempt') {
      if (interceptor != null) {
        assert.equal(event.throwerId, interceptor, 'Przejęcie musi przekazać dysk obrońcy bez losowego podnoszenia')
        interceptor = null
      }
      attempt = event
      const frames = event.motionTrace.frames
      for (let i = 1; i < frames.length; i++) {
        const previous = frames[i - 1]
        assert.ok(frames[i].ms > previous.ms)
        for (const p of frames[i].players) {
          const before = previous.players.find(a => a.id === p.id)
          if (before) assert.ok(Math.hypot(p.x - before.x, p.y - before.y) <= Math.max(0.7, 12 * (frames[i].ms - previous.ms) / 1000), 'Teleport w trakcie lotu')
        }
      }
    }
    if (event.type === 'throw_success' || event.type === 'throw_fail') {
      const success = event.type === 'throw_success', trace = attempt.motionTrace
      assert.equal(trace.resolution.success, success)
      assert.equal(trace.frames.at(-1).disc.state, success || trace.resolution.securedInterception ? 'HELD' : 'ON_GROUND')
      if (success) {
        assert.equal(event.receiverId, trace.resolution.contact.playerId,
          'Odbiór musi być przypisany faktycznie łapiącemu, także poza zamierzonym odbiorcą')
        assert.equal(attempt.receiverId, event.receiverId)
      }
      if (success || trace.resolution.isBlock || trace.resolution.isDrop) {
        const contact = trace.resolution.contact
        assert.ok(contact && Number.isFinite(contact.ms), 'Wynik bez kontaktu')
        assert.ok(contact.ms <= trace.totalMs && contact.ms >= trace.throwMs)
      }
      if (success) completed++; else {
        failed++
        if (!trace.resolution.securedInterception) assert.equal(trace.frames.at(-1).disc.z, 0)
        else {
          assert.equal(trace.resolution.contact.playerId, trace.resolution.defenderId)
          assert.equal(trace.resolution.reason, 'interception')
          interceptor = trace.resolution.defenderId
        }
      }
    }
    if (event.type === 'score') assert.ok(!['action_limit', 'throw_limit'].includes(event.reason))
  }
}
assert.ok(completed > 0 && failed > 0)
console.log(`OK: wspólny tor, obrót boiska, wiatr/czas, plan rzutu, opadanie, 4 mecze (${completed} chwytów, ${failed} strat)`)
