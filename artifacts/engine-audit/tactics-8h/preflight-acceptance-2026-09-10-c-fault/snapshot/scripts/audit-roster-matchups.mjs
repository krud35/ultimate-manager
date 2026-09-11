import { mkdirSync, writeFileSync } from 'node:fs'
import { buildEucsLeagueTemplate } from '../src/data/eucsLeagueTeams.js'
import { getOverallRating, scaleSkillsToTargetOvr } from '../src/models/playerStats.js'
import { PLAYER_ARCHETYPES } from '../src/models/playerArchetypes.js'
import { simulateMatch } from '../src/matchEngine/matchSession.js'

const strength = t => t.players.reduce((s, p) => s + getOverallRating(p.skills), 0) / t.players.length
const tiers = Object.fromEntries([1, 2, 3].map(tier => [tier, buildEucsLeagueTemplate({ tier, seed: 137 }).teams.sort((a, b) => strength(b) - strength(a))]))
const rows = []
function compare(label, teamA, teamB, seeds, fastMode = true) {
  let winsA = 0, totalMargin = 0
  for (const seed of seeds) for (const reverse of [false, true]) {
    const result = simulateMatch({ homeTeam: structuredClone(reverse ? teamB : teamA), awayTeam: structuredClone(reverse ? teamA : teamB),
      seed, fastMode, wind: { speedMph: 0, directionDeg: 0 }, windLocked: true,
      aiHome: false, aiAway: false, rotateHome: false, rotateAway: false })
    const margin = (result.homeScore - result.awayScore) * (reverse ? -1 : 1)
    winsA += margin > 0 ? 1 : 0
    totalMargin += margin
  }
  const row = { label, mode: fastMode ? 'fast' : 'spatial', games: seeds.length * 2,
    winsA, meanMarginA: totalMargin / (seeds.length * 2) }
  rows.push(row)
  console.log(JSON.stringify(row))
}
for (const [higher, lower] of [[1, 2], [2, 3]]) {
  compare(`weak tier ${higher} vs strong tier ${lower}`, tiers[higher].at(-1), tiers[lower][0], [19, 101, 211, 307])
  compare(`weak tier ${higher} vs strong tier ${lower}`, tiers[higher].at(-1), tiers[lower][0], [101], false)
}

// Stress test, not a recommended lineup: homogeneous skill profiles at OVR 81,
// neutral traits, identical roster size and no AI tactical adaptation.
const pool = tiers[1].flatMap(t => t.players)
function archetypeTeam(type, idBase) {
  const sources = pool.filter(p => p.archetype === type)
  const team = structuredClone(tiers[1][7])
  team.id = `audit-${type}-${idBase}`
  team.name = type
  team.players = team.players.slice(0, 21).map((p, i) => ({ ...p, id: idBase + i,
    traits: [], archetype: type, age: 25, skills: scaleSkillsToTargetOvr(sources[i % sources.length].skills, 81) }))
  return team
}
for (const type of Object.keys(PLAYER_ARCHETYPES)) {
  compare(`${type} vs all_rounder, OVR 81`, archetypeTeam(type, 600000), archetypeTeam('all_rounder', 700000), [19, 101])
}
mkdirSync('artifacts/roster-model', { recursive: true })
writeFileSync('artifacts/roster-model/matchups.json', JSON.stringify(rows, null, 2))
