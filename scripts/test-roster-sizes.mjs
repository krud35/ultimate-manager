import assert from 'node:assert/strict'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'
import { buildDomesticWorldTemplate } from '../src/career/domesticWorld.js'
import { createFictionalTeams } from '../src/data/fictionalTeams.js'
import { getOverallRating } from '../src/models/playerStats.js'

// Exercise missing, partial, already sufficient and oversized imported rosters.
const league = DOMESTIC_LEAGUES.find(l => l.countryId === 'pl' && l.tier === 1)
const original = league.teams
const sizes = [0, 10, 20, 32]
league.teams = sizes.map(size => ({ ...original[0], id: `size-${size}`,
  rawPlayers: Array.from({ length: size }, (_, i) => ({ firstName: `Player${size}`, lastName: `Name${i}`, jersey: i + 1 })),
}))
const config = {
  leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, l === league ? 'playable' : 'off'])),
  international: { nationals: false, europe: false, paucc: false, aoucc: false, wucc: false },
}
try {
  const observed = new Set()
  for (let sample = 1; sample <= 20; sample++) {
    const seed = sample * 7919
    const { teams } = buildDomesticWorldTemplate(config, 2026, seed)
    const lengths = teams.map(t => t.players.length)
    assert(lengths[0] >= 16 && lengths[0] <= 29)
    observed.add(lengths[0])
    assert.deepEqual(lengths.slice(1), [16, 20, 32])
    const imported = teams[1].players.filter(p => p.domesticReference)
    const reserves = teams[1].players.filter(p => p.generatedReserve)
    assert.equal(reserves.length, 6)
    assert(Math.min(...imported.map(p => getOverallRating(p.skills))) > Math.max(...reserves.map(p => getOverallRating(p.skills))))
    for (let index = 1; index < sizes.length; index++) {
      assert.equal(teams[index].players.filter(p => p.domesticReference).length, sizes[index])
    }
    if (sample === 1) assert.deepEqual(buildDomesticWorldTemplate(config, 2026, seed).teams, teams)
    for (const team of createFictionalTeams(4, String(seed))) assert(team.players.length >= 16 && team.players.length <= 29)
  }
  assert(observed.size > 1, 'Missing roster sizes vary between seeds')
} finally {
  league.teams = original
}
console.log('Roster sizes: 16–29 generated, minimum 16 imported, larger rosters preserved, deterministic generation passed.')
