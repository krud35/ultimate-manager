import { DEFENSE_STYLES, ATTACK_STYLES, TACTICS_MODIFIERS } from './tacticsModifiers.js'
import { randomSpread } from './rng.js'
import { MATCH_CONFIG } from './config.js'
import { windThrowModifiers } from './wind.js'
import {
  markerPressureRating,
  stallThrowModifiers,
  stallTier,
  throwerMentalStats,
} from './stall.js'
import { readLegacySkill } from '../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale } from '../models/playerMorale.js'
import { mergeTraitAndCoachMods } from './coachDirectives.js'
import { HUCK_MIN_YARDS } from './matchStats.js'

export const THROW_TYPE = {
  STANDARD: 'standard',
  HUCK: 'huck',
  DUMP_SWING: 'dump_swing',
  OVER_THE_TOP: 'over_the_top',
}

export const THROW_TRAJECTORY = {
  FORWARD: 'forward',
  DEEP: 'deep',
  LATERAL: 'lateral',
  OVERHEAD: 'overhead',
}

const PROFILES = {
  [THROW_TYPE.STANDARD]: {
    label: 'Forehand/Backhand',
    shortLabel: 'Standard',
    baseYards: () => MATCH_CONFIG.field.advanceOnSuccess,
    accuracyMod: 0,
    randomSpreadBonus: 0,
    blockRiskMod: 0,
    trajectory: THROW_TRAJECTORY.FORWARD,
  },
  [THROW_TYPE.HUCK]: {
    label: 'Huck',
    shortLabel: 'Huck',
    baseYards: () => 32,
    accuracyMod: -18,
    randomSpreadBonus: 12,
    blockRiskMod: 10,
    trajectory: THROW_TRAJECTORY.DEEP,
  },
  [THROW_TYPE.DUMP_SWING]: {
    label: 'Dump/Swing',
    shortLabel: 'Dump',
    baseYards: () => -2,
    accuracyMod: 14,
    randomSpreadBonus: -6,
    blockRiskMod: -6,
    trajectory: THROW_TRAJECTORY.LATERAL,
  },
  [THROW_TYPE.OVER_THE_TOP]: {
    label: 'Hammer/Scoober',
    shortLabel: 'Over the top',
    baseYards: () => 16,
    accuracyMod: -6,
    randomSpreadBonus: 8,
    blockRiskMod: 10,
    trajectory: THROW_TRAJECTORY.OVERHEAD,
  },
}

export function throwProfile(type) {
  return PROFILES[type] ?? PROFILES[THROW_TYPE.STANDARD]
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

function throwerSkill(thrower) {
  const s = thrower.skills ?? {}
  const morale = getPlayerMorale(thrower)
  return (
    applyMoraleToStat(readLegacySkill(s, 'throwing'), morale) * 0.55 +
    applyMoraleToStat(readLegacySkill(s, 'vision'), morale) * 0.45
  )
}

/**
 * Wybór typu rzutu: stall 1–10, presja markera, staty handlera.
 */
export function pickThrowType({
  rng,
  thrower,
  discPosition,
  stallCount,
  defenseStyle,
  attackStyle,
  defender = null,
  separation = null,
  tactics = null,
}) {
  const tier = stallTier(stallCount)
  const mental = throwerMentalStats(thrower)
  const pressure = markerPressureRating(defender, separation)
  const stallMods = stallThrowModifiers({
    thrower,
    defender,
    stallCount,
    separation,
    rng,
  })

  if (tier === 'high') {
    const roll = rng.float()
    if (roll < 0.42) return THROW_TYPE.DUMP_SWING
    if (roll < 0.68) return THROW_TYPE.OVER_THE_TOP
    if (roll < 0.88) return THROW_TYPE.STANDARD
    return THROW_TYPE.HUCK
  }

  if (tier === 'medium') {
    if (stallMods.badDecision) {
      return rng.float() < 0.55 ? THROW_TYPE.HUCK : THROW_TYPE.OVER_THE_TOP
    }
    if (rng.float() < 0.52 + (stallCount - 4) * 0.04) {
      return THROW_TYPE.DUMP_SWING
    }
  }

  if (stallCount > 6) {
    return rng.float() < 0.82 ? THROW_TYPE.DUMP_SWING : THROW_TYPE.STANDARD
  }

  const weights = {
    [THROW_TYPE.STANDARD]: 48,
    [THROW_TYPE.HUCK]: 8,
    [THROW_TYPE.DUMP_SWING]: 10,
    [THROW_TYPE.OVER_THE_TOP]: 6,
  }

  const traitMods = mergeTraitAndCoachMods(thrower, tactics, 'offense')
  const effectiveStall = stallCount + (traitMods.resetFirstStallBias || 0)

  const skill = throwerSkill(thrower)
  const deepField = discPosition >= 52
  const midField = discPosition >= 35 && discPosition < 52

  if (tier === 'low') {
    weights[THROW_TYPE.STANDARD] += 12 + mental.decisionMaking * 0.08 - pressure * 0.2
    weights[THROW_TYPE.HUCK] = Math.max(2, weights[THROW_TYPE.HUCK] - 4)
  }

  if (deepField && skill >= 58) weights[THROW_TYPE.HUCK] += 22
  if (midField && skill >= 62) weights[THROW_TYPE.HUCK] += 12

  if (defenseStyle === DEFENSE_STYLES.ZONE_CUP) {
    const zoneBoost = traitMods.zoneOffenseWeightMult ?? 1
    weights[THROW_TYPE.OVER_THE_TOP] += 18 * zoneBoost
    weights[THROW_TYPE.STANDARD] -= 8
    if (zoneBoost > 1) {
      weights[THROW_TYPE.STANDARD] += 4 * (zoneBoost - 1)
      weights[THROW_TYPE.DUMP_SWING] += 6 * (zoneBoost - 1)
    }
  }

  if (effectiveStall >= 4 && tier !== 'low') {
    weights[THROW_TYPE.DUMP_SWING] += 14 + traitMods.resetFirstStallBias * 4
    weights[THROW_TYPE.OVER_THE_TOP] += 8
  }

  if (discPosition < 28) {
    weights[THROW_TYPE.HUCK] = Math.max(2, weights[THROW_TYPE.HUCK] - 15)
    weights[THROW_TYPE.STANDARD] += 10
  }

  if (skill >= 70) weights[THROW_TYPE.OVER_THE_TOP] += 6

  // Styl ataku: w pełnym silniku (tickowym) te same pola (tacticsBehavior.js,
  // applyAttackThrowBias/preferredCutKind) kierują wyborem cutu/rzutu; fastMode
  // pomija symulację przestrzenną, więc bez tego attackStyle nie miał TU żadnego
  // wpływu (jedyną dźwignią był advanceMultiplier w computeThrowAdvance) — patrz
  // audyt balansu, tmp-balance-audit.mjs. Lekki, proporcjonalny odpowiednik tej
  // samej logiki, w przestrzeni wag zamiast oceny pojedynczej opcji.
  const atk = attackMods(attackStyle)
  const throwDepthBias = atk.throwDepthBias ?? 0
  if (throwDepthBias !== 0) {
    const deepMult = Math.max(0.4, 1 + throwDepthBias * 0.9)
    weights[THROW_TYPE.HUCK] *= deepMult
    weights[THROW_TYPE.OVER_THE_TOP] *= deepMult
    weights[THROW_TYPE.STANDARD] *= Math.max(0.7, 1 - throwDepthBias * 0.25)
  }
  const resetPriority = atk.resetPriority ?? 0
  if (resetPriority !== 0) {
    weights[THROW_TYPE.DUMP_SWING] *= Math.max(0.5, 1 + resetPriority * 0.8)
  }
  const continuationUrgency = atk.continuationUrgency ?? 0
  if (continuationUrgency > 0.3) {
    const flowExtra = continuationUrgency - 0.3
    weights[THROW_TYPE.STANDARD] *= 1 + flowExtra * 0.5
    weights[THROW_TYPE.HUCK] *= Math.max(0.5, 1 - flowExtra * 0.6)
  }
  if ((atk.isoBias ?? 0) > 0) {
    weights[THROW_TYPE.HUCK] *= 1 + atk.isoBias * 0.35
  }
  if (atk.swingBias) {
    // Zone O jest jedynym stylem z resetPriority + continuationUrgency + swingBias
    // naraz, wszystkie podbijające DUMP_SWING (który ma ujemny baseYards) — pełna
    // waga 0.5 kompoundowała do ~1.47x, robiąc zone wyraźnie najsłabszym stylem
    // (tmp-vertical-matrix-check.mjs: 48.0% vs 53-58% reszty). Przycięte do 0.2.
    weights[THROW_TYPE.DUMP_SWING] *= 1 + atk.swingBias * 0.2
  }

  weights[THROW_TYPE.HUCK] *= traitMods.huckWeightMult
  weights[THROW_TYPE.DUMP_SWING] *= traitMods.dumpWeightMult * (1 + (traitMods.dumpEarlyBias ?? 0) * 0.35)
  weights[THROW_TYPE.OVER_THE_TOP] *= traitMods.ottWeightMult * (traitMods.heroThrowWeightMult ?? 1)
  weights[THROW_TYPE.STANDARD] *= traitMods.standardWeightMult

  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rng.float() * total
  for (const [type, w] of entries) {
    roll -= w
    if (roll <= 0) return type
  }
  return THROW_TYPE.STANDARD
}

/**
 * Postęp dysku po udanym rzucie.
 * `forwardProgressM` — faktyczny dystans do przodu z symulacji (metry). Gdy podany,
 * ma pierwszeństwo przed tabelą typów rzutu, żeby pozycja dysku odpowiadała miejscu chwytu.
 */
export function computeThrowAdvance(
  discPosition,
  throwType,
  {
    defenseStyle,
    rng,
    forwardProgressM = null,
    wind = null,
    throwDx = 0,
    throwDy = 0,
    thrower = null,
    /** fastMode: nadpisuje profile.baseYards() (np. losowy dystans hucka 40-100m). */
    explicitYards = null,
  } = {},
) {
  const profile = throwProfile(throwType)
  const def = defenseMods(defenseStyle)
  const { min, max } = MATCH_CONFIG.field
  const windMods = windThrowModifiers({
    wind,
    throwDx,
    throwDy,
    throwType,
    thrower,
    distanceM:
      Number.isFinite(forwardProgressM) && forwardProgressM > 0
        ? forwardProgressM
        : Math.hypot(throwDx, throwDy),
  })

  if (Number.isFinite(forwardProgressM)) {
    let geo = forwardProgressM
    if (geo > 0) {
      geo *= def.yardsAllowedMultiplier ?? 1
      geo *= windMods.advanceMult ?? 1
    } else if (geo < 0) {
      // Upwind/downwind weakly affects dumps
      geo *= windMods.relation === 'upwind' ? 1.05 : windMods.relation === 'downwind' ? 0.95 : 1
    }
    // Sufit 45m (z wcześniejszej fazy naprawy huck-scarcity) stał się realnym ograniczeniem
    // odkąd cutterBrain.js regularnie generuje cele 55-75m, a predykcja/wykonanie lotu je
    // realnie domyka — podniesiony do 80 (margines nad sufitem deepDist=75m w cutterBrain.js).
    geo = Math.max(-8, Math.min(80, geo))
    return Math.max(min, Math.min(max, discPosition + Math.round(geo)))
  }

  let advance = explicitYards ?? profile.baseYards()
  if (throwType === THROW_TYPE.STANDARD) {
    advance *= def.yardsAllowedMultiplier ?? 1
  } else if (throwType === THROW_TYPE.HUCK) {
    advance *= (def.yardsAllowedMultiplier ?? 1) * 1.08
    if (rng) advance += Math.round(randomSpread(rng, 8))
  } else if (throwType === THROW_TYPE.OVER_THE_TOP) {
    advance *= def.yardsAllowedMultiplier ?? 1
    if (rng) advance += Math.round(randomSpread(rng, 6) * 0.5)
  }
  advance *= windMods.advanceMult ?? 1

  const next = Math.max(min, Math.min(max, discPosition + Math.round(advance)))
  return next
}

export function isHuckType(_throwType, yardsGained) {
  // Statystyki: huck tylko przy realnym zysku ≥ 40 m (nie po samym typie / średnim deep).
  return (Number(yardsGained) || 0) >= HUCK_MIN_YARDS
}

export function formatTeamTag(possessionTeam, homeName, awayName) {
  if (possessionTeam === 'home') return homeName ?? 'Home'
  return awayName ?? 'Away'
}

/**
 * Narracja akcji rzutu — PL + EN (do przełączania języka w UI).
 * @returns {{ narrative: string, narrativeEn: string }}
 */
export function buildThrowNarrative({
  phase,
  possessionTeam,
  homeName,
  awayName,
  throwerName,
  receiverName,
  defenderName,
  throwType,
  separationOutcome,
  yardsGained,
  success,
  isBlock,
  aborted,
  stallCount,
  forcedContested,
  stallOut,
}) {
  const tag = (home, away) => `[${formatTeamTag(possessionTeam, home, away)}]`
  const profile = throwProfile(throwType)
  const tagPl = tag(homeName ?? 'Gospodarze', awayName ?? 'Goście')
  const tagEn = tag(homeName ?? 'Home', awayName ?? 'Away')

  const pair = (pl, en) => ({ narrative: pl, narrativeEn: en })

  if (stallOut || phase === 'stall_out') {
    return pair(
      `${tagPl} STALL OUT (10)! ${throwerName} — dysk w miejscu rzucającego · turnover`,
      `${tagEn} STALL OUT (10)! ${throwerName} — disc at the thrower’s spot · turnover`,
    )
  }

  if (phase === 'abort') {
    return pair(
      `${tagPl} Dobre krycie obrony! ${throwerName} trzyma dysk (Stall ${stallCount ?? '?'}) — ${defenderName} na ${receiverName}`,
      `${tagEn} Tight D! ${throwerName} holds the disc (Stall ${stallCount ?? '?'}) — ${defenderName} on ${receiverName}`,
    )
  }

  if (phase === 'separation_open') {
    return pair(
      `${tagPl} ${receiverName} uwalnia się spod krycia (In-Cut) vs ${defenderName}`,
      `${tagEn} ${receiverName} gets open (In-Cut) vs ${defenderName}`,
    )
  }

  if (phase === 'attempt') {
    const sepPl =
      separationOutcome === 'open'
        ? ' · otwarty odbiorca'
        : separationOutcome === 'tight'
          ? ' · ciasne krycie'
          : ''
    const sepEn =
      separationOutcome === 'open'
        ? ' · open receiver'
        : separationOutcome === 'tight'
          ? ' · tight coverage'
          : ''
    const stallPl =
      stallCount != null && stallCount >= 8
        ? ' · WYMUSZONY rzut (stall ' + stallCount + ')'
        : stallCount != null && stallCount >= 5
          ? ' · presja stall ' + stallCount
          : stallCount != null && stallCount >= 1
            ? ' · stall ' + stallCount
            : ''
    const stallEn =
      stallCount != null && stallCount >= 8
        ? ' · FORCED throw (stall ' + stallCount + ')'
        : stallCount != null && stallCount >= 5
          ? ' · stall pressure ' + stallCount
          : stallCount != null && stallCount >= 1
            ? ' · stall ' + stallCount
            : ''
    const forcedPl = forcedContested ? ' · contested / ignoruje D-block' : ''
    const forcedEn = forcedContested ? ' · contested / ignores D-block' : ''
    return pair(
      `${tagPl} ${throwerName} → ${receiverName} · ${profile.label}${sepPl}${stallPl}${forcedPl}`,
      `${tagEn} ${throwerName} → ${receiverName} · ${profile.label}${sepEn}${stallEn}${forcedEn}`,
    )
  }

  if (phase === 'success') {
    const y = yardsGained >= 0 ? `+${yardsGained}m` : `${yardsGained}m`
    if (throwType === THROW_TYPE.OVER_THE_TOP) {
      return pair(
        `${tagPl} ${profile.label} nad strefą — ${receiverName} łapie (${y})`,
        `${tagEn} ${profile.label} over the zone — ${receiverName} catches (${y})`,
      )
    }
    if (throwType === THROW_TYPE.DUMP_SWING) {
      return pair(
        `${tagPl} Reset stall: dump/swing do ${receiverName} (${y})`,
        `${tagEn} Stall reset: dump/swing to ${receiverName} (${y})`,
      )
    }
    if (throwType === THROW_TYPE.HUCK) {
      return pair(
        `${tagPl} ${throwerName} zagrywa hucka do ${receiverName} (${y})`,
        `${tagEn} ${throwerName} hucks to ${receiverName} (${y})`,
      )
    }
    return pair(
      `${tagPl} ${throwerName} chwyta podanie ${profile.shortLabel} do ${receiverName} (${y})`,
      `${tagEn} ${throwerName} completes ${profile.shortLabel} to ${receiverName} (${y})`,
    )
  }

  if (phase === 'fail') {
    if (isBlock && throwType === THROW_TYPE.OVER_THE_TOP) {
      return pair(
        `${tagPl} Ryzykowny hammer nad strefą! Przechwyt ${defenderName}!`,
        `${tagEn} Risky hammer over the zone! ${defenderName} picks it!`,
      )
    }
    if (isBlock) {
      return pair(
        `${tagPl} D-block ${defenderName}! Nieudane podanie ${profile.shortLabel}`,
        `${tagEn} D-block ${defenderName}! Incomplete ${profile.shortLabel}`,
      )
    }
    return pair(
      `${tagPl} Nieudany ${profile.label} · turnover`,
      `${tagEn} Incomplete ${profile.label} · turnover`,
    )
  }

  if (aborted) {
    return pair(
      `${tagPl} Presja stall — brak rzutu`,
      `${tagEn} Stall pressure — no throw`,
    )
  }

  return pair(`${tagPl} Akcja ofensywna`, `${tagEn} Offensive action`)
}
