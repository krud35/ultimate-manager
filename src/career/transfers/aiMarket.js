import { buildSquadPlan, playerSquadProfile } from '../clubManagement.js'
/**
 * Transfery między klubami AI w oknie transferowym.
 */

import { createRng } from '../../matchEngine/rng.js'
import { getOverallRating } from '../../models/playerStats.js'
import { worldTeamsList } from '../worldState.js'
import {
  ensureWorldFinances,
  getTransferBudget,
  getTransferPolicy,
  canBuyPlayers,
} from './clubFinances.js'
import {
  computeAskPrice,
  evaluateBuyOffer,
  classifyTransferTarget,
} from './negotiation.js'
import { computeMarketValue } from './playerValue.js'
import { getTransferWindowState, isTransferWindowOpen } from './transferWindow.js'
import { completeTransferBetweenClubs } from './transferEngine.js'
import { aiAutoPlayerContractTerms } from './playerNegotiation.js'
import { ensurePlayerContract } from './playerContracts.js'
import { getPlayerMarketValue } from './playerValue.js'
import { addDays, formatISODate } from '../../league/seasonCalendar.js'
import { startLoan, evaluateLoanOffer } from './loans.js'

const MIN_ROSTER = 14

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const AI_LISTING_COMFORTABLE_ROSTER = 24

function isoWeekKey(dateIso) {
  const d = new Date(`${String(dateIso).slice(0, 10)}T12:00:00`)
  const day = Math.floor(d.getTime() / (7 * 86400000))
  return String(day)
}

/**
 * Kluby AI co tydzień przeglądają skład i same wystawiają nadwyżkowych zawodników
 * na listę transferową (nigdy gwiazdy). Pełna re-ewaluacja co tydzień — może też
 * zdjąć zawodnika z listy, gdy warunki już nie zachodzą.
 */
function refreshAiTransferListings(world, { date, seed, excludeTeamId = null, market } = {}) {
  if (!date) return
  const weekKey = isoWeekKey(date)
  for (const team of worldTeamsList(world)) {
    if (team.id === excludeTeamId) continue
    if (team._lastListingReviewWeek === weekKey) continue
    team._lastListingReviewWeek = weekKey

    const rng = createRng(hashSeed(`${seed ?? 1}-${team.id}-listing-${weekKey}`))
    const players = team.players ?? []
    if (!players.length) continue
    const avg = market.average(team)
    const policy = getTransferPolicy(team)
    const rankMap = market.ranks(team)

    for (const player of players) {
      if (player.loan) {
        player.transferListed = false
        continue
      }
      const ovr = market.rating(player)
      const rank = rankMap.get(String(player.id)) ?? players.length
      const isStar = rank <= 1 || ovr >= avg + 5
      if (isStar) {
        player.transferListed = false
        continue
      }
      const overstocked = players.length > AI_LISTING_COMFORTABLE_ROSTER
      const ageDecline = (player.age ?? 25) >= 31 && ovr < avg
      const belowAvg = ovr < avg - 6 && rank >= players.length - 6

      let chance = 0.05
      if (overstocked) chance += 0.15
      if (ageDecline) chance += 0.1
      if (belowAvg) chance += 0.12
      if (policy.id === 'sell') chance += 0.15
      else if (policy.id === 'hardline') chance -= 0.08

      player.transferListed = rng.float() < Math.max(0, Math.min(0.6, chance))
    }
  }
}

/**
 * Kluby AI co tydzień oceniają, których zawodników warto wypożyczyć (nie
 * "nadwyżka na sprzedaż" jak `transferListed` — tu chodzi o brak minut na boisku:
 * młode talenty zablokowane przez pierwszy skład, gracze głęboko w rotacji.
 */
function refreshAiLoanListings(world, { date, seed, excludeTeamId = null, market } = {}) {
  if (!date) return
  const weekKey = isoWeekKey(date)
  for (const team of worldTeamsList(world)) {
    if (team.id === excludeTeamId) continue
    if (team._lastLoanListingReviewWeek === weekKey) continue
    team._lastLoanListingReviewWeek = weekKey

    const rng = createRng(hashSeed(`${seed ?? 1}-${team.id}-loanlisting-${weekKey}`))
    const players = team.players ?? []
    if (!players.length) continue
    const avg = market.average(team)
    const rankMap = market.ranks(team)

    for (const player of players) {
      if (player.loan || player.transferListed) {
        player.loanListed = false
        continue
      }
      const ovr = market.rating(player)
      const rank = rankMap.get(String(player.id)) ?? players.length
      const isStar = rank <= 1 || ovr >= avg + 5
      if (isStar) {
        player.loanListed = false
        continue
      }
      const target = classifyTransferTarget(player, team, avg, ovr)
      const blockedProspect = target.prospect && rank >= 7
      const belowAvg = ovr < avg - 4 && rank >= players.length - 6

      let chance = 0.04
      if (blockedProspect) chance += 0.22
      if (belowAvg) chance += 0.14

      player.loanListed = rng.float() < Math.max(0, Math.min(0.55, chance))
    }
  }
}

/**
 * Jedna próba wypożyczenia AI → AI (poza drużyną gracza).
 */
function tryOneAiLoanDeal(career, rng, excludePlayerIds, market) {
  const destinations = shuffle(market.teams.filter(t => canBuyPlayers(t) && getTransferBudget(t) >= 5_000), rng)
  for (const destinationTeam of destinations) {
    if (rng.float() > 0.4) continue
    const candidates = shuffle(market.rows().filter(row =>
      row.seller.id !== destinationTeam.id && row.seller.players.length > MIN_ROSTER &&
      row.player.loanListed && !row.player.loan && !excludePlayerIds.has(String(row.player.id)) &&
      !market.onCooldown('loan', destinationTeam, row.player)), rng).slice(0, 8)
    for (const { player, seller: parentTeam } of candidates) {
      if (!market.attempt('loan')) return null
      const value = getPlayerMarketValue(player)
      const fee = Math.round((value * (0.05 + rng.float() * 0.1)) / 1000) * 1000
      const wageSplitPct = 40 + Math.round(rng.float() * 40)
      const evaluation = evaluateLoanOffer({ player, destinationTeam, parentTeam, fee, wageSplitPct,
        buyClause: null, seed: rng.int(1, 1_000_000_000), buyerAvg: market.average(destinationTeam) })
      if (evaluation.status === 'accepted') {
        const done = startLoan(career, { playerId: player.id, parentTeamId: parentTeam.id,
          destinationTeamId: destinationTeam.id, fee, durationPreset: 'rest_of_season', wageSplitPct, buyClause: null })
        if (done.ok) {
          excludePlayerIds.add(String(player.id))
          market.invalidate(parentTeam, destinationTeam)
          return done.loanLogEntry
        }
      }
      market.reject('loan', destinationTeam, player)
    }
  }
  return null
}


function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Czy AI kupujący powinien interesować się tym zawodnikiem.
 */
function aiWantsPlayer(buyer, player, seller, ask, budget, rng, rank, buyerAvg, ovr) {
  if (ask > budget) return false
  if ((seller.players?.length ?? 0) <= MIN_ROSTER) return false

  const target = classifyTransferTarget(player, buyer, buyerAvg, ovr)
  const { age, room, prospect, strongProspect, veteranBargain, veteran } = target

  // Nie atakuj regularnie #1 rywala — tylko bogate kluby, rzadko.
  if (rank === 0) {
    if (budget < ask * 1.15) return false
    if (rng.float() > 0.18) return false
  } else if (rank <= 2 && rng.float() > 0.45) {
    return false
  }

  // Cele: upgrade, depth, młody talent, weteran-okazja.
  const upgrade = ovr >= buyerAvg - 1
  const depth = ovr >= buyerAvg - 4 && rank >= 3
  const prospectFit = prospect && ovr >= buyerAvg - (strongProspect ? 9 : 7)
  const veteranFit =
    (veteranBargain || (veteran && ovr >= buyerAvg - 2)) && ovr >= 70 && age <= 36
  if (!upgrade && !prospectFit && !depth && !veteranFit) return false

  // Polityka sprzedażowa sprzedającego ułatwia deal.
  const policy = getTransferPolicy(seller)
  const sellBias = policy.id === 'sell' ? 0.15 : policy.id === 'hardline' ? -0.12 : 0
  let desire = 0.55 + sellBias
  if (strongProspect) desire += 0.18
  else if (prospectFit) desire += 0.12
  if (veteranBargain) desire += 0.1
  else if (veteranFit) desire += 0.05
  // Starsi z małym roomem są łatwiejszym „depth hire”.
  if (veteran && room <= 2) desire += 0.04
  return rng.float() < Math.min(0.92, desire)
}

function pickAiOffer(ask, budget, rng) {
  const mult = 0.92 + rng.float() * 0.38 // 92–130% ask
  let offer = Math.round((ask * mult) / 1000) * 1000
  offer = Math.min(offer, budget)
  // Zostaw trochę budżetu.
  const reserve = Math.round(budget * 0.08)
  if (offer > budget - reserve && budget > reserve * 2) {
    offer = Math.max(0, budget - reserve)
    offer = Math.round(offer / 1000) * 1000
  }
  return offer
}

/**
 * Jedna próba transferu AI → AI (bez drużyny gracza jako kupującego/sprzedającego).
 * @returns {object|null} entry lub null
 */
// Transient caches live only for this market tick; successful moves invalidate both clubs.
export const AI_MARKET_TRANSFER_EVALUATION_LIMIT = 240
export const AI_MARKET_LOAN_EVALUATION_LIMIT = 80
const RETRY_DELAY_DAYS = 3

function createMarketContext(career, date) {
  const teams = worldTeamsList(career.world).filter(t => t.id !== career.playerTeamId)
  for (const t of teams) if (!t.squadPlan) buildSquadPlan(t)
  const ratings = new Map()
  const rankMaps = new Map()
  const rating = player => {
    if (!ratings.has(player)) ratings.set(player, getOverallRating(player.skills))
    return ratings.get(player)
  }
  const ranks = team => {
    if (!rankMaps.has(team.id)) {
      rankMaps.set(team.id, new Map([...(team.players ?? [])].sort((a, b) => rating(b) - rating(a))
        .map((player, index) => [String(player.id), index])))
    }
    return rankMaps.get(team.id)
  }
  const averages = new Map()
  const rosters = new Map()
  const state = career.world.aiMarketState ??= { cooldowns: {} }
  state.cooldowns ??= {}
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
  if (dated) for (const [key, until] of Object.entries(state.cooldowns)) {
    if (until <= date) delete state.cooldowns[key]
  }
  const metrics = { candidateEvaluations: 0, transferEvaluations: 0, loanEvaluations: 0, rosterBuilds: 0 }
  const cooldownKey = (kind, buyer, player) => JSON.stringify([kind, buyer.id, player.id])
  return {
    teams, metrics, rating, ranks,
    average(team) {
      if (!averages.has(team.id)) averages.set(team.id, (team.players ?? []).reduce((sum, p) => sum + rating(p), 0) / Math.max(1, team.players?.length ?? 0))
      return averages.get(team.id)
    },
    rows() {
      return teams.flatMap(seller => {
        if (!rosters.has(seller.id)) {
          const rankMap = ranks(seller)
          metrics.rosterBuilds++
          rosters.set(seller.id, (seller.players ?? []).filter(p => !p.loan).map(player => {
            const ovr = rating(player)
            const value = computeMarketValue(player, ovr)
            player.marketValue = value
            const rank = rankMap.get(String(player.id))
            return { player, seller, rank, ask: computeAskPrice(player, seller, rank, value), ovr, ...playerSquadProfile(player) }
          }))
        }
        return rosters.get(seller.id)
      })
    },
    invalidate(...changed) {
      for (const team of changed) { averages.delete(team.id); rosters.delete(team.id); rankMaps.delete(team.id); buildSquadPlan(team) }
    },
    attempt(kind) {
      const key = kind === 'loan' ? 'loanEvaluations' : 'transferEvaluations'
      const limit = kind === 'loan' ? AI_MARKET_LOAN_EVALUATION_LIMIT : AI_MARKET_TRANSFER_EVALUATION_LIMIT
      if (metrics[key] >= limit) return false
      metrics[key]++
      metrics.candidateEvaluations++
      return true
    },
    onCooldown(kind, buyer, player) { return dated && state.cooldowns[cooldownKey(kind, buyer, player)] > date },
    reject(kind, buyer, player) {
      if (dated) state.cooldowns[cooldownKey(kind, buyer, player)] = formatISODate(addDays(date, RETRY_DELAY_DAYS))
    },
  }
}

function tryOneAiDeal(career, rng, excludePlayerIds, market) {
  const buyers = shuffle(market.teams.filter(t => canBuyPlayers(t) && getTransferBudget(t) >= 40_000 && t.players.length < (t.squadPlan?.target ?? 28)), rng)
  for (const buyer of buyers) {
    if (rng.float() > 0.55) continue
    const budget = getTransferBudget(buyer)
    const buyerAvg = market.average(buyer)
    // Build a bounded, affordable shortlist. No repeated buyer × seller roster sorts.
    const candidates = shuffle(market.rows().filter(row =>
      row.seller.id !== buyer.id && row.seller.players.length > MIN_ROSTER && row.ask <= budget &&
      !excludePlayerIds.has(String(row.player.id)) && !row.player.loan &&
      (!row.player.lastTransferDate || !career.league?.currentDate || (new Date(career.league.currentDate) - new Date(row.player.lastTransferDate)) >= 120 * 86400000) &&
      row.ovr >= buyerAvg - 9 && !market.onCooldown('buy', buyer, row.player)), rng)
      .sort((a, b) => {
        const score = row => (buyer.squadPlan?.needs[row.role] ?? 0) * 3 + (buyer.squadPlan?.needs[row.line] ?? 0) * 2 +
          (row.player.transferListed ? 1 : 0) + (buyer.clubStrategy === 'development' && row.player.age <= 22 ? 4 : 0)
        return score(b) - score(a)
      }).slice(0, 12)
    for (const { player, seller, rank, ask, ovr } of candidates) {
      if (!market.attempt('buy')) return null
      if (!aiWantsPlayer(buyer, player, seller, ask, budget, rng, rank, buyerAvg, ovr)) continue
      const offer = pickAiOffer(ask, budget, rng)
      if (offer < ask * 0.7) continue
      const evaluation = evaluateBuyOffer({ player, sellerTeam: seller, offerAmount: offer,
        seed: rng.int(1, 1_000_000_000), precomputedRank: rank })
      let fee = evaluation.status === 'accepted' ? offer : null
      if (evaluation.status === 'counter' && evaluation.counterAmount != null) {
        const counter = evaluation.counterAmount
        if (counter <= budget && counter <= ask * 1.35 && rng.float() < 0.7) fee = counter
      }
      if (fee != null && fee <= getTransferBudget(buyer)) {
        ensurePlayerContract(player)
        const autoContract = aiAutoPlayerContractTerms({ player, sellerTeam: seller, buyerTeam: buyer,
          league: career.league ?? null, rng })
        if (autoContract.ok && autoContract.terms) {
          if (fee <= getTransferBudget(buyer)) {
            const done = completeTransferBetweenClubs(career, { playerId: player.id, fee,
              buyerTeamId: buyer.id, sellerTeamId: seller.id, contract: autoContract.terms })
            if (done.ok) {
              excludePlayerIds.add(String(player.id))
              market.invalidate(buyer, seller)
              return done.entry
            }
          }
        }
      }
      market.reject('buy', buyer, player)
    }
  }
  return null
}

/**
 * Symuluje aktywność transferową AI w otwartym oknie.
 *
 * @param {object} career — mutuje world + zwraca nowy transferLog
 * @param {{
 *   mode?: 'daily'|'burst',
 *   date?: string|null,
 *   maxDeals?: number,
 *   seed?: number,
 * }} [options]
 */
export function simulateAiTransferActivity(career, options = {}) {
  const requestedDate = options.date
  if (career && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate ?? '')) {
    career = { ...career, league: { ...career.league, currentDate: requestedDate } }
  }
  if (!career?.world || !isTransferWindowOpen(career) ||
      ((options.mode ?? 'daily') === 'daily' && career.world.aiMarketState?.lastDailyDate >= career.league?.currentDate)) {
    return {
      ok: true,
      deals: [],
      transferLog: career?.transferLog ?? [],
      loanDeals: [],
      loanLog: career?.loanLog ?? [],
      world: career?.world,
    }
  }

  ensureWorldFinances(career.world)
  const window = getTransferWindowState(career)
  const mode = options.mode ?? 'daily'
  const date =
    options.date ??
    career.league?.currentDate ??
    (window.kind === 'summer' ? `summer-${career.seasonYear}` : null)

  const defaultMax = mode === 'burst' ? 10 : window.kind === 'january' ? 2 : 3
  const maxDeals = Math.max(0, options.maxDeals ?? defaultMax)
  const maxLoanDeals = mode === 'burst' ? 4 : 1

  const seed =
    options.seed ??
    hashSeed(
      `${career.id}|${career.seasonIndex}|${date}|${mode}|ai${(career.transferLog ?? []).length}|${getTransferBudget(worldTeamsList(career.world)[0])}`,
    )
  const rng = createRng(seed ^ (seed >>> 16) ^ 0x9e3779b9)

  const market = createMarketContext(career, date)
  refreshAiTransferListings(career.world, { date, seed, excludeTeamId: career.playerTeamId, market })
  refreshAiLoanListings(career.world, { date, seed, excludeTeamId: career.playerTeamId, market })
  const deals = []
  const loanDeals = []
  const exclude = new Set()
  let transferLog = career.transferLog ?? []
  let loanLog = career.loanLog ?? []

  for (let i = 0; i < maxDeals; i += 1) {
    // Codziennie: ~80% szansy na pierwszą próbę, potem malejąco.
    if (mode === 'daily') {
      const p = i === 0 ? 0.82 : 0.45
      if (rng.float() > p) break
    }

    const liveCareer = { ...career, transferLog, loanLog, world: career.world }
    const entry = tryOneAiDeal(liveCareer, rng, exclude, market)
    if (!entry) break
    deals.push(entry)
    transferLog = [...transferLog, entry]
  }

  for (let i = 0; i < maxLoanDeals; i += 1) {
    if (rng.float() > (i === 0 ? 0.5 : 0.3)) break
    const liveCareer = { ...career, transferLog, loanLog, world: career.world }
    const loanEntry = tryOneAiLoanDeal(liveCareer, rng, exclude, market)
    if (!loanEntry) break
    loanDeals.push(loanEntry)
    loanLog = [...loanLog, loanEntry]
  }

  if (mode === 'daily') career.world.aiMarketState.lastDailyDate = date
  return {
    ok: true,
    metrics: market.metrics,
    deals,
    transferLog,
    loanDeals,
    loanLog,
    world: career.world,
  }
}

/**
 * Domknięcie AI przy wejściu w off-season / finalize.
 */
export function simulateAiOffseasonTransferBurst(career, options = {}) {
  return simulateAiTransferActivity(career, {
    mode: 'burst',
    maxDeals: options.maxDeals ?? 12,
    date: options.date ?? `offseason-burst-${career.seasonYear}-${career.seasonIndex}`,
    seed: options.seed,
  })
}

/**
 * Przy przewijaniu wielu dni w oknie — po 1–2 dealach na dzień z oknem.
 */
export function simulateAiTransfersForDateRange(career, startDate, endDate, options = {}) {
  let current = career
  const deals = [], loanDeals = []
  if (startDate && endDate) {
    for (let date = startDate.slice(0, 10); date <= endDate.slice(0, 10); date = formatISODate(addDays(date, 1))) {
      const result = simulateAiTransferActivity(current, { ...options, mode: 'daily', date })
      current = { ...current, world: result.world, transferLog: result.transferLog, loanLog: result.loanLog }
      deals.push(...result.deals)
      loanDeals.push(...result.loanDeals)
    }
  }
  return { ok: true, world: current?.world, transferLog: current?.transferLog ?? [],
    loanLog: current?.loanLog ?? [], deals, loanDeals }
}
