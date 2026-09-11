// Benchmarks wall-clock cost of advancing the season calendar day-by-day,
// bucketed by month, using the exact same path the UI uses (advanceCareerDay).
import { performance } from 'node:perf_hooks'
import { createCareer } from '../src/career/careerModel.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'

globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}

const MAX_DAYS = Number(process.argv[2] ?? 380)

let career = createCareer(0, {
  managerName: 'Bench',
  playerTeamId: 'toronto-rush',
  seasonYear: 2025,
  rosterMode: 'historical',
})

console.log('start date', career.league.currentDate, 'status', career.league.status)

const byMonth = new Map() // 'YYYY-MM' -> { ms, days, matchDays, maxMs, maxDate }
const perDay = []

let days = 0
const t0 = performance.now()
while (days < MAX_DAYS && career.league.status !== 'complete') {
  const dateBefore = career.league.currentDate
  const monthKey = dateBefore.slice(0, 7)
  const fixturesBefore = (career.league.fixtures ?? []).filter(
    (f) => f.date === dateBefore && f.status !== 'completed',
  ).length

  const t1 = performance.now()
  const result = advanceCareerDay(career, { autoSimulatePlayer: true })
  const ms = performance.now() - t1

  career = result.career
  days += 1

  perDay.push({ date: dateBefore, ms, fixturesBefore, weekTick: !!result.weekTick })

  const bucket = byMonth.get(monthKey) ?? { ms: 0, days: 0, matchDays: 0, maxMs: 0, maxDate: null }
  bucket.ms += ms
  bucket.days += 1
  if (fixturesBefore > 0) bucket.matchDays += 1
  if (ms > bucket.maxMs) { bucket.maxMs = ms; bucket.maxDate = dateBefore }
  byMonth.set(monthKey, bucket)

  if (result.blocked) {
    console.log('BLOCKED unexpectedly at', dateBefore, '(autoSimulatePlayer should prevent this)')
    break
  }
}
const totalMs = performance.now() - t0

console.log('\n=== Overall ===')
console.log(`days simulated: ${days}`)
console.log(`total time: ${(totalMs / 1000).toFixed(2)}s`)
console.log(`avg ms/day: ${(totalMs / days).toFixed(2)}`)
console.log(`final date: ${career.league.currentDate}  status: ${career.league.status}`)

console.log('\n=== Per month ===')
console.log('month     | days | matchDays | total(s) | avg ms/day | avg ms/matchday | max ms (date)')
for (const [month, b] of [...byMonth.entries()].sort()) {
  const avg = b.ms / b.days
  const avgMatch = b.matchDays ? b.ms / b.matchDays : 0
  console.log(
    `${month} | ${String(b.days).padStart(4)} | ${String(b.matchDays).padStart(9)} | ` +
    `${(b.ms / 1000).toFixed(2).padStart(8)} | ${avg.toFixed(1).padStart(10)} | ` +
    `${avgMatch.toFixed(1).padStart(16)} | ${b.maxMs.toFixed(1)} (${b.maxDate})`,
  )
}

console.log('\n=== Top 15 slowest days ===')
for (const d of [...perDay].sort((a, b) => b.ms - a.ms).slice(0, 15)) {
  console.log(`${d.date}  ${d.ms.toFixed(1).padStart(8)} ms  fixturesBefore=${d.fixturesBefore}  weekTick=${d.weekTick}`)
}

console.log('\n=== Match-day vs non-match-day ===')
const matchDays = perDay.filter((d) => d.fixturesBefore > 0)
const nonMatchDays = perDay.filter((d) => d.fixturesBefore === 0)
const avg = (arr) => arr.reduce((s, d) => s + d.ms, 0) / (arr.length || 1)
console.log(`match days: ${matchDays.length}, avg ${avg(matchDays).toFixed(1)} ms`)
console.log(`non-match days: ${nonMatchDays.length}, avg ${avg(nonMatchDays).toFixed(1)} ms`)
