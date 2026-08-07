/**
 * Wartość rynkowa zawodnika (USD).
 * Baza: OVR · mnożniki: wiek (młodsi drożej) + potencjał (duży room = premia).
 */

import { getOverallRating } from '../../models/playerStats.js'

/**
 * Bazowa krzywa z OVR (bez wieku/potencjału), skala Ekstraklasy:
 * 65→~18k, 70→~45k, 75→~109k, 80→~264k, 85→~645k, 90→~1.6M, 95→~3.8M
 * @param {number} ovr
 * @returns {number} surowa wartość w USD
 */
export function marketValueFromOvr(ovr) {
  const x = Math.max(50, Math.min(99, Number(ovr) || 50))
  return 7500 * Math.pow(1.195, x - 60)
}

/**
 * Młodsi drożsi (perspektywa), starsi tańsi (malejący horyzont kariery).
 * Peak wartości wiekowej ~24–26.
 * @param {number} age
 */
export function ageValueMultiplier(age) {
  const a = Number(age)
  if (!Number.isFinite(a)) return 1
  if (a <= 20) return 1.55
  if (a <= 22) return 1.4
  if (a <= 24) return 1.25
  if (a <= 26) return 1.12
  if (a <= 28) return 1.0
  if (a <= 30) return 0.88
  if (a <= 32) return 0.72
  if (a <= 34) return 0.55
  return 0.4
}

/**
 * Premia za niewykorzystany potencjał — silniejsza u młodych.
 * @param {number} ovr
 * @param {number} potential
 * @param {number} age
 */
export function potentialValueMultiplier(ovr, potential, age) {
  const room = Math.max(0, (Number(potential) || ovr) - (Number(ovr) || 0))
  if (room <= 0) return 1

  const a = Number(age)
  let weight = 0.028
  if (Number.isFinite(a)) {
    if (a <= 22) weight = 0.045
    else if (a <= 25) weight = 0.038
    else if (a <= 27) weight = 0.028
    else if (a <= 29) weight = 0.015
    else weight = 0.005 // u weteranów pot prawie nie winduje ceny
  }

  // Cap premii: młody z ogromnym roomem nie powinien być 5× droższy tylko z POT.
  const bonus = Math.min(0.85, room * weight)
  return 1 + bonus
}

/**
 * Pełna wycena: OVR × wiek × potencjał.
 * @param {object} player
 * @returns {number} USD, zaokrąglone do 1000
 */
export function computeMarketValue(player) {
  const ovr = getOverallRating(player?.skills)
  const age = player?.age ?? 25
  const pot = player?.potential ?? ovr
  const raw =
    marketValueFromOvr(ovr) * ageValueMultiplier(age) * potentialValueMultiplier(ovr, pot, age)
  return Math.max(1000, Math.round(raw / 1000) * 1000)
}

/** @param {object} player */
export function getPlayerMarketValue(player) {
  return computeMarketValue(player)
}

/** Odświeża `player.marketValue` na podstawie OVR / wieku / potencjału. */
export function refreshPlayerMarketValue(player) {
  if (!player) return player
  player.marketValue = computeMarketValue(player)
  return player
}

export function refreshTeamMarketValues(team) {
  for (const player of team?.players ?? []) {
    refreshPlayerMarketValue(player)
  }
  return team
}

export { formatUsd, formatUsdCompact } from './moneyFormat.js'
