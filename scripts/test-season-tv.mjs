import assert from 'node:assert/strict'
import { leagueTvAllocation } from '../src/career/tvAllocation.js'
import { processMonthlyTvPayouts, processMonthlyTvPayoutsForRange, processSeasonEndTvPayouts, messagesFromTvPayouts } from '../src/career/tvMoney.js'
import { clubCash, clubFinanceForecast } from '../src/career/clubEconomy.js'
import { clubMonthlyTvIncome } from '../src/career/economyBalance.js'
import { createStandings } from '../src/league/standings.js'

function fixture() {
  const teams = ['de','pl','at','rs'].map((countryId,i)=>({id:`t${i}`,countryId,tier:2,domesticLeagueId:'mixed-2',reputation:60,players:[],finances:{transferBudget:100000,salaryBudget:0}}))
  const world={teamsById:Object.fromEntries(teams.map(t=>[t.id,t]))}
  const league={id:'mixed-2',tier:2,teamIds:teams.map(t=>t.id),standings:createStandings(teams.map(t=>t.id)),currentDate:'2025-08-01',fixtures:[{id:'match',competition:'league',status:'completed'}]}
  teams.forEach((t,i)=>{league.standings[t.id].wins=4-i;clubCash(t)})
  return {world,league,teams}
}
let passed=0
function test(name,fn){fn();passed++;console.log(`OK ${name}`)}
test('Equal share for all countries, ranked bonus, unchanged annual pool',()=>{
  const {world,league,teams}=fixture(),rows=leagueTvAllocation(world,league)
  assert.equal(new Set(rows.map(r=>r.equal)).size,1)
  for(let i=1;i<rows.length;i++) assert(rows[i-1].bonus>rows[i].bonus)
  const pool=teams.reduce((sum,t)=>sum+clubMonthlyTvIncome(t)*12,0)
  assert.equal(rows.reduce((sum,r)=>sum+r.amount,0),pool)
  assert(Math.abs(rows[0].equal*rows.length-pool*.7)<rows.length)
})
test('No monthly, premature or unfinished-season payments',()=>{
  const {world,league,teams}=fixture(),cash=teams.map(clubCash)
  assert.deepEqual(processMonthlyTvPayouts(world,'2025-08-01'),[])
  assert.deepEqual(processMonthlyTvPayoutsForRange(world,'2025-08-01','2026-07-31'),[])
  assert.deepEqual(processSeasonEndTvPayouts(world,league,2025,'2026-07-30'),[])
  league.fixtures[0].status='scheduled'
  assert.deepEqual(processSeasonEndTvPayouts(world,league,2025,'2026-07-31'),[])
  assert.deepEqual(teams.map(clubCash),cash)
})
test('Season settlement survives reload, pays each club once, and pays again next year',()=>{
  const {world,league,teams}=fixture(),cash=teams.map(clubCash)
  const rows=processSeasonEndTvPayouts(world,league,2025)
  rows.forEach((r,i)=>assert.equal(clubCash(teams[i])-cash[i],r.amount))
  assert(messagesFromTvPayouts(rows,{playerTeamId:teams[0].id})[0].body.includes('premia'))
  const loaded=JSON.parse(JSON.stringify(world)),before=JSON.stringify(loaded)
  assert.deepEqual(processSeasonEndTvPayouts(loaded,league,2025),[])
  assert.equal(JSON.stringify(loaded),before)
  assert.equal(processSeasonEndTvPayouts(loaded,league,2026).length,4)
})
test('Promotion does not change the prize for the completed division',()=>{
  const {world,league,teams}=fixture(),before=leagueTvAllocation(world,league)
  teams[0].tier=1;teams[0].domesticLeagueId='mixed-1'
  assert.deepEqual(leagueTvAllocation(world,league),before)
})
test('Forecast shows the equal share only at season end and removes settled cash',()=>{
  const {world,league,teams}=fixture(),team=teams[0]
  const forecast=clubFinanceForecast(team,{world,league})
  const noTv=structuredClone(team);noTv.finances.tvSettlements={'2025|mixed-2':{amount:1}}
  const paid=clubFinanceForecast(noTv,{world,league})
  assert.equal(forecast.tvForecast.amount,leagueTvAllocation(world,league)[0].equal)
  for(let i=0;i<11;i++) assert.equal(forecast.months[i].cash,paid.months[i].cash)
  assert.equal(forecast.months[11].cash-paid.months[11].cash,forecast.tvForecast.amount)
  assert.equal(forecast.months[11].cash,forecast.projectedCash)
  processSeasonEndTvPayouts(world,league,2025)
  assert.equal(clubFinanceForecast(team,{world,league,currentDate:'2026-07-31'}).tvForecast.amount,0)
})
test('Legacy monthly advances reduce the remaining payout without debiting cash',()=>{
  const {world,league,teams}=fixture()
  teams[0].finances._tvLastMonthlyYm='2025-10'
  teams[1].finances._tvLastMonthlyYm='2024-12'
  const rows=processSeasonEndTvPayouts(world,league,2025)
  const first=world.teamsById.t0.finances.tvSettlements['2025|mixed-2']
  assert.equal(first.advance,clubMonthlyTvIncome(teams[0])*3)
  assert.equal(first.amount,Math.max(0,first.equal+first.bonus-first.advance))
  assert.equal(rows.find(r=>r.teamId==='t1').advance,0)
})
console.log(`Passed ${passed} season TV tests`)
