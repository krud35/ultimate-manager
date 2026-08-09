/**
 * Losowe skille / pasma OVR przy trybie „losowe składy”.
 * Bulk 74–83, good 84–88, elite 89–94.
 */
import {
  SKILLS_GEN_VERSION,
  buildBalancedSubStats,
  buildPlayerArchetypeTiers,
  getOverallRating,
  normalizePlayerSkills,
} from '../models/playerStats.js'

const OVR_BULK_MIN = 74
const OVR_BULK_MAX = 83
const OVR_GOOD_MIN = 84
const OVR_GOOD_MAX = 88
const OVR_ELITE_MIN = 89
const OVR_ELITE_MAX = 94

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(...parts) {
  let h = 2166136261
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function scaleSkillsToTargetOvr(skills, targetOvr) {
  const nested = normalizePlayerSkills(skills)
  for (let pass = 0; pass < 8; pass += 1) {
    const current = getOverallRating(nested)
    if (Math.abs(current - targetOvr) <= 0.5) break
    const factor = targetOvr / Math.max(1, current)
    for (const cat of Object.keys(nested)) {
      const block = nested[cat]
      if (!block || typeof block !== 'object') continue
      for (const key of Object.keys(block)) {
        if (typeof block[key] !== 'number') continue
        block[key] = Math.max(40, Math.min(99, Math.round(block[key] * factor)))
      }
    }
  }
  return nested
}

/**
 * Buduje całkowicie nowe skille (bez UFA reference) dla składu.
 */
export function rollRandomSkillsForRoster(players, seedKey) {
  const rng = mulberry32(hashSeed(seedKey, 'skills'))
  for (const p of players) {
    const tiers = buildPlayerArchetypeTiers(rng)
    p.skills = buildBalancedSubStats(hashSeed(seedKey, p.id), (cat) => tiers[cat])
    p.skillsGen = SKILLS_GEN_VERSION
    // Clear UFA anchor so regeneration later doesn't re-pull historical
    p.ufaReference = {
      goals: 0,
      assists: 0,
      blocks: 0,
      throwingYards: 0,
      receivingYards: 0,
      randomGenerated: true,
    }
  }
  return players
}

/**
 * Ustawia docelowe OVR: większość 74–83, część 84–88, elita 89–94.
 */
export function applyRandomOvrBands(players, seedKey) {
  if (!players?.length) return players
  const rng = mulberry32(hashSeed(seedKey, 'ovr-bands'))
  const n = players.length
  const eliteSlots = Math.max(1, Math.min(2, Math.round(n * 0.05)))
  const goodSlots = Math.max(2, Math.min(4, Math.round(n * 0.12)))

  const order = players
    .map((p, i) => ({ p, i, noise: rng() }))
    .sort((a, b) => b.noise - a.noise)

  for (let i = 0; i < order.length; i += 1) {
    const { p, noise } = order[i]
    let target
    if (i < eliteSlots) {
      target = Math.round(lerp(OVR_ELITE_MIN, OVR_ELITE_MAX, 0.2 + noise * 0.8))
    } else if (i < eliteSlots + goodSlots) {
      const t = (i - eliteSlots) / Math.max(1, goodSlots - 1)
      target = Math.round(lerp(OVR_GOOD_MAX, OVR_GOOD_MIN, t * 0.7 + noise * 0.3))
    } else {
      const bulkI = i - eliteSlots - goodSlots
      const bulkN = Math.max(1, n - eliteSlots - goodSlots)
      const rankT = 1 - bulkI / bulkN
      target = Math.round(lerp(OVR_BULK_MIN, OVR_BULK_MAX, rankT * 0.85 + noise * 0.15))
    }
    p.skills = scaleSkillsToTargetOvr(p.skills, target)
    p.skillsGen = SKILLS_GEN_VERSION
  }
  return players
}
