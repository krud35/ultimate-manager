import assert from 'node:assert/strict'
import { createCareer } from '../src/career/careerModel.js'
import { computeCalendarDayStep } from '../src/career/calendarSimulation.js'
import { loadSaveStore, saveCareerNow } from '../src/career/saveStore.js'
import { updatePlayingStyles } from '../src/career/playingStyleDevelopment.js'
import { replacePlayerTraits } from '../src/models/playerTraits.js'

const data = new Map()
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
}
let career = createCareer(0, { competition: 'eucs', playerTeamId: 'eucs-mooncatchers', seasonYear: 2026 })
const player = career.world.teamsById[career.playerTeamId].players[0]
replacePlayerTraits(player, ['loyal', 'huck_lover'])
const date = career.league.currentDate
const oldDate = new Date(Date.parse(date) - 84 * 86400000).toISOString().slice(0, 10)
updatePlayingStyles(player, oldDate, career.seasonYear)
player.playingStyleDevelopment.candidates.under_cutter = { progress: 100, first: oldDate, matches: 10 }
player.playingStyleDevelopment.memory.deep_threat = true
player.playingStyleMatches = [{ key: 'integration', date, evidence: { modes: { full: {
  observed: ['cutStarts', 'underCuts'], counters: { cutStarts: 20, underCuts: 20 },
} } } }]
const result = computeCalendarDayStep(career, career.league)
career = { ...career, ...result }
assert(player.traits.includes('under_cutter'))
const messages = career.inbox.filter(m => m.payload?.kind === 'playing_style')
assert.equal(messages.length, 1)
const expected = structuredClone({ traits: player.traits, state: player.playingStyleDevelopment, history: player.playingStyleMatches })
saveCareerNow(career)
const loaded = loadSaveStore().slots[0]
const restored = loaded.world.teamsById[career.playerTeamId].players.find(p => p.id === player.id)
assert.deepEqual({ traits: restored.traits, state: restored.playingStyleDevelopment, history: restored.playingStyleMatches }, expected)
assert.deepEqual(updatePlayingStyles(restored, date, career.seasonYear), [])
assert.equal(loaded.league.teamsById[career.playerTeamId].players.find(p => p.id === player.id), restored)
assert.equal(loaded.inbox.filter(m => m.payload?.kind === 'playing_style').length, 1)
console.log('Real calendar acquisition, inbox, compressed save/load, shared roster and replay protection passed')
