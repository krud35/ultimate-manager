/**
 * Integracja ruchu zawodnika — prędkość z bezwładnością (fixed timestep).
 */
import { maxSpeedMps, subStat } from './statFormulas.js'

export const REORG_SPEED_MIN_MPS = 2.2
export const REORG_SPEED_MAX_MPS = 3.2
/**
 * HOLD / WAITING: daleki powrót na slot — bieg, nigdy sprint (poniżej progu staminy 4.5).
 */
export const WAIT_HOLD_RUN_MIN_MPS = 3.3
export const WAIT_HOLD_RUN_MAX_MPS = 4.15
/** Przyspieszenie liniowe — dojście do ~7 m/s w ~1.7 s, nie w mgnieniu oka. */
export const MAX_ACCEL_MPS2 = 4.2

/**
 * Limit skrętu [rad/s]. Przy pełnym sprincie ciasny łuk; przy plantcie (niska v) ostrzejszy.
 * Dawniej π/4 na tick 20 ms ≈ 2250°/s — wyglądało nadludzkо.
 */
export const MAX_TURN_RAD_PER_SEC = 5.2
export const PLANT_TURN_BONUS_RAD_PER_SEC = 7.5

/** @deprecated użyj maxTurnRadForSpeed — zostawione dla kompatybilności. */
export const MAX_TURN_RAD_PER_TICK = MAX_TURN_RAD_PER_SEC * 0.02

/**
 * Zdolność zmiany kierunku (przyspieszenie, tempo skrętu, próg plantu) zależna od
 * zawodnika.
 *
 * Do tej pory MAX_ACCEL_MPS2 i MAX_TURN_RAD_PER_SEC były globalnymi stałymi — jedyną
 * różnicą fizyczną między zawodnikami była prędkość maksymalna. Skutek: każdy cut
 * generował identyczny burst separacji niezależnie od tego, kto biegnie i kto kryje, a
 * obrońca z 95 odzyskiwał pozycję dokładnie tak samo jak z 70. To był sufit, o który
 * odbijały się wszystkie mechanizmy czytające separację (wybór opcji, kontest
 * geometryczny, start cutu): pod spodem fizyka ruchu była bezosobowa.
 * `agility` — statystyka wprost od zmiany kierunku — nie dotykała obrońcy ani razu
 * (używana była tylko w plantStopMs cuttera, abstrakcyjnym rollLaneBlock i zmęczeniu).
 *
 * UWAGA: to celowo NIE jest ta sama sprawa co cushion krycia. Utrzymywany dystans to
 * decyzja TAKTYCZNA (force, shade deep/under, tight/loose mark) i ma zostać sterowany
 * instrukcjami. Tutaj skalowana jest wyłącznie FIZYCZNA zdolność do zmiany kierunku,
 * symetrycznie dla ataku i obrony.
 */
const MOBILITY_PIVOT = 82.5
const MOBILITY_PER_POINT = 0.012
const MOBILITY_MIN = 0.8
const MOBILITY_MAX = 1.2

const mobilityCache = new WeakMap()

export function mobilityMultiplier(player, role = null) {
  if (!player || typeof player !== 'object') return 1
  const key = role ?? 'neutral'
  let byRole = mobilityCache.get(player)
  if (byRole && byRole[key] != null) return byRole[key]

  const agility = subStat(player, 'physical', 'agility')
  let skill = agility
  if (role === 'defense') {
    // Praca nóg / czytanie cutu — obrońca utrzymuje kontakt przy zmianie kierunku.
    skill = agility * 0.6 + subStat(player, 'defensive', 'defensiveCutterMovement') * 0.4
  } else if (role === 'offense') {
    skill = agility * 0.6 + subStat(player, 'offensive', 'cutterMovement') * 0.4
  }
  const mult = Math.max(
    MOBILITY_MIN,
    Math.min(MOBILITY_MAX, 1 + (skill - MOBILITY_PIVOT) * MOBILITY_PER_POINT),
  )
  if (!byRole) {
    byRole = {}
    mobilityCache.set(player, byRole)
  }
  byRole[key] = mult
  return mult
}

export function reorganizeSpeedMps(player) {
  const stamina = player?.currentStamina ?? player?.player?.currentStamina ?? 100
  const t = Math.max(0, Math.min(1, stamina / 100))
  return REORG_SPEED_MIN_MPS + t * (REORG_SPEED_MAX_MPS - REORG_SPEED_MIN_MPS)
}

/**
 * Trzymanie struktury w WAITING: trucht z bliska, z daleka lekki bieg (nie max sprint).
 * Celowo < 4.5 m/s, żeby stamina nie liczyła tego jako sprint bez regeneracji.
 */
export function waitingHoldSpeedMps(player, distanceM) {
  const jog = reorganizeSpeedMps(player)
  if (distanceM <= 8) return jog
  const stamina = player?.currentStamina ?? player?.player?.currentStamina ?? 100
  const t = Math.max(0, Math.min(1, stamina / 100))
  const run = WAIT_HOLD_RUN_MIN_MPS + t * (WAIT_HOLD_RUN_MAX_MPS - WAIT_HOLD_RUN_MIN_MPS)
  return Math.max(jog, run)
}

/**
 * Clear / agresywny powrót na pozycję: z bliska trucht, z daleka twardszy bieg
 * (nadal poniżej pełnego sprintu cutu).
 */
export function repositionSpeedMps(player, distanceM) {
  const jog = reorganizeSpeedMps(player)
  if (distanceM <= 8) return jog
  const stamina = player?.currentStamina ?? player?.player?.currentStamina ?? 100
  // Dawniej ×0.78 maxSpeed (~5+ m/s) — wyglądało i paliło jak sprint w HOLD.
  const run = maxSpeedMps(player) * (stamina < 25 ? 0.48 : 0.58)
  return Math.max(jog, Math.min(run, 5.2))
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function normalizeVec(x, y) {
  const d = Math.hypot(x, y) || 1
  return { x: x / d, y: y / d }
}

export function maxTurnRadForSpeed(speedMps, dtSec) {
  const plant = Math.max(0, 1 - (speedMps ?? 0) / 3.8)
  return (MAX_TURN_RAD_PER_SEC + plant * PLANT_TURN_BONUS_RAD_PER_SEC) * dtSec
}

function rotateToward(fromX, fromY, toX, toY, maxRad) {
  const f = normalizeVec(fromX, fromY)
  const t = normalizeVec(toX, toY)
  const dot = Math.max(-1, Math.min(1, f.x * t.x + f.y * t.y))
  const angle = Math.acos(dot)
  if (angle <= maxRad) return t
  const cross = f.x * t.y - f.y * t.x
  const sign = cross >= 0 ? 1 : -1
  const cos = Math.cos(maxRad)
  const sin = Math.sin(maxRad) * sign
  return normalizeVec(f.x * cos - f.y * sin, f.x * sin + f.y * cos)
}

/**
 * Krok ruchu: docelowa prędkość → ograniczone przyspieszenie → pozycja.
 */
export function integrateAgentMotion(agent, targetX, targetY, maxSpeed, dtSec, limitTurn, role = null) {
  const mobility = mobilityMultiplier(agent?.player ?? agent, role)
  const dx = targetX - agent.x
  const dy = targetY - agent.y
  const dist = Math.hypot(dx, dy) || 1
  const dirX = dx / dist
  const dirY = dy / dist

  let targetVx = dirX * maxSpeed
  let targetVy = dirY * maxSpeed

  if (dist < maxSpeed * dtSec * 0.5) {
    const approach = dist / Math.max(dtSec, 1e-6)
    targetVx = dirX * Math.min(maxSpeed, approach)
    targetVy = dirY * Math.min(maxSpeed, approach)
  }

  let cvx = agent.vx ?? 0
  let cvy = agent.vy ?? 0
  const curSpd = Math.hypot(cvx, cvy)
  // Zachowaj zamierzoną prędkość (np. dociążenie przy bliskim celu).
  let desiredSpd = Math.hypot(targetVx, targetVy)

  if (limitTurn && curSpd > 0.05) {
    const curDir = normalizeVec(cvx, cvy)
    const wantDir = normalizeVec(targetVx, targetVy)
    const dot = Math.max(-1, Math.min(1, curDir.x * wantDir.x + curDir.y * wantDir.y))
    const angleErr = Math.acos(dot)

    // Ostry odwrót (>~75°): najpierw plant/hamowanie — inaczej 6 m/s + słaby turn
    // robi 15 m łuku w przeciwną stronę (obrońca „ucieka” od marka).
    // Zwinniejszy zawodnik wytrzymuje ostrzejszy kąt bez pełnego plantu — to jest ta
    // część, dzięki której cutter urywa się obrońcy (albo obrońca zostaje przy nim).
    if (angleErr > 1.3 * mobility) {
      desiredSpd = 0
      targetVx = 0
      targetVy = 0
    } else {
      // W łuku zwolnij proporcjonalnie do kąta (ciasniejszy radius).
      const turnSlow = 1 - (angleErr / Math.PI) * 0.65
      desiredSpd *= Math.max(0.25, turnSlow)
      const limited = rotateToward(
        cvx,
        cvy,
        wantDir.x * desiredSpd,
        wantDir.y * desiredSpd,
        maxTurnRadForSpeed(curSpd * (angleErr > 0.7 ? 0.55 : 1), dtSec) * mobility,
      )
      targetVx = limited.x * desiredSpd
      targetVy = limited.y * desiredSpd
    }
  }

  // Przy plantcie (target≈0) mocniejsze hamowanie; bez limitu skrętu — szybsze dojście do wektora.
  const braking = desiredSpd < 0.15 && curSpd > 0.4
  const accelMult = braking ? 3.6 : limitTurn ? 1 : 2.15
  const maxDelta = MAX_ACCEL_MPS2 * accelMult * mobility * dtSec
  cvx += clamp(targetVx - cvx, -maxDelta, maxDelta)
  cvy += clamp(targetVy - cvy, -maxDelta, maxDelta)

  // Po ostrym planicie — nie ślizgaj się: obetnij prawie-zerową prędkość.
  if (braking && Math.hypot(cvx, cvy) < 0.55) {
    cvx = 0
    cvy = 0
  }

  const spd = Math.hypot(cvx, cvy)
  if (spd > maxSpeed && spd > 1e-6) {
    const scale = maxSpeed / spd
    cvx *= scale
    cvy *= scale
  }

  return {
    x: agent.x + cvx * dtSec,
    y: agent.y + cvy * dtSec,
    vx: cvx,
    vy: cvy,
  }
}
