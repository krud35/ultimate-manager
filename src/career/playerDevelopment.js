/**
 * Rozwój zawodników: wiek, potencjał, trening, zmęczenie treningowe, decline 30+.
 * Dotyczy całego świata (gracz + AI).
 */

import {
  PLAYER_STAT_CATEGORIES,
  categoryStatRange,
  getOverallRating,
  getCategoryOverall,
  getSubStat,
  normalizePlayerSkills,
} from '../models/playerStats.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerTraits, getTraitMods } from '../models/playerTraits.js'
import {
  incrementPlayerClubTenure,
  applyLoyaltyTenureDrift,
} from '../models/playerLoyalty.js'
import {
  ensurePlayerInjury,
  shortenInjuryForOffseason,
  tickPlayerInjury,
} from '../models/playerInjury.js'
import { addDays, formatISODate, parseISODate } from '../league/seasonCalendar.js'
import { MATCH_STAMINA_CONFIG, currentMatchStamina, matchStaminaCeiling } from '../matchEngine/stamina.js'
import { medicalRecoveryMult } from './clubFacilities.js'

function worldTeamsList(world) {
  if (!world?.teamsById) return []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  return ids.map((id) => world.teamsById[id]).filter(Boolean)
}

export const TRAINING_FOCUS_OPTIONS = [
  { id: 'rest', labelPl: 'Regeneracja', labelEn: 'Rest' },
  { id: 'balanced', labelPl: 'Zbalansowany', labelEn: 'Balanced' },
  { id: 'throwing', labelPl: 'Rzut', labelEn: 'Throwing' },
  { id: 'physical', labelPl: 'Fizyczność', labelEn: 'Physical' },
  { id: 'mental', labelPl: 'Mental', labelEn: 'Mental' },
  { id: 'offensive', labelPl: 'Ofensywa', labelEn: 'Offense' },
  { id: 'defensive', labelPl: 'Defensywa', labelEn: 'Defense' },
]

/**
 * Fokus indywidualny — nie jest osobnym treningiem.
 * Steruje tylko tym, które kategorie szybciej rosną na treningach drużynowych.
 * Wartości growth/fatigueDelta: legacy (offseason camp); dzień w sezonie ich nie stosuje.
 */
const FOCUS_CONFIG = {
  rest: { growth: 0.12, fatigueDelta: -16, categories: null },
  balanced: { growth: 0.55, fatigueDelta: 5, categories: 'all' },
  throwing: { growth: 1, fatigueDelta: 9, categories: ['throwing'] },
  physical: { growth: 1.05, fatigueDelta: 14, categories: ['physical'] },
  mental: { growth: 0.85, fatigueDelta: 6, categories: ['mental'] },
  offensive: { growth: 1, fatigueDelta: 10, categories: ['offensive'] },
  defensive: { growth: 1, fatigueDelta: 10, categories: ['defensive'] },
}

/** Modyfikatory fokusu przy sesji drużynowej. */
export function getIndividualFocusMods(player) {
  const focusId =
    player?.trainingFocus && FOCUS_CONFIG[player.trainingFocus]
      ? player.trainingFocus
      : 'balanced'
  const cfg = FOCUS_CONFIG[focusId]
  const isRest = focusId === 'rest'
  const focusedCats =
    cfg.categories == null ? null : cfg.categories === 'all' ? 'all' : cfg.categories

  return {
    focusId,
    isRest,
    focusedCats,
    /** Mnożnik szansy wzrostu dla kategorii skilli na treningu drużynowym. */
    categoryGrowthMult(category) {
      if (isRest) return 0.38
      if (focusedCats === 'all' || !focusedCats) return 1
      if (focusedCats.includes(category)) return 1.55
      return 0.72
    },
    /** Preferencja losowania kategorii (waga). */
    categoryPickWeight(category) {
      if (isRest) return 0.5
      if (focusedCats === 'all' || !focusedCats) return 1
      if (focusedCats.includes(category)) return 2.4
      return 0.85
    },
    sessionGrowthMult: isRest ? 0.45 : 1,
    sessionFatigueMult: isRest ? 0.5 : 1,
    /** Dzienna regeneracja poza dniem treningu drużynowego. */
    passiveRecovery: isRest ? 3.2 : 1.1,
  }
}

const PHYSICAL_KEYS = ['speed', 'endurance', 'agility', 'jump']
const SOFT_DECLINE_KEYS = [
  ['defensive', 'defensiveCutterMovement'],
  ['defensive', 'defensiveHandlerMovement'],
  ['offensive', 'cutterMovement'],
]

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

function hash01(playerId, salt) {
  let h = (Number(playerId) || 1) >>> 0
  const tag = String(salt)
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return (h % 10_000) / 10_000
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

function seedFrom(league, tag) {
  const base = league?.simSeedBase ?? 20250805
  const round = league?.currentRound ?? 1
  let h = (base + round * 997) >>> 0
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x9e3779b1) >>> 0
  }
  return h
}

export function performanceScore01(player, leaguePlayerStats = null) {
  const row = leaguePlayerStats?.[player.id]
  if (row && (row.games > 0 || row.goals || row.assists || row.blocks)) {
    const perGame =
      ((row.goals ?? 0) + (row.assists ?? 0) * 1.15 + (row.blocks ?? 0) * 1.25) /
      Math.max(1, row.games ?? 1)
    return Math.max(0, Math.min(1, perGame / 3.2))
  }
  const ref = player.ufaReference
  if (ref) {
    const total =
      (ref.goals ?? 0) + (ref.assists ?? 0) * 1.1 + (ref.blocks ?? 0) * 1.2
    return Math.max(0, Math.min(1, total / 55))
  }
  return 0.42
}

export const PLAYER_AGE_MIN = 18
export const PLAYER_AGE_MAX = 36

/**
 * Początkowy wiek przy generacji (pas 18–36).
 * Więcej wagi na mid-20s — typowy peak ultimate.
 */
export function rollInitialAge(player) {
  const r = hash01(player.id, 'age-v2')
  let age
  if (r < 0.1) age = 18 + Math.floor(hash01(player.id, 'age-y') * 2) // 18–19
  else if (r < 0.28) age = 20 + Math.floor(hash01(player.id, 'age-p') * 3) // 20–22
  else if (r < 0.62) age = 23 + Math.floor(hash01(player.id, 'age-m') * 5) // 23–27
  else if (r < 0.82) age = 28 + Math.floor(hash01(player.id, 'age-v') * 3) // 28–30
  else if (r < 0.94) age = 31 + Math.floor(hash01(player.id, 'age-s') * 3) // 31–33
  else age = 34 + Math.floor(hash01(player.id, 'age-e') * 3) // 34–36
  return clamp(age, PLAYER_AGE_MIN, PLAYER_AGE_MAX)
}

/**
 * Potencjał: młodzi + dobrze grający mają wysoki sufit;
 * 30+ zbliża potencjał do bieżącego OVR (decline).
 */
export function computePotential(player, ovr, perf01) {
  const age = player.age ?? 25
  let gap
  if (age <= 21) gap = 12 + perf01 * 14
  else if (age <= 23) gap = 9 + perf01 * 12
  else if (age <= 25) gap = 6 + perf01 * 10
  else if (age <= 27) gap = 3 + perf01 * 7
  else if (age <= 29) gap = 1 + perf01 * 4
  else if (age <= 32) gap = -1 + perf01 * 2
  else gap = -5 + perf01 * 1.5

  if (age <= 24 && perf01 >= 0.55) gap += 4
  if (age <= 22 && perf01 >= 0.7) gap += 3

  return clamp(ovr + gap, 62, 95)
}

function bumpSubStat(skills, category, key, delta) {
  const nested = normalizePlayerSkills(skills)
  if (!nested[category]) nested[category] = {}
  const { min, max } = categoryStatRange(category)
  const cur = typeof nested[category][key] === 'number' ? nested[category][key] : min
  nested[category][key] = clamp(cur + delta, min, max)
  return nested
}

function pickSubKey(category, rng) {
  const keys = PLAYER_STAT_CATEGORIES[category]
  if (!keys?.length) return null
  return keys[Math.floor(rng() * keys.length)]
}

function growthMultiplier(player, focusGrowth) {
  const ovr = getOverallRating(player.skills)
  const pot = player.potential ?? ovr
  const room = pot - ovr
  const age = player.age ?? 25
  const fatigue = player.developmentFatigue ?? 0

  let mult = focusGrowth
  if (fatigue >= 80) mult *= 0.3
  else if (fatigue >= 60) mult *= 0.55
  else if (fatigue >= 40) mult *= 0.8

  if (age <= 22) mult *= 1.28
  else if (age <= 25) mult *= 1.12
  else if (age <= 29) mult *= 1
  else if (age <= 32) mult *= 0.4
  else mult *= 0.18

  if (room <= 0) mult *= age < 30 ? 0.12 : 0.05
  else mult *= Math.min(1.45, 0.4 + room / 18)

  ensurePlayerTraits(player)
  mult *= getTraitMods(player).developmentGainMult ?? 1

  return mult
}

/** Decline fizyczny (i lekko ruchowy) od 30. roku życia. */
export function applyAgingDecline(player, strength, rng = Math.random) {
  if ((player.age ?? 0) < 30 || strength <= 0) return player
  const age = player.age
  const scale = strength * (age >= 34 ? 1.45 : age >= 32 ? 1.2 : 1)

  player.skills = normalizePlayerSkills(player.skills ?? {})
  for (const key of PHYSICAL_KEYS) {
    if (rng() < 0.55 * Math.min(1.5, scale)) {
      const loss = rng() < 0.35 * scale ? 2 : 1
      player.skills = bumpSubStat(player.skills, 'physical', key, -loss)
    }
  }
  if (age >= 32) {
    for (const [cat, key] of SOFT_DECLINE_KEYS) {
      if (rng() < 0.35 * scale) {
        player.skills = bumpSubStat(player.skills, cat, key, -1)
      }
    }
  }
  if (age >= 34 && rng() < 0.4 * scale) {
    player.skills = bumpSubStat(player.skills, 'mental', 'reactions', -1)
  }
  return player
}

/** Obóz offseason — wzrost wg fokusu (bez osobnego treningu indywidualnego w sezonie). */
export function applyOffseasonCampGrowth(player, rng) {
  const mods = getIndividualFocusMods(player)
  if (mods.isRest) {
    player.developmentFatigue = clamp((player.developmentFatigue ?? 0) - 8, 0, 100)
    return player
  }
  const cats =
    mods.focusedCats === 'all' || !mods.focusedCats
      ? Object.keys(PLAYER_STAT_CATEGORIES)
      : mods.focusedCats
  const mult = growthMultiplier(player, 0.9)
  const attempts = 2
  for (let i = 0; i < attempts; i += 1) {
    const weights = cats.map((c) => mods.categoryPickWeight(c))
    const total = weights.reduce((s, w) => s + w, 0)
    let roll = rng() * total
    let cat = cats[0]
    for (let j = 0; j < cats.length; j += 1) {
      roll -= weights[j]
      if (roll <= 0) {
        cat = cats[j]
        break
      }
    }
    const chance = Math.min(0.85, 0.32 + mult * 0.35 * mods.categoryGrowthMult(cat))
    if (rng() > chance) continue
    const key = pickSubKey(cat, rng)
    if (!key) continue
    const pot = player.potential ?? 80
    const current = getSubStat(player.skills, cat, key)
    if (current >= pot + 3 && rng() > 0.15) continue
    player.skills = bumpSubStat(player.skills, cat, key, 1)
  }
  player.developmentFatigue = clamp((player.developmentFatigue ?? 0) + 4, 0, 100)
  return player
}

/**
 * Uzupełnia age / potential / fatigue / trainingFocus (idempotentnie).
 */
export function ensurePlayerDevelopment(player, options = {}) {
  if (!player) return player
  player.skills = normalizePlayerSkills(player.skills ?? {})
  const ovr = getOverallRating(player.skills)
  const perf = performanceScore01(player, options.leaguePlayerStats ?? null)

  if (player.age == null || !Number.isFinite(player.age)) {
    player.age = rollInitialAge(player)
  }
  if (player.potential == null || !Number.isFinite(player.potential)) {
    // Drużyny Ligi Europejskiej mają dodatkowy "boost" bieżącego OVR między poziomami
    // piramidy (patrz TIER_BASE_OFFSET w eucsLeagueTeams.js) — sufit rozwoju ma go
    // ignorować, więc przy pierwszym liczeniu potencjału używamy OVR sprzed boostu.
    const potentialBaseline = Number.isFinite(player.eucsBaselineOvr) ? player.eucsBaselineOvr : ovr
    player.potential = computePotential(player, potentialBaseline, perf)
  } else {
    // Potencjał nie powinien spaść poniżej OVR − 2 (chyba że veteran)
    const minPot = player.age >= 30 ? Math.min(player.potential, ovr + 1) : player.potential
    player.potential = clamp(Math.max(minPot, ovr - (player.age >= 33 ? 4 : 1)), 62, 95)
  }
  if (player.developmentFatigue == null) player.developmentFatigue = 0
  if (player.matchStamina == null) player.matchStamina = MATCH_STAMINA_CONFIG.default
  if (!player.trainingFocus || !FOCUS_CONFIG[player.trainingFocus]) {
    player.trainingFocus = 'balanced'
  }
  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  ensurePlayerTraits(player)
  ensurePlayerInjury(player)
  return player
}

/** AI: wybór fokusów wg pozycji i najsłabszych kategorii vs potencjał. */
export function pickAiTrainingFocus(player, rng = Math.random) {
  ensurePlayerDevelopment(player)
  const fatigue = player.developmentFatigue ?? 0
  if (fatigue >= 72) return 'rest'
  if (fatigue >= 55 && rng() < 0.55) return 'rest'

  const ovr = getOverallRating(player.skills)
  const room = (player.potential ?? ovr) - ovr
  if (player.age >= 31 && rng() < 0.35) return 'rest'
  if (room <= 1 && player.age >= 29) return rng() < 0.5 ? 'rest' : 'mental'

  const cats = Object.keys(PLAYER_STAT_CATEGORIES)
  const ranked = [...cats].sort(
    (a, b) => getCategoryOverall(player.skills, a) - getCategoryOverall(player.skills, b),
  )
  const weakest = ranked[0]
  const throwing = getCategoryOverall(player.skills, 'throwing')

  if (rng() < 0.22) return 'balanced'
  if (throwing >= 74 && rng() < 0.35) return 'throwing'
  if (throwing < 74 && weakest === 'offensive' && rng() < 0.4) return 'offensive'
  if (weakest === 'defensive' && rng() < 0.35) return 'defensive'
  if (weakest === 'physical' && player.age < 30) return 'physical'
  if (FOCUS_CONFIG[weakest]) return weakest
  return 'balanced'
}

export function assignAiTrainingPlans(world, playerTeamId, rng = Math.random) {
  for (const team of worldTeamsList(world)) {
    const isPlayer = team.id === playerTeamId
    for (const player of team.players ?? []) {
      ensurePlayerDevelopment(player)
      if (isPlayer) continue // menedżer ustawia ręcznie
      player.trainingFocus = pickAiTrainingFocus(player, rng)
    }
  }
  return world
}

export function initWorldPlayerDevelopment(world, options = {}) {
  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      ensurePlayerDevelopment(player, options)
    }
  }
  assignAiTrainingPlans(world, options.playerTeamId ?? null)
  // Lazy import uniknięty — inicjalizacja AI planów treningowych w createCareer / startNextSeason
  return world
}

/** Czy drużyna ma zaplanowany trening w danym dniu (bez importu teamTraining). */
function teamHasTrainingPlanOnDate(team, isoDate) {
  const tt = team?.teamTraining
  if (!tt || !isoDate) return false
  const date = String(isoDate).slice(0, 10)
  const dow = parseISODate(date).getDay()
  for (const w of tt.weekly ?? []) {
    if (w.enabled === false) continue
    if (w.weekday === dow) return true
  }
  for (const o of tt.oneOff ?? []) {
    if (o.completed) continue
    if (o.date === date) return true
  }
  return false
}

/**
 * Dzienny wzrost prospektów akademii. Nie trenują z seniorami (poza `team.players`,
 * patrz runSessionCore w teamTraining.js), więc bez tego ticka jedyny ich rozwój to
 * `applyAcademyOffseasonDevelopment` — 2 sesje na CAŁY offseason, zero w trakcie sezonu.
 * Reużywa growthMultiplier/getIndividualFocusMods jak `applyOffseasonCampGrowth`, tylko
 * skalowane przez dayScale (ta sama konwencja co reszta tego ticka).
 */
function applyAcademyDailyGrowth(player, dayScale, rng) {
  ensurePlayerDevelopment(player)
  const mods = getIndividualFocusMods(player)
  if (mods.isRest) return
  const cats =
    mods.focusedCats === 'all' || !mods.focusedCats
      ? Object.keys(PLAYER_STAT_CATEGORIES)
      : mods.focusedCats
  const mult = growthMultiplier(player, 0.85)
  const weights = cats.map((c) => mods.categoryPickWeight(c))
  const total = weights.reduce((s, w) => s + w, 0)
  let roll = rng() * total
  let cat = cats[0]
  for (let j = 0; j < cats.length; j += 1) {
    roll -= weights[j]
    if (roll <= 0) {
      cat = cats[j]
      break
    }
  }
  const weeklyChance = Math.min(0.9, 0.5 * mult * mods.categoryGrowthMult(cat))
  if (rng() > weeklyChance * dayScale) return
  const key = pickSubKey(cat, rng)
  if (!key) return
  const pot = player.potential ?? 80
  const current = getSubStat(player.skills, cat, key)
  if (current >= pot + 3 && rng() > 0.15) return
  player.skills = bumpSubStat(player.skills, cat, key, 1)
}

/**
 * Dzienny tick: aging / AI fokus / pasywna regeneracja.
 * Wzrost skilli tylko na treningach drużynowych (fokus = modyfikator sesji).
 */
export function applyDailyDevelopment(league, options = {}) {
  const teamsById = league?.teamsById
  if (!teamsById) return { league, changes: 0 }

  const dayScale = options.dayScale ?? 1 / 7
  const isoDate = options.date ? String(options.date).slice(0, 10) : null
  const rng = mulberry32(
    seedFrom(league, options.tag ?? `day-dev-${isoDate ?? league.currentDate ?? ''}`),
  )
  const playerTeamId = options.playerTeamId ?? league.playerTeamId
  let changes = 0

  for (const team of Object.values(teamsById)) {
    const isPlayer = team.id === playerTeamId
    const hadTeamTraining =
      typeof options.hadTeamTraining === 'boolean'
        ? options.hadTeamTraining
        : isoDate
          ? teamHasTrainingPlanOnDate(team, isoDate)
          : false

    for (const player of team.players ?? []) {
      ensurePlayerDevelopment(player, {
        leaguePlayerStats: league.playerStats,
      })
      if (!isPlayer && rng() < 0.28 * dayScale) {
        player.trainingFocus = pickAiTrainingFocus(player, rng)
      }

      const before = getOverallRating(player.skills)
      if ((player.age ?? 0) >= 30) {
        applyAgingDecline(player, 0.22 * dayScale, rng)
      }

      if (!hadTeamTraining) {
        const mods = getIndividualFocusMods(player)
        player.developmentFatigue = clamp(
          (player.developmentFatigue ?? 0) - mods.passiveRecovery,
          0,
          100,
        )
      }

      // Regeneracja staminy meczowej — działa też w dniu treningu (mocno wolniej),
      // ale nigdy powyżej pułapu narzuconego przez zmęczenie ogólne.
      const matchRecoveryMult = hadTeamTraining
        ? MATCH_STAMINA_CONFIG.trainingDayRecoveryMult
        : 1
      const matchStaminaCeilingValue = matchStaminaCeiling(player)
      player.matchStamina = Math.min(
        matchStaminaCeilingValue,
        currentMatchStamina(player) +
          MATCH_STAMINA_CONFIG.dailyRecovery * medicalRecoveryMult(team) * matchRecoveryMult,
      )

      tickPlayerInjury(player, {
        restBonus: player.trainingFocus === 'rest',
      })

      const perf = performanceScore01(player, league.playerStats)
      if ((player.age ?? 99) <= 25 && perf >= 0.65 && rng() < 0.12 * dayScale) {
        const ovr = getOverallRating(player.skills)
        player.potential = clamp((player.potential ?? ovr) + 1, ovr, 95)
      }

      if (getOverallRating(player.skills) !== before) changes += 1
    }

    for (const prospect of team.academyPlayers ?? []) {
      const before = getOverallRating(prospect.skills)
      applyAcademyDailyGrowth(prospect, dayScale, rng)
      if (getOverallRating(prospect.skills) !== before) changes += 1
    }
  }

  return { league, changes }
}

/**
 * Dzienny rozwój dla zakresu dat [fromIso, toIso).
 */
export function applyDailyDevelopmentDateRange(league, fromIso, toIso, options = {}) {
  if (!fromIso || !toIso || fromIso >= toIso) return { changes: 0, days: 0 }
  let cursor = fromIso
  let changes = 0
  let days = 0
  let guard = 0
  while (cursor < toIso && guard < 400) {
    const result = applyDailyDevelopment(league, {
      ...options,
      date: cursor,
      tag: options.tag ?? `range-${cursor}`,
    })
    changes += result.changes ?? 0
    days += 1
    cursor = formatISODate(addDays(parseISODate(cursor), 1))
    guard += 1
  }
  return { changes, days }
}

export async function applyDailyDevelopmentDateRangeAsync(league, fromIso, toIso, options = {}) {
  if (!fromIso || !toIso || fromIso >= toIso) return { changes: 0, days: 0 }
  const onProgress = options.onProgress
  const yieldEvery = options.yieldEvery ?? 4
  let cursor = fromIso
  let changes = 0
  let days = 0
  let guard = 0
  const total = Math.max(
    1,
    Math.round(
      (parseISODate(toIso).getTime() - parseISODate(fromIso).getTime()) / 86_400_000,
    ),
  )
  while (cursor < toIso && guard < 400) {
    const result = applyDailyDevelopment(league, {
      ...options,
      date: cursor,
      tag: options.tag ?? `range-${cursor}`,
    })
    changes += result.changes ?? 0
    days += 1
    guard += 1
    if (onProgress && days % yieldEvery === 0) {
      onProgress({
        phase: 'development',
        daysAdvanced: days,
        total,
        currentDate: cursor,
      })
      await new Promise((r) => setTimeout(r, 0))
    }
    cursor = formatISODate(addDays(parseISODate(cursor), 1))
  }
  return { changes, days }
}

/**
 * @deprecated Używaj applyDailyDevelopment — zostawione jako 7× dzienny tick.
 */
export function applyWeeklyDevelopment(league, options = {}) {
  let changes = 0
  for (let i = 0; i < 7; i += 1) {
    const result = applyDailyDevelopment(league, {
      ...options,
      tag: `${options.tag ?? 'week-dev'}-d${i}`,
    })
    changes += result.changes ?? 0
  }
  return { league, changes }
}

/**
 * +1 rok dla całego świata (koniec sezonu).
 * @returns {number} liczba zawodników
 */
export function ageWorldPlayersOneYear(world) {
  let aged = 0
  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      ensurePlayerDevelopment(player)
      player.age = (player.age ?? 25) + 1
      aged += 1
    }
  }
  return aged
}

/**
 * Offseason: rozwój/decline, aktualizacja potencjału, regeneracja.
 * Wiek (+1) jest już naliczany w finalizeSeason / ageWorldPlayersOneYear.
 */
export function applyOffseasonDevelopment(world, options = {}) {
  const rng = mulberry32((options.seed ?? 2025) >>> 0)
  const stats = options.leaguePlayerStats ?? null
  let aged = 0

  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      ensurePlayerDevelopment(player, { leaguePlayerStats: stats })
      aged += 1

      // Kolejny rok w klubie → wyższy cel dryfu lojalności.
      incrementPlayerClubTenure(player)
      applyLoyaltyTenureDrift(player, { strength: 0.4 })

      const perf = performanceScore01(player, stats)
      const ovrBefore = getOverallRating(player.skills)

      // Obóz offseason: kilka sesji wzrostu wg fokusu (nie osobny „trening indywidualny”)
      if (!options.skipAiPlans && team.id !== options.playerTeamId) {
        player.trainingFocus = pickAiTrainingFocus(player, rng)
      }
      const weeks = 3 + Math.floor(rng() * 2)
      for (let w = 0; w < weeks; w += 1) {
        if ((player.age ?? 0) >= 30) applyAgingDecline(player, 0.55, rng)
        applyOffseasonCampGrowth(player, rng)
      }

      // Extra decline dla weteranów
      if (player.age >= 30) applyAgingDecline(player, 0.9, rng)
      if (player.age >= 33) applyAgingDecline(player, 0.7, rng)

      const ovr = getOverallRating(player.skills)
      player.potential = computePotential(player, ovr, perf)
      // Sezonowa forma młodych: nie gub wysokiego potencjału od razu
      if (player.age <= 26 && perf >= 0.6) {
        player.potential = clamp(
          Math.max(player.potential, ovrBefore + 8 + Math.round(perf * 6)),
          62,
          95,
        )
      }

      player.developmentFatigue = clamp((player.developmentFatigue ?? 0) * 0.25, 0, 40)
      player.matchStamina = matchStaminaCeiling(player)
      shortenInjuryForOffseason(player)
      if (player.trainingFocus === 'rest') player.trainingFocus = 'balanced'
    }
  }

  assignAiTrainingPlans(world, options.playerTeamId ?? null, rng)
  return { world, aged }
}

export function setPlayerTrainingFocus(player, focusId) {
  ensurePlayerDevelopment(player)
  if (!FOCUS_CONFIG[focusId]) return player
  player.trainingFocus = focusId
  return player
}

export function setTeamTrainingFocus(team, focusId) {
  for (const player of team?.players ?? []) {
    setPlayerTrainingFocus(player, focusId)
  }
  return team
}
