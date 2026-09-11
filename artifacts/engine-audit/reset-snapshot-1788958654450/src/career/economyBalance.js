// Shared nominal scale for the game's semi-professional club economy.
export const FINANCE_BALANCE_VERSION = 2
export const referenceWeeklyWage = ovr => 1200 * 1.10 ** (Math.max(50, Math.min(99, Number(ovr) || 50)) - 80)
export const staffWeeklyCosts = { 0: 0, 1: 240, 2: 600, 3: 1200 }
const bounded = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const clubReputation = team => bounded(Number(team?.reputation?.value ?? team?.reputation ?? 55), 15, 95)
export function referenceClubCosts(team) {
  const standardOvr = 72 + clubReputation(team) * 0.1
  return Math.round((28 * referenceWeeklyWage(standardOvr) * 1.2 + 4000) * 52)
}
export function facilityWeeklyCost(id, level) {
  const weight = { stadium: 1.3, trainingCenter: 1.2, medicalCenter: 1.1, chillRoom: 0.6, fanShop: 0.7, scoutingDept: 0.8, academy: 1 }[id] ?? 1
  return Math.round(2 * weight * (20 + 6 * level ** 2))
}
export function matchCommercials(team, { won = false, isHome = true, neutral = false } = {}) {
  const level = team?.facilities?.fanShop ?? 5
  const rep = clubReputation(team), mood = team?.fans?.mood ?? 55
  const capacity = 400 + 350 * (team?.facilities?.stadium ?? 5)
  const following = Math.max(250, team?.fans?.size ?? 3000)
  const attendance = isHome ? Math.round(Math.min(capacity, following * 0.16 * (0.7 + mood / 100) * (neutral ? 0.65 : 1))) : 0
  const customers = isHome ? attendance : Math.round(Math.min(250, following * 0.012))
  const ticketPrice = 2 * (8 + Math.floor(rep / 15))
  const tickets = attendance * ticketPrice
  const shirtsSold = Math.round(customers * 0.018 * (1 + level * 0.09) * (won ? 1.15 : 0.95))
  const shirts = shirtsSold * 90, shirtCosts = shirtsSold * 44
  const merch = Math.round(2 * customers * (0.7 + level * 0.12) * (won ? 1.1 : 0.95))
  const merchCosts = Math.round(merch * 0.45)
  const matchCosts = isHome ? Math.round(1300 + attendance * 2.8) : 0
  return { attendance, capacity, ticketPrice, tickets, shirtsSold, shirts, shirtCosts, merch, merchCosts, matchCosts,
    net: tickets + shirts + merch - shirtCosts - merchCosts - matchCosts }
}
export function estimatedAnnualMatchNet(team) {
  const home = matchCommercials(team, { isHome: true }).net
  const away = matchCommercials(team, { isHome: false }).net
  return Math.round(15 * (home + away - 8400))
}
export const eventFinanceScale = team => Math.round(bounded(referenceClubCosts(team) / 1_200_000, 0.7, 2.4) * 100) / 100
