import { subStat as getSubStat } from './ai/statFormulas.js'
import { FIELD_DIMENSIONS as F, attackDirectionX, clampFieldX, clampFieldY } from './fieldDimensions.js'
import { layoutPlayersOnField, discPositionFromFieldMeters } from './fieldViz.js'
import { normalizeWind } from './wind.js'
import { maxSpeedMps } from './ai/statFormulas.js'
import { integrateAgentMotion } from './ai/playerMovement.js'
import { resolvePlayerSubRole } from './playerSubRoles.js'
import { offenseLineSlotsForAttackStyle } from './offenseLineSlots.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const inside = p => p.x >= 0 && p.x <= F.lengthM && p.y >= 0 && p.y <= F.widthM

/** Pulls are not pass attempts: a grounded pull keeps receiving possession. */
export function simulatePull({ offenseLineup, defenseLineup, possessionTeam, offenseTactics,
  defenseTactics, attackStyle, defenseStyle, rng, wind, collectFrames = true }) {
  const sign = attackDirectionX(possessionTeam)
  const ownLine = sign > 0 ? F.endzoneM : F.lengthM - F.endzoneM
  const pullLine = F.lengthM - ownLine
  const puller = [...defenseLineup].sort((a,b) => getSubStat(b,'throwing','pulling') - getSubStat(a,'throwing','pulling'))[0]
  const receiver = [...offenseLineup].sort((a,b) => {
    const score = p => (resolvePlayerSubRole(offenseTactics,p.id,offenseLineSlotsForAttackStyle(attackStyle)[offenseLineup.indexOf(p)]) === 'primary_handler' ? 100 : 0)
      + (p.position === 'Handler' || p.role === 'handler' ? 30 : 0) + getSubStat(p,'offensive','discReading')
    return score(b)-score(a)
  })[0]
  const skill = clamp(getSubStat(puller,'throwing','pulling') / 100, 0, 1)
  const w = normalizeWind(wind)
  const wx = Math.cos(w.directionDeg * Math.PI/180)*w.speedMps
  const wy = Math.sin(w.directionDeg * Math.PI/180)*w.speedMps
  const tail = -sign*wx
  const roller = rng.float() < (w.speedMps > 5 ? 0.32 : 0.07)
  const distance = clamp(40 + skill*34 + tail*1.3 + (rng.float()-.5)*14, 28, 84)
  const hangMs = Math.round((roller ? 2 + skill : 3.2 + skill*3 + tail*.06)*1000)
  // Aim safely inside. Residual wind/error, rather than an arbitrary OB coin flip.
  const landing = { x: pullLine-sign*distance,
    y: F.widthM/2 + (rng.float()-.5)*(4+(1-skill)*38) + wy*(1-skill)*1.6 }
  const start = {x:pullLine,y:F.widthM/2}
  let disc = {...start,z:1.1,state:'HELD'}
  const offenseLayout = layoutPlayersOnField(offenseLineup,possessionTeam,clampFieldX(landing.x),true,
    {attackStyle,throwerId:receiver.id,attackSign:sign,discYMeters:clampFieldY(landing.y)})
  const defenseLayout = layoutPlayersOnField(defenseLineup,possessionTeam === 'home' ? 'away' : 'home',clampFieldX(landing.x),false,
    {defenseStyle,offenseLayout,attackSign:sign,personMark:!String(defenseStyle).includes('zone'),defenseTactics})
  const agents = [...offenseLayout.map((p,i)=>({...p,player:offenseLineup.find(q=>q.id===p.id),
    role:'offense',x:ownLine,y:(i+1)*F.widthM/8,vx:0,vy:0})),
    ...defenseLayout.map((p,i)=>({...p,player:defenseLineup.find(q=>q.id===p.id),
      role:'defense',x:pullLine,y:p.id===puller.id?start.y:(i+1)*F.widthM/8,vx:0,vy:0}))]
  const targets = new Map([...offenseLayout,...defenseLayout].map(p=>[p.id,p]))
  const frames=[]
  const snapshot = ms => { if(collectFrames) frames.push({ms,disc:{...disc},stallCount:0,
    players:agents.map(a=>({id:a.id,teamId:a.teamId,x:a.x,y:a.y,z:0,vx:a.vx,vy:a.vy,
      role:a.fieldRole,cutterState:'WAITING'}))}) }
  const releaseMs=1000
  let outcome=null, settleMs=0, restart=null, rollV=roller?5+skill*5:0
  let elapsed=0
  snapshot(0)
  for(elapsed=100;elapsed<=22000;elapsed+=100){
    if(elapsed<=releaseMs){snapshot(elapsed);continue}
    const t=clamp((elapsed-releaseMs)/hangMs,0,1)
    if(!outcome){
      disc={x:start.x+(landing.x-start.x)*t,y:start.y+(landing.y-start.y)*t,
        z:Math.max(0,1.1*(1-t)+(roller?3:9+skill*4)*4*t*(1-t)),state:'IN_FLIGHT'}
    } else if(outcome==='rolling'){
      disc.x-=sign*rollV*.1
      disc.y+=wy*.018
      rollV=Math.max(0,rollV-.35)
      disc.z=0;disc.state='ON_GROUND'
      if(!inside(disc)||rollV===0){outcome='ground';settleMs=elapsed}
    }
    for(const a of agents){
      const receiverAgent=a.id===receiver.id
      let target=receiverAgent?{x:clampFieldX(landing.x),y:clampFieldY(landing.y)}:targets.get(a.id)
      if(restart&&receiverAgent) target=restart
      if(outcome==='rolling'&&receiverAgent) target={x:clampFieldX(disc.x),y:clampFieldY(disc.y)}
      const dist=Math.hypot(target.x-a.x,target.y-a.y)
      Object.assign(a,integrateAgentMotion(a,target.x,target.y,Math.min(maxSpeedMps(a.player),dist*3),.1,true,a.role))
    }
    const r=agents.find(a=>a.id===receiver.id)
    if(!outcome && t > .8 && inside(disc) && disc.z <= 2 && Math.hypot(r.x-disc.x,r.y-disc.y)<1.6) {
      outcome='caught';settleMs=elapsed
    }
    if(!outcome&&t>=1){
      if(!inside(landing)){outcome='brick';settleMs=elapsed}
      else if(Math.hypot(r.x-disc.x,r.y-disc.y)<1.6){outcome='caught';settleMs=elapsed}
      else {outcome=roller?'rolling':'ground';settleMs=elapsed;disc.state='ON_GROUND'}
    }
    if(outcome&&outcome!=='rolling'){
      restart ??= outcome==='brick' ? {x:ownLine+sign*18,y:F.widthM/2}
        : {x:clampFieldX(disc.x),y:clampFieldY(disc.y)}
      // A disc in the receiving end zone comes to the goal line before play.
      if(sign*(restart.x-ownLine)<0) restart.x=ownLine
      if(outcome==='caught') disc={x:r.x,y:r.y,z:1.1,state:'HELD'}
      if(outcome==='brick') disc={...restart,z:0,state:'ON_GROUND'}
      const arrived=Math.hypot(r.x-restart.x,r.y-restart.y)<.5 && Math.hypot(r.vx,r.vy)<1
      if(arrived && elapsed-settleMs >= (outcome==='caught'?100:700)){
        r.x=restart.x;r.y=restart.y;r.vx=0;r.vy=0
        disc={...restart,z:1.1,state:'HELD'};snapshot(elapsed);break
      }
    }
    snapshot(elapsed)
  }
  restart ??= {x:ownLine+sign*18,y:F.widthM/2}
  const endStates=new Map(agents.map(a=>[a.id,{id:a.id,x:a.x,y:a.y,vx:a.vx,vy:a.vy,
    role:a.role,state:'WAITING',stateMs:0,targetX:a.x,targetY:a.y}]))
  return {pullerId:puller.id,receiverId:receiver.id,receiver,outcome,roller,hangMs,landing,restart,
    discPosition:discPositionFromFieldMeters(restart.x,possessionTeam),discYMeters:restart.y,endStates,
    motionTrace:{frames,tickMs:100,throwMs:releaseMs,totalMs:Math.min(elapsed,22000),
      flightMs:Math.min(elapsed,22000)-releaseMs,preservePositions:true},
    distanceM:distance}
}
