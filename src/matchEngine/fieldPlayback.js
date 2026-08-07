import { EVENT } from './events.js'
import { ATTACK_STYLES } from './tacticsModifiers.js'
import { FIELD_DIMENSIONS, fieldCenterY, opponentGoalLineM, clampFieldY } from './fieldDimensions.js'
import { THROW_TYPE } from './throwTypes.js'

/** Deterministic Y (0–37 m) for receiver based on role in offense. */
export function receiverFieldYMeters(receiver, roleSlot, attackStyle, opts = {}) {
  const { throwType, discYMeters } = opts
  const w = FIELD_DIMENSIONS.widthM
  const cy = fieldCenterY()
  const baseY = discYMeters ?? cy

  if (throwType === THROW_TYPE.DUMP_SWING) {
    const id = receiver?.id ?? 'swing'
    let h = 0
    for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * (i + 1)) % 997
    const dir = h % 2 === 0 ? 1 : -1
    return clampFieldY(baseY + dir * (5.5 + (h % 4)))
  }

  if (attackStyle === ATTACK_STYLES.HORIZONTAL_STACK) {
    const lanes = [0.14, 0.32, 0.5, 0.68, 0.86]
    return w * (lanes[roleSlot % lanes.length] ?? 0.5)
  }
  const id = receiver?.id ?? '0'
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * (i + 1)) % 997
  const lane = (h % 5) - 2
  return cy + lane * 1.1
}

export function offenseRoleSlot(lineupIds, playerId, throwerId) {
  if (!lineupIds?.length) return 2
  const ordered = [...lineupIds]
  const ti = ordered.indexOf(throwerId)
  if (ti > 0) {
    ordered.splice(ti, 1)
    ordered.unshift(throwerId)
  } else if (ti < 0 && throwerId) {
    ordered.unshift(throwerId)
  }
  const idx = ordered.indexOf(playerId)
  return idx >= 0 ? idx : 2
}

function countScoreEvents(events) {
  let home = 0
  let away = 0
  for (const e of events) {
    if (e.type !== EVENT.SCORE) continue
    if (e.team === 'home') home += 1
    else away += 1
  }
  return { home, away }
}

function eventsBeforePoint(allEvents, pointIndex) {
  if (!allEvents?.length || pointIndex == null) return []
  const out = []
  for (const e of allEvents) {
    if (e.type === EVENT.POINT_START && e.pointIndex === pointIndex) break
    out.push(e)
  }
  return out
}

function samplePathPoint(points, progress) {
  if (!points?.length) return null
  const u = Math.max(0, Math.min(1, progress))
  const total = points.length - 1
  const f = u * total
  const i = Math.min(total - 1, Math.floor(f))
  const local = f - i
  const a = points[i]
  const b = points[i + 1] ?? a
  return {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
  }
}

/** Postęp lotu (0–1), przy którym trajektoria przecina linię punktową. */
function goalLineCrossFlightProgress(points, scoringTeam) {
  if (!points?.length) return 0.92
  const line = opponentGoalLineM(scoringTeam)
  for (let step = 0; step <= 24; step += 1) {
    const u = step / 24
    const pt = samplePathPoint(points, u)
    if (!pt) continue
    const crossed =
      scoringTeam === 'home' ? pt.x >= line : pt.x <= FIELD_DIMENSIONS.endzoneM
    if (crossed) return u
  }
  return 0.92
}

/**
 * Wynik tablicy zsynchronizowany z odtwarzaczem (punkt po linii bramkowej / chwycie).
 */
export function computeDisplayedMatchScore(
  allEvents,
  pointIndex,
  pointEvents,
  playbackStep,
  { fieldPlaying, clipElapsed, actionClip, playbackSpeed = 1 } = {},
) {
  const base = countScoreEvents(eventsBeforePoint(allEvents, pointIndex))
  let home = base.home
  let away = base.away

  if (!pointEvents?.length) {
    return { home, away }
  }

  const simElapsed = (clipElapsed ?? 0) * playbackSpeed

  for (let i = 0; i < pointEvents.length; i += 1) {
    const e = pointEvents[i]
    if (e.type !== EVENT.SCORE) continue
    if (i > playbackStep && fieldPlaying) break

    const attemptIdx = i - 2
    const successEv = pointEvents[i - 1]
    const attemptEv = pointEvents[attemptIdx]
    const scoringSequence =
      successEv?.type === EVENT.THROW_SUCCESS && attemptEv?.type === EVENT.THROW_ATTEMPT

    let include = false

    if (!scoringSequence) {
      include = i <= playbackStep && (!fieldPlaying || i < playbackStep)
    } else if (playbackStep > attemptIdx) {
      include = true
    } else if (playbackStep < attemptIdx) {
      include = false
    } else if (!fieldPlaying) {
      include = playbackStep >= i
    } else if (actionClip?.kind === 'throw') {
      const flightStart = actionClip.setupMs + actionClip.releaseMs
      const flightT = Math.max(0, simElapsed - flightStart)
      const flightProgress =
        actionClip.flightMs > 0 ? flightT / actionClip.flightMs : 1
      if (scoringSequence) {
        const crossAt = goalLineCrossFlightProgress(actionClip.throwPathPoints, e.team)
        include = flightProgress >= crossAt
      } else {
        include = simElapsed >= flightStart + actionClip.flightMs * 0.92
      }
    }

    if (include) {
      if (e.team === 'home') home += 1
      else away += 1
    }
  }

  return { home, away }
}

export const PLAYBACK_SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3]
