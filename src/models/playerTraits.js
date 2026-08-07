/**
 * Cechy charakteru zawodników — katalog + przypisanie + agregacja modyfikatorów.
 * Efekty są lekkie; strojenie liczb w TRAIT_EFFECTS.
 */

import {
  getOverallRating,
  getCategoryOverall,
  getSubStat,
  normalizePlayerSkills,
} from './playerStats.js'

/** Bump → regeneracja cech przy wczytaniu kariery / szablonu. */
export const TRAITS_GEN_VERSION = 3

/** Alias starych ID → aktualne (migracja zapisów). */
const TRAIT_ID_ALIASES = {
  low_motor: 'lazy',
  ice_cold: 'composed',
  layout_artist: 'layout_machine',
  safe_hands_thrower: 'safe_hands',
}

/** Usunięte cechy — drop przy ensure / odczycie. */
const REMOVED_TRAIT_IDS = new Set([
  'ball_watcher',
  'clear_machine',
  'space_aware',
  'clogger',
  'break_side_wizard',
  'reset_first',
  'patient_handler',
  'touch_passer',
])

export const TRAIT_DEFS = {
  determined: {
    id: 'determined',
    namePl: 'Zdeterminowany',
    nameEn: 'Determined',
    polarity: 'positive',
    tags: ['mental', 'skill'],
  },
  leader: {
    id: 'leader',
    namePl: 'Lider',
    nameEn: 'Leader',
    polarity: 'positive',
    tags: ['mental'],
  },
  vocal: {
    id: 'vocal',
    namePl: 'Głos na boisku',
    nameEn: 'Vocal leader',
    polarity: 'positive',
    tags: ['mental'],
  },
  loner: {
    id: 'loner',
    namePl: 'Samotnik',
    nameEn: 'Loner',
    polarity: 'negative',
    tags: ['mental'],
  },
  confident: {
    id: 'confident',
    namePl: 'Pewny siebie',
    nameEn: 'Confident',
    polarity: 'positive',
    tags: ['mental'],
  },
  fragile_ego: {
    id: 'fragile_ego',
    namePl: 'Krucha pewność siebie',
    nameEn: 'Fragile ego',
    polarity: 'negative',
    tags: ['mental'],
  },
  professional: {
    id: 'professional',
    namePl: 'Profesjonalista',
    nameEn: 'Professional',
    polarity: 'positive',
    tags: ['mental', 'skill'],
  },
  hot_headed: {
    id: 'hot_headed',
    namePl: 'Porywczy',
    nameEn: 'Hot-headed',
    polarity: 'negative',
    tags: ['mental', 'throw'],
  },
  composed: {
    id: 'composed',
    namePl: 'Opanowany',
    nameEn: 'Composed',
    polarity: 'positive',
    tags: ['mental', 'throw'],
  },
  clutch: {
    id: 'clutch',
    namePl: 'Clutch',
    nameEn: 'Clutch',
    polarity: 'positive',
    tags: ['mental'],
  },
  nervous: {
    id: 'nervous',
    namePl: 'Nerwowy',
    nameEn: 'Nervous',
    polarity: 'negative',
    tags: ['mental'],
  },
  team_first: {
    id: 'team_first',
    namePl: 'Team first',
    nameEn: 'Team first',
    polarity: 'positive',
    tags: ['mental'],
  },
  glory_hunter: {
    id: 'glory_hunter',
    namePl: 'Łowca chwały',
    nameEn: 'Glory hunter',
    polarity: 'mixed',
    tags: ['mental', 'throw'],
  },
  workhorse: {
    id: 'workhorse',
    namePl: 'Pracowity',
    nameEn: 'Workhorse',
    polarity: 'positive',
    tags: ['mental'],
  },
  lazy: {
    id: 'lazy',
    namePl: 'Leniwy',
    nameEn: 'Lazy',
    polarity: 'negative',
    tags: ['mental', 'defense', 'physical'],
  },
  huck_lover: {
    id: 'huck_lover',
    namePl: 'Lubi hucki',
    nameEn: 'Huck lover',
    polarity: 'positive',
    tags: ['throw'],
  },
  dump_guy: {
    id: 'dump_guy',
    namePl: 'Dump guy',
    nameEn: 'Dump guy',
    polarity: 'positive',
    tags: ['throw'],
  },
  safe_hands: {
    id: 'safe_hands',
    namePl: 'Safe hands',
    nameEn: 'Safe hands',
    polarity: 'positive',
    tags: ['throw', 'skill'],
  },
  creative_thrower: {
    id: 'creative_thrower',
    namePl: 'Kreatywny rzucający',
    nameEn: 'Creative thrower',
    polarity: 'mixed',
    tags: ['throw'],
  },
  hammer_happy: {
    id: 'hammer_happy',
    namePl: 'Hammer happy',
    nameEn: 'Hammer happy',
    polarity: 'positive',
    tags: ['throw'],
  },
  deep_threat: {
    id: 'deep_threat',
    namePl: 'Deep threat',
    nameEn: 'Deep threat',
    polarity: 'positive',
    tags: ['cutter'],
  },
  under_cutter: {
    id: 'under_cutter',
    namePl: 'Under cutter',
    nameEn: 'Under cutter',
    polarity: 'positive',
    tags: ['cutter'],
  },
  layout_machine: {
    id: 'layout_machine',
    namePl: 'Layout machine',
    nameEn: 'Layout machine',
    polarity: 'positive',
    tags: ['cutter', 'physical'],
  },
  aggressive_cutter: {
    id: 'aggressive_cutter',
    namePl: 'Agresywny cutter',
    nameEn: 'Aggressive cutter',
    polarity: 'positive',
    tags: ['cutter'],
  },
  hesitant_cutter: {
    id: 'hesitant_cutter',
    namePl: 'Wahający się cutter',
    nameEn: 'Hesitant cutter',
    polarity: 'negative',
    tags: ['cutter'],
  },
  good_timing: {
    id: 'good_timing',
    namePl: 'Dobry timing',
    nameEn: 'Good timing',
    polarity: 'positive',
    tags: ['cutter'],
  },
  big_man: {
    id: 'big_man',
    namePl: 'Big man',
    nameEn: 'Big man',
    polarity: 'positive',
    tags: ['cutter', 'physical'],
  },
  wants_the_disc: {
    id: 'wants_the_disc',
    namePl: 'Chce dysk',
    nameEn: 'Wants the disc',
    polarity: 'mixed',
    tags: ['cutter'],
  },
  disciplined: {
    id: 'disciplined',
    namePl: 'Zdyscyplinowany',
    nameEn: 'Disciplined',
    polarity: 'positive',
    tags: ['cutter', 'mental'],
  },
  shutdown: {
    id: 'shutdown',
    namePl: 'Shutdown',
    nameEn: 'Shutdown',
    polarity: 'positive',
    tags: ['defense'],
  },
  poacher: {
    id: 'poacher',
    namePl: 'Poacher',
    nameEn: 'Poacher',
    polarity: 'mixed',
    tags: ['defense'],
  },
  physical_mark: {
    id: 'physical_mark',
    namePl: 'Fizyczny mark',
    nameEn: 'Physical mark',
    polarity: 'positive',
    tags: ['defense'],
  },
  soft_mark: {
    id: 'soft_mark',
    namePl: 'Soft mark',
    nameEn: 'Soft mark',
    polarity: 'negative',
    tags: ['defense'],
  },
  relentless: {
    id: 'relentless',
    namePl: 'Nieustępliwy',
    nameEn: 'Relentless',
    polarity: 'positive',
    tags: ['defense', 'physical'],
  },
  elite_huck: {
    id: 'elite_huck',
    namePl: 'Elitarny huck',
    nameEn: 'Elite huck',
    polarity: 'positive',
    tags: ['throw', 'skill'],
  },
  glue_hands: {
    id: 'glue_hands',
    namePl: 'Klejące ręce',
    nameEn: 'Glue hands',
    polarity: 'positive',
    tags: ['offense', 'skill'],
  },
  track_star: {
    id: 'track_star',
    namePl: 'Sprinter',
    nameEn: 'Track star',
    polarity: 'positive',
    tags: ['physical', 'skill'],
  },
  vertical_threat: {
    id: 'vertical_threat',
    namePl: 'Vertical threat',
    nameEn: 'Vertical threat',
    polarity: 'positive',
    tags: ['physical', 'skill'],
  },
  field_general: {
    id: 'field_general',
    namePl: 'Generał pola',
    nameEn: 'Field general',
    polarity: 'positive',
    tags: ['mental', 'skill'],
  },
  smart: {
    id: 'smart',
    namePl: 'Smart',
    nameEn: 'Smart',
    polarity: 'positive',
    tags: ['mental', 'skill'],
  },
  quick: {
    id: 'quick',
    namePl: 'Quick',
    nameEn: 'Quick',
    polarity: 'positive',
    tags: ['physical', 'skill'],
  },
  adaptive: {
    id: 'adaptive',
    namePl: 'Adaptive',
    nameEn: 'Adaptive',
    polarity: 'positive',
    tags: ['mental', 'skill'],
  },
  lockdown: {
    id: 'lockdown',
    namePl: 'Lockdown',
    nameEn: 'Lockdown',
    polarity: 'positive',
    tags: ['defense', 'skill'],
  },
  turnover_prone: {
    id: 'turnover_prone',
    namePl: 'Skłonny do błędów',
    nameEn: 'Turnover-prone',
    polarity: 'negative',
    tags: ['mental', 'throw'],
  },
  showboat: {
    id: 'showboat',
    namePl: 'Showboat',
    nameEn: 'Showboat',
    polarity: 'negative',
    tags: ['throw'],
  },
  quitter: {
    id: 'quitter',
    namePl: 'Łatwo się poddaje',
    nameEn: 'Quitter',
    polarity: 'negative',
    tags: ['mental'],
  },
  // Career / charakter poza boiskiem
  loyal: {
    id: 'loyal',
    namePl: 'Lojalny',
    nameEn: 'Loyal',
    polarity: 'positive',
    tags: ['career', 'contract'],
  },
  mercenary: {
    id: 'mercenary',
    namePl: 'Najemnik',
    nameEn: 'Mercenary',
    polarity: 'mixed',
    tags: ['career', 'contract'],
  },
  modest: {
    id: 'modest',
    namePl: 'Skromny',
    nameEn: 'Modest',
    polarity: 'positive',
    tags: ['career', 'contract'],
  },
  greedy: {
    id: 'greedy',
    namePl: 'Chciwy',
    nameEn: 'Greedy',
    polarity: 'negative',
    tags: ['career', 'contract'],
  },
  homebody: {
    id: 'homebody',
    namePl: 'Domator',
    nameEn: 'Homebody',
    polarity: 'positive',
    tags: ['career', 'contract'],
  },
  restless: {
    id: 'restless',
    namePl: 'Niespokojny',
    nameEn: 'Restless',
    polarity: 'negative',
    tags: ['career', 'contract'],
  },
  showman: {
    id: 'showman',
    namePl: 'Showman',
    nameEn: 'Showman',
    polarity: 'mixed',
    tags: ['career', 'fans'],
  },
  anxious: {
    id: 'anxious',
    namePl: 'Lękliwy pod presją',
    nameEn: 'Anxious under pressure',
    polarity: 'negative',
    tags: ['career', 'fans'],
  },
  charismatic: {
    id: 'charismatic',
    namePl: 'Charyzmatyczny',
    nameEn: 'Charismatic',
    polarity: 'positive',
    tags: ['career', 'media'],
  },
  shy: {
    id: 'shy',
    namePl: 'Nieśmiały',
    nameEn: 'Shy',
    polarity: 'negative',
    tags: ['career', 'media'],
  },
  content: {
    id: 'content',
    namePl: 'Zadowolony ze swojej roli',
    nameEn: 'Content with role',
    polarity: 'positive',
    tags: ['career', 'contract'],
  },
  ambitious: {
    id: 'ambitious',
    namePl: 'Ambitny',
    nameEn: 'Ambitious',
    polarity: 'mixed',
    tags: ['career', 'contract'],
  },
  curious: {
    id: 'curious',
    namePl: 'Ciekawy',
    nameEn: 'Curious',
    polarity: 'positive',
    tags: ['career', 'skill'],
  },
  impatient: {
    id: 'impatient',
    namePl: 'Niecierpliwy',
    nameEn: 'Impatient',
    polarity: 'mixed',
    tags: ['career', 'contract'],
  },
  relaxed: {
    id: 'relaxed',
    namePl: 'Wyluzowany',
    nameEn: 'Relaxed',
    polarity: 'positive',
    tags: ['career'],
  },
  stoic: {
    id: 'stoic',
    namePl: 'Stoicki',
    nameEn: 'Stoic',
    polarity: 'positive',
    tags: ['career'],
  },
  // Mental / charakter (mixed + neg — bez wymuszania par)
  selfish: {
    id: 'selfish',
    namePl: 'Samolubny',
    nameEn: 'Selfish',
    polarity: 'mixed',
    tags: ['mental'],
  },
  stubborn: {
    id: 'stubborn',
    namePl: 'Uparty',
    nameEn: 'Stubborn',
    polarity: 'mixed',
    tags: ['mental', 'throw'],
  },
  perfectionist: {
    id: 'perfectionist',
    namePl: 'Perfekcjonista',
    nameEn: 'Perfectionist',
    polarity: 'mixed',
    tags: ['mental', 'throw'],
  },
  overthinker: {
    id: 'overthinker',
    namePl: 'Przemyślacza',
    nameEn: 'Overthinker',
    polarity: 'mixed',
    tags: ['mental', 'throw'],
  },
  tunnel_vision: {
    id: 'tunnel_vision',
    namePl: 'Tunel',
    nameEn: 'Tunnel vision',
    polarity: 'negative',
    tags: ['mental', 'throw'],
  },
  complacent: {
    id: 'complacent',
    namePl: 'Samozadowolony',
    nameEn: 'Complacent',
    polarity: 'negative',
    tags: ['mental'],
  },
  diva: {
    id: 'diva',
    namePl: 'Diva',
    nameEn: 'Diva',
    polarity: 'negative',
    tags: ['career', 'contract'],
  },
  chip_on_shoulder: {
    id: 'chip_on_shoulder',
    namePl: 'Kompleks',
    nameEn: 'Chip on shoulder',
    polarity: 'mixed',
    tags: ['mental'],
  },
  competitor: {
    id: 'competitor',
    namePl: 'Competitor',
    nameEn: 'Competitor',
    polarity: 'mixed',
    tags: ['mental'],
  },
  coachable: {
    id: 'coachable',
    namePl: 'Uczulony na feedback',
    nameEn: 'Coachable',
    polarity: 'positive',
    tags: ['career', 'skill'],
  },
  uncoachable: {
    id: 'uncoachable',
    namePl: 'Nieprzyjmujący rad',
    nameEn: 'Uncoachable',
    polarity: 'negative',
    tags: ['career'],
  },
  film_junkie: {
    id: 'film_junkie',
    namePl: 'Film junkie',
    nameEn: 'Film junkie',
    polarity: 'positive',
    tags: ['career', 'skill'],
  },
  party_animal: {
    id: 'party_animal',
    namePl: 'Imprezowicz',
    nameEn: 'Party animal',
    polarity: 'mixed',
    tags: ['career', 'fans'],
  },
  // Gra — mixed / style
  force_happy: {
    id: 'force_happy',
    namePl: 'Force happy',
    nameEn: 'Force happy',
    polarity: 'mixed',
    tags: ['throw'],
  },
  iso_ball: {
    id: 'iso_ball',
    namePl: 'Iso ball',
    nameEn: 'Iso ball',
    polarity: 'mixed',
    tags: ['throw'],
  },
  checkdown: {
    id: 'checkdown',
    namePl: 'Check-down',
    nameEn: 'Check-down',
    polarity: 'mixed',
    tags: ['throw'],
  },
  sky_baller: {
    id: 'sky_baller',
    namePl: 'Sky baller',
    nameEn: 'Sky baller',
    polarity: 'mixed',
    tags: ['cutter', 'physical'],
  },
  zone_breaker: {
    id: 'zone_breaker',
    namePl: 'Zone breaker',
    nameEn: 'Zone breaker',
    polarity: 'positive',
    tags: ['throw'],
  },
  man_d_specialist: {
    id: 'man_d_specialist',
    namePl: 'Man D',
    nameEn: 'Man D',
    polarity: 'mixed',
    tags: ['defense'],
  },
  foul_prone: {
    id: 'foul_prone',
    namePl: 'Foulozy',
    nameEn: 'Foul-prone',
    polarity: 'negative',
    tags: ['defense'],
  },
}

/** Pary wzajemnie wykluczające się. */
const TRAIT_CONFLICTS = [
  ['huck_lover', 'dump_guy'],
  ['safe_hands', 'creative_thrower'],
  ['determined', 'quitter'],
  ['composed', 'hot_headed'],
  ['clutch', 'nervous'],
  ['team_first', 'glory_hunter'],
  ['team_first', 'selfish'],
  ['leader', 'loner'],
  ['vocal', 'loner'],
  ['workhorse', 'lazy'],
  ['relentless', 'lazy'],
  ['confident', 'fragile_ego'],
  ['deep_threat', 'under_cutter'],
  ['aggressive_cutter', 'hesitant_cutter'],
  ['wants_the_disc', 'disciplined'],
  ['shutdown', 'poacher'],
  ['physical_mark', 'soft_mark'],
  ['smart', 'turnover_prone'],
  ['safe_hands', 'turnover_prone'],
  ['loyal', 'mercenary'],
  ['modest', 'greedy'],
  ['modest', 'diva'],
  ['professional', 'diva'],
  ['homebody', 'restless'],
  ['showman', 'anxious'],
  ['charismatic', 'shy'],
  ['content', 'ambitious'],
  ['curious', 'impatient'],
  ['curious', 'uncoachable'],
  ['coachable', 'uncoachable'],
  ['adaptive', 'stubborn'],
  ['dump_guy', 'iso_ball'],
  ['checkdown', 'force_happy'],
  ['checkdown', 'huck_lover'],
  ['relaxed', 'stoic'],
]

function conflictsWith(id, selected) {
  for (const [a, b] of TRAIT_CONFLICTS) {
    if ((id === a && selected.has(b)) || (id === b && selected.has(a))) return true
  }
  return false
}

function hashSeed(playerId, salt = 'traits-v3') {
  const s = `${salt}:${playerId ?? '0'}`
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
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

export function getPlayerTraits(player) {
  if (!Array.isArray(player?.traits)) return []
  return player.traits.map(normalizeTraitId).filter((id) => id && TRAIT_DEFS[id])
}

export function playerHasTrait(player, traitId) {
  return getPlayerTraits(player).includes(traitId)
}

export function traitDef(traitId) {
  return TRAIT_DEFS[traitId] ?? null
}

export function traitLabel(traitId, lang = 'pl') {
  const def = TRAIT_DEFS[traitId]
  if (!def) return traitId
  if (lang === 'en') return def.nameEn ?? def.namePl ?? traitId
  return def.namePl ?? def.nameEn ?? traitId
}

export function traitToneClass(traitId) {
  const p = TRAIT_DEFS[traitId]?.polarity
  if (p === 'positive') return 'text-emerald-400'
  if (p === 'negative') return 'text-red-400'
  if (p === 'mixed') return 'text-ufa-gold'
  return 'text-ufa-muted'
}

function normalizeTraitId(id) {
  if (id == null || REMOVED_TRAIT_IDS.has(id)) return null
  const next = TRAIT_ID_ALIASES[id] ?? id
  if (REMOVED_TRAIT_IDS.has(next)) return null
  return next
}

function skillLinkedCandidates(player) {
  const skills = normalizePlayerSkills(player.skills ?? {})
  const out = []
  if (getSubStat(skills, 'throwing', 'huck') >= 84 || getOverallRating(skills) >= 85) {
    out.push('elite_huck')
  }
  if (getSubStat(skills, 'offensive', 'catching') >= 84) out.push('glue_hands')
  if (getSubStat(skills, 'physical', 'speed') >= 84) out.push('track_star')
  if (getSubStat(skills, 'physical', 'jump') >= 84) out.push('vertical_threat')
  if (getSubStat(skills, 'physical', 'jump') >= 80) out.push('big_man')
  if (
    getSubStat(skills, 'mental', 'vision') >= 82 &&
    getSubStat(skills, 'mental', 'decisionMaking') >= 80
  ) {
    out.push('field_general')
  }
  if (
    getSubStat(skills, 'mental', 'decisionMaking') >= 78 ||
    getSubStat(skills, 'mental', 'vision') >= 78
  ) {
    out.push('smart')
  }
  if (
    getSubStat(skills, 'physical', 'speed') >= 78 ||
    getSubStat(skills, 'physical', 'agility') >= 78
  ) {
    out.push('quick')
  }
  if (
    getCategoryOverall(skills, 'throwing') >= 76 &&
    getSubStat(skills, 'mental', 'decisionMaking') >= 74
  ) {
    out.push('safe_hands')
  }
  if (getCategoryOverall(skills, 'defensive') >= 84) out.push('lockdown')
  if (getSubStat(skills, 'physical', 'jump') >= 78) out.push('sky_baller')
  if (getCategoryOverall(skills, 'throwing') >= 78) out.push('zone_breaker')
  if (getCategoryOverall(skills, 'defensive') >= 76) out.push('man_d_specialist')
  return out
}

function poolForPlayer(player) {
  const skills = normalizePlayerSkills(player.skills ?? {})
  const ovr = getOverallRating(skills)
  const pool = new Set()

  // Uniwersalne (mental + ogólne + career)
  ;[
    'determined',
    'leader',
    'vocal',
    'loner',
    'confident',
    'fragile_ego',
    'professional',
    'hot_headed',
    'composed',
    'clutch',
    'nervous',
    'team_first',
    'glory_hunter',
    'workhorse',
    'lazy',
    'smart',
    'quick',
    'adaptive',
    'turnover_prone',
    'quitter',
    'showboat',
    'loyal',
    'mercenary',
    'modest',
    'greedy',
    'homebody',
    'restless',
    'showman',
    'anxious',
    'charismatic',
    'shy',
    'content',
    'ambitious',
    'curious',
    'impatient',
    'relaxed',
    'stoic',
    'selfish',
    'stubborn',
    'perfectionist',
    'overthinker',
    'tunnel_vision',
    'complacent',
    'diva',
    'chip_on_shoulder',
    'competitor',
    'coachable',
    'uncoachable',
    'film_junkie',
    'party_animal',
  ].forEach((id) => pool.add(id))

  if (getCategoryOverall(skills, 'throwing') >= 72) {
    ;[
      'huck_lover',
      'dump_guy',
      'safe_hands',
      'creative_thrower',
      'hammer_happy',
      'force_happy',
      'iso_ball',
      'checkdown',
      'zone_breaker',
    ].forEach((id) => pool.add(id))
  }

  if (getCategoryOverall(skills, 'offensive') >= 70) {
    ;[
      'deep_threat',
      'under_cutter',
      'layout_machine',
      'aggressive_cutter',
      'hesitant_cutter',
      'good_timing',
      'big_man',
      'wants_the_disc',
      'disciplined',
      'sky_baller',
    ].forEach((id) => pool.add(id))
  }

  ;[
    'shutdown',
    'poacher',
    'physical_mark',
    'soft_mark',
    'relentless',
    'man_d_specialist',
    'foul_prone',
  ].forEach((id) => pool.add(id))

  for (const id of skillLinkedCandidates(player)) pool.add(id)

  if (ovr < 70) {
    pool.add('hesitant_cutter')
    pool.add('turnover_prone')
  }

  return [...pool]
}

function targetTraitCount(ovr) {
  if (ovr >= 91) return 5
  if (ovr >= 83) return 4
  if (ovr >= 72) return 3
  return 2
}

/** Sufit negatywów — limit, nie quota. */
function maxNegatives() {
  return 2
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Deterministyczne losowanie cech dla zawodnika (seed = id).
 * Bez gwarancji polarności — skill-linked nie monopolizuje slotów.
 */
export function rollTraitsForPlayer(player) {
  const skills = normalizePlayerSkills(player?.skills ?? {})
  const ovr = getOverallRating(skills)
  const rng = mulberry32(hashSeed(player?.id))
  const need = targetTraitCount(ovr)
  const maxNeg = maxNegatives()
  const selected = []
  const selectedSet = new Set()

  const allSkillLinked = skillLinkedCandidates(player)
  const skillLinkedSet = new Set(allSkillLinked)
  const skillCands = shuffleInPlace(
    allSkillLinked.filter((id) => rng() < 0.62),
    rng,
  )
  const poolCands = shuffleInPlace(poolForPlayer(player), rng)
  const skillCap = Math.max(1, Math.min(2, Math.ceil(need / 2)))
  const skillPicked = skillCands.slice(0, skillCap)

  const ordered = []
  const maxLen = Math.max(skillPicked.length, poolCands.length)
  for (let i = 0; i < maxLen; i += 1) {
    if (i < skillPicked.length) ordered.push(skillPicked[i])
    if (i < poolCands.length) ordered.push(poolCands[i])
  }

  let negCount = 0
  let skillTaken = 0
  for (const id of ordered) {
    if (selected.length >= need) break
    if (selectedSet.has(id)) continue
    if (!TRAIT_DEFS[id]) continue
    if (conflictsWith(id, selectedSet)) continue
    if (skillLinkedSet.has(id) && skillTaken >= skillCap) continue
    const pol = TRAIT_DEFS[id].polarity
    if (pol === 'negative') {
      if (negCount >= maxNeg) continue
      negCount += 1
    }
    selected.push(id)
    selectedSet.add(id)
    if (skillLinkedSet.has(id)) skillTaken += 1
  }

  const fallback = shuffleInPlace(Object.keys(TRAIT_DEFS), rng)
  for (const id of fallback) {
    if (selected.length >= need) break
    if (selectedSet.has(id)) continue
    if (conflictsWith(id, selectedSet)) continue
    if (TRAIT_DEFS[id].polarity === 'negative' && negCount >= maxNeg) continue
    if (TRAIT_DEFS[id].polarity === 'negative') negCount += 1
    selected.push(id)
    selectedSet.add(id)
  }

  return selected
}

export function ensurePlayerTraits(player, options = {}) {
  if (!player) return player
  const force = options.force === true || player.traitsGen !== TRAITS_GEN_VERSION
  if (force || !Array.isArray(player.traits) || player.traits.length === 0) {
    player.traits = rollTraitsForPlayer(player)
    player.traitsGen = TRAITS_GEN_VERSION
    return player
  }
  const seen = new Set()
  const next = []
  for (const raw of player.traits) {
    const id = normalizeTraitId(raw)
    if (!TRAIT_DEFS[id] || seen.has(id)) continue
    if (conflictsWith(id, seen)) continue
    seen.add(id)
    next.push(id)
  }
  player.traits = next.length ? next : rollTraitsForPlayer(player)
  player.traitsGen = TRAITS_GEN_VERSION
  return player
}

/** Agregowane modyfikatory do użycia w silniku. */
export function getTraitMods(player) {
  const mods = {
    // morale / form
    lossMoraleMult: 1,
    turnoverMoraleExtra: 0,
    zeroPpFormDelta: -1.2,
    formDriftMult: 1,
    lossFormMult: 1,
    lossMoraleExtra: 0,
    goalAssistMoraleMult: 1,
    goalAssistFormMult: 1,
    teamAuraEmit: 0,
    teamAuraRecvMult: 1,
    // loyalty (ukryte)
    loyaltyGainMult: 1,
    loyaltyLossMult: 1,
    // career / contract / fans / media
    wageDemandMult: 1,
    transferWillingnessDelta: 0,
    preferredYearsDelta: 0,
    promisePlayingTimeBias: 0,
    promiseDevelopmentBias: 0,
    fanMoodMoraleSensitivity: 0,
    performanceFanMoodMult: 1,
    mediaPositiveMoraleMult: 1,
    mediaNegativeMoraleMult: 1,
    chillRoomMoraleMult: 1,
    benchMoraleSensitivity: 1,
    // training / stamina / development
    trainingFatigueMult: 1,
    developmentGainMult: 1,
    injuryChanceMult: 1,
    winFormMult: 1,
    benchRegenBonus: 0,
    oLineCostMult: 1,
    dLineCostMult: 1,
    lowStaminaMovePenaltyMult: 1,
    // throw weights
    huckWeightMult: 1,
    dumpWeightMult: 1,
    ottWeightMult: 1,
    standardWeightMult: 1,
    heroThrowWeightMult: 1,
    dumpEarlyBias: 0,
    huckAcceptanceDelta: 0,
    scoringOptionBonus: 0,
    safeOptionBias: 0,
    creativeRiskBias: 0,
    // throw accuracy / risk by type
    huckAccuracy: 0,
    dumpAccuracy: 0,
    ottAccuracy: 0,
    standardAccuracy: 0,
    huckSpreadMult: 1,
    huckBlockRisk: 0,
    ottBlockRisk: 0,
    // stall / mental in-game
    highStallAccuracy: 0,
    lowStallAccuracy: 0,
    stall8PlusAccuracy: 0,
    badDecisionMult: 1,
    decisionNoiseMult: 1,
    scanRadiusBonusM: 0,
    perceivedOptionsBonus: 0,
    acceptanceThresholdDelta: 0,
    resetFirstStallBias: 0,
    breakSideAccuracy: 0,
    breakSideOptionBonus: 0,
    catchBonus: 0,
    aerialRecvMult: 1,
    aerialDefMult: 1,
    // cutter
    deepCutBias: 0,
    underCutBias: 0,
    deepSpeedMult: 1,
    clearActiveCutMult: 1,
    clearLaneExtraM: 0,
    clogChanceMult: 1,
    cutRollMult: 1,
    cutPriorityDelta: 0,
    timingCutBias: 0,
    structureComplianceBonus: 0,
    layoutAerialMult: 1,
    layoutStaminaMult: 1,
    // defense
    cushionDeltaM: 0,
    reactionDelayDeltaMs: 0,
    markPressureBonus: 0,
    blockChanceMult: 1,
    poachMarkPressureMult: 1,
    poachChanceMult: 1,
    speedMult: 1,
    plantMsMult: 1,
    // style / matchup
    zoneOffenseWeightMult: 1,
    personDefenseBlockMult: 1,
    zoneDefenseBlockMult: 1,
  }

  if (!player) return mods
  const traits = getPlayerTraits(player)

  for (const id of traits) {
    switch (id) {
      case 'determined':
        mods.lossMoraleMult *= 0.55
        mods.lossFormMult *= 0.7
        mods.zeroPpFormDelta = Math.max(mods.zeroPpFormDelta, -0.5)
        mods.lowStaminaMovePenaltyMult *= 0.75
        break
      case 'leader':
        mods.lossMoraleMult *= 0.75
        mods.teamAuraEmit += 0.55
        break
      case 'vocal':
        mods.teamAuraEmit += 0.35
        break
      case 'loner':
        mods.teamAuraRecvMult *= 0.15
        mods.teamAuraEmit *= 0.2
        break
      case 'confident':
        mods.lossMoraleMult *= 0.7
        mods.turnoverMoraleExtra -= 0.25
        mods.highStallAccuracy += 2
        mods.acceptanceThresholdDelta += 3
        break
      case 'fragile_ego':
        mods.lossMoraleMult *= 1.45
        mods.turnoverMoraleExtra += 0.4
        break
      case 'professional':
        mods.zeroPpFormDelta = Math.max(mods.zeroPpFormDelta, -0.35)
        mods.formDriftMult *= 1.45
        mods.trainingFatigueMult *= 0.82
        mods.structureComplianceBonus += 0.08
        mods.decisionNoiseMult *= 0.9
        break
      case 'hot_headed':
        mods.highStallAccuracy -= 6
        mods.decisionNoiseMult *= 1.25
        mods.huckWeightMult *= 1.25
        mods.ottWeightMult *= 1.25
        break
      case 'composed':
        mods.highStallAccuracy += 5
        mods.stall8PlusAccuracy += 3
        mods.badDecisionMult *= 0.7
        mods.decisionNoiseMult *= 0.85
        break
      case 'clutch':
        mods.highStallAccuracy += 4
        mods.stall8PlusAccuracy += 6
        mods.badDecisionMult *= 0.75
        mods.decisionNoiseMult *= 0.85
        break
      case 'nervous':
        mods.highStallAccuracy -= 5
        mods.stall8PlusAccuracy -= 4
        mods.badDecisionMult *= 1.3
        mods.decisionNoiseMult *= 1.2
        mods.turnoverMoraleExtra += 0.35
        break
      case 'team_first':
        mods.dumpWeightMult *= 1.35
        mods.huckWeightMult *= 0.7
        mods.ottWeightMult *= 0.85
        mods.dumpEarlyBias += 0.35
        mods.heroThrowWeightMult *= 0.85
        mods.huckAcceptanceDelta -= 0.08
        mods.scoringOptionBonus -= 0.12
        mods.goalAssistMoraleMult *= 0.85
        break
      case 'glory_hunter':
        mods.huckWeightMult *= 1.4
        mods.ottWeightMult *= 1.2
        mods.dumpWeightMult *= 0.7
        mods.heroThrowWeightMult *= 1.25
        mods.huckAcceptanceDelta += 0.12
        mods.scoringOptionBonus += 0.22
        mods.goalAssistMoraleMult *= 1.45
        mods.goalAssistFormMult *= 1.35
        mods.huckAccuracy -= 2
        break
      case 'workhorse':
        mods.benchRegenBonus += 2
        mods.oLineCostMult *= 0.9
        mods.trainingFatigueMult *= 0.8
        break
      case 'lazy':
        mods.benchRegenBonus -= 3
        mods.oLineCostMult *= 1.15
        mods.dLineCostMult *= 1.15
        mods.trainingFatigueMult *= 1.2
        mods.lowStaminaMovePenaltyMult *= 1.35
        mods.zeroPpFormDelta = Math.min(mods.zeroPpFormDelta, -1.8)
        break
      case 'huck_lover':
        mods.huckWeightMult *= 1.55
        mods.huckAccuracy += 4
        mods.huckSpreadMult *= 0.94
        mods.huckBlockRisk += 3
        mods.dumpWeightMult *= 0.75
        break
      case 'dump_guy':
        mods.dumpWeightMult *= 1.55
        mods.dumpEarlyBias += 0.45
        mods.dumpAccuracy += 4
        mods.huckWeightMult *= 0.55
        mods.huckAcceptanceDelta -= 0.1
        mods.scoringOptionBonus -= 0.08
        break
      case 'safe_hands':
        mods.acceptanceThresholdDelta += 8
        mods.safeOptionBias += 0.55
        mods.dumpWeightMult *= 1.25
        mods.dumpAccuracy += 3
        mods.huckWeightMult *= 0.7
        mods.ottWeightMult *= 0.65
        mods.heroThrowWeightMult *= 0.8
        mods.badDecisionMult *= 0.75
        mods.huckAccuracy -= 1
        mods.highStallAccuracy += 2
        break
      case 'creative_thrower':
        mods.acceptanceThresholdDelta -= 7
        mods.creativeRiskBias += 0.55
        mods.ottWeightMult *= 1.45
        mods.breakSideOptionBonus += 0.12
        mods.heroThrowWeightMult *= 1.3
        mods.ottAccuracy += 3
        mods.ottBlockRisk += 5
        mods.huckBlockRisk += 3
        mods.decisionNoiseMult *= 1.1
        mods.standardAccuracy -= 2
        break
      case 'hammer_happy':
        mods.ottWeightMult *= 1.6
        mods.ottAccuracy += 4
        mods.ottBlockRisk += 4
        break
      case 'deep_threat':
        mods.deepCutBias += 0.35
        mods.deepSpeedMult *= 1.06
        break
      case 'under_cutter':
        mods.underCutBias += 0.35
        break
      case 'layout_machine':
        mods.layoutAerialMult *= 1.35
        mods.layoutStaminaMult *= 1.2
        mods.aerialRecvMult *= 1.1
        break
      case 'aggressive_cutter':
        mods.cutRollMult *= 1.45
        mods.cutPriorityDelta -= 8
        mods.clearActiveCutMult *= 1.1
        break
      case 'hesitant_cutter':
        mods.cutRollMult *= 0.55
        mods.cutPriorityDelta += 8
        break
      case 'good_timing':
        mods.timingCutBias += 0.55
        mods.clogChanceMult *= 0.75
        break
      case 'big_man':
        mods.aerialRecvMult *= 1.35
        mods.aerialDefMult *= 1.15
        mods.layoutAerialMult *= 1.2
        mods.catchBonus += 3
        break
      case 'wants_the_disc':
        mods.cutRollMult *= 1.4
        mods.cutPriorityDelta -= 6
        mods.clogChanceMult *= 1.3
        mods.clearActiveCutMult *= 1.15
        break
      case 'disciplined':
        mods.structureComplianceBonus += 0.12
        mods.clogChanceMult *= 0.55
        mods.cutRollMult *= 0.88
        mods.clearActiveCutMult *= 0.85
        mods.clearLaneExtraM += 1
        break
      case 'shutdown':
        mods.cushionDeltaM -= 0.45
        mods.reactionDelayDeltaMs -= 40
        mods.poachChanceMult *= 0.55
        mods.blockChanceMult *= 1.08
        break
      case 'poacher':
        mods.blockChanceMult *= 1.2
        mods.poachMarkPressureMult *= 0.82
        mods.poachChanceMult *= 1.55
        mods.cushionDeltaM += 0.3
        mods.reactionDelayDeltaMs += 30
        break
      case 'physical_mark':
        mods.markPressureBonus += 5
        mods.huckBlockRisk += 2
        mods.cushionDeltaM -= 0.15
        break
      case 'soft_mark':
        mods.markPressureBonus -= 5
        mods.cushionDeltaM += 0.35
        mods.poachMarkPressureMult *= 0.9
        break
      case 'relentless':
        mods.dLineCostMult *= 0.85
        mods.lowStaminaMovePenaltyMult *= 0.5
        mods.benchRegenBonus += 1
        break
      case 'elite_huck':
        mods.huckAccuracy += 7
        mods.huckSpreadMult *= 0.9
        break
      case 'glue_hands':
        mods.catchBonus += 5
        mods.aerialRecvMult *= 1.2
        break
      case 'track_star':
        mods.speedMult *= 1.05
        break
      case 'vertical_threat':
        mods.aerialRecvMult *= 1.2
        mods.aerialDefMult *= 1.2
        break
      case 'field_general':
        mods.scanRadiusBonusM += 3.5
        mods.decisionNoiseMult *= 0.65
        mods.perceivedOptionsBonus += 1
        mods.acceptanceThresholdDelta += 2
        mods.structureComplianceBonus += 0.04
        break
      case 'smart':
        mods.decisionNoiseMult *= 0.78
        mods.badDecisionMult *= 0.8
        mods.scanRadiusBonusM += 2
        mods.perceivedOptionsBonus += 1
        mods.highStallAccuracy += 2
        break
      case 'quick':
        mods.speedMult *= 1.04
        mods.plantMsMult *= 0.82
        mods.reactionDelayDeltaMs -= 28
        mods.cutRollMult *= 1.1
        break
      case 'adaptive':
        mods.formDriftMult *= 1.5
        mods.lossMoraleMult *= 0.85
        mods.lossFormMult *= 0.85
        mods.trainingFatigueMult *= 0.9
        mods.decisionNoiseMult *= 0.92
        mods.structureComplianceBonus += 0.05
        break
      case 'lockdown':
        mods.cushionDeltaM -= 0.35
        mods.reactionDelayDeltaMs -= 30
        break
      case 'turnover_prone':
        mods.highStallAccuracy -= 5
        mods.badDecisionMult *= 1.35
        mods.decisionNoiseMult *= 1.15
        mods.turnoverMoraleExtra += 0.2
        mods.acceptanceThresholdDelta -= 4
        mods.heroThrowWeightMult *= 1.1
        break
      case 'showboat':
        mods.huckWeightMult *= 1.35
        mods.ottWeightMult *= 1.35
        mods.huckAccuracy -= 3
        mods.ottAccuracy -= 3
        break
      case 'quitter':
        mods.lossMoraleMult *= 1.55
        mods.lossFormMult *= 1.55
        mods.lowStaminaMovePenaltyMult *= 1.25
        mods.zeroPpFormDelta = Math.min(mods.zeroPpFormDelta, -2)
        break
      case 'loyal':
        mods.transferWillingnessDelta -= 0.18
        mods.preferredYearsDelta += 1
        mods.loyaltyGainMult *= 1.25
        mods.loyaltyLossMult *= 0.75
        mods.wageDemandMult *= 0.96
        break
      case 'mercenary':
        mods.transferWillingnessDelta += 0.2
        mods.preferredYearsDelta -= 1
        mods.wageDemandMult *= 1.12
        mods.loyaltyGainMult *= 0.7
        mods.loyaltyLossMult *= 1.35
        break
      case 'modest':
        mods.wageDemandMult *= 0.88
        break
      case 'greedy':
        mods.wageDemandMult *= 1.2
        break
      case 'homebody':
        mods.transferWillingnessDelta -= 0.14
        mods.benchMoraleSensitivity *= 0.7
        mods.preferredYearsDelta += 0.5
        break
      case 'restless':
        mods.transferWillingnessDelta += 0.16
        mods.preferredYearsDelta -= 0.75
        break
      case 'showman':
        mods.fanMoodMoraleSensitivity += 0.9
        mods.performanceFanMoodMult *= 1.45
        mods.goalAssistMoraleMult *= 1.1
        break
      case 'anxious':
        mods.fanMoodMoraleSensitivity += 1.15
        break
      case 'charismatic':
        mods.mediaPositiveMoraleMult *= 1.3
        mods.mediaNegativeMoraleMult *= 0.7
        break
      case 'shy':
        mods.mediaPositiveMoraleMult *= 0.7
        mods.mediaNegativeMoraleMult *= 1.35
        break
      case 'content':
        mods.benchMoraleSensitivity *= 0.55
        mods.promisePlayingTimeBias -= 0.2
        break
      case 'ambitious':
        mods.benchMoraleSensitivity *= 1.45
        mods.promisePlayingTimeBias += 0.45
        mods.wageDemandMult *= 1.06
        break
      case 'curious':
        mods.promiseDevelopmentBias += 0.5
        mods.wageDemandMult *= 0.94
        mods.trainingFatigueMult *= 0.92
        break
      case 'impatient':
        mods.promisePlayingTimeBias += 0.25
        mods.promiseDevelopmentBias += 0.15
        mods.benchMoraleSensitivity *= 1.25
        mods.wageDemandMult *= 1.08
        mods.transferWillingnessDelta += 0.08
        break
      case 'relaxed':
        mods.chillRoomMoraleMult *= 1.5
        break
      case 'stoic':
        mods.chillRoomMoraleMult *= 0.5
        mods.lossMoraleMult *= 0.9
        break
      case 'selfish':
        mods.goalAssistMoraleMult *= 1.35
        mods.goalAssistFormMult *= 1.2
        mods.huckWeightMult *= 1.15
        mods.scoringOptionBonus += 0.15
        mods.dumpWeightMult *= 0.85
        mods.teamAuraEmit -= 0.25
        mods.teamAuraRecvMult *= 0.7
        break
      case 'stubborn':
        mods.dumpWeightMult *= 0.7
        mods.dumpEarlyBias -= 0.25
        mods.huckWeightMult *= 1.15
        mods.acceptanceThresholdDelta -= 3
        mods.structureComplianceBonus -= 0.06
        break
      case 'perfectionist':
        mods.safeOptionBias += 0.35
        mods.acceptanceThresholdDelta += 5
        mods.badDecisionMult *= 0.85
        mods.standardAccuracy += 2
        mods.turnoverMoraleExtra += 0.45
        mods.lossMoraleMult *= 1.15
        break
      case 'overthinker':
        mods.plantMsMult *= 1.18
        mods.acceptanceThresholdDelta += 6
        mods.creativeRiskBias -= 0.25
        mods.huckWeightMult *= 0.85
        mods.heroThrowWeightMult *= 0.85
        mods.dumpEarlyBias += 0.15
        break
      case 'tunnel_vision':
        mods.dumpWeightMult *= 0.65
        mods.dumpAccuracy -= 4
        mods.scanRadiusBonusM -= 2
        mods.perceivedOptionsBonus -= 1
        mods.decisionNoiseMult *= 1.15
        break
      case 'complacent':
        mods.winFormMult *= 0.55
        mods.formDriftMult *= 0.7
        mods.zeroPpFormDelta = Math.min(mods.zeroPpFormDelta, -1.6)
        break
      case 'diva':
        mods.wageDemandMult *= 1.22
        mods.benchMoraleSensitivity *= 1.5
        mods.mediaNegativeMoraleMult *= 1.25
        mods.teamAuraRecvMult *= 0.6
        mods.loyaltyLossMult *= 1.2
        break
      case 'chip_on_shoulder':
        mods.lossMoraleMult *= 0.8
        mods.lossFormMult *= 0.75
        mods.turnoverMoraleExtra += 0.3
        mods.mediaNegativeMoraleMult *= 1.2
        mods.highStallAccuracy += 2
        break
      case 'competitor':
        mods.stall8PlusAccuracy += 4
        mods.highStallAccuracy += 3
        mods.lossMoraleMult *= 1.2
        mods.lossFormMult *= 1.15
        mods.goalAssistMoraleMult *= 1.1
        break
      case 'coachable':
        mods.developmentGainMult *= 1.12
        mods.trainingFatigueMult *= 0.92
        mods.promiseDevelopmentBias += 0.2
        mods.structureComplianceBonus += 0.04
        break
      case 'uncoachable':
        mods.developmentGainMult *= 0.78
        mods.trainingFatigueMult *= 1.1
        mods.structureComplianceBonus -= 0.08
        mods.promiseDevelopmentBias -= 0.15
        break
      case 'film_junkie':
        mods.developmentGainMult *= 1.1
        mods.structureComplianceBonus += 0.08
        mods.decisionNoiseMult *= 0.92
        mods.promiseDevelopmentBias += 0.25
        break
      case 'party_animal':
        mods.formDriftMult *= 0.65
        mods.fanMoodMoraleSensitivity += 0.55
        mods.performanceFanMoodMult *= 1.2
        mods.trainingFatigueMult *= 1.08
        mods.chillRoomMoraleMult *= 1.25
        break
      case 'force_happy':
        mods.breakSideOptionBonus += 0.18
        mods.breakSideAccuracy += 2
        mods.heroThrowWeightMult *= 1.2
        mods.acceptanceThresholdDelta -= 5
        mods.huckAccuracy -= 2
        mods.ottAccuracy -= 1
        mods.badDecisionMult *= 1.12
        break
      case 'iso_ball':
        mods.dumpEarlyBias -= 0.35
        mods.dumpWeightMult *= 0.75
        mods.scoringOptionBonus += 0.18
        mods.heroThrowWeightMult *= 1.15
        mods.plantMsMult *= 1.12
        mods.structureComplianceBonus -= 0.05
        break
      case 'checkdown':
        mods.dumpWeightMult *= 1.4
        mods.dumpEarlyBias += 0.4
        mods.safeOptionBias += 0.4
        mods.huckWeightMult *= 0.55
        mods.deepCutBias -= 0.15
        mods.underCutBias += 0.1
        mods.huckAcceptanceDelta -= 0.12
        break
      case 'sky_baller':
        mods.aerialRecvMult *= 1.25
        mods.aerialDefMult *= 1.15
        mods.layoutAerialMult *= 1.2
        mods.injuryChanceMult *= 1.25
        break
      case 'zone_breaker':
        mods.zoneOffenseWeightMult *= 1.45
        mods.ottWeightMult *= 1.15
        mods.breakSideOptionBonus += 0.08
        break
      case 'man_d_specialist':
        mods.personDefenseBlockMult *= 1.12
        mods.cushionDeltaM -= 0.2
        mods.zoneDefenseBlockMult *= 0.88
        mods.poachChanceMult *= 0.85
        break
      case 'foul_prone':
        mods.markPressureBonus += 3
        mods.cushionDeltaM -= 0.15
        mods.blockChanceMult *= 0.92
        mods.injuryChanceMult *= 1.15
        mods.decisionNoiseMult *= 1.08
        break
      default:
        break
    }
  }

  // Cap stacked cushion / reaction
  mods.cushionDeltaM = Math.max(-0.7, Math.min(0.5, mods.cushionDeltaM))
  mods.reactionDelayDeltaMs = Math.max(-70, Math.min(80, mods.reactionDelayDeltaMs))

  return mods
}

export function throwTypeAccuracyTraitBonus(player, throwType) {
  const m = getTraitMods(player)
  if (throwType === 'huck') return m.huckAccuracy
  if (throwType === 'dump_swing') return m.dumpAccuracy
  if (throwType === 'over_the_top') return m.ottAccuracy
  if (throwType === 'standard') return m.standardAccuracy
  return 0
}

export function throwTypeBlockRiskTraitBonus(player, throwType) {
  const m = getTraitMods(player)
  if (throwType === 'huck') return m.huckBlockRisk
  if (throwType === 'over_the_top') return m.ottBlockRisk
  return 0
}
