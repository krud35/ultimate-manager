import { subStat } from './statFormulas.js'

const memory = new WeakMap()
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
/** Finite-rate head scan, peripheral vision, occlusion and expiring observations. */
export function perceivePlayers(observer, targets, blockers, nowMs, focus = null) {
  const owner = observer.player ?? observer
  let state = memory.get(owner)
  if (!state || nowMs < state.ms || nowMs - state.ms > 15000) {
    state = { ms: nowMs, heading: Math.atan2((focus?.y ?? observer.y) - observer.y,
      (focus?.x ?? observer.x + 1) - observer.x), seen: new Map() }
    memory.set(owner, state)
  }
  const vision = subStat(owner, 'mental', 'vision') / 100
  const dt = Math.min(0.5, Math.max(0, nowMs - state.ms) / 1000)
  // Deliberate scanning also covers the reset behind the thrower over time.
  if (focus?.lock) {
    const desired = Math.atan2(focus.y - observer.y, focus.x - observer.x)
    state.heading += Math.max(-dt * 5, Math.min(dt * 5, wrap(desired - state.heading)))
  } else state.heading += dt * (1.2 + vision * 1.5)
  state.ms = nowMs
  const observed = []
  for (const target of targets) {
    const id = target.id ?? target.player?.id
    if (id === (observer.id ?? owner.id)) { observed.push(target); continue }
    const dx = target.x - observer.x, dy = target.y - observer.y, distance = Math.hypot(dx, dy)
    const angle = Math.abs(wrap(Math.atan2(dy, dx) - state.heading))
    const occluded = distance > 4 && blockers.some(b => {
      if ((b.id ?? b.player?.id) === id) return false
      const u = ((b.x - observer.x) * dx + (b.y - observer.y) * dy) / Math.max(0.01, distance * distance)
      return u > 0.08 && u < 0.9 && Math.hypot(b.x - observer.x - dx * u, b.y - observer.y - dy * u) < 0.35
    })
    const visible = distance < 4 || (angle < 1.05 + vision * 0.8 && !occluded)
    if (visible) {
      const snapshot = { ...target, rawX: target.x, rawY: target.y,
        observedAtMs: nowMs, observationAgeMs: 0, visibility: 1 }
      state.seen.set(id, snapshot)
      observed.push(snapshot)
    } else {
      const old = state.seen.get(id), age = nowMs - (old?.observedAtMs ?? -Infinity)
      if (age < 1100 + vision * 900) {
        const prediction = Math.min(age / 1000, 0.6) * subStat(owner, 'mental', 'anticipation') / 100
        observed.push({ ...old, x: old.x + (old.vx ?? 0) * prediction,
          y: old.y + (old.vy ?? 0) * prediction, observationAgeMs: age, visibility: 1 - age / 2200 })
      }
    }
  }
  return observed
}

export function resetPlayerPerception(player) { memory.delete(player) }
