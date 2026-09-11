import { groundContacts, playerBody } from '../../models/playerBody.js'
import { subStat } from './statFormulas.js'
import { FIELD_DIMENSIONS, attackDirectionX, opponentGoalLineM } from '../fieldDimensions.js'

export function pointInBounds(p) {
  return p.x > 0 && p.x < FIELD_DIMENSIONS.lengthM && p.y > 0 && p.y < FIELD_DIMENSIONS.widthM
}
export function groundedInBounds(agent) { return groundContacts(agent).every(pointInBounds) }
/** Conservative running target: keep both feet inside.
 * The receiver's centre and the disc contact are separate points. */
export function plannedCatchSupport(agent, point, reach) {
  if (point.x > 0.25 && point.x < FIELD_DIMENSIONS.lengthM - 0.25
    && point.y > 0.25 && point.y < FIELD_DIMENSIONS.widthM - 0.25) {
    return { x: point.x, y: point.y, legal: true, reachRemaining: reach, toeInContact: null }
  }
  const inset = playerBody(agent.player ?? agent).shoulderWidthM * 0.3 + 0.02
  const centre = { ...agent, z: 0, toeInContact: null,
    x: Math.max(inset, Math.min(FIELD_DIMENSIONS.lengthM - inset, point.x)),
    y: Math.max(inset, Math.min(FIELD_DIMENSIONS.widthM - inset, point.y)) }
  // A running target cannot promise the single-foot pose used at actual contact.
  // Toe-in remains available in contact/landing resolution, without steering a
  // grounded receiver out before the disc arrives.
  const pose = centre
  const extension = Math.hypot(pose.x - point.x, pose.y - point.y)
  return { x: pose.x, y: pose.y, legal: groundedInBounds(pose) && extension <= reach,
    reachRemaining: Math.max(0, reach - extension), toeInContact: pose.toeInContact ?? null }
}
export function catchScores(agent, possessionTeam) {
  return groundedInBounds(agent) && groundContacts(agent).every(p =>
    (p.x - opponentGoalLineM(possessionTeam)) * attackDirectionX(possessionTeam) > 0)
}
/** Airborne receiver inherits their last ground status; landing settles a catch. */
export function eligibleReceiver(agent) {
  return (agent.z ?? 0) > 0 ? agent.lastGroundInBounds !== false : groundedInBounds(agent)
}
export function advanceCatchLanding(agent, dtSec, possessionTeam = null) {
  const vz = (agent.vz ?? 0) - 9.81 * dtSec
  const height = (agent.z ?? 0) + vz * dtSec
  const fraction = height < 0 ? (agent.z ?? 0) / Math.max(1e-9, (agent.z ?? 0) - height) : 1
  const landed = { ...agent, x: agent.x + (agent.vx ?? 0) * dtSec * fraction,
    y: agent.y + (agent.vy ?? 0) * dtSec * fraction, z: Math.max(0, height), vz,
    jumping: height > 0, landingFraction: height <= 0 ? fraction : null }
  if (height <= 0 && (agent.z ?? 0) > 0 && agent.lastGroundInBounds !== false && !agent.layout) {
    return attemptToeIn(landed, possessionTeam)
  }
  return landed
}

/** First support only: one toe reaches inside while the other foot remains raised.
 * This changes the contact pose, never the centre of mass or the catch result. */
export function attemptToeIn(agent, possessionTeam = null) {
  if (agent.layout || agent.lastGroundInBounds === false || (agent.z ?? 0) > 0) return agent
  const body = playerBody(agent.player ?? agent)
  const balance = subStat(agent.player ?? agent, 'physical', 'balance') / 100
  const awareness = subStat(agent.player ?? agent, 'mental', 'spatialAwareness') / 100
  const speed = Math.hypot(agent.vx ?? 0, agent.vy ?? 0)
  const reach = body.heightM * (0.12 + 0.12 * balance) / (1 + speed * 0.12)
  const inset = 0.035 + (1 - awareness) * 0.07
  const toe = { x: Math.max(inset, Math.min(FIELD_DIMENSIONS.lengthM - inset, agent.x)),
    y: Math.max(inset, Math.min(FIELD_DIMENSIONS.widthM - inset, agent.y)) }
  let edgeDistance = Math.min(Math.abs(agent.x), Math.abs(agent.y),
    Math.abs(agent.x - FIELD_DIMENSIONS.lengthM), Math.abs(agent.y - FIELD_DIMENSIONS.widthM))
  if (possessionTeam) {
    const goal = opponentGoalLineM(possessionTeam), sign = attackDirectionX(possessionTeam)
    if (Math.abs(agent.x - goal) < 0.45 && (toe.x - goal) * sign < inset) {
      toe.x = goal + sign * inset
      edgeDistance = Math.min(edgeDistance, Math.abs(agent.x - goal))
    }
  }
  if (edgeDistance > 0.45 || Math.hypot(toe.x - agent.x, toe.y - agent.y) > reach) return agent
  return { ...agent, toeInContact: toe }
}

/** Last in-to-out crossing, not the first excursion of a returning flight. */
export function boundaryRestart(frames, releaseMs = 0, { touches = [], stopMs = Infinity } = {}) {
  let lastInside = null, crossing = null
  const events = [...frames.filter(f => f.ms <= stopMs), ...touches.filter(t => t.ms <= stopMs)
    .map(t => ({ ms: t.ms, disc: t, inBoundsTouch: t.inBounds }))].sort((a, b) => a.ms - b.ms)
  for (const frame of events) {
    if (frame.ms < releaseMs || !frame.disc) continue
    const d = frame.disc
    if (pointInBounds(d)) { lastInside = d; crossing = null; continue }
    if (frame.inBoundsTouch) { crossing = nearestBoundaryPoint(d); lastInside = null; continue }
    if (!lastInside) continue
    const dx = d.x - lastInside.x, dy = d.y - lastInside.y
    const fractions = [dx < 0 ? -lastInside.x / dx : dx > 0 ? (FIELD_DIMENSIONS.lengthM - lastInside.x) / dx : Infinity,
      dy < 0 ? -lastInside.y / dy : dy > 0 ? (FIELD_DIMENSIONS.widthM - lastInside.y) / dy : Infinity]
    const t = Math.min(...fractions.filter(f => f >= 0 && f <= 1))
    if (Number.isFinite(t)) crossing = { x: lastInside.x + dx * t, y: lastInside.y + dy * t }
    lastInside = null
  }
  const d = events.at(-1)?.disc
  const point = crossing ?? (d ? nearestBoundaryPoint(d) : null)
  // An out restarts on the perimeter of the central playing field.
  return point ? { x: Math.max(FIELD_DIMENSIONS.endzoneM, Math.min(FIELD_DIMENSIONS.lengthM - FIELD_DIMENSIONS.endzoneM, point.x)),
    y: point.y } : null
}

function nearestBoundaryPoint(p) {
  const x = Math.max(0, Math.min(FIELD_DIMENSIONS.lengthM, p.x))
  const y = Math.max(0, Math.min(FIELD_DIMENSIONS.widthM, p.y))
  if (!pointInBounds({ x, y })) return { x, y }
  return [{ x: 0, y }, { x: FIELD_DIMENSIONS.lengthM, y }, { x, y: 0 }, { x, y: FIELD_DIMENSIONS.widthM }]
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
}
