import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createPullOpening, advancePullOpening, pullOpeningCue } from '../src/matchEngine/ai/pullOpening.js'
import { assignActiveCutters } from '../src/matchEngine/ai/activeCutters.js'
import { createCutterAgent, tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { simulatePoint } from '../src/matchEngine/point.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'
import { offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'

const roles=['primary_cutter','secondary_cutter','continuation_cutter','filler_cutter']
const agents=roles.map((subRole,i)=>({id:i,subRole,x:40+i*5,y:20,state:'WAITING',stackIndex:i}))
let opening=createPullOpening(99)
const advance=(dtMs,flight=null)=>opening=advancePullOpening(opening,agents,{dtMs,flight,throwerId:98,stallCount:1})
advance(20)
assignActiveCutters(agents,2,0,true,opening)
assert.deepEqual(agents.filter(a=>a.isActive).map(a=>a.subRole),roles.slice(0,2))
assert.equal(pullOpeningCue(opening,agents[0]),'prepare')
advance(1000,{receiverId:99,totalFlightMs:2000,elapsedMs:1000})
assert.equal(pullOpeningCue(opening,agents[0]),'prepare','early flight is preparation only')
advance(600,{receiverId:99,totalFlightMs:2000,elapsedMs:1600})
assert.equal(pullOpeningCue(opening,agents[0]),'offer')
assert.equal(pullOpeningCue(opening,agents[1]),'prepare')
agents[0].state='ACTIVE_CUT';agents[0].pullPreparation=true
advance(20)
advance(340)
assert.equal(pullOpeningCue(opening,agents[1]),'prepare')
advance(20)
assert.equal(pullOpeningCue(opening,agents[1]),'offer')
agents[1].state='ACTIVE_CUT';agents[1].pullPreparation=true
advance(20);advance(360)
assert.equal(pullOpeningCue(opening,agents[2]),'offer')
assert.equal(pullOpeningCue(opening,agents[3]),null)
let blocked=createPullOpening(99)
blocked=advancePullOpening(blocked,roles.map((subRole,id)=>({id,subRole,state:'WAITING'})),
 {dtMs:5000,throwerId:98,flight:null,stallCount:1})
assert.equal(blocked.phase,'offers','blocked centering must have a fallback')

const player={...structuredClone(demoHomeTeam.players[7]),traits:['double_move_cutter']}
let cutter={...createCutterAgent(player,45,23),subRole:'primary_cutter',isActive:true}
const ctx={dtSec:.02,disc:{x:20,y:18.5},throwerPos:{x:20,y:18.5},possessionTeam:'home',
 forceSide:'force_forehand',situation:{separation:10,throwWindowScore:90,cloggingLevel:0},
 rng:createRng(102),pullOpeningCue:'prepare',pullOpeningAnchor:{x:25,y:18.5},teammates:[],defenders:[]}
for(let i=0;i<50;i++) {
 cutter=tickCutterBrain(cutter,{...ctx,elapsedMs:i*20})
 assert.equal(cutter.state,'PREPARING_CUT','preparation must not launch the receiving route')
}
const dx=cutter.x-45,dy=cutter.y-23
assert.ok(dx*(cutter.targetX-45)+dy*(cutter.targetY-23)<0,'fake initially moves opposite to the receiving route')
assert.ok(Math.hypot(dx,dy)<2.5,'preparation stays local')
cutter=tickCutterBrain(cutter,{...ctx,pullOpeningCue:'offer'})
assert.equal(cutter.state,'ACTIVE_CUT','prepared cutter can go on the centering cue without another start delay')
const ordinaryPlayer={...structuredClone(player),traits:[]}
const ordinary=tickCutterBrain({...createCutterAgent(ordinaryPlayer,45,23),subRole:'primary_cutter',isActive:true},ctx)
assert.equal(ordinary.feintElapsedMs,0,'preparation alone must not count as a double move')
console.log('PASS role order, centering timing, staggered offers, early fake and blocked-center fallback')

const rows=[]
for(const style of ['vertical_stack','horizontal_stack','hex_offense','side_stack'])for(const pointIndex of [1,2]) {
 const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
 for(const team of [home,away]) team.tactics={...defaultTacticsForPlayers(team.players),
   oLineAttackStyle:style,dLineAttackStyle:style,oLineDefenseStyle:'person',dLineDefenseStyle:'person'}
 const result=simulatePoint({homeTeam:home,awayTeam:away,pullTeam:'away',pointIndex,rng:createRng(731),
   wind:{speedMph:0,directionDeg:0}})
 const start=result.events.find(e=>e.type==='point_start')
 const slots=offenseLineSlotsForAttackStyle(style)
 const roleFor=id=>resolvePlayerSubRole(home.tactics,id,slots[start.homeLineupIds.indexOf(id)])
 const throws=[]
 for(const e of result.events) {if(e.type==='turnover')break;if(e.type==='throw_attempt')throws.push(e)}
 assert.equal(throws[0].receiverSubRole,'primary_handler','opening should center before offering cutters')
 const trace=throws[0].motionTrace
 for(const frame of trace.frames.filter(f=>f.ms<trace.throwMs))for(const p of frame.players) {
   if(start.homeLineupIds.includes(p.id)&&roles.includes(roleFor(p.id)))
     assert.notEqual(p.cutterState,'ACTIVE_CUT','no receiving cut before the centering pass is released')
 }
 const firstStarts={}
 let elapsed=0
 for(const e of throws) {
   for(const frame of e.motionTrace.frames)for(const p of frame.players) {
     if(!start.homeLineupIds.includes(p.id))continue
     const role=roleFor(p.id)
     if(roles.slice(0,3).includes(role)&&p.cutterState==='ACTIVE_CUT') firstStarts[role]??=elapsed+frame.ms
   }
   elapsed+=e.motionTrace.totalMs
   if(elapsed>5000)break
 }
 assert.ok(firstStarts.primary_cutter!=null,'primary cutter must offer first')
 if(firstStarts.secondary_cutter!=null)assert.ok(firstStarts.secondary_cutter>firstStarts.primary_cutter)
 if(firstStarts.continuation_cutter!=null)assert.ok(firstStarts.continuation_cutter>firstStarts.secondary_cutter)
 assert.ok(firstStarts.primary_cutter>=trace.throwMs+trace.flightMs-500,'primary offer must align with arrival of the center pass')
 rows.push({style,pointIndex,centerReleaseMs:trace.throwMs,centerFlightMs:trace.flightMs,firstStarts})
}
fs.mkdirSync('artifacts/pull-cut-timing',{recursive:true})
fs.writeFileSync('artifacts/pull-cut-timing/points.json',JSON.stringify(rows,null,2))
console.log('PASS eight real openings, both directions: no premature cuts and primary → secondary → continuation')
