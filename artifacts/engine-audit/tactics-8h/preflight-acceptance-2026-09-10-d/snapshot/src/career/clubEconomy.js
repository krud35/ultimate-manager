import { FINANCE_BALANCE_VERSION, referenceClubCosts, estimatedAnnualMatchNet } from './economyBalance.js'
import { currentEucsTier } from './competitionMembership.js'

export const ECONOMY_VERSION = 2

export function contractualWeeklyBill(team, excludePlayerId = null) {
  return Math.round((team?.players ?? []).reduce((sum, player) => {
    if (player.id === excludePlayerId || !(player.contract?.weeksRemaining > 0)) return sum
    return sum + player.contract.weeklyWage * (player.loan ? (player.loan.wageSplitPct ?? 50) / 100 : 1)
  }, 0) + (team?.finances?.outgoingLoanWeekly ?? 0))
}

/** Convert old escrow into cash once. Neither assets nor debt disappear on migration. */
export function ensureClubEconomy(team) {
  if (!team) return null
  const f = team.finances ??= { transferBudget: 0, salaryBudget: 0 }
  if (f.economyVersion === ECONOMY_VERSION) return f
  const legacyCash = Math.round((f.transferBudget ?? 0) + (f.salaryBudget ?? 0))
  const wageBill = contractualWeeklyBill(team)
  f.cash = Number.isFinite(f.cash) ? f.cash : legacyCash
  f.ownerAnnualGrant = Math.round(wageBill * 52 + 100_000 + Math.max(0, f.transferBudget ?? 0) * 0.08)
  f.ownerBaseGrant = f.ownerAnnualGrant
  f.ownerBaseTier = currentEucsTier(team) ?? 2
  f.weeklyWageLimit = Math.max(1000, Math.round(wageBill * 1.2))
  f.transferLimit = Math.max(0, Math.round(f.transferBudget ?? 0))
  f.openingCash = f.cash
  f.totalIncome = 0
  f.totalExpenses = 0
  f.ledger = []
  f.categories = {}
  f.economyVersion = ECONOMY_VERSION
  f.salaryBudget = f.weeklyWageLimit
  return f
}

export function postClubCash(team, amount, category = 'other', date = null) {
  const f = ensureClubEconomy(team)
  if (!f || !Number.isFinite(amount)) return
  clubBudgetAllocation(team)
  const delta = Math.round(amount)
  f.cash += delta
  if (category === 'wages') f.seasonPayrollBudget = Math.max(0, f.seasonPayrollBudget + delta)
  if (delta >= 0) f.totalIncome += delta
  else f.totalExpenses -= delta
  f.categories[category] = (f.categories[category] ?? 0) + delta
  f.ledger.push({ date, category, amount: delta, balance: f.cash })
  if (f.ledger.length > 156) f.ledger.splice(0, f.ledger.length - 156)
  clubBudgetAllocation(team)
}

export function clubCash(team) { return ensureClubEconomy(team)?.cash ?? 0 }

/** Remaining Sunday payrolls, before the August season boundary or loan return. */
export function remainingPayrollWeeks(team, date = team?.managementDate, until = null) {
  const start = new Date(`${date ?? `${team?.financeSeasonYear ?? 2025}-08-01`}T00:00:00Z`)
  const year = start.getUTCFullYear() + (start.getUTCMonth() >= 7 ? 1 : 0)
  const end = Math.min(Date.UTC(year, 7, 1), until ? Date.parse(`${until}T00:00:00Z`) : Infinity)
  const today = start.toISOString().slice(0, 10)
  let days = (7 - start.getUTCDay()) % 7
  if (days === 0 && team?.finances?.lastPayrollDate >= today) days = 7
  return Math.max(0, Math.ceil((end - start.getTime() - days * 86400000) / 604800000))
}

export function seasonWageReserve(team, { excludePlayerId = null, date = team?.managementDate } = {}) {
  const weeks = remainingPayrollWeeks(team, date)
  const own = (team?.players ?? []).reduce((sum, p) => {
    if (p.id === excludePlayerId) return sum
    const duration = Math.min(p.contract?.weeksRemaining ?? 0, p.loan ? remainingPayrollWeeks(team, date, p.loan.returnDate) : weeks)
    const wage = p.contract?.weeklyWage ?? 0
    return sum + Math.max(0, duration) * (p.loan ? Math.round(wage * (p.loan.wageSplitPct ?? 50) / 100) : wage)
  }, 0)
  const f = ensureClubEconomy(team)
  const outgoing = f.outgoingLoanSchedule?.reduce((sum, p) => sum +
    p.wage * Math.min(weeks, p.remaining) - p.share * Math.min(p.remaining, remainingPayrollWeeks(team, date, p.returnDate)), 0)
    ?? (f.outgoingLoanWeekly ?? 0) * weeks
  return Math.round(own + outgoing)
}

/** The two allocations always reconcile with cash, including an unfunded deficit. */
export function clubBudgetAllocation(team) {
  const f = ensureClubEconomy(team)
  const weeks = remainingPayrollWeeks(team)
  const minimum = seasonWageReserve(team)
  const date = team.managementDate ?? `${team.financeSeasonYear ?? 2025}-08-01`
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 8 ? 1 : 0)
  if (!Number.isFinite(f.seasonPayrollBudget) || f.allocationSeason !== year) {
    f.allocationSeason = year
    f.seasonPayrollBudget = Math.max(minimum, Math.min(Math.max(0, f.cash), Math.round(contractualWeeklyBill(team) * weeks * 1.12)))
  }
  f.seasonPayrollBudget = weeks ? Math.max(minimum, Math.round(f.seasonPayrollBudget)) : 0
  f.weeklyWageLimit = weeks ? f.seasonPayrollBudget / weeks : 0
  f.salaryBudget = f.weeklyWageLimit
  f.transferBudget = f.cash - f.seasonPayrollBudget
  f.transferLimit = f.transferBudget
  return { cash: f.cash, weeks, minimum, seasonPayrollBudget: f.seasonPayrollBudget,
    weeklyWageLimit: f.weeklyWageLimit, transferBudget: f.transferBudget,
    shortfall: Math.max(0, minimum - f.cash) }
}

export function setClubBudgetAllocation(team, seasonPayrollBudget) {
  const state = clubBudgetAllocation(team)
  const amount = Math.round(Number(seasonPayrollBudget))
  if (!Number.isFinite(amount) || !state.weeks || amount < state.minimum || amount > state.cash) return { ok: false, error: 'invalid_allocation' }
  team.finances.seasonPayrollBudget = amount
  return { ok: true, ...clubBudgetAllocation(team) }
}

export const BUDGET_ADJUSTMENT_DAYS = 30

export function budgetAdjustmentStatus(team) {
  const today = team?.managementDate ?? `${team?.financeSeasonYear ?? 2025}-08-01`
  const lastDate = team?.finances?.lastBudgetAdjustmentDate
  const nextDate = lastDate
    ? new Date(Date.parse(`${lastDate}T00:00:00Z`) + BUDGET_ADJUSTMENT_DAYS * 86400000).toISOString().slice(0, 10)
    : null
  return { today, nextDate, available: !nextDate || today >= nextDate }
}

/** Manager decisions are rate-limited; automatic AI/season allocation uses the internal setter. */
export function adjustClubBudget(team, seasonPayrollBudget) {
  const status = budgetAdjustmentStatus(team)
  if (!status.available) return { ok: false, error: 'budget_adjustment_cooldown', nextDate: status.nextDate }
  const before = clubBudgetAllocation(team).seasonPayrollBudget
  const result = setClubBudgetAllocation(team, seasonPayrollBudget)
  if (result.ok && result.seasonPayrollBudget !== before) team.finances.lastBudgetAdjustmentDate = status.today
  return result
}

export function rebalanceAiBudget(team) {
  const state = clubBudgetAllocation(team)
  const target = Math.round(contractualWeeklyBill(team) * state.weeks * 1.12)
  if (state.cash >= state.minimum && state.weeks) setClubBudgetAllocation(team, Math.max(state.minimum, Math.min(state.cash, target)))
}

/** New careers receive funded wages plus a separately visible operating/transfer cushion. */
export function initializeClubLiquidity(team, year) {
  const f = ensureClubEconomy(team)
  if (f.startingLiquidityVersion) return
  team.financeSeasonYear = year
  team.managementDate = `${year}-08-01`
  const reserve = Math.max(seasonWageReserve(team), contractualWeeklyBill(team) * remainingPayrollWeeks(team))
  const cushion = Math.round(Math.max(150_000, f.cash) + (f.weeklyOperations ?? 0) * 26 + reserve * 0.2)
  postClubCash(team, reserve + cushion - f.cash, 'starting_capital', team.managementDate)
  f.startingLiquidityVersion = 1
  f.startingWageCover = reserve
  f.startingCushion = cushion
  rebalanceAiBudget(team)
}

export function availableClubCash(team) { return Math.max(0, clubBudgetAllocation(team).transferBudget) }

export function postTransferCash(team, amount) {
  postClubCash(team, amount, 'transfer_fee', team.managementDate)
}

export function syncLoanFinancialCommitments(world) {
  for (const t of Object.values(world?.teamsById ?? {})) {
    const f = ensureClubEconomy(t)
    f.outgoingLoanWeekly = 0
    f.outgoingLoanLiability = 0
    f.incomingLoanLiability = 0
    f.outgoingLoanSchedule = []
  }
  for (const t of Object.values(world?.teamsById ?? {})) for (const p of t.players ?? []) {
    const parent = world.teamsById[p.loan?.parentTeamId]
    if (!parent || !p.contract) continue
    const wage = p.contract.weeklyWage
    const share = Math.round(wage * (p.loan.wageSplitPct ?? 50) / 100)
    const remaining = p.contract.weeksRemaining
    parent.finances.outgoingLoanSchedule.push({ wage, share, remaining, returnDate: p.loan.returnDate })
    const date = t.managementDate ?? p.loan.startDate
    const duration = date && p.loan.returnDate ? Math.max(0, Math.ceil((new Date(p.loan.returnDate) - new Date(date)) / 604800000)) : remaining
    const loanWeeks = Math.min(remaining, duration)
    parent.finances.outgoingLoanWeekly += wage - share
    parent.finances.outgoingLoanLiability += wage * remaining - share * loanWeeks
    t.finances.incomingLoanLiability += share * loanWeeks
  }
}

export function annualOperatingIncome(team, { cashBasis = false } = {}) {
  const f = ensureClubEconomy(team)
  const tv = ({ 1: 360_000, 2: 144_000, 3: 48_000 })[currentEucsTier(team)] ?? 0
  const sponsors = ['main', 'secondary'].reduce((sum, slot) => {
    const c = team.sponsors?.[slot]
    if (!c) return sum
    if (c.paymentModel === 'upfront') return sum + (cashBasis ? 0 : (c.totalContractValue ?? c.signingPayout ?? 0) / Math.max(1, c.years ?? 1))
    return sum + (c.paymentModel === 'monthly' ? (c.perMonthAmount ?? 0) * 12 : (c.perSeasonAmount ?? c.annualBase ?? 0))
  }, 0)
  return (f?.ownerAnnualGrant ?? 0) + tv + sponsors + estimatedAnnualMatchNet(team)
}

export function clubFinanceForecast(team) {
  const f = ensureClubEconomy(team)
  clubBudgetAllocation(team)
  const weeklyWages = contractualWeeklyBill(team)
  const weeklyOperations = f.weeklyOperations ?? 0
  const annualIncome = annualOperatingIncome(team, { cashBasis: true })
  const annualCosts = (weeklyWages + weeklyOperations) * 52
  const commitments = (team.players ?? []).reduce((sum, p) => sum + (p.loan ? 0 :
    (p.contract?.weeklyWage ?? 0) * (p.contract?.weeksRemaining ?? 0)), 0) +
    (f.outgoingLoanLiability ?? 0) + (f.incomingLoanLiability ?? 0)
  return { cash: f.cash, weeklyWages, weeklyOperations, annualIncome, annualCosts,
    projectedCash: Math.round(f.cash + annualIncome - annualCosts), commitments: Math.round(commitments),
    weeklyWageLimit: f.weeklyWageLimit, debt: Math.max(0, -f.cash),
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
      cash: Math.round(f.cash + (annualIncome - annualCosts) * (i + 1) / 12) })) }
}

/** Stable annual funding, monthly cash payments, no annual balance reset. */
export function processMonthlyOwnerFunding(world, date) {
  const month = String(date).slice(0, 7)
  if (String(date).slice(8, 10) !== '01') return
  for (const team of Object.values(world?.teamsById ?? {})) {
    const f = ensureClubEconomy(team)
    if (f.balanceVersion !== FINANCE_BALANCE_VERSION) {
      f.balanceVersion = FINANCE_BALANCE_VERSION
      f.transitionPayroll = contractualWeeklyBill(team) * 52
      f.transitionYear = Number(date.slice(0, 4))
      reviewClubBudgets(team, `balance-${month}`)
    }
    if (f.lastOwnerMonth >= month) continue
    f.lastOwnerMonth = month
    postClubCash(team, Math.round(f.ownerAnnualGrant / 12), 'owner_funding', date)
  }
}

export function reviewClubBudgets(team, seasonKey) {
  const f = ensureClubEconomy(team)
  if (f.lastBudgetSeason === seasonKey) return
  f.lastBudgetSeason = seasonKey
  const nonOwnerIncome = annualOperatingIncome(team) - f.ownerAnnualGrant
  const reference = referenceClubCosts(team)
  const costs = (contractualWeeklyBill(team) + (f.weeklyOperations ?? 0)) * 52
  const year = Number(String(seasonKey).match(/20\d{2}/)?.[0] ?? f.transitionYear ?? 2025)
  const bridge = Math.max(0, (f.transitionPayroll ?? 0) - reference) * Math.max(0, 1 - (year - (f.transitionYear ?? year)) / 4)
  const supportedCosts = Math.max(reference * 0.75, Math.min(reference * 1.15 + bridge, costs))
  const surplus = Math.max(0, f.cash - supportedCosts * 1.4)
  f.ownerAnnualGrant = Math.round(Math.max(0, supportedCosts * 1.06 - nonOwnerIncome - surplus * 0.5))
  f.ownerBaseGrant = Math.round(Math.max(0, reference - nonOwnerIncome))
  clubBudgetAllocation(team)
}

export function canAffordContract(team, player, wage, { date = team?.managementDate, fee = 0, weeksRemaining = 52, until = null } = {}) {
  const f = ensureClubEconomy(team)
  const allocation = clubBudgetAllocation(team)
  const bill = contractualWeeklyBill(team, player?.id)
  if (bill + wage > allocation.weeklyWageLimit) return { ok: false, error: 'Przekroczony tygodniowy limit płac / Weekly wage limit exceeded' }
  const reserve = seasonWageReserve(team, { excludePlayerId: player?.id, date }) + wage * Math.min(weeksRemaining, remainingPayrollWeeks(team, date, until))
  if (reserve > allocation.seasonPayrollBudget || f.cash - fee < allocation.seasonPayrollBudget) return { ok: false, error: 'Brak środków na pensje do końca sezonu / Insufficient funds for wages through season end', requiredReserve: reserve }
  return { ok: true }
}
