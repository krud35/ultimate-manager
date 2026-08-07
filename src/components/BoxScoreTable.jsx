import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'

export function BoxScoreTable({ rows, homeTeamName, awayTeamName, variant = 'full' }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  if (!rows?.length && variant === 'full') return null

  const isScorers = variant === 'scorers'
  const title = isScorers ? t.boxScorersTitle : t.boxStatsTitle
  const subtitle = isScorers ? t.boxScorersSubtitle : t.boxStatsSubtitle

  const teamLabel = (teamId) =>
    teamId === 'home' ? homeTeamName : teamId === 'away' ? awayTeamName : '—'

  if (isScorers && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/40 px-6 py-8 text-center text-sm text-ufa-muted">
        {t.boxScorersEmpty}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
      <div className="border-b border-ufa-border px-6 py-4">
        <h3 className="font-semibold text-ufa-text">{title}</h3>
        <p className="text-xs text-ufa-muted mt-1">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ufa-border bg-ufa-bg/80 text-xs uppercase tracking-wider text-ufa-muted">
              <th className="px-4 py-3 font-medium">{t.playerCol}</th>
              <th className="px-3 py-3 font-medium">{t.teamCol}</th>
              <th className="px-3 py-3 font-medium text-center">G</th>
              {!isScorers && (
                <>
                  <th className="px-3 py-3 font-medium text-center">A</th>
                  <th className="px-3 py-3 font-medium text-center">B</th>
                  <th className="px-3 py-3 font-medium text-center">TO</th>
                  <th
                    className="px-4 py-3 font-medium text-center"
                    title={t.ppTitle}
                  >
                    PP
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ufa-border">
            {rows.map((row) => (
              <tr key={row.playerId} className="hover:bg-ufa-panel-hover">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {row.firstName} {row.lastName}
                </td>
                <td className="px-3 py-2.5 text-ufa-muted text-xs whitespace-nowrap">
                  {teamLabel(row.teamId)}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums font-medium text-ufa-accent">
                  {row.goals}
                </td>
                {!isScorers && (
                  <>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.assists}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.blocks}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-orange-300/90">
                      {row.turnovers}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-200">
                      {row.pointsPlayed ?? 0}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
