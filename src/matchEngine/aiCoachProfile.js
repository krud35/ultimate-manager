/**
 * Ukryte profile trenerów AI — losowane przy nowym zapisie kariery.
 * Modyfikują tożsamość taktyczną drużyny (formacje, suwaki, temperament).
 */

import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
} from './tacticsModifiers.js'
import { normalizeCoachDirectives, defaultCoachDirectives } from './coachDirectives.js'
import { createRng } from './rng.js'

/** @typedef {'patient'|'tempo'|'creative'|'balanced'|'aggressive'} AttackMindset */
/** @typedef {'contain'|'pressure'|'zone'|'balanced'} DefenseMindset */

/**
 * @typedef {object} AiCoachProfile
 * @property {string} id
 * @property {string} label
 * @property {AttackMindset} attackMindset
 * @property {DefenseMindset} defenseMindset
 * @property {string[]} preferredAttackStyles
 * @property {string[]} preferredDefenseStyles
 * @property {string} [preferredForce]
 * @property {object} directiveBias — dodatek −1…1 do suwaków
 * @property {number} adaptability — 0…1 jak chętnie zmienia taktykę w meczu
 * @property {number} conservatism — 0…1 opór przed zmianą gdy idzie OK
 */

/** @type {AiCoachProfile[]} */
export const AI_COACH_ARCHETYPES = [
  {
    id: 'patient_controller',
    label: 'Cierpliwy kontroler',
    attackMindset: 'patient',
    defenseMindset: 'contain',
    preferredAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    preferredDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    directiveBias: {
      creativity: -0.25,
      huckAppetite: -0.35,
      possessionTempo: -0.5,
      breakAppetite: -0.15,
      passSelectivity: -0.35,
      coverageShade: -0.1,
    },
    adaptability: 0.35,
    conservatism: 0.75,
  },
  {
    id: 'tempo_pusher',
    label: 'Tempo / flow',
    attackMindset: 'tempo',
    defenseMindset: 'pressure',
    preferredAttackStyles: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.MOTION_OFFENSE],
    preferredDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    preferredForce: FORCE_SIDES.FORCE_BACKHAND,
    directiveBias: {
      creativity: 0.15,
      huckAppetite: 0.2,
      possessionTempo: 0.55,
      breakAppetite: 0.15,
      passSelectivity: 0.15,
      coverageShade: -0.2,
    },
    adaptability: 0.55,
    conservatism: 0.4,
  },
  {
    id: 'huck_gambler',
    label: 'Deep gambler',
    attackMindset: 'aggressive',
    defenseMindset: 'pressure',
    preferredAttackStyles: [ATTACK_STYLES.SPLIT_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    preferredDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_MIDDLE,
    directiveBias: {
      creativity: 0.35,
      huckAppetite: 0.65,
      possessionTempo: 0.25,
      breakAppetite: 0.2,
      passSelectivity: 0.25,
      coverageShade: 0.25,
    },
    adaptability: 0.45,
    conservatism: 0.35,
  },
  {
    id: 'zone_architect',
    label: 'Architekt strefy',
    attackMindset: 'patient',
    defenseMindset: 'zone',
    preferredAttackStyles: [ATTACK_STYLES.ZONE_OFFENSE, ATTACK_STYLES.VERTICAL_STACK],
    preferredDefenseStyles: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.ZONE_WALL],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    directiveBias: {
      creativity: -0.1,
      huckAppetite: -0.15,
      possessionTempo: -0.2,
      breakAppetite: 0.25,
      passSelectivity: -0.2,
      coverageShade: 0.1,
    },
    adaptability: 0.5,
    conservatism: 0.55,
  },
  {
    id: 'creative_iso',
    label: 'Kreatywne iso',
    attackMindset: 'creative',
    defenseMindset: 'balanced',
    preferredAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    preferredDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    directiveBias: {
      creativity: 0.55,
      huckAppetite: 0.1,
      possessionTempo: 0.1,
      breakAppetite: 0.45,
      passSelectivity: 0.05,
      coverageShade: 0.15,
    },
    adaptability: 0.65,
    conservatism: 0.3,
  },
  {
    id: 'balanced_pro',
    label: 'Zrównoważony pro',
    attackMindset: 'balanced',
    defenseMindset: 'balanced',
    preferredAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    preferredDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    directiveBias: {
      creativity: 0,
      huckAppetite: 0,
      possessionTempo: 0,
      breakAppetite: 0,
      passSelectivity: -0.1,
      coverageShade: 0,
    },
    adaptability: 0.55,
    conservatism: 0.5,
  },
  {
    id: 'grind_defense',
    label: 'Grind D-first',
    attackMindset: 'patient',
    defenseMindset: 'pressure',
    preferredAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    preferredDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    directiveBias: {
      creativity: -0.2,
      huckAppetite: -0.25,
      possessionTempo: -0.3,
      breakAppetite: -0.05,
      passSelectivity: -0.25,
      coverageShade: 0.2,
    },
    adaptability: 0.4,
    conservatism: 0.65,
  },
]

function clampBias(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

/**
 * Właściwe uśrednienie ważone (współczynniki sumują się do 1) — poprzednia wersja
 * sumowała `base*(1-weight*0.35) + bias*weight` (razem ~1.55 przy weight=0.85), więc
 * gdy tożsamość drużyny i wylosowany archetyp trenera zgadzały się kierunkiem
 * (częste — archetypy jak "patient"/"tempo" pokrywają się z gotowymi tożsamościami),
 * efekty się wzmacniały zamiast uśredniać i suwak lądował przy granicy ±1.
 */
function blendDirective(base, bias, weight = 0.85) {
  return clampBias((base ?? 0) * (1 - weight) + (bias ?? 0) * weight)
}

/** Deterministyczny wybór archetypu z seeda (teamId + saveSeed). */
export function pickAiCoachArchetype(rngOrSeed) {
  const rng =
    typeof rngOrSeed === 'object' && rngOrSeed?.float
      ? rngOrSeed
      : createRng(typeof rngOrSeed === 'number' ? rngOrSeed : hashString(String(rngOrSeed ?? 'ai')))
  const idx = Math.floor(rng.float() * AI_COACH_ARCHETYPES.length) % AI_COACH_ARCHETYPES.length
  const base = AI_COACH_ARCHETYPES[idx]
  // Lekki jitter suwaków, żeby nie wszystkie drużyny z tym samym archetypem były klonami.
  const jitter = (key, amp = 0.12) =>
    clampBias((base.directiveBias?.[key] ?? 0) + (rng.float() * 2 - 1) * amp)
  return {
    ...base,
    directiveBias: {
      creativity: jitter('creativity'),
      coverageShade: jitter('coverageShade', 0.1),
      huckAppetite: jitter('huckAppetite'),
      passSelectivity: jitter('passSelectivity', 0.1),
      breakAppetite: jitter('breakAppetite'),
      possessionTempo: jitter('possessionTempo'),
    },
    adaptability: Math.max(0.2, Math.min(0.95, base.adaptability + (rng.float() * 2 - 1) * 0.08)),
    conservatism: Math.max(0.15, Math.min(0.9, base.conservatism + (rng.float() * 2 - 1) * 0.08)),
  }
}

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Losuje profile dla wszystkich drużyn AI w świecie (przy createCareer).
 * @param {object} world
 * @param {string|null} playerTeamId
 * @param {number} [seed]
 */
export function rollAiCoachProfilesForWorld(world, playerTeamId = null, seed = null) {
  if (!world?.teamsById) return world
  const baseSeed = seed ?? (Date.now() % 1_000_000)
  for (const id of world.teamIds ?? Object.keys(world.teamsById)) {
    const team = world.teamsById[id]
    if (!team) continue
    if (playerTeamId && id === playerTeamId) {
      team.aiCoachProfile = null
      continue
    }
    team.aiCoachProfile = pickAiCoachArchetype(hashString(`${baseSeed}:${id}`))
  }
  return world
}

/** Uzupełnia brakujące profile (stare save'y) — deterministycznie z teamId. */
export function ensureAiCoachProfiles(world, playerTeamId = null) {
  if (!world?.teamsById) return world
  for (const id of world.teamIds ?? Object.keys(world.teamsById)) {
    const team = world.teamsById[id]
    if (!team) continue
    if (playerTeamId && id === playerTeamId) {
      if (team.aiCoachProfile == null) team.aiCoachProfile = null
      continue
    }
    if (!team.aiCoachProfile?.id) {
      team.aiCoachProfile = pickAiCoachArchetype(hashString(`ensure:${id}`))
    }
  }
  return world
}

/**
 * Łączy tożsamość ligową z ukrytym profilem trenera.
 * @param {object} identity — z teamTacticalIdentity()
 * @param {AiCoachProfile|null|undefined} profile
 */
export function applyAiCoachProfileToIdentity(identity, profile) {
  if (!profile?.id) return identity

  const bias = profile.directiveBias ?? {}
  const baseO = identity.oLineCoachDirectives ?? identity.coachDirectives ?? defaultCoachDirectives()
  const baseD = identity.dLineCoachDirectives ?? identity.coachDirectives ?? baseO

  const mergeDirs = (base) =>
    normalizeCoachDirectives({
      ...base,
      creativity: blendDirective(base.creativity, bias.creativity),
      coverageShade: blendDirective(base.coverageShade, bias.coverageShade),
      huckAppetite: blendDirective(base.huckAppetite, bias.huckAppetite),
      passSelectivity: blendDirective(base.passSelectivity, bias.passSelectivity),
      breakAppetite: blendDirective(base.breakAppetite, bias.breakAppetite),
      possessionTempo: blendDirective(base.possessionTempo, bias.possessionTempo),
      forceSide: profile.preferredForce ?? base.forceSide,
    })

  const oDirs = mergeDirs(baseO)
  const dDirs = mergeDirs(baseD)

  const pickStyle = (preferred, fallback) => {
    if (preferred?.length && preferred.includes(fallback)) return fallback
    return preferred?.[0] ?? fallback
  }

  // ~60% szansy na ulubioną formację trenera zamiast czystej identity (już „wybrane” przy rollu).
  const useCoachAttack = profile.attackMindset !== 'balanced'
  const useCoachDefense = profile.defenseMindset !== 'balanced'

  return {
    ...identity,
    label: `${identity.label} · ${profile.label}`,
    aiCoachProfile: profile,
    oLineAttackStyle: useCoachAttack
      ? pickStyle(profile.preferredAttackStyles, identity.oLineAttackStyle)
      : identity.oLineAttackStyle,
    dLineAttackStyle: useCoachAttack
      ? pickStyle(profile.preferredAttackStyles, identity.dLineAttackStyle)
      : identity.dLineAttackStyle,
    oLineDefenseStyle: useCoachDefense
      ? pickStyle(profile.preferredDefenseStyles, identity.oLineDefenseStyle)
      : identity.oLineDefenseStyle,
    dLineDefenseStyle: useCoachDefense
      ? pickStyle(profile.preferredDefenseStyles, identity.dLineDefenseStyle)
      : identity.dLineDefenseStyle,
    oLineCoachDirectives: oDirs,
    dLineCoachDirectives: dDirs,
    coachDirectives: oDirs,
    forceSide: oDirs.forceSide,
    attackMindset: profile.attackMindset,
    defenseMindset: profile.defenseMindset,
    adaptability: profile.adaptability ?? 0.5,
    conservatism: profile.conservatism ?? 0.5,
  }
}

/** Profil z drużyny albo deterministyczny fallback. */
export function resolveTeamAiCoachProfile(team) {
  if (team?.aiCoachProfile?.id) return team.aiCoachProfile
  if (!team?.id) return null
  return pickAiCoachArchetype(hashString(`runtime:${team.id}`))
}
