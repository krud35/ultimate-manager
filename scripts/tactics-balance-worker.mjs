/** Full production match worker. testPoints is only for harness acceptance. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { autoSubstituteTacticsForTeam } from '../src/matchEngine/rotation.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { lineupForPoint } from '../src/matchEngine/participants.js'
import { isPlayerAvailable } from '../src/models/playerInjury.js'
import { offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { PLAYER_SUB_ROLE_DEFS, resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'
import { PLAYER_INSTRUCTION_DEFS } from '../src/matchEngine/playerInstructions.js'
import { effectiveCoachDirectives } from '../src/matchEngine/coachDirectives.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { createRng } from '../src/matchEngine/rng.js'
import { PLAN_EXCEPTIONS } from '../src/career/streamlinedTactics.js'
import { atomic, makeTeam, applyConfig } from './tactics-audit-support.mjs'

const [inputFile, outputDir] = process.argv.slice(2)
if (!inputFile || !outputDir) throw new Error('Usage: node tactics-balance-worker.mjs INPUT_JSON OUTDIR')
const job = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
const rosters = JSON.parse(fs.readFileSync(path.join(outputDir, 'rosters.json'), 'utf8'))
// ensurePlayerStats deliberately removes legacy position fields at match start.
// Experimental fixture families must survive that normalization without writing
// those retired fields back into production players.
const rosterFamilies = new Map(Object.values(rosters.teams).flatMap(team => team.players.map(p => [p.id, p.position ?? p.primaryPosition])))
const playerFamily = player => rosterFamilies.get(player.id) ?? player.position ?? player.primaryPosition
if (!/^[a-zA-Z0-9_.-]+$/.test(job.id)) throw new Error('Unsafe job ID')
if (!Number.isFinite(job.seed)) throw new Error('Explicit finite match seed required')
if (job.testPoints != null && (!Number.isInteger(job.testPoints) || job.testPoints < 1)) throw new Error('Invalid testPoints')
for (const dir of ['jobs', 'checkpoints', 'replays']) fs.mkdirSync(path.join(outputDir, dir), { recursive: true })
const start = performance.now()
const save = (name, data) => atomic(path.join(outputDir, name), data)
const other = side => side === 'home' ? 'away' : 'home'
const identity = job.swap ? { home: 'b', away: 'a' } : { home: 'a', away: 'b' }
const configs = job.swap ? { home: job.awayConfig ?? {}, away: job.homeConfig ?? {} }
  : { home: job.homeConfig ?? {}, away: job.awayConfig ?? {} }
const motion = () => ({ sampleMs: 100, frames: 0, playerSeconds: 0, movingMeters: 0,
  offenseSeconds: 0, defenseSeconds: 0, stationaryOffSeconds: 0, clearSeconds: 0, cutSeconds: 0,
  poachSeconds: 0, layoutSeconds: 0, widthMeterSeconds: 0, depthMeterSeconds: 0, shapeSeconds: 0,
  cushionMeterSeconds: 0, cushionSeconds: 0, nearestTeammateMeterSeconds: 0, nearestTeammateSeconds: 0,
  overlapPairSeconds: 0, targetReversals: 0, nonfinite: 0, displacementAlarms: 0, maxSpeed: 0 })
const sideStats = () => ({ throws: 0, completions: 0, distanceM: 0, completedDistanceM: 0,
  hucks: 0, huckCompletions: 0, resets: 0, resetCompletions: 0, breakAttempts: 0, breakCompletions: 0,
  goals: 0, holds: 0, breaks: 0, cleanHolds: 0, holdOpportunities: 0, breakOpportunities: 0,
  turnovers: 0, possessions: 0, stalls: 0, blocks: 0, drops: 0, holdMs: 0, holdN: 0, forcedSubstitutions: 0,
  resetChainAlarms: 0, throwTypes: {}, windRelations: {}, diagnoses: {}, motion: motion(), roles: {},
  decisions: { scans: 0, noSelection: 0, lateScans: 0, reachableResetScans: 0, selectedResetScans: 0,
    perceivedPlayers: 0, stalePlayers: 0, selectedChanges: 0, options: 0, rejected: {} } })
const result = { schema: 1, job, status: 'running', identity, score: [0, 0], points: 0,
  sides: { home: sideStats(), away: sideStats() }, pointOutcomes: [], checkpoints: [],
  hardErrors: [], warnings: [], scanSamples: [], replays: [], forcedSubstitutions: 0, forcedSubstitutionLog: [],
  measurement: { version: 2, fullEngine: true, fastMode: false, motionSampleMs: 100, matchRuleOverride: false,
    lineupPolicy: 'Frozen healthy slots; injury vacancies receive the first healthy unused roster player of the same slot family, falling back to another family. No replacement RNG. Invalid short lineups are excluded.',
    rng: 'Production seeded RNG plus independent seeded fallback for legacy Math.random calls',
    roleBasis: 'Resolved active-line offensive subrole; actual marker/zone/person role in defense',
    checkpointRestart: 'Checkpoints are evidence, not serialized engine state; restart the frozen job from its seed.',
    decisions: 'Scan counters describe perceived options; they are not an independent optimal-decision oracle.' } }
let playerSides = new Map(), activeRoles = new Map(), lastScan = null, point = 0
let pointFrameCounts = null
const previousLineups = { home: {}, away: {} }
let scanSerial = 0, fallbackRandomCalls = 0
const originalRandom = Math.random, originalObserver = THROW_SCAN_DIAGNOSTICS.observe
const fallbackRng = createRng((job.seed ^ 0x5f3759df) >>> 0)
Math.random = () => { fallbackRandomCalls++; return fallbackRng.float() }
const warn = row => { if (result.warnings.length < 24) result.warnings.push(row) }
const hard = message => { if (!result.hardErrors.includes(message)) result.hardErrors.push(message) }
const roleStats = (side, role) => result.sides[side].roles[role] ??= motion()
const candidates = new Map()
const fingerprint = createHash('sha256')

function invalidLineup(message) {
  hard(message)
  const error = new Error(message)
  error.code = 'INVALID_LINEUP'
  throw error
}

function rememberLineups(team, side) {
  previousLineups[side] = Object.fromEntries(['oLine', 'dLine'].map(line => [line,
    [...team.tactics[line === 'oLine' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds']]]))
}

function replaceInjuryVacancies(team, side) {
  const available = team.players.filter(isPlayerAvailable)
  if (available.length < 7) invalidLineup(`${side}: fewer than seven healthy roster players before point ${point}`)
  const byId = new Map(team.players.map(p => [p.id, p]))
  let tactics = { ...team.tactics }
  for (const line of ['oLine', 'dLine']) {
    const key = line === 'oLine' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds'
    const ids = [...(tactics[key] ?? [])]
    if (ids.length !== 7) invalidLineup(`${side} ${line}: invalid slot count before point ${point}`)
    const slots = offenseLineSlotsForAttackStyle(tactics[`${line}AttackStyle`])
    const used = new Set(ids.filter(id => id != null && isPlayerAvailable(byId.get(id))))
    if (used.size !== ids.filter(id => id != null && isPlayerAvailable(byId.get(id))).length) invalidLineup(`${side} ${line}: duplicated healthy player`)
    for (let slot = 0; slot < ids.length; slot++) {
      const current = byId.get(ids[slot])
      if (current && isPlayerAvailable(current)) continue
      const outgoingId = ids[slot] ?? previousLineups[side][line]?.[slot] ?? null
      const outgoing = byId.get(outgoingId)
      if (!outgoing || isPlayerAvailable(outgoing)) invalidLineup(`${side} ${line}: vacancy without an injured predecessor at slot ${slot}`)
      const family = slots[slot].role
      const incoming = available.find(p => !used.has(p.id) && playerFamily(p) === family)
        ?? available.find(p => !used.has(p.id))
      if (!incoming) invalidLineup(`${side} ${line}: no healthy substitute for slot ${slot}`)
      ids[slot] = incoming.id; used.add(incoming.id)
      result.forcedSubstitutions++; result.sides[side].forcedSubstitutions++
      result.forcedSubstitutionLog.push({ point, side, line, slot, outgoingId, incomingId: incoming.id,
        reason: 'injury', slotFamily: family, familyMatched: playerFamily(incoming) === family })
    }
    tactics[key] = ids
  }
  team.tactics = tactics
}

function configure(team, config, activeLine = 'oLine') {
  // A career plan owns its compiled fields. Manual interventions must remove it first.
  let t = structuredClone(team.tactics)
  delete t.streamlinedPlan
  t = applyConfig(t, team, { ...config, instructions: undefined, subRoles: undefined })
  const lines = activeLine === 'oLine' ? ['dLine', 'oLine'] : ['oLine', 'dLine']
  if (config.subRoles != null && (!Array.isArray(config.subRoles) || config.subRoles.length !== 7)) throw new Error('subRoles must contain seven slot roles')
  for (const line of lines) {
    const ids = t[line === 'oLine' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds']
    const slots = offenseLineSlotsForAttackStyle(t[`${line}AttackStyle`])
    const slotByPlayer = new Map(ids.map((id, i) => [id, i]))
    const orders = config[`${line}Instructions`] ?? config.instructions
    if (orders != null) {
      if (!Array.isArray(orders) || orders.some(tag => !PLAYER_INSTRUCTION_DEFS[tag])) throw new Error('Unknown player instruction')
      // Include reserves by their actual family; active lineup slots take precedence.
      t[`${line}PlayerInstructions`] = Object.fromEntries(team.players.map(p => {
        const slot = slotByPlayer.get(p.id)
        const family = slot == null ? playerFamily(p) : slots[slot]?.role
        const match = config.instructionTargetSlot != null ? slot === config.instructionTargetSlot
          : !config.instructionRole || family === config.instructionRole
        return [p.id, match ? [...orders] : []]
      }))
    }
    // makeTeam starts from vertical-stack roles. Replacing its attack style must
    // also replace the slot roles (including same-family cutter priorities).
    // The active point-start line is processed last when O/D lineups overlap.
    t.playerSubRoles = { ...t.playerSubRoles }
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] == null) continue
      const role = config.subRoles?.[i] ?? slots[i]?.defaultSubRole
      if (!PLAYER_SUB_ROLE_DEFS[role] || PLAYER_SUB_ROLE_DEFS[role].family !== slots[i]?.role) throw new Error(`Subrole ${role} does not match ${line} slot ${i}`)
      t.playerSubRoles[ids[i]] = role
    }
  }
  const plan = config.streamlinedPlan ?? config.plan
  if (plan) {
    t.streamlinedPlan = structuredClone(plan)
    t.streamlinedPlan.version ??= 1
    t.streamlinedPlan.exceptions ??= {}
    if (config.instructions?.length) {
      if (config.instructions.length !== 1 || !PLAN_EXCEPTIONS[config.instructions[0]]) throw new Error('Career plan accepts one supported exception per player')
      for (const [id, tags] of Object.entries(t.oLinePlayerInstructions)) if (tags.length) t.streamlinedPlan.exceptions[id] = config.instructions[0]
      for (const [id, tags] of Object.entries(t.dLinePlayerInstructions)) if (tags.length) t.streamlinedPlan.exceptions[id] = config.instructions[0]
    }
  }
  team.tactics = normalizeTactics(t)
  return team.tactics
}

THROW_SCAN_DIAGNOSTICS.observe = job.observe === false ? null : row => {
  const side = playerSides.get(row.throwerId)
  if (!side) return
  const d = result.sides[side].decisions
  d.scans++; scanSerial++
  if (row.selectedId == null) d.noSelection++
  if (row.hardStallCount >= 8) d.lateScans++
  if ((row.options ?? []).some(o => o.isDump && o.reachable)) d.reachableResetScans++
  if ((row.options ?? []).some(o => o.id === row.selectedId && o.isDump)) d.selectedResetScans++
  d.options += row.options?.length ?? 0
  for (const p of [...(row.perceived?.offense ?? []), ...(row.perceived?.defense ?? [])]) {
    d.perceivedPlayers++; if ((p.observationAgeMs ?? 0) > 500) d.stalePlayers++
  }
  for (const rejection of row.rejected ?? []) {
    const why = rejection.reason ?? 'unspecified'; d.rejected[why] = (d.rejected[why] ?? 0) + 1
  }
  if (lastScan?.throwerId === row.throwerId && lastScan.setupElapsedMs < row.setupElapsedMs && lastScan.selectedId !== row.selectedId) d.selectedChanges++
  lastScan = { throwerId: row.throwerId, setupElapsedMs: row.setupElapsedMs, selectedId: row.selectedId }
  // Bounded deterministic sampling, independent of both simulation random streams.
  if (scanSerial % 101 === 1) {
    const sample = { point, side, ...row }
    if (result.scanSamples.length < 24) result.scanSamples.push(sample)
    else result.scanSamples[Math.floor(scanSerial / 101) % 24] = sample
  }
}

function measureTrace(trace) {
  const frames = trace?.frames
  if (!frames?.length) return
  let prev = null
  for (let index = 0; index < frames.length; index++) {
    if (index % 5 && index !== frames.length - 1) continue
    const f = frames[index], dt = prev ? Math.max(0, f.ms - prev.ms) / 1000 : 0
    const old = new Map((prev?.players ?? []).map(p => [p.id, p]))
    const byId = new Map(f.players.map(p => [p.id, p]))
    const setup = f.ms <= (trace.throwMs ?? Infinity)
    for (const side of ['home', 'away']) {
      const m = result.sides[side].motion
      const all = f.players.filter(p => playerSides.get(p.id) === side)
      if (pointFrameCounts) {
        const count = new Set(all.map(p => p.id)).size, counts = pointFrameCounts[side]
        counts.min = Math.min(counts.min, count); counts.max = Math.max(counts.max, count); counts.frames++
        if (count !== 7) hard(`${side}: sampled engine frame has ${count} players in point ${point}`)
      }
      const off = all.filter(p => p.cutterState && p.role !== 'thrower')
      m.frames++
      if (off.length && setup && dt > 0) {
        m.widthMeterSeconds += (Math.max(...off.map(p => p.y)) - Math.min(...off.map(p => p.y))) * dt
        m.depthMeterSeconds += (Math.max(...off.map(p => p.x)) - Math.min(...off.map(p => p.x))) * dt
        m.shapeSeconds += dt
      }
      for (const p of all) {
        const role = p.defenderState ? p.role ?? 'defender' : activeRoles.get(p.id) ?? p.role ?? 'unknown'
        const r = roleStats(side, role), oldP = old.get(p.id)
        r.frames++
        const offense = !!p.cutterState && p.role !== 'thrower', defense = !!p.defenderState
        const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0)
        const dist = oldP && dt > 0 ? Math.hypot(p.x - oldP.x, p.y - oldP.y) : 0
        const state = p.cutterState ?? p.defenderState ?? ''
        for (const bucket of [m, r]) {
          bucket.playerSeconds += dt; bucket.movingMeters += dist
          bucket.maxSpeed = Math.max(bucket.maxSpeed, speed)
          if (![p.x, p.y, p.vx, p.vy].every(Number.isFinite)) bucket.nonfinite++
          if (offense) { bucket.offenseSeconds += dt; if (speed < .3) bucket.stationaryOffSeconds += dt }
          if (defense) bucket.defenseSeconds += dt
          if (offense && state === 'CLEARING') bucket.clearSeconds += dt
          if (offense && state === 'ACTIVE_CUT') bucket.cutSeconds += dt
          if (defense && state === 'POACHING') bucket.poachSeconds += dt
          if (p.diving || p.layout) bucket.layoutSeconds += dt
          const mark = byId.get(p.markTargetId)
          if (defense && mark) { bucket.cushionMeterSeconds += Math.hypot(p.x - mark.x, p.y - mark.y) * dt; bucket.cushionSeconds += dt }
          if (oldP && dt > 0 && dist > .5 + Math.max(speed, Math.hypot(oldP.vx ?? 0, oldP.vy ?? 0), 12) * dt) bucket.displacementAlarms++
          if (oldP?.audit && p.audit) {
            const ax = oldP.audit.targetX - oldP.x, ay = oldP.audit.targetY - oldP.y
            const bx = p.audit.targetX - p.x, by = p.audit.targetY - p.y
            if (ax * bx + ay * by < -1 && Math.hypot(ax, ay) > 1 && Math.hypot(bx, by) > 1) bucket.targetReversals++
          }
        }
        if (offense && setup && off.length > 1) {
          const nearest = Math.min(...off.filter(q => q.id !== p.id).map(q => Math.hypot(p.x - q.x, p.y - q.y)))
          m.nearestTeammateMeterSeconds += nearest * dt; m.nearestTeammateSeconds += dt
          r.nearestTeammateMeterSeconds += nearest * dt; r.nearestTeammateSeconds += dt
        }
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        if (Math.abs((all[i].z ?? 0) - (all[j].z ?? 0)) < .8 && Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < .45) m.overlapPairSeconds += dt
      }
    }
    if (f.disc && ![f.disc.x, f.disc.y, f.disc.z ?? 0].every(Number.isFinite)) hard('Nonfinite disc motion state')
    prev = f
  }
}

function replay(attempt, outcome, actionIndex) {
  if (!job.keepReplays) return
  const trace = attempt.motionTrace ?? attempt.actionSim
  if (!trace?.frames?.length) return
  const category = (attempt.holdMs ?? trace.throwMs ?? 0) > 5000 ? 'long_setup' : outcome.type === 'throw_fail' ? 'failure' : 'success'
  const rank = createHash('sha256').update(`${job.seed}/${point}/${actionIndex}`).digest('hex')
  if (candidates.has(category) && candidates.get(category).rank < rank) return
  const releaseMs = trace.throwMs ?? 0
  const frames = trace.frames.filter((f, i) => i % 5 === 0 && f.ms >= Math.max(0, releaseMs - 8000) && f.ms <= releaseMs + 10000).slice(0, 181)
  const { motionTrace: ignoredMotion, actionSim: ignoredAction, ...metadata } = attempt
  void ignoredMotion; void ignoredAction
  candidates.set(category, { category, rank, jobId: job.id, point, seed: job.seed, actionIndex,
    attempt: metadata, outcome, frames, throwMs: releaseMs, sampleMs: 100,
    playback: 'Up to 8 seconds before release and 10 seconds after; restart frozen job to reproduce the full state.' })
}

function recordPoint(events, wind, score) {
  const seen = new Set(), startEvent = events.find(e => e.type === 'point_start')
  const pull = startEvent?.pullTeam
  if (!['home', 'away'].includes(pull)) throw new Error('Point lacks legal starting possession')
  let owner = other(pull), lastAttempt = null, actionIndex = 0, resetChain = 0, chainStart = null
  const possessions = { home: 0, away: 0 }, turnovers = { home: 0, away: 0 }
  possessions[owner]++; result.sides[owner].possessions++
  result.sides[owner].holdOpportunities++; result.sides[pull].breakOpportunities++
  let scorer = null
  for (const e of events) {
    const { motionTrace, actionSim, ...metadata } = e
    fingerprint.update(JSON.stringify(metadata))
    const trace = motionTrace ?? actionSim
    if (trace?.frames && !seen.has(trace.frames)) {
      seen.add(trace.frames)
      for (const frame of trace.frames) fingerprint.update(JSON.stringify(frame, (key, value) => key === 'audit' ? undefined : value))
      measureTrace(trace)
    }
    if (e.type === 'throw_attempt') {
      lastAttempt = e; actionIndex++
      const side = playerSides.get(e.throwerId) ?? e.possessionTeam ?? owner, s = result.sides[side]
      if (!s) throw new Error('Unknown throwing team')
      if (side !== owner) hard('Throwing team disagrees with possession')
      s.throws++; s.distanceM += e.throwDistanceM ?? 0
      s.throwTypes[e.throwType] ??= { attempts: 0, completions: 0 }; s.throwTypes[e.throwType].attempts++
      const rel = typeof e.windRelation === 'string' ? e.windRelation : JSON.stringify(e.windRelation ?? 'unknown')
      s.windRelations[rel] ??= { attempts: 0, completions: 0 }; s.windRelations[rel].attempts++
      if (e.throwType === 'huck') s.hucks++
      if (e.throwType === 'dump_swing') { s.resets++; resetChain++; chainStart ??= e.releasePoint }
      else { resetChain = 0; chainStart = null }
      if (e.isOpenSide === false) s.breakAttempts++
      const hold = e.holdMs ?? trace?.throwMs
      if (Number.isFinite(hold)) { s.holdMs += hold; s.holdN++ }
      const diagnosis = trace?.resolution?.diagnosis?.primary
      if (diagnosis) s.diagnoses[diagnosis] = (s.diagnoses[diagnosis] ?? 0) + 1
    }
    if (e.type === 'throw_success') {
      if (!lastAttempt) { hard('Throw success without an attempt'); continue }
      const side = playerSides.get(lastAttempt.throwerId) ?? owner, s = result.sides[side]
      s.completions++; s.throwTypes[lastAttempt.throwType].completions++
      const rel = typeof lastAttempt.windRelation === 'string' ? lastAttempt.windRelation : JSON.stringify(lastAttempt.windRelation ?? 'unknown')
      s.windRelations[rel].completions++
      if (lastAttempt.throwType === 'huck') s.huckCompletions++
      if (lastAttempt.throwType === 'dump_swing') s.resetCompletions++
      if (lastAttempt.isOpenSide === false) s.breakCompletions++
      if (e.catchPoint && lastAttempt.releasePoint) s.completedDistanceM += Math.hypot(e.catchPoint.x - lastAttempt.releasePoint.x, e.catchPoint.y - lastAttempt.releasePoint.y)
      if (resetChain === 9 && chainStart && e.catchPoint && Math.abs(e.catchPoint.x - chainStart.x) < 3) s.resetChainAlarms++
      replay(lastAttempt, metadata, actionIndex)
    }
    if (e.type === 'throw_fail') {
      const side = playerSides.get(e.throwerId) ?? owner
      if (e.isBlock) result.sides[other(side)].blocks++
      if (e.isDrop) result.sides[side].drops++
      if (lastAttempt) replay(lastAttempt, metadata, actionIndex)
    }
    if (e.type === 'stall_out') result.sides[owner].stalls++
    if (e.type === 'turnover') {
      turnovers[owner]++; result.sides[owner].turnovers++
      owner = other(owner); possessions[owner]++; result.sides[owner].possessions++
      resetChain = 0; chainStart = null
    }
    if (e.type === 'score') {
      scorer = e.team
      if (!result.sides[scorer]) throw new Error('Unknown scoring team')
      if (scorer !== owner) hard('Scoring team disagrees with possession')
      const s = result.sides[scorer]; s.goals++
      if (scorer === pull) s.breaks++
      else { s.holds++; if (turnovers.home + turnovers.away === 0) s.cleanHolds++ }
      if (['throw_limit', 'action_limit'].includes(e.reason)) hard('Artificial score from action/throw limit')
    }
  }
  if (!scorer) hard('Point has no scoring event')
  result.pointOutcomes.push({ point, scorer, pull, turnovers, possessions, wind, score })
}

function staminaSummary(map) {
  const values = Object.values(map).filter(Number.isFinite)
  return { min: Math.min(...values), mean: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values) }
}

try {
  let home = makeTeam(rosters.teams[job.home ?? rosters.pairs[0][0]], job.homeConfig ?? {}, job)
  let away = makeTeam(rosters.teams[job.away ?? rosters.pairs[0][1]], job.awayConfig ?? {}, job)
  if (job.swap) [home, away] = [away, home]
  configure(home, configs.home); configure(away, configs.away)
  playerSides = new Map([...home.players.map(p => [p.id, 'home']), ...away.players.map(p => [p.id, 'away'])])
  const session = initMatchSession({ homeTeam: home, awayTeam: away, homeTactics: home.tactics, awayTactics: away.tactics,
    seed: job.seed, wind: job.wind, windLocked: job.lockWind !== false, collectFrames: true })
  rememberLineups(home, 'home'); rememberLineups(away, 'away')
  const firstOffense = job.firstOffense ?? 'a'
  if (!['a', 'b'].includes(firstOffense)) throw new Error('firstOffense must be a or b')
  session.pullTeam = identity.home === firstOffense ? 'away' : 'home'
  while (session.status !== 'finished') {
    if (result.points && performance.now() - start > (job.budgetMs ?? Infinity) - 1500) break
    if (fs.existsSync(path.join(outputDir, 'STOP')) || fs.existsSync(path.join(outputDir, 'PAUSE'))) break
    point = session.pointIndex; lastScan = null
    const t = performance.now(), wind = structuredClone(session.wind), used = {}, roleAtStart = {}, playerCounts = {}
    const substitutionsBefore = result.forcedSubstitutions
    pointFrameCounts = { home: { min: Infinity, max: 0, frames: 0 }, away: { min: Infinity, max: 0, frames: 0 } }
    activeRoles = new Map()
    for (const side of ['home', 'away']) {
      const team = session[side], line = side === session.pullTeam ? 'dLine' : 'oLine'
      roleAtStart[side] = line
      replaceInjuryVacancies(team, side)
      if (job.rotate === true) team.tactics = autoSubstituteTacticsForTeam(team, session.stamina[side], { pointIndex: point })
      configure(team, configs[side], line)
      const ids = team.tactics[line === 'oLine' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds']
      const actualLineup = lineupForPoint(team, line === 'oLine' ? 'offense' : 'defense')
      playerCounts[side] = actualLineup.length
      if (actualLineup.length !== 7 || actualLineup.some(p => !isPlayerAvailable(p))) invalidLineup(`${side}: active lineup is not seven healthy players before point ${point}`)
      rememberLineups(team, side)
      const slots = offenseLineSlotsForAttackStyle(team.tactics[`${line}AttackStyle`])
      for (let i = 0; i < ids.length; i++) if (ids[i] != null) activeRoles.set(ids[i], resolvePlayerSubRole(team.tactics, ids[i], slots[i]))
      used[side] = { mode: team.tactics.streamlinedPlan ? 'career' : 'manual', roleAtPointStart: line,
        tactics: structuredClone(team.tactics), activePlayerIds: ids,
        effective: team.players.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, subRole: activeRoles.get(p.id),
          instructions: team.tactics[`${line}PlayerInstructions`]?.[p.id] ?? [],
          offense: effectiveCoachDirectives(team.tactics, p, 'offense', line === 'oLine' ? 'offense' : 'defense'),
          defense: effectiveCoachDirectives(team.tactics, p, 'defense', line === 'oLine' ? 'offense' : 'defense') })) }
    }
    playNextPoint(session, {}, { fastMode: false, collectFrames: true, rotateHome: false, rotateAway: false, aiHome: false, aiAway: false })
    result.points++; result.score = [session.homeScore, session.awayScore]
    recordPoint(session.lastPoint.events, wind, result.score)
    result.pointOutcomes.at(-1).playerCounts = playerCounts
    result.pointOutcomes.at(-1).observedPlayerCounts = structuredClone(pointFrameCounts)
    result.pointOutcomes.at(-1).forcedSubstitutions = result.forcedSubstitutions - substitutionsBefore
    result.checkpoints.push({ point, score: result.score, used, wind, roleAtStart, wallMs: performance.now() - t,
      playerCounts, observedPlayerCounts: structuredClone(pointFrameCounts), forcedSubstitutions: result.forcedSubstitutions - substitutionsBefore,
      staminaSummary: { home: staminaSummary(session.stamina.home), away: staminaSummary(session.stamina.away) },
      injuries: session.lastPoint.events.filter(e => e.type === 'injury') })
    result.status = session.status === 'finished' ? 'complete' : 'running'
    save(`checkpoints/${job.id}.json`, { ...result, scanSamples: undefined, checkpoints: result.checkpoints.slice(-1),
      updatedAt: new Date().toISOString(), elapsedMs: performance.now() - start })
    process.stdout.write(JSON.stringify({ job: job.id, point, score: result.score, wallMs: performance.now() - t }) + '\n')
    session.events = []
    session.lastPoint.events = []
    if (job.testPoints != null && result.points >= job.testPoints) break
  }
  result.status = job.testPoints != null ? 'test_sample' : session.status === 'finished' ? 'complete' : 'censored'
  result.fingerprint = fingerprint.digest('hex')
  result.matchStatus = session.status
  for (const side of ['home', 'away']) {
    if (result.sides[side].motion.nonfinite) hard('Nonfinite player motion state')
    if (result.sides[side].motion.displacementAlarms) warn({ side, type: 'sampled-motion-discontinuity', count: result.sides[side].motion.displacementAlarms })
    if (result.sides[side].goals !== result.score[side === 'home' ? 0 : 1]) hard('Score and goal events disagree')
  }
  for (const [category, candidate] of candidates) {
    const filename = `replays/${job.id}-${category}.json`; save(filename, candidate); result.replays.push(filename)
  }
} catch (error) {
  result.status = error.code === 'INVALID_LINEUP' ? 'invalid_lineup' : 'error'; result.error = error.stack; process.exitCode = 1
} finally {
  Math.random = originalRandom
  THROW_SCAN_DIAGNOSTICS.observe = originalObserver
  result.fallbackRandomCalls = fallbackRandomCalls
  result.timings = { wallMs: performance.now() - start, maxRssBytes: process.resourceUsage().maxRSS * 1024 }
  save(`jobs/${job.id}.json`, result)
}
