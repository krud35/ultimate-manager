/** Morphology is independent of skills and morale; unknown measurements remain unknown in UI. */
const measurement = (value, min, max, fallback) => Number.isFinite(value) && value >= min && value <= max ? value : fallback
const DEFAULT_BODY = Object.freeze({ heightM: 1.78, standingReachM: 2.2, armSpanM: 1.8334, massKg: 75, shoulderWidthM: 0.42 })
export function playerBody(player) {
  const raw = player?.body
  if (!raw) return DEFAULT_BODY
  const heightM = measurement(raw.heightCm, 140, 230, 178) / 100
  return {
    heightM,
    standingReachM: measurement(raw.standingReachCm, 170, 280, Number.isFinite(raw.heightCm) ? heightM * 124 : 220) / 100,
    armSpanM: measurement(raw.armSpanCm, 140, 250, heightM * 103) / 100,
    massKg: measurement(raw.massKg, 40, 150, 75),
    shoulderWidthM: measurement(raw.shoulderWidthCm, 28, 65, 42) / 100,
  }
}
export function groundContacts(agent) {
  if (agent.toeInContact) return [agent.toeInContact]
  const width = playerBody(agent.player ?? agent).shoulderWidthM * 0.3
  const angle = Math.atan2(agent.vy ?? 0, agent.vx ?? 1)
  const x = -Math.sin(angle) * width, y = Math.cos(angle) * width
  return [{ x: agent.x + x, y: agent.y + y }, { x: agent.x - x, y: agent.y - y }]
}
