/**
 * Wolni agenci: zwolnienia, podpisywanie, odnowienia kontraktów.
 */

import { canAffordContract, clubCash, ensureClubEconomy, contractualWeeklyBill } from '../clubEconomy.js'
import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'
import { worldTeamById, worldTeamsList } from '../worldState.js'
import {
  ensureWorldFinances,
} from './clubFinances.js'
import {
  clearPlayerContractOnExit,
  ensurePlayerContract,
  signPlayerContract,
} from './playerContracts.js'
import {
  aiAutoPlayerContractTerms,
  evaluatePlayerContractOffer,
} from './playerNegotiation.js'
import { getPlayerMarketValue, refreshPlayerMarketValue } from './playerValue.js'
import { buildOvrRankMap } from './negotiation.js'

export const PLAYER_STATUS = {
  ACTIVE: 'active',
  FREE_AGENT: 'free_agent',
  RETIRED: 'retired',
  ACADEMY: 'academy',
}

function canAffordAiRenewal(team, player, wage) {
  const reserveForDepth = Math.max(0, 14 - team.players.length) * 800
  return canAffordContract(team, player, wage).ok &&
    contractualWeeklyBill(team, player.id) + wage + reserveForDepth <= ensureClubEconomy(team).weeklyWageLimit
}

export function ensureWorldFreeAgents(world) {
  if (!world) return world
  if (!Array.isArray(world.freeAgents)) world.freeAgents = []
  if (!Array.isArray(world.retiredPlayers)) world.retiredPlayers = []
  return world
}

export function findPlayerAnywhere(world, playerId) {
  for (const team of worldTeamsList(world)) {
    const idx = (team.players ?? []).findIndex((p) => String(p.id) === String(playerId))
    if (idx >= 0) {
      return { team, player: team.players[idx], index: idx, freeAgent: false }
    }
  }
  ensureWorldFreeAgents(world)
  const faIdx = world.freeAgents.findIndex((p) => String(p.id) === String(playerId))
  if (faIdx >= 0) {
    return {
      team: null,
      player: world.freeAgents[faIdx],
      index: faIdx,
      freeAgent: true,
    }
  }
  return null
}

/**
 * Zwolnienie zawodnika do puli FA (zwrot niewypłaconej pensji).
 */
export function releasePlayerToFreeAgency(team, player, world) {
  if (!team || !player || !world) return { ok: false, error: 'missing' }
  ensureWorldFreeAgents(world)
  const idx = (team.players ?? []).findIndex((p) => String(p.id) === String(player.id))
  if (idx < 0) return { ok: false, error: 'not_on_roster' }

  clearPlayerContractOnExit(team, player)
  const [moved] = team.players.splice(idx, 1)
  moved.status = PLAYER_STATUS.FREE_AGENT
  moved.contract = null
  world.freeAgents.push(moved)
  return { ok: true, player: moved }
}

/**
 * Podpisanie wolnego agenta (tylko kontrakt, bez opłaty transferowej).
 */
export function signFreeAgent(career, opts) {
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  ensureWorldFreeAgents(world)
  ensureWorldFinances(world)

  const buyerId = opts.buyerTeamId ?? career.playerTeamId
  const buyer = worldTeamById(world, buyerId)
  if (!buyer) return { ok: false, error: 'Brak klubu' }
  if ((buyer.players?.length ?? 0) >= 32) return { ok: false, error: 'Limit 32 seniorów / Senior roster limit' }
  const faIdx = world.freeAgents.findIndex((p) => String(p.id) === String(opts.playerId))
  if (faIdx < 0) return { ok: false, error: 'Zawodnik nie jest wolnym agentem' }
  const player = world.freeAgents[faIdx]

  let contractTerms = opts.contract ?? null
  if (!contractTerms) {
    const auto = aiAutoPlayerContractTerms({
      player,
      sellerTeam: null,
      buyerTeam: buyer,
      league: career.league ?? null,
      renew: false,
    })
    if (!auto.ok || !auto.terms) {
      return { ok: false, error: 'Zawodnik nie zgodził się na warunki' }
    }
    contractTerms = auto.terms
  }

  const signed = signPlayerContract(buyer, player, {
    ...contractTerms,
    signedDate: career.league?.currentDate ?? null,
  })
  if (!signed.ok) return signed

  world.freeAgents.splice(faIdx, 1)
  player.status = PLAYER_STATUS.ACTIVE
  buyer.players = buyer.players ?? []
  buyer.players.push(player)
  refreshPlayerMarketValue(player)

  const entry = {
    date: career.league?.currentDate ?? null,
    playerId: player.id,
    playerName: getPlayerFullName(player),
    fromTeamId: null,
    toTeamId: buyer.id,
    fee: 0,
    freeAgent: true,
    weeklyWage: signed.contract?.weeklyWage,
    years: signed.contract?.years,
  }
  const transferLog = [...(career.transferLog ?? []), entry]
  return {
    ok: true,
    player,
    contract: signed.contract,
    entry,
    transferLog,
    world,
  }
}

/**
 * Odnowienie kontraktu zawodnika we własnym klubie.
 * Zwraca starą rezerwę pensji, rezerwuje nową.
 */
export function renewPlayerContract(career, opts) {
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }

  const team = worldTeamById(world, career.playerTeamId)
  const found = findPlayerAnywhere(world, opts.playerId)
  if (!team || !found || found.freeAgent) {
    return { ok: false, error: 'Nie znaleziono zawodnika' }
  }
  if (found.team?.id !== career.playerTeamId) {
    return { ok: false, error: 'Zawodnik nie jest w Twoim klubie' }
  }

  const player = found.player
  ensurePlayerContract(player)

  const evaluation = evaluatePlayerContractOffer({
    player,
    sellerTeam: team,
    buyerTeam: team,
    league: career.league ?? null,
    weeklyWage: opts.weeklyWage,
    years: opts.years,
    bonuses: opts.bonuses ?? [],
    promises: opts.promises ?? [],
    seed: opts.seed ?? null,
    renew: true,
  })

  if (evaluation.status !== 'accepted') {
    return {
      ok: true,
      completed: false,
      playerEvaluation: evaluation,
      playerDemands: evaluation.demands,
      playerId: player.id,
    }
  }

  const previousContract = player.contract
  clearPlayerContractOnExit(team, player)
  const signed = signPlayerContract(team, player, {
    weeklyWage: evaluation.contractTerms.weeklyWage,
    years: evaluation.contractTerms.years,
    bonuses: evaluation.contractTerms.bonuses ?? opts.bonuses ?? [],
    promises: evaluation.contractTerms.promises ?? opts.promises ?? [],
    signedDate: career.league?.currentDate ?? null,
  })
  if (!signed.ok) {
    player.contract = previousContract
    return { ok: false, error: signed.error, playerEvaluation: evaluation }
  }

  player.status = PLAYER_STATUS.ACTIVE
  return {
    ok: true,
    completed: true,
    playerEvaluation: evaluation,
    contract: signed.contract,
    playerId: player.id,
    world,
  }
}

/**
 * Lista wolnych agentów na rynku.
 */
export function listFreeAgents(world) {
  ensureWorldFreeAgents(world)
  ensureWorldFinances(world)
  const rows = []
  for (const player of world.freeAgents ?? []) {
    if (player.status === PLAYER_STATUS.RETIRED) continue
    refreshPlayerMarketValue(player)
    const ovr = getOverallRating(player.skills)
    rows.push({
      player,
      playerId: player.id,
      name: getPlayerFullName(player),
      position: player.position ?? '—',
      ovr,
      age: player.age ?? null,
      marketValue: getPlayerMarketValue(player),
      askPrice: 0,
      freeAgent: true,
      teamId: null,
      teamName: 'Free Agent',
      teamShort: 'FA',
      weeklyWage: null,
      contractYears: null,
    })
  }
  rows.sort((a, b) => b.ovr - a.ovr)
  return rows
}

/**
 * AI: decyzja czy zatrzymać / zwolnić / przedłużyć.
 * @returns {{ renewed: number, released: number }}
 */
export function processAiContractCycle(world, { playerTeamId = null, seed = 1, league = null, maxRemainingWeeks = null } = {}) {
  ensureWorldFreeAgents(world)
  let renewed = 0
  let released = 0
  let salt = seed >>> 0

  for (const team of worldTeamsList(world)) {
    if (team.id === playerTeamId) continue
    const players = [...(team.players ?? [])]
    if (players.length === 0) continue

    const avg =
      players.reduce((s, p) => s + getOverallRating(p.skills), 0) / players.length
    const budget = clubCash(team)
    const rankMap = buildOvrRankMap(players)
    const desperate = budget <= 0

    // Sort: worst first for release consideration
    const ranked = players
      .map((p) => ({
        p,
        ovr: getOverallRating(p.skills),
        rank: rankMap.get(String(p.id)) ?? players.length,
        pot: Number.isFinite(p.potential) ? p.potential : getOverallRating(p.skills),
        age: p.age ?? 25,
        wage: p.contract?.weeklyWage ?? 0,
        weeks: p.contract?.weeksRemaining ?? 0,
      }))
      .sort((a, b) => a.ovr - b.ovr)

    for (const row of ranked) {
      if (maxRemainingWeeks != null && row.weeks > maxRemainingWeeks) continue
      // Zawodnik na wypożyczeniu nie należy kontraktowo do tego klubu — nie
      // zwalniaj/odnawiaj go tutaj (kontrakt/decyzje zostają przy klubie macierzystym).
      if (row.p.loan) continue
      salt = (Math.imul(salt, 1664525) + 1013904223) >>> 0
      const roll = (salt % 1000) / 1000
      const isStar = row.rank <= 1 || row.ovr >= avg + 5
      const isKeepCheap = row.wage < 800 && row.ovr >= avg - 4
      const youngBad = row.age <= 22 && row.pot <= row.ovr + 2 && row.ovr < avg - 5
      const oldWeak = row.age >= 32 && row.ovr < avg - 3
      const expiring = row.weeks > 0 && row.weeks < 26

      // Stars almost never released
      if (isStar && !desperate) {
        if (expiring || row.weeks <= 0) {
          const auto = aiAutoPlayerContractTerms({
            player: row.p,
            sellerTeam: team,
            buyerTeam: team,
            league,
            renew: true,
          })
          if (auto.ok && auto.terms) {
            if (canAffordAiRenewal(team, row.p, auto.terms.weeklyWage)) {
              const previousContract = row.p.contract
              clearPlayerContractOnExit(team, row.p)
              const signed = signPlayerContract(team, row.p, {
                ...auto.terms,
                signedDate: league?.currentDate ?? null,
                seasonYear: league?.calendar?.seasonYear ?? league?.seasonYear ?? null,
              })
              if (signed.ok) renewed += 1
              else row.p.contract = previousContract
            }
          }
        }
        continue
      }

      // Release candidates
      const rosterOk = (team.players?.length ?? 0) > 14
      if (maxRemainingWeeks == null && rosterOk && (youngBad || oldWeak || (desperate && row.rank >= players.length - 3))) {
        const releaseChance = desperate ? 0.55 : youngBad ? 0.35 : oldWeak ? 0.28 : 0.1
        if (roll < releaseChance) {
          const res = releasePlayerToFreeAgency(team, row.p, world)
          if (res.ok) released += 1
          continue
        }
      }

      // Prefer keep — renew if expiring
      if ((expiring || row.weeks <= 0) && (isKeepCheap || row.ovr >= avg - 2 || roll < 0.65)) {
        const auto = aiAutoPlayerContractTerms({
          player: row.p,
          sellerTeam: team,
          buyerTeam: team,
          league,
          renew: true,
        })
        if (auto.ok && auto.terms) {
          if (canAffordAiRenewal(team, row.p, auto.terms.weeklyWage)) {
            const previousContract = row.p.contract
            clearPlayerContractOnExit(team, row.p)
            const signed = signPlayerContract(team, row.p, {
              ...auto.terms,
              signedDate: league?.currentDate ?? null,
              seasonYear: league?.calendar?.seasonYear ?? league?.seasonYear ?? null,
            })
            if (signed.ok) renewed += 1
            else row.p.contract = previousContract
          } else if (rosterOk && desperate && roll < 0.4) {
            const res = releasePlayerToFreeAgency(team, row.p, world)
            if (res.ok) released += 1
          }
        }
      }
    }
  }

  return { renewed, released }
}

/** Twardy sufit rozmiaru seniorskiego rosteru dla FA-sign / promocji z akademii. */
export const AI_ROSTER_HARD_CAP = 32

/**
 * AI podpisuje FA gdy ma budżet i potrzebuje wzmocnienia.
 * Kluby wyraźnie poniżej `rosterTarget` (np. po fali emerytur) mogą podpisać
 * więcej niż jednego FA w tym samym przebiegu — inaczej `maxDeals` powyżej
 * liczby drużyn AI nie miałoby żadnego efektu (dawniej: max 1 deal/drużynę).
 */
export function simulateAiFreeAgentSignings(
  career,
  { maxDeals = 4, seed = 1, rosterTarget = 31 } = {},
) {
  const world = career.world
  if (!world) {
    return { deals: 0, transferLog: career.transferLog ?? [] }
  }
  ensureWorldFreeAgents(world)
  let deals = 0
  let transferLog = [...(career.transferLog ?? [])]
  let salt = seed >>> 0

  const activeFreeAgents = new Set(world.freeAgents ?? [])
  const ratings = new Map([...activeFreeAgents].map(p => [p, getOverallRating(p.skills)]))
  const fas = [...activeFreeAgents].sort((a, b) => ratings.get(b) - ratings.get(a))

  for (const team of worldTeamsList(world).sort((a, b) => a.players.length - b.players.length)) {
    if (deals >= maxDeals) break
    if (team.id === career.playerTeamId) continue
    if ((team.players?.length ?? 0) >= Math.min(AI_ROSTER_HARD_CAP, rosterTarget)) continue

    // Im dalej pod celem, tym więcej podpisań może zrobić ten klub w tym przebiegu.
    const roomToTarget = Math.max(0, rosterTarget - (team.players?.length ?? 0))
    const signsAllowedForTeam = 1 + Math.min(3, roomToTarget)
    let signedForTeam = 0
    let squadRatingTotal = team.players.reduce((sum, p) => sum + getOverallRating(p.skills), 0)
    let wageBill = contractualWeeklyBill(team)
    const wageLimit = ensureClubEconomy(team).weeklyWageLimit
    const affordableTarget = Math.min(24, Math.max(14, Math.floor(wageLimit / 1000)))

    for (const player of fas) {
      if (deals >= maxDeals || signedForTeam >= signsAllowedForTeam) break
      if ((team.players?.length ?? 0) >= Math.min(AI_ROSTER_HARD_CAP, rosterTarget)) break
      if (!activeFreeAgents.has(player)) continue
      const avg = squadRatingTotal / Math.max(1, team.players.length)
      const ovr = ratings.get(player)
      const shortage = Math.max(0, affordableTarget - team.players.length)
      if (ovr < avg - (shortage > 0 ? 12 : 6)) continue
      salt = (Math.imul(salt, 1664525) + 1013904223) >>> 0
      if ((salt % 1000) / 1000 > 0.35) continue

      const auto = aiAutoPlayerContractTerms({ player, sellerTeam: null, buyerTeam: team, league: career.league })
      if (!auto.ok) continue
      // Preserve enough payroll room to fill a playable squad, instead of buying one star.
      const remaining = wageLimit - wageBill
      if (shortage > 0 && auto.terms.weeklyWage > remaining / shortage * 1.25) continue

      const result = signFreeAgent(
        { ...career, world, transferLog },
        { playerId: player.id, buyerTeamId: team.id, contract: auto.terms },
      )
      if (result.ok) {
        activeFreeAgents.delete(player)
        squadRatingTotal += ovr
        wageBill = contractualWeeklyBill(team)
        deals += 1
        signedForTeam += 1
        transferLog = result.transferLog
      }
    }
  }

  return { deals, transferLog, world }
}
