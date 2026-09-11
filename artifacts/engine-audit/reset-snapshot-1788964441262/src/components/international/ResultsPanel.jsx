import { useState } from 'react'
import { academyCountryLabel } from '../../data/academyScoutGeography.js'

function GroupTable({ group, t, lang }) {
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ufa-muted">
        {t.groupLabel(group.id)}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ufa-muted">
            <th className="pb-1 text-left font-normal">{t.standingsHeaders.team}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.w}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.l}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.diff}</th>
          </tr>
        </thead>
        <tbody>
          {group.table.map((row) => (
            <tr key={row.countryId} className="text-ufa-text">
              <td className="py-0.5">{academyCountryLabel(row.countryId, lang)}</td>
              <td className="py-0.5 text-right tabular-nums">{row.wins}</td>
              <td className="py-0.5 text-right tabular-nums">{row.losses}</td>
              <td className="py-0.5 text-right tabular-nums">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultDetail({ entry, t, lang }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ufa-gold/30 bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <p className="text-xs uppercase tracking-wide text-ufa-gold">
          {t.kind[entry.kind] ?? entry.kind} {entry.year}
        </p>
        <p className="mt-1 text-lg font-semibold text-ufa-text">
          {t.championBanner(academyCountryLabel(entry.championCountryId, lang))}
        </p>
        {entry.runnerUpCountryId && (
          <p className="mt-1 text-sm text-ufa-muted">
            {t.round.final}: {academyCountryLabel(entry.runnerUpCountryId, lang)}
          </p>
        )}
        {entry.bronzeCountryId && (
          <p className="mt-1 text-sm text-ufa-muted">
            {t.bronzeBanner(academyCountryLabel(entry.bronzeCountryId, lang))}
          </p>
        )}
        {entry.finalScore && (
          <p className="mt-2 text-sm text-ufa-text">
            {t.finalScore}: {academyCountryLabel(entry.finalScore.homeCountryId, lang)}{' '}
            {entry.finalScore.homeScore}:{entry.finalScore.awayScore}{' '}
            {academyCountryLabel(entry.finalScore.awayCountryId, lang)}
          </p>
        )}
      </div>

      {!!entry.groups?.length && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ufa-text">{t.groupTable}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {entry.groups.map((group) => (
              <GroupTable key={group.id} group={group} t={t} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Faza E planu "International Competition": list+detail nad `nt.history` (rozszerzony
 * kształt entry — patrz `nationalTeamSeason.js`: buildTournamentHistoryEntry). */
export default function ResultsPanel({ career, t, lang }) {
  const history = [...(career?.nationalTeams?.history ?? [])].sort((a, b) => b.year - a.year)
  const [filterKind, setFilterKind] = useState('all')
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!history.length) {
    return (
      <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center">
        <p className="mx-auto max-w-md text-sm text-ufa-muted">{t.resultsEmpty}</p>
      </div>
    )
  }

  const filtered = history.filter((e) => filterKind === 'all' || e.kind === filterKind)
  const selected = filtered[selectedIndex] ?? filtered[0] ?? null

  const filters = [
    { id: 'all', label: t.resultsFilterAll },
    { id: 'euro', label: t.kindShort.euro },
    { id: 'world', label: t.kindShort.world },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilterKind(f.id)
                setSelectedIndex(0)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterKind === f.id ? 'bg-ufa-accent text-ufa-bg' : 'bg-ufa-bg text-ufa-muted hover:text-ufa-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {filtered.map((entry, i) => (
            <li key={`${entry.year}-${entry.kind}`}>
              <button
                type="button"
                onClick={() => setSelectedIndex(i)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  entry === selected
                    ? 'border-ufa-gold/50 bg-ufa-gold/10'
                    : 'border-ufa-border bg-ufa-panel hover:border-ufa-accent/40'
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                  {entry.year} · {t.kindShort[entry.kind] ?? entry.kind}
                </p>
                <p className="mt-0.5 truncate text-ufa-text">
                  {academyCountryLabel(entry.championCountryId, lang)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!selected ? (
          <p className="text-sm text-ufa-muted">{t.pickResult}</p>
        ) : (
          <ResultDetail entry={selected} t={t} lang={lang} />
        )}
      </div>
    </div>
  )
}
