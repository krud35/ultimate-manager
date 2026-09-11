import { useMemo, useState } from 'react'
import { academyCountryLabel } from '../../data/academyScoutGeography.js'
import { countryIdFromPseudoTeamId } from '../../career/nationalTeamQualifying.js'

/** Sumuje `playerStatsSnapshot` (patrz `nationalTeamSeason.js`: buildTournamentHistoryEntry)
 * ze wszystkich zakończonych turniejów tej kariery, opcjonalnie filtrowane po `kind`. */
function mergeHistoryPlayerStats(history, kindFilter) {
  const merged = {}
  for (const entry of history) {
    if (kindFilter !== 'all' && entry.kind !== kindFilter) continue
    for (const row of Object.values(entry.playerStatsSnapshot ?? {})) {
      const existing = merged[row.playerId]
      if (!existing) {
        merged[row.playerId] = { ...row }
      } else {
        existing.goals += row.goals ?? 0
        existing.assists += row.assists ?? 0
        existing.blocks += row.blocks ?? 0
        existing.turnovers += row.turnovers ?? 0
        existing.games = (existing.games ?? 0) + (row.games ?? 0)
      }
    }
  }
  return merged
}

function topBy(rows, key, limit = 10) {
  return Object.values(rows)
    .filter((r) => (r[key] ?? 0) > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, limit)
}

function LeaderColumn({ title, rows, valueKey, lang, emptyLabel }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <h3 className="mb-3 text-sm font-semibold text-ufa-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ufa-muted">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center justify-between gap-2 text-sm">
              <span className="w-5 tabular-nums text-ufa-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-ufa-text">
                {row.firstName} {row.lastName}
                <span className="ml-1 text-xs text-ufa-muted">
                  ({academyCountryLabel(countryIdFromPseudoTeamId(row.teamId), lang)})
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ufa-accent">{row[valueKey]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function LeadersPanel({ career, t, lang }) {
  const rawHistory = career?.nationalTeams?.history
  const [kindFilter, setKindFilter] = useState('all')
  const history = useMemo(() => rawHistory ?? [], [rawHistory])
  const merged = useMemo(() => mergeHistoryPlayerStats(history, kindFilter), [history, kindFilter])

  if (!history.length) {
    return (
      <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center">
        <p className="mx-auto max-w-md text-sm text-ufa-muted">{t.leadersEmpty}</p>
      </div>
    )
  }

  const filters = [
    { id: 'all', label: t.resultsFilterAll },
    { id: 'euro', label: t.kindShort.euro },
    { id: 'world', label: t.kindShort.world },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <p className="text-sm text-ufa-muted">{t.leadersHint}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setKindFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                kindFilter === f.id ? 'bg-ufa-accent text-ufa-bg' : 'bg-ufa-bg text-ufa-muted hover:text-ufa-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <LeaderColumn title={t.goals} rows={topBy(merged, 'goals')} valueKey="goals" lang={lang} emptyLabel={t.noData} />
        <LeaderColumn
          title={t.assists}
          rows={topBy(merged, 'assists')}
          valueKey="assists"
          lang={lang}
          emptyLabel={t.noData}
        />
        <LeaderColumn title={t.blocks} rows={topBy(merged, 'blocks')} valueKey="blocks" lang={lang} emptyLabel={t.noData} />
        <LeaderColumn
          title={t.turnovers}
          rows={topBy(merged, 'turnovers')}
          valueKey="turnovers"
          lang={lang}
          emptyLabel={t.noData}
        />
      </div>
    </div>
  )
}
