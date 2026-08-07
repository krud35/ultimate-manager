/**
 * Struktura podstatystyk (atomic) i kategorii głównych zawodnika.
 * Legacy flat keys (throwing, catching, speed, …) są wyliczane dynamicznie z fallbackiem.
 */

export const PLAYER_STAT_CATEGORIES = {
  throwing: ['backhand', 'forehand', 'huck', 'hammer'],
  physical: ['speed', 'endurance', 'agility', 'jump'],
  mental: ['vision', 'composure', 'reactions', 'decisionMaking'],
  offensive: [
    'cutterMovement',
    'handlerMovement',
    'offensiveSystemsKnowledge',
    'catching',
  ],
  defensive: [
    'defensiveCutterMovement',
    'defensiveHandlerMovement',
    'defensiveSystemsKnowledge',
    'blocking',
  ],
}

const LEGACY_KEYS = new Set([
  'throwing',
  'catching',
  'speed',
  'defense',
  'vision',
  'spirit',
  'endurance',
  'fitness',
])

const DEFAULT_SUB = 50
/** Absolutny floor / ceil (legacy + rozwój). */
const SUB_STAT_MIN = 60
const SUB_STAT_MAX = 95

/** Zakresy podstatystyk per kategoria (revamp atr-v5). */
export const CATEGORY_STAT_RANGES = {
  physical: { min: 70, max: 95 },
  mental: { min: 65, max: 95 },
  throwing: { min: 60, max: 95 },
  offensive: { min: 70, max: 95 },
  defensive: { min: 70, max: 95 },
}

/** Bump → regeneracja skills przy wczytaniu kariery / szablonu. */
/** Ile wpływu ma tier UFA vs środek skali (niżej = bardziej wyrównane drużyny). */
const UFA_TIER_COMPRESS = 0.22
/** Mix: większy udział losu → mniej „superteamów” z raw UFA. */
const ROLL_WEIGHT = 0.55
const TIER_WEIGHT = 0.45
/** Tryb historyczny: pełniejszy sygnał ze statów Almanac, bez kompresji ligowej. */
const ROLL_WEIGHT_HISTORICAL = 0.22
const TIER_WEIGHT_HISTORICAL = 0.78

export const SKILLS_GEN_VERSION = 6

/** Docelowy rozkład OVR: bulk / solid / elite. */
const OVR_BULK_MIN = 72
const OVR_BULK_MAX = 84
const OVR_GOOD_MIN = 85
const OVR_GOOD_MAX = 88
const OVR_ELITE_MIN = 89
const OVR_ELITE_MAX = 94
/** Absolutny próg UFA-score na elitarny OVR (89+) — tylko gwiazdy ligi. */
const ELITE_UFA_SCORE = 265
/** Próg na „dobrego” (85–88), jeśli nie mieści się w limicie miejsc. */
const GOOD_UFA_SCORE = 48

export function categoryStatRange(category) {
  return CATEGORY_STAT_RANGES[category] ?? { min: SUB_STAT_MIN, max: SUB_STAT_MAX }
}

export { SUB_STAT_MIN, SUB_STAT_MAX }

export const CATEGORY_LABELS = {
  throwing: 'Throwing',
  physical: 'Physical',
  mental: 'Mental',
  offensive: 'Offensive',
  defensive: 'Defensive',
}

export const SUB_STAT_LABELS = {
  throwing: {
    backhand: 'Backhand',
    forehand: 'Forehand',
    huck: 'Huck',
    hammer: 'Hammer',
  },
  physical: {
    speed: 'Speed',
    endurance: 'Endurance',
    agility: 'Agility',
    jump: 'Jump',
  },
  mental: {
    vision: 'Vision',
    composure: 'Composure',
    reactions: 'Reactions',
    decisionMaking: 'Decision making',
  },
  offensive: {
    cutterMovement: 'Cutter movement',
    handlerMovement: 'Handler movement',
    offensiveSystemsKnowledge: 'Offensive systems',
    catching: 'Catching',
  },
  defensive: {
    defensiveCutterMovement: 'Def. cutter',
    defensiveHandlerMovement: 'Def. handler',
    defensiveSystemsKnowledge: 'Defensive systems',
    blocking: 'Blocking',
  },
}

export const MAIN_CATEGORY_SORT_KEYS = [
  { id: 'name', labelPl: 'Nazwisko', labelEn: 'Name' },
  { id: 'ovr', label: 'OVR' },
  { id: 'throwing', label: 'Throwing' },
  { id: 'physical', label: 'Physical' },
  { id: 'mental', label: 'Mental' },
  { id: 'offensive', label: 'Offensive' },
  { id: 'defensive', label: 'Defensive' },
]

function clamp(n, lo = SUB_STAT_MIN, hi = SUB_STAT_MAX) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

export function clampSubStat(value, category) {
  const { min, max } = categoryStatRange(category)
  return clamp(value, min, max)
}

function isCategoryObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function avg(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return DEFAULT_SUB
  return nums.reduce((s, v) => s + v, 0) / nums.length
}

function hasNestedShape(skills) {
  if (!skills || typeof skills !== 'object') return false
  return Object.keys(PLAYER_STAT_CATEGORIES).some((cat) => isCategoryObject(skills[cat]))
}

/** Płaskie legacy staty → pełna struktura kategorii. */
export function deriveNestedFromLegacy(flat = {}) {
  const throwing = flat.throwing ?? DEFAULT_SUB
  const catching = flat.catching ?? DEFAULT_SUB
  const speed = flat.speed ?? DEFAULT_SUB
  const defense = flat.defense ?? DEFAULT_SUB
  const vision = flat.vision ?? DEFAULT_SUB
  const spirit = flat.spirit ?? flat.composure ?? DEFAULT_SUB

  return {
    throwing: {
      backhand: clampSubStat(throwing, 'throwing'),
      forehand: clampSubStat(throwing + 2, 'throwing'),
      huck: clampSubStat(throwing * 0.88 + vision * 0.08, 'throwing'),
      hammer: clampSubStat(throwing * 0.72 + vision * 0.18, 'throwing'),
    },
    physical: {
      speed: clampSubStat(speed, 'physical'),
      endurance: clampSubStat(
        flat.endurance ??
          flat.fitness ??
          speed * 0.52 + spirit * 0.32 + defense * 0.16,
        'physical',
      ),
      agility: clampSubStat(speed * 0.58 + catching * 0.22 + defense * 0.12, 'physical'),
      jump: clampSubStat(speed * 0.42 + catching * 0.38, 'physical'),
    },
    mental: {
      vision: clampSubStat(vision, 'mental'),
      composure: clampSubStat(spirit, 'mental'),
      reactions: clampSubStat(speed * 0.32 + defense * 0.34 + vision * 0.34, 'mental'),
      decisionMaking: clampSubStat(vision * 0.58 + throwing * 0.28 + spirit * 0.14, 'mental'),
    },
    offensive: {
      cutterMovement: clampSubStat(speed * 0.42 + catching * 0.38 + vision * 0.12, 'offensive'),
      handlerMovement: clampSubStat(throwing * 0.38 + vision * 0.42 + speed * 0.12, 'offensive'),
      offensiveSystemsKnowledge: clampSubStat(
        vision * 0.48 + throwing * 0.32 + spirit * 0.2,
        'offensive',
      ),
      catching: clampSubStat(catching, 'offensive'),
    },
    defensive: {
      defensiveCutterMovement: clampSubStat(defense * 0.48 + speed * 0.38, 'defensive'),
      defensiveHandlerMovement: clampSubStat(
        defense * 0.42 + vision * 0.28 + speed * 0.18,
        'defensive',
      ),
      defensiveSystemsKnowledge: clampSubStat(
        defense * 0.38 + vision * 0.36 + spirit * 0.12,
        'defensive',
      ),
      blocking: clampSubStat(defense, 'defensive'),
    },
  }
}

/**
 * Buduje pełne skills z surowych danych (legacy flat, częściowe nested lub pełne nested).
 */
export function normalizePlayerSkills(raw = {}) {
  if (hasNestedShape(raw)) {
    const base = deriveNestedFromLegacy(readLegacyFlatFromRaw(raw))
    for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
      if (!isCategoryObject(raw[cat])) continue
      for (const key of keys) {
        if (typeof raw[cat][key] === 'number') {
          base[cat][key] = clampSubStat(raw[cat][key], cat)
        }
      }
    }
    return base
  }
  return deriveNestedFromLegacy(raw)
}

function readLegacyFlatFromRaw(raw) {
  const flat = {}
  for (const key of LEGACY_KEYS) {
    if (typeof raw[key] === 'number') flat[key] = raw[key]
  }
  return flat
}

export function getSubStat(skills, category, key, fallback = DEFAULT_SUB) {
  const normalized = hasNestedShape(skills) ? skills : normalizePlayerSkills(skills)
  const val = normalized?.[category]?.[key]
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const legacy = readLegacySkill(normalized, mapSubToLegacy(category, key))
  return legacy ?? fallback
}

function mapSubToLegacy(category, key) {
  const map = {
    'physical.speed': 'speed',
    'offensive.catching': 'catching',
    'mental.vision': 'vision',
    'mental.composure': 'spirit',
    'defensive.blocking': 'defense',
    'throwing.backhand': 'throwing',
  }
  return map[`${category}.${key}`] ?? null
}

export function getCategoryOverall(skills, category) {
  const normalized = hasNestedShape(skills) ? skills : normalizePlayerSkills(skills)
  const keys = PLAYER_STAT_CATEGORIES[category]
  if (!keys) return DEFAULT_SUB
  return avg(keys.map((k) => getSubStat(normalized, category, k)))
}

/** Deterministyczny roll w zakresie kategorii (stabilny per zawodnik). */
export function rollSubStatForPlayer(playerId, category, key, salt = 'attr-v5') {
  let h = (Number(playerId) || 1) >>> 0
  const tag = `${salt}:${category}:${key}`
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x85ebca6b)
    h >>>= 0
  }
  const { min, max } = categoryStatRange(category)
  const span = max - min + 1
  return min + (h % span)
}

export function buildBalancedSubStats(playerId, tierForSub = () => 0.5, weights = null) {
  const nested = {}
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    nested[cat] = {}
    for (const key of keys) {
      nested[cat][key] = buildBiasedSubStat(playerId, cat, key, tierForSub(cat, key), weights)
    }
  }
  return nested
}

function normalizeTier(value, max) {
  if (!max || max <= 0) return 0.35
  return Math.max(0, Math.min(1, value / max))
}

/** Tiery 0–1 z referencyjnych statów UFA (nie pokazywane w UI). */
export function ufaTiersFromReference(ref = {}, teamMax = {}) {
  const throwing = normalizeTier(ref.throwingYards ?? 0, teamMax.throwingYards)
  const receiving = normalizeTier(ref.receivingYards ?? 0, teamMax.receivingYards)
  const scoring = normalizeTier(ref.goals ?? 0, teamMax.goals)
  const playmaking = normalizeTier(ref.assists ?? 0, teamMax.assists)
  const defense = normalizeTier(ref.blocks ?? 0, teamMax.blocks)
  const overall = (throwing + receiving + scoring + playmaking + defense) / 5
  return { throwing, receiving, scoring, playmaking, defense, overall }
}

function tierForSubStat(category, key, tiers) {
  const t = tiers
  const map = {
    'throwing.backhand': t.throwing * 0.45 + t.playmaking * 0.55,
    'throwing.forehand': t.throwing * 0.5 + t.playmaking * 0.5,
    'throwing.huck': t.throwing * 0.75 + t.overall * 0.25,
    'throwing.hammer': t.throwing * 0.55 + t.playmaking * 0.45,
    'physical.speed': t.scoring * 0.45 + t.receiving * 0.55,
    'physical.endurance': t.overall * 0.6 + t.defense * 0.4,
    'physical.agility': t.receiving * 0.5 + t.scoring * 0.5,
    'physical.jump': t.receiving * 0.55 + t.scoring * 0.45,
    'mental.vision': t.playmaking * 0.55 + t.throwing * 0.45,
    'mental.composure': t.overall * 0.5 + t.playmaking * 0.3 + t.defense * 0.2,
    'mental.reactions': t.defense * 0.45 + t.receiving * 0.35 + t.scoring * 0.2,
    'mental.decisionMaking': t.playmaking * 0.5 + t.throwing * 0.35 + t.overall * 0.15,
    'offensive.cutterMovement': t.receiving * 0.45 + t.scoring * 0.55,
    'offensive.handlerMovement': t.playmaking * 0.5 + t.throwing * 0.5,
    'offensive.offensiveSystemsKnowledge': t.playmaking * 0.45 + t.throwing * 0.35 + t.overall * 0.2,
    'offensive.catching': t.receiving * 0.7 + t.scoring * 0.3,
    'defensive.defensiveCutterMovement': t.defense * 0.55 + t.receiving * 0.25 + t.scoring * 0.2,
    'defensive.defensiveHandlerMovement': t.defense * 0.5 + t.playmaking * 0.3 + t.throwing * 0.2,
    'defensive.defensiveSystemsKnowledge': t.defense * 0.4 + t.playmaking * 0.35 + t.overall * 0.25,
    'defensive.blocking': t.defense * 0.85 + t.overall * 0.15,
  }
  const tier = map[`${category}.${key}`] ?? t.overall
  return Math.max(0, Math.min(1, tier))
}

function compressUfaTier(tier, compress = UFA_TIER_COMPRESS) {
  if (compress >= 0.999) return Math.max(0, Math.min(1, tier))
  // Środek skali + lekki sygnał z UFA → drużyny bliżej siebie.
  return 0.5 + (tier - 0.5) * compress
}

function buildBiasedSubStat(playerId, category, key, tier, weights = null) {
  const { min, max } = categoryStatRange(category)
  const roll = rollSubStatForPlayer(playerId, category, key)
  const t = Math.max(0, Math.min(1, tier))
  const target = min + t * (max - min)
  const rollW = weights?.roll ?? ROLL_WEIGHT
  const tierW = weights?.tier ?? TIER_WEIGHT
  return clampSubStat(roll * rollW + target * tierW, category)
}

export function readCategorySkill(skills, category, fallback = DEFAULT_SUB) {
  if (PLAYER_STAT_CATEGORIES[category]) {
    return Math.round(getCategoryOverall(skills, category))
  }
  return readLegacySkill(skills, category, fallback)
}

export function getThrowingOverall(skills) {
  return getCategoryOverall(skills, 'throwing')
}

export function getPhysicalOverall(skills) {
  return getCategoryOverall(skills, 'physical')
}

export function getMentalOverall(skills) {
  return getCategoryOverall(skills, 'mental')
}

export function getOffensiveOverall(skills) {
  return getCategoryOverall(skills, 'offensive')
}

export function getDefensiveOverall(skills) {
  return getCategoryOverall(skills, 'defensive')
}

/** Kompatybilność z płaskimi kluczami używanymi w UI i starym silniku. */
export function readLegacySkill(skills, key, fallback = DEFAULT_SUB) {
  if (!skills) return fallback
  if (typeof skills[key] === 'number' && !PLAYER_STAT_CATEGORIES[key]) {
    return skills[key]
  }
  const normalized = hasNestedShape(skills) ? skills : normalizePlayerSkills(skills)
  switch (key) {
    case 'throwing':
      return getThrowingOverall(normalized)
    case 'catching':
      return getSubStat(normalized, 'offensive', 'catching', fallback)
    case 'speed':
      return getSubStat(normalized, 'physical', 'speed', fallback)
    case 'defense':
      return getDefensiveOverall(normalized)
    case 'vision':
      return getSubStat(normalized, 'mental', 'vision', fallback)
    case 'spirit':
      return getSubStat(normalized, 'mental', 'composure', fallback)
    case 'endurance':
      return getSubStat(normalized, 'physical', 'endurance', fallback)
    case 'fitness':
      return getSubStat(normalized, 'physical', 'endurance', fallback)
    default:
      return fallback
  }
}

export function weightedLegacyStat(skills, weights) {
  let sum = 0
  let wSum = 0
  for (const [key, w] of Object.entries(weights)) {
    sum += readLegacySkill(skills, key) * w
    wSum += w
  }
  return wSum > 0 ? sum / wSum : DEFAULT_SUB
}

/** Celność rzutu zależna od typu podania. */
export function throwTypeAccuracyStat(skills, throwType) {
  const s = hasNestedShape(skills) ? skills : normalizePlayerSkills(skills)
  const bh = getSubStat(s, 'throwing', 'backhand')
  const fh = getSubStat(s, 'throwing', 'forehand')
  const huck = getSubStat(s, 'throwing', 'huck')
  const hammer = getSubStat(s, 'throwing', 'hammer')
  switch (throwType) {
    case 'huck':
      return huck * 0.72 + fh * 0.28
    case 'over_the_top':
      return hammer * 0.62 + huck * 0.18 + fh * 0.2
    case 'dump_swing':
      return bh * 0.55 + fh * 0.45
    default:
      return bh * 0.5 + fh * 0.5
  }
}

export function getOverallRating(skills) {
  if (!skills) return DEFAULT_SUB
  if (hasNestedShape(skills)) {
    const cats = Object.keys(PLAYER_STAT_CATEGORIES)
    return Math.round(
      cats.reduce((sum, cat) => sum + getCategoryOverall(skills, cat), 0) / cats.length,
    )
  }
  const legacyKeys = ['throwing', 'catching', 'speed', 'defense', 'vision', 'spirit']
  const values = legacyKeys
    .map((k) => readLegacySkill(skills, k))
    .filter((v) => typeof v === 'number')
  if (!values.length) return DEFAULT_SUB
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

/**
 * Generuje podstatystyki z profilu UFA.
 * @param {{ playerId?: number, ufaReference?: object|null, teamMax?: object|null, mode?: 'historical'|'equalized' }} opts
 * - historical: pełny sygnał ze statów Almanac (bez kompresji / wyrównania)
 * - equalized: lekki bias UFA + kompresja (potem zwykle balanceTeamPlayerSkills / random bands)
 */
export function buildPlayerSkillsFromProfile({
  playerId,
  ufaReference = null,
  teamMax = null,
  mode = 'equalized',
}) {
  const historical = mode === 'historical'
  if (!ufaReference || !teamMax) {
    return buildBalancedSubStats(playerId ?? 1, () => 0.5)
  }
  const tiers = ufaTiersFromReference(ufaReference, teamMax)
  const weights = historical
    ? { roll: ROLL_WEIGHT_HISTORICAL, tier: TIER_WEIGHT_HISTORICAL }
    : null
  const compress = historical ? 1 : UFA_TIER_COMPRESS
  return buildBalancedSubStats(
    playerId ?? 1,
    (cat, key) => compressUfaTier(tierForSubStat(cat, key, tiers), compress),
    weights,
  )
}

export function teamMaxFromPlayers(players = []) {
  const refs = players.map((p) => p?.ufaReference).filter(Boolean)
  if (!refs.length) return null
  return {
    goals: Math.max(...refs.map((r) => r.goals ?? 0), 1),
    assists: Math.max(...refs.map((r) => r.assists ?? 0), 1),
    blocks: Math.max(...refs.map((r) => r.blocks ?? 0), 1),
    throwingYards: Math.max(...refs.map((r) => r.throwingYards ?? 0), 1),
    receivingYards: Math.max(...refs.map((r) => r.receivingYards ?? 0), 1),
  }
}

/** Max ze surowych wierszy Almanac (gls/ast/…), np. cała liga. */
export function teamMaxFromRawRows(rawRows = []) {
  if (!rawRows.length) return null
  return {
    goals: Math.max(...rawRows.map((r) => r.gls ?? r.goals ?? 0), 1),
    assists: Math.max(...rawRows.map((r) => r.ast ?? r.assists ?? 0), 1),
    blocks: Math.max(...rawRows.map((r) => r.blk ?? r.blocks ?? 0), 1),
    throwingYards: Math.max(...rawRows.map((r) => r.throwingYards ?? 0), 1),
    receivingYards: Math.max(...rawRows.map((r) => r.receivingYards ?? 0), 1),
  }
}

export function regeneratePlayerSkills(player, teamMax = null, options = {}) {
  if (!player) return player
  if (player.position != null) delete player.position
  player.skills = buildPlayerSkillsFromProfile({
    playerId: player.id,
    ufaReference: player.ufaReference ?? null,
    teamMax,
    mode: options.mode ?? 'equalized',
  })
  player.skillsGen = SKILLS_GEN_VERSION
  return player
}

function shiftSkillsByDelta(skills, delta) {
  const nested = normalizePlayerSkills(skills)
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    for (const key of keys) {
      const cur = nested[cat][key]
      nested[cat][key] = clampSubStat(cur + delta, cat)
    }
  }
  return nested
}

function scaleSkillsToTargetOvr(skills, targetOvr) {
  let nested = normalizePlayerSkills(skills)
  for (let pass = 0; pass < 10; pass += 1) {
    const current = getOverallRating(nested)
    const delta = targetOvr - current
    if (Math.abs(delta) < 0.35) break
    nested = shiftSkillsByDelta(nested, delta * 0.92)
  }
  return nested
}

function hash01(seed, salt) {
  let h = (Number(seed) || 1) >>> 0
  const tag = String(salt)
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return (h % 10_000) / 10_000
}

/** Surowy wynik „jakości” z referencji UFA (niezależny od teamMax). */
export function ufaPerformanceScore(ref = {}) {
  const goals = Math.max(0, ref.goals ?? 0)
  const assists = Math.max(0, ref.assists ?? 0)
  const blocks = Math.max(0, ref.blocks ?? 0)
  const throwY = Math.max(0, ref.throwingYards ?? 0)
  const recvY = Math.max(0, ref.receivingYards ?? 0)
  return goals * 2.8 + assists * 2.4 + blocks * 3.6 + throwY / 85 + recvY / 85
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

/**
 * Absolutne mapowanie score Almanac → OVR (bez limitów per skład).
 * Zachowuje różnice między gwiazdami a bench / między drużynami.
 */
export function historicalTargetOvrFromScore(score, noise = 0.5) {
  const s = Math.max(0, Number(score) || 0)
  let ovr
  if (s < 20) ovr = lerp(66, 72, s / 20)
  else if (s < 60) ovr = lerp(72, 78, (s - 20) / 40)
  else if (s < 120) ovr = lerp(78, 84, (s - 60) / 60)
  else if (s < 200) ovr = lerp(84, 89, (s - 120) / 80)
  else if (s < 300) ovr = lerp(89, 93, (s - 200) / 100)
  else ovr = lerp(93, 95, Math.min(1, (s - 300) / 150))
  const jitter = (noise - 0.5) * 1.4
  return Math.round(Math.max(65, Math.min(95, ovr + jitter)))
}

/**
 * Skaluje OVR zawodników historycznych wg absolutnych statów UFA (nie wyrównuje składów).
 */
export function applyHistoricalOvrFromUfa(players) {
  if (!players?.length) return players
  for (const p of players) {
    const score = ufaPerformanceScore(p.ufaReference)
    const noise = hash01(p.id, 'hist-ovr')
    const target = historicalTargetOvrFromScore(score, noise)
    p.skills = scaleSkillsToTargetOvr(p.skills, target)
    p.skillsGen = SKILLS_GEN_VERSION
  }
  return players
}

/**
 * Docelowy OVR wg rozkładu (tryb random / equalized):
 * większość 72–84, mniej 85–88, pojedynczy 89–94.
 */
function assignTargetOvrs(players, teamKey) {
  const ranked = players
    .map((p) => ({
      player: p,
      score: ufaPerformanceScore(p.ufaReference),
      noise: hash01(p.id, `ovr-band:${teamKey}`),
    }))
    .sort((a, b) => b.score - a.score || b.noise - a.noise)

  const n = ranked.length
  // ~2–3 solidnych na skład; reszta w bulk 72–84.
  const goodSlots = Math.max(2, Math.min(3, Math.round(n * 0.08)))
  const targets = new Map()

  let eliteTaken = false
  let goodTaken = 0
  const bulk = []

  for (let i = 0; i < n; i += 1) {
    const row = ranked[i]
    const canElite = !eliteTaken && row.score >= ELITE_UFA_SCORE
    const canGood =
      !canElite &&
      goodTaken < goodSlots &&
      (row.score >= GOOD_UFA_SCORE || i < goodSlots + (eliteTaken ? 0 : 1))

    if (canElite) {
      // Wyższy UFA-score → bliżej 94.
      const eliteT = Math.min(1, (row.score - ELITE_UFA_SCORE) / 120)
      const t = lerp(OVR_ELITE_MIN, OVR_ELITE_MAX, 0.15 + eliteT * 0.55 + row.noise * 0.3)
      targets.set(row.player.id, Math.round(t))
      eliteTaken = true
    } else if (canGood) {
      const slotT = goodSlots <= 1 ? 0.5 : goodTaken / Math.max(1, goodSlots - 1)
      const t = lerp(OVR_GOOD_MAX, OVR_GOOD_MIN, slotT * 0.75 + row.noise * 0.25)
      targets.set(row.player.id, Math.round(t))
      goodTaken += 1
    } else {
      bulk.push(row)
    }
  }

  const bulkN = bulk.length
  for (let i = 0; i < bulkN; i += 1) {
    const row = bulk[i]
    // Lepszy UFA → wyżej w bulk; lekki szum żeby nie było schodków.
    const rankT = bulkN <= 1 ? 0.55 : 1 - i / (bulkN - 1)
    const t = lerp(OVR_BULK_MIN, OVR_BULK_MAX, rankT * 0.82 + row.noise * 0.18)
    targets.set(row.player.id, Math.round(t))
  }

  return targets
}

/**
 * Ustawia OVR składu w docelowych pasmach (bulk / good / elite).
 * Zachowuje względną jakość z UFA, ale tnie „wszyscy ~80”.
 */
export function balanceTeamPlayerSkills(players, teamKey = 'team') {
  if (!players?.length) return players
  const targets = assignTargetOvrs(players, teamKey)

  for (const p of players) {
    const target = targets.get(p.id) ?? 78
    p.skills = scaleSkillsToTargetOvr(p.skills, target)
    p.skillsGen = SKILLS_GEN_VERSION
  }
  return players
}

export function ensurePlayerSkills(player) {
  if (!player) return player
  if (hasNestedShape(player.skills)) return player
  return {
    ...player,
    skills: normalizePlayerSkills(player.skills ?? {}),
  }
}

/** Kumulatywne statystyki kariery / sezonu poza pojedynczym meczem. */
export function ensurePlayerStats(player) {
  if (!player) return player
  // Brak podziału Handler/Cutter na zawodniku — sloty formacji to osobna sprawa.
  if (player.position != null) delete player.position
  if (!player.stats || typeof player.stats !== 'object') {
    player.stats = {
      goals: 0,
      assists: 0,
      blocks: 0,
      pointsPlayed: 0,
      pointsPlayedMatch: 0,
    }
  } else {
    if (player.stats.goals == null) player.stats.goals = 0
    if (player.stats.assists == null) player.stats.assists = 0
    if (player.stats.blocks == null) player.stats.blocks = 0
    if (player.stats.pointsPlayed == null) player.stats.pointsPlayed = 0
    if (player.stats.pointsPlayedMatch == null) player.stats.pointsPlayedMatch = 0
  }
  return player
}

export function resetPlayersMatchStats(players) {
  for (const player of players ?? []) {
    ensurePlayerStats(player)
    player.stats.pointsPlayedMatch = 0
  }
}

/**
 * +1 punkt rozegrany dla każdego zawodnika z linii (7v7).
 * @param {object[]} playersOnField
 * @param {Record<number, object>|null} [boxScore]
 */
export function recordPointPlayedForPlayers(playersOnField, boxScore = null) {
  for (const player of playersOnField ?? []) {
    ensurePlayerStats(player)
    player.stats.pointsPlayed += 1
    player.stats.pointsPlayedMatch += 1
    if (boxScore?.[player.id]) {
      boxScore[player.id].pointsPlayed = (boxScore[player.id].pointsPlayed ?? 0) + 1
    }
  }
}
