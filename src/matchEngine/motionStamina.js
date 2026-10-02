import { applyTickStaminaDrain, cloneStaminaMaps, prepareTickStamina } from './stamina.js'

/** The post-action stamina calculation, streamed without retaining replay frames.
 * Private player copies keep this calculation from changing the live simulation.
 * Preserve the original frame algorithm: the first sample only establishes time
 * and membership; velocity history starts on the second sample.
 */
export function createMotionStaminaAccumulator(baseline, playersById, possessionTeam) {
  if (!baseline) return null
  const maps = cloneStaminaMaps(baseline)
  maps.sprintM = {
    home: { ...baseline.sprintM?.home },
    away: { ...baseline.sprintM?.away },
  }
  const players = Object.fromEntries(Object.entries(playersById).map(([id, p]) => [id, { ...p }]))
  const parameters = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, prepareTickStamina(p)]))
  const kinematics = {}
  let previousMs = null
  let previousIds = new Set()
  let nextIds = new Set()
  return {
    sample(ms, positions) {
      if (previousMs != null) {
        const dtSec = Math.max(0.01, (ms - previousMs) / 1000)
        for (const position of positions) {
          const player = players[position.id]
          if (!player || !previousIds.has(position.id)) continue
          applyTickStaminaDrain(maps, player, position.teamId, possessionTeam,
            kinematics, position.x, position.y, dtSec, parameters[position.id])
        }
      }
      previousMs = ms
      nextIds.clear()
      for (const position of positions) nextIds.add(position.id)
      const old = previousIds
      previousIds = nextIds
      nextIds = old
    },
    apply(target) {
      if (previousMs == null) return
      for (const side of ['home', 'away']) {
        Object.assign(target[side], maps[side])
        target.sprintM ??= { home: {}, away: {} }
        Object.assign(target.sprintM[side], maps.sprintM[side])
      }
    },
  }
}
