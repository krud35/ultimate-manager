/**
 * Kibice klubu: wielkość fanbase (jednostki) + cechy charakteru trybun.
 * Losowane przy tworzeniu świata kariery; stare save'y dostają stabilny seed.
 */

import { createRng } from '../matchEngine/rng.js'
import { getTeamReputation, ensureTeamReputation } from './teamReputation.js'
import { ensurePlayerTraits, getTraitMods } from './playerTraits.js'

export const FANS_GEN_VERSION = 1

export const FAN_SIZE_MIN = 350
export const FAN_SIZE_MAX = 22_000
export const FAN_MOOD_DEFAULT = 58
export const FAN_MOOD_MIN = 15
export const FAN_MOOD_MAX = 99

/** Pary cech, które się wykluczają przy losowaniu. */
const TRAIT_CONFLICTS = [
  ['loyal', 'fickle'],
  ['patient', 'demanding'],
  ['fair', 'ultras'],
  ['family', 'ultras'],
  ['traditional', 'festive'],
]

/**
 * @typedef {object} FanTraitDef
 * @property {string} id
 * @property {string} namePl
 * @property {string} nameEn
 * @property {'positive'|'negative'|'mixed'} polarity
 * @property {string} blurbPl
 * @property {string} blurbEn
 */

/** @type {Record<string, FanTraitDef>} */
export const FAN_TRAIT_DEFS = {
  loyal: {
    id: 'loyal',
    namePl: 'Wierny',
    nameEn: 'Loyal',
    polarity: 'positive',
    blurbPl: 'Trzyma z klubem także w dołku formy.',
    blurbEn: 'Sticks with the club even through rough patches.',
  },
  demanding: {
    id: 'demanding',
    namePl: 'Wymagający',
    nameEn: 'Demanding',
    polarity: 'mixed',
    blurbPl: 'Oczekuje wyników i szybkich decyzji zarządu.',
    blurbEn: 'Expects results and quick board decisions.',
  },
  passionate: {
    id: 'passionate',
    namePl: 'Gorący',
    nameEn: 'Passionate',
    polarity: 'mixed',
    blurbPl: 'Emocje na trybunach rosną szybciej niż wynik.',
    blurbEn: 'Emotions on the terraces rise faster than the score.',
  },
  vocal: {
    id: 'vocal',
    namePl: 'Głośny',
    nameEn: 'Vocal',
    polarity: 'mixed',
    blurbPl: 'Śpiewy i okrzyki — także krytyczne — niosą się daleko.',
    blurbEn: 'Chants and shouts — including critical ones — carry far.',
  },
  patient: {
    id: 'patient',
    namePl: 'Cierpliwy',
    nameEn: 'Patient',
    polarity: 'positive',
    blurbPl: 'Daje projektowi czas, zanim zacznie gwizdać.',
    blurbEn: 'Gives the project time before the boos start.',
  },
  fickle: {
    id: 'fickle',
    namePl: 'Kapryśny',
    nameEn: 'Fickle',
    polarity: 'negative',
    blurbPl: 'Nastrój trybun skacze z tygodnia na tydzień.',
    blurbEn: 'Terrace mood swings week to week.',
  },
  traditional: {
    id: 'traditional',
    namePl: 'Tradycyjny',
    nameEn: 'Traditional',
    polarity: 'mixed',
    blurbPl: 'Ceni tożsamość, barwy i stare pieśni.',
    blurbEn: 'Values identity, colors and old songs.',
  },
  critical: {
    id: 'critical',
    namePl: 'Krytyczny',
    nameEn: 'Critical',
    polarity: 'negative',
    blurbPl: 'Szybko wyłapuje błędy sztabu i składu.',
    blurbEn: 'Quick to spot staff and roster mistakes.',
  },
  festive: {
    id: 'festive',
    namePl: 'Imprezowy',
    nameEn: 'Festive',
    polarity: 'positive',
    blurbPl: 'Lubią show, merch i wspólne wydarzenia.',
    blurbEn: 'Love the show, merch and community events.',
  },
  fair: {
    id: 'fair',
    namePl: 'Fair play',
    nameEn: 'Fair-minded',
    polarity: 'positive',
    blurbPl: 'Szanuje rywali i ducha gry.',
    blurbEn: 'Respects opponents and the spirit of the game.',
  },
  ultras: {
    id: 'ultras',
    namePl: 'Ultras',
    nameEn: 'Ultras',
    polarity: 'mixed',
    blurbPl: 'Zorganizowana grupa — oprawy i twarda opinia.',
    blurbEn: 'Organized group — displays and a hard opinion.',
  },
  family: {
    id: 'family',
    namePl: 'Rodzinny',
    nameEn: 'Family-oriented',
    polarity: 'positive',
    blurbPl: 'Dużo rodzin i juniorów na trybunach.',
    blurbEn: 'Lots of families and juniors in the stands.',
  },
}

const ALL_TRAIT_IDS = Object.keys(FAN_TRAIT_DEFS)

function hashString(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clampSize(n) {
  return Math.max(FAN_SIZE_MIN, Math.min(FAN_SIZE_MAX, Math.round(n)))
}

function clampMood(n) {
  return Math.max(FAN_MOOD_MIN, Math.min(FAN_MOOD_MAX, Math.round(n)))
}

function conflictsWith(picked, candidate) {
  for (const [a, b] of TRAIT_CONFLICTS) {
    if (
      (picked.includes(a) && candidate === b) ||
      (picked.includes(b) && candidate === a)
    ) {
      return true
    }
  }
  return false
}

/**
 * @param {() => number} floatRng
 * @returns {string[]}
 */
export function rollFanTraits(floatRng) {
  const count = floatRng() < 0.35 ? 3 : 2
  const pool = [...ALL_TRAIT_IDS]
  const picked = []
  while (picked.length < count && pool.length) {
    const idx = Math.floor(floatRng() * pool.length)
    const id = pool.splice(idx, 1)[0]
    if (conflictsWith(picked, id)) continue
    picked.push(id)
  }
  if (!picked.length) picked.push('loyal')
  return picked
}

/**
 * Wielkość fanbase zależy lekko od reputacji + los (seedowany).
 * @param {object} team
 * @param {() => number} floatRng
 */
export function rollFanSize(team, floatRng) {
  ensureTeamReputation(team)
  const rep = getTeamReputation(team)
  // ~40 rep → ~2.5k, ~70 → ~7k, ~90 → ~14k + szum
  const base = 900 + (rep - 35) * 180
  const noise = (floatRng() - 0.5) * 5200
  const spike = floatRng() < 0.12 ? 3500 + floatRng() * 5000 : 0
  const dip = floatRng() < 0.1 ? -(1800 + floatRng() * 2200) : 0
  return clampSize(base + noise + spike + dip)
}

export function rollFanMood(floatRng) {
  return clampMood(42 + floatRng() * 28)
}

/**
 * Pełne wylosowanie fanów dla klubu (mutacja in-place).
 * @param {object} team
 * @param {{ seed?: number|string, force?: boolean }} [options]
 */
export function seedTeamFans(team, options = {}) {
  if (!team) return team
  const force = !!options.force
  if (
    !force &&
    team.fans &&
    typeof team.fans === 'object' &&
    team.fans.fansGen === FANS_GEN_VERSION &&
    typeof team.fans.size === 'number' &&
    Array.isArray(team.fans.traits) &&
    team.fans.traits.length
  ) {
    team.fans.size = clampSize(team.fans.size)
    team.fans.mood = clampMood(
      typeof team.fans.mood === 'number' ? team.fans.mood : FAN_MOOD_DEFAULT,
    )
    team.fans.traits = sanitizeTraitIds(team.fans.traits)
    return team
  }

  const seedKey = `fans|${options.seed ?? 0}|${team.id ?? team.name ?? 'club'}`
  const rng = createRng(hashString(seedKey))
  const float = () => rng.float()

  team.fans = {
    fansGen: FANS_GEN_VERSION,
    size: rollFanSize(team, float),
    traits: rollFanTraits(float),
    mood: rollFanMood(float),
  }
  return team
}

function sanitizeTraitIds(ids) {
  const out = []
  for (const id of ids ?? []) {
    const key = FAN_TRAIT_DEFS[id] ? id : null
    if (key && !out.includes(key)) out.push(key)
  }
  return out.length ? out.slice(0, 3) : ['loyal']
}

export function ensureTeamFans(team, options = {}) {
  if (!team) return team
  if (
    !team.fans ||
    typeof team.fans !== 'object' ||
    team.fans.fansGen !== FANS_GEN_VERSION ||
    typeof team.fans.size !== 'number' ||
    !Array.isArray(team.fans.traits) ||
    !team.fans.traits.length
  ) {
    return seedTeamFans(team, options)
  }
  team.fans.size = clampSize(team.fans.size)
  team.fans.mood = clampMood(
    typeof team.fans.mood === 'number' ? team.fans.mood : FAN_MOOD_DEFAULT,
  )
  team.fans.traits = sanitizeTraitIds(team.fans.traits)
  team.fans.fansGen = FANS_GEN_VERSION
  return team
}

export function ensureWorldFans(world, options = {}) {
  if (!world?.teamsById) return world
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  const seed = options.seed ?? world.templateSeasonYear ?? 2025
  for (const id of ids) {
    const team = world.teamsById[id]
    if (team) ensureTeamFans(team, { seed, force: !!options.force })
  }
  return world
}

export function getFanSize(team) {
  ensureTeamFans(team)
  return team?.fans?.size ?? FAN_SIZE_MIN
}

export function getFanMood(team) {
  ensureTeamFans(team)
  return team?.fans?.mood ?? FAN_MOOD_DEFAULT
}

export function getFanTraits(team) {
  ensureTeamFans(team)
  return team?.fans?.traits ?? []
}

export function teamHasFanTrait(team, traitId) {
  return getFanTraits(team).includes(traitId)
}

/**
 * @param {number} size
 * @param {string} [lang]
 */
export function formatFanSize(size, lang = 'pl') {
  const n = clampSize(size)
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'pl-PL').format(n)
  } catch {
    return String(n)
  }
}

export function fanSizeLabel(size, lang = 'pl') {
  const n = clampSize(size)
  if (lang === 'en') {
    if (n >= 14_000) return 'Huge'
    if (n >= 8_000) return 'Large'
    if (n >= 4_000) return 'Solid'
    if (n >= 1_800) return 'Modest'
    return 'Small'
  }
  if (n >= 14_000) return 'Ogromny'
  if (n >= 8_000) return 'Duży'
  if (n >= 4_000) return 'Solidny'
  if (n >= 1_800) return 'Skromny'
  return 'Mały'
}

export function fanMoodLabel(mood = FAN_MOOD_DEFAULT, lang = 'pl') {
  const m = clampMood(mood)
  if (lang === 'en') {
    if (m >= 80) return 'Ecstatic'
    if (m >= 65) return 'Happy'
    if (m >= 50) return 'Neutral'
    if (m >= 35) return 'Restless'
    return 'Furious'
  }
  if (m >= 80) return 'Entuzjastyczny'
  if (m >= 65) return 'Zadowolony'
  if (m >= 50) return 'Neutralny'
  if (m >= 35) return 'Niespokojny'
  return 'Wściekły'
}

export function fanMoodToneClass(mood = FAN_MOOD_DEFAULT) {
  const m = clampMood(mood)
  if (m >= 75) return 'text-emerald-400'
  if (m >= 60) return 'text-ufa-gold'
  if (m >= 45) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * @param {string} traitId
 * @param {string} [lang]
 */
export function fanTraitLabel(traitId, lang = 'pl') {
  const def = FAN_TRAIT_DEFS[traitId]
  if (!def) return traitId
  return lang === 'en' ? def.nameEn : def.namePl
}

export function fanTraitBlurb(traitId, lang = 'pl') {
  const def = FAN_TRAIT_DEFS[traitId]
  if (!def) return ''
  return lang === 'en' ? def.blurbEn : def.blurbPl
}

export function fanTraitToneClass(traitId) {
  const pol = FAN_TRAIT_DEFS[traitId]?.polarity
  if (pol === 'positive') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
  if (pol === 'negative') return 'text-red-400 border-red-500/30 bg-red-500/10'
  return 'text-amber-300 border-amber-500/30 bg-amber-500/10'
}

/**
 * @param {object} team
 * @param {number} delta
 */
export function adjustFanMood(team, delta) {
  if (!team || !delta) return getFanMood(team)
  ensureTeamFans(team)
  const traits = getFanTraits(team)
  let scaled = delta
  if (traits.includes('loyal') && delta < 0) scaled *= 0.65
  if (traits.includes('fickle')) scaled *= 1.35
  if (traits.includes('passionate')) scaled *= 1.2
  if (traits.includes('patient') && delta < 0) scaled *= 0.75
  if (traits.includes('demanding') && delta < 0) scaled *= 1.25
  if (traits.includes('critical') && delta < 0) scaled *= 1.15
  team.fans.mood = clampMood(team.fans.mood + scaled)
  return team.fans.mood
}

/**
 * @param {object} team
 * @param {number} delta — zmiana liczby kibiców
 */
export function adjustFanSize(team, delta) {
  if (!team || !delta) return getFanSize(team)
  ensureTeamFans(team)
  team.fans.size = clampSize(team.fans.size + delta)
  return team.fans.size
}

/**
 * Lekka aktualizacja nastroju kibiców po meczu.
 * @param {object} team
 * @param {{ won?: boolean, margin?: number, competition?: string, isHome?: boolean, boxScore?: object|object[]|null }} [opts]
 */
export function applyFansMoodAfterMatch(
  team,
  { won, margin = 0, competition = 'league', isHome = false, boxScore = null } = {},
) {
  if (!team) return
  ensureTeamFans(team)
  const gap = Math.max(0, Math.round(margin))
  const cupMult = competition === 'cup' ? 1.15 : 1
  const venueMult = isHome ? 1.2 : 0.85

  let delta = 0
  if (won) {
    delta += (2.2 + Math.min(4, gap * 0.55)) * cupMult * venueMult
  } else {
    delta -= (2.8 + Math.min(5, gap * 0.7)) * cupMult * venueMult
  }

  // Showman: gole/asysty lekko podbijają nastrój trybun.
  if (boxScore && won) {
    let showBoost = 0
    for (const p of team.players ?? []) {
      ensurePlayerTraits(p)
      const mult = getTraitMods(p).performanceFanMoodMult ?? 1
      if (mult <= 1.05) continue
      const row = boxRowForFanMood(boxScore, p.id)
      if (!row) continue
      const ga = (row.goals ?? 0) + (row.assists ?? 0)
      if (ga > 0) showBoost += ga * (mult - 1) * 0.55
    }
    delta += Math.min(2.5, showBoost)
  }

  // Dryf do środka — unikamy wiecznego 99 / 15.
  delta += (FAN_MOOD_DEFAULT - team.fans.mood) * 0.04

  adjustFanMood(team, delta)
}

function boxRowForFanMood(boxScore, playerId) {
  if (!boxScore) return null
  if (Array.isArray(boxScore)) {
    return boxScore.find((r) => r.playerId === playerId || r.id === playerId) ?? null
  }
  return boxScore[playerId] ?? null
}

export function applyFansMoodForMatchTeams(
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  { competition = 'league', boxScore = null } = {},
) {
  const hs = homeScore ?? 0
  const as = awayScore ?? 0
  if (hs === as) return
  const margin = Math.abs(hs - as)
  const homeWon = hs > as
  applyFansMoodAfterMatch(homeTeam, {
    won: homeWon,
    margin,
    competition,
    isHome: true,
    boxScore,
  })
  applyFansMoodAfterMatch(awayTeam, {
    won: !homeWon,
    margin,
    competition,
    isHome: false,
    boxScore,
  })
}
