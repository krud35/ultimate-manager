/** Pure policy shared by the calendar, hub and inbox. Reading is not deciding. */
export function requiresCareerDecision(message) {
  if (!message || message.payload?.superseded) return false
  const p = message.payload ?? {}
  if (['resolved','accepted','rejected','expired','cancelled','completed'].includes(p.status)) return false
  if (message.type === 'random_event') return p.kind === 'decision' && p.status === 'pending'
  if (message.type === 'transfer_offer') {
    if (p.kind === 'outgoing_club_offer' && p.contractQueued) return false
    const actionable = {
      incoming_bid: ['pending','counter'], outgoing_club_offer: ['counter','club_agreed'],
      outgoing_player_contract: ['counter'], pending_registration: ['pending_confirm'],
      loan_out_offer: ['counter'], loan_in_request: ['counter'],
      loan_in_request_from_ai: ['pending'], loan_buy_clause_decision: ['pending_decision'],
    }
    return actionable[p.kind]?.includes(p.status) ?? false
  }
  // Sponsor catalogues, scouting and training summaries carry no mandatory decision.
  if (message.type === 'club_news') return p.status === 'pending_decision'
  return false
}
export function nextCareerDecision(career) {
  return (career?.inbox ?? []).find(requiresCareerDecision) ?? null
}
