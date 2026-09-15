const rank = { primary_cutter: 0, secondary_cutter: 1, continuation_cutter: 2, filler_cutter: 3 }

/** Reserve tactical lanes before individual brains run; instructions cannot bypass capacity. */
export function assignActiveCutters(agents, capacity, elapsedMs, continuation) {
  const candidates = agents.filter(a => !a.isThrower && !a.isDump)
  for (const a of candidates) {
    if (a.isActive && a.state === 'CLEARING') a.cutRestUntilMs = elapsedMs + 1800
  }
  const eligible = candidates.filter(a => {
    if ((a.cutRestUntilMs ?? 0) > elapsedMs || a.state === 'CLEARING') return false
    if (a.subRole === 'continuation_cutter') return (continuation && elapsedMs >= 1200) || elapsedMs >= 4500
    if (a.subRole === 'filler_cutter') return elapsedMs >= 6500
    return true
  }).sort((a, b) => {
    const running = a => a.isActive && ['ACTIVE_CUT', 'INITIATING_CUT'].includes(a.state) ? -10 : 0
    return (running(a) + (rank[a.subRole] ?? 1)) - (running(b) + (rank[b.subRole] ?? 1))
      || (a.stackIndex ?? 0) - (b.stackIndex ?? 0)
  })
  const selected = new Set(eligible.slice(0, Math.max(1, Math.min(4, capacity))))
  for (const a of candidates) a.isActive = selected.has(a)
}
