import { writeFile } from 'node:fs/promises'

const base = 'https://results.wfdf.sport/wmucc-2026/'
async function get(entity, id) {
  const url = `${base}index.php?view=live/api&entity=${entity}${id == null ? '' : `&id=${id}`}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.json()
}
const reference = await get('reference')
const divisions = reference.series.filter(s => /^(Great )?Grand Master (Open|Women's)$/.test(s.name))
if (divisions.length !== 4) throw new Error('Expected four GM/GGM Open and Women divisions')
const teams = []
for (const team of reference.teams.filter(t => divisions.some(s => s.series_id === t.series))) {
  const detail = await get('teams', team.team_id)
  const players = detail.players.map(p => ({ firstName: p.firstname.trim().normalize('NFC'), lastName: p.lastname.trim().normalize('NFC') }))
    .filter(p => p.firstName && p.lastName)
  if (!players.length) throw new Error(`Empty roster: ${team.name}`)
  teams.push({ id: team.team_id, name: team.name, division: detail.seriesname, country: detail.countryname, players })
}
const data = { source: base, retrievedOn: new Date().toISOString().slice(0, 10),
  note: 'Public GM/GGM Open and Women rosters. Names are recombined for fictional staff; club country is not player nationality. Staff ages, skills and jobs are generated, not biographical facts.', teams }
await writeFile(new URL('../src/data/staffNameSources.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`)
console.log(`Imported ${teams.length} teams, ${teams.reduce((n,t) => n + t.players.length, 0)} names`)
