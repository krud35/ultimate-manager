import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { processClubManagement } from '../src/career/clubManagement.js'
import { signFreeAgent, releasePlayerToFreeAgency, processAiContractCycle, simulateAiFreeAgentSignings } from '../src/career/transfers/freeAgency.js'
import { processWeeklyWages, ensureWorldContracts } from '../src/career/transfers/playerContracts.js'
import { processContractExpirations } from '../src/career/transfers/contractLifecycle.js'
import { queueScoutMission } from '../src/career/scouting.js'
import { runAcademyIntake, runAiAcademyPromotionPass, signAcademyCandidate } from '../src/career/academy.js'
import { discoverRegionalYouth } from '../src/career/youthPopulation.js'
import { generateIncomingTransferOffers, generateIncomingLoanOffers } from '../src/career/inbox.js'
import { buildTransferRowForPlayer, negotiateTransfer, negotiatePlayerContract, respondToIncomingBid } from '../src/career/transfers/transferEngine.js'

const world=createWorldFromTemplate(2026),all=Object.values(world.teamsById).slice(0,3),[human,off,background]=all
world.teamsById=Object.fromEntries(all.map(t=>[t.id,t]));world.teamIds=all.map(t=>t.id)
human.simulationMode='playable';off.simulationMode='off';background.simulationMode='transfers'
const career={id:'off-business',competition:'domestic',world,playerTeamId:human.id,seasonYear:2026,seasonIndex:0,inbox:[],transferLog:[],league:{currentDate:'2026-08-20',seasonYear:2026,otherLeagues:[],standings:{},fixtures:[]}}
ensureWorldContracts(world,{seasonYear:2026})
const former=structuredClone(human.players[0]);former.id='free-test';former.contract=null;former.status='free_agent';world.freeAgents=[former]
const cash=off.finances.cash,roster=off.players.map(p=>p.id),weeks=off.players.map(p=>p.contract.weeksRemaining)
assert.equal(signFreeAgent(career,{buyerTeamId:off.id,playerId:former.id}).error,'league_disabled')
assert.equal(buildTransferRowForPlayer(world,human.id,off.players[0].id),null)
assert.equal(negotiateTransfer(career,{playerId:off.players[0].id,offerAmount:1000}).error,'league_disabled')
assert.equal(negotiatePlayerContract(career,{playerId:off.players[0].id,weeklyWage:1000,years:1}).error,'league_disabled')
assert.equal(respondToIncomingBid(career,{playerId:human.players[0].id,buyerTeamId:off.id,action:'accept',fee:1000}).error,'league_disabled')
assert.equal(releasePlayerToFreeAgency(off,off.players[0],world).error,'league_disabled')
processAiContractCycle(world,{playerTeamId:human.id,league:career.league})
simulateAiFreeAgentSignings(career,{maxDeals:10,seed:34})
processWeeklyWages(world,{date:'2026-08-21'})
assert.equal(off.finances.cash,cash,'Disabled club has no weekly economic simulation')
assert.deepEqual(off.players.map(p=>p.id),roster)
assert.deepEqual(off.players.map(p=>p.contract.weeksRemaining),weeks,'Background participant registrations are retained')
off.players[0].contract.weeksRemaining=0
processContractExpirations(career)
assert(off.players.some(p=>p.id===roster[0]),'Expired dormant contract must not leak participant to free agency')
assert.equal(queueScoutMission(human,{kind:'player',targetPlayerId:off.players[0].id,world,date:'2026-08-21'}).error,'league_disabled')
assert.equal(queueScoutMission(off,{kind:'playerSearch',world,date:'2026-08-21'}).error,'league_disabled')
human.finances.cash=1e8
const search=queueScoutMission(human,{kind:'playerSearch',world,date:'2026-08-21',criteria:{}})
assert(search.ok,JSON.stringify(search))
assert(search.mission.candidateIds.every(id=>!roster.includes(id)),'Player search excludes disabled clubs')
const intake=runAcademyIntake(world,{seasonYear:2026,wave:'autumn',date:'2026-09-01'})
assert(!intake.createdByTeam[off.id])
assert.deepEqual(discoverRegionalYouth(world,off,'pl',3,()=>0.5),[])
assert.equal(signAcademyCandidate(off,'none',{world}).error,'league_disabled')
runAiAcademyPromotionPass(world,{playerTeamId:human.id,league:career.league})
assert.deepEqual(off.players.map(p=>p.id),roster)
const oldStaff=JSON.stringify(off.staffMembers),oldDate=off.managementDate
processClubManagement(career,'2026-09-02',{weekTick:true})
assert.equal(off.managementDate,oldDate);assert.equal(JSON.stringify(off.staffMembers),oldStaff)
// With all potential buying clubs disabled, no date may produce a bid or a loan offer.
background.simulationMode='off'
for(let i=1;i<=31;i++) {
 const date=`2026-08-${String(i).padStart(2,'0')}`
 career.league.currentDate=date
 assert.deepEqual(generateIncomingTransferOffers(career,{date}),[])
 assert.deepEqual(generateIncomingLoanOffers(career,{date}),[])
}
console.log('Disabled leagues: no transfers, free-agent business, payroll, academy recruitment or scouting; cup rosters preserved.')
