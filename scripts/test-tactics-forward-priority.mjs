import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { scanThrowOptions, THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { createRng } from '../src/matchEngine/rng.js'

function scene({ sign = 1, hand = 'RIGHT', requireForwardPass = true, hardStallCount = 1,
  forward = true, covered = false, forwardX = 8, forwardY = 5, speed = 0, stallCount = 9, gap = 5,
  vision = 80, dumpY = -8, reset = true, extraReset = false } = {}) {
  const players = structuredClone(demoHomeTeam.players.slice(0, 4))
  for (const player of players) {
    player.traits = []; player.currentStamina = 100; player.morale = 72; player.dominantHand = hand
    for (const category of Object.values(player.skills)) for (const key of Object.keys(category)) category[key] = 80
  }
  const [thrower, dump, cutter] = players
  thrower.skills.mental.vision = vision
  const point = (x, y) => ({ x: 50 + sign * x, y: 18 + sign * y })
  const agent = (player, x, y, changes = {}) => ({ id: player.id, player, ...point(x,y),
    vx: 0, vy: 0, state: 'ACTIVE_CUT', isActive: true,
    targetX: point(x,y).x, targetY: point(x,y).y, ...changes })
  const offense = [agent(thrower,0,0,{isThrower:true})]
  if (reset) offense.push(agent(dump,0,dumpY,{isDump:true,subRole:'primary_handler'}))
  if (extraReset) offense.push(agent(players[3],0,3,{isDump:true,subRole:'reset_handler'}))
  if (forward) offense.push(agent(cutter,forwardX,forwardY,{isDump:false,subRole:'primary_cutter',vx:sign*speed}))
  const defenders = [agent(structuredClone(demoAwayTeam.players[0]),forwardX+(covered?0:gap),forwardY,{state:'COVERING_CUTTER'})]
  const previous = THROW_SCAN_DIAGNOSTICS.observe
  let scan
  THROW_SCAN_DIAGNOSTICS.observe = row => { scan = row }
  try {
    const option = scanThrowOptions(thrower, offense, defenders, {
      disc:point(0,0), stallCount, hardStallCount, requireForwardPass,
      possessionTeam:sign===1?'home':'away', forceSide:'force_forehand',
      attackStyle:'hex_offense', defenseStyle:'zone_wall', rng:createRng(710331), setupElapsedMs:0,
    })
    return {option,scan,dumpId:dump.id,cutterId:cutter.id}
  } finally { THROW_SCAN_DIAGNOSTICS.observe = previous }
}

for (const sign of [1,-1]) for (const hand of ['RIGHT','LEFT']) {
  const config = {sign,hand}
  const ordinary = scene({...config,requireForwardPass:false}), requested = scene(config)
  assert.equal(ordinary.option.player.id, ordinary.dumpId)
  assert.equal(requested.option.player.id, requested.cutterId)
  const dump = requested.scan.options.find(o=>o.id===requested.dumpId)
  const cutter = requested.scan.options.find(o=>o.id===requested.cutterId)
  assert.ok(dump.score>cutter.score && cutter.score>requested.scan.threshold)
  assert.equal(cutter.reachable,true)
  assert.equal(requested.option.resetAvailable,true)
  assert.equal(requested.option.resetScore,dump.score)
  assert.deepEqual(requested.scan.options,ordinary.scan.options,'priority changes choice, not scores or geometry')

  const covered = scene({...config,covered:true})
  assert.equal(covered.option.player.id,covered.dumpId)
  assert.ok(covered.scan.rejected.some(o=>o.id===covered.cutterId && o.reason==='separation_policy'))
  const unreachable = scene({...config,forwardY:30})
  assert.equal(unreachable.option.player.id,unreachable.dumpId)
  const impossible = unreachable.scan.options.find(o=>o.id===unreachable.cutterId)
  assert.equal(impossible.reachable,false,'real trajectory validation must rule out this forward offer')
  assert.ok(impossible.score>unreachable.scan.threshold,'the offer passes scoring but cannot be reached')
  const rejectedPlan = scene({...config,forwardY:30,stallCount:1})
  assert.equal(rejectedPlan.option.player.id,rejectedPlan.dumpId,'exhausting invalid plans must retain the accepted reset')
  assert.equal(rejectedPlan.scan.options.find(o=>o.id===rejectedPlan.cutterId).score,-Infinity)

  const absent = scene({...config,forward:false})
  assert.equal(absent.option.player.id,absent.dumpId,'reset remains available with no forward offer')
  const late = scene({...config,hardStallCount:8})
  assert.equal(late.option.player.id,late.dumpId,'real late stall preserves the ordinary best option')
  const hidden = scene({...config,vision:0,dumpY:-3,forwardX:3,forwardY:12})
  assert.equal(hidden.option.player.id,hidden.dumpId)
  assert.ok(!hidden.scan.perceived.offense.some(a=>a.id===hidden.cutterId),'priority cannot reveal an unseen forward offer')
  const budget = scene({...config,vision:0,dumpY:-3,extraReset:true})
  assert.ok(budget.scan.perceived.offense.some(a=>a.id===budget.cutterId),'forward offer is visible in the budget fixture')
  assert.notEqual(budget.option?.player.id,budget.cutterId,'priority must not widen the existing perceived-option budget')
  assert.equal(budget.scan.options.find(o=>o.id===budget.cutterId).validationStatus,undefined)
  assert.equal(scene({...config,forward:false,reset:false}).option,null,'no options cannot invent a reset or progress')
  assert.equal(scene({...config,covered:true,reset:false}).option,null,'no accepted options must return no decision')
}
console.log('PASS forward priority: same scores/perception, reachable advance first, unsafe/missing/hidden forward resets, real late-stall fallback; both directions and hands')
