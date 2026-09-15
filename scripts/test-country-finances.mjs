import assert from 'node:assert/strict'
import { COUNTRY_FINANCIAL_MARKETS, clubFinancialMarket, financialCountryId } from '../src/career/financialMarkets.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'
import { clubMonthlyTvIncome, referenceClubCosts, matchCommercials, estimatedAnnualMatchNet } from '../src/career/economyBalance.js'
import { rollTransferBudget } from '../src/career/transfers/clubFinances.js'
import { weeklyWageFromOvr, ensurePlayerContract, rollPlayerContract } from '../src/career/transfers/playerContracts.js'
import { computePlayerContractDemands } from '../src/career/transfers/playerNegotiation.js'
import { sponsorAnnualBase, generateSponsorOffers } from '../src/career/clubSponsors.js'
import { processMonthlyTvPayouts } from '../src/career/tvMoney.js'
import { processMonthlyOwnerFunding, clubCash, annualOperatingIncome, seasonWageReserve } from '../src/career/clubEconomy.js'
import { processLeaguePlacementPrizes, applyCupPlacementPrizes } from '../src/career/placementPrizes.js'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { facilityUpgradeCost } from '../src/career/clubFacilities.js'
import { createStandings } from '../src/league/standings.js'

const club = (countryId, tier = 1) => ({ id: `${countryId}-${tier}`, countryId, tier,
  domesticLeagueId: `${countryId}-${tier}`, reputation: 65, players: [], fans: { size: 10000, mood: 55 },
  finances: { transferBudget: 0, salaryBudget: 0 } })
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`OK ${name}`) }
test('Every catalogued club country has an explicit financial model', () => {
  for (const league of DOMESTIC_LEAGUES) for (const team of league.teams) assert(COUNTRY_FINANCIAL_MARKETS[team.countryId], team.countryId)
  assert.equal(financialCountryId({country:'United Kingdom'}),'gb')
  assert.equal(financialCountryId({country:'Poland'}),'pl')
  assert(Number.isFinite(clubMonthlyTvIncome({...club('unknown'),tier:'bad'})))
})
test('Identical clubs in richer markets have more capital, sponsors and higher wages', () => {
  const rich=club('de'), poor=club('pl')
  for(let seed=0;seed<30;seed++) assert(rollTransferBudget(rich.id,seed,rich)>rollTransferBudget(poor.id,seed,poor)*2)
  assert(sponsorAnnualBase(65,'main',rich)>sponsorAnnualBase(65,'main',poor)*3)
  assert(weeklyWageFromOvr(80,rich)>weeklyWageFromOvr(80,poor))
  assert(referenceClubCosts(rich)>referenceClubCosts(poor))
  assert(matchCommercials(rich).net>matchCommercials(poor).net)
  assert(facilityUpgradeCost('academy',5,rich)>facilityUpgradeCost('academy',5,poor))
  assert(generateSponsorOffers(rich,'main',{seed:1})[0].annualBase>generateSponsorOffers(poor,'main',{seed:1})[0].annualBase)
})
test('Every successive division reduces funding, including fourth and deeper levels', () => {
  for(const country of ['us','gb','pl','fr','in']) for(let tier=1;tier<6;tier++) {
    const upper=club(country,tier), lower=club(country,tier+1)
    assert(clubMonthlyTvIncome(upper)>clubMonthlyTvIncome(lower))
    assert(rollTransferBudget(upper.id,3,upper)>rollTransferBudget(lower.id,3,lower))
    assert(sponsorAnnualBase(65,'main',upper)>sponsorAnnualBase(65,'main',lower))
    assert(weeklyWageFromOvr(80,upper)>weeklyWageFromOvr(80,lower))
  }
})
test('Regional league identities do not replace the home country or live division', () => {
  const at={...club('at'),domesticLeagueId:'centralEurope-1'}, rs={...club('rs'),domesticLeagueId:'centralEurope-1'}
  assert(clubMonthlyTvIncome(at)>clubMonthlyTvIncome(rs))
  const regional={...club('fr',3),domesticLeagueId:'fr-regional-west',competitionTier:1}
  assert.equal(clubFinancialMarket(regional).tier,3)
  regional.tier=2
  assert.equal(clubFinancialMarket(regional).tier,2)
})
test('TV forecast equals actual payments and pays only once per month', () => {
  const team=club('pl',2), world={teamsById:{[team.id]:team}}
  const expected=clubMonthlyTvIncome(team), before=clubCash(team)
  assert.equal(annualOperatingIncome(team) - estimatedAnnualMatchNet(team) - team.finances.ownerAnnualGrant, expected * 12)
  assert.equal(processMonthlyTvPayouts(world,'2025-08-01')[0].amount,expected)
  assert.equal(clubCash(team),before+expected)
  assert.deepEqual(processMonthlyTvPayouts(world,'2025-08-01'),[])
  assert.deepEqual(processMonthlyTvPayouts(world,'2025-08-02'),[])
})
test('Promotion refreshes funding without rewriting cash or signed contracts on load', () => {
  const team=club('pl',3), world={teamsById:{[team.id]:team}}
  team.players=[{id:'p',contract:{weeklyWage:100,weeksRemaining:104}}]
  processMonthlyOwnerFunding(world,'2025-08-01')
  const grant=team.finances.ownerAnnualGrant, contract=JSON.stringify(team.players[0].contract)
  team.tier=1;team.domesticLeagueId='pl-1'
  const before=clubCash(team)
  processMonthlyOwnerFunding(world,'2025-09-01')
  assert(team.finances.ownerAnnualGrant>grant)
  assert.equal(clubCash(team),before+Math.round(team.finances.ownerAnnualGrant/12))
  assert.equal(JSON.stringify(team.players[0].contract),contract)
  const loaded=JSON.parse(JSON.stringify(world)), snapshot=JSON.stringify(loaded)
  processMonthlyOwnerFunding(loaded,'2025-09-01')
  assert.equal(JSON.stringify(loaded),snapshot)
})
test('Prizes follow country and division; lower-division cup winners get the full prize', () => {
  const payout=(t, completedTier=t.tier)=>processLeaguePlacementPrizes({teamsById:{[t.id]:t}},{standings:createStandings([t.id])},completedTier)[0].amount
  assert(payout(club('de'))>payout(club('pl')))
  assert(payout(club('pl'))>payout(club('pl',2)))
  assert.equal(payout(club('pl',1),3),payout(club('pl',3)))
  const win=t=>{
    const other={...club(t.countryId),id:'other'}
    const cup={format:'domestic',status:'complete',championTeamId:t.id,matches:[{round:'final',status:'completed',homeTeamId:t.id,awayTeamId:other.id}]}
    const teams={[t.id]:t,other}
    const result=applyCupPlacementPrizes(cup,teams), before=clubCash(t)
    applyCupPlacementPrizes(cup,teams);assert.equal(clubCash(t),before)
    return result[t.id].amount
  }
  assert.equal(win(club('pl')),win(club('pl',3)))
  assert(win(club('de'))>win(club('pl')))
})
test('New worlds fund scaled wages; negotiations and reloads respect the local market', () => {
  const base=createWorldFromTemplate(2025), source=Object.values(base.teamsById)[0]
  const templates=['de','pl'].flatMap(country=>[1,3].map(tier=>({...source,...club(country,tier),
    players:source.players.slice(0,24).map((p,i)=>({...structuredClone(p),id:`${country}-${tier}-${i}`,contract:null}))})))
  const world=createWorldFromTemplate(2025,{teams:templates})
  for(const t of Object.values(world.teamsById)) assert(clubCash(t)>seasonWageReserve(t))
  assert(clubCash(world.teamsById['de-1'])>clubCash(world.teamsById['pl-1']))
  assert(clubCash(world.teamsById['pl-1'])>clubCash(world.teamsById['pl-3']))
  const player=structuredClone(source.players[0]); player.contract=null
  const rich=club('de'), poor=club('pl',3)
  assert(rollPlayerContract(player,1,2025,rich).weeklyWage>rollPlayerContract(player,1,2025,poor).weeklyWage)
  const demand=t=>computePlayerContractDemands({player:structuredClone(player),buyerTeam:t}).minWeeklyWage
  assert(demand(rich)>demand(poor))
  player.contract=rollPlayerContract(player,1,2025,poor)
  const wage=player.contract.weeklyWage
  ensurePlayerContract(player,{team:rich})
  assert.equal(player.contract.weeklyWage,wage)
})
test('Legacy UFA and EUCS retain their previous scale', () => {
  assert.equal(weeklyWageFromOvr(80),20000)
  assert.equal(clubMonthlyTvIncome({id:'legacy'}),0)
  assert.equal(clubMonthlyTvIncome({id:'legacy',competitionTier:2}),300000)
})
console.log(`Passed ${passed} country finance tests`)
