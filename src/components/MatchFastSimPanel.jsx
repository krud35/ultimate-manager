/**
 * Szybka symulacja reszty meczu — punkt po punkcie, bez boiska.
 * Pasek postępu, kto zdobył punkt, tempo, pauza / wznowienie / przerwanie.
 */

import { MATCH_CONFIG } from '../matchEngine'
import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'

export const FAST_SIM_SPEED_OPTIONS = [1, 2, 4, 8]

/** Bazowy odstęp między punktami przy 1× (ms). */
export const FAST_SIM_BASE_DELAY_MS = 200

export function fastSimDelayMs(speed) {
  const s = Number(speed) > 0 ? Number(speed) : 1
  return Math.max(0, Math.round(FAST_SIM_BASE_DELAY_MS / s))
}

export default function MatchFastSimPanel({
  homeName,
  awayName,
  homeScore = 0,
  awayScore = 0,
  pointsToWin = MATCH_CONFIG.pointsToWin,
  lastPoint = null,
  paused = false,
  finished = false,
  speed = 2,
  onSpeedChange = null,
  onPause,
  onResume,
  onStop,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const leader = Math.max(homeScore, awayScore)
  const pct = Math.max(0, Math.min(100, Math.round((leader / Math.max(1, pointsToWin)) * 100)))
  const pointsPlayed = homeScore + awayScore
  const scorerName =
    lastPoint?.scoringTeam === 'home'
      ? homeName
      : lastPoint?.scoringTeam === 'away'
        ? awayName
        : null

  return (
    <div className="rounded-xl border border-ufa-accent/40 bg-ufa-panel p-5 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">
            {t.fastSimTitle}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ufa-text">
            {finished ? t.matchFinished : paused ? t.paused : t.pointByPoint}
          </h3>
        </div>
        {!finished && (
          <div className="flex flex-wrap gap-2">
            {paused ? (
              <button
                type="button"
                onClick={onResume}
                className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
              >
                {t.resume}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
              >
                {t.pause}
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20"
            >
              {t.abort}
            </button>
          </div>
        )}
      </div>

      {onSpeedChange && !finished && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ufa-muted">{t.tempo}</span>
          {FAST_SIM_SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums ${
                speed === s
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'border border-ufa-border text-ufa-muted hover:bg-ufa-panel-hover'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-6 rounded-lg bg-ufa-bg/80 py-4 ring-1 ring-ufa-border">
        <div className="text-center min-w-[5rem]">
          <p className="text-xs font-medium text-ufa-muted truncate max-w-[9rem]">{homeName}</p>
          <p className="text-3xl font-black tabular-nums text-ufa-text">{homeScore}</p>
        </div>
        <span className="text-xl text-ufa-muted">:</span>
        <div className="text-center min-w-[5rem]">
          <p className="text-xs font-medium text-ufa-muted truncate max-w-[9rem]">{awayName}</p>
          <p className="text-3xl font-black tabular-nums text-ufa-text">{awayScore}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ufa-muted tabular-nums">
          <span>{t.toWin(pointsToWin, pointsPlayed)}</span>
          <span>{pct}%</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-ufa-bg ring-1 ring-ufa-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t.progress}
        >
          <div
            className="h-full rounded-full bg-ufa-accent transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {scorerName && lastPoint ? (
        <p className="mt-4 rounded-lg border border-ufa-border bg-ufa-bg/60 px-3 py-2.5 text-sm text-ufa-text">
          <span className="text-ufa-muted">{t.pointN(lastPoint.pointIndex)}</span>{' '}
          <span className="font-semibold text-ufa-gold">{scorerName}</span>
          {lastPoint.throws != null ? (
            <span className="text-ufa-muted"> · {t.throws(lastPoint.throws)}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-4 text-sm text-ufa-muted">{t.simStarting}</p>
      )}

      {paused && !finished ? (
        <p className="mt-3 text-xs text-ufa-muted">{t.abortHint}</p>
      ) : null}
    </div>
  )
}
