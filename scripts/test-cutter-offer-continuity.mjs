import assert from 'node:assert/strict'
import { assignActiveCutters } from '../src/matchEngine/ai/activeCutters.js'
import { createCutterAgent, tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
const make=()=>['primary_cutter','secondary_cutter','continuation_cutter','filler_cutter'].map((subRole,stackIndex)=>
  ({id:stackIndex,subRole,stackIndex,state:'WAITING'}))

// Agent snapshots carry the ongoing state, but not the transient isActive flag.
const carried=make()
carried[2].state='ACTIVE_CUT'
assignActiveCutters(carried,2,0,true)
assert.equal(carried[2].isActive,true,'a continuation route must survive the next catch')
assert.equal(carried.filter(a=>a.isActive).length,2)

const continuation=make()
assignActiveCutters(continuation,2,0,true)
assert.equal(continuation[2].isActive,true,'continuation must receive a slot during the 700 ms offer window')
assert.equal(continuation[3].isActive,false,'filler must not gain early cutting priority')

const occupied=make()
occupied[0].state='ACTIVE_CUT'
occupied[1].state='INITIATING_CUT'
assignActiveCutters(occupied,2,0,true)
assert.equal(occupied[2].isActive,false,'new offer must not interrupt two existing routes')

const fresh=make()
assignActiveCutters(fresh,2,0,false)
assert.deepEqual(fresh.filter(a=>a.isActive).map(a=>a.subRole),['primary_cutter','secondary_cutter'])

const clearing=make()
clearing[0].state='CLEARING';clearing[0].isActive=true
assignActiveCutters(clearing,2,1000,true)
assert.equal(clearing[0].isActive,false)
clearing[0].state='WAITING'
assignActiveCutters(clearing,2,1100,true)
assert.equal(clearing[0].isActive,false,'clearing rest is still respected')
const player=structuredClone(demoHomeTeam.players[7])
const route={...createCutterAgent(player,50,18),subRole:'primary_cutter',isActive:true,
  state:'INITIATING_CUT',stateMs:40,targetX:62,targetY:22,cutKind:'deep'}
const next=tickCutterBrain(route,{dtSec:.02,disc:{x:40,y:18},throwerPos:{x:40,y:18},possessionTeam:'home',
  forceSide:'force_forehand',situation:{inThrowLane:true,separation:10,throwWindowScore:90,cloggingLevel:0},
  rng:createRng(91),postCatchReorg:true,elapsedMs:0,activeCutters:1,maxCutters:2,stackIndex:2})
assert.ok(['INITIATING_CUT','ACTIVE_CUT'].includes(next.state),'catch reorganization must not cancel an initiating route')
assert.equal(next.targetX,62)
console.log('PASS ongoing routes, immediate continuation, lane capacity, filler priority and rest')
