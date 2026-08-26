import { useMemo } from 'react'
import { teamNameMap, standingsTable, getFixturesOnDate } from '../../league'
import { useUiLang } from '../../ui/UiLangContext'
import { matchStrings } from '../../ui/strings/match'

const STANDINGS_ROWS = 8

/** Ekran po szatni pomeczowej — wyniki dnia + aktualna tabela ligowa. */
export default function RoundResultsView({ league, fixture, playerTeamId, onContinue }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  const names = useMemo(() => (league ? teamNameMap(league, lang) : {}), [league, lang])
  const table = useMemo(
    () => (league ? standingsTable(league.standings ?? {}, (id) => names[id] ?? id) : []),
    [league, names],
  )
  const dayFixtures = useMemo(
    () => (league && fixture?.date ? getFixturesOnDate(league, fixture.date) : []),
    [league, fixture?.date],
  )
  const playerPlace = table.findIndex((r) => r.teamId === playerTeamId) + 1 || null

  return (
    <div className="space-y-4 league-fade-in">
      <div className="rounded-xl border border-ufa-accent/35 bg-ufa-panel p-5 text-center shadow-xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">
          {t.roundResultsTitle}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
          <p className="border-b border-ufa-border px-4 py-3 text-sm font-semibold text-ufa-text">
            {t.roundResultsFixtures}
          </p>
          <ul className="divide-y divide-ufa-border/40">
            {dayFixtures.map((f) => {
              const isYours = f.id === fixture?.id
              const done = f.status === 'completed'
              return (
                <li
                  key={f.id}
                  className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${
                    isYours ? 'bg-ufa-accent/5' : ''
                  }`}
                >
                  <span className={isYours ? 'font-semibold text-ufa-text' : 'text-ufa-text'}>
                    {names[f.homeTeamId] ?? f.homeTeamId} vs {names[f.awayTeamId] ?? f.awayTeamId}
                  </span>
                  <span className="shrink-0 tabular-nums text-ufa-muted">
                    {done ? `${f.homeScore}:${f.awayScore}` : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
          <p className="border-b border-ufa-border px-4 py-3 text-sm font-semibold text-ufa-text">
            {t.roundResultsStandings}
          </p>
          <ul className="divide-y divide-ufa-border/40">
            {table.slice(0, STANDINGS_ROWS).map((row, i) => (
              <li
                key={row.teamId}
                className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${
                  row.teamId === playerTeamId ? 'bg-ufa-accent/5 font-semibold text-ufa-text' : ''
                }`}
              >
                <span className="min-w-0 truncate text-ufa-text">
                  <span className="mr-2 tabular-nums text-ufa-muted">{i + 1}.</span>
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums text-ufa-muted">
                  {row.wins}-{row.losses}
                </span>
              </li>
            ))}
          </ul>
          {playerPlace && playerPlace > STANDINGS_ROWS ? (
            <p className="px-4 py-2 text-xs text-ufa-muted">
              {t.roundResultsYourPlace(playerPlace)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md bg-ufa-accent px-6 py-2.5 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
        >
          {t.roundResultsContinue}
        </button>
      </div>
    </div>
  )
}
