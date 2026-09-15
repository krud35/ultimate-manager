import { tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import assert from 'node:assert/strict'
import { simulatePull } from '../src/matchEngine/pull.js'
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
 const pull=simulatePull({offenseLineup,defenseLineup,possessionTeam:side,rng:createRng(seed),wind:{speedMph:seed%2?0:28,directionDeg:90}})
 outcomes.add(pull.outcome);sum[level]+=pull.distanceM;hangs[level]+=pull.hangMs
 assert.ok(pull.restart.x>=0&&pull.restart.x<=100&&pull.restart.y>=0&&pull.restart.y<=37)
 const first=pull.motionTrace.frames[0],last=pull.motionTrace.frames.at(-1)
 assert.equal(new Set(first.players.map(p=>p.x)).size,2)
 assert.equal(last.disc.state,'HELD')
 assert.ok(pull.motionTrace.totalMs<22000,'pull must finish without timeout')
 if(pull.outcome==='brick') assert.deepEqual(pull.restart,{x:side==='home'?36:64,y:18.5})
 for(const f of pull.motionTrace.frames) for(const p of f.players) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y))
}
assert.ok(sum.high>sum.low);assert.ok(hangs.high>hangs.low)
assert.ok(outcomes.has('brick')&&outcomes.has('caught')&&outcomes.has('ground'))
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
     assert.ok(frame)
   }
   if(firstThrow?.motionTrace?.frames?.length) {
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
