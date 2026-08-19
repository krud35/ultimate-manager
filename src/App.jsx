import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  pickPostMatchEventMessage,
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
  processMonthlyTvPayouts,
  processMonthlyTvPayoutsForRange,
  messagesFromTvPayouts,
  setMoneyCurrency,
  signSponsorOfferFromInbox,
  supersedeSponsorOfferMessages,
  processDelayedTransferReplies,
  processDelayedTransferRepliesForDateRange,
  processWeeklyFinancialHealth,
  messagesFromFinancialHealth,
  firstImportantInboxMessage,
  isImportantInboxMessage,
  queueIncomingBidCounter,
  queueOutgoingPlayerContract,
  acceptOutgoingClubCounter,
  acceptPlayerContractCounter,
  spawnPendingRegistrationNotices,
  markPreAgreedNotified,
  confirmPendingRegistration,
  declinePendingRegistration,
  formatUsd,
  renewPlayerContract,
  isClubBankrupt,
  messagesFromScoutMissions,
  resolveScoutMissions,
  decayScoutingKnowledge,
  recordMatchKnowledgeGain,
  recordMatchKnowledgeGainForNewMatches,
  advanceAcademyCampaigns,
  messagesFromAcademyCampaignReports,
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
  tryForfeitMatchRecord,
} from './league'
import { resolvePlayerDefaultTactics } from './matchEngine'

import MatchView from './components/MatchView'
import Tactics from './components/Tactics'
import TacticsGuide from './components/TacticsGuide'
import RosterView from './components/RosterView'
import LeagueHub from './components/LeagueHub'
import LeagueStandingsView from './components/LeagueStandingsView'
import PyramidStandingsView from './components/PyramidStandingsView'
import LeagueScheduleView from './components/LeagueScheduleView'
import LeagueLeadersView from './components/LeagueLeadersView'
import CupView from './components/CupView'
import TeamProfileView from './ui/TeamProfileView.jsx'
import CareerSelectScreen from './components/CareerSelectScreen'
import NewCareerScreen from './components/NewCareerScreen'
import TrainingView from './components/TrainingView'
import ClubBoardView from './components/ClubBoardView'
import TransfersView from './components/TransfersView'
import ScoutingCenterView from './components/ScoutingCenterView'
import AcademyView from './components/AcademyView'
import CalendarView from './components/CalendarView'
import InboxView from './components/InboxView'
import UltiworldView from './components/UltiworldView'
import PreMatchView, { isFixtureMatchDay } from './components/PreMatchView'
import SimulationProgressOverlay from './components/SimulationProgressOverlay'
import CalendarSimOverlay from './components/CalendarSimOverlay'
import WelcomeModal from './components/WelcomeModal'
import TutorialGuide from './components/TutorialGuide'
import { buildSeasonStateFromLeague } from './seasonEngine/seasonStateFromLeague.js'
import { displaySeasonLabel, pickLabel, pickCopy, UI_LANG } from './ui/locale'
import { useUiLang } from './ui/UiLangContext'
import { LangSwitch } from './ui/LangSwitch'
import { careerFlowStrings } from './ui/strings/careerFlow'
import { shellStrings } from './ui/strings/shell'
import { hubStrings } from './ui/strings/hub'
import { commonStrings } from './ui/strings/common'

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
      { id: 'scouting-center', labelPl: 'Centrum skautingu', labelEn: 'Scouting center' },
      { id: 'club-board', labelPl: 'Zarząd', labelEn: 'Club board' },
      { id: 'academy', labelPl: 'Akademia', labelEn: 'Academy' },
      { id: 'team-profile', labelPl: 'Profil drużyny', labelEn: 'Team profile' },
    ],
  },
  {
    id: 'season',
    labelPl: 'Sezon',
    labelEn: 'Season',
    items: [
      { id: 'standings', labelPl: 'Tabela ligowa', labelEn: 'Standings' },
      { id: 'pyramid', labelPl: 'Piramida', labelEn: 'Pyramid' },
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

function IconHome({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}
function IconShirt({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 4 4 7l2.2 3L8 8.7V20h8V8.7L17.8 10l2.2-3-4-3-1 1.6H9L8 4Z" />
    </svg>
  )
}
function IconTrophy({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 4" />
      <path d="M17 5h3a3 3 0 0 1-3 4" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M10 16h4l.6 3H9.4L10 16Z" />
    </svg>
  )
}
function IconNews({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="14" height="14" rx="1" />
      <path d="M17 8h4v9a2 2 0 0 1-2 2H7" />
      <path d="M6.5 9h7M6.5 12h7M6.5 15h4" />
    </svg>
  )
}
function IconDots({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="6" cy="6" r="1.7" />
      <circle cx="12" cy="6" r="1.7" />
      <circle cx="18" cy="6" r="1.7" />
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  )
}
function IconNextDay({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 5l6 7-6 7" />
      <path d="M13 5l6 7-6 7" />
    </svg>
  )
}
function IconAlert({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.55 2.7h15.5A1.8 1.8 0 0 0 21.3 17L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
      <path d="M12 16.2h.01" />
    </svg>
  )
}

const NAV_ICONS = {
  home: IconHome,
  club: IconShirt,
  season: IconTrophy,
  ultiworld: IconNews,
  other: IconDots,
}

/** Ringed-disc brand mark — replaces the generic gradient monogram badge. */
function UfaMark({ className }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      <circle cx="15" cy="15" r="12" fill="none" style={{ stroke: 'var(--color-ufa-border)' }} strokeWidth="2.2" />
      <circle
        cx="15"
        cy="15"
        r="12"
        fill="none"
        style={{ stroke: 'var(--color-ufa-accent)' }}
        strokeWidth="2.2"
        strokeDasharray="42 75.4"
        strokeLinecap="round"
        transform="rotate(-90 15 15)"
      />
      <circle
        cx="15"
        cy="15"
        r="12"
        fill="none"
        style={{ stroke: 'var(--color-ufa-gold)' }}
        strokeWidth="2.2"
        strokeDasharray="14 75.4"
        strokeDashoffset="-42"
        strokeLinecap="round"
        transform="rotate(-90 15 15)"
      />
    </svg>
  )
}

/** One segment of the header's scoreboard-style meta strip (desktop). */
function ScoreCell({ label, value }) {
  return (
    <div className="border-r border-ufa-border px-3 py-1.5 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ufa-muted">{label}</p>
      <p className="mt-0.5 truncate max-w-[10rem] font-semibold text-ufa-text">{value}</p>
    </div>
  )
}

/** ⌘K / Ctrl+K quick-jump across every nav destination — desktop power-user shortcut. */
function CommandPalette({ open, items, onNavigate, onClose, placeholder, emptyLabel }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setActiveIndex(0)
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.searchLabel.includes(q))
  }, [items, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[activeIndex]
      if (pick) onNavigate(pick.id)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-[15vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-md border border-ufa-border bg-ufa-panel shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ufa-border px-3.5 py-3">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-ufa-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-ufa-text placeholder:text-ufa-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-ufa-border px-1.5 py-0.5 font-mono text-[10px] text-ufa-muted sm:block">
            Esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-ufa-muted">{emptyLabel}</p>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                  idx === activeIndex ? 'bg-ufa-accent/15 text-ufa-accent' : 'text-ufa-text'
                }`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-ufa-muted">{item.categoryLabel}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Oblicza efekty jednego dnia kalendarza (treningi, transfery, sponsorzy, zdarzenia
 * losowe, kontuzje, Ultiworld) bez zapisu — pozwala na łańcuchowanie wielu dni w pętli
 * (ciągła symulacja) zanim stan zostanie raz zapisany przez persistCareer.
 */
/** Zamienia surowy błąd zapisu (np. localStorage quota) na czytelny komunikat. */
function friendlySaveErrorMessage(err, lang) {
  if (err?.name === 'StorageQuotaError') {
    return lang === UI_LANG.EN ? err.messageEn : err.messagePl
  }
  return err?.message || String(err)
}

function computeCalendarDayStep(career, nextLeague, { weekTick = false, trainingDate = null } = {}) {
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
    if (career.world) {
      processWeeklyWages(career.world)
      decayScoutingKnowledge(career.world, career.playerTeamId)
      const academyReports = advanceAcademyCampaigns(worldTeamById(career.world, career.playerTeamId))
      inboxMessages.push(
        ...messagesFromAcademyCampaignReports(academyReports, { ...career, league: nextLeague }),
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
    }
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

  const inbox = mergeInbox({ ...career, inbox: inboxBase }, inboxMessages)

  return {
    league: leagueOut,
    world,
    transferLog,
    aiTransfersLastDate,
    inbox,
    inboxMessages,
    ultiworld: uw.ultiworld,
  }
}

export default function App() {
  const { lang: uiLang, setLang: setUiLang } = useUiLang()
  const tShell = shellStrings(uiLang)
  const [screen, setScreen] = useState('slots') // slots | new | play
  const [slots, setSlots] = useState(() => listSlots())
  const [pendingSlot, setPendingSlot] = useState(null)
  const [career, setCareer] = useState(null)
  // Liga Europejska (EUCS) rozlicza się w EUR, UFA w USD — moduł-singleton
  // (`career/transfers/moneyFormat.js`) więc synchronizacja musi wyprzedzić render
  // formatUsd() poniżej; stąd wywołanie wprost w ciele komponentu, nie w useEffect.
  setMoneyCurrency(career?.competition === 'eucs' ? 'EUR' : 'USD')
  const [creatingCareer, setCreatingCareer] = useState(false)
  const [careerCreateError, setCareerCreateError] = useState('')
  const [appError, setAppError] = useState('')

  const [activeTab, setActiveTab] = useState('hub')
  const [leagueFixture, setLeagueFixture] = useState(null)
  const [matchStamina, setMatchStamina] = useState(null)
  const [teamProfileId, setTeamProfileId] = useState(null)
  const [simProgress, setSimProgress] = useState(null)
  const [calendarSim, setCalendarSim] = useState(null)
  const [actionRequiredMessageId, setActionRequiredMessageId] = useState(null)
  const [inboxFocusId, setInboxFocusId] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pendingWelcome, setPendingWelcome] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (screen !== 'play') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen])

  const paletteItems = useMemo(
    () =>
      NAV_CATEGORIES.flatMap((cat) =>
        cat.items.map((item) => {
          const label = pickLabel(item, uiLang)
          const categoryLabel = pickLabel(cat, uiLang)
          return {
            id: item.id,
            label,
            categoryLabel,
            searchLabel: `${label} ${categoryLabel}`.toLowerCase(),
          }
        }),
      ),
    [uiLang],
  )

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

  // "Dalej" — symuluje kolejne dni jeden po drugim (jak w typowych grach managerskich),
  // aż napotka coś wymagającego uwagi gracza: mecz, kontuzję, ofertę transferową/
  // sponsorską, decyzję ze zdarzenia losowego albo alarm finansowy. Raporty treningowe
  // i artykuły Ultiworld nie przerywają symulacji — lecą w tle.
  const handleAdvanceDay = useCallback(async () => {
    if (!career?.league || simProgress || calendarSim) return
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

    let workingCareer = career
    let dayLeague = cloneLeague(career.league)
    let blockedFixture = null
    let blockingMessageId = null
    let daysAdvanced = 0
    const maxDays = 400

    try {
      try {
        while (daysAdvanced < maxDays) {
          const dayBefore = dayLeague.currentDate
          const result = advanceCalendarDay(dayLeague)
          const step = computeCalendarDayStep(workingCareer, dayLeague, {
            weekTick: !!result.weekTick,
            trainingDate: dayBefore,
          })
          workingCareer = {
            ...workingCareer,
            league: step.league,
            world: step.world,
            transferLog: step.transferLog,
            aiTransfersLastDate: step.aiTransfersLastDate,
            inbox: step.inbox,
            ultiworld: step.ultiworld,
          }
          dayLeague = step.league
          daysAdvanced += 1

          setCalendarSim({
            currentDate: dayLeague.currentDate,
            daysAdvanced,
            recentMessages: step.inbox.slice(0, 3),
            latestUltiworld: step.ultiworld?.articles?.[0] ?? null,
          })

          if (result.blocked && result.playerFixture) {
            blockedFixture = result.playerFixture
            break
          }
          const blocker = firstImportantInboxMessage(step.inboxMessages)
          if (blocker) {
            blockingMessageId = blocker.id
            break
          }
          if (isOfficialSeasonEnded(dayLeague) || dayLeague.status === 'complete') {
            break
          }

          // Krótka pauza na dzień, żeby przesuwanie kalendarza było widoczne — im
          // dłużej leci symulacja, tym szybciej przyspiesza, żeby nie męczyć gracza.
          const delay = daysAdvanced <= 20 ? 140 : daysAdvanced <= 60 ? 40 : 0
          await new Promise((r) => setTimeout(r, delay))
        }
      } finally {
        setCalendarSim(null)
      }

      const next = persistCareer(career, {
        league: workingCareer.league,
        world: workingCareer.world,
        transferLog: workingCareer.transferLog,
        aiTransfersLastDate: workingCareer.aiTransfersLastDate,
        inbox: workingCareer.inbox,
        ultiworld: workingCareer.ultiworld,
      })
      syncCareer(next)

      if (blockedFixture) {
        setActionRequiredMessageId(null)
        setLeagueFixture(blockedFixture)
        setActiveTab('match')
      } else {
        setActionRequiredMessageId(blockingMessageId)
      }
    } catch (err) {
      console.error('[calendar sim]', err)
      setAppError(friendlySaveErrorMessage(err, uiLang))
    }
  }, [career, simProgress, calendarSim, syncCareer, uiLang])

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
      const academyReports = []
      for (let i = 0; i < weekTicks; i += 1) {
        weeklyTeamTrainingMaintenance(nextLeague, {
          playerTeamId: career.playerTeamId,
        })
        if (career.world) {
          decayScoutingKnowledge(career.world, career.playerTeamId)
          academyReports.push(
            ...advanceAcademyCampaigns(worldTeamById(career.world, career.playerTeamId)),
          )
        }
      }
      if (weekTicks > 0 && career.world) {
        processWeeklyWagesTimes(career.world, weekTicks)
        processWeeklyFinancialHealth(career.world, { seasonYear: career.seasonYear })
      }
      return { reports, academyReports }
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

      const { reports, academyReports } = await applyFastForwardSideEffects(
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
      const monthlyTvPayouts = world
        ? processMonthlyTvPayoutsForRange(world, rangeStart, nextLeague.currentDate)
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

      recordMatchKnowledgeGainForNewMatches(
        world,
        career.playerTeamId,
        prevMatchHistory,
        nextLeague.matchHistory,
      )

      const inboxMessages = [
        ...messagesFromTrainingReports(reports, career),
        ...messagesFromTrainingInjuries(reports, career),
        ...messagesFromAcademyCampaignReports(academyReports, { ...career, league: nextLeague }),
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
        ...messagesFromTvPayouts(monthlyTvPayouts, { ...career, league: nextLeague, world }, {
          date: nextLeague.currentDate,
        }),
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
      // Stay on hub — user opens the match via "Go to match" when ready.
      if (isOfficialSeasonEnded(nextLeague) || nextLeague.status === 'complete') {
        setActiveTab('hub')
      }
    } catch (err) {
      console.error('[calendar sim]', err)
      setAppError(friendlySaveErrorMessage(err, uiLang))
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

        const { reports, academyReports } = await applyFastForwardSideEffects(
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
        const monthlyTvPayouts = world
          ? processMonthlyTvPayoutsForRange(world, rangeStart, nextLeague.currentDate)
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

        recordMatchKnowledgeGainForNewMatches(
          world,
          career.playerTeamId,
          prevMatchHistory,
          nextLeague.matchHistory,
        )

        const inboxMessages = [
          ...messagesFromTrainingReports(reports, career),
          ...messagesFromTrainingInjuries(reports, career),
          ...messagesFromAcademyCampaignReports(academyReports, { ...career, league: nextLeague }),
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
          ...messagesFromTvPayouts(monthlyTvPayouts, { ...career, league: nextLeague, world }, {
            date: nextLeague.currentDate,
          }),
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
      } catch (err) {
        console.error('[calendar sim]', err)
        setAppError(friendlySaveErrorMessage(err, uiLang))
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

  // Wiadomość, która zatrzymała ciągłą symulację ("Dalej" → "Wymaga decyzji") —
  // otwiera skrzynkę i od razu zaznacza tę konkretną wiadomość.
  const openInboxMessage = useCallback((messageId) => {
    if (!messageId) return
    setTeamProfileId(null)
    setInboxFocusId(messageId)
    setActiveTab('inbox')
  }, [])

  const handleActionRequired = useCallback(() => {
    openInboxMessage(actionRequiredMessageId)
  }, [openInboxMessage, actionRequiredMessageId])

  // Samoczynnie odblokuj przycisk, gdy blokująca wiadomość zniknie albo przestanie
  // wymagać decyzji (np. gracz odpowiedział na ofertę transferową w skrzynce).
  useEffect(() => {
    if (!actionRequiredMessageId || !career?.inbox) return
    const msg = career.inbox.find((m) => m.id === actionRequiredMessageId)
    if (!msg || !isImportantInboxMessage(msg)) {
      setActionRequiredMessageId(null)
    }
  }, [career?.inbox, actionRequiredMessageId])

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
        const scoutOpponentId =
          fixture.homeTeamId === prev.playerTeamId ? fixture.awayTeamId : fixture.homeTeamId
        recordMatchKnowledgeGain(prev.world, prev.playerTeamId, scoutOpponentId)
        const analysis = messageFromMatchAnalysis(prev, { fixture, record })
        const postMatchEvent = pickPostMatchEventMessage(prev, { fixture, record })
        const playerInjuries = (record.injuries ?? []).filter((inj) => {
          if (inj.teamId) return inj.teamId === prev.playerTeamId
          const team = worldTeamById(prev.world, prev.playerTeamId)
          return (team?.players ?? []).some((p) => p.id === inj.playerId)
        })
        const injuryMsgs = messagesFromInjuries(playerInjuries, prev, {
          date: fixture.date ?? copy.currentDate,
          source: 'match',
        })
        const inboxMsgs = [analysis, postMatchEvent, ...injuryMsgs].filter(Boolean)
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
    if (!fixture || fixture.status === 'completed' || !career?.league) return

    const playerTeamObj = career.world
      ? worldTeamById(career.world, career.playerTeamId)
      : null
    if (playerTeamObj && isClubBankrupt(playerTeamObj)) {
      const forfeit = tryForfeitMatchRecord(career.league, fixture)
      if (forfeit) {
        const nextLeague = cloneLeague(career.league)
        applyMatchResultToLeague(nextLeague, forfeit)
        const next = persistCareer(career, { league: nextLeague })
        syncCareer(next)
        setLeagueFixture(null)
        setActiveTab('hub')
        return
      }
    }

    setLeagueFixture(fixture)
    setActiveTab('match')
  }, [career, syncCareer])

  const handleExtendContract = useCallback(
    (opts) => {
      if (!career) return { ok: false, error: 'Brak kariery' }
      const result = renewPlayerContract(career, opts)
      if (result.completed) {
        const next = persistCareer(career, { world: result.world ?? career.world })
        syncCareer(next)
      }
      return result
    },
    [career, syncCareer],
  )

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
    async ({
      slotIndex,
      managerName,
      playerTeamId: teamId,
      seasonYear,
      rosterMode,
      selectedTeamIds,
      competition,
    }) => {
      if (creatingCareer) return
      setCreatingCareer(true)
      setCareerCreateError('')
      // Yield one tick so the "creating career…" overlay actually paints before
      // the heavy synchronous league/world build (roster gen, finances, AI coach
      // profiles…) blocks the main thread for a few hundred ms.
      await new Promise((r) => setTimeout(r, 0))
      try {
        const created = createCareer(slotIndex, {
          managerName,
          playerTeamId: teamId,
          seasonYear,
          rosterMode,
          selectedTeamIds,
          competition,
        })
        setCareer(created)
        setPendingSlot(null)
        setLeagueFixture(null)
        setMatchStamina(null)
        setTeamProfileId(null)
        setActiveTab('hub')
        setScreen('play')
        setPendingWelcome(true)
        refreshSlots()
      } catch (err) {
        console.error('[create career]', err)
        setCareerCreateError(friendlySaveErrorMessage(err, uiLang))
      } finally {
        setCreatingCareer(false)
      }
    },
    [refreshSlots, creatingCareer, uiLang],
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
            if (creatingCareer) return
            setPendingSlot(null)
            setScreen('slots')
          }}
          onCreate={handleCreateCareer}
          submitting={creatingCareer}
          externalError={careerCreateError}
        />
        <SimulationProgressOverlay
          progress={
            creatingCareer
              ? { label: careerFlowStrings(uiLang).startingCareer, indeterminate: true }
              : null
          }
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
    <div className="flex min-h-screen flex-col bg-ufa-bg md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ufa-border bg-ufa-panel/60 md:flex">
        <div className="flex items-center gap-2.5 border-b border-ufa-border px-4 py-4">
          <UfaMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-ufa-text">{tShell.appName}</p>
            <p className="truncate text-[10px] text-ufa-muted">{career.managerName}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-sm border border-ufa-border px-2.5 py-1.5 text-left text-xs text-ufa-muted hover:border-ufa-accent/50 hover:text-ufa-text"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <span className="flex-1">{tShell.paletteTrigger}</span>
          <kbd className="rounded border border-ufa-border px-1 font-mono text-[10px]">Ctrl K</kbd>
        </button>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label={tShell.navAria}>
          {NAV_CATEGORIES.map((cat) => {
            const Icon = NAV_ICONS[cat.id]
            const catBadge = categoryBadge(cat)
            return (
              <div key={cat.id} className="mb-4 last:mb-0">
                <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ufa-muted">
                  <Icon className="h-3.5 w-3.5" />
                  {pickLabel(cat, uiLang)}
                  {catBadge > 0 ? (
                    <span className="ml-auto inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-ufa-accent px-1 text-[10px] font-bold text-ufa-bg">
                      {catBadge > 9 ? '9+' : catBadge}
                    </span>
                  ) : null}
                </p>
                <div className="space-y-0.5">
                  {cat.items.map((item) => {
                    const active = activeTab === item.id
                    const badgeCount =
                      item.id === 'inbox' ? inboxUnread : item.id === 'ultiworld' ? ultiworldUnread : 0
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateTo(item.id)}
                        className={`flex w-full items-center justify-between rounded-sm border-l-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                          active
                            ? 'border-ufa-accent bg-ufa-accent/15 font-semibold text-ufa-accent'
                            : 'border-transparent text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
                        }`}
                      >
                        {pickLabel(item, uiLang)}
                        {badgeCount > 0 ? (
                          <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-ufa-gold px-1 text-[10px] font-bold text-ufa-bg">
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="flex flex-col gap-2 border-t border-ufa-border p-3">
          <LangSwitch lang={uiLang} onChange={setUiLang} />
          <button
            type="button"
            onClick={handleExitToSlots}
            className="rounded-sm border border-ufa-border px-3 py-1.5 text-xs font-medium text-ufa-text hover:border-ufa-accent/50 hover:bg-ufa-panel-hover"
          >
            {tShell.saveAndExit}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-ufa-border bg-ufa-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur-md md:static md:border-b-0 md:bg-transparent md:pt-0 md:backdrop-blur-none">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 md:justify-start md:gap-4 md:py-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:hidden">
              <UfaMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
              <h1 className="truncate text-base font-bold tracking-tight text-ufa-text sm:text-lg">
                {tShell.appName}
              </h1>
            </div>

            <div className="hidden overflow-hidden rounded-sm border border-ufa-border font-mono text-[11px] md:flex">
              <ScoreCell label={tShell.scoreManager} value={career.managerName} />
              <ScoreCell label={tShell.scoreSeason} value={displaySeasonLabel(league.seasonLabel, uiLang)} />
              <ScoreCell label={tShell.scoreDate} value={league.currentDate} />
              <ScoreCell label={tShell.scoreTeam} value={userTeam.name} />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 md:hidden">
              <LangSwitch lang={uiLang} onChange={setUiLang} />
              <button
                type="button"
                onClick={handleExitToSlots}
                className="min-h-9 max-w-[7.5rem] truncate rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-xs font-medium text-ufa-text hover:border-ufa-accent/50 hover:bg-ufa-panel-hover"
              >
                {tShell.saveAndExit}
              </button>
            </div>
          </div>
          <p className="truncate px-3 pb-2 text-[10px] text-ufa-muted sm:px-6 md:hidden">
            {career.managerName} · {displaySeasonLabel(league.seasonLabel, uiLang)} · {league.currentDate} ·{' '}
            {userTeam.name}
          </p>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 pb-28 sm:px-6 sm:py-6 md:pb-6 league-fade-in">
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
            simulating={!!simProgress || !!calendarSim}
            actionRequired={!!actionRequiredMessageId}
            onActionRequired={handleActionRequired}
          />
        )}

        {activeTab === 'inbox' && (
          <InboxView
            career={career}
            onInboxChange={handleInboxChange}
            onNavigate={navigateTo}
            onOpenTeam={openTeamProfile}
            onTransferOfferAction={handleTransferOfferAction}
            onResolveDecision={handleResolveDecision}
            onSponsorSign={handleSponsorSign}
            initialSelectedId={inboxFocusId}
            onConsumeFocus={() => setInboxFocusId(null)}
          />
        )}

        {activeTab === 'ultiworld' && (
          <UltiworldView career={career} onUltiworldChange={handleUltiworldChange} />
        )}

        {activeTab === 'standings' && (
          <LeagueStandingsView league={league} onTeamSelect={openTeamProfile} />
        )}

        {activeTab === 'pyramid' && (
          <PyramidStandingsView career={career} onTeamSelect={openTeamProfile} />
        )}

        {activeTab === 'cup' && (
          <CupView league={league} onPlayFixture={handlePlayFixture} />
        )}

        {activeTab === 'team-profile' && seasonState && (
          <TeamProfileView
            teamId={teamProfileId ?? playerTeamId}
            seasonState={seasonState}
            onBack={handleTeamProfileBack}
            career={career}
            onChange={handleTransfersUpdate}
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

        {activeTab === 'leaders' && (
          <LeagueLeadersView league={league} career={career} onCareerUpdate={handleTransfersUpdate} />
        )}

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
            onExtendContract={handleExtendContract}
          />
        )}

        {(activeTab === 'club-transfers' || activeTab === 'league-transfers') && (
          <TransfersView
            career={career}
            onCareerUpdate={handleTransfersUpdate}
            scope={activeTab === 'club-transfers' ? 'club' : 'league'}
          />
        )}

        {activeTab === 'scouting-center' && (
          <ScoutingCenterView
            career={career}
            onCareerUpdate={handleTransfersUpdate}
            onOpenTeam={openTeamProfile}
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

        {activeTab === 'academy' && (
          <AcademyView career={career} onCareerUpdate={handleTransfersUpdate} />
        )}

        {activeTab === 'match' &&
          (leagueFixture ? (
            isFixtureMatchDay(leagueFixture, league) || leagueFixture.status === 'completed' ? (
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
                world={career.world}
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

        <footer className="hidden border-t border-ufa-border py-3 text-center text-xs text-ufa-muted md:block">
          {tShell.footer(career.slotIndex + 1)}
        </footer>
      </div>

      {activeTab !== 'match' && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ufa-border bg-ufa-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
          aria-label={tShell.navAria}
        >
          {activeCategory.items.length > 1 && (
            <div className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-ufa-border/60 px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeCategory.items.map((item) => {
                const active = activeTab === item.id
                const badgeCount =
                  item.id === 'inbox' ? inboxUnread : item.id === 'ultiworld' ? ultiworldUnread : 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                      active ? 'bg-ufa-accent text-ufa-bg' : 'bg-ufa-bg text-ufa-muted'
                    }`}
                  >
                    {pickLabel(item, uiLang)}
                    {badgeCount > 0 ? (
                      <span className="ml-1 font-bold">· {badgeCount > 9 ? '9+' : badgeCount}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-5">
            {NAV_CATEGORIES.map((cat) => {
              const Icon = NAV_ICONS[cat.id]
              const active = cat.id === activeCategoryId
              const badge = categoryBadge(cat)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => navigateTo(cat.items[0].id)}
                  className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                    active ? 'text-ufa-accent' : 'text-ufa-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {pickLabel(cat, uiLang)}
                  {badge > 0 ? (
                    <span className="absolute right-[24%] top-1 min-w-[0.9rem] rounded-full bg-ufa-gold px-1 text-center text-[9px] font-bold leading-[1.1] text-ufa-bg">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {activeTab !== 'match' && !simProgress && !calendarSim && (
        <button
          type="button"
          onClick={actionRequiredMessageId ? handleActionRequired : handleAdvanceDay}
          className={`fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-ufa-bg shadow-lg shadow-black/40 transition-transform active:scale-95 md:hidden ${
            actionRequiredMessageId ? 'bg-ufa-gold' : 'bg-ufa-accent'
          }`}
          aria-label={actionRequiredMessageId ? hubStrings(uiLang).actionRequired : tShell.advanceDay}
          title={actionRequiredMessageId ? hubStrings(uiLang).actionRequired : tShell.advanceDay}
        >
          {actionRequiredMessageId ? (
            <IconAlert className="h-6 w-6" />
          ) : (
            <IconNextDay className="h-6 w-6" />
          )}
        </button>
      )}

      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        onNavigate={(id) => {
          navigateTo(id)
          setPaletteOpen(false)
        }}
        onClose={() => setPaletteOpen(false)}
        placeholder={tShell.palettePlaceholder}
        emptyLabel={tShell.paletteEmpty}
      />

      <SimulationProgressOverlay progress={simProgress} />
      <CalendarSimOverlay sim={calendarSim} />

      {appError && (
        <div className="fixed inset-x-0 top-0 z-[90] flex justify-center px-4 pt-3">
          <div className="flex max-w-xl items-start gap-3 rounded-lg border border-red-500/40 bg-ufa-panel px-4 py-3 text-sm text-red-300 shadow-2xl shadow-black/50">
            <span className="flex-1">{appError}</span>
            <button
              type="button"
              onClick={() => setAppError('')}
              className="text-red-300/70 hover:text-red-200"
              aria-label={commonStrings(uiLang).close}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {pendingWelcome && (
        <WelcomeModal
          managerName={career.managerName}
          teamName={userTeam.name}
          lang={uiLang}
          onYes={() => {
            setPendingWelcome(false)
            setTutorialOpen(true)
          }}
          onNo={() => setPendingWelcome(false)}
        />
      )}
      <TutorialGuide open={tutorialOpen} onClose={() => setTutorialOpen(false)} lang={uiLang} />
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
