import { selectNationalSquad } from './nationalTeams.js'
import { trainingDateAdd } from './trainingSchedule.js'

/** Two weeks off follow each player's summer commitments, not a shared fatigue reset. */
export function scheduleSeasonalHolidays(career, date) {
  if (career.league?.calendar?.mode !== 'domestic') return
  const year = career.seasonYear + 1
  if (date < `${year}-06-01` || career.world.holidaysPlannedFor === career.seasonYear) return
  const international = career.internationalClubCups ?? career.league.internationalClubCups
  const summerTeams = new Set((international?.editions ?? []).filter(e => e.seasonYear === career.seasonYear && e.kind !== 'europe' && e.phase !== 'unavailable').flatMap(e => e.teamIds))
  const nt = career.nationalTeams
  const countries = career.world.worldConfig.international.nationals === false ? [] : [
    ...(nt?.finals?.participantCountryIds ?? []),
    ...(nt?.finals?.groups ?? []).flatMap(g => g.countryIds ?? []),
    ...(nt?.qualifying?.participantCountryIds ?? []),
    ...(nt?.qualifying?.groups ?? []).flatMap(g => g.countryIds ?? []),
    ...(nt?.qualifying?.campaigns ?? []).flatMap(c => (c.groups ?? []).flatMap(g => g.countryIds ?? [])),
  ]
  const selected = new Set([...new Set(countries)].flatMap(id => selectNationalSquad(career.world, career, id, { seasonYear: year }).players.map(p => p.id)))
  for (const team of Object.values(career.world.teamsById)) for (const p of team.players ?? []) {
    const calledUp = selected.has(p.id)
    p.holidayFrom = calledUp ? `${year}-07-15` : summerTeams.has(team.id) ? `${year}-07-01` : `${year}-06-01`
    p.holidayUntil = trainingDateAdd(p.holidayFrom, 13)
    if (calledUp) { p.nationalCampFrom = `${year}-07-01`; p.nationalCampUntil = `${year}-07-14` }
  }
  career.world.holidaysPlannedFor = career.seasonYear
}
