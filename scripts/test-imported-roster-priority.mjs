import assert from 'node:assert/strict'
import { applyClubOvrDistribution } from '../src/data/eucsRosterBalance.js'
import { rollRandomSkillsForRoster } from '../src/data/randomRosterSkills.js'
import { assignRosterArchetypes } from '../src/models/playerArchetypes.js'
import { getOverallRating } from '../src/models/playerStats.js'
import { createRng } from '../src/matchEngine/rng.js'

for (const realCount of [1, 7, 15]) for (const strength of [65, 71, 81, 85]) {
  for (const roll of [0, 0.01, 0.1, 0.19, 0.26, 0.4, 0.6, 0.8, 0.9, 0.99]) {
    const players = Array.from({ length: 16 }, (_, id) => ({ id, generatedReserve: id >= realCount }))
    rollRandomSkillsForRoster(players, 'source-priority')
    const rng = createRng(7919), coverage = { level: 'complete', gaps: [] }
    assignRosterArchetypes(players, 1, () => rng.float(), coverage)
    // Make generated reserves more talented to challenge the source priority.
    players.forEach(p => { p.generationTalent = p.generatedReserve ? 1 : 0 })
    applyClubOvrDistribution(players, { tier: 1, strength, rng: () => roll, coverage })
    const real = players.filter(p => !p.generatedReserve), reserves = players.filter(p => p.generatedReserve)
    assert(Math.min(...real.map(p => getOverallRating(p.skills))) > Math.max(...reserves.map(p => getOverallRating(p.skills))))
    assert(reserves.every(p => p.generationClass === 'regular' && getOverallRating(p.skills) < 90))
  }
}
// Completely fictional rosters retain their own leaders and exceptional players.
const players = Array.from({ length: 16 }, (_, id) => ({ id, generatedReserve: true }))
rollRandomSkillsForRoster(players, 'fully-fictional')
applyClubOvrDistribution(players, { tier: 1, strength: 81, rng: () => 0 })
assert(players.every(p => getOverallRating(p.skills) >= 93))
console.log('Imported names always lead reserves: all profiles, exceptional draws, OVR floor, role coverage and fully fictional rosters passed.')
