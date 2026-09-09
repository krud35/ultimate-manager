import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { buildEucsLeagueTemplate, eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { clubBudgetAllocation, setClubBudgetAllocation, ensureClubEconomy, postClubCash, clubCash, seasonWageReserve } from '../src/career/clubEconomy.js'
import { processWeeklyWages, signPlayerContract } from '../src/career/transfers/playerContracts.js'
import { computeMarketValue } from '../src/career/transfers/playerValue.js'
import { createRng } from '../src/matchEngine/rng.js'
import { adjustClubBudget, budgetAdjustmentStatus } from '../src/career/clubEconomy.js'
const rng=createRng(17); Math.random=()=>rng.float()
let count=0
function test(name,fn) { fn(); console.log('OK '+name); count++ }
function make(){const t={id:'a',managementDate:'2025-08-01',players:[{id:'p',contract:{weeklyWage:1000,weeksRemaining:100}}],finances:{cash:100_000,transferBudget:100_000}}; ensureClubEconomy(t); clubBudgetAllocation(t); return t}
function invariant(t){const a=clubBudgetAllocation(t); assert.equal(a.cash,a.transferBudget+a.seasonPayrollBudget); assert(Math.abs(a.weeklyWageLimit*a.weeks-a.seasonPayrollBudget)<0.000001); return a}
test('Slider moves equal amounts and never creates money',()=>{
 const t=make(), cash=clubCash(t), ledger=JSON.stringify(t.finances.ledger)
 assert(setClubBudgetAllocation(t,78_000).ok); const a=invariant(t)
 assert.equal(a.transferBudget,22_000); assert.equal(a.weeklyWageLimit,1500)
 assert(setClubBudgetAllocation(t,52_000).ok); assert.equal(invariant(t).transferBudget,48_000)
 assert.equal(clubCash(t),cash); assert.equal(JSON.stringify(t.finances.ledger),ledger)
})
test('Slider protects contracts and refuses unavailable cash',()=>{
 const t=make(), before=JSON.stringify(invariant(t))
 for(const v of [51_999,100_001,NaN,Infinity]) assert(!setClubBudgetAllocation(t,v).ok)
 assert.equal(JSON.stringify(invariant(t)),before)
})
test('More wages enable a signing without charging the transfer wallet',()=>{
 const t=make(), p={id:'new'}; setClubBudgetAllocation(t,52_000)
 assert(!signPlayerContract(t,p,{weeklyWage:500,years:1,signedDate:t.managementDate}).ok)
 setClubBudgetAllocation(t,78_000)
 assert(signPlayerContract(t,p,{weeklyWage:500,years:1,signedDate:t.managementDate}).ok)
 t.players.push(p); assert.equal(invariant(t).transferBudget,22_000); assert.equal(clubCash(t),100_000)
})
test('Wage payments use wage allocation; purchases and income use transfer allocation',()=>{
 const t=make(); setClubBudgetAllocation(t,78_000); t.managementDate='2025-08-03'
 processWeeklyWages({teamsById:{a:t}},{date:t.managementDate})
 assert.equal(invariant(t).seasonPayrollBudget,77_000); assert.equal(invariant(t).transferBudget,22_000)
 postClubCash(t,-2000,'match_travel'); assert.equal(invariant(t).transferBudget,20_000)
 postClubCash(t,3000,'sponsorship'); assert.equal(invariant(t).transferBudget,23_000)
})
test('Save/reload preserves slider; season boundary resets once without cash injection',()=>{
 const t=make(); setClubBudgetAllocation(t,80_000)
 const saved=structuredClone(t); assert.equal(invariant(saved).seasonPayrollBudget,80_000)
 saved.managementDate='2026-07-31'; assert.equal(invariant(saved).seasonPayrollBudget,0)
 saved.managementDate='2026-08-01'; invariant(saved); const snapshot=JSON.stringify(saved)
 invariant(saved); assert.equal(JSON.stringify(saved),snapshot); assert.equal(clubCash(saved),100_000)
})
test('Legacy cash and an unfunded deficit remain visible and reconcile',()=>{
 const t={id:'old',players:[],finances:{transferBudget:70_000,salaryBudget:30_000}}
 assert.equal(invariant(t).cash,100_000)
 const poor=make(); postClubCash(poor,-90_000,'unavoidable_loss')
 const a=invariant(poor); assert(a.transferBudget<0); assert(!setClubBudgetAllocation(poor,10_000).ok)
})
const initial=[]
test('Manager adjustment locks both screens for 30 game days and survives reload',()=>{
 const t=make(); assert(adjustClubBudget(t,78_000).ok)
 const copy=structuredClone(t), before=JSON.stringify(copy)
 assert.equal(budgetAdjustmentStatus(copy).nextDate,'2025-08-31')
 assert.equal(adjustClubBudget(copy,52_000).error,'budget_adjustment_cooldown')
 assert.equal(JSON.stringify(copy),before)
 copy.managementDate='2025-08-30'; assert(!adjustClubBudget(copy,52_000).ok)
 copy.managementDate='2025-08-31'; assert(adjustClubBudget(copy,52_000).ok)
 assert.equal(budgetAdjustmentStatus(copy).nextDate,'2025-09-30')
 invariant(copy)
})
test('Invalid and unchanged adjustments consume no opportunity; year change does not bypass lock',()=>{
 const t=make(); const current=invariant(t).seasonPayrollBudget
 assert(!adjustClubBudget(t,1).ok); assert.equal(t.finances.lastBudgetAdjustmentDate,undefined)
 assert(adjustClubBudget(t,current).ok); assert.equal(t.finances.lastBudgetAdjustmentDate,undefined)
 t.managementDate='2025-12-20'; assert(adjustClubBudget(t,70_000).ok)
 t.managementDate='2026-01-01'; assert(!budgetAdjustmentStatus(t).available)
 t.managementDate='2026-01-19'; assert(budgetAdjustmentStatus(t).available)
})
for(const size of [16,48]) test('New '+size+'-club world funds every season payroll plus a cushion',()=>{
 const templates=size===48?[1,2,3].flatMap(tier=>buildEucsLeagueTemplate({tier,teamIds:eucsTeamsForTier(tier).map(t=>t.id),seed:17}).teams):undefined
 const w=createWorldFromTemplate(2025,{teams:templates}); const teams=Object.values(w.teamsById)
 for(const t of teams){const a=invariant(t); assert(a.cash>=seasonWageReserve(t)); assert(a.transferBudget>0); assert(t.finances.startingCushion>150_000)}
 const median=arr=>arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)]
 initial.push({clubs:size,minCash:Math.min(...teams.map(clubCash)),medianCash:median(teams.map(clubCash)),minTransfer:Math.min(...teams.map(t=>invariant(t).transferBudget)),medianTransfer:median(teams.map(t=>invariant(t).transferBudget)),medianPlayerValue:median(teams.flatMap(t=>t.players.map(p=>computeMarketValue(p)))),fundedClubs:teams.filter(t=>clubCash(t)>=seasonWageReserve(t)).length})
})
writeFileSync('artifacts/finance-allocation-starting-worlds.json',JSON.stringify(initial,null,2))
console.log(JSON.stringify(initial)); console.log('Passed '+count+' allocation tests')
