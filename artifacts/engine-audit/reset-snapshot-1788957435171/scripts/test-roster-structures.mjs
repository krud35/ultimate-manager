import assert from 'node:assert/strict'
import { ROSTER_STRUCTURE_WEIGHTS, ROSTER_COVERAGE_WEIGHTS, sampleRosterWeight, sampleRosterCoverage, rosterQualityOffset } from '../src/data/rosterStructures.js'

assert.deepEqual(Object.values(ROSTER_STRUCTURE_WEIGHTS[1]), [15, 5, 10, 20, 15, 20, 12, 3])
assert.deepEqual(Object.values(ROSTER_STRUCTURE_WEIGHTS[2]), [15, 15, 15, 20, 10, 12, 8, 5])
assert.deepEqual(Object.values(ROSTER_STRUCTURE_WEIGHTS[3]), [15, 25, 15, 15, 10, 5, 3, 12])
assert.deepEqual(Object.values(ROSTER_COVERAGE_WEIGHTS).map(Object.values), [[75, 22, 3], [50, 40, 10], [25, 50, 25]])
for (const table of [ROSTER_STRUCTURE_WEIGHTS, ROSTER_COVERAGE_WEIGHTS]) {
  for (const tier of [1, 2, 3]) {
    assert.equal(Object.values(table[tier]).reduce((a, b) => a + b, 0), 100)
    // Stratified uniform samples exercise the actual CDF, including rare cases.
    const counts = Object.fromEntries(Object.keys(table[tier]).map(key => [key, 0]))
    for (let i = 0; i < 10000; i++) counts[sampleRosterWeight(table, tier, () => (i + 0.5) / 10000)]++
    for (const key of Object.keys(counts)) assert.equal(counts[key], table[tier][key] * 100)
  }
}
for (const tier of [1, 2, 3]) for (const roll of [0, 0.8, 0.999]) {
  const coverage = sampleRosterCoverage(tier, () => roll)
  assert.equal(new Set(coverage.gaps).size, coverage.gaps.length)
  assert.equal(coverage.gaps.length, { complete: 0, one_gap: 1, multiple_gaps: 2 }[coverage.level])
}
for (const size of [21, 29, 40]) {
  const curves = Object.keys(ROSTER_STRUCTURE_WEIGHTS[1]).map(shape => Array.from({ length: size }, (_, rank) => rosterQualityOffset(shape, rank, size)))
  assert.equal(new Set(curves.map(JSON.stringify)).size, 8)
  const offset = (shape, rank) => rosterQualityOffset(shape, rank, size)
  assert(offset('elite_seven', 6) > offset('elite_seven', 7) + 10)
  assert(offset('two_lines', 13) > offset('two_lines', 14) + 5)
  assert(offset('deep_rotation', 17) > offset('two_lines', 17))
}
console.log('League weights, exceptions, coverage and eight distinct quality curves passed')
