import { playerBody } from '../src/models/playerBody.js'

/** Diagnostic footprint overlaps, not a foul detector or a collision resolver. */
export function bodyExposure(frames, players) {
  const radii = new Map(players.map(p => [p.id, playerBody(p).shoulderWidthM / 2]))
  let flightFrames = 0, overlapFrames = 0, overlappingPairs = 0
  for (const f of frames) {
    if (f.disc?.state !== 'IN_FLIGHT') continue
    flightFrames++
    let count = 0
    for (let i = 0; i < f.players.length; i++) for (let j = i + 1; j < f.players.length; j++) {
      const a = f.players[i], b = f.players[j]
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1.5) continue
      const radius = (radii.get(a.id) ?? 0.21) + (radii.get(b.id) ?? 0.21)
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < radius ** 2) count++
    }
    overlappingPairs += count
    if (count) overlapFrames++
  }
  return { flightFrames, overlapFrames, overlappingPairs }
}
