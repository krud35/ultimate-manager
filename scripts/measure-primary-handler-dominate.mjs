import fs from 'node:fs'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { defaultTacticsForPlayers, ATTACK_STYLES } from '../src/matchEngine/tacticsModifiers.js'
import { MATCH_CONFIG } from '../src/matchEngine/config.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { lineupForPoint } from '../src/matchEngine/participants.js'
import { offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'
import { instructionModsForPlayer, instructionsForPlayer } from '../src/matchEngine/playerInstructions.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'

const dir=process.env.OUTPUT_DIR || 'artifacts/primary-handler-dominate'
if (isMainThread) {
  fs.mkdirSync(dir,{recursive:true})
  const seeds=(process.env.SEEDS || '92701,92702,92703,92704').split(',').map(Number)
  const jobs=Object.values(ATTACK_STYLES).flatMap(style=>seeds.map(seed=>({style,seed})))
  const total=jobs.length
  const rows=[]
  const lane=async()=>{
    while(jobs.length){
      const job=jobs.shift()
      const row=await new Promise((resolve,reject)=>{
        const worker=new Worker(new URL(import.meta.url),{workerData:job})
        worker.on('message',resolve);worker.on('error',reject)
        worker.on('exit',code=>{if(code)reject(new Error(`worker exit ${code}`))})
      })
      rows.push(row)
      fs.writeFileSync(`${dir}/paired-matches.json`,JSON.stringify(rows,null,2))
      console.log(`${rows.length}/${total} ${job.style} ${job.seed}`)
    }
  }
  await Promise.all(Array.from({length:3},lane))
} else {
  MATCH_CONFIG.pointsToWin=5
  const {style,seed}=workerData
  const tacticsFor=(players,dominate)=>{
    let tactics=normalizeTactics({...defaultTacticsForPlayers(players),oLineAttackStyle:style,dLineAttackStyle:style,
      oLineDefenseStyle:'person',dLineDefenseStyle:'person',oLinePlayerInstructions:{},dLinePlayerInstructions:{}})
    if(dominate){
      const patch={}
      for(const role of ['offense','defense']){
        const lineup=lineupForPoint({players,tactics},role),slots=offenseLineSlotsForAttackStyle(style)
        patch[role==='offense'?'oLinePlayerInstructions':'dLinePlayerInstructions']=Object.fromEntries(
          lineup.filter((p,i)=>resolvePlayerSubRole(tactics,p.id,slots[i])==='primary_handler').map(p=>[p.id,['dominate']]))
      }
      tactics=normalizeTactics({...tactics,...patch})
    }
    return tactics
  }
  const run=dominate=>{
    Math.random=createRng(seed^0x15511551).float
    const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
    let session=initMatchSession({homeTeam:home,awayTeam:away,homeTactics:tacticsFor(home.players,dominate),
      awayTactics:tacticsFor(away.players,false),seed,wind:{speedMph:0,directionDeg:0},windLocked:true,collectFrames:false})
    const row={attempts:0,successes:0,phThrows:0,phTargets:0,phCompletions:0,phThrowsCompleted:0,phHoldMs:0,
      phWithOrder:0,phThrowers:{},phReceivers:{},points:0,modifiers:{},injuries:[]}
    for(const p of session.home.players){
      if(['offense','defense'].some(role=>instructionsForPlayer(session.home.tactics,p.id,role).includes('dominate'))){
        const m=instructionModsForPlayer(['dominate'],p)
        row.modifiers[p.id]={cutRollMult:m.cutRollMult,cutPriorityDelta:m.cutPriorityDelta,
          scanRadiusBonusM:m.scanRadiusBonusM,perceivedOptionsBonus:m.perceivedOptionsBonus,
          throwerPickWeightMult:m.throwerPickWeightMult,acceptanceThresholdDelta:m.acceptanceThresholdDelta}
      }
    }
    let seen=0,pointRole=null
    while(session.status!=='finished'){
      session=playNextPoint(session,{}, {rotateHome:false,rotateAway:false,aiHome:false,aiAway:false,fastMode:false,collectFrames:false})
      for(const e of session.events.slice(seen)){
        if(e.type.includes('injur')) row.injuries.push(e)
        if(e.type==='point_start'){row.points++;pointRole=e.homePointStartRole}
        if(e.possessionTeam!=='home')continue
        if(e.type==='throw_attempt'){
          row.attempts++
          if(e.throwerSubRole==='primary_handler'){
            row.phThrows++;row.phHoldMs+=(e.holdStartMs??0)+(e.actionSim?.throwMs??0)
            row.phThrowers[e.throwerId]=(row.phThrowers[e.throwerId]??0)+1
            if(instructionsForPlayer(session.home.tactics,e.throwerId,pointRole).includes('dominate'))row.phWithOrder++
          }
          if(e.receiverSubRole==='primary_handler'){
            row.phTargets++;row.phReceivers[e.receiverId]=(row.phReceivers[e.receiverId]??0)+1
          }
        }
        if(e.type==='throw_success'){
          row.successes++
          if(e.receiverSubRole==='primary_handler')row.phCompletions++
          if(e.throwerSubRole==='primary_handler')row.phThrowsCompleted++
        }
      }
      seen=session.events.length
    }
    row.score=[session.homeScore,session.awayScore]
    return row
  }
  parentPort.postMessage({style,seed,baseline:run(false),dominate:run(true)})
}
