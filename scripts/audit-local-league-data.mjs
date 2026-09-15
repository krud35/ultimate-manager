import { readFile, writeFile } from 'node:fs/promises'

const files = ['usau/usauRealRosters.json', 'cuc/cucRealRosters.json', 'buoc/buocRealRosters.json', 'psgu/psguRealRosters.json', 'eucs/eucsRealRosters.json']
const read = async file => JSON.parse(await readFile(new URL(`../src/data/${file}`, import.meta.url), 'utf8'))
const rosters = []
for (const file of files) {
  const data = await read(file)
  const seen = new Map(), repeatedNames = []
  let players = 0
  for (const [teamId, team] of Object.entries(data.teams)) {
    for (const player of team.players) {
      players++
      const key = `${player.firstName} ${player.lastName}`.normalize('NFC').toLowerCase()
      if (seen.has(key) && seen.get(key) !== teamId) repeatedNames.push({ name: key, teams: [seen.get(key), teamId] })
      else seen.set(key, teamId)
    }
  }
  rosters.push({ file: `src/data/${file}`, teams: Object.keys(data.teams).length, players, repeatedNames })
}
const catalog = await read('world/worldLeagueTeams.json')
const leagues = Object.entries(catalog.leagues).map(([id, league]) => ({ id, country: league.country, teams: Object.values(league.tiers).flat().length }))
const report = { checkedAt: new Date().toISOString(), rosters, leagues,
  notes: [
    'Counts are roster entries, not unique people. Repeated full names across clubs require review; this is not proof of identical people.',
    'The new domestic data files currently have no imports in the game source. Presence on disk does not mean playable domestic leagues are implemented.',
    'worldLeagueTeams.json contains club lists, not complete player rosters. Some entries combine countries and require mapping to the planned national league structure.',
  ] }
await writeFile(new URL('../docs/local-league-data-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ rosters: rosters.map(({ file, teams, players, repeatedNames }) => ({ file, teams, players, repeatedNames: repeatedNames.length })), catalogs: leagues.length, catalogTeams: leagues.reduce((n, l) => n + l.teams, 0) }, null, 2))
