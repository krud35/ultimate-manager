import { LeagueStandingsView } from './LeagueStandingsView'
import StreamlinedStoriesPanel from './StreamlinedStoriesPanel.jsx'
import SeasonRecapPanel, {
  SeasonSummaryPanel,
  shouldShowSeasonSummary,
} from './SeasonRecapPanel'
import {
  teamNameMapAll,
  standingsTable,
  getFixturesOnDate,
  getPlayerFixtureOnDate,
  detectSeasonPhase,
  isOfficialSeasonEnded,
  venueMarkerForTeam,
} from '../league'
import {
  teamFromLeague,
  getTransferWindowState,
  formatUsd,
  getTransferBudget,
  getSalaryBudget,
  worldTeamById,
  unreadInboxCount,
  unreadUltiworldCount,
  ensureTeamReputation,
  getTeamReputation,
  ensureTeamFans,
  getFanSize,
  getFanMood,
  formatFanSize,
} from '../career'
import { useUiLang } from '../ui/UiLangContext'
import { commonStrings } from '../ui/strings/common'
import { hubStrings } from '../ui/strings/hub'
import { displaySeasonLabel, pickCopy, pickLabel, UI_LANG } from '../ui/locale'
import { nationalTeamFixturesOnDate } from '../career/nationalTeamSeason.js'
import { academyCountryLabel } from '../data/academyScoutGeography.js'
import { internationalCompetitionStrings } from '../ui/strings/internationalCompetition.js'
import { isStreamlinedCareer } from '../career/gameplayEdition.js'
import { requiresCareerDecision } from '../career/streamlinedDecisions.js'
import { readiness, WEEK_GOALS, WEEK_INTENSITIES } from '../career/streamlinedTraining.js'

function formatDayLabel(iso, lang) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(
      lang === UI_LANG.EN ? 'en-US' : 'pl-PL',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      },
    )
  } catch {
    return iso
  }
}

export default function LeagueHub({
  league,
  onPlayFixture,
  onNavigate,
  onTeamSelect = null,
  career = null,
  onStartNextSeason = null,
  onSimulateUntilMatch = null,
  simulating = false,
  actionRequired = false,
  onActionRequired = null,
  nextFixture = null,
}) {
  const { lang } = useUiLang()
  const t = hubStrings(lang)
  const c = commonStrings(lang)
  // Wszystkie drużyny piramidy, nie tylko poziom gracza — "dzisiejsze mecze" mogą
  // pokazywać pucharowe pary z innych poziomów (patrz teamNameMapAll w leagueState.js).
  const names = teamNameMapAll(league, lang)
  const table = standingsTable(league.standings, (id) => names[id])
  const officialEnded =
    isOfficialSeasonEnded(league) || career?.phase === 'season_complete'
  const seasonDone = officialEnded
  const showSummary = career && shouldShowSeasonSummary({ ...career, league })
  const phase = detectSeasonPhase(league) || league.phase || 'fall'
  const todayFixtures = getFixturesOnDate(league, league.currentDate)
  const ti = internationalCompetitionStrings(lang)
  const nationalFixturesToday = nationalTeamFixturesOnDate(
    career?.nationalTeams,
    league.currentDate,
  )
  const playerFix = getPlayerFixtureOnDate(league, league.currentDate)
  const featuredFixture = playerFix?.status !== 'completed' && playerFix ? playerFix : nextFixture
  const playerTeamName =
    teamFromLeague(league, league.playerTeamId)?.name ?? names[league.playerTeamId]

  const cupChampion =
    league.cup?.championTeamId != null
      ? names[league.cup.championTeamId] ?? league.cup.championTeamId
      : null

  const transferWindow = career ? getTransferWindowState(career) : { open: false }
  const playerTeam =
    career?.world && career?.playerTeamId
      ? worldTeamById(career.world, career.playerTeamId)
      : teamFromLeague(league, league.playerTeamId)
  const budget = playerTeam ? getTransferBudget(playerTeam) : null
  const salaryBudget = playerTeam ? getSalaryBudget(playerTeam) : null
  const reputation = (() => {
    if (!playerTeam) return null
    ensureTeamReputation(playerTeam)
    return getTeamReputation(playerTeam)
  })()
  const fans = (() => {
    if (!playerTeam) return null
    ensureTeamFans(playerTeam)
    return { size: getFanSize(playerTeam), mood: getFanMood(playerTeam) }
  })()
  const inboxUnread = career ? unreadInboxCount(career) : 0
  const ultiworldUnread = career ? unreadUltiworldCount(career) : 0
  const latestUw = career?.ultiworld?.articles?.[0] ?? null
  const phaseLabel = c.phases[phase] ?? phase

  return (
    <div className="um-hub">
      {seasonDone && career && onStartNextSeason && <SeasonRecapPanel career={{ ...career, league }} onStartNextSeason={onStartNextSeason} onViewStandings={() => onNavigate('standings')} onOpenTransfers={() => onNavigate('club-transfers')} />}
      {showSummary && !seasonDone && <SeasonSummaryPanel career={{ ...career, league }} onViewStandings={() => onNavigate('standings')} onOpenTransfers={() => onNavigate('club-transfers')} />}
      {actionRequired && <div className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-ufa-gold bg-ufa-panel p-4" role="status"><div><strong>{t.actionRequired}</strong><p className="text-sm text-ufa-muted">{t.inboxHint}</p></div><button className="um-button" type="button" disabled={simulating} onClick={onActionRequired}>{t.openInbox} →</button></div>}
      <header className="um-hub-heading">
        <div><p className="um-eyebrow">{formatDayLabel(league.currentDate, lang)}</p><h1 className="um-page-title">{seasonDone ? (lang === 'en' ? 'SEASON COMPLETE.' : 'SEZON ZAKOŃCZONY.') : (lang === 'en' ? 'EVERY POINT COUNTS.' : 'KAŻDY PUNKT SIĘ LICZY.')}</h1><p className="text-sm text-ufa-muted">{displaySeasonLabel(league.seasonLabel, lang)} · {phaseLabel} · {t.leagueRound(league.currentRound, league.totalRounds)}</p></div>

      </header>
      {isStreamlinedCareer(career) && <section className="um-section">
        <p className="um-eyebrow">{lang === 'en' ? 'Streamlined · Team briefing' : 'Uproszczona · Odprawa zespołu'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <button className="text-left" onClick={() => onNavigate('roster')}><strong>{lang === 'en' ? 'Ready to play' : 'Gotowi do gry'}: {(playerTeam?.players ?? []).filter(p => readiness(p).id === 'ready').length}/{playerTeam?.players?.length ?? 0}</strong><p className="text-sm text-ufa-muted">{lang === 'en' ? 'Check injuries, rest and match rhythm →' : 'Sprawdź urazy, odpoczynek i rytm meczowy →'}</p></button>
          <button className="text-left" onClick={() => onNavigate('training')}><strong>{WEEK_GOALS[playerTeam?.teamTraining?.schedule?.streamlined?.goal]?.[lang === 'en' ? 'en' : 'pl']}</strong><p className="text-sm text-ufa-muted">{WEEK_INTENSITIES[playerTeam?.teamTraining?.schedule?.streamlined?.intensity]?.[lang === 'en' ? 'en' : 'pl']} · {lang === 'en' ? 'Change weekly plan →' : 'Zmień plan tygodnia →'}</p></button>
          <button className="text-left" onClick={() => onNavigate('inbox')}><strong>{lang === 'en' ? 'Decisions' : 'Decyzje'}: {(career.inbox ?? []).filter(requiresCareerDecision).length}</strong><p className="text-sm text-ufa-muted">{lang === 'en' ? 'Reports arrive without stopping the calendar →' : 'Raporty trafiają do skrzynki bez zatrzymywania czasu →'}</p></button>
        </div>
        {(career.pendingEventFollowUps ?? []).some(f => f.reviewRequired) && <p className="mt-3 text-sm text-ufa-gold">{lang === 'en' ? 'A story continuation is waiting for compatible data. Its state has been preserved in this save.' : 'Kontynuacja wydarzenia oczekuje na zgodne dane. Jej stan został zachowany w zapisie.'}</p>}
      </section>}
      {isStreamlinedCareer(career) && <StreamlinedStoriesPanel career={career} onNavigate={onNavigate} />}
      {!seasonDone && featuredFixture && <section className="um-match-feature">
        <p className="um-eyebrow">{t.yourMatch} · {featuredFixture.competition === 'cup' ? t.competitionCup : t.competitionLeague} · {featuredFixture.date} · {venueMarkerForTeam(featuredFixture, league.playerTeamId)}</p>
        <div className="um-match-teams">
          <button className="um-match-team" type="button" disabled={!onTeamSelect} onClick={() => onTeamSelect?.(featuredFixture.homeTeamId)}>{names[featuredFixture.homeTeamId] ?? 'TBD'} <span className="text-base" aria-hidden="true">↗</span></button>
          <span className="um-match-vs">VS</span>
          <button className="um-match-team" type="button" disabled={!onTeamSelect} onClick={() => onTeamSelect?.(featuredFixture.awayTeamId)}>{names[featuredFixture.awayTeamId] ?? 'TBD'} <span className="text-base" aria-hidden="true">↗</span></button>
        </div>
        <div className="um-match-actions"><button className="um-link text-sm" type="button" onClick={() => onNavigate('team-schedule')}>{t.shortcutTeamSchedule}</button><button className="um-button um-button--primary" type="button" disabled={simulating} onClick={() => featuredFixture.date === league.currentDate ? onPlayFixture(featuredFixture) : onNavigate('match')}>{featuredFixture.date === league.currentDate ? t.goToMatch : lang === 'en' ? 'Prepare your team' : 'Przygotuj zespół'} →</button></div>
      </section>}
      {!seasonDone && !featuredFixture && <section className="um-match-feature"><h2>{lang === 'en' ? 'Between fixtures' : 'Między meczami'}</h2><p className="mt-2 text-sm text-ufa-muted">{phaseLabel}</p><button className="um-button mt-4" type="button" disabled={simulating} onClick={actionRequired ? onActionRequired : onSimulateUntilMatch}>{simulating ? t.simulating : actionRequired ? t.actionRequired : t.simUntilMatch} →</button></section>}
      <div className="um-hub-grid">
        <section className="min-w-0"><div className="mb-4 flex items-center justify-between gap-4"><h2 className="um-section-title">{lang === 'en' ? 'League standings' : 'Tabela ligi'}</h2><button type="button" className="um-link text-sm" onClick={() => onNavigate('standings')}>{lang === 'en' ? 'Full table' : 'Pełna tabela'} →</button></div><LeagueStandingsView league={league} compact topN={5} onTeamSelect={onTeamSelect} />
          <dl className="um-club-facts"><div><dt className="um-eyebrow">{t.place}</dt><dd>{table.findIndex(row => row.teamId === league.playerTeamId) + 1 || '—'}</dd></div><div><dt className="um-eyebrow">{t.reputation}</dt><dd>{reputation ?? '—'}</dd></div><div><dt className="um-eyebrow">{t.fans}</dt><dd>{fans ? formatFanSize(fans.size, lang) : '—'}</dd></div></dl>
        </section>
        <section className="min-w-0"><h2 className="um-section-title mb-2">{lang === 'en' ? 'At the club' : 'W klubie'}</h2>
          <button type="button" className="um-club-row" onClick={() => onNavigate('inbox')}><span><strong>{t.inboxTitle(inboxUnread)}</strong><small>{t.inboxHint}</small></span><span aria-hidden="true">→</span></button>
          <button type="button" className="um-club-row" onClick={() => onNavigate('club-transfers')}><span><strong>{transferWindow.open ? pickLabel(transferWindow, lang) : t.shortcutTransfers}</strong><small>{budget != null ? t.transferBudget(formatUsd(budget)).replace(/^ · /, '') : ''}{salaryBudget != null ? t.salaryBudget(formatUsd(salaryBudget)) : ''}</small></span><span aria-hidden="true">→</span></button>
          {latestUw && <button type="button" className="um-club-row" onClick={() => onNavigate('ultiworld')}><span><small>{t.newsBrand}{ultiworldUnread > 0 ? t.newsNew(ultiworldUnread) : ''}</small><strong>{pickCopy(latestUw, 'headline', lang)}</strong></span><span aria-hidden="true">→</span></button>}
          <button type="button" className="um-club-row" onClick={() => onNavigate('club-board')}><span><strong>{playerTeamName}</strong><small>{fans ? t.fanMood + ': ' + fans.mood : t.yourTeam}{cupChampion ? ' · ' + t.cup + ': ' + cupChampion : ''}</small></span><span aria-hidden="true">→</span></button>
        </section>
      </div>
      <section><div className="mb-4 flex items-center justify-between gap-4"><h2 className="um-section-title">{t.todaysMatches}</h2><button type="button" className="um-link text-sm" onClick={() => onNavigate('calendar')}>{lang === 'en' ? 'Calendar' : 'Kalendarz'} →</button></div>
        {todayFixtures.length === 0 ? <p className="text-sm text-ufa-muted">{t.noMatchesToday}</p> : <ul className="um-fixture-list">{todayFixtures.map(f => <li key={f.id}><span>{names[f.homeTeamId] ?? 'TBD'} — {names[f.awayTeamId] ?? 'TBD'}{f.competition === 'cup' ? ' · ' + t.cupTag : ''}</span><span className="shrink-0 tabular-nums">{f.status === 'completed' ? f.homeScore + ' : ' + f.awayScore : '—'}{f.status !== 'completed' && (f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId) && <button type="button" className="um-link ml-3" onClick={() => onPlayFixture(f)}>{t.play} →</button>}</span></li>)}</ul>}
        {nationalFixturesToday.length > 0 && <div className="mt-6"><h3>{ti.title}</h3><ul className="um-fixture-list">{nationalFixturesToday.map(f => <li key={f.id}><span>{academyCountryLabel(f.homeCountryId, lang)} — {academyCountryLabel(f.awayCountryId, lang)}</span><span>{f.status === 'completed' ? f.homeScore + ' : ' + f.awayScore : '—'}</span></li>)}</ul></div>}
      </section>
    </div>
  )
}
