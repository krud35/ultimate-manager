/**
 * ELO drużyny — dynamiczny rating siły napędzany wynikami meczów, nie samym składem.
 * Start: seed z jakości składu (top 7 wg OVR), tak jak reputacja. Później tylko wygrane/
 * przegrane z rywalami przesuwają rating — mocniejszy rywal daje więcej za wygraną
 * i zabiera mniej za porażkę (i odwrotnie dla słabszego rywala).
 */

import { getOverallRating } from './playerStats.js'

export const ELO_DEFAULT = 1500
export const ELO_MIN = 900
export const ELO_MAX = 2200
const ELO_K = 24

function clampElo(n) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(n)))
}

/** Seed startowy z jakości składu (top 7), gdy pole jeszcze nie istnieje. */
export function seedEloFromRoster(team) {
  const players = team?.players ?? []
  if (!players.length) return ELO_DEFAULT
  const ovrs = players
    .map((p) => getOverallRating(p?.skills))
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => b - a)
  if (!ovrs.length) return ELO_DEFAULT
  const top = ovrs.slice(0, Math.min(7, ovrs.length))
  const avg = top.reduce((s, n) => s + n, 0) / top.length
  return clampElo(ELO_DEFAULT + (avg - 70) * 15)
}

export function ensureTeamElo(team) {
  if (!team) return team
  if (typeof team.eloRating !== 'number' || !Number.isFinite(team.eloRating)) {
    team.eloRating = seedEloFromRoster(team)
  } else {
    team.eloRating = clampElo(team.eloRating)
  }
  return team
}

export function ensureWorldElo(world) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (team) ensureTeamElo(team)
  }
  return world
}

export function getTeamElo(team) {
  if (typeof team?.eloRating === 'number' && Number.isFinite(team.eloRating)) {
    return clampElo(team.eloRating)
  }
  return ELO_DEFAULT
}

/**
 * Aktualizacja ELO po meczu ligowym. Klasyczny wzór (oczekiwany wynik z różnicy
 * ratingów), z niewielką premią za wysoki margines — niespodziewana wygrana
 * z dużą przewagą punktową przesuwa rating trochę mocniej niż wygrana o jeden punkt.
 */
export function applyEloForMatchTeams(homeTeam, awayTeam, homeScore, awayScore) {
  if (!homeTeam || !awayTeam) return
  ensureTeamElo(homeTeam)
  ensureTeamElo(awayTeam)
  const hs = homeScore ?? 0
  const as = awayScore ?? 0
  if (hs === as) return

  const eloHome = homeTeam.eloRating
  const eloAway = awayTeam.eloRating
  const expectedHome = 1 / (1 + 10 ** ((eloAway - eloHome) / 400))
  const expectedAway = 1 - expectedHome
  const actualHome = hs > as ? 1 : 0
  const actualAway = 1 - actualHome

  const margin = Math.abs(hs - as)
  const marginMult = Math.min(1.75, 1 + margin / 20)
  const k = ELO_K * marginMult

  homeTeam.eloRating = clampElo(eloHome + k * (actualHome - expectedHome))
  awayTeam.eloRating = clampElo(eloAway + k * (actualAway - expectedAway))
}
