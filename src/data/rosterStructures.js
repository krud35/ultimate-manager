// Independent dimensions: quality hierarchy and coverage of playing roles.
export const ROSTER_STRUCTURE_WEIGHTS = {
  1: { balanced: 15, leader: 5, duo: 10, strong_core: 20, elite_seven: 15, two_lines: 20, deep_rotation: 12, uneven: 3 },
  2: { balanced: 15, leader: 15, duo: 15, strong_core: 20, elite_seven: 10, two_lines: 12, deep_rotation: 8, uneven: 5 },
  3: { balanced: 15, leader: 25, duo: 15, strong_core: 15, elite_seven: 10, two_lines: 5, deep_rotation: 3, uneven: 12 },
}

export const ROSTER_COVERAGE_WEIGHTS = {
  1: { complete: 75, one_gap: 22, multiple_gaps: 3 },
  2: { complete: 50, one_gap: 40, multiple_gaps: 10 },
  3: { complete: 25, one_gap: 50, multiple_gaps: 25 },
}

export function sampleRosterWeight(table, tier, rng) {
  const weights = table[tier]
  if (!weights) throw new RangeError(`Unknown UltiLeague tier: ${tier}`)
  let roll = rng() * Object.values(weights).reduce((sum, weight) => sum + weight, 0)
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight
    if (roll < 0) return key
  }
  return Object.keys(weights).at(-1)
}

export function sampleRosterCoverage(tier, rng) {
  const level = sampleRosterWeight(ROSTER_COVERAGE_WEIGHTS, tier, rng)
  const families = ['handler', 'cutter', 'defender']
  const gaps = []
  const count = level === 'complete' ? 0 : level === 'one_gap' ? 1 : 2
  while (gaps.length < count) gaps.push(families.splice(Math.floor(rng() * families.length), 1)[0])
  return { level, gaps }
}

// Relative quality before fitting the club mean. Seven/fourteen describe actual
// line sizes, whereas rotation depth grows with the number of rostered players.
export function rosterQualityOffset(shape, rank, size) {
  switch (shape) {
    case 'balanced': return 2 - 4 * rank / Math.max(1, size - 1)
    case 'leader': return rank === 0 ? 15 : rank < 5 ? 4 : -3
    case 'duo': return rank < 2 ? 13 : rank < 6 ? 3 : -3
    case 'strong_core': return rank < 5 ? 9 : rank < 10 ? 0 : -4
    case 'elite_seven': return rank < 7 ? 9 : -5
    case 'two_lines': return rank < 7 ? 4 : rank < 14 ? 2 : -5
    case 'deep_rotation': return rank < Math.max(18, Math.round(size * 0.85)) ? 1 : -4
    case 'uneven': return rank < 2 ? 13 : rank < 5 ? 6 : rank < Math.ceil(size * 0.6) ? -1 : -7
    default: throw new RangeError(`Unknown roster structure: ${shape}`)
  }
}
