/**
 * Statystyki zawodników z jednego punktu (podania, metry, przebieg).
 */

import { EVENT } from './events.js'

function ensureRow(map, playerId) {
  if (!map[playerId]) {
    map[playerId] = {
      playerId,
      attempts: 0,
      completions: 0,
      throwMeters: 0,
      catchMeters: 0,
      runMeters: 0,
      turnovers: 0,
      blocks: 0,
    }
  }
  return map[playerId]
}

function accumulateRunFromFrames(frames, runById) {
  if (!frames?.length) return
  const last = Object.create(null)
  for (const frame of frames) {
    for (const p of frame.players ?? []) {
      if (p?.id == null) continue
      const x = Number(p.x)
      const y = Number(p.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const prev = last[p.id]
      if (prev) {
        const d = Math.hypot(x - prev.x, y - prev.y)
        if (d > 0 && d < 40) {
          runById[p.id] = (runById[p.id] ?? 0) + d
        }
      }
      last[p.id] = { x, y }
    }
  }
}

/**
 * @param {object[]} pointEvents — zdarzenia jednego punktu
 * @returns {{
 *   byPlayerId: Record<string, object>,
 *   assistId: string|null,
 *   scorerId: string|null,
 *   scoringTeam: string|null,
 *   pointComplete: boolean,
 * }}
 */
export function buildPointLineStats(pointEvents = []) {
  const byPlayerId = Object.create(null)
  const runById = Object.create(null)
  let assistId = null
  let scorerId = null
  let scoringTeam = null
  let pointComplete = false

  for (let i = 0; i < pointEvents.length; i += 1) {
    const ev = pointEvents[i]

    if (ev.type === EVENT.THROW_ATTEMPT) {
      if (ev.throwerId != null) {
        ensureRow(byPlayerId, ev.throwerId).attempts += 1
      }
      const frames = ev.motionTrace?.frames ?? ev.actionSim?.frames
      accumulateRunFromFrames(frames, runById)

      const next = pointEvents[i + 1]
      if (next?.type === EVENT.THROW_SUCCESS && ev.throwerId != null) {
        const yards = Math.max(0, Number(next.yardsGained) || 0)
        const thrower = ensureRow(byPlayerId, ev.throwerId)
        thrower.completions += 1
        thrower.throwMeters += yards
        if (next.receiverId != null) {
          ensureRow(byPlayerId, next.receiverId).catchMeters += yards
        }
      }
      if (next?.type === EVENT.THROW_FAIL) {
        if (ev.throwerId != null) {
          ensureRow(byPlayerId, ev.throwerId).turnovers += 1
        }
        if (next.isBlock && next.defenderId != null) {
          ensureRow(byPlayerId, next.defenderId).blocks += 1
        }
      }
    }

    if (ev.type === EVENT.STALL_OUT && ev.throwerId != null) {
      ensureRow(byPlayerId, ev.throwerId).turnovers += 1
    }

    if (ev.type === EVENT.SCORE) {
      assistId = ev.throwerId ?? assistId
      scorerId = ev.receiverId ?? scorerId
      scoringTeam = ev.team ?? ev.scoringTeam ?? scoringTeam
    }

    if (ev.type === EVENT.POINT_END) {
      pointComplete = true
      if (!scoringTeam) scoringTeam = ev.scoringTeam ?? null
    }
  }

  for (const [id, meters] of Object.entries(runById)) {
    ensureRow(byPlayerId, id).runMeters = Math.round(meters)
  }

  for (const row of Object.values(byPlayerId)) {
    row.throwMeters = Math.round(row.throwMeters)
    row.catchMeters = Math.round(row.catchMeters)
    row.runMeters = Math.round(row.runMeters ?? 0)
  }

  return {
    byPlayerId,
    assistId,
    scorerId,
    scoringTeam,
    pointComplete,
  }
}

export function completionPct(attempts, completions) {
  if (!attempts) return null
  return (completions / attempts) * 100
}
