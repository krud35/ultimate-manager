import assert from 'node:assert/strict'
import fs from 'node:fs'
import { simulatePoint } from '../src/matchEngine/point.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { defaultTacticsForPlayers, ATTACK_STYLES } from '../src/matchEngine/tacticsModifiers.js'
import { offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'
import { pullHandlerTarget, pullFlowIsOpen } from '../src/matchEngine/ai/pullFlow.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'

for(const attackSign of [-1,1])for(const y of [.5,18.5,36.5]) {
 const disc={x:50,y}
 const ph=pullHandlerTarget({subRole:'primary_handler',handlerSlotIndex:0,disc,attackSign})
 const rh=pullHandlerTarget({subRole:'reset_handler',handlerSlotIndex:1,disc,attackSign})
 const following=pullHandlerTarget({subRole:'reset_handler',handlerSlotIndex:2,disc,attackSign})
 assert.equal(ph.y,18.5)
 assert.ok((ph.x-disc.x)*attackSign>0)
 assert.ok(Math.hypot(ph.x-rh.x,ph.y-rh.y)>3)
 assert.ok(Math.hypot(ph.x-following.x,ph.y-following.y)>3)
}
assert.equal(pullFlowIsOpen(true,[{x:30,y:10}],{x:10,y:10}),true)
assert.equal(pullFlowIsOpen(true,[{x:18,y:10}],{x:10,y:10}),false)
assert.equal(pullFlowIsOpen(false,[{x:30,y:10}],{x:10,y:10}),false)

// A real throw scan must choose the open, central primary handler before coverage arrives.
const offenseLineup=structuredClone(demoHomeTeam.players.slice(0,7))
const defenseLineup=structuredClone(demoAwayTeam.players.slice(0,7))
const tactics={attackStyle:'vertical_stack',playerSubRoles:{[offenseLineup[0].id]:'primary_handler',
 [offenseLineup[1].id]:'reset_handler'}}
const seedStates=new Map([...offenseLineup.map((p,i)=>[p.id,{id:p.id,role:'offense',
 x:i===1?10:i===0?15:30+i*3,y:i===1?8:i===0?18.5:10+i*3,vx:0,vy:0,state:'WAITING'}]),
 ...defenseLineup.map((p,i)=>[p.id,{id:p.id,role:'defense',x:80,y:5+i*4,vx:0,vy:0}])])
const simulate=(active,close=false)=>runContinuousThrowSimulation({rng:createRng(55221),thrower:offenseLineup[1],
 offenseLineup,defenseLineup,offenseTeam:{players:offenseLineup,tactics},
 defenseTeam:{players:defenseLineup,tactics:{defenseStyle:'person'}},possessionTeam:'home',
 discPosition:10,discYMeters:8,stallCount:1,pullTransitionActive:active,onThrowCommitted:()=>({}),
 seedStates:close?new Map([...seedStates].map(([id,s])=>[id,s.role==='defense'?{...s,x:14,y:8}:s])):seedStates})
const open=simulate(true)
assert.equal(open.receiver?.id,offenseLineup[0].id,'reset should center to the open primary handler')
assert.equal(open.pullTransitionActive,true,'unpressured first pass retains the phase')
assert.ok(open.throwMs<1000,'open handler pass should release promptly')
assert.equal(simulate(true,true).pullTransitionActive,false,'coverage must end the phase')
assert.equal(simulate(false).pullTransitionActive,false,'ordinary possessions must not reopen pull flow')
console.log('PASS primary centering, separate support lanes, real first pass, quick release and coverage cutoff')

const rows=[]
for(const style of Object.values(ATTACK_STYLES))for(const seed of [731,732]) {
 const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
 for(const team of [home,away]) team.tactics={...defaultTacticsForPlayers(team.players),
   oLineAttackStyle:style,dLineAttackStyle:style,oLineDefenseStyle:'person',dLineDefenseStyle:'person'}
 const result=simulatePoint({homeTeam:home,awayTeam:away,pullTeam:'away',pointIndex:seed===731?1:2,
   rng:createRng(seed),wind:{speedMph:0,directionDeg:0}})
 const pull=result.events.find(e=>e.type==='pull')
 const start=result.events.find(e=>e.type==='point_start')
 const slots=offenseLineSlotsForAttackStyle(style)
 const receiverRole=resolvePlayerSubRole(home.tactics,pull.receiverId,slots[start.homeLineupIds.indexOf(pull.receiverId)])
 assert.equal(receiverRole,'reset_handler','default pull reception belongs to a reset handler')
 const throws=result.events.filter(e=>e.type==='throw_attempt')
 const first=throws[0]
 assert.equal(first.throwerId,pull.receiverId)
 const last=pull.motionTrace.frames.at(-1)
 const offenseGeo=last.players.find(p=>p.id===pull.receiverId).teamId
 const pressure=Math.min(...last.players.filter(p=>p.teamId!==offenseGeo).map(p=>Math.hypot(p.x-pull.restart.x,p.y-pull.restart.y)))
 rows.push({style,seed,outcome:pull.outcome,receiverRole,nearestDefenseM:pressure,
   passes:throws.slice(0,4).map(e=>({team:e.possessionTeam,from:e.throwerSubRole,to:e.receiverSubRole,
     holdMs:e.holdMs,throwMs:e.actionSim?.throwMs,throwerId:e.throwerId,receiverId:e.receiverId}))})
}
fs.mkdirSync('artifacts/pull-handler-flow',{recursive:true})
fs.writeFileSync('artifacts/pull-handler-flow/points.json',JSON.stringify(rows,null,2))
console.log('PASS default reset reception and first throw in 14 points / 7 formations / both directions')
console.log(rows.map(r=>({style:r.style,seed:r.seed,pressure:r.nearestDefenseM.toFixed(1),first:r.passes[0]?.to})))
