import { MATCH_CONFIG } from './config.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES, TACTICS_MODIFIERS } from './tacticsModifiers.js'
import { negativeRandomSpread, randomSpread } from './rng.js'
import {
  staminaPerformancePenalty,
  staminaThrowCollapsePenalty,
  motionFatigueModifiers,
} from './stamina.js'
import { throwProfile, THROW_TYPE } from './throwTypes.js'
import { discMetersFromState } from './fieldViz.js'
import { FIELD_DIMENSIONS } from './fieldDimensions.js'
import { stallThrowModifiers } from './stall.js'
import { weightedLegacyStat } from '../models/playerStats.js'
import {
  resolveThrowTechniqueForPlayer,
  techniqueAccuracyBase,
} from './throwTechnique.js'
import { stallComposureAccuracyPenalty, subStat } from './ai/statFormulas.js'
import {
  getTraitMods,
  throwTypeAccuracyTraitBonus,
  throwTypeBlockRiskTraitBonus,
} from '../models/playerTraits.js'
import { windThrowModifiers } from './wind.js'

/**
 * Kompresja różnic w atrybutach wokół poziomu 50. Lepszy zawodnik ma wygrywać
 * częściej, ale bez tego 20 punktów przewagi w statystykach dawało wyniki 15-0.
 */
const STAT_SENSITIVITY = 0.65

function compressSkill(value) {
  return 50 + (value - 50) * STAT_SENSITIVITY
}

/**
 * Kategorie dystansu rzutu — determinują bazową trudność niezależnie od typu rzutu
 * (dystans sam w sobie nie wpływał wcześniej na completion%, tylko wiatr; teraz
 * jest jawną osią trudności, tak jak strona (open/break) i separacja odbiorcy).
 */
const THROW_DISTANCE_CATEGORY = {
  DUMP: 'dump',
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  HUCK: 'huck',
}

export function throwDistanceCategory(distanceM) {
  const d = Number(distanceM) || 0
  if (d < 5) return THROW_DISTANCE_CATEGORY.DUMP
  if (d < 15) return THROW_DISTANCE_CATEGORY.SHORT
  if (d < 25) return THROW_DISTANCE_CATEGORY.MEDIUM
  if (d < 40) return THROW_DISTANCE_CATEGORY.LONG
  return THROW_DISTANCE_CATEGORY.HUCK
}

/**
 * Docelowy gap (throwBase − defenseBase) skalibrowany binary-search NA PRAWDZIWYM
 * resolveThrow() (tmp-calibrate-real.mjs, __debugGapOverride) przy stallCount=2 (typowy,
 * niewymuszony rzut) i przeciętnym (60) rzucającym/odbiorcy/obrońcy — łapie realne
 * efekty uboczne (stallMods niskiego stallu, skillAdjustment, technikę rzutu), których
 * nie widziała czysto abstrakcyjna kalibracja szumu. Klucz = strona (open/break) +
 * separacja odbiorcy (Open/Contested/Tight — margines z resolveSeparation).
 */
const DISTANCE_GAP_TABLE = {
  dump: { openOpen: 9.3, openContested: 8.9, openTight: 0.6, breakOpen: 12.4, breakContested: 5.7, breakTight: -2.6 },
  short: { openOpen: 5.9, openContested: 4.6, openTight: -4.4, breakOpen: 10.1, breakContested: 3.5, breakTight: -6.7 },
  medium: { openOpen: 4.7, openContested: 3.2, openTight: -7.0, breakOpen: 8.7, breakContested: 2.5, breakTight: -8.6 },
  long: { openOpen: 3.2, openContested: 0.3, openTight: -10.6, breakOpen: 7.7, breakContested: 1.4, breakTight: -10.6 },
  huck: { openOpen: 0.3, openContested: -1.4, openTight: -17.9, breakOpen: 3.5, breakContested: -0.7, breakTight: -17.9 },
}

/** Waga wpływu umiejętności rzucającego wokół bazy kategorii — mocniej na break-side/huck. */
const SKILL_ADJUST_WEIGHT = {
  dump: { open: 2, break: 4 },
  short: { open: 3, break: 6 },
  medium: { open: 4, break: 8 },
  long: { open: 5, break: 10 },
  huck: { open: 8, break: 15 },
}

function distanceGapFor(category, isOpenSide, separationOutcome) {
  const row = DISTANCE_GAP_TABLE[category] ?? DISTANCE_GAP_TABLE.medium
  const sepKey = separationOutcome === 'open' ? 'Open' : separationOutcome === 'tight' ? 'Tight' : 'Contested'
  const sideKey = isOpenSide ? 'open' : 'break'
  return row[`${sideKey}${sepKey}`] ?? row.openContested
}

function skillAdjustment(throwStat, category, isOpenSide) {
  const weights = SKILL_ADJUST_WEIGHT[category] ?? SKILL_ADJUST_WEIGHT.medium
  const w = isOpenSide ? weights.open : weights.break
  return ((throwStat - 50) / 50) * w
}

function attackMods(attackStyle) {
  return (
    TACTICS_MODIFIERS.attack[attackStyle] ??
    TACTICS_MODIFIERS.attack[ATTACK_STYLES.VERTICAL_STACK]
  )
}

function defenseMods(defenseStyle) {
  return (
    TACTICS_MODIFIERS.defense[defenseStyle] ??
    TACTICS_MODIFIERS.defense[DEFENSE_STYLES.PERSON]
  )
}

/**
 * Obrońca na torze lotu — niezależna szansa bloku (agility / reactions / vision).
 * Zwraca null gdy nikt nie przerywa lotu.
 */
export function rollLaneBlock({
  laneThreats = [],
  rng,
  throwType = THROW_TYPE.STANDARD,
  thrower = null,
}) {
  if (!laneThreats.length || !rng) return null
  const profile = throwProfile(throwType)
  // Huck/OTT lecą wyżej — trudniej wyciągnąć rękę ze środka toru.
  const heightFactor =
    throwType === THROW_TYPE.HUCK || throwType === THROW_TYPE.OVER_THE_TOP ? 0.55 : 1
  const dumpFactor = throwType === THROW_TYPE.DUMP_SWING ? 0.75 : 1

  // Thrower z vision/decision lepiej omija tor (placement).
  const vision = thrower ? subStat(thrower, 'mental', 'vision') : 50
  const decision = thrower ? subStat(thrower, 'mental', 'decisionMaking') : 50
  const placement = Math.max(0.45, Math.min(1, (vision * 0.5 + decision * 0.5) / 100))
  const avoidMult = 1.15 - placement * 0.55

  for (const threat of laneThreats.slice(0, 3)) {
    const d = threat.defender
    if (!d) continue
    // Lekkie ocieranie toru nie daje bloku — tylko realne wejście w lane.
    if ((threat.threat ?? 0) < 0.42) continue
    const agility = subStat(d, 'physical', 'agility')
    const reactions = subStat(d, 'mental', 'reactions')
    const defVision = subStat(d, 'mental', 'vision')
    const blocking = subStat(d, 'defensive', 'blocking')
    const skill =
      agility * 0.34 + reactions * 0.34 + defVision * 0.2 + blocking * 0.12
    // Rzadki event: elita w środku toru ~4–7%, przeciętny ~1–3%.
    const base =
      (threat.threat ?? 0) *
      (0.008 + (skill / 100) * 0.055) *
      heightFactor *
      dumpFactor *
      avoidMult
    const profileBoost = 1 + Math.max(0, (profile.blockRiskMod ?? 0) / 120)
    const chance = Math.min(0.12, base * profileBoost)
    if (rng.float() < chance) {
      return { defender: d, defenderId: threat.defenderId ?? d.id, chance }
    }
  }
  return null
}

/**
 * Test umiejętności rzutu z typem podania i separation.
 */
export function resolveThrow({
  thrower,
  receiver,
  defender,
  rng,
  defenseStyle,
  throwType = THROW_TYPE.STANDARD,
  separation = null,
  stallCount = 0,
  forcedContested = false,
  forceSide = FORCE_SIDES.FORCE_FOREHAND,
  isOpenSide = true,
  throwTechnique = null,
  throwerY,
  laneThreats = null,
  wind = null,
  throwDx = 0,
  throwDy = 0,
  throwDistanceM = null,
  /** Tylko do kalibracji (tmp-calibrate-*.mjs) — pomija tabelę DISTANCE_GAP_TABLE. */
  __debugGapOverride = null,
}) {
  const { skillCheck } = MATCH_CONFIG
  const profile = throwProfile(throwType)
  const windMods = windThrowModifiers({
    wind,
    throwDx,
    throwDy,
    throwType,
    thrower,
    distanceM: throwDistanceM ?? Math.hypot(throwDx, throwDy),
  })

  const techCtx = resolveThrowTechniqueForPlayer(thrower, {
    forceSide,
    isOpenSide,
    throwerY,
  })
  const technique = throwTechnique ?? techCtx.technique
  const techniqueMods = {
    accuracyMult: techCtx.accuracyMult,
    blockRiskBonus: techCtx.blockRiskBonus,
  }
  if (throwTechnique && throwTechnique !== techCtx.technique) {
    const alt = resolveThrowTechniqueForPlayer(thrower, { forceSide, isOpenSide, throwerY })
    techniqueMods.accuracyMult = alt.accuracyMult
    techniqueMods.blockRiskBonus = alt.blockRiskBonus
  }

  const stallMods = stallThrowModifiers({
    thrower,
    defender,
    stallCount,
    separation,
    rng,
    fatigueComposurePenalty: motionFatigueModifiers(thrower.currentStamina ?? 100)
      .composurePenalty,
  })

  const throwerFatigue = motionFatigueModifiers(thrower.currentStamina ?? 100)

  let throwSkill = techniqueAccuracyBase(thrower, technique, throwType)
  throwSkill *= techniqueMods.accuracyMult ?? 1

  const throwStat =
    throwSkill * 0.72 +
    weightedLegacyStat(thrower.skills, skillCheck.throwWeights) * 0.13 +
    weightedLegacyStat(receiver.skills, { catching: 0.6, speed: 0.4 }) * 0.15

  const throwerTraits = getTraitMods(thrower)
  const receiverTraits = getTraitMods(receiver)
  const defenderTraits = getTraitMods(defender)

  const distanceM = throwDistanceM ?? Math.hypot(throwDx, throwDy)
  const distanceCategory = throwDistanceCategory(distanceM)
  const baseGap =
    __debugGapOverride ?? distanceGapFor(distanceCategory, isOpenSide, separation?.outcome)

  const throwBase =
    baseGap +
    skillAdjustment(throwStat, distanceCategory, isOpenSide) -
    stallComposureAccuracyPenalty(stallCount, thrower) +
    throwTypeAccuracyTraitBonus(thrower, throwType) +
    (!isOpenSide ? throwerTraits.breakSideAccuracy : 0) +
    (receiverTraits.catchBonus ?? 0) +
    stallMods.accuracyBonus -
    stallMods.accuracyPenalty -
    throwerFatigue.throwAccuracyPenalty +
    (windMods.accuracyDelta ?? 0)

  // Obrońca wpływa na rzut głównie przez separację (resolveSeparation, wcześniej w
  // pipeline) — tu zostaje tylko wąski "hands" skill (D w momencie rzutu), wyśrodkowany
  // wokół 0 przy przeciętnej umiejętności, żeby nie przesuwać skalibrowanego baseGap.
  const defenseBase =
    (compressSkill(subStat(defender, 'defensive', 'blocking')) - 50) * 0.12 +
    throwTypeBlockRiskTraitBonus(thrower, throwType) +
    (techniqueMods.blockRiskBonus ?? 0) +
    (forcedContested || stallMods.forcedContested ? 4 : 0) +
    stallMods.blockRiskMod

  let throwSpread =
    skillCheck.throwRandomSpread +
    profile.randomSpreadBonus +
    stallMods.randomSpreadBonus
  if (throwType === THROW_TYPE.HUCK) throwSpread *= throwerTraits.huckSpreadMult
  throwSpread *= windMods.spreadMult ?? 1

  let throwScore =
    throwBase +
    randomSpread(rng, throwSpread) -
    staminaPerformancePenalty(thrower.currentStamina ?? 100) -
    staminaPerformancePenalty(receiver.currentStamina ?? 100) * 0.35 -
    staminaThrowCollapsePenalty(thrower.currentStamina ?? 100)
  const styleDefMult =
    defenseStyle === DEFENSE_STYLES.ZONE_CUP
      ? (defenderTraits.zoneDefenseBlockMult ?? 1)
      : (defenderTraits.personDefenseBlockMult ?? 1)
  let defenseScore =
    (defenseBase +
      negativeRandomSpread(rng, skillCheck.defenseRandomSpread) -
      staminaPerformancePenalty(defender.currentStamina ?? 100)) *
    (defenderTraits.blockChanceMult ?? 1) *
    styleDefMult

  let success = throwScore > defenseScore
  let isBlock = !success && throwScore + 8 < defenseScore
  let isLaneBlock = false
  let laneBlocker = null
  let isWindDrop = false

  // Nawet przy „sukcesie” vs krycie odbiorcy — obrońca na torze może ściąć dysk.
  if (success && laneThreats?.length) {
    const lane = rollLaneBlock({ laneThreats, rng, throwType, thrower })
    if (lane) {
      success = false
      isBlock = true
      isLaneBlock = true
      laneBlocker = lane.defender
      defenseScore = Math.max(defenseScore, throwScore + 10)
    }
  }

  // Downwind touch / cross flutter — drop mimo wygranej vs marker
  if (success && (windMods.dropChanceBonus ?? 0) > 0 && rng?.float) {
    if (rng.float() < windMods.dropChanceBonus) {
      success = false
      isBlock = false
      isWindDrop = true
    }
  }

  return {
    success,
    throwScore: Math.round(throwScore),
    defenseScore: Math.round(defenseScore),
    isBlock,
    isLaneBlock,
    laneBlocker,
    stallTier: stallMods.tier,
    forcedContested: forcedContested || stallMods.forcedContested,
    throwTechnique: technique,
    dominantHand: techCtx.dominantHand,
    windRelation: windMods.relation,
    windAdvanceMult: windMods.advanceMult,
    isWindDrop,
  }
}

export function isInEndzone(discPosition, possessionTeam) {
  if (!possessionTeam) {
    return discPosition >= MATCH_CONFIG.field.max
  }
  const fieldX = discMetersFromState(discPosition, possessionTeam)
  const line = FIELD_DIMENSIONS.lengthM - FIELD_DIMENSIONS.endzoneM
  if (possessionTeam === 'home') {
    return fieldX >= line
  }
  return fieldX <= FIELD_DIMENSIONS.endzoneM
}

/** @deprecated użyj computeThrowAdvance z throwTypes.js */
export function advanceDisc(discPosition, { attackStyle, defenseStyle } = {}) {
  const { advanceOnSuccess, max } = MATCH_CONFIG.field
  const atk = attackMods(attackStyle)
  const def = defenseMods(defenseStyle)
  let advance = advanceOnSuccess
  advance *= atk.advanceMultiplier ?? 1
  advance *= def.yardsAllowedMultiplier ?? 1
  return Math.min(max, discPosition + Math.round(advance))
}

export { computeThrowAdvance } from './throwTypes.js'

/** Po turnoverze ta sama linia boiska, ale perspektywa drużyny się odwraca. */
export function flipDiscPosition(discPosition) {
  const { min, max } = MATCH_CONFIG.field
  return max - discPosition + min
}
