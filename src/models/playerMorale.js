/**
 * Morale zawodnika (0–100) — lekki modyfikator efektywnych umiejętności.
 * Domyślnie „dobre” (~72). Aktualizowane po meczach: wynik, gra, decyzje.
 */

import { getOverallRating } from './playerStats.js'
import { getTraitMods, ensurePlayerTraits, playerHasTrait } from './playerTraits.js'
import { getFanMood, FAN_MOOD_DEFAULT } from './teamFans.js'

export const MORALE_DEFAULT = 72
export const MORALE_MIN = 25
export const MORALE_MAX = 99

/** Przy dobrym morale (DEFAULT) mnożnik = 1. Ekstrema ≈ ±5–6%. */
const MORALE_SKILL_SCALE = 0.2

function clampMorale(n) {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, Math.round(n)))
}

export function ensurePlayerMorale(player) {
  if (!player) return player
  if (typeof player.morale !== 'number' || !Number.isFinite(player.morale)) {
    player.morale = MORALE_DEFAULT
  } else {
    player.morale = clampMorale(player.morale)
  }
  return player
}

export function getPlayerMorale(player) {
  if (typeof player?.morale === 'number' && Number.isFinite(player.morale)) {
    return clampMorale(player.morale)
  }
  return MORALE_DEFAULT
}

/**
 * Mnożnik umiejętności z morale (centrum = MORALE_DEFAULT → 1.0).
 * Przykłady: 99 → ~1.054, 50 → ~0.956, 25 → ~0.906
 */
export function moraleSkillMultiplier(morale = MORALE_DEFAULT) {
  const m = clampMorale(morale)
  return 1 + ((m - MORALE_DEFAULT) / 100) * MORALE_SKILL_SCALE
}

/** Skaluje wartość skilla i trzyma w zakresie 1–99. */
export function applyMoraleToStat(value, morale = MORALE_DEFAULT) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  const next = value * moraleSkillMultiplier(morale)
  return Math.max(1, Math.min(99, Math.round(next * 10) / 10))
}

export function moraleLabel(morale = MORALE_DEFAULT, lang = 'pl') {
  const m = clampMorale(morale)
  if (lang === 'en') {
    if (m >= 88) return 'great'
    if (m >= 75) return 'good'
    if (m >= 60) return 'neutral'
    if (m >= 45) return 'bad'
    return 'terrible'
  }
  if (m >= 88) return 'świetne'
  if (m >= 75) return 'dobre'
  if (m >= 60) return 'neutralne'
  if (m >= 45) return 'złe'
  return 'fatalne'
}

export function moraleToneClass(morale = MORALE_DEFAULT) {
  const m = clampMorale(morale)
  if (m >= 75) return 'text-emerald-400'
  if (m >= 60) return 'text-ufa-gold'
  if (m >= 45) return 'text-amber-400'
  return 'text-red-400'
}

/** 0 = rezerwowy poziomu, 1 = lider / pewny starter w składzie. */
export function starterQualityFactor(player, roster = []) {
  const ovr = getOverallRating(player?.skills)
  if (!roster?.length) {
    return Math.max(0, Math.min(1, (ovr - 65) / 25))
  }
  const sorted = [...roster]
    .map((p) => getOverallRating(p?.skills))
    .sort((a, b) => b - a)
  const cutoff = sorted[Math.min(6, sorted.length - 1)] ?? 70
  const floor = sorted[Math.min(11, sorted.length - 1)] ?? cutoff - 8
  if (ovr >= cutoff) return 1
  if (ovr <= floor) return 0
  const span = Math.max(1, cutoff - floor)
  return Math.max(0, Math.min(1, (ovr - floor) / span))
}

function boxRowForPlayer(boxScore, playerId) {
  if (!boxScore) return null
  if (Array.isArray(boxScore)) {
    return boxScore.find((r) => r.playerId === playerId || r.id === playerId) ?? null
  }
  return boxScore[playerId] ?? null
}

/**
 * Aktualizacja morale po meczu dla jednej drużyny.
 * @param {object[]} roster
 * @param {{ won: boolean, margin: number, boxScore?: object|object[], fanMood?: number|null }} outcome
 */
export function applyMoraleAfterMatch(
  roster,
  { won, margin = 0, boxScore = null, fanMood = null } = {},
) {
  if (!roster?.length) return
  const gap = Math.max(0, Math.round(margin))
  const mood =
    typeof fanMood === 'number' && Number.isFinite(fanMood) ? fanMood : FAN_MOOD_DEFAULT

  let auraPool = 0
  for (const player of roster) {
    ensurePlayerTraits(player)
    const mods = getTraitMods(player)
    const row = boxRowForPlayer(boxScore, player.id)
    const pp =
      row?.pointsPlayed ??
      player.stats?.pointsPlayedMatch ??
      0
    if (pp >= 2 && mods.teamAuraEmit > 0) {
      auraPool += mods.teamAuraEmit
    }
  }
  auraPool = Math.min(1.4, auraPool)

  for (const player of roster) {
    ensurePlayerMorale(player)
    ensurePlayerTraits(player)
    const mods = getTraitMods(player)
    const row = boxRowForPlayer(boxScore, player.id)
    const pp =
      row?.pointsPlayed ??
      player.stats?.pointsPlayedMatch ??
      0
    const goals = row?.goals ?? 0
    const assists = row?.assists ?? 0
    const blocks = row?.blocks ?? 0
    const turnovers = row?.turnovers ?? 0
    const quality = starterQualityFactor(player, roster)

    let delta = 0

    if (won) {
      delta += 1.5 + Math.min(2.5, gap * 0.45)
    } else {
      let loss = 2 + Math.min(4, gap * 0.7)
      loss *= mods.lossMoraleMult
      if (playerHasTrait(player, 'quitter') && gap >= 5) loss += 2
      delta -= loss
    }

    if (pp <= 0) {
      const benchHit = (0.8 + quality * 4.2) * (mods.benchMoraleSensitivity ?? 1)
      delta -= benchHit
    } else if (pp >= 10) {
      delta += 1.6 + Math.min(1.4, (pp - 10) * 0.12)
    } else if (pp >= 5) {
      delta += 0.9
    } else if (pp >= 2) {
      delta += quality > 0.75 ? 0.15 : 0.55
    } else {
      delta += quality > 0.7 ? -0.6 * (mods.benchMoraleSensitivity ?? 1) : 0.35
    }

    const gaMult = mods.goalAssistMoraleMult ?? 1
    delta += (goals * 1.15 + assists * 0.95) * gaMult + blocks * 0.9
    delta -= turnovers * (0.55 + Math.max(0, mods.turnoverMoraleExtra))

    if (auraPool > 0 && pp >= 0) {
      const recv = mods.teamAuraRecvMult ?? 1
      delta += auraPool * recv * (won ? 1 : 0.55)
    }

    const sens = mods.fanMoodMoraleSensitivity ?? 0
    if (sens > 0) {
      delta += ((mood - FAN_MOOD_DEFAULT) / 100) * sens * 4.5
    }

    delta += (MORALE_DEFAULT - player.morale) * 0.04

    player.morale = clampMorale(player.morale + delta)
  }
}

/**
 * Po meczu silnika / tła — obie drużyny.
 */
export function applyMoraleForMatchTeams(homeTeam, awayTeam, homeScore, awayScore, boxScore = null) {
  const margin = Math.abs((homeScore ?? 0) - (awayScore ?? 0))
  const homeWon = (homeScore ?? 0) > (awayScore ?? 0)
  applyMoraleAfterMatch(homeTeam?.players ?? [], {
    won: homeWon,
    margin,
    boxScore,
    fanMood: getFanMood(homeTeam),
  })
  applyMoraleAfterMatch(awayTeam?.players ?? [], {
    won: !homeWon,
    margin,
    boxScore,
    fanMood: getFanMood(awayTeam),
  })
}
