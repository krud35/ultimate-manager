import { buildThrowPathPoints } from '../fieldViz.js'
import { DISC_STATE, discPositionHeld, discPositionInFlight } from '../discState.js'
import { integrateAgentMotion, waitingHoldSpeedMps } from './playerMovement.js'
import { computeDynamicOffenseTarget, spacingAdjustedTarget } from './offenseReorganization.js'
import {
  aerialContestChance,
  discPeakHeightM,
  maxSpeedMps,
  subStat,
} from './statFormulas.js'
import { windFlightOffset } from '../wind.js'

export const FLIGHT_TICK_MS = 20
const DT_SEC = FLIGHT_TICK_MS / 1000
/** Zasięg gracza na dysk (z layoutem) — używane też jako granica fizycznej łapliwości rzutu. */
export const LAYOUT_DIST_M = 2.5
const LAYOUT_TIME_MS = 220

export function pathLength(pts) {
  if (!pts?.length) return 1
  let len = 0
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return Math.max(len, 1)
}

export function samplePathAt(pts, u) {
  if (!pts?.length) return { x: 0, y: 0 }
  if (pts.length === 1) return { ...pts[0] }
  const total = pathLength(pts)
  let need = u * total
  for (let i = 1; i < pts.length; i += 1) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (need <= seg || i === pts.length - 1) {
      const t = seg > 0 ? need / seg : 0
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * Math.min(1, Math.max(0, t)),
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * Math.min(1, Math.max(0, t)),
      }
    }
    need -= seg
  }
  return { ...pts[pts.length - 1] }
}

function discHeightAt(u, trajectory, jumpStat = 50) {
  const peak = discPeakHeightM(trajectory, jumpStat)
  return peak * Math.sin(Math.PI * Math.min(1, Math.max(0, u)))
}

export function sprintSpeedMps(player, role) {
  const base = maxSpeedMps(player)
  const bonus =
    role === 'defense'
      ? subStat(player, 'defensive', 'blocking') * 0.004
      : subStat(player, 'offensive', 'catching') * 0.003
  return base * 0.96 + bonus
}

function maybeLayout(agent, discX, discY, timeToDiscMs, player, rng, discZ = 2) {
  if (agent.layout) return agent
  const dist = Math.hypot(discX - agent.x, discY - agent.y)
  if (dist >= LAYOUT_DIST_M || timeToDiscMs > LAYOUT_TIME_MS) return agent
  const isReceiver = agent.id === player?.id
  const chance = aerialContestChance(player, discZ, isReceiver)
  if (rng && rng.float() > chance + 0.12) return agent
  return { ...agent, layout: true, layoutMs: timeToDiscMs }
}

// Granice prędkości dysku wg trajektorii — miękki łuk (deep) vs płaski, twardy rzut (standard).
// Trzymane blisko wcześniej wykalibrowanych stałych (6.5/7.8/7.2), żeby "mocny rzut" nie
// był tak szybki, że odbiera zapas czasu, który wcześniej pomagał domykać dystans.
const SPEED_RANGE_BY_TRAJECTORY = {
  deep: { min: 4.4, max: 7.8 },
  overhead: { min: 6.2, max: 9.5 },
}
const SPEED_RANGE_DEFAULT = { min: 6.2, max: 9.2 }

export function createFlightContext({
  fromX,
  fromY,
  toX,
  toY,
  throwType,
  trajectory,
  throwPathPoints,
  receiverId,
  defenderId,
  throwerId,
  receiver,
  receiverAgent,
  resolution,
  throwMs,
  weather,
}) {
  const throwPath =
    throwPathPoints ??
    buildThrowPathPoints(fromX, fromY, toX, toY, trajectory, throwType)
  const pathLen = pathLength(throwPath)
  const finalPt = throwPath[throwPath.length - 1] ?? { x: toX, y: toY }

  // Receiver w locie biegnie WPROST do finalnego miejsca lądowania dysku (flight.toX/toY),
  // nie goni bieżącej pozycji dysku na ścieżce — pościg za ruchomym punktem matematycznie
  // nigdy nie domyka dystansu. Prosta linia do znanego z góry celu naprawdę się domyka.
  //
  // Moc rzutu (prędkość dysku) zależy od tego, ile czasu potrzebuje TEN odbiorca: gdy ma
  // daleko do celu (duży lead, np. huck) — rzut leci wolniej/miękcej, dając czas na dobieg;
  // gdy odbiorca jest już blisko celu — rzut leci szybko/płasko, bo i tak zdąży. Realny
  // odpowiednik decyzji "mocniej czy słabiej rzucić" w zależności od pozycji odbiorcy.
  const speedRange = SPEED_RANGE_BY_TRAJECTORY[trajectory] ?? SPEED_RANGE_DEFAULT
  let flightSpeedMps = speedRange.max
  if (
    receiverAgent != null &&
    Number.isFinite(receiverAgent.x) &&
    Number.isFinite(receiverAgent.y)
  ) {
    const distToTarget = Math.hypot(finalPt.x - receiverAgent.x, finalPt.y - receiverAgent.y)
    const receiverSpeedMps = Math.max(3.5, maxSpeedMps(receiver))
    const neededSec = Math.max(0.3, (distToTarget / receiverSpeedMps) * 1.15)
    const idealSpeedMps = pathLen / neededSec
    if (Number.isFinite(idealSpeedMps)) {
      flightSpeedMps = Math.min(speedRange.max, Math.max(speedRange.min, idealSpeedMps))
    }
  }
  // Bezpieczny sufit — actionSimulator.js rezerwuje na fazę lotu stały budżet ticków
  // (MAX_FLIGHT_MS, musi być >= tego sufitu + margines); dłuższy totalFlightMs nie
  // wydłuża budżetu, tylko ucina animację przed realnym końcem lotu (a przy wielu
  // długich rzutach w punkcie potrafi bardzo spowolnić całą symulację).
  const totalFlightMs = Math.min(
    9500,
    Math.max(FLIGHT_TICK_MS * 4, Math.round((pathLen / flightSpeedMps) * 1000)),
  )
  return {
    throwPathPoints: throwPath,
    totalFlightMs,
    elapsedMs: 0,
    throwMs,
    fromX,
    fromY,
    toX: finalPt.x,
    toY: finalPt.y,
    receiverId,
    defenderId,
    throwerId,
    receiver,
    trajectory,
    resolution: resolution ?? null,
    weather,
    windTickBase: Math.round(throwMs / FLIGHT_TICK_MS),
    recvJump: subStat(receiver, 'physical', 'jump'),
  }
}

/**
 * Dysk zwalnia w locie (opór powietrza) — szybki tuż po wypuszczeniu, wolniejszy
 * przy końcu (unosi się/opada do złapania), zamiast stałej prędkości przez cały lot.
 * u(t) = 1-(1-t/T)^DISC_DECEL_POWER: pochodna (prędkość) maleje monotonicznie z
 * DISC_DECEL_POWER/T na starcie do 0 przy starcie dysku — łagodny ease-out.
 * Całkowity czas lotu (i średnia prędkość) niezmienione — sam kształt krzywej.
 */
const DISC_DECEL_POWER = 1.8

export function sampleFlightDisc(flight, flightElapsedMs) {
  const ms = Math.min(flight.totalFlightMs, Math.max(0, flightElapsedMs))
  const tFrac = flight.totalFlightMs > 0 ? ms / flight.totalFlightMs : 1
  const u = 1 - (1 - tFrac) ** DISC_DECEL_POWER
  const wind = windFlightOffset(flight.weather, u)
  const base = samplePathAt(flight.throwPathPoints, u)
  const discX = base.x + wind.dx
  const discY = base.y + wind.dy
  const discZ = discHeightAt(u, flight.trajectory, flight.recvJump)
  return { x: discX, y: discY, z: discZ, u, ms, timeToDisc: Math.max(0, flight.totalFlightMs - ms) }
}

export function tickFlightContestAgent(agent, intercept, player, role, discSample, rng) {
  const speed = sprintSpeedMps(player, role)
  let next = { ...agent, ...integrateAgentMotion(agent, intercept.x, intercept.y, speed, DT_SEC, true) }
  next = maybeLayout(next, discSample.x, discSample.y, discSample.timeToDisc, player, rng, discSample.z)
  return next
}

export function tickOffenseAgentDuringFlight(agent, ctx) {
  const {
    discSample,
    throwerId,
    throwerPos,
    forceSide,
    possessionTeam,
    flight,
    rng,
    dtSec,
  } = ctx
  if (agent.isThrower || agent.id === throwerId) {
    return {
      ...agent,
      ...integrateAgentMotion(agent, flight.fromX, flight.fromY, 2.5, dtSec, true),
    }
  }
  if (agent.id === flight.receiverId) {
    return agent
  }
  const pref = computeDynamicOffenseTarget({
    x: agent.x,
    y: agent.y,
    disc: { x: discSample.x, y: discSample.y },
    throwerId,
    playerId: agent.id,
    throwerPos,
    forceSide,
    possessionTeam,
    inThrowLane: false,
    rng,
    stackIndex: agent.stackIndex,
    isDump: agent.isDump,
  })
  const spaced = spacingAdjustedTarget(agent, pref.x, pref.y, ctx.teammates)
  const speed = waitingHoldSpeedMps(
    agent.player ?? agent,
    Math.hypot(spaced.x - agent.x, spaced.y - agent.y),
  )
  return { ...agent, ...integrateAgentMotion(agent, spaced.x, spaced.y, speed, dtSec, true) }
}

export function discSnapshotForFlight(flight, flightElapsedMs, attackSign, throwerAgent) {
  if (flightElapsedMs <= 0 && throwerAgent) {
    return discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
  }
  const sample = sampleFlightDisc(flight, flightElapsedMs)
  return discPositionInFlight(sample.x, sample.y, sample.z ?? 0)
}

export function flightComplete(flight) {
  return flight.elapsedMs >= flight.totalFlightMs
}

export function applyFlightResolutionToAgents(flight, offenseAgents, defenseAgents, discSample) {
  const res = flight.resolution
  if (!res || res.success !== false) return { offenseAgents, defenseAgents }
  let off = offenseAgents
  let def = defenseAgents
  if (res.isBlock && discSample.u > 0.82) {
    def = def.map((a) =>
      a.player?.id === flight.defenderId || a.id === flight.defenderId
        ? { ...a, x: discSample.x, y: discSample.y, layout: true }
        : a,
    )
  }
  if (!res.success && discSample.u > 0.9) {
    off = off.map((a) =>
      a.id === flight.receiverId ? { ...a, x: a.x - 0.8, y: a.y + 0.5 } : a,
    )
  }
  return { offenseAgents: off, defenseAgents: def }
}

export function finalDiscAfterFlight(flight, discSample, offenseAgents, attackSign) {
  const res = flight.resolution
  if (res?.success !== false) {
    const recv = offenseAgents.find((a) => a.id === flight.receiverId)
    if (recv) return discPositionHeld(recv.x, recv.y, attackSign)
  }
  if (res && !res.success) {
    return { state: DISC_STATE.ON_GROUND, x: discSample.x, y: discSample.y, z: 0 }
  }
  return discPositionInFlight(discSample.x, discSample.y, discSample.z ?? 0)
}
