import { worldTeamsList } from '../worldState.js'
import { processAiContractCycle, releasePlayerToFreeAgency } from './freeAgency.js'
import { returnLoanedPlayer } from './loans.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'

/**
 * Progi przypomnień o wygasającym kontrakcie: rok / pół roku / 3 miesiące /
 * miesiąc / tydzień przed końcem — w tygodniach `weeksRemaining` (przybliżenie,
 * spójne niezależnie od tego, czy kontrakt ma już zapisaną `endDate`).
 */
const CONTRACT_EXPIRY_REMINDER_THRESHOLDS = [
  { key: 'oneYear', weeks: 52, labelPl: 'roku', labelEn: 'one year' },
  { key: 'sixMonths', weeks: 26, labelPl: 'pół roku', labelEn: 'six months' },
  { key: 'threeMonths', weeks: 13, labelPl: '3 miesięcy', labelEn: 'three months' },
  { key: 'oneMonth', weeks: 4, labelPl: 'miesiąca', labelEn: 'one month' },
  { key: 'oneWeek', weeks: 1, labelPl: 'tygodnia', labelEn: 'one week' },
]

/**
 * Przegląda kontrakty zawodników gracza (własnych i wypożyczonych) i wysyła do
 * skrzynki jednorazowe przypomnienie po przekroczeniu każdego progu z
 * `CONTRACT_EXPIRY_REMINDER_THRESHOLDS`. Stan "już wysłane" trzyma się na
 * `contract.remindersSent` — nowy kontrakt (odnowienie/transfer) zaczyna z
 * czystym stanem, bo `buildContract` zawsze tworzy świeży obiekt.
 */
export function processContractExpiryReminders(career) {
  const world = career?.world
  const inboxMessages = []
  if (!world || !career.playerTeamId) return { inboxMessages }
  const date = career.league?.currentDate ?? null

  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      const contract = player.contract
      if (!contract || !(contract.weeksRemaining > 0)) continue
      const isMine = team.id === career.playerTeamId || player.loan?.parentTeamId === career.playerTeamId
      if (!isMine) continue

      if (!contract.remindersSent || typeof contract.remindersSent !== 'object') {
        contract.remindersSent = {}
      }
      for (const threshold of CONTRACT_EXPIRY_REMINDER_THRESHOLDS) {
        if (contract.remindersSent[threshold.key]) continue
        if (contract.weeksRemaining > threshold.weeks) continue
        contract.remindersSent[threshold.key] = true
        const name = getPlayerFullName(player)
        inboxMessages.push({
          id: `contract-reminder-${threshold.key}-${player.id}-${date}`,
          type: 'club_news',
          read: false,
          date,
          seasonYear: career.seasonYear,
          seasonIndex: career.seasonIndex,
          title: `Wygasający kontrakt · ${name}`,
          titleEn: `Expiring contract · ${name}`,
          body: `Kontrakt zawodnika ${name} wygaśnie za mniej niż ${threshold.labelPl} (pozostało ${contract.weeksRemaining} tyg.).`,
          bodyEn: `${name}'s contract expires in less than ${threshold.labelEn} (${contract.weeksRemaining} wks left).`,
          payload: {
            kind: 'contract_expiring_soon',
            playerId: player.id,
            threshold: threshold.key,
            weeksRemaining: contract.weeksRemaining,
          },
        })
      }
    }
  }
  return { inboxMessages }
}

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
