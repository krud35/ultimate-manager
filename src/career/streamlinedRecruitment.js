import { listTransferMarketWithFreeAgents } from './transfers/transferEngine.js'
import { computePlayerContractDemands } from './transfers/playerNegotiation.js'
import { submitTransferOffer, acceptOutgoingClubCounter, acceptPlayerContractCounter, queueOutgoingPlayerContract } from './transfers/delayedNegotiation.js'
import { contractSpanForTerms, roundWage } from './transfers/playerContracts.js'
import { playerSquadProfile } from './clubManagement.js'
import { canAffordContract } from './clubEconomy.js'
import { squadRole } from './streamlinedStories.js'
export function wageWithinLimit(cap) {
  if (cap < 50 || !Number.isFinite(cap)) return 0
  const step = cap >= 10000 ? 500 : cap >= 2000 ? 100 : cap >= 500 ? 50 : 25
  return Math.floor(cap / step) * step
}

export function recruitmentCandidates(career, { need = 'handler', maxFee = Infinity, maxWage = Infinity, years = 2 } = {}) {
  const team = career.world.teamsById[career.playerTeamId]
  const weeks = contractSpanForTerms({ signedDate: career.league.currentDate, years }).weeksTotal
  const market = listTransferMarketWithFreeAgents(career.world, team.id).filter(row => {
    const profile = playerSquadProfile(row.player)
    return (profile.role === need || profile.line === need) && row.askPrice <= maxFee
  }).sort((a, b) => b.ovr - a.ovr || a.askPrice - b.askPrice)
  const result = []
  for (const row of market) {
    const demands = computePlayerContractDemands({ player: row.player, sellerTeam: career.world.teamsById[row.teamId], buyerTeam: team, league: career.league })
    const offeredWage = Number.isFinite(maxWage) ? wageWithinLimit(maxWage) : demands.minWeeklyWage
    if (offeredWage < 50 || demands.minWeeklyWage > offeredWage || !canAffordContract(team, row.player, offeredWage, { fee: row.askPrice, weeksRemaining: weeks }).ok) continue
    result.push({ ...row, demands, offeredWage, weeks, totalCost: row.askPrice + offeredWage * weeks, affordable: true })
    if (result.length === 5) break
  }
  return result
}
export function startRecruitment(career, row, { maxFee, maxWage, years, role, delegated = false }) {
  if (!Number.isFinite(maxFee) || maxFee < 0 || !Number.isFinite(maxWage) || maxWage < 50 || ![1, 2, 3, 4, 5].includes(years)) return { ok: false, error: 'Nieprawidłowe limity / Invalid limits' }
  if ((career.inbox ?? []).some(m => m.payload?.playerId === row.playerId && ['awaiting_reply', 'counter', 'club_agreed', 'pre_agreed'].includes(m.payload.status) && !m.payload.superseded)) return { ok: false, error: 'Negocjacje już trwają / Negotiation already in progress' }
  const buyer = career.world.teamsById[career.playerTeamId]
  const offeredWage = wageWithinLimit(maxWage)
  const demand = computePlayerContractDemands({ player: row.player, sellerTeam: career.world.teamsById[row.teamId], buyerTeam: buyer, league: career.league })
  if (offeredWage < demand.minWeeklyWage || maxFee < row.askPrice) return { ok: false, error: 'Warunki wykraczają poza limit / Terms exceed limits' }
  const affordable = canAffordContract(buyer, row.player, offeredWage, { fee: row.askPrice, weeksRemaining: contractSpanForTerms({ signedDate: career.league.currentDate, years }).weeksTotal })
  if (!affordable.ok) return affordable
  const result = submitTransferOffer(career, { row, offerAmount: Math.min(maxFee, row.askPrice), contractTerms: { weeklyWage: offeredWage, years, squadRole: squadRole(role), bonuses: [], promises: [] } })
  if (!result.ok) return result
  if (result.message && delegated) result.message.payload.mandate = { maxFee, maxWage, years, role: squadRole(role), active: true }
  return result
}
/** Each mandate is tied to a single named player. Never increases any approved limit. */
export function processRecruitmentMandates(career) {
  if (career.gameplayEdition !== 'streamlined') return career
  let next = { ...career, inbox: [...(career.inbox ?? [])] }
  for (const original of [...next.inbox]) {
    let message = next.inbox.find(m => m.id === original.id), p = message?.payload, mandate = p?.mandate
    if (!mandate?.active || p.contractQueued || p.superseded) continue
    const pause = () => { next.inbox = next.inbox.map(m => m.id === message.id ? { ...m, read: false, payload: { ...m.payload, mandate: { ...mandate, active: false }, delegationPaused: true } } : m) }
    if (p.kind === 'outgoing_club_offer' && p.status === 'counter') {
      if (Math.round(p.counterAmount) > mandate.maxFee) { pause(); continue }
      const result = acceptOutgoingClubCounter(next, { messageId: message.id })
      if (!result.ok) { pause(); continue }
      next.inbox = result.inbox
      message = next.inbox.find(m => m.id === message.id); p = message.payload
    }
    if (p.kind === 'outgoing_club_offer' && p.status === 'club_agreed') {
      if ((p.agreedFee ?? p.offerAmount) > mandate.maxFee || p.playerDemands?.minWeeklyWage > wageWithinLimit(mandate.maxWage)) { pause(); continue }
      const result = queueOutgoingPlayerContract(next, { playerId: p.playerId, fee: p.agreedFee ?? p.offerAmount, weeklyWage: wageWithinLimit(mandate.maxWage), years: mandate.years, squadRole: mandate.role, parentMessageId: message.id })
      if (!result.ok) { pause(); continue }
      result.message.payload.mandate = { ...mandate }
      next.inbox = [result.message, ...result.inboxBase]
    } else if (p.kind === 'outgoing_player_contract' && p.status === 'counter') {
      if (roundWage(p.counterWeeklyWage) > mandate.maxWage || p.counterYears > mandate.years || p.fee > mandate.maxFee) { pause(); continue }
      const result = acceptPlayerContractCounter(next, { messageId: message.id })
      if (!result.ok) { pause(); continue }
      next = { ...next, inbox: result.inbox ?? next.inbox, world: result.world ?? next.world, transferLog: result.transferLog ?? next.transferLog }
    }
  }
  return next
}
