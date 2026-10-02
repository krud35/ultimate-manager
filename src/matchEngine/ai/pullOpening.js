const roleOrder = ['primary_cutter', 'secondary_cutter', 'continuation_cutter']

export function createPullOpening(centerReceiverId) {
  return { centerReceiverId, phase: 'centering', elapsedMs: 0, releasedAtMs: null,
    nextOfferAtMs: 0, order: null, launchedIds: [] }
}

/** The opening follows the centering pass, independently of the handler pressure phase. */
export function advancePullOpening(opening, agents, { dtMs, throwerId, flight, stallCount }) {
  if (!opening) return null
  opening.elapsedMs += dtMs
  opening.order ??= agents.filter(a => roleOrder.includes(a.subRole))
    .sort((a, b) => roleOrder.indexOf(a.subRole) - roleOrder.indexOf(b.subRole)
      || (a.stackIndex ?? 0) - (b.stackIndex ?? 0)).map(a => a.id)
  for (const id of opening.order) {
    const agent = agents.find(a => a.id === id)
    if (opening.launchedIds.includes(id)) continue
    if (agent?.state === 'ACTIVE_CUT' && agent.pullPreparation) {
      opening.launchedIds.push(id)
      opening.nextOfferAtMs = opening.elapsedMs + 350
    }
    // An unavailable first option must not freeze the rest of the line.
    if (!agent || agent.isThrower || (agent.player?.currentStamina ?? 100) < 40) opening.launchedIds.push(id)
  }
  const centeringArriving = flight?.receiverId === opening.centerReceiverId
    && flight.totalFlightMs - flight.elapsedMs <= 450
  if (opening.phase === 'centering' && (!opening.centerReceiverId
    || throwerId === opening.centerReceiverId || centeringArriving
    || stallCount >= 4 || opening.elapsedMs >= 5000)) {
    opening.phase = 'offers'
    opening.releasedAtMs = opening.elapsedMs
  }
  if (opening.order.every(id => opening.launchedIds.includes(id))
    || (opening.phase === 'offers' && opening.elapsedMs - opening.releasedAtMs >= 5000)) return null
  return opening
}

export function pullOpeningCue(opening, agent) {
  if (!opening || !opening.order?.includes(agent.id) || opening.launchedIds.includes(agent.id)) return null
  const nextId = opening.order.find(id => !opening.launchedIds.includes(id))
  return opening.phase === 'offers' && agent.id === nextId && opening.elapsedMs >= opening.nextOfferAtMs
    ? 'offer' : 'prepare'
}
