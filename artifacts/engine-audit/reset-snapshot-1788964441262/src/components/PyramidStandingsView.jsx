import { standingsTable, teamNameMap } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'
import { resolveTeamName } from '../ui/locale'

function zoneForRow(tier, idx, total) {
  if (tier !== 1) {
    if (idx < 2) return 'promote'
    if (idx < 6) return 'playoff'
  }
  if (tier !== 3 && idx >= total - 3) return 'relegate'
  return null
}

const ZONE_ROW_CLASS = {
  promote: 'bg-emerald-500/10',
  playoff: 'bg-ufa-gold/10',
  relegate: 'bg-red-500/10',
}

const ZONE_DOT_CLASS = {
  promote: 'bg-emerald-400',
  playoff: 'bg-ufa-gold',
  relegate: 'bg-red-400',
}

function TierTable({ tier, title, rows, playerTeamId, onTeamSelect, t }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
      <div className="border-b border-ufa-border px-6 py-4">
        <h3 className="font-semibold text-ufa-text">{title}</h3>
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
            {rows.map((row, idx) => {
              const zone = zoneForRow(tier, idx, rows.length)
              const isPlayer = row.teamId === playerTeamId
              return (
                <tr
                  key={row.teamId}
                  className={`border-b border-ufa-border/40 ${zone ? ZONE_ROW_CLASS[zone] : ''} ${
                    isPlayer ? 'border-l-2 border-l-ufa-accent' : ''
                  } ${!isPlayer && !zone ? 'hover:bg-ufa-panel-hover/50' : ''}`}
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
                    {row.diff >= 0 ? '+' : ''}
                    {row.diff}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ufa-border px-4 py-2 text-[10px] text-ufa-muted">
        {tier !== 1 && (
          <>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${ZONE_DOT_CLASS.promote}`} />
              {t.pyramidZonePromote}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${ZONE_DOT_CLASS.playoff}`} />
              {t.pyramidZonePlayoff}
            </span>
          </>
        )}
        {tier !== 3 && (
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ZONE_DOT_CLASS.relegate}`} />
            {t.pyramidZoneRelegate}
          </span>
        )}
      </div>
    </div>
  )
}

export default function PyramidStandingsView({ career, onTeamSelect }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)

  if (career?.competition !== 'eucs' || !career.pyramid || !career.league) {
    return (
      <div className="rounded-xl border border-ufa-border bg-ufa-panel px-6 py-8 text-center text-sm text-ufa-muted">
        {t.pyramidNotAvailable}
      </div>
    )
  }

  const league = career.league
  const names = teamNameMap(league, lang)
  const playerTier = career.pyramid.tier
  const worldTeamsById = career.world?.teamsById ?? {}

  const rowsByTier = {
    [playerTier]: standingsTable(league.standings, (id) => names[id]),
  }
  // Pozostałe dwie ligi są rozgrywane dzień po dniu w tym samym silniku co liga
  // gracza (patrz otherLeagues.js) — ich tabela jest więc zawsze aktualna na "dziś",
  // bez potrzeby żadnej osobnej projekcji "na daną kolejkę".
  for (const otherLeague of league.otherLeagues ?? []) {
    const tierNum = Number(otherLeague.id.replace('tier', ''))
    rowsByTier[tierNum] = standingsTable(
      otherLeague.standings,
      (id) => resolveTeamName(worldTeamsById[id], lang) ?? id,
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ufa-text">{t.pyramidTitle}</h2>
        <p className="mt-1 text-sm text-ufa-muted">{t.pyramidHint}</p>
      </div>
      {[1, 2, 3].map((tier) => (
        <TierTable
          key={tier}
          tier={tier}
          title={tier === playerTier ? t.pyramidYourTier(tier) : t.pyramidTier(tier)}
          rows={rowsByTier[tier] ?? []}
          playerTeamId={career.playerTeamId}
          onTeamSelect={tier === playerTier ? onTeamSelect : null}
          t={t}
        />
      ))}
    </div>
  )
}
