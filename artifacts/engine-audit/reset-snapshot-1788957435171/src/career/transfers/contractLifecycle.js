import { worldTeamsList } from '../worldState.js'
import { processAiContractCycle, releasePlayerToFreeAgency } from './freeAgency.js'
import { returnLoanedPlayer } from './loans.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'

/** Expired contracts cannot silently remain active (including legacy saves). */
export function processContractExpirations(career, { renewAhead = false } = {}) {
  const world = career?.world
  if (!world) return { inboxMessages: [], loanLog: career?.loanLog ?? [] }
  const teams = worldTeamsList(world)
  const maxRemainingWeeks = renewAhead ? 4 : 0
  if (teams.some(t => t.id !== career.playerTeamId && (t.players ?? []).some(
    p => p.contract && p.contract.weeksRemaining <= maxRemainingWeeks && !p.loan,
  ))) {
    processAiContractCycle(world, {
      playerTeamId: career.playerTeamId, league: career.league,
      seed: Number(String(career.league?.currentDate ?? '').replaceAll('-', '')) || 1,
      maxRemainingWeeks,
    })
  }
  const inboxMessages = []
  let loanLog = career.loanLog ?? []
  for (const team of teams) {
    for (const player of [...(team.players ?? [])]) {
      if (!player.contract || player.contract.weeksRemaining > 0) continue
      let owner = team
      const destinationId = player.loan?.destinationTeamId
      if (player.loan) {
        const returned = returnLoanedPlayer(career, { playerId: player.id })
        if (!returned.ok) continue
        owner = returned.parentTeam
        loanLog = [...loanLog, returned.loanLogEntry]
      }
      const result = releasePlayerToFreeAgency(owner, player, world)
      if (!result.ok || (owner.id !== career.playerTeamId && destinationId !== career.playerTeamId)) continue
      const name = getPlayerFullName(player)
      const date = career.league?.currentDate ?? null
      inboxMessages.push({
        id: `contract-expired-${player.id}-${date}`, type: 'club_news', read: false,
        date, seasonYear: career.seasonYear, seasonIndex: career.seasonIndex,
        title: `Koniec kontraktu · ${name}`, titleEn: `Contract expired · ${name}`,
        body: `${name} został wolnym zawodnikiem po wygaśnięciu kontraktu.`,
        bodyEn: `${name} became a free agent after his contract expired.`,
        payload: { kind: 'contract_expired', playerId: player.id },
      })
    }
  }
  return { inboxMessages, loanLog }
}
