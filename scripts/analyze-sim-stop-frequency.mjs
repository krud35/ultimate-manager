// Mierzy, co ile dni (średnio) pętla "Dalej" (handleAdvanceDay w App.jsx) faktycznie
// się zatrzymuje — zarówno na dniach meczowych własnej drużyny, jak i na blokujących
// wiadomościach w skrzynce (firstImportantInboxMessage) — dokładnie tą samą logiką
// co produkcyjny kod (advanceCareerDay + firstImportantInboxMessage).
import { createCareer } from '../src/career/careerModel.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'
import { firstImportantInboxMessage } from '../src/career/inbox.js'
import { cloneLeague } from '../src/league/leagueState.js'

globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}

const MAX_DAYS = Number(process.argv[2] ?? 700)

let career = createCareer(0, {
  managerName: 'Bench',
  playerTeamId: 'toronto-rush',
  seasonYear: 2025,
  rosterMode: 'historical',
})

console.log('start date', career.league.currentDate, 'status', career.league.status)

const stops = [] // { day, date, reason: 'match' | messageType, messageKind }
let lastStopDay = 0
let day = 0
// Mirror App.jsx's loop exactly: it clones the league before every advanceCareerDay
// call (dayLeague = cloneLeague(...)) because advanceCalendarDay mutates the league
// object it's given in place — reusing career.league directly across calls silently
// double-mutates state and desyncs the day count from the calendar.
let dayLeague = cloneLeague(career.league)

while (day < MAX_DAYS) {
  day += 1
  // 1) Dalej krok "na sucho" (bez auto-symulacji meczu) — dokładnie jak handleAdvanceDay.
  const dry = advanceCareerDay({ ...career, league: dayLeague }, { autoSimulatePlayer: false })

  if (dry.blocked && dry.playerFixture) {
    stops.push({ day, date: dayLeague.currentDate, reason: 'match' })
    // Zagraj mecz (auto-sim) żeby przejść do kolejnego dnia, tak jak user robi po obejrzeniu meczu.
    const played = advanceCareerDay({ ...career, league: cloneLeague(dayLeague) }, { autoSimulatePlayer: true })
    career = played.career
    dayLeague = career.league
    lastStopDay = day
    if (career.league.status === 'complete') break
    continue
  }

  career = dry.career
  dayLeague = career.league
  const blocker = firstImportantInboxMessage(dry.inboxMessages)
  if (blocker) {
    stops.push({
      day,
      date: dayLeague.currentDate,
      reason: blocker.type,
      messageKind: blocker.payload?.kind ?? null,
    })
    lastStopDay = day
  }

  if (career.league.status === 'complete') break
}

console.log(`\nSimulated ${day} days, final date ${career.league.currentDate}, status ${career.league.status}`)
console.log(`Total stops: ${stops.length}`)

const gaps = []
let prev = 0
for (const s of stops) {
  gaps.push(s.day - prev)
  prev = s.day
}

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

console.log(`\n=== Wszystkie zatrzymania (mecze + skrzynka) ===`)
console.log(`avg gap: ${avg(gaps).toFixed(2)} dni, median: ${median(gaps)}, min: ${Math.min(...gaps)}, max: ${Math.max(...gaps)}`)

// Rozbicie: same zatrzymania na meczach (rutynowe) vs same na skrzynce (to co ciekawi usera)
const matchStops = stops.filter((s) => s.reason === 'match')
const inboxStops = stops.filter((s) => s.reason !== 'match')

function gapsFor(list) {
  const g = []
  let p = 0
  for (const s of list) { g.push(s.day - p); p = s.day }
  return g
}

const matchGaps = gapsFor(matchStops)
const inboxGaps = gapsFor(inboxStops)

console.log(`\n=== Tylko dni meczowe własnej drużyny (${matchStops.length} stops) ===`)
if (matchStops.length) {
  console.log(`avg gap: ${avg(matchGaps).toFixed(2)} dni, median: ${median(matchGaps)}, min: ${Math.min(...matchGaps)}, max: ${Math.max(...matchGaps)}`)
}

console.log(`\n=== Tylko blokujące wiadomości w skrzynce (${inboxStops.length} stops) ===`)
if (inboxStops.length) {
  console.log(`avg gap: ${avg(inboxGaps).toFixed(2)} dni, median: ${median(inboxGaps)}, min: ${Math.min(...inboxGaps)}, max: ${Math.max(...inboxGaps)}`)
}

console.log('\n=== Rozbicie wg typu/kind blokującej wiadomości ===')
const byKey = new Map()
for (const s of inboxStops) {
  const key = s.messageKind ? `${s.reason}:${s.messageKind}` : s.reason
  byKey.set(key, (byKey.get(key) ?? 0) + 1)
}
for (const [key, count] of [...byKey.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(45)} ${count}`)
}

console.log('\n=== Pierwsze 30 zatrzymań (chronologicznie) ===')
for (const s of stops.slice(0, 30)) {
  console.log(`  day ${String(s.day).padStart(4)}  ${s.date}  ${s.reason}${s.messageKind ? ':' + s.messageKind : ''}`)
}
