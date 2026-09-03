/**
 * Silnik transferów: listing rynku, wykonanie transferu, log.
 */

import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'
import { getPlayerMorale, ensurePlayerMorale, MORALE_MIN, MORALE_MAX } from '../../models/playerMorale.js'
import { worldTeamById, worldTeamsList } from '../worldState.js'
import {
  adjustTransferBudget,
  ensureWorldFinances,
  getTransferBudget,
  getTransferPolicy,
  canBuyPlayers,
} from './clubFinances.js'
import {
  buildOvrRankMap,
  evaluateBuyOffer,
  computeAskPrice,
  playerOvrRank,
  evaluateSellerCounter,
} from './negotiation.js'
import {
  formatUsd,
  getPlayerMarketValue,
  refreshTeamMarketValues,
  refreshPlayerMarketValue,
} from './playerValue.js'
import { getTransferWindowState, isTransferWindowOpen } from './transferWindow.js'
import { applyReputationAfterTransfer } from '../../models/teamReputation.js'
import {
  noteLoyaltyFromTreatment,
  reseedLoyaltyForNewClub,
} from '../../models/playerLoyalty.js'
import {
  clearPlayerContractOnExit,
  ensurePlayerContract,
  getContractRemainingCost,
  signPlayerContract,
} from './playerContracts.js'
import {
  aiAutoPlayerContractTerms,
  computePlayerContractDemands,
  evaluatePlayerContractOffer,
  previewContractOffer,
} from './playerNegotiation.js'

function findPlayerInWorld(world, playerId) {
  for (const team of worldTeamsList(world)) {
    const idx = (team.players ?? []).findIndex((p) => String(p.id) === String(playerId))
    if (idx >= 0) {
      return { team, player: team.players[idx], index: idx }
    }
  }
  return null
}

/** Jednorazowy spadek morale przy wystawieniu na listę transferową. */
export const TRANSFER_LIST_MORALE_HIT = -4

/**
 * Wystawia/zdejmuje zawodnika z listy transferowej — flaga ortogonalna do `status`
 * (który mówi GDZIE zawodnik żyje: active/free_agent/academy), nie nowy status.
 * @param {object} team
 * @param {string|number} playerId
 * @param {boolean} listed
 */
export function setPlayerTransferListed(team, playerId, listed) {
  const player = (team?.players ?? []).find((p) => String(p.id) === String(playerId))
  if (!player) return { ok: false, error: 'not_on_roster' }
  const wasListed = !!player.transferListed
  player.transferListed = !!listed
  if (listed && !wasListed) {
    // Jednorazowy, niewielki spadek morale/lojalności — zawodnik wie, że klub go nie
    // chce. Nie odwracamy przy zdjęciu z listy (unika farmienia morale przez toggle).
    ensurePlayerMorale(player)
    const before = getPlayerMorale(player)
    player.morale = Math.max(MORALE_MIN, Math.min(MORALE_MAX, before + TRANSFER_LIST_MORALE_HIT))
    noteLoyaltyFromTreatment(player, player.morale - before)
  }
  return { ok: true, player, listed: player.transferListed }
}

/** Progi „wymuszenia" wpisu na listę transferową przez niezadowolonego zawodnika. */
export const UNHAPPY_DEMAND_MORALE_THRESHOLD = 32
export const UNHAPPY_DEMAND_PLAYTIME_SHARE = 0.25
export const UNHAPPY_DEMAND_MIN_TEAM_GAMES = 4
export const UNHAPPY_DEMAND_MORALE_WITH_LOW_PLAYTIME = 45

/**
 * Cotygodniowy przegląd: skrajnie niezadowolony zawodnik (bardzo niskie morale, albo
 * brak czasu gry przy umiarkowanie niskim morale) sam wymusza wpis na listę transferową
 * — to presja zawodnika/agenta, klub się na to nie pyta. Wypożyczeni i już wystawieni
 * zawodnicy są pomijani (nic tu do wymuszenia).
 * @param {object} world
 * @param {{ leaguePlayerStats?: object, standings?: object }} [options]
 * @returns {{ teamId: string, playerId: string|number, playerName: string, reason: 'morale'|'playtime' }[]}
 */
export function checkForcedTransferListDemands(world, { leaguePlayerStats = {}, standings = {} } = {}) {
  const forced = []
  for (const team of worldTeamsList(world)) {
    const standing = standings?.[team.id]
    const teamGames = Math.max(0, (standing?.wins ?? 0) + (standing?.losses ?? 0))

    for (const player of team.players ?? []) {
      if (player.transferListed || player.loan) continue
      ensurePlayerMorale(player)
      const morale = getPlayerMorale(player)

      let starved = false
      if (teamGames >= UNHAPPY_DEMAND_MIN_TEAM_GAMES) {
        const games = leaguePlayerStats?.[player.id]?.games ?? 0
        starved = games / teamGames < UNHAPPY_DEMAND_PLAYTIME_SHARE
      }

      const wantsOut =
        morale < UNHAPPY_DEMAND_MORALE_THRESHOLD ||
        (starved && morale < UNHAPPY_DEMAND_MORALE_WITH_LOW_PLAYTIME)
      if (!wantsOut) continue

      const result = setPlayerTransferListed(team, player.id, true)
      if (result.ok) {
        forced.push({
          teamId: team.id,
          playerId: player.id,
          playerName: getPlayerFullName(player),
          reason: morale < UNHAPPY_DEMAND_MORALE_THRESHOLD ? 'morale' : 'playtime',
        })
      }
    }
  }
  return forced
}

/**
 * Lista zawodników dostępnych na rynku (wszyscy poza drużyną gracza).
 * @param {object} world
 * @param {string} buyerTeamId
 */
export function listTransferMarket(world, buyerTeamId) {
  ensureWorldFinances(world)
  const rows = []
  for (const team of worldTeamsList(world)) {
    if (team.id === buyerTeamId) continue
    refreshTeamMarketValues(team)
    const policy = getTransferPolicy(team)
    // Jeden sort na klub — inaczej każdy zawodnik sortowałby cały skład dwa razy
    // (raz na ranking, raz w środku `computeAskPrice`).
    const rankMap = buildOvrRankMap(team.players)
    const rosterSize = (team.players ?? []).length
    for (const player of team.players ?? []) {
      // Wypożyczony zawodnik nie może pojawić się na rynku pod klubem docelowym —
      // wyglądałoby jakby destination był jego właścicielem.
      if (player.loan) continue
      const ovr = getOverallRating(player.skills)
      const value = getPlayerMarketValue(player)
      const rank = rankMap.get(String(player.id)) ?? rosterSize
      const ask = computeAskPrice(player, team, rank)
      ensurePlayerContract(player)
      const weeklyWage = player.contract?.weeklyWage ?? 0
      const contractYears = player.contract?.years ?? null
      const contractRemaining = getContractRemainingCost(player.contract)
      rows.push({
        player,
        playerId: player.id,
        name: getPlayerFullName(player),
        position: player.position ?? '—',
        ovr,
        age: player.age ?? null,
        marketValue: value,
        askPrice: ask,
        rank,
        teamId: team.id,
        teamName: team.name,
        teamShort: team.shortName ?? team.name,
        transferPolicy: policy,
        sellerBudget: getTransferBudget(team),
        weeklyWage,
        contractYears,
        contractRemaining,
        listed: !!player.transferListed,
      })
    }
  }
  rows.sort((a, b) => (b.listed ? 1 : 0) - (a.listed ? 1 : 0) || b.ovr - a.ovr || b.marketValue - a.marketValue)
  return rows
}

/**
 * Lista zawodników dostępnych na rynku (wszyscy poza drużyną gracza) + wolni agenci.
 */
export function listTransferMarketWithFreeAgents(world, buyerTeamId) {
  const clubRows = listTransferMarket(world, buyerTeamId)
  // Lazy import cycle avoidance — inline FA rows
  if (!world) return clubRows
  if (!Array.isArray(world.freeAgents)) world.freeAgents = []
  const faRows = []
  for (const player of world.freeAgents) {
    if (player?.status === 'retired') continue
    refreshPlayerMarketValue(player)
    const ovr = getOverallRating(player.skills)
    faRows.push({
      player,
      playerId: player.id,
      name: getPlayerFullName(player),
      position: player.position ?? '—',
      ovr,
      age: player.age ?? null,
      marketValue: getPlayerMarketValue(player),
      askPrice: 0,
      rank: 0,
      teamId: null,
      teamName: 'Free Agent',
      teamShort: 'FA',
      transferPolicy: null,
      sellerBudget: 0,
      weeklyWage: null,
      contractYears: null,
      contractRemaining: 0,
      freeAgent: true,
      listed: false,
    })
  }
  return [...faRows, ...clubRows].sort(
    (a, b) =>
      (b.listed ? 1 : 0) - (a.listed ? 1 : 0) ||
      b.ovr - a.ovr ||
      (b.marketValue ?? 0) - (a.marketValue ?? 0),
  )
}

/**
 * Buduje jeden wiersz rynkowy (kształt jak `listTransferMarketWithFreeAgents`) dla
 * konkretnego zawodnika — używane, gdy negocjacje startują z profilu zawodnika
 * (widok drużyny, shortlista) zamiast z tabeli rynku.
 * @returns {object|null} `null` gdy zawodnik jest w drużynie kupującego albo nie istnieje
 */
export function buildTransferRowForPlayer(world, buyerTeamId, playerId) {
  ensureWorldFinances(world)
  const found = findPlayerInWorld(world, playerId)
  if (found) {
    if (found.team.id === buyerTeamId) return null
    if (found.player.loan) return null
    refreshTeamMarketValues(found.team)
    const { team, player } = found
    const policy = getTransferPolicy(team)
    ensurePlayerContract(player)
    const rank = playerOvrRank(team.players, player.id)
    return {
      player,
      playerId: player.id,
      name: getPlayerFullName(player),
      position: player.position ?? '—',
      ovr: getOverallRating(player.skills),
      age: player.age ?? null,
      marketValue: getPlayerMarketValue(player),
      askPrice: computeAskPrice(player, team, rank),
      rank,
      teamId: team.id,
      teamName: team.name,
      teamShort: team.shortName ?? team.name,
      transferPolicy: policy,
      sellerBudget: getTransferBudget(team),
      weeklyWage: player.contract?.weeklyWage ?? 0,
      contractYears: player.contract?.years ?? null,
      contractRemaining: getContractRemainingCost(player.contract),
      listed: !!player.transferListed,
    }
  }
  const freeAgent = (world?.freeAgents ?? []).find((p) => String(p.id) === String(playerId))
  if (!freeAgent) return null
  refreshPlayerMarketValue(freeAgent)
  return {
    player: freeAgent,
    playerId: freeAgent.id,
    name: getPlayerFullName(freeAgent),
    position: freeAgent.position ?? '—',
    ovr: getOverallRating(freeAgent.skills),
    age: freeAgent.age ?? null,
    marketValue: getPlayerMarketValue(freeAgent),
    askPrice: 0,
    rank: 0,
    teamId: null,
    teamName: 'Free Agent',
    teamShort: 'FA',
    transferPolicy: null,
    sellerBudget: 0,
    weeklyWage: null,
    contractYears: null,
    contractRemaining: 0,
    freeAgent: true,
    listed: false,
  }
}

/**
 * Finalizuje transfer między dowolnymi klubami (gracz lub AI).
 *
 * @param {object} career
 * @param {{
 *   playerId: string|number,
 *   fee: number,
 *   buyerTeamId: string,
 *   sellerTeamId?: string,
 *   contract?: {
 *     weeklyWage: number,
 *     years: number,
 *     bonuses?: object[],
 *     promises?: object[],
 *     signedDate?: string|null,
 *   },
 *   skipPlayerContractCheck?: boolean,
 * }} opts
 */
export function completeTransferBetweenClubs(career, opts) {
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  const buyerId = opts.buyerTeamId
  const buyer = worldTeamById(world, buyerId)
  const found = findPlayerInWorld(world, opts.playerId)
  if (!buyer || !found) return { ok: false, error: 'Nie znaleziono drużyny/zawodnika' }
  if (found.team.id === buyerId) {
    return { ok: false, error: 'Zawodnik już jest w klubie kupującego' }
  }
  if (opts.sellerTeamId && found.team.id !== opts.sellerTeamId) {
    return { ok: false, error: 'Zawodnik nie należy już do wskazanego sprzedającego' }
  }

  const fee = Math.max(0, Math.round(Number(opts.fee) || 0))
  ensureWorldFinances(world)
  ensurePlayerContract(found.player)

  // Warunki nowego kontraktu — wymagane przy transferze (AI podaje auto-terms).
  let contractTerms = opts.contract ?? null
  if (!contractTerms) {
    const auto = aiAutoPlayerContractTerms({
      player: found.player,
      sellerTeam: found.team,
      buyerTeam: buyer,
      league: career.league ?? null,
    })
    if (!auto.ok || !auto.terms) {
      return { ok: false, error: 'Zawodnik nie zgodził się na warunki kontraktu' }
    }
    contractTerms = auto.terms
  }

  const preview = previewContractOffer(contractTerms.weeklyWage, contractTerms.years)
  const contractCost = preview.totalCost
  const budget = getTransferBudget(buyer)
  if (!canBuyPlayers(buyer) || fee + contractCost > budget) {
    return {
      ok: false,
      error: !canBuyPlayers(buyer)
        ? 'Ujemny lub zerowy budżet — nie można kupować zawodników'
        : `Niewystarczający budżet (transfer ${formatUsd(fee)} + kontrakt ${formatUsd(contractCost)}; dostępne ${formatUsd(budget)})`,
    }
  }

  applyReputationAfterTransfer(buyer, found.team, found.player, fee)

  const previousContract = found.player.contract
    ? { ...found.player.contract, bonuses: [...(found.player.contract.bonuses ?? [])], promises: [...(found.player.contract.promises ?? [])] }
    : null
  const sellerRefund = clearPlayerContractOnExit(found.team, found.player)

  const [moved] = found.team.players.splice(found.index, 1)
  if (!moved) {
    // Przywróć kontrakt sprzedającego.
    if (previousContract) {
      found.player.contract = previousContract
      // cofnij zwrot
      if (sellerRefund > 0) {
        adjustTransferBudget(found.team, -sellerRefund)
        if (!found.team.finances) found.team.finances = { transferBudget: 0, salaryBudget: 0 }
        found.team.finances.salaryBudget =
          Math.max(0, Math.round(found.team.finances.salaryBudget ?? 0)) + sellerRefund
      }
    }
    return { ok: false, error: 'Nie udało się przenieść zawodnika' }
  }

  refreshPlayerMarketValue(moved)
  buyer.players = buyer.players ?? []
  buyer.players.push(moved)
  reseedLoyaltyForNewClub(moved)

  adjustTransferBudget(buyer, -fee)
  adjustTransferBudget(found.team, +fee)

  const signed = signPlayerContract(buyer, moved, {
    ...contractTerms,
    signedDate: career.league?.currentDate ?? null,
  })
  if (!signed.ok) {
    // Rollback: zawodnik wraca, budżety i stary kontrakt.
    buyer.players.pop()
    found.team.players.splice(found.index, 0, moved)
    adjustTransferBudget(buyer, +fee)
    adjustTransferBudget(found.team, -fee)
    if (previousContract) {
      moved.contract = previousContract
      if (sellerRefund > 0) {
        adjustTransferBudget(found.team, -sellerRefund)
        if (!found.team.finances) found.team.finances = { transferBudget: 0, salaryBudget: 0 }
        found.team.finances.salaryBudget =
          Math.max(0, Math.round(found.team.finances.salaryBudget ?? 0)) + sellerRefund
      }
    }
    return { ok: false, error: signed.error ?? 'Nie udało się podpisać kontraktu' }
  }

  const window = getTransferWindowState(career)
  const involvesPlayer =
    buyerId === career.playerTeamId || found.team.id === career.playerTeamId
  const isAiDeal = !involvesPlayer

  const entry = {
    id: `tr-${Date.now()}-${moved.id}-${Math.floor(Math.random() * 1e6)}`,
    at: new Date().toISOString(),
    date: career.league?.currentDate ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    window: window.kind,
    playerId: moved.id,
    playerName: getPlayerFullName(moved),
    playerOvr: getOverallRating(moved.skills),
    fromTeamId: found.team.id,
    fromTeamName: found.team.name,
    toTeamId: buyerId,
    toTeamName: buyer.name,
    fee,
    marketValue: getPlayerMarketValue(moved),
    weeklyWage: signed.contract.weeklyWage,
    contractYears: signed.contract.years,
    contractCost,
    involvesPlayer,
    isAiDeal,
  }

  const transferLog = [...(career.transferLog ?? []), entry]

  return {
    ok: true,
    entry,
    transferLog,
    world,
    player: moved,
    contract: signed.contract,
  }
}

/**
 * @param {object} career
 * @param {{ playerId: string|number, offerAmount: number, seed?: number }} opts
 */
export function negotiateTransfer(career, opts) {
  const world = career.world
  if (!world) {
    return { ok: false, error: 'Brak świata kariery' }
  }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  const buyerId = career.playerTeamId
  const buyer = worldTeamById(world, buyerId)
  if (!buyer) return { ok: false, error: 'Nie znaleziono Twojej drużyny' }

  const found = findPlayerInWorld(world, opts.playerId)
  if (!found) return { ok: false, error: 'Nie znaleziono zawodnika' }
  if (found.team.id === buyerId) {
    return { ok: false, error: 'Ten zawodnik już jest w Twoim klubie' }
  }

  ensureWorldFinances(world)
  refreshPlayerMarketValue(found.player)

  const offerAmount = Math.round(Number(opts.offerAmount) || 0)
  const budget = getTransferBudget(buyer)
  if (offerAmount > budget) {
    return {
      ok: false,
      error: `Brak środków (budżet ${formatUsd(budget)}, oferta ${formatUsd(offerAmount)})`,
    }
  }

  const evaluation = evaluateBuyOffer({
    player: found.player,
    sellerTeam: found.team,
    offerAmount,
    seed: opts.seed,
  })

  return {
    ok: true,
    evaluation,
    playerId: found.player.id,
    sellerTeamId: found.team.id,
    buyerTeamId: buyerId,
  }
}

/**
 * Finalizuje zaakceptowany transfer gracza (po negocjacjach z klubem i zawodnikiem).
 *
 * @param {object} career
 * @param {{ playerId: string|number, fee: number, contract?: object }} opts
 */
export function completeTransfer(career, opts) {
  return completeTransferBetweenClubs(career, {
    playerId: opts.playerId,
    fee: opts.fee,
    buyerTeamId: career.playerTeamId,
    contract: opts.contract,
  })
}

/**
 * Negocjacja z klubem. Przy akceptacji — NIE finalizuje transferu;
 * zwraca fazę negocjacji z zawodnikiem (`needsPlayerNegotiation`).
 */
export function attemptTransfer(career, { playerId, offerAmount, seed = null }) {
  const negotiation = negotiateTransfer(career, { playerId, offerAmount, seed })
  if (!negotiation.ok) return negotiation

  const { evaluation } = negotiation
  if (evaluation.status !== 'accepted') {
    return {
      ok: true,
      completed: false,
      phase: 'club',
      evaluation,
      sellerTeamId: negotiation.sellerTeamId,
      playerId: negotiation.playerId,
    }
  }

  const world = career.world
  const buyer = worldTeamById(world, career.playerTeamId)
  const found = findPlayerInWorld(world, playerId)
  if (!found || !buyer) {
    return { ok: false, error: 'Nie znaleziono drużyny/zawodnika', evaluation }
  }

  const demands = computePlayerContractDemands({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
  })

  return {
    ok: true,
    completed: false,
    phase: 'player',
    needsPlayerNegotiation: true,
    evaluation,
    playerDemands: demands,
    agreedFee: evaluation.offerAmount,
    sellerTeamId: negotiation.sellerTeamId,
    playerId: negotiation.playerId,
    buyerTeamId: negotiation.buyerTeamId,
  }
}

/**
 * Negocjacja kontraktu z zawodnikiem po zgodzie klubu.
 */
export function negotiatePlayerContract(career, opts) {
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  const buyer = worldTeamById(world, career.playerTeamId)
  const found = findPlayerInWorld(world, opts.playerId)
  if (!buyer || !found) return { ok: false, error: 'Nie znaleziono drużyny/zawodnika' }
  if (found.team.id === career.playerTeamId) {
    return { ok: false, error: 'Ten zawodnik już jest w Twoim klubie' }
  }

  const fee = Math.max(0, Math.round(Number(opts.fee) || 0))
  const preview = previewContractOffer(opts.weeklyWage, opts.years)
  const budget = getTransferBudget(buyer)
  if (!canBuyPlayers(buyer) || fee + preview.totalCost > budget) {
    return {
      ok: false,
      error: !canBuyPlayers(buyer)
        ? 'Ujemny lub zerowy budżet — nie można kupować zawodników'
        : `Brak środków (transfer ${formatUsd(fee)} + kontrakt ${formatUsd(preview.totalCost)}; budżet ${formatUsd(budget)})`,
    }
  }

  const evaluation = evaluatePlayerContractOffer({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
    weeklyWage: opts.weeklyWage,
    years: opts.years,
    bonuses: opts.bonuses ?? [],
    promises: opts.promises ?? [],
    seed: opts.seed ?? null,
  })

  if (evaluation.status !== 'accepted') {
    return {
      ok: true,
      completed: false,
      phase: 'player',
      playerEvaluation: evaluation,
      playerDemands: evaluation.demands,
      agreedFee: fee,
      playerId: found.player.id,
      sellerTeamId: found.team.id,
    }
  }

  const done = completeTransfer(career, {
    playerId: opts.playerId,
    fee,
    contract: evaluation.contractTerms,
  })
  if (!done.ok) {
    return { ok: false, error: done.error, playerEvaluation: evaluation }
  }

  return {
    ok: true,
    completed: true,
    phase: 'done',
    playerEvaluation: evaluation,
    entry: done.entry,
    transferLog: done.transferLog,
    world: done.world,
    contract: done.contract,
  }
}

/** Akceptacja kontrpropozycji sprzedającego → dalej negocjacje z zawodnikiem. */
export function acceptCounterOffer(career, { playerId, counterAmount }) {
  const fee = Math.round(Number(counterAmount) || 0)
  const buyer = worldTeamById(career.world, career.playerTeamId)
  if (!buyer) return { ok: false, error: 'Brak drużyny' }
  if (fee > getTransferBudget(buyer)) {
    return { ok: false, error: 'Niewystarczający budżet na kontrpropozycję' }
  }

  const found = findPlayerInWorld(career.world, playerId)
  if (!found) return { ok: false, error: 'Zawodnik niedostępny' }

  const policy = getTransferPolicy(found.team)
  const rank = playerOvrRank(found.team.players, found.player.id)
  const coldFeet =
    rank === 0 &&
    (policy.negotiationDifficulty ?? 1) >= 1.5 &&
    Math.random() < 0.12

  if (coldFeet) {
    return {
      ok: true,
      completed: false,
      phase: 'club',
      evaluation: {
        status: 'rejected',
        askPrice: computeAskPrice(found.player, found.team, rank),
        offerAmount: fee,
        chance: 0,
        message: `${found.team.name} wycofuje się z negocjacji w ostatniej chwili. Spróbuj ponownie z wyższą ofertą.`,
        rank,
      },
    }
  }

  const demands = computePlayerContractDemands({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
  })

  return {
    ok: true,
    completed: false,
    phase: 'player',
    needsPlayerNegotiation: true,
    evaluation: {
      status: 'accepted',
      askPrice: computeAskPrice(found.player, found.team, rank),
      offerAmount: fee,
      chance: 1,
      message: `${found.team.name} finalizuje zgodę na transfer za ${formatUsd(fee)}. Teraz negocjacje z zawodnikiem.`,
      rank,
    },
    playerDemands: demands,
    agreedFee: fee,
    playerId: found.player.id,
    sellerTeamId: found.team.id,
    buyerTeamId: career.playerTeamId,
  }
}

const MIN_ROSTER_TO_SELL = 14

/**
 * Akceptacja przychodzącej oferty AI (sprzedaż zawodnika gracza).
 *
 * @param {object} career
 * @param {{ playerId: string|number, buyerTeamId: string, fee: number }} opts
 */
export function acceptIncomingBid(career, opts) {
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  const seller = worldTeamById(world, career.playerTeamId)
  if (!seller) return { ok: false, error: 'Nie znaleziono Twojej drużyny' }
  if ((seller.players?.length ?? 0) <= MIN_ROSTER_TO_SELL) {
    return {
      ok: false,
      error: `Nie możesz sprzedać — skład musi mieć więcej niż ${MIN_ROSTER_TO_SELL} zawodników`,
    }
  }

  const found = findPlayerInWorld(world, opts.playerId)
  if (!found || found.team.id !== career.playerTeamId) {
    return { ok: false, error: 'Zawodnik nie jest już w Twoim składzie' }
  }

  const buyer = worldTeamById(world, opts.buyerTeamId)
  if (!buyer) return { ok: false, error: 'Nie znaleziono klubu kupującego' }

  const fee = Math.max(0, Math.round(Number(opts.fee) || 0))
  if (fee <= 0) return { ok: false, error: 'Nieprawidłowa kwota oferty' }
  if (fee > getTransferBudget(buyer)) {
    return { ok: false, error: 'Kupujący nie ma już wystarczającego budżetu' }
  }

  const done = completeTransferBetweenClubs(career, {
    playerId: opts.playerId,
    fee,
    buyerTeamId: opts.buyerTeamId,
    sellerTeamId: career.playerTeamId,
  })
  if (!done.ok) return done

  return {
    ok: true,
    completed: true,
    entry: done.entry,
    transferLog: done.transferLog,
    world: done.world,
    message: `${buyer.name} finalizuje zakup ${done.entry.playerName} za ${formatUsd(fee)}.`,
    messageEn: `${buyer.name} completes the purchase of ${done.entry.playerName} for ${formatUsd(fee)}.`,
  }
}

/**
 * Odpowiedź na ofertę przychodzącą: accept | reject | counter.
 *
 * @param {object} career
 * @param {{
 *   action: 'accept'|'reject'|'counter',
 *   playerId: string|number,
 *   buyerTeamId: string,
 *   fee: number,
 *   counterAmount?: number,
 *   askPrice?: number,
 *   seed?: number,
 * }} opts
 */
export function respondToIncomingBid(career, opts) {
  const action = opts.action
  const world = career.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }

  const seller = worldTeamById(world, career.playerTeamId)
  const buyer = worldTeamById(world, opts.buyerTeamId)
  const found = findPlayerInWorld(world, opts.playerId)

  if (!seller || !buyer) return { ok: false, error: 'Nie znaleziono drużyny' }
  if (!found || found.team.id !== career.playerTeamId) {
    return { ok: false, error: 'Zawodnik nie jest już w Twoim składzie' }
  }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  if (action === 'reject') {
    const ask = opts.askPrice ?? computeAskPrice(found.player, seller)
    const fee = Math.max(0, Math.round(Number(opts.fee) || 0))
    ensurePlayerMorale(found.player)
    const morale = getPlayerMorale(found.player)
    let moraleDelta = 0
    // Dobra oferta + słabe morale → zawodnik frustruje się odrzuceniem odejścia.
    if (morale < 55 && fee >= ask * 0.88) {
      const nextMorale = Math.max(25, Math.round(morale - (morale < 45 ? 5 : 3)))
      moraleDelta = nextMorale - morale
      found.player.morale = nextMorale
      noteLoyaltyFromTreatment(found.player, moraleDelta)
    }
    return {
      ok: true,
      completed: false,
      rejected: true,
      world,
      moraleDelta,
      message:
        moraleDelta < 0
          ? `Odrzuciłeś ofertę ${buyer.name}. ${getPlayerFullName(found.player)} jest zawiedziony (morale ${moraleDelta}).`
          : `Odrzuciłeś ofertę ${buyer.name} za ${getPlayerFullName(found.player)}.`,
      messageEn:
        moraleDelta < 0
          ? `You rejected ${buyer.name}'s offer. ${getPlayerFullName(found.player)} is disappointed (morale ${moraleDelta}).`
          : `You rejected ${buyer.name}'s offer for ${getPlayerFullName(found.player)}.`,
    }
  }

  if (action === 'accept') {
    return acceptIncomingBid(career, {
      playerId: opts.playerId,
      buyerTeamId: opts.buyerTeamId,
      fee: opts.fee,
    })
  }

  if (action === 'counter') {
    const counterAmount = Math.max(0, Math.round(Number(opts.counterAmount) || 0))
    if (counterAmount <= 0) {
      return { ok: false, error: 'Podaj kwotę kontrpropozycji' }
    }

    const evaluation = evaluateSellerCounter({
      player: found.player,
      buyerTeam: buyer,
      sellerTeam: seller,
      originalOffer: opts.fee,
      counterAmount,
      seed: opts.seed ?? null,
      budget: getTransferBudget(buyer),
    })

    if (evaluation.status === 'accepted') {
      const done = acceptIncomingBid(career, {
        playerId: opts.playerId,
        buyerTeamId: opts.buyerTeamId,
        fee: evaluation.fee ?? counterAmount,
      })
      if (!done.ok) return done
      return {
        ...done,
        evaluation,
        message: evaluation.message,
        messageEn: evaluation.messageEn ?? evaluation.message,
      }
    }

    if (evaluation.status === 'counter') {
      return {
        ok: true,
        completed: false,
        renegotiated: true,
        evaluation,
        world,
        newFee: evaluation.counterAmount,
        message: evaluation.message,
        messageEn: evaluation.messageEn ?? evaluation.message,
      }
    }

    return {
      ok: true,
      completed: false,
      rejected: true,
      evaluation,
      world,
      message: evaluation.message,
      messageEn: evaluation.messageEn ?? evaluation.message,
    }
  }

  return { ok: false, error: 'Nieznana akcja negocjacji' }
}
