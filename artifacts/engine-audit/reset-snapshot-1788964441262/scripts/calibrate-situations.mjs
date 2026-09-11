import fs from 'node:fs'
import { bodyExposure } from './body-exposure.mjs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createRng } from '../src/matchEngine/rng.js'
import { PLAYER_STAT_CATEGORIES } from '../src/models/playerStats.js'
import { createFlightContext, FLIGHT_APPROACH_CALIBRATION } from '../src/matchEngine/ai/flightKinematics.js'
import { scoreThrowShape } from '../src/matchEngine/ai/throwShape.js'
import { selectDiscIntercept } from '../src/matchEngine/ai/discIntercept.js'
import { maxSpeedMps } from '../src/matchEngine/ai/statFormulas.js'
import { sampleContinuedDisc } from '../src/matchEngine/ai/discTrajectory.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { resolveThrow, computeMissDistanceM, MISS_CALIBRATION } from '../src/matchEngine/resolution.js'
import { discPositionFromFieldMeters } from '../src/matchEngine/fieldViz.js'
import { makeDeflection } from '../src/matchEngine/ai/discDeflection.js'
import { scanThrowOptions } from '../src/matchEngine/ai/throwerBrain.js'
import { resetPlayerPerception } from '../src/matchEngine/ai/playerPerception.js'

const args=process.argv.slice(2), opt=(key,d)=>args.includes(key)?args[args.indexOf(key)+1]:d
const n=Number(opt('--n',32)), offset=Number(opt('--offset',24000)), output=opt('--output','artifacts/scenarios/baseline.json')
if (!Number.isInteger(n) || n < 1 || !Number.isInteger(offset)) throw new Error('Invalid sample count or seed offset')
// Mix counters before the production LCG to avoid correlated first draws.
function scenarioSeed(i) {
 let x=(offset+i)>>>0
 x=Math.imul(x^(x>>>16),0x21f0aaad)
 x=Math.imul(x^(x>>>15),0x735a2d97)
 return (x^(x>>>15))>>>0
}
FLIGHT_APPROACH_CALIBRATION.enabled=opt('--approach','paced')!=='sprint'
FLIGHT_APPROACH_CALIBRATION.readDelayScale=Number(opt('--read-scale',1))
const cases=[
 {id:'incut',to:[43,18],receiver:[47,18,-4,0],ms:800},
 {id:'reset',to:[28,18],receiver:[28,18,0,0],ms:650,type:'dump_swing',trajectory:'lateral'},
 {id:'turn_toward',to:[45,18],receiver:[41,18,5,0],ms:1000},
 {id:'turn_away',to:[45,18],receiver:[41,18,-5,0],ms:1000},
 {id:'double_coverage',to:[68,18],receiver:[62,18,5,0],ms:2600,type:'huck',trajectory:'deep',defenders:[[64,17.7,0,0],[66,18.5,0,0]]},
 {id:'deep_open',to:[68,18],receiver:[62,18,5,0],ms:2600,type:'huck',trajectory:'deep'},
 {id:'sideline',from:[35,1],to:[48,.3],receiver:[46,.3,2,0],ms:1200},
 {id:'returning_arc',from:[35,.3],to:[55,.3],receiver:[53,.3,2,0],ms:1700,amplitude:2,curveSign:-1},
 {id:'outside',from:[35,1],to:[50,-4],receiver:[49,1,0,0],ms:1200},
 {id:'toe_in',from:[49.4,.05],to:[50,-.05],receiver:[50,-.05,0,0],ms:200,z:.05,vz:-1},
 {id:'toe_out',from:[49.4,-.6],to:[50,-.6],receiver:[50,-.6,0,0],ms:200,z:.05,vz:-1},
 {id:'tip_recovery',to:[55,18],receiver:[56,18,0,0],helper:[51.2,19,-2,0],ms:1500,tip:true},
 ...[0,90,180].map(direction=>({id:'wind_'+direction,to:[55,18],receiver:[52,18,2,0],ms:1500,wind:{speedMph:20,directionDeg:direction}})),
 {id:'aim_error_reset',to:[28,18],receiver:[28,18,0,0],ms:650,type:'dump_swing',trajectory:'lateral',forcedMiss:1.2},
 {id:'fatigued_incut',to:[43,18],receiver:[47,18,-4,0],ms:800,energy:20},
]
function player(id,skill=80,energy=100){return {id,name:'Scenario '+id,role:'cutter',traits:[],morale:72,currentStamina:energy,
 skills:Object.fromEntries(Object.entries(PLAYER_STAT_CATEGORIES).map(([c,ks])=>[c,Object.fromEntries(ks.map(k=>[k,skill]))]))}}
function agent(p,xy,extra={}){return {id:p.id,player:p,x:xy[0],y:xy[1],vx:xy[2]??0,vy:xy[3]??0,z:0,vz:0,
 state:'ACTIVE_CUT',stateMs:100,targetX:xy[0]+(xy[2]??0),targetY:xy[1]+(xy[3]??0),isThrower:false,isDump:false,
 stackIndex:0,lastGroundInBounds:true,...extra}}
const rows=[], started=performance.now()
for(const c of cases)for(const layer of ['ideal','execution'])for(let i=0;i<n;i++){
 const seed=scenarioSeed(i), energy=c.energy == null ? 100 : Number(opt('--fatigued-energy', c.energy))
 const thrower=player(1,80,energy),receiver=player(2,80,energy)
 for(const k of PLAYER_STAT_CATEGORIES.throwing)thrower.skills.throwing[k]=Number(opt('--throw-skill',80))
 receiver.skills.offensive.catching=Number(opt('--catch-skill',80))
 const from=c.from??[35,18],to=c.to,trajectory=c.trajectory??'forward',type=c.type??'standard'
 const offense=[agent(thrower,from,{isThrower:true,teamId:'home'}),agent(receiver,c.receiver,{z:c.z??0,vz:c.vz??0,jumping:(c.z??0)>0,teamId:'home'})]
 if(c.helper)offense.push(agent(player(3),c.helper,{teamId:'home'}))
 const defense=(c.defenders??[]).map((d,j)=>agent(player(10+j,Number(opt('--defender-skill',80))),d,{teamId:'away',state:'COVERING_CUTTER',markTargetId:2}))
 const dx=to[0]-from[0],dy=to[1]-from[1],dist=Math.hypot(dx,dy)||1
 const shape=scoreThrowShape({arc:'normal',curve:'natural',curveSign:c.curveSign??1},{fromX:from[0],fromY:from[1],toX:to[0],toY:to[1],
 perpX:-dy/dist,perpY:dx/dist,defenders:defense,basePeakM:trajectory==='deep'?3:1.6,baseFlightMs:c.ms,
 baseAmplitudeM:c.amplitude??.4,releaseHeightM:1.1,deliveryHeightM:trajectory==='deep'?1.6:1.15,
 loftStat:80,wind:c.wind??null,windControl:80,spinRadSec:57})
 const arrival=selectDiscIntercept({agent:offense[1],player:receiver,role:'offense',speed:maxSpeedMps(receiver),elapsedMs:0,
 totalMs:shape.plan.totalMs+12000,sample:ms=>sampleContinuedDisc(shape.plan,ms),blockers:[...offense,...defense]})
 shape.plannedArrival=arrival;shape.validationStatus=arrival.reachable?'reachable':'forced_late'
 const executionRng=createRng(seed^0x4132)
 const execution=resolveThrow({thrower,receiver,defender:defense[0]?.player??null,executionOnly:true,rng:executionRng,
 throwType:type,throwDistanceM:dist,throwDx:dx,throwDy:dy,stallCount:2,separation:{outcome:'open'},wind:c.wind??null})
 const miss=layer==='execution'?c.forcedMiss??Math.min(computeMissDistanceM(execution.throwScore,execution.defenseScore,execution.throwStat,executionRng),dist*MISS_CALIBRATION.missDistanceFractionCap):0
 const angle=executionRng.float()*Math.PI*2
 const flight=createFlightContext({fromX:from[0],fromY:from[1],toX:to[0]+Math.cos(angle)*miss,toY:to[1]+Math.sin(angle)*miss,
 aimX:to[0],aimY:to[1],thrower,receiver,receiverAgent:offense[1],receiverId:2,throwerId:1,defenderId:defense[0]?.id,
 throwType:type,trajectory,plannedShape:shape,chosenFlightSpeedMps:dist/(c.ms/1000),rng:createRng(seed^0x7243),resolution:execution,throwMs:0,weather:c.wind??null})
 if(layer==='ideal'){flight.trajectoryPlan=shape.plan;flight.totalFlightMs=shape.plan.totalMs;flight.arcExecutionError=0;flight.curveExecutionError=0}
 if(c.tip){flight.deflection=makeDeflection({x:50,y:18,z:1.2},{x:7,y:0,z:-1},0,true);flight.touches=[{x:50,y:18,z:1.2,ms:0,type:'lane_block',inBounds:true}]}
 const decision={receiver,receiverAgent:offense[1],throwType:type,defender:defense[0]?.player,throwMs:0,holdMs:0,stallCount:2,isOpenSide:true,plannedShape:shape}
 const result=runContinuousThrowSimulation({rng:createRng(seed^0x1921),thrower,offenseLineup:offense.map(a=>a.player),defenseLineup:defense.map(a=>a.player),
 possessionTeam:'home',discPosition:discPositionFromFieldMeters(from[0],'home'),discYMeters:from[1],stallCount:2,
 offenseTeam:{players:offense.map(a=>a.player),tactics:{}},defenseTeam:{players:defense.map(a=>a.player),tactics:{}},wind:c.wind??null,
 initialFlightState:{flight,decision,offenseAgents:offense,defenseAgents:defense}})
 const resolution=result.geometricResolution
 const exposure=bodyExposure(result.frames,[...offense,...defense].map(a=>a.player))
 rows.push({case:c.id,layer,seed,exposure,plannedReachable:arrival.reachable,plannedLegal:arrival.legal,plannedAtMs:arrival.atMs,
 success:resolution.success,reason:resolution.reason,diagnosis:resolution.diagnosis,contact:resolution.contact,landing:resolution.landing,
 durationMs:result.motionTrace.totalMs,outsideAir:result.frames.some(f=>f.disc?.z>0&&(f.disc.y<0||f.disc.y>37||f.disc.x<0||f.disc.x>100)),
 frames:i<2?result.frames.map(f=>({ms:f.ms,disc:f.disc,players:f.players})):undefined})
}
const summaries=[]
for(const c of cases)for(const layer of ['ideal','execution']){const r=rows.filter(r=>r.case===c.id&&r.layer===layer),reasons={};for(const x of r)reasons[x.reason]=(reasons[x.reason]??0)+1
 summaries.push({case:c.id,layer,n:r.length,completed:r.filter(r=>r.success).length,plannedReachable:r.filter(r=>r.plannedReachable).length,
 plannedLegal:r.filter(r=>r.plannedLegal).length,reasons,meanMs:r.reduce((s,r)=>s+r.durationMs,0)/r.length})}
const decisions=[]
for(const c of cases.filter(c=>!c.tip&&!c.z))for(let i=0;i<Math.min(n,16);i++){
 const p=player(1),a=agent(p,c.from??[35,18],{isThrower:true}),r=agent(player(2),c.receiver,{isDump:c.id==='reset'})
 const d=(c.defenders??[]).map((xy,j)=>agent(player(10+j),xy));resetPlayerPerception(p)
 let selected=null;for(const ms of [0,260,520,780,1040])selected=scanThrowOptions(p,[a,r],d,{disc:{x:a.x,y:a.y},setupElapsedMs:ms,
 stallCount:2,possessionTeam:'home',rng:createRng(scenarioSeed(i)^ms),wind:c.wind??null,offenseTactics:{}})
 decisions.push({case:c.id,seed:scenarioSeed(i),selected:!!selected,validationStatus:selected?.validationStatus??null,plannedArrival:selected?.plannedArrival??null})
}
const hashes=Object.fromEntries(['actionSimulator','flightKinematics','playerMovement','discIntercept','catchRules','throwDiagnosis','statFormulas','throwerBrain'].map(f=>[f,createHash('sha256').update(fs.readFileSync('src/matchEngine/ai/'+f+'.js')).digest('hex')]))
for(const file of ['scripts/calibrate-situations.mjs','src/matchEngine/resolution.js','src/matchEngine/point.js']) hashes[file]=createHash('sha256').update(fs.readFileSync(file)).digest('hex')
fs.mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});fs.writeFileSync(output,JSON.stringify({n,offset,calibration:FLIGHT_APPROACH_CALIBRATION,throwSkill:Number(opt('--throw-skill',80)),catchSkill:Number(opt('--catch-skill',80)),elapsedMs:performance.now()-started,hashes,summaries,decisions,rows},null,2))
console.table(summaries);console.log(output)
