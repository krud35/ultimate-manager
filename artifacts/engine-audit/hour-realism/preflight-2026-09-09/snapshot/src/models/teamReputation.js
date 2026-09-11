/**
 * Reputacja drużyny (0–100) — prestiż klubu w lidze i mediach.
 * Rośnie/spada przez wyniki, transfery i eventy losowe.
 */

import { getOverallRating } from './playerStats.js'

export const REPUTATION_DEFAULT = 55
export const REPUTATION_MIN = 15
export const REPUTATION_MAX = 99

function clampReputation(n) {
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(n)))
}

/** Seed startowy z jakości składu (top 7), gdy pole jeszcze nie istnieje. */
export function seedReputationFromRoster(team) {
  const players = team?.players ?? []
  if (!players.length) return REPUTATION_DEFAULT
  const ovrs = players
    .map((p) => getOverallRating(p?.skills))
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => b - a)
  if (!ovrs.length) return REPUTATION_DEFAULT
  const top = ovrs.slice(0, Math.min(7, ovrs.length))
  const avg = top.reduce((s, n) => s + n, 0) / top.length
  // ~65 OVR → ~48, ~75 → ~66, ~82 → ~79
  return clampReputation(30 + (avg - 60) * 1.85)
}

export function ensureTeamReputation(team) {
  if (!team) return team
  if (typeof team.reputation !== 'number' || !Number.isFinite(team.reputation)) {
    team.reputation = seedReputationFromRoster(team)
  } else {
    team.reputation = clampReputation(team.reputation)
  }
  return team
}

export function ensureWorldReputation(world) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (team) ensureTeamReputation(team)
  }
  return world
}

export function getTeamReputation(team) {
  if (typeof team?.reputation === 'number' && Number.isFinite(team.reputation)) {
    return clampReputation(team.reputation)
  }
  return REPUTATION_DEFAULT
}

/**
 * @param {object} team
 * @param {number} delta
 * @returns {number} nowa reputacja
 */
export function adjustTeamReputation(team, delta) {
  if (!team || !delta) return getTeamReputation(team)
  ensureTeamReputation(team)
  team.reputation = clampReputation(team.reputation + delta)
  return team.reputation
}

export function reputationLabel(reputation = REPUTATION_DEFAULT, lang = 'pl') {
  const m = clampReputation(reputation)
  if (lang === 'en') {
    if (m >= 88) return 'Elite'
    if (m >= 75) return 'Strong'
    if (m >= 60) return 'Solid'
    if (m >= 45) return 'Modest'
    return 'Low'
  }
  if (m >= 88) return 'Elitarna'
  if (m >= 75) return 'Silna'
  if (m >= 60) return 'Solidna'
  if (m >= 45) return 'Skromna'
  return 'Niska'
}

export function reputationToneClass(reputation = REPUTATION_DEFAULT) {
  const m = clampReputation(reputation)
  if (m >= 75) return 'text-emerald-400'
  if (m >= 60) return 'text-ufa-gold'
  if (m >= 45) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Aktualizacja reputacji jednej drużyny po meczu.
 * @param {object} team
 * @param {{ won: boolean, margin?: number, competition?: string, isHome?: boolean }} outcome
 */
export function applyReputationAfterMatch(team, { won, margin = 0, competition = 'league', isHome = false } = {}) {
  if (!team) return
  ensureTeamReputation(team)
  const gap = Math.max(0, Math.round(margin))
  const cupMult = competition === 'cup' ? 0.72 : 1
  const venueMult = isHome ? 1.05 : 0.95

  let delta = 0
  if (won) {
    delta += (1.4 + Math.min(2.8, gap * 0.4)) * cupMult * venueMult
  } else {
    delta -= (1.8 + Math.min(3.5, gap * 0.55)) * cupMult * venueMult
  }

  // Lekkie dążenie do środka skali — unikamy wiecznego 99 / 15.
  delta += (REPUTATION_DEFAULT - team.reputation) * 0.025

  team.reputation = clampReputation(team.reputation + delta)
}

/**
 * Po meczu ligowym / pucharowym — obie drużyny.
 */
export function applyReputationForMatchTeams(
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  { competition = 'league' } = {},
) {
  const hs = homeScore ?? 0
  const as = awayScore ?? 0
  if (hs === as) return
  const margin = Math.abs(hs - as)
  const homeWon = hs > as
  applyReputationAfterMatch(homeTeam, {
    won: homeWon,
    margin,
    competition,
    isHome: true,
  })
  applyReputationAfterMatch(awayTeam, {
    won: !homeWon,
    margin,
    competition,
    isHome: false,
  })
}

/**
 * Efekt transferu na reputację kupującego i sprzedającego.
 * Gwiazda (wysoki OVR względem składu) mocniej rusza prestiż.
 */
export function applyReputationAfterTransfer(buyerTeam, sellerTeam, player, fee = 0) {
  if (!player) return
  const ovr = getOverallRating(player?.skills)
  const buyerAvg = averageRosterOvr(buyerTeam)
  const sellerAvg = averageRosterOvr(sellerTeam)
  const starVsBuyer = Math.max(0, ovr - buyerAvg)
  const starVsSeller = Math.max(0, ovr - sellerAvg)

  // Kupno wzmacnia wizerunek proporcjonalnie do jakości względem składu.
  if (buyerTeam) {
    let buyDelta = 0.4 + starVsBuyer * 0.22
    if (ovr >= 82) buyDelta += 1.2
    else if (ovr >= 78) buyDelta += 0.6
    // Drogi transfer = medialny szum (lekko).
    if (fee >= 400_000) buyDelta += 0.5
    if (fee >= 1_000_000) buyDelta += 0.7
    adjustTeamReputation(buyerTeam, buyDelta)
  }

  if (sellerTeam) {
    // Sprzedaż gwiazdy: strata prestiżu, częściowo rekompensowana dużym fee.
    let sellDelta = -(0.5 + starVsSeller * 0.18)
    if (ovr >= 82) sellDelta -= 1.0
    else if (ovr >= 78) sellDelta -= 0.45
    if (fee >= 500_000) sellDelta += 0.6
    if (fee >= 1_200_000) sellDelta += 0.9
    // Sprzedaż rezerwowego / słabszego nie boli.
    if (starVsSeller < 1 && ovr < sellerAvg - 2) sellDelta = Math.max(-0.2, sellDelta * 0.25)
    adjustTeamReputation(sellerTeam, sellDelta)
  }
}

function averageRosterOvr(team) {
  const players = team?.players ?? []
  if (!players.length) return 70
  let sum = 0
  let n = 0
  for (const p of players) {
    const ovr = getOverallRating(p?.skills)
    if (typeof ovr === 'number' && Number.isFinite(ovr)) {
      sum += ovr
      n += 1
    }
  }
  return n ? sum / n : 70
}
