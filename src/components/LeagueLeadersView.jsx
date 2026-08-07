import { topLeaders, teamNameMap } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'

function LeaderColumn({ title, rows, valueKey, teamNames, emptyLabel }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <h3 className="font-semibold text-ufa-text text-sm mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ufa-muted">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ufa-muted w-5 tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0 truncate text-ufa-text">
                {row.firstName} {row.lastName}
                <span className="text-xs text-ufa-muted ml-1">
                  ({teamNames[row.teamId]?.split(' ').pop()})
                </span>
              </span>
              <span className="font-semibold tabular-nums text-ufa-accent">{row[valueKey]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function LeagueLeadersView({ league }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const teamNames = teamNameMap(league, lang)
  const goals = topLeaders(league.playerStats, 'goals', 10)
  const assists = topLeaders(league.playerStats, 'assists', 10)
  const blocks = topLeaders(league.playerStats, 'blocks', 10)
  const pointsPlayed = topLeaders(league.playerStats, 'pointsPlayed', 10)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <h2 className="text-lg font-semibold text-ufa-text">{t.leadersTitle}</h2>
        <p className="mt-1 text-sm text-ufa-muted">{t.leadersHint}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <LeaderColumn
          title={`${t.goals} (G)`}
          rows={goals}
          valueKey="goals"
          teamNames={teamNames}
          emptyLabel={t.noData}
        />
        <LeaderColumn
          title={`${t.assists} (A)`}
          rows={assists}
          valueKey="assists"
          teamNames={teamNames}
          emptyLabel={t.noData}
        />
        <LeaderColumn
          title={`${t.blocks} (D)`}
          rows={blocks}
          valueKey="blocks"
          teamNames={teamNames}
          emptyLabel={t.noData}
        />
        <LeaderColumn
          title={`${t.pointsPlayed} (PP)`}
          rows={pointsPlayed}
          valueKey="pointsPlayed"
          teamNames={teamNames}
          emptyLabel={t.noData}
        />
      </div>
    </div>
  )
}
