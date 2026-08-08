/**
 * Negocjacje kontraktowe z zawodnikiem (po zgodzie klubu na transfer).
 *
 * Na chęć przenosin i wymagania finansowe wpływają:
 * - miejsce w lidze obecnego zespołu
 * - morale zawodnika
 * - obecna pensja
 * - forma / miejsce zespołu kupującego
 * - reputacja obu zespołów
 */

import { createRng } from '../../matchEngine/rng.js'
import { getOverallRating } from '../../models/playerStats.js'
import { getPlayerMorale, ensurePlayerMorale } from '../../models/playerMorale.js'
import { ensurePlayerTraits, getTraitMods } from '../../models/playerTraits.js'
import {
  ensureTeamReputation,
  getTeamReputation,
  REPUTATION_DEFAULT,
} from '../../models/teamReputation.js'
import { standingsTable } from '../../league/standings.js'
import { formatUsd } from './playerValue.js'
import {
  contractTotalCost,
  ensurePlayerContract,
  getContractRemainingCost,
  promiseWageRelief,
  bonusWageEquivalent,
  roundWage,
  rollContractYears,
  weeklyWageFromOvr,
  WEEKS_PER_CONTRACT_YEAR,
} from './playerContracts.js'

function mixSeed(seed) {
  let x = Number(seed) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}

/**
 * Pozycja w tabeli (1 = lider). Null gdy brak danych.
 * @param {object|null} league
 * @param {string} teamId
 */
export function leaguePlace(league, teamId) {
  if (!league?.standings || !teamId) return null
  const table = standingsTable(league.standings, (id) => id)
  if (!table.length) return null
  const idx = table.findIndex((r) => r.teamId === teamId)
  return idx < 0 ? null : idx + 1
}

/** 0 = dół tabeli, 1 = lider (dla N drużyn). */
function placeScore(place, teamCount) {
  if (place == null || !teamCount) return 0.5
  return 1 - (place - 1) / Math.max(1, teamCount - 1)
}

/**
 * Profil oczekiwań zawodnika wobec nowego kontraktu.
 *
 * @returns {{
 *   willingness: number,
 *   minWeeklyWage: number,
 *   preferredYears: number,
 *   minYears: number,
 *   maxYears: number,
 *   currentWeeklyWage: number,
 *   factors: object,
 *   summaryPl: string,
 *   summaryEn: string,
 * }}
 */
export function computePlayerContractDemands({
  player,
  sellerTeam,
  buyerTeam,
  league = null,
  renew = false,
}) {
  ensurePlayerContract(player)
  ensurePlayerMorale(player)
  ensurePlayerTraits(player)
  if (sellerTeam) ensureTeamReputation(sellerTeam)
  if (buyerTeam) ensureTeamReputation(buyerTeam)

  const traitMods = getTraitMods(player)
  const ovr = getOverallRating(player?.skills)
  const pot = Number.isFinite(player?.potential) ? player.potential : ovr
  const morale = getPlayerMorale(player)
  const currentWage = roundWage(player.contract?.weeklyWage ?? weeklyWageFromOvr(ovr))
  const sellerRep = getTeamReputation(sellerTeam)
  const buyerRep = getTeamReputation(buyerTeam)
  const teamCount =
    league?.teamIds?.length ||
    Object.keys(league?.standings ?? {}).length ||
    16
  const sellerPlace = leaguePlace(league, sellerTeam?.id)
  const buyerPlace = leaguePlace(league, buyerTeam?.id)
  const sellerForm = placeScore(sellerPlace, teamCount)
  const buyerForm = placeScore(buyerPlace, teamCount)

  // Chęć odejścia: słabe morale / słaba forma klubu / lepsza reputacja kupującego.
  let willingness = 0.42
  willingness += ((50 - morale) / 100) * 0.55 // morale 30 → +0.11, 70 → -0.11
  willingness += (0.55 - sellerForm) * 0.35 // dół tabeli → chętniej odchodzi
  willingness += (buyerForm - 0.45) * 0.28
  willingness += ((buyerRep - sellerRep) / 100) * 0.4
  willingness += ((buyerRep - REPUTATION_DEFAULT) / 100) * 0.12
  willingness += traitMods.transferWillingnessDelta ?? 0
  if (renew) {
    // Przedłużenie: niska chęć odejścia — chce zostać przy uczciwej podwyżce.
    willingness = Math.min(willingness, 0.28)
    willingness *= 0.55
  }
  willingness = Math.max(0.08, Math.min(0.95, willingness))

  // Bazowa pensja: obecna + premia za OVR / chęć (niska chęć → wyższe żądania).
  let demandMult = renew ? 1.08 : 1.05
  demandMult += (1 - willingness) * (renew ? 0.18 : 0.35)
  demandMult += ((buyerRep - REPUTATION_DEFAULT) / 100) * -0.08
  demandMult += (buyerForm - sellerForm) * -0.06
  if (morale >= 75 && sellerForm >= 0.7) demandMult += renew ? 0.06 : 0.12
  if (morale < 40) demandMult -= 0.08
  if (pot - ovr >= 6 && (traitMods.promiseDevelopmentBias ?? 0) > 0.2) {
    demandMult *= 0.97
  }
  if (pot - ovr >= 6 && (traitMods.benchMoraleSensitivity ?? 1) > 1.2) {
    demandMult *= 1.06
  }
  demandMult *= traitMods.wageDemandMult ?? 1

  const preferredYears = Math.max(
    1,
    Math.min(5, player.contract?.years ?? rollContractYears(player, createRng(null))),
  )
  let yearBias = preferredYears + (traitMods.preferredYearsDelta ?? 0)
  if (willingness < 0.35) yearBias = Math.min(yearBias, 2)
  else if (willingness > 0.7) yearBias = Math.max(yearBias, 3)
  if (renew) yearBias = Math.max(yearBias, 2)
  yearBias = Math.max(1, Math.min(5, Math.round(yearBias)))

  const minWeeklyWage = roundWage(
    Math.max(
      renew ? currentWage * 1.02 : currentWage * 0.92,
      weeklyWageFromOvr(ovr) * 0.85,
    ) * demandMult,
  )

  const preferredPromises = []
  if ((traitMods.promisePlayingTimeBias ?? 0) > 0.15) {
    preferredPromises.push({ type: 'playing_time' })
  }
  if ((traitMods.promisePlayingTimeBias ?? 0) > 0.35) {
    preferredPromises.push({ type: 'no_bench' })
  }
  if ((traitMods.promiseDevelopmentBias ?? 0) > 0.2) {
    preferredPromises.push({ type: 'development' })
  }

  const factors = {
    morale,
    currentWage,
    sellerRep,
    buyerRep,
    sellerPlace,
    buyerPlace,
    sellerForm: Math.round(sellerForm * 100),
    buyerForm: Math.round(buyerForm * 100),
    willingness: Math.round(willingness * 100),
    renew: !!renew,
  }

  const placeNote = (place, name) =>
    place != null ? `${name} · ${place}. miejsce` : `${name}`

  const summaryPl = renew
    ? [
        `Przedłużenie kontraktu`,
        `Morale ${morale}`,
        `Obecna pensja ${formatUsd(currentWage)}/tydz.`,
        `Oczekiwania od ${formatUsd(minWeeklyWage)}/tydz.`,
      ].join(' · ')
    : [
        `Chęć przenosin: ${Math.round(willingness * 100)}%`,
        `Morale ${morale}`,
        placeNote(sellerPlace, sellerTeam?.name ?? 'Obecny klub'),
        placeNote(buyerPlace, buyerTeam?.name ?? 'Kupujący'),
        `Rep. ${Math.round(sellerRep)} → ${Math.round(buyerRep)}`,
        `Obecna pensja ${formatUsd(currentWage)}/tydz.`,
      ].join(' · ')

  const summaryEn = renew
    ? [
        `Contract extension`,
        `Morale ${morale}`,
        `Current wage ${formatUsd(currentWage)}/wk`,
        `Wants from ${formatUsd(minWeeklyWage)}/wk`,
      ].join(' · ')
    : [
        `Move willingness: ${Math.round(willingness * 100)}%`,
        `Morale ${morale}`,
        sellerPlace != null
          ? `${sellerTeam?.name ?? 'Current'} · ${sellerPlace}th`
          : sellerTeam?.name ?? 'Current club',
        buyerPlace != null
          ? `${buyerTeam?.name ?? 'Buyer'} · ${buyerPlace}th`
          : buyerTeam?.name ?? 'Buyer',
        `Rep. ${Math.round(sellerRep)} → ${Math.round(buyerRep)}`,
        `Current wage ${formatUsd(currentWage)}/wk`,
      ].join(' · ')

  return {
    willingness,
    minWeeklyWage,
    preferredYears: yearBias,
    minYears: 1,
    maxYears: 5,
    currentWeeklyWage: currentWage,
    preferredPromises,
    factors,
    summaryPl,
    summaryEn,
  }
}

/**
 * Ocena oferty kontraktowej gracza wobec zawodnika.
 *
 * @param {object} params
 * @returns {{
 *   status: 'accepted'|'rejected'|'counter',
 *   message: string,
 *   demands: object,
 *   offerWeeklyWage: number,
 *   offerYears: number,
 *   totalCost: number,
 *   weeklyWage: number,
 *   counterWeeklyWage?: number,
 *   counterYears?: number,
 *   chance: number,
 * }}
 */
export function evaluatePlayerContractOffer({
  player,
  sellerTeam,
  buyerTeam,
  league = null,
  weeklyWage,
  years,
  bonuses = [],
  promises = [],
  seed = null,
  renew = false,
}) {
  const demands = computePlayerContractDemands({
    player,
    sellerTeam,
    buyerTeam,
    league,
    renew,
  })

  const offerWage = roundWage(weeklyWage)
  const offerYears = Math.max(1, Math.min(5, Math.round(Number(years) || 1)))
  const weeks = offerYears * WEEKS_PER_CONTRACT_YEAR
  const relief = promiseWageRelief(promises)
  const bonusEq = bonusWageEquivalent(bonuses, weeks)
  const effectiveDemand = roundWage(demands.minWeeklyWage * (1 - relief) - bonusEq)

  const name = player
    ? `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Zawodnik'
    : 'Zawodnik'

  const rng =
    seed == null
      ? createRng(null)
      : createRng(
          mixSeed(
            seed ^
              (Number(player?.id) || 0) ^
              Math.floor(offerWage) ^
              offerYears,
          ),
        )

  // Szansa: stosunek oferty do wymagań × chęć przenosin.
  const ratio = effectiveDemand > 0 ? offerWage / effectiveDemand : 1
  let chance = 0
  if (ratio < 0.75) chance = 0.04 * (ratio / 0.75)
  else if (ratio < 0.9) chance = 0.12 + (ratio - 0.75) * 1.5
  else if (ratio < 1.0) chance = 0.35 + (ratio - 0.9) * 2.5
  else if (ratio < 1.15) chance = 0.6 + (ratio - 1.0) * 1.5
  else chance = 0.82 + Math.min(0.12, (ratio - 1.15) * 0.25)

  chance *= 0.55 + demands.willingness * 0.55

  // Długość kontraktu bliska preferowanej.
  const yearDiff = Math.abs(offerYears - demands.preferredYears)
  if (yearDiff === 0) chance += 0.06
  else if (yearDiff === 1) chance += 0.02
  else chance -= 0.06 * yearDiff

  const offeredPromiseTypes = new Set((promises ?? []).map((p) => p.type ?? p.id))
  for (const pref of demands.preferredPromises ?? []) {
    const t = pref.type ?? pref.id
    if (t && offeredPromiseTypes.has(t)) chance += 0.04
  }

  chance = Math.max(0.02, Math.min(0.94, chance))

  const totalCost = contractTotalCost(offerWage, weeks)
  const roll = rng.float()

  if (offerWage <= 0) {
    return {
      status: 'rejected',
      message: `${name} odrzuca pustą ofertę kontraktową.`,
      messageEn: `${name} rejects an empty contract offer.`,
      demands,
      offerWeeklyWage: offerWage,
      offerYears,
      totalCost: 0,
      weeklyWage: offerWage,
      chance,
    }
  }

  if (roll < chance) {
    return {
      status: 'accepted',
      message: `${name} akceptuje kontrakt: ${formatUsd(offerWage)}/tydz. × ${offerYears} lat (łącznie ${formatUsd(totalCost)}).`,
      messageEn: `${name} accepts the contract: ${formatUsd(offerWage)}/wk × ${offerYears} yrs (total ${formatUsd(totalCost)}).`,
      demands,
      offerWeeklyWage: offerWage,
      offerYears,
      totalCost,
      weeklyWage: offerWage,
      years: offerYears,
      bonuses,
      promises,
      chance,
      contractTerms: {
        weeklyWage: offerWage,
        years: offerYears,
        bonuses,
        promises,
      },
    }
  }

  // Blisko → kontrpropozycja.
  if (ratio >= 0.82 && ratio < 1.2) {
    const counterWage = roundWage(
      Math.max(effectiveDemand, offerWage) * (1.02 + rng.float() * 0.08),
    )
    const counterYears =
      yearDiff > 1
        ? demands.preferredYears
        : offerYears
    const counterTotal = contractTotalCost(
      counterWage,
      counterYears * WEEKS_PER_CONTRACT_YEAR,
    )
    return {
      status: 'counter',
      message: `${name} odrzuca ${formatUsd(offerWage)}/tydz., ale chce ${formatUsd(counterWage)}/tydz. na ${counterYears} lat (łącznie ${formatUsd(counterTotal)}).`,
      messageEn: `${name} rejects ${formatUsd(offerWage)}/wk, but wants ${formatUsd(counterWage)}/wk for ${counterYears} yrs (total ${formatUsd(counterTotal)}).`,
      demands,
      offerWeeklyWage: offerWage,
      offerYears,
      totalCost,
      weeklyWage: offerWage,
      counterWeeklyWage: counterWage,
      counterYears,
      chance,
    }
  }

  const tip =
    demands.willingness < 0.35
      ? ' Zawodnik nie jest przekonany do przenosin — podnieś pensję, dodaj obietnice lub bonusy.'
      : ratio < 0.9
        ? ' Oferta poniżej oczekiwań finansowych.'
        : ''
  const tipEn =
    demands.willingness < 0.35
      ? ' The player is not convinced about moving — raise the wage, add promises or bonuses.'
      : ratio < 0.9
        ? ' Offer below financial expectations.'
        : ''

  return {
    status: 'rejected',
    message: `${name} odrzuca warunki kontraktu (${formatUsd(offerWage)}/tydz., ${offerYears} lat).${tip}`,
    messageEn: `${name} rejects the contract terms (${formatUsd(offerWage)}/wk, ${offerYears} yrs).${tipEn}`,
    demands,
    offerWeeklyWage: offerWage,
    offerYears,
    totalCost,
    weeklyWage: offerWage,
    chance,
  }
}

/**
 * AI kupujący automatycznie składa „wystarczająco dobrą” ofertę kontraktową.
 */
export function aiAutoPlayerContractTerms({
  player,
  sellerTeam,
  buyerTeam,
  league = null,
  rng = null,
  renew = false,
}) {
  const r = rng ?? createRng(null)
  const demands = computePlayerContractDemands({
    player,
    sellerTeam,
    buyerTeam,
    league,
    renew,
  })

  // Niska chęć → AI czasem odpada (przy renew prawie zawsze zostaje).
  if (!renew && demands.willingness < 0.22 && r.float() > 0.35) {
    return { ok: false, demands }
  }

  const bump = 1.0 + (1 - demands.willingness) * 0.12 + r.float() * 0.08
  const weeklyWage = roundWage(demands.minWeeklyWage * bump)
  const years = demands.preferredYears
  let promises = [...(demands.preferredPromises ?? [])]
  if (!promises.length && demands.willingness < 0.5 && r.float() < 0.55) {
    promises = [{ type: 'playing_time' }]
  }
  // Unikalne typy
  const seen = new Set()
  promises = promises.filter((p) => {
    const t = p.type ?? p.id
    if (!t || seen.has(t)) return false
    seen.add(t)
    return true
  })

  return {
    ok: true,
    demands,
    terms: {
      weeklyWage,
      years,
      bonuses: [],
      promises,
    },
  }
}

/** Podgląd kosztów oferty dla UI. */
export function previewContractOffer(weeklyWage, years) {
  const y = Math.max(1, Math.min(5, Math.round(Number(years) || 1)))
  const w = roundWage(weeklyWage)
  const weeks = y * WEEKS_PER_CONTRACT_YEAR
  return {
    weeklyWage: w,
    years: y,
    weeks,
    totalCost: contractTotalCost(w, weeks),
  }
}

export function remainingCostOfPlayer(player) {
  ensurePlayerContract(player)
  return getContractRemainingCost(player.contract)
}
