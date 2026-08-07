import { useCallback, useEffect, useMemo, useState } from 'react'

import { playerTeam, teamForMatchEngine } from './data/ufaLeagueTeams'
import {
  listSlots,
  createCareer,
  persistCareer,
  ensureCareerHomeTactics,
  finalizeSeason,
  startNextSeason,
  clearSlot,
  getSlot,
  worldTeamById,
  worldTeamsList,
  teamFromLeague,
  applyDailyDevelopment,
  applyDailyDevelopmentDateRangeAsync,
  isTransferWindowOpen,
  getTransferWindowState,
  simulateAiTransferActivity,
  simulateAiTransfersForDateRange,
  messagesFromTrainingReports,
  messagesFromTrainingInjuries,
  messagesFromInjuries,
  messagesFromNewMatchInjuries,
  messageFromMatchAnalysis,
  messagesFromNewPlayerMatches,
  messagesFromNewTransferLogEntries,
  generateIncomingTransferOffers,
  generateRandomEvents,
  mergeInbox,
  unreadInboxCount,
  respondToIncomingBid,
  updateInboxMessage,
  expireStaleTransferOffers,
  resolveInboxDecision,
  processUltiworldTick,
  unreadUltiworldCount,
  processWeeklyWages,
  processWeeklyWagesTimes,
  processMonthlySponsorPayouts,
  processMonthlySponsorPayoutsForRange,
  messagesFromSponsorPayouts,
  signSponsorOfferFromInbox,
  supersedeSponsorOfferMessages,
  processDelayedTransferReplies,
  processDelayedTransferRepliesForDateRange,
  queueIncomingBidCounter,
  queueOutgoingPlayerContract,
  acceptOutgoingClubCounter,
  acceptPlayerContractCounter,
  spawnPendingRegistrationNotices,
  markPreAgreedNotified,
  confirmPendingRegistration,
  declinePendingRegistration,
  formatUsd,
} from './career'
import { syncInjuriesFromMatchPlayers } from './models/playerInjury.js'
import {
  processTeamTrainingsForDate,
  processTeamTrainingsDateRangeAsync,
  weeklyTeamTrainingMaintenance,
} from './career/teamTraining.js'
import {
  applyMatchResultToLeague,
  cloneLeague,
  leagueRecordFromEngineResult,
  advanceCalendarDay,
  simulateUntilDateAsync,
  simulateUntilPlayerMatchOrEndAsync,
  isOfficialSeasonEnded,
} from './league'
import { resolvePlayerDefaultTactics } from './matchEngine'

import MatchView from './components/MatchView'
import Tactics from './components/Tactics'
import TacticsGuide from './components/TacticsGuide'
import RosterView from './components/RosterView'
import LeagueHub from './components/LeagueHub'
import LeagueStandingsView from './components/LeagueStandingsView'
import LeagueScheduleView from './components/LeagueScheduleView'
import LeagueLeadersView from './components/LeagueLeadersView'
import CupView from './components/CupView'
import TeamProfileView from './ui/TeamProfileView.jsx'
import CareerSelectScreen from './components/CareerSelectScreen'
import NewCareerScreen from './components/NewCareerScreen'
import TrainingView from './components/TrainingView'
import ClubBoardView from './components/ClubBoardView'
import TransfersView from './components/TransfersView'
import CalendarView from './components/CalendarView'
import InboxView from './components/InboxView'
import UltiworldView from './components/UltiworldView'
import PreMatchView, { isFixtureMatchDay } from './components/PreMatchView'
import SimulationProgressOverlay from './components/SimulationProgressOverlay'
import { buildSeasonStateFromLeague } from './seasonEngine/seasonStateFromLeague.js'
import { displaySeasonLabel, pickLabel, pickCopy } from './ui/locale'
import { useUiLang } from './ui/UiLangContext'
import { LangSwitch } from './ui/LangSwitch'
import { careerFlowStrings } from './ui/strings/careerFlow'
import { shellStrings } from './ui/strings/shell'

const NAV_CATEGORIES = [
  {
    id: 'home',
    labelPl: 'Strona główna',
    labelEn: 'Home',
    items: [
      { id: 'hub', labelPl: 'Centrum', labelEn: 'Hub' },
      { id: 'inbox', labelPl: 'Skrzynka', labelEn: 'Inbox' },
      { id: 'match', labelPl: 'Następny mecz', labelEn: 'Next match' },
    ],
  },
  {
    id: 'club',
    labelPl: 'Drużyna',
    labelEn: 'Team',
    items: [
      { id: 'tactics', labelPl: 'Taktyka', labelEn: 'Tactics' },
      { id: 'roster', labelPl: 'Skład', labelEn: 'Roster' },
      { id: 'training', labelPl: 'Treningi', labelEn: 'Training' },
      { id: 'team-schedule', labelPl: 'Terminarz', labelEn: 'Schedule' },
      { id: 'calendar', labelPl: 'Kalendarz', labelEn: 'Calendar' },
      { id: 'club-transfers', labelPl: 'Transfery', labelEn: 'Transfers' },
      { id: 'club-board', labelPl: 'Zarząd', labelEn: 'Club board' },
      { id: 'team-profile', labelPl: 'Profil drużyny', labelEn: 'Team profile' },
    ],
  },
  {
    id: 'season',
    labelPl: 'Sezon',
    labelEn: 'Season',
    items: [
      { id: 'standings', labelPl: 'Tabela ligowa', labelEn: 'Standings' },
      { id: 'league-schedule', labelPl: 'Terminarz ligi', labelEn: 'League schedule' },
      { id: 'leaders', labelPl: 'Liderzy', labelEn: 'Leaders' },
      { id: 'league-transfers', labelPl: 'Transfery ligowe', labelEn: 'League transfers' },
      { id: 'cup', labelPl: 'Puchar', labelEn: 'Cup' },
    ],
  },
  {
    id: 'ultiworld',
    labelPl: 'Ultizone',
    labelEn: 'Ultiworld',
    items: [{ id: 'ultiworld', labelPl: 'Ultizone', labelEn: 'Ultiworld' }],
  },
  {
    id: 'other',
    labelPl: 'Inne',
    labelEn: 'Other',
    items: [
      { id: 'career', labelPl: 'Kariera', labelEn: 'Career' },
      { id: 'playbook', labelPl: 'Playbook', labelEn: 'Playbook' },
    ],
  },
]

/** Stare id zakładek → nowe (skróty / skrzynka / zapisane referencje). */
const TAB_ALIASES = {
  season: 'hub',
  schedule: 'league-schedule',
  transfers: 'club-transfers',
  team: 'team-profile',
}

const VIEW_TO_CATEGORY = Object.fromEntries(
  NAV_CATEGORIES.flatMap((cat) => cat.items.map((item) => [item.id, cat.id])),
)

function resolveTabId(tabId) {
  return TAB_ALIASES[tabId] ?? tabId
}

function findNextPlayerFixture(league) {
  if (!league) return null
  const today = league.currentDate
  const pid = league.playerTeamId
  return (
    (league.fixtures ?? [])
      .filter(
        (f) =>
          f.status !== 'completed' &&
          f.homeTeamId &&
          f.awayTeamId &&
          (f.homeTeamId === pid || f.awayTeamId === pid) &&
          (!f.date || !today || f.date >= today),
      )
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))[0] ?? null
  )
}

export default function App() {
  const { lang: uiLang, setLang: setUiLang } = useUiLang()
  const tShell = shellStrings(uiLang)
  const [screen, setScreen] = useState('slots') // slots | new | play
  const [slots, setSlots] = useState(() => listSlots())
  const [pendingSlot, setPendingSlot] = useState(null)
  const [career, setCareer] = useState(null)

  const [activeTab, setActiveTab] = useState('hub')
  const [leagueFixture, setLeagueFixture] = useState(null)
  const [matchStamina, setMatchStamina] = useState(null)
  const [teamProfileId, setTeamProfileId] = useState(null)
  const [simProgress, setSimProgress] = useState(null)

  const league = career?.league ?? null
  const playerTeamId = career?.playerTeamId ?? null
  const userTeam = useMemo(() => {
    if (!playerTeamId) return null
    return (
      worldTeamById(career?.world, playerTeamId) ??
      teamFromLeague(league, playerTeamId) ??
      playerTeam(playerTeamId)
    )
  }, [career?.world, league, playerTeamId])
  const worldTeams = useMemo(
    () => (career?.world ? worldTeamsList(career.world) : []),
    [career?.world],
  )
  const homeTactics = useMemo(
    () => {
      const base = resolvePlayerDefaultTactics(userTeam?.players ?? [], career?.homeTactics)
      if (!base) return base
      const fam = userTeam?.teamTraining?.tacticsFamiliarity
      if (typeof fam === 'number') return { ...base, tacticsFamiliarity: fam }
      return base
    },
    [career?.homeTactics, userTeam?.players, userTeam?.teamTraining?.tacticsFamiliarity],
  )

  const matchTeams = useMemo(() => {
    if (!leagueFixture || !league) return { home: null, away: null }
    const home = teamFromLeague(league, leagueFixture.homeTeamId)
    const away = teamFromLeague(league, leagueFixture.awayTeamId)
    return {
      home: home ? teamForMatchEngine(home) : null,
      away: away ? teamForMatchEngine(away) : null,
    }
  }, [league, leagueFixture])

  const seasonState = useMemo(
    () => (league ? buildSeasonStateFromLeague(league) : null),
    [league],
  )

  const refreshSlots = useCallback(() => {
    setSlots(listSlots())
  }, [])

  const syncCareer = useCallback((next) => {
    setCareer(next)
    refreshSlots()
  }, [refreshSlots])

  // Oficjalny koniec (31 lipca): archiwizacja + pytanie o kolejny sezon
  useEffect(() => {
    if (!career || career.phase === 'season_complete') return
    const league = career.league
    if (!league) return
    if (!isOfficialSeasonEnded(league)) return
    try {
      const next = finalizeSeason(career)
      syncCareer(next)
      setActiveTab('hub')
    } catch {
      /* jeszcze nie gotowe */
    }
  }, [career, syncCareer])

  const handleLeagueChange = useCallback(
    (nextLeague) => {
      if (!career) return
      const next = persistCareer(career, { league: nextLeague })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const persistLeagueDay = useCallback(
    (nextLeague, { weekTick = false, trainingDate = null } = {}) => {
      if (!career) return
      const inboxMessages = []
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
      if (weekTick) {
        weeklyTeamTrainingMaintenance(nextLeague, {
          playerTeamId: career.playerTeamId,
        })
        if (career.world) processWeeklyWages(career.world)
      }

      let world = career.world
      let transferLog = career.transferLog ?? []
      let aiTransfersLastDate = career.aiTransfersLastDate ?? null
      const probe = { ...career, league: nextLeague, world }
      if (
        isTransferWindowOpen(probe) &&
        (getTransferWindowState(probe).kind === 'january' ||
          getTransferWindowState(probe).kind === 'summer')
      ) {
        const simDate = trainingDate ?? nextLeague.currentDate
        if (simDate && aiTransfersLastDate !== simDate) {
          const ai = simulateAiTransferActivity(
            { ...probe, transferLog },
            { mode: 'daily', date: simDate },
          )
          world = ai.world ?? world
          transferLog = ai.transferLog ?? transferLog
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
      }
      let inboxBase = expireStaleTransferOffers(
        { ...offerCareer, inbox: career.inbox },
        { date: offerDate },
      )
      const delayed = processDelayedTransferReplies(
        { ...offerCareer, inbox: inboxBase },
        { date: offerDate },
      )
      world = delayed.world ?? world
      transferLog = delayed.transferLog ?? transferLog
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
      inboxMessages.push(...generateRandomEvents(offerCareer, { date: offerDate }))
      inboxMessages.push(
        ...messagesFromNewMatchInjuries(
          offerCareer,
          career.league?.matchHistory ?? [],
          nextLeague.matchHistory ?? [],
          { date: offerDate },
        ),
      )

      const uw = processUltiworldTick(
        { ...career, league: nextLeague, world, ultiworld: career.ultiworld },
        { date: offerDate },
      )
      world = uw.world ?? world
      const leagueOut = uw.league ?? nextLeague
      inboxMessages.push(...(uw.inboxMessages ?? []))

      const next = persistCareer(career, {
        league: leagueOut,
        world,
        transferLog,
        aiTransfersLastDate,
        inbox: mergeInbox({ ...career, inbox: inboxBase }, inboxMessages),
        ultiworld: uw.ultiworld,
      })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const handleAdvanceDay = useCallback(() => {
    if (!career?.league) return
    if (career.phase === 'season_complete') {
      setActiveTab('hub')
      return
    }
    // Na 31 lipca (i później) — nie idź dalej; pokaż podsumowanie / przejście
    if (isOfficialSeasonEnded(career.league)) {
      setActiveTab('hub')
      try {
        if (career.phase !== 'season_complete') {
          const next = finalizeSeason(career)
          syncCareer(next)
        }
      } catch {
        /* ignore */
      }
      return
    }

    const nextLeague = cloneLeague(career.league)
    const dayBefore = nextLeague.currentDate
    const result = advanceCalendarDay(nextLeague)
    if (result.blocked && result.playerFixture) {
      persistLeagueDay(nextLeague, { weekTick: false, trainingDate: dayBefore })
      setLeagueFixture(result.playerFixture)
      setActiveTab('match')
      return
    }
    persistLeagueDay(nextLeague, {
      weekTick: !!result.weekTick,
      trainingDate: dayBefore,
    })
  }, [career, persistLeagueDay, syncCareer])

  const applyFastForwardSideEffects = useCallback(
    async (nextLeague, rangeStart, weekTicks, { includeEndDay = false, onProgress } = {}) => {
      const rangeEnd = nextLeague.currentDate
      const reportProgress = ( partial) => {
        onProgress?.(partial)
      }

      reportProgress({
        label: shellStrings(uiLang).simTeamTraining,
        detail: shellStrings(uiLang).simProcessingSessions,
        current: 0,
        total: 1,
        indeterminate: true,
      })
      const rangeResult = await processTeamTrainingsDateRangeAsync(
        nextLeague,
        rangeStart,
        rangeEnd,
        {
          playerTeamId: career.playerTeamId,
          onProgress: (p) =>
            reportProgress({
              label: shellStrings(uiLang).simTeamTraining,
              detail: p.currentDate ? shellStrings(uiLang).simDay(p.currentDate) : undefined,
              current: p.daysAdvanced,
              total: p.total,
            }),
        },
      )
      const reports = [...(rangeResult.reports ?? [])]

      reportProgress({
        label: shellStrings(uiLang).simDevelopment,
        detail: shellStrings(uiLang).simFatigue,
        current: 0,
        total: 1,
        indeterminate: true,
      })
      await applyDailyDevelopmentDateRangeAsync(nextLeague, rangeStart, rangeEnd, {
        playerTeamId: career.playerTeamId,
        onProgress: (p) =>
          reportProgress({
            label: shellStrings(uiLang).simDevelopment,
            detail: p.currentDate ? shellStrings(uiLang).simDay(p.currentDate) : undefined,
            current: p.daysAdvanced,
            total: p.total,
          }),
      })

      if (includeEndDay && rangeEnd) {
        const endTraining = processTeamTrainingsForDate(nextLeague, rangeEnd, {
          playerTeamId: career.playerTeamId,
        })
        if (endTraining.reports?.length) reports.push(...endTraining.reports)
        applyDailyDevelopment(nextLeague, {
          playerTeamId: career.playerTeamId,
          date: rangeEnd,
          tag: `day-${rangeEnd}`,
        })
      }
      for (let i = 0; i < weekTicks; i += 1) {
        weeklyTeamTrainingMaintenance(nextLeague, {
          playerTeamId: career.playerTeamId,
        })
      }
      if (weekTicks > 0 && career.world) {
        processWeeklyWagesTimes(career.world, weekTicks)
      }
      return { reports }
    },
    [career],
  )

  const handleSimulateUntilMatch = useCallback(async () => {
    if (!career?.league || simProgress) return
    const nextLeague = cloneLeague(career.league)
    const rangeStart = nextLeague.currentDate
    const prevMatchHistory = [...(nextLeague.matchHistory ?? [])]

    setSimProgress({
      label: shellStrings(uiLang).simUntilMatch,
      detail: shellStrings(uiLang).simFrom(rangeStart),
      current: 0,
      total: 35,
    })

    try {
      const result = await simulateUntilPlayerMatchOrEndAsync(nextLeague, {
        maxDays: 120,
        onProgress: (p) =>
          setSimProgress({
            label: shellStrings(uiLang).simCalendar,
            detail: p.currentDate ? shellStrings(uiLang).simDay(p.currentDate) : undefined,
            current: p.daysAdvanced,
            total: p.total,
          }),
      })

      const { reports } = await applyFastForwardSideEffects(
        nextLeague,
        rangeStart,
        result.weekTicks ?? 0,
        {
          includeEndDay: !!result.blocked,
          onProgress: setSimProgress,
        },
      )

      setSimProgress({
        label: shellStrings(uiLang).simTransfersInbox,
        detail: shellStrings(uiLang).simClosingDay,
        indeterminate: true,
      })
      await new Promise((r) => setTimeout(r, 0))

      let world = career.world
      let transferLog = career.transferLog ?? []
      const probe = { ...career, league: nextLeague, world, transferLog }
      const ai = simulateAiTransfersForDateRange(probe, rangeStart, nextLeague.currentDate)
      world = ai.world ?? world
      transferLog = ai.transferLog ?? transferLog

      const monthlyPayouts = world
        ? processMonthlySponsorPayoutsForRange(world, rangeStart, nextLeague.currentDate)
        : []

      const inboxBaseExpired = expireStaleTransferOffers(
        { ...career, league: nextLeague, world, inbox: career.inbox },
        { date: nextLeague.currentDate },
      )
      const delayed = processDelayedTransferRepliesForDateRange(
        { ...career, league: nextLeague, world, transferLog, inbox: inboxBaseExpired },
        rangeStart,
        nextLeague.currentDate,
      )
      world = delayed.world ?? world
      transferLog = delayed.transferLog ?? transferLog
      const inboxBase = delayed.inbox ?? inboxBaseExpired

      const regNotices = spawnPendingRegistrationNotices(
        { ...career, league: nextLeague, world, transferLog, inbox: inboxBase },
        { date: nextLeague.currentDate },
      )
      const inboxAfterReg = regNotices.length
        ? markPreAgreedNotified(inboxBase, regNotices)
        : inboxBase

      const inboxMessages = [
        ...messagesFromTrainingReports(reports, career),
        ...messagesFromTrainingInjuries(reports, career),
        ...messagesFromNewPlayerMatches(
          { ...career, league: nextLeague },
          prevMatchHistory,
          nextLeague.matchHistory,
          nextLeague,
        ),
        ...messagesFromNewMatchInjuries(
          { ...career, league: nextLeague, world },
          prevMatchHistory,
          nextLeague.matchHistory,
          { date: nextLeague.currentDate },
        ),
        ...messagesFromNewTransferLogEntries(career.transferLog, transferLog, {
          ...career,
          league: nextLeague,
          world,
        }),
        ...regNotices,
        ...generateIncomingTransferOffers(
          { ...career, league: nextLeague, world, transferLog, inbox: inboxAfterReg },
          { date: nextLeague.currentDate },
        ),
        ...generateRandomEvents(
          { ...career, league: nextLeague, world },
          { date: nextLeague.currentDate },
        ),
        ...messagesFromSponsorPayouts(
          monthlyPayouts,
          { ...career, league: nextLeague, world },
          { kind: 'monthly', date: nextLeague.currentDate },
        ),
      ]

      const uw = processUltiworldTick(
        { ...career, league: nextLeague, world, ultiworld: career.ultiworld },
        { date: nextLeague.currentDate },
      )
      world = uw.world ?? world
      const leagueOut = uw.league ?? nextLeague
      inboxMessages.push(...(uw.inboxMessages ?? []))

      const next = persistCareer(career, {
        league: leagueOut,
        world,
        transferLog,
        aiTransfersLastDate: nextLeague.currentDate,
        inbox: mergeInbox({ ...career, inbox: inboxAfterReg }, inboxMessages),
        ultiworld: uw.ultiworld,
      })
      syncCareer(next)
      if (result.blocked && result.playerFixture) {
        setLeagueFixture(result.playerFixture)
        setActiveTab('match')
      } else if (isOfficialSeasonEnded(nextLeague) || nextLeague.status === 'complete') {
        setActiveTab('hub')
      }
    } finally {
      setSimProgress(null)
    }
  }, [career, syncCareer, applyFastForwardSideEffects, simProgress, uiLang])

  const handleSimulateUntilDate = useCallback(
    async (targetDate) => {
      if (!career?.league || !targetDate || simProgress) return
      const nextLeague = cloneLeague(career.league)
      if (targetDate <= nextLeague.currentDate) return
      const rangeStart = nextLeague.currentDate
      const prevMatchHistory = [...(nextLeague.matchHistory ?? [])]

      setSimProgress({
        label: shellStrings(uiLang).simUntilDate,
        detail: `${rangeStart} → ${targetDate}`,
        current: 0,
        total: 1,
      })

      try {
        const result = await simulateUntilDateAsync(nextLeague, targetDate, {
          maxDays: 400,
          autoSimulatePlayer: true,
          onProgress: (p) =>
            setSimProgress({
              label: shellStrings(uiLang).simCalendar,
              detail: p.currentDate
                ? shellStrings(uiLang).simDay(p.currentDate)
                : `${rangeStart} → ${targetDate}`,
              current: p.daysAdvanced,
              total: p.total,
            }),
        })

        const { reports } = await applyFastForwardSideEffects(
          nextLeague,
          rangeStart,
          result.weekTicks ?? 0,
          { onProgress: setSimProgress },
        )

        setSimProgress({
          label: shellStrings(uiLang).simTransfersInbox,
          detail: shellStrings(uiLang).simClosingDay,
          indeterminate: true,
        })
        await new Promise((r) => setTimeout(r, 0))

        let world = career.world
        let transferLog = career.transferLog ?? []
        const probe = { ...career, league: nextLeague, world, transferLog }
        const ai = simulateAiTransfersForDateRange(probe, rangeStart, nextLeague.currentDate)
        world = ai.world ?? world
        transferLog = ai.transferLog ?? transferLog

        const monthlyPayouts = world
          ? processMonthlySponsorPayoutsForRange(world, rangeStart, nextLeague.currentDate)
          : []

        const inboxBaseExpired = expireStaleTransferOffers(
          { ...career, league: nextLeague, world, inbox: career.inbox },
          { date: nextLeague.currentDate },
        )
        const delayed = processDelayedTransferRepliesForDateRange(
          { ...career, league: nextLeague, world, transferLog, inbox: inboxBaseExpired },
          rangeStart,
          nextLeague.currentDate,
        )
        world = delayed.world ?? world
        transferLog = delayed.transferLog ?? transferLog
        const inboxBase = delayed.inbox ?? inboxBaseExpired

        const regNotices = spawnPendingRegistrationNotices(
          { ...career, league: nextLeague, world, transferLog, inbox: inboxBase },
          { date: nextLeague.currentDate },
        )
        const inboxAfterReg = regNotices.length
          ? markPreAgreedNotified(inboxBase, regNotices)
          : inboxBase

        const inboxMessages = [
          ...messagesFromTrainingReports(reports, career),
          ...messagesFromTrainingInjuries(reports, career),
          ...messagesFromNewPlayerMatches(
            { ...career, league: nextLeague },
            prevMatchHistory,
            nextLeague.matchHistory,
            nextLeague,
          ),
          ...messagesFromNewMatchInjuries(
            { ...career, league: nextLeague, world },
            prevMatchHistory,
            nextLeague.matchHistory,
            { date: nextLeague.currentDate },
          ),
          ...messagesFromNewTransferLogEntries(career.transferLog, transferLog, {
            ...career,
            league: nextLeague,
            world,
          }),
          ...regNotices,
          ...generateIncomingTransferOffers(
            { ...career, league: nextLeague, world, transferLog, inbox: inboxAfterReg },
            { date: nextLeague.currentDate },
          ),
          ...generateRandomEvents(
            { ...career, league: nextLeague, world },
            { date: nextLeague.currentDate },
          ),
          ...messagesFromSponsorPayouts(
            monthlyPayouts,
            { ...career, league: nextLeague, world },
            { kind: 'monthly', date: nextLeague.currentDate },
          ),
        ]

        const uw = processUltiworldTick(
          { ...career, league: nextLeague, world, ultiworld: career.ultiworld },
          { date: nextLeague.currentDate },
        )
        world = uw.world ?? world
        const leagueOut = uw.league ?? nextLeague
        inboxMessages.push(...(uw.inboxMessages ?? []))

        const next = persistCareer(career, {
          league: leagueOut,
          world,
          transferLog,
          aiTransfersLastDate: nextLeague.currentDate,
          inbox: mergeInbox({ ...career, inbox: inboxAfterReg }, inboxMessages),
          ultiworld: uw.ultiworld,
        })
        syncCareer(next)
        setLeagueFixture(null)
        if (isOfficialSeasonEnded(nextLeague) || nextLeague.status === 'complete') {
          setActiveTab('hub')
        } else {
          setActiveTab('calendar')
        }
      } finally {
        setSimProgress(null)
      }
    },
    [career, syncCareer, applyFastForwardSideEffects, simProgress, uiLang],
  )

  const handleTrainingChange = useCallback(() => {
    if (!career) return
    const next = persistCareer(career, { world: career.world, league: career.league })
    syncCareer(next)
  }, [career, syncCareer])

  const handleClubBoardChange = useCallback(
    (patch) => {
      if (!career) return
      let inbox = career.inbox
      if (patch?.signedSponsorSlot) {
        inbox = supersedeSponsorOfferMessages(career.inbox, patch.signedSponsorSlot)
      }
      const next = persistCareer(career, {
        world: career.world,
        league: career.league,
        inbox,
      })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const handleTransfersUpdate = useCallback(
    (patch) => {
      if (!career) return null
      const nextLog = patch.transferLog ?? career.transferLog
      const dealMessages = messagesFromNewTransferLogEntries(
        career.transferLog,
        nextLog,
        career,
      )
      let inbox = patch.inbox ?? career.inbox
      if (dealMessages.length) {
        inbox = mergeInbox({ ...career, inbox }, dealMessages)
      }
      const next = persistCareer(career, {
        world: patch.world ?? career.world,
        league: career.league,
        transferLog: nextLog,
        aiOffseasonTransferWaves:
          patch.aiOffseasonTransferWaves ?? career.aiOffseasonTransferWaves,
        aiTransfersLastDate: patch.aiTransfersLastDate ?? career.aiTransfersLastDate,
        inbox,
      })
      syncCareer(next)
      return next
    },
    [career, syncCareer],
  )

  const handleInboxChange = useCallback(
    (nextInbox) => {
      if (!career) return
      const next = persistCareer(career, { inbox: nextInbox })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const handleUltiworldChange = useCallback(
    (nextUltiworld) => {
      if (!career) return
      const next = persistCareer(career, { ultiworld: nextUltiworld })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const handleTransferOfferAction = useCallback(
    ({ action, messageId, counterAmount, contractTerms }) => {
      if (!career || !messageId) return { ok: false, error: shellStrings(uiLang).errNoOffer }
      const message = (career.inbox ?? []).find((m) => m.id === messageId)
      const p = message?.payload
      if (!message) {
        return { ok: false, error: shellStrings(uiLang).errOfferNotFound }
      }

      // —— Potwierdzenie / anulowanie rejestracji po otwarciu okna ——
      if (p?.kind === 'pending_registration') {
        if (action === 'confirm_registration') {
          const result = confirmPendingRegistration(career, { messageId })
          if (!result.ok) {
            if (result.inbox) {
              const next = persistCareer(career, { inbox: result.inbox })
              syncCareer(next)
            }
            return result
          }
          const dealMessages = messagesFromNewTransferLogEntries(
            career.transferLog,
            result.transferLog,
            career,
          )
          const inbox = mergeInbox({ ...career, inbox: result.inbox }, dealMessages)
          const next = persistCareer(career, {
            world: result.world ?? career.world,
            transferLog: result.transferLog ?? career.transferLog,
            inbox,
          })
          syncCareer(next)
          return result
        }
        if (action === 'decline_registration') {
          const result = declinePendingRegistration(career, { messageId })
          if (!result.ok) return result
          const next = persistCareer(career, { inbox: result.inbox })
          syncCareer(next)
          return result
        }
      }

      // —— Wychodząca oferta klubowa: akceptacja kontrpropozycji ——
      if (p?.kind === 'outgoing_club_offer' && action === 'accept_club_counter') {
        const result = acceptOutgoingClubCounter(career, { messageId })
        if (!result.ok) return result
        const next = persistCareer(career, { inbox: result.inbox })
        syncCareer(next)
        return result
      }

      // —— Po zgodzie klubu: wyślij ofertę kontraktu ——
      if (
        (p?.kind === 'outgoing_club_offer' && p.status === 'club_agreed') ||
        (p?.kind === 'outgoing_player_contract' && p.status === 'rejected')
      ) {
        if (action === 'propose_contract' && contractTerms) {
          const fee = p.agreedFee ?? p.fee ?? p.offerAmount
          const queued = queueOutgoingPlayerContract(career, {
            playerId: p.playerId,
            fee,
            parentMessageId: p.kind === 'outgoing_club_offer' ? messageId : p.parentMessageId,
            ...contractTerms,
          })
          if (!queued.ok) return queued
          const inbox = mergeInbox(
            { ...career, inbox: queued.inboxBase ?? career.inbox },
            [queued.message],
          )
          const next = persistCareer(career, { inbox })
          syncCareer(next)
          return queued
        }
      }

      // —— Kontrpropozycja zawodnika: akceptuj ich warunki ——
      if (p?.kind === 'outgoing_player_contract' && action === 'accept_player_counter') {
        const result = acceptPlayerContractCounter(career, { messageId })
        if (!result.ok) return result
        if (result.preAgreed) {
          const next = persistCareer(career, { inbox: result.inbox })
          syncCareer(next)
          return result
        }
        const dealMessages = messagesFromNewTransferLogEntries(
          career.transferLog,
          result.transferLog,
          career,
        )
        const inbox = mergeInbox({ ...career, inbox: result.inbox }, dealMessages)
        const next = persistCareer(career, {
          world: result.world ?? career.world,
          transferLog: result.transferLog ?? career.transferLog,
          inbox,
        })
        syncCareer(next)
        return result
      }

      // —— Ponowna oferta kontraktu po counter zawodnika ——
      if (p?.kind === 'outgoing_player_contract' && action === 'propose_contract' && contractTerms) {
        const queued = queueOutgoingPlayerContract(career, {
          playerId: p.playerId,
          fee: p.fee,
          parentMessageId: p.parentMessageId ?? messageId,
          ...contractTerms,
        })
        if (!queued.ok) return queued
        const inboxMarked = updateInboxMessage(
          queued.inboxBase ?? career.inbox,
          messageId,
          { payload: { status: 'superseded' }, read: true },
        )
        const inbox = mergeInbox({ ...career, inbox: inboxMarked }, [queued.message])
        const next = persistCareer(career, { inbox })
        syncCareer(next)
        return queued
      }

      // —— Oferty przychodzące ——
      if (p?.kind !== 'incoming_bid') {
        return { ok: false, error: shellStrings(uiLang).errOfferNotFound }
      }
      if (p.status !== 'pending' && p.status !== 'counter') {
        return { ok: false, error: shellStrings(uiLang).errOfferInactive }
      }

      // Kontroferta → odpowiedź AI za 1–3 dni
      if (action === 'counter') {
        const queued = queueIncomingBidCounter(career, { messageId, counterAmount })
        if (!queued.ok) return queued
        const next = persistCareer(career, { inbox: queued.inbox })
        syncCareer(next)
        return queued
      }

      // Accept poza oknem → umowa wstępna (sprzedaż)
      if (action === 'accept' && !isTransferWindowOpen(career)) {
        const inbox = updateInboxMessage(career.inbox, messageId, {
          read: false,
          title: `Umowa wstępna · ${p.playerName}`,
          titleEn: `Pre-agreement · ${p.playerName}`,
          body: `${message.body}\n\nZaakceptowałeś ${formatUsd(p.fee)}. Okno jest zamknięte — w dniu otwarcia dostaniesz prośbę o potwierdzenie rejestracji sprzedaży.`,
          bodyEn: `${pickCopy(message, 'body', 'en') || message.body}\n\nYou accepted ${formatUsd(p.fee)}. The window is closed — on opening day you will get a prompt to confirm registering the sale.`,
          payload: {
            status: 'pre_agreed',
            direction: 'sell',
            registrationNotified: false,
            lastNegotiationMessage: 'Umowa wstępna — czeka na otwarcie okna.',
            lastNegotiationMessageEn: 'Pre-agreement — waiting for the window to open.',
          },
        })
        const next = persistCareer(career, { inbox })
        syncCareer(next)
        return { ok: true, preAgreed: true, queued: true }
      }

      const result = respondToIncomingBid(career, {
        action,
        playerId: p.playerId,
        buyerTeamId: p.fromTeamId,
        fee: p.fee,
        counterAmount,
        askPrice: p.askPrice,
      })

      if (!result.ok) return result

      const logEntry = {
        at: new Date().toISOString(),
        action,
        counterAmount: counterAmount ?? null,
        message: result.message,
      }
      const prevLog = Array.isArray(p.negotiationLog) ? p.negotiationLog : []

      let inboxPatch = {
        lastNegotiationMessage: result.message,
        negotiationLog: [...prevLog, logEntry],
      }

      if (result.completed) {
        inboxPatch = {
          ...inboxPatch,
          status: 'accepted',
          fee: result.entry?.fee ?? p.fee,
        }
        const dealMessages = messagesFromNewTransferLogEntries(
          career.transferLog,
          result.transferLog,
          career,
        )
        const inbox = updateInboxMessage(
          mergeInbox(career, dealMessages),
          messageId,
          {
            read: true,
            title: `Sprzedano · ${p.playerName}`,
            titleEn: `Sold · ${p.playerName}`,
            body: result.message,
            bodyEn: result.messageEn ?? result.message,
            payload: inboxPatch,
          },
        )
        const next = persistCareer(career, {
          world: result.world ?? career.world,
          transferLog: result.transferLog ?? career.transferLog,
          inbox,
        })
        syncCareer(next)
        return result
      }

      if (result.renegotiated && result.newFee != null) {
        inboxPatch = {
          ...inboxPatch,
          status: 'counter',
          fee: result.newFee,
        }
      } else if (result.rejected) {
        inboxPatch = {
          ...inboxPatch,
          status: 'rejected',
        }
      }

      const inbox = updateInboxMessage(career.inbox, messageId, {
        read: true,
        body: result.message ? `${message.body}\n\n${result.message}` : message.body,
        bodyEn: result.message
          ? `${pickCopy(message, 'body', 'en') || message.bodyEn || message.body}\n\n${result.messageEn ?? result.message}`
          : message.bodyEn ?? message.body,
        payload: inboxPatch,
      })

      const next = persistCareer(career, {
        world: result.world ?? career.world,
        inbox,
      })
      syncCareer(next)
      return result
    },
    [career, syncCareer, uiLang],
  )

  const handleResolveDecision = useCallback(
    (messageId, choiceId) => {
      if (!career || !messageId || !choiceId) return
      const result = resolveInboxDecision(career, messageId, choiceId)
      if (!result.ok) return
      const next = persistCareer(career, result.careerPatch)
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const handleSponsorSign = useCallback(
    (messageId, offerId) => {
      if (!career || !messageId || !offerId) return { ok: false, error: 'missing' }
      const result = signSponsorOfferFromInbox(career, messageId, offerId)
      if (!result.ok) return result
      const next = persistCareer(career, {
        world: result.world ?? career.world,
        inbox: result.inbox ?? career.inbox,
      })
      syncCareer(next)
      return result
    },
    [career, syncCareer],
  )

  const handleHomeTacticsChange = useCallback(
    (nextTactics) => {
      if (!career) return
      const next = persistCareer(career, { homeTactics: nextTactics })
      syncCareer(next)
    },
    [career, syncCareer],
  )

  const openTeamProfile = useCallback((teamId) => {
    setTeamProfileId(teamId)
    setActiveTab('team-profile')
  }, [])

  const handleTeamProfileBack = useCallback(() => {
    setTeamProfileId(null)
    setActiveTab('standings')
  }, [])

  const navigateTo = useCallback(
    (tabId) => {
      const id = resolveTabId(tabId)
      if (id === 'match') {
        const needNext =
          !leagueFixture ||
          leagueFixture.status === 'completed'
        if (needNext) {
          const nextFix = findNextPlayerFixture(career?.league)
          if (nextFix) setLeagueFixture(nextFix)
          else if (leagueFixture?.status === 'completed') setLeagueFixture(null)
        }
      }
      // Z nawigacji / skrótów: własna drużyna. openTeamProfile ustawia id osobno.
      setTeamProfileId(null)
      setActiveTab(id)
    },
    [career?.league, leagueFixture],
  )

  const handleLeagueMatchComplete = useCallback(
    (result, fixture) => {
      if (!career) return
      setCareer((prev) => {
        if (!prev) return prev
        const copy = cloneLeague(prev.league)
        const home = teamFromLeague(copy, fixture.homeTeamId)
        const away = teamFromLeague(copy, fixture.awayTeamId)
        const syncedInjuries = syncInjuriesFromMatchPlayers(result.players, [
          home?.players,
          away?.players,
        ])
        const record = leagueRecordFromEngineResult(fixture, result, true)
        if (!record.injuries?.length && syncedInjuries.length) {
          record.injuries = syncedInjuries.map((inj) => ({
            ...inj,
            teamId: home?.players?.some((p) => p.id === inj.playerId)
              ? fixture.homeTeamId
              : fixture.awayTeamId,
          }))
        }
        applyMatchResultToLeague(copy, record)
        const analysis = messageFromMatchAnalysis(prev, { fixture, record })
        const playerInjuries = (record.injuries ?? []).filter((inj) => {
          if (inj.teamId) return inj.teamId === prev.playerTeamId
          const team = worldTeamById(prev.world, prev.playerTeamId)
          return (team?.players ?? []).some((p) => p.id === inj.playerId)
        })
        const injuryMsgs = messagesFromInjuries(playerInjuries, prev, {
          date: fixture.date ?? copy.currentDate,
          source: 'match',
        })
        const inboxMsgs = [analysis, ...injuryMsgs].filter(Boolean)
        const saved = persistCareer(prev, {
          league: copy,
          inbox: inboxMsgs.length ? mergeInbox(prev, inboxMsgs) : prev.inbox,
        })
        refreshSlots()
        return saved
      })
      setLeagueFixture((f) =>
        f && f.id === fixture.id
          ? {
              ...f,
              status: 'completed',
              homeScore: result.homeScore,
              awayScore: result.awayScore,
            }
          : f,
      )
    },
    [career, refreshSlots],
  )

  const handlePlayFixture = useCallback((fixture) => {
    if (!fixture || fixture.status === 'completed') return
    // Przyszły termin → zakładka meczu pokaże PreMatchView; dziś/zaległy → MatchView.
    setLeagueFixture(fixture)
    setActiveTab('match')
  }, [])

  const handleReturnToLeague = useCallback(() => {
    setLeagueFixture(null)
    setActiveTab('hub')
  }, [])

  const handleNewSlot = useCallback((slotIndex) => {
    setPendingSlot(slotIndex)
    setScreen('new')
  }, [])

  const handleLoadSlot = useCallback((slotIndex) => {
    const loaded = getSlot(slotIndex)
    if (!loaded) return
    const ensured = ensureCareerHomeTactics(loaded)
    setCareer(ensured)
    setLeagueFixture(null)
    setMatchStamina(null)
    setTeamProfileId(null)
    setActiveTab('hub')
    setScreen('play')
  }, [])

  const handleDeleteSlot = useCallback(
    (slotIndex) => {
      const existing = getSlot(slotIndex)
      if (!existing) return
      const t = careerFlowStrings(uiLang)
      const ok = window.confirm(t.deleteConfirm(existing.managerName))
      if (!ok) return
      clearSlot(slotIndex)
      if (career?.slotIndex === slotIndex) {
        setCareer(null)
        setScreen('slots')
      }
      refreshSlots()
    },
    [career, refreshSlots, uiLang],
  )

  const handleCreateCareer = useCallback(
    ({ slotIndex, managerName, playerTeamId: teamId, seasonYear, rosterMode, selectedTeamIds }) => {
      const created = createCareer(slotIndex, {
        managerName,
        playerTeamId: teamId,
        seasonYear,
        rosterMode,
        selectedTeamIds,
      })
      setCareer(created)
      setPendingSlot(null)
      setLeagueFixture(null)
      setMatchStamina(null)
      setTeamProfileId(null)
      setActiveTab('hub')
      setScreen('play')
      refreshSlots()
    },
    [refreshSlots],
  )

  const handleStartNextSeason = useCallback(() => {
    if (!career) return
    const next = startNextSeason(career)
    setCareer(next)
    setLeagueFixture(null)
    setMatchStamina(null)
    setTeamProfileId(null)
    setActiveTab('hub')
    refreshSlots()
  }, [career, refreshSlots])

  const handleExitToSlots = useCallback(() => {
    if (career) {
      persistCareer(career)
      refreshSlots()
    }
    setCareer(null)
    setLeagueFixture(null)
    setScreen('slots')
  }, [career, refreshSlots])

  if (screen === 'slots') {
    return (
      <div className="min-h-screen bg-ufa-bg">
        <CareerSelectScreen
          slots={slots}
          lang={uiLang}
          onLangChange={setUiLang}
          onNew={handleNewSlot}
          onLoad={handleLoadSlot}
          onDelete={handleDeleteSlot}
        />
      </div>
    )
  }

  if (screen === 'new' && pendingSlot != null) {
    return (
      <div className="min-h-screen bg-ufa-bg">
        <NewCareerScreen
          slotIndex={pendingSlot}
          lang={uiLang}
          onCancel={() => {
            setPendingSlot(null)
            setScreen('slots')
          }}
          onCreate={handleCreateCareer}
        />
      </div>
    )
  }

  if (!career || !league || !userTeam) {
    return (
      <div className="min-h-screen bg-ufa-bg flex items-center justify-center text-ufa-muted">
        {tShell.loadingCareer}
      </div>
    )
  }

  const inboxUnread = unreadInboxCount(career)
  const ultiworldUnread = unreadUltiworldCount(career)
  const activeCategoryId = VIEW_TO_CATEGORY[activeTab] ?? 'home'
  const activeCategory =
    NAV_CATEGORIES.find((c) => c.id === activeCategoryId) ?? NAV_CATEGORIES[0]
  const categoryBadge = (cat) => {
    if (cat.id === 'home') return inboxUnread
    if (cat.id === 'ultiworld') return ultiworldUnread
    return 0
  }

  return (
    <div className="flex min-h-screen flex-col bg-ufa-bg">
      <header className="sticky top-0 z-10 border-b border-ufa-border bg-ufa-panel/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-ufa-accent to-ufa-accent-dim text-lg font-black text-ufa-bg shadow-lg shadow-ufa-accent/20">
                U
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-ufa-text">
                  Ultimate Manager
                </h1>
                <p className="text-xs text-ufa-muted">
                  {career.managerName} · {displaySeasonLabel(league.seasonLabel, uiLang)} ·{' '}
                  {league.currentDate} · {userTeam.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <LangSwitch lang={uiLang} onChange={setUiLang} />
              <button
                type="button"
                onClick={handleExitToSlots}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-xs font-medium text-ufa-text hover:border-ufa-accent/50 hover:bg-ufa-panel-hover sm:text-sm"
              >
                {tShell.saveAndExit}
              </button>
            </div>
          </div>

          {activeTab !== 'match' && (
            <nav className="flex flex-col gap-2" aria-label={tShell.navAria}>
              <div className="flex flex-wrap gap-1 rounded-lg bg-ufa-bg p-1 ring-1 ring-ufa-border">
                {NAV_CATEGORIES.map((cat) => {
                  const active = cat.id === activeCategoryId
                  const badge = categoryBadge(cat)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => navigateTo(cat.items[0].id)}
                      className={`relative rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        active
                          ? 'bg-ufa-accent text-ufa-bg shadow-md'
                          : 'text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
                      }`}
                    >
                      {pickLabel(cat, uiLang)}
                      {badge > 0 ? (
                        <span
                          className={`ml-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            active
                              ? 'bg-ufa-bg/25 text-ufa-bg'
                              : 'bg-ufa-accent text-ufa-bg'
                          }`}
                        >
                          {badge > 9 ? '9+' : badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap gap-1 rounded-lg bg-ufa-bg/60 p-1 ring-1 ring-ufa-border/70">
                {activeCategory.items.map((item) => {
                  const active = activeTab === item.id
                  const badgeCount =
                    item.id === 'inbox'
                      ? inboxUnread
                      : item.id === 'ultiworld'
                        ? ultiworldUnread
                        : 0
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className={`relative rounded-md px-2.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                        active
                          ? 'bg-ufa-panel text-ufa-text ring-1 ring-ufa-accent/50 shadow-sm'
                          : 'text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
                      }`}
                    >
                      {pickLabel(item, uiLang)}
                      {badgeCount > 0 ? (
                        <span
                          className={`ml-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            active
                              ? 'bg-ufa-accent text-ufa-bg'
                              : 'bg-ufa-accent/80 text-ufa-bg'
                          }`}
                        >
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 league-fade-in">
        {activeTab === 'hub' && (
          <LeagueHub
            league={league}
            onPlayFixture={handlePlayFixture}
            onNavigate={navigateTo}
            onTeamSelect={openTeamProfile}
            career={career}
            onStartNextSeason={handleStartNextSeason}
            onAdvanceDay={handleAdvanceDay}
            onSimulateUntilMatch={handleSimulateUntilMatch}
            simulating={!!simProgress}
          />
        )}

        {activeTab === 'inbox' && (
          <InboxView
            career={career}
            onInboxChange={handleInboxChange}
            onNavigate={navigateTo}
            onTransferOfferAction={handleTransferOfferAction}
            onResolveDecision={handleResolveDecision}
            onSponsorSign={handleSponsorSign}
          />
        )}

        {activeTab === 'ultiworld' && (
          <UltiworldView career={career} onUltiworldChange={handleUltiworldChange} />
        )}

        {activeTab === 'standings' && (
          <LeagueStandingsView league={league} onTeamSelect={openTeamProfile} />
        )}

        {activeTab === 'cup' && (
          <CupView league={league} onPlayFixture={handlePlayFixture} />
        )}

        {activeTab === 'team-profile' && seasonState && (
          <TeamProfileView
            teamId={teamProfileId ?? playerTeamId}
            seasonState={seasonState}
            onBack={handleTeamProfileBack}
          />
        )}

        {(activeTab === 'team-schedule' || activeTab === 'league-schedule') && (
          <LeagueScheduleView
            league={league}
            onPlayFixture={handlePlayFixture}
            scope={activeTab === 'team-schedule' ? 'team' : 'league'}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            league={league}
            onPlayFixture={handlePlayFixture}
            onSimulateUntilDate={handleSimulateUntilDate}
          />
        )}

        {activeTab === 'leaders' && <LeagueLeadersView league={league} />}

        {activeTab === 'career' && (
          <CareerHistoryView career={career} onStartNextSeason={handleStartNextSeason} />
        )}

        {activeTab === 'roster' && (
          <RosterView
            matchStamina={matchStamina}
            focusTeamName={userTeam.name}
            leaguePlayerStats={league.playerStats}
            teams={worldTeams}
            clubOnly
          />
        )}

        {(activeTab === 'club-transfers' || activeTab === 'league-transfers') && (
          <TransfersView
            career={career}
            onCareerUpdate={handleTransfersUpdate}
            scope={activeTab === 'club-transfers' ? 'club' : 'league'}
          />
        )}

        {activeTab === 'training' && (
          <TrainingView
            team={userTeam}
            league={league}
            leaguePlayerStats={league.playerStats}
            onChange={handleTrainingChange}
            disabled={career.phase === 'season_complete'}
          />
        )}

        {activeTab === 'club-board' && (
          <ClubBoardView career={career} onChange={handleClubBoardChange} />
        )}

        {activeTab === 'match' &&
          (leagueFixture ? (
            isFixtureMatchDay(leagueFixture, league) ? (
              <MatchView
                homeTactics={homeTactics}
                onHomeTacticsChange={handleHomeTacticsChange}
                onMatchStaminaChange={setMatchStamina}
                leagueFixture={leagueFixture}
                playerTeamId={playerTeamId}
                homeTeam={matchTeams.home}
                awayTeam={matchTeams.away}
                onLeagueMatchComplete={handleLeagueMatchComplete}
                onReturnToLeague={handleReturnToLeague}
                leaguePlayerStats={league.playerStats}
              />
            ) : (
              <PreMatchView
                fixture={leagueFixture}
                league={league}
                onNavigate={navigateTo}
                onOpenTeam={openTeamProfile}
                onSimulateUntilMatch={handleSimulateUntilMatch}
                simulating={!!simProgress}
              />
            )
          ) : (
            <div className="rounded-xl border border-ufa-border bg-ufa-panel p-8 text-center shadow-xl shadow-black/30">
              <h2 className="text-lg font-semibold text-ufa-text">{tShell.noActiveMatchTitle}</h2>
              <p className="mt-2 text-sm text-ufa-muted max-w-md mx-auto">
                {tShell.noActiveMatchBody}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateTo('hub')}
                  className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg"
                >
                  {tShell.goHome}
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('team-schedule')}
                  className="rounded-md border border-ufa-border px-5 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
                >
                  {tShell.teamSchedule}
                </button>
              </div>
            </div>
          ))}

        {activeTab === 'tactics' && (
          <Tactics
            roster={userTeam.players}
            teamName={userTeam.name}
            tactics={homeTactics}
            onTacticsChange={handleHomeTacticsChange}
            staminaMap={matchStamina?.home ?? matchStamina?.away}
            leaguePlayerStats={league.playerStats}
            teamColor={userTeam.primaryColor}
          />
        )}

        {activeTab === 'playbook' && <TacticsGuide />}
      </main>

      <footer className="border-t border-ufa-border py-3 text-center text-xs text-ufa-muted">
        {tShell.footer(career.slotIndex + 1)}
      </footer>

      <SimulationProgressOverlay progress={simProgress} />
    </div>
  )
}

function CareerHistoryView({ career, onStartNextSeason }) {
  const { lang } = useUiLang()
  const t = shellStrings(lang)
  const team = worldTeamById(career.world, career.playerTeamId)
  const history = career.seasonHistory ?? []
  const allTimePlayers = Object.values(career.allTimeStats?.players ?? career.careerStats ?? {})
    .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
    .slice(0, 8)

  const rosterSize = team?.players?.length ?? 0
  const next =
    lang === 'en'
      ? `League ${career.seasonYear + 1}/${String(career.seasonYear + 2).slice(-2)}`
      : `Liga ${career.seasonYear + 1}/${String(career.seasonYear + 2).slice(-2)}`

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <h2 className="text-lg font-semibold text-ufa-text">{t.careerTitle}</h2>
        <p className="mt-2 text-sm text-ufa-muted">
          {t.careerMeta(
            career.managerName,
            team?.name,
            career.seasonIndex,
            displaySeasonLabel(career.league?.seasonLabel, lang),
          )}
        </p>
        <p className="mt-1 text-sm text-ufa-muted">
          {t.seasonsDone(history.length)}
          {career.phase === 'season_complete' ? t.waitingNext : ''}
          {t.rosterAllTime(rosterSize)}
        </p>

        {career.phase === 'season_complete' && (
          <button
            type="button"
            onClick={onStartNextSeason}
            className="mt-4 rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.startNext(next)}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text text-sm mb-3">{t.seasonHistory}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noSeasonsYet}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((season) => (
                <li
                  key={`${season.seasonYear}-${season.seasonIndex}`}
                  className="flex justify-between gap-3 border-b border-ufa-border/60 pb-2 last:border-0"
                >
                  <span className="text-ufa-text">
                    {displaySeasonLabel(season.seasonLabel, lang)}
                    {season.cupWinner ? (
                      <span className="ml-2 text-xs text-ufa-gold">{t.cupWon}</span>
                    ) : null}
                  </span>
                  <span className="text-ufa-muted">
                    {season.finalPlace}. · {season.wins}-{season.losses}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text text-sm mb-3">{t.allTimeLeaders}</h3>
          {allTimePlayers.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noAllTime}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {allTimePlayers.map((row) => (
                <li
                  key={row.playerId}
                  className="flex justify-between gap-3 border-b border-ufa-border/60 pb-2 last:border-0"
                >
                  <span className="text-ufa-text">
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="text-ufa-muted">
                    {row.goals} G · {row.assists} A · {row.blocks} B
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
