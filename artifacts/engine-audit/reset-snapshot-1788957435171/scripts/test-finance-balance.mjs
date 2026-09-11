import assert from 'node:assert/strict'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { weeklyWageFromOvr } from '../src/career/transfers/playerContracts.js'
import { computeMarketValue } from '../src/career/transfers/playerValue.js'
import { applyPostMatchFinances, computeTravelCost } from '../src/career/clubFacilities.js'
import { clubCash, reviewClubBudgets, processMonthlyOwnerFunding, seasonWageReserve, clubBudgetAllocation } from '../src/career/clubEconomy.js'
import { scaleEventMoneyText, currentRandomEventChoices, applyRandomEventChoice } from '../src/career/randomEvents.js'
import { matchCommercials } from '../src/career/economyBalance.js'
import { createRng } from '../src/matchEngine/rng.js'
import { completeTransferBetweenClubs } from '../src/career/transfers/transferEngine.js'
import { setMoneyCurrency, formatUsd } from '../src/career/transfers/moneyFormat.js'
const rng = createRng(123); Math.random = () => rng.float()
const base = createWorldFromTemplate(2025)
let passed = 0
function test(name, fn) { fn(); console.log(`OK ${name}`); passed++ }
const sample = () => {
  const world = structuredClone(base), [home, away] = Object.values(world.teamsById)
  return { world, home, away }
}
test('Wage curve rewards quality without exponential superstar runaway', () => {
  assert.equal(weeklyWageFromOvr(80), 1200)
  assert(weeklyWageFromOvr(90) < 3200)
  assert(weeklyWageFromOvr(99) < 8000)
  for (let ovr=68; ovr<99; ovr++) assert(weeklyWageFromOvr(ovr+1) > weeklyWageFromOvr(ovr))
})
test('Transfer prices react to remaining contract, age and potential', () => {
  const p = { age: 25, potential: 85, contract: { weeksRemaining: 156 } }
  const full = computeMarketValue(p, 80)
  assert(full > 250_000 && full < 600_000)
  assert(computeMarketValue({ ...p, contract: { weeksRemaining: 8 } },80) < full * 0.6)
  assert(computeMarketValue({ ...p, age: 34 },80) < full)
})
test('Home tickets and goods reconcile with costs; repeated settlement pays nothing', () => {
  const { home, away } = sample()
  const a=clubCash(home), b=clubCash(away)
  applyPostMatchFinances(home, away, { homeWon:true, matchId:'balance-test', date:'2025-08-10', rng:()=>0.5 })
  assert.equal(clubCash(home)-a, home.facilities.lastMatchFinance.net)
  assert.equal(clubCash(away)-b, away.facilities.lastMatchFinance.net)
  assert(home.facilities.lastMatchFinance.tickets > 0)
  assert.equal(away.facilities.lastMatchFinance.tickets,0)
  assert(home.facilities.lastMatchFinance.shirtCosts > 0)
  const cash = clubCash(home)
  applyPostMatchFinances(home, away, { matchId:'balance-test' })
  assert.equal(clubCash(home), cash)
  applyPostMatchFinances(home, away, { matchId:'balance-test', date:'2026-08-10', rng:()=>0.5 })
  assert.notEqual(clubCash(home),cash, 'Fixture IDs may repeat in the next season')
  const after=clubCash(home)
  applyPostMatchFinances(home,away,{matchId:'forfeit',forfeited:true})
  assert.equal(clubCash(home),after)
})
test('Attendance cannot exceed capacity; away support does not sell home tickets', () => {
  const { home } = sample(); home.fans.size = 1_000_000
  const s=matchCommercials(home)
  assert(s.attendance <= s.capacity)
  assert.equal(matchCommercials(home,{isHome:false}).tickets,0)
})
test('Travel uses a capped travelling squad, not every registered player', () => {
  const { home } = sample(); home.players = Array.from({length:32},()=>({}))
  const cost=computeTravelCost(home,{rng:()=>0.5})
  home.players = Array.from({length:80},()=>({}))
  assert.equal(computeTravelCost(home,{rng:()=>0.5}).amount,cost.amount)
  assert.equal(cost.delegation,28)
})
test('Cash-rich clubs do not receive automatic owner profits; old wages survive migration', () => {
  const { world, home } = sample(); home.finances.cash=10_000_000
  const wages=home.players.map(p=>p.contract.weeklyWage)
  processMonthlyOwnerFunding(world,'2025-08-01')
  assert.equal(home.finances.ownerAnnualGrant,0)
  assert.equal(clubCash(home),10_000_000)
  assert.deepEqual(home.players.map(p=>p.contract.weeklyWage),wages)
  reviewClubBudgets(home,2026)
  assert.equal(home.finances.ownerAnnualGrant,0)
})
test('Event prices shown in choices match the actual scaled payment, once', () => {
  const { world, home }=sample(); const opening=seasonWageReserve(home)+100_000; home.finances.cash=opening; home.finances.seasonPayrollBudget=seasonWageReserve(home)
  const context={financeScale:0.5}
  assert.equal(scaleEventMoneyText('$1,800',0.5),'$900')
  assert(currentRandomEventChoices('equipment_failure',context).find(c=>c.id==='replace').hint.includes('$900'))
  const career={ world, playerTeamId:home.id, seasonYear:2025, league:{currentDate:'2025-08-01'}, inbox:[{
    id:'event',type:'random_event',payload:{kind:'decision',status:'pending',templateId:'equipment_failure',context},
  }] }
  const result=applyRandomEventChoice(career,'event','replace')
  assert(result.ok)
  assert.equal(clubCash(result.world.teamsById[home.id]),opening-900)
  assert.equal(clubCash(home),opening)
  assert(!applyRandomEventChoice({...career,world:result.world,inbox:result.nextInbox},'event','replace').ok)
})
test('Rejected wage demands do not create transfer payments or refunds', () => {
  const { world, home, away } = sample()
  home.players = home.players.slice(0, 24)
  home.finances.cash = 10_000_000
  home.finances.transferLimit = 5_000_000
  home.finances.seasonPayrollBudget = 0
  clubBudgetAllocation(home)
  const before = [home, away].map(t => JSON.stringify(t.finances))
  const result = completeTransferBetweenClubs({ world, seasonYear:2025, league:{currentDate:'2025-08-10'} }, {
    playerId:away.players[0].id, buyerTeamId:home.id, sellerTeamId:away.id,
    fee:50_000, contract:{weeklyWage:100_000,years:3},
  })
  assert(!result.ok)
  assert(result.error.includes('limit płac'), result.error)
  assert.deepEqual([home,away].map(t=>JSON.stringify(t.finances)),before)
})

test('Event price formatting scales compact dollars and European currency once', () => {
  assert.equal(scaleEventMoneyText('$2.5k',0.5),'$1,250')
  setMoneyCurrency('EUR')
  try { assert.equal(scaleEventMoneyText('1.800\u00a0€',0.5),formatUsd(900)) }
  finally { setMoneyCurrency('USD') }
})
console.log(`Passed ${passed} finance balance tests`)
