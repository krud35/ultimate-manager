import { useMemo, useState } from 'react'
import { fixturesForRound, teamNameMap, venueMarkerForTeam } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'

function VenueTag({ fixture, playerTeamId }) {
  const marker = venueMarkerForTeam(fixture, playerTeamId)
  if (!marker) return null
  const tone =
    marker === 'H'
      ? 'text-emerald-300/90'
      : marker === 'A'
        ? 'text-sky-300/90'
        : 'text-ufa-gold'
  return (
    <span
      className={`inline-flex min-w-[1.35rem] justify-center rounded border border-current/25 px-1 text-[10px] font-semibold tabular-nums ${tone}`}
      title={marker === 'H' ? 'Home' : marker === 'A' ? 'Away' : 'Neutral'}
    >
      {marker}
    </span>
  )
}

function FixtureRow({ f, names, playerTeamId, round, currentRound, onPlayFixture, t }) {
  const done = f.status === 'completed'
  const homeIsPlayer = f.homeTeamId === playerTeamId
  const awayIsPlayer = f.awayTeamId === playerTeamId
  const isPlayer = homeIsPlayer || awayIsPlayer
  const canPlay = !done && isPlayer && onPlayFixture && !(round != null && round > currentRound)

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${
        isPlayer ? 'bg-ufa-accent/5' : ''
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate text-right ${
          homeIsPlayer ? 'font-semibold text-ufa-accent' : 'text-ufa-text'
        }`}
      >
        {names[f.homeTeamId]}
      </span>
      <span className="shrink-0 whitespace-nowrap px-1 text-center tabular-nums font-semibold text-ufa-text">
        {done ? (
          <>
            {f.homeScore} <span className="text-ufa-muted">-</span> {f.awayScore}
          </>
        ) : (
          <span className="text-ufa-muted">vs</span>
        )}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          awayIsPlayer ? 'font-semibold text-ufa-accent' : 'text-ufa-text'
        }`}
      >
        {names[f.awayTeamId]}
      </span>
      {isPlayer && <VenueTag fixture={f} playerTeamId={playerTeamId} />}
      {f.competition === 'cup' ? (
        <span className="text-[10px] uppercase tracking-wide text-ufa-gold">{t.cup}</span>
      ) : null}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums text-ufa-muted">
        {f.date && !done && <span className="mr-2 text-[10px]">{f.date.slice(5)}</span>}
        {done ? (
          f.playedByPlayer && <span className="text-ufa-accent">{t.you}</span>
        ) : round != null && round < currentRound ? (
          '—'
        ) : round != null && round > currentRound ? (
          t.scheduled
        ) : canPlay ? (
          <button
            type="button"
            className="text-ufa-accent hover:underline font-semibold"
            onClick={() => onPlayFixture(f)}
          >
            {t.play}
          </button>
        ) : (
          t.toPlay
        )}
      </span>
    </li>
  )
}

export default function LeagueScheduleView({ league, onPlayFixture }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const names = teamNameMap(league, lang)
  const [teamFilter, setTeamFilter] = useState('all')

  const teamOptions = useMemo(
    () => Object.entries(names).sort((a, b) => a[1].localeCompare(b[1])),
    [names],
  )

  const teamFixtures = useMemo(() => {
    if (teamFilter === 'all') return []
    return (league.fixtures ?? [])
      .filter((f) => f.homeTeamId === teamFilter || f.awayTeamId === teamFilter)
      .sort(
        (a, b) =>
          String(a.date ?? '').localeCompare(String(b.date ?? '')) ||
          (a.round ?? 0) - (b.round ?? 0),
      )
  }, [teamFilter, league.fixtures])

  const filterSelect = (
    <select
      value={teamFilter}
      onChange={(e) => setTeamFilter(e.target.value)}
      aria-label={t.teamFilter}
      className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-sm text-ufa-text"
    >
      <option value="all">{t.allTeams}</option>
      {teamOptions.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  )

  if (teamFilter !== 'all') {
    const isOwnTeam = teamFilter === league.playerTeamId
    const upcoming = teamFixtures.filter((f) => f.status !== 'completed')
    const nextPlayable = isOwnTeam
      ? upcoming.find(
          (f) => f.homeTeamId && f.awayTeamId && (!f.date || f.date >= league.currentDate),
        )
      : null

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ufa-text">
                {names[teamFilter] ?? t.scheduleTeam}
              </h2>
              <p className="mt-1 text-sm text-ufa-muted">
                {isOwnTeam ? t.scheduleTeamHint(league.currentDate) : t.scheduleLeague}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {filterSelect}
              {nextPlayable && (
                <button
                  type="button"
                  onClick={() => onPlayFixture(nextPlayable)}
                  className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
                >
                  {t.nextMatch}
                </button>
              )}
            </div>
          </div>
        </div>

        <section className="rounded-xl border border-ufa-border bg-ufa-panel overflow-hidden shadow-lg shadow-black/20">
          <ul className="divide-y divide-ufa-border/60">
            {teamFixtures.map((f) => (
              <FixtureRow
                key={f.id}
                f={f}
                names={names}
                playerTeamId={league.playerTeamId}
                round={f.round}
                currentRound={league.currentRound}
                onPlayFixture={onPlayFixture}
                t={t}
              />
            ))}
            {teamFixtures.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ufa-muted">{t.noFixtures}</li>
            )}
          </ul>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{t.scheduleLeague}</h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {t.scheduleLeagueHint(league.totalRounds, league.currentDate)}
            </p>
          </div>
          {filterSelect}
        </div>
      </div>

      {Array.from({ length: league.totalRounds }, (_, i) => i + 1).map((round) => {
        const fixtures = fixturesForRound(league, round)
        const isCurrent = round === league.currentRound
        const playerFix = fixtures.find(
          (f) =>
            f.homeTeamId === league.playerTeamId || f.awayTeamId === league.playerTeamId,
        )

        return (
          <section
            key={round}
            className={`rounded-xl border bg-ufa-panel overflow-hidden shadow-lg shadow-black/20 ${
              isCurrent ? 'border-ufa-accent/50 ring-1 ring-ufa-accent/30' : 'border-ufa-border'
            }`}
          >
            <div className="flex items-center justify-between border-b border-ufa-border px-5 py-3">
              <h3 className="font-semibold text-ufa-text">
                {t.round(round)}
                {fixtures[0]?.date && (
                  <span className="ml-2 text-xs font-normal text-ufa-muted">
                    ({fixtures[0].date}
                    {fixtures[fixtures.length - 1]?.date !== fixtures[0]?.date
                      ? `–${fixtures[fixtures.length - 1].date}`
                      : ''}
                    )
                  </span>
                )}
                {isCurrent && (
                  <span className="ml-2 text-xs font-normal text-ufa-accent">{t.current}</span>
                )}
              </h3>
              {playerFix && playerFix.status !== 'completed' && round === league.currentRound && (
                <button
                  type="button"
                  onClick={() => onPlayFixture(playerFix)}
                  className="rounded-md bg-ufa-accent px-4 py-1.5 text-xs font-semibold text-ufa-bg hover:opacity-90"
                >
                  {t.yourMatch}
                </button>
              )}
            </div>
            <ul className="divide-y divide-ufa-border/60">
              {fixtures.map((f) => (
                <FixtureRow
                  key={f.id}
                  f={f}
                  names={names}
                  playerTeamId={league.playerTeamId}
                  round={round}
                  currentRound={league.currentRound}
                  onPlayFixture={onPlayFixture}
                  t={t}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
