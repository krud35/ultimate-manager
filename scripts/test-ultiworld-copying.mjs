// node --import ./scripts/register-world-tests.mjs scripts/test-ultiworld-copying.mjs [--bench]
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const url = new URL('../src/career/ultiworld.js', import.meta.url).href
const baselineRef = 'a671fcba'
const baseline = execFileSync('git', ['show', `${baselineRef}:src/career/ultiworld.js`], { encoding: 'utf8' })
registerHooks({
  load(specifier, context, nextLoad) {
    if (specifier === url || specifier === `${url}?baseline`) {
      const source = specifier === url ? readFileSync(new URL(url), 'utf8') : baseline
      return { format: 'module', shortCircuit: true, source: source + '\nexport { WORLD_EVENTS, runWorldEventArticle };\n' }
    }
    return nextLoad(specifier, context)
  },
})
const current = await import(url)
const previous = await import(`${url}?baseline`)
const { createUltiworldEventChanges } = await import('../src/career/ultiworldEventChanges.js')

function career(teamCount = 4, rosterSize = 8, historySize = 2) {
  const teamsById = Object.fromEntries(Array.from({ length: teamCount }, (_, i) => {
    const id = `t${i}`
    return [id, { id, name: `Club ${i}`, managementDate: '2026-09-01',
      finances: { cash: 1000000, transferBudget: 1000000, salaryBudget: 1000000 },
      players: Array.from({ length: rosterSize }, (_, n) => ({
        id: `${id}p${n}`, firstName: 'Player', lastName: `${id}-${n}`, age: 20 + n,
        skills: { throwing: 70 + n, catching: 70, speed: 70, defense: 70, vision: 70, spirit: 70 },
        potential: 90, morale: 70, form: 70,
        injury: n === 0 ? { daysRemaining: 8, label: 'skręcenie', source: 'match' } : null,
        contract: { weeklyWage: 500, weeksRemaining: 40, weeksTotal: 52, bonuses: [], promises: [] },
      })),
    }]
  }))
  const history = Array.from({ length: historySize }, (_, i) => ({ id: `past${i}`, date: '2026-08-20',
    boxScore: Array.from({ length: 46 }, (_, n) => ({ playerId: `p${n}`, goals: n % 3, assists: n % 4, blocks: 1, turnovers: 2 })),
  }))
  return {
    id: 'uw-copy-regression', seasonIndex: 1, seasonYear: 2026, playerTeamId: 't0',
    world: { teamsById, teamIds: Object.keys(teamsById), freeAgents: [] },
    league: { currentDate: '2026-09-01', calendar: { seasonYear: 2026 }, teamsById,
      teamIds: Object.keys(teamsById), playerStats: {}, standings: {}, totalRounds: 0,
      fixtures: [{ id: 'next', homeTeamId: 't0', awayTeamId: 't1', date: '2026-09-05', status: 'scheduled', competition: 'league' },
        { id: 'later', homeTeamId: 't2', awayTeamId: 't3', date: '2026-09-12', status: 'scheduled', competition: 'league' }],
      matchHistory: history,
      otherLeagues: [{ id: 'other', teamsById, fixtures: [], matchHistory: history }],
    },
    ultiworld: { seeded: true, transferNewsSeeded: true, articles: [], coveredFixtureIds: [], lastPomMonth: '2026-09', lastPowerRankingMonth: '2026-09' },
    transferLog: [], loanLog: [],
  }
}
function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freeze(child, seen)
  return Object.freeze(value)
}
function cleanMessage(message) {
  if (!message) return message
  const { id, createdAt, ...rest } = message
  return rest
}
function run(module, id, c, seed) {
  const inbox = []
  const result = module.runWorldEventArticle(module.WORLD_EVENTS.find(e => e.id === id), c, c.world, c.league, c.league.currentDate, rng(Math.imul(seed, 2654435761)), inbox)
  for (const message of inbox) assert.equal(message.payload.articleId, result.article.id)
  return { ...result, article: cleanMessage(result.article), inbox: inbox.map(message => ({
    ...cleanMessage(message), payload: { ...message.payload, articleId: '<generated-article-id>' },
  })) }
}
function comparable(result) {
  // The old version left other leagues on a stale roster clone. Compare gameplay
  // values through the canonical world; separately assert fresh references below.
  return { ...result, league: { ...result.league, otherLeagues: result.league.otherLeagues?.map(({ teamsById, ...rest }) => rest) } }
}
const effects = current.WORLD_EVENTS.filter(e => e.impact)
assert.equal(effects.length, 13)
let comparisons = 0
for (const event of effects) {
  let produced = 0
  for (const variant of ['normal', 'unemployed', 'empty-rosters', 'legacy-finances']) {
    const c = career()
    if (variant === 'unemployed') c.playerTeamId = null
    if (variant === 'empty-rosters') for (const t of Object.values(c.world.teamsById)) t.players = []
    if (variant === 'legacy-finances') for (const t of Object.values(c.world.teamsById)) delete t.finances
    const original = structuredClone(c)
    freeze(c)
    for (let seed = 1; seed <= 12; seed++) {
      const expected = run(previous, event.id, c, seed)
      const actual = run(current, event.id, c, seed)
      assert.deepEqual(comparable(actual), comparable(expected), `${event.id}, ${variant}, ${seed}`)
      assert.deepEqual(c, original, 'input career must remain unchanged')
      assert.equal(actual.league.teamsById, actual.world.teamsById)
      for (const other of actual.league.otherLeagues) assert.equal(other.teamsById, actual.world.teamsById)
      assert.equal(actual.league.matchHistory, c.league.matchHistory)
      assert.equal(actual.world.freeAgents, c.world.freeAgents)
      const changed = Object.keys(c.world.teamsById).filter(id => actual.world.teamsById[id] !== c.world.teamsById[id])
      assert(changed.length <= 1, 'at most the affected club is copied')
      if (event.id === 'postponed_match') {
        assert.equal(actual.world, c.world)
        assert.equal(actual.league.fixtures.filter((f, i) => f !== c.league.fixtures[i]).length, 1)
      } else assert.equal(actual.league.fixtures, c.league.fixtures)
      if (variant === 'normal' && actual.article) produced++
      comparisons++
    }
  }
  assert(produced > 0, `${event.id}: must exercise a real effect`)
  console.log(`OK ${event.id}: effects, articles, inbox, immutability and shared references`)
}

// No effect / no fixture requires no copies; repeated edits must keep the same club.
{
  const c = freeze(career())
  const changes = createUltiworldEventChanges(c.world, c.league)
  assert.equal(changes.team(null), null)
  assert.equal(changes.fixture(null), null)
  assert.equal(changes.world, c.world)
  assert.equal(changes.league, c.league)
  const one = changes.team(c.world.teamsById.t0)
  assert.equal(changes.team(c.world.teamsById.t0), one)
  changes.team(c.world.teamsById.t1)
  assert.equal(changes.league.otherLeagues[0].teamsById, changes.world.teamsById)
  assert.equal(changes.world.teamsById.t0, one)
}
{
  const c = career()
  c.league.fixtures = []
  freeze(c)
  const result = run(current, 'postponed_match', c, 1)
  assert.equal(result.article, null)
  assert.equal(result.world, c.world)
  assert.equal(result.league, c.league)
}
{
  const c = career()
  c.league.otherLeagues = [
    { id: 'detached', teamsById: structuredClone(c.world.teamsById) },
    { id: 'subset', teamsById: { t0: c.world.teamsById.t0 } },
    { id: 'unaffected', teamsById: { t2: c.world.teamsById.t2 } },
    { id: 'not-loaded' },
  ]
  freeze(c)
  const result = run(current, 'cash_injection', c, 1)
  for (const other of result.league.otherLeagues.slice(0, 2)) {
    assert.equal(other.teamsById.t0, result.world.teamsById.t0)
  }
  assert.deepEqual(Object.keys(result.league.otherLeagues[1].teamsById), ['t0'])
  assert.equal(result.league.otherLeagues[2], c.league.otherLeagues[2])
  assert.equal(result.league.otherLeagues[3], c.league.otherLeagues[3])
}
console.log(`PASS: ${comparisons} baseline comparisons across all ${effects.length} impact events`)

if (process.argv.includes('--bench')) {
  const c = career(604, 23, 2000)
  // Large synthetic snapshot, deliberately retaining shared roster/history refs.
  c.league.fixtures.push(...Array.from({ length: 9500 }, (_, i) => ({
    id: `played${i}`, homeTeamId: 't2', awayTeamId: 't3', status: 'completed', date: '2026-08-20', homeScore: 15, awayScore: 10,
  })))
  c.league.otherLeagues = Array.from({ length: 37 }, (_, i) => ({ id: `other${i}`, teamsById: c.world.teamsById, fixtures: [], matchHistory: [] }))
  const rows = []
  for (const event of effects) {
    const samples = { before: [], after: [] }
    for (const module of [previous, current]) run(module, event.id, c, 1)
    for (let repeat = 0; repeat < 3; repeat++) {
      const order = repeat % 2 ? [['after', current], ['before', previous]] : [['before', previous], ['after', current]]
      for (const [label, module] of order) {
        const start = performance.now()
        run(module, event.id, c, repeat + 1)
        samples[label].push(performance.now() - start)
      }
    }
    const mean = list => list.reduce((a, b) => a + b, 0) / list.length
    rows.push({ event: event.id, beforeMs: mean(samples.before), afterMs: mean(samples.after), samples })
    console.log(`${event.id}: ${rows.at(-1).beforeMs.toFixed(2)} -> ${rows.at(-1).afterMs.toFixed(2)} ms`)
  }
  const total = key => rows.reduce((sum, row) => sum + row[key], 0)
  const report = { baselineRef, generatedAt: new Date().toISOString(), node: process.version,
    note: 'Synthetic snapshot: 604 clubs x 23 players, 9502 fixtures, 2000 match records x 46 box-score rows, 38 leagues. Isolated event handler; not a new five-season run. Three alternating paired samples after warmup.',
    comparisons, rows, beforeMs: total('beforeMs'), afterMs: total('afterMs'), speedup: total('beforeMs') / total('afterMs') }
  mkdirSync('artifacts/ultiworld-optimization', { recursive: true })
  writeFileSync('artifacts/ultiworld-optimization/results.json', JSON.stringify(report, null, 2) + '\n')
  console.log(`Event mix: ${report.beforeMs.toFixed(2)} -> ${report.afterMs.toFixed(2)} ms (${report.speedup.toFixed(1)}x)`)
}
