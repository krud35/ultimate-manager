/** Five real career seasons, with in-memory timing hooks; no production source edits.
 * node --max-old-space-size=10000 --import ./scripts/register-world-tests.mjs scripts/bench-five-seasons.mjs
 */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus, totalmem } from 'node:os'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')))
const years = Number(args.years ?? 5)
const dayLimit = Number(args.days ?? 400)
const output = resolve(args.out ?? 'artifacts/five-seasons-2026-09-21')
mkdirSync(output, { recursive: true })
const hooks = {
  '/src/league/domesticCalendar.js': ['reconcileDomesticCalendar'],
  '/src/league/leagueEngine.js': ['simulateFixtureMatch', 'simulateAdHocMatch', 'applyMatchResultToLeague'],
  '/src/league/quickMatch.js': ['backgroundMatch'],
  '/src/matchEngine/matchSession.js': ['simulateMatch'],
  '/src/career/playerDevelopment.js': ['applyDailyDevelopment'],
  '/src/career/teamTraining.js': ['processTeamTrainingsForDate'],
  '/src/career/ultiworld.js': ['processUltiworldTick'],
}
const sourceHashes = {}
registerHooks({ load(url, context, next) {
  const loaded = next(url, context)
  const key = Object.keys(hooks).find(path => url.endsWith(path))
  const storage = url.endsWith('/src/career/saveStore.js')
  if (!key && !storage) return loaded
  let source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8')
  sourceHashes[key ?? '/src/career/saveStore.js'] = createHash('sha256').update(source).digest('hex')
  for (const name of hooks[key] ?? []) {
    const declaration = `export function ${name}(`
    assert(source.includes(declaration), `Missing instrumentation target: ${name}`)
    source = source.replace(declaration, `function __bench_${name}(`)
    source += `\nexport function ${name}(...args) { return globalThis.__fiveSeasonBench.invoke('${name}', __bench_${name}, this, args) }\n`
  }
  if (storage) {
    assert(source.includes('function persistStore('))
    source = source.replace('function persistStore(', 'function __bench_disabled_persistStore(')
    source += '\nfunction persistStore() { globalThis.__fiveSeasonBench.suppressedSaves++ }\n'
  }
  return { ...loaded, source }
} })

function blank() { return { calls: 0, ms: 0, selfMs: 0, maxMs: 0, samples: [] } }
const monitor = {
  stage: 'create', date: null, playerTeamId: null, rows: {}, stack: [], suppressedSaves: 0,
  calendarPasses: [],
  invoke(name, fn, receiver, params) {
    if (name === 'simulateMatch') assert.equal(params[0].fastMode, true, 'Every engine match must use fastMode')
    const frame = { childMs: 0 }, start = performance.now()
    this.stack.push(frame)
    let result
    try { result = fn.apply(receiver, params); return result }
    finally {
      const ms = performance.now() - start
      this.stack.pop()
      if (this.stack.length) this.stack.at(-1).childMs += ms
      const row = this.rows[name] ??= blank()
      row.calls++; row.ms += ms; row.selfMs += ms - frame.childMs; row.maxMs = Math.max(row.maxMs, ms); row.samples.push(ms)
      if (name === 'reconcileDomesticCalendar' && result?.checked) this.calendarPasses.push({ stage: this.stage, date: this.date, ms, moved: result.moved })
      if (name === 'simulateMatch' && this.playerTeamId && [params[0].homeTeam.id, params[0].awayTeam.id].includes(this.playerTeamId)) {
        const player = this.rows.playerFast ??= blank()
        player.calls++; player.ms += ms; player.selfMs += ms; player.maxMs = Math.max(player.maxMs, ms); player.samples.push(ms)
      }
      if (name === 'backgroundMatch' && this.playerTeamId) {
        assert(![params[1].homeTeamId, params[1].awayTeamId].includes(this.playerTeamId), 'Player match must use fast, not background approximation')
      }
    }
  },
}
globalThis.__fiveSeasonBench = monitor
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }

const { createCareer, finalizeSeason, startNextSeason } = await import('../src/career/careerModel.js')
const { advanceCareerDay } = await import('../src/career/calendarSimulation.js')
const { resolveWatchableFinalIgnore } = await import('../src/career/watchableFinals.js')
const { managerJobOffers, acceptManagerJob } = await import('../src/career/managerCareer.js')
const { DOMESTIC_LEAGUES, defaultWorldConfig, normalizeWorldConfig } = await import('../src/data/domesticLeagues.js')
const { createRng } = await import('../src/matchEngine/rng.js')
Math.random = createRng(20260921).float
const worldConfig = normalizeWorldConfig({ ...defaultWorldConfig(), simulationModel: 'focused', mainCountryId: 'pl', additionalCountryIds: [] })
const club = DOMESTIC_LEAGUES.find(l => l.countryId === 'pl' && l.tier === 1).teams[0]
const report = {
  startedAt: new Date().toISOString(), status: 'running', requestedSeasons: years,
  environment: { node: process.version, cpu: cpus()[0].model, ramGiB: totalmem() / 2 ** 30,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingChanges: execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n'), sourceHashes },
  config: worldConfig, startingClub: { id: club.id, name: club.name }, seasons: [], transitions: [], decisions: [], managerEvents: [],
  notes: [
    'Real advanceCareerDay + finalizeSeason + startNextSeason, one continuous generated career, all competitions enabled by the focused Poland default.',
    'All engine matches, including the player club, must use fastMode=true; background leagues retain their standard simplified match model.',
    'Source hooks add timers only. Persistence/compression is disabled in memory; user saves and production source files are untouched.',
    'Node headless, no UI, no disk saves. Random events disabled as in fast-forward; training, development, finance, transfers, news and national teams run normally.',
    'Watchable finals are resolved with the existing Ignore action; after dismissal, the first available job is accepted automatically.',
    'Inclusive times overlap; selfMs subtracts nested instrumented calls. playerFast is a subset of simulateMatch and must not be added twice.',
  ],
}
function summarized(rows = monitor.rows) {
  return Object.fromEntries(Object.entries(rows).map(([name, row]) => {
    const sorted = [...row.samples].sort((a, b) => a - b)
    const { samples: _samples, ...rest } = row
    return [name, { ...rest, meanMs: row.ms / row.calls, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] }]
  }))
}
function save() {
  report.updatedAt = new Date().toISOString()
  report.suppressedSaves = monitor.suppressedSaves
  report.peakRssMiB = process.resourceUsage().maxRSS / 1024
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
}
function reset(stage) { monitor.stage = stage; monitor.rows = {}; monitor.calendarPasses = [] }
function worldSize(c) {
  const teams = Object.values(c.world.teamsById)
  return { clubs: teams.length, seniorPlayers: teams.reduce((n, t) => n + (t.players?.length ?? 0), 0),
    leagues: 1 + (c.league.otherLeagues?.length ?? 0), heapMiB: process.memoryUsage().heapUsed / 2 ** 20 }
}
let career
try {
  save()
  console.log('Creating focused domestic career; player games use FAST')
  let start = performance.now()
  career = createCareer(0, { competition: 'domestic', playerTeamId: club.id, managerName: 'Five season audit', seasonYear: 2026, worldConfig })
  report.creation = { ms: performance.now() - start, functions: summarized(), world: worldSize(career), calendarPasses: monitor.calendarPasses }
  console.log(`Created in ${(report.creation.ms / 1000).toFixed(1)}s`)
  for (let year = 0; year < years; year++) {
    reset(`season-${career.seasonYear}`)
    const season = { year: career.seasonYear, startDate: career.league.currentDate, worldStart: worldSize(career), days: [], calendarPasses: monitor.calendarPasses }
    report.seasons.push(season)
    Math.random = createRng(20260922 + year).float
    let lastProgress = performance.now()
    while (career.league.status !== 'complete' && season.days.length < dayLimit) {
      const date = career.league.currentDate
      monitor.date = date; monitor.playerTeamId = career.playerTeamId
      const before = Object.fromEntries(Object.entries(monitor.rows).map(([name, r]) => [name, { calls: r.calls, ms: r.ms, selfMs: r.selfMs }]))
      start = performance.now()
      const result = advanceCareerDay(career, { autoSimulatePlayer: true, allowRandomEvents: false })
      career = result.career
      assert(!result.blocked && career.league.currentDate > date, `Calendar blocked on ${date}`)
      for (const message of career.inbox ?? []) if (message.type === 'watchable_final' && message.payload?.status === 'pending') {
        resolveWatchableFinalIgnore(career, message)
        message.payload.status = 'ignored'
        report.decisions.push({ date, action: 'ignore-watchable-final', id: message.payload.matchId })
      }
      if (career.managerCareer?.status === 'unemployed') {
        const offer = managerJobOffers(career)[0]
        if (offer) {
          const accepted = acceptManagerJob(career, offer.id)
          assert(accepted.ok, 'Cannot accept job offer')
          career = accepted.career
          report.decisions.push({ date, action: 'accept-job', teamId: offer.teamId })
        }
      }
      const previousManager = report.managerEvents.at(-1)
      if (!previousManager || previousManager.teamId !== career.playerTeamId || previousManager.status !== career.managerCareer?.status) {
        report.managerEvents.push({ date, teamId: career.playerTeamId, status: career.managerCareer?.status })
      }
      const ms = performance.now() - start
      const delta = Object.fromEntries(Object.entries(monitor.rows).map(([name, r]) => [name, {
        calls: r.calls - (before[name]?.calls ?? 0), ms: r.ms - (before[name]?.ms ?? 0), selfMs: r.selfMs - (before[name]?.selfMs ?? 0),
      }]))
      season.days.push({ date, ms, functions: delta })
      if (performance.now() - lastProgress > 25000 || date.endsWith('-01')) {
        season.functions = summarized(); season.currentDate = career.league.currentDate
        season.totalDayMs = season.days.reduce((n, d) => n + d.ms, 0)
        save()
        console.log(`${season.year}: ${season.days.length} days, now ${career.league.currentDate}, ${(season.totalDayMs / 1000).toFixed(1)}s, fast=${monitor.rows.simulateMatch?.calls ?? 0}, background=${monitor.rows.backgroundMatch?.calls ?? 0}, calendar repairs=${monitor.calendarPasses.length}`)
        lastProgress = performance.now()
      }
    }
    season.endDate = career.league.currentDate; season.status = career.league.status
    season.totalDayMs = season.days.reduce((n, d) => n + d.ms, 0)
    season.functions = summarized(); season.worldEnd = worldSize(career)
    report.managerHistory = [...(career.managerCareer?.history ?? [])]
    const comps = [career.league, ...(career.league.otherLeagues ?? [])]
    season.fixtures = comps.reduce((n, c) => n + c.fixtures.length, 0)
    season.pendingFixtures = comps.flatMap(c => c.fixtures.filter(f => f.status !== 'completed' && f.homeTeamId && f.awayTeamId).map(f => ({ id: f.id, date: f.date, competition: f.competition })))
    save()
    assert.equal(career.league.status, 'complete', `Season ${career.seasonYear} did not end within ${dayLimit} days`)
    assert.equal(season.pendingFixtures.length, 0, 'Season still has unplayed club fixtures')
    console.log(`FINISHED ${season.year}: ${season.days.length} days, ${(season.totalDayMs / 1000).toFixed(1)}s`)
    reset(`transition-${season.year}`)
    monitor.date = career.league.currentDate
    start = performance.now()
    career = finalizeSeason(career)
    const finalizationMs = performance.now() - start
    let nextSeasonMs = 0
    if (year + 1 < years) {
      start = performance.now(); career = startNextSeason(career); nextSeasonMs = performance.now() - start
      assert.equal(career.seasonYear, season.year + 1)
    }
    report.transitions.push({ afterYear: season.year, finalizationMs, nextSeasonMs, functions: summarized(), calendarPasses: monitor.calendarPasses })
    save()
  }
  report.status = 'complete'; report.finishedAt = new Date().toISOString(); save()
  console.log(`ALL ${years} SEASONS COMPLETE: ${resolve(output, 'results.json')}`)
} catch (error) {
  report.status = 'failed'; report.error = { message: error.message, stack: error.stack, date: career?.league?.currentDate, stage: monitor.stage }
  report.failureFunctions = summarized(); save(); console.error(error); process.exitCode = 1
}
