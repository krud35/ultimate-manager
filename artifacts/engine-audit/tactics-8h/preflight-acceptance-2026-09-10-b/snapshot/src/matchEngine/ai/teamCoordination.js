import { subStat } from './statFormulas.js'
import { playerBody } from '../../models/playerBody.js'

/** Value of the next available pass from the proposed receiving position. */
export function continuationValue(point, receiverId, teammates, defenders, attackSign) {
  let best = 0
  for (const other of teammates) {
    if ((other.id ?? other.player?.id) === receiverId) continue
    const x = other.x + (other.vx ?? 0) * 0.6, y = other.y + (other.vy ?? 0) * 0.6
    const distance = Math.hypot(x - point.x, y - point.y)
    if (distance < 3 || distance > 20) continue
    const gap = Math.min(8, ...defenders.map(d => Math.hypot(x - d.x - (d.vx ?? 0) * 0.6, y - d.y - (d.vy ?? 0) * 0.6)))
    best = Math.max(best, Math.min(8, gap) * 0.7 + Math.max(-2, Math.min(5, (x - point.x) * attackSign * 0.3)))
  }
  return best
}

/** Predictive yielding changes the movement target, never teleports bodies. */
export function crowdAwareTarget(agent, target, neighbors = []) {
  const mass = playerBody(agent.player ?? agent).massKg
  let x = target.x, y = target.y
  for (const other of neighbors) {
    if ((other.id ?? other.player?.id) === agent.id) continue
    const dx = agent.x + (agent.vx ?? 0) * 0.3 - other.x - (other.vx ?? 0) * 0.3
    const dy = agent.y + (agent.vy ?? 0) * 0.3 - other.y - (other.vy ?? 0) * 0.3
    const gap = Math.hypot(dx, dy)
    if (gap > 0.01 && gap < 1.1) {
      const yieldM = (1.1 - gap) * 1.5 * Math.min(1.3, 75 / mass)
      x += dx / gap * yieldM; y += dy / gap * yieldM
    }
  }
  return { x, y }
}

/** Both defenders must agree; retain bijective assignments and protect the marker. */
export function coordinateSwitches(defenders, attackers, matchups, nowMs) {
  if (!(matchups instanceof Map)) return 0
  const byId = new Map(attackers.map(a => [a.id, a]))
  const assignments = new Map([...matchups].map(([a, d]) => [d.id, a]))
  let switches = 0
  const used = new Set()
  for (let i = 0; i < defenders.length; i++) for (let j = i + 1; j < defenders.length; j++) {
    const a = defenders[i], b = defenders[j]
    if (used.has(a.id) || used.has(b.id) || nowMs < (a.switchUntilMs ?? 0) || nowMs < (b.switchUntilMs ?? 0)) continue
    const x = byId.get(assignments.get(a.id)), y = byId.get(assignments.get(b.id))
    if (!x || !y || x.isThrower || y.isThrower || Math.hypot(a.x - b.x, a.y - b.y) > 4) continue
    const cost = (d, o) => Math.hypot(d.x - o.x, d.y - o.y)
    const gain = cost(a, x) + cost(b, y) - cost(a, y) - cost(b, x)
    const read = Math.min(subStat(a.player, 'defensive', 'matchupReading'), subStat(b.player, 'defensive', 'matchupReading'))
    if (gain < 5 - read * 0.025) continue
    matchups.set(x.id, b.player); matchups.set(y.id, a.player)
    a.markTargetId = y.id; b.markTargetId = x.id
    a.switchUntilMs = b.switchUntilMs = nowMs + 1200
    used.add(a.id); used.add(b.id); switches++
  }
  return switches
}
