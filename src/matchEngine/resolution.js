import { MATCH_CONFIG } from './config.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES, TACTICS_MODIFIERS, forceMods } from './tacticsModifiers.js'
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

/**
 * Stała przewaga ataku: w ultimate podanie do wolnego odbiorcy jest domyślnie
 * skuteczne, obrona wygrywa dopiero przy realnej presji. Bez tego completion%
 * całej ligi schodzi poniżej 85%, gdy realnie wynosi ~90%.
 */
const OFFENSE_BASELINE_EDGE = 12

function compressSkill(value) {
  return 50 + (value - 50) * STAT_SENSITIVITY
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
  attackStyle,
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
}) {
  const { skillCheck } = MATCH_CONFIG
  const atk = attackMods(attackStyle)
  const def = defenseMods(defenseStyle)
  const force = forceMods(forceSide)
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

  const throwBase =
    compressSkill(throwStat) +
    OFFENSE_BASELINE_EDGE -
    stallComposureAccuracyPenalty(stallCount, thrower) +
    (atk.throwAccuracyBonus ?? 0) +
    profile.accuracyMod +
    throwTypeAccuracyTraitBonus(thrower, throwType) +
    (!isOpenSide ? throwerTraits.breakSideAccuracy : 0) +
    (receiverTraits.catchBonus ?? 0) +
    (throwType === THROW_TYPE.HUCK ? (force.huckLaneOpen ?? 0) * 20 : 0) +
    (force.bothSidesShort && throwType !== THROW_TYPE.HUCK ? force.bothSidesShort * 8 : 0) +
    (separation?.throwBonus ?? 0) -
    (separation?.throwPenalty ?? 0) +
    stallMods.accuracyBonus -
    stallMods.accuracyPenalty -
    throwerFatigue.throwAccuracyPenalty +
    (windMods.accuracyDelta ?? 0)

  const defenseBase =
    compressSkill(weightedLegacyStat(defender.skills, skillCheck.defenseWeights)) +
    compressSkill(subStat(defender, 'defensive', 'blocking')) * 0.12 +
    (def.defenseBonus ?? 0) +
    (def.antiVertBonus && attackStyle === ATTACK_STYLES.VERTICAL_STACK
      ? def.antiVertBonus * 0.35
      : 0) +
    profile.blockRiskMod +
    throwTypeBlockRiskTraitBonus(thrower, throwType) +
    (techniqueMods.blockRiskBonus ?? 0) +
    (forcedContested || stallMods.forcedContested ? 4 : 0) +
    stallMods.blockRiskMod

  let throwSpread =
    skillCheck.throwRandomSpread +
    (atk.throwRandomSpreadBonus ?? 0) +
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
  const zoneBlockBonus =
    defenseStyle === DEFENSE_STYLES.ZONE_CUP ? (def.blockBonus ?? 0) : 0
  const styleDefMult =
    defenseStyle === DEFENSE_STYLES.ZONE_CUP
      ? (defenderTraits.zoneDefenseBlockMult ?? 1)
      : (defenderTraits.personDefenseBlockMult ?? 1)
  let defenseScore =
    (defenseBase +
      zoneBlockBonus +
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
