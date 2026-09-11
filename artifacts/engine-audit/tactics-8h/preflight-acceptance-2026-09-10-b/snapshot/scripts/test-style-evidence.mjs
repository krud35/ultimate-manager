import assert from 'node:assert/strict'
import {createBoxScore} from '../src/matchEngine/boxScore.js'
import {simulatePoint,simulatePointFast} from '../src/matchEngine/point.js'
import {demoHomeTeam,demoAwayTeam} from '../src/data/demoMatchTeams.js'
import {createRng} from '../src/matchEngine/rng.js'
import {recordPlayingStyleMatch} from '../src/career/playingStyleEvidence.js'
import {observeStyleTick} from '../src/matchEngine/styleEvidence.js'
const home=structuredClone(demoHomeTeam),away=structuredClone(demoAwayTeam)
for(const [mode,simulate] of [['full',simulatePoint],['fast',simulatePointFast]]){
 const box=createBoxScore([...home.players,...away.players])
 const opts={homeTeam:structuredClone(home),awayTeam:structuredClone(away),pullTeam:'away',pointIndex:1,rng:createRng(42)}
 const result=simulate({...opts,boxScore:box})
 const controlRng=createRng(42)
 const control=simulate({...opts,homeTeam:structuredClone(home),awayTeam:structuredClone(away),rng:controlRng,boxScore:createBoxScore([...home.players,...away.players]),collectStyleEvidence:false})
 assert.equal(opts.rng.float(),controlRng.float(),'Observer preserves RNG state')
 assert.equal(result.scoringTeam,control.scoringTeam)
 assert.equal(result.throwCount,control.throwCount,'Telemetry does not consume RNG')
 const rows=Object.values(box),throws=rows.reduce((sum,row)=>sum+(row.styleEvidence?.modes?.[mode]?.counters.throws??0),0)
 assert.equal(throws,rows.reduce((sum,row)=>sum+row.attempts,0))
 assert(throws>0)
 if(mode==='full')assert(rows.some(row=>row.styleEvidence?.modes.full.counters.offenseSeconds>0))
 else assert(rows.every(row=>!row.styleEvidence?.modes.fast?.observed.includes('underCuts')))
 const league={currentDate:'2026-05-01',teamsById:{home,away}}
 const record={fixtureId:'test-'+mode,homeTeamId:'home',awayTeamId:'away',boxScore:rows}
 recordPlayingStyleMatch(league,record)
 const saved=JSON.stringify(league)
 recordPlayingStyleMatch(league,record)
 assert.equal(JSON.stringify(league),saved,'Idempotent match recording')
 assert.deepEqual(JSON.parse(saved),league,'JSON save round-trip')
 console.log(mode,throws,'throws recorded; result unchanged')
}
// Under movement without receiving a pass still counts; absence of a cut is not an attempt.
const box=createBoxScore([{id:1}]),before=new Map([[1,{x:20,y:18,state:'WAITING',cutKind:null}]])
observeStyleTick(box,before,[{id:1,x:19,y:18,state:'ACTIVE_CUT',cutKind:'in'}],[],{dtSec:.04,throwerId:2,fieldWidth:37})
assert.equal(box[1].styleEvidence.modes.full.counters.underCuts,1)
assert.equal(box[1].styleEvidence.modes.full.counters.cutStarts,1)
console.log('Behavior evidence and career persistence passed')

const player={id:1,traits:['under_cutter']},league={currentDate:'2026-05-01',teamsById:{a:{players:[player]},b:{players:[]}}}
for(let i=0;i<20;i++)recordPlayingStyleMatch(league,{fixtureId:i+1,homeTeamId:'a',awayTeamId:'b',boxScore:[{playerId:1,pointsPlayed:3,styleEvidence:box[1].styleEvidence}]})
assert.equal(player.playingStyleMatches.length,12)
assert.deepEqual(player.traits,['under_cutter'])
const beforeHistory=JSON.stringify(player.playingStyleMatches)
recordPlayingStyleMatch(league,{fixtureId:99,forfeited:true,homeTeamId:'a',awayTeamId:'b',boxScore:[{playerId:1,styleEvidence:box[1].styleEvidence}]})
assert.equal(JSON.stringify(player.playingStyleMatches),beforeHistory)
console.log('History bounded to 12 matches; forfeits ignored; traits untouched')
