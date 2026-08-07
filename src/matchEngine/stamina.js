/** Parametry zmęczenia — strojenie bez zmiany logiki sesji. */
import { getSubStat } from '../models/playerStats.js'
import { getTraitMods } from '../models/playerTraits.js'
import {
  isHandlerSubRole,
  isCutterSubRole,
  storedSubRoleForPlayer,
} from './playerSubRoles.js'

export const STAMINA_CONFIG = {
  max: 100,
  default: 100,
  /** Próg v [m/s] liczony jako sprint (effort + brak regen w ticku). */
  sprintSpeedMps: 4.5,
  /**
   * Koszt resztkowy po punkcie z dystansu sprintu → skala 5–20.
   * refSprintM ≈ pełny wysiłek (cost blisko 20 przy niskim endurance).
   */
  residualMin: 5,
  residualMax: 20,
  residualRefSprintM: 70,
  /** Cutterzy płacą więcej resztkowego niż handlery przy tym samym sprincie. */
  residualHandlerMult: 0.78,
  residualCutterMult: 1.18,
  residualDefenseMult: 1.08,
  /** Regen ławki między punktami (bazowo zależny od endurance). */
  benchRegenMin: 6,
  benchRegenMax: 12,
  /**
   * Szacowany sprint [m] w punkcie gdy brak śladu ticków (symulator tła).
   */
  bgEstimatedOSprintM: 45,
  bgEstimatedDSprintM: 28,
  bgEstimatedHandlerSprintM: 32,
  bgEstimatedCutterSprintM: 55,
  /** @deprecated legacy — UI / stare odczyty */
  residualSpentFraction: 0.22,
  dResidualMult: 1.3,
  bgEstimatedOSpent: 9,
  bgEstimatedDSpent: 11,
  oLineCost: 2,
  dLineCost: 3,
  /** @deprecated średnia historyczna; używaj benchRegenForPlayer */
  benchRegen: 8,
  tiredThreshold: 80,
  exhaustedThreshold: 45,
  midFatigueThreshold: 50,
  lowFatigueThreshold: 30,
}

/** Ile staminy ubyło między dwoma snapshotami mapy. */
export function staminaSpentBetween(beforeMap, afterMap, playerId) {
  return Math.max(0, getStamina(beforeMap, playerId) - getStamina(afterMap, playerId))
}

export function createSprintMeterMaps() {
  return { home: {}, away: {} }
}

export function ensureSprintMeters(staminaMaps) {
  if (!staminaMaps) return null
  if (!staminaMaps.sprintM) staminaMaps.sprintM = createSprintMeterMaps()
  if (!staminaMaps.sprintM.home) staminaMaps.sprintM.home = {}
  if (!staminaMaps.sprintM.away) staminaMaps.sprintM.away = {}
  return staminaMaps.sprintM
}

export function resetSprintMeters(staminaMaps) {
  if (!staminaMaps) return
  staminaMaps.sprintM = createSprintMeterMaps()
}

export function getSprintMeters(staminaMaps, teamId, playerId) {
  const maps = staminaMaps?.sprintM
  if (!maps) return 0
  const side = teamId === 'home' ? maps.home : maps.away
  return Math.max(0, Number(side?.[playerId]) || 0)
}

function addSprintMeters(staminaMaps, teamId, playerId, meters) {
  if (!staminaMaps || !playerId || !(meters > 0)) return
  const maps = ensureSprintMeters(staminaMaps)
  const side = teamId === 'home' ? maps.home : maps.away
  side[playerId] = (side[playerId] ?? 0) + meters
}

/** Rodzina podroli do biasu residual (handler vs cutter). */
export function staminaRoleFamily(player, tactics = null) {
  const sub = storedSubRoleForPlayer(tactics, player?.id)
  if (isHandlerSubRole(sub)) return 'handler'
  if (isCutterSubRole(sub)) return 'cutter'
  const pos = String(player?.position ?? player?.primaryPosition ?? '').toLowerCase()
  if (pos.includes('handler')) return 'handler'
  if (pos.includes('cutter')) return 'cutter'
  return 'cutter'
}

/**
 * Koszt resztkowy po punkcie: 5–20 z dystansu sprintu + endurance + rodzina roli.
 * @param {number} sprintMeters
 * @param {'offense'|'defense'} lineRole
 * @param {'handler'|'cutter'|null} [family]
 */
export function residualCostFromSprintMeters(
  sprintMeters,
  lineRole,
  player,
  family = null,
  tactics = null,
) {
  const sprint = Math.max(0, Number(sprintMeters) || 0)
  const end = playerEndurance(player)
  const endT = Math.max(0, Math.min(1, end / 100))
  // Wysoki endurance → mniejsza strata (do ~−40% wkładu sprintu).
  const endFactor = 1 - 0.4 * endT
  const sprintT = Math.max(
    0,
    Math.min(1, sprint / Math.max(1, STAMINA_CONFIG.residualRefSprintM)),
  )
  const fam = family ?? staminaRoleFamily(player, tactics)
  const familyMult =
    fam === 'handler'
      ? STAMINA_CONFIG.residualHandlerMult
      : STAMINA_CONFIG.residualCutterMult
  const defMult = lineRole === 'defense' ? STAMINA_CONFIG.residualDefenseMult : 1
  const mods = player ? getTraitMods(player) : null
  const traitMult =
    lineRole === 'offense'
      ? mods?.oLineCostMult ?? 1
      : mods?.dLineCostMult ?? 1

  const raw =
    STAMINA_CONFIG.residualMin +
    (STAMINA_CONFIG.residualMax - STAMINA_CONFIG.residualMin) *
      sprintT *
      endFactor *
      familyMult *
      defMult *
      traitMult

  return Math.round(
    Math.max(
      STAMINA_CONFIG.residualMin,
      Math.min(STAMINA_CONFIG.residualMax, raw),
    ),
  )
}

/**
 * @deprecated Preferuj residualCostFromSprintMeters — zostawione dla kompatybilności.
 * Mapuje stare „spent” na przybliżony sprint.
 */
export function residualCostFromPointSpent(spent, role, player) {
  const s = Math.max(0, Number(spent) || 0)
  // Rough: 1 stamina spent ≈ 4 m sprint under old tick model
  return residualCostFromSprintMeters(s * 4, role, player)
}

/** Regen ławki: 6–12 wg endurance + lekki jitter. */
export function benchRegenForPlayer(player, rng = null) {
  const end = playerEndurance(player)
  const endT = Math.max(0, Math.min(1, end / 100))
  const base =
    STAMINA_CONFIG.benchRegenMin +
    (STAMINA_CONFIG.benchRegenMax - STAMINA_CONFIG.benchRegenMin) * endT
  const roll =
    typeof rng === 'function'
      ? rng()
      : rng && typeof rng.float === 'function'
        ? rng.float()
        : 0.5
  // ±12% losu
  const jitter = 0.88 + roll * 0.24
  const bonus = getTraitMods(player).benchRegenBonus ?? 0
  const raw = base * jitter + bonus
  return Math.round(
    Math.max(
      STAMINA_CONFIG.benchRegenMin,
      Math.min(STAMINA_CONFIG.benchRegenMax + Math.max(0, bonus), raw),
    ),
  )
}

export function clampStamina(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return STAMINA_CONFIG.default
  // Bez zaokrąglania do int co tick — inaczej koszt <0.5 znika i zużycie w punkcie = 0.
  const clamped = Math.max(0, Math.min(STAMINA_CONFIG.max, n))
  return Math.round(clamped * 100) / 100
}

/** Wartość do UI / porównań dyskretnych. */
export function roundStamina(value) {
  return Math.round(clampStamina(value))
}

export function createStaminaMap(players, initial = STAMINA_CONFIG.default) {
  const map = {}
  for (const p of players) {
    const base =
      typeof initial === 'function'
        ? initial(p)
        : initialStaminaForPlayer(p, initial)
    map[p.id] = clampStamina(base)
  }
  return map
}

/** Start meczu: zmęczenie treningowe (`developmentFatigue`) obniża staminę początkową. */
export function initialStaminaForPlayer(player, base = STAMINA_CONFIG.default) {
  const fatigue = player?.developmentFatigue ?? 0
  return clampStamina(base - fatigue * 0.38)
}

export function getStamina(staminaMap, playerId) {
  if (!staminaMap) return STAMINA_CONFIG.default
  return staminaMap[playerId] ?? STAMINA_CONFIG.default
}

/** Wytrzymałość z statów (endurance + agility z physical). */
export function playerEndurance(player) {
  const s = player?.skills ?? {}
  const endurance = getSubStat(s, 'physical', 'endurance')
  const agility = getSubStat(s, 'physical', 'agility')
  return endurance * 0.82 + agility * 0.18
}

function drainMultiplierFromEndurance(endurance) {
  // 30 vs 90: ~1.25 vs ~0.65 — różnica ma być wyczuwalna w długim punkcie.
  return 1.4 - (endurance / 100) * 0.85
}

const TICK_V2_SCALE = 0.024
const PLANT_CUT_STAMINA_COST = 0.95
const DEFENSE_STAMINA_MULT = 1.25

/**
 * Koszt staminy za jeden tick ruchu (prędkość², plant&cut, rola, endurance).
 * @param {{ currentStamina?: number }} playerState
 * @param {number} velocity prędkość w m/s
 */
export function calculateTickStaminaCost(
  playerState,
  velocity,
  isChangingDirection,
  isDefense,
  enduranceStat,
) {
  const v = Math.max(0, Number(velocity) || 0)
  let cost = v * v * TICK_V2_SCALE
  if (isChangingDirection) cost += PLANT_CUT_STAMINA_COST
  if (isDefense) cost *= DEFENSE_STAMINA_MULT
  const endurance = enduranceStat ?? 50
  cost *= drainMultiplierFromEndurance(endurance)
  return cost
}

export function isPlantAndCut(prevVx, prevVy, vx, vy) {
  const prevSpeed = Math.hypot(prevVx, prevVy)
  const speed = Math.hypot(vx, vy)
  if (speed < 0.35 || prevSpeed < 0.35) return false
  const dot = (prevVx * vx + prevVy * vy) / (prevSpeed * speed)
  return dot < 0.55
}

export function cloneStaminaMaps(stamina) {
  if (!stamina) return null
  return {
    home: { ...stamina.home },
    away: { ...stamina.away },
  }
}

function staminaMapForTeam(staminaMaps, teamId) {
  return teamId === 'home' ? staminaMaps.home : staminaMaps.away
}

const SPRINT_SPEED_MPS = STAMINA_CONFIG.sprintSpeedMps
const STAND_STILL_MPS = 0.35
/** Górny limit prędkości uznawanej za bieg — skoki pozycji (zmiana layoutu,
 *  zakotwiczenie po chwycie) nie mogą być liczone jako wysiłek. */
const MAX_HUMAN_SPEED_MPS = 11

export function tickStaminaRecovery(velocity, isDefense, enduranceStat, dtSec) {
  // Baza regeneracji niezależna od endurance (inaczej elita regenerowałaby wolniej).
  const baseRef = calculateTickStaminaCost(
    { currentStamina: 70 },
    6.2,
    false,
    isDefense,
    50,
  )
  const enduranceBoost = 0.7 + (enduranceStat / 100) * 0.7
  if (velocity >= SPRINT_SPEED_MPS) return 0
  if (velocity < STAND_STILL_MPS) return baseRef * 0.6 * enduranceBoost * (dtSec / 0.2)
  return baseRef * 0.3 * enduranceBoost * (dtSec / 0.2)
}

/**
 * Jednorazowy drain po ruchu między tickami (aktualizuje mapę i player.currentStamina).
 * Przy v ≥ sprintSpeedMps dopisuje metry sprintu do staminaMaps.sprintM (effort po punkcie).
 */
export function applyTickStaminaDrain(
  staminaMaps,
  player,
  teamId,
  possessionTeam,
  kinematics,
  x,
  y,
  dtSec,
) {
  if (!staminaMaps || !player?.id || !dtSec) return player?.currentStamina ?? STAMINA_CONFIG.default
  const prev = kinematics[player.id] ?? { x, y, vx: 0, vy: 0 }
  const vx = (x - prev.x) / dtSec
  const vy = (y - prev.y) / dtSec
  const velocity = Math.min(Math.hypot(vx, vy), MAX_HUMAN_SPEED_MPS)
  const isChangingDirection = isPlantAndCut(prev.vx, prev.vy, vx, vy)
  const isDefense = teamId !== possessionTeam
  const map = staminaMapForTeam(staminaMaps, teamId)
  const currentStamina = getStamina(map, player.id)
  const endurance = playerEndurance(player)
  // Skala kosztu jest odniesiona do 200 ms — tak samo jak regeneracja poniżej.
  const cost =
    calculateTickStaminaCost(
      { currentStamina },
      velocity,
      isChangingDirection,
      isDefense,
      endurance,
    ) *
    (dtSec / 0.2)
  const recovery = tickStaminaRecovery(velocity, isDefense, endurance, dtSec)
  const next = clampStamina(currentStamina - cost + recovery)
  map[player.id] = next
  player.currentStamina = next
  if (velocity >= SPRINT_SPEED_MPS) {
    addSprintMeters(staminaMaps, teamId, player.id, velocity * dtSec)
  }
  kinematics[player.id] = { x, y, vx, vy }
  return next
}

export function syncPlayerFromStaminaMap(staminaMaps, player, teamId) {
  if (!staminaMaps || !player?.id) return
  const map = staminaMapForTeam(staminaMaps, teamId)
  player.currentStamina = getStamina(map, player.id)
}

/**
 * Przelicza drain staminy z motionTrace (setup + lot) względem baseline map.
 */
export function applyStaminaFromMotionTrace(
  staminaMaps,
  motionTrace,
  playersById,
  possessionTeam,
  baselineMaps = null,
) {
  if (!staminaMaps || !motionTrace?.frames?.length) return staminaMaps

  if (baselineMaps) {
    for (const id of Object.keys(baselineMaps.home ?? {})) {
      staminaMaps.home[id] = baselineMaps.home[id]
    }
    for (const id of Object.keys(baselineMaps.away ?? {})) {
      staminaMaps.away[id] = baselineMaps.away[id]
    }
  }

  const kinematics = {}
  const frames = [...motionTrace.frames].sort((a, b) => a.ms - b.ms)

  for (let i = 1; i < frames.length; i += 1) {
    const prevFrame = frames[i - 1]
    const frame = frames[i]
    const dtSec = Math.max(0.01, (frame.ms - prevFrame.ms) / 1000)
    const prevById = Object.fromEntries((prevFrame.players ?? []).map((p) => [p.id, p]))
    for (const pl of frame.players ?? []) {
      const prev = prevById[pl.id]
      if (!prev) continue
      const player = playersById[pl.id]
      if (!player) continue
      applyTickStaminaDrain(
        staminaMaps,
        player,
        pl.teamId,
        possessionTeam,
        kinematics,
        pl.x,
        pl.y,
        dtSec,
      )
    }
  }

  return staminaMaps
}

/** Buduje mapę graczy punktu z obu składów. */
export function buildPointPlayersById(offenseLineup, defenseLineup, possessionTeam) {
  const byId = {}
  for (const p of offenseLineup ?? []) {
    byId[p.id] = p
  }
  for (const p of defenseLineup ?? []) {
    byId[p.id] = p
  }
  return byId
}

export function syncLineupStaminaFromMaps(staminaMaps, lineup, teamId) {
  if (!staminaMaps || !lineup) return
  for (const p of lineup) {
    syncPlayerFromStaminaMap(staminaMaps, p, teamId)
  }
}

/** Drain tickowy dla wszystkich agentów symulacji (setup / lot). */
export function drainAgentsTickStamina(staminaMaps, agents, teamId, possessionTeam, kinematics, dtSec) {
  if (!staminaMaps || !agents?.length) return
  for (const agent of agents) {
    const player = agent.player ?? agent
    if (!player?.id) continue
    applyTickStaminaDrain(
      staminaMaps,
      player,
      teamId,
      possessionTeam,
      kinematics,
      agent.x,
      agent.y,
      dtSec,
    )
    agent.currentStamina = player.currentStamina
  }
}

/**
 * Koszt staminy za aktywność w trakcie punktu (metry biegu, cuty, mark).
 * @param {{ jogMeters?: number, sprintMeters?: number, cuts?: number, stallTick?: boolean, throw?: boolean, mark?: boolean }} activity
 */
export function pointActivityStaminaCost(activity, player) {
  const mult = drainMultiplierFromEndurance(playerEndurance(player))
  let cost = 0
  if (activity.jogMeters) cost += activity.jogMeters * 0.032
  if (activity.sprintMeters) cost += activity.sprintMeters * 0.11
  if (activity.cuts) cost += activity.cuts * 1.05
  if (activity.stallTick) cost += 0.32
  if (activity.throw) cost += 0.22
  if (activity.mark) cost += 0.5
  return cost * mult
}

export function drainPlayerStamina(staminaMap, player, activity) {
  if (!staminaMap || !player?.id) return getStamina(staminaMap, player.id)
  const cost = pointActivityStaminaCost(activity, player)
  const next = clampStamina(getStamina(staminaMap, player.id) - cost)
  staminaMap[player.id] = next
  return next
}

/** Kara do wyniku rzutu/obrony (im niższa stamina, tym większa). */
export function staminaPerformancePenalty(stamina) {
  if (stamina >= STAMINA_CONFIG.tiredThreshold) return 0
  if (stamina >= STAMINA_CONFIG.exhaustedThreshold) {
    const t =
      (STAMINA_CONFIG.tiredThreshold - stamina) /
      (STAMINA_CONFIG.tiredThreshold - STAMINA_CONFIG.exhaustedThreshold)
    return t * 14
  }
  const base = 14
  const extra =
    ((STAMINA_CONFIG.exhaustedThreshold - stamina) /
      STAMINA_CONFIG.exhaustedThreshold) *
    22
  return base + extra
}

/** Dodatkowe obniżenie skuteczności rzutu przy wyczerpaniu (< 40%). */
export function staminaThrowCollapsePenalty(stamina) {
  if (stamina >= STAMINA_CONFIG.exhaustedThreshold) return 0
  return (
    ((STAMINA_CONFIG.exhaustedThreshold - stamina) /
      STAMINA_CONFIG.exhaustedThreshold) *
    16
  )
}

/**
 * Progi zmęczenia wpływające na ruch (fieldMotion) i mental (stall).
 * Stamina < 50%: wolniejszy bieg, dłuższy hip-turn.
 * Stamina < 30%: spadek composure i celności.
 */
export function motionFatigueModifiers(stamina) {
  const s = stamina ?? STAMINA_CONFIG.default
  if (s >= STAMINA_CONFIG.midFatigueThreshold) {
    return {
      runSpeedMultiplier: 1,
      hipTurnExtraMs: 0,
      composurePenalty: 0,
      throwAccuracyPenalty: 0,
    }
  }
  const runSpeedMultiplier = 0.9
  const hipTurnExtraMs = Math.round(70 + (STAMINA_CONFIG.midFatigueThreshold - s) * 1.4)
  let composurePenalty = 0
  let throwAccuracyPenalty = 0
  if (s < STAMINA_CONFIG.lowFatigueThreshold) {
    composurePenalty = (STAMINA_CONFIG.lowFatigueThreshold - s) * 0.45
    throwAccuracyPenalty = (STAMINA_CONFIG.lowFatigueThreshold - s) * 0.35
  }
  return {
    runSpeedMultiplier,
    hipTurnExtraMs,
    composurePenalty,
    throwAccuracyPenalty,
  }
}

/** Mnożnik wag w losowaniu gracza (participants). */
export function staminaParticipationFactor(stamina) {
  if (stamina >= STAMINA_CONFIG.tiredThreshold) return 1
  if (stamina >= STAMINA_CONFIG.exhaustedThreshold) {
    return 0.75 + (stamina - STAMINA_CONFIG.exhaustedThreshold) / 30 * 0.2
  }
  return 0.45 + (stamina / STAMINA_CONFIG.exhaustedThreshold) * 0.3
}

export function applyStaminaToTeamPlayers(team, staminaMap) {
  team.players = team.players.map((p) => ({
    ...p,
    currentStamina: getStamina(staminaMap, p.id),
  }))
}

/** Regeneracja zawodników poza boiskiem (między punktami). */
export function regenBenchStamina(staminaMap, teamPlayers, onFieldIds, rng = null) {
  for (const p of teamPlayers) {
    if (onFieldIds.has(p.id)) continue
    staminaMap[p.id] = clampStamina(
      getStamina(staminaMap, p.id) + benchRegenForPlayer(p, rng),
    )
  }
}
