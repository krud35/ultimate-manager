import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'
import { useMemo } from 'react'
import {
  FIELD_DIMENSIONS,
  layoutPlayersOnField,
  TACTICS_MODIFIERS,
  offenseLineSlotsForAttackStyle,
} from '../matchEngine'
import { getPlayerFullName } from '../data/mockPlayers'
import { DEFAULT_HOME_FIELD_COLOR } from '../data/teamColors.js'

const LENGTH_M = FIELD_DIMENSIONS.lengthM
const WIDTH_M = FIELD_DIMENSIONS.widthM
const ENDZONE_M = FIELD_DIMENSIONS.endzoneM
const DISC_START_M = ENDZONE_M + 14

function discStyle(teamColor) {
  return {
    fill: teamColor || DEFAULT_HOME_FIELD_COLOR,
    labelFill: '#ffffff',
    stroke: 'rgba(15, 23, 42, 0.55)',
  }
}

/**
 * Statyczny podgląd boiska: 7 zawodników O-Line w formacji ataku.
 */
export default function FormationPreview({
  roster = [],
  lineupIds = [],
  attackStyle,
  teamColor = DEFAULT_HOME_FIELD_COLOR,
  teamName = '',
  title = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const positionSlots = useMemo(
    () => offenseLineSlotsForAttackStyle(attackStyle),
    [attackStyle],
  )

  const players = useMemo(() => {
    return (lineupIds ?? [])
      .map((id) => roster.find((p) => p.id === id))
      .filter(Boolean)
  }, [roster, lineupIds])

  const layout = useMemo(() => {
    if (players.length === 0) return []
    return layoutPlayersOnField(players, 'home', DISC_START_M, true, {
      attackStyle,
      throwerId: players[0]?.id ?? null,
      attackSign: 1,
    })
  }, [players, attackStyle])

  const slotByPlayerId = useMemo(() => {
    const map = new Map()
    ;(lineupIds ?? []).forEach((id, i) => {
      if (id != null) map.set(id, positionSlots[i] ?? null)
    })
    return map
  }, [lineupIds, positionSlots])

  const styleLabel = TACTICS_MODIFIERS.attack[attackStyle]?.label ?? attackStyle
  const style = discStyle(teamColor)
  const handlerN = positionSlots.filter((s) => s.role === 'handler').length
  const cutterN = positionSlots.filter((s) => s.role === 'cutter').length

  return (
    <section className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ufa-text">{title ?? t.formationO}</h3>
          <p className="mt-0.5 text-xs text-ufa-muted">
            {teamName ? `${teamName} · ` : ''}
            {styleLabel} — {t.handlersCutters(handlerN, cutterN)}
          </p>
        </div>
        <span className="text-xs tabular-nums text-ufa-muted">
          {t.onField(players.length)}
        </span>
      </div>

      <div className="field-view-2d__stage overflow-hidden rounded-lg ring-1 ring-ufa-border">
        <svg
          className="field-view-2d__svg field-view-2d__svg--live"
          viewBox={`0 0 ${LENGTH_M} ${WIDTH_M}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t.formationAria(styleLabel)}
        >
          <rect className="field-grass" x={0} y={0} width={LENGTH_M} height={WIDTH_M} />
          <rect className="field-endzone field-endzone--left" x={0} y={0} width={ENDZONE_M} height={WIDTH_M} />
          <rect
            className="field-endzone field-endzone--right"
            x={LENGTH_M - ENDZONE_M}
            y={0}
            width={ENDZONE_M}
            height={WIDTH_M}
          />
          <rect
            className="field-playing"
            x={ENDZONE_M}
            y={0}
            width={LENGTH_M - 2 * ENDZONE_M}
            height={WIDTH_M}
          />
          <line className="field-line" x1={ENDZONE_M} y1={0} x2={ENDZONE_M} y2={WIDTH_M} />
          <line
            className="field-line"
            x1={LENGTH_M - ENDZONE_M}
            y1={0}
            x2={LENGTH_M - ENDZONE_M}
            y2={WIDTH_M}
          />
          <line
            className="field-line field-line--mid"
            x1={LENGTH_M / 2}
            y1={0}
            x2={LENGTH_M / 2}
            y2={WIDTH_M}
          />

          <circle
            cx={DISC_START_M}
            cy={WIDTH_M / 2}
            r={0.55}
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth={0.12}
          />

          {layout.map((p) => {
            const slot = slotByPlayerId.get(p.id)
            const badge = slot?.shortLabel ?? '?'
            const isHandler = slot?.role === 'handler'
            const r = isHandler ? 1.15 : 0.95
            const player = roster.find((pl) => pl.id === p.id)
            const name = player
              ? getPlayerFullName(player)
              : String(p.label ?? '')
            return (
              <g key={p.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={0.2}
                />
                <text
                  x={p.x}
                  y={p.y + 0.35}
                  textAnchor="middle"
                  fill={style.labelFill}
                  fontSize="1.2"
                  fontWeight="700"
                  style={{ pointerEvents: 'none' }}
                >
                  {badge}
                </text>
                <text
                  x={p.x}
                  y={p.y + 2.4}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="1.5"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {name.split(' ').pop()}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ufa-muted">
        <span>
          <span className="font-semibold text-sky-300">H1…</span> handlery
        </span>
        <span>
          <span className="font-semibold text-violet-300">C1…</span> cuttery
        </span>
      </div>
    </section>
  )
}
