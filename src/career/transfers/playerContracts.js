/**
 * Kontrakty finansowe zawodników: długość, pensja tygodniowa, bonusy, obietnice.
 * Przy podpisaniu cała suma kontraktu idzie z budżetu transferowego → budżet pensji;
 * co tydzień znika z budżetu pensji; niewypłacona reszta wraca do transferowego.
 */

import { createRng } from '../../matchEngine/rng.js'
import { getOverallRating } from '../../models/playerStats.js'
import { worldTeamsList } from '../worldState.js'
import { applyDebtMoraleToTeam, ensurePlayerMorale, getPlayerMorale } from '../../models/playerMorale.js'
import { noteLoyaltyFromTreatment } from '../../models/playerLoyalty.js'
import { getPlayerFullName } from '../../data/mockPlayers.js'
import { standingsTable } from '../../league/standings.js'
import { getTransferBudget, adjustTransferBudget } from './clubFinances.js'
import { formatUsd } from './moneyFormat.js'

export const WEEKS_PER_CONTRACT_YEAR = 52

/** @typedef {'goals_season'|'assists_season'|'championship'|'cup_win'|'appearances'} ContractBonusType */
/** @typedef {'playing_time'|'key_role'|'title_challenge'|'development'|'no_bench'} ContractPromiseType */

export const CONTRACT_BONUS_DEFS = [
  {
    id: 'goals_season',
    labelPl: 'Bonus za gole (sezon)',
    labelEn: 'Goals bonus (season)',
    defaultAmount: 8000,
    defaultTarget: 15,
  },
  {
    id: 'assists_season',
    labelPl: 'Bonus za asysty (sezon)',
    labelEn: 'Assists bonus (season)',
    defaultAmount: 6000,
    defaultTarget: 12,
  },
  {
    id: 'championship',
    labelPl: 'Bonus za mistrzostwo',
    labelEn: 'Championship bonus',
    defaultAmount: 25000,
    defaultTarget: null,
  },
  {
    id: 'cup_win',
    labelPl: 'Bonus za puchar',
    labelEn: 'Cup win bonus',
    defaultAmount: 15000,
    defaultTarget: null,
  },
  {
    id: 'appearances',
    labelPl: 'Bonus za występy',
    labelEn: 'Appearances bonus',
    defaultAmount: 5000,
    defaultTarget: 20,
  },
]

export const CONTRACT_PROMISE_DEFS = [
  {
    id: 'playing_time',
    labelPl: 'Regularny czas gry',
    labelEn: 'Regular playing time',
    wageRelief: 0.06,
    appearanceShare: 0.5,
    moralePenaltyIfBroken: -4,
  },
  {
    id: 'key_role',
    labelPl: 'Kluczowa rola w składzie',
    labelEn: 'Key role in the squad',
    wageRelief: 0.04,
    appearanceShare: 0.65,
    moralePenaltyIfBroken: -3,
  },
  {
    id: 'title_challenge',
    labelPl: 'Walka o tytuł',
    labelEn: 'Title challenge',
    wageRelief: 0.05,
    moralePenaltyIfBroken: -3,
  },
  {
    id: 'development',
    labelPl: 'Ścieżka rozwoju',
    labelEn: 'Development path',
    wageRelief: 0.03,
    moralePenaltyIfBroken: -2,
  },
  {
    id: 'no_bench',
    labelPl: 'Nie będę rezerwowym',
    labelEn: 'Not a bench player',
    wageRelief: 0.05,
    appearanceShare: 0.85,
    moralePenaltyIfBroken: -5,
  },
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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Bazowa tygodniówka z OVR (USD):
 * 65→~180, 70→~420, 75→~1.0k, 80→~2.4k, 85→~5.7k, 90→~13.5k
 */
export function weeklyWageFromOvr(ovr) {
  const x = Math.max(50, Math.min(99, Number(ovr) || 50))
  return 80 * Math.pow(1.188, x - 60)
}

/** Zaokrąglenie pensji do sensownych kwot. */
export function roundWage(amount) {
  const n = Math.max(50, Math.round(Number(amount) || 0))
  if (n >= 10_000) return Math.round(n / 500) * 500
  if (n >= 2000) return Math.round(n / 100) * 100
  if (n >= 500) return Math.round(n / 50) * 50
  return Math.round(n / 25) * 25
}

export function contractTotalCost(weeklyWage, weeks) {
  return Math.max(0, Math.round((Number(weeklyWage) || 0) * Math.max(0, Math.round(Number(weeks) || 0))))
}

export function getContractRemainingCost(contract) {
  if (!contract) return 0
  return contractTotalCost(contract.weeklyWage, contract.weeksRemaining ?? 0)
}

export function getContractFullCost(contract) {
  if (!contract) return 0
  return contractTotalCost(contract.weeklyWage, contract.weeksTotal ?? contract.weeksRemaining ?? 0)
}

/**
 * Losuje długość kontraktu w latach (1–5) — lepsi częściej dłużej.
 * @param {object} player
 * @param {ReturnType<typeof createRng>} rng
 */
export function rollContractYears(player, rng) {
  const ovr = getOverallRating(player?.skills)
  const age = Number.isFinite(player?.age) ? player.age : 25
  let weights
  if (age >= 33) weights = [5, 4, 1, 0, 0]
  else if (age >= 30) weights = [3, 5, 3, 1, 0]
  else if (ovr >= 84) weights = [1, 2, 4, 4, 2]
  else if (ovr >= 78) weights = [1, 3, 5, 3, 1]
  else if (ovr >= 72) weights = [2, 4, 4, 2, 0]
  else weights = [3, 5, 3, 1, 0]

  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng.float() * total
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return i + 1
  }
  return 2
}

/**
 * Losuje tygodniówkę wokół krzywej OVR.
 * @param {object} player
 * @param {ReturnType<typeof createRng>} rng
 */
export function rollWeeklyWage(player, rng) {
  const ovr = getOverallRating(player?.skills)
  const pot = Number.isFinite(player?.potential) ? player.potential : ovr
  const room = Math.max(0, pot - ovr)
  const age = Number.isFinite(player?.age) ? player.age : 25

  let mult = 0.88 + rng.float() * 0.28 // 0.88–1.16
  if (room >= 6) mult += 0.06
  else if (room >= 3) mult += 0.03
  if (age <= 22) mult += 0.04
  else if (age >= 32) mult -= 0.08
  else if (age >= 30) mult -= 0.04

  return roundWage(weeklyWageFromOvr(ovr) * mult)
}

/**
 * @param {object} player
 * @param {{
 *   weeklyWage: number,
 *   years: number,
 *   bonuses?: object[],
 *   promises?: object[],
 *   signedDate?: string|null,
 *   weeksElapsed?: number,
 * }} terms
 */
export function buildContract(player, terms) {
  const years = clamp(Math.round(Number(terms.years) || 1), 1, 5)
  const weeksTotal = years * WEEKS_PER_CONTRACT_YEAR
  const elapsed = Math.max(0, Math.round(Number(terms.weeksElapsed) || 0))
  const weeksRemaining = Math.max(1, weeksTotal - elapsed)
  const weeklyWage = roundWage(terms.weeklyWage)

  return {
    weeklyWage,
    years,
    weeksTotal,
    weeksRemaining,
    signedDate: terms.signedDate ?? null,
    bonuses: Array.isArray(terms.bonuses) ? terms.bonuses.map(normalizeBonus) : [],
    promises: Array.isArray(terms.promises) ? terms.promises.map(normalizePromise) : [],
    // Baza do obietnicy „development” — porównywana z aktualnym OVR na koniec sezonu.
    ovrCheckpoint: Number.isFinite(terms.ovrCheckpoint)
      ? terms.ovrCheckpoint
      : getOverallRating(player?.skills),
    bonusesPaidSeasons:
      terms.bonusesPaidSeasons && typeof terms.bonusesPaidSeasons === 'object'
        ? { ...terms.bonusesPaidSeasons }
        : {},
  }
}

function normalizeBonus(b) {
  if (!b || typeof b !== 'object') return null
  const def = CONTRACT_BONUS_DEFS.find((d) => d.id === b.type || d.id === b.id)
  const type = def?.id ?? b.type ?? b.id
  if (!type) return null
  return {
    type,
    amount: Math.max(0, Math.round(Number(b.amount) || def?.defaultAmount || 0)),
    target: b.target != null ? Math.round(Number(b.target)) : null,
  }
}

function normalizePromise(p) {
  if (!p || typeof p !== 'object') return null
  const id = p.type ?? p.id
  const def = CONTRACT_PROMISE_DEFS.find((d) => d.id === id)
  if (!def) return null
  return { type: def.id }
}

/**
 * Losuje kontrakt startowy (przy tworzeniu świata).
 * Część kontraktu już „zużyta” (0–40% długości), żeby składy nie startowały z pełnymi rezerwami.
 */
export function rollPlayerContract(player, seedBase = 0) {
  const rng = createRng(hashString(`${seedBase}|contract|${player?.id ?? '?'}`))
  const years = rollContractYears(player, rng)
  const weeklyWage = rollWeeklyWage(player, rng)
  const weeksTotal = years * WEEKS_PER_CONTRACT_YEAR
  const consumedFrac = rng.float() * 0.4
  const weeksElapsed = Math.floor(weeksTotal * consumedFrac)
  return buildContract(player, {
    weeklyWage,
    years,
    weeksElapsed,
    bonuses: [],
    promises: [],
  })
}

export function ensurePlayerContract(player, options = {}) {
  if (!player) return player
  const c = player.contract
  if (
    !options.force &&
    c &&
    typeof c === 'object' &&
    Number.isFinite(c.weeklyWage) &&
    Number.isFinite(c.weeksRemaining)
  ) {
    player.contract = {
      weeklyWage: roundWage(c.weeklyWage),
      years: clamp(Math.round(c.years ?? Math.ceil((c.weeksTotal ?? c.weeksRemaining) / 52)), 1, 5),
      weeksTotal: Math.max(
        Math.round(c.weeksRemaining),
        Math.round(c.weeksTotal ?? c.weeksRemaining),
      ),
      weeksRemaining: Math.max(0, Math.round(c.weeksRemaining)),
      signedDate: c.signedDate ?? null,
      bonuses: Array.isArray(c.bonuses) ? c.bonuses.map(normalizeBonus).filter(Boolean) : [],
      promises: Array.isArray(c.promises) ? c.promises.map(normalizePromise).filter(Boolean) : [],
      ovrCheckpoint: Number.isFinite(c.ovrCheckpoint)
        ? c.ovrCheckpoint
        : getOverallRating(player?.skills),
      bonusesPaidSeasons:
        c.bonusesPaidSeasons && typeof c.bonusesPaidSeasons === 'object'
          ? { ...c.bonusesPaidSeasons }
          : {},
    }
    return player
  }
  player.contract = rollPlayerContract(player, options.seed ?? 0)
  return player
}

/**
 * Sumuje niewypłacone pensje w składzie.
 * @param {object} team
 */
export function teamWageLiability(team) {
  let sum = 0
  for (const p of team?.players ?? []) {
    if (p?.contract) sum += getContractRemainingCost(p.contract)
  }
  return Math.max(0, Math.round(sum))
}

/**
 * Sumuje tygodniowe koszty pensji.
 * @param {object} team
 */
export function teamWeeklyWageBill(team) {
  let sum = 0
  for (const p of team?.players ?? []) {
    const w = p?.contract?.weeklyWage
    const rem = p?.contract?.weeksRemaining ?? 0
    if (w > 0 && rem > 0) sum += w
  }
  return Math.max(0, Math.round(sum))
}

/**
 * Inicjuje kontrakty w świecie + synchronizuje budżet pensji z odpowiedzialnością.
 * @param {import('../worldState.js').WorldState} world
 * @param {{ seed?: number, force?: boolean, syncBudgets?: boolean }} [options]
 */
export function ensureWorldContracts(world, options = {}) {
  if (!world?.teamsById) return world
  const seed = options.seed ?? 0
  const syncBudgets = options.syncBudgets !== false

  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      ensurePlayerContract(player, { seed, force: !!options.force })
    }
    if (syncBudgets) {
      syncTeamSalaryBudget(team, { seed, forceInit: !!options.force })
    }
  }
  return world
}

/**
 * Ustawia salaryBudget = suma niewypłaconych pensji i odejmuje to od transferBudget
 * (przy pierwszej inicjalizacji). Przy forceInit zawsze przelicza.
 *
 * @param {object} team
 * @param {{ seed?: number, forceInit?: boolean }} [options]
 */
export function syncTeamSalaryBudget(team, options = {}) {
  if (!team) return team
  if (!team.finances || typeof team.finances !== 'object') {
    team.finances = { transferBudget: 0, salaryBudget: 0 }
  }

  const liability = teamWageLiability(team)
  const hasSalary =
    team.finances.salaryBudget != null && Number.isFinite(team.finances.salaryBudget)

  if (!options.forceInit && hasSalary && team.finances._salaryBudgetSynced) {
    return team
  }

  // Pierwsza synchronizacja (lub force): zablokuj pensje z budżetu transferowego.
  const transfer = Math.max(0, Math.round(team.finances.transferBudget ?? 0))
  if (liability > transfer) {
    // Dołóż środki, żeby klub nie startował z zerowym budżetem transferowym.
    const cushion = Math.round(liability * 0.35)
    team.finances.transferBudget = Math.max(0, cushion)
    team.finances.salaryBudget = liability
  } else {
    team.finances.transferBudget = transfer - liability
    team.finances.salaryBudget = liability
  }
  team.finances._salaryBudgetSynced = true
  return team
}

/**
 * Rezerwuje kwotę kontraktu: transferBudget → salaryBudget.
 * @returns {{ ok: boolean, error?: string }}
 */
export function reserveContractFunds(team, amount) {
  if (!team) return { ok: false, error: 'Brak drużyny' }
  if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
  const cost = Math.max(0, Math.round(Number(amount) || 0))
  const transfer = Math.max(0, Math.round(team.finances.transferBudget ?? 0))
  if (cost > transfer) {
    return {
      ok: false,
      error: `Brak środków na kontrakt (potrzeba ${cost}, budżet transferowy ${transfer})`,
    }
  }
  team.finances.transferBudget = transfer - cost
  team.finances.salaryBudget = Math.max(0, Math.round(team.finances.salaryBudget ?? 0)) + cost
  return { ok: true }
}

/**
 * Zwraca niewypłaconą pensję do budżetu transferowego (odejście zawodnika).
 */
export function releaseContractFunds(team, amount) {
  if (!team) return
  if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
  const refund = Math.max(0, Math.round(Number(amount) || 0))
  const salary = Math.max(0, Math.round(team.finances.salaryBudget ?? 0))
  const take = Math.min(salary, refund)
  team.finances.salaryBudget = salary - take
  team.finances.transferBudget = Math.round((team.finances.transferBudget ?? 0) + take)
}

/**
 * Podpisuje nowy kontrakt w klubie kupującym (rezerwuje środki).
 * @returns {{ ok: boolean, error?: string, contract?: object }}
 */
export function signPlayerContract(team, player, terms) {
  if (!team || !player) return { ok: false, error: 'Brak drużyny/zawodnika' }
  const contract = buildContract(player, terms)
  const cost = getContractRemainingCost(contract)
  const reserved = reserveContractFunds(team, cost)
  if (!reserved.ok) return reserved
  player.contract = contract
  return { ok: true, contract }
}

/**
 * Zdejmuje kontrakt z zawodnika opuszczającego klub — zwrot niewypłaconej pensji.
 */
export function clearPlayerContractOnExit(team, player) {
  if (!player?.contract) return 0
  const refund = getContractRemainingCost(player.contract)
  releaseContractFunds(team, refund)
  player.contract = null
  return refund
}

/**
 * Cotygodniowa wypłata pensji we wszystkich klubach świata.
 * @param {import('../worldState.js').WorldState} world
 * @returns {{ paid: number, teams: number }}
 */
export function processWeeklyWages(world) {
  if (!world?.teamsById) return { paid: 0, teams: 0 }
  let paid = 0
  let teams = 0
  for (const team of worldTeamsList(world)) {
    if (!team.finances) team.finances = { transferBudget: 0, salaryBudget: 0 }
    let weekBill = 0
    for (const player of team.players ?? []) {
      const c = player.contract
      if (!c || !(c.weeksRemaining > 0) || !(c.weeklyWage > 0)) continue
      weekBill += c.weeklyWage
      c.weeksRemaining = Math.max(0, Math.round(c.weeksRemaining) - 1)
    }
    if (weekBill <= 0) {
      applyDebtMoraleToTeam(team, getTransferBudget(team))
      continue
    }
    const salary = Math.max(0, Math.round(team.finances.salaryBudget ?? 0))
    const deduct = Math.min(salary, weekBill)
    team.finances.salaryBudget = salary - deduct
    // Niedobór (np. stary save) — nie pożeraj budżetu transferowego.
    paid += deduct
    teams += 1
    applyDebtMoraleToTeam(team, getTransferBudget(team))
  }
  return { paid, teams }
}

/**
 * Wypłaty za N tygodni (np. przy szybkim przewijaniu).
 */
export function processWeeklyWagesTimes(world, weeks) {
  const n = Math.max(0, Math.round(Number(weeks) || 0))
  let paid = 0
  for (let i = 0; i < n; i += 1) {
    paid += processWeeklyWages(world).paid
  }
  return { paid, weeks: n }
}

export function bonusDefById(id) {
  return CONTRACT_BONUS_DEFS.find((d) => d.id === id) ?? null
}

export function promiseDefById(id) {
  return CONTRACT_PROMISE_DEFS.find((d) => d.id === id) ?? null
}

/** Ulga w wymaganiach płacowych z obietnic (0–~0.2). */
export function promiseWageRelief(promises) {
  let relief = 0
  for (const p of promises ?? []) {
    const def = promiseDefById(p.type ?? p.id)
    if (def) relief += def.wageRelief
  }
  return Math.min(0.22, relief)
}

/** Szacunkowa wartość bonusów (zmiękcza wymagania o część kwoty / tygodnie). */
export function bonusWageEquivalent(bonuses, weeks) {
  const w = Math.max(1, Math.round(Number(weeks) || 52))
  let sum = 0
  for (const b of bonuses ?? []) {
    sum += Math.max(0, Number(b.amount) || 0)
  }
  // Bonusy nie gwarantowane — liczą się ~35% wartości rozłożonej na kontrakt.
  return roundWage((sum * 0.35) / w)
}

/** Próg bonusu, gdy oferta nie podała własnego `target`. */
export function bonusTargetFor(bonus) {
  if (bonus?.target != null) return bonus.target
  return bonusDefById(bonus?.type)?.defaultTarget ?? null
}

function newContractEventId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Czy bonus kontraktowy zawodnika został spełniony w danym sezonie. */
function bonusConditionMet({ type, target, statsRow, teamPlace, cupChampionTeamId, teamId }) {
  if (type === 'goals_season') return (statsRow?.goals ?? 0) >= (target ?? Infinity)
  if (type === 'assists_season') return (statsRow?.assists ?? 0) >= (target ?? Infinity)
  if (type === 'appearances') return (statsRow?.games ?? 0) >= (target ?? Infinity)
  if (type === 'championship') return teamPlace === 1
  if (type === 'cup_win') return !!cupChampionTeamId && cupChampionTeamId === teamId
  return false
}

/** Czy obietnica kontraktowa została dotrzymana w danym sezonie. */
function promiseConditionMet({ type, def, playerGames, teamGames, teamPlace, teamCount, ovrNow, ovrCheckpoint }) {
  if (def?.appearanceShare != null) {
    if (!teamGames) return true // brak rozegranych meczów drużyny — nie karz
    return playerGames / teamGames >= def.appearanceShare
  }
  if (type === 'title_challenge') {
    if (!teamPlace || !teamCount) return true
    return teamPlace <= Math.max(1, Math.ceil(teamCount * 0.25))
  }
  if (type === 'development') {
    return ovrNow > ovrCheckpoint
  }
  return true
}

/**
 * Rozliczenie kontraktów na koniec sezonu: wypłaca spełnione bonusy za osiągnięcia
 * i obniża morale za obietnice, których klub nie dotrzymał (czas gry, walka o tytuł, rozwój...).
 * Bez tego bonusy/obietnice były tylko rabatem na negocjacjach, bez żadnej konsekwencji.
 *
 * @param {import('../worldState.js').WorldState} world
 * @param {{ league?: object|null, seasonYear?: number|string, playerStats?: object }} [options]
 * @returns {{
 *   bonusPayouts: { teamId: string, playerId: string|number, playerName: string, type: string, amount: number }[],
 *   brokenPromises: { teamId: string, playerId: string|number, playerName: string, type: string, moraleDelta: number }[],
 * }}
 */
export function processSeasonEndContractObligations(world, options = {}) {
  const bonusPayouts = []
  const brokenPromises = []
  if (!world?.teamsById) return { bonusPayouts, brokenPromises }

  const league = options.league ?? null
  const seasonKey = String(options.seasonYear ?? '')
  const statsMap = options.playerStats?.byPlayer ?? options.playerStats ?? {}
  const table = league?.standings ? standingsTable(league.standings) : []
  const placeByTeam = Object.fromEntries(table.map((row, i) => [row.teamId, i + 1]))
  const teamCount = table.length
  const cupChampionTeamId = league?.cup?.championTeamId ?? null

  for (const team of worldTeamsList(world)) {
    const standing = league?.standings?.[team.id]
    const teamGames = Math.max(0, (standing?.wins ?? 0) + (standing?.losses ?? 0))
    const teamPlace = placeByTeam[team.id] ?? null

    for (const player of team.players ?? []) {
      ensurePlayerContract(player)
      const contract = player.contract
      if (!contract) continue
      const statsRow = statsMap[player.id] ?? null

      for (const bonus of contract.bonuses ?? []) {
        if (!bonus?.type || !(bonus.amount > 0)) continue
        const paidKey = `${bonus.type}:${seasonKey}`
        if (contract.bonusesPaidSeasons?.[paidKey]) continue
        const met = bonusConditionMet({
          type: bonus.type,
          target: bonusTargetFor(bonus),
          statsRow,
          teamPlace,
          cupChampionTeamId,
          teamId: team.id,
        })
        if (!met) continue
        adjustTransferBudget(team, bonus.amount)
        if (!contract.bonusesPaidSeasons) contract.bonusesPaidSeasons = {}
        contract.bonusesPaidSeasons[paidKey] = bonus.amount
        bonusPayouts.push({
          teamId: team.id,
          playerId: player.id,
          playerName: getPlayerFullName(player),
          type: bonus.type,
          amount: bonus.amount,
        })
      }

      const ovrNow = getOverallRating(player.skills)
      for (const promise of contract.promises ?? []) {
        const def = promiseDefById(promise?.type)
        if (!def) continue
        const met = promiseConditionMet({
          type: def.id,
          def,
          playerGames: statsRow?.games ?? 0,
          teamGames,
          teamPlace,
          teamCount,
          ovrNow,
          ovrCheckpoint: Number.isFinite(contract.ovrCheckpoint) ? contract.ovrCheckpoint : ovrNow,
        })
        if (met) continue
        const penalty = def.moralePenaltyIfBroken ?? -3
        ensurePlayerMorale(player)
        const nextMorale = Math.max(25, Math.min(99, Math.round(getPlayerMorale(player) + penalty)))
        player.morale = nextMorale
        noteLoyaltyFromTreatment(player, penalty)
        brokenPromises.push({
          teamId: team.id,
          playerId: player.id,
          playerName: getPlayerFullName(player),
          type: def.id,
          moraleDelta: penalty,
        })
      }

      contract.ovrCheckpoint = ovrNow
    }
  }

  return { bonusPayouts, brokenPromises }
}

/** Wiadomości do skrzynki gracza o wypłaconych bonusach kontraktowych zawodników. */
export function messagesFromContractBonusPayouts(bonusPayouts, career, { date = null, seasonYear = null } = {}) {
  if (!bonusPayouts?.length || !career?.playerTeamId) return []
  const mine = bonusPayouts.filter((p) => p.teamId === career.playerTeamId)
  if (!mine.length) return []
  return mine.map((p) => {
    const def = bonusDefById(p.type)
    return {
      id: newContractEventId('msg-cbonus'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: seasonYear ?? career.seasonYear ?? null,
      read: false,
      title: `Bonus kontraktowy · ${p.playerName}`,
      titleEn: `Contract bonus · ${p.playerName}`,
      body: `${p.playerName} spełnił warunki bonusu „${def?.labelPl ?? p.type}”. Klub wypłacił ${formatUsd(p.amount)}.`,
      bodyEn: `${p.playerName} hit the “${def?.labelEn ?? p.type}” bonus condition. The club paid out ${formatUsd(p.amount)}.`,
      payload: { kind: 'contract_bonus_paid', playerId: p.playerId, bonusType: p.type, amount: p.amount },
    }
  })
}

/** Wiadomości do skrzynki gracza o złamanych obietnicach kontraktowych. */
export function messagesFromBrokenPromises(brokenPromises, career, { date = null, seasonYear = null } = {}) {
  if (!brokenPromises?.length || !career?.playerTeamId) return []
  const mine = brokenPromises.filter((p) => p.teamId === career.playerTeamId)
  if (!mine.length) return []
  return mine.map((p) => {
    const def = promiseDefById(p.type)
    return {
      id: newContractEventId('msg-promisebroken'),
      type: 'club_news',
      createdAt: new Date().toISOString(),
      date: date ?? career.league?.currentDate ?? null,
      seasonIndex: career.seasonIndex ?? null,
      seasonYear: seasonYear ?? career.seasonYear ?? null,
      read: false,
      title: `Złamana obietnica · ${p.playerName}`,
      titleEn: `Broken promise · ${p.playerName}`,
      body: `${p.playerName} uważa, że nie dotrzymałeś obietnicy „${def?.labelPl ?? p.type}” z kontraktu. Morale ${p.moraleDelta}.`,
      bodyEn: `${p.playerName} feels you broke the contract promise “${def?.labelEn ?? p.type}”. Morale ${p.moraleDelta}.`,
      payload: { kind: 'promise_broken', playerId: p.playerId, promiseType: p.type, moraleDelta: p.moraleDelta },
    }
  })
}
