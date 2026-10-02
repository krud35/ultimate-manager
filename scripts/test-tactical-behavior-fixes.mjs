import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { tacticsWithLineupSubRoles, offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'
import { setPossessionPlayerMods, clearPointPlayerMods, playerMatchMods } from '../src/matchEngine/playerMods.js'
import { formationStructuralTarget } from '../src/matchEngine/ai/tacticsBehavior.js'
import { assignActiveCutters, receiverPriorityPenalty } from '../src/matchEngine/ai/activeCutters.js'
import { scanThrowOptions, THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { resetPlayerPerception } from '../src/matchEngine/ai/playerPerception.js'
import { createCutterAgent, tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import { pickThrowType } from '../src/matchEngine/throwTypes.js'
import { createRng } from '../src/matchEngine/rng.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'

const lineup = structuredClone(demoHomeTeam.players.slice(0, 7))
const stored = { _pointStartRole: 'defense', playerSubRoles: { [lineup[0].id]: 'filler_cutter', [lineup[2].id]: 'reset_handler' },
  oLinePlayerInstructions: { [lineup[2].id]: ['play_slow'] }, dLinePlayerInstructions: { [lineup[2].id]: ['play_fast'] } }
const original = structuredClone(stored)
const runtime = tacticsWithLineupSubRoles(stored, lineup, 'vertical_stack')
assert.equal(runtime.playerSubRoles[lineup[0].id], 'primary_handler')
assert.equal(runtime.playerSubRoles[lineup[2].id], 'primary_cutter')
const mods = mergeTraitAndCoachMods(lineup[2], runtime)
assert.equal(mods.preferDumpRole, false)
assert.ok(mods.cutRollMult > 1)
assert.ok(mods.releaseGateMult < 1, 'D-line instruction retained on offense after turnover')
setPossessionPlayerMods(lineup, runtime, [], {})
assert.equal(playerMatchMods(lineup[2]).cutRollMult, mods.cutRollMult)
clearPointPlayerMods()
assert.deepEqual(stored, original, 'runtime roles must not overwrite saved preferences')
assert.equal(tacticsWithLineupSubRoles(runtime, lineup, 'vertical_stack'), runtime, 'already resolved tactics are stable')
const alternate = tacticsWithLineupSubRoles(stored, [lineup[2], lineup[1], lineup[0], ...lineup.slice(3)], 'vertical_stack')
assert.equal(alternate.playerSubRoles[lineup[2].id], 'reset_handler', 'valid saved subrole restored on other line')
console.log('PASS effective roles, point registry, D-line orders, immutable saved preferences')

for (const style of ['horizontal_stack', 'motion_offense', 'zone_offense', 'vertical_stack']) {
  for (const possessionTeam of ['home','away']) for (const y of [1,18,36]) {
    const slots = [0,1].map(handlerSlotIndex => formationStructuralTarget({ attackStyle:style,
      disc:{x:50,y}, throwerPos:{x:50,y}, possessionTeam, forceSide:'force_forehand',
      isDump:true, stackIndex:handlerSlotIndex+1, handlerSlotIndex, rng:createRng(77) }))
    assert.ok(Math.hypot(slots[0].x-slots[1].x,slots[0].y-slots[1].y) >= 5,
      `${style}/${possessionTeam}/${y}: distinct handler lanes`)
  }
}
console.log('PASS handler spacing in four formations, both directions and sidelines')
const pullTargets = [0,1,2].map(handlerSlotIndex => {
  const agent = { ...createCutterAgent(lineup[handlerSlotIndex],40,18), handlerSlotIndex, isDump:true,
    subRole:handlerSlotIndex===0?'primary_handler':'reset_handler' }
  return tickCutterBrain(agent,{dtSec:.02,disc:{x:40,y:18},throwerPos:{x:40,y:18},possessionTeam:'home',
    forceSide:'force_forehand',situation:{},rng:createRng(55),isDump:true,pullFlow:true})
})
assert.equal(new Set(pullTargets.map(a=>`${a.targetX},${a.targetY}`)).size,3,
  'all three handlers, including previous thrower, have distinct pull-flow offers')

const agents = ['primary_cutter','secondary_cutter','continuation_cutter','filler_cutter'].map((subRole,stackIndex)=>
  ({ subRole, stackIndex, state:'WAITING' }))
assignActiveCutters(agents,2,0,true)
assert.equal(agents[3].isActive,false, 'filler cut initiation remains restricted')
const open = { separation:10, throwWindowScore:95 }
assert.ok(receiverPriorityPenalty(agents[3],open,2) > receiverPriorityPenalty(agents[0],open,2))
assert.equal(receiverPriorityPenalty(agents[3],{separation:2,throwWindowScore:50},2),null)
assert.ok(receiverPriorityPenalty(agents[3],{separation:4,throwWindowScore:70},8) != null)

const thrower = structuredClone(lineup[0]), receiver = structuredClone(lineup[2])
for (const p of [thrower,receiver]) { p.traits=[]; p.currentStamina=100; p.morale=72 }
let diagnostic = null
THROW_SCAN_DIAGNOSTICS.observe = value => { diagnostic=value }
const scene = (subRole, isActive) => {
  resetPlayerPerception(thrower)
  const offense = [{id:thrower.id,player:thrower,x:40,y:18,vx:0,vy:0,isThrower:true},
    {id:receiver.id,player:receiver,x:52,y:18,vx:0,vy:0,targetX:52,targetY:18,
      state:'WAITING',subRole,isActive,isDump:false}]
  let decision
  for (const ms of [0,250,500,750,1000]) decision=scanThrowOptions(thrower,offense,[],{
    disc:{x:40,y:18},possessionTeam:'home',stallCount:2,setupElapsedMs:ms,
    rng:createRng(55221+ms),offenseTactics:{},postCatchReorg:true})
  return {decision,diagnostic}
}
const filler=scene('filler_cutter',false), primary=scene('primary_cutter',true)
assert.equal(filler.decision?.player.id,receiver.id,'open stationary filler must be reachable by a real pass decision')
assert.ok(primary.decision.score > filler.decision.score,'equivalent primary option outranks filler')
THROW_SCAN_DIAGNOSTICS.observe=null
console.log('PASS open passive filler is selectable, retains low priority and cut restrictions')

const distribution = (stallCount, instruction=null, directive=null, bad=false) => {
  const result = {}
  const player = structuredClone(thrower)
  if (bad) for (const key of ['composure','decisionMaking']) player.skills.mental[key]=20
  const tactics = {oLinePlayerInstructions:{[player.id]:instruction?[instruction]:[]},
    oLineCoachDirectives:directive??{}}
  for(let i=1;i<=2500;i++) {
    const type=pickThrowType({rng:createRng(Math.imul(i,2654435761)),thrower:player,defender:demoAwayTeam.players[0],
      tactics,stallCount,discPosition:45,attackStyle:'vertical_stack',defenseStyle:'person',separation:{outcome:'open'}})
    result[type]=(result[type]??0)+1
  }
  return result
}
for (const stall of [1,5,6,7,8,9]) {
  assert.ok((distribution(stall,'throw_hucks').huck??0) > (distribution(stall,'no_hucks').huck??0),`huck orders at stall ${stall}`)
  assert.ok(distribution(stall,'dump_first').dump_swing > distribution(stall,'look_downfield').dump_swing,`reset orders at stall ${stall}`)
}
assert.ok(distribution(8,null,{huckAppetite:1}).huck > distribution(8,null,{huckAppetite:-1}).huck)
assert.ok(distribution(6,'throw_hucks',null,true).huck > distribution(6,'no_hucks',null,true).huck)
console.log('PASS opposing throw/reset orders at stalls 1,5,6,7,8,9; directives and poor decision-making')

for (const fastMode of [false,true]) {
  const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
  const tacticsFor = players => {
    const t=defaultTacticsForPlayers(players)
    // Incompatible saved families, as after changing a formation or line.
    t.playerSubRoles=Object.fromEntries(players.map(p=>[p.id,'reset_handler']))
    return t
  }
  const ht=tacticsFor(home.players),at=tacticsFor(away.players)
  const saved=JSON.stringify([ht,at])
  const session=initMatchSession({homeTeam:home,awayTeam:away,homeTactics:ht,awayTactics:at,seed:92701,wind:{speedMph:0,directionDeg:0},windLocked:true})
  playNextPoint(session,{}, {fastMode,aiHome:false,aiAway:false,rotateHome:false,rotateAway:false})
  const start=session.events.find(e=>e.type==='point_start')
  const throws=session.events.filter(e=>e.type==='throw_attempt')
  assert.ok(throws.length>0)
  if(!fastMode) for(const e of throws) {
    const ids=e.possessionTeam==='home'?start.homeLineupIds:start.awayLineupIds
    const savedTactics=e.possessionTeam==='home'?ht:at
    const slots=offenseLineSlotsForAttackStyle(e.attackStyle)
    assert.equal(e.throwerSubRole,resolvePlayerSubRole(savedTactics,e.throwerId,slots[ids.indexOf(e.throwerId)]))
    assert.equal(e.receiverSubRole,resolvePlayerSubRole(savedTactics,e.receiverId,slots[ids.indexOf(e.receiverId)]))
  }
  assert.equal(JSON.stringify([ht,at]),saved)
  console.log(`PASS ${fastMode?'fast':'full'} point integration: ${throws.length} throws, saved roles intact`)
}
