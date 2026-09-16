import assert from 'node:assert/strict'
import { createCareer } from '../src/career/careerModel.js'
import { createManagerProfile } from '../src/career/managerProfiles.js'
import { eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { loadSaveStore } from '../src/career/saveStore.js'

const data = new Map()
globalThis.localStorage = { getItem: k => data.get(k) ?? null,
  setItem: (k, value) => data.set(k, String(value)), removeItem: k => data.delete(k) }
const profile = createManagerProfile({ firstName: 'Test', lastName: 'EUCS', age: 30, nationality: 'pl', formerPlayer: 'amateur' })
const playerTeamId = eucsTeamsForTier(2)[0].id
const career = createCareer(0, { competition: 'eucs', playerTeamId, seasonYear: 2026,
  managerName: 'Test EUCS', managerProfile: profile,
  worldConfig: { leagues: { 'pl-1': 'playable' }, international: { nationals: false, europe: true, wucc: true } },
})
assert.equal(career.competition, 'eucs')
assert.equal(career.pyramid.tier, 2)
assert.equal(career.world.teamIds.length, 48)
assert(career.world.teamIds.every(id => id.startsWith('eucs-')))
assert.equal(career.league.otherLeagues.length, 2)
assert.equal(career.league.eucsPyramid.tier1Ids.length, 16)
assert.equal(career.league.eucsPyramid.tier2Ids.length, 16)
assert.equal(career.league.eucsPyramid.tier3Ids.length, 16)
assert.equal(career.world.worldConfig.leagues, undefined)
assert(Object.values(career.world.worldConfig.international).every(value => value === false))
assert.equal(career.managerProfile.id, profile.id)
assert.equal(career.world.teamsById[playerTeamId].managerId, profile.id)
assert.equal(career.nationalTeams.finals, null)
const loaded = loadSaveStore().slots[0]
assert.equal(loaded.competition, 'eucs')
assert.equal(loaded.playerTeamId, playerTeamId)
assert.equal(loaded.managerProfile.id, profile.id)
assert.deepEqual(loaded.world.worldConfig, career.world.worldConfig)
console.log('EUCS game mode: separate 48-club pyramid, manager profile, isolated competitions and save/load passed.')
