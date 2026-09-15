import { writeFile } from 'node:fs/promises'
import { ACADEMY_COUNTRIES } from '../src/data/academyScoutGeography.js'

const base = 'https://wjuc.wfdf.sport/'
async function get(entity, id) {
  const response = await fetch(`${base}index.php?view=live/api&entity=${entity}${id == null ? '' : `&id=${id}`}`)
  if (!response.ok) throw new Error(`WJUC ${entity}: HTTP ${response.status}`)
  return response.json()
}
const aliases = { Czechia: 'Czech Republic', 'United States of America': 'United States', 'United Kingdom': 'Great Britain', 'Chinese Taipei': 'Taiwan', 'Republic of China': 'Taiwan', 'Republic of Korea': 'South Korea' }
const ref = await get('reference')
const division = ref.series.find(s => s.name === 'Open')
if (!division) throw new Error('Missing Open division')
const countries = new Map(ref.countries.map(c => [c.country_id, c]))
const selected = ref.teams.filter(t => t.series === division.series_id && countries.get(t.country)?.abbreviation !== 'ISR' && countries.get(t.country)?.name !== 'Israel')
const teams = []
for (const team of selected) {
  const detail = await get('teams', team.team_id)
  const country = aliases[detail.countryname] ?? detail.countryname
  const countryId = Object.keys(ACADEMY_COUNTRIES).find(id => ACADEMY_COUNTRIES[id].nameEn === country || ACADEMY_COUNTRIES[id].labelEn === country)
  if (!countryId) throw new Error(`Unmapped country: ${country}`)
  const players = detail.players.map(p => ({ sourcePlayerId: p.player_id, firstName: p.firstname.trim().normalize('NFC'), lastName: p.lastname.trim().normalize('NFC'), jersey: p.num, games: p.games, goals: p.done, assists: p.fedin }))
  if (!players.length || players.some(p => !p.firstName || !p.lastName)) throw new Error(`Incomplete roster: ${team.name}`)
  teams.push({ sourceTeamId: team.team_id, countryId, country, players })
}
await writeFile(new URL('../src/data/wjucJuniors.json', import.meta.url), JSON.stringify({
  source: `${base}teams/division/open`, event: 'WJUC 2026', division: 'Open', excludedTeams: ['Israel'], retrievedOn: new Date().toISOString().slice(0, 10),
  note: 'Real names, national teams, jersey numbers and tournament statistics. In-game age (16–18 at introduction), skills and potential are generated; dates of birth are not supplied by this source. Introduced once per career, not once per scouting mission or season.', teams,
}, null, 2) + '\n')
console.log(`Imported ${teams.length} countries, ${teams.reduce((n, t) => n + t.players.length, 0)} juniors`)
