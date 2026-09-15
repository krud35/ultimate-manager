// Football-inspired 2008–2012 scale, in the game's base currency (USD).
import { clubFinancialMarket } from './financialMarkets.js'
import { currentEucsTier } from './competitionMembership.js'

export const FINANCE_BALANCE_VERSION = 4
export const referenceWeeklyWage = ovr => 20_000 * 1.14 ** (Math.max(50, Math.min(99, Number(ovr) || 50)) - 80)
export const staffWeeklyCosts = { 0: 0, 1: 2400, 2: 8000, 3: 24000 }
export const TV_MONTHLY_BY_TIER = { 1: 1_500_000, 2: 300_000, 3: 50_000 }
export const clubMonthlyTvIncome = team => clubFinancialMarket(team).tvMonthly ?? (TV_MONTHLY_BY_TIER[currentEucsTier(team)] ?? 0)
const bounded = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const clubReputation = team => bounded(Number(team?.reputation?.value ?? team?.reputation ?? 55), 15, 95)
export const clubFinancialPower = team => 1.055 ** (clubReputation(team) - 55)
export function referenceClubCosts(team) {
  const standardOvr = 60 + clubReputation(team) * 0.3
  const market = clubFinancialMarket(team)
  return Math.round((28 * referenceWeeklyWage(standardOvr) * 1.2 * market.wages + 60_000 * market.prices) * 52)
}
export function facilityWeeklyCost(id, level) {
  const weight = { stadium: 1.3, trainingCenter: 1.2, medicalCenter: 1.1, chillRoom: 0.6, fanShop: 0.7, scoutingDept: 0.8, academy: 1 }[id] ?? 1
  return Math.round(30 * weight * (20 + 6 * level ** 2))
}
export function matchCommercials(team, { won = false, isHome = true, neutral = false } = {}) {
  const market = clubFinancialMarket(team)
  const level = team?.facilities?.fanShop ?? 5
  const rep = clubReputation(team), mood = team?.fans?.mood ?? 55
  const capacity = 4000 + 6500 * (team?.facilities?.stadium ?? 5)
  const following = Math.max(250, team?.fans?.size ?? 3000) * 15 * market.attendance
  const attendance = isHome ? Math.round(Math.min(capacity, following * 0.16 * (0.7 + mood / 100) * (neutral ? 0.65 : 1))) : 0
  const customers = isHome ? attendance : Math.round(Math.min(250, following * 0.012))
  const ticketPrice = Math.max(1, Math.round(2 * (8 + Math.floor(rep / 15)) * market.ticketPrice))
  const tickets = attendance * ticketPrice
  const shirtsSold = Math.round(customers * 0.018 * (1 + level * 0.09) * (won ? 1.15 : 0.95))
  const shirts = Math.round(shirtsSold * 90 * Math.sqrt(market.prices)), shirtCosts = Math.round(shirtsSold * 44 * Math.sqrt(market.prices))
  const merch = Math.round(2 * customers * (0.7 + level * 0.12) * (won ? 1.1 : 0.95) * Math.sqrt(market.prices))
  const merchCosts = Math.round(merch * 0.45)
  const matchCosts = isHome ? Math.round((30_000 + attendance * 5) * market.prices) : 0
  return { attendance, capacity, ticketPrice, tickets, shirtsSold, shirts, shirtCosts, merch, merchCosts, matchCosts,
    net: tickets + shirts + merch - shirtCosts - merchCosts - matchCosts }
}
export function estimatedAnnualMatchNet(team) {
  const home = matchCommercials(team, { isHome: true }).net
  const away = matchCommercials(team, { isHome: false }).net
  return Math.round(15 * (home + away - 8400))
}
export const eventFinanceScale = team => Math.round(bounded(referenceClubCosts(team) / 1_200_000, 3, 120) * 100) / 100
