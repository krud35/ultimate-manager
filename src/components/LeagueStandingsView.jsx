import { standingsTable, teamNameMap } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'

export function LeagueStandingsView({ league, compact = false, topN = 8, onTeamSelect = null }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const names = teamNameMap(league, lang)
  const rows = standingsTable(league.standings, (id) => names[id])
  const display = compact ? rows.slice(0, topN) : rows

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
      <div className="border-b border-ufa-border px-6 py-4">
        <h3 className="font-semibold text-ufa-text">{t.standingsTitle}</h3>
        {!compact && (
          <p className="text-xs text-ufa-muted mt-1">{t.standingsHint}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ufa-muted border-b border-ufa-border/60">
              <th className="text-left py-3 px-4 font-normal w-10">#</th>
              <th className="text-left py-3 px-4 font-normal">{t.team}</th>
              <th className="text-center py-3 px-3 font-normal">W</th>
              <th className="text-center py-3 px-3 font-normal">L</th>
              <th className="text-center py-3 px-3 font-normal">PF</th>
              <th className="text-center py-3 px-3 font-normal">PA</th>
              <th className="text-center py-3 px-3 font-normal">+/-</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, idx) => {
              const isPlayer = row.teamId === league.playerTeamId
              return (
                <tr
                  key={row.teamId}
                  className={`border-b border-ufa-border/40 ${
                    isPlayer ? 'bg-ufa-accent/10' : 'hover:bg-ufa-panel-hover/50'
                  }`}
                >
                  <td className="py-2.5 px-4 tabular-nums text-ufa-muted">{idx + 1}</td>
                  <td className="py-2.5 px-4 font-medium text-ufa-text">
                    {onTeamSelect ? (
                      <button
                        type="button"
                        onClick={() => onTeamSelect(row.teamId)}
                        className="hover:text-ufa-accent hover:underline text-left"
                      >
                        {row.teamName}
                      </button>
                    ) : (
                      row.teamName
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-ufa-text">{row.wins}</td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-ufa-text">{row.losses}</td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-ufa-muted">{row.pointsFor}</td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-ufa-muted">
                    {row.pointsAgainst}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-ufa-muted">
                    {row.pointsFor - row.pointsAgainst >= 0 ? '+' : ''}
                    {row.pointsFor - row.pointsAgainst}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default LeagueStandingsView
