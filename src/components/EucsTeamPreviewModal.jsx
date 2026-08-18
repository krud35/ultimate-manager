import { useMemo } from 'react'
import { eucsTeamHistory, eucsTeamRosterPreview } from '../data/eucsLeagueTeams.js'

const RESULT_ORDER = { champion: 0, 'runner-up': 1, semifinalist: 2, spirit: 3 }

const RESULT_BADGE_CLASS = {
  champion: 'bg-ufa-gold/20 text-ufa-gold',
  'runner-up': 'bg-ufa-accent/20 text-ufa-accent',
  semifinalist: 'bg-ufa-panel-hover text-ufa-text',
  spirit: 'bg-emerald-500/20 text-emerald-400',
}

function resultLabel(result, t) {
  switch (result) {
    case 'champion':
      return t.eucsResultChampion
    case 'runner-up':
      return t.eucsResultRunnerUp
    case 'semifinalist':
      return t.eucsResultSemifinalist
    case 'spirit':
      return t.eucsResultSpirit
    default:
      return result
  }
}

/**
 * Lekki podgląd klubu Ligi Europejskiej — TYLKO nazwiska+numery (bez statystyk/OVR,
 * bo składy są losowe) i realna historia klubu w finałach EUCF.
 */
export default function EucsTeamPreviewModal({ team, t, anchorTop = null, onClose, onSelect }) {
  const roster = useMemo(() => (team ? eucsTeamRosterPreview(team.id) : []), [team])
  const history = useMemo(() => {
    if (!team) return []
    return [...eucsTeamHistory(team.id)].sort(
      (a, b) => b.year - a.year || RESULT_ORDER[a.result] - RESULT_ORDER[b.result],
    )
  }, [team])

  if (!team) return null

  // Otwórz panel na wysokości klikniętej karty (żeby nie trzeba było przewijać). Panel
  // jest `position: fixed`, więc cokolwiek wystaje poniżej viewportu jest nieosiągalne —
  // przewijanie strony w tle nim nie rusza. Dlatego liczymy `top` i `maxHeight` razem:
  // maxHeight = dokładnie tyle miejsca ile zostaje do dołu viewportu; jeśli przy naturalnej
  // pozycji zostałoby za mało (< MIN_USABLE_HEIGHT), podciągamy panel wyżej.
  const MARGIN = 16
  const MIN_USABLE_HEIGHT = 360
  let panelTop = null
  let panelMaxHeight = null
  if (anchorTop != null && typeof window !== 'undefined') {
    const desiredTop = Math.max(MARGIN, anchorTop - 20)
    const availableBelow = window.innerHeight - desiredTop - MARGIN
    if (availableBelow < MIN_USABLE_HEIGHT) {
      panelTop = Math.max(MARGIN, window.innerHeight - MIN_USABLE_HEIGHT - MARGIN)
    } else {
      panelTop = desiredTop
    }
    panelMaxHeight = window.innerHeight - panelTop - MARGIN
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={team.name}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t.previewClose}
        onClick={onClose}
      />
      <div
        className={`absolute z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-t-xl border border-ufa-border bg-ufa-panel shadow-2xl sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-xl ${
          panelTop == null ? 'inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit' : ''
        }`}
        style={
          panelTop != null
            ? { top: panelTop, maxHeight: panelMaxHeight, left: '50%', transform: 'translateX(-50%)' }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-3 border-b border-ufa-border px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: team.primaryColor }}
            >
              {team.shortName}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ufa-text truncate">{team.name}</h2>
              <p className="text-xs text-ufa-muted">{t.rosterCount(roster.length)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-muted hover:text-ufa-text"
          >
            {t.previewClose}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
              {t.eucsPreviewHistory}
            </h3>
            {history.length ? (
              <>
                <ul className="flex flex-wrap gap-2">
                  {history.map((h, i) => (
                    <li
                      key={`${h.year}-${h.result}-${i}`}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        RESULT_BADGE_CLASS[h.result] ?? 'text-ufa-text'
                      }`}
                    >
                      {h.year} · {resultLabel(h.result, t)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-ufa-muted">{t.eucsPreviewSource}</p>
              </>
            ) : (
              <p className="text-sm text-ufa-muted">{t.eucsPreviewNoHistory}</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
              {t.eucsPreviewRoster}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-ufa-border">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-ufa-muted bg-ufa-bg/60">
                  <tr className="border-b border-ufa-border">
                    <th className="px-2 py-2 font-medium w-10">#</th>
                    <th className="px-2 py-2 font-medium">{t.previewPlayer}</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p, i) => (
                    <tr key={i} className="border-b border-ufa-border/60 hover:bg-ufa-bg/40">
                      <td className="px-2 py-1.5 tabular-nums text-ufa-muted">{p.jersey || '—'}</td>
                      <td className="px-2 py-1.5 font-medium text-ufa-text whitespace-nowrap">
                        {p.firstName} {p.lastName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-ufa-border px-5 py-3">
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(team.id)}
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
            >
              {t.previewSelect}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-muted hover:text-ufa-text"
          >
            {t.previewClose}
          </button>
        </div>
      </div>
    </div>
  )
}
