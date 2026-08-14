import {
  attackDirectionX,
  clampFieldX,
  clampFieldY,
  fieldCenterY,
} from '../fieldDimensions.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'

const DEG = Math.PI / 180
const LANE_HALF_WIDTH_M = 3.2
const LANE_AHEAD_M = 22

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLen2 = abx * abx + aby * aby || 1
  let t = (apx * abx + apy * aby) / abLen2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + abx * t
  const cy = ay + aby * t
  return Math.hypot(px - cx, py - cy)
}

export function isCloggingThrowLane(x, y, disc, throwerPos, possessionTeam, attackSignOverride = null) {
  if (!disc) return false
  const attackSign = attackSignOverride ?? attackDirectionX(possessionTeam)
  const ox = throwerPos?.x ?? disc.x
  const oy = throwerPos?.y ?? disc.y
  const laneEndX = clampFieldX(ox + attackSign * LANE_AHEAD_M)
  const laneEndY = oy
  const d = distPointToSegment(x, y, ox, oy, laneEndX, laneEndY)
  if (d > LANE_HALF_WIDTH_M) return false
  const ahead = (x - ox) * attackSign
  return ahead > -1.5 && ahead < LANE_AHEAD_M + 2
}

export function breakSideSign(forceSide) {
  const layout = forceMarkLayoutSide(normalizeForceMark(forceSide))
  if (layout === 'away') return -1
  if (layout === 'home') return 1
  return 0
}

export function pickBreakSideClearTarget(x, y, disc, attackSign, forceSide, rng) {
  const cy = fieldCenterY()
  const breakSign = breakSideSign(forceSide)
  const r = rng?.float ? rng.float() : 0.5
  const lateral =
    breakSign !== 0
      ? breakSign * (5 + r * 4)
      : (y >= cy ? -1 : 1) * (4 + r * 3)
  const back = -attackSign * (3 + r * 4)
  const arcAngle = (95 + r * 35) * (lateral >= 0 ? 1 : -1)
  const rad = arcAngle * DEG
  const len = 6 + r * 5
  const dx = Math.cos(rad) * attackSign * len + back * 0.35
  const dy = Math.sin(rad) * len + lateral * 0.55
  return {
    x: clampFieldX(x + dx),
    y: clampFieldY(y + dy),
  }
}

/** Geometria pionowego stacka: pierwszy cutter 9 m przed dyskiem, kolejni co 6 m. */
const STACK_START_M = 9
const STACK_SLOT_SPACING_M = 6
const RESET_DEPTH_M = 6

/** Otwarta strona boiska względem ustawienia marka. */
export function openSideSign(forceSide, y) {
  const breakSign = breakSideSign(forceSide)
  if (breakSign !== 0) return -breakSign
  return y >= fieldCenterY() ? 1 : -1
}

/**
 * Miejsce zawodnika w strukturze ataku — slot w stacku albo pozycja resetu.
 * To pozycja utrzymywana, gdy zawodnik nie tnie: dzięki temu atak jest rozciągnięty
 * wzdłuż boiska, a przed dyskiem powstaje przestrzeń na podanie.
 */
export function computeDynamicOffenseTarget({
  x,
  y,
  disc,
  throwerId,
  playerId,
  throwerPos,
  forceSide,
  possessionTeam,
  inThrowLane,
  rng,
  stackIndex = 2,
  isDump = false,
  /** Jawny znak ataku (+1/-1) — używać, gdy `possessionTeam` to etykieta rosterowa,
   * a nie geo/ekranowa (np. w replayu po stronach zamienionych, patrz fieldMotion.js
   * `geoTeam`). Gdy podany, ma pierwszeństwo przed attackDirectionX(possessionTeam). */
  attackSign: attackSignOverride = null,
}) {
  if (!disc) return { x, y }
  const attackSign = attackSignOverride ?? attackDirectionX(possessionTeam)
  if (playerId === throwerId) {
    return { x: disc.x, y: disc.y }
  }
  if (inThrowLane) {
    return pickBreakSideClearTarget(x, y, disc, attackSign, forceSide, rng)
  }

  const ox = throwerPos?.x ?? disc.x
  const oy = throwerPos?.y ?? disc.y
  const openSign = openSideSign(forceSide, y)

  if (isDump) {
    return {
      x: clampFieldX(ox - attackSign * RESET_DEPTH_M),
      y: clampFieldY(oy + openSign * 4.5),
    }
  }

  const slot = Math.max(0, (stackIndex ?? 2) - 2)
  const depth = STACK_START_M + slot * STACK_SLOT_SPACING_M
  const lane = fieldCenterY() + openSign * (slot % 2 === 0 ? 2 : -2)

  return {
    x: clampFieldX(ox + attackSign * depth),
    y: clampFieldY(lane),
  }
}

const MIN_TEAMMATE_SPACING_M = 4.5

/** Odsunięcie celu od zbyt bliskich kolegów — utrzymuje przestrzeń w ataku. */
export function spacingAdjustedTarget(agent, targetX, targetY, teammates) {
  if (!teammates?.length) return { x: targetX, y: targetY }
  let px = 0
  let py = 0
  for (const t of teammates) {
    if (!t || t.id === agent.id) continue
    const dx = agent.x - t.x
    const dy = agent.y - t.y
    const d = Math.hypot(dx, dy)
    if (d >= MIN_TEAMMATE_SPACING_M || d < 1e-3) continue
    const push = (MIN_TEAMMATE_SPACING_M - d) / MIN_TEAMMATE_SPACING_M
    px += (dx / d) * push * 4
    py += (dy / d) * push * 4
  }
  if (px === 0 && py === 0) return { x: targetX, y: targetY }
  return { x: clampFieldX(targetX + px), y: clampFieldY(targetY + py) }
}

/** Pozycje ataku do odtwarzania — ze stanu zawodników na koniec ostatniego rzutu. */
export function offenseFieldPositionsFromStates(states, lineup) {
  if (!states || !lineup?.length) return []
  const out = []
  for (const p of lineup) {
    const s = states.get(p.id)
    if (s) out.push({ id: p.id, x: s.x, y: s.y })
  }
  return out
}
