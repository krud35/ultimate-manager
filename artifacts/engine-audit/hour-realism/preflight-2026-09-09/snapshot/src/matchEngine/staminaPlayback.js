import { EVENT } from './events.js'
import {
  applyStaminaFromMotionTrace,
  buildPointPlayersById,
  cloneStaminaMaps,
} from './stamina.js'

function copyMapsInto(target, source) {
  if (!source) return
  for (const id of Object.keys(source.home ?? {})) {
    target.home[id] = source.home[id]
  }
  for (const id of Object.keys(source.away ?? {})) {
    target.away[id] = source.away[id]
  }
}

export function applyPartialMotionTraceStamina(
  staminaMaps,
  motionTrace,
  playersById,
  possessionTeam,
  baselineMaps,
  progress01,
) {
  if (!staminaMaps || !motionTrace?.frames?.length || !baselineMaps) return staminaMaps
  // Klatki symulacji powstają w kolejności tick-ów (ms rosnąco) — bez sortowania co klatkę odtwarzania.
  const frames = motionTrace.frames
  const lastMs = frames[frames.length - 1]?.ms ?? 1
  const targetMs = lastMs * Math.min(1, Math.max(0, progress01))
  const subset = frames.filter((f) => f.ms <= targetMs)
  if (subset.length < 2) {
    copyMapsInto(staminaMaps, baselineMaps)
    return staminaMaps
  }
  applyStaminaFromMotionTrace(
    staminaMaps,
    { ...motionTrace, frames: subset, totalMs: targetMs },
    playersById,
    possessionTeam,
    baselineMaps,
  )
  return staminaMaps
}

function mapsAfterEvent(ev, currentMaps) {
  if (ev.staminaAfterThrow) return ev.staminaAfterThrow
  if (ev.staminaSnapshot) return ev.staminaSnapshot
  return currentMaps
}

/**
 * Stamina map (home/away) widoczna w trakcie odtwarzania punktu na boisku.
 */
export function computeStaminaDuringPointPlayback({
  pointEvents,
  stepIndex,
  clipProgress = 0,
  homeLineup,
  awayLineup,
}) {
  const startEv = pointEvents.find((e) => e.type === EVENT.POINT_START)
  const base = cloneStaminaMaps(startEv?.staminaSnapshot)
  if (!base) return null

  const safeStep = Math.max(0, Math.min(stepIndex, pointEvents.length - 1))

  let maps = cloneStaminaMaps(base)
  for (let i = 0; i < safeStep; i += 1) {
    const next = mapsAfterEvent(pointEvents[i], maps)
    if (next !== maps) maps = cloneStaminaMaps(next) ?? maps
  }

  const current = pointEvents[safeStep]
  if (
    current?.type === EVENT.THROW_ATTEMPT &&
    clipProgress > 0 &&
    current.motionTrace?.frames?.length &&
    current.staminaBeforeThrow
  ) {
    const possessionTeam = current.possessionTeam ?? startEv?.attackTeam
    const offenseLineup =
      possessionTeam === 'home' ? homeLineup : awayLineup
    const defenseLineup =
      possessionTeam === 'home' ? awayLineup : homeLineup
    const playersById = buildPointPlayersById(
      offenseLineup,
      defenseLineup,
      possessionTeam,
    )
    const working = cloneStaminaMaps(current.staminaBeforeThrow)
    applyPartialMotionTraceStamina(
      working,
      current.motionTrace,
      playersById,
      possessionTeam,
      current.staminaBeforeThrow,
      clipProgress,
    )
    return working
  }

  const atStep = mapsAfterEvent(current, maps)
  if (atStep !== maps) return cloneStaminaMaps(atStep)

  return maps
}

export function clipProgress01(clipElapsed, actionClip, playbackSpeed) {
  if (!actionClip?.totalDurationMs) return 0
  const simElapsed = (clipElapsed ?? 0) * (playbackSpeed ?? 1)
  return Math.min(1, Math.max(0, simElapsed / actionClip.totalDurationMs))
}
