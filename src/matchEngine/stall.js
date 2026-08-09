import { MATCH_CONFIG } from './config.js'
import { weightedLegacyStat, getSubStat, readLegacySkill } from '../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale, moraleSkillMultiplier } from '../models/playerMorale.js'
import { getTraitMods } from '../models/playerTraits.js'

export const STALL_MAX = 10
/** Jedna jednostka stalla = 1 sekunda krycia. */
export const STALL_SECOND_MS = 1000

/** Skala kary do celności za presję stall (tier medium/high) — patrz stallThrowModifiers. */
const HIGH_STALL_PENALTY_SCALE = 0.48

/**
 * Stall z czasu posiadania dysku: 1 s → 1, 2 s → 2, …, 10 s → 10 (stall-out).
 * Przed upływem pierwszej sekundy zwraca 0 (brak wyświetlenia).
 */
export function stallCountFromHoldMs(holdMs) {
  if (holdMs == null || holdMs < STALL_SECOND_MS) return 0
  return Math.min(STALL_MAX, Math.floor(holdMs / STALL_SECOND_MS))
}

/** Czy minął pełny stall 10 (automatyczny turnover). */
export function isStallOutHoldMs(holdMs) {
  return (holdMs ?? 0) >= STALL_MAX * STALL_SECOND_MS
}

/** Stall używany przez AI — w pierwszej sekundzie traktuj jak 1. */
export function decisionStallFromHoldMs(holdMs) {
  return Math.max(1, stallCountFromHoldMs(holdMs) || 1)
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Composure i decision making z podstatystyk mentalnych (+ morale). */
export function throwerMentalStats(thrower) {
  const s = thrower?.skills ?? {}
  const morale = getPlayerMorale(thrower)
  const composure = applyMoraleToStat(getSubStat(s, 'mental', 'composure'), morale)
  const decisionMaking = applyMoraleToStat(getSubStat(s, 'mental', 'decisionMaking'), morale)
  const vision = applyMoraleToStat(getSubStat(s, 'mental', 'vision'), morale)
  const throwing = applyMoraleToStat(readLegacySkill(s, 'throwing'), morale)
  return {
    composure: composure * 0.7 + throwing * 0.3,
    decisionMaking: decisionMaking * 0.65 + vision * 0.35,
  }
}

/** Presja markera 0–30 — staty obrońcy + tight coverage. */
export function markerPressureRating(defender, separation) {
  const { defenseWeights } = MATCH_CONFIG.skillCheck
  const traitMods = getTraitMods(defender)
  const defSkill = defender
    ? weightedLegacyStat(defender.skills ?? {}, defenseWeights) *
      moraleSkillMultiplier(getPlayerMorale(defender))
    : 50
  let pressure = defSkill * 0.12 + (traitMods.markPressureBonus ?? 0)
  pressure *= traitMods.poachMarkPressureMult ?? 1
  if (separation?.outcome === 'tight') pressure += 10 + (separation.throwPenalty ?? 0) * 0.35
  else if (separation?.outcome === 'contested') pressure += 4
  else if (separation?.outcome === 'open') pressure -= 6
  return clamp(pressure, 0, 30)
}

export function stallTier(stallCount) {
  if (stallCount <= 4) return 'low'
  if (stallCount <= 7) return 'medium'
  if (stallCount <= 9) return 'high'
  return 'stall_out'
}

/**
 * Modyfikatory testu rzutu zależne od stallu, composure i presji markera.
 */
export function stallThrowModifiers({
  thrower,
  defender,
  stallCount,
  separation,
  rng,
  fatigueComposurePenalty = 0,
}) {
  const tier = stallTier(stallCount)
  const mental = throwerMentalStats(thrower)
  const pressure = markerPressureRating(defender, separation)
  const traitMods = getTraitMods(thrower)

  let accuracyBonus = 0
  let accuracyPenalty = 0
  let randomSpreadBonus = 0
  let blockRiskMod = 0
  let forcedContested = false
  let badDecision = false

  if (tier === 'low') {
    accuracyBonus += 5 + mental.decisionMaking * 0.05 - pressure * 0.15
    accuracyBonus += traitMods.lowStallAccuracy
  } else if (tier === 'medium') {
    // Kara stall-presji przycięta ~0.48x — stall 9 miał zbijać completion do ~40%,
    // docelowo ~75% (presja realna, ale nie decydująca sama z siebie).
    accuracyPenalty += (3 + pressure * 0.25 + (stallCount - 4) * 0.8) * HIGH_STALL_PENALTY_SCALE
    if (stallCount >= 5) accuracyPenalty -= traitMods.highStallAccuracy * 0.35
    const composureDrain = fatigueComposurePenalty ?? 0
    const badChance =
      (0.1 + (58 - mental.decisionMaking) * 0.005 + pressure * 0.015 + composureDrain * 0.012) *
      traitMods.badDecisionMult
    badDecision = rng.float() < clamp(badChance, 0.05, 0.55)
  } else if (tier === 'high') {
    forcedContested = true
    accuracyPenalty +=
      (6 + (10 - stallCount) * -0.5 + pressure * 0.2 + (fatigueComposurePenalty ?? 0) * 0.25) *
      HIGH_STALL_PENALTY_SCALE
    accuracyPenalty -= traitMods.highStallAccuracy
    if (stallCount >= 8) accuracyBonus += traitMods.stall8PlusAccuracy
    randomSpreadBonus += 12 - mental.composure * 0.06
    blockRiskMod -= 6
  }

  return {
    tier,
    accuracyBonus,
    accuracyPenalty,
    randomSpreadBonus,
    blockRiskMod,
    forcedContested,
    badDecision,
    pressure,
  }
}

export function stallDisplayBand(stallCount) {
  const n = Math.round(stallCount ?? 0)
  if (n <= 4) return 'low'
  if (n <= 7) return 'medium'
  return 'high'
}
