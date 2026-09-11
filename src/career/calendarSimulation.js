import { processPlayingStyleDevelopment } from './playingStyleDevelopment.js'
import { playingStyleMessages } from './playingStyleMessages.js'
import { processManagerCareer } from './managerCareer.js'
import { processClubManagement } from './clubManagement.js'
import { processMonthlyOwnerFunding } from './clubEconomy.js'
import {
  worldTeamById,
  applyDailyDevelopment,
  isTransferWindowOpen,
  getTransferWindowState,
  simulateAiTransferActivity,
  messagesFromTrainingReports,
  messagesFromTrainingInjuries,
  messagesFromNewMatchInjuries,
  messagesFromNewTransferLogEntries,
  generateIncomingTransferOffers,
  generateRandomEvents,
  processPendingEventFollowUps,
  mergeInbox,
  expireStaleTransferOffers,
  processUltiworldTick,
  processWeeklyWages,
  processMonthlySponsorPayouts,
  messagesFromSponsorPayouts,
  processMonthlyTvPayouts,
  messagesFromTvPayouts,
  processDelayedTransferReplies,
  processWeeklyFinancialHealth,
  messagesFromFinancialHealth,
  spawnPendingRegistrationNotices,
  markPreAgreedNotified,
  messagesFromScoutMissions,
  resolveScoutMissions,
  decayScoutingKnowledge,
  advanceAcademyCampaigns,
  messagesFromAcademyCampaignReports,
  advancePlayerSearchCampaigns,
  messagesFromPlayerSearchReports,
  processLoanReturns,
  generateIncomingLoanOffers,
  checkForcedTransferListDemands,
  messagesFromForcedTransferListDemands,
} from './index.js'
import { advanceNationalTeamsForDate } from './nationalTeamSeason.js'
import { processTeamTrainingsForDate, weeklyTeamTrainingMaintenance } from './teamTraining.js'
import { advanceCalendarDay, getPlayerFixtureOnDate, areCompetitionsComplete } from '../league/dayEngine.js'
import { processContractExpirations, processContractExpiryReminders } from './transfers/contractLifecycle.js'
import { recordMatchKnowledgeGainForNewMatches } from './scouting.js'
import { messagesFromNewPlayerMatches } from './inbox.js'

export function computeCalendarDayStep(career, nextLeague, { weekTick = false, trainingDate = null, allowRandomEvents = true } = {}) {
  const inboxMessages = []
  processMonthlyOwnerFunding(career.world, trainingDate ?? nextLeague.currentDate)
  const management = processClubManagement({ ...career, league: nextLeague }, trainingDate ?? nextLeague.currentDate, { weekTick })
  career = { ...career, transferLog: management.transferLog }
  inboxMessages.push(...management.inboxMessages)
  if (trainingDate) {
    const training = processTeamTrainingsForDate(nextLeague, trainingDate, {
      playerTeamId: career.playerTeamId,
    })
    inboxMessages.push(...messagesFromTrainingReports(training.reports, career))
    inboxMessages.push(...messagesFromTrainingInjuries(training.reports, career))
    applyDailyDevelopment(nextLeague, {
      playerTeamId: career.playerTeamId,
      date: trainingDate,
      tag: `day-${trainingDate}`,
    })
  }
  inboxMessages.push(...playingStyleMessages(processPlayingStyleDevelopment(
    career.world ?? nextLeague, trainingDate ?? nextLeague.currentDate, career.seasonYear,
  ), career.playerTeamId))
  if (career.world) {
    // Campaign reports are due on the monthly anniversary of departure.
    const academyReports = advanceAcademyCampaigns(
      worldTeamById(career.world, career.playerTeamId),
      trainingDate ?? nextLeague.currentDate,
      career.world,
    )
    inboxMessages.push(
      ...messagesFromAcademyCampaignReports(academyReports, { ...career, league: nextLeague }),
    )
    // Kadry narodowe (Fazy 1-5) — kwalifikacje/turniej ME/MŚ mają konkretne daty
    // (przerwy reprezentacyjne, patrz seasonCalendar.js), więc muszą być sprawdzane
    // codziennie jak reszta tego bloku, nie tylko w weekTick. Zwraca już gotowe
    // wiadomości (nie surowe raporty), więc bez pośredniego messagesFromX.
    inboxMessages.push(
      ...advanceNationalTeamsForDate(career, career.world, trainingDate ?? nextLeague.currentDate),
    )
  }
  if (weekTick) {
    weeklyTeamTrainingMaintenance(nextLeague, {
      playerTeamId: career.playerTeamId,
    })
    if (career.world) {
      processWeeklyWages(career.world, { date: trainingDate ?? nextLeague.currentDate })
      decayScoutingKnowledge(career.world, career.playerTeamId)
      const playerSearchReports = advancePlayerSearchCampaigns(
        worldTeamById(career.world, career.playerTeamId),
      )
      inboxMessages.push(
        ...messagesFromPlayerSearchReports(playerSearchReports, { ...career, league: nextLeague }),
      )
      const financialHealth = processWeeklyFinancialHealth(career.world, {
        seasonYear: career.seasonYear,
      })
      inboxMessages.push(
        ...messagesFromFinancialHealth(
          financialHealth,
          { ...career, league: nextLeague },
          { date: trainingDate ?? nextLeague.currentDate, seasonYear: career.seasonYear },
        ),
      )
      const forcedListDemands = checkForcedTransferListDemands(career.world, {
        leaguePlayerStats: nextLeague.playerStats,
        standings: nextLeague.standings,
      })
      inboxMessages.push(
        ...messagesFromForcedTransferListDemands(forcedListDemands, { ...career, league: nextLeague }),
      )
      inboxMessages.push(
        ...processContractExpiryReminders({ ...career, league: nextLeague }).inboxMessages,
      )
    }
  }

  let world = career.world
  let transferLog = career.transferLog ?? []
  let loanLog = career.loanLog ?? []
  let aiTransfersLastDate = career.aiTransfersLastDate ?? null
  const contractCycle = processContractExpirations({ ...career, league: nextLeague, world, loanLog }, { renewAhead: weekTick })
  loanLog = contractCycle.loanLog
  inboxMessages.push(...contractCycle.inboxMessages)
  const probe = { ...career, league: nextLeague, world }
  if (
    isTransferWindowOpen(probe) &&
    (getTransferWindowState(probe).kind === 'january' ||
      getTransferWindowState(probe).kind === 'summer')
  ) {
    const simDate = trainingDate ?? nextLeague.currentDate
    if (simDate && aiTransfersLastDate !== simDate) {
      const ai = simulateAiTransferActivity(
        { ...probe, transferLog, loanLog },
        { mode: 'daily', date: simDate },
      )
      world = ai.world ?? world
      transferLog = ai.transferLog ?? transferLog
      loanLog = ai.loanLog ?? loanLog
      aiTransfersLastDate = simDate
    }
  }

  const offerCareer = { ...career, league: nextLeague, world, transferLog, inbox: career.inbox }
  const offerDate = trainingDate ?? nextLeague.currentDate
  if (world && offerDate) {
    const monthly = processMonthlySponsorPayouts(world, offerDate)
    inboxMessages.push(
      ...messagesFromSponsorPayouts(monthly, { ...career, league: nextLeague, world }, {
        kind: 'monthly',
        date: offerDate,
      }),
    )
    const monthlyTv = processMonthlyTvPayouts(world, offerDate)
    inboxMessages.push(
      ...messagesFromTvPayouts(monthlyTv, { ...career, league: nextLeague, world }, {
        date: offerDate,
      }),
    )
  }
  let inboxBase = expireStaleTransferOffers(
    { ...offerCareer, inbox: career.inbox },
    { date: offerDate },
  )
  const delayed = processDelayedTransferReplies(
    { ...offerCareer, loanLog, inbox: inboxBase },
    { date: offerDate },
  )
  world = delayed.world ?? world
  transferLog = delayed.transferLog ?? transferLog
  loanLog = delayed.loanLog ?? loanLog
  inboxBase = delayed.inbox ?? inboxBase
  if (delayed.resolved > 0) {
    inboxMessages.push(
      ...messagesFromNewTransferLogEntries(career.transferLog, transferLog, {
        ...career,
        league: nextLeague,
        world,
      }),
    )
  }
  const loanReturns = processLoanReturns(
    { ...offerCareer, world, transferLog, loanLog, inbox: inboxBase },
    { date: offerDate },
  )
  world = loanReturns.world ?? world
  loanLog = loanReturns.loanLog ?? loanLog
  transferLog = loanReturns.transferLog ?? transferLog
  if (loanReturns.inboxMessages?.length) inboxMessages.push(...loanReturns.inboxMessages)
  const regNotices = spawnPendingRegistrationNotices(
    { ...offerCareer, world, transferLog, inbox: inboxBase },
    { date: offerDate },
  )
  if (regNotices.length) {
    inboxBase = markPreAgreedNotified(inboxBase, regNotices)
    inboxMessages.push(...regNotices)
  }
  inboxMessages.push(
    ...generateIncomingTransferOffers({ ...offerCareer, world, transferLog, inbox: inboxBase }, { date: offerDate }),
  )
  inboxMessages.push(
    ...generateIncomingLoanOffers({ ...offerCareer, world, inbox: inboxBase }, { date: offerDate }),
  )
  // Random events assume a manager reacting in real time (moods, one-off choices
  // with a short shelf life) — they don't make sense fired blindly while fast-
  // forwarding through days nobody is actually watching, so `allowRandomEvents`
  // (false during "sim to date/match") skips generating and resolving them.
  const eventCareer = { ...offerCareer, world, transferLog, loanLog, inbox: inboxBase }
  const followUps = allowRandomEvents
    ? processPendingEventFollowUps(eventCareer, { date: offerDate })
    : { messages: [], pendingEventFollowUps: career.pendingEventFollowUps ?? [] }
  if (allowRandomEvents) inboxMessages.push(...generateRandomEvents(eventCareer, { date: offerDate }))
  if (followUps.messages.length) inboxMessages.push(...followUps.messages)
  inboxMessages.push(
    ...messagesFromNewMatchInjuries(
      offerCareer,
      career.league?.matchHistory ?? [],
      nextLeague.matchHistory ?? [],
      { date: offerDate },
    ),
  )

  const uw = processUltiworldTick(
    { ...career, league: nextLeague, world, transferLog, loanLog, ultiworld: career.ultiworld },
    { date: offerDate },
  )
  world = uw.world ?? world
  const leagueOut = uw.league ?? nextLeague
  inboxMessages.push(...(uw.inboxMessages ?? []))

  if (world && offerDate) {
    const resolvedScoutMissions = resolveScoutMissions(world, career.playerTeamId, leagueOut, offerDate)
    inboxMessages.push(
      ...messagesFromScoutMissions(
        resolvedScoutMissions,
        { ...career, league: leagueOut, world },
        { date: offerDate },
      ),
    )
  }

  recordMatchKnowledgeGainForNewMatches(world, career.playerTeamId, career.league?.matchHistory, leagueOut.matchHistory)
  inboxMessages.push(...messagesFromNewPlayerMatches(
    { ...career, league: leagueOut }, career.league?.matchHistory ?? [], leagueOut.matchHistory ?? [], leagueOut,
    { allowRandomEvents },
  ))
  const inbox = mergeInbox({ ...career, inbox: inboxBase }, inboxMessages)

  const managed = processManagerCareer({ ...career, league: leagueOut, world, inbox })
  return {
    league: managed.league,
    world: managed.world,
    managerCareer: managed.managerCareer,
    playerTeamId: managed.playerTeamId,
    homeTactics: managed.homeTactics,
    transferLog,
    loanLog,
    aiTransfersLastDate,
    inbox: managed.inbox,
    inboxMessages,
    ultiworld: uw.ultiworld,
    pendingEventFollowUps: managed.playerTeamId !== career.playerTeamId ? [] : followUps.pendingEventFollowUps,
  }
}

/** One chronological step for every UI mode. A blocked player match does not tick the day. */
export function advanceCareerDay(career, { autoSimulatePlayer = false, allowRandomEvents = true } = {}) {
  const league = career.league
  const date = league.currentDate
  const previousLeague = { ...league, matchHistory: [...(league.matchHistory ?? [])] }
  const expired = processContractExpirations(career)
  const readyCareer = { ...career, league: previousLeague, loanLog: expired.loanLog,
    inbox: mergeInbox(career, expired.inboxMessages) }
  const result = advanceCalendarDay(league, { autoSimulatePlayer })
  if (result.blocked || league.currentDate === date) {
    return { ...result, career: { ...readyCareer, league }, inboxMessages: expired.inboxMessages }
  }
  const advancedDate = league.currentDate
  // All events belong to the day just simulated, including the last day of a window.
  league.currentDate = date
  let step
  try {
    step = computeCalendarDayStep(readyCareer, league, { weekTick: result.weekTick, trainingDate: date, allowRandomEvents })
  } finally {
    league.currentDate = advancedDate
  }
  step.league.currentDate = advancedDate
  const { inboxMessages, ...patch } = step
  return { ...result, league: step.league, career: { ...readyCareer, ...patch },
    inboxMessages: [...expired.inboxMessages, ...inboxMessages] }
}

/** Fast-forward uses precisely the same chronological day as the Continue button. */
export async function simulateCareerUntil(career, { targetDate = null, untilMatch = false,
  maxDays = 400, onProgress = null } = {}) {
  let current = career
  let daysAdvanced = 0
  while (daysAdvanced < maxDays && current.league.status !== 'complete') {
    const date = current.league.currentDate
    if (targetDate && date >= targetDate) break
    if (untilMatch && (getPlayerFixtureOnDate(current.league, date) || areCompetitionsComplete(current.league))) break
    const result = advanceCareerDay(current, { autoSimulatePlayer: !untilMatch, allowRandomEvents: false })
    current = result.career
    if (result.blocked || current.managerCareer?.status === 'unemployed') break
    daysAdvanced++
    if (onProgress && (daysAdvanced % 4 === 0 || current.league.status === 'complete')) {
      onProgress({ daysAdvanced, currentDate: current.league.currentDate, total: maxDays })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  return { career: current, daysAdvanced }
}
