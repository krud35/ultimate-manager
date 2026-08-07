/**
 * Lojalność zawodnika wobec klubu (0–100) — ukryty modyfikator.
 * Generowana przy tworzeniu kariery; rośnie przez dobre traktowanie,
 * wysokie morale, grę w meczach, dobre wyniki oraz dłuższy pobyt w klubie.
 *
 * Cechy charakteru (traits) będą później modyfikować tempo zmian
 * przez `loyaltyGainMult` / `loyaltyLossMult` w getTraitMods.
 */

import { getPlayerMorale } from './playerMorale.js'
import { getTraitMods, ensurePlayerTraits } from './playerTraits.js'

export const LOYALTY_DEFAULT = 52
export const LOYALTY_MIN = 10
export const LOYALTY_MAX = 99

/**
 * Cel miękkiego dryfu lojalności wg lat w obecnym klubie (index = lata).
 * 0 → 50, 1 → 57, 2 → 63, 3 → 67, 4 → 70, 5+ → 72
 */
export const LOYALTY_TENURE_TARGETS = Object.freeze([50, 57, 63, 67, 70, 72])

function clampLoyalty(n) {
  return Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, Math.round(n)))
}

export function loyaltyTenureTarget(yearsAtClub = 0) {
  const y = Math.max(0, Math.floor(Number(yearsAtClub) || 0))
  const last = LOYALTY_TENURE_TARGETS.length - 1
  return LOYALTY_TENURE_TARGETS[Math.min(y, last)]
}

export function ensurePlayerClubTenure(player) {
  if (!player) return player
  if (
    typeof player.yearsAtClub !== 'number' ||
    !Number.isFinite(player.yearsAtClub) ||
    player.yearsAtClub < 0
  ) {
    player.yearsAtClub = 0
  } else {
    player.yearsAtClub = Math.min(40, Math.floor(player.yearsAtClub))
  }
  return player
}

export function getPlayerYearsAtClub(player) {
  ensurePlayerClubTenure(player)
  return player?.yearsAtClub ?? 0
}

/** +1 rok w klubie (offseason / nowy sezon). */
export function incrementPlayerClubTenure(player) {
  ensurePlayerClubTenure(player)
  player.yearsAtClub = Math.min(40, player.yearsAtClub + 1)
  return player.yearsAtClub
}

/**
 * Miękki dryf lojalności w stronę celu ze stażu.
 * @param {object} player
 * @param {{ strength?: number }} [options] — 0.015 ≈ lekki tick meczowy; ~0.35–0.45 raz na sezon
 */
export function applyLoyaltyTenureDrift(player, { strength = 0.02 } = {}) {
  if (!player) return LOYALTY_DEFAULT
  ensurePlayerLoyalty(player)
  ensurePlayerClubTenure(player)
  const target = loyaltyTenureTarget(player.yearsAtClub)
  const delta = (target - player.loyalty) * strength
  if (Math.abs(delta) < 0.04) return getPlayerLoyalty(player)
  return adjustPlayerLoyalty(player, delta)
}

function hashSeed(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Losowy start lojalności (deterministyczny po player.id).
 * @param {object} player
 * @param {{ salt?: string }} [options]
 */
export function rollLoyaltyForPlayer(player, options = {}) {
  const salt = options.salt ?? 'career'
  const rng = mulberry32(hashSeed(`loyalty:${salt}:${player?.id ?? 'x'}`))
  // Lekko skoncentrowane wokół ~50–55, zakres ~32–74
  const a = rng()
  const b = rng()
  const base = 32 + (a + b) * 21
  return clampLoyalty(base)
}

export function ensurePlayerLoyalty(player) {
  if (!player) return player
  ensurePlayerClubTenure(player)
  if (typeof player.loyalty !== 'number' || !Number.isFinite(player.loyalty)) {
    player.loyalty = rollLoyaltyForPlayer(player)
  } else {
    player.loyalty = clampLoyalty(player.loyalty)
  }
  return player
}

export function getPlayerLoyalty(player) {
  if (typeof player?.loyalty === 'number' && Number.isFinite(player.loyalty)) {
    return clampLoyalty(player.loyalty)
  }
  return LOYALTY_DEFAULT
}

/** Mnożniki z cech — na razie zawsze 1 (hook pod przyszłe traits). */
function loyaltyMults(player) {
  ensurePlayerTraits(player)
  const mods = getTraitMods(player)
  return {
    gain: mods.loyaltyGainMult ?? 1,
    loss: mods.loyaltyLossMult ?? 1,
  }
}

/**
 * @param {object} player
 * @param {number} delta — dodatni = wzrost lojalności
 * @returns {number} nowa lojalność
 */
export function adjustPlayerLoyalty(player, delta) {
  if (!player || !delta) return getPlayerLoyalty(player)
  ensurePlayerLoyalty(player)
  const { gain, loss } = loyaltyMults(player)
  const scaled = delta > 0 ? delta * gain : delta * loss
  player.loyalty = clampLoyalty(player.loyalty + scaled)
  return player.loyalty
}

/**
 * Dobre / złe traktowanie (np. decyzje w eventach → delta morale).
 * Pozytywne morale → lojalność w górę; negatywne → lekko w dół.
 */
export function noteLoyaltyFromTreatment(player, moraleDelta) {
  if (!player || !moraleDelta) return getPlayerLoyalty(player)
  // ~25% skali morale: +8 morale ≈ +2 lojalności
  const raw = moraleDelta * 0.28
  if (Math.abs(raw) < 0.15) return getPlayerLoyalty(player)
  return adjustPlayerLoyalty(player, raw)
}

/**
 * Po transferze — świeże przywiązanie do nowego klubu (niższy start, staż = 0).
 */
export function reseedLoyaltyForNewClub(player) {
  if (!player) return player
  player.yearsAtClub = 0
  const rolled = rollLoyaltyForPlayer(player, { salt: `club:${Date.now() % 1e6}` })
  player.loyalty = clampLoyalty(Math.round(rolled * 0.55 + 16))
  return player
}

function boxRowForPlayer(boxScore, playerId) {
  if (!boxScore) return null
  if (Array.isArray(boxScore)) {
    return boxScore.find((r) => r.playerId === playerId || r.id === playerId) ?? null
  }
  return boxScore[playerId] ?? null
}

/**
 * Aktualizacja lojalności po meczu: gra, wynik, poziom morale.
 * @param {object[]} roster
 * @param {{ won: boolean, margin?: number, boxScore?: object|object[] }} outcome
 */
export function applyLoyaltyAfterMatch(roster, { won, margin = 0, boxScore = null } = {}) {
  if (!roster?.length) return
  const gap = Math.max(0, Math.round(margin))

  for (const player of roster) {
    ensurePlayerLoyalty(player)
    const row = boxRowForPlayer(boxScore, player.id)
    const pp =
      row?.pointsPlayed ??
      player.stats?.pointsPlayedMatch ??
      0
    const morale = getPlayerMorale(player)

    let delta = 0

    // Gra w meczu buduje więź; ławka lekko ją osłabia.
    if (pp <= 0) {
      delta -= 0.18
    } else if (pp >= 10) {
      delta += 0.85 + Math.min(0.55, (pp - 10) * 0.06)
    } else if (pp >= 5) {
      delta += 0.55
    } else if (pp >= 2) {
      delta += 0.32
    } else {
      delta += 0.12
    }

    // Dobre wyniki — lojalność rośnie; porażki lekko bolą (zwłaszcza bez gry).
    if (won) {
      delta += 0.35 + Math.min(0.7, gap * 0.12)
    } else {
      delta -= 0.12 + (pp <= 0 ? 0.1 : 0)
    }

    // Wysokie morale = czuje się dobrze w klubie.
    if (morale >= 88) delta += 0.4
    else if (morale >= 75) delta += 0.22
    else if (morale >= 60) delta += 0.06
    else if (morale < 45) delta -= 0.22
    else if (morale < 55) delta -= 0.08

    // Lekki dryf ku celowi ze stażu (0→50 … 5+→72).
    const tenureTarget = loyaltyTenureTarget(player.yearsAtClub)
    delta += (tenureTarget - player.loyalty) * 0.018

    adjustPlayerLoyalty(player, delta)
  }
}

export function applyLoyaltyForMatchTeams(
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  boxScore = null,
) {
  const margin = Math.abs((homeScore ?? 0) - (awayScore ?? 0))
  const homeWon = (homeScore ?? 0) > (awayScore ?? 0)
  applyLoyaltyAfterMatch(homeTeam?.players ?? [], {
    won: homeWon,
    margin,
    boxScore,
  })
  applyLoyaltyAfterMatch(awayTeam?.players ?? [], {
    won: !homeWon,
    margin,
    boxScore,
  })
}
