import ThemeControl from './ui/ThemeControl'
import Wordmark from './ui/Wordmark'
import MobileMenu from './ui/MobileMenu'
import { setPlayerLoanListed, setPlayerNotForSale } from './career/transfers/transferEngine.js'
import ManagerCareerPanel from './components/ManagerCareerPanel.jsx'
import { addManagerWelcome, processManagerCareer } from './career/managerCareer.js'
import { syncInjuriesFromMatchPlayers } from './models/playerInjury.js'
import {
  advanceCareerDay,
  simulateCareerUntil,
} from './career/calendarSimulation.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  playerTeam,
  teamForMatchEngine,
} from './data/ufaLeagueTeams'
import {
  listSlots,
  createCareer,
  persistCareer,
  saveCareerNow,
  ensureCareerHomeTactics,
  finalizeSeason,
  startNextSeason,
  clearSlot,
  getSlot,
  worldTeamById,
  worldTeamsList,
  teamFromLeague,
  isTransferWindowOpen,
  messagesFromInjuries,
  messageFromMatchAnalysis,
  pickPostMatchEventMessage,
  messagesFromNewTransferLogEntries,
  mergeInbox,
  INBOX_TYPES,
  unreadInboxCount,
  respondToIncomingBid,
  updateInboxMessage,
  resolveInboxDecision,
  unreadUltiworldCount,
  setMoneyCurrency,
  signSponsorOfferFromInbox,
  supersedeSponsorOfferMessages,
  isImportantInboxMessage,
  firstPausingInboxMessage,
  queueIncomingBidCounter,
  queueSalePlayerDecision,
  queueOutgoingPlayerContract,
  acceptOutgoingClubCounter,
  acceptPlayerContractCounter,
  confirmPendingRegistration,
  declinePendingRegistration,
  formatUsd,
  renewPlayerContract,
  setPlayerTransferListed,
  isClubBankrupt,
  recordMatchKnowledgeGain,
  respondToIncomingLoanRequest,
  markInboxMessageResolved,
  resolveWatchableFinalIgnore,
  beginWatchingFinal,
  completeWatchedFinal,
} from './career'

import {
  applyMatchResultToLeague,
  cloneLeague,
  leagueRecordFromEngineResult,
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
import MainMenuScreen from './components/MainMenuScreen.jsx'
import DomesticLeaguesView from './components/DomesticLeaguesView.jsx'
import InternationalCupsView from './components/InternationalCupsView.jsx'
import { prepareInternationalClubMatch } from './career/internationalClubCups.js'
import TrainingView from './components/TrainingView'
import ClubBoardView from './components/ClubBoardView'
import StaffManagementPanel from './components/StaffManagementPanel.jsx'
import ClubFinancesView from './components/ClubFinancesView.jsx'
import TransfersView from './components/TransfersView'
import ScoutingCenterView from './components/ScoutingCenterView'
import AcademyView from './components/AcademyView'
import CalendarView from './components/CalendarView'
import InboxView from './components/InboxView'
import UltiworldView from './components/UltiworldView'
import InternationalCompetitionView from './components/InternationalCompetitionView.jsx'
import PreMatchView, { isFixtureMatchDay } from './components/PreMatchView'
import SimulationProgressOverlay, { yieldToUi } from './components/SimulationProgressOverlay'
import CalendarSimOverlay from './components/CalendarSimOverlay'
import WelcomeModal from './components/WelcomeModal'
import RandomEventModal from './components/RandomEventModal.jsx'
import WatchFinalModal from './components/WatchFinalModal.jsx'
import TutorialGuide from './components/TutorialGuide'
import { buildSeasonStateFromLeague } from './seasonEngine/seasonStateFromLeague.js'
import {
  displaySeasonLabel,
  pickLabel,
  pickCopy,
  UI_LANG,
} from './ui/locale'
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
      { id: 'calendar', labelPl: 'Kalendarz', labelEn: 'Calendar' },
      { id: 'match', labelPl: 'Następny mecz', labelEn: 'Next match' },
    ],
  },
  {
    id: 'team',
    labelPl: 'Drużyna',
    labelEn: 'Team',
    items: [
      { id: 'tactics', labelPl: 'Taktyka', labelEn: 'Tactics' },
      { id: 'training', labelPl: 'Treningi', labelEn: 'Training' },
      { id: 'roster', labelPl: 'Skład', labelEn: 'Roster' },
      { id: 'scouting-center', labelPl: 'Centrum skautingu', labelEn: 'Scouting center' },
      { id: 'club-transfers', labelPl: 'Transfery', labelEn: 'Transfers' },
    ],
  },
  {
    id: 'club',
    labelPl: 'Klub',
    labelEn: 'Club',
    items: [
      { id: 'club-board', labelPl: 'Zarząd', labelEn: 'Club board' },
      { id: 'club-staff', labelPl: 'Sztab klubowy', labelEn: 'Club staff' },
      { id: 'club-finances', labelPl: 'Finanse', labelEn: 'Club finances' },
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
      { id: 'pyramid', labelPl: 'Ligi', labelEn: 'Leagues' },
      { id: 'league-schedule', labelPl: 'Terminarz', labelEn: 'Schedule' },
      { id: 'leaders', labelPl: 'Liderzy', labelEn: 'Leaders' },
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
    id: 'international',
    labelPl: 'Reprezentacje',
    labelEn: 'International',
    items: [{ id: 'international', labelPl: 'Reprezentacje', labelEn: 'International' }, { id: 'international-clubs', labelPl: 'Puchary klubowe', labelEn: 'Club cups' }],
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
  'team-schedule': 'league-schedule',
  'league-transfers': 'club-transfers',
}


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
function IconTactics({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="6" cy="17" r="2.5" />
      <path d="M6 14.5V10a4 4 0 0 1 4-4h9M15 3l4 3-4 3M15 14l5 5M20 14l-5 5" />
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
function IconClub({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 21V10.5L12 4l8 6.5V21" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 13.5h6" />
    </svg>
  )
}

function IconGlobe({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.3 4 5.3 4 8.5s-1.4 6.2-4 8.5c-2.6-2.3-4-5.3-4-8.5s1.4-6.2 4-8.5Z" />
    </svg>
  )
}

const NAV_ICONS = {
  home: IconHome,
  team: IconShirt,
  club: IconClub,
  season: IconTrophy,
  ultiworld: IconNews,
  international: IconGlobe,
  other: IconDots,
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
          <kbd className="hidden shrink-0 rounded border border-ufa-border px-1.5 py-0.5 font-mono text-[11px] text-ufa-muted sm:block">
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


export default function App() {
  const { lang: uiLang, setLang: setUiLang } = useUiLang()
  const tShell = shellStrings(uiLang)
  const [screen, setScreen] = useState('menu') // menu | slots | new | play
  const [slotSelectionMode, setSlotSelectionMode] = useState('load')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])
  const [slots, setSlots] = useState(() => listSlots())
  const [pendingSlot, setPendingSlot] = useState(null)
  const [career, setCareer] = useState(null)
  // Liga Europejska (EUCS) rozlicza się w EUR, UFA w USD — moduł-singleton
  // (`career/transfers/moneyFormat.js`) więc synchronizacja musi wyprzedzić render
  // formatUsd() poniżej; stąd wywołanie wprost w ciele komponentu, nie w useEffect.
  setMoneyCurrency(['eucs', 'domestic'].includes(career?.competition) ? 'EUR' : 'USD')
  const [creatingCareer, setCreatingCareer] = useState(false)
  const [careerCreateError, setCareerCreateError] = useState('')
  const [appError, setAppError] = useState('')

  // Zapis do localStorage idzie teraz w tle (Worker, patrz saveStore.js) — błędy
  // (np. brak miejsca) nie wracają już przez `throw` do wywołującego, tylko tędy.
  useEffect(() => {
    const onSaveError = (event) => setAppError(friendlySaveErrorMessage(event.detail, uiLang))
    window.addEventListener('career-save-error', onSaveError)
    return () => window.removeEventListener('career-save-error', onSaveError)
  }, [uiLang])

  const [activeTab, setActiveTab] = useState('hub')
  const [leagueFixture, setLeagueFixture] = useState(null)
  const [matchStamina, setMatchStamina] = useState(null)
  /** Blokada nawigacji: mecz przeszedł etap "prep" (MatchView zgłasza to przez onMatchLockChange). */
  const [matchInProgress, setMatchInProgress] = useState(false)
  const [teamProfileId, setTeamProfileId] = useState(null)
  const [simProgress, setSimProgress] = useState(null)
  const [calendarSim, setCalendarSim] = useState(null)
  const [actionRequiredMessageId, setActionRequiredMessageId] = useState(null)
  const [pendingRandomEventId, setPendingRandomEventId] = useState(null)
  const [pendingWatchableFinalId, setPendingWatchableFinalId] = useState(null)
  /** Finał "oglądany" na żywo (pełny silnik, widz) — patrz career/watchableFinals.js.
   *  { competition, leagueFixture, homeTeam, awayTeam, messageId } | null. */
  const [watchingFinal, setWatchingFinal] = useState(null)
  const [inboxFocusId, setInboxFocusId] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pendingWelcome, setPendingWelcome] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (activeTab !== 'match') setMatchInProgress(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [activeTab, screen])

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
    if (leagueFixture.competition === 'international-club') {
      const prepared = prepareInternationalClubMatch(career, leagueFixture)
      if (prepared) return { home: teamForMatchEngine(prepared.home), away: teamForMatchEngine(prepared.away) }
    }
    const home = teamFromLeague(league, leagueFixture.homeTeamId)
    const away = teamFromLeague(league, leagueFixture.awayTeamId)
    return {
      home: home ? teamForMatchEngine(home) : null,
      away: away ? teamForMatchEngine(away) : null,
    }
  }, [league, leagueFixture, career])

  const seasonState = useMemo(
    () => (league ? buildSeasonStateFromLeague(league) : null),
    [league],
  )

  const refreshSlots = useCallback(() => {
    setSlots(listSlots())
  }, [])

  // Autosave celowo NIE odpala się po każdej akcji (kliknięcie wiadomości,
  // zmiana taktyki, negocjacje...) — tylko stan w pamięci jest aktualizowany.
  // Realny zapis na dysk dzieje się wyłącznie przy jawnych checkpointach
  // (Dalej, symulacja do meczu/daty, rozegrany mecz, zmiana sezonu, wyjście
  // do menu) — te miejsca wołają `syncCareer(next, { save: true })`.
  const syncCareer = useCallback((next, { save = false } = {}) => {
    // Nie odświeżamy tu listy `slots` (ekran wyboru kariery) — ten stan jest
    // widoczny tylko na ekranie 'slots', a pełny listSlots() dekompresuje i
    // "rehydratuje" cały zapis, co przy każdym zapisie na dysk powodowałoby
    // zauważalne zawieszenie UI. Ekran 'slots' odświeża listę sam przy
    // wejściu (handleExitToSlots itd.).
    addManagerWelcome(next)
    setCareer(save ? saveCareerNow(next) : next)
  }, [])

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
  // sponsorską, decyzję ze zdarzenia losowego albo alarm finansowy — patrz
  // isImportantInboxMessage. Cotygodniowy raport treningowy też zatrzymuje "Dalej"
  // (żeby manager go zauważył), ale bez wchodzenia w "Wymaganą akcję" — patrz
  // isPausingInboxMessage. Pojedyncze raporty treningowe i artykuły Ultiworld
  // nie przerywają symulacji w ogóle — lecą w tle.
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
          const result = advanceCareerDay({ ...workingCareer, league: dayLeague })
          workingCareer = result.career
          if (workingCareer.managerCareer?.status === 'unemployed') { dayLeague = workingCareer.league; break }
          const step = { ...workingCareer, inboxMessages: result.inboxMessages }
          dayLeague = workingCareer.league
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
          const blocker = firstPausingInboxMessage(step.inboxMessages)
          if (blocker) {
            // Pauza-only wiadomości (np. cotygodniowy raport treningowy) zatrzymują
            // "Dalej", żeby manager je zauważył, ale nie wchodzą w stan "Wymagana
            // akcja" — nic w nich nie wymaga rozstrzygnięcia, więc kolejne "Dalej"
            // ma po prostu kontynuować (patrz isImportantInboxMessage/isPausingInboxMessage).
            blockingMessageId = isImportantInboxMessage(blocker) ? blocker.id : null
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
        loanLog: workingCareer.loanLog,
        aiTransfersLastDate: workingCareer.aiTransfersLastDate,
        inbox: workingCareer.inbox,
        ultiworld: workingCareer.ultiworld,
        pendingEventFollowUps: workingCareer.pendingEventFollowUps,
      })
      syncCareer(next, { save: true })

      if (blockedFixture) {
        setActionRequiredMessageId(null)
        setLeagueFixture(blockedFixture)
        setActiveTab('match')
      } else {
        setActionRequiredMessageId(blockingMessageId)
        // A pending "decision" random_event gets its own popup right away instead
        // of waiting for the manager to notice the inbox banner (see item 6c).
        const blockerMsg = next.inbox?.find((m) => m.id === blockingMessageId)
        if (blockerMsg?.type === INBOX_TYPES.RANDOM_EVENT && blockerMsg.payload?.kind === 'decision') {
          setPendingRandomEventId(blockingMessageId)
        } else if (blockerMsg?.type === INBOX_TYPES.WATCHABLE_FINAL && blockerMsg.payload?.status === 'pending') {
          setPendingWatchableFinalId(blockingMessageId)
        }
      }
    } catch (err) {
      console.error('[calendar sim]', err)
      setAppError(friendlySaveErrorMessage(err, uiLang))
    }
  }, [career, simProgress, calendarSim, syncCareer, uiLang])

  const runFastForward = useCallback(async ({ targetDate = null, untilMatch = false } = {}) => {
    if (!career?.league || simProgress || calendarSim) return
    if (targetDate && targetDate <= career.league.currentDate) return
    const league = cloneLeague(career.league)
    setSimProgress({ label: untilMatch ? shellStrings(uiLang).simUntilMatch : shellStrings(uiLang).simUntilDate,
      detail: league.currentDate, current: 0, total: 1, indeterminate: true })
    try {
      const result = await simulateCareerUntil({ ...career, league }, {
        targetDate, untilMatch, maxDays: untilMatch ? 120 : 400,
        onProgress: p => setSimProgress({ label: shellStrings(uiLang).simCalendar,
          detail: shellStrings(uiLang).simDay(p.currentDate), indeterminate: true }),
      })
      syncCareer(persistCareer(result.career), { save: true })
      if (targetDate) setLeagueFixture(null)
      if (isOfficialSeasonEnded(result.career.league)) setActiveTab('hub')
      else if (targetDate) setActiveTab('calendar')
    } catch (err) {
      console.error('[calendar sim]', err)
      setAppError(friendlySaveErrorMessage(err, uiLang))
    } finally {
      setSimProgress(null)
    }
  }, [career, simProgress, calendarSim, syncCareer, uiLang])

  const handleSimulateUntilMatch = useCallback(() => runFastForward({ untilMatch: true }), [runFastForward])
  const handleSimulateUntilDate = useCallback(targetDate => runFastForward({ targetDate }), [runFastForward])

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
        loanLog: patch.loanLog ?? career.loanLog,
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

      // —— Prośba AI o wypożyczenie zawodnika gracza ——
      if (p?.kind === 'loan_in_request_from_ai') {
        const result = respondToIncomingLoanRequest(career, { messageId, action })
        if (!result.ok) return result
        const next = persistCareer(career, {
          world: result.world ?? career.world,
          inbox: result.inbox,
        })
        syncCareer(next)
        return result
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

      // Club terms agreed — the player still has to decide, a few days out
      // (see queueSalePlayerDecision), not finalized on the spot.
      if (result.pending === 'player_decision') {
        const queued = queueSalePlayerDecision(career, {
          messageId,
          playerId: result.playerId,
          playerName: result.playerName ?? p.playerName,
          buyerTeamId: result.buyerTeamId,
          fee: result.fee,
        })
        if (!queued.ok) return queued
        const inbox = mergeInbox({ ...career, inbox: queued.inboxBase }, [queued.message])
        const next = persistCareer(career, { inbox })
        syncCareer(next)
        return queued
      }

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
      if (!result.ok) return result
      const next = persistCareer(career, result.careerPatch)
      syncCareer(next)
      setPendingRandomEventId((id) => (id === messageId ? null : id))
      setActionRequiredMessageId((id) => (id === messageId ? null : id))
      return result
    },
    [career, syncCareer],
  )

  // "Zignoruj" na wiadomości watchable_final (finał Pucharu Stycznia / ME-MŚ): rozstrzyga
  // NATYCHMIAST silnikiem szybkim — ten sam efekt, jaki dałby kolejny dzień symulacji.
  const handleIgnoreFinal = useCallback(
    (messageId) => {
      if (!career || !messageId) return
      const message = career.inbox?.find((m) => m.id === messageId)
      if (!message) return
      const league = cloneLeague(career.league)
      const nationalTeams = structuredClone(career.nationalTeams ?? null)
      const patch = resolveWatchableFinalIgnore({ ...career, league, nationalTeams }, message)
      if (!patch) return
      const nextInbox = markInboxMessageResolved(career.inbox, messageId)
      const next = persistCareer(career, { league, nationalTeams, inbox: nextInbox })
      syncCareer(next, { save: true })
      setPendingWatchableFinalId((id) => (id === messageId ? null : id))
      setActionRequiredMessageId((id) => (id === messageId ? null : id))
    },
    [career, syncCareer],
  )

  // "Oglądaj": przechodzi do MatchView w trybie widza (spectatorMode) — pełny silnik,
  // oba boki AI, bez dostępu do taktyk. Wynik zapisuje się dopiero po zakończeniu meczu
  // (patrz handleWatchFinalMatchComplete).
  const handleWatchFinal = useCallback(
    (messageId) => {
      if (!career || !messageId) return
      const message = career.inbox?.find((m) => m.id === messageId)
      if (!message) return
      const league = cloneLeague(career.league)
      const nationalTeams = structuredClone(career.nationalTeams ?? null)
      const started = beginWatchingFinal({ ...career, league, nationalTeams }, message)
      if (!started) return
      const next = persistCareer(career, { league, nationalTeams })
      syncCareer(next)
      setPendingWatchableFinalId(null)
      const payload = message.payload ?? {}
      if (payload.competition === 'januaryCup') {
        // Nie polegaj na wewnętrznym fallbacku MatchView (statyczne dane demo z
        // ufaLeagueTeams.js) — rozwiąż PRAWDZIWE, aktualne składy klubowe, tak samo
        // jak `matchTeams` dla meczu gracza.
        const homeTeamObj = teamFromLeague(league, started.fixture.homeTeamId)
        const awayTeamObj = teamFromLeague(league, started.fixture.awayTeamId)
        setWatchingFinal({
          messageId,
          competition: 'januaryCup',
          leagueFixture: started.fixture,
          homeTeam: homeTeamObj ? teamForMatchEngine(homeTeamObj) : null,
          awayTeam: awayTeamObj ? teamForMatchEngine(awayTeamObj) : null,
        })
      } else {
        setWatchingFinal({
          messageId,
          competition: 'international',
          leagueFixture: {
            id: started.match.id,
            homeTeamId: started.match.homeTeamId,
            awayTeamId: started.match.awayTeamId,
            date: started.match.date,
            status: 'scheduled',
          },
          homeTeam: started.homeTeam,
          awayTeam: started.awayTeam,
        })
      }
      setActiveTab('match')
    },
    [career, syncCareer],
  )

  // Widz kończy mecz (pełny silnik, na żywo) — wpisuje wynik dokładnie tak samo,
  // jak zrobiłby to silnik szybki w tle (patrz career/watchableFinals.js).
  const handleWatchFinalMatchComplete = useCallback(
    (result) => {
      if (!career || !watchingFinal) return
      const message = career.inbox?.find((m) => m.id === watchingFinal.messageId)
      if (!message) return
      const league = cloneLeague(career.league)
      const nationalTeams = structuredClone(career.nationalTeams ?? null)
      const patch = completeWatchedFinal({ ...career, league, nationalTeams }, message, result, {
        homeTeam: watchingFinal.homeTeam,
        awayTeam: watchingFinal.awayTeam,
      })
      if (!patch) return
      const nextInbox = markInboxMessageResolved(career.inbox, watchingFinal.messageId)
      const next = persistCareer(career, { league, nationalTeams, inbox: nextInbox })
      syncCareer(next, { save: true })
    },
    [career, syncCareer, watchingFinal],
  )

  const handleReturnFromWatchFinal = useCallback(() => {
    const competition = watchingFinal?.competition
    setWatchingFinal(null)
    setActiveTab(competition === 'januaryCup' ? 'cup' : 'international')
  }, [watchingFinal])

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
      if (matchInProgress && id !== 'match') return
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
    [career?.league, leagueFixture, matchInProgress],
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

  // Same auto-clear for the random-event popup — also covers switching careers
  // (a fresh inbox won't contain the old id).
  useEffect(() => {
    if (!pendingRandomEventId || !career?.inbox) return
    const msg = career.inbox.find((m) => m.id === pendingRandomEventId)
    if (!msg || !isImportantInboxMessage(msg)) {
      setPendingRandomEventId(null)
    }
  }, [career?.inbox, pendingRandomEventId])

  // Same auto-clear for the watchable-final popup.
  useEffect(() => {
    if (!pendingWatchableFinalId || !career?.inbox) return
    const msg = career.inbox.find((m) => m.id === pendingWatchableFinalId)
    if (!msg || !isImportantInboxMessage(msg)) {
      setPendingWatchableFinalId(null)
    }
  }, [career?.inbox, pendingWatchableFinalId])

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
        if (postMatchEvent?.type === INBOX_TYPES.RANDOM_EVENT && postMatchEvent.payload?.kind === 'decision') {
          setPendingRandomEventId(postMatchEvent.id)
        }
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
        const saved = saveCareerNow(
          persistCareer(prev, {
            league: copy,
            inbox: inboxMsgs.length ? mergeInbox(prev, inboxMsgs) : prev.inbox,
          }),
        )
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
        syncCareer(next, { save: true })
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

  const handleToggleTransferList = useCallback(
    (playerId) => {
      if (!career?.world) return { ok: false }
      const team = worldTeamById(career.world, career.playerTeamId)
      const currentlyListed = !!team?.players?.find(
        (p) => String(p.id) === String(playerId),
      )?.transferListed
      const result = setPlayerTransferListed(team, playerId, !currentlyListed)
      if (result.ok) {
        const next = persistCareer(career, { world: career.world })
        syncCareer(next)
      }
      return result
    },
    [career, syncCareer],
  )

  const handleToggleLoanList = useCallback((playerId) => {
    if (!career?.world) return { ok: false }
    const team = worldTeamById(career.world, career.playerTeamId)
    const player = team?.players?.find(p => String(p.id) === String(playerId))
    const result = setPlayerLoanListed(team, playerId, !player?.loanListed)
    if (result.ok) syncCareer(persistCareer(career, { world: career.world }))
    return result
  }, [career, syncCareer])

  const handleToggleNotForSale = useCallback((playerId) => {
    if (!career?.world) return { ok: false }
    const team = worldTeamById(career.world, career.playerTeamId)
    const player = team?.players?.find(p => String(p.id) === String(playerId))
    const result = setPlayerNotForSale(team, playerId, !player?.notForSale)
    if (result.ok) syncCareer(persistCareer(career, { world: career.world }))
    return result
  }, [career, syncCareer])

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
    setCareer(addManagerWelcome(ensured))
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
      managerProfile,
      worldConfig,
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
          managerProfile,
          worldConfig,
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

  const handleExitToSlots = useCallback(async () => {
    if (career) {
      setSimProgress({ label: tShell.savingExit, indeterminate: true })
      // Odczekaj klatkę, żeby przeglądarka zdążyła odmalować pasek postępu
      // zanim zablokuje wątek kosztowną kompresją zapisu (patrz saveStore.js).
      await yieldToUi()
      saveCareerNow(career)
      refreshSlots()
      setSimProgress(null)
    }
    setCareer(null)
    setLeagueFixture(null)
    setScreen('menu')
  }, [career, refreshSlots, tShell.savingExit])

  if (screen === 'menu') return <MainMenuScreen lang={uiLang} onLangChange={setUiLang} hasSaves={slots.some(Boolean)}
    onNew={() => { setSlotSelectionMode('new'); setScreen('slots') }} onLoad={() => { setSlotSelectionMode('load'); setScreen('slots') }} />

  if (screen === 'slots') {
    return (
      <>
        <div className="relative z-10 min-h-screen">
          <CareerSelectScreen
            onBack={() => setScreen('menu')}
            selectionMode={slotSelectionMode}
            slots={slots}
            lang={uiLang}
            onLangChange={setUiLang}
            onNew={handleNewSlot}
            onLoad={handleLoadSlot}
            onDelete={handleDeleteSlot}
          />
        </div>
      </>
    )
  }

  if (screen === 'new' && pendingSlot != null) {
    return (
      <>
        <div className="relative z-10 min-h-screen">
          <NewCareerScreen
            slotIndex={pendingSlot}
            lang={uiLang}
            onCancel={() => {
              if (creatingCareer) return
              setPendingSlot(null)
              setScreen('menu')
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
      </>
    )
  }

  const updateManagerCareer = next => { setLeagueFixture(null); setActiveTab('career'); syncCareer(persistCareer(next), {save:true}) }
  const waitForManagerJob = async () => {
    let next = structuredClone(career)
    if (isOfficialSeasonEnded(next.league)) next = startNextSeason(next)
    else for (let i=0; i<7 && !isOfficialSeasonEnded(next.league); i++) {
      next = advanceCareerDay(next, {autoSimulatePlayer:true}).career
      await new Promise(resolve=>setTimeout(resolve,0))
    }
    updateManagerCareer(processManagerCareer(next))
  }
  if (career && league && career.managerCareer?.status === 'unemployed') return <main className="min-h-screen bg-ufa-bg p-4 text-ufa-text"><div className="mx-auto max-w-5xl space-y-4"><button type="button" className="rounded border border-ufa-border px-3 py-2" onClick={handleExitToSlots}>{uiLang==='en'?'Save and exit':'Zapisz i wyjdź'}</button><ManagerCareerPanel career={career} onUpdate={updateManagerCareer} onWait={waitForManagerJob} /></div></main>
  if (!career || !league || !userTeam) {
    return (
      <div className="min-h-screen bg-ufa-bg flex items-center justify-center text-ufa-muted">
        {tShell.loadingCareer}
      </div>
    )
  }

  const inboxUnread = unreadInboxCount(career)
  const ultiworldUnread = unreadUltiworldCount(career)
  const categoryBadge = (cat) => {
    if (cat.id === 'home') return inboxUnread
    if (cat.id === 'ultiworld') return ultiworldUnread
    return 0
  }

  return (
    <>
    <div className="um-shell relative z-10 flex min-h-screen flex-col lg:flex-row">
      <aside className="um-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-ufa-border bg-ufa-panel lg:flex">
        <div className="um-sidebar-brand"><Wordmark /><p>{career.managerName}</p></div>

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
          <kbd className="rounded border border-ufa-border px-1 font-mono text-[11px]">Ctrl K</kbd>
        </button>

        <nav
          className={`flex-1 overflow-y-auto px-2.5 py-3 ${
            matchInProgress ? 'pointer-events-none opacity-40' : ''
          }`}
          aria-label={tShell.navAria}
          aria-disabled={matchInProgress}
        >
          {NAV_CATEGORIES.map((cat) => {
            const Icon = NAV_ICONS[cat.id]
            const catBadge = categoryBadge(cat)
            return (
              <div key={cat.id} className="mb-4 last:mb-0">
                <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ufa-muted">
                  <Icon className="h-3.5 w-3.5" />
                  {pickLabel(cat, uiLang)}
                  {catBadge > 0 ? (
                    <span className="ml-auto inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-ufa-accent px-1 text-[11px] font-bold text-ufa-on-accent">
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
                        aria-current={active ? 'page' : undefined}
                        disabled={matchInProgress}
                        className={`um-nav-item flex w-full items-center justify-between rounded-sm border-l-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                          active
                            ? 'border-ufa-accent bg-ufa-accent/15 font-semibold text-ufa-accent'
                            : 'border-transparent text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
                        }`}
                      >
                        {pickLabel(item, uiLang)}
                        {badgeCount > 0 ? (
                          <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-ufa-gold px-1 text-[11px] font-bold text-ufa-on-accent">
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
          <div className="flex items-center gap-2">
            <LangSwitch lang={uiLang} onChange={setUiLang} />
            <ThemeControl />
          </div>
          <button
            type="button"
            onClick={handleExitToSlots}
            disabled={matchInProgress}
            className="rounded-sm border border-ufa-border px-3 py-1.5 text-xs font-medium text-ufa-text hover:border-ufa-accent/50 hover:bg-ufa-panel-hover disabled:pointer-events-none disabled:opacity-40"
          >
            {tShell.saveAndExit}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="um-topbar">
          <div className="um-topbar-inner">
            <div className="um-mobile-brand"><Wordmark compact /></div>
            <div className="um-topbar-context"><strong>{userTeam.name}</strong><span>{displaySeasonLabel(league.seasonLabel, uiLang)} · {league.currentDate}</span></div>
            <div className="um-topbar-actions">
              <ThemeControl />
              <button type="button" className="um-button" disabled={matchInProgress} onClick={() => navigateTo('inbox')}>{uiLang === 'en' ? 'Inbox' : 'Skrzynka'}{inboxUnread > 0 ? ' · ' + inboxUnread : ''} →</button>
              {activeTab !== 'match' && <button type="button" className="um-button um-button--primary" disabled={!!simProgress || !!calendarSim || matchInProgress} onClick={actionRequiredMessageId ? handleActionRequired : handleAdvanceDay}>{actionRequiredMessageId ? hubStrings(uiLang).actionRequired : tShell.advanceDay} →</button>}
            </div>
          </div>
        </header>

        <main className="um-workspace um-screen mx-auto w-full max-w-[1600px] flex-1" data-screen={activeTab}>
        {activeTab === 'hub' && (
          <LeagueHub
            nextFixture={findNextPlayerFixture(league)}
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
            onWatchFinal={handleWatchFinal}
            onIgnoreFinal={handleIgnoreFinal}
            initialSelectedId={inboxFocusId}
            onConsumeFocus={() => setInboxFocusId(null)}
          />
        )}

        {activeTab === 'ultiworld' && (
          <UltiworldView career={career} onUltiworldChange={handleUltiworldChange} />
        )}

        {activeTab === 'international' && (
          <InternationalCompetitionView career={career} onCareerUpdate={handleTransfersUpdate} />
        )}

        {activeTab === 'standings' && (
          <LeagueStandingsView league={league} onTeamSelect={openTeamProfile} />
        )}

        {activeTab === 'pyramid' && (
          career.competition === 'domestic' ? <DomesticLeaguesView career={career} lang={uiLang} onTeamSelect={openTeamProfile} onScopeChange={pendingSimulationConfig => syncCareer(persistCareer(career, {world:{...career.world,pendingSimulationConfig}}), {save:true})} /> : <PyramidStandingsView career={career} onTeamSelect={openTeamProfile} />
        )}
        {activeTab === 'international-clubs' && <InternationalCupsView career={career} lang={uiLang} onTeamClick={openTeamProfile} />}

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

        {activeTab === 'league-schedule' && (
          <LeagueScheduleView league={league} onPlayFixture={handlePlayFixture} />
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
          <><ManagerCareerPanel career={career} onUpdate={updateManagerCareer} onWait={waitForManagerJob} /><CareerHistoryView career={career} onStartNextSeason={handleStartNextSeason} /></>
        )}

        {activeTab === 'roster' && (
          <RosterView
            matchStamina={matchStamina}
            focusTeamName={userTeam.name}
            leaguePlayerStats={league.playerStats}
            teams={worldTeams}
            clubOnly
            onExtendContract={handleExtendContract}
            onToggleTransferList={handleToggleTransferList}
            onToggleLoanList={handleToggleLoanList}
            onToggleNotForSale={handleToggleNotForSale}
          />
        )}

        {activeTab === 'club-transfers' && (
          <TransfersView career={career} onCareerUpdate={handleTransfersUpdate} />
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
          <><ClubBoardView career={career} onChange={handleClubBoardChange} /><ManagerCareerPanel career={career} onUpdate={updateManagerCareer} onWait={waitForManagerJob} /></>
        )}

        {activeTab === 'club-staff' && userTeam && (
          <div className="um-section league-fade-in">
            <StaffManagementPanel key={userTeam.id} team={userTeam} lang={uiLang} currentDate={career.league.currentDate} onChange={handleClubBoardChange} />
          </div>
        )}

        {activeTab === 'club-finances' && userTeam && (
          <ClubFinancesView key={userTeam.id} team={userTeam} world={career.world} league={career.league} seasonYear={career.seasonYear} currentDate={career.league.currentDate} lang={uiLang} onChange={handleClubBoardChange} />
        )}

        {activeTab === 'academy' && (
          <AcademyView career={career} onCareerUpdate={handleTransfersUpdate} />
        )}

        {activeTab === 'match' &&
          (watchingFinal ? (
            <MatchView
              spectatorMode
              leagueFixture={watchingFinal.leagueFixture}
              homeTeam={watchingFinal.homeTeam}
              awayTeam={watchingFinal.awayTeam}
              onLeagueMatchComplete={handleWatchFinalMatchComplete}
              onReturnToLeague={handleReturnFromWatchFinal}
              onMatchLockChange={setMatchInProgress}
            />
          ) : leagueFixture ? (
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
                league={league}
                onMatchLockChange={setMatchInProgress}
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
            <div className="rounded-sm border border-ufa-border bg-ufa-panel p-8 text-center shadow-xl shadow-black/30">
              <h2 className="text-2xl font-semibold text-ufa-text">{tShell.noActiveMatchTitle}</h2>
              <p className="mt-2 text-sm text-ufa-muted max-w-md mx-auto">
                {tShell.noActiveMatchBody}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateTo('hub')}
                  className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-on-accent"
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

      <nav className="um-mobile-nav" aria-label={tShell.navAria}>
        {[
          { id: 'hub', label: uiLang === 'en' ? 'Home' : 'Centrum', Icon: IconHome },
          { id: 'tactics', label: uiLang === 'en' ? 'Tactics' : 'Taktyka', Icon: IconTactics },
          { id: 'match', label: uiLang === 'en' ? 'Match' : 'Mecz', Icon: IconTrophy },
        ].map(({ id, label, Icon }) => <button key={id} type="button" disabled={matchInProgress && id !== 'match'} aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigateTo(id)}><Icon /><span>{label}</span></button>)}
        <button type="button" disabled={matchInProgress} aria-expanded={mobileMenuOpen} aria-current={!['hub', 'tactics', 'match'].includes(activeTab) ? 'page' : undefined} onClick={() => setMobileMenuOpen(true)}><IconDots /><span>Menu</span></button>
      </nav>
      <MobileMenu open={mobileMenuOpen} onClose={closeMobileMenu} categories={NAV_CATEGORIES} activeTab={activeTab} lang={uiLang} setLang={setUiLang} navigate={navigateTo} onExit={handleExitToSlots} onSearch={() => setPaletteOpen(true)} disabled={matchInProgress} />

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
          <div className="flex max-w-xl items-start gap-3 rounded-sm border border-red-500/40 bg-ufa-panel px-4 py-3 text-sm text-ufa-danger shadow-2xl shadow-black/50">
            <span className="flex-1">{appError}</span>
            <button
              type="button"
              onClick={() => setAppError('')}
              className="text-ufa-danger/70 hover:text-ufa-danger"
              aria-label={commonStrings(uiLang).close}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {pendingRandomEventId && (
        <RandomEventModal
          message={career.inbox?.find((m) => m.id === pendingRandomEventId) ?? null}
          lang={uiLang}
          onChoose={handleResolveDecision}
        />
      )}

      {pendingWatchableFinalId && (
        <WatchFinalModal
          message={career.inbox?.find((m) => m.id === pendingWatchableFinalId) ?? null}
          lang={uiLang}
          onWatch={handleWatchFinal}
          onIgnore={handleIgnoreFinal}
        />
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
    </>
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
      <div className="rounded-sm border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <h2 className="text-2xl font-semibold text-ufa-text">{t.careerTitle}</h2>
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
            className="mt-4 rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-on-accent hover:opacity-90"
          >
            {t.startNext(next)}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text text-xl mb-3">{t.seasonHistory}</h3>
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

        <div className="rounded-sm border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text text-xl mb-3">{t.allTimeLeaders}</h3>
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
