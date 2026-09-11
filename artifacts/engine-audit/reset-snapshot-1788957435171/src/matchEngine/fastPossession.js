import { clampFieldX, clampFieldY } from './fieldDimensions.js'
import { subStat } from './ai/statFormulas.js'

// Przybliżenie czasu pierwszego looku, nie niezależna kostka na stall-out.
// Kolejne odrzucone opcje zużywają realny czas w simulatePointFast.
const FIRST_LOOK_PMF = [[1, 0.55], [2, 0.18], [3, 0.11], [4, 0.08], [5, 0.06], [6, 0.02]]
export function sampleFastHoldMs(rng) {
  let r = rng.float()
  let seconds = 6
  for (const [s, p] of FIRST_LOOK_PMF) {
    r -= p
    if (r <= 0) { seconds = s; break }
  }
  return Math.round((seconds + rng.float()) * 1000)
}

export function fastRescanMs(thrower) {
  const decision = subStat(thrower, 'mental', 'decisionMaking')
  const composure = subStat(thrower, 'mental', 'composure')
  return Math.round(1400 - Math.max(0, Math.min(100, (decision + composure) / 2)) * 7)
}

/** Fast nie rozróżnia jeszcze bloków przy markerze i na trasie geometrią.
 * Blok przerywa lot; drop kończy go przy odbiorcy; niecelność przybliżamy
 * niedolotem/przelotem. To jawny model zastępczy do walidacji na heatmapach.
 */
export function fastTurnoverPoint(release, target, result, rng) {
  const fraction = result.isBlock ? 0.05 + rng.float() * 0.85
    : result.isDrop || result.isWindDrop ? 1 : 0.8 + rng.float() * 0.4
  return {
    x: clampFieldX(release.x + (target.x - release.x) * fraction),
    y: clampFieldY(release.y + (target.y - release.y) * fraction),
  }
}
