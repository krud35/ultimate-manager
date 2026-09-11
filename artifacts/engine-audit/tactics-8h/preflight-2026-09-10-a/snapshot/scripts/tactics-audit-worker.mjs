import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { autoRotateTacticsForTeam, autoSubstituteTacticsForTeam } from '../src/matchEngine/rotation.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { createRng } from '../src/matchEngine/rng.js'
import { PLAYER_STAT_CATEGORIES, normalizePlayerSkills, clampSubStat } from '../src/models/playerStats.js'
import { effectiveCoachDirectives } from '../src/matchEngine/coachDirectives.js'
import { resolveThrow, computeMissDistanceM, MISS_CALIBRATION } from '../src/matchEngine/resolution.js'
import { atomic, makeTeam, beforePoint, afterPoint, adaptationProbes } from './tactics-audit-support.mjs'

const [inputFile, outputDir] = process.argv.slice(2)
const job = JSON.parse(fs.readFileSync(inputFile))
const roster = JSON.parse(fs.readFileSync(path.join(outputDir, 'rosters.json')))
const start = performance.now()
const write = (name, value) => atomic(path.join(outputDir, name), value)
const append = (name, value) => fs.appendFileSync(path.join(outputDir, name), JSON.stringify(value) + '\n')
const digest = value => createHash('sha256').update(JSON.stringify(value, (k, v) => k === 'audit' ? undefined : v)).digest('hex')
function tactics(team, patch = {}) {
  const dirs = { creativity: 0, huckAppetite: 0, breakAppetite: 0, passSelectivity: 0, possessionTempo: 0,
    stackDepth: 0, coverageShade: 0, cushionDepth: 0, markShape: 0, poachSeeking: 0, helpDeep: 0, poachResetHandler: 0,
    forceSide: patch.force ?? 'force_forehand', ...patch.directives }
  return normalizeTactics({ ...defaultTacticsForPlayers(team.players), tacticsFamiliarity: 55,
    oLineAttackStyle: patch.attack ?? 'horizontal_stack', dLineAttackStyle: patch.attack ?? 'horizontal_stack',
    oLineDefenseStyle: patch.defense ?? 'person', dLineDefenseStyle: patch.defense ?? 'person',
    forceSide: dirs.forceSide, coachDirectives: dirs, oLineCoachDirectives: dirs, dLineCoachDirectives: dirs })
}
function teams() {
  let home = structuredClone(roster.teams[job.home ?? roster.pairs[0][0]])
  let away = structuredClone(roster.teams[job.away ?? roster.pairs[0][1]])
  home = makeTeam(home, { ...job.homeConfig, side: 'home' }, job)
  away = makeTeam(away, { ...job.awayConfig, side: 'away' }, job)
  if (job.swap) [home, away] = [away, home]
  if (job.benchSize) for (const team of [home, away]) { team.players = team.players.slice(0, job.benchSize); team.tactics = tactics(team, team === home ? job.homePatch : job.awayPatch) }
  return { home, away }
}
function acc() { return { attempts: 0, completions: 0, resetAttempts: 0, resetCompletions: 0, hucks: 0, breaksAttempted: 0,
  stalls: 0, limits: 0, turnovers: 0, goals: 0, holds: 0, cleanHolds: 0, blocks: 0, drops: 0,
  holdMs: 0, holdN: 0, distance: 0, frameN: 0, setupFrames: 0, flightFrames: 0, playerFrames: 0,
  nonfinite: 0, displacementAlarms: 0, overlapPairSeconds: 0, movingMeters: 0, maxSpeed: 0,
  offenseSeconds: 0, defenseSeconds: 0, poachSeconds: 0, clearSeconds: 0, stationaryOffSeconds: 0,
  layoutSeconds: 0, widthSum: 0, depthSum: 0, shapeN: 0, cushionSum: 0, cushionN: 0,
  targetReversals: 0, resetChainAlarms: 0, scans: 0, noSelection: 0, perceivedPlayers: 0, stalePlayers: 0,
  selectedChanges: 0, noResetScans: 0, lateScans: 0, types: {}, diagnoses: {}, states: {}, side: {} } }
const result = { job, stats: acc(), checkpoints: [], replayCandidates: [], scanSamples: [], hardErrors: [], warnings: [], timings: {} }
const configs = job.swap ? { home: job.awayConfig ?? {}, away: job.homeConfig ?? {} } : { home: job.homeConfig ?? {}, away: job.awayConfig ?? {} }
let playerSides = new Map()
const sideAcc = side => result.stats.side[side] ??= { attempts: 0, completions: 0, resetAttempts: 0, resetCompletions: 0,
  hucks: 0, holdMs: 0, holdN: 0, shapeN: 0, widthSum: 0, depthSum: 0, defenseSeconds: 0, poachSeconds: 0, cushionSum: 0, cushionN: 0 }
let scans = [], totalScans = 0
THROW_SCAN_DIAGNOSTICS.observe = job.observe === false ? null : row => {
  const s = result.stats; s.scans++; totalScans++
  if (row.selectedId == null) s.noSelection++
  if (!(row.options ?? []).some(o => o.isDump && o.reachable)) s.noResetScans++
  if (row.hardStallCount >= 8) s.lateScans++
  for (const p of [...row.perceived.offense, ...row.perceived.defense]) {
    s.perceivedPlayers++; if ((p.observationAgeMs ?? 0) > 500) s.stalePlayers++
  }
  const prev = scans.at(-1)
  if (prev?.throwerId === row.throwerId && prev.setupElapsedMs < row.setupElapsedMs && prev.selectedId !== row.selectedId) s.selectedChanges++
  if (scans.length < 4000) scans.push(row)
  else if (totalScans % 100 === 0 && result.warnings.length < 24) result.warnings.push({ type: 'scan-storage-cap', jobId: job.id })
}
function scanTrace(trace, s, jobId) {
  if (!trace?.frames?.length) return
  let prev = null
  for (const f of trace.frames) {
    s.frameN++
    const setup = f.ms <= (trace.throwMs ?? Infinity)
    if (setup) s.setupFrames++; else s.flightFrames++
    const dt = prev ? Math.max(0, f.ms - prev.ms) / 1000 : 0
    const old = new Map((prev?.players ?? []).map(p => [p.id, p]))
    const off = f.players.filter(p => p.cutterState && p.role !== 'thrower')
    if (off.length && setup) {
      s.widthSum += Math.max(...off.map(p => p.y)) - Math.min(...off.map(p => p.y))
      s.depthSum += Math.max(...off.map(p => p.x)) - Math.min(...off.map(p => p.x)); s.shapeN++
      if (s === result.stats) {
        const side = sideAcc(playerSides.get(off[0].id) ?? 'unknown'); side.shapeN++
        side.widthSum += Math.max(...off.map(p => p.y)) - Math.min(...off.map(p => p.y))
        side.depthSum += Math.max(...off.map(p => p.x)) - Math.min(...off.map(p => p.x))
      }
    }
    const byId = new Map(f.players.map(p => [p.id, p]))
    for (const p of f.players) {
      s.playerFrames++
      if (![p.x, p.y, p.vx, p.vy].every(Number.isFinite)) s.nonfinite++
      const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0); s.maxSpeed = Math.max(s.maxSpeed, speed)
      const before = old.get(p.id)
      if (before && dt > 0) {
        const dist = Math.hypot(p.x - before.x, p.y - before.y); s.movingMeters += dist
        // Conservative discontinuity alarm, not a foul or definitive physics verdict.
        if (dist > .5 + Math.max(speed, Math.hypot(before.vx ?? 0, before.vy ?? 0), 12) * dt) {
          s.displacementAlarms++
          if (result.warnings.length < 24) result.warnings.push({ type: 'displacement', jobId, ms: f.ms, player: p.id, dist, dt })
        }
        if (p.audit && before.audit && Number.isFinite(p.audit.targetX) && Number.isFinite(before.audit.targetX)) {
          const ax = before.audit.targetX - before.x, ay = before.audit.targetY - before.y
          const bx = p.audit.targetX - p.x, by = p.audit.targetY - p.y
          if (ax * bx + ay * by < -1 && Math.hypot(ax, ay) > 1 && Math.hypot(bx, by) > 1) s.targetReversals++
        }
      }
      const state = p.cutterState ?? p.defenderState; s.states[state] = (s.states[state] ?? 0) + dt
      if (p.cutterState && p.role !== 'thrower') { s.offenseSeconds += dt; if (speed < .3) s.stationaryOffSeconds += dt; if (/CLEAR/.test(state)) s.clearSeconds += dt }
      if (p.defenderState) { s.defenseSeconds += dt; if (state === 'POACHING') s.poachSeconds += dt
        const target = byId.get(p.markTargetId); if (target) { s.cushionSum += Math.hypot(p.x - target.x, p.y - target.y); s.cushionN++ } }
      if (p.defenderState && s === result.stats) {
        const side = sideAcc(playerSides.get(p.id) ?? 'unknown'); side.defenseSeconds += dt
        if (state === 'POACHING') side.poachSeconds += dt
        const target = byId.get(p.markTargetId)
        if (target) { side.cushionSum += Math.hypot(p.x - target.x, p.y - target.y); side.cushionN++ }
      }
      if (p.diving || p.layout) s.layoutSeconds += dt
    }
    for (let i = 0; i < f.players.length; i++) for (let j = i + 1; j < f.players.length; j++) {
      const a = f.players[i], b = f.players[j]
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < .8 && Math.hypot(a.x - b.x, a.y - b.y) < .45) s.overlapPairSeconds += dt
    }
    if (f.disc && ![f.disc.x, f.disc.y, f.disc.z ?? 0].every(Number.isFinite)) s.nonfinite++
    prev = f
  }
}
const candidates = new Map()
function recordEvents(events, pointIndex) {
  const s = result.stats, seen = new Set(); let last = null, pull = null, turns = 0, chain = 0, chainStart = null
  const actions = events.filter(e => e.type === 'throw_attempt' || e.type === 'stall_out')
  for (const e of events) {
    const trace = e.motionTrace ?? e.actionSim
    if (trace?.frames && !seen.has(trace.frames)) { seen.add(trace.frames); scanTrace(trace, s, job.id) }
    if (e.type === 'point_start') pull = e.pullTeam
    if (e.type === 'throw_attempt') {
      last = e; s.attempts++; s.distance += e.throwDistanceM ?? 0
      const side = sideAcc(playerSides.get(e.throwerId) ?? 'unknown'); side.attempts++
      if (e.throwType === 'dump_swing') side.resetAttempts++
      if (e.throwType === 'huck') side.hucks++
      const sideHold = e.holdMs ?? trace?.throwMs; if (Number.isFinite(sideHold)) { side.holdMs += sideHold; side.holdN++ }
      s.types[e.throwType] ??= { attempts: 0, completions: 0 }; s.types[e.throwType].attempts++
      if (e.throwType === 'dump_swing') { s.resetAttempts++; chain++; chainStart ??= e.releasePoint }
      else { chain = 0; chainStart = null }
      if (e.throwType === 'huck') s.hucks++
      if (e.isOpenSide === false) s.breaksAttempted++
      const hold = e.holdMs ?? trace?.throwMs; if (Number.isFinite(hold)) { s.holdMs += hold; s.holdN++ }
      const diag = trace?.resolution?.diagnosis
      if (diag) s.diagnoses[diag.primary] = (s.diagnoses[diag.primary] ?? 0) + 1
    }
    if (e.type === 'throw_success') {
      s.completions++; if (last) s.types[last.throwType].completions++
      const side = sideAcc(playerSides.get(last?.throwerId) ?? 'unknown'); side.completions++
      if (last?.throwType === 'dump_swing') side.resetCompletions++
      if (last?.throwType === 'dump_swing') s.resetCompletions++
      if (chain === 9 && chainStart && e.catchPoint && Math.abs(e.catchPoint.x - chainStart.x) < 3) s.resetChainAlarms++
    }
    if (e.type === 'throw_fail') { if (e.isBlock) s.blocks++; if (e.isDrop) s.drops++ }
    if (e.type === 'stall_out') s.stalls++
    if (e.type === 'turnover') { s.turnovers++; turns++; chain = 0; chainStart = null }
    if (e.type === 'score') { s.goals++; if (e.team !== pull) { s.holds++; if (!turns) s.cleanHolds++ }
      if (e.reason === 'throw_limit' || e.reason === 'action_limit') s.limits++ }
    if ((e.type === 'throw_success' || e.type === 'throw_fail') && last && job.observe !== false) {
      const t = last.motionTrace ?? last.actionSim; if (!t?.frames?.length) continue
      const index = actions.indexOf(last)
      const category = (last.holdMs ?? t.throwMs ?? 0) > 5000 ? 'long_setup'
        : e.isBlock || events.slice(0, events.indexOf(last)).at(-1)?.type === 'turnover' ? 'defense_transition'
          : e.type === 'throw_fail' ? 'failure' : 'success'
      const rank = digest([job.seed, pointIndex, index, 'replay-selection'])
      const previous = candidates.get(category)
      const severity = (last.holdMs ?? t.throwMs ?? 0) + (e.type === 'throw_fail' ? 10000 : 0)
      const chooseRandom = !previous || rank < previous.rank
      const chooseAlarm = severity > (candidates.get('alarm')?.severity ?? -1)
      if (chooseRandom || chooseAlarm) {
        const clips = actions.slice(Math.max(0, index - 1), index + 2).map(a => {
          const { frames, ...meta } = a.motionTrace ?? a.actionSim ?? {}
          return { type: a.type, throwType: a.throwType, throwerId: a.throwerId, receiverId: a.receiverId,
            ...meta, frames: frames?.filter((_, i) => i % 5 === 0 || i === frames.length - 1) }
        })
        const releaseFrame = t.frames.reduce((best, f) => Math.abs(f.ms - t.throwMs) < Math.abs(best.ms - t.throwMs) ? f : best)
        const throwerAtRelease = releaseFrame.players.find(p => p.id === last.throwerId)
        const releaseScans = scans.filter(x => x.throwerId === last.throwerId && Math.abs(x.setupElapsedMs - t.throwMs) <= 25
          && x.actual?.offense.some(p => p.id === last.throwerId && throwerAtRelease && Math.hypot(p.x - throwerAtRelease.x, p.y - throwerAtRelease.y) < .05))
        const candidate = { category, rank, severity, jobId: job.id, seed: job.seed, pointIndex,
          selectedAction: index, outcome: e.type, clips, scans: releaseScans.length === 1 ? releaseScans : [],
          knowledgeScope: 'Only uniquely matched release scan; no reconstructed perception for other actions or earlier frames.',
          replayMethod: 'Restart frozen job from seed; checkpoint positions alone are not restart state.',
          sampling: '100 ms display frames; full sport-state fingerprint includes every frame.' }
        if (chooseRandom) candidates.set(category, candidate)
        if (chooseAlarm) candidates.set('alarm', { ...candidate, category: 'alarm' })
      }
    }
  }
}
function flushCandidates() {
  if (!job.keepReplays) return
  for (const [cat, c] of candidates) {
    const filename = `replays/${job.id}-${cat}.json`; write(filename, c)
    result.replayCandidates.push({ category: cat, rank: c.rank, severity: c.severity, path: filename, jobId: job.id, pointIndex: c.pointIndex })
  }
}
function setupCase(spec, variant = null) {
  const { home, away } = teams()
  // Controlled roster: all atomics explicit, no parent/child regeneration.
  for (const team of [home, away]) for (const p of team.players) {
    p.skills = normalizePlayerSkills(Object.fromEntries(Object.entries(PLAYER_STAT_CATEGORIES).map(([c, keys]) => [c, Object.fromEntries(keys.map(k => [k, 80]))])))
    p.traits = []; p.morale = 65; p.form = 72; p.currentStamina = 100
  }
  const off = home.players.slice(0, 7), def = away.players.slice(0, 7)
  const changed = variant?.category === 'defensive' ? def : off
  if (variant?.category) for (const p of changed) p.skills[variant.category][variant.key] = clampSubStat(80 + variant.delta, variant.category)
  if (variant?.state) for (const p of off) p[variant.state === 'energy' ? 'currentStamina' : variant.state] = variant.value
  if (variant?.trait && variant.value) for (const p of [...off, ...def]) p.traits = [variant.trait]
  if (variant?.instruction && variant.value) for (const team of [home, away]) {
    const map = Object.fromEntries(team.players.map(p => [p.id, [variant.instruction]]))
    team.tactics = normalizeTactics({ ...team.tactics, oLinePlayerInstructions: map, dLinePlayerInstructions: map })
  }
  const seeds = new Map(), matchups = new Map(); const x = spec.x ?? 40, y = spec.y ?? 18.5
  for (let i = 0; i < 7; i++) {
    const ox = i === 0 ? x : i < 3 ? x - 4 + i : x + 7 + (i - 3) * 4
    const oy = i === 0 ? y : Math.max(1, Math.min(36, y + (i % 2 ? -1 : 1) * (3 + i)))
    seeds.set(off[i].id, { id: off[i].id, x: ox, y: oy, vx: spec.moving && i > 2 ? -4 : 0, vy: 0, role: 'offense' })
    seeds.set(def[i].id, { id: def[i].id, x: ox + (spec.hard ? .8 : 3), y: oy + (spec.hard ? .5 : 2), vx: 0, vy: 0, role: 'defense' })
    matchups.set(off[i].id, def[i])
  }
  const before = result.stats.scans
  const rng = createRng(spec.seed)
  const sim = runContinuousThrowSimulation({ rng, thrower: off[0], offenseLineup: off, defenseLineup: def,
    personMatchups: matchups, possessionTeam: 'home', discPosition: x, discYMeters: y, stallCount: spec.stall ?? 1,
    hardStallCount: spec.stall ?? 1, startHoldMs: ((spec.stall ?? 1) - 1) * 1000,
    startStallClock: spec.stall > 1 ? { markerId: def[0].id, elapsedMs: (spec.stall - 1) * 1000 } : null,
    offenseTeam: home, defenseTeam: away, wind: spec.wind ?? { speedMph: 0, directionDeg: 0 },
    seedStates: spec.layout ? null : seeds, pickupPending: !!spec.pickup,
    afterTurnover: !!spec.pickup, maxTicks: 900,
    onThrowCommitted: (decision, live) => {
      const a = live.offenseAgents.find(p => p.id === off[0].id)
      const dx = decision.catchX - a.x, dy = decision.catchY - a.y, distance = Math.hypot(dx, dy)
      const resolution = resolveThrow({ thrower: off[0], receiver: decision.receiver, defender: decision.defender,
        executionOnly: true, rng, throwType: decision.throwType, throwDistanceM: distance,
        throwDx: dx, throwDy: dy, stallCount: decision.stallCount, separation: decision.separation, wind: spec.wind })
      const miss = Math.min(computeMissDistanceM(resolution.throwScore, resolution.defenseScore, resolution.throwStat, rng), distance * MISS_CALIBRATION.missDistanceFractionCap)
      const angle = rng.float() * Math.PI * 2
      return { resolution, adjustedToX: decision.catchX + Math.cos(angle) * miss, adjustedToY: decision.catchY + Math.sin(angle) * miss }
    } })
  const m = acc(); scanTrace(sim.motionTrace ?? sim, m, job.id)
  return { case: spec.id, seed: spec.seed, variant, metrics: m, scans: result.stats.scans - before,
    selected: !!sim.receiver, receiverId: sim.receiver?.id, throwType: sim.throwType, holdMs: sim.throwMs ?? sim.holdMs,
    success: sim.geometricResolution?.success ?? null, reason: sim.geometricResolution?.reason ?? null,
    phase: 'controlled setup and flight; simplified execution adapter, full point guard verified in match cohort',
    effectiveSkills: variant?.category ? changed[0].skills : undefined }
}
try {
  if (job.kind === 'adaptation') {
    result.rows = adaptationProbes(roster.teams[job.home ?? roster.pairs[0][0]], job)
    result.status = 'complete'
  } else if (job.kind === 'setups' || job.kind === 'effects') {
    const rows = []
    for (const spec of job.cases) for (const variant of job.variants ?? [null]) {
      if (performance.now() - start > job.budgetMs - 1500) break
      scans = []; rows.push(setupCase(spec, variant))
      append(`checkpoints/${job.id}-situations.jsonl`, { jobId: job.id, ...rows.at(-1) })
    }
    result.rows = rows; result.status = rows.length === job.cases.length * (job.variants?.length ?? 1) ? 'complete' : 'censored'
  } else {
    const { home, away } = teams()
    playerSides = new Map([...home.players.map(p => [p.id, 'home']), ...away.players.map(p => [p.id, 'away'])])
    const session = initMatchSession({ homeTeam: home, awayTeam: away, seed: job.seed, wind: job.wind, windLocked: !!job.lockWind })
    session.pullTeam = job.swap ? 'home' : 'away'
    const adaptive = job.adaptive !== false, rotate = job.rotate !== false
    // Match simulateMatch's initial rotation, then use its point-level production API.
    if (rotate) for (const side of ['home', 'away']) session[side].tactics = configs[side].profile
      ? autoRotateTacticsForTeam({ ...session[side], tactics: session[side].tactics }, session.stamina[side], session.rng)
      : autoSubstituteTacticsForTeam({ ...session[side], tactics: session[side].tactics }, session.stamina[side])
    if (job.energy != null) for (const side of ['home', 'away']) for (const p of session[side].players) session.stamina[side][p.id] = job.energy
    const sportHash = createHash('sha256')
    let points = 0
    do {
      if (points && performance.now() - start > job.budgetMs - 1500) break
      scans = []; const t = performance.now(), wind = structuredClone(session.wind)
      const decision = job.native ? null : beforePoint(session, configs, job)
      const used = structuredClone({ home: session.home.tactics, away: session.away.tactics })
      playNextPoint(session, {}, job.native
        ? { rotateHome: rotate, rotateAway: rotate, aiHome: !!configs.home.profile, aiAway: !!configs.away.profile }
        : { rotateHome: false, rotateAway: false, aiHome: false, aiAway: false })
      if (!job.native) afterPoint(session)
      const events = session.lastPoint.events
      sportHash.update(digest(events)); recordEvents(events, session.lastPoint.pointIndex)
      const state = { pointIndex: session.lastPoint.pointIndex, score: [session.homeScore, session.awayScore],
        decision, used, scoringTeam: session.lastPoint.scoringTeam,
        pointStart: events.find(e => e.type === 'point_start'),
        ms: performance.now() - t, wind, stamina: structuredClone(session.stamina),
        tactics: { home: structuredClone(session.home.tactics), away: structuredClone(session.away.tactics) },
        effective: Object.fromEntries(['home', 'away'].map(side => [side, session[side].players.slice(0, 7).map(p => ({ id: p.id,
          oAttack: effectiveCoachDirectives(session[side].tactics, p, 'offense', 'offense'),
          oDefense: effectiveCoachDirectives(session[side].tactics, p, 'defense', 'offense'),
          dAttack: effectiveCoachDirectives(session[side].tactics, p, 'offense', 'defense'),
          dDefense: effectiveCoachDirectives(session[side].tactics, p, 'defense', 'defense') }))])) }
      result.checkpoints.push(state); points++
      result.pointOutcomes ??= []
      const pull = events.find(e => e.type === 'point_start')?.pullTeam
      const turns = events.filter(e => e.type === 'turnover').length
      let owner = pull === 'home' ? 'away' : 'home'
      const possession = { home: 0, away: 0 }; possession[owner]++
      for (const e of events) if (e.type === 'turnover') { owner = owner === 'home' ? 'away' : 'home'; possession[owner]++ }
      result.pointOutcomes.push({ point: points, scorer: session.lastPoint.scoringTeam, pull, turns, possession })
      write(`checkpoints/${job.id}.json`, { jobId: job.id, points, status: session.status, score: state.score, stats: result.stats })
      process.stdout.write(JSON.stringify({ job: job.id, point: points, score: state.score, ms: state.ms }) + '\n')
      // Only the immediately previous point is needed by production adaptation.
      session.events = []
      if (fs.existsSync(path.join(outputDir, 'PAUSE')) || fs.existsSync(path.join(outputDir, 'STOP'))) break
    } while (session.status !== 'finished' && points < (job.points ?? Infinity))
    result.fingerprint = sportHash.digest('hex'); result.score = [session.homeScore, session.awayScore]; result.points = points
    result.status = session.status === 'finished' ? 'complete' : points >= (job.points ?? Infinity) ? 'complete_point_sample' : 'censored'
    result.actualPlayers = [...session.home.players, ...session.away.players].map(p => ({ id: p.id, morale: p.morale, form: p.form, skills: p.skills, traits: p.traits }))
    flushCandidates()
  }
  if (result.stats.nonfinite) result.hardErrors.push('Nonfinite motion state')
  if (result.stats.limits) result.hardErrors.push('Artificial score from action/throw limit')
  result.timings = { wallMs: performance.now() - start, maxRssBytes: process.resourceUsage().maxRSS * 1024 }
  write(`jobs/${job.id}.json`, result)
} catch (error) {
  write(`jobs/${job.id}.json`, { ...result, status: 'error', error: error.stack, wallMs: performance.now() - start }); process.exitCode = 1
}
