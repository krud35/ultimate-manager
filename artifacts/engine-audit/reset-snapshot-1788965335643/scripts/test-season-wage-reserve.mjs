import assert from 'node:assert/strict'
import { ensureClubEconomy, seasonWageReserve, remainingPayrollWeeks, canAffordContract, syncLoanFinancialCommitments, clubCash, setClubBudgetAllocation } from '../src/career/clubEconomy.js'
import { getTransferBudget } from '../src/career/transfers/clubFinances.js'
import { signPlayerContract, processWeeklyWages } from '../src/career/transfers/playerContracts.js'
import { completeTransferBetweenClubs } from '../src/career/transfers/transferEngine.js'
const make = (id='a') => {
  const t = { id, managementDate:'2025-08-01', players:[{id:id+'1', contract:{weeklyWage:1000,weeksRemaining:100}}], finances:{cash:100_000,transferBudget:100_000} }
  ensureClubEconomy(t); setClubBudgetAllocation(t,52_000); return t
}
let passed=0
function test(name,fn) { fn(); console.log('OK '+name); passed++ }
test('Full season is protected without removing cash',()=>{
  const t=make(); assert.equal(remainingPayrollWeeks(t),52)
  assert.equal(seasonWageReserve(t),52_000); assert.equal(getTransferBudget(t),48_000)
  assert.equal(clubCash(t),100_000)
})
test('Contracts ending early only reserve remaining wages',()=>{
  const t=make(); t.players[0].contract.weeksRemaining=3
  assert.equal(seasonWageReserve(t),3000)
})
test('A paid Sunday reduces cash and reserve equally, without freeing spending money',()=>{
  const t=make(); t.managementDate='2025-08-03'
  const world={teamsById:{a:t}}, before=getTransferBudget(t)
  processWeeklyWages(world,{date:t.managementDate})
  assert.equal(seasonWageReserve(t),51_000); assert.equal(clubCash(t),99_000)
  assert.equal(getTransferBudget(t),before)
  processWeeklyWages(world,{date:t.managementDate}); assert.equal(clubCash(t),99_000)
})
test('Last payroll and season rollover use the correct season',()=>{
  const t=make(); t.managementDate='2026-07-26'; assert.equal(remainingPayrollWeeks(t),1)
  t.managementDate='2026-07-31'; assert.equal(remainingPayrollWeeks(t),0)
  t.managementDate='2026-08-01'; assert.equal(remainingPayrollWeeks(t),52)
})
test('New contracts and transfer fees cannot consume protected wages',()=>{
  const t=make(), newcomer={id:'new'}; setClubBudgetAllocation(t,78_000)
  assert(!canAffordContract(t,newcomer,1000).ok)
  assert(canAffordContract(t,newcomer,500,{fee:22_000}).ok)
  assert(!canAffordContract(t,newcomer,500,{fee:22_001}).ok)
  const before=JSON.stringify(t)
  assert(!signPlayerContract(t,newcomer,{weeklyWage:1000,years:3,signedDate:t.managementDate}).ok)
  assert.equal(JSON.stringify(t),before); assert.equal(newcomer.contract,undefined)
})
test('Renewals replace the old reserve instead of reserving both contracts',()=>{
  const t=make(); t.finances.cash=52_000
  assert(signPlayerContract(t,t.players[0],{weeklyWage:1000,years:3,signedDate:t.managementDate}).ok)
  assert.equal(seasonWageReserve(t),52_000)
})
test('Loan reserve includes wage shares and full parent wages after the return',()=>{
  const parent=make('a'), dest=make('b'), p=parent.players.pop()
  dest.players=[]; p.loan={parentTeamId:'a',destinationTeamId:'b',wageSplitPct:40,returnDate:'2025-09-01'}
  dest.players.push(p); syncLoanFinancialCommitments({teamsById:{a:parent,b:dest}})
  assert.equal(seasonWageReserve(dest),2000)
  assert.equal(seasonWageReserve(parent),50_000)
  assert.equal(seasonWageReserve(parent)+seasonWageReserve(dest),52_000)
})
test('Unfunded season blocks discretionary spending without erasing the shortfall',()=>{
  const t=make(); t.finances.cash=10_000
  assert.equal(getTransferBudget(t),0); assert.equal(seasonWageReserve(t),52_000)
  assert.equal(clubCash(t),10_000)
})
test('Transfer preflight protects the new reserve before charging the fee',()=>{
  const buyer=make('a'), seller=make('b'); setClubBudgetAllocation(buyer,78_000)
  const career={seasonYear:2025,league:{currentDate:'2025-08-01'},world:{teamsById:{a:buyer,b:seller}}}
  const before=clubCash(buyer), income=seller.finances.totalIncome
  const result=completeTransferBetweenClubs(career,{buyerTeamId:'a',sellerTeamId:'b',playerId:'b1',fee:22_001,contract:{weeklyWage:500,years:3}})
  assert(!result.ok); assert(result.error.includes('do końca sezonu'),result.error)
  assert.equal(clubCash(buyer),before); assert.equal(seller.finances.totalIncome,income)
  assert.equal(seller.players[0].id,'b1')
})
console.log(`Passed ${passed} seasonal wage reserve tests`)
