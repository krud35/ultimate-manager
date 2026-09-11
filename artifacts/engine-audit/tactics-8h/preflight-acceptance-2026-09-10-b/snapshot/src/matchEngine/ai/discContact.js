/** Pierwsze wejście dysku w zasięg podczas kroku. Pozycje obu stron są
 * interpolowane liniowo; zasięg pionowy obejmuje tylko aktualne wybicie gracza.
 * Nie dodajemy potencjalnego wyskoku do skoku, który już trwa.
 */
export function agentAtContact(before, after, fraction) {
  const result = { ...after, toeInContact: null }
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) {
    result[key] = (before[key] ?? 0) + ((after[key] ?? 0) - (before[key] ?? 0)) * fraction
  }
  return result
}

export function firstDiscContact(discBefore, discAfter, agentBefore, agentAfter, reach) {
  const horizontal = Math.max(0.1, reach.horizontal)
  const vertical = Math.max(0.1, reach.standing / 2)
  const relative = (disc, agent) => agent.diving ? (() => {
    const angle = agent.diveHeading ?? Math.atan2(agent.vy ?? 0, agent.vx ?? 1)
    const dx = disc.x - agent.x, dy = disc.y - agent.y
    return [(dx * Math.cos(angle) + dy * Math.sin(angle) - horizontal * 0.45) / (horizontal * 1.1),
      (-dx * Math.sin(angle) + dy * Math.cos(angle)) / (horizontal * 0.55),
      ((disc.z ?? 0) - (agent.z ?? 0) - 0.4) / 0.5]
  })() : [
    (disc.x - agent.x) / horizontal,
    (disc.y - agent.y) / horizontal,
    ((disc.z ?? 0) - (agent.z ?? 0) - vertical) / vertical,
  ]
  const a = relative(discBefore, agentBefore), b = relative(discAfter, agentAfter)
  const v = b.map((n, i) => n - a[i])
  const dot = (x, y) => x.reduce((s, n, i) => s + n * y[i], 0)
  const aa = dot(v, v), bb = 2 * dot(a, v), cc = dot(a, a) - 1
  let fraction = 0
  if (cc > 0) {
    if (aa < 1e-12) return null
    const discriminant = bb * bb - 4 * aa * cc
    if (discriminant < 0) return null
    fraction = (-bb - Math.sqrt(discriminant)) / (2 * aa)
    if (fraction < 0 || fraction > 1) return null
  }
  const closest = aa > 1e-12 ? Math.max(fraction, Math.min(1, -bb / (2 * aa))) : 0
  const gap = a.map((n, i) => n + v[i] * closest)
  return { fraction, envelope: Math.min(1, Math.sqrt(dot(gap, gap))),
    x: discBefore.x + (discAfter.x - discBefore.x) * fraction,
    y: discBefore.y + (discAfter.y - discBefore.y) * fraction,
    z: (discBefore.z ?? 0) + ((discAfter.z ?? 0) - (discBefore.z ?? 0)) * fraction }
}
