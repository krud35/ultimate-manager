/**
 * Negocjacje transferowe z AI klubami.
 *
 * Kluby niechętnie sprzedają najlepszych zawodników; dobra oferta zwiększa
 * szansę akceptacji, ale nigdy nie gwarantuje 100%.
 * Trudność negocjacji bierze się z `modifiers.transferPolicy`.
 */

import { createRng } from '../../matchEngine/rng.js'
import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerForm } from '../../models/playerForm.js'
import { getPlayerMorale } from '../../models/playerMorale.js'
import {
  ensureTeamReputation,
  getTeamReputation,
  REPUTATION_DEFAULT,
} from '../../models/teamReputation.js'
import { getPlayerMarketValue, formatUsd } from './playerValue.js'
import { getTransferPolicy } from './clubFinances.js'

/**
 * Profil zawodnika jako celu transferowego.
 * - prospect: młody z roomem potencjału
 * - veteran: starszy, tańszy względem OVR, mniejsza perspektywa
 * - quality: klasyczny upgrade / depth
 */
export function classifyTransferTarget(player, buyerTeam = null) {
  const ovr = getOverallRating(player?.skills)
  const age = Number.isFinite(player?.age) ? player.age : 25
  const pot = Number.isFinite(player?.potential) ? player.potential : ovr
  const room = Math.max(0, pot - ovr)

  let buyerAvg = null
  const buyers = buyerTeam?.players ?? []
  if (buyers.length) {
    let sum = 0
    for (const p of buyers) sum += getOverallRating(p.skills)
    buyerAvg = sum / buyers.length
  }

  const strongProspect = age <= 22 && room >= 5 && pot >= 76
  const prospect =
    strongProspect ||
    (age <= 23 && room >= 4 && pot >= ovr + 4) ||
    (age <= 24 && room >= 6 && pot >= 78)

  const veteran = age >= 30
  const veteranBargain =
    age >= 31 &&
    ovr >= 70 &&
    (!Number.isFinite(buyerAvg) || ovr >= buyerAvg - 3)

  let motive = 'quality'
  if (strongProspect || prospect) motive = 'prospect'
  else if (veteranBargain || (veteran && ovr >= 72)) motive = 'veteran'

  return {
    ovr,
    age,
    pot,
    room,
    buyerAvg,
    prospect,
    strongProspect,
    veteran,
    veteranBargain,
    motive,
  }
}

/**
 * Mapa `playerId → ranking OVR` (0 = najlepszy) — jeden sort na cały skład.
 *
 * Używaj tego zamiast `playerOvrRank` w pętli po zawodnikach: pojedyncze wywołanie
 * sortuje skład od nowa, więc pętla po N zawodnikach to N sortów tej samej listy.
 * @param {object[]} players
 * @returns {Map<string, number>}
 */
export function buildOvrRankMap(players) {
  const ranked = [...(players ?? [])]
    .map((p) => ({ id: String(p?.id), ovr: getOverallRating(p?.skills) }))
    .sort((a, b) => b.ovr - a.ovr)
  const map = new Map()
  ranked.forEach((entry, index) => {
    if (!map.has(entry.id)) map.set(entry.id, index)
  })
  return map
}

/**
 * Ranking zawodnika w składzie po OVR (0 = najlepszy).
 * @param {object[]} players
 * @param {string|number} playerId
 */
export function playerOvrRank(players, playerId) {
  const rank = buildOvrRankMap(players).get(String(playerId))
  return rank ?? (players ?? []).length
}

/**
 * Premia za bycie kluczowym zawodnikiem (niechęć do sprzedaży).
 * @param {number} rank — 0-based
 * @param {number} rosterSize
 */
export function starPremium(rank, rosterSize) {
  const size = Math.max(1, rosterSize)
  if (rank === 0) return 2.05
  if (rank <= 2) return 1.65
  if (rank <= 6) return 1.32
  if (rank <= Math.floor(size * 0.35)) return 1.12
  return 1.0
}

/** Zawodnik na liście transferowej jest tańszy — właściciel chce sprzedać, nie maksymalizować cenę. */
export const TRANSFER_LIST_ASK_DISCOUNT = 0.85
/** Bonus do szansy akceptacji oferty za bycie wystawionym na listę transferową. */
export const TRANSFER_LIST_ACCEPT_BONUS = 0.12

/**
 * Cena wywoławcza sprzedającego.
 * @param {object} player
 * @param {object} sellerTeam
 * @param {number|null} [precomputedRank] — ranking OVR z `buildOvrRankMap`; podaj
 *   go w pętli po składzie, inaczej każdy zawodnik sortuje skład od nowa.
 */
export function computeAskPrice(player, sellerTeam, precomputedRank = null) {
  const value = getPlayerMarketValue(player)
  const policy = getTransferPolicy(sellerTeam)
  const rank =
    Number.isFinite(precomputedRank) && precomputedRank >= 0
      ? precomputedRank
      : playerOvrRank(sellerTeam.players, player.id)
  const premium = starPremium(rank, sellerTeam.players?.length ?? 1)
  const ask = value * (policy.askPriceMultiplier ?? 1.12) * premium
  const base = Math.max(value, Math.round(ask / 1000) * 1000)
  // Zastosowane NA KOŃCU (po podłodze `value`), inaczej rabat ginie dla większości
  // zawodników (premium=1 → ask już blisko podłogi value, rabat przed floor nic by nie dał).
  if (!player?.transferListed) return base
  return Math.round((base * TRANSFER_LIST_ASK_DISCOUNT) / 1000) * 1000
}

/**
 * Szansa akceptacji oferty (0–1) przed losowaniem „twardego nie”.
 */
export function acceptanceChance({ offer, ask, rank, policy, rosterSize, listed = false }) {
  const difficulty = Math.max(0.55, policy?.negotiationDifficulty ?? 1)
  const premium = starPremium(rank, rosterSize)
  const ratio = ask > 0 ? offer / ask : 0

  // Poniżej ~75% ask → prawie zero; 100% ask → solidna szansa; 130%+ → wysoko.
  let chance = 0
  if (ratio < 0.75) chance = 0.03 * (ratio / 0.75)
  else if (ratio < 0.9) chance = 0.08 + (ratio - 0.75) * 1.2
  else if (ratio < 1.0) chance = 0.26 + (ratio - 0.9) * 2.4
  else if (ratio < 1.15) chance = 0.5 + (ratio - 1.0) * 1.6
  else if (ratio < 1.35) chance = 0.74 + (ratio - 1.15) * 0.7
  else chance = 0.88 + Math.min(0.07, (ratio - 1.35) * 0.12)

  // Gwiazdy trudniej, ale dobra oferta wciąż ma sens.
  // negotiationDifficulty (polityka transferowa) jest głównym mnożnikiem.
  const starHardness = 1 + (premium - 1) * 0.32
  chance /= difficulty * starHardness

  // Zawodnik na liście transferowej — łatwiej domknąć transfer.
  if (listed) chance += TRANSFER_LIST_ACCEPT_BONUS

  // Nigdy 100% — szczególnie dla #1 w składzie.
  const softCap = rank === 0 ? 0.72 : rank <= 2 ? 0.84 : 0.94
  return Math.max(0, Math.min(softCap, chance))
}

function counterAmount(ask, offer, rng) {
  const floor = Math.max(ask, offer)
  const bump = 0.04 + rng.float() * 0.14
  return Math.round((floor * (1 + bump)) / 1000) * 1000
}

function mixSeed(seed) {
  let x = Number(seed) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}

/**
 * Ocena oferty kupna.
 *
 * @param {object} params
 * @param {object} params.player
 * @param {object} params.sellerTeam
 * @param {number} params.offerAmount
 * @param {number} [params.seed]
 * @returns {{
 *   status: 'accepted'|'rejected'|'counter',
 *   askPrice: number,
 *   offerAmount: number,
 *   counterAmount?: number,
 *   chance: number,
 *   message: string,
 *   rank: number,
 * }}
 */
export function evaluateBuyOffer({ player, sellerTeam, offerAmount, seed = null }) {
  const offer = Math.max(0, Math.round(Number(offerAmount) || 0))
  const policy = getTransferPolicy(sellerTeam)
  const ask = computeAskPrice(player, sellerTeam)
  const rank = playerOvrRank(sellerTeam.players, player.id)
  const rosterSize = sellerTeam.players?.length ?? 1
  const chance = acceptanceChance({
    offer,
    ask,
    rank,
    policy,
    rosterSize,
    listed: !!player?.transferListed,
  })

  // Bez seeda: pełny Math.random. Ze seedem: hash, żeby bliskie inty nie dawały tych samych rolli.
  const rng =
    seed == null
      ? createRng(null)
      : createRng(
          mixSeed(
            seed ^
              (Number(player?.id) || 0) ^
              Math.floor(offer / 1000) ^
              Math.floor(ask / 1000),
          ),
        )

  const roll = rng.float()
  const name = player
    ? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Zawodnik'
    : 'Zawodnik'
  const club = sellerTeam?.name ?? 'Klub'
  const policyNote = `Polityka: ${policy.labelPl} (trudność ×${policy.negotiationDifficulty.toFixed(2)})`
  const policyNoteEn = `Policy: ${policy.labelEn ?? policy.labelPl} (difficulty ×${policy.negotiationDifficulty.toFixed(2)})`

  if (offer <= 0) {
    return {
      status: 'rejected',
      askPrice: ask,
      offerAmount: offer,
      chance,
      message: `${club}: nie rozpatrujemy pustej oferty. ${policyNote}`,
      messageEn: `${club}: we do not consider empty offers. ${policyNoteEn}`,
      rank,
    }
  }

  if (roll < chance) {
    return {
      status: 'accepted',
      askPrice: ask,
      offerAmount: offer,
      chance,
      message: `${club} akceptuje ofertę ${formatUsd(offer)} za ${name}. ${policyNote}`,
      messageEn: `${club} accepts the offer of ${formatUsd(offer)} for ${name}. ${policyNoteEn}`,
      rank,
    }
  }

  // Blisko ask → często kontrpropozycja zamiast twardego „nie”.
  const nearMiss = offer >= ask * 0.85 && offer < ask * 1.4
  const wantCounter = nearMiss && rng.float() < 0.72
  if (wantCounter) {
    const counter = counterAmount(ask, offer, rng)
    return {
      status: 'counter',
      askPrice: ask,
      offerAmount: offer,
      counterAmount: counter,
      chance,
      message: `${club} odrzuca ${formatUsd(offer)}, ale proponuje ${formatUsd(counter)} za ${name}. ${policyNote}`,
      messageEn: `${club} rejects ${formatUsd(offer)}, but proposes ${formatUsd(counter)} for ${name}. ${policyNoteEn}`,
      rank,
    }
  }

  const starHint =
    rank === 0
      ? ' To ich najlepszy zawodnik — sprzedaż jest bardzo mało prawdopodobna.'
      : rank <= 2
        ? ' To jeden z kluczowych graczy składu.'
        : ''
  const starHintEn =
    rank === 0
      ? ' This is their best player — a sale is very unlikely.'
      : rank <= 2
        ? ' This is one of the key players in the squad.'
        : ''

  return {
    status: 'rejected',
    askPrice: ask,
    offerAmount: offer,
    chance,
    message: `${club} odrzuca ofertę ${formatUsd(offer)} za ${name}.${starHint} ${policyNote}`,
    messageEn: `${club} rejects the offer of ${formatUsd(offer)} for ${name}.${starHintEn} ${policyNoteEn}`,
    rank,
  }
}

/**
 * Maksimum, które AI kupujący jest skłonny zapłacić za zawodnika gracza.
 */
export function aiBuyerMaxFee({
  player,
  buyerTeam,
  sellerTeam,
  originalOffer = 0,
  budget = null,
}) {
  const ask = computeAskPrice(player, sellerTeam)
  const value = getPlayerMarketValue(player)
  const target = classifyTransferTarget(player, buyerTeam)
  const { ovr, buyerAvg: avgFromTarget, prospect, strongProspect, veteran, veteranBargain } =
    target
  const buyerAvg = avgFromTarget ?? 70

  const form = getPlayerForm(player)
  const morale = getPlayerMorale(player)

  let mult = 1.02
  if (ovr >= buyerAvg + 3) mult = 1.2
  else if (ovr >= buyerAvg + 1) mult = 1.14
  else if (ovr >= buyerAvg - 1) mult = 1.08
  else if (ovr >= buyerAvg - 3) mult = 1.0
  else mult = 0.92

  if (form >= 82) mult += 0.06
  else if (form >= 72) mult += 0.02
  else if (form < 58) mult -= 0.1
  else if (form < 65) mult -= 0.04

  // Niskie morale — AI próbuje ugrać niższą cenę.
  if (morale < 45) mult -= 0.06
  else if (morale < 55) mult -= 0.03

  // Prestige klubu kupującego — elitarne marki lekko przepłacają za wzmocnienia.
  if (buyerTeam) {
    ensureTeamReputation(buyerTeam)
    const rep = getTeamReputation(buyerTeam)
    mult += ((rep - REPUTATION_DEFAULT) / 100) * 0.1
  }

  // Talenty: gotowi zapłacić premium za room; weterani — twardy sufit.
  if (strongProspect) mult += 0.1
  else if (prospect) mult += 0.06
  if (veteranBargain) mult -= 0.08
  else if (veteran) mult -= 0.05

  const fromAsk = Math.round((ask * mult) / 1000) * 1000
  const fromValue = Math.round((value * (mult + 0.05)) / 1000) * 1000
  const fromOriginal = Math.round((Math.max(0, originalOffer) * 1.14) / 1000) * 1000
  const cap = budget != null ? budget : Number.POSITIVE_INFINITY
  return Math.max(
    0,
    Math.min(cap, Math.max(fromAsk, fromValue, fromOriginal, Math.round(originalOffer) || 0)),
  )
}

/**
 * Ocena kontrpropozycji sprzedającego (gracz) wobec oferty AI.
 *
 * @returns {{ status: 'accepted'|'rejected'|'counter', fee?: number, counterAmount?: number, maxFee: number, message: string }}
 */
export const AI_ESCALATION_MAX_ROUNDS = 2
/** O ile ponad normalny sufit (`maxFee`) AI jest skłonne się naciągnąć, gdy naprawdę chce zawodnika. */
export const AI_ESCALATION_STRETCH = 1.22

export function evaluateSellerCounter({
  player,
  buyerTeam,
  sellerTeam,
  originalOffer,
  counterAmount,
  seed = null,
  budget = null,
  negotiationLog = [],
}) {
  const counter = Math.max(0, Math.round(Number(counterAmount) || 0))
  const original = Math.max(0, Math.round(Number(originalOffer) || 0))
  const maxFee = aiBuyerMaxFee({
    player,
    buyerTeam,
    sellerTeam,
    originalOffer: original,
    budget,
  })

  const rng =
    seed == null
      ? createRng(null)
      : createRng(
          mixSeed(
            seed ^
              (Number(player?.id) || 0) ^
              Math.floor(counter / 1000) ^
              Math.floor(original / 1000),
          ),
        )

  const name = player
    ? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Zawodnik'
    : 'Zawodnik'
  const club = buyerTeam?.name ?? 'Klub'

  if (counter <= 0) {
    return {
      status: 'rejected',
      maxFee,
      message: `${club}: nie rozpatrujemy pustej kontrpropozycji za ${name}.`,
      messageEn: `${club}: we do not consider an empty counter for ${name}.`,
    }
  }

  if (counter <= original) {
    return {
      status: 'accepted',
      fee: counter,
      maxFee,
      message: `${club} akceptuje ${formatUsd(counter)} za ${name}.`,
      messageEn: `${club} accepts ${formatUsd(counter)} for ${name}.`,
    }
  }

  if (counter <= maxFee) {
    const softAccept = counter <= maxFee * 0.97 || rng.float() < 0.78
    if (softAccept) {
      return {
        status: 'accepted',
        fee: counter,
        maxFee,
        message: `${club} akceptuje Twoją kontrpropozycję ${formatUsd(counter)} za ${name}.`,
        messageEn: `${club} accepts your counter of ${formatUsd(counter)} for ${name}.`,
      }
    }
  }

  // Blisko maksimum → AI wraca z ostateczną ofertą.
  if (counter <= maxFee * 1.12 && maxFee > original) {
    const reCounter = Math.min(
      maxFee,
      Math.round(Math.max(original, maxFee * 0.96) / 1000) * 1000,
    )
    if (reCounter > original && reCounter < counter) {
      return {
        status: 'counter',
        counterAmount: reCounter,
        fee: reCounter,
        maxFee,
        message: `${club} nie akceptuje ${formatUsd(counter)}, ale podnosi ofertę do ${formatUsd(reCounter)} za ${name}.`,
        messageEn: `${club} does not accept ${formatUsd(counter)}, but raises the offer to ${formatUsd(reCounter)} for ${name}.`,
      }
    }
  }

  // Twardy sufit przekroczony — zanim AI się wycofa, sprawdź czy naprawdę zależy im na
  // zawodniku na tyle, żeby naciągnąć własny budżet ambicji (ograniczone liczbą rund,
  // żeby gracz nie mógł wyciskać coraz wyższych ofert w nieskończoność).
  const cap = budget != null ? budget : Number.POSITIVE_INFINITY
  const target = classifyTransferTarget(player, buyerTeam)
  const wantsBadly =
    target.strongProspect ||
    (target.ovr ?? 0) >= (target.buyerAvg ?? 70) + 3 ||
    (buyerTeam && getTeamReputation(buyerTeam) > REPUTATION_DEFAULT + 15)
  const budgetRoom = cap > maxFee * 1.05
  const escalationsUsed = (negotiationLog ?? []).filter((e) => e.action === 'ai_escalation').length

  if (escalationsUsed < AI_ESCALATION_MAX_ROUNDS && wantsBadly && budgetRoom) {
    const escalatedMax = Math.min(cap, Math.round((maxFee * AI_ESCALATION_STRETCH) / 1000) * 1000)
    if (escalatedMax > maxFee) {
      const reCounter = Math.min(counter, escalatedMax)
      if (reCounter > original) {
        return {
          status: 'counter',
          counterAmount: reCounter,
          fee: reCounter,
          maxFee: escalatedMax,
          escalated: true,
          message: `${club} bardzo chce ${name} — podnosi ofertę do ${formatUsd(reCounter)}, powyżej ich zwykłego budżetu na ten transfer.`,
          messageEn: `${club} really wants ${name} — raises the offer to ${formatUsd(reCounter)}, above their usual budget for this deal.`,
        }
      }
    }
  }

  return {
    status: 'rejected',
    maxFee,
    message: `${club} wycofuje się — ${formatUsd(counter)} za ${name} przekracza ich budżet ambicji (maks. ok. ${formatUsd(maxFee)}).`,
    messageEn: `${club} walks away — ${formatUsd(counter)} for ${name} exceeds their ambition budget (max about ${formatUsd(maxFee)}).`,
  }
}

// Zawodnik na liście transferowej: AI wie, że klub chce go sprzedać.
const TRANSFER_LIST_AI_INTEREST_MULT = 1.6

/**
 * Czy AI kupujący zainteresuje się zawodnikiem gracza.
 * Cele: jakość/upgrade, młody talent, weteran-okazja; forma; morale otwiera drzwi.
 * @returns {number} 0–1 szansa zainteresowania
 */
export function aiIncomingInterestChance(buyer, player, seller, rng) {
  const form = getPlayerForm(player)
  const morale = getPlayerMorale(player)
  const target = classifyTransferTarget(player, buyer)
  const { ovr, age, pot, room, buyerAvg, prospect, strongProspect, veteran, veteranBargain } =
    target
  const avg = buyerAvg ?? 70
  const rank = [...(seller.players ?? [])]
    .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
    .findIndex((p) => String(p.id) === String(player.id))

  // Twarde odrzucenia: dołek formy / zupełnie słabi (z wyjątkiem mocnych talentów).
  if (form < 50) return 0
  if (ovr < 66 && !strongProspect) return 0
  if (ovr < 70 && form < 62 && !prospect) return 0
  if (ovr < avg - 5 && !prospect && !veteranBargain) return 0
  if (ovr < 68 && !prospect) return 0
  // Weterani bez poziomu — nie.
  if (veteran && ovr < 70) return 0
  if (age >= 37) return 0

  let chance = 0.1

  if (ovr >= avg + 3) chance += 0.28
  else if (ovr >= avg + 1) chance += 0.2
  else if (ovr >= avg - 1) chance += 0.14
  else if (ovr >= avg - 3) chance += 0.06
  else chance += 0.015

  if (form >= 82) chance += 0.14
  else if (form >= 72) chance += 0.07
  else if (form >= 62) chance += 0.02
  else chance -= 0.12

  // Młody z potencjałem — osobny tor zakupowy.
  if (strongProspect) chance += 0.34
  else if (prospect) {
    chance += 0.22
    if (room >= 6) chance += 0.08
    if (pot >= avg + 4) chance += 0.06
  }

  // Starsi: tańsi względem OVR, depth / krótkoterminowa jakość.
  if (veteranBargain) chance += 0.2
  else if (veteran && ovr >= avg - 1) chance += 0.12
  else if (veteran && ovr >= avg - 3) chance += 0.06

  // Niskie morale → zawodnik „chce odejść” / agent szuka wyjścia.
  if (morale < 42) chance += 0.26
  else if (morale < 50) chance += 0.16
  else if (morale < 58) chance += 0.07
  else if (morale >= 88 && rank <= 1 && !prospect) chance -= 0.08

  if (rank === 0) chance *= prospect ? 0.7 : 0.55
  else if (rank <= 2) chance *= prospect || veteranBargain ? 0.85 : 0.75

  const policy = getTransferPolicy(buyer)
  if (policy.id === 'buy') chance += 0.06
  if (policy.id === 'hardline') chance -= 0.04
  // Kluby „sell” chętniej biorą tanie weterany.
  if (policy.id === 'sell' && veteranBargain) chance += 0.05

  if (player.transferListed) chance *= TRANSFER_LIST_AI_INTEREST_MULT

  return Math.max(0, Math.min(0.88, chance + (rng() - 0.5) * 0.04))
}
