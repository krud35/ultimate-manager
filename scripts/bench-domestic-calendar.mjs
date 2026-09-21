/**
 * Isolate scheduler cost on identical fixture snapshots, without match/training work.
 * Baseline source is loaded from Git into memory; no checkout or source edits.
 * node --import ./scripts/register-world-tests.mjs scripts/bench-domestic-calendar.mjs
 */
import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { reconcileDomesticCalendar } from '../src/league/domesticCalendar.js'
import { createDomesticSeason } from '../src/career/domesticWorld.js'
import { initializeInternationalClubCups } from '../src/career/internationalClubCups.js'
import { DOMESTIC_LEAGUES } from '../src/data/domesticLeagues.js'

const baselineRef = process.argv[2] ?? '34bdbd4ec8f858088f917b9198be8ad3ad1e6a32'
const baselineSource = execFileSync('git', ['show', `${baselineRef}:src/league/domesticCalendar.js`], { encoding: 'utf8' })
  .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(`../src/league/${path}`, import.meta.url).href}'`)
const { reconcileDomesticCalendar: legacy } = await import(`data:text/javascript,${encodeURIComponent(baselineSource)}`)
const teams = DOMESTIC_LEAGUES.flatMap(l => l.teams.map((t, i) => ({
  ...t, reputation: 80 - i, players: Array.from({ length: 7 }, (_, j) => ({ id: `${t.id}-p${j}`, stats: {} })),
  finances: { transferBudget: 100000, salaryBudget: 1000 },
})))
const world = { teamsById: Object.fromEntries(teams.map(t => [t.id, t])), worldConfig: {
  leagues: Object.fromEntries(DOMESTIC_LEAGUES.map(l => [l.id, 'playable'])),
  international: { nationals: false, europe: true, paucc: true, aoucc: true, wucc: true }, christmasBreak: true,
} }
const league = createDomesticSeason(world, teams[0].id, 2026, 20260921)
initializeInternationalClubCups({ league, world, seasonYear: 2026, playerTeamId: teams[0].id })
reconcileDomesticCalendar(league)
// Roster copying is unnecessary: neither scheduler reads players or finances.
const snapshot = structuredClone({ ...league, teamsById: undefined,
  otherLeagues: league.otherLeagues.map(c => ({ ...c, teamsById: undefined })),
})
const measure = fn => {
  const copy = structuredClone(snapshot)
  const runs = []
  for (let i = 0; i < 30; i++) {
    copy.currentDate = `2026-08-${String(i + 1).padStart(2, '0')}`
    // Account for played games without involving the match engine in this timing.
    for (const comp of [copy, ...copy.otherLeagues]) for (const f of comp.fixtures) {
      if (f.date < copy.currentDate) f.status = 'completed'
    }
    const start = performance.now()
    const result = fn(copy)
    runs.push({ ms: performance.now() - start, checked: result?.checked ?? true })
  }
  return { totalMs: runs.reduce((sum, r) => sum + r.ms, 0), schedulingPasses: runs.filter(r => r.checked).length }
}
const pairs = []
for (let i = 0; i < 3; i++) {
  // Alternate order to limit warmup/order bias.
  let before, after
  if (i % 2) { after = measure(reconcileDomesticCalendar); before = measure(legacy) }
  else { before = measure(legacy); after = measure(reconcileDomesticCalendar) }
  pairs.push({ before, after })
  console.log(`Pair ${i + 1}: before ${before.totalMs.toFixed(1)} ms; after ${after.totalMs.toFixed(1)} ms`)
}
const mean = key => pairs.reduce((sum, p) => sum + p[key].totalMs, 0) / pairs.length
const report = {
  baselineRef, generatedAt: new Date().toISOString(), node: process.version,
  leagues: 1 + league.otherLeagues.length, teams: teams.length,
  fixtures: [league, ...league.otherLeagues].reduce((n, c) => n + c.fixtures.length, 0),
  days: 30, pairs, beforeMeanMs: mean('before'), afterMeanMs: mean('after'),
  speedup: mean('before') / mean('after'),
  note: 'Scheduler only, identical snapshots, no new rounds in timed window. Includes daily constraint detection; excludes match simulation, training, UI and saves.',
}
const output = resolve('artifacts/performance-2026-09-21')
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'domestic-calendar-comparison.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
