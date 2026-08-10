import { randomSpread, negativeRandomSpread } from './rng.js'

import { weightedLegacyStat } from '../models/playerStats.js'

function weighted(skills, weights) {
  return weightedLegacyStat(skills, weights)
}

/**
 * Kompresja czułości separacji na surowe różnice skilli, wyśrodkowana na 60 (typowy
 * gracz — patrz komentarz przy DISTANCE_GAP_TABLE w resolution.js, kalibrowanym właśnie
 * przy skill=60). Bez tego recvScore/defScore używały surowego (0-100) skilla wprost,
 * a progi open(>14)/contested(>4)/tight(>-6) są wąskie — nawet kilka punktów różnicy
 * rosterów przerzucało większość rzutów do innego koszyka separacji, co kaskadowo (przez
 * DISTANCE_GAP_TABLE, gdzie różnica open/tight sięga ~20 pkt) dawało niemal deterministyczne
 * wyniki meczów przy realistycznych różnicach rosterów (tmp-balance-audit.mjs, suita D/F).
 * Centrowanie na 60 (zamiast 50) oznacza, że gracz o skillu dokładnie 60 zachowuje się
 * identycznie jak przed kompresją — zmieniamy WYŁĄCZNIE wrażliwość na odchylenie od 60,
 * więc DISTANCE_GAP_TABLE (skalibrowana przy skill=60) nie wymaga korekty.
 */
const SEPARATION_SENSITIVITY_SCALE = 0.19

function compressSeparationSkill(value) {
  return 60 + (value - 60) * SEPARATION_SENSITIVITY_SCALE
}

/**
 * Test wychodzenia na pozycję: odbiorca vs obrońca.
 */
export function resolveSeparation({ receiver, defender, rng }) {
  const recvScore =
    compressSeparationSkill(weighted(receiver.skills, { catching: 0.55, speed: 0.45 })) +
    randomSpread(rng, 14)
  const defScore =
    compressSeparationSkill(weighted(defender.skills, { defense: 0.5, speed: 0.35, catching: 0.15 })) +
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
