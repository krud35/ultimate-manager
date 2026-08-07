import { useMemo } from 'react'
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
      className={`ml-2 inline-flex min-w-[1.35rem] justify-center rounded border border-current/25 px-1 text-[10px] font-semibold tabular-nums ${tone}`}
      title={marker === 'H' ? 'Home' : marker === 'A' ? 'Away' : 'Neutral'}
    >
      {marker}
    </span>
  )
}

function FixtureRow({ f, names, playerTeamId, round, currentRound, onPlayFixture, t }) {
  const done = f.status === 'completed'
  const isPlayer = f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm ${
        isPlayer ? 'bg-ufa-accent/5' : ''
      }`}
    >
      <span className="text-ufa-text flex flex-wrap items-center">
        <span className={f.homeTeamId === playerTeamId ? 'font-semibold text-ufa-accent' : ''}>
          {names[f.homeTeamId]}
        </span>
        <span className="text-ufa-muted mx-2">vs</span>
        <span className={f.awayTeamId === playerTeamId ? 'font-semibold text-ufa-accent' : ''}>
          {names[f.awayTeamId]}
        </span>
        {isPlayer && <VenueTag fixture={f} playerTeamId={playerTeamId} />}
        {f.competition === 'cup' ? (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-ufa-gold">{t.cup}</span>
        ) : null}
      </span>
      <span className="tabular-nums text-ufa-muted">
        {f.date && !done && <span className="mr-2 text-[10px]">{f.date.slice(5)}</span>}
        {done ? (
          <span className="text-ufa-text font-medium">
            {f.homeScore}:{f.awayScore}
            {f.playedByPlayer && (
              <span className="ml-2 text-[10px] text-ufa-accent">{t.you}</span>
            )}
          </span>
        ) : round != null && round < currentRound ? (
          '—'
        ) : round != null && round > currentRound ? (
          t.scheduled
        ) : !done && isPlayer && onPlayFixture ? (
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
export default function LeagueScheduleView({
  league,
  onPlayFixture,
  scope = 'league',
}) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const names = teamNameMap(league, lang)
  const isTeam = scope === 'team'

  const teamFixtures = useMemo(() => {
    if (!isTeam) return []
    const pid = league.playerTeamId
    return (league.fixtures ?? [])
      .filter((f) => f.homeTeamId === pid || f.awayTeamId === pid)
      .sort(
        (a, b) =>
          String(a.date ?? '').localeCompare(String(b.date ?? '')) ||
          (a.round ?? 0) - (b.round ?? 0),
      )
  }, [isTeam, league.fixtures, league.playerTeamId])

  if (isTeam) {
    const upcoming = teamFixtures.filter((f) => f.status !== 'completed')
    const nextPlayable = upcoming.find(
      (f) => f.homeTeamId && f.awayTeamId && (!f.date || f.date >= league.currentDate),
    )

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ufa-text">{t.scheduleTeam}</h2>
              <p className="mt-1 text-sm text-ufa-muted">
                {t.scheduleTeamHint(league.currentDate)}
              </p>
            </div>
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
        <h2 className="text-lg font-semibold text-ufa-text">{t.scheduleLeague}</h2>
        <p className="mt-1 text-sm text-ufa-muted">
          {t.scheduleLeagueHint(league.totalRounds, league.currentDate)}
        </p>
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
