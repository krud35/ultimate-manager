import { createCareer } from '../src/career/careerModel.js'
import { getOverallRating } from '../src/models/playerStats.js'

// Isolate from localStorage in node
globalThis.localStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null
  },
  setItem(k, v) {
    this._d[k] = String(v)
  },
  removeItem(k) {
    delete this._d[k]
  },
}

const c = createCareer(0, {
  managerName: 'Test',
  playerTeamId: 'toronto-rush',
  seasonYear: 2013,
  rosterMode: 'historical',
})

console.log(
  'career',
  c.seasonYear,
  c.rosterMode,
  c.usedFictionalFill,
  c.world.teamIds.length,
  c.league.teamIds.length,
)
const fic = c.world.teamIds.filter((id) => c.world.teamsById[id].isFictional)
console.log('fictional', fic)
const team = c.world.teamsById['toronto-rush']
console.log(
  'TOR players',
  team.players.length,
  'sample OVR',
  getOverallRating(team.players[0].skills),
  'traits',
  team.players[0].traits?.length,
)
console.log('ok')
