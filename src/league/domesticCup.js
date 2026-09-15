import { shuffledTeamOrder } from './schedule.js'
import { domesticCupDates } from './domesticCalendar.js'
import { advanceCupAfterMatch } from './cupBracket.js'

export function createDomesticCup(countryId, teamIds, year, seed) {
  const seeds = shuffledTeamOrder(teamIds, seed)
  const size = 2 ** Math.ceil(Math.log2(seeds.length))
  const rounds = Math.log2(size)
  const roundDates = domesticCupDates(year, rounds)
  const matches = []
  for (let r = 0; r < rounds; r++) for (let i = 0; i < size / 2 ** (r + 1); i++) {
    const count = size / 2 ** (r + 1)
    matches.push({ id: `domestic-cup-${countryId}-${year}-${r}-${i}`, competition: 'cup', domesticCup: true,
      round: count === 1 ? 'final' : count === 2 ? 'semifinal' : count === 4 ? 'quarterfinal' : `round-${count * 2}`,
      bracketIndex: i, date: roundDates[r], status: 'pending', venue: count === 1 ? 'neutral' : 'home',
      homeTeamId: r === 0 ? seeds[i] ?? null : null, awayTeamId: r === 0 ? seeds[size - 1 - i] ?? null : null,
      nextMatchId: count > 1 ? `domestic-cup-${countryId}-${year}-${r + 1}-${Math.floor(i / 2)}` : null, nextSlot: i % 2 ? 'away' : 'home' })
  }
  const cup = { id: `cup-${countryId}`, format: 'domestic', countryId, status: 'active', seeds, matches, roundDates }
  for (const m of matches) {
    if (m.homeTeamId && m.awayTeamId) m.status = 'scheduled'
    else if (m.homeTeamId && m.id.includes(`-${year}-0-`)) {
      advanceCupAfterMatch(cup, { fixtureId: m.id, winner: m.homeTeamId, homeScore: 0, awayScore: 0 })
      m.bye = true
    }
  }
  return cup
}
