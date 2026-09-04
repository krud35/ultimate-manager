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

/**
 * Startowa poprzeczka poziomu piramidy (Liga Europejska; `team.tier`) — kumulatywna,
 * `-(tier - 1) * ELO_TIER_STEP`. Bez niej ranking miesza poziomy zupełnie: rozrzut ELO
 * WEWNĄTRZ jednego poziomu to ok. 200 punktów, czyli znacznie więcej niż różnica jakości
 * składów MIĘDZY poziomami (ok. 60), więc lider Ligi 2 startowałby nad połową Ligi 1.
 *
 * Krok jest jednak celowo MNIEJSZY niż rozrzut wewnątrz poziomu — pasma mają się stykać,
 * nie rozjeżdżać. Przy 110 czubek niższej ligi (średnio 3–4 kluby, zależnie od rocznika)
 * startuje nad ogonem wyższej, a reszta zostaje w swojej kolejności: najlepszy klub Ligi 2
 * ląduje ok. 15. miejsca z 48, nie w topce. Puchar w tym trybie jest międzypoziomowy
 * (patrz `createPyramidCup`), więc to naturalne miejsce na weryfikację takiej zakładki.
 *
 * Rozgrywki bez piramidy (UFA) nie mają `tier` — dla nich poprzeczka to 0.
 */
const ELO_TIER_STEP = 110

function eloTierOffset(tier) {
  const n = Number(tier)
  return Number.isFinite(n) && n >= 1 ? -(n - 1) * ELO_TIER_STEP : 0
}

function tierOffset(team) {
  return eloTierOffset(team?.tier)
}

function clampElo(n) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(n)))
}

/** Seed startowy z jakości składu (top 7) i poziomu piramidy, gdy pole jeszcze nie istnieje. */
export function seedEloFromRoster(team) {
  const offset = tierOffset(team)
  const players = team?.players ?? []
  if (!players.length) return clampElo(ELO_DEFAULT + offset)
  const ovrs = players
    .map((p) => getOverallRating(p?.skills))
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => b - a)
  if (!ovrs.length) return clampElo(ELO_DEFAULT + offset)
  const top = ovrs.slice(0, Math.min(7, ovrs.length))
  const avg = top.reduce((s, n) => s + n, 0) / top.length
  return clampElo(ELO_DEFAULT + (avg - 70) * 15 + offset)
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

/**
 * Jednorazowa migracja zapisów sprzed poprzeczek poziomu: przesuwa istniejący rating
 * o poprzeczkę poziomu, zamiast go przeliczać od zera. Dzięki temu ELO wypracowane
 * wynikami nie przepada, a pasma poziomów rozjeżdżają się tak samo jak przy nowej
 * karierze. Drużyny bez ratingu pomijamy — te dostaną poprzeczkę od razu w seedzie.
 */
function applyEloTierBandsOnce(world, ids, tierByTeamId) {
  if (world.eloTierBandsApplied) return
  world.eloTierBandsApplied = true
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    if (typeof team.eloRating !== 'number' || !Number.isFinite(team.eloRating)) continue
    const offset = eloTierOffset(tierByTeamId?.[id] ?? team.tier)
    if (offset) team.eloRating = clampElo(team.eloRating + offset)
  }
}

/**
 * @param {object} world
 * @param {{ tierByTeamId?: Record<string, number>|null }} [options] — aktualny poziom
 *   piramidy per klub; `team.tier` to statyczne dane EUCS i po awansach jest nieaktualny.
 */
export function ensureWorldElo(world, { tierByTeamId = null } = {}) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  applyEloTierBandsOnce(world, ids, tierByTeamId)
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
