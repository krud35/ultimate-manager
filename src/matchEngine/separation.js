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
 * JEDNA definicja progów separacji dla OBU silników — w METRACH.
 *
 * Wcześniej każdy silnik miał własną skalę i własne progi: pełny liczył realną odległość
 * w metrach (open >5.5, contested >3), a fastMode margines w punktach statystyk
 * (open >14, contested >4). To samo pole `separation.margin` znaczyło więc co innego w
 * każdej ścieżce, mimo że trafiało do tych samych formuł — m.in. do
 * `defenderSpeedMult = 1 - margin*0.03` w createFlightContext, wykalibrowanego na
 * rozkładzie punktowym (p90 ≈ 17.7), a karmionego metrami (p90 ≈ 8). Etykieta „tight"
 * również znaczyła w obu silnikach coś innego, choć obie trafiały do tej samej
 * DISTANCE_GAP_TABLE.
 */
export const SEPARATION_OPEN_M = 5.5
export const SEPARATION_CONTESTED_M = 3

/**
 * Wspólna klasyfikacja: realna (albo oszacowana) separacja w metrach → wynik.
 * `abort` zależy od stalla — im większa presja, tym rzadziej rzucający rezygnuje z looku.
 */
export function classifySeparationM(sepM, rng, stallCount = 1) {
  if (sepM > SEPARATION_OPEN_M) {
    return { outcome: 'open', abort: false, throwBonus: 14, throwPenalty: 0, margin: sepM }
  }
  if (sepM > SEPARATION_CONTESTED_M) {
    return { outcome: 'contested', abort: false, throwBonus: 4, throwPenalty: 0, margin: sepM }
  }
  const abortChance = stallCount >= 7 ? 0.12 : stallCount >= 4 ? 0.22 : 0.38
  const abort = rng?.float ? rng.float() < abortChance : false
  return { outcome: 'tight', abort, throwBonus: 0, throwPenalty: 12, margin: sepM }
}

/**
 * Oszacowanie separacji w METRACH z porównania statystyk — fastMode nie ma geometrii,
 * więc musi ją przybliżyć, ale wynik jest w tej samej jednostce co w pełnym silniku.
 * Kalibracja odwzorowuje dawne progi punktowe: margines 14 pkt (dawne „open") wypada
 * ~5.5 m, margines 0 ~3.2 m, więc rozkład koszyków zostaje zbliżony.
 */
const SEP_METERS_AT_ZERO_MARGIN = 3.2
const SEP_METERS_PER_MARGIN_POINT = 0.165

/**
 * Test wychodzenia na pozycję: odbiorca vs obrońca (fastMode — bez geometrii).
 */
export function resolveSeparation({ receiver, defender, rng, stallCount = 1 }) {
  const recvScore =
    compressSeparationSkill(weighted(receiver.skills, { catching: 0.55, speed: 0.45 })) +
    randomSpread(rng, 14)
  const defScore =
    compressSeparationSkill(weighted(defender.skills, { defense: 0.5, speed: 0.35, catching: 0.15 })) +
    negativeRandomSpread(rng, 12)

  const statMargin = recvScore - defScore
  const estimatedSepM = Math.max(
    0,
    SEP_METERS_AT_ZERO_MARGIN + statMargin * SEP_METERS_PER_MARGIN_POINT,
  )
  return classifySeparationM(estimatedSepM, rng, stallCount)
}
