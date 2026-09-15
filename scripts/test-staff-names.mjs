import assert from 'node:assert/strict'
import { generateStaffName } from '../src/career/staffNames.js'
import { ensureClubStaff, staffMarket } from '../src/career/clubStaff.js'
import source from '../src/data/staffNameSources.json' with { type: 'json' }

assert.equal(new Set(source.teams.map(t => t.division)).size, 4)
assert(source.teams.every(t => /^(Great )?Grand Master (Open|Women's)$/.test(t.division)))
assert(source.teams.flatMap(t => t.players).length > 1000)
for (const country of ['United States', 'Poland', undefined]) {
  const names = Array.from({ length: 2000 }, (_, i) => generateStaffName(`team-${i}-chiefScout-legacy`, country))
  const unique = new Set(names).size
  assert(unique > 1940, `${country}: only ${unique}/2000 unique names`)
  assert.deepEqual(names, names.map((_, i) => generateStaffName(`team-${i}-chiefScout-legacy`, country)))
  console.log(`${country ?? 'Global'}: ${unique}/2000 unique names; deterministic replay passed`)
}
const first = generateStaffName('collision', 'Poland')
assert.notEqual(generateStaffName('collision', 'Poland', [first]), first)
const team = { id: 'migration', country: 'Poland', staff: { youthCoach: 1 }, staffMembers: {
  youthCoach: { id: 'migration-youthCoach-legacy', name: 'Alex Miller', weeklyWage: 300, expiresOn: '2027-07-31', skills: { coaching: 8 } },
  analyst: { id: 'custom', name: 'Custom Person', weeklyWage: 500 },
} }
const before = structuredClone(team.staffMembers.youthCoach)
ensureClubStaff(team)
assert.notEqual(team.staffMembers.youthCoach.name, before.name)
assert.equal(team.staffMembers.youthCoach.weeklyWage, before.weeklyWage)
assert.equal(team.staffMembers.youthCoach.expiresOn, before.expiresOn)
assert.deepEqual(team.staffMembers.youthCoach.skills, before.skills)
assert.equal(team.staffMembers.analyst.name, 'Custom Person')
const saved = JSON.parse(JSON.stringify(team))
ensureClubStaff(saved)
assert.deepEqual(saved, team)
const market = staffMarket(team, 'assistantCoach', '2026-09-15')
assert.equal(new Set(market.map(p => p.name)).size, 3)
assert.deepEqual(staffMarket(saved, 'assistantCoach', '2026-09-30'), market)
assert.notDeepEqual(staffMarket(saved, 'assistantCoach', '2026-10-01'), market)
console.log('Source coverage, collisions, legacy migration, save/load and monthly market passed')
