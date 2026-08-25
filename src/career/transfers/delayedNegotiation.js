/**
 * Opóźnione odpowiedzi na oferty transferowe / kontraktowe (1–3 dni → skrzynka).
 */

import { getPlayerFullName } from '../../data/mockPlayers.js'
import { getOverallRating } from '../../models/playerStats.js'
import { addDays, formatISODate, parseISODate } from '../../league/seasonCalendar.js'
import { worldTeamById } from '../worldState.js'
import {
  createInboxMessage,
  ensureInbox,
  updateInboxMessage,
  INBOX_TYPES,
} from '../inbox.js'
import { formatUsd } from './playerValue.js'
import { computeAskPrice, evaluateBuyOffer, evaluateSellerCounter } from './negotiation.js'
import {
  getTransferBudget,
  ensureWorldFinances,
  canBuyPlayers,
} from './clubFinances.js'
import { isTransferWindowOpen } from './transferWindow.js'
import {
  completeTransfer,
  acceptIncomingBid,
} from './transferEngine.js'
import { signFreeAgent } from './freeAgency.js'
import {
  computePlayerContractDemands,
  evaluatePlayerContractOffer,
  previewContractOffer,
} from './playerNegotiation.js'
import { resolveOutgoingLoanOffer, resolveIncomingLoanRequestReply } from './loans.js'

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Losuje datę odpowiedzi: +1, +2 lub +3 dni od `fromDate`. */
export function rollNegotiationReplyDate(fromDate, seedKey = '') {
  const rng = mulberry32(hashSeed(`${fromDate}|reply|${seedKey}`))
  const days = 1 + Math.floor(rng() * 3)
  return formatISODate(addDays(parseISODate(fromDate), days))
}

function findPlayer(world, playerId) {
  for (const id of world?.teamIds ?? Object.keys(world?.teamsById ?? {})) {
    const team = world.teamsById[id]
    const idx = (team?.players ?? []).findIndex((p) => String(p.id) === String(playerId))
    if (idx >= 0) return { team, player: team.players[idx], index: idx }
  }
  return null
}

function hasAwaitingOfferForPlayer(inbox, playerId, kinds) {
  for (const m of inbox ?? []) {
    const p = m?.payload
    if (m?.type !== INBOX_TYPES.TRANSFER_OFFER) continue
    if (!kinds.includes(p?.kind)) continue
    if (String(p.playerId) !== String(playerId)) continue
    if (
      p.status === 'awaiting_reply' ||
      p.status === 'club_agreed' ||
      p.status === 'pre_agreed' ||
      p.status === 'counter'
    ) {
      return true
    }
  }
  return false
}

/**
 * Wysyłka oferty kupna do klubu — odpowiedź w skrzynce za 1–3 dni.
 */
export function queueOutgoingClubOffer(career, { playerId, offerAmount }) {
  if (!career?.world) return { ok: false, error: 'Brak świata kariery' }

  const today = career.league?.currentDate
  if (!today) return { ok: false, error: 'Brak daty w lidze' }

  const buyer = worldTeamById(career.world, career.playerTeamId)
  if (!buyer) return { ok: false, error: 'Nie znaleziono Twojej drużyny' }

  const found = findPlayer(career.world, playerId)
  if (!found) return { ok: false, error: 'Nie znaleziono zawodnika' }
  if (found.team.id === career.playerTeamId) {
    return { ok: false, error: 'Ten zawodnik już jest w Twoim klubie' }
  }

  const offer = Math.max(0, Math.round(Number(offerAmount) || 0))
  if (offer <= 0) return { ok: false, error: 'Podaj kwotę oferty' }

  ensureWorldFinances(career.world)
  if (!canBuyPlayers(buyer)) {
    return {
      ok: false,
      error: 'Ujemny lub zerowy budżet — nie można kupować zawodników',
    }
  }
  const budget = getTransferBudget(buyer)
  if (offer > budget) {
    return {
      ok: false,
      error: `Brak środków (budżet ${formatUsd(budget)}, oferta ${formatUsd(offer)})`,
    }
  }

  const inbox = ensureInbox(career)
  if (hasAwaitingOfferForPlayer(inbox, playerId, ['outgoing_club_offer', 'outgoing_player_contract'])) {
    return { ok: false, error: 'Masz już otwarte negocjacje dotyczące tego zawodnika' }
  }

  const ask = computeAskPrice(found.player, found.team)
  const name = getPlayerFullName(found.player)
  const ovr = getOverallRating(found.player.skills)
  const replyDate = rollNegotiationReplyDate(
    today,
    `${career.id}|club|${playerId}|${offer}|${inbox.length}`,
  )
  const windowOpen = isTransferWindowOpen(career)
  const outsideNote = windowOpen
    ? ''
    : ' Okno transferowe jest zamknięte — po dogadaniu warunków transfer zostanie zarejestrowany dopiero po otwarciu okna (potwierdzenie w skrzynce).'
  const outsideNoteEn = windowOpen
    ? ''
    : ' The transfer window is closed — once terms are agreed the deal will only register when the window opens (inbox confirmation).'

  const message = createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Oferta wysłana · ${name}`,
    titleEn: `Offer sent · ${name}`,
    body: `Wysłałeś ofertę ${formatUsd(offer)} do ${found.team.name} za ${name} (OVR ${ovr}, ask ${formatUsd(ask)}). Oczekujesz odpowiedzi klubu — zwykle 1–3 dni (do ${replyDate}).${outsideNote}`,
    bodyEn: `You sent ${formatUsd(offer)} to ${found.team.name} for ${name} (OVR ${ovr}, ask ${formatUsd(ask)}). Awaiting the club reply — usually 1–3 days (by ${replyDate}).${outsideNoteEn}`,
    date: today,
    seasonIndex: career.seasonIndex,
    seasonYear: career.seasonYear,
    payload: {
      kind: 'outgoing_club_offer',
      status: 'awaiting_reply',
      replyDate,
      negotiatedOutsideWindow: !windowOpen,
      playerId: found.player.id,
      playerName: name,
      playerOvr: ovr,
      sellerTeamId: found.team.id,
      sellerTeamName: found.team.name,
      offerAmount: offer,
      askPrice: ask,
    },
  })

  return {
    ok: true,
    queued: true,
    message,
    replyDate,
    flash:
      `Oferta wysłana — ${found.team.name} odpowie w skrzynce (do ${replyDate}).`,
  }
}

/**
 * Jedno wejście na "rozpocznij negocjacje" — wolny agent podpisuje od razu
 * (`signFreeAgent`), zawodnik klubowy dostaje ofertę do skrzynki
 * (`queueOutgoingClubOffer`). Wzorowane 1:1 na `TransfersView`'s `handleOffer`,
 * żeby dowolny widok mógł otworzyć negocjacje z profilu zawodnika bez
 * duplikowania rozgałęzienia FA/klub.
 * @param {object} career
 * @param {{ row: object, offerAmount?: number, contractTerms?: object|null }} params
 *   `row` — kształt z `listTransferMarket`/`buildTransferRowForPlayer` (musi mieć
 *   `player`, `playerId`, `freeAgent`).
 */
export function submitTransferOffer(career, { row, offerAmount = 0, contractTerms = null }) {
  if (!row) return { ok: false, error: null }

  if (row.freeAgent) {
    const buyer = worldTeamById(career.world, career.playerTeamId)
    if (!canBuyPlayers(buyer)) {
      return { ok: false, code: 'negative_budget' }
    }
    const demands = computePlayerContractDemands({
      player: row.player,
      sellerTeam: null,
      buyerTeam: buyer,
      league: career.league,
    })
    const terms = contractTerms ?? {
      weeklyWage: demands.minWeeklyWage,
      years: demands.preferredYears,
      bonuses: [],
      promises: [],
    }
    const result = signFreeAgent(career, { playerId: row.playerId, contract: terms })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, kind: 'fa_signed', world: result.world, transferLog: result.transferLog }
  }

  const result = queueOutgoingClubOffer(career, { playerId: row.playerId, offerAmount })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, kind: 'offer_sent', message: result.message, flash: result.flash }
}

/**
 * Po zgodzie klubu — oferta kontraktu dla zawodnika (odpowiedź za 1–3 dni).
 */
export function queueOutgoingPlayerContract(career, opts) {
  if (!career?.world) return { ok: false, error: 'Brak świata kariery' }

  const today = career.league?.currentDate
  if (!today) return { ok: false, error: 'Brak daty w lidze' }

  const buyer = worldTeamById(career.world, career.playerTeamId)
  const found = findPlayer(career.world, opts.playerId)
  if (!buyer || !found) return { ok: false, error: 'Nie znaleziono drużyny/zawodnika' }
  if (found.team.id === career.playerTeamId) {
    return { ok: false, error: 'Ten zawodnik już jest w Twoim klubie' }
  }

  const fee = Math.max(0, Math.round(Number(opts.fee) || 0))
  const preview = previewContractOffer(opts.weeklyWage, opts.years)
  const budget = getTransferBudget(buyer)
  if (fee + preview.totalCost > budget) {
    return {
      ok: false,
      error: `Brak środków (transfer ${formatUsd(fee)} + kontrakt ${formatUsd(preview.totalCost)}; budżet ${formatUsd(budget)})`,
    }
  }

  const name = getPlayerFullName(found.player)
  const replyDate = rollNegotiationReplyDate(
    today,
    `${career.id}|player|${opts.playerId}|${preview.weeklyWage}|${preview.years}|${(career.inbox ?? []).length}`,
  )

  const demands = computePlayerContractDemands({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
  })

  const message = createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Oferta kontraktu · ${name}`,
    titleEn: `Contract offer · ${name}`,
    body: `Wysłałeś warunki: ${formatUsd(preview.weeklyWage)}/tydz. × ${preview.years} lat (łącznie ${formatUsd(preview.totalCost)}) przy kwocie transferu ${formatUsd(fee)}. ${name} odpowie w ciągu 1–3 dni (do ${replyDate}).`,
    bodyEn: `You offered ${formatUsd(preview.weeklyWage)}/wk × ${preview.years} yrs (total ${formatUsd(preview.totalCost)}) with transfer fee ${formatUsd(fee)}. ${name} will reply in 1–3 days (by ${replyDate}).`,
    date: today,
    seasonIndex: career.seasonIndex,
    seasonYear: career.seasonYear,
    payload: {
      kind: 'outgoing_player_contract',
      status: 'awaiting_reply',
      replyDate,
      playerId: found.player.id,
      playerName: name,
      sellerTeamId: found.team.id,
      sellerTeamName: found.team.name,
      fee,
      weeklyWage: preview.weeklyWage,
      years: preview.years,
      totalCost: preview.totalCost,
      bonuses: opts.bonuses ?? [],
      promises: opts.promises ?? [],
      parentMessageId: opts.parentMessageId ?? null,
      playerDemands: demands,
    },
  })

  // Oznacz wiadomość klubu jako „kontrakt w drodze”, jeśli podano parent.
  let inbox = ensureInbox(career)
  if (opts.parentMessageId) {
    inbox = updateInboxMessage(inbox, opts.parentMessageId, {
      payload: { contractQueued: true },
    })
  }

  return {
    ok: true,
    queued: true,
    message,
    inboxBase: inbox,
    replyDate,
    flash: `Oferta kontraktu wysłana — odpowiedź w skrzynce do ${replyDate}.`,
  }
}

/**
 * Kontroferta gracza na ofertę przychodzącą — AI odpowiada za 1–3 dni.
 */
export function queueIncomingBidCounter(career, { messageId, counterAmount }) {
  if (!career?.world) return { ok: false, error: 'Brak świata kariery' }

  const today = career.league?.currentDate
  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'incoming_bid') {
    return { ok: false, error: 'Nie znaleziono oferty' }
  }
  if (p.status !== 'pending' && p.status !== 'counter') {
    return { ok: false, error: 'Oferta nieaktywna' }
  }

  const counter = Math.max(0, Math.round(Number(counterAmount) || 0))
  if (counter <= 0) return { ok: false, error: 'Podaj kwotę kontrpropozycji' }

  const replyDate = rollNegotiationReplyDate(
    today,
    `${career.id}|in-counter|${messageId}|${counter}`,
  )

  const inbox = updateInboxMessage(career.inbox, messageId, {
    read: true,
    body: `${message.body}\n\nWysłałeś kontrofertę ${formatUsd(counter)}. Oczekujesz odpowiedzi ${p.fromTeamName} (do ${replyDate}).`,
    bodyEn: `${message.bodyEn ?? message.body}\n\nYou sent a counter of ${formatUsd(counter)}. Awaiting ${p.fromTeamName}'s reply (by ${replyDate}).`,
    payload: {
      status: 'awaiting_reply',
      pendingCounterAmount: counter,
      replyDate,
      lastNegotiationMessage: `Kontroferta ${formatUsd(counter)} wysłana — czekasz na odpowiedź.`,
      lastNegotiationMessageEn: `Counter ${formatUsd(counter)} sent — awaiting reply.`,
    },
  })

  return {
    ok: true,
    queued: true,
    inbox,
    replyDate,
    message: `Kontroferta wysłana — ${p.fromTeamName} odpowie do ${replyDate}.`,
    messageEn: `Counter sent — ${p.fromTeamName} will reply by ${replyDate}.`,
  }
}

/**
 * Akceptacja kontrpropozycji klubu (natychmiast) → przejście do fazy kontraktu z zawodnikiem.
 */
export function acceptOutgoingClubCounter(career, { messageId }) {
  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'outgoing_club_offer' || p.status !== 'counter') {
    return { ok: false, error: 'Brak aktywnej kontrpropozycji' }
  }

  const fee = Math.round(Number(p.counterAmount) || 0)
  const buyer = worldTeamById(career.world, career.playerTeamId)
  if (!buyer) return { ok: false, error: 'Brak drużyny' }
  if (fee > getTransferBudget(buyer)) {
    return { ok: false, error: 'Niewystarczający budżet na kontrpropozycję' }
  }

  const found = findPlayer(career.world, p.playerId)
  if (!found || found.team.id !== p.sellerTeamId) {
    return { ok: false, error: 'Zawodnik niedostępny' }
  }

  const demands = computePlayerContractDemands({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
  })

  const inbox = updateInboxMessage(career.inbox, messageId, {
    read: false,
    title: `Zgoda klubu · ${p.playerName}`,
    titleEn: `Club agreed · ${p.playerName}`,
    body: `${p.sellerTeamName} finalizuje zgodę na transfer za ${formatUsd(fee)}. Uzgodnij teraz kontrakt z zawodnikiem.`,
    bodyEn: `${p.sellerTeamName} agrees to the transfer for ${formatUsd(fee)}. Negotiate the player contract now.`,
    payload: {
      status: 'club_agreed',
      agreedFee: fee,
      offerAmount: fee,
      playerDemands: demands,
      counterAmount: null,
    },
  })

  return { ok: true, inbox, agreedFee: fee, playerDemands: demands }
}

/**
 * Przetwarza zaległe odpowiedzi (replyDate <= date).
 * @returns {{ inbox, world, transferLog, resolved: number }}
 */
export function processDelayedTransferReplies(career, { date = null } = {}) {
  const today = date ?? career?.league?.currentDate
  if (!today || !career?.world) {
    return {
      inbox: career?.inbox ?? [],
      world: career?.world,
      transferLog: career?.transferLog ?? [],
      loanLog: career?.loanLog ?? [],
      resolved: 0,
    }
  }

  let inbox = [...ensureInbox(career)]
  let world = career.world
  let transferLog = career.transferLog ?? []
  let loanLog = career.loanLog ?? []
  let resolved = 0
  const liveCareer = () => ({ ...career, world, transferLog, loanLog, inbox, league: career.league })

  for (let i = 0; i < inbox.length; i += 1) {
    const m = inbox[i]
    const p = m?.payload
    if (m?.type !== INBOX_TYPES.TRANSFER_OFFER) continue
    if (p?.status !== 'awaiting_reply') continue
    if (!p.replyDate || p.replyDate > today) continue

    if (p.kind === 'outgoing_club_offer') {
      const result = resolveOutgoingClubOffer(liveCareer(), m)
      inbox[i] = result.message
      resolved += 1
      continue
    }

    if (p.kind === 'outgoing_player_contract') {
      const result = resolveOutgoingPlayerContract(liveCareer(), m)
      inbox[i] = result.message
      if (result.world) world = result.world
      if (result.transferLog) transferLog = result.transferLog
      if (result.parentPatch && result.parentId) {
        inbox = updateInboxMessage(inbox, result.parentId, result.parentPatch)
      }
      resolved += 1
      continue
    }

    if (p.kind === 'incoming_bid') {
      const result = resolveIncomingBidCounter(liveCareer(), m)
      inbox[i] = result.message
      if (result.world) world = result.world
      if (result.transferLog) transferLog = result.transferLog
      resolved += 1
      continue
    }

    if (p.kind === 'loan_out_offer') {
      const result = resolveOutgoingLoanOffer(liveCareer(), m)
      inbox[i] = result.message
      if (result.world) world = result.world
      if (result.loanLogEntry) loanLog = [...loanLog, result.loanLogEntry]
      resolved += 1
      continue
    }

    if (p.kind === 'loan_in_request') {
      const result = resolveIncomingLoanRequestReply(liveCareer(), m)
      inbox[i] = result.message
      if (result.world) world = result.world
      if (result.loanLogEntry) loanLog = [...loanLog, result.loanLogEntry]
      resolved += 1
    }
  }

  return { inbox, world, transferLog, loanLog, resolved }
}

/**
 * Przewijanie wielu dni — odpala odpowiedzi dzień po dniu.
 */
export function processDelayedTransferRepliesForDateRange(career, startDate, endDate) {
  if (!career?.world || !startDate || !endDate || endDate < startDate) {
    return {
      inbox: career?.inbox ?? [],
      world: career?.world,
      transferLog: career?.transferLog ?? [],
      loanLog: career?.loanLog ?? [],
      resolved: 0,
    }
  }

  let cursor = startDate
  let inbox = career.inbox ?? []
  let world = career.world
  let transferLog = career.transferLog ?? []
  let loanLog = career.loanLog ?? []
  let resolved = 0

  while (cursor <= endDate) {
    const result = processDelayedTransferReplies(
      { ...career, world, transferLog, loanLog, inbox },
      { date: cursor },
    )
    inbox = result.inbox
    world = result.world
    transferLog = result.transferLog
    loanLog = result.loanLog
    resolved += result.resolved
    cursor = formatISODate(addDays(parseISODate(cursor), 1))
  }

  return { inbox, world, transferLog, loanLog, resolved }
}

function resolveOutgoingClubOffer(career, message) {
  const p = message.payload
  const found = findPlayer(career.world, p.playerId)

  if (!found || found.team.id !== p.sellerTeamId) {
    return {
      message: {
        ...message,
        read: false,
        title: `Oferta nieważna · ${p.playerName}`,
        titleEn: `Offer void · ${p.playerName}`,
        body: `${message.body}\n\nZawodnik nie jest już dostępny w ${p.sellerTeamName}.`,
        bodyEn: `${message.bodyEn ?? message.body}\n\nThe player is no longer available at ${p.sellerTeamName}.`,
        payload: { ...p, status: 'withdrawn' },
      },
    }
  }

  const evaluation = evaluateBuyOffer({
    player: found.player,
    sellerTeam: found.team,
    offerAmount: p.offerAmount,
    seed: hashSeed(`${message.id}|${p.replyDate}|club-reply`),
  })

  if (evaluation.status === 'accepted') {
    const buyer = worldTeamById(career.world, career.playerTeamId)
    const demands = computePlayerContractDemands({
      player: found.player,
      sellerTeam: found.team,
      buyerTeam: buyer,
      league: career.league ?? null,
    })
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Klub akceptuje · ${p.playerName}`,
        titleEn: `Club accepts · ${p.playerName}`,
        body: `${evaluation.message}\n\nUzgodnij teraz kontrakt z zawodnikiem (tygodniówka + lata + bonusy/obietnice).`,
        bodyEn: `${evaluation.messageEn ?? evaluation.message}\n\nNegotiate the player contract now (wage + years + bonuses/promises).`,
        payload: {
          ...p,
          status: 'club_agreed',
          agreedFee: evaluation.offerAmount,
          evaluation,
          playerDemands: demands,
        },
      },
    }
  }

  if (evaluation.status === 'counter') {
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Kontrpropozycja klubu · ${p.playerName}`,
        titleEn: `Club counter · ${p.playerName}`,
        body: evaluation.message,
        bodyEn: evaluation.messageEn ?? evaluation.message,
        payload: {
          ...p,
          status: 'counter',
          counterAmount: evaluation.counterAmount,
          evaluation,
        },
      },
    }
  }

  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate,
      title: `Klub odrzuca · ${p.playerName}`,
      titleEn: `Club rejects · ${p.playerName}`,
      body: evaluation.message,
      bodyEn: evaluation.messageEn ?? evaluation.message,
      payload: {
        ...p,
        status: 'rejected',
        evaluation,
      },
    },
  }
}

function stagePreAgreedBuyMessage(message, p, contractTerms, evaluation = null) {
  const fee = p.fee
  const wage = contractTerms.weeklyWage
  const years = contractTerms.years
  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate ?? message.date,
      title: `Umowa wstępna · ${p.playerName}`,
      titleEn: `Pre-agreement · ${p.playerName}`,
      body: `${evaluation?.message ?? 'Warunki uzgodnione.'} Transfer ${p.playerName} za ${formatUsd(fee)} · ${formatUsd(wage)}/tydz. × ${years} lat. Okno jest zamknięte — w dniu otwarcia dostaniesz w skrzynce prośbę o potwierdzenie rejestracji (bez automatycznego transferu).`,
      bodyEn: `${evaluation?.messageEn ?? evaluation?.message ?? 'Terms agreed.'} Transfer of ${p.playerName} for ${formatUsd(fee)} · ${formatUsd(wage)}/wk × ${years} yrs. Window is closed — on opening day you will get an inbox prompt to confirm registration (not automatic).`,
      payload: {
        ...p,
        status: 'pre_agreed',
        direction: 'buy',
        contractTerms,
        playerEvaluation: evaluation ?? p.playerEvaluation ?? null,
        registrationNotified: false,
      },
    },
    parentId: p.parentMessageId,
    parentPatch: p.parentMessageId
      ? {
          payload: { status: 'pre_agreed', contractDone: false, registrationPending: true },
          read: true,
        }
      : null,
  }
}

function finalizeOrStageBuy(career, message, p, contractTerms, evaluation = null) {
  if (!isTransferWindowOpen(career)) {
    return stagePreAgreedBuyMessage(message, p, contractTerms, evaluation)
  }

  const done = completeTransfer(career, {
    playerId: p.playerId,
    fee: p.fee,
    contract: contractTerms,
  })
  if (!done.ok) {
    return {
      message: {
        ...message,
        read: false,
        title: `Transfer nieudany · ${p.playerName}`,
        titleEn: `Transfer failed · ${p.playerName}`,
        body: done.error ?? 'Nie udało się sfinalizować transferu.',
        bodyEn: done.errorEn ?? done.error ?? 'Could not complete the transfer.',
        payload: { ...p, status: 'rejected', playerEvaluation: evaluation },
      },
      error: done.error,
    }
  }
  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate ?? message.date,
      title: `Kontrakt podpisany · ${p.playerName}`,
      titleEn: `Contract signed · ${p.playerName}`,
      body: `${evaluation?.message ?? ''} Transfer sfinalizowany za ${formatUsd(p.fee)}.`.trim(),
      bodyEn: `${evaluation?.messageEn ?? evaluation?.message ?? ''} Transfer completed for ${formatUsd(p.fee)}.`.trim(),
      payload: {
        ...p,
        status: 'accepted',
        playerEvaluation: evaluation,
        entryId: done.entry?.id,
        contractTerms,
      },
    },
    world: done.world,
    transferLog: done.transferLog,
    parentId: p.parentMessageId,
    parentPatch: p.parentMessageId
      ? {
          payload: { status: 'accepted', contractDone: true },
          read: true,
        }
      : null,
    completed: true,
    entry: done.entry,
  }
}

function resolveOutgoingPlayerContract(career, message) {
  const p = message.payload
  const found = findPlayer(career.world, p.playerId)
  const buyer = worldTeamById(career.world, career.playerTeamId)

  if (!found || !buyer || found.team.id === career.playerTeamId) {
    return {
      message: {
        ...message,
        read: false,
        title: `Kontrakt nieważny · ${p.playerName}`,
        titleEn: `Contract void · ${p.playerName}`,
        body: `${message.body}\n\nZawodnik nie jest już dostępny do transferu.`,
        bodyEn: `${message.bodyEn ?? message.body}\n\nThe player is no longer available for transfer.`,
        payload: { ...p, status: 'withdrawn' },
      },
    }
  }

  const evaluation = evaluatePlayerContractOffer({
    player: found.player,
    sellerTeam: found.team,
    buyerTeam: buyer,
    league: career.league ?? null,
    weeklyWage: p.weeklyWage,
    years: p.years,
    bonuses: p.bonuses ?? [],
    promises: p.promises ?? [],
    seed: hashSeed(`${message.id}|${p.replyDate}|player-reply`),
  })

  if (evaluation.status === 'accepted') {
    return finalizeOrStageBuy(career, message, p, evaluation.contractTerms, evaluation)
  }

  if (evaluation.status === 'counter') {
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Kontrpropozycja zawodnika · ${p.playerName}`,
        titleEn: `Player counter · ${p.playerName}`,
        body: evaluation.message,
        bodyEn: evaluation.messageEn ?? evaluation.message,
        payload: {
          ...p,
          status: 'counter',
          playerEvaluation: evaluation,
          counterWeeklyWage: evaluation.counterWeeklyWage,
          counterYears: evaluation.counterYears,
        },
      },
    }
  }

  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate,
      title: `Zawodnik odrzuca · ${p.playerName}`,
      titleEn: `Player rejects · ${p.playerName}`,
      body: evaluation.message,
      bodyEn: evaluation.messageEn ?? evaluation.message,
      payload: {
        ...p,
        status: 'rejected',
        playerEvaluation: evaluation,
      },
    },
  }
}

function resolveIncomingBidCounter(career, message) {
  const p = message.payload
  const counter = Math.max(0, Math.round(Number(p.pendingCounterAmount) || 0))
  const seller = worldTeamById(career.world, career.playerTeamId)
  const buyer = worldTeamById(career.world, p.fromTeamId)
  const found = findPlayer(career.world, p.playerId)

  if (!seller || !buyer || !found || found.team.id !== career.playerTeamId) {
    return {
      message: {
        ...message,
        read: false,
        body: `${message.body}\n\nNegocjacje wygasły — zawodnik niedostępny.`,
        bodyEn: `${message.bodyEn ?? message.body}\n\nNegotiations expired — player unavailable.`,
        payload: { ...p, status: 'withdrawn', pendingCounterAmount: null },
      },
    }
  }

  const prevLog = Array.isArray(p.negotiationLog) ? p.negotiationLog : []

  const evaluation = evaluateSellerCounter({
    player: found.player,
    buyerTeam: buyer,
    sellerTeam: seller,
    originalOffer: p.fee,
    counterAmount: counter,
    seed: hashSeed(`${message.id}|${p.replyDate}|in-counter`),
    budget: getTransferBudget(buyer),
    negotiationLog: prevLog,
  })
  const logEntry = {
    at: new Date().toISOString(),
    action: evaluation.escalated ? 'ai_escalation' : 'counter_reply',
    counterAmount: counter,
    message: evaluation.message,
  }

  if (evaluation.status === 'accepted') {
    if (!isTransferWindowOpen(career)) {
      return {
        message: {
          ...message,
          read: false,
          date: p.replyDate,
          title: `Umowa wstępna · ${p.playerName}`,
          titleEn: `Pre-agreement · ${p.playerName}`,
          body: `${evaluation.message}\n\nOkno jest zamknięte — sprzedaż ${p.playerName} za ${formatUsd(evaluation.fee ?? counter)} zostanie zarejestrowana po otwarciu okna (potwierdzenie w skrzynce).`,
          bodyEn: `${evaluation.messageEn ?? evaluation.message}\n\nThe window is closed — sale of ${p.playerName} for ${formatUsd(evaluation.fee ?? counter)} will be registered when it opens (confirm in inbox).`,
          payload: {
            ...p,
            status: 'pre_agreed',
            direction: 'sell',
            fee: evaluation.fee ?? counter,
            lastNegotiationMessage: evaluation.message,
            lastNegotiationMessageEn: evaluation.messageEn ?? evaluation.message,
            negotiationLog: [...prevLog, logEntry],
            pendingCounterAmount: null,
            registrationNotified: false,
          },
        },
      }
    }

    const done = acceptIncomingBid(career, {
      playerId: p.playerId,
      buyerTeamId: p.fromTeamId,
      fee: evaluation.fee ?? counter,
    })
    if (!done.ok) {
      return {
        message: {
          ...message,
          read: false,
          body: `${message.body}\n\n${done.error}`,
          payload: {
            ...p,
            status: 'rejected',
            lastNegotiationMessage: done.error,
            negotiationLog: [...prevLog, logEntry],
            pendingCounterAmount: null,
          },
        },
      }
    }
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Sprzedano · ${p.playerName}`,
        titleEn: `Sold · ${p.playerName}`,
        body: evaluation.message,
        bodyEn: evaluation.messageEn ?? evaluation.message,
        payload: {
          ...p,
          status: 'accepted',
          fee: done.entry?.fee ?? evaluation.fee ?? counter,
          lastNegotiationMessage: evaluation.message,
          lastNegotiationMessageEn: evaluation.messageEn ?? evaluation.message,
          negotiationLog: [...prevLog, logEntry],
          pendingCounterAmount: null,
        },
      },
      world: done.world,
      transferLog: done.transferLog,
    }
  }

  if (evaluation.status === 'counter') {
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        body: `${message.body}\n\n${evaluation.message}`,
        bodyEn: `${message.bodyEn ?? message.body}\n\n${evaluation.messageEn ?? evaluation.message}`,
        payload: {
          ...p,
          status: 'counter',
          fee: evaluation.counterAmount,
          lastNegotiationMessage: evaluation.message,
          lastNegotiationMessageEn: evaluation.messageEn ?? evaluation.message,
          negotiationLog: [...prevLog, logEntry],
          pendingCounterAmount: null,
          replyDate: null,
        },
      },
    }
  }

  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate,
      body: `${message.body}\n\n${evaluation.message}`,
      bodyEn: `${message.bodyEn ?? message.body}\n\n${evaluation.messageEn ?? evaluation.message}`,
      payload: {
        ...p,
        status: 'rejected',
        lastNegotiationMessage: evaluation.message,
        lastNegotiationMessageEn: evaluation.messageEn ?? evaluation.message,
        negotiationLog: [...prevLog, logEntry],
        pendingCounterAmount: null,
        replyDate: null,
      },
    },
  }
}

/**
 * Akceptacja kontrpropozycji zawodnika → finalizacja lub umowa wstępna (poza oknem).
 */
export function acceptPlayerContractCounter(career, { messageId }) {
  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'outgoing_player_contract' || p.status !== 'counter') {
    return { ok: false, error: 'Brak kontrpropozycji zawodnika' }
  }

  const wage = p.counterWeeklyWage ?? p.playerEvaluation?.counterWeeklyWage
  const years = p.counterYears ?? p.playerEvaluation?.counterYears
  if (wage == null || years == null) {
    return { ok: false, error: 'Brak warunków kontrpropozycji' }
  }

  const preview = previewContractOffer(wage, years)
  const buyer = worldTeamById(career.world, career.playerTeamId)
  if (!buyer) return { ok: false, error: 'Brak drużyny' }
  if (p.fee + preview.totalCost > getTransferBudget(buyer)) {
    return { ok: false, error: 'Niewystarczający budżet na te warunki' }
  }

  const contractTerms = {
    weeklyWage: preview.weeklyWage,
    years: preview.years,
    bonuses: p.bonuses ?? [],
    promises: p.promises ?? [],
  }

  const staged = finalizeOrStageBuy(career, message, p, contractTerms, p.playerEvaluation)
  if (staged.error) return { ok: false, error: staged.error }

  let inbox = updateInboxMessage(career.inbox, messageId, {
    read: staged.message.read,
    title: staged.message.title,
    titleEn: staged.message.titleEn,
    body: staged.message.body,
    bodyEn: staged.message.bodyEn,
    payload: staged.message.payload,
  })
  if (staged.parentId && staged.parentPatch) {
    inbox = updateInboxMessage(inbox, staged.parentId, staged.parentPatch)
  }

  return {
    ok: true,
    completed: !!staged.completed,
    preAgreed: staged.message.payload?.status === 'pre_agreed',
    inbox,
    world: staged.world ?? career.world,
    transferLog: staged.transferLog ?? career.transferLog,
    entry: staged.entry,
  }
}

/**
 * W dniu otwartego okna: tworzy wiadomości z prośbą o potwierdzenie rejestracji
 * dla umów wstępnych (bez automatycznego transferu).
 */
export function spawnPendingRegistrationNotices(career, { date = null } = {}) {
  if (!career?.world || !isTransferWindowOpen(career)) return []

  const today = date ?? career.league?.currentDate
  if (!today) return []

  const inbox = ensureInbox(career)
  const messages = []
  const seenPlayers = new Set()

  for (const m of inbox) {
    const p = m?.payload
    if (m?.type !== INBOX_TYPES.TRANSFER_OFFER) continue
    if (p?.status !== 'pre_agreed' || p.registrationNotified) continue
    if (seenPlayers.has(String(p.playerId))) continue

    // Kupno: kontrakt jako źródło
    if (p.kind === 'outgoing_player_contract' && p.contractTerms) {
      seenPlayers.add(String(p.playerId))
      const terms = p.contractTerms
      const fee = p.fee
      messages.push(
        createInboxMessage({
          type: INBOX_TYPES.TRANSFER_OFFER,
          title: `Potwierdź rejestrację · ${p.playerName}`,
          titleEn: `Confirm registration · ${p.playerName}`,
          body: `Okno transferowe jest otwarte. Potwierdź rejestrację transferu ${p.playerName} z ${p.sellerTeamName} za ${formatUsd(fee)} · ${formatUsd(terms.weeklyWage)}/tydz. × ${terms.years} lat. Bez Twojego potwierdzenia transfer się nie odbędzie.`,
          bodyEn: `The transfer window is open. Confirm registering ${p.playerName} from ${p.sellerTeamName} for ${formatUsd(fee)} · ${formatUsd(terms.weeklyWage)}/wk × ${terms.years} yrs. Without your confirmation the transfer will not proceed.`,
          date: today,
          seasonIndex: career.seasonIndex,
          seasonYear: career.seasonYear,
          payload: {
            kind: 'pending_registration',
            status: 'pending_confirm',
            direction: 'buy',
            sourceMessageId: m.id,
            parentMessageId: p.parentMessageId ?? null,
            playerId: p.playerId,
            playerName: p.playerName,
            sellerTeamId: p.sellerTeamId,
            sellerTeamName: p.sellerTeamName,
            fee,
            contractTerms: terms,
          },
        }),
      )
      continue
    }

    // Sprzedaż: umowa wstępna na ofercie przychodzącej
    if (p.kind === 'incoming_bid' && p.direction === 'sell') {
      seenPlayers.add(String(p.playerId))
      messages.push(
        createInboxMessage({
          type: INBOX_TYPES.TRANSFER_OFFER,
          title: `Potwierdź sprzedaż · ${p.playerName}`,
          titleEn: `Confirm sale · ${p.playerName}`,
          body: `Okno transferowe jest otwarte. Potwierdź rejestrację sprzedaży ${p.playerName} do ${p.fromTeamName} za ${formatUsd(p.fee)}. Bez potwierdzenia transfer się nie odbędzie.`,
          bodyEn: `The transfer window is open. Confirm registering the sale of ${p.playerName} to ${p.fromTeamName} for ${formatUsd(p.fee)}. Without confirmation it will not proceed.`,
          date: today,
          seasonIndex: career.seasonIndex,
          seasonYear: career.seasonYear,
          payload: {
            kind: 'pending_registration',
            status: 'pending_confirm',
            direction: 'sell',
            sourceMessageId: m.id,
            playerId: p.playerId,
            playerName: p.playerName,
            buyerTeamId: p.fromTeamId,
            buyerTeamName: p.fromTeamName,
            fee: p.fee,
          },
        }),
      )
    }
  }

  return messages
}

/**
 * Oznacza źródłowe umowy wstępne jako powiadomione (po spawn notices).
 */
export function markPreAgreedNotified(inbox, notices) {
  const sourceIds = new Set(
    (notices ?? [])
      .map((n) => n?.payload?.sourceMessageId)
      .filter(Boolean)
      .map(String),
  )
  if (!sourceIds.size) return inbox
  return (inbox ?? []).map((m) => {
    if (!sourceIds.has(String(m.id))) return m
    return {
      ...m,
      payload: { ...(m.payload ?? {}), registrationNotified: true },
    }
  })
}

/**
 * Potwierdzenie rejestracji w otwartym oknie → finalizacja transferu.
 */
export function confirmPendingRegistration(career, { messageId }) {
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte — nie można zarejestrować transferu' }
  }

  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'pending_registration' || p.status !== 'pending_confirm') {
    return { ok: false, error: 'Brak oczekującej rejestracji' }
  }

  const found = findPlayer(career.world, p.playerId)

  if (p.direction === 'sell') {
    if (!found || found.team.id !== career.playerTeamId) {
      const inbox = updateInboxMessage(career.inbox, messageId, {
        read: true,
        title: `Rejestracja niemożliwa · ${p.playerName}`,
        titleEn: `Registration impossible · ${p.playerName}`,
        body: 'Zawodnik nie jest już w Twoim składzie — umowa wstępna wygasła.',
        bodyEn: 'The player is no longer in your squad — the pre-agreement expired.',
        payload: { status: 'withdrawn' },
      })
      return { ok: false, error: 'Zawodnik niedostępny', inbox }
    }
    const done = acceptIncomingBid(career, {
      playerId: p.playerId,
      buyerTeamId: p.buyerTeamId,
      fee: p.fee,
    })
    if (!done.ok) return done

    let inbox = updateInboxMessage(career.inbox, messageId, {
      read: true,
      title: `Zarejestrowano sprzedaż · ${p.playerName}`,
      titleEn: `Sale registered · ${p.playerName}`,
      body: `Potwierdziłeś rejestrację. Sprzedano ${p.playerName} do ${p.buyerTeamName} za ${formatUsd(p.fee)}.`,
      bodyEn: `You confirmed registration. Sold ${p.playerName} to ${p.buyerTeamName} for ${formatUsd(p.fee)}.`,
      payload: { status: 'accepted', entryId: done.entry?.id },
    })
    if (p.sourceMessageId) {
      inbox = updateInboxMessage(inbox, p.sourceMessageId, {
        payload: { status: 'accepted', entryId: done.entry?.id },
        read: true,
      })
    }
    return {
      ok: true,
      completed: true,
      inbox,
      world: done.world,
      transferLog: done.transferLog,
      entry: done.entry,
    }
  }

  if (!found || found.team.id !== p.sellerTeamId) {
    const inbox = updateInboxMessage(career.inbox, messageId, {
      read: true,
      title: `Rejestracja niemożliwa · ${p.playerName}`,
      titleEn: `Registration impossible · ${p.playerName}`,
      body: 'Zawodnik nie jest już dostępny — umowa wstępna wygasła.',
      bodyEn: 'The player is no longer available — the pre-agreement expired.',
      payload: { status: 'withdrawn' },
    })
    return { ok: false, error: 'Zawodnik niedostępny', inbox }
  }

  const done = completeTransfer(career, {
    playerId: p.playerId,
    fee: p.fee,
    contract: p.contractTerms,
  })
  if (!done.ok) return done

  let inbox = updateInboxMessage(career.inbox, messageId, {
    read: true,
    title: `Zarejestrowano · ${p.playerName}`,
    titleEn: `Registered · ${p.playerName}`,
    body: `Potwierdziłeś rejestrację. ${p.playerName} dołącza za ${formatUsd(p.fee)}.`,
    bodyEn: `You confirmed registration. ${p.playerName} joins for ${formatUsd(p.fee)}.`,
    payload: { status: 'accepted', entryId: done.entry?.id },
  })
  if (p.sourceMessageId) {
    inbox = updateInboxMessage(inbox, p.sourceMessageId, {
      payload: { status: 'accepted', contractDone: true, entryId: done.entry?.id },
      read: true,
    })
  }
  if (p.parentMessageId) {
    inbox = updateInboxMessage(inbox, p.parentMessageId, {
      payload: { status: 'accepted', contractDone: true },
      read: true,
    })
  }

  return {
    ok: true,
    completed: true,
    inbox,
    world: done.world,
    transferLog: done.transferLog,
    entry: done.entry,
  }
}

/** Odrzucenie / odwołanie rejestracji w oknie. */
export function declinePendingRegistration(career, { messageId }) {
  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'pending_registration' || p.status !== 'pending_confirm') {
    return { ok: false, error: 'Brak oczekującej rejestracji' }
  }

  let inbox = updateInboxMessage(career.inbox, messageId, {
    read: true,
    title: `Rejestracja anulowana · ${p.playerName}`,
    titleEn: `Registration cancelled · ${p.playerName}`,
    body: `Nie potwierdziłeś rejestracji transferu ${p.playerName}. Umowa wstępna została anulowana.`,
    bodyEn: `You did not confirm registration of ${p.playerName}. The pre-agreement was cancelled.`,
    payload: { status: 'rejected' },
  })
  if (p.sourceMessageId) {
    inbox = updateInboxMessage(inbox, p.sourceMessageId, {
      payload: { status: 'withdrawn', registrationNotified: true },
      read: true,
    })
  }
  return { ok: true, inbox }
}
