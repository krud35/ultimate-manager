import fs from 'node:fs'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { MATCH_CONFIG } from '../src/matchEngine/config.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { createRng } from '../src/matchEngine/rng.js'
const output=process.env.OUTPUT_FILE??'artifacts/primary-handler-dominate/cutter-before.json'
MATCH_CONFIG.pointsToWin=3
THROW_SCAN_DIAGNOSTICS.observe=()=>{}
const rows=[]
const cutting=p=>['INITIATING_CUT','ACTIVE_CUT'].includes(p.cutterState)
for(const style of ['vertical_stack','horizontal_stack','motion_offense']) for(const seed of [92701,92702]){
  Math.random=createRng(seed^0x15511551).float
  const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
  const tactics=players=>normalizeTactics({...defaultTacticsForPlayers(players),oLineAttackStyle:style,dLineAttackStyle:style})
  const session=initMatchSession({homeTeam:home,awayTeam:away,homeTactics:tactics(home.players),awayTactics:tactics(away.players),
    seed,wind:{speedMph:0,directionDeg:0},windLocked:true})
  while(session.status!=='finished')playNextPoint(session,{}, {rotateHome:false,rotateAway:false,aiHome:false,aiAway:false})
  const row={style,seed,throws:0,earlyCutActions:0,firstCutMs:[],carriedCuts:0,cancelledAtStart:0,offBallSamples:0,cutSamples:0,fillerTargets:0}
  for(const e of session.events){
    if(e.type!=='throw_attempt')continue
    row.throws++;if(e.receiverSubRole==='filler_cutter')row.fillerTargets++
    const frames=e.actionSim?.frames??[]
    const cutters=frame=>frame.players.filter(p=>p.cutterState&&p.id!==e.throwerId&&!p.audit?.isDump)
    const first=frames.find(frame=>frame.ms <= (e.actionSim?.throwMs??0)&&cutters(frame).some(cutting))
    if(first){row.firstCutMs.push(first.ms);if(first.ms<=700)row.earlyCutActions++}
    if(frames.length>1){
      const initial=cutters(frames[0]).filter(cutting)
      for(const p of initial){
        row.carriedCuts++
        const next=frames[1].players.find(n=>n.id===p.id)
        if(next&&!cutting(next))row.cancelledAtStart++
      }
    }
    for(const frame of frames)if(frame.ms<=(e.actionSim?.throwMs??0))for(const p of cutters(frame)){
      row.offBallSamples++;if(cutting(p))row.cutSamples++
    }
  }
  rows.push(row);fs.writeFileSync(output,JSON.stringify(rows,null,2));console.log(style,seed,row.throws,row.earlyCutActions,row.cancelledAtStart)
}
