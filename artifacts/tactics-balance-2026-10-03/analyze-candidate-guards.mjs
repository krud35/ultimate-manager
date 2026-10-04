import fs from 'node:fs'
import path from 'node:path'
const root = 'artifacts/engine-audit/tactics-balance-2026-10-03-validation/candidate-v1/reproduction/diagnostic-points'
const summaries = []
for (const id of fs.readdirSync(root)) for (const file of fs.readdirSync(path.join(root, id))) {
  const r = JSON.parse(fs.readFileSync(path.join(root, id, file)))
  const scans = r.scanTail.filter(s => s.attackStyle === 'hex_offense')
  const s = { id, point:r.point, scans:scans.length, failures:r.eventCounts.throw_fail, attempts:0, resets:0, actualProgress:0,
    requireForward:0, selected:0, selectedDump:0, selectedNonProgress:0, requiredNonProgress:0, alternatives:0,
    earlyRequired:0, earlyRequiredNonProgress:0, rejects:{}, activeRoutes:0, activeTargetsBehind:0,
    activeStartsBehind:0, forwardRoutes:0, targetsProgress:[], examples:[], holdMs:[], resetEcho:0, chains:[] }
  let lastAttempt, chain=[]
  const finishChain=()=>{if(chain.length)s.chains.push({n:chain.length,resets:chain.filter(t=>t.reset).length,
    progress:chain.reduce((a,t)=>a+t.progress,0), firstX:chain[0].from, lastX:chain.at(-1).to});chain=[]}
  for(const e of r.allEventMetadata){
    if(e.type==='throw_attempt'){
      lastAttempt=e
      if(e.attackStyle==='hex_offense'){s.attempts++;if(e.throwType==='dump_swing')s.resets++;s.holdMs.push(e.holdMs)}
    }
    if(e.type==='throw_success' && lastAttempt?.attackStyle==='hex_offense'){
      const sign=(lastAttempt.possessionTeam==='home'?1:-1)*(r.point%2===0?-1:1)
      const progress=(e.catchPoint.x-lastAttempt.releasePoint.x)*sign
      s.actualProgress+=progress
      chain.push({progress,reset:lastAttempt.throwType==='dump_swing',from:lastAttempt.releasePoint.x,to:e.catchPoint.x})
    }
    if(e.type==='turnover')finishChain()
  }
  finishChain()
  for(const scan of scans){
    const sign=scan.possessionTeam==='home'?1:-1
    const thrower=scan.actual.offense.find(a=>a.id===scan.throwerId)
    const best=scan.options.find(o=>o.id===scan.selectedId)
    if(scan.requireForwardPass)s.requireForward++
    if(scan.requireForwardPass && scan.hardStallCount<8)s.earlyRequired++
    for(const rej of scan.rejected)s.rejects[rej.reason]=(s.rejects[rej.reason]??0)+1
    for(const a of scan.actual.offense){
      if(a.id===scan.throwerId || a.isDump || !['ACTIVE_CUT','INITIATING_CUT'].includes(a.state))continue
      s.activeRoutes++
      const target=(a.targetX-thrower.x)*sign, ahead=(a.x-thrower.x)*sign
      if(target<0)s.activeTargetsBehind++
      if(ahead<0)s.activeStartsBehind++
      if(target>=3)s.forwardRoutes++
      s.targetsProgress.push(target)
    }
    if(!best)continue
    s.selected++;if(best.isDump)s.selectedDump++
    if(best.forwardProgress<2.5){
      s.selectedNonProgress++
      if(scan.requireForwardPass)s.requiredNonProgress++
      if(scan.requireForwardPass && scan.hardStallCount<8)s.earlyRequiredNonProgress++
      const alt=scan.options.filter(o=>o.id!==best.id && o.forwardProgress>=3 && Number.isFinite(o.score))
      if(alt.length){
        s.alternatives++
        if(s.examples.length<3)s.examples.push({serial:scan.serial,ms:scan.setupElapsedMs,hardStall:scan.hardStallCount,
          requireForward:scan.requireForwardPass,thrower:scan.throwerId,throwerX:thrower.x,selected:best,alt,
          players:scan.actual.offense.map(a=>({id:a.id,x:a.x,y:a.y,targetX:a.targetX,targetY:a.targetY,state:a.state,dump:a.isDump}))})
      }
    }
  }
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)]
  s.medianHoldMs=median(s.holdMs);s.medianTargetProgress=median(s.targetsProgress)
  delete s.holdMs;delete s.targetsProgress
  summaries.push(s)
}
fs.writeFileSync('artifacts/tactics-balance-2026-10-03/candidate-v1-guard-summary.json',JSON.stringify(summaries,null,2))
console.log(JSON.stringify(summaries.map(({examples,...s})=>s),null,2))
