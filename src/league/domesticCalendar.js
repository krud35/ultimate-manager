import { addDays, formatISODate, nextWeekday } from './seasonCalendar.js'
import { shuffledTeamOrder, generateDoubleRoundRobinSchedule, flattenSchedule } from './schedule.js'

export function domesticCupDates(year, rounds = 6) {
  const anchors = [`${year}-08-26`, `${year}-09-09`, `${year}-11-04`, `${year + 1}-01-13`, `${year + 1}-02-17`, `${year + 1}-04-07`, `${year + 1}-05-19`]
  return anchors.slice(-rounds).map(d => formatISODate(nextWeekday(d, 3)))
}
export function buildDomesticCalendar({ seasonYear: year, teamIds, christmasBreak = true, regionalPlayoffs = false, frenchPyramid = false }) {
  const rounds = ((teamIds.length + teamIds.length % 2) - 1) * 2
  const weekends = []
  for (let d = nextWeekday(`${year}-08-14`, 5); formatISODate(d) <= `${year + 1}-${regionalPlayoffs ? "04-23" : frenchPyramid ? "05-02" : "05-27"}`; d = addDays(d, 7)) {
    const iso = formatISODate(d)
    if (christmasBreak && iso >= `${year}-12-22` && iso <= `${year}-12-28`) continue
    weekends.push(iso)
  }
  if (rounds > weekends.length) throw new Error('Too many teams for the domestic season calendar')
  const roundDates = {}
  for (let r = 0; r < rounds; r++) {
    const friday = weekends[Math.round(r * (weekends.length - 1) / Math.max(1, rounds - 1))]
    roundDates[r + 1] = Array.from({ length: Math.ceil(teamIds.length / 2) }, (_, i) => ({ date: formatISODate(addDays(friday, i % 4)) }))
  }
  // Separate club finals (June15–30) from national finals (July2–14).
  const nationalDates = Array.from({ length: 7 }, (_, i) => `${year + 1}-07-${String(2 + i * 2).padStart(2, '0')}`)
  return { mode: 'domestic', seasonYear: year, seasonLabel: `${year}/${String(year + 1).slice(-2)}`,
    startDate: `${year}-08-01`, endDate: `${year + 1}-05-31`, officialEndDate: `${year + 1}-07-31`,
    roundDates, fallRounds: Object.keys(roundDates).map(Number).filter(r => roundDates[r][0].date < `${year + 1}-01-01`),
    springRounds: Object.keys(roundDates).map(Number).filter(r => roundDates[r][0].date >= `${year + 1}-01-01`),
    internationalWindows: { dates: nationalDates.slice(0, 6) }, nationalTournamentFinals: { dates: nationalDates },
    cup: null, christmasBreak, regionalPlayoffs, frenchPyramid, domesticCupDates: domesticCupDates(year) }
}
export function domesticFixtures(teamIds, calendar, seed) {
  const ids = teamIds.length % 2 ? [...teamIds, '__bye__'] : teamIds
  const rounds = generateDoubleRoundRobinSchedule(shuffledTeamOrder(ids, seed), shuffledTeamOrder(ids, seed + 1))
  const fixtures = flattenSchedule(rounds).filter(f => f.homeTeamId !== '__bye__' && f.awayTeamId !== '__bye__')
  const firstLegs = new Map()
  for (const f of fixtures) {
    const pair = [f.homeTeamId, f.awayTeamId].sort().join('|')
    if (f.round <= ids.length - 1) firstLegs.set(pair, f)
    else {
      const first = firstLegs.get(pair)
      f.homeTeamId = first.awayTeamId
      f.awayTeamId = first.homeTeamId
      f.id = `r${f.round}-${f.homeTeamId}-vs-${f.awayTeamId}`
    }
  }
  const counts = {}
  for (const f of fixtures) f.date = calendar.roundDates[f.round][(counts[f.round] = (counts[f.round] ?? -1) + 1)].date
  return fixtures
}

const DAY_MS = 86400000
const CALENDAR_REVISION = 1

/**
 * Keep the published schedule unless cup reservations or calendar rules change.
 * The key survives both JSON saves and career clones; match results and the current
 * day deliberately do not invalidate it. Old saves are checked once on first use.
 * Returns whether scheduling ran, and how many pending fixtures changed date.
 */
export function reconcileDomesticCalendar(league) {
  if (league.calendar?.mode !== 'domestic') return { checked: false, moved: 0 }
  const competitions = [league, ...(league.otherLeagues ?? [])]
  const reservations = new Map()
  const days = new Map()
  const dayOf = date => {
    if (!days.has(date)) days.set(date, Date.parse(date) / DAY_MS)
    return days.get(date)
  }
  const reserve = (id, date) => {
    if (!id || !date) return
    if (!reservations.has(id)) reservations.set(id, new Set())
    reservations.get(id).add(dayOf(date))
  }
  for (const comp of competitions) {
    for (const f of comp.fixtures) if (f.competition !== 'league') { reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date) }
    if (comp.cup) for (const id of comp.cup.seeds) for (const date of comp.cup.roundDates) reserve(id, date)
  }

  // Compare effective team/date constraints, not fixture status or object identity.
  // Resolving an already-reserved domestic cup round therefore needs no repair.
  const constraintsKey = JSON.stringify([
    CALENDAR_REVISION, league.seasonYear,
    competitions.map(c => {
      const calendar = c.calendar ?? league.calendar
      return JSON.stringify([[...c.teamIds].sort(), !!calendar.christmasBreak, !!calendar.regionalPlayoffs, !!calendar.frenchPyramid])
    }).sort(),
    [...reservations].map(([id, dates]) => [id, [...dates].sort((a, b) => a - b)]).sort(([a], [b]) => a.localeCompare(b)),
  ])
  if (league.domesticCalendarKey === constraintsKey) return { checked: false, moved: 0 }

  const domestic = competitions.flatMap(c => c.fixtures.filter(f => f.competition === 'league')
    .map(f => ({ fixture: f, calendar: c.calendar ?? league.calendar })))
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date))
  // Completed fixtures are immutable, even when a pending fixture sorts before them.
  for (const { fixture: f } of domestic) if (f.status === 'completed') {
    reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date)
  }
  const earliest = Math.max(dayOf(league.currentDate), dayOf(`${league.seasonYear}-08-14`))
  const christmasStart = dayOf(`${league.seasonYear}-12-23`)
  const christmasEnd = dayOf(`${league.seasonYear}-12-29`)
  const changes = []
  for (const { fixture: f, calendar } of domestic) {
    if (f.status === 'completed') continue
    const latest = dayOf(`${league.seasonYear + 1}-${calendar.regionalPlayoffs ? '04-30' : calendar.frenchPyramid ? '05-07' : '05-31'}`)
    const fits = day => {
      const weekday = (day + 4) % 7 // ISO dates are whole UTC days, unaffected by DST.
      if (![0, 1, 5, 6].includes(weekday) || day < earliest || day > latest) return false
      if (calendar.christmasBreak && day >= christmasStart && day <= christmasEnd) return false
      for (const id of [f.homeTeamId, f.awayTeamId]) {
        for (const booked of reservations.get(id) ?? []) if (Math.abs(booked - day) < 3) return false
      }
      return true
    }
    const current = dayOf(f.date)
    let found = fits(current) ? current : null
    // Preserve valid dates. Only collisions search nearby dates, then later weekends.
    for (const offset of [1, -1, 2, -2, 3, -3]) {
      if (found !== null) break
      if (fits(current + offset)) found = current + offset
    }
    for (let day = Math.max(current + 4, earliest); found === null && day <= latest; day++) {
      if (fits(day)) found = day
    }
    if (found === null) throw new Error(`Cannot schedule domestic fixture ${f.id} with required rest`)
    const date = found === current ? f.date : new Date(found * DAY_MS).toISOString().slice(0, 10)
    changes.push({ fixture: f, date })
    reserve(f.homeTeamId, date); reserve(f.awayTeamId, date)
  }
  // Commit only after every collision has a solution; a failure leaves dates intact.
  let moved = 0
  for (const { fixture, date } of changes) {
    fixture.originalDate ??= fixture.date
    if (fixture.date !== date) { fixture.date = date; moved++ }
  }
  league.domesticCalendarKey = constraintsKey
  return { checked: true, moved }
}
