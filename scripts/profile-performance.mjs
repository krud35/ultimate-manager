/**
 * Read-only game performance audit. Uses generated careers and in-memory storage.
 * Run sequentially (parallel benchmarks compete for CPU):
 * node --expose-gc --import ./scripts/register-world-tests.mjs scripts/profile-performance.mjs --scenario=domestic --days=60 --matches=3
 * Add --profile to record V8 CPU samples; use the unprofiled run for timings.
 * The existing loader resolves Vite-style imports and exposes the REAL lz-string.
 */
import { performance } from 'node:perf_hooks'
import { Session } from 'node:inspector'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cpus, totalmem, platform, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { createCareer } from '../src/career/careerModel.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'
import { careerForStorage, rehydrateCareerWorld } from '../src/career/worldState.js'
import { SAVE_VERSION } from '../src/career/constants.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { teamForMatchEngine } from '../src/data/ufaLeagueTeams.js'
import { DOMESTIC_LEAGUES, defaultWorldConfig, normalizeWorldConfig } from '../src/data/domesticLeagues.js'
import { createRng } from '../src/matchEngine/rng.js'

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')))
const scenario = args.scenario ?? 'ufa'
const profiling = Object.hasOwn(args, 'profile')
const days = Number(args.days ?? 60)
const matches = Number(args.matches ?? 3)
const repeats = Number(args.repeats ?? (profiling ? 1 : 3))
const enabled = new Set((args.only ?? 'create,save-new,match-full,match-fast,calendar,save-aged').split(','))
const saveSlots = (args.slots ?? '1,3').split(',').map(Number)
const output = resolve(args.out ?? 'artifacts/performance-2026-09-21')
mkdirSync(output, { recursive: true })
const prefix = `${scenario}-${profiling ? 'profile' : 'baseline'}${args.tag ? `-${args.tag}` : ''}`
const memory = new Map()
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
}
const inspector = profiling ? new Session() : null
if (inspector) inspector.connect()
const post = (method, params = {}) => new Promise((res, rej) => inspector.post(method, params, (err, data) => err ? rej(err) : res(data)))
if (inspector) {
  await post('Profiler.enable')
  await post('Profiler.setSamplingInterval', { interval: 1000 })
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0
  return { n: values.length, sumMs: values.reduce((a, b) => a + b, 0), meanMs: values.reduce((a, b) => a + b, 0) / (values.length || 1), medianMs: percentile(.5), p95Ms: percentile(.95), maxMs: sorted.at(-1) ?? 0 }
}
const report = {
  benchmarkVersion: 2,
  scenario, profiling, daysRequested: days, matchesRequested: matches, repeats, enabled: [...enabled], saveSlots,
  generatedAt: new Date().toISOString(), seed: 20260921,
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramGiB: totalmem() / 2 ** 30,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
  notes: [
    'Headless Node CPU benchmark, not browser FPS or Android measurements.',
    'Generated careers only; localStorage is memory-only. Disk/quota and browser Worker messaging are NOT timed.',
    'Scheduled career autosave is suppressed during creation; serialization/compression/loading measured separately.',
    'Math.random is seeded per scenario; wall-clock timestamps are not frozen.',
    'Calendar uses advanceCareerDay(autoSimulatePlayer=true,allowRandomEvents=false), matching fast-forward day logic, without UI waits or checkpoint saves.',
    'CPU profiles are separate diagnostic runs. Inclusive times overlap and must not be summed.',
    'Three-slot save uses three copies of the same career: size/scaling stress test, not three independently aged careers.',
  ], stages: {}, cpuProfiles: {},
}
function checkpoint() { writeFileSync(resolve(output, `${prefix}.json`), JSON.stringify(report, null, 2)) }
function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const parents = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id)
  const self = new Map(), inclusive = new Map()
  let totalUs = 0
  for (let i = 0; i < (profile.samples ?? []).length; i++) {
    const id = profile.samples[i], us = profile.timeDeltas[i] ?? 0
    totalUs += us
    self.set(id, (self.get(id) ?? 0) + us)
    for (let current = id; current != null; current = parents.get(current)) inclusive.set(current, (inclusive.get(current) ?? 0) + us)
  }
  const merged = new Map()
  for (const [id, n] of byId) {
    const f = n.callFrame
    const file = (f.url ?? '').replaceAll('\\', '/').replace(/^file:\/\/\//, '').replace(`${process.cwd().replaceAll('\\', '/')}/`, '')
    const key = `${file}:${f.lineNumber + 1}:${f.columnNumber + 1}:${f.functionName}`
    const row = merged.get(key) ?? { fn: f.functionName || '(anonymous)', file, line: f.lineNumber + 1, selfMs: 0, inclusiveMs: 0 }
    row.selfMs += (self.get(id) ?? 0) / 1000
    row.inclusiveMs += (inclusive.get(id) ?? 0) / 1000
    merged.set(key, row)
  }
  const rows = [...merged.values()].map(r => ({ ...r, selfPct: r.selfMs * 1e5 / (totalUs || 1), inclusivePct: r.inclusiveMs * 1e5 / (totalUs || 1) }))
  const files = new Map()
  for (const row of rows) files.set(row.file || '(runtime)', (files.get(row.file || '(runtime)') ?? 0) + row.selfMs)
  return { sampledMs: totalUs / 1000, samples: profile.samples?.length ?? 0,
    topSelf: rows.sort((a, b) => b.selfMs - a.selfMs).slice(0, 35),
    topInclusive: rows.filter(r => r.file.startsWith('src/') || r.file.includes('lz-string')).sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 40),
    byFile: [...files].map(([file, ms]) => ({ file, ms, pct: ms * 1e5 / (totalUs || 1) })).sort((a, b) => b.ms - a.ms).slice(0, 25),
  }
}
async function phase(name, fn) {
  globalThis.gc?.()
  console.log(`[${prefix}] START ${name}`)
  if (inspector) await post('Profiler.start')
  const start = performance.now()
  const result = fn()
  const elapsedMs = performance.now() - start
  if (inspector) {
    const { profile } = await post('Profiler.stop')
    writeFileSync(resolve(output, `${prefix}-${name}.cpuprofile`), JSON.stringify(profile))
    report.cpuProfiles[name] = summarizeProfile(profile)
  }
  report.stages[name] = { elapsedMs, ...result }
  checkpoint()
  console.log(`[${prefix}] DONE ${name}: ${elapsedMs.toFixed(1)} ms`)
  return result
}
function options() {
  if (scenario === 'domestic') {
    const worldConfig = normalizeWorldConfig({ ...defaultWorldConfig(), simulationModel: 'focused', mainCountryId: 'pl', additionalCountryIds: [] })
    const club = DOMESTIC_LEAGUES.find(l => l.countryId === 'pl' && l.tier === 1).teams[0]
    return { competition: 'domestic', playerTeamId: club.id, seasonYear: 2026, worldConfig }
  }
  if (scenario === 'eucs') return { competition: 'eucs', playerTeamId: 'eucs-mooncatchers', seasonYear: 2026 }
  if (scenario === 'ufa') return { competition: 'ufa', playerTeamId: 'toronto-rush', seasonYear: 2025, rosterMode: 'historical' }
  throw new Error(`Unknown scenario ${scenario}`)
}
function makeCareer() {
  Math.random = createRng(20260921).float
  const timers = [], originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (...params) => { const timer = originalSetTimeout(...params); timers.push(timer); return timer }
  try { return createCareer(0, { managerName: 'Performance audit', ...options() }) }
  finally { globalThis.setTimeout = originalSetTimeout; timers.forEach(clearTimeout) }
}
let career
await phase('create', () => {
  const samples = []
  for (let i = 0; i < repeats; i++) { const t = performance.now(); career = makeCareer(); samples.push(performance.now() - t) }
  const teams = Object.values(career.world.teamsById)
  return { samplesMs: samples, stats: stats(samples), coldMs: samples[0], warm: stats(samples.slice(1)), teamCount: teams.length,
    seniorPlayers: teams.reduce((n, t) => n + (t.players?.length ?? 0), 0), startDate: career.league.currentDate, playerTeamId: career.playerTeamId,
    worldConfig: career.worldConfig ?? null }
})
async function measureSave(label) {
  await phase(`save-${label}`, () => {
    const rows = []
    report.saveProgress = { label, rows }
    for (const slotCount of saveSlots) for (let i = 0; i < repeats; i++) {
      let t = performance.now()
      const slots = Array.from({ length: 3 }, (_, index) => index < slotCount ? careerForStorage(career) : null)
      const prepareMs = performance.now() - t
      t = performance.now(); const json = JSON.stringify({ version: SAVE_VERSION, slots }); const stringifyMs = performance.now() - t
      t = performance.now(); const compressed = compressToUTF16(json); const compressMs = performance.now() - t
      t = performance.now(); const decoded = decompressFromUTF16(compressed); const decompressMs = performance.now() - t
      if (decoded !== json) throw new Error('Compression round-trip mismatch')
      t = performance.now(); const parsed = JSON.parse(decoded); const parseMs = performance.now() - t
      t = performance.now(); const restored = parsed.slots.map(s => s ? rehydrateCareerWorld(s) : null); const rehydrateMs = performance.now() - t
      if (restored.filter(Boolean).length !== slotCount || restored[0].playerTeamId !== career.playerTeamId) throw new Error('Save restore mismatch')
      rows.push({ slotCount, repeat: i, prepareMs, stringifyMs, compressMs, decompressMs, parseMs, rehydrateMs,
        writeCpuMs: prepareMs + stringifyMs + compressMs, loadCpuMs: decompressMs + parseMs + rehydrateMs,
        jsonUtf8Bytes: Buffer.byteLength(json, 'utf8'), compressedUtf16Bytes: compressed.length * 2 })
      checkpoint()
      console.log(`[${prefix}] save-${label} slots=${slotCount} repeat=${i + 1} write=${rows.at(-1).writeCpuMs.toFixed(0)}ms load=${rows.at(-1).loadCpuMs.toFixed(0)}ms compressed=${(compressed.length * 2 / 2 ** 20).toFixed(2)}MiB`)
    }
    const byteSize = value => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
    const sections = object => Object.entries(object ?? {}).map(([key, value]) => ({ key, bytes: byteSize(value) })).sort((a, b) => b.bytes - a.bytes)
    const stored = careerForStorage(career)
    const teamFields = new Map()
    const playerFields = new Map()
    for (const team of Object.values(stored.world.teamsById)) {
      for (const [key, value] of Object.entries(team)) teamFields.set(key, (teamFields.get(key) ?? 0) + byteSize(value))
      for (const player of team.players ?? []) for (const [key, value] of Object.entries(player)) playerFields.set(key, (playerFields.get(key) ?? 0) + byteSize(value))
    }
    delete report.saveProgress
    return { date: career.league.currentDate, rows, sizeBreakdown: { career: sections(stored), world: sections(stored.world), league: sections(stored.league),
      teamFields: [...teamFields].map(([key, bytes]) => ({ key, bytes })).sort((a, b) => b.bytes - a.bytes),
      playerFields: [...playerFields].map(([key, bytes]) => ({ key, bytes })).sort((a, b) => b.bytes - a.bytes) } }
  })
}
if (enabled.has('save-new')) await measureSave('new')
// Match teams are detached from the career; live match simulation mutates players.
const home = career.world.teamsById[career.playerTeamId]
const awayId = career.league.teamIds?.find(id => id !== home.id) ?? career.world.teamIds.find(id => id !== home.id)
const away = career.world.teamsById[awayId]
for (const fastMode of [false, true].filter(f => enabled.has(f ? 'match-fast' : 'match-full'))) await phase(fastMode ? 'match-fast' : 'match-full', () => {
  const records = []
  const count = fastMode ? Math.max(matches, 10) : matches
  for (let i = 0; i < count; i++) {
    Math.random = createRng(80000 + i).float
    const homeTeam = teamForMatchEngine(structuredClone(home)), awayTeam = teamForMatchEngine(structuredClone(away))
    const t = performance.now()
    const session = initMatchSession({ homeTeam, awayTeam, seed: 70000 + i })
    const initMs = performance.now() - t
    const points = []
    while (session.status !== 'finished' && points.length < 100) {
      const start = performance.now(), eventStart = session.events.length
      playNextPoint(session, {}, { rotateHome: true, rotateAway: true, aiHome: false, aiAway: true, fastMode })
      points.push({ ms: performance.now() - start, events: session.events.length - eventStart })
    }
    if (session.status !== 'finished') throw new Error('Match did not finish')
    const row = { seed: 70000 + i, initMs, totalMs: performance.now() - t, score: [session.homeScore, session.awayScore], points, events: session.events.length }
    records.push(row)
    console.log(`[${prefix}] ${fastMode ? 'fast' : 'full'} match ${i + 1}/${count}: ${row.totalMs.toFixed(0)}ms, score ${row.score.join('-')}`)
  }
  return { home: home.name, away: away.name, aiHome: false, aiAway: true, records, matchStats: stats(records.map(r => r.totalMs)), pointStats: stats(records.flatMap(r => r.points.map(p => p.ms))) }
})
if (enabled.has('calendar')) await phase('calendar', () => {
  Math.random = createRng(20260922).float
  const records = []
  for (let i = 0; i < days && career.league.status !== 'complete'; i++) {
    const date = career.league.currentDate
    const fixtures = (career.league.fixtures ?? []).filter(f => f.date === date && f.status !== 'completed').length
    const t = performance.now()
    const result = advanceCareerDay(career, { autoSimulatePlayer: true, allowRandomEvents: false })
    const ms = performance.now() - t
    career = result.career
    records.push({ date, ms, playerLeagueFixtures: fixtures, weekTick: !!result.weekTick, blocked: !!result.blocked })
    if ((i + 1) % 5 === 0) console.log(`[${prefix}] calendar ${i + 1}/${days}: ${date}, last=${ms.toFixed(0)}ms`)
    if (result.blocked || career.league.currentDate === date) throw new Error(`Calendar blocked on ${date}`)
  }
  return { records, stats: stats(records.map(r => r.ms)), withPlayerLeagueFixtures: stats(records.filter(r => r.playerLeagueFixtures).map(r => r.ms)),
    withoutPlayerLeagueFixtures: stats(records.filter(r => !r.playerLeagueFixtures).map(r => r.ms)), weekTicks: stats(records.filter(r => r.weekTick).map(r => r.ms)),
    startDate: records[0]?.date, endDate: career.league.currentDate, finalStatus: career.league.status,
    note: 'Days without player-league fixtures can still contain other league, cup and national matches.' }
})
if (enabled.has('save-aged')) await measureSave('aged')
report.peakRssMiB = process.resourceUsage().maxRSS / 1024
checkpoint()
inspector?.disconnect()
console.log(`[${prefix}] REPORT ${resolve(output, `${prefix}.json`)}`)
