function loanPayrollWeeks(team, date, until, maximum) {
  if (!until) return maximum
  const start = new Date(`${date ?? team.managementDate ?? `${team.financeSeasonYear ?? 2025}-08-01`}T00:00:00Z`)
  let days = (7 - start.getUTCDay()) % 7
  if (days === 0 && team.finances?.lastPayrollDate >= start.toISOString().slice(0, 10)) days = 7
  const end = Date.parse(`${until}T00:00:00Z`)
  return Math.min(maximum, Math.max(0, Math.ceil((end - start.getTime() - days * 86400000) / 604800000)))
}

/** Read-only contract view, including players registered at a loan destination. */
export function clubContractOverview(team, world, date) {
  const rows = new Map()
  const add = (player, kind, location) => {
    const contract = player.contract
    const weeks = Math.max(0, contract?.weeksRemaining ?? 0)
    const wage = weeks > 0 ? (contract?.weeklyWage ?? 0) : 0
    const borrowerShare = Math.max(0, Math.min(100, player.loan?.wageSplitPct ?? 50)) / 100
    const loanWeeks = player.loan ? loanPayrollWeeks(team, date, player.loan.returnDate, weeks) : 0
    const loanActive = player.loan && (!date || !player.loan.returnDate || player.loan.returnDate > date)
    const share = loanActive ? (kind === 'outgoing' ? 1 - borrowerShare : borrowerShare) : kind === 'incoming' ? 0 : 1
    const remainingCost = kind === 'incoming' ? wage * borrowerShare * loanWeeks
      : kind === 'outgoing' ? wage * weeks - wage * borrowerShare * loanWeeks : wage * weeks
    rows.set(player.id, { player, contract, kind, location, weeklyCost: wage * share, remainingCost })
  }
  for (const player of team.players ?? []) add(player, player.loan ? 'incoming' : 'senior', team.name)
  for (const player of team.academyPlayers ?? []) if (!rows.has(player.id)) add(player, 'academy', team.name)
  for (const other of Object.values(world?.teamsById ?? {})) {
    if (other.id === team.id) continue
    for (const player of other.players ?? []) {
      if (player.loan?.parentTeamId === team.id) add(player, 'outgoing', other.name)
    }
  }
  return [...rows.values()]
}
