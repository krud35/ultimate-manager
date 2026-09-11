import assert from 'node:assert/strict'
import { computeMissDistanceM, MISS_CALIBRATION } from '../src/matchEngine/resolution.js'

const margin = MISS_CALIBRATION.cleanMargin
assert.equal(computeMissDistanceM(margin + 10, 0, 80), 0)
assert.ok(computeMissDistanceM(margin - 10, 0, 80) > computeMissDistanceM(margin - 5, 0, 80))
const rates = [60, 80, 95].map(skill => {
  let count = 0
  for (let i = 0; i < 1000; i++) {
    let draws = 0
    const rng = { float: () => draws++ === 0 ? (i + 0.5) / 1000 : 0.5 }
    const miss = computeMissDistanceM(margin + 10, 0, skill, rng)
    if (miss) {
      count++
      assert.equal(miss, MISS_CALIBRATION.errorMissMinM + MISS_CALIBRATION.errorMissSpanM * 0.5)
    }
  }
  return count
})
assert.ok(rates[0] > rates[1] && rates[1] > rates[2], 'Higher throwing skill must reduce rare execution errors')
assert.ok(Number.isFinite(computeMissDistanceM(-10000, 10000, 60)))
assert.ok(computeMissDistanceM(-10000, 10000, 60) <= MISS_CALIBRATION.maxMissM)
console.log(`OK: situational error, bounded displacement, skill-dependent mistake counts ${rates.join('/')}/1000`)
