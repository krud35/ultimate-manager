/**
 * Budżety transferowe i polityka transferowa klubów.
 * Skala budżetów wzorowana na polskiej Ekstraklasie (USD).
 */

import { createRng } from '../../matchEngine/rng.js'
import { formatUsd } from './moneyFormat.js'
import { adjustTeamReputation } from '../../models/teamReputation.js'
import { ensureTeamFans, adjustFanMood } from '../../models/teamFans.js'

/** Re-eksport formatowania — bezpieczny import razem z budżetami (`formatUsd` z clubFinances). */
export { formatUsd, formatUsdCompact } from './moneyFormat.js'

/**
 * Polityka transferowa = modyfikator trudności negocjacji.
 * Wyższe `negotiationDifficulty` → klub mniej chętny do sprzedaży i wyższa cena.
 *
 * @typedef {object} TransferPolicy
 * @property {string} id
 * @property {string} labelPl
 * @property {string} blurb
 * @property {number} negotiationDifficulty — 0.7–2.0 (1.0 = baseline)
 * @property {number} askPriceMultiplier — mnożnik ceny wywoławczej
 */

/** @type {TransferPolicy[]} */
export const TRANSFER_POLICY_PRESETS = [
  {
    id: 'sell',
    labelPl: 'Sprzedażowa',
    labelEn: 'Sell-oriented',
    blurb: 'Chętniej schodzi z gwiazd przy dobrej ofercie.',
    blurbEn: 'More willing to sell stars for a strong offer.',
    negotiationDifficulty: 0.72,
    askPriceMultiplier: 0.95,
  },
  {
    id: 'balanced',
    labelPl: 'Zbalansowana',
    labelEn: 'Balanced',
    blurb: 'Standardowe negocjacje — cena i chęć sprzedaży w normie.',
    blurbEn: 'Standard negotiations — fair price and willingness to sell.',
    negotiationDifficulty: 1.0,
    askPriceMultiplier: 1.12,
  },
  {
    id: 'retain',
    labelPl: 'Retencyjna',
    labelEn: 'Retention',
    blurb: 'Trzyma kluczowych zawodników; negocjacje trudniejsze.',
    blurbEn: 'Keeps key players; tougher negotiations.',
    negotiationDifficulty: 1.4,
    askPriceMultiplier: 1.32,
  },
  {
    id: 'hardline',
    labelPl: 'Twarda',
    labelEn: 'Hardline',
    blurb: 'Rzadko sprzedaje liderów; wymaga bardzo wysokich ofert.',
    blurbEn: 'Rarely sells leaders; demands very high offers.',
    negotiationDifficulty: 1.85,
    askPriceMultiplier: 1.55,
  },
]

/**
 * Tier budżetowy na wzór Ekstraklasy (budżet transferowy sezonu, USD).
 * S ≈ Legia/Lech, A ≈ Raków/Pogoń, B ≈ środek tabeli, C ≈ doły.
 */
const BUDGET_TIERS = [
  { id: 'S', weight: 2, min: 2_500_000, max: 6_000_000 },
  { id: 'A', weight: 4, min: 1_200_000, max: 2_800_000 },
  { id: 'B', weight: 6, min: 450_000, max: 1_200_000 },
  { id: 'C', weight: 4, min: 150_000, max: 550_000 },
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

function pickTier(rng) {
  const total = BUDGET_TIERS.reduce((s, t) => s + t.weight, 0)
  let roll = rng.float() * total
  for (const tier of BUDGET_TIERS) {
    roll -= tier.weight
    if (roll <= 0) return tier
  }
  return BUDGET_TIERS[BUDGET_TIERS.length - 1]
}

function rollInRange(rng, min, max) {
  return Math.round(min + rng.float() * (max - min))
}

/** Losowy budżet sezonu dla jednego klubu (USD). */
export function rollTransferBudget(teamId, seedBase = 0) {
  const rng = createRng(hashString(`${seedBase}|budget|${teamId}`))
  const tier = pickTier(rng)
  // Zaokrąglenie do 10k — „okrągłe” kwoty jak w raportach klubowych.
  const raw = rollInRange(rng, tier.min, tier.max)
  return Math.round(raw / 10_000) * 10_000
}

/** Losowa polityka transferowa dla klubu. */
export function rollTransferPolicy(teamId, seedBase = 0) {
  const rng = createRng(hashString(`${seedBase}|policy|${teamId}`))
  const weights = [2, 5, 4, 2] // sell, balanced, retain, hardline
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng.float() * total
  for (let i = 0; i < TRANSFER_POLICY_PRESETS.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) {
      return { ...TRANSFER_POLICY_PRESETS[i] }
    }
  }
  return { ...TRANSFER_POLICY_PRESETS[1] }
}

/**
 * Inicjuje finanse + politykę na drużynie world.
 * @param {import('../worldState.js').WorldTeam} team
 * @param {{ seed?: number, force?: boolean }} [options]
 */
export function ensureTeamFinances(team, options = {}) {
  if (!team) return team
  const seed = options.seed ?? 0
  if (!team.finances || typeof team.finances !== 'object') {
    team.finances = {}
  }
  if (options.force || team.finances.transferBudget == null) {
    team.finances.transferBudget = rollTransferBudget(team.id, seed)
  }
  if (options.force || team.finances.salaryBudget == null) {
    // Uzupełniane przy sync kontraktów (ensureWorldContracts); tu startowe 0.
    team.finances.salaryBudget = Math.max(0, Math.round(team.finances.salaryBudget ?? 0))
  }
  if (options.force || !team.modifiers || typeof team.modifiers !== 'object') {
    team.modifiers = { ...(team.modifiers ?? {}) }
  }
  if (options.force || !team.modifiers.transferPolicy) {
    team.modifiers.transferPolicy = rollTransferPolicy(team.id, seed)
  }
  return team
}

/**
 * @param {import('../worldState.js').WorldState} world
 * @param {{ seed?: number, force?: boolean }} [options]
 */
export function ensureWorldFinances(world, options = {}) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    ensureTeamFinances(world.teamsById[id], options)
  }
  return world
}

/** Nowy sezon: świeży budżet + połowa niewydanych środków (+ zachowany budżet pensji). */
export function rollSeasonBudgets(world, options = {}) {
  if (!world?.teamsById) return world
  const seed = options.seed ?? Date.now()
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team) continue
    const leftover = Math.max(0, Math.floor((team.finances?.transferBudget ?? 0) * 0.5))
    const salaryKeep = Math.max(0, Math.round(team.finances?.salaryBudget ?? 0))
    ensureTeamFinances(team, { seed, force: true })
    team.finances.transferBudget = (team.finances.transferBudget ?? 0) + leftover
    team.finances.salaryBudget = salaryKeep
    team.finances._salaryBudgetSynced = true
  }
  return world
}

export function getTransferBudget(team) {
  return Math.round(team?.finances?.transferBudget ?? 0)
}

export function getSalaryBudget(team) {
  return Math.max(0, Math.round(team?.finances?.salaryBudget ?? 0))
}

export function getTransferPolicy(team) {
  return team?.modifiers?.transferPolicy ?? TRANSFER_POLICY_PRESETS[1]
}

/** Klub może kupować tylko przy dodatnim budżecie transferowym. */
export function canBuyPlayers(team) {
  return getTransferBudget(team) > 0
}

/**
 * Ostrzeżenie zarządu — budżet na minusie, ale jeszcze bez walkowerów.
 * Próg krytyczny (walkower 15–0) obniżony z -2.5M: przy starym progu praktycznie
 * nie dało się go osiągnąć, bo prawie każdy wydatek jest wcześniej blokowany
 * sprawdzeniem „czy stać” — sam mechanizm bankructwa był martwym kodem.
 */
export const FINANCIAL_WARNING_THRESHOLD = -75_000

/** Próg bankructwa — forfeit 15–0 do odzyskania środków. */
export const FORFEIT_BUDGET_THRESHOLD = -400_000

/** Dokąd sięga jednorazowa (raz na sezon) dotacja ratunkowa zarządu. */
const BOARD_BAILOUT_TARGET = FINANCIAL_WARNING_THRESHOLD
const BOARD_BAILOUT_REPUTATION_PENALTY = -6
const BOARD_BAILOUT_FAN_MOOD_PENALTY = -10

export function isClubBankrupt(team) {
  return getTransferBudget(team) <= FORFEIT_BUDGET_THRESHOLD
}

/** Poziom kondycji finansowej klubu: 'ok' | 'watch' | 'distress' | 'critical'. */
export function financialHealthTier(team) {
  const budget = getTransferBudget(team)
  if (budget <= FORFEIT_BUDGET_THRESHOLD) return 'critical'
  if (budget <= FINANCIAL_WARNING_THRESHOLD) return 'distress'
  if (budget < 0) return 'watch'
  return 'ok'
}

export function adjustTransferBudget(team, delta) {
  if (!team) return
  if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
  team.finances.transferBudget = Math.round((team.finances.transferBudget ?? 0) + delta)
}

export function adjustSalaryBudget(team, delta) {
  if (!team) return
  if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
  team.finances.salaryBudget = Math.max(
    0,
    Math.round((team.finances.salaryBudget ?? 0) + delta),
  )
}

/**
 * Cotygodniowa kontrola kondycji finansowej wszystkich klubów:
 * - `distress`/`critical` → jednorazowe ostrzeżenie zarządu (do skrzynki gracza),
 * - `critical` → jednorazowa (raz na sezon) dotacja ratunkowa podnosząca budżet
 *   z powrotem do progu ostrzeżenia, kosztem reputacji i nastroju kibiców —
 *   żeby bankructwo nie było trwałą, niemożliwą do odwrócenia pętlą walkowerów.
 *
 * @param {import('../worldState.js').WorldState} world
 * @param {{ seasonYear?: number|string }} [options]
 * @returns {{
 *   warnings: { teamId: string, tier: 'distress'|'critical', budget: number }[],
 *   bailouts: { teamId: string, amount: number }[],
 * }}
 */
export function processWeeklyFinancialHealth(world, options = {}) {
  const warnings = []
  const bailouts = []
  if (!world?.teamsById) return { warnings, bailouts }

  const seasonKey = String(options.seasonYear ?? '')
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  for (const id of ids) {
    const team = world.teamsById[id]
    if (!team?.finances) continue
    const tier = financialHealthTier(team)

    if (tier === 'critical' && team.finances._bailoutSeason !== seasonKey) {
      const amount = Math.max(0, BOARD_BAILOUT_TARGET - getTransferBudget(team))
      if (amount > 0) adjustTransferBudget(team, amount)
      team.finances._bailoutSeason = seasonKey
      // Nie ustawiamy `_warnedTier` na 'critical' tutaj: gdyby klub w tym samym
      // sezonie ponownie wpadł w krytyczny dług (bailout już wykorzystany),
      // kolejne ostrzeżenie zarządu musi się jeszcze odezwać.
      team.finances._warnedTier = 'distress'
      adjustTeamReputation(team, BOARD_BAILOUT_REPUTATION_PENALTY)
      ensureTeamFans(team)
      adjustFanMood(team, BOARD_BAILOUT_FAN_MOOD_PENALTY)
      bailouts.push({ teamId: id, amount })
      continue
    }

    if (tier === 'distress' || tier === 'critical') {
      if (team.finances._warnedTier !== tier) {
        team.finances._warnedTier = tier
        warnings.push({ teamId: id, tier, budget: getTransferBudget(team) })
      }
    } else if (team.finances._warnedTier) {
      team.finances._warnedTier = null
    }
  }

  return { warnings, bailouts }
}

function newFinanceEventId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Wiadomości do skrzynki gracza o ostrzeżeniach zarządu / dotacji ratunkowej. */
export function messagesFromFinancialHealth(result, career, { date = null, seasonYear = null } = {}) {
  if (!career?.playerTeamId) return []
  const msgs = []
  const bailout = (result?.bailouts ?? []).find((b) => b.teamId === career.playerTeamId)
  const warn = (result?.warnings ?? []).find((w) => w.teamId === career.playerTeamId)
  const base = {
    createdAt: new Date().toISOString(),
    date: date ?? career.league?.currentDate ?? null,
    seasonIndex: career.seasonIndex ?? null,
    seasonYear: seasonYear ?? career.seasonYear ?? null,
    read: false,
  }

  if (bailout) {
    msgs.push({
      id: newFinanceEventId('msg-bailout'),
      type: 'club_news',
      ...base,
      title: 'Ratunkowa dotacja zarządu',
      titleEn: 'Emergency board bailout',
      body: `Budżet transferowy spadł do poziomu krytycznego. Zarząd dokłada ${formatUsd(bailout.amount)}, żeby klub mógł dalej funkcjonować — kosztem reputacji i nastroju kibiców. Ta pomoc jest dostępna raz na sezon.`,
      bodyEn: `The transfer budget hit a critical level. The board injects ${formatUsd(bailout.amount)} to keep the club running — at the cost of reputation and fan mood. This lifeline is available once per season.`,
      payload: { kind: 'board_bailout', amount: bailout.amount },
    })
  } else if (warn) {
    const critical = warn.tier === 'critical'
    msgs.push({
      id: newFinanceEventId('msg-finwarn'),
      type: 'club_news',
      ...base,
      title: critical ? 'Zarząd alarmuje: budżet krytyczny' : 'Zarząd ostrzega przed długiem',
      titleEn: critical ? 'Board alarm: critical budget' : 'Board warning on debt',
      body: critical
        ? `Budżet transferowy wynosi ${formatUsd(warn.budget)}. Kolejne mecze mogą kończyć się walkowerem 0–15, dopóki się nie odbijecie.`
        : `Budżet transferowy jest na minusie (${formatUsd(warn.budget)}). Zarząd oczekuje planu naprawczego — sprzedaży, cięcia kosztów albo nowego sponsora.`,
      bodyEn: critical
        ? `The transfer budget stands at ${formatUsd(warn.budget)}. Upcoming matches may end in a 0–15 forfeit until you recover.`
        : `The transfer budget is negative (${formatUsd(warn.budget)}). The board expects a recovery plan — sales, cost cuts, or a new sponsor.`,
      payload: { kind: 'board_warning', tier: warn.tier, budget: warn.budget },
    })
  }

  return msgs
}
