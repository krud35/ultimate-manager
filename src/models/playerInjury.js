/**
 * Kontuzje zawodnika — prosty model: out na N dni kalendarzowych.
 * player.injury = null | { daysRemaining, label, source: 'match'|'training' }
 */

import { getTraitMods, ensurePlayerTraits } from './playerTraits.js'

export const INJURY_LABELS = [
  'naciągnięcie',
  'skręcenie',
  'stłuczenie',
  'nadwyrężenie',
  'uraz mięśniowy',
]

const INJURY_LABEL_EN = {
  naciągnięcie: 'strain',
  skręcenie: 'sprain',
  stłuczenie: 'bruise',
  nadwyrężenie: 'overstretch',
  'uraz mięśniowy': 'muscle injury',
}

/** PL label → EN (fallback: same string). */
export function injuryLabelEn(labelPl) {
  if (!labelPl) return ''
  return INJURY_LABEL_EN[labelPl] ?? labelPl
}

export const INJURY_DAY_RANGES = {
  training_light: { min: 1, max: 4 },
  training_medium: { min: 2, max: 7 },
  training_high: { min: 3, max: 10 },
  match: { min: 2, max: 14 },
  match_ai: { min: 2, max: 12 },
}

/** Bazowe szanse (0–1) wg planu. */
export const INJURY_BASE_CHANCE = {
  training_light: 0.0015,
  training_medium: 0.004,
  training_high: 0.01,
  /** Po punkcie, gracz na boisku (live). */
  match_point: 0.0008,
  /** Po meczu AI, pointsPlayed > 0. */
  match_ai: 0.008,
}

function clampDays(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

export function ensurePlayerInjury(player) {
  if (!player) return player
  if (player.injury == null) {
    player.injury = null
    return player
  }
  if (typeof player.injury !== 'object') {
    player.injury = null
    return player
  }
  const days = clampDays(player.injury.daysRemaining)
  if (days <= 0) {
    player.injury = null
    return player
  }
  player.injury = {
    daysRemaining: days,
    label:
      typeof player.injury.label === 'string' && player.injury.label
        ? player.injury.label
        : INJURY_LABELS[0],
    source: player.injury.source === 'training' ? 'training' : 'match',
  }
  return player
}

export function isPlayerInjured(player) {
  ensurePlayerInjury(player)
  return Boolean(player?.injury && player.injury.daysRemaining > 0)
}

export function isPlayerAvailable(player) {
  return !isPlayerInjured(player)
}

export function getInjuryDaysRemaining(player) {
  if (!isPlayerInjured(player)) return 0
  return player.injury.daysRemaining
}

export function pickInjuryLabel(rng = Math.random) {
  const i = Math.floor(rng() * INJURY_LABELS.length)
  return INJURY_LABELS[Math.max(0, Math.min(INJURY_LABELS.length - 1, i))]
}

/**
 * Losuje liczbę dni z zakresu (inclusive).
 * @param {() => number} rng
 * @param {{ min: number, max: number } | string} rangeOrKey
 */
export function rollInjuryDays(rng = Math.random, rangeOrKey = 'match') {
  const range =
    typeof rangeOrKey === 'string'
      ? INJURY_DAY_RANGES[rangeOrKey] ?? INJURY_DAY_RANGES.match
      : rangeOrKey
  const min = range.min ?? 1
  const max = Math.max(min, range.max ?? min)
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * Ustawia kontuzję. Nie nadpisuje dłuższej krótszą.
 * @returns {boolean} czy stan się zmienił (nowa lub wydłużona)
 */
export function injurePlayer(player, { days, label, source = 'match' } = {}) {
  if (!player) return false
  ensurePlayerInjury(player)
  const nextDays = clampDays(days)
  if (nextDays <= 0) return false

  const nextLabel = label || pickInjuryLabel()
  const nextSource = source === 'training' ? 'training' : 'match'

  if (player.injury && player.injury.daysRemaining >= nextDays) {
    return false
  }

  player.injury = {
    daysRemaining: nextDays,
    label: nextLabel,
    source: nextSource,
  }
  return true
}

/**
 * Dzienny tick gojenia. Fokus rest → -2, inaczej -1.
 * @returns {{ healed: boolean, daysRemaining: number }}
 */
export function tickPlayerInjury(player, { restBonus = false } = {}) {
  ensurePlayerInjury(player)
  if (!player.injury) {
    return { healed: false, daysRemaining: 0 }
  }
  const step = restBonus ? 2 : 1
  player.injury.daysRemaining = clampDays(player.injury.daysRemaining - step)
  if (player.injury.daysRemaining <= 0) {
    player.injury = null
    return { healed: true, daysRemaining: 0 }
  }
  return { healed: false, daysRemaining: player.injury.daysRemaining }
}

/** Skrócenie kontuzji na offseason (×0.25, max 7 dni). */
export function shortenInjuryForOffseason(player) {
  ensurePlayerInjury(player)
  if (!player.injury) return player
  const next = Math.ceil(player.injury.daysRemaining * 0.25)
  player.injury.daysRemaining = Math.min(7, Math.max(1, next))
  return player
}

/**
 * Szansa kontuzji treningowej (0–1) wg intensywności, zmęczenia i fokusów sesji.
 */
export function trainingInjuryChance(player, intensityId, focuses = []) {
  ensurePlayerInjury(player)
  if (isPlayerInjured(player)) return 0

  const key =
    intensityId === 'light'
      ? 'training_light'
      : intensityId === 'high'
        ? 'training_high'
        : 'training_medium'
  let p = INJURY_BASE_CHANCE[key]

  const fatigue = player.developmentFatigue ?? 0
  if (fatigue >= 80) p *= 2
  else if (fatigue >= 60) p *= 1.5
  else if (fatigue >= 40) p *= 1.15

  const focusList = Array.isArray(focuses) ? focuses : []
  if (focusList.includes('rest')) p *= 0.35
  if (focusList.includes('physical')) p *= 1.25

  return Math.min(0.12, p)
}

/**
 * Szansa kontuzji po punkcie (live) — stamina 0–100.
 */
export function matchPointInjuryChance(stamina = 100) {
  let p = INJURY_BASE_CHANCE.match_point
  const s = Number.isFinite(stamina) ? stamina : 100
  if (s < 30) p *= 4
  else if (s < 45) p *= 2.5
  else if (s < 60) p *= 1.5
  return Math.min(0.05, p)
}

/**
 * Szansa kontuzji po meczu AI — stamina końcowa.
 */
export function matchAiInjuryChance(stamina = 100) {
  let p = INJURY_BASE_CHANCE.match_ai
  const s = Number.isFinite(stamina) ? stamina : 100
  if (s < 35) p *= 1.8
  else if (s < 55) p *= 1.3
  return Math.min(0.08, p)
}

/**
 * Roll treningowy — przy trafieniu ustawia kontuzję.
 * @returns {null | { daysRemaining: number, label: string, source: 'training' }}
 */
export function tryTrainingInjury(
  player,
  intensityId,
  focuses,
  rng = Math.random,
  { chanceMult = 1 } = {},
) {
  const chance = trainingInjuryChance(player, intensityId, focuses) * Math.max(0.5, chanceMult)
  if (chance <= 0 || rng() >= chance) return null

  const rangeKey =
    intensityId === 'light'
      ? 'training_light'
      : intensityId === 'high'
        ? 'training_high'
        : 'training_medium'
  const days = rollInjuryDays(rng, rangeKey)
  const label = pickInjuryLabel(rng)
  if (!injurePlayer(player, { days, label, source: 'training' })) return null
  return { ...player.injury }
}

/**
 * Roll po punkcie live.
 * @returns {null | { daysRemaining: number, label: string, source: 'match' }}
 */
export function tryMatchPointInjury(player, stamina, rng = Math.random, { chanceMult = 1 } = {}) {
  if (isPlayerInjured(player)) return null
  ensurePlayerTraits(player)
  const traitMult = getTraitMods(player).injuryChanceMult ?? 1
  const chance = matchPointInjuryChance(stamina) * Math.max(0.5, chanceMult * traitMult)
  if (rng() >= chance) return null
  const days = rollInjuryDays(rng, 'match')
  const label = pickInjuryLabel(rng)
  if (!injurePlayer(player, { days, label, source: 'match' })) return null
  return { ...player.injury }
}

/**
 * Roll po meczu AI.
 * @returns {null | { daysRemaining: number, label: string, source: 'match' }}
 */
export function tryMatchAiInjury(player, stamina, rng = Math.random, { chanceMult = 1 } = {}) {
  if (isPlayerInjured(player)) return null
  ensurePlayerTraits(player)
  const traitMult = getTraitMods(player).injuryChanceMult ?? 1
  const chance = matchAiInjuryChance(stamina) * Math.max(0.5, chanceMult * traitMult)
  if (rng() >= chance) return null
  const days = rollInjuryDays(rng, 'match_ai')
  const label = pickInjuryLabel(rng)
  if (!injurePlayer(player, { days, label, source: 'match' })) return null
  return { ...player.injury }
}

export function injuryStatusLabel(player, lang = 'pl') {
  if (!isPlayerInjured(player)) return null
  const days = player.injury.daysRemaining
  if (lang === 'en') {
    const dayWord = days === 1 ? 'day' : 'days'
    return `Injured · ${days} ${dayWord}`
  }
  const dayWord = days === 1 ? 'dzień' : 'dni'
  return `Kontuzja · ${days} ${dayWord}`
}

export function injuryToneClass() {
  return 'text-red-400'
}

/**
 * Kopiuje stan kontuzji z zawodników sesji meczu na roster ligi/świata
 * (sesja często trzyma płytkie kopie po applyStaminaToTeamPlayers).
 */
export function syncInjuriesFromMatchPlayers(sourcePlayers, targetRosters) {
  const targets = (Array.isArray(targetRosters) ? targetRosters : [targetRosters])
    .flatMap((roster) => roster ?? [])
  if (!sourcePlayers?.length || !targets.length) return []

  const byId = new Map(targets.map((p) => [p.id, p]))
  const synced = []
  for (const src of sourcePlayers) {
    if (!src?.id || !isPlayerInjured(src)) continue
    const dst = byId.get(src.id)
    if (!dst) continue
    dst.injury = {
      daysRemaining: src.injury.daysRemaining,
      label: src.injury.label,
      source: src.injury.source === 'training' ? 'training' : 'match',
    }
    synced.push({
      playerId: dst.id,
      name: `${dst.firstName ?? ''} ${dst.lastName ?? ''}`.trim() || String(dst.id),
      daysRemaining: dst.injury.daysRemaining,
      label: dst.injury.label,
      source: 'match',
    })
  }
  return synced
}

/** Lista aktywnych kontuzji z rosteru (do inbox). */
export function listActiveInjuries(players) {
  const out = []
  for (const player of players ?? []) {
    if (!isPlayerInjured(player)) continue
    out.push({
      playerId: player.id,
      name: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || String(player.id),
      daysRemaining: player.injury.daysRemaining,
      label: player.injury.label,
      source: player.injury.source === 'training' ? 'training' : 'match',
    })
  }
  return out
}
