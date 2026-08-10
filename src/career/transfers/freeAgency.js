/**
 * Wolni agenci: zwolnienia, podpisywanie, odnowienia kontraktów.
 */

import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'
import { worldTeamById, worldTeamsList } from '../worldState.js'
import {
  canBuyPlayers,
  getTransferBudget,
  ensureWorldFinances,
} from './clubFinances.js'
import {
  clearPlayerContractOnExit,
  ensurePlayerContract,
  getContractRemainingCost,
  signPlayerContract,
  reserveContractFunds,
} from './playerContracts.js'
import {
  aiAutoPlayerContractTerms,
  computePlayerContractDemands,
  evaluatePlayerContractOffer,
  previewContractOffer,
} from './playerNegotiation.js'
import { formatUsd, getPlayerMarketValue, refreshPlayerMarketValue } from './playerValue.js'
import { isTransferWindowOpen } from './transferWindow.js'
import { playerOvrRank } from './negotiation.js'

export const PLAYER_STATUS = {
  ACTIVE: 'active',
  FREE_AGENT: 'free_agent',
  RETIRED: 'retired',
  ACADEMY: 'academy',
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
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }
  ensureWorldFreeAgents(world)
  ensureWorldFinances(world)

  const buyerId = opts.buyerTeamId ?? career.playerTeamId
  const buyer = worldTeamById(world, buyerId)
  if (!buyer) return { ok: false, error: 'Brak klubu' }
  if (!canBuyPlayers(buyer) && buyerId === career.playerTeamId) {
    // AI may still try when recovering — block all when ≤ 0
  }
  if (getTransferBudget(buyer) <= 0) {
    return { ok: false, error: 'Ujemny lub zerowy budżet — nie można podpisywać zawodników' }
  }

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

  const preview = previewContractOffer(contractTerms.weeklyWage, contractTerms.years)
  if (preview.totalCost > getTransferBudget(buyer)) {
    return {
      ok: false,
      error: `Brak środków na kontrakt (${formatUsd(preview.totalCost)}; budżet ${formatUsd(getTransferBudget(buyer))})`,
    }
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

  const oldRefund = clearPlayerContractOnExit(team, player)
  const signed = signPlayerContract(team, player, {
    weeklyWage: evaluation.contractTerms.weeklyWage,
    years: evaluation.contractTerms.years,
    bonuses: evaluation.contractTerms.bonuses ?? opts.bonuses ?? [],
    promises: evaluation.contractTerms.promises ?? opts.promises ?? [],
    signedDate: career.league?.currentDate ?? null,
  })
  if (!signed.ok) {
    // Przywróć stare środki jeśli rezerwacja się nie udała — best-effort
    if (oldRefund > 0) {
      reserveContractFunds(team, oldRefund)
    }
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
export function processAiContractCycle(world, { playerTeamId = null, seed = 1, league = null } = {}) {
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
    const budget = getTransferBudget(team)
    const desperate = budget <= 0

    // Sort: worst first for release consideration
    const ranked = players
      .map((p) => ({
        p,
        ovr: getOverallRating(p.skills),
        rank: playerOvrRank(players, p.id),
        pot: Number.isFinite(p.potential) ? p.potential : getOverallRating(p.skills),
        age: p.age ?? 25,
        wage: p.contract?.weeklyWage ?? 0,
        weeks: p.contract?.weeksRemaining ?? 0,
      }))
      .sort((a, b) => a.ovr - b.ovr)

    for (const row of ranked) {
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
            const cost = previewContractOffer(auto.terms.weeklyWage, auto.terms.years).totalCost
            const refund = getContractRemainingCost(row.p.contract)
            if (cost - refund <= getTransferBudget(team) + 50_000 || isStar) {
              clearPlayerContractOnExit(team, row.p)
              const signed = signPlayerContract(team, row.p, {
                ...auto.terms,
                signedDate: null,
              })
              if (signed.ok) renewed += 1
            }
          }
        }
        continue
      }

      // Release candidates
      const rosterOk = (team.players?.length ?? 0) > 14
      if (rosterOk && (youngBad || oldWeak || (desperate && row.rank >= players.length - 3))) {
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
          const cost = previewContractOffer(auto.terms.weeklyWage, auto.terms.years).totalCost
          const refund = getContractRemainingCost(row.p.contract)
          if (cost - refund <= Math.max(0, getTransferBudget(team))) {
            clearPlayerContractOnExit(team, row.p)
            const signed = signPlayerContract(team, row.p, auto.terms)
            if (signed.ok) renewed += 1
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
  if (!world || !isTransferWindowOpen(career)) {
    return { deals: 0, transferLog: career.transferLog ?? [] }
  }
  ensureWorldFreeAgents(world)
  let deals = 0
  let transferLog = [...(career.transferLog ?? [])]
  let salt = seed >>> 0

  const fas = [...(world.freeAgents ?? [])].sort(
    (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills),
  )

  for (const team of worldTeamsList(world)) {
    if (deals >= maxDeals) break
    if (team.id === career.playerTeamId) continue
    if (getTransferBudget(team) <= 0) continue
    if ((team.players?.length ?? 0) >= AI_ROSTER_HARD_CAP) continue

    // Im dalej pod celem, tym więcej podpisań może zrobić ten klub w tym przebiegu.
    const roomToTarget = Math.max(0, rosterTarget - (team.players?.length ?? 0))
    const signsAllowedForTeam = 1 + Math.min(3, roomToTarget)
    let signedForTeam = 0

    for (const player of fas) {
      if (deals >= maxDeals || signedForTeam >= signsAllowedForTeam) break
      if ((team.players?.length ?? 0) >= AI_ROSTER_HARD_CAP) break
      if (!world.freeAgents.includes(player)) continue
      const avg =
        (team.players ?? []).reduce((s, p) => s + getOverallRating(p.skills), 0) /
          Math.max(1, team.players?.length ?? 1)
      const ovr = getOverallRating(player.skills)
      if (ovr < avg - 6) continue
      salt = (Math.imul(salt, 1664525) + 1013904223) >>> 0
      if ((salt % 1000) / 1000 > 0.35) continue

      const result = signFreeAgent(
        { ...career, world, transferLog },
        { playerId: player.id, buyerTeamId: team.id },
      )
      if (result.ok) {
        deals += 1
        signedForTeam += 1
        transferLog = result.transferLog
      }
    }
  }

  return { deals, transferLog, world }
}
