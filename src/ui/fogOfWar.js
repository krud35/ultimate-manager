/**
 * Display-only fog-of-war helpers. Game mechanics keep exact values.
 */

/** Transfer-budget tiers (USD) → poor / neutral / rich. */
export function financeStateLabel(budget, lang = 'en') {
  const b = Math.max(0, Number(budget) || 0)
  if (lang === 'pl') {
    if (b < 550_000) return 'słabe'
    if (b < 1_200_000) return 'neutralne'
    return 'bogate'
  }
  if (b < 550_000) return 'poor'
  if (b < 1_200_000) return 'neutral'
  return 'rich'
}

export function financeStateToneClass(budget) {
  const b = Math.max(0, Number(budget) || 0)
  if (b < 550_000) return 'text-red-400'
  if (b < 1_200_000) return 'text-ufa-gold'
  return 'text-emerald-400'
}

/** Attribute 0–99 → bad / OK / good / outstanding. */
export function attributeBandLabel(value, lang = 'en') {
  const v = Number(value) || 0
  if (lang === 'pl') {
    if (v >= 85) return 'wybitny'
    if (v >= 70) return 'dobry'
    if (v >= 55) return 'OK'
    return 'słaby'
  }
  if (v >= 85) return 'outstanding'
  if (v >= 70) return 'good'
  if (v >= 55) return 'OK'
  return 'bad'
}

export function attributeBandToneClass(value) {
  const v = Number(value) || 0
  if (v >= 85) return 'text-emerald-400'
  if (v >= 70) return 'text-ufa-gold'
  if (v >= 55) return 'text-ufa-muted'
  return 'text-red-400'
}

/**
 * Znajomość (scouting) 0–100 → jak dokładnie pokazać atrybut.
 * <20 nieznany, 20–49 pasmo słowne, 50–79 przybliżony zakres, >=80 dokładna wartość.
 */
export function scoutKnowledgeTier(knowledge) {
  const k = Number(knowledge) || 0
  if (k < 20) return 'unknown'
  if (k < 50) return 'band'
  if (k < 80) return 'range'
  return 'exact'
}

/**
 * @param {number} value atrybut 0–99
 * @param {number} knowledge znajomość 0–100
 * @param {string} [lang]
 * @returns {{ kind: 'unknown'|'band'|'range'|'exact', label: string, toneClass: string }}
 */
export function scoutedValueDisplay(value, knowledge, lang = 'en') {
  const tier = scoutKnowledgeTier(knowledge)
  const v = Number(value) || 0
  if (tier === 'unknown') {
    return {
      kind: 'unknown',
      label: lang === 'pl' ? 'nieznany' : 'unknown',
      toneClass: 'text-ufa-muted',
    }
  }
  if (tier === 'band') {
    return { kind: 'band', label: attributeBandLabel(v, lang), toneClass: attributeBandToneClass(v) }
  }
  if (tier === 'range') {
    const k = Number(knowledge) || 0
    const spread = Math.round(12 - ((k - 50) / 29) * 8)
    const lo = Math.max(0, v - spread)
    const hi = Math.min(99, v + spread)
    return { kind: 'range', label: `${lo}–${hi}`, toneClass: attributeBandToneClass(v) }
  }
  return { kind: 'exact', label: String(v), toneClass: 'text-ufa-accent' }
}

/** developmentFatigue 0–100 → fresh / slightly tired / tired / exhausted. */
export function fatigueBandLabel(fatigue, lang = 'en') {
  const f = Math.max(0, Number(fatigue) || 0)
  if (lang === 'pl') {
    if (f >= 75) return 'wyczerpany'
    if (f >= 50) return 'zmęczony'
    if (f >= 25) return 'lekko zmęczony'
    return 'świeży'
  }
  if (f >= 75) return 'exhausted'
  if (f >= 50) return 'tired'
  if (f >= 25) return 'slightly tired'
  return 'fresh'
}

export function fatigueBandToneClass(fatigue) {
  const f = Math.max(0, Number(fatigue) || 0)
  if (f >= 75) return 'text-red-400'
  if (f >= 50) return 'text-amber-400'
  if (f >= 25) return 'text-ufa-gold'
  return 'text-emerald-400'
}

/**
 * pot − ovr room → declining / peak / potential / high potential.
 * @param {number} room
 * @param {number} [age]
 * @param {string} [lang]
 */
export function trainingRoomLabel(room, age = 0, lang = 'en') {
  const r = Number(room) || 0
  if (lang === 'pl') {
    if (r <= 0) return age >= 30 ? 'spadek' : 'szczyt'
    if (r >= 8) return 'wysoki potencjał'
    return 'potencjał'
  }
  if (r <= 0) return age >= 30 ? 'declining' : 'peak'
  if (r >= 8) return 'high potential'
  return 'potential'
}

export function trainingRoomToneClass(room, age = 0) {
  const r = Number(room) || 0
  if (r <= 0) return age >= 30 ? 'text-amber-400' : 'text-ufa-gold'
  if (r >= 8) return 'text-emerald-400'
  return 'text-ufa-accent'
}
