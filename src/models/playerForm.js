/**
 * Forma zawodnika (0–100) — wyłącznie wskaźnik (bez wpływu na skills / silnik).
 * Domyślnie „dobra” (~72). Rośnie przez grę i dobre występy, spada przez błędy.
 */

import { getTraitMods, ensurePlayerTraits } from './playerTraits.js'

export const FORM_DEFAULT = 72
export const FORM_MIN = 25
export const FORM_MAX = 99

function clampForm(n) {
  return Math.max(FORM_MIN, Math.min(FORM_MAX, Math.round(n)))
}

export function ensurePlayerForm(player) {
  if (!player) return player
  if (typeof player.form !== 'number' || !Number.isFinite(player.form)) {
    player.form = FORM_DEFAULT
  } else {
    player.form = clampForm(player.form)
  }
  return player
}

export function getPlayerForm(player) {
  if (typeof player?.form === 'number' && Number.isFinite(player.form)) {
    return clampForm(player.form)
  }
  return FORM_DEFAULT
}

export function formLabel(form = FORM_DEFAULT, lang = 'pl') {
  const m = clampForm(form)
  if (lang === 'en') {
    if (m >= 88) return 'great'
    if (m >= 75) return 'good'
    if (m >= 60) return 'neutral'
    if (m >= 45) return 'bad'
    return 'terrible'
  }
  if (m >= 88) return 'świetna'
  if (m >= 75) return 'dobra'
  if (m >= 60) return 'neutralna'
  if (m >= 45) return 'zła'
  return 'fatalna'
}

export function formToneClass(form = FORM_DEFAULT) {
  const m = clampForm(form)
  if (m >= 75) return 'text-emerald-400'
  if (m >= 60) return 'text-ufa-gold'
  if (m >= 45) return 'text-amber-400'
  return 'text-red-400'
}

function boxRowForPlayer(boxScore, playerId) {
  if (!boxScore) return null
  if (Array.isArray(boxScore)) {
    return boxScore.find((r) => r.playerId === playerId || r.id === playerId) ?? null
  }
  return boxScore[playerId] ?? null
}

/**
 * Aktualizacja formy po meczu — gra / błędy (+ wynik drużyny dla cech typu quitter).
 * @param {object[]} roster
 * @param {{ boxScore?: object|object[], won?: boolean }} options
 */
export function applyFormAfterMatch(roster, { boxScore = null, won = true } = {}) {
  if (!roster?.length) return

  for (const player of roster) {
    ensurePlayerForm(player)
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

    let delta = 0

    if (pp <= 0) {
      delta += mods.zeroPpFormDelta
    } else if (pp >= 10) {
      delta += 1.8 + Math.min(1.5, (pp - 10) * 0.1)
    } else if (pp >= 5) {
      delta += 1.1
    } else if (pp >= 2) {
      delta += 0.55
    } else {
      delta += 0.2
    }

    delta += (goals * 1.35 + assists * 1.1) * (mods.goalAssistFormMult ?? 1) + blocks * 1.05
    delta -= turnovers * 1.25

    if (!won && mods.lossFormMult > 1) {
      delta -= 1.2 * (mods.lossFormMult - 1)
    }
    if (won && (mods.winFormMult ?? 1) !== 1 && delta > 0) {
      delta *= mods.winFormMult
    }

    delta += (FORM_DEFAULT - player.form) * 0.05 * mods.formDriftMult

    player.form = clampForm(player.form + delta)
  }
}

export function applyFormForMatchTeams(homeTeam, awayTeam, boxScore = null, homeScore = 0, awayScore = 0) {
  const homeWon = (homeScore ?? 0) > (awayScore ?? 0)
  applyFormAfterMatch(homeTeam?.players ?? [], { boxScore, won: homeWon })
  applyFormAfterMatch(awayTeam?.players ?? [], { boxScore, won: !homeWon })
}
