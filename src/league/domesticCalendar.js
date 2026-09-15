import { addDays, formatISODate, nextWeekday, parseISODate } from './seasonCalendar.js'
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

/** Reassign only pending domestic games; reserve actual opponents and unresolved cup rounds. */
export function reconcileDomesticCalendar(league) {
  if (league.calendar?.mode !== 'domestic') return
  const competitions = [league, ...(league.otherLeagues ?? [])]
  const international = league.fixtures.filter(f => f.competition === 'international-club')
  const reservations = new Map()
  const reserve = (id, date) => { if (id && date) { if (!reservations.has(id)) reservations.set(id, []); reservations.get(id).push(date) } }
  for (const comp of competitions) {
    for (const f of comp.fixtures.filter(f => f.competition !== 'league')) { reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date) }
    if (comp.cup) for (const id of comp.cup.seeds) for (const date of comp.cup.roundDates) reserve(id, date)
  }
  for (const f of international) { reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date) }
  const gap = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)
  const domestic = competitions.flatMap(c => c.fixtures.filter(f => f.competition === 'league')).sort((a, b) => a.date.localeCompare(b.date))
  for (const f of domestic) {
    if (f.status === 'completed') { reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date); continue }
    f.originalDate ??= f.date
    const fixtureCalendar = competitions.find(c=>c.teamIds.includes(f.homeTeamId))?.calendar ?? league.calendar
    const candidates = [0, 1, -1, 2, -2, 3, -3, ...Array.from({ length: 60 }, (_, i) => i + 4)]
    const found = candidates.map(n => formatISODate(addDays(f.originalDate, n))).find(date => {
      const dow = parseISODate(date).getDay()
      return [0, 1, 5, 6].includes(dow) && date >= league.currentDate && date >= `${league.seasonYear}-08-14` && date <= `${league.seasonYear + 1}-${fixtureCalendar.regionalPlayoffs ? "04-30" : fixtureCalendar.frenchPyramid ? "05-07" : "05-31"}`
        && !(fixtureCalendar.christmasBreak && date >= `${league.seasonYear}-12-23` && date <= `${league.seasonYear}-12-29`)
        && [f.homeTeamId, f.awayTeamId].every(id => (reservations.get(id) ?? []).every(d => gap(d, date) >= 3))
    })
    if (!found) throw new Error(`Cannot schedule domestic fixture ${f.id} with required rest`)
    f.date = found
    reserve(f.homeTeamId, f.date); reserve(f.awayTeamId, f.date)
  }
}
