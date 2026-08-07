/**
 * Smoke test: dominant hand, techniki rzutu, wzory statystyk (fallback 50).
 */
import { getDominantHand, DOMINANT_HAND } from '../src/models/playerProfile.js'
import {
  resolveThrowTechnique,
  THROW_TECHNIQUE,
} from '../src/matchEngine/throwTechnique.js'
import {
  maxSpeedMps,
  defenderReactionDelayMs,
  throwScanRadiusM,
  stallComposureAccuracyPenalty,
  coverageCushionMeters,
} from '../src/matchEngine/ai/statFormulas.js'
import { resolveThrow } from '../src/matchEngine/resolution.js'
import { createRng } from '../src/matchEngine/rng.js'
import { ATTACK_STYLES, DEFENSE_STYLES } from '../src/matchEngine/tacticsModifiers.js'

const legacyPlayer = { id: 999, skills: {} }
const nestedPlayer = {
  id: 1001,
  dominantHand: DOMINANT_HAND.RIGHT,
  skills: {
    throwing: { backhand: 80, forehand: 85, huck: 75, hammer: 70 },
    physical: { speed: 88, endurance: 82, agility: 90, jump: 77 },
    mental: { vision: 84, composure: 79, reactions: 81, decisionMaking: 83 },
    offensive: {
      cutterMovement: 86,
      handlerMovement: 72,
      offensiveSystemsKnowledge: 80,
      catching: 85,
    },
    defensive: {
      defensiveCutterMovement: 78,
      defensiveHandlerMovement: 74,
      defensiveSystemsKnowledge: 76,
      blocking: 77,
    },
  },
}

const fhOpenRh = resolveThrowTechnique({
  dominantHand: DOMINANT_HAND.RIGHT,
  forceSide: 'home',
  isOpenSide: true,
})
const bhBreakRh = resolveThrowTechnique({
  dominantHand: DOMINANT_HAND.RIGHT,
  forceSide: 'home',
  isOpenSide: false,
})

if (fhOpenRh !== THROW_TECHNIQUE.FOREHAND || bhBreakRh !== THROW_TECHNIQUE.BACKHAND) {
  throw new Error(`RH force forehand: expected fh/bh open/break, got ${fhOpenRh}/${bhBreakRh}`)
}

const fhOpenLh = resolveThrowTechnique({
  dominantHand: DOMINANT_HAND.LEFT,
  forceSide: 'home',
  isOpenSide: true,
})
if (fhOpenLh !== THROW_TECHNIQUE.BACKHAND) {
  throw new Error(`LH open force forehand should be backhand, got ${fhOpenLh}`)
}

const legacySpeed = maxSpeedMps(legacyPlayer)
if (legacySpeed < 4.2 || legacySpeed > 7.5) throw new Error(`legacy speed ${legacySpeed}`)

const legacyReact = defenderReactionDelayMs(legacyPlayer)
if (legacyReact !== 200) {
  throw new Error(`legacy reactions delay ${legacyReact}, expected 200 (derived default 60)`)
}

const rng = createRng(42)
const res = resolveThrow({
  thrower: nestedPlayer,
  receiver: nestedPlayer,
  defender: nestedPlayer,
  rng,
  attackStyle: ATTACK_STYLES.VERTICAL_STACK,
  defenseStyle: DEFENSE_STYLES.PERSON,
  stallCount: 8,
  forceSide: 'home',
  isOpenSide: false,
})
if (!res.throwTechnique) throw new Error('missing throwTechnique on result')

console.log('smoke-match-stats OK', {
  dominantHand: getDominantHand(nestedPlayer),
  technique: res.throwTechnique,
  scanR: throwScanRadiusM(nestedPlayer).toFixed(1),
  cushion: coverageCushionMeters(nestedPlayer).toFixed(2),
  stallPen: stallComposureAccuracyPenalty(8, nestedPlayer).toFixed(2),
})
