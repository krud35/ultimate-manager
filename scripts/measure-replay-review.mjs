import fs from 'node:fs'
import path from 'node:path'
const out=path.resolve(process.argv[2]),sample=JSON.parse(fs.readFileSync(path.join(out,'VISUAL-SAMPLE.json'))),rows=[]
for(const meta of sample){
const r=JSON.parse(fs.readFileSync(path.join(out,'replays',meta.file))),idx=r.selectedAction===0?0:Math.min(1,r.clips.length-1),scan=r.scans[0]
const clips=r.clips.map((c,i)=>{
const near=t=>c.frames.reduce((a,b)=>Math.abs(b.ms-t)<Math.abs(a.ms-t)?b:a),f=near(c.throwMs),start=c.frames[0],end=c.frames.at(-1)
const off=f.players.filter(p=>p.cutterState),def=f.players.filter(p=>p.defenderState),thrower=f.players.find(p=>p.id===c.throwerId),recv=f.players.find(p=>p.id===c.receiverId)
const direction= c.frames[0].players.find(p=>p.id===c.throwerId)?.x>80 ? -1:1
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),pnum=p=>p.id.split('-p').at(-1)
return {i,throwType:c.throwType,releaseMs:c.throwMs,thrower:pnum(thrower),receiver:recv?pnum(recv):null,throwerXY:[thrower.x,thrower.y],receiverXY:recv?[recv.x,recv.y]:null,
 releaseDepth:Math.max(...off.map(p=>p.x))-Math.min(...off.map(p=>p.x)),releaseWidth:Math.max(...off.map(p=>p.y))-Math.min(...off.map(p=>p.y)),
 nearestReceiverDefender:recv?Math.min(...def.map(p=>d(p,recv))):null,
 compactPlayers:off.map(p=>({id:pnum(p),x:p.x,y:p.y,state:p.cutterState,stateMs:p.audit?.stateMs,targetX:p.audit?.targetX,targetY:p.audit?.targetY,travel:d(p,start.players.find(q=>q.id===p.id)),nearest:Math.min(...def.map(q=>d(p,q)))})),
 outcome:c.resolution,flightEnd:end.disc,frames:c.frames.length}
})
rows.push({name:meta.name,file:meta.file,job:r.jobId,point:r.pointIndex,selected:idx,
 actualStyle:scan?{attack:scan.attackStyle,defense:scan.defenseStyle,force:scan.forceSide}:null,
 clips,scan:scan?{selected:scan.selectedId,threshold:scan.threshold,options:scan.options,rejected:scan.rejected,stall:scan.hardStallCount}:null})
}
fs.writeFileSync(path.join(out,'VISUAL-MEASUREMENTS.json'),JSON.stringify(rows,null,2))
console.log(JSON.stringify(rows.map(r=>({...r,clips:r.clips.map(({compactPlayers,outcome,...c})=>({...c,outcome:outcome?.diagnosis??outcome}))})),null,2))
