import assert from 'node:assert/strict'
import { scheduledMatchForecast, clubFinanceForecast } from '../src/career/clubEconomy.js'
import './register-world-tests.mjs'

const { computeTravelCost, applyPostMatchFinances } = await import('../src/career/clubFacilities.js')

const team = { id: 'a', countryId: 'pl', players: [], finances: { transferBudget: 100000, salaryBudget: 5000 } }
const fixture = (id, date, homeTeamId = 'a', awayTeamId = 'b', extra = {}) => ({ id, date, homeTeamId, awayTeamId, competition: 'league', status: 'scheduled', ...extra })
const cup = fixture('cup-final', '2027-05-19', 'a', 'b', { competition: 'cup', venue: 'neutral' })
const league = { currentDate: '2026-08-01', fixtures: [fixture('played', '2026-08-01', 'a', 'b', { status: 'completed' }), fixture('home', '2026-09-04'), fixture('away', '2026-09-11', 'b', 'a'), cup, fixture('unknown', '2027-04-07', 'a', null, { competition: 'cup' })], cup: { matches: [cup] }, otherLeagues: [{ fixtures: [fixture('home', '2026-09-04', 'c', 'd')] }] }
const forecast = scheduledMatchForecast(team, { league })
assert.deepEqual(forecast.counts, { home: 1, away: 1, neutral: 1, cup: 1, league: 2 })
assert.equal(forecast.matches.length, 3)
assert.equal(scheduledMatchForecast(team, { league, currentDate: '2027-06-01' }).matches.length, 0)
assert.equal(scheduledMatchForecast(team), null)
const cash = clubFinanceForecast(team, { league })
assert.equal(cash.months[11].cash, cash.projectedCash)
const smaller = clubFinanceForecast(team, { league: { ...league, fixtures: [], cup: null, otherLeagues: [] } })
assert.equal(cash.annualIncome - smaller.annualIncome, forecast.net)
const home = structuredClone(team), away = { ...structuredClone(team), id: 'b', countryId: 'de' }
assert.ok(computeTravelCost(home, { opponent: away, rng: () => .5 }).amount > computeTravelCost(home, { opponent: { ...away, countryId: 'pl' }, rng: () => .5 }).amount)
applyPostMatchFinances(home, away, { isCup: true, neutral: false, date: '2026-09-09', matchId: 'home-cup', rng: () => .5 })
assert.equal(home.facilities.lastMatchFinance.travel, 0)
assert.ok(away.facilities.lastMatchFinance.travel > 0)
applyPostMatchFinances(home, away, { isCup: true, neutral: true, date: '2027-05-19', matchId: 'neutral-final', rng: () => .5 })
assert.ok(home.facilities.lastMatchFinance.travel > 0)
console.log('Finance schedule checks passed: dates, completed games, cup deduplication, uncertain rounds, league size, monthly projection, domestic home ties and international travel.')
