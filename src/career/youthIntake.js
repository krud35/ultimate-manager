/**
 * Nabór młodych wolnych agentów (18–19) po emeryturach.
 */

import {
  SKILLS_GEN_VERSION,
  buildBalancedSubStats,
  getOverallRating,
  normalizePlayerSkills,
} from '../models/playerStats.js'
import { rollTraitsForPlayer } from '../models/playerTraits.js'
import { ensurePlayerDevelopment } from './playerDevelopment.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerLoyalty } from '../models/playerLoyalty.js'
import { ensurePlayerInjury } from '../models/playerInjury.js'
import { ensureWorldFreeAgents, PLAYER_STATUS } from './transfers/freeAgency.js'
import { refreshPlayerMarketValue } from './transfers/playerValue.js'

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Jamie',
  'Taylor', 'Reese', 'Parker', 'Skyler', 'Blake', 'Hayden', 'Logan', 'Noah', 'Ethan', 'Owen',
  'Leo', 'Miles', 'Kai', 'Felix', 'Theo', 'Marcus', 'Julian', 'Adrian', 'Silas', 'Nico',
]

const LAST_NAMES = [
  'Brooks', 'Hayes', 'Reed', 'Cole', 'Bennett', 'Foster', 'Griffin', 'Harper', 'Lane', 'West',
  'North', 'Stone', 'Rivera', 'Keller', 'Vaughn', 'Pratt', 'Nash', 'Crowe', 'Bishop', 'Vance',
  'Monroe', 'Adler', 'Quincy', 'Sato', 'Nguyen', 'Patel', 'Okoye', 'Berg', 'Diaz', 'Shaw',
]

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

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
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
 * Losuje tier: bad / mediocre / good z pasmami OVR.
 */
function rollYouthTier(rng) {
  const r = rng()
  if (r < 0.38) {
    return { tier: 'bad', min: 70, max: 82 }
  }
  if (r < 0.78) {
    return { tier: 'mediocre', min: 74, max: 86 }
  }
  return { tier: 'good', min: 78, max: 88 }
}

function createYouthPlayer(rng, seasonYear, index) {
  const id = `youth-${seasonYear}-${hashSeed(seasonYear, index, rng())}`
  const { min, max, tier } = rollYouthTier(rng)
  const targetOvr = min + Math.floor(rng() * (max - min + 1))
  let skills = buildBalancedSubStats(hashSeed(id, 'skills'), () => rng())
  skills = scaleSkillsToTargetOvr(skills, targetOvr)
  const ovr = getOverallRating(skills)
  const age = rng() < 0.55 ? 18 : 19
  const potential = Math.min(95, ovr + 6 + Math.floor(rng() * 8))

  const player = {
    id,
    firstName: pick(rng, FIRST_NAMES),
    lastName: pick(rng, LAST_NAMES),
    jersey: 1 + Math.floor(rng() * 99),
    age,
    potential,
    skills,
    skillsGen: SKILLS_GEN_VERSION,
    status: PLAYER_STATUS.FREE_AGENT,
    youthIntake: true,
    youthTier: tier,
    ufaReference: {
      goals: 0,
      assists: 0,
      blocks: 0,
      throwingYards: 0,
      receivingYards: 0,
      randomGenerated: true,
    },
    contract: null,
  }

  rollTraitsForPlayer(player)
  ensurePlayerDevelopment(player)
  player.age = age
  player.potential = potential
  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  ensurePlayerLoyalty(player)
  ensurePlayerInjury(player)
  refreshPlayerMarketValue(player)
  return player
}

/**
 * Spawnuje ~tyle FA ile emerytur.
 * @returns {{ spawned: object[] }}
 */
export function spawnYouthFreeAgents(world, count, options = {}) {
  ensureWorldFreeAgents(world)
  const n = Math.max(0, Math.round(Number(count) || 0))
  if (n <= 0) return { spawned: [] }

  const seasonYear = options.seasonYear ?? world.templateSeasonYear ?? 2025
  const rng = mulberry32(hashSeed(options.seed ?? seasonYear, 'youth-intake', n))
  const spawned = []
  for (let i = 0; i < n; i += 1) {
    const player = createYouthPlayer(rng, seasonYear, i)
    world.freeAgents.push(player)
    spawned.push(player)
  }
  return { spawned }
}
