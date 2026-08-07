import { randomSpread, negativeRandomSpread } from './rng.js'

import { weightedLegacyStat } from '../models/playerStats.js'

function weighted(skills, weights) {
  return weightedLegacyStat(skills, weights)
}

/**
 * Test wychodzenia na pozycję: odbiorca vs obrońca.
 */
export function resolveSeparation({ receiver, defender, rng }) {
  const recvScore =
    weighted(receiver.skills, { catching: 0.55, speed: 0.45 }) +
    randomSpread(rng, 14)
  const defScore =
    weighted(defender.skills, { defense: 0.5, speed: 0.35, catching: 0.15 }) +
    negativeRandomSpread(rng, 12)

  const margin = recvScore - defScore

  if (margin > 14) {
    return { outcome: 'open', abort: false, throwBonus: 16, throwPenalty: 0, margin }
  }
  if (margin > 4) {
    return { outcome: 'contested', abort: false, throwBonus: 4, throwPenalty: 0, margin }
  }
  if (margin > -6) {
    const abort = rng.float() < 0.42
    return { outcome: 'tight', abort, throwBonus: 0, throwPenalty: 11, margin }
  }
  const abort = rng.float() < 0.58
  return { outcome: 'tight', abort, throwBonus: 0, throwPenalty: 18, margin }
}
