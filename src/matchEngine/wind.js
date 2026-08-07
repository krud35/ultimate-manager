/**
 * Stały wiatr meczu (bez porywów): pasma intensywności, klasyfikacja
 * downwind / upwind / crosswind względem rzutu i kierunku ataku.
 *
 * directionDeg = kierunek, w którym wiatr WIEJE (zgodne ze strzałką UI).
 */

const MPH_TO_MPS = 0.44704

export const WIND_BAND = {
  NONE: 'none',
  THROWERS: 'throwers',
  NORMAL: 'normal',
  STRONG: 'strong',
  EXTREME: 'extreme',
}

export const WIND_RELATION = {
  DOWNWIND: 'downwind',
  UPWIND: 'upwind',
  CROSSWIND: 'crosswind',
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function labelsForSpeed(speedMph) {
  if (speedMph <= 6) return { label: 'Słaby', labelEn: 'Light' }
  if (speedMph <= 12) return { label: 'Umiarkowany', labelEn: 'Moderate' }
  if (speedMph <= 18) return { label: 'Silny', labelEn: 'Strong' }
  return { label: 'Ekstremalny', labelEn: 'Extreme' }
}

/** Etykieta intensywności wiatru wg języka UI (`pl` / `en`). */
export function windSpeedLabel(windOrMph, lang = 'pl') {
  const speedMph =
    windOrMph && typeof windOrMph === 'object'
      ? Number(windOrMph.speedMph) || 0
      : Number(windOrMph) || 0
  const labels =
    windOrMph && typeof windOrMph === 'object' && (windOrMph.label || windOrMph.labelEn)
      ? {
          label: windOrMph.label ?? labelsForSpeed(speedMph).label,
          labelEn: windOrMph.labelEn ?? labelsForSpeed(speedMph).labelEn,
        }
      : labelsForSpeed(speedMph)
  return lang === 'en' ? labels.labelEn : labels.label
}

export function normalizeWind(raw) {
  if (!raw || typeof raw !== 'object') {
    const labels = labelsForSpeed(0)
    return {
      speedMph: 0,
      directionDeg: 0,
      speedMps: 0,
      label: labels.label,
      labelEn: labels.labelEn,
      band: WIND_BAND.NONE,
    }
  }
  const speedMph = clamp(Number(raw.speedMph) || 0, 0, 28)
  let directionDeg = Number(raw.directionDeg)
  if (!Number.isFinite(directionDeg)) directionDeg = 0
  directionDeg = ((directionDeg % 360) + 360) % 360
  const speedMps =
    Number.isFinite(raw.speedMps) && raw.speedMps > 0
      ? raw.speedMps
      : speedMph * MPH_TO_MPS
  const band = windBandFromSpeed(speedMph)
  const labels = labelsForSpeed(speedMph)
  return {
    speedMph,
    directionDeg,
    speedMps,
    label: raw.label && typeof raw.label === 'string' ? raw.label : labels.label,
    labelEn: raw.labelEn && typeof raw.labelEn === 'string' ? raw.labelEn : labels.labelEn,
    band,
    /** Zachowane dla dryfu — baza z początku meczu */
    baseSpeedMph: Number.isFinite(raw.baseSpeedMph) ? raw.baseSpeedMph : speedMph,
    baseDirectionDeg: Number.isFinite(raw.baseDirectionDeg)
      ? raw.baseDirectionDeg
      : directionDeg,
  }
}

export function generateWind(rng, options = {}) {
  const forcedSpeed = options.speedMph
  const forcedDir = options.directionDeg
  const speedMph =
    forcedSpeed != null
      ? clamp(Number(forcedSpeed), 0, 28)
      : Math.round(3 + (rng?.float?.() ?? Math.random()) * 18)
  const directionDeg =
    forcedDir != null
      ? ((Number(forcedDir) % 360) + 360) % 360
      : Math.round((rng?.float?.() ?? Math.random()) * 360)
  return normalizeWind({
    speedMph,
    directionDeg,
    baseSpeedMph: speedMph,
    baseDirectionDeg: directionDeg,
  })
}

/** Progi mph — high-level rzadko reaguje poniżej ~10 (Ultiworld / ShownSpace). */
export function windBandFromSpeed(speedMph) {
  const s = Number(speedMph) || 0
  if (s < 7) return WIND_BAND.NONE
  if (s < 11) return WIND_BAND.THROWERS
  if (s < 16) return WIND_BAND.NORMAL
  if (s < 21) return WIND_BAND.STRONG
  return WIND_BAND.EXTREME
}

/** 0…1 powyżej progu „none”. */
export function windIntensity01(wind) {
  const w = normalizeWind(wind)
  const s = w.speedMph
  if (s < 7) return 0
  if (s < 11) return 0.2 + ((s - 7) / 4) * 0.15
  if (s < 16) return 0.35 + ((s - 11) / 5) * 0.25
  if (s < 21) return 0.6 + ((s - 16) / 5) * 0.25
  return clamp(0.85 + (s - 21) * 0.03, 0.85, 1)
}

export function windVector(wind) {
  const w = normalizeWind(wind)
  const rad = (w.directionDeg * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad), speedMph: w.speedMph }
}

function normalize2(x, y) {
  const len = Math.hypot(x, y)
  if (len < 1e-6) return { x: 0, y: 0, len: 0 }
  return { x: x / len, y: y / len, len }
}

/**
 * Relacja rzutu do wiatru.
 * @returns {{ relation, along01, cross01, intensity }}
 */
export function classifyThrowWind(wind, throwDx, throwDy) {
  const intensity = windIntensity01(wind)
  if (intensity <= 0) {
    return {
      relation: null,
      along01: 0,
      cross01: 0,
      intensity: 0,
    }
  }
  const w = windVector(wind)
  const t = normalize2(throwDx, throwDy)
  if (t.len < 0.5) {
    return {
      relation: WIND_RELATION.CROSSWIND,
      along01: 0,
      cross01: intensity,
      intensity,
    }
  }
  const along = w.x * t.x + w.y * t.y
  const cross = Math.abs(w.x * t.y - w.y * t.x)
  let relation = WIND_RELATION.CROSSWIND
  if (Math.abs(along) >= cross && Math.abs(along) >= 0.32) {
    relation = along > 0 ? WIND_RELATION.DOWNWIND : WIND_RELATION.UPWIND
  }
  return {
    relation,
    along01: clamp(along, -1, 1),
    cross01: clamp(cross, 0, 1),
    intensity,
  }
}

/**
 * Czy atak w tym possession idzie z wiatrem / pod wiatr / w cross.
 * attackSign: +1 home (rosnące X), −1 away.
 */
export function attackVsWind(wind, possessionTeam) {
  const intensity = windIntensity01(wind)
  if (intensity <= 0) {
    return { relation: WIND_RELATION.DOWNWIND, along01: 0, intensity: 0 }
  }
  const attackSign = possessionTeam === 'away' ? -1 : 1
  const w = windVector(wind)
  // Wiatr wiejący w stronę ataku (+X dla home) → downwind dla O
  const along = w.x * attackSign
  let relation = WIND_RELATION.CROSSWIND
  if (Math.abs(along) >= 0.4) {
    relation = along > 0 ? WIND_RELATION.DOWNWIND : WIND_RELATION.UPWIND
  }
  return { relation, along01: clamp(along, -1, 1), intensity }
}

/**
 * Lekki płynny drift między punktami — bez skoków.
 */
export function driftWind(wind, rng) {
  const w = normalizeWind(wind)
  const r = () => (rng?.float ? rng.float() : Math.random())
  const base = w.baseSpeedMph ?? w.speedMph
  const baseDir = w.baseDirectionDeg ?? w.directionDeg

  // Losowy mikro-target wokół bazy
  const targetSpeed = clamp(base + (r() * 2 - 1) * 2.5, Math.max(2, base - 3), Math.min(24, base + 3))
  const targetDir = baseDir + (r() * 2 - 1) * 18

  const alpha = 0.22 + r() * 0.12
  let nextSpeed = w.speedMph + (targetSpeed - w.speedMph) * alpha
  nextSpeed = clamp(nextSpeed, Math.max(2, base - 3.2), Math.min(24, base + 3.2))
  // Limit kroku
  nextSpeed = clamp(nextSpeed, w.speedMph - 0.75, w.speedMph + 0.75)

  let dirDelta = ((targetDir - w.directionDeg + 540) % 360) - 180
  dirDelta = clamp(dirDelta * alpha, -7, 7)
  const nextDir = ((w.directionDeg + dirDelta) % 360 + 360) % 360

  return normalizeWind({
    ...w,
    speedMph: Math.round(nextSpeed * 10) / 10,
    directionDeg: Math.round(nextDir),
    baseSpeedMph: base,
    baseDirectionDeg: baseDir,
  })
}

function distanceBucket(distanceM, throwType) {
  if (throwType === 'dump_swing' || (distanceM != null && distanceM < 10)) return 'short'
  if (throwType === 'huck' || (distanceM != null && distanceM >= 32)) return 'deep'
  if (throwType === 'over_the_top') return 'loft'
  return 'medium'
}

/**
 * Modyfikatory do resolveThrow / advance / drop.
 */
export function windThrowModifiers({
  wind,
  throwDx = 0,
  throwDy = 0,
  throwType = 'standard',
  thrower = null,
  distanceM = null,
}) {
  const classified = classifyThrowWind(wind, throwDx, throwDy)
  const { relation, along01, cross01, intensity } = classified
  if (intensity <= 0) {
    return {
      relation: null,
      along01: 0,
      cross01: 0,
      intensity: 0,
      accuracyDelta: 0,
      spreadMult: 1,
      advanceMult: 1,
      dropChanceBonus: 0,
      band: normalizeWind(wind).band,
    }
  }

  const bucket = distanceBucket(distanceM, throwType)
  const throwing =
    thrower?.skills?.throwing != null
      ? (Number(thrower.skills.throwing?.forehand) +
          Number(thrower.skills.throwing?.backhand) +
          Number(thrower.skills.throwing?.huck ?? 70)) /
        3
      : 75
  const composure = Number(thrower?.skills?.mental?.composure ?? 70)
  const fh = Number(thrower?.skills?.throwing?.forehand ?? throwing)
  const bh = Number(thrower?.skills?.throwing?.backhand ?? throwing)
  const techniqueGap = Math.abs(fh - bh) / 100
  const skillNorm = clamp((throwing - 55) / 40, 0, 1)
  const composureNorm = clamp((composure - 55) / 40, 0, 1)
  const skillShield = 0.55 + skillNorm * 0.35 + composureNorm * 0.1

  let accuracyDelta = 0
  let spreadMult = 1
  let advanceMult = 1
  let dropChanceBonus = 0

  const deepFactor = bucket === 'deep' ? 1 : bucket === 'loft' ? 0.85 : bucket === 'medium' ? 0.45 : 0.08

  if (relation === WIND_RELATION.DOWNWIND) {
    advanceMult = 1 + intensity * (bucket === 'deep' ? 0.14 : bucket === 'medium' ? 0.08 : 0.02)
    accuracyDelta = intensity * deepFactor * 3 * skillShield
    // Mniej touch → więcej dropów (Ultiworld)
    dropChanceBonus =
      intensity *
      (bucket === 'deep' ? 0.07 : bucket === 'medium' ? 0.035 : 0.01) *
      (1.15 - skillShield)
    spreadMult = 1 + intensity * 0.05
  } else if (relation === WIND_RELATION.UPWIND) {
    advanceMult = 1 - intensity * (bucket === 'deep' ? 0.18 : bucket === 'medium' ? 0.1 : 0.03)
    // ShownSpace ~−7 pp deep ≈ kilka punktów throwBase; OTT mocniej
    const loftExtra = bucket === 'loft' || throwType === 'over_the_top' ? 1.35 : 1
    accuracyDelta = -intensity * deepFactor * 11 * loftExtra * (1.15 - skillShield * 0.4)
    spreadMult = 1 + intensity * 0.12 * deepFactor
    dropChanceBonus = intensity * deepFactor * 0.02
  } else {
    // Cross — głównie accuracy vs skille + spread
    const crossSkillPenalty = (1.25 - skillShield) * (1 + techniqueGap * 0.8)
    accuracyDelta = -intensity * cross01 * deepFactor * 9 * crossSkillPenalty
    spreadMult = 1 + intensity * cross01 * (0.18 + (1 - skillNorm) * 0.2)
    advanceMult = 1 + intensity * along01 * 0.04
    dropChanceBonus = intensity * cross01 * deepFactor * 0.03 * crossSkillPenalty
  }

  // Short prawie odporne (ShownSpace)
  if (bucket === 'short') {
    accuracyDelta *= 0.15
    dropChanceBonus *= 0.2
    advanceMult = 1 + (advanceMult - 1) * 0.25
    spreadMult = 1 + (spreadMult - 1) * 0.25
  }

  return {
    relation,
    along01,
    cross01,
    intensity,
    band: normalizeWind(wind).band,
    accuracyDelta,
    spreadMult,
    advanceMult: clamp(advanceMult, 0.72, 1.22),
    dropChanceBonus: clamp(dropChanceBonus, 0, 0.18),
  }
}

/**
 * Korekta score opcji w throwerBrain.
 */
export function windOptionScoreAdjust({
  wind,
  throwDx,
  throwDy,
  throwType,
  forwardProgress = 0,
  isDump = false,
  thrower = null,
  possessionTeam = 'home',
  distanceM = null,
  stallCount = 3,
}) {
  const intensity = windIntensity01(wind)
  if (intensity <= 0) return { scoreDelta: 0, relation: null, attackRelation: null }

  const throwMods = windThrowModifiers({
    wind,
    throwDx,
    throwDy,
    throwType,
    thrower,
    distanceM: distanceM ?? Math.hypot(throwDx, throwDy),
  })
  const attack = attackVsWind(wind, possessionTeam)
  let delta = 0

  // Mix ShownSpace: medium↓ short↑
  const dist = distanceM ?? Math.hypot(throwDx ?? 0, throwDy ?? 0)
  if (isDump || forwardProgress < 2 || dist < 10) {
    delta += intensity * 14
  } else if (dist >= 10 && dist < 26 && throwType !== 'huck') {
    delta -= intensity * 12
  }

  // Kierunek rzutu
  if (throwMods.relation === WIND_RELATION.DOWNWIND && (throwType === 'huck' || forwardProgress >= 18)) {
    delta += intensity * 10
  }
  if (throwMods.relation === WIND_RELATION.UPWIND && throwType === 'huck') {
    // Ultiworld: przy ataku upwind nadal bierz deep — kara tylko gdy atak downwind/cross a rzut upwind
    if (attack.relation === WIND_RELATION.UPWIND) {
      delta += intensity * (normalizeWind(wind).band === WIND_BAND.EXTREME ? 8 : 3)
    } else {
      delta -= intensity * 16
    }
  }
  if (throwMods.relation === WIND_RELATION.CROSSWIND && dist >= 14) {
    const throwing =
      ((Number(thrower?.skills?.throwing?.forehand) || 70) +
        (Number(thrower?.skills?.throwing?.backhand) || 70)) /
      2
    delta -= intensity * throwMods.cross01 * (22 - (throwing - 70) * 0.25)
  }

  // Atak upwind: kara za duże dump-back
  if (attack.relation === WIND_RELATION.UPWIND && forwardProgress < -2) {
    delta -= intensity * 18
  }

  // Atak downwind: kara za długi lateral (swing) bez postępu
  if (
    attack.relation === WIND_RELATION.DOWNWIND &&
    Math.abs(forwardProgress) < 3 &&
    dist >= 12 &&
    !isDump
  ) {
    delta -= intensity * 11
  }

  // Cross punkt: preferuj komponent na upwind side (rzut przeciwny do wiatru bocznie = na high side)
  if (attack.relation === WIND_RELATION.CROSSWIND) {
    const w = windVector(wind)
    // Rzut z komponentem pod wiatr (w stronę high side): throw · (−wind) > 0 na osi Y-ish
    const towardHigh = -(throwDx * w.x + throwDy * w.y)
    if (towardHigh > 0.2 && forwardProgress >= 0) delta += intensity * 9
    if (towardHigh < -0.25 && dist >= 10) delta -= intensity * 10
  }

  // Extreme punt: przy wysokim stallu i złym kącie — deep downwind OK nawet jako hazard
  if (
    normalizeWind(wind).band === WIND_BAND.EXTREME &&
    stallCount >= 6 &&
    throwMods.relation === WIND_RELATION.DOWNWIND &&
    (throwType === 'huck' || forwardProgress >= 20)
  ) {
    delta += 12
  }

  // Lekki EV z accuracy (żeby AI czuło gorsze EV)
  delta += throwMods.accuracyDelta * 0.35

  return {
    scoreDelta: delta,
    relation: throwMods.relation,
    attackRelation: attack.relation,
  }
}

/** Wizualny offset lotu — stały dryf, bez jittera. */
export function windFlightOffset(wind, progress01) {
  const w = normalizeWind(wind)
  const intensity = windIntensity01(w)
  if (intensity <= 0 || !w.speedMps) return { dx: 0, dy: 0 }
  const rad = (w.directionDeg * Math.PI) / 180
  const u = clamp(progress01, 0, 1)
  // Narasta w trakcie lotu (kwadratowo lekko)
  const scale = w.speedMps * 0.55 * intensity * (u * u)
  return {
    dx: Math.cos(rad) * scale,
    dy: Math.sin(rad) * scale * 0.85,
  }
}
