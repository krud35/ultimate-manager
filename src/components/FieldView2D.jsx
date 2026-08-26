import { useMemo } from 'react'
import { THROW_TYPE } from '../matchEngine/throwTypes.js'
import { TACTICS_MODIFIERS } from '../matchEngine/tacticsModifiers.js'
import { DEFAULT_AWAY_FIELD_COLOR, DEFAULT_HOME_FIELD_COLOR } from '../data/teamColors.js'
import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'
import { pickLabel } from '../ui/locale'

import {
  FIELD_DIMENSIONS,
} from '../matchEngine/fieldDimensions.js'

/** Relative luminance 0–1 for hex (#rgb / #rrggbb). */
function colorLuminance(hex) {
  if (!hex || typeof hex !== 'string') return 0.5
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || Number.isNaN(Number.parseInt(h, 16))) return 0.5
  const r = Number.parseInt(h.slice(0, 2), 16) / 255
  const g = Number.parseInt(h.slice(2, 4), 16) / 255
  const b = Number.parseInt(h.slice(4, 6), 16) / 255
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** White or black number for contrast; light discs get a dark rim so they stay visible on grass. */
function playerDiscStyle(teamColor) {
  const lum = colorLuminance(teamColor)
  const light = lum > 0.55
  return {
    fill: teamColor,
    labelFill: light ? '#0f172a' : '#ffffff',
    stroke: light ? '#0f172a' : 'rgba(15, 23, 42, 0.5)',
    strokeWidth: light ? 0.28 : 0.18,
  }
}

const LENGTH_M = FIELD_DIMENSIONS.lengthM
const WIDTH_M = FIELD_DIMENSIONS.widthM
const ENDZONE_M = FIELD_DIMENSIONS.endzoneM
const PLAY_X = ENDZONE_M
const PLAY_W = LENGTH_M - 2 * ENDZONE_M

const FULL_VIEW = `0 0 ${LENGTH_M} ${WIDTH_M}`

/**
 * Faza 6 planu 3D (wizualne, kosmetyczne — bez wpływu na rozgrywkę): realna wysokość
 * dysku (frame.discZ, w metrach, już podłączona przez cały pipeline — flightKinematics.js
 * → fieldMotion.js → playbackInterpolation.js) renderowana jako pionowe przesunięcie w
 * górę widoku (pseudo-3D, standardowy trik gier z góry) + delikatne powiększenie
 * (perspektywa) + cień na realnej pozycji naziemnej. Skale dobrane tak, żeby najwyższy
 * huck (~8m) dawał widoczny, ale nieprzesadzony efekt na 37m szerokim boisku.
 */
const DISC_HEIGHT_OFFSET_SCALE = 0.4
const DISC_HEIGHT_SCALE_BOOST = 0.05

/** Współrzędne silnika wizualizacji: X/Y w metrach (0–100 × 0–37). */
export function meterToSvg(x, y) {
  return { x, y }
}

function meterToPct(x, y) {
  return {
    xPct: (x / LENGTH_M) * 100,
    yPct: (y / WIDTH_M) * 100,
  }
}

function pointsToSvgPathD(points) {
  if (!points?.length) return ''
  const mapped = points.map((pt) => meterToSvg(pt.x, pt.y))
  const [first, ...rest] = mapped
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`
}

function partialPathD(points, progress) {
  if (!points?.length || progress <= 0) return ''
  const mapped = points.map((pt) => meterToSvg(pt.x, pt.y))
  if (progress >= 1) {
    const [first, ...rest] = mapped
    return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`
  }
  const total = mapped.length - 1
  const f = progress * total
  const i = Math.min(total - 1, Math.floor(f))
  const local = f - i
  const slice = mapped.slice(0, i + 1)
  const a = mapped[i]
  const b = mapped[i + 1]
  slice.push({
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
  })
  const [first, ...rest] = slice
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`
}

function WindBadge({ wind }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  if (!wind) return null
  const rot = wind.directionDeg ?? 0
  const label = pickLabel(wind, lang) || wind.label
  return (
    <div className="field-wind" title={t.windLabel(label)}>
      <span className="field-wind__label">{label}</span>
      <span className="field-wind__speed">{wind.speedMph} mph</span>
      <svg className="field-wind__arrow" viewBox="0 0 24 24" aria-hidden>
        <g transform={`rotate(${rot} 12 12)`}>
          <path d="M12 4 L12 18 M12 4 L8 10 M12 4 L16 10" fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
      </svg>
    </div>
  )
}

function PhaseBadge({ phase }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  if (!phase || phase === 'idle') return null
  const label =
    phase === 'reposition' || phase === 'setup'
      ? t.phaseSetup
      : phase === 'release'
        ? t.phaseThrow
        : phase === 'flight'
          ? t.phaseFlight
          : phase
  return <div className="field-phase-badge">{label}</div>
}

function ActionCommentaryBar({ text }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  if (!text) {
    return (
      <div className="field-view-2d__commentary field-view-2d__commentary--empty" aria-live="polite">
        <span>{t.waitingAction}</span>
      </div>
    )
  }
  return (
    <div className="field-view-2d__commentary" aria-live="polite" key={text}>
      <span className="field-view-2d__commentary-label">{t.actionLabel}</span>
      <p className="field-view-2d__commentary-text">{text}</p>
    </div>
  )
}

function StallBadge({ stallCount, xPct, yPct, pulse }) {
  if (stallCount == null || stallCount < 1) return null
  const n = Math.round(stallCount)
  const band =
    n <= 4 ? 'ok' : n <= 7 ? 'warm' : 'hot'
  const cls = [
    'field-stall-badge',
    band === 'ok' ? 'field-stall-badge--ok' : '',
    band === 'warm' ? 'field-stall-badge--warm' : '',
    band === 'hot' ? 'field-stall-badge--hot' : '',
    pulse || n >= 8 ? 'field-stall-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      STALL {n}
    </div>
  )
}

/** Obrońca aktualnie kryjący osobę z dyskiem — marker throwera. */
function findActiveMarker(players, thrower, discX, discY, markerId = null) {
  if (!players?.length) return null
  if (markerId != null) {
    const byId = players.find((p) => p.id === markerId)
    if (byId) return byId
  }
  const active = players.find((p) => p.isActiveMark)
  if (active) return active
  if (thrower?.id != null) {
    const byTarget = players.find((p) => p.markTargetId === thrower.id)
    if (byTarget) return byTarget
  }

  const ax = thrower?.x ?? discX
  const ay = thrower?.y ?? discY
  if (ax == null || ay == null) return null

  const markers = players.filter((p) => p.role === 'marker' || p.isActiveMark)
  const cups = players.filter((p) => p.role === 'zone_cup')
  const candidates =
    markers.length > 0
      ? markers
      : cups.length > 0
        ? cups
        : players.filter(
            (p) =>
              thrower &&
              p.teamId !== thrower.teamId &&
              (p.role === 'zone_wall' || p.role === 'zone' || p.role === 'defender' || p.role === 'marker'),
          )

  if (!candidates.length) return null

  let best = null
  let bestDist = Infinity
  for (const p of candidates) {
    const d = Math.hypot((p.x ?? 0) - ax, (p.y ?? 0) - ay)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

export default function FieldView2D({
  renderFrame,
  fieldState,
  fieldPointKey = null,
  wind = null,
  homeLabel = 'Home',
  awayLabel = 'Away',
  homeColor = DEFAULT_HOME_FIELD_COLOR,
  awayColor = DEFAULT_AWAY_FIELD_COLOR,
  commentary = null,
  className = '',
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  const frame = renderFrame ?? null

  const viewBox = FULL_VIEW

  const pathD = useMemo(() => {
    if (!frame?.throwPathPoints || !frame.showPath) return ''
    if (frame.pathProgress > 0 && frame.pathProgress < 1) {
      return partialPathD(frame.throwPathPoints, frame.pathProgress)
    }
    return pointsToSvgPathD(frame.throwPathPoints)
  }, [frame])

  if (!fieldState || !frame) {
    return (
      <div className={`field-view-2d field-view-2d--empty ${className}`}>
        <p className="text-sm text-ufa-muted">{t.emptyField}</p>
      </div>
    )
  }

  const discSvg = meterToSvg(frame.discX, frame.discY)
  const discHeightM = Math.max(0, frame.discZ ?? 0)
  const thrower =
    frame.players.find((p) => p.id === frame.throwerId) ||
    frame.players.find((p) => p.role === 'thrower')
  const activeMarker = findActiveMarker(
    frame.players,
    thrower,
    frame.discX,
    frame.discY,
    frame.markerId,
  )
  const stallAnchor = activeMarker ?? thrower
  const stallAnchorPct = stallAnchor
    ? meterToPct(stallAnchor.x, stallAnchor.y)
    : meterToPct(frame.discX, frame.discY)

  const isOverhead = frame.throwType === THROW_TYPE.OVER_THE_TOP
  const showPath = frame.showPath && pathD

  return (
    <div className={`field-view-2d ${className}`}>
      <div className="field-view-2d__header">
        <span className="field-team field-team--home" style={{ color: homeColor }}>
          {homeLabel}
        </span>
        <PhaseBadge phase={frame.phase} />
        <span className="field-team field-team--away" style={{ color: awayColor }}>
          {awayLabel}
        </span>
      </div>

      <ActionCommentaryBar text={commentary} />

      <div className="field-view-2d__stage">
        <svg
          className="field-view-2d__svg field-view-2d__svg--live"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
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
          <rect className="field-playing" x={PLAY_X} y={0} width={PLAY_W} height={WIDTH_M} />
          <line className="field-line" x1={PLAY_X} y1={0} x2={PLAY_X} y2={WIDTH_M} />
          <line className="field-line" x1={PLAY_X + PLAY_W} y1={0} x2={PLAY_X + PLAY_W} y2={WIDTH_M} />
          <line
            className="field-line field-line--mid"
            x1={PLAY_X + PLAY_W / 2}
            y1={0}
            x2={PLAY_X + PLAY_W / 2}
            y2={WIDTH_M}
          />
          <text className="field-dim-label" x={ENDZONE_M / 2} y={1.8} textAnchor="middle">
            {ENDZONE_M}m
          </text>
          <text className="field-dim-label" x={LENGTH_M - ENDZONE_M / 2} y={1.8} textAnchor="middle">
            {ENDZONE_M}m
          </text>
          <text className="field-dim-label field-dim-label--muted" x={LENGTH_M / 2} y={WIDTH_M - 0.8} textAnchor="middle">
            {LENGTH_M}m × {WIDTH_M}m
          </text>

          {showPath && (
            <path
              d={pathD}
              fill="none"
              className={`field-throw-path${isOverhead ? ' field-throw-path--overhead' : ''}`}
            />
          )}

          {frame.players.map((p) => {
            const pt = meterToSvg(p.x, p.y)
            const teamColor = p.teamId === 'home' ? homeColor : awayColor
            const disc = playerDiscStyle(teamColor)
            const r = p.role === 'thrower' ? 1 : p.role === 'cutter' ? 0.9 : 0.75
            const zoneCup = p.role === 'zone_cup'
            const motion = p.motionPhase
            const motionClass =
              motion === 'plant'
                ? 'field-player-svg--plant'
                : motion === 'cut' || motion === 'sprint'
                  ? 'field-player-svg--burst'
                  : motion === 'clear'
                    ? 'field-player-svg--clear'
                    : motion === 'pivot' || motion === 'shuffle'
                      ? 'field-player-svg--pivot'
                      : motion === 'hip-turn'
                        ? 'field-player-svg--hip-turn'
                        : ''
            return (
              <g key={`${fieldPointKey ?? 'p'}-${p.teamId}-${p.id}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  fill={disc.fill}
                  stroke={disc.stroke}
                  strokeWidth={
                    p.role === 'marker' || zoneCup
                      ? disc.strokeWidth + 0.04
                      : motion === 'cut'
                        ? disc.strokeWidth + 0.08
                        : disc.strokeWidth
                  }
                  strokeDasharray={zoneCup ? '3 2' : motion === 'hip-turn' ? '2 1.5' : undefined}
                  className={[
                    p.role === 'marker' ? 'field-player-svg--marker' : zoneCup ? 'field-player-svg--zone' : '',
                    motionClass,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
                <text
                  x={pt.x}
                  y={pt.y + 0.15}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="field-player-svg-label"
                  fill={disc.labelFill}
                >
                  {p.label}
                </text>
              </g>
            )
          })}

          {discHeightM > 0.05 && (
            <ellipse
              className="field-disc-shadow-svg"
              cx={discSvg.x}
              cy={discSvg.y}
              rx={0.85}
              ry={0.85 * 0.4}
              opacity={Math.max(0.12, 0.4 - discHeightM * 0.03)}
            />
          )}
          <circle
            className={`field-disc-svg${frame.phase === 'flight' ? ' field-disc-svg--flight' : ''}`}
            cx={discSvg.x}
            cy={discSvg.y - discHeightM * DISC_HEIGHT_OFFSET_SCALE}
            r={0.85 * (1 + discHeightM * DISC_HEIGHT_SCALE_BOOST)}
          />
        </svg>

        <div className="field-view-2d__overlay" aria-hidden>
          <StallBadge
            stallCount={frame.displayStall ?? frame.stallCount}
            xPct={stallAnchorPct.xPct}
            yPct={stallAnchorPct.yPct}
            pulse={
              frame.stallPulse ||
              (frame.displayStall ?? frame.stallCount ?? 0) >= 8
            }
          />
          {frame.actionLabel && (
            <div className="field-action-label" key={`${frame.phase}-${frame.actionLabel}`}>
              {frame.actionLabel}
            </div>
          )}
        </div>
      </div>

      <WindBadge wind={wind} />
      <p className="field-view-2d__disc-hint text-xs text-ufa-muted mt-2 text-center">
        {t.discPossession(
          Math.round(fieldState.discMeters),
          fieldState.possessionTeam === 'home' ? homeLabel : awayLabel,
        )}
        {fieldState.attackStyle && (
          <>
            {' '}
            · {TACTICS_MODIFIERS.attack[fieldState.attackStyle]?.label ?? t.attackShort} /{' '}
            {TACTICS_MODIFIERS.defense[fieldState.defenseStyle]?.label ?? t.defenseShort}
          </>
        )}
      </p>
    </div>
  )
}
