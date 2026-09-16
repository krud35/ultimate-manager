import { filterPlayersToPointLineup } from '../src/matchEngine/fieldViz.js'
import { playbackStepAdvanceDelta, renderedFrameToInitialPlayerPositions } from '../src/matchEngine/fieldMotion.js'
import { tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import assert from 'node:assert/strict'
import { simulatePull, planPull, selectPuller, pullBoundaryExit } from '../src/matchEngine/pull.js'
import { assignActiveCutters } from '../src/matchEngine/ai/activeCutters.js'
import { createRng } from '../src/matchEngine/rng.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { simulatePoint, simulatePointFast } from '../src/matchEngine/point.js'
import { buildFieldActionClip, sampleFieldActionClip } from '../src/matchEngine/fieldMotion.js'
import { getSubStat } from '../src/models/playerStats.js'
const agents = ['filler_cutter','continuation_cutter','secondary_cutter','primary_cutter'].map((subRole,i)=>({id:i,subRole,stackIndex:i,state:'WAITING'}))
assignActiveCutters(agents,1,0,false)
assert.deepEqual(agents.filter(a=>a.isActive).map(a=>a.subRole),['primary_cutter'])
for (let capacity=1;capacity<=4;capacity++) {
  assignActiveCutters(agents,capacity,7000,true)
  assert.equal(agents.filter(a=>a.isActive).length,capacity)
}
let waiting = { id: 'inactive', player: demoHomeTeam.players[0], x: 55, y: 18,
  vx: 0, vy: 0, state: 'WAITING', isActive: false, subRole: 'filler_cutter', stackIndex: 4 }
const ctx = { dtSec: .02, disc: {x:30,y:18}, throwerPos:{x:30,y:18}, possessionTeam:'home',
  forceSide:'home', situation:{inThrowLane:true}, rng:createRng(12), postCatchReorg:true,
  postResetClearout:true, elapsedMs:100 }
for(let i=0;i<40;i++) {
  waiting=tickCutterBrain(waiting,ctx)
  assert.equal(waiting.state,'WAITING')
  assert.equal(waiting.continuationCut,false)
}
assert.ok(waiting.structureSlot)
assert.equal(getSubStat({throwing:{huck:80,backhand:70}},'throwing','pulling'),75)
let outcomes=new Set(), sum={low:0,high:0}, hangs={low:0,high:0}
for(let seed=1;seed<=30;seed++)for(const side of ['home','away'])for(const level of ['low','high']){
 const offenseLineup=structuredClone(demoHomeTeam.players.slice(0,7))
 const defenseLineup=structuredClone(demoAwayTeam.players.slice(0,7))
 for(const p of defenseLineup) p.skills={...p.skills,throwing:{...p.skills.throwing,pulling:level==='low'?30:95}}
 const pull=simulatePull({offenseLineup,defenseLineup,possessionTeam:side,rng:createRng(seed * 7919),wind:{speedMph:seed%2?0:28,directionDeg:90}})
 outcomes.add(pull.outcome);sum[level]+=pull.distanceM;hangs[level]+=pull.hangMs
 assert.ok(pull.restart.x>=0&&pull.restart.x<=100&&pull.restart.y>=0&&pull.restart.y<=37)
 const first=pull.motionTrace.frames[0],last=pull.motionTrace.frames.at(-1)
 assert.equal(new Set(first.players.map(p=>p.x)).size,2)
 assert.equal(last.disc.state,'HELD')
 assert.ok(pull.motionTrace.totalMs<22000,'pull must finish without timeout')
 if(pull.outcome==='caught' && Math.abs(pull.restart.x - (side==='home'?18:82)) > .6) {
   assert.equal(pull.motionTrace.totalMs,pull.catchMs,'in-field catch must immediately hand off to play')
 }
 if(pull.outcome==='roll_out') {
   assert.deepEqual(pull.restart,pull.exitPoint)
   assert.ok(pull.exitPoint.y===0||pull.exitPoint.y===37||pull.exitPoint.x===0||pull.exitPoint.x===100)
   assert.ok(pull.motionTrace.frames.some(f=>f.disc.state==='ON_GROUND'&&f.disc.x>0&&f.disc.x<100&&f.disc.y>0&&f.disc.y<37))
 }
 if(pull.outcome==='brick') assert.deepEqual(pull.restart,{x:side==='home'?36:64,y:18.5})
 for(const f of pull.motionTrace.frames) for(const p of f.players) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y))
}
assert.ok(sum.high>sum.low)
assert.ok(['brick','caught','ground','roll_out'].every(k=>outcomes.has(k)))
console.log('Pull outcomes, mirrored sides, skill influence, migration and cutter capacity OK:',[...outcomes])
for(const simulate of [simulatePointFast,simulatePoint]){
 const result=simulate({homeTeam:structuredClone(demoHomeTeam),awayTeam:structuredClone(demoAwayTeam),pullTeam:'away',pointIndex:2,rng:createRng(731)})
 const pull=result.events.find(e=>e.type==='pull')
 assert.ok(pull.receiverId);assert.ok(pull.outcome)
 const firstThrow=result.events.find(e=>e.type==='throw_attempt')
 if(firstThrow) assert.equal(firstThrow.throwerId,pull.receiverId)
 if(pull.motionTrace.frames.length){
   const i=result.events.indexOf(pull)
   const clip=buildFieldActionClip(result.events,i,demoHomeTeam,demoAwayTeam,'away')
   assert.equal(clip.kind,'pull')
   for(const t of [0,1500,clip.totalDurationMs]) {
     const frame=sampleFieldActionClip(clip,t)
     assert.equal(frame.players.length,14)
     const startEvent=result.events.find(e=>e.type==='point_start')
     assert.equal(filterPlayersToPointLineup(frame.players,startEvent.homeLineupIds,startEvent.awayLineupIds).length,14,
       'players must remain visible after swapping sides')
   }
   if(pull.outcome==='caught') assert.equal(playbackStepAdvanceDelta(result.events,i),2)
   if(firstThrow?.motionTrace?.frames?.length) {
     const throwClip=buildFieldActionClip(result.events,result.events.indexOf(firstThrow),demoHomeTeam,demoAwayTeam,'away',
       renderedFrameToInitialPlayerPositions(sampleFieldActionClip(clip,clip.totalDurationMs)))
     assert.equal(throwClip.repositionMs,0,'no synthetic setup between pull catch and live throw')
     const start=firstThrow.motionTrace.frames[0]
     for(const player of pull.motionTrace.frames.at(-1).players) {
       const next=start.players.find(p=>p.id===player.id)
       assert.ok(next)
       assert.ok(Math.hypot(next.x-player.x,next.y-player.y)<.6,'positions must carry from pull')
     }
   }
 }
 console.log(simulate.name,'OK',result.events.length,'events')
}

assert.deepEqual(pullBoundaryExit({x:40,y:36},{x:44,y:40}),{x:41,y:37})
assert.deepEqual(pullBoundaryExit({x:40,y:1},{x:44,y:-3}),{x:41,y:0})
assert.deepEqual(pullBoundaryExit({x:99,y:20},{x:103,y:24}),{x:100,y:21})
assert.deepEqual(pullBoundaryExit({x:1,y:20},{x:-3,y:24}),{x:0,y:21})
const weak={id:'weak',skills:{throwing:{pulling:30}}}, strong={id:'strong',skills:{throwing:{pulling:95}}}
assert.equal(selectPuller([weak,strong]).id,'strong')
for(const type of ['hanging','roller']) {
 let lowError=0,highError=0
 for(let seed=1;seed<=80;seed++) {
   const args={possessionTeam:'home',pullType:type,wind:{speedMph:15,directionDeg:90}}
   const low=planPull({...args,puller:weak,rng:createRng(seed*7919)})
   const high=planPull({...args,puller:strong,rng:createRng(seed*7919)})
   assert.equal(low.type,type);assert.equal(high.type,type)
   assert.ok(high.maxDistanceM>low.maxDistanceM)
   assert.ok(high.distanceM<=high.maxDistanceM && low.distanceM<=low.maxDistanceM)
   lowError+=Math.abs(low.distanceErrorM)+Math.abs(low.lateralErrorM)+Math.abs(low.hangMs-low.intendedHangMs)/1000
   highError+=Math.abs(high.distanceErrorM)+Math.abs(high.lateralErrorM)+Math.abs(high.hangMs-high.intendedHangMs)/1000
 }
 assert.ok(highError<lowError, type+' execution should improve with pulling')
}
// String-valued numeric IDs occur in imported rosters: do not silently filter them out.
const framePlayers=Array.from({length:14},(_,i)=>({id:String(i+1),teamId:i<7?'home':'away',x:18,y:i+1,role:'stack'}))
const numericEvents=[{type:'point_start',homeLineupIds:framePlayers.slice(0,7).map(p=>p.id),awayLineupIds:framePlayers.slice(7).map(p=>p.id)},
 {type:'pull',outcome:'caught',motionTrace:{frames:[{ms:0,players:framePlayers,disc:{x:18,y:18,z:1,state:'HELD'}},
 {ms:100,players:framePlayers,disc:{x:18,y:18,z:1,state:'HELD'}}],totalMs:100,throwMs:0,preservePositions:true}}]
assert.equal(sampleFieldActionClip(buildFieldActionClip(numericEvents,1,{}, {},'away'),50).players.length,14)
console.log('Pull visibility, continuous reception, boundary exits and intended-type execution OK')

const handler={...waiting,subRole:'reset_handler',isDump:true,isActive:undefined,stackIndex:1}
const flowHandler=tickCutterBrain(handler,{...ctx,pullFlow:true,isDump:true,postCatchReorg:false})
assert.ok(flowHandler.targetX>ctx.disc.x)
assert.equal(flowHandler.continuationCut,true)
const waitingBase={...waiting,structureSlot:undefined,structureFlow:undefined}
const staticStack=tickCutterBrain(waitingBase,{...ctx,pullFlow:false,rng:createRng(1)})
const advancingStack=tickCutterBrain(waitingBase,{...ctx,pullFlow:true,rng:createRng(1)})
assert.ok(advancingStack.targetX>staticStack.targetX,'live pull reception should leave more room for handlers')
