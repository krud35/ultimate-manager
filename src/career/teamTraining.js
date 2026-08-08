/**
 * Treningi drużynowe: plan tygodniowy / jednorazowy, jakość sesji, znajomość taktyk.
 * Wzrost skilli jest celowo wolniejszy niż indywidualny fokus dzienny.
 */

import { getOverallRating, getSubStat, normalizePlayerSkills, PLAYER_STAT_CATEGORIES, categoryStatRange } from '../models/playerStats.js'
import { getPlayerMorale, ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerTraits, getPlayerTraits, getTraitMods } from '../models/playerTraits.js'
import { isPlayerInjured, tryTrainingInjury } from '../models/playerInjury.js'
import { ensurePlayerDevelopment, getIndividualFocusMods } from './playerDevelopment.js'
import { parseISODate, formatISODate, addDays } from '../league/seasonCalendar.js'
import { getPlayerFullName } from '../data/mockPlayers.js'
import {
  ensureTeamFacilities,
  trainingCenterQualityMult,
  medicalInjuryChanceMult,
  chillRoomMoraleDelta,
} from './clubFacilities.js'

export const TEAM_TRAINING_FOCUS_OPTIONS = [
  {
    id: 'skills',
    labelPl: 'Umiejętnościowe',
    labelEn: 'Skills',
    blurb: 'Ogólny rozwój wszystkich kategorii',
    blurbEn: 'General development across all categories',
    categories: 'all',
    tacticsGain: 0.2,
  },
  {
    id: 'structural',
    labelPl: 'Strukturalne',
    labelEn: 'Structural',
    blurb: 'Schematy i znajomość taktyk drużyny',
    blurbEn: 'Schemes and team tactics familiarity',
    categories: ['mental'],
    tacticsGain: 1.15,
  },
  {
    id: 'physical',
    labelPl: 'Fizyczne',
    labelEn: 'Physical',
    blurb: 'Kondycja, szybkość, zwinność',
    blurbEn: 'Fitness, speed, agility',
    categories: ['physical'],
    tacticsGain: 0.08,
  },
  {
    id: 'throwing',
    labelPl: 'Rzutowe',
    labelEn: 'Throwing',
    blurb: 'Precyzja i decyzje rzutowe',
    blurbEn: 'Throwing accuracy and decisions',
    categories: ['throwing'],
    tacticsGain: 0.22,
  },
  {
    id: 'offensive',
    labelPl: 'Ofensywne',
    labelEn: 'Offense',
    blurb: 'Cięcia, timing, gra w ataku',
    blurbEn: 'Cuts, timing, attacking play',
    categories: ['offensive'],
    tacticsGain: 0.28,
  },
  {
    id: 'defensive',
    labelPl: 'Defensywne',
    labelEn: 'Defense',
    blurb: 'Marking, poach, obrona',
    blurbEn: 'Marking, poach, defense',
    categories: ['defensive'],
    tacticsGain: 0.28,
  },
  {
    id: 'mental',
    labelPl: 'Mentalne',
    labelEn: 'Mental',
    blurb: 'Decyzje, spokój, czytanie gry',
    blurbEn: 'Decisions, composure, reading the game',
    categories: ['mental'],
    tacticsGain: 0.4,
  },
]

export const TEAM_TRAINING_INTENSITY = {
  light: {
    id: 'light',
    labelPl: 'Lekka',
    labelEn: 'Light',
    growth: 0.42,
    fatigue: 3.5,
    attendanceMod: 0.04,
  },
  medium: {
    id: 'medium',
    labelPl: 'Średnia',
    labelEn: 'Medium',
    growth: 0.72,
    fatigue: 8.5,
    attendanceMod: 0,
  },
  high: {
    id: 'high',
    labelPl: 'Wysoka',
    labelEn: 'High',
    growth: 1,
    fatigue: 15,
    attendanceMod: -0.07,
  },
}

export const WEEKDAY_OPTIONS = [
  { id: 1, labelPl: 'Poniedziałek', labelEn: 'Monday', short: 'Pn', shortEn: 'Mo' },
  { id: 2, labelPl: 'Wtorek', labelEn: 'Tuesday', short: 'Wt', shortEn: 'Tu' },
  { id: 3, labelPl: 'Środa', labelEn: 'Wednesday', short: 'Śr', shortEn: 'We' },
  { id: 4, labelPl: 'Czwartek', labelEn: 'Thursday', short: 'Cz', shortEn: 'Th' },
  { id: 5, labelPl: 'Piątek', labelEn: 'Friday', short: 'Pt', shortEn: 'Fr' },
  { id: 6, labelPl: 'Sobota', labelEn: 'Saturday', short: 'So', shortEn: 'Sa' },
  { id: 0, labelPl: 'Niedziela', labelEn: 'Sunday', short: 'Nd', shortEn: 'Su' },
]

const FOCUS_BY_ID = Object.fromEntries(TEAM_TRAINING_FOCUS_OPTIONS.map((f) => [f.id, f]))

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function clampInt(n, lo, hi) {
  return Math.round(clamp(n, lo, hi))
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

function hashStr(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function newSessionId(prefix = 'ts') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function bumpSubStat(skills, category, key, delta) {
  const nested = normalizePlayerSkills(skills)
  if (!nested[category]) nested[category] = {}
  const { min, max } = categoryStatRange(category)
  const cur = typeof nested[category][key] === 'number' ? nested[category][key] : min
  nested[category][key] = clampInt(cur + delta, min, max)
  return nested
}

function pickCategory(player, categories, rng) {
  if (!categories?.length) return null
  const mods = getIndividualFocusMods(player)
  const weights = categories.map((cat) => {
    const weakBonus =
      averageCategory(player, cat) <
      categories.reduce((s, c) => s + averageCategory(player, c), 0) / categories.length
        ? 1.25
        : 1
    return Math.max(0.05, mods.categoryPickWeight(cat) * weakBonus)
  })
  const total = weights.reduce((s, w) => s + w, 0)
  let roll = rng() * total
  for (let i = 0; i < categories.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return categories[i]
  }
  return categories[categories.length - 1]
}

function averageCategory(player, cat) {
  const keys = PLAYER_STAT_CATEGORIES[cat]
  if (!keys?.length) return 70
  let sum = 0
  for (const k of keys) sum += getSubStat(player.skills, cat, k)
  return sum / keys.length
}

function resolveCategories(focusDef) {
  if (!focusDef) return []
  if (focusDef.categories === 'all') return Object.keys(PLAYER_STAT_CATEGORIES)
  return focusDef.categories ?? []
}

/** Domyślny stan treningu drużynowego na zespole. */
export function ensureTeamTraining(team) {
  if (!team) return null
  if (!team.teamTraining || typeof team.teamTraining !== 'object') {
    team.teamTraining = {
      weekly: [],
      oneOff: [],
      tacticsFamiliarity: 38,
      lastSession: null,
      sessionLog: [],
      aiInitialized: false,
    }
  }
  const tt = team.teamTraining
  if (!Array.isArray(tt.weekly)) tt.weekly = []
  if (!Array.isArray(tt.oneOff)) tt.oneOff = []
  if (!Array.isArray(tt.sessionLog)) tt.sessionLog = []
  if (typeof tt.tacticsFamiliarity !== 'number') tt.tacticsFamiliarity = 38
  tt.tacticsFamiliarity = clampInt(tt.tacticsFamiliarity, 0, 100)
  return tt
}

export function getTacticsFamiliarity(team) {
  return ensureTeamTraining(team)?.tacticsFamiliarity ?? 38
}

/** Mnożnik efektów taktycznych z znajomości schematów (~0.94–1.08). */
export function tacticsFamiliarityMultiplier(teamOrValue) {
  const v =
    typeof teamOrValue === 'number'
      ? teamOrValue
      : getTacticsFamiliarity(teamOrValue)
  return 1 + ((v - 40) / 100) * 0.14
}

function validateFocusPair(focusA, focusB) {
  if (!FOCUS_BY_ID[focusA] || !FOCUS_BY_ID[focusB]) return false
  if (focusA === focusB) return false
  return true
}

export function addWeeklyTeamTraining(team, { weekday, focusA, focusB, intensity = 'medium' }) {
  const tt = ensureTeamTraining(team)
  if (!validateFocusPair(focusA, focusB)) return null
  if (!TEAM_TRAINING_INTENSITY[intensity]) return null
  const day = Number(weekday)
  if (!WEEKDAY_OPTIONS.some((w) => w.id === day)) return null
  if (tt.weekly.some((s) => s.weekday === day && s.enabled !== false)) return null

  const entry = {
    id: newSessionId('w'),
    weekday: day,
    focuses: [focusA, focusB],
    intensity,
    enabled: true,
  }
  tt.weekly.push(entry)
  return entry
}

export function updateWeeklyTeamTraining(team, id, patch) {
  const tt = ensureTeamTraining(team)
  const entry = tt.weekly.find((s) => s.id === id)
  if (!entry) return null
  if (patch.focusA != null || patch.focusB != null) {
    const a = patch.focusA ?? entry.focuses[0]
    const b = patch.focusB ?? entry.focuses[1]
    if (!validateFocusPair(a, b)) return null
    entry.focuses = [a, b]
  }
  if (patch.intensity && TEAM_TRAINING_INTENSITY[patch.intensity]) {
    entry.intensity = patch.intensity
  }
  if (patch.weekday != null) {
    const day = Number(patch.weekday)
    if (
      WEEKDAY_OPTIONS.some((w) => w.id === day) &&
      !tt.weekly.some((s) => s.id !== id && s.weekday === day && s.enabled !== false)
    ) {
      entry.weekday = day
    }
  }
  if (patch.enabled != null) entry.enabled = !!patch.enabled
  return entry
}

export function removeWeeklyTeamTraining(team, id) {
  const tt = ensureTeamTraining(team)
  const before = tt.weekly.length
  tt.weekly = tt.weekly.filter((s) => s.id !== id)
  return tt.weekly.length < before
}

export function addOneOffTeamTraining(team, { date, focusA, focusB, intensity = 'medium' }) {
  const tt = ensureTeamTraining(team)
  if (!validateFocusPair(focusA, focusB)) return null
  if (!TEAM_TRAINING_INTENSITY[intensity]) return null
  const iso = String(date).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null

  const entry = {
    id: newSessionId('o'),
    date: iso,
    focuses: [focusA, focusB],
    intensity,
    completed: false,
  }
  tt.oneOff.push(entry)
  return entry
}

export function removeOneOffTeamTraining(team, id) {
  const tt = ensureTeamTraining(team)
  const before = tt.oneOff.length
  tt.oneOff = tt.oneOff.filter((s) => s.id !== id)
  return tt.oneOff.length < before
}

function playerEngagement01(player, rng) {
  ensurePlayerMorale(player)
  ensurePlayerTraits(player)
  const morale = getPlayerMorale(player)
  let e = 0.5 + (morale - 60) / 180
  const traits = getPlayerTraits(player)
  if (traits.includes('professional')) e += 0.12
  if (traits.includes('workhorse')) e += 0.1
  if (traits.includes('determined')) e += 0.08
  if (traits.includes('disciplined')) e += 0.07
  if (traits.includes('relentless')) e += 0.06
  if (traits.includes('team_first')) e += 0.05
  if (traits.includes('lazy')) e -= 0.2
  if (traits.includes('glory_hunter')) e -= 0.05
  if (traits.includes('fragile_ego') && morale < 55) e -= 0.08
  e += (rng() - 0.5) * 0.12
  return clamp(e, 0.15, 0.98)
}

function playerAttends(player, intensityId, rng) {
  if (isPlayerInjured(player)) return false
  ensurePlayerTraits(player)
  const fatigue = player.developmentFatigue ?? 0
  const intensity = TEAM_TRAINING_INTENSITY[intensityId] ?? TEAM_TRAINING_INTENSITY.medium
  const focusMods = getIndividualFocusMods(player)
  let p = 0.9 - fatigue * 0.0035 + (intensity.attendanceMod ?? 0)
  if (focusMods.isRest) p -= 0.1
  const traits = getPlayerTraits(player)
  if (traits.includes('lazy')) p -= 0.12
  if (traits.includes('professional')) p += 0.05
  if (traits.includes('workhorse')) p += 0.04
  if (traits.includes('determined')) p += 0.03
  if (fatigue >= 80) p -= 0.15
  return rng() < clamp(p, 0.25, 0.98)
}

/**
 * Roll kontuzji po sesji dla obecnych zawodników.
 * @returns {{ playerId: string, name: string, daysRemaining: number, label: string }[]}
 */
function rollSessionInjuries(
  players,
  focuses,
  intensityId,
  rng,
  attendedOnly = null,
  injuryChanceMult = 1,
  team = null,
) {
  const injuries = []
  for (const player of players) {
    if (!player) continue
    if (attendedOnly && !attendedOnly.has(player.id)) continue
    if (isPlayerInjured(player)) continue

    const sessionFocuses = [...(focuses ?? [])]
    if (player.trainingFocus === 'rest') sessionFocuses.push('rest')

    const hit = tryTrainingInjury(player, intensityId, sessionFocuses, rng, {
      chanceMult: injuryChanceMult,
      team,
      medicalLevel: team?.facilities?.medicalCenter,
    })
    if (!hit) continue
    injuries.push({
      playerId: player.id,
      name: getPlayerFullName(player),
      daysRemaining: hit.daysRemaining,
      label: hit.label,
    })
  }
  return injuries
}

function growthChance(player, intensityGrowth, quality, category, rng) {
  const ovr = getOverallRating(player.skills)
  const pot = player.potential ?? ovr
  const room = pot - ovr
  const age = player.age ?? 25
  const fatigue = player.developmentFatigue ?? 0
  const focusMods = getIndividualFocusMods(player)

  // Wyższa baza: trening drużynowy to jedyne źródło wzrostu skilli w sezonie
  let p = 0.155 * intensityGrowth * quality * focusMods.sessionGrowthMult
  if (category) p *= focusMods.categoryGrowthMult(category)

  if (age <= 22) p *= 1.25
  else if (age <= 25) p *= 1.1
  else if (age <= 29) p *= 1
  else if (age <= 32) p *= 0.35
  else p *= 0.12

  if (room <= 0) p *= age < 30 ? 0.1 : 0.04
  else p *= Math.min(1.2, 0.35 + room / 22)

  if (fatigue >= 75) p *= 0.35
  else if (fatigue >= 55) p *= 0.65

  if (ovr >= 88) p *= 0.45
  else if (ovr >= 82) p *= 0.7

  return clamp(p, 0.012, 0.5)
}

function applySessionToPlayer(player, focuses, intensityId, quality, attended, engagement, rng) {
  ensurePlayerDevelopment(player)
  const intensity = TEAM_TRAINING_INTENSITY[intensityId] ?? TEAM_TRAINING_INTENSITY.medium
  const traitFatigue = getTraitMods(player).trainingFatigueMult ?? 1
  const focusMods = getIndividualFocusMods(player)

  if (!attended) {
    player.developmentFatigue = clampInt((player.developmentFatigue ?? 0) - 1.5, 0, 100)
    return { attended: false, bumps: 0 }
  }

  const fatigueGain =
    intensity.fatigue *
    (0.75 + (1 - engagement) * 0.35) *
    traitFatigue *
    focusMods.sessionFatigueMult *
    (0.85 + quality * 0.15)
  player.developmentFatigue = clampInt((player.developmentFatigue ?? 0) + fatigueGain, 0, 100)

  let bumps = 0
  const personalQuality = quality * (0.7 + engagement * 0.3)

  for (const focusId of focuses) {
    const def = FOCUS_BY_ID[focusId]
    const cats = resolveCategories(def)
    const attempts = 2
    for (let i = 0; i < attempts; i += 1) {
      const cat = pickCategory(player, cats, rng)
      if (!cat) continue
      const chance = growthChance(player, intensity.growth, personalQuality, cat, rng)
      if (rng() > chance) continue
      const keys = PLAYER_STAT_CATEGORIES[cat]
      if (!keys?.length) continue
      const key = keys[Math.floor(rng() * keys.length)]
      const pot = player.potential ?? 80
      const current = getSubStat(player.skills, cat, key)
      if (current >= pot + 2 && rng() > 0.12) continue
      player.skills = bumpSubStat(player.skills, cat, key, 1)
      bumps += 1
    }
  }

  return { attended: true, bumps }
}

export function sessionQualityLabel(q, lang = 'pl') {
  const pl =
    q >= 0.92 ? 'Świetny' : q >= 0.78 ? 'Dobry' : q >= 0.62 ? 'Solidny' : q >= 0.48 ? 'Przeciętny' : 'Słaby'
  const en =
    q >= 0.92
      ? 'Excellent'
      : q >= 0.78
        ? 'Good'
        : q >= 0.62
          ? 'Solid'
          : q >= 0.48
            ? 'Average'
            : 'Poor'
  return lang === 'en' ? en : pl
}

/**
 * Rozgrywa jedną sesję treningową drużyny.
 * @param {'full'|'fast'} options.detail — full = per-zawodnik (gracz), fast = zagregowane (AI)
 */
export function runTeamTrainingSession(team, plan, options = {}) {
  const focuses = plan.focuses ?? []
  const intensityId = plan.intensity ?? 'medium'
  if (focuses.length < 2 || !TEAM_TRAINING_INTENSITY[intensityId]) {
    return null
  }

  const seed =
    options.seed ??
    hashStr(`${team.id}|${options.date ?? ''}|${focuses.join('+')}|${intensityId}|${plan.id ?? ''}`)

  return runSessionCore(team, focuses, intensityId, {
    seed,
    detail: options.detail ?? 'full',
    date: options.date,
    planId: plan.id,
    source: plan.source ?? (plan.date ? 'oneOff' : 'weekly'),
  })
}

function runSessionCore(team, focuses, intensityId, meta) {
  const tt = ensureTeamTraining(team)
  ensureTeamFacilities(team)
  const facilityQualityMult = trainingCenterQualityMult(team)
  const injuryChanceMult = medicalInjuryChanceMult(team)
  const moraleNudge = chillRoomMoraleDelta(team)
  const rng = mulberry32(meta.seed)
  const players = team.players ?? []
  const detail = meta.detail ?? 'full'
  const luck = 0.72 + rng() * 0.5

  let attendedCount = 0
  let totalBumps = 0

  if (detail === 'fast') {
    const avgFatigue =
      players.reduce((s, p) => s + (p.developmentFatigue ?? 0), 0) / Math.max(1, players.length)
    const attendance = clamp(0.78 - avgFatigue * 0.002 + rng() * 0.18, 0.55, 0.97)
    const engagement = clamp(0.55 + rng() * 0.28, 0.42, 0.9)
    const quality = clamp(
      (attendance * 0.34 + engagement * 0.38 + luck * 0.28) * facilityQualityMult,
      0.35,
      1.25,
    )

    const attendedIds = new Set()
    for (const player of players) {
      if (isPlayerInjured(player)) continue
      const attended = rng() < attendance
      const eng = clamp(engagement + (rng() - 0.5) * 0.08, 0.2, 0.98)
      const result = applySessionToPlayer(player, focuses, intensityId, quality, attended, eng, rng)
      if (result.attended) {
        attendedCount += 1
        totalBumps += result.bumps
        attendedIds.add(player.id)
        if (moraleNudge) applyChillMorale(player, moraleNudge, rng)
      }
    }

    const injuries = rollSessionInjuries(
      players,
      focuses,
      intensityId,
      rng,
      attendedIds,
      injuryChanceMult,
      team,
    )
    const tacticsDelta = applyTacticsGain(tt, focuses, quality, intensityId)
    const report = buildReport({
      date: meta.date,
      focuses,
      intensityId,
      attendance,
      engagement,
      luck,
      quality,
      attendedCount,
      rosterSize: players.length,
      bumps: totalBumps,
      tacticsDelta,
      source: meta.source,
      planId: meta.planId,
      injuries,
    })
    storeReport(tt, report)
    return report
  }

  // Full detail — drużyna gracza
  const attendanceFlags = []
  for (const player of players) {
    const attended = playerAttends(player, intensityId, rng)
    const eng = playerEngagement01(player, rng)
    attendanceFlags.push({ player, attended, eng })
  }

  const attRate =
    attendanceFlags.length > 0
      ? attendanceFlags.filter((e) => e.attended).length / attendanceFlags.length
      : 0.7
  const present = attendanceFlags.filter((e) => e.attended)
  const engAvg =
    present.length > 0 ? present.reduce((s, e) => s + e.eng, 0) / present.length : 0.55
  const quality = clamp(
    (attRate * 0.34 + engAvg * 0.38 + luck * 0.28) * facilityQualityMult,
    0.35,
    1.25,
  )

  const attendedIds = new Set()
  for (const row of attendanceFlags) {
    const result = applySessionToPlayer(
      row.player,
      focuses,
      intensityId,
      quality,
      row.attended,
      row.eng,
      rng,
    )
    if (result.attended) {
      attendedCount += 1
      totalBumps += result.bumps
      attendedIds.add(row.player.id)
      if (moraleNudge) applyChillMorale(row.player, moraleNudge, rng)
    }
  }

  const injuries = rollSessionInjuries(
    players,
    focuses,
    intensityId,
    rng,
    attendedIds,
    injuryChanceMult,
    team,
  )
  const tacticsDelta = applyTacticsGain(tt, focuses, quality, intensityId)
  const report = buildReport({
    date: meta.date,
    focuses,
    intensityId,
    attendance: attRate,
    engagement: engAvg,
    luck,
    quality,
    attendedCount,
    rosterSize: players.length,
    bumps: totalBumps,
    tacticsDelta,
    source: meta.source,
    planId: meta.planId,
    injuries,
  })
  storeReport(tt, report)
  return report
}

function applyChillMorale(player, delta, rng = Math.random) {
  if (!player || !delta) return
  ensurePlayerMorale(player)
  ensurePlayerTraits(player)
  const mult = getTraitMods(player).chillRoomMoraleMult ?? 1
  const scaled = delta * mult
  const roll = typeof rng === 'function' ? rng() : Math.random()
  // Lekkie efekty: |delta|<1 → szansa na ±1; inaczej zaokrąglony bump.
  if (Math.abs(scaled) < 1) {
    if (roll >= Math.abs(scaled)) return
    const bump = scaled > 0 ? 1 : -1
    player.morale = Math.max(25, Math.min(99, Math.round(player.morale + bump)))
    return
  }
  player.morale = Math.max(25, Math.min(99, Math.round(player.morale + Math.round(scaled))))
}

function applyTacticsGain(tt, focuses, quality, intensityId) {
  const intensity = TEAM_TRAINING_INTENSITY[intensityId] ?? TEAM_TRAINING_INTENSITY.medium
  let gain = 0
  for (const focusId of focuses) {
    gain += FOCUS_BY_ID[focusId]?.tacticsGain ?? 0.15
  }
  // Soft cap near 100 — harder to push high familiarity
  const cur = tt.tacticsFamiliarity ?? 38
  const roomMult = cur >= 85 ? 0.25 : cur >= 70 ? 0.5 : cur >= 55 ? 0.75 : 1
  const delta = gain * quality * intensity.growth * 0.55 * roomMult
  const before = cur
  tt.tacticsFamiliarity = clampInt(cur + delta, 0, 100)
  // Natural tiny decay is applied weekly elsewhere; here only gains
  return tt.tacticsFamiliarity - before
}

function buildReport(args) {
  return {
    date: args.date,
    focuses: args.focuses,
    intensity: args.intensityId,
    attendance: Math.round(args.attendance * 100),
    engagement: Math.round(args.engagement * 100),
    luck: Math.round(args.luck * 100),
    quality: Math.round(args.quality * 100),
    qualityLabel: sessionQualityLabel(args.quality, 'pl'),
    qualityLabelEn: sessionQualityLabel(args.quality, 'en'),
    attendedCount: args.attendedCount,
    rosterSize: args.rosterSize,
    skillBumps: args.bumps,
    tacticsDelta: args.tacticsDelta,
    source: args.source,
    planId: args.planId,
    injuries: args.injuries ?? [],
  }
}

function storeReport(tt, report) {
  tt.lastSession = report
  tt.sessionLog = [report, ...(tt.sessionLog ?? [])].slice(0, 12)
}

/** AI: 1–2 stałe dni w tygodniu (unikaj weekendu meczowego gdy się da). */
export function ensureAiTeamTrainingPlan(team, seedTag = '') {
  const tt = ensureTeamTraining(team)
  if (tt.aiInitialized && tt.weekly.length > 0) return tt

  const rng = mulberry32(hashStr(`${team.id}|ai-plan|${seedTag}`))
  tt.weekly = []

  const midweek = [1, 2, 3, 4] // Pn–Cz
  const shuffle = [...midweek].sort(() => rng() - 0.5)
  const count = rng() < 0.55 ? 2 : 1
  const days = shuffle.slice(0, count)

  const focusPool = TEAM_TRAINING_FOCUS_OPTIONS.map((f) => f.id)
  for (const day of days) {
    const a = focusPool[Math.floor(rng() * focusPool.length)]
    let b = focusPool[Math.floor(rng() * focusPool.length)]
    while (b === a) b = focusPool[Math.floor(rng() * focusPool.length)]
    // Prefer structural at least sometimes
    const focuses =
      rng() < 0.35 ? ['structural', a === 'structural' ? b : a] : [a, b]
    if (focuses[0] === focuses[1]) focuses[1] = 'skills'

    const intensity = rng() < 0.2 ? 'high' : rng() < 0.35 ? 'light' : 'medium'
    tt.weekly.push({
      id: newSessionId('ai'),
      weekday: day,
      focuses,
      intensity,
      enabled: true,
    })
  }

  if (typeof tt.tacticsFamiliarity !== 'number') {
    tt.tacticsFamiliarity = clampInt(32 + rng() * 18, 28, 55)
  }
  tt.aiInitialized = true
  return tt
}

export function initAllAiTeamTraining(world, playerTeamId) {
  if (!world?.teamsById) return world
  for (const team of Object.values(world.teamsById)) {
    if (team.id === playerTeamId) {
      ensureTeamTraining(team)
      continue
    }
    ensureAiTeamTrainingPlan(team, 'init')
  }
  return world
}

function plansForDate(team, isoDate, isPlayerTeam) {
  const tt = ensureTeamTraining(team)
  if (!isPlayerTeam) ensureAiTeamTrainingPlan(team)

  const dow = parseISODate(isoDate).getDay()
  const plans = []

  for (const w of tt.weekly) {
    if (w.enabled === false) continue
    if (w.weekday === dow) {
      plans.push({ ...w, source: 'weekly' })
    }
  }
  for (const o of tt.oneOff) {
    if (o.completed) continue
    if (o.date === isoDate) {
      plans.push({ ...o, source: 'oneOff' })
    }
  }
  return plans
}

/**
 * Treningi drużyny do wyświetlenia w kalendarzu (tygodniowe + one-off, także ukończone).
 * @returns {object[]}
 */
export function getTeamTrainingsOnDate(team, isoDate) {
  if (!team || !isoDate) return []
  const tt = ensureTeamTraining(team)
  const date = String(isoDate).slice(0, 10)
  const dow = parseISODate(date).getDay()
  const plans = []

  for (const w of tt.weekly ?? []) {
    if (w.enabled === false) continue
    if (w.weekday === dow) {
      plans.push({
        ...w,
        source: 'weekly',
        date,
        recurring: true,
      })
    }
  }
  for (const o of tt.oneOff ?? []) {
    if (o.date !== date) continue
    plans.push({
      ...o,
      source: 'oneOff',
      recurring: false,
    })
  }

  // Dołącz raport sesji z logu (jakość), jeśli był
  const log = tt.sessionLog ?? []
  return plans.map((p) => {
    const report =
      log.find((r) => r.date === date && r.planId === p.id) ??
      log.find((r) => r.date === date && r.source === p.source) ??
      null
    return report ? { ...p, report } : p
  })
}

/** Czy w danym dniu drużyna ma zaplanowany trening. */
export function teamHasTrainingOnDate(team, isoDate) {
  return getTeamTrainingsOnDate(team, isoDate).length > 0
}

/**
 * Przetwarza treningi wszystkich drużyn w danym dniu.
 * @returns {{ reports: object[], sessions: number }}
 */
export function processTeamTrainingsForDate(league, isoDate, options = {}) {
  const teamsById = league?.teamsById
  if (!teamsById || !isoDate) return { reports: [], sessions: 0 }

  const playerTeamId = options.playerTeamId ?? league.playerTeamId
  const reports = []
  let sessions = 0
  const date = String(isoDate).slice(0, 10)

  // Skip training on heavy match congestion? Still allow — fatigue handles it.

  for (const team of Object.values(teamsById)) {
    const isPlayer = team.id === playerTeamId
    const plans = plansForDate(team, date, isPlayer)
    if (!plans.length) continue

    for (const plan of plans) {
      const report = runSessionCore(team, plan.focuses, plan.intensity, {
        seed: hashStr(
          `${league.simSeedBase ?? 0}|${team.id}|${date}|${plan.id}|${plan.focuses.join('+')}`,
        ),
        detail: isPlayer ? 'full' : 'fast',
        date,
        planId: plan.id,
        source: plan.source,
      })
      if (report) {
        sessions += 1
        if (isPlayer) reports.push(report)
      }
      if (plan.source === 'oneOff') {
        const tt = ensureTeamTraining(team)
        const entry = tt.oneOff.find((x) => x.id === plan.id)
        if (entry) entry.completed = true
      }
    }
  }

  return { reports, sessions }
}

/**
 * Lekki spadek znajomości taktyk + AI odświeża plany — wołane przy weekTick.
 */
export function weeklyTeamTrainingMaintenance(league, options = {}) {
  const teamsById = league?.teamsById
  if (!teamsById) return league
  const playerTeamId = options.playerTeamId ?? league.playerTeamId
  const rng = mulberry32(
    hashStr(`${league.simSeedBase ?? 0}|tt-maint|${league.currentDate ?? ''}`),
  )

  for (const team of Object.values(teamsById)) {
    const tt = ensureTeamTraining(team)
    // Natural decay of unused structure knowledge
    tt.tacticsFamiliarity = clampInt((tt.tacticsFamiliarity ?? 38) - (0.35 + rng() * 0.45), 0, 100)

    if (team.id === playerTeamId) continue
    ensureAiTeamTrainingPlan(team)
    // Rare AI plan tweak
    if (rng() < 0.12 && tt.weekly.length) {
      const slot = tt.weekly[Math.floor(rng() * tt.weekly.length)]
      const pool = TEAM_TRAINING_FOCUS_OPTIONS.map((f) => f.id)
      const a = pool[Math.floor(rng() * pool.length)]
      let b = pool[Math.floor(rng() * pool.length)]
      while (b === a) b = pool[Math.floor(rng() * pool.length)]
      slot.focuses = [a, b]
      if (rng() < 0.4) {
        slot.intensity = rng() < 0.25 ? 'high' : rng() < 0.4 ? 'light' : 'medium'
      }
    }
  }
  return league
}

/**
 * Szybka ścieżka: treningi w zakresie dat [fromIso, toIso) — bez osobnych raportów AI.
 * Używane przy „Symuluj do meczu”.
 */
export function processTeamTrainingsDateRange(league, fromIso, toIso, options = {}) {
  if (!fromIso || !toIso || fromIso >= toIso) return { sessions: 0, reports: [] }
  let cursor = fromIso
  let sessions = 0
  const reports = []
  let guard = 0
  while (cursor < toIso && guard < 400) {
    const result = processTeamTrainingsForDate(league, cursor, options)
    sessions += result.sessions
    if (result.reports?.length) reports.push(...result.reports)
    cursor = formatISODate(addDays(cursor, 1))
    guard += 1
  }
  return { sessions, reports }
}

/**
 * Async zakres treningów z raportowaniem postępu.
 */
export async function processTeamTrainingsDateRangeAsync(league, fromIso, toIso, options = {}) {
  if (!fromIso || !toIso || fromIso >= toIso) return { sessions: 0, reports: [] }
  const onProgress = options.onProgress
  const yieldEvery = options.yieldEvery ?? 3
  let cursor = fromIso
  let sessions = 0
  const reports = []
  let guard = 0
  const total = Math.max(
    1,
    Math.round(
      (parseISODate(toIso).getTime() - parseISODate(fromIso).getTime()) / 86_400_000,
    ),
  )
  while (cursor < toIso && guard < 400) {
    const result = processTeamTrainingsForDate(league, cursor, options)
    sessions += result.sessions
    if (result.reports?.length) reports.push(...result.reports)
    guard += 1
    if (onProgress && guard % yieldEvery === 0) {
      onProgress({
        phase: 'training',
        daysAdvanced: guard,
        total,
        currentDate: cursor,
      })
      await new Promise((r) => setTimeout(r, 0))
    }
    cursor = formatISODate(addDays(cursor, 1))
  }
  return { sessions, reports }
}

export function focusLabel(id, lang = 'pl') {
  const row = FOCUS_BY_ID[id]
  if (!row) return id
  return lang === 'en' ? row.labelEn ?? row.labelPl : row.labelPl ?? row.labelEn
}

export function intensityLabel(id, lang = 'pl') {
  const row = TEAM_TRAINING_INTENSITY[id]
  if (!row) return id
  return lang === 'en' ? row.labelEn ?? row.labelPl : row.labelPl ?? row.labelEn
}

export function weekdayLabel(id, lang = 'pl') {
  const row = WEEKDAY_OPTIONS.find((w) => w.id === id)
  if (!row) return String(id)
  return lang === 'en' ? row.labelEn ?? row.labelPl : row.labelPl ?? row.labelEn
}
