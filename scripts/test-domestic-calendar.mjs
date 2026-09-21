import assert from 'node:assert/strict'
import { reconcileDomesticCalendar } from '../src/league/domesticCalendar.js'
import { syncInternationalClubFixtures, initializeInternationalClubCups, advanceInternationalClubCups, completeInternationalClubSeason } from '../src/career/internationalClubCups.js'
import { createDomesticSeason } from '../src/career/domesticWorld.js'
import { advanceCupAfterMatch, syncCupMatchesIntoFixtures } from '../src/league/cupBracket.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'

let passed = 0
function test(name, run) { run(); console.log(`OK ${name}`); passed++ }
const game = (id, homeTeamId, awayTeamId, date, extra = {}) => ({
  id, homeTeamId, awayTeamId, date, competition: 'league', status: 'scheduled', ...extra,
})
function season(fixtures, extra = {}) {
  return {
    calendar: { mode: 'domestic', christmasBreak: true }, seasonYear: 2026,
    currentDate: '2026-08-01', teamIds: [...new Set(fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]))],
    fixtures, ...extra,
  }
}
const dates = league => [league, ...(league.otherLeagues ?? [])].flatMap(c => c.fixtures.map(f => [f.id, f.date]))
function assertRest(league) {
  const bookings = new Map()
  for (const comp of [league, ...(league.otherLeagues ?? [])]) {
    for (const f of comp.fixtures) for (const id of [f.homeTeamId, f.awayTeamId].filter(Boolean)) {
      if (!bookings.has(id)) bookings.set(id, [])
      bookings.get(id).push(f)
    }
  }
  for (const [id, games] of bookings) {
    games.sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 1; i < games.length; i++) assert(
      (Date.parse(games[i].date) - Date.parse(games[i - 1].date)) / 86400000 >= 3,
      `${id}: ${games[i - 1].date} -> ${games[i].date}`,
    )
  }
}

test('Ordinary days and results keep published dates without running the scheduler', () => {
  const league = season([game('one', 'a', 'b', '2026-08-14'), game('two', 'b', 'a', '2026-08-21')])
  assert.equal(reconcileDomesticCalendar(league).checked, true)
  const published = dates(league)
  for (let day = 2; day <= 30; day++) {
    league.currentDate = `2026-08-${String(day).padStart(2, '0')}`
    for (const f of league.fixtures) if (f.date < league.currentDate) f.status = 'completed'
    assert.equal(reconcileDomesticCalendar(league).checked, false)
    assert.deepEqual(dates(league), published)
  }
})

test('A newly drawn international round repairs collisions and their knock-on effects', () => {
  const league = season([
    game('first', 'a', 'b', '2026-08-14'), game('second', 'b', 'c', '2026-08-17'),
    game('unaffected', 'd', 'e', '2026-08-21', { originalDate: '2026-08-14' }),
  ])
  reconcileDomesticCalendar(league)
  const career = { league, internationalClubCups: { editions: [{ fixtures: [
    game('qualifying', 'a', 'x', '2026-08-13', { competition: 'international-club' }),
  ] }] } }
  syncInternationalClubFixtures(career)
  assert.deepEqual(reconcileDomesticCalendar(league), { checked: true, moved: 2 })
  assert.equal(league.fixtures.find(f => f.id === 'first').date, '2026-08-16')
  assert.equal(league.fixtures.find(f => f.id === 'second').date, '2026-08-21')
  assert.equal(league.fixtures.find(f => f.id === 'unaffected').date, '2026-08-21')
  assertRest(league)
  const reload = JSON.parse(JSON.stringify(career))
  syncInternationalClubFixtures(reload)
  assert.equal(reconcileDomesticCalendar(reload.league).checked, false)
  assert.equal(reconcileDomesticCalendar(structuredClone(reload.league)).checked, false)
})

test('In-place changes to cup dates repair background leagues too', () => {
  const league = season([game('main', 'a', 'b', '2026-08-14')], {
    otherLeagues: [season([game('background', 'c', 'd', '2026-08-14')])],
  })
  const cup = game('cup', 'c', 'x', '2026-08-05', { competition: 'international-club' })
  league.fixtures.push(cup)
  reconcileDomesticCalendar(league)
  cup.date = '2026-08-13'
  assert.deepEqual(reconcileDomesticCalendar(league), { checked: true, moved: 1 })
  assert.equal(league.fixtures[0].date, '2026-08-14')
  assert.equal(league.otherLeagues[0].fixtures[0].date, '2026-08-16')
  assertRest(league)
  cup.homeTeamId = 'a'
  assert.equal(reconcileDomesticCalendar(league).moved, 1)
  assert.equal(league.otherLeagues[0].fixtures[0].date, '2026-08-16', 'do not undo published postponements')
  assertRest(league)
})

test('Domestic cup results and known opponents do not invalidate reserved rounds', () => {
  const league = season([game('league', 'a', 'b', '2026-08-14')], {
    cup: { seeds: ['a', 'b', 'c', 'd'], roundDates: ['2026-08-12', '2026-08-26'] },
  })
  reconcileDomesticCalendar(league)
  const cup = game('cup', 'a', 'c', '2026-08-12', { competition: 'cup' })
  league.fixtures.push(cup)
  assert.equal(reconcileDomesticCalendar(league).checked, false)
  cup.status = 'completed'
  league.fixtures.push(game('final', 'a', 'd', '2026-08-26', { competition: 'cup' }))
  assert.equal(reconcileDomesticCalendar(league).checked, false)
  league.cup.roundDates[1] = '2026-08-27'
  assert.equal(reconcileDomesticCalendar(league).checked, true)
})

test('Completed matches are immutable and constrain even earlier pending matches', () => {
  const done = game('done', 'a', 'b', '2026-08-17', { status: 'completed' })
  const league = season([
    game('pending', 'a', 'c', '2026-08-14'), done,
    game('cup', 'a', 'x', '2026-08-13', { competition: 'international-club' }),
  ])
  Object.freeze(done)
  reconcileDomesticCalendar(league)
  assert.equal(done.date, '2026-08-17')
  assert.equal(league.fixtures[0].date, '2026-08-21')
  assertRest(league)
})

test('Legacy saves check once, preserve valid postponements and never move games into the past', () => {
  const league = season([
    game('overdue', 'a', 'b', '2026-08-14'),
    game('postponed', 'c', 'd', '2026-09-04', { originalDate: '2026-08-28' }),
  ], { currentDate: '2026-08-20' })
  assert.equal(reconcileDomesticCalendar(league).moved, 1)
  assert(league.fixtures[0].date >= league.currentDate)
  assert.equal(league.fixtures[1].date, '2026-09-04')
  const restored = JSON.parse(JSON.stringify(league))
  Object.freeze(restored.fixtures[0]); Object.freeze(restored.fixtures[1])
  assert.equal(reconcileDomesticCalendar(restored).checked, false)
})

test('Christmas break, French deadlines and daylight saving preserve calendar rules', () => {
  const league = season([
    game('christmas', 'a', 'b', '2026-12-25'),
    game('dst', 'c', 'd', '2027-03-28'),
    game('cup', 'c', 'x', '2027-03-25', { competition: 'cup' }),
    game('late', 'e', 'f', '2027-05-01'),
  ], { calendar: { mode: 'domestic', christmasBreak: true, regionalPlayoffs: true } })
  reconcileDomesticCalendar(league)
  assert.equal(league.fixtures[0].date, '2027-01-01')
  assert.equal(league.fixtures[1].date, '2027-03-28')
  assert.equal(league.fixtures[3].date, '2027-04-30')
  assertRest(league)
})

test('An impossible correction leaves every published date intact and can be retried', () => {
  const league = season([
    game('repairable', 'a', 'b', '2026-08-14'),
    game('blocked', 'c', 'd', '2027-05-31'),
    game('cup1', 'a', 'x', '2026-08-13', { competition: 'cup' }),
    game('cup2', 'c', 'y', '2027-05-30', { competition: 'cup' }),
  ], { currentDate: '2027-05-31' })
  const before = JSON.stringify(league)
  assert.throws(() => reconcileDomesticCalendar(league), /Cannot schedule/)
  assert.equal(JSON.stringify(league), before)
  league.fixtures.pop()
  assert.equal(reconcileDomesticCalendar(league).checked, true)
})

test('UFA calendars are unchanged', () => {
  const league = season([game('ufa', 'a', 'b', '2026-08-12')], { calendar: { mode: 'ufa' } })
  const before = JSON.stringify(league)
  assert.equal(reconcileDomesticCalendar(league).checked, false)
  assert.equal(JSON.stringify(league), before)
})

test('A full chronological season repairs new international rounds while preserving played matches', () => {
  const teams = Array.from({ length: 16 }, (_, i) => ({
    id: `club-${i}`, name: `Club ${i}`, countryId: 'pl', domesticLeagueId: 'pl-1', tier: 1,
    reputation: 80 - i, players: Array.from({ length: 7 }, (_, j) => ({ id: `p-${i}-${j}`, stats: {} })),
    finances: { transferBudget: 100000, salaryBudget: 1000 },
  }))
  const world = { teamsById: Object.fromEntries(teams.map(t => [t.id, t])), worldConfig: {
    leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, l.id === 'pl-1' ? 'playable' : 'off'])),
    international: { nationals: false, europe: true, paucc: false, aoucc: false, wucc: false }, christmasBreak: true,
  } }
  const league = createDomesticSeason(world, teams[0].id, 2026, 412)
  const career = { world, league, seasonYear: 2026, playerTeamId: null }
  initializeInternationalClubCups(career)
  let repairs = 0, skipped = 0
  for (let day = Date.parse('2026-08-01'); day <= Date.parse('2027-07-31'); day += 86400000) {
    league.currentDate = new Date(day).toISOString().slice(0, 10)
    const played = league.fixtures.filter(f => f.status === 'completed').map(f => [f, f.date])
    advanceInternationalClubCups(career, league.currentDate, {
      simulatePlayer: true, simulateMatch: () => ({ homeScore: 15, awayScore: 8, boxScore: [] }),
    })
    const result = reconcileDomesticCalendar(league)
    if (result.checked) { repairs++; assertRest(league) } else skipped++
    for (const [f, date] of played) assert.equal(f.date, date)
    for (const f of league.fixtures.filter(f => f.competition === 'league' && f.date === league.currentDate)) f.status = 'completed'
    for (const f of league.cup.matches.filter(f => f.status !== 'completed' && f.homeTeamId && f.awayTeamId && f.date === league.currentDate)) {
      advanceCupAfterMatch(league.cup, { fixtureId: f.id, homeScore: 15, awayScore: 8, winner: f.homeTeamId })
    }
    syncCupMatchesIntoFixtures(league)
  }
  assert(repairs >= 3, `expected multiple dynamic rounds, got ${repairs}`)
  assert(skipped > 350, `ordinary days should skip scheduling, got ${skipped}`)
  assert(completeInternationalClubSeason(career))
  assert(league.fixtures.every(f => f.status === 'completed'))
  assertRest(league)
  console.log(`  Season: ${repairs} scheduling checks, ${skipped} days skipped`)
})
console.log(`Domestic calendar: ${passed} passed`)
