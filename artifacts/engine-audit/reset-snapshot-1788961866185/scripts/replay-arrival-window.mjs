import fs from 'node:fs'
const base = '../artifacts/engine-audit/reset-snapshot-1788958959042/src/'
const { selectDiscIntercept } = await import(`${base}matchEngine/ai/discIntercept.js`)
const { ARRIVAL_CALIBRATION, arrivalSpeed } = await import(`${base}matchEngine/ai/arrivalMotion.js`)
const { integrateAgentMotion } = await import(`${base}matchEngine/ai/playerMovement.js`)
const { firstDiscContact } = await import(`${base}matchEngine/ai/discContact.js`)
const { horizontalReachM, standingReachM, maxSpeedMps } = await import(`${base}matchEngine/ai/statFormulas.js`)
const { demoHomeTeam } = await import(`${base}data/demoMatchTeams.js`)
const data = JSON.parse(fs.readFileSync('artifacts/engine-audit/failed-pass.json'))
const { trace, event } = data
const player = { ...structuredClone(demoHomeTeam.players.find(p => p.id === event.receiverId)),
  currentStamina: event.staminaBeforeThrow.home[event.receiverId] }
const initial = trace.frames.find(f => f.ms === trace.throwMs).players.find(p => p.id === player.id)
const samples = trace.frames.filter(f => f.disc?.state === 'IN_FLIGHT').map(f => ({ ms: f.ms - trace.throwMs - 20, ...f.disc }))
const sample = ms => {
  const next = samples.find(p => p.ms >= ms)
  if (!next) return { ...samples.at(-1), z: 0 }
  const i = samples.indexOf(next), prior = samples[Math.max(0, i - 1)]
  const fraction = next.ms === prior.ms ? 0 : (ms - prior.ms) / (next.ms - prior.ms)
  return Object.fromEntries(['x', 'y', 'z'].map(k => [k, prior[k] + (next[k] - prior[k]) * fraction]))
}
const run = enabled => {
  ARRIVAL_CALIBRATION.kinematics = enabled
  let agent = { ...initial, player }, minimumDistance = Infinity
  const speed = maxSpeedMps(player), positions = []
  for (let ms = 0; ms < 3200; ms += 20) {
    const target = selectDiscIntercept({ agent, player, role: 'offense', speed, elapsedMs: ms, totalMs: 3220, sample })
    const seconds = Math.max(0.08, (target.atMs - ms) / 1000 - 0.15)
    const requested = enabled && target.reachable ? arrivalSpeed(agent, target, player, speed, seconds + 0.15)
      : target.reachable ? Math.min(speed, Math.max(0, Math.hypot(target.x - agent.x, target.y - agent.y) - 0.08) / seconds) : speed
    const next = { ...agent, ...integrateAgentMotion(agent, target.x, target.y, speed, 0.02, true, 'offense', requested) }
    const disc = sample(ms + 20)
    minimumDistance = Math.min(minimumDistance, Math.hypot(next.x - disc.x, next.y - disc.y))
    positions.push({ ms: ms + 20, x: next.x, y: next.y, vx: next.vx, vy: next.vy })
    const contact = firstDiscContact(sample(ms), disc, agent, next, { horizontal: horizontalReachM(player), standing: standingReachM(player) })
    if (contact) return { enabled, contactMs: ms + contact.fraction * 20, minimumDistance, positions }
    agent = next
  }
  return { enabled, contactMs: null, minimumDistance, positions }
}
const results = [run(false), run(true)]
ARRIVAL_CALIBRATION.kinematics = true
fs.writeFileSync('artifacts/engine-audit/arrival-window-replay.json', JSON.stringify({
  limitation: 'Known recorded disc trajectory; one receiver, no defenders/perception/random catch. Geometry only, not a full action replay.', results }, null, 2))
console.log(results.map(({ positions, ...summary }) => ({ ...summary, samples: positions.length })))
