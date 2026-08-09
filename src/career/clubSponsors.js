/**
 * Sponsorzy klubu: slot główny + drugi, oferty z różnymi modelami wypłat.
 * Oferta 1 (upfront) sumarycznie < 2 (sezonowa) < 3 (miesięczna).
 */

import { createRng } from '../matchEngine/rng.js'
import { adjustTransferBudget, formatUsd, getTransferBudget } from './transfers/clubFinances.js'
import { getTeamReputation, ensureTeamReputation } from '../models/teamReputation.js'
import { standingsTable } from '../league/standings.js'

export const SPONSORS_GEN_VERSION = 1
export const SPONSOR_SLOTS = /** @type {const} */ (['main', 'secondary'])

/** @typedef {'main'|'secondary'} SponsorSlot */
/** @typedef {'upfront'|'seasonal'|'monthly'} SponsorPaymentModel */

const BRAND_POOL = [
  { pl: 'DiscCola', en: 'DiscCola' },
  { pl: 'TurboFrisbee Oil', en: 'TurboFrisbee Oil' },
  { pl: 'Bank Ostateczny', en: 'Ultimate Trust Bank' },
  { pl: 'HuckNet Telecom', en: 'HuckNet Telecom' },
  { pl: 'Layout Logistics', en: 'Layout Logistics' },
  { pl: 'Bidness Brokers', en: 'Bidness Brokers' },
  { pl: 'Zone Defense Insurance', en: 'Zone Defense Insurance' },
  { pl: 'Hammer Energy Drink', en: 'Hammer Energy Drink' },
  { pl: 'PullPower Tools', en: 'PullPower Tools' },
  { pl: 'SkyBid Real Estate', en: 'SkyBid Real Estate' },
  { pl: 'CatchCafe', en: 'CatchCafe' },
  { pl: 'FlickFleet Delivery', en: 'FlickFleet Delivery' },
  { pl: 'StallCount Watches', en: 'StallCount Watches' },
  { pl: 'Endzone Electronics', en: 'Endzone Electronics' },
  { pl: 'Cut & Run Apparel', en: 'Cut & Run Apparel' },
  { pl: 'Poach Motors', en: 'Poach Motors' },
  { pl: 'IO Soft Drinks', en: 'IO Soft Drinks' },
  { pl: 'Marking Mutual', en: 'Marking Mutual' },
]

const BONUS_TYPES = [
  { id: 'league_title', weight: 1 },
  { id: 'league_top4', weight: 3 },
  { id: 'cup_win', weight: 2 },
  { id: 'cup_final', weight: 2 },
  { id: 'win_streak_3', weight: 2 },
]

function hashString(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function roundMoney(n) {
  const v = Math.max(0, Math.round(n))
  if (v >= 100_000) return Math.round(v / 5_000) * 5_000
  if (v >= 20_000) return Math.round(v / 1_000) * 1_000
  return Math.round(v / 500) * 500
}

function pickWeighted(items, rng) {
  const total = items.reduce((s, it) => s + (it.weight ?? 1), 0)
  let roll = rng.float() * total
  for (const it of items) {
    roll -= it.weight ?? 1
    if (roll <= 0) return it
  }
  return items[items.length - 1]
}

function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Dochody cykliczne (sponsorzy + sklep kibica) były zbyt małe względem funduszu płac —
 * nawet skromny skład potrafi kosztować więcej rocznie niż oba sloty sponsorskie razem.
 * Ten mnożnik podnosi całą bazę sponsorską (i analogicznie merch w `clubFacilities.js`)
 * o ~50%, żeby zarządzanie klubem (reputacja, sponsorzy, sklep) miało realny wpływ na budżet.
 */
export const SPONSOR_INCOME_BOOST = 1.5

/**
 * Roczna baza zależna od reputacji i slotu.
 * Main ≈ 1.65× secondary.
 */
export function sponsorAnnualBase(reputation, slot = 'main') {
  const rep = Math.max(15, Math.min(99, Math.round(reputation ?? 55)))
  // Bez boosta: ~$28k przy rep 30, ~$95k przy 55, ~$180k przy 90 (main)
  const core = (18_000 + (rep - 25) * 2_400) * SPONSOR_INCOME_BOOST
  const mult = slot === 'main' ? 1 : 0.55
  return roundMoney(core * mult)
}

/**
 * Sumaryczne mnożniki kontraktu (1 < 2 < 3).
 * upfront 0.72 · seasonal 1.00 · monthly 1.28
 */
export function paymentModelTotalMult(model) {
  if (model === 'upfront') return 0.72
  if (model === 'monthly') return 1.28
  return 1
}

function emptySponsorsState() {
  return {
    sponsorsGen: SPONSORS_GEN_VERSION,
    main: null,
    secondary: null,
    offers: { main: [], secondary: [], generatedAt: null },
    lastMonthlyYm: null,
    lastSeasonStartYear: null,
    lastSeasonEndYear: null,
    eventLog: [],
  }
}

/**
 * @param {object} team
 * @param {{ seed?: number|string, force?: boolean, seasonYear?: number, autoSign?: boolean }} [options]
 */
export function seedTeamSponsors(team, options = {}) {
  if (!team) return team
  const force = !!options.force
  if (
    !force &&
    team.sponsors &&
    typeof team.sponsors === 'object' &&
    team.sponsors.sponsorsGen === SPONSORS_GEN_VERSION
  ) {
    return ensureTeamSponsors(team, options)
  }

  team.sponsors = emptySponsorsState()
  const rng = createRng(hashString(`sponsors|${options.seed ?? 0}|${team.id ?? 'club'}`))
  const seasonYear = options.seasonYear ?? 2025

  // AI / start świata: często mają już sponsorów (gracz też dostaje startowe, ale może renegocjować gdy wygasną).
  if (options.autoSign !== false) {
    for (const slot of SPONSOR_SLOTS) {
      if (rng.float() < (slot === 'main' ? 0.92 : 0.78)) {
        const offers = generateSponsorOffers(team, slot, {
          seed: `${options.seed}|${slot}|init`,
          seasonYear,
        })
        const pick = offers[1] ?? offers[0]
        if (pick) {
          signSponsorOffer(team, slot, pick.id, {
            seasonYear,
            quiet: true,
            offer: pick,
          })
        }
      }
    }
  }

  // Świeże oferty na puste sloty
  for (const slot of SPONSOR_SLOTS) {
    if (!team.sponsors[slot]) {
      refreshSponsorOffers(team, slot, { seed: options.seed, seasonYear })
    }
  }

  return team
}

export function ensureTeamSponsors(team, options = {}) {
  if (!team) return team
  if (!team.sponsors || typeof team.sponsors !== 'object' || team.sponsors.sponsorsGen !== SPONSORS_GEN_VERSION) {
    return seedTeamSponsors(team, { ...options, autoSign: options.autoSign ?? true })
  }
  if (!team.sponsors.offers || typeof team.sponsors.offers !== 'object') {
    team.sponsors.offers = { main: [], secondary: [], generatedAt: null }
  }
  for (const slot of SPONSOR_SLOTS) {
    if (team.sponsors[slot] != null && typeof team.sponsors[slot] !== 'object') {
      team.sponsors[slot] = null
    }
    if (!Array.isArray(team.sponsors.offers[slot])) {
      team.sponsors.offers[slot] = []
    }
  }
  team.sponsors.sponsorsGen = SPONSORS_GEN_VERSION
  return team
}

export function ensureWorldSponsors(world, options = {}) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  const seed = options.seed ?? world.templateSeasonYear ?? 2025
  const seasonYear = options.seasonYear ?? world.templateSeasonYear ?? 2025
  const playerTeamId = options.playerTeamId ?? null
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    const isPlayer = playerTeamId && id === playerTeamId
    ensureTeamSponsors(team, {
      seed,
      seasonYear,
      force: !!options.force,
      autoSign: isPlayer ? false : options.autoSign !== false,
    })
    if (isPlayer) {
      for (const slot of SPONSOR_SLOTS) {
        if (!team.sponsors[slot] && !(team.sponsors.offers?.[slot]?.length > 0)) {
          refreshSponsorOffers(team, slot, {
            seasonYear,
            seed: `${seed}|player|${slot}`,
          })
        }
      }
    }
  }
  return world
}

export function getSponsorContract(team, slot) {
  ensureTeamSponsors(team)
  return team?.sponsors?.[slot] ?? null
}

export function hasActiveSponsor(team, slot = null) {
  ensureTeamSponsors(team)
  if (slot) return !!team.sponsors?.[slot]
  return !!(team.sponsors?.main || team.sponsors?.secondary)
}

export function getActiveSponsors(team) {
  ensureTeamSponsors(team)
  return SPONSOR_SLOTS.map((slot) => team.sponsors[slot]).filter(Boolean)
}

function rollBonus(rng, annualBase) {
  if (rng.float() > 0.62) return null
  const kind = pickWeighted(BONUS_TYPES, rng)
  const amount = roundMoney(annualBase * (0.08 + rng.float() * 0.14))
  return { type: kind.id, amount }
}

/**
 * Generuje dokładnie 3 oferty: upfront < seasonal < monthly (sumarycznie).
 */
export function generateSponsorOffers(team, slot, options = {}) {
  ensureTeamReputation(team)
  const rep = getTeamReputation(team)
  const annual = sponsorAnnualBase(rep, slot)
  const seasonYear = options.seasonYear ?? 2025
  const rng = createRng(
    hashString(
      `offers|${options.seed ?? Date.now()}|${team.id}|${slot}|${seasonYear}|${rep}`,
    ),
  )

  const usedBrands = new Set()
  for (const s of getActiveSponsors(team)) {
    if (s?.brandId) usedBrands.add(s.brandId)
  }

  const models = /** @type {SponsorPaymentModel[]} */ (['upfront', 'seasonal', 'monthly'])
  const offers = []

  for (let i = 0; i < 3; i += 1) {
    const model = models[i]
    let brand = BRAND_POOL[Math.floor(rng.float() * BRAND_POOL.length)]
    let guard = 0
    while (usedBrands.has(`${brand.pl}`) && guard < 20) {
      brand = BRAND_POOL[Math.floor(rng.float() * BRAND_POOL.length)]
      guard += 1
    }
    usedBrands.add(brand.pl)

    const years = 1 + Math.floor(rng.float() * 4) // 1–4
    const totalMult = paymentModelTotalMult(model)
    const totalValue = roundMoney(annual * years * totalMult)
    const seasonalTiming =
      model === 'seasonal' ? (rng.float() < 0.45 ? 'start' : 'end') : null

    let signingPayout = 0
    let perSeason = 0
    let perMonth = 0

    if (model === 'upfront') {
      signingPayout = totalValue
    } else if (model === 'seasonal') {
      signingPayout = roundMoney(totalValue * 0.05)
      perSeason = roundMoney((totalValue - signingPayout) / years)
    } else {
      signingPayout = roundMoney(totalValue * 0.04)
      const months = years * 12
      perMonth = roundMoney((totalValue - signingPayout) / months)
    }

    const bonus = model === 'upfront' ? null : rollBonus(rng, annual)

    offers.push({
      id: newId('spoff'),
      slot,
      brandId: brand.pl,
      brandName: brand.pl,
      brandNameEn: brand.en,
      paymentModel: model,
      seasonalTiming,
      years,
      signedReputation: rep,
      annualBase: annual,
      totalContractValue: totalValue,
      signingPayout,
      perSeasonAmount: perSeason,
      perMonthAmount: perMonth,
      performanceBonus: bonus,
      offerIndex: i + 1,
      generatedSeasonYear: seasonYear,
    })
  }

  return offers
}

export function refreshSponsorOffers(team, slot, options = {}) {
  ensureTeamSponsors(team)
  if (team.sponsors[slot]) {
    team.sponsors.offers[slot] = []
    return []
  }
  const offers = generateSponsorOffers(team, slot, options)
  team.sponsors.offers[slot] = offers
  team.sponsors.offers.generatedAt = options.date ?? new Date().toISOString().slice(0, 10)
  return offers
}

export function getSponsorOffers(team, slot) {
  ensureTeamSponsors(team)
  return team.sponsors?.offers?.[slot] ?? []
}

/**
 * Podpisanie oferty. Slot musi być wolny.
 * @returns {{ ok: boolean, error?: string, contract?: object, paid?: number }}
 */
export function signSponsorOffer(team, slot, offerId, options = {}) {
  ensureTeamSponsors(team)
  if (!SPONSOR_SLOTS.includes(slot)) return { ok: false, error: 'bad_slot' }
  if (team.sponsors[slot]) return { ok: false, error: 'slot_taken' }

  let offer = (team.sponsors.offers?.[slot] ?? []).find((o) => o.id === offerId)
  if (!offer && options.offer) offer = options.offer
  // Init path: oferty mogą być lokalne
  if (!offer) {
    const fresh = generateSponsorOffers(team, slot, options)
    offer = fresh.find((o) => o.id === offerId) ?? fresh[0]
  }
  if (!offer) return { ok: false, error: 'offer_not_found' }

  const seasonYear = options.seasonYear ?? offer.generatedSeasonYear ?? 2025
  const contract = {
    id: newId('spcon'),
    slot,
    brandId: offer.brandId,
    brandName: offer.brandName,
    brandNameEn: offer.brandNameEn,
    paymentModel: offer.paymentModel,
    seasonalTiming: offer.seasonalTiming,
    years: offer.years,
    yearsRemaining: offer.years,
    signedReputation: offer.signedReputation,
    annualBase: offer.annualBase,
    totalContractValue: offer.totalContractValue,
    signingPayout: offer.signingPayout,
    perSeasonAmount: offer.perSeasonAmount,
    perMonthAmount: offer.perMonthAmount,
    performanceBonus: offer.performanceBonus,
    signedSeasonYear: seasonYear,
    expiresAfterSeasonYear: seasonYear + offer.years - 1,
    paidToDate: 0,
    bonusesPaid: {},
  }

  const paid = Math.max(0, Math.round(contract.signingPayout ?? 0))
  if (paid > 0) {
    adjustTransferBudget(team, paid)
    contract.paidToDate += paid
  }

  team.sponsors[slot] = contract
  team.sponsors.offers[slot] = []

  if (!options.quiet) {
    pushSponsorEvent(team, {
      kind: 'signed',
      slot,
      brandName: contract.brandName,
      paid,
      date: options.date ?? null,
    })
  }

  return { ok: true, contract, paid }
}

/**
 * Wypłata miesięczna (1. dzień miesiąca) — wszystkie kluby.
 * @returns {{ teamId: string, amount: number, brands: string[] }[]}
 */
export function processMonthlySponsorPayouts(world, dateIso) {
  if (!world?.teamsById || !dateIso) return []
  const ym = String(dateIso).slice(0, 7) // YYYY-MM
  const day = Number(String(dateIso).slice(8, 10))
  if (day !== 1) return []

  const results = []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    ensureTeamSponsors(team)
    if (team.sponsors.lastMonthlyYm === ym) continue

    let amount = 0
    const brands = []
    for (const slot of SPONSOR_SLOTS) {
      const c = team.sponsors[slot]
      if (!c || c.paymentModel !== 'monthly') continue
      const pay = Math.max(0, Math.round(c.perMonthAmount ?? 0))
      if (pay <= 0) continue
      adjustTransferBudget(team, pay)
      c.paidToDate = (c.paidToDate ?? 0) + pay
      amount += pay
      brands.push(c.brandName)
    }
    team.sponsors.lastMonthlyYm = ym
    if (amount > 0) {
      results.push({ teamId: id, amount, brands })
    }
  }
  return results
}

/** Wypłaty miesięczne dla każdego 1. dnia w zakresie dat (włącznie). */
export function processMonthlySponsorPayoutsForRange(world, startIso, endIso) {
  if (!world?.teamsById || !startIso || !endIso) return []
  const results = []
  const start = new Date(`${String(startIso).slice(0, 10)}T12:00:00`)
  const end = new Date(`${String(endIso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const cursor = new Date(start)
  while (cursor <= end) {
    if (cursor.getDate() === 1) {
      const iso = cursor.toISOString().slice(0, 10)
      results.push(...processMonthlySponsorPayouts(world, iso))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return results
}

/**
 * Wypłaty sezonowe na start sezonu (flat).
 */
export function processSeasonStartSponsorPayouts(world, seasonYear) {
  if (!world?.teamsById) return []
  const results = []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    ensureTeamSponsors(team)
    if (team.sponsors.lastSeasonStartYear === seasonYear) continue

    let amount = 0
    const brands = []
    for (const slot of SPONSOR_SLOTS) {
      const c = team.sponsors[slot]
      if (!c || c.paymentModel !== 'seasonal' || c.seasonalTiming !== 'start') continue
      if ((c.yearsRemaining ?? 0) <= 0) continue
      const pay = Math.max(0, Math.round(c.perSeasonAmount ?? 0))
      if (pay <= 0) continue
      adjustTransferBudget(team, pay)
      c.paidToDate = (c.paidToDate ?? 0) + pay
      amount += pay
      brands.push(c.brandName)
    }
    team.sponsors.lastSeasonStartYear = seasonYear
    if (amount > 0) results.push({ teamId: id, amount, brands })
  }
  return results
}

/**
 * Koniec sezonu: seasonal end + bonusy wynikowe + odliczenie roku kontraktu.
 * @returns {{ payouts: object[], expirations: object[] }}
 */
export function processSeasonEndSponsorPayouts(world, league, seasonYear) {
  if (!world?.teamsById) return { payouts: [], expirations: [] }
  const table = league?.standings ? standingsTable(league.standings) : []
  const placeByTeam = Object.fromEntries(table.map((row, i) => [row.teamId, i + 1]))
  const cupChampion = league?.cup?.championTeamId ?? null
  const cupFinalists = new Set(
    [league?.cup?.championTeamId, league?.cup?.runnerUpTeamId].filter(Boolean),
  )

  const payouts = []
  const expirations = []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    ensureTeamSponsors(team)
    if (team.sponsors.lastSeasonEndYear === seasonYear) continue

    let amount = 0
    const brands = []
    const place = placeByTeam[id] ?? 99

    for (const slot of SPONSOR_SLOTS) {
      const c = team.sponsors[slot]
      if (!c) continue

      if (c.paymentModel === 'seasonal' && c.seasonalTiming === 'end' && (c.yearsRemaining ?? 0) > 0) {
        const base = Math.max(0, Math.round(c.perSeasonAmount ?? 0))
        const placeMult = Math.max(0.7, Math.min(1.2, 1.18 - (place - 1) * 0.018))
        const pay = roundMoney(base * placeMult)
        if (pay > 0) {
          adjustTransferBudget(team, pay)
          c.paidToDate = (c.paidToDate ?? 0) + pay
          amount += pay
          brands.push(c.brandName)
        }
      }

      const bonus = c.performanceBonus
      if (bonus?.type && bonus.amount && !c.bonusesPaid?.[`${bonus.type}:${seasonYear}`]) {
        let hit = false
        if (bonus.type === 'league_title' && place === 1) hit = true
        if (bonus.type === 'league_top4' && place <= 4) hit = true
        if (bonus.type === 'cup_win' && cupChampion === id) hit = true
        if (bonus.type === 'cup_final' && cupFinalists.has(id)) hit = true
        if (bonus.type === 'win_streak_3') {
          const row = league?.standings?.[id]
          if (row && (row.wins ?? 0) >= 3 && place <= 10) hit = true
        }
        if (hit) {
          const pay = Math.max(0, Math.round(bonus.amount))
          adjustTransferBudget(team, pay)
          c.paidToDate = (c.paidToDate ?? 0) + pay
          if (!c.bonusesPaid) c.bonusesPaid = {}
          c.bonusesPaid[`${bonus.type}:${seasonYear}`] = pay
          amount += pay
          brands.push(`${c.brandName}*`)
        }
      }

      if (typeof c.yearsRemaining === 'number') {
        c.yearsRemaining = Math.max(0, c.yearsRemaining - 1)
      }

      const expired =
        (c.yearsRemaining ?? 0) <= 0 || (c.expiresAfterSeasonYear ?? 0) <= seasonYear
      if (expired) {
        const snapshot = { ...c }
        team.sponsors[slot] = null
        const offers = refreshSponsorOffers(team, slot, {
          seasonYear: seasonYear + 1,
          seed: `${id}|expire|${seasonYear}`,
        })
        pushSponsorEvent(team, {
          kind: 'expired',
          slot,
          brandName: snapshot.brandName,
          brandNameEn: snapshot.brandNameEn,
          seasonYear,
        })
        expirations.push({
          teamId: id,
          slot,
          contract: snapshot,
          offers,
        })
      } else if ((c.yearsRemaining ?? 0) === 1) {
        pushSponsorEvent(team, {
          kind: 'expiring_soon',
          slot,
          brandName: c.brandName,
          brandNameEn: c.brandNameEn,
          seasonYear,
          yearsRemaining: 1,
        })
      }
    }

    team.sponsors.lastSeasonEndYear = seasonYear
    if (amount > 0) payouts.push({ teamId: id, amount, brands })
  }
  return { payouts, expirations }
}

function pushSponsorEvent(team, entry) {
  if (!team.sponsors) return
  if (!Array.isArray(team.sponsors.eventLog)) team.sponsors.eventLog = []
  team.sponsors.eventLog.unshift({ ...entry, at: Date.now() })
  team.sponsors.eventLog = team.sponsors.eventLog.slice(0, 12)
}

export function sponsorSlotLabel(slot, lang = 'pl') {
  if (lang === 'en') return slot === 'main' ? 'Main sponsor' : 'Secondary sponsor'
  return slot === 'main' ? 'Sponsor główny' : 'Sponsor drugi'
}

export function paymentModelLabel(model, lang = 'pl') {
  if (lang === 'en') {
    if (model === 'upfront') return 'Full payout on signing'
    if (model === 'monthly') return 'Monthly payouts'
    return 'Per-season payouts'
  }
  if (model === 'upfront') return 'Wypłata przy podpisaniu'
  if (model === 'monthly') return 'Wypłaty co miesiąc'
  return 'Wypłaty co sezon'
}

export function seasonalTimingLabel(timing, lang = 'pl') {
  if (!timing) return ''
  if (lang === 'en') {
    return timing === 'start' ? 'Paid at season start (flat)' : 'Paid at season end (form-based)'
  }
  return timing === 'start'
    ? 'Na początku sezonu (stała kwota)'
    : 'Na końcu sezonu (zależnie od wyniku)'
}

export function performanceBonusLabel(bonus, lang = 'pl') {
  if (!bonus?.type) return ''
  const amount = formatUsd(bonus.amount ?? 0)
  const mapPl = {
    league_title: `Bonus za mistrzostwo ligi (${amount})`,
    league_top4: `Bonus za top 4 ligi (${amount})`,
    cup_win: `Bonus za wygranie pucharu (${amount})`,
    cup_final: `Bonus za finał pucharu (${amount})`,
    win_streak_3: `Bonus za solidny sezon (min. 3 wygrane, top 10) (${amount})`,
  }
  const mapEn = {
    league_title: `League title bonus (${amount})`,
    league_top4: `League top-4 bonus (${amount})`,
    cup_win: `Cup win bonus (${amount})`,
    cup_final: `Cup final bonus (${amount})`,
    win_streak_3: `Solid season bonus (3+ wins, top 10) (${amount})`,
  }
  return lang === 'en' ? mapEn[bonus.type] ?? bonus.type : mapPl[bonus.type] ?? bonus.type
}

export function brandDisplayName(contractOrOffer, lang = 'pl') {
  if (!contractOrOffer) return '—'
  if (lang === 'en') return contractOrOffer.brandNameEn ?? contractOrOffer.brandName ?? '—'
  return contractOrOffer.brandName ?? contractOrOffer.brandNameEn ?? '—'
}

export function describeSponsorOfferTotals(offer, lang = 'pl') {
  if (!offer) return ''
  const total = formatUsd(offer.totalContractValue)
  const years = offer.years
  if (lang === 'en') {
    if (offer.paymentModel === 'upfront') {
      return `${total} on signing · ${years}y deal (lowest total)`
    }
    if (offer.paymentModel === 'monthly') {
      return `${formatUsd(offer.perMonthAmount)}/mo · ~${total} over ${years}y (highest total)`
    }
    return `${formatUsd(offer.perSeasonAmount)}/season · ~${total} over ${years}y`
  }
  if (offer.paymentModel === 'upfront') {
    return `${total} przy podpisaniu · umowa ${years} lat (najniższa suma)`
  }
  if (offer.paymentModel === 'monthly') {
    return `${formatUsd(offer.perMonthAmount)}/mies. · ~${total} przez ${years} lat (najwyższa suma)`
  }
  return `${formatUsd(offer.perSeasonAmount)}/sezon · ~${total} przez ${years} lat`
}

/**
 * Inbox helpers — wiadomości o wypłatach / wygaśnięciach / ofertach dla drużyny gracza.
 */
export function messagesFromSponsorPayouts(payouts, career, { kind = 'monthly', date = null } = {}) {
  const list = Array.isArray(payouts) ? payouts : payouts?.payouts ?? []
  if (!list?.length || !career?.playerTeamId) return []
  const mine = list.find((p) => p.teamId === career.playerTeamId)
  if (!mine || mine.amount <= 0) return []

  const brands = (mine.brands ?? []).join(', ')
  const titlePl =
    kind === 'monthly'
      ? 'Wypłata sponsorska (miesiąc)'
      : kind === 'season_start'
        ? 'Wypłata sponsorska (start sezonu)'
        : 'Wypłata sponsorska (koniec sezonu)'
  const titleEn =
    kind === 'monthly'
      ? 'Sponsor payout (monthly)'
      : kind === 'season_start'
        ? 'Sponsor payout (season start)'
        : 'Sponsor payout (season end)'

  return [
    {
      id: newId('msg-sp'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: career.seasonYear ?? null,
      read: false,
      title: titlePl,
      titleEn,
      body: `Na konto klubu wpłynęło ${formatUsd(mine.amount)} od: ${brands || 'sponsorzy'}.`,
      bodyEn: `${formatUsd(mine.amount)} hit the club account from: ${brands || 'sponsors'}.`,
      payload: {
        kind: 'sponsor_payout',
        amount: mine.amount,
        brands: mine.brands,
        payoutKind: kind,
      },
    },
  ]
}

export function messagesFromSponsorExpirations(expirations, career, options = {}) {
  if (!expirations?.length || !career?.playerTeamId) return []
  const date = options.date ?? career.league?.currentDate ?? null
  const seasonYear = options.seasonYear ?? career.seasonYear ?? null
  const msgs = []

  for (const ex of expirations) {
    if (ex.teamId !== career.playerTeamId) continue
    const brand = brandDisplayName(ex.contract, 'pl')
    const brandEn = brandDisplayName(ex.contract, 'en')
    const slotPl = sponsorSlotLabel(ex.slot, 'pl')
    const slotEn = sponsorSlotLabel(ex.slot, 'en')
    msgs.push({
      id: newId('msg-spexp'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear,
      read: false,
      title: `Koniec umowy · ${brand}`,
      titleEn: `Deal ended · ${brandEn}`,
      body: `Umowa ze sponsorem ${brand} (${slotPl}) dobiegła końca. Slot jest wolny — w skrzynce czekają nowe oferty.`,
      bodyEn: `The deal with ${brandEn} (${slotEn}) has ended. The slot is open — new offers are waiting in your inbox.`,
      payload: {
        kind: 'sponsor_expired',
        slot: ex.slot,
        brandName: ex.contract?.brandName,
        brandNameEn: ex.contract?.brandNameEn,
        years: ex.contract?.years,
        paidToDate: ex.contract?.paidToDate ?? 0,
      },
    })
  }
  return msgs
}

/**
 * Oferty na wolne sloty — jedna wiadomość na slot (do podpisania ze skrzynki).
 */
export function messagesFromOpenSponsorOffers(career, { date = null, forceSlots = null } = {}) {
  if (!career?.world || !career?.playerTeamId) return []
  const team = career.world.teamsById?.[career.playerTeamId]
  if (!team) return []
  ensureTeamSponsors(team, { seasonYear: career.seasonYear, autoSign: false })

  const slots = forceSlots?.length ? forceSlots : SPONSOR_SLOTS
  const msgs = []
  for (const slot of slots) {
    if (team.sponsors[slot]) continue
    let offers = getSponsorOffers(team, slot)
    if (!offers.length) {
      offers = refreshSponsorOffers(team, slot, {
        seasonYear: career.seasonYear,
        seed: `${team.id}|inbox|${slot}|${career.seasonYear}|${date ?? ''}`,
        date,
      })
    }
    if (!offers.length) continue

    const slotPl = sponsorSlotLabel(slot, 'pl')
    const slotEn = sponsorSlotLabel(slot, 'en')
    msgs.push({
      id: newId('msg-spoff'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: career.seasonYear ?? null,
      read: false,
      title: `Oferty sponsorskie · ${slotPl}`,
      titleEn: `Sponsor offers · ${slotEn}`,
      body: `Masz 3 oferty na slot „${slotPl}”. Oferta 1 = całość przy podpisaniu (najmniej łącznie), 2 = co sezon, 3 = co miesiąc (najwięcej łącznie). Wybierz jedną lub zajrzyj do Zarządu.`,
      bodyEn: `You have 3 offers for the “${slotEn}” slot. Offer 1 = full payout on signing (lowest total), 2 = per season, 3 = monthly (highest total). Pick one or open Club board.`,
      payload: {
        kind: 'sponsor_offers',
        status: 'pending',
        slot,
        offers: structuredClone(offers),
      },
    })
  }
  return msgs
}

/**
 * Ostrzeżenie: umowa wchodzi w ostatni rok.
 */
export function messagesFromSponsorExpiringSoon(career, { date = null, seasonYear = null } = {}) {
  if (!career?.world || !career?.playerTeamId) return []
  const team = career.world.teamsById?.[career.playerTeamId]
  if (!team?.sponsors) return []
  const year = seasonYear ?? career.seasonYear
  const log = team.sponsors.eventLog ?? []
  const msgs = []
  for (const entry of log) {
    if (entry.kind !== 'expiring_soon' || entry.seasonYear !== year) continue
    if (entry._notified) continue
    entry._notified = true
    const brand = entry.brandName ?? 'Sponsor'
    const brandEn = entry.brandNameEn ?? brand
    msgs.push({
      id: newId('msg-spsoon'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: year,
      read: false,
      title: `Ostatni rok umowy · ${brand}`,
      titleEn: `Final year of deal · ${brandEn}`,
      body: `Umowa z ${brand} (${sponsorSlotLabel(entry.slot, 'pl')}) wchodzi w ostatni sezon. Po jego zakończeniu slot się zwolni.`,
      bodyEn: `The deal with ${brandEn} (${sponsorSlotLabel(entry.slot, 'en')}) enters its final season. After it ends the slot will open.`,
      payload: {
        kind: 'sponsor_expiring_soon',
        slot: entry.slot,
        brandName: brand,
        brandNameEn: brandEn,
      },
    })
  }
  return msgs
}

/**
 * Podpisanie oferty ze skrzynki.
 * @returns {{ ok: boolean, error?: string, world?: object, inbox?: object[], paid?: number, contract?: object }}
 */
export function signSponsorOfferFromInbox(career, messageId, offerId) {
  if (!career?.world || !messageId || !offerId) {
    return { ok: false, error: 'missing_data' }
  }
  const inbox = Array.isArray(career.inbox) ? [...career.inbox] : []
  const idx = inbox.findIndex((m) => m.id === messageId)
  if (idx < 0) return { ok: false, error: 'message_not_found' }
  const message = inbox[idx]
  const p = message.payload ?? {}
  if (message.type !== 'club_news' || p.kind !== 'sponsor_offers') {
    return { ok: false, error: 'not_sponsor_offer' }
  }
  if (p.status === 'signed' || p.status === 'superseded') {
    return { ok: false, error: 'already_resolved' }
  }

  const world = structuredClone(career.world)
  const team = world.teamsById?.[career.playerTeamId]
  if (!team) return { ok: false, error: 'no_team' }

  const offer =
    (p.offers ?? []).find((o) => o.id === offerId) ??
    getSponsorOffers(team, p.slot).find((o) => o.id === offerId)

  const result = signSponsorOffer(team, p.slot, offerId, {
    seasonYear: career.seasonYear,
    offer,
    date: career.league?.currentDate ?? null,
  })
  if (!result.ok) return { ok: false, error: result.error ?? 'sign_failed' }

  const brand = brandDisplayName(result.contract, 'pl')
  const brandEn = brandDisplayName(result.contract, 'en')
  const paidTxt = result.paid > 0 ? ` Na konto: ${formatUsd(result.paid)}.` : ''
  const paidTxtEn = result.paid > 0 ? ` Credited: ${formatUsd(result.paid)}.` : ''

  inbox[idx] = {
    ...message,
    read: true,
    body: `Podpisano umowę z ${brand}.${paidTxt}`,
    bodyEn: `Signed a deal with ${brandEn}.${paidTxtEn}`,
    payload: {
      ...p,
      status: 'signed',
      signedOfferId: offerId,
      contractId: result.contract?.id,
      paid: result.paid,
      brandName: result.contract?.brandName,
      brandNameEn: result.contract?.brandNameEn,
    },
  }

  // Inne pending oferty na ten sam slot → superseded
  for (let i = 0; i < inbox.length; i += 1) {
    if (i === idx) continue
    const m = inbox[i]
    const mp = m.payload ?? {}
    if (
      m.type === 'club_news' &&
      mp.kind === 'sponsor_offers' &&
      mp.slot === p.slot &&
      mp.status === 'pending'
    ) {
      inbox[i] = {
        ...m,
        read: true,
        body: `${m.body}\n\nSlot zajęty inną umową.`,
        bodyEn: `${m.bodyEn ?? m.body}\n\nSlot filled by another deal.`,
        payload: { ...mp, status: 'superseded' },
      }
    }
  }

  return {
    ok: true,
    world,
    inbox,
    paid: result.paid,
    contract: result.contract,
  }
}

/**
 * Oznacza pending oferty w skrzynce jako superseded po podpisaniu poza inboxem.
 */
export function supersedeSponsorOfferMessages(inbox, slot) {
  if (!Array.isArray(inbox) || !slot) return inbox
  let changed = false
  const next = inbox.map((m) => {
    const p = m.payload ?? {}
    if (
      m.type !== 'club_news' ||
      p.kind !== 'sponsor_offers' ||
      p.slot !== slot ||
      p.status !== 'pending'
    ) {
      return m
    }
    changed = true
    return {
      ...m,
      read: true,
      body: `${m.body}\n\nSlot zajęty inną umową.`,
      bodyEn: `${m.bodyEn ?? m.body}\n\nSlot filled by another deal.`,
      payload: { ...p, status: 'superseded' },
    }
  })
  return changed ? next : inbox
}

export function messageFromFanShopSale(career, { amount, date = null, home = true, won = false } = {}) {
  if (!career || !amount) return null
  return {
    id: newId('msg-merch'),
    type: 'club_news',
    createdAt: new Date().toISOString(),
    date: date ?? career.league?.currentDate ?? null,
    seasonIndex: career.seasonIndex ?? null,
    seasonYear: career.seasonYear ?? null,
    read: false,
    title: 'Sklep kibica · sprzedaż pomeczowa',
    titleEn: 'Fan shop · post-match sales',
    body: `Merch przyniósł ${formatUsd(amount)}${home ? ' (u siebie)' : ' (wyjazd)'}${won ? ' po wygranej' : ''}.`,
    bodyEn: `Merch brought in ${formatUsd(amount)}${home ? ' (home)' : ' (away)'}${won ? ' after a win' : ''}.`,
    payload: { kind: 'fan_shop', amount, home, won },
  }
}

/** Debug / UI: aktualny budżet po operacjach. */
export function teamBudgetAfter(team) {
  return getTransferBudget(team)
}
