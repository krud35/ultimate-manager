import { getSubStat } from '../../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale } from '../../models/playerMorale.js'
import { getTraitMods } from '../../models/playerTraits.js'

const DEFAULT = 50

/** Podstatystyka z fallbackiem 50 — z lekkim wpływem morale. */
export function subStat(player, category, key) {
  const raw = getSubStat(player?.skills, category, key, DEFAULT)
  return applyMoraleToStat(raw, getPlayerMorale(player))
}

/** Vmax ≈ 4.4–7.2 m/s (speed 0–100) — sprint cutu ultimate, nie finisz 100 m. */
export function maxSpeedMps(player) {
  const mods = getTraitMods(player)
  return (4.4 + (subStat(player, 'physical', 'speed') / 100) * 2.8) * (mods.speedMult ?? 1)
}

/** Plant & cut: 300 - (agility / 100) * 180 ms */
export function plantStopMs(player) {
  const mods = getTraitMods(player)
  const base = 300 - (subStat(player, 'physical', 'agility') / 100) * 180
  return Math.max(90, base * (mods.plantMsMult ?? 1))
}

/** Reakcje obrońcy: 350 - (reactions / 100) * 250 ms */
export function defenderReactionDelayMs(player) {
  const mods = getTraitMods(player)
  return Math.round(
    350 - (subStat(player, 'mental', 'reactions') / 100) * 250 + (mods.reactionDelayDeltaMs ?? 0),
  )
}

/**
 * Skan opcji: 22 + (vision / 100) * 56 m (22–78 m). Zmierzone: typowy roster ma vision
 * ~79; poprzednie współczynniki (40, potem 48) wciąż trzymały scanRadius blisko/poniżej
 * mediany celów cutu 'deep' (p50≈57m z cutterBrain.js), więc bomba 55m+ była widoczna
 * tylko sporadycznie i ledwo się domykała (max realnego rzutu ~54m). *56 daje ~79 vision
 * -> ~66m, elita (100) -> 78m — wyraźny margines powyżej sufitu deepDist (75m).
 */
export function throwScanRadiusM(player) {
  const mods = getTraitMods(player)
  return 22 + (subStat(player, 'mental', 'vision') / 100) * 56 + (mods.scanRadiusBonusM ?? 0)
}

/**
 * Ile opcji podania zawodnik naprawdę dostrzega: 2 przy słabym vision, 7 u elity.
 * Reszta boiska po prostu umyka jego uwadze.
 */
export function perceivedOptionLimit(player) {
  const mods = getTraitMods(player)
  return 2 + Math.round((subStat(player, 'mental', 'vision') / 100) * 5) + (mods.perceivedOptionsBonus ?? 0)
}

/**
 * Rozrzut oceny opcji. Słaby decydent myli dobre podanie ze złym, a przy presji
 * stalla dokłada się do tego niskie composure.
 */
export function decisionNoiseAmplitude(player, stallCount = 1) {
  const dm = subStat(player, 'mental', 'decisionMaking')
  const composure = subStat(player, 'mental', 'composure')
  const mods = getTraitMods(player)
  const base = (1 - dm / 100) * 38
  const pressure = stallCount >= 5 ? (1 - composure / 100) * (stallCount - 4) * 5 : 0
  return (base + pressure) * (mods.decisionNoiseMult ?? 1)
}

/** Kara celności za stall > 4 (punkty score) — composure chroni pod presją. */
/** Skala kary composure za presję stall — patrz HIGH_STALL_PENALTY_SCALE w stall.js. */
const HIGH_STALL_COMPOSURE_PENALTY_SCALE = 0.12

export function stallComposureAccuracyPenalty(stallCount, player) {
  if (stallCount <= 4) return 0
  const comp = subStat(player, 'mental', 'composure') / 100
  return (stallCount - 4) * (1 - comp) * 9 * HIGH_STALL_COMPOSURE_PENALTY_SCALE
}

/** Cushion krycia cuttera: 2.5 - (defensiveCutterMovement / 100) * 1.8 m */
export function coverageCushionMeters(player) {
  const mods = getTraitMods(player)
  const base =
    2.5 -
    (subStat(player, 'defensive', 'defensiveCutterMovement') / 100) * 1.8 +
    (mods.cushionDeltaM ?? 0)
  return Math.max(0.35, base)
}

/** Pułap Z dysku + bonus jump (m). */
export function discPeakHeightM(trajectory, jumpStat = DEFAULT) {
  const base =
    trajectory === 'deep' ? 4.2 : trajectory === 'overhead' ? 5.5 : trajectory === 'lateral' ? 1.2 : 2.4
  return base + (jumpStat / 100) * 1.85
}

/** Szansa layout / catch w powietrzu (0–1). */
export function aerialContestChance(player, discZMeters, isReceiver = true) {
  const jump = subStat(player, 'physical', 'jump')
  const mods = getTraitMods(player)
  const reach = 1.15 + (jump / 100) * 2.35
  let chance
  if (discZMeters > reach + 0.35) {
    chance = Math.max(0.05, (jump / 100) * 0.22)
  } else if (isReceiver) {
    const catching = subStat(player, 'offensive', 'catching')
    chance = 0.28 + (jump / 100) * 0.42 + (catching / 100) * 0.22
  } else {
    const blocking = subStat(player, 'defensive', 'blocking')
    chance = 0.22 + (jump / 100) * 0.38 + (blocking / 100) * 0.18
  }
  const mult = isReceiver
    ? (mods.aerialRecvMult ?? 1) * (mods.layoutAerialMult ?? 1)
    : (mods.aerialDefMult ?? 1) * (mods.layoutAerialMult ?? 1)
  return Math.min(0.95, chance * mult)
}
