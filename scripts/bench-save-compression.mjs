// Measures the cost of the synchronous save-compression path (saveStore.js
// writeSaveStoreImmediate -> compressToUTF16) that fires once when a league
// match actually finishes (handleLeagueMatchComplete -> saveCareerNow in App.jsx),
// to check whether it could explain an end-of-match UI freeze.
import { performance } from 'node:perf_hooks'
import { compressToUTF16 } from 'lz-string'
import { createCareer } from '../src/career/careerModel.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'
import { careerForStorage } from '../src/career/worldState.js'

globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}

let career = createCareer(0, {
  managerName: 'Bench',
  playerTeamId: 'toronto-rush',
  seasonYear: 2025,
  rosterMode: 'historical',
})

const DAYS = Number(process.argv[2] ?? 90)
for (let i = 0; i < DAYS && career.league.status !== 'complete'; i++) {
  const result = advanceCareerDay(career, { autoSimulatePlayer: true })
  career = result.career
}
console.log('career advanced to', career.league.currentDate, 'days=', DAYS)

// Mimic writeSaveStoreImmediate: 3 save slots, this career in slot 0, two empty.
const slots = [careerForStorage(career), null, null]
const payload = { version: 1, slots }

const t0 = performance.now()
const json = JSON.stringify(payload)
const t1 = performance.now()
const compressed = compressToUTF16(json)
const t2 = performance.now()

console.log(`JSON size: ${(json.length / 1024).toFixed(0)} KB (utf-16 chars)`)
console.log(`compressed size: ${(compressed.length / 1024).toFixed(0)} KB (utf-16 chars)`)
console.log(`JSON.stringify: ${(t1 - t0).toFixed(1)} ms`)
console.log(`compressToUTF16: ${(t2 - t1).toFixed(1)} ms`)
console.log(`TOTAL (blocking, matches writeSaveStoreImmediate): ${(t2 - t0).toFixed(1)} ms`)
