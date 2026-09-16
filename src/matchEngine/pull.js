import { getSubStat } from '../models/playerStats.js'
import { FIELD_DIMENSIONS as F, attackDirectionX, clampFieldX, clampFieldY } from './fieldDimensions.js'
import { layoutPlayersOnField, discPositionFromFieldMeters } from './fieldViz.js'
import { normalizeWind } from './wind.js'
import { maxSpeedMps } from './ai/statFormulas.js'
import { integrateAgentMotion } from './ai/playerMovement.js'
import { resolvePlayerSubRole } from './playerSubRoles.js'
import { offenseLineSlotsForAttackStyle } from './offenseLineSlots.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const inside = p => p.x >= 0 && p.x <= F.lengthM && p.y >= 0 && p.y <= F.widthM
const pulling = p => getSubStat(p?.skills, 'throwing', 'pulling')
export const selectPuller = lineup => [...lineup].sort((a, b) => pulling(b) - pulling(a))[0]

/** Exact first crossing of the boundary, including a roller crossing two edges in one tick. */
export function pullBoundaryExit(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y
  const times = []
  if (to.x < 0) times.push((0 - from.x) / dx)
  if (to.x > F.lengthM) times.push((F.lengthM - from.x) / dx)
  if (to.y < 0) times.push((0 - from.y) / dy)
  if (to.y > F.widthM) times.push((F.widthM - from.y) / dy)
  const t = Math.min(1, ...times.filter(t => t >= 0 && t <= 1))
  return { x: from.x + dx * t, y: from.y + dy * t }
}

/** Choose the intended pull first, then execute it within the puller's range and control. */
export function planPull({ puller, possessionTeam, rng, wind, pullType = 'auto' }) {
  const sign = attackDirectionX(possessionTeam)
  const start = { x: sign > 0 ? F.lengthM - F.endzoneM : F.endzoneM, y: F.widthM / 2 }
  const skill = clamp(pulling(puller) / 100, 0, 1)
  const w = normalizeWind(wind)
  const wx = Math.cos(w.directionDeg * Math.PI / 180) * w.speedMps
  const wy = Math.sin(w.directionDeg * Math.PI / 180) * w.speedMps
  const tail = -sign * wx
  const typeRoll = rng.float()
  const type = ['roller', 'hanging'].includes(pullType) ? pullType
    : typeRoll < (w.speedMps > 5 ? .32 : .07) ? 'roller' : 'hanging'
  const roller = type === 'roller'
  const side = wy ? Math.sign(wy) : (rng.float() < .5 ? -1 : 1)
  const maxDistanceM = clamp(38 + skill * 42 + tail * 1.3, 22, 86)
  const intendedDistanceM = Math.min(roller ? 61 : 72, maxDistanceM)
  const distanceErrorM = (rng.float() - .5) * (3 + (1 - skill) * 22)
  const distanceM = clamp(intendedDistanceM + distanceErrorM, 18, maxDistanceM)
  const intendedHangMs = (roller ? 2300 : 5800) + tail * 60
  const hangMs = Math.round(clamp(intendedHangMs + (rng.float() - .5) * (200 + (1 - skill) * 2000), 1600, 7000))
  const aim = { x: start.x - sign * intendedDistanceM, y: roller ? F.widthM / 2 + side * 9 : F.widthM / 2 }
  const lateralErrorM = (rng.float() - .5) * (3 + (1 - skill) * 30) + wy * (1 - skill) * 1.6
  const landing = { x: start.x - sign * distanceM, y: aim.y + lateralErrorM }
  const rollSpeed = roller ? 6 + skill * 4 : 0
  return { type, roller, start, aim, landing, maxDistanceM, intendedDistanceM, distanceM,
    intendedHangMs, hangMs, distanceErrorM, lateralErrorM, peakHeightM: roller ? 3 : 12,
    rollVelocity: { x: -sign * rollSpeed * .75, y: side * rollSpeed * .66 + wy * .1 } }
}

/** Pulls are not pass attempts; landing on the ground keeps receiving possession. */
export function simulatePull({ offenseLineup, defenseLineup, possessionTeam, offenseTactics,
  defenseTactics, attackStyle, defenseStyle, rng, wind, collectFrames = true, pullType = defenseTactics?.pullType ?? 'auto' }) {
  const sign = attackDirectionX(possessionTeam)
  const ownLine = sign > 0 ? F.endzoneM : F.lengthM - F.endzoneM
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  const subRole = p => resolvePlayerSubRole(offenseTactics, p.id, slots[offenseLineup.indexOf(p)])
  const puller = selectPuller(defenseLineup)
  const receiver = [...offenseLineup].sort((a, b) => {
    const score = p => (subRole(p) === 'primary_handler' ? 100 : 0) + getSubStat(p.skills, 'offensive', 'discReading')
    return score(b) - score(a)
  })[0]
  const plan = planPull({ puller, possessionTeam, rng, wind, pullType })
  const { start, landing, roller, hangMs } = plan
  const legalPivot = p => ({ x: sign * (p.x - ownLine) < 0 ? ownLine : p.x, y: p.y })
  const targetsFor = (anchor, flowing) => {
    const offense = layoutPlayersOnField(offenseLineup, possessionTeam, anchor.x, true,
      { attackStyle, throwerId: receiver.id, attackSign: sign, discYMeters: anchor.y })
    if (flowing) for (const p of offense) {
      if (p.id === receiver.id) continue
      const player = offenseLineup.find(a => a.id === p.id)
      if (subRole(player)?.endsWith('_handler')) {
        const side = offenseLineup.indexOf(player) % 2 ? -1 : 1
        p.x = clampFieldX(anchor.x + sign * 7)
        p.y = clampFieldY(anchor.y * .4 + F.widthM / 2 * .6 + side * 6)
      } else p.x = clampFieldX(p.x + sign * 10)
    }
    const defense = layoutPlayersOnField(defenseLineup, possessionTeam === 'home' ? 'away' : 'home', anchor.x, false,
      { defenseStyle, offenseLayout: offense, attackSign: sign, personMark: !String(defenseStyle).includes('zone'), defenseTactics })
    return [...offense, ...defense]
  }
  let targets = new Map(targetsFor(legalPivot({ x: clampFieldX(landing.x), y: clampFieldY(landing.y) }), true).map(p => [p.id, p]))
  const agents = [...targets.values()].map((p, i) => {
    const offense = i < offenseLineup.length
    return { ...p, player: (offense ? offenseLineup : defenseLineup).find(a => a.id === p.id),
      role: offense ? 'offense' : 'defense', x: offense ? ownLine : start.x,
      y: p.id === puller.id ? start.y : (i % 7 + 1) * F.widthM / 8, vx: 0, vy: 0 }
  })
  let disc = { ...start, z: 1.1, state: 'HELD' }
  const frames = []
  const snapshot = ms => {
    if (collectFrames) frames.push({ ms, disc: { ...disc }, stallCount: 0,
      players: agents.map(a => ({ id: a.id, teamId: a.teamId, x: a.x, y: a.y, z: 0, vx: a.vx, vy: a.vy,
        role: a.fieldRole, cutterState: 'WAITING' })) })
  }
  const releaseMs = 1000
  let outcome = null, restart = null, exitPoint = null, catchMs = null, landingMs = null, elapsed = 0
  let rollVelocity = { ...plan.rollVelocity }
  const setRestart = (kind, point) => {
    outcome = kind
    restart = kind === 'roll_out' ? { ...point } : legalPivot(point)
    // Only a brick pauses for a fully established formation. Ground pickup proceeds as soon as reached.
    targets = new Map(targetsFor(restart, kind === 'caught').map(p => [p.id, p]))
  }
  snapshot(0)
  for (elapsed = 100; elapsed <= 30000; elapsed += 100) {
    if (elapsed <= releaseMs) { snapshot(elapsed); continue }
    const t = clamp((elapsed - releaseMs) / hangMs, 0, 1)
    if (!outcome) {
      disc = { x: start.x + (landing.x - start.x) * t, y: start.y + (landing.y - start.y) * t,
        z: Math.max(0, 1.1 * (1 - t) + plan.peakHeightM * 4 * t * (1 - t)), state: 'IN_FLIGHT' }
    } else if (outcome === 'rolling') {
      const before = { ...disc }
      disc.x += rollVelocity.x * .1
      disc.y += rollVelocity.y * .1
      const speed = Math.hypot(rollVelocity.x, rollVelocity.y)
      const scale = Math.max(0, speed - .3) / Math.max(.001, speed)
      rollVelocity = { x: rollVelocity.x * scale, y: rollVelocity.y * scale }
      if (!inside(disc)) {
        exitPoint = pullBoundaryExit(before, disc)
        disc = { ...exitPoint, z: 0, state: 'ON_GROUND' }
        setRestart('roll_out', exitPoint)
      } else if (speed <= .3) setRestart('ground', { x: disc.x, y: disc.y })
    }
    for (const a of agents) {
      let target = targets.get(a.id)
      if (a.id === receiver.id) target = restart ?? { x: clampFieldX(disc.state === 'ON_GROUND' ? disc.x : landing.x),
        y: clampFieldY(disc.state === 'ON_GROUND' ? disc.y : landing.y) }
      const distance = Math.hypot(target.x - a.x, target.y - a.y)
      Object.assign(a, integrateAgentMotion(a, target.x, target.y, Math.min(maxSpeedMps(a.player), distance * 3), .1, true, a.role))
    }
    const r = agents.find(a => a.id === receiver.id)
    if (!outcome && t > .8 && t < 1 && inside(disc) && disc.z <= 2 && Math.hypot(r.x - disc.x, r.y - disc.y) < 1.6) {
      catchMs = elapsed
      setRestart('caught', { x: r.x, y: r.y })
    }
    if (!outcome && t >= 1) {
      landingMs = elapsed
      disc.z = 0
      disc.state = 'ON_GROUND'
      if (!inside(landing)) setRestart('brick', { x: ownLine + sign * 18, y: F.widthM / 2 })
      else if (roller) {
        outcome = 'rolling'
        targets = new Map(targetsFor(legalPivot(landing), false).map(p => [p.id, p]))
      } else setRestart('ground', landing)
    }
    if (restart) {
      if (outcome === 'caught') disc = { x: r.x, y: r.y, z: 1.1, state: 'HELD' }
      if (outcome === 'brick') disc = { ...restart, z: 0, state: 'ON_GROUND' }
      const receiverReady = Math.hypot(r.x - restart.x, r.y - restart.y) < .55
      const setupReady = outcome !== 'brick' || agents.every(a => {
        const target = a.id === receiver.id ? restart : targets.get(a.id)
        return Math.hypot(a.x - target.x, a.y - target.y) < 1.5
      })
      if (receiverReady && setupReady) {
        r.x = restart.x; r.y = restart.y
        disc = { ...restart, z: 1.1, state: 'HELD' }
        snapshot(elapsed)
        break
      }
    }
    snapshot(elapsed)
  }
  if (!restart || elapsed > 30000) throw new Error('Pull did not reach a playable restart')
  const endStates = new Map(agents.map(a => [a.id, { id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
    role: a.role, state: 'WAITING', stateMs: 0, targetX: targets.get(a.id).x, targetY: targets.get(a.id).y }]))
  return { pullerId: puller.id, receiverId: receiver.id, receiver, outcome, roller, hangMs, landing, restart,
    exitPoint, catchMs, landingMs, plan, staticRestart: outcome !== 'caught',
    discPosition: discPositionFromFieldMeters(restart.x, possessionTeam), discYMeters: restart.y, endStates,
    motionTrace: { frames, tickMs: 100, throwMs: releaseMs, totalMs: elapsed,
      flightMs: elapsed - releaseMs, preservePositions: true }, distanceM: plan.distanceM }
}
