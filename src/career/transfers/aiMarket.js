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
import { computeAskPrice, evaluateBuyOffer, playerOvrRank, classifyTransferTarget } from './negotiation.js'
import { refreshPlayerMarketValue } from './playerValue.js'
import { getTransferWindowState, isTransferWindowOpen } from './transferWindow.js'
import { completeTransferBetweenClubs } from './transferEngine.js'
import { aiAutoPlayerContractTerms, previewContractOffer } from './playerNegotiation.js'
import { ensurePlayerContract } from './playerContracts.js'

const MIN_ROSTER = 14

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function teamAvgOvr(team) {
  const players = team?.players ?? []
  if (!players.length) return 70
  let sum = 0
  for (const p of players) sum += getOverallRating(p.skills)
  return sum / players.length
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
function aiWantsPlayer(buyer, player, seller, ask, budget, rng) {
  if (ask > budget) return false
  if ((seller.players?.length ?? 0) <= MIN_ROSTER) return false

  const ovr = getOverallRating(player.skills)
  const buyerAvg = teamAvgOvr(buyer)
  const rank = playerOvrRank(seller.players, player.id)
  const target = classifyTransferTarget(player, buyer)
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
function tryOneAiDeal(career, rng, excludePlayerIds) {
  const world = career.world
  const playerTeamId = career.playerTeamId
  const aiTeams = worldTeamsList(world).filter((t) => t.id !== playerTeamId)
  if (aiTeams.length < 2) return null

  const buyers = shuffle(
    aiTeams.filter((t) => canBuyPlayers(t) && getTransferBudget(t) >= 40_000),
    rng,
  )

  // Kluby z niskim budżetem chętniej sprzedają (desperately avoid negative).
  const sellersSorted = shuffle(
    aiTeams.filter((t) => (t.players?.length ?? 0) > MIN_ROSTER),
    rng,
  ).sort((a, b) => getTransferBudget(a) - getTransferBudget(b))

  for (const buyer of buyers) {
    if (rng.float() > 0.55) continue
    const budget = getTransferBudget(buyer)
    const sellers = sellersSorted.filter((t) => t.id !== buyer.id)

    for (const seller of sellers) {
      const candidates = shuffle(
        (seller.players ?? []).filter((p) => !excludePlayerIds.has(String(p.id))),
        rng,
      ).slice(0, 8)

      for (const player of candidates) {
        refreshPlayerMarketValue(player)
        const ask = computeAskPrice(player, seller)
        if (!aiWantsPlayer(buyer, player, seller, ask, budget, rng)) continue

        const offer = pickAiOffer(ask, budget, rng)
        if (offer < ask * 0.7) continue

        const evaluation = evaluateBuyOffer({
          player,
          sellerTeam: seller,
          offerAmount: offer,
          seed: rng.int(1, 1_000_000_000),
        })

        let fee = null
        if (evaluation.status === 'accepted') {
          fee = offer
        } else if (evaluation.status === 'counter' && evaluation.counterAmount != null) {
          // AI często akceptuje rozsądny konter.
          const counter = evaluation.counterAmount
          if (counter <= budget && counter <= ask * 1.35 && rng.float() < 0.7) {
            fee = counter
          }
        }
        if (fee == null || fee > getTransferBudget(buyer)) continue

        ensurePlayerContract(player)
        const autoContract = aiAutoPlayerContractTerms({
          player,
          sellerTeam: seller,
          buyerTeam: buyer,
          league: career.league ?? null,
          rng,
        })
        if (!autoContract.ok || !autoContract.terms) continue
        const contractCost = previewContractOffer(
          autoContract.terms.weeklyWage,
          autoContract.terms.years,
        ).totalCost
        if (fee + contractCost > getTransferBudget(buyer)) continue

        const done = completeTransferBetweenClubs(career, {
          playerId: player.id,
          fee,
          buyerTeamId: buyer.id,
          sellerTeamId: seller.id,
          contract: autoContract.terms,
        })
        if (done.ok) {
          excludePlayerIds.add(String(player.id))
          return done.entry
        }
      }
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
  if (!career?.world || !isTransferWindowOpen(career)) {
    return {
      ok: true,
      deals: [],
      transferLog: career?.transferLog ?? [],
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

  const seed =
    options.seed ??
    hashSeed(
      `${career.id}|${career.seasonIndex}|${date}|${mode}|ai${(career.transferLog ?? []).length}|${getTransferBudget(worldTeamsList(career.world)[0])}`,
    )
  const rng = createRng(seed ^ (seed >>> 16) ^ 0x9e3779b9)

  const deals = []
  const exclude = new Set()
  let transferLog = career.transferLog ?? []

  for (let i = 0; i < maxDeals; i += 1) {
    // Codziennie: ~80% szansy na pierwszą próbę, potem malejąco.
    if (mode === 'daily') {
      const p = i === 0 ? 0.82 : 0.45
      if (rng.float() > p) break
    }

    const liveCareer = { ...career, transferLog, world: career.world }
    const entry = tryOneAiDeal(liveCareer, rng, exclude)
    if (!entry) break
    deals.push(entry)
    transferLog = [...transferLog, entry]
  }

  return {
    ok: true,
    deals,
    transferLog,
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
  if (!career?.world || !startDate || !endDate) {
    return {
      ok: true,
      deals: [],
      transferLog: career?.transferLog ?? [],
      world: career?.world,
    }
  }

  // Uproszczenie: zamiast pętli po dniach — skalowany burst zależny od długości okna w zakresie.
  const start = String(startDate).slice(0, 10)
  const end = String(endDate).slice(0, 10)
  if (end < start) {
    return {
      ok: true,
      deals: [],
      transferLog: career.transferLog ?? [],
      world: career.world,
    }
  }

  // Policz dni stycznia w zakresie (przybliżenie po stringach YYYY-MM-DD).
  let janDays = 0
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd)
  const last = new Date(ey, em - 1, ed)
  while (cursor.getTime() <= last.getTime()) {
    if (cursor.getMonth() === 0) janDays += 1
    cursor.setDate(cursor.getDate() + 1)
  }

  if (janDays <= 0 && !isTransferWindowOpen(career)) {
    return {
      ok: true,
      deals: [],
      transferLog: career.transferLog ?? [],
      world: career.world,
    }
  }

  const maxDeals = Math.min(
    options.maxDeals ?? 24,
    Math.max(1, Math.round(janDays * (options.perDay ?? 1.2))),
  )

  return simulateAiTransferActivity(career, {
    mode: 'burst',
    maxDeals,
    date: `range-${start}-${end}`,
    seed: options.seed,
  })
}
