/**
 * Wypożyczenia zawodników — tymczasowe przeniesienie do innego klubu.
 *
 * Kluczowa różnica względem `completeTransferBetweenClubs`: zawodnik fizycznie
 * siedzi w `players[]` klubu docelowego (żeby był wybieralny do składu bez zmian
 * w logice taktyki), ale `player.contract` NIGDY nie jest zastępowany — to nie
 * jest nowy podpis umowy, tylko tymczasowe przeniesienie. Podział wynagrodzenia
 * (`processWeeklyWages` w `playerContracts.js`) i wykluczenia z innych mechanizmów
 * transferowych (rynek, AI-AI dealing, oferty przychodzące) korzystają z obecności
 * `player.loan` jako sygnału.
 */

import { createRng } from '../../matchEngine/rng.js'
import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'
import { worldTeamById, worldTeamsList } from '../worldState.js'
import { addDays, formatISODate, parseISODate, officialSeasonEndDate } from '../../league/seasonCalendar.js'
import { adjustTransferBudget, getTransferBudget, canBuyPlayers, getTransferPolicy } from './clubFinances.js'
import { isTransferWindowOpen } from './transferWindow.js'
import { classifyTransferTarget, playerOvrRank } from './negotiation.js'
import { getPlayerMarketValue, formatUsd } from './playerValue.js'
import { clearPlayerContractOnExit, signPlayerContract } from './playerContracts.js'
import { aiAutoPlayerContractTerms, previewContractOffer } from './playerNegotiation.js'
import { applyReputationAfterTransfer } from '../../models/teamReputation.js'
import { reseedLoyaltyForNewClub } from '../../models/playerLoyalty.js'
import {
  createInboxMessage,
  ensureInbox,
  updateInboxMessage,
  INBOX_TYPES,
} from '../inbox.js'

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Podłoga rostera klubu macierzystego przy wystawianiu na wypożyczenie. */
export const MIN_ROSTER_TO_LOAN_OUT = 14

export const LOAN_DURATION_PRESETS = [
  { id: 'six_months', labelPl: '6 miesięcy', labelEn: '6 months' },
  { id: 'rest_of_season', labelPl: 'Do końca sezonu', labelEn: 'Rest of the season' },
  { id: 'two_seasons', labelPl: '2 sezony', labelEn: '2 seasons' },
]

/**
 * @param {'six_months'|'rest_of_season'|'two_seasons'|'custom'} durationPreset
 * @param {{ fromDate: string, seasonYear: number|string, customDate?: string|null }} opts
 * @returns {string|null} ISO data powrotu
 */
export function computeLoanReturnDate(durationPreset, { fromDate, seasonYear, customDate = null }) {
  if (durationPreset === 'custom') return customDate ?? null
  if (durationPreset === 'six_months') {
    return formatISODate(addDays(parseISODate(fromDate), 182))
  }
  if (durationPreset === 'rest_of_season') {
    return officialSeasonEndDate(seasonYear)
  }
  if (durationPreset === 'two_seasons') {
    return officialSeasonEndDate(Number(seasonYear) + 1)
  }
  return null
}

export function ensureWorldLoans(world) {
  if (world && !Array.isArray(world.activeLoans)) world.activeLoans = []
  return world
}

function findPlayerInTeam(team, playerId) {
  const idx = (team?.players ?? []).findIndex((p) => String(p.id) === String(playerId))
  if (idx < 0) return null
  return { player: team.players[idx], index: idx }
}

function newLoanId(playerId) {
  return `loan-${Date.now()}-${playerId}-${Math.floor(Math.random() * 1e6)}`
}

/**
 * Rozpoczyna wypożyczenie: fizycznie przenosi zawodnika, NIE dotyka kontraktu.
 * @returns {{ ok: boolean, error?: string, loan?: object, world?: object, loanLogEntry?: object }}
 */
export function startLoan(career, {
  playerId, parentTeamId, destinationTeamId, fee = 0,
  durationPreset, customReturnDate = null, wageSplitPct = 50, buyClause = null,
}) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) {
    return { ok: false, error: 'Okno transferowe jest zamknięte' }
  }

  const parentTeam = worldTeamById(world, parentTeamId)
  const destinationTeam = worldTeamById(world, destinationTeamId)
  if (!parentTeam || !destinationTeam) return { ok: false, error: 'Nie znaleziono drużyny' }
  if (parentTeam.id === destinationTeam.id) {
    return { ok: false, error: 'Zawodnik już jest w tym klubie' }
  }

  const found = findPlayerInTeam(parentTeam, playerId)
  if (!found) return { ok: false, error: 'Zawodnik nie jest w klubie macierzystym' }
  if (found.player.loan) return { ok: false, error: 'Zawodnik jest już wypożyczony' }

  if ((parentTeam.players?.length ?? 0) - 1 < MIN_ROSTER_TO_LOAN_OUT) {
    return {
      ok: false,
      error: `Nie możesz wypożyczyć — skład musi mieć co najmniej ${MIN_ROSTER_TO_LOAN_OUT} zawodników`,
    }
  }

  const feeAmount = Math.max(0, Math.round(Number(fee) || 0))
  if (!canBuyPlayers(destinationTeam) && feeAmount > 0) {
    return { ok: false, error: 'Klub docelowy nie ma budżetu na opłatę wypożyczenia' }
  }
  if (feeAmount > getTransferBudget(destinationTeam)) {
    return { ok: false, error: 'Klub docelowy nie ma wystarczającego budżetu transferowego' }
  }

  const today = career.league?.currentDate ?? null
  const returnDate = computeLoanReturnDate(durationPreset, {
    fromDate: today,
    seasonYear: career.seasonYear,
    customDate: customReturnDate,
  })
  if (!returnDate) return { ok: false, error: 'Nie udało się wyliczyć daty powrotu' }

  const [moved] = parentTeam.players.splice(found.index, 1)
  if (!moved) return { ok: false, error: 'Nie udało się przenieść zawodnika' }
  destinationTeam.players = destinationTeam.players ?? []
  destinationTeam.players.push(moved)

  const pct = Math.max(0, Math.min(100, Math.round(Number(wageSplitPct))))
  const loan = {
    id: newLoanId(moved.id),
    parentTeamId: parentTeam.id,
    destinationTeamId: destinationTeam.id,
    startDate: today,
    returnDate,
    durationPreset,
    fee: feeAmount,
    wageSplitPct: pct,
    ovrAtStart: getOverallRating(moved.skills),
    buyClause: buyClause
      ? {
          type: buyClause.type === 'obligation' ? 'obligation' : 'option',
          fee: Math.max(0, Math.round(Number(buyClause.fee) || 0)),
          resolved: false,
          resolvedDate: null,
          decision: null,
        }
      : null,
    negotiationLog: [],
    createdAt: new Date().toISOString(),
  }
  moved.loan = loan

  adjustTransferBudget(destinationTeam, -feeAmount)
  adjustTransferBudget(parentTeam, +feeAmount)

  ensureWorldLoans(world)
  world.activeLoans.push({
    id: loan.id,
    playerId: moved.id,
    playerName: getPlayerFullName(moved),
    parentTeamId: parentTeam.id,
    parentTeamName: parentTeam.name,
    destinationTeamId: destinationTeam.id,
    destinationTeamName: destinationTeam.name,
    startDate: loan.startDate,
    returnDate: loan.returnDate,
    fee: feeAmount,
    wageSplitPct: pct,
    buyClause: loan.buyClause,
    status: 'active',
  })

  const loanLogEntry = {
    id: loan.id,
    kind: 'started',
    date: today,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    playerId: moved.id,
    playerName: getPlayerFullName(moved),
    parentTeamId: parentTeam.id,
    parentTeamName: parentTeam.name,
    destinationTeamId: destinationTeam.id,
    destinationTeamName: destinationTeam.name,
    fee: feeAmount,
    wageSplitPct: pct,
    returnDate,
    involvesPlayer: parentTeam.id === career.playerTeamId || destinationTeam.id === career.playerTeamId,
  }

  return { ok: true, loan, world, loanLogEntry, player: moved }
}

/**
 * Kończy wypożyczenie — powrót do klubu macierzystego. Bez blokady okna
 * transferowego (powrót jest sterowany datą, nie negocjacją).
 */
export function returnLoanedPlayer(career, { playerId }) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  ensureWorldLoans(world)

  let found = null
  let destinationTeam = null
  for (const team of worldTeamsList(world)) {
    const hit = findPlayerInTeam(team, playerId)
    if (hit && hit.player.loan) {
      found = hit
      destinationTeam = team
      break
    }
  }
  if (!found) return { ok: false, error: 'Zawodnik nie jest na wypożyczeniu' }

  const loan = found.player.loan
  const parentTeam = worldTeamById(world, loan.parentTeamId)
  if (!parentTeam) return { ok: false, error: 'Nie znaleziono klubu macierzystego' }

  const [moved] = destinationTeam.players.splice(found.index, 1)
  if (!moved) return { ok: false, error: 'Nie udało się przenieść zawodnika' }
  moved.loan = null
  parentTeam.players = parentTeam.players ?? []
  parentTeam.players.push(moved)

  world.activeLoans = (world.activeLoans ?? []).filter((l) => l.id !== loan.id)

  const loanLogEntry = {
    id: loan.id,
    kind: 'returned',
    date: career.league?.currentDate ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    playerId: moved.id,
    playerName: getPlayerFullName(moved),
    parentTeamId: parentTeam.id,
    parentTeamName: parentTeam.name,
    destinationTeamId: destinationTeam.id,
    destinationTeamName: destinationTeam.name,
    involvesPlayer: parentTeam.id === career.playerTeamId || destinationTeam.id === career.playerTeamId,
  }

  return { ok: true, world, loanLogEntry, player: moved, parentTeam, destinationTeam }
}

/**
 * Rozwiązuje klauzulę wykupu: `decision:'exercise'` zamienia wypożyczenie w
 * transfer stały (poza oknem transferowym — to z góry uzgodniony warunek, nie
 * nowa negocjacja); `decision:'decline'` odrzuca klauzulę i wraca do zwykłego
 * powrotu.
 */
export function resolveLoanBuyClause(career, { playerId, decision, triggeredBy = 'human' }) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }

  let found = null
  let destinationTeam = null
  for (const team of worldTeamsList(world)) {
    const hit = findPlayerInTeam(team, playerId)
    if (hit && hit.player.loan) {
      found = hit
      destinationTeam = team
      break
    }
  }
  if (!found) return { ok: false, error: 'Zawodnik nie jest na wypożyczeniu' }
  const loan = found.player.loan
  const buyClause = loan.buyClause
  if (!buyClause || buyClause.resolved) return { ok: false, error: 'Brak aktywnej klauzuli wykupu' }

  if (decision === 'decline') {
    buyClause.resolved = true
    buyClause.resolvedDate = career.league?.currentDate ?? null
    buyClause.decision = 'declined'
    const res = returnLoanedPlayer(career, { playerId })
    if (!res.ok) return res
    return { ...res, converted: false, buyClauseDeclined: true }
  }

  // Zawodnik już fizycznie siedzi u destination (od startu wypożyczenia) — to NIE jest
  // przenosiny jak `completeTransferBetweenClubs` (które zakłada, że sprzedający ma
  // gracza, a kupujący nie). Wykup z wypożyczenia to lżejsza operacja: opłata parent<-
  // destination, świeży kontrakt u destination (stary kontrakt wracał do klubu
  // macierzystego, więc TO on odzyskuje niewypłaconą rezerwę), reseed lojalności
  // (teraz naprawdę na stałe) i wpis do historii transferów.
  const parentTeamId = loan.parentTeamId
  const parentTeam = worldTeamById(world, parentTeamId)
  if (!parentTeam) return { ok: false, error: 'Nie znaleziono klubu macierzystego' }

  const fee = buyClause.fee
  const budget = getTransferBudget(destinationTeam)
  if (fee > budget) return { ok: false, error: 'Niewystarczający budżet na wykup z wypożyczenia' }

  const auto = aiAutoPlayerContractTerms({
    player: found.player,
    sellerTeam: parentTeam,
    buyerTeam: destinationTeam,
    league: career.league ?? null,
  })
  if (!auto.ok || !auto.terms) {
    return { ok: false, error: 'Zawodnik nie zgodził się na warunki kontraktu' }
  }
  const preview = previewContractOffer(auto.terms.weeklyWage, auto.terms.years)
  if (fee + preview.totalCost > budget) {
    return { ok: false, error: 'Niewystarczający budżet na wykup i kontrakt' }
  }

  applyReputationAfterTransfer(destinationTeam, parentTeam, found.player, fee)

  const previousContract = found.player.contract
    ? {
        ...found.player.contract,
        bonuses: [...(found.player.contract.bonuses ?? [])],
        promises: [...(found.player.contract.promises ?? [])],
      }
    : null
  const sellerRefund = clearPlayerContractOnExit(parentTeam, found.player)

  adjustTransferBudget(destinationTeam, -fee)
  adjustTransferBudget(parentTeam, +fee)

  const signed = signPlayerContract(destinationTeam, found.player, {
    ...auto.terms,
    signedDate: career.league?.currentDate ?? null,
  })
  if (!signed.ok) {
    adjustTransferBudget(destinationTeam, +fee)
    adjustTransferBudget(parentTeam, -fee)
    if (previousContract) {
      found.player.contract = previousContract
      if (sellerRefund > 0) {
        adjustTransferBudget(parentTeam, -sellerRefund)
        if (!parentTeam.finances) parentTeam.finances = { transferBudget: 0, salaryBudget: 0 }
        parentTeam.finances.salaryBudget =
          Math.max(0, Math.round(parentTeam.finances.salaryBudget ?? 0)) + sellerRefund
      }
    }
    return { ok: false, error: signed.error ?? 'Nie udało się podpisać kontraktu' }
  }

  reseedLoyaltyForNewClub(found.player)
  found.player.loan = null
  world.activeLoans = (world.activeLoans ?? []).filter((l) => l.id !== loan.id)

  buyClause.resolved = true
  buyClause.resolvedDate = career.league?.currentDate ?? null
  buyClause.decision = 'exercised'

  const involvesPlayer =
    destinationTeam.id === career.playerTeamId || parentTeam.id === career.playerTeamId
  const name = getPlayerFullName(found.player)
  const entry = {
    id: `loanbuy-${Date.now()}-${playerId}-${Math.floor(Math.random() * 1e6)}`,
    at: new Date().toISOString(),
    date: career.league?.currentDate ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    playerId,
    playerName: name,
    playerOvr: getOverallRating(found.player.skills),
    fromTeamId: parentTeam.id,
    fromTeamName: parentTeam.name,
    toTeamId: destinationTeam.id,
    toTeamName: destinationTeam.name,
    fee,
    marketValue: getPlayerMarketValue(found.player),
    weeklyWage: signed.contract.weeklyWage,
    contractYears: signed.contract.years,
    contractCost: preview.totalCost,
    involvesPlayer,
    isAiDeal: !involvesPlayer,
  }
  const transferLog = [...(career.transferLog ?? []), entry]

  const loanLogEntry = {
    id: loan.id,
    kind: 'bought_out',
    date: career.league?.currentDate ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    playerId,
    playerName: name,
    parentTeamId: parentTeam.id,
    parentTeamName: parentTeam.name,
    destinationTeamId: destinationTeam.id,
    destinationTeamName: destinationTeam.name,
    fee,
    triggeredBy,
    involvesPlayer,
  }

  return { ok: true, converted: true, world, transferLog, entry, loanLogEntry }
}

/**
 * Wrapper wywoływany z UI, gdy człowiek (klub docelowy) decyduje o opcjonalnej
 * klauzuli wykupu zaproponowanej w `processLoanReturns`.
 */
export function decideLoanBuyClause(career, { playerId, exercise }) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  ensureWorldLoans(world)
  const entry = world.activeLoans.find((l) => String(l.playerId) === String(playerId))
  if (!entry || entry.status !== 'pending_buy_decision') {
    return { ok: false, error: 'Brak oczekującej decyzji o klauzuli wykupu' }
  }
  return resolveLoanBuyClause(career, {
    playerId,
    decision: exercise ? 'exercise' : 'decline',
    triggeredBy: 'human',
  })
}

function loanReturnMessages(res, career) {
  if (!res?.ok) return []
  const { parentTeam, destinationTeam, player } = res
  if (!career?.playerTeamId) return []
  if (parentTeam.id !== career.playerTeamId && destinationTeam.id !== career.playerTeamId) return []
  const name = getPlayerFullName(player)
  const toParent = parentTeam.id === career.playerTeamId
  return [
    createInboxMessage({
      type: INBOX_TYPES.TRANSFER_OFFER,
      title: `Koniec wypożyczenia · ${name}`,
      titleEn: `Loan ended · ${name}`,
      body: toParent
        ? `${name} wrócił z wypożyczenia w ${destinationTeam.name} do Twojego klubu.`
        : `${name} wrócił z wypożyczenia do ${parentTeam.name} — opuszcza Twój skład.`,
      bodyEn: toParent
        ? `${name} has returned from his loan at ${destinationTeam.name} to your club.`
        : `${name} has returned from his loan to ${parentTeam.name} — leaving your squad.`,
      date: career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex,
      seasonYear: career.seasonYear,
      payload: { kind: 'loan_ended', playerId: player.id },
    }),
  ]
}

function loanBuyoutMessages(res, career, mode) {
  if (!res?.ok || !career?.playerTeamId) return []
  const entry = res.loanLogEntry
  if (!entry) return []
  if (entry.parentTeamId !== career.playerTeamId && entry.destinationTeamId !== career.playerTeamId) return []
  const name = entry.playerName
  const toParent = entry.parentTeamId === career.playerTeamId
  const modeNotePl = mode === 'mandatory' ? ' (klauzula obowiązkowa)' : ' (klub wykupił opcję)'
  const modeNoteEn = mode === 'mandatory' ? ' (mandatory clause)' : ' (option exercised)'
  return [
    createInboxMessage({
      type: INBOX_TYPES.TRANSFER_OFFER,
      title: `Wykup z wypożyczenia · ${name}`,
      titleEn: `Loan buy-out · ${name}`,
      body: toParent
        ? `${entry.destinationTeamName} wykupił ${name} z wypożyczenia za ${formatUsd(entry.fee)}${modeNotePl}.`
        : `Wykupiłeś ${name} z wypożyczenia od ${entry.parentTeamName} za ${formatUsd(entry.fee)}${modeNotePl}.`,
      bodyEn: toParent
        ? `${entry.destinationTeamName} bought out ${name}'s loan for ${formatUsd(entry.fee)}${modeNoteEn}.`
        : `You bought out ${name}'s loan from ${entry.parentTeamName} for ${formatUsd(entry.fee)}${modeNoteEn}.`,
      date: career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex,
      seasonYear: career.seasonYear,
      payload: { kind: 'loan_bought_out', playerId: entry.playerId, fee: entry.fee },
    }),
  ]
}

function loanBuyClauseDecisionMessage(entry, career, today) {
  return createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Decyzja: klauzula wykupu · ${entry.playerName}`,
    titleEn: `Decision: buy clause · ${entry.playerName}`,
    body: `Wypożyczenie ${entry.playerName} od ${entry.parentTeamName} dobiega końca. Masz klauzulę wykupu za ${formatUsd(entry.buyClause.fee)} — wykupić na stałe, czy pozwolić mu wrócić?`,
    bodyEn: `${entry.playerName}'s loan from ${entry.parentTeamName} is ending. You have a buy clause for ${formatUsd(entry.buyClause.fee)} — buy him permanently, or let him return?`,
    date: today,
    seasonIndex: career.seasonIndex,
    seasonYear: career.seasonYear,
    payload: {
      kind: 'loan_buy_clause_decision',
      status: 'pending_decision',
      playerId: entry.playerId,
      playerName: entry.playerName,
      parentTeamId: entry.parentTeamId,
      parentTeamName: entry.parentTeamName,
      fee: entry.buyClause.fee,
    },
  })
}

/**
 * Heurystyka AI: czy klub docelowy (AI) wykupuje zawodnika z klauzuli opcjonalnej.
 */
export function evaluateLoanBuyClauseAiDecision({ player, destinationTeam, buyClause }) {
  if (!player?.loan || !buyClause) return { exercise: false }
  const value = getPlayerMarketValue(player)
  const growth = getOverallRating(player.skills) - (player.loan.ovrAtStart ?? getOverallRating(player.skills))
  const target = classifyTransferTarget(player, destinationTeam)
  const budget = getTransferBudget(destinationTeam)
  if (budget < buyClause.fee) return { exercise: false }

  let chance = 0.2
  if (growth >= 4) chance += 0.25
  else if (growth >= 2) chance += 0.12
  if (value > buyClause.fee * 1.15) chance += 0.25
  if (target.prospect) chance += 0.15
  chance = Math.max(0, Math.min(0.85, chance))

  const rng = createRng(hashSeed(`${player.id}|buyclause|${destinationTeam?.id}`))
  return { exercise: rng.float() < chance, chance }
}

/**
 * Klub docelowy (AI) ocenia propozycję wzięcia zawodnika na wypożyczenie.
 */
export function evaluateLoanOffer({ player, destinationTeam, fee, wageSplitPct, buyClause, seed = null }) {
  const target = classifyTransferTarget(player, destinationTeam)
  const value = getPlayerMarketValue(player)
  const policy = getTransferPolicy(destinationTeam)
  const rng = seed == null ? createRng(null) : createRng(hashSeed(`${seed}|loan-in`))

  let desire = 0.45
  if (target.ovr >= (target.buyerAvg ?? 70) + 1) desire += 0.18
  else if (target.ovr >= (target.buyerAvg ?? 70) - 2) desire += 0.08
  if (target.prospect) desire += 0.15
  // Niższy udział własny w pensji = atrakcyjniej.
  desire += (50 - Math.min(100, Math.max(0, wageSplitPct))) / 100 * 0.3
  // Wysoka opłata względem wartości = mniej atrakcyjnie.
  const feeRatio = value > 0 ? fee / value : 0
  desire -= Math.max(0, feeRatio - 0.12) * 1.2
  if (buyClause?.type === 'obligation') desire -= 0.08
  if (policy.id === 'buy') desire += 0.05
  desire = Math.max(0, Math.min(0.9, desire))

  const name = getPlayerFullName(player)
  const club = destinationTeam?.name ?? 'Klub'

  if (rng.float() < desire) {
    return {
      status: 'accepted',
      message: `${club} przyjmuje ${name} na wypożyczenie.`,
      messageEn: `${club} accepts ${name} on loan.`,
    }
  }
  return {
    status: 'rejected',
    message: `${club} nie jest zainteresowany wypożyczeniem ${name} na tych warunkach.`,
    messageEn: `${club} isn't interested in loaning ${name} on these terms.`,
  }
}

/**
 * Klub macierzysty (AI) ocenia prośbę o wypożyczenie jednego z jego zawodników.
 */
export function evaluateLoanRequestFromParentSide({ player, parentTeam, fee, wageSplitPct, buyClause, seed = null }) {
  const rank = playerOvrRank(parentTeam.players, player.id)
  const avg =
    (parentTeam.players ?? []).reduce((s, p) => s + getOverallRating(p.skills), 0) /
    Math.max(1, parentTeam.players?.length ?? 1)
  const ovr = getOverallRating(player.skills)
  const isStar = rank <= 1 || ovr >= avg + 5
  const name = getPlayerFullName(player)
  const club = parentTeam?.name ?? 'Klub'

  if (isStar) {
    return {
      status: 'rejected',
      message: `${club} nie wypożyczy ${name} — to kluczowy zawodnik składu.`,
      messageEn: `${club} won't loan out ${name} — he's a key player.`,
    }
  }

  const target = classifyTransferTarget(player, parentTeam)
  const rng = seed == null ? createRng(null) : createRng(hashSeed(`${seed}|loan-out`))

  let desire = 0.3
  if (target.prospect && rank >= 7) desire += 0.2
  if (ovr < avg - 4) desire += 0.15
  // Wyższy udział destination w pensji = korzystniej dla parenta.
  desire += (Math.min(100, Math.max(0, wageSplitPct)) - 50) / 100 * 0.25
  const value = getPlayerMarketValue(player)
  if (value > 0) desire += Math.min(0.2, (fee / value) * 1.5)
  if (buyClause) desire += 0.05
  desire = Math.max(0, Math.min(0.88, desire))

  if (rng.float() < desire) {
    return {
      status: 'accepted',
      message: `${club} zgadza się wypożyczyć ${name}.`,
      messageEn: `${club} agrees to loan out ${name}.`,
    }
  }
  return {
    status: 'rejected',
    message: `${club} nie chce teraz wypożyczyć ${name}.`,
    messageEn: `${club} doesn't want to loan out ${name} right now.`,
  }
}

/**
 * Codzienny sweep: powroty z wypożyczeń + rozwiązywanie klauzul wykupu.
 */
export function processLoanReturns(career, { date = null } = {}) {
  const today = date ?? career?.league?.currentDate
  const world = career?.world
  if (!today || !world) {
    return {
      world,
      loanLog: career?.loanLog ?? [],
      transferLog: career?.transferLog ?? [],
      inboxMessages: [],
      resolved: 0,
    }
  }
  ensureWorldLoans(world)
  const inboxMessages = []
  let loanLog = career.loanLog ?? []
  let transferLog = career.transferLog ?? []
  let resolved = 0
  const liveCareer = () => ({ ...career, world, loanLog, transferLog })

  const due = world.activeLoans.filter((l) => l.status === 'active' && l.returnDate <= today)
  for (const entry of due) {
    const destinationTeam = worldTeamById(world, entry.destinationTeamId)
    const found = destinationTeam ? findPlayerInTeam(destinationTeam, entry.playerId) : null
    if (!found) {
      world.activeLoans = world.activeLoans.filter((l) => l.id !== entry.id)
      continue
    }
    const player = found.player
    const buyClause = player.loan?.buyClause

    if (buyClause && !buyClause.resolved) {
      if (buyClause.type === 'obligation') {
        const res = resolveLoanBuyClause(liveCareer(), { playerId: player.id, decision: 'exercise', triggeredBy: 'auto' })
        if (res.ok) {
          resolved += 1
          loanLog = [...loanLog, res.loanLogEntry]
          if (res.transferLog) transferLog = res.transferLog
          inboxMessages.push(...loanBuyoutMessages(res, career, 'mandatory'))
        }
        continue
      }
      if (entry.destinationTeamId === career.playerTeamId) {
        if (entry.status !== 'pending_buy_decision') {
          entry.status = 'pending_buy_decision'
          inboxMessages.push(loanBuyClauseDecisionMessage(entry, career, today))
        }
        continue
      }
      const decision = evaluateLoanBuyClauseAiDecision({ player, destinationTeam, buyClause })
      if (decision.exercise) {
        const res = resolveLoanBuyClause(liveCareer(), { playerId: player.id, decision: 'exercise', triggeredBy: 'ai' })
        if (res.ok) {
          resolved += 1
          loanLog = [...loanLog, res.loanLogEntry]
          if (res.transferLog) transferLog = res.transferLog
          inboxMessages.push(...loanBuyoutMessages(res, career, 'ai_exercised'))
        }
        continue
      }
      buyClause.resolved = true
      buyClause.decision = 'declined'
    }

    const res = returnLoanedPlayer(liveCareer(), { playerId: player.id })
    if (res.ok) {
      resolved += 1
      loanLog = [...loanLog, res.loanLogEntry]
      inboxMessages.push(...loanReturnMessages(res, career))
    }
  }

  return { world, loanLog, transferLog, inboxMessages, resolved }
}

/** Przewijanie wielu dni — sweep dzień po dniu (analog `processDelayedTransferRepliesForDateRange`). */
export function processLoanReturnsForDateRange(career, startDate, endDate) {
  if (!career?.world || !startDate || !endDate || endDate < startDate) {
    return {
      world: career?.world,
      loanLog: career?.loanLog ?? [],
      transferLog: career?.transferLog ?? [],
      inboxMessages: [],
      resolved: 0,
    }
  }
  let cursor = startDate
  let world = career.world
  let loanLog = career.loanLog ?? []
  let transferLog = career.transferLog ?? []
  const inboxMessages = []
  let resolved = 0

  while (cursor <= endDate) {
    const result = processLoanReturns({ ...career, world, loanLog, transferLog }, { date: cursor })
    world = result.world ?? world
    loanLog = result.loanLog ?? loanLog
    transferLog = result.transferLog ?? transferLog
    if (result.inboxMessages?.length) inboxMessages.push(...result.inboxMessages)
    resolved += result.resolved ?? 0
    cursor = formatISODate(addDays(parseISODate(cursor), 1))
  }

  return { world, loanLog, transferLog, inboxMessages, resolved }
}

/** Buduje wiersze do UI: wypożyczenia jednej drużyny (obie strony) lub wszystkie. */
export function listActiveLoans(world, { teamId = null } = {}) {
  ensureWorldLoans(world)
  const rows = (world?.activeLoans ?? []).filter((l) => l.status !== 'void')
  if (!teamId) return rows
  return rows.filter((l) => l.parentTeamId === teamId || l.destinationTeamId === teamId)
}

function hasAwaitingLoanOfferForPlayer(inbox, playerId, kinds) {
  for (const m of inbox ?? []) {
    const p = m?.payload
    if (m?.type !== INBOX_TYPES.TRANSFER_OFFER) continue
    if (!kinds.includes(p?.kind)) continue
    if (String(p.playerId) !== String(playerId)) continue
    if (p.status === 'awaiting_reply' || p.status === 'counter' || p.status === 'pending') return true
  }
  return false
}

/** Losuje datę odpowiedzi: +1..+3 dni (ten sam wzorzec co `rollNegotiationReplyDate`). */
function rollLoanReplyDate(fromDate, seedKey) {
  const rng = createRng(hashSeed(`${fromDate}|loan-reply|${seedKey}`))
  const days = 1 + Math.floor(rng.float() * 3)
  return formatISODate(addDays(parseISODate(fromDate), days))
}

/**
 * Człowiek proponuje wypożyczenie WŁASNEGO zawodnika do klubu AI.
 */
export function queueLoanOutOffer(career, { playerId, destinationTeamId, fee, durationPreset, wageSplitPct, buyClause = null }) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) return { ok: false, error: 'Okno transferowe jest zamknięte' }

  const today = career.league?.currentDate
  if (!today) return { ok: false, error: 'Brak daty w lidze' }

  const parentTeam = worldTeamById(world, career.playerTeamId)
  const destinationTeam = worldTeamById(world, destinationTeamId)
  if (!parentTeam || !destinationTeam) return { ok: false, error: 'Nie znaleziono drużyny' }

  const found = findPlayerInTeam(parentTeam, playerId)
  if (!found) return { ok: false, error: 'Zawodnik nie jest w Twoim klubie' }
  if (found.player.loan) return { ok: false, error: 'Zawodnik jest już wypożyczony' }
  if ((parentTeam.players?.length ?? 0) - 1 < MIN_ROSTER_TO_LOAN_OUT) {
    return { ok: false, error: `Nie możesz wypożyczyć — skład musi mieć co najmniej ${MIN_ROSTER_TO_LOAN_OUT} zawodników` }
  }

  const inbox = ensureInbox(career)
  if (hasAwaitingLoanOfferForPlayer(inbox, playerId, ['loan_out_offer'])) {
    return { ok: false, error: 'Masz już otwartą propozycję wypożyczenia tego zawodnika' }
  }

  const name = getPlayerFullName(found.player)
  const feeAmount = Math.max(0, Math.round(Number(fee) || 0))
  const pct = Math.max(0, Math.min(100, Math.round(Number(wageSplitPct))))
  const returnDate = computeLoanReturnDate(durationPreset, { fromDate: today, seasonYear: career.seasonYear })
  const replyDate = rollLoanReplyDate(today, `${career.id}|loan-out|${playerId}|${destinationTeamId}`)

  const message = createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Propozycja wypożyczenia · ${name}`,
    titleEn: `Loan proposal · ${name}`,
    body: `Zaproponowałeś wypożyczenie ${name} do ${destinationTeam.name} (opłata ${formatUsd(feeAmount)}, ${pct}% pensji po ich stronie, do ${returnDate}). Odpowiedź do ${replyDate}.`,
    bodyEn: `You proposed loaning ${name} to ${destinationTeam.name} (fee ${formatUsd(feeAmount)}, ${pct}% of wages on their side, until ${returnDate}). Reply by ${replyDate}.`,
    date: today,
    seasonIndex: career.seasonIndex,
    seasonYear: career.seasonYear,
    payload: {
      kind: 'loan_out_offer',
      status: 'awaiting_reply',
      replyDate,
      playerId: found.player.id,
      playerName: name,
      parentTeamId: parentTeam.id,
      destinationTeamId: destinationTeam.id,
      destinationTeamName: destinationTeam.name,
      fee: feeAmount,
      wageSplitPct: pct,
      durationPreset,
      returnDate,
      buyClause,
    },
  })

  return { ok: true, queued: true, message, replyDate }
}

/**
 * Człowiek prosi o wypożyczenie zawodnika OD klubu AI.
 */
export function queueLoanInRequest(career, { playerId, fee, durationPreset, wageSplitPct, buyClause = null }) {
  const world = career?.world
  if (!world) return { ok: false, error: 'Brak świata kariery' }
  if (!isTransferWindowOpen(career)) return { ok: false, error: 'Okno transferowe jest zamknięte' }

  const today = career.league?.currentDate
  if (!today) return { ok: false, error: 'Brak daty w lidze' }

  let parentTeam = null
  let found = null
  for (const team of worldTeamsList(world)) {
    if (team.id === career.playerTeamId) continue
    const hit = findPlayerInTeam(team, playerId)
    if (hit) {
      parentTeam = team
      found = hit
      break
    }
  }
  if (!parentTeam || !found) return { ok: false, error: 'Nie znaleziono zawodnika' }
  if (found.player.loan) return { ok: false, error: 'Zawodnik jest już wypożyczony gdzie indziej' }

  const inbox = ensureInbox(career)
  if (hasAwaitingLoanOfferForPlayer(inbox, playerId, ['loan_in_request'])) {
    return { ok: false, error: 'Masz już otwartą prośbę o wypożyczenie tego zawodnika' }
  }

  const destinationTeam = worldTeamById(world, career.playerTeamId)
  const name = getPlayerFullName(found.player)
  const feeAmount = Math.max(0, Math.round(Number(fee) || 0))
  if (feeAmount > getTransferBudget(destinationTeam)) {
    return { ok: false, error: 'Brak wystarczającego budżetu transferowego na opłatę' }
  }
  const pct = Math.max(0, Math.min(100, Math.round(Number(wageSplitPct))))
  const returnDate = computeLoanReturnDate(durationPreset, { fromDate: today, seasonYear: career.seasonYear })
  const replyDate = rollLoanReplyDate(today, `${career.id}|loan-in|${playerId}|${parentTeam.id}`)

  const message = createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Prośba o wypożyczenie · ${name}`,
    titleEn: `Loan request · ${name}`,
    body: `Poprosiłeś ${parentTeam.name} o wypożyczenie ${name} (opłata ${formatUsd(feeAmount)}, ${pct}% pensji po Twojej stronie, do ${returnDate}). Odpowiedź do ${replyDate}.`,
    bodyEn: `You asked ${parentTeam.name} to loan out ${name} (fee ${formatUsd(feeAmount)}, ${pct}% of wages on your side, until ${returnDate}). Reply by ${replyDate}.`,
    date: today,
    seasonIndex: career.seasonIndex,
    seasonYear: career.seasonYear,
    payload: {
      kind: 'loan_in_request',
      status: 'awaiting_reply',
      replyDate,
      playerId: found.player.id,
      playerName: name,
      parentTeamId: parentTeam.id,
      parentTeamName: parentTeam.name,
      destinationTeamId: destinationTeam.id,
      fee: feeAmount,
      wageSplitPct: pct,
      durationPreset,
      returnDate,
      buyClause,
    },
  })

  return { ok: true, queued: true, message, replyDate }
}

/** Rozwiązuje `loan_out_offer` po upływie `replyDate` — wołane z `processDelayedTransferReplies`. */
export function resolveOutgoingLoanOffer(career, message) {
  const world = career.world
  const p = message.payload
  const destinationTeam = worldTeamById(world, p.destinationTeamId)
  const parentTeam = worldTeamById(world, p.parentTeamId)
  const found = parentTeam ? findPlayerInTeam(parentTeam, p.playerId) : null

  if (!destinationTeam || !parentTeam || !found || found.player.loan) {
    return {
      message: {
        ...message,
        read: false,
        payload: { ...p, status: 'withdrawn' },
        body: `${message.body}\n\nPropozycja wygasła — zawodnik niedostępny.`,
        bodyEn: `${message.bodyEn ?? message.body}\n\nThe proposal expired — player unavailable.`,
      },
    }
  }

  const evaluation = evaluateLoanOffer({
    player: found.player,
    destinationTeam,
    parentTeam,
    fee: p.fee,
    wageSplitPct: p.wageSplitPct,
    buyClause: p.buyClause,
    seed: hashSeed(`${message.id}|${p.replyDate}|loan-out-reply`),
  })

  if (evaluation.status === 'accepted') {
    const done = startLoan(career, {
      playerId: p.playerId,
      parentTeamId: parentTeam.id,
      destinationTeamId: destinationTeam.id,
      fee: p.fee,
      durationPreset: p.durationPreset,
      wageSplitPct: p.wageSplitPct,
      buyClause: p.buyClause,
    })
    if (!done.ok) {
      return {
        message: {
          ...message,
          read: false,
          payload: { ...p, status: 'rejected' },
          body: `${message.body}\n\n${done.error}`,
          bodyEn: `${message.bodyEn ?? message.body}\n\n${done.error}`,
        },
      }
    }
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Wypożyczenie rozpoczęte · ${p.playerName}`,
        titleEn: `Loan started · ${p.playerName}`,
        body: evaluation.message,
        bodyEn: evaluation.messageEn,
        payload: { ...p, status: 'accepted', loanId: done.loan.id },
      },
      world: done.world,
      loanLogEntry: done.loanLogEntry,
    }
  }

  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate,
      title: `Odrzucono wypożyczenie · ${p.playerName}`,
      titleEn: `Loan declined · ${p.playerName}`,
      body: evaluation.message,
      bodyEn: evaluation.messageEn,
      payload: { ...p, status: 'rejected' },
    },
  }
}

/** Rozwiązuje `loan_in_request` po upływie `replyDate`. */
export function resolveIncomingLoanRequestReply(career, message) {
  const world = career.world
  const p = message.payload
  const parentTeam = worldTeamById(world, p.parentTeamId)
  const destinationTeam = worldTeamById(world, p.destinationTeamId)
  const found = parentTeam ? findPlayerInTeam(parentTeam, p.playerId) : null

  if (!parentTeam || !destinationTeam || !found || found.player.loan) {
    return {
      message: {
        ...message,
        read: false,
        payload: { ...p, status: 'withdrawn' },
        body: `${message.body}\n\nProśba wygasła — zawodnik niedostępny.`,
        bodyEn: `${message.bodyEn ?? message.body}\n\nThe request expired — player unavailable.`,
      },
    }
  }

  const evaluation = evaluateLoanRequestFromParentSide({
    player: found.player,
    parentTeam,
    destinationTeam,
    fee: p.fee,
    wageSplitPct: p.wageSplitPct,
    buyClause: p.buyClause,
    seed: hashSeed(`${message.id}|${p.replyDate}|loan-in-reply`),
  })

  if (evaluation.status === 'accepted') {
    const done = startLoan(career, {
      playerId: p.playerId,
      parentTeamId: parentTeam.id,
      destinationTeamId: destinationTeam.id,
      fee: p.fee,
      durationPreset: p.durationPreset,
      wageSplitPct: p.wageSplitPct,
      buyClause: p.buyClause,
    })
    if (!done.ok) {
      return {
        message: {
          ...message,
          read: false,
          payload: { ...p, status: 'rejected' },
          body: `${message.body}\n\n${done.error}`,
          bodyEn: `${message.bodyEn ?? message.body}\n\n${done.error}`,
        },
      }
    }
    return {
      message: {
        ...message,
        read: false,
        date: p.replyDate,
        title: `Wypożyczenie rozpoczęte · ${p.playerName}`,
        titleEn: `Loan started · ${p.playerName}`,
        body: evaluation.message,
        bodyEn: evaluation.messageEn,
        payload: { ...p, status: 'accepted', loanId: done.loan.id },
      },
      world: done.world,
      loanLogEntry: done.loanLogEntry,
    }
  }

  return {
    message: {
      ...message,
      read: false,
      date: p.replyDate,
      title: `Odrzucono prośbę · ${p.playerName}`,
      titleEn: `Request declined · ${p.playerName}`,
      body: evaluation.message,
      bodyEn: evaluation.messageEn,
      payload: { ...p, status: 'rejected' },
    },
  }
}

/**
 * AI (jako klub macierzysty) odpowiada na prośbę o wypożyczenie zawodnika gracza,
 * inicjowaną przez `generateIncomingLoanOffers` — wzorem `respondToIncomingBid`.
 */
export function respondToIncomingLoanRequest(career, { messageId, action }) {
  const message = (career.inbox ?? []).find((m) => m.id === messageId)
  const p = message?.payload
  if (!message || p?.kind !== 'loan_in_request_from_ai') {
    return { ok: false, error: 'Nie znaleziono propozycji' }
  }
  if (p.status !== 'pending') return { ok: false, error: 'Propozycja nieaktywna' }

  if (action === 'reject') {
    const inbox = updateInboxMessage(career.inbox, messageId, {
      read: true,
      payload: { status: 'rejected' },
    })
    return { ok: true, completed: false, inbox }
  }

  if (action === 'accept') {
    const done = startLoan(career, {
      playerId: p.playerId,
      parentTeamId: career.playerTeamId,
      destinationTeamId: p.destinationTeamId,
      fee: p.fee,
      durationPreset: p.durationPreset,
      wageSplitPct: p.wageSplitPct,
      buyClause: p.buyClause,
    })
    if (!done.ok) return done
    const inbox = updateInboxMessage(career.inbox, messageId, {
      read: true,
      payload: { status: 'accepted', loanId: done.loan.id },
    })
    return { ok: true, completed: true, inbox, world: done.world, loan: done.loan }
  }

  return { ok: false, error: 'Nieznana akcja' }
}
