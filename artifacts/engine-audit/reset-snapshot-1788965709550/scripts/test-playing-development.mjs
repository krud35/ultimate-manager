import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { recordMatchDevelopment, matchDevelopmentCredit } from '../src/career/matchDevelopment.js'
import { developmentListingDecision, refreshAiDevelopmentListings } from '../src/career/developmentListings.js'
import { applyDailyDevelopment } from '../src/career/playerDevelopment.js'
import { setPlayerLoanListed, setPlayerTransferListed } from '../src/career/transfers/transferEngine.js'
import { getOverallRating } from '../src/models/playerStats.js'
const world=createWorldFromTemplate(2025),teams=Object.values(world.teamsById)
let passed=0
function test(name,fn){fn();console.log('OK '+name);passed++}
const young=()=>({...structuredClone(teams[0].players[0]),age:19,potential:95,form:90,developmentFatigue:0})
test('Actual participation, age, form, competition and potential control experience',()=>{
 const p=young(),args={share:.5,tier:2,opponentOverall:80},credit=matchDevelopmentCredit(p,args)
 assert.equal(matchDevelopmentCredit(p,{...args,share:0}),0)
 assert(credit>matchDevelopmentCredit(p,{...args,share:.05}))
 assert(credit>matchDevelopmentCredit({...p,age:29},args))
 assert(credit>matchDevelopmentCredit({...p,form:35},args))
 assert(credit>matchDevelopmentCredit(p,{...args,tier:3}))
 assert.equal(matchDevelopmentCredit({...p,potential:getOverallRating(p.skills)},args),0)
})
test('Only participants grow, with persistent fractional credit and replay protection',()=>{
 const home=structuredClone(teams[0]),away=structuredClone(teams[1]);home.players[0]=young()
 const player=home.players[0],bench=home.players[1],before=JSON.stringify(bench.skills)
 const league={teamsById:{[home.id]:home,[away.id]:away},currentDate:'2025-09-01'}
 const record={fixtureId:'growth-match',homeTeamId:home.id,awayTeamId:away.id,homeScore:15,awayScore:10,boxScore:[{playerId:player.id,pointsPlayed:14}]}
 recordMatchDevelopment(league,record);assert(player.matchDevelopmentGains>0);assert.equal(JSON.stringify(bench.skills),before);assert.equal(bench.recentPlayingTime[0].share,0)
 const after=JSON.stringify(league);recordMatchDevelopment(league,record);assert.equal(JSON.stringify(league),after)
 const loaded=structuredClone(league);recordMatchDevelopment(loaded,record);assert.equal(JSON.stringify(loaded),after)
 recordMatchDevelopment(league,{...record,fixtureId:'forfeit',forfeited:true});assert.equal(JSON.stringify(league),after)
})
test('Regular lower-tier play earns more experience than being benched in a top club',()=>{
 const player=young();let loan=0,bench=0
 for(let i=0;i<20;i++){
  loan+=matchDevelopmentCredit(player,{share:.5,tier:3,opponentOverall:70})
  bench+=matchDevelopmentCredit(player,{share:0,tier:1,opponentOverall:85})
 }
 assert(loan>10);assert.equal(bench,0)
})
test('Academy fatigue recovers daily, rest speeds recovery, injured juniors do not grow',()=>{
 const p=young();p.developmentFatigue=50;p.injury={label:'strain',daysRemaining:10}
 const t={id:'junior-club',players:[],academyPlayers:[p]},league={teamsById:{[t.id]:t},currentDate:'2025-09-01'}
 const skills=JSON.stringify(p.skills);applyDailyDevelopment(league,{date:'2025-09-01'});assert.equal(p.developmentFatigue,48);assert.equal(p.injury.daysRemaining,9);assert.equal(JSON.stringify(p.skills),skills)
 p.trainingFocus='rest';applyDailyDevelopment(league,{date:'2025-09-02'});assert.equal(p.developmentFatigue,44);assert.equal(p.injury.daysRemaining,7)
})
test('AI distinguishes blocked prospects and expendable reserves using actual appearances',()=>{
 const team=structuredClone(teams[0]);team.players.sort((a,b)=>getOverallRating(b.skills)-getOverallRating(a.skills))
 const player=team.players.at(-1);player.age=20;player.potential=99;player.loan=null;player.injury=null
 player.recentPlayingTime=Array.from({length:4},(_,i)=>({teamId:team.id,date:`2025-09-${10+i}`,available:true,share:0}))
 assert.equal(developmentListingDecision(player,team,'2025-09-20'),'loan')
 const w={teamsById:{[team.id]:team}};refreshAiDevelopmentListings(w,{date:'2025-09-20'});assert(player.loanListed&&!player.transferListed)
 player.potential=getOverallRating(player.skills);assert.equal(developmentListingDecision(player,team,'2025-09-20'),'transfer')
 refreshAiDevelopmentListings(w,{date:'2025-09-28'});assert(player.transferListed&&!player.loanListed)
 player.recentPlayingTime.forEach(r=>r.share=.5);refreshAiDevelopmentListings(w,{date:'2025-10-06'});assert(!player.transferListed&&!player.loanListed)
 player.recentPlayingTime.forEach(r=>{r.share=0;r.available=false});assert.equal(developmentListingDecision(player,team,'2025-10-06'),null)
})
test('Manual loan listing is mutually exclusive, preserves skills, and cannot relist a loanee',()=>{
 const team=structuredClone(teams[0]),p=team.players[0],before=JSON.stringify(p.skills)
 assert(setPlayerTransferListed(team,p.id,true).ok);assert(setPlayerLoanListed(team,p.id,true).ok);assert(p.loanListed&&!p.transferListed)
 assert(setPlayerTransferListed(team,p.id,true).ok);assert(p.transferListed&&!p.loanListed);assert.equal(JSON.stringify(p.skills),before)
 p.loan={parentTeamId:'other'};assert.equal(setPlayerLoanListed(team,p.id,true).error,'on_loan')
})
console.log(`Passed ${passed} playing development tests`)
