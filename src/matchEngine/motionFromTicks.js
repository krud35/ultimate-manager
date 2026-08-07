import { clampFieldX, clampFieldY } from './fieldDimensions.js'
import { DISC_STATE } from './discState.js'

/** Czas fazy wypuszczenia dysku przed lotem (ms). */
export const MOTION_RELEASE_MS = 300

/** Pozycja chwytu z ostatniej klatki motionTrace (ciągła symulacja). */
export function resolveCatchPointFromMotionTrace(motionTrace, receiverId, throwSuccess) {
  if (!throwSuccess || !motionTrace?.frames?.length || !receiverId) return null
  const frames = motionTrace.frames
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const recv = frames[i].players?.find((p) => p.id === receiverId)
    if (recv) return { x: recv.x, y: recv.y }
    const d = frames[i].disc
    if (d?.state === 'HELD' && i === frames.length - 1) {
      return { x: d.x, y: d.y }
    }
  }
  const last = frames[frames.length - 1]
  const recv = last.players?.find((p) => p.id === receiverId)
  if (recv) return { x: recv.x, y: recv.y }
  if (last.disc) return { x: last.disc.x, y: last.disc.y }
  return null
}

/**
 * Miejsce straty: dysk na ziemi / blok / nieudany chwyt.
 * Stąd nowa ofensywa powinna zaczynać posiadłość.
 */
export function resolveTurnoverPointFromMotionTrace(
  motionTrace,
  { receiverId = null, defenderId = null, isBlock = false } = {},
) {
  if (!motionTrace?.frames?.length) return null
  const frames = motionTrace.frames

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const d = frames[i].disc
    if (d && (d.state === DISC_STATE.ON_GROUND || d.state === 'ON_GROUND')) {
      return { x: d.x, y: d.y, source: 'ground' }
    }
  }

  const last = frames[frames.length - 1]
  if (isBlock && defenderId) {
    const def = last.players?.find((p) => p.id === defenderId)
    if (def) return { x: def.x, y: def.y, source: 'block' }
  }
  if (receiverId) {
    const recv = last.players?.find((p) => p.id === receiverId)
    if (recv) return { x: recv.x, y: recv.y, source: 'drop' }
  }
  if (last.disc && Number.isFinite(last.disc.x) && Number.isFinite(last.disc.y)) {
    return { x: last.disc.x, y: last.disc.y, source: 'disc' }
  }
  return null
}

export function pivotMicroAtAnchor(anchorX, anchorY, ms) {
  const swing = Math.sin(ms * 0.012) * 0.42
  const fwd = Math.cos(ms * 0.009) * 0.18
  return {
    x: clampFieldX(anchorX + fwd),
    y: clampFieldY(anchorY + swing),
  }
}

/** Po chwycie: stałe X,Y od flightEndMs (tylko pivot w setup). */
export function lockPlayerTrackToCatchAnchor(
  tracks,
  playerId,
  anchorX,
  anchorY,
  flightEndMs,
  totalMs,
  { pivotDuringSetup = false, setupMs = 0 } = {},
) {
  const track = tracks[playerId]
  if (!track?.keyframes?.length || anchorX == null || anchorY == null) return tracks
  track.keyframes = track.keyframes.map((k) => {
    if (k.ms < flightEndMs) return k
    if (pivotDuringSetup && k.ms <= setupMs) {
      const micro = pivotMicroAtAnchor(anchorX, anchorY, k.ms)
      return { ...k, x: micro.x, y: micro.y, motionPhase: 'pivot' }
    }
    return { ...k, x: anchorX, y: anchorY, motionPhase: k.motionPhase ?? 'pivot' }
  })
  const hasEnd = track.keyframes.some((k) => k.ms >= totalMs)
  if (!hasEnd) {
    track.keyframes.push({ ms: totalMs, x: anchorX, y: anchorY, motionPhase: 'pivot' })
  }
  tracks[playerId] = track
  return tracks
}

/**
 * @deprecated Użyj ciągłego motionTrace z runContinuousThrowSimulation (bez scalania faz).
 */
export function buildMergedMotionTrace(setupSim, flightSim, releaseMs = 0, possessionTeam = null) {
  const throwMs = setupSim.throwMs ?? 0
  const setupFrames = setupSim.frames ?? []
  const flightStart = throwMs + (releaseMs ?? 0)
  const flightFrames = (flightSim?.frames ?? []).map((f) => ({
    ...f,
    ms: flightStart + f.ms,
  }))
  const frames = [...setupFrames, ...flightFrames]
  const totalMs = frames.length ? frames[frames.length - 1].ms : throwMs
  return {
    tickMs: setupSim.tickMs,
    throwMs,
    releaseMs: releaseMs ?? 0,
    flightMs: flightSim?.durationMs ?? 0,
    totalMs,
    discX: setupSim.discX,
    discY: setupSim.discY,
    throwPathPoints: flightSim?.throwPathPoints,
    frames,
    possessionTeam,
  }
}

function motionPhaseFromFrame(pl, framePhase, frameDiscState) {
  if (pl.motionPhase) return pl.motionPhase
  if (frameDiscState === 'IN_FLIGHT' || framePhase === 'flight') {
    if (pl.layout) return 'layout'
    if (pl.defenderState === 'CONTESTING_DISC' || pl.role === 'defender') return 'contest'
    return 'flight_sprint'
  }
  if (pl.cutterState === 'ACTIVE_CUT' || pl.cutterState === 'INITIATING_CUT') return 'cut'
  if (pl.cutterState === 'CLEARING') return 'clear'
  if (pl.role === 'thrower') return 'pivot'
  if (pl.defenderState === 'MARKING_STALL') return 'mark_force'
  return 'stack'
}

/**
 * Nadpisuje / uzupełnia keyframes graczy z pełnego motionTrace (setup → release → lot).
 */
export function applyMotionTraceToTracks(tracks, motionTrace, tacticalAll, clipTiming, options = {}) {
  if (!motionTrace?.frames?.length) return tracks

  const { setupMs, releaseMs, flightMs } = clipTiming
  const anchorPivot = options.anchorPivot ?? {}
  const clipActionMs = setupMs + releaseMs + flightMs
  const traceTotal = motionTrace.totalMs || motionTrace.frames[motionTrace.frames.length - 1].ms || 1
  const scale = clipActionMs / traceTotal

  for (const tactical of tacticalAll) {
    const anchor = anchorPivot[tactical.id]
    const keyframes = []
    for (const frame of motionTrace.frames) {
      const pl = frame.players?.find((p) => p.id === tactical.id)
      if (!pl && !anchor) continue
      let clipMs = Math.min(clipActionMs, Math.round(frame.ms * scale))
      if (anchor && clipMs <= setupMs) {
        const micro = pivotMicroAtAnchor(anchor.x, anchor.y, clipMs)
        keyframes.push({
          ms: clipMs,
          x: micro.x,
          y: micro.y,
          motionPhase: 'pivot',
          ease: 'linear',
        })
        continue
      }
      if (!pl) continue
      keyframes.push({
        ms: clipMs,
        x: pl.x,
        y: pl.y,
        motionPhase: motionPhaseFromFrame(pl, frame.phase, frame.disc?.state),
        ease: 'linear',
        layout: pl.layout ?? false,
      })
    }
    if (keyframes.length < 2) continue
    const last = keyframes[keyframes.length - 1]
    if (last.ms < setupMs) {
      keyframes.push({
        ms: setupMs,
        x: last.x,
        y: last.y,
        motionPhase: last.motionPhase,
      })
    }
    const frameMarkTarget =
      motionTrace.frames
        ?.map((f) => f.players?.find((p) => p.id === tactical.id)?.markTargetId)
        .find((id) => id != null) ?? null
    tracks[tactical.id] = {
      ...(tracks[tactical.id] ?? {}),
      id: tactical.id,
      fieldId: tactical.fieldId,
      teamId: tactical.teamId,
      label: tactical.label,
      role:
        motionTrace.markerId != null && tactical.id === motionTrace.markerId
          ? 'marker'
          : tactical.fieldRole === 'marker'
            ? 'defender'
            : tactical.fieldRole ?? tracks[tactical.id]?.role ?? 'stack',
      isActiveMark: motionTrace.markerId != null && tactical.id === motionTrace.markerId,
      markTargetId:
        motionTrace.markerId != null && tactical.id === motionTrace.markerId
          ? motionTrace.frames?.[0]?.throwerId ?? tactical.markTargetId ?? frameMarkTarget
          : frameMarkTarget ?? tactical.markTargetId ?? tracks[tactical.id]?.markTargetId ?? null,
      keyframes,
    }
  }
  return tracks
}

/** Pozycja dysku z motionTrace w czasie klipu (ms) — LERP między klatkami lotu. */
export function sampleDiscFromMotionTrace(motionTrace, clipMs, setupMs, releaseMs, flightMs) {
  if (!motionTrace?.frames?.length) return null
  const clipActionMs = setupMs + releaseMs + flightMs
  const traceTotal = motionTrace.totalMs || motionTrace.frames[motionTrace.frames.length - 1].ms || 1
  const traceMs = (clipMs / clipActionMs) * traceTotal
  const throwMs = motionTrace.throwMs ?? 0

  if (traceMs <= throwMs) return null

  const tracedFrames = motionTrace.frames.filter((f) => f.disc && (f.ms ?? 0) > throwMs)
  if (!tracedFrames.length) return null

  if (traceMs <= (tracedFrames[0].ms ?? 0)) {
    const d = tracedFrames[0].disc
    return { x: d.x, y: d.y, z: d.z, state: d.state ?? DISC_STATE.IN_FLIGHT }
  }
  const lastFlight = tracedFrames[tracedFrames.length - 1]
  if (traceMs >= (lastFlight.ms ?? 0)) {
    const d = lastFlight.disc
    return { x: d.x, y: d.y, z: d.z, state: d.state ?? DISC_STATE.IN_FLIGHT }
  }

  for (let i = 0; i < tracedFrames.length - 1; i += 1) {
    const a = tracedFrames[i]
    const b = tracedFrames[i + 1]
    const aMs = a.ms ?? 0
    const bMs = b.ms ?? 0
    if (traceMs >= aMs && traceMs <= bMs) {
      const span = bMs - aMs || 1
      const t = (traceMs - aMs) / span
      const da = a.disc
      const db = b.disc
      return {
        x: da.x + (db.x - da.x) * t,
        y: da.y + (db.y - da.y) * t,
        z: da.z != null && db.z != null ? da.z + (db.z - da.z) * t : db.z ?? da.z,
        state: db.state ?? da.state ?? DISC_STATE.IN_FLIGHT,
      }
    }
  }

  const d = lastFlight.disc
  return { x: d.x, y: d.y, z: d.z, state: d.state ?? DISC_STATE.IN_FLIGHT }
}
