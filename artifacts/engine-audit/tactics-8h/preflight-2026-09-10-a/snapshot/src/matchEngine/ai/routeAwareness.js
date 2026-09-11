/** Minimalny odstęp dwóch planowanych ruchów w najbliższych dwóch sekundach.
 * Służy ocenie trasy, nie przesuwa zawodników ani nie zastępuje ruchu.
 */
export function routeConflict(agent, target, speed, teammates = []) {
  const dx = target.x - agent.x, dy = target.y - agent.y
  const length = Math.hypot(dx, dy) || 1
  const horizon = Math.min(2, length / Math.max(1, speed))
  const vx = dx / length * speed, vy = dy / length * speed
  let penalty = 0
  for (const other of teammates) {
    if (other.id === agent.id || other.isThrower) continue
    const rx = other.x - agent.x, ry = other.y - agent.y
    const rvx = (other.vx ?? 0) - vx, rvy = (other.vy ?? 0) - vy
    const vv = rvx * rvx + rvy * rvy
    const time = vv > 0.01 ? Math.max(0, Math.min(horizon, -(rx * rvx + ry * rvy) / vv)) : 0
    const gap = Math.hypot(rx + rvx * time, ry + rvy * time)
    if (time > 0.1 && gap < 1.5) penalty += (1.5 - gap) / 1.5
  }
  return penalty
}
