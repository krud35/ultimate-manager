import { createPortal } from 'react-dom'
import { MATCH_CONFIG } from '../../matchEngine'
import { completionRate } from '../../matchEngine/matchStats.js'

/**
 * Ekran auto-symulacji do końca meczu — punkt po punkcie, pełnym silnikiem.
 *
 * To jest ekran ładowania wyniku końcowego, nie panel decyzyjny: gracz nic tu nie
 * wybiera, tylko widzi, jak mecz się rozgrywa. Stąd brak okna taktyk i brak przycisków
 * poza przerwaniem.
 */
function StatRow({ label, home, away }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm tabular-nums">
      <span className="w-14 text-right font-semibold text-ufa-text">{home}</span>
      <span className="flex-1 text-center text-xs uppercase tracking-wide text-ufa-muted">
        {label}
      </span>
      <span className="w-14 font-semibold text-ufa-text">{away}</span>
    </div>
  )
}

/** Zdobywca punktu i asystujący z TEGO punktu — oznaczeni w siódemce, która była na
 *  boisku. Punkt z limitu rzutów nie ma ani jednego, ani drugiego. */
function Mark({ kind, labels }) {
  const isGoal = kind === 'goal'
  return (
    <span
      title={isGoal ? labels.goal : labels.assist}
      className={`ml-1 rounded px-1 text-[10px] font-bold ${
        isGoal ? 'bg-ufa-accent text-black' : 'bg-ufa-border text-ufa-text'
      }`}
    >
      {isGoal ? labels.goalShort : labels.assistShort}
    </span>
  )
}

function Seven({ name, players, align, scorerId, assistId, labels }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ufa-muted">
        {name ?? ''}
      </p>
      <ul className="space-y-0.5">
        {(players ?? []).length === 0 ? (
          <li className="text-xs text-ufa-muted">—</li>
        ) : (
          players.map((p) => (
            <li
              key={p.id}
              className={`truncate text-xs ${
                p.id === scorerId || p.id === assistId
                  ? 'font-semibold text-ufa-text'
                  : 'text-ufa-text'
              }`}
            >
              {p.jersey != null && (
                <span className="mr-1 text-ufa-muted tabular-nums">{p.jersey}</span>
              )}
              {p.name}
              {p.id === scorerId && <Mark kind="goal" labels={labels} />}
              {p.id === assistId && <Mark kind="assist" labels={labels} />}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export default function AutoSimOverlay({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  pointsPlayed,
  stats,
  homeSeven,
  awaySeven,
  scorerId,
  assistId,
  onStop,
  labels,
}) {
  const h = stats?.home
  const a = stats?.away
  const pct = Math.max(0, Math.min(100, Math.round(
    (Math.max(homeScore, awayScore) / Math.max(1, MATCH_CONFIG.pointsToWin)) * 100,
  )))
  // PORTAL do <body>: przodek <main> ma `transform`, przez co staje się blokiem
  // zawierającym dla position:fixed — bez portalu okno wymiarowało się do niego
  // (zmierzone: 552x4648 px zamiast okna przeglądarki) i nie było widoczne na ekranie.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[2px]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-busy="true"
      aria-label={labels.title}
    >
      <div className="w-full max-w-lg rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-2xl shadow-black/50">
        <p className="text-xs uppercase tracking-wide text-ufa-muted">{labels.title}</p>

        <div className="mt-3 flex items-end justify-between gap-4">
          <span className="min-w-0 flex-1 truncate text-sm text-ufa-text">{homeTeam?.name}</span>
          <span className="text-3xl font-bold tabular-nums text-ufa-text">
            {homeScore} <span className="text-ufa-muted">—</span> {awayScore}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-sm text-ufa-text">
            {awayTeam?.name}
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ufa-bg ring-1 ring-ufa-border">
          <div
            className="h-full rounded-full bg-ufa-accent transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-center text-xs text-ufa-muted tabular-nums">
          {labels.pointsPlayed(pointsPlayed)}
        </p>

        <div className="mt-4 border-t border-ufa-border pt-3">
          <StatRow label={labels.completion} home={`${completionRate(h).toFixed(0)}%`} away={`${completionRate(a).toFixed(0)}%`} />
          <StatRow label={labels.throws} home={h?.throwAttempts ?? 0} away={a?.throwAttempts ?? 0} />
          <StatRow label={labels.turnovers} home={h?.turnovers?.length ?? 0} away={a?.turnovers?.length ?? 0} />
          <StatRow label={labels.hucks} home={h?.huckAttempts ?? 0} away={a?.huckAttempts ?? 0} />
          <StatRow label={labels.yards} home={Math.round(h?.totalYards ?? 0)} away={Math.round(a?.totalYards ?? 0)} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-ufa-border pt-3">
          <Seven
            name={homeTeam?.name}
            players={homeSeven}
            scorerId={scorerId}
            assistId={assistId}
            labels={labels}
          />
          <Seven
            name={awayTeam?.name}
            players={awaySeven}
            align="right"
            scorerId={scorerId}
            assistId={assistId}
            labels={labels}
          />
        </div>

        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="mt-4 w-full rounded-md border border-ufa-border px-3 py-2 text-sm text-ufa-muted hover:text-ufa-text"
          >
            {labels.stop}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
