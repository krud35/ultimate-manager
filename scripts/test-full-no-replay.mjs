import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { createRng } from '../src/matchEngine/rng.js'
import { buildPointLineStats } from '../src/matchEngine/pointLineStats.js'
import { resolveTurnoverPointFromMotionTrace } from '../src/matchEngine/motionFromTicks.js'

// A secured interception must not reuse ON_GROUND from the pickup before this throw.
const interceptionFrame={disc:{state:'HELD',x:30.35,y:20.15},players:[{id:9,x:30,y:20}]}
const interception={resolution:{securedInterception:true,receiverId:9}}
const interceptionArgs={isBlock:true,defenderId:9}
assert.deepEqual(resolveTurnoverPointFromMotionTrace({...interception,frames:[
 {disc:{state:'ON_GROUND',x:10,y:7},players:[]},interceptionFrame]},interceptionArgs),
 {x:30,y:20,source:'interception'})
assert.deepEqual(resolveTurnoverPointFromMotionTrace({...interception,frames:[],finalFrame:interceptionFrame},interceptionArgs),
 {x:30,y:20,source:'interception'})

// Compare all sporting state, including event order, AI adaptation, fatigue,
// workload and player stats. Only presentation storage and the option differ.
export function sportingState(session) {
  return JSON.parse(JSON.stringify(session, (key, value) => {
    if (['frames', 'finalFrame', 'runMetersById', 'collectFrames', 'rng'].includes(key)) return undefined
    return value instanceof Map ? [...value] : value
  }))
}

const scenarios = [
  { seed: 731, wind: { speedMph: 0, directionDeg: 0 } },
  { seed: 70000, wind: { speedMph: 28, directionDeg: 90 } },
  { seed: 70001, wind: { speedMph: 18, directionDeg: 180 } },
]
for (const scenario of scenarios) {
  const run = capture => {
    const perPoint = Array.isArray(capture) ? capture : null
    const collectFrames = perPoint ? undefined : capture
    Math.random = createRng(scenario.seed + 100).float
    const session = initMatchSession({ homeTeam: structuredClone(demoHomeTeam),
      awayTeam: structuredClone(demoAwayTeam), ...scenario, windLocked: true, collectFrames })
    const states = []
    for (let point = 0; point < 3; point++) {
      const before = session.events.length
      playNextPoint(session, {}, { rotateHome: true, rotateAway: true, aiHome: true, aiAway: true,
        ...(perPoint ? { collectFrames: perPoint[point] } : {}) })
      const hasFrames = session.events.slice(before).some(e => e.motionTrace?.frames?.length)
      assert.equal(hasFrames, perPoint ? perPoint[point] ?? true : collectFrames)
      states.push({ session: sportingState(session), lineStats: buildPointLineStats(session.events.slice(before)) })
    }
    return { states, nextRandom: session.rng.float() }
  }
  const reference = run(true)
  assert.deepEqual(run(false), reference, `full simulation parity, seed ${scenario.seed}`)
  if (scenario.seed === 731) {
    assert.deepEqual(run([undefined, false, undefined]), reference, 'watch/simulate/watch parity and default capture')
    console.log('PASS per-point capture: watch / simulate / watch, default replay restored')
  }
  console.log(`PASS full/no-replay: seed ${scenario.seed}, 3 points, wind ${scenario.wind.speedMph} mph`)
}
