const rank = { primary_cutter: 0, secondary_cutter: 1, continuation_cutter: 2, filler_cutter: 3 }

/** A lane reservation controls cuts, not whether an already open teammate can catch.
 * Fillers remain secondary options; their existing cut frequency/capacity is unchanged. */
export function receiverPriorityPenalty(agent, situation, stallCount) {
  const filler = agent.subRole === 'filler_cutter'
  const inactive = agent.isActive === false && !agent.isDump
  const late = stallCount >= 8
  if (inactive) {
    const separation = late ? 3 : filler ? 6.5 : 5.5
    const window = late ? 60 : filler ? 78 : 68
    if ((situation?.separation ?? 0) < separation || (situation?.throwWindowScore ?? 0) < window) return null
  }
  return (filler ? 22 : inactive ? 12 : 0) * (late ? 0.5 : 1)
}

/** Reserve tactical lanes before individual brains run; instructions cannot bypass capacity. */
export function assignActiveCutters(agents, capacity, elapsedMs, continuation, pullOpening = false) {
  const candidates = agents.filter(a => !a.isThrower && !a.isDump)
  const running = a => ['ACTIVE_CUT', 'INITIATING_CUT'].includes(a.state)
    || (!pullOpening && a.state === 'PREPARING_CUT')
  const offerWindow = !pullOpening && continuation && elapsedMs < 700
  for (const a of candidates) {
    if (a.isActive && a.state === 'CLEARING') a.cutRestUntilMs = elapsedMs + 1800
  }
  const eligible = candidates.filter(a => {
    if ((a.cutRestUntilMs ?? 0) > elapsedMs || a.state === 'CLEARING') return false
    if (pullOpening?.launchedIds?.includes(a.id) && !running(a)) return false
    // Carried routes retain their lane when the action clock resets after a catch.
    if (running(a)) return true
    if (a.subRole === 'continuation_cutter') return pullOpening || continuation || elapsedMs >= 4500
    if (a.subRole === 'filler_cutter') return !pullOpening && elapsedMs >= 6500
    return true
  }).sort((a, b) => {
    const priority = a => (running(a) ? -10 : 0) + (rank[a.subRole] ?? 1)
      - (offerWindow && !running(a) && a.subRole === 'continuation_cutter' ? 3 : 0)
    return priority(a) - priority(b)
      || (a.stackIndex ?? 0) - (b.stackIndex ?? 0)
  })
  const selected = new Set(eligible.slice(0, Math.max(1, Math.min(4, capacity))))
  for (const a of candidates) a.isActive = selected.has(a)
}
