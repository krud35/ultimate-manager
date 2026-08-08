import { LeagueStandingsView } from './LeagueStandingsView'
import SeasonRecapPanel, {
  SeasonSummaryPanel,
  shouldShowSeasonSummary,
} from './SeasonRecapPanel'
import { CalendarTile } from './CalendarView'
import { CupTile } from './CupView'
import {
  teamNameMap,
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
  reputationToneClass,
  ensureTeamFans,
  getFanSize,
  getFanMood,
  formatFanSize,
  fanMoodToneClass,
} from '../career'
import { useUiLang } from '../ui/UiLangContext'
import { commonStrings } from '../ui/strings/common'
import { hubStrings } from '../ui/strings/hub'
import { displaySeasonLabel, pickCopy, pickLabel, UI_LANG } from '../ui/locale'

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
  onAdvanceDay = null,
  onSimulateUntilMatch = null,
  simulating = false,
}) {
  const { lang } = useUiLang()
  const t = hubStrings(lang)
  const c = commonStrings(lang)
  const names = teamNameMap(league, lang)
  const table = standingsTable(league.standings, (id) => names[id])
  const officialEnded =
    isOfficialSeasonEnded(league) || career?.phase === 'season_complete'
  const seasonDone = officialEnded
  const showSummary = career && shouldShowSeasonSummary({ ...career, league })
  const phase = detectSeasonPhase(league) || league.phase || 'fall'
  const todayFixtures = getFixturesOnDate(league, league.currentDate)
  const playerFix = getPlayerFixtureOnDate(league, league.currentDate)
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
    <div className="space-y-6 league-fade-in">
      {seasonDone && career && onStartNextSeason && (
        <SeasonRecapPanel
          career={{ ...career, league }}
          onStartNextSeason={onStartNextSeason}
          onViewStandings={() => onNavigate('standings')}
          onOpenTransfers={() => onNavigate('club-transfers')}
        />
      )}

      {showSummary && !seasonDone && (
        <SeasonSummaryPanel
          career={{ ...career, league }}
          onViewStandings={() => onNavigate('standings')}
          onOpenTransfers={() => onNavigate('club-transfers')}
        />
      )}

      {inboxUnread > 0 && !seasonDone && (
        <div className="rounded-xl border border-ufa-accent/40 bg-ufa-accent/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ufa-accent">{t.inboxTitle(inboxUnread)}</p>
            <p className="text-xs text-ufa-muted mt-0.5">{t.inboxHint}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inbox')}
            className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.openInbox}
          </button>
        </div>
      )}

      {latestUw && !seasonDone && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg shadow-black/20">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ufa-accent">
              {t.newsBrand}
              {ultiworldUnread > 0 ? t.newsNew(ultiworldUnread) : ''}
            </p>
            <p className="mt-1 text-sm font-semibold text-ufa-text truncate">
              {pickCopy(latestUw, 'headline', lang)}
            </p>
            {pickCopy(latestUw, 'dek', lang) ? (
              <p className="mt-0.5 text-xs text-ufa-muted line-clamp-1">
                {pickCopy(latestUw, 'dek', lang)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ultiworld')}
            className="shrink-0 rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.readPortal}
          </button>
        </div>
      )}

      {transferWindow.open && (
        <div className="rounded-xl border border-ufa-accent/40 bg-ufa-accent/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ufa-accent">
              {pickLabel(transferWindow, lang)}
            </p>
            <p className="text-xs text-ufa-muted mt-0.5">
              {t.transferNegotiate}
              {budget != null ? t.transferBudget(formatUsd(budget)) : ''}
              {salaryBudget != null ? t.salaryBudget(formatUsd(salaryBudget)) : ''}
              {transferWindow.kind === 'summer' ? t.transferSummerRange : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('club-transfers')}
            className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.openTransfers}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">
              {t.calendarTitle(displaySeasonLabel(league.seasonLabel, lang))}
            </h2>
            <p className="mt-1 text-sm text-ufa-muted capitalize">
              {formatDayLabel(league.currentDate, lang)}
            </p>
            <p className="mt-1 text-sm text-ufa-muted">
              {t.phase}: <span className="text-ufa-text">{phaseLabel}</span>
              {' · '}
              {t.leagueRound(league.currentRound, league.totalRounds)}
              {career ? t.careerIndex(career.seasonIndex) : ''}
            </p>
            {cupChampion && (
              <p className="mt-1 text-sm text-ufa-gold">
                {t.cup}: {cupChampion}
              </p>
            )}
          </div>

          {!seasonDone && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAdvanceDay}
                disabled={simulating}
                className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
              >
                {t.nextDay}
              </button>
              {!(playerFix && playerFix.status !== 'completed') && (
                <button
                  type="button"
                  onClick={onSimulateUntilMatch}
                  disabled={simulating}
                  className="rounded-md border border-ufa-border px-5 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
                >
                  {simulating ? t.simulating : t.simUntilMatch}
                </button>
              )}
            </div>
          )}
        </div>

        {playerFix && playerFix.status !== 'completed' && (
          <div className="mt-6 rounded-lg border border-ufa-accent/50 bg-ufa-bg/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-ufa-accent font-medium">
                {t.yourMatch} ·{' '}
                {playerFix.competition === 'cup' ? t.competitionCup : t.competitionLeague}
                {(() => {
                  const v = venueMarkerForTeam(playerFix, league.playerTeamId)
                  return v ? ` · ${v}` : ''
                })()}
              </p>
              <p className="text-ufa-text font-semibold mt-1">
                {names[playerFix.homeTeamId]} vs {names[playerFix.awayTeamId]}
              </p>
              <p className="text-xs text-ufa-muted mt-1">{playerFix.date}</p>
            </div>
            <button
              type="button"
              onClick={() => onPlayFixture(playerFix)}
              className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
            >
              {t.goToMatch}
            </button>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ufa-text mb-2">{t.todaysMatches}</h3>
          {todayFixtures.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noMatchesToday}</p>
          ) : (
            <ul className="space-y-2">
              {todayFixtures.map((f) => {
                const done = f.status === 'completed'
                const isYours =
                  f.homeTeamId === league.playerTeamId ||
                  f.awayTeamId === league.playerTeamId
                const venue = isYours ? venueMarkerForTeam(f, league.playerTeamId) : null
                return (
                  <li
                    key={f.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                      isYours
                        ? 'border-ufa-accent/40 bg-ufa-accent/5'
                        : 'border-ufa-border bg-ufa-bg/50'
                    }`}
                  >
                    <span className="text-ufa-text">
                      {names[f.homeTeamId] ?? 'TBD'} vs {names[f.awayTeamId] ?? 'TBD'}
                      {venue && (
                        <span className="ml-2 text-[10px] font-semibold text-ufa-muted">
                          ({venue})
                        </span>
                      )}
                      {f.competition === 'cup' && (
                        <span className="ml-2 text-xs text-ufa-gold">{t.cupTag}</span>
                      )}
                    </span>
                    <span className="text-ufa-muted tabular-nums">
                      {done ? `${f.homeScore}:${f.awayScore}` : '—'}
                      {!done && isYours && (
                        <button
                          type="button"
                          className="ml-3 text-ufa-accent hover:underline"
                          onClick={() => onPlayFixture(f)}
                        >
                          {t.play}
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <LeagueStandingsView league={league} compact topN={8} onTeamSelect={onTeamSelect} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CalendarTile league={league} onNavigate={onNavigate} />
            <CupTile league={league} onNavigate={onNavigate} />
          </div>
        </div>
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4">
          <h3 className="font-semibold text-ufa-text text-sm mb-3">{t.shortcuts}</h3>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-wide text-ufa-muted pt-1">{t.catHome}</p>
            <button
              type="button"
              onClick={() => onNavigate('inbox')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutInbox}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('match')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutNextMatch}
            </button>

            <p className="text-[10px] uppercase tracking-wide text-ufa-muted pt-2">{t.catTeam}</p>
            <button
              type="button"
              onClick={() => onNavigate('tactics')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutTactics}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('roster')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutRoster}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('training')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutTraining}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('club-board')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutClubBoard}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('team-schedule')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutTeamSchedule}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutCalendar}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('club-transfers')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutTransfers}
              {transferWindow.open ? t.windowOpen : ''} →
            </button>

            <p className="text-[10px] uppercase tracking-wide text-ufa-muted pt-2">{t.catSeason}</p>
            <button
              type="button"
              onClick={() => onNavigate('standings')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutStandings}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('league-schedule')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutLeagueSchedule}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('leaders')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutLeaders}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('league-transfers')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutLeagueTransfers}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('cup')}
              className="text-left text-sm text-ufa-gold hover:underline"
            >
              {t.shortcutCup}
            </button>

            <p className="text-[10px] uppercase tracking-wide text-ufa-muted pt-2">{t.catNews}</p>
            <button
              type="button"
              onClick={() => onNavigate('ultiworld')}
              className="text-left text-sm text-ufa-accent hover:underline"
            >
              {t.shortcutNews}
            </button>
          </div>
          <p className="mt-4 text-xs text-ufa-muted">
            {t.yourTeam}: <span className="text-ufa-text">{playerTeamName}</span>
          </p>
          <p className="text-xs text-ufa-muted mt-1">
            {t.place}:{' '}
            {table.findIndex((r) => r.teamId === league.playerTeamId) + 1 || '—'} ·{' '}
            {league.standings[league.playerTeamId]?.wins ?? 0}-
            {league.standings[league.playerTeamId]?.losses ?? 0}
            {reputation != null && (
              <>
                {' · '}
                {t.reputation}:{' '}
                <span className={`font-semibold tabular-nums ${reputationToneClass(reputation)}`}>
                  {reputation}
                </span>
              </>
            )}
            {fans != null && (
              <>
                {' · '}
                {t.fans}:{' '}
                <span className="font-semibold tabular-nums text-ufa-accent">
                  {formatFanSize(fans.size, lang)}
                </span>
                {' · '}
                {t.fanMood}:{' '}
                <span className={`font-semibold tabular-nums ${fanMoodToneClass(fans.mood)}`}>
                  {fans.mood}
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-ufa-muted mt-2">{t.homeBonus}</p>
        </div>
      </div>
    </div>
  )
}
