import { memo } from 'react'
import StaminaBar, { getStaminaForPlayer } from './StaminaBar.jsx'
import { buildPointLineStats, completionPct } from '../matchEngine/pointLineStats.js'
import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'

function playerLabel(player) {
  return `${player.firstName?.[0] ?? ''}. ${player.lastName ?? ''}`.trim()
}

function fmtPct(attempts, completions) {
  const pct = completionPct(attempts, completions)
  if (pct == null) return '—'
  return `${Math.round(pct)}%`
}

function TeamBlock({
  teamName,
  players,
  staminaMap,
  statsById,
  assistId,
  scorerId,
  showHighlights,
  t,
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ufa-muted">
        {teamName}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ufa-muted">
              <th className="pb-1.5 pr-2 font-normal">{t.playerCol}</th>
              <th className="pb-1.5 pr-2 font-normal w-[26%]">Sta</th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.thrTitle}
              >
                {t.thrAbbr}
              </th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.pctTitle}
              >
                %
              </th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.tmTitle}
              >
                Tm
              </th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.cmTitle}
              >
                Cm
              </th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.rmTitle}
              >
                Rm
              </th>
              <th
                className="pb-1.5 px-1 font-normal text-right tabular-nums"
                title={t.toTitle}
              >
                TO
              </th>
              <th
                className="pb-1.5 pl-1 font-normal text-right tabular-nums"
                title={t.blocksTitle}
              >
                B
              </th>
            </tr>
          </thead>
          <tbody>
            {(players ?? []).map((player) => {
              const st = getStaminaForPlayer(staminaMap, player.id)
              const row = statsById?.[player.id]
              const attempts = row?.attempts ?? 0
              const completions = row?.completions ?? 0
              const isAssist = showHighlights && assistId === player.id
              const isScorer = showHighlights && scorerId === player.id
              const rowClass = isScorer
                ? 'bg-ufa-accent/20 ring-1 ring-inset ring-ufa-accent/40'
                : isAssist
                  ? 'bg-ufa-gold/15 ring-1 ring-inset ring-ufa-gold/35'
                  : ''

              return (
                <tr key={player.id} className={rowClass}>
                  <td className="py-1.5 pr-2 align-middle">
                    <span
                      className={`block max-w-[9rem] truncate text-sm ${
                        isScorer || isAssist ? 'font-semibold text-ufa-text' : 'text-ufa-text'
                      }`}
                      title={playerLabel(player)}
                    >
                      {playerLabel(player)}
                      {isScorer ? (
                        <span className="ml-1 text-[9px] font-semibold uppercase text-ufa-accent">
                          {t.goalTag}
                        </span>
                      ) : null}
                      {isAssist && !isScorer ? (
                        <span className="ml-1 text-[9px] font-semibold uppercase text-ufa-gold">
                          {t.assistTag}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 align-middle">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <StaminaBar stamina={st} compact className="flex-1 min-w-0" />
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ufa-muted">
                        {Math.round(st)}
                      </span>
                    </div>
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-text">
                    {attempts ? `${completions}/${attempts}` : '—'}
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-muted">
                    {fmtPct(attempts, completions)}
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-text">
                    {row?.throwMeters ? row.throwMeters : '—'}
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-text">
                    {row?.catchMeters ? row.catchMeters : '—'}
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-text">
                    {row?.runMeters ? row.runMeters : '—'}
                  </td>
                  <td className="py-1.5 px-1 text-right text-xs tabular-nums text-ufa-text">
                    {row?.turnovers ? row.turnovers : '—'}
                  </td>
                  <td className="py-1.5 pl-1 text-right text-xs tabular-nums text-ufa-text">
                    {row?.blocks ? row.blocks : '—'}
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

/**
 * Stamina + statystyki punktu dla 7 na boisku — pełna szerokość pod boiskiem.
 */
const PointStaminaPanel = memo(function PointStaminaPanel({
  homeName,
  awayName,
  homePlayers,
  awayPlayers,
  staminaMaps,
  pointEvents = null,
  pointComplete = false,
  pointIndex = null,
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  if (!staminaMaps?.home && !staminaMaps?.away) return null
  if (!homePlayers?.length && !awayPlayers?.length) return null

  const stats = pointEvents?.length ? buildPointLineStats(pointEvents) : null
  const showHighlights =
    pointComplete || !!(stats?.assistId || stats?.scorerId)

  return (
    <div className="w-full rounded-xl border border-ufa-border bg-ufa-panel/95 p-4 shadow-lg shadow-black/15">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ufa-text">
          {t.staminaPanelTitle}
          {pointIndex != null ? ` ${pointIndex}` : ''}
          <span className="ml-2 text-xs font-normal text-ufa-muted">
            {t.staminaPanelHint}
          </span>
        </p>
        <p className="text-[11px] text-ufa-muted">
          {t.statLegend}
          {showHighlights && (stats?.assistId || stats?.scorerId) ? (
            <span className="ml-2">
              <span className="text-ufa-gold">{t.assistTag}</span>
              {' · '}
              <span className="text-ufa-accent">{t.goalTag}</span>
            </span>
          ) : null}
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <TeamBlock
          teamName={homeName}
          players={homePlayers}
          staminaMap={staminaMaps?.home}
          statsById={stats?.byPlayerId}
          assistId={stats?.assistId}
          scorerId={stats?.scorerId}
          showHighlights={showHighlights}
          t={t}
        />
        <TeamBlock
          teamName={awayName}
          players={awayPlayers}
          staminaMap={staminaMaps?.away}
          statsById={stats?.byPlayerId}
          assistId={stats?.assistId}
          scorerId={stats?.scorerId}
          showHighlights={showHighlights}
          t={t}
        />
      </div>
    </div>
  )
})

export default PointStaminaPanel
