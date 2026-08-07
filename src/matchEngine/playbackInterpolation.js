/**
 * Jedyna warstwa interpolacji wizualnej (Canvas/UI) — silnik dostarcza klatki dyskretne.
 */
import { DISC_STATE } from './discState.js'

export const PLAYBACK_TICK_MS = 20

function clamp01(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t
}

export function lerpScalar(a, b, t) {
  return a + (b - a) * t
}

/** Normalizacja klatki z sampleFieldActionClip → format timeline. */
export function renderFrameToPlaybackKeyframe(renderFrame, ms = 0) {
  if (!renderFrame) return null
  return {
    ms,
    snapFrame: !!renderFrame.snapFrame,
    players: renderFrame.players ?? [],
    discX: renderFrame.discX ?? 0,
    discY: renderFrame.discY ?? 0,
    discZ: renderFrame.discZ ?? 0,
    discState: renderFrame.discState ?? DISC_STATE.HELD,
    phase: renderFrame.phase,
    phaseProgress: renderFrame.phaseProgress,
    showPath: renderFrame.showPath,
    pathProgress: renderFrame.pathProgress,
    throwType: renderFrame.throwType,
    throwPathPoints: renderFrame.throwPathPoints,
    actionLabel: renderFrame.actionLabel,
    stallCount: renderFrame.stallCount,
    displayStall: renderFrame.displayStall,
    stallPulse: renderFrame.stallPulse,
    cameraFocusX: renderFrame.cameraFocusX,
    cameraFocusY: renderFrame.cameraFocusY,
  }
}

export function buildClipPlaybackTimeline(clip, sampleAtMs) {
  if (!clip || typeof sampleAtMs !== 'function') return []
  const frames = []
  const step = PLAYBACK_TICK_MS
  for (let ms = 0; ms <= clip.totalDurationMs; ms += step) {
    const raw = sampleAtMs(clip, ms)
    if (!raw) continue
    const forceSnap =
      !!clip.instantLayout ||
      !!clip.skipSimInterpolation ||
      clip.kind === 'turnover' ||
      clip.kind === 'score_reset' ||
      clip.kind === 'stall_out'
    frames.push(
      renderFrameToPlaybackKeyframe(
        {
          ...raw,
          snapFrame: !!raw.snapFrame || (forceSnap && ms === 0),
        },
        ms,
      ),
    )
  }
  const lastMs = clip.totalDurationMs
  if (!frames.length || frames[frames.length - 1].ms < lastMs) {
    const raw = sampleAtMs(clip, lastMs)
    if (raw) frames.push(renderFrameToPlaybackKeyframe(raw, lastMs))
  }
  return frames
}

function playbackKeyframeToRenderFrame(keyframe) {
  if (!keyframe) return null
  return {
    phase: keyframe.phase ?? 'idle',
    phaseProgress: keyframe.phaseProgress ?? 0,
    players: keyframe.players ?? [],
    discX: keyframe.discX,
    discY: keyframe.discY,
    discZ: keyframe.discZ,
    discState: keyframe.discState,
    showPath: keyframe.showPath,
    pathProgress: keyframe.pathProgress,
    throwType: keyframe.throwType,
    throwPathPoints: keyframe.throwPathPoints,
    actionLabel: keyframe.actionLabel,
    stallCount: keyframe.stallCount,
    displayStall: keyframe.displayStall,
    stallPulse: keyframe.stallPulse,
    cameraFocusX: keyframe.cameraFocusX,
    cameraFocusY: keyframe.cameraFocusY,
  }
}

export function interpolatePlaybackKeyframes(prev, next, progress) {
  const t = clamp01(progress)
  if (!prev) return playbackKeyframeToRenderFrame(next)
  if (!next || t >= 1) return playbackKeyframeToRenderFrame(next)
  if (t <= 0 || next.snapFrame) return playbackKeyframeToRenderFrame(next)
  if (prev.snapFrame) return playbackKeyframeToRenderFrame(next)

  const prevById = new Map((prev.players ?? []).map((p) => [p.id, p]))
  const players = (next.players ?? []).map((p) => {
    const a = prevById.get(p.id)
    if (!a) return p
    return {
      ...p,
      x: lerpScalar(a.x, p.x, t),
      y: lerpScalar(a.y, p.y, t),
    }
  })

  return playbackKeyframeToRenderFrame({
    ...next,
    players,
    discX: lerpScalar(prev.discX ?? 0, next.discX ?? 0, t),
    discY: lerpScalar(prev.discY ?? 0, next.discY ?? 0, t),
    discZ: lerpScalar(prev.discZ ?? 0, next.discZ ?? 0, t),
  })
}

/**
 * @returns {import('./fieldMotion.js').ReturnType<typeof sampleFieldActionClip>|null}
 */
export function resolvePlaybackRenderFrame(timeline, elapsedMs) {
  if (!timeline?.length) return null
  const tMs = Math.max(0, elapsedMs)
  if (tMs <= timeline[0].ms) {
    return playbackKeyframeToRenderFrame(timeline[0])
  }
  const last = timeline[timeline.length - 1]
  if (tMs >= last.ms) {
    return playbackKeyframeToRenderFrame(last)
  }
  for (let i = 0; i < timeline.length - 1; i += 1) {
    const prev = timeline[i]
    const next = timeline[i + 1]
    if (tMs >= prev.ms && tMs <= next.ms) {
      const span = next.ms - prev.ms || 1
      const local = (tMs - prev.ms) / span
      return interpolatePlaybackKeyframes(prev, next, local)
    }
  }
  return playbackKeyframeToRenderFrame(last)
}
