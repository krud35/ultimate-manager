/**
 * Budżety transferowe i polityka transferowa klubów.
 * Skala budżetów wzorowana na polskiej Ekstraklasie (USD).
 */

import { createRng } from '../../matchEngine/rng.js'

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

/** Próg bankructwa — forfeit 15–0 do odzyskania środków. */
export const FORFEIT_BUDGET_THRESHOLD = -2_500_000

export function isClubBankrupt(team) {
  return getTransferBudget(team) <= FORFEIT_BUDGET_THRESHOLD
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
