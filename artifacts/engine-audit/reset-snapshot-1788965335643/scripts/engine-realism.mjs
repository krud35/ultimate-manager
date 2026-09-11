/** Sparowane pomiary obu silników. Pasma są hipotezami, nie normą WFDF.
 * node scripts/engine-realism.mjs --fast 16 --full 16 --offset 3700 --output artifacts/engine-audit/before.json
 * --wind 20 --direction 180: kontrolowana pogoda; --frozen: bez adaptacji i rotacji AI.
 * --fixed-tactics: bez adaptacji taktyki, z normalną rotacją zawodników.
 * --fingerprints: kontrola neutralnych optymalizacji (zdarzenia i wszystkie klatki).
 */
import fs from 'node:fs'
import { bodyExposure } from './body-exposure.mjs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { simulateMatch } from '../src/matchEngine/matchSession.js'
import { createRng } from '../src/matchEngine/rng.js'
import { generateWind } from '../src/matchEngine/wind.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { getSubStat, normalizePlayerSkills, PLAYER_STAT_CATEGORIES } from '../src/models/playerStats.js'

const args = process.argv.slice(2)
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const fastCount = Number(option('--fast', 16))
const fullCount = Number(option('--full', 16))
const offset = Number(option('--offset', 3700))
const frozen = args.includes('--frozen')
const fixedTactics = args.includes('--fixed-tactics')
const fingerprints = args.includes('--fingerprints')
const windSpeed = option('--wind', null)
const direction = Number(option('--direction', 0))
const attribute = option('--attribute', null)
const delta = Number(option('--delta', 5))
const swap = args.includes('--swap')
if (windSpeed != null && (!Number.isFinite(Number(windSpeed)) || Number(windSpeed) < 0 || !Number.isFinite(direction))) throw new Error('Niepoprawny wiatr.')
if (attribute) {
  const [cat, key] = attribute.split('.')
  if (!PLAYER_STAT_CATEGORIES[cat]?.includes(key) || !Number.isFinite(delta)) throw new Error('Niepoprawny atrybut lub delta.')
}
if (![fastCount, fullCount].every(n => Number.isInteger(n) && n >= 0) || !Number.isFinite(offset)) {
  throw new Error('Liczby meczów muszą być nieujemnymi liczbami całkowitymi; offset musi być liczbą.')
}
const bases = [11000, 23000, 31000, 44000, 52000, 61000, 70000, 88000]
function tactics(style) {
  const dirs = { creativity: 0, coverageShade: 0, huckAppetite: 0, passSelectivity: 0,
    breakAppetite: 0, possessionTempo: 0, forceSide: FORCE_SIDES.FORCE_FOREHAND }
  return normalizeTactics({ oLineAttackStyle: style, dLineAttackStyle: style,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON, dLineDefenseStyle: DEFENSE_STYLES.PERSON,
    oLineCoachDirectives: dirs, dLineCoachDirectives: dirs, coachDirectives: dirs,
    forceSide: dirs.forceSide, lineupWhenOffenseStartPlayerIds: [], lineupWhenDefenseStartPlayerIds: [] })
}
const quantiles = a => {
  const sorted = [...a].sort((x, y) => x - y)
  const q = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null
  return { n: a.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99) }
}
const pct = (n, d) => d ? 100 * n / d : null
const output = { options: { fastCount, fullCount, offset, frozen, fixedTactics, windSpeed, direction, attribute, delta, swap }, modes: {} }
for (const [mode, count] of [['fast', fastCount], ['full', fullCount]]) {
  if (!count) continue
  const rows = [], distance = [], attemptedDistance = [], holdTimes = [], pointTimes = [], possessionThrows = []
  const possessionMs = [], firstThrowAfterTurnoverMs = [], estimatedPointMs = []
  let pressuredThrows = 0, pressuredResets = 0
  const diagnoses = {}, segments = {}, resetDiagnoses = {}, resetLosses = []
  let recoveredTouches = 0, multiTouchThrows = 0
  const types = {}, stalls = {}, locations = { ownThird: 0, middleThird: 0, attackingThird: 0, missing: 0 }
  for (let i = 0; i < count; i++) {
    const seed = bases[i % bases.length] + Math.floor(i / bases.length) * 37 + offset
    let home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
    if (args.includes('--mirror')) {
      away = structuredClone(home)
      // Keep club identity: even fixed-tactics auto-substitution consults its
      // coach profile. A new club id would silently introduce a second coach.
      away.players = away.players.map(p => ({ ...p, id: Number(p.id) + 1000000 }))
    }
    home.tactics = tactics(ATTACK_STYLES.HORIZONTAL_STACK)
    away.tactics = tactics(args.includes('--mirror') ? ATTACK_STYLES.HORIZONTAL_STACK : ATTACK_STYLES.VERTICAL_STACK)
    if (swap) [home, away] = [away, home]
    if (attribute) {
      const [cat, key] = attribute.split('.')
      for (const player of home.players) {
        player.skills = normalizePlayerSkills(player.skills)
        player.skills[cat][key] = Math.max(0, Math.min(100, getSubStat(player.skills, cat, key) + delta))
      }
    }
    const wind = windSpeed == null ? null : { speedMph: Number(windSpeed), directionDeg: direction }
    const initialWind = wind ?? generateWind(createRng(seed))
    const started = performance.now()
    const res = simulateMatch({ homeTeam: home, awayTeam: away, seed, fastMode: mode === 'fast', wind, windLocked: wind != null,
      ...(frozen ? { rotateHome: false, rotateAway: false, aiHome: false, aiAway: false }
        : fixedTactics ? { rotateHome: true, rotateAway: true, aiHome: false, aiAway: false } : {}) })
    const row = { seed, initialWind, ms: performance.now() - started, points: res.pointsPlayed,
      attempts: 0, completions: 0, holds: 0, cleanHolds: 0, blocks: 0, drops: 0, throwaways: 0,
      stallOuts: 0, throwLimits: 0, frames: 0, playerSnapshots: 0, homeScore: res.homeScore, awayScore: res.awayScore }
    const hash = fingerprints ? createHash('sha256') : null
    const seen = new Set()
    let pull = null, lastAttempt = null, elapsedPoint = 0, pointTurns = 0, possThrows = 0
    let elapsedPossession = 0, awaitingFirstThrow = false
    for (const e of res.events) {
      const { motionTrace, actionSim, ...metadata } = e
      if (hash) hash.update(JSON.stringify({ ...metadata, actionSim: actionSim ? { ...actionSim, frames: undefined } : undefined }))
      if (e.type === 'point_start') { pull = e.pullTeam; elapsedPoint = 0; pointTurns = 0; possThrows = 0; elapsedPossession = 0; awaitingFirstThrow = false }
      const trace = motionTrace ?? actionSim
      if (trace?.frames && !seen.has(trace.frames)) {
        seen.add(trace.frames)
        row.frames += trace.frames.length
        const duration = trace.totalMs ?? trace.frames.at(-1)?.ms ?? 0
        elapsedPoint += duration
        elapsedPossession += duration
        for (const f of trace.frames) { row.playerSnapshots += f.players?.length ?? 0; if (hash) hash.update(JSON.stringify(f)) }
      }
      if (e.type === 'throw_attempt') {
        if (trace?.frames) {
          const exposure = bodyExposure(trace.frames, [...home.players, ...away.players])
          row.bodyExposure ??= { flightFrames: 0, overlapFrames: 0, overlappingPairs: 0 }
          for (const key of Object.keys(exposure)) row.bodyExposure[key] += exposure[key]
        }
        const diagnosis = trace?.resolution?.diagnosis
        if (diagnosis) {
          if (e.throwType === 'dump_swing') {
            resetDiagnoses[diagnosis.primary] = (resetDiagnoses[diagnosis.primary] ?? 0) + 1
            if (diagnosis.primary !== 'completed' && args.includes('--reset-losses')) resetLosses.push({ seed,
              distanceM: e.throwDistanceM, stallCount: e.stallCount, releasePoint: e.releasePoint, diagnosis })
          }
          diagnoses[diagnosis.primary] = (diagnoses[diagnosis.primary] ?? 0) + 1
          if (diagnosis.contacts.length > 1) multiTouchThrows++
          if (diagnosis.primary === 'completed' && diagnosis.contacts.some(c => c.type !== 'catch')) recoveredTouches++
        }
        row.attempts++; possThrows++; lastAttempt = e
        stalls[e.stallCount] = (stalls[e.stallCount] ?? 0) + 1
        types[e.throwType] ??= { attempts: 0, completions: 0 }
        types[e.throwType].attempts++
        if (Number.isFinite(e.throwDistanceM)) attemptedDistance.push(e.throwDistanceM)
        if (e.stallCount >= 5) { pressuredThrows++; if (e.throwType === 'dump_swing') pressuredResets++ }
        const holdMs = e.holdMs ?? trace?.throwMs
        if (Number.isFinite(holdMs)) holdTimes.push(holdMs)
        if (!trace?.frames && Number.isFinite(e.holdMs)) elapsedPossession += e.holdMs + (e.flightMs ?? 0)
        if (awaitingFirstThrow) {
          const flightMs = trace?.frames ? (trace.totalMs ?? trace.frames.at(-1)?.ms ?? 0) - trace.throwMs : e.flightMs ?? 0
          firstThrowAfterTurnoverMs.push(elapsedPossession - flightMs)
          awaitingFirstThrow = false
        }
      }
      if (e.type === 'throw_success') {
        row.completions++; types[e.throwType].completions++
        const release = lastAttempt?.releasePoint ?? (lastAttempt?.actionSim ? { x: lastAttempt.actionSim.discX, y: lastAttempt.actionSim.discY } : null)
        if (e.catchPoint && Number.isFinite(release?.x) && Number.isFinite(release?.y)) {
          distance.push(Math.hypot(e.catchPoint.x - release.x, e.catchPoint.y - release.y))
        }
      }
      if (e.type === 'throw_success' || e.type === 'throw_fail') {
        const thrower = [...home.players, ...away.players].find(p => p.id === lastAttempt?.throwerId)
        const skill = getSubStat(thrower?.skills, 'throwing', 'backhand')
        const windBand = row.initialWind.speedMph < 7 ? '0-7mph' : row.initialWind.speedMph < 15 ? '7-15mph' : '15+mph'
        const key = `${windBand}|skill${skill < 80 ? '<80' : '80+'}|${(lastAttempt?.throwDistanceM ?? 0) < 10 ? 'short' : (lastAttempt?.throwDistanceM ?? 0) < 25 ? 'mid' : 'long'}`
        segments[key] ??= { attempts: 0, completions: 0 }
        segments[key].attempts++; if (e.type === 'throw_success') segments[key].completions++
      }
      if (e.type === 'throw_fail') {
        if (e.isBlock) row.blocks++; else if (e.isDrop) row.drops++; else row.throwaways++
      }
      if (e.type === 'stall_out') { row.stallOuts++; if (!trace?.frames) elapsedPossession += e.holdMs ?? 0 }
      if (e.type === 'turnover') {
        pointTurns++; possessionThrows.push(possThrows); possThrows = 0
        possessionMs.push(elapsedPossession); elapsedPossession = 0; awaitingFirstThrow = true
        // discPosition jest już zakodowane względem NOWEJ ofensywy.
        const lossPosition = Number.isFinite(e.discPosition) ? 100 - e.discPosition : null
        locations[lossPosition == null ? 'missing' : lossPosition < 100 / 3 ? 'ownThird' : lossPosition < 200 / 3 ? 'middleThird' : 'attackingThird']++
      }
      if (e.type === 'score') {
        if (e.team !== pull) { row.holds++; if (!pointTurns) row.cleanHolds++ }
        if (e.reason === 'throw_limit' || e.reason === 'action_limit') row.throwLimits++
        possessionThrows.push(possThrows)
        possessionMs.push(elapsedPossession)
        if (elapsedPoint) pointTimes.push(elapsedPoint)
      }
      if (e.type === 'point_end' && Number.isFinite(e.estimatedDurationMs)) estimatedPointMs.push(e.estimatedDurationMs)
    }
    if (hash) row.fingerprint = hash.digest('hex')
    rows.push(row)
    if (args.includes('--progress')) console.log(JSON.stringify({ mode, match: i + 1, seed, ms: row.ms, score: [row.homeScore, row.awayScore] }))
  }
  const sum = key => rows.reduce((n, r) => n + r[key], 0)
  const attempts = sum('attempts'), points = sum('points')
  const summary = { matches: count, msPerMatch: sum('ms') / count, homeMargin: (sum('homeScore') - sum('awayScore')) / count,
    meanInitialWindMph: rows.reduce((s, r) => s + r.initialWind.speedMph, 0) / count,
    completionPct: pct(sum('completions'), attempts),
    holdPct: pct(sum('holds'), points), cleanHoldPct: pct(sum('cleanHolds'), points),
    throwsPerPoint: attempts / points, turnoversPerPoint: (sum('blocks') + sum('drops') + sum('throwaways') + sum('stallOuts')) / points,
    blocksPerMatch: sum('blocks') / count, dropsPerMatch: sum('drops') / count,
    throwawaysPerMatch: sum('throwaways') / count, stallOutsPerMatch: sum('stallOuts') / count,
    framesPerMatch: sum('frames') / count, playerSnapshotsPerMatch: sum('playerSnapshots') / count,
    throwLimits: sum('throwLimits'), completedDistanceM: { ...quantiles(distance), shortPct: pct(distance.filter(x => x < 10).length, distance.length), longPct: pct(distance.filter(x => x >= 25).length, distance.length) },
    holdMs: quantiles(holdTimes), representedPointMs: quantiles(pointTimes), possessionThrows: quantiles(possessionThrows),
    attemptedDistanceM: quantiles(attemptedDistance), possessionMs: quantiles(possessionMs),
    firstThrowAfterTurnoverMs: quantiles(firstThrowAfterTurnoverMs), estimatedPointMs: quantiles(estimatedPointMs),
    pressuredThrows, pressuredResetPct: pct(pressuredResets, pressuredThrows),
    types, stallHistogram: stalls, turnoverLocations: locations, diagnoses, resetDiagnoses, segments, recoveredTouches, multiTouchThrows }
  output.modes[mode] = { summary, matches: rows, ...(args.includes('--reset-losses') ? { resetLosses } : {}) }
  console.log(mode, JSON.stringify(summary, null, 2))
}
const outputPath = option('--output', null)
if (outputPath) { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n') }
