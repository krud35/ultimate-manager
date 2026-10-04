/** Read-only mechanism audit; intentionally does not assert today's faulty output.
 * Run: node scripts/probe-tactics-balance-mechanisms.mjs
 * Assertions validate reproducibility, units and fixture preconditions. The
 * observations describe semantic discrepancies for before/after comparison.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { DOMINANT_HAND } from '../src/models/playerProfile.js'
import { createRng } from '../src/matchEngine/rng.js'
import { forceMarkPosition, tickDefenderBrain, createDefenderAgent, STALL_MARK_DISTANCE_M } from '../src/matchEngine/ai/defenderBrain.js'
import { evaluatePlayerSituation } from '../src/matchEngine/ai/spatialEvaluator.js'
import { shouldAttemptPoach } from '../src/matchEngine/ai/tacticsBehavior.js'
import { openSideSign, breakSideSign, resetLateralSign } from '../src/matchEngine/ai/offenseReorganization.js'
import { forceMarkLayoutSide, resolveActiveForceGrip } from '../src/matchEngine/throwTechnique.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'
import { FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { fieldCenterY } from '../src/matchEngine/fieldDimensions.js'

const makePlayer = () => ({ ...structuredClone(demoHomeTeam.players[0]), traits: [], currentStamina: 100 })
const rounded = n => Math.round(n * 1e6) / 1e6

function resetPoachTrace(resetPoach) {
  const player = makePlayer()
  const tactics = { oLineCoachDirectives: { poachSeeking: -1, poachResetHandler: resetPoach } }
  const target = { id: 'probe-reset', player: { ...makePlayer(), id: 'probe-reset' }, x: 45, y: 18, isDump: true }
  const thrower = { id: 'probe-thrower', x: 40, y: 18 }
  let agent = createDefenderAgent(player, 45, 17)
  const mods = mergeTraitAndCoachMods(player, tactics, 'defense')
  assert.ok(mods.poachSeekingMode <= -0.55, 'fixture must isolate reset poach from ordinary stochastic poach')
  if (resetPoach) assert.ok(mods.poachResetHandlerBias > 0, 'reset directive must reach the defender')
  assert.ok(Math.hypot(agent.x - thrower.x, agent.y - thrower.y) <= 14)
  assert.notEqual(target.id, player.id)
  const rng = createRng(8103)
  const frames = []
  for (let tick = 0; tick < 250; tick++) {
    agent = tickDefenderBrain(agent, { targetOffense: target, throwerAgent: thrower, disc: thrower,
      forceSide: 'force_forehand', dtSec: 0.02, ms: tick * 20, stallCount: 1 + tick * 0.02,
      defenseStyle: 'person', defenseTactics: tactics, attackSign: 1, possessionTeam: 'home', rng })
    assert.ok([agent.x, agent.y, agent.vx ?? 0, agent.vy ?? 0].every(Number.isFinite))
    frames.push([agent.x, agent.y, agent.vx ?? 0, agent.vy ?? 0, agent.state,
      agent.poachUntil ?? 0, agent.resetPoachDone ?? false])
  }
  return frames
}

function probeResetPoach() {
  const off = resetPoachTrace(0), on = resetPoachTrace(1)
  assert.deepEqual(resetPoachTrace(0), off, 'off trace is deterministic')
  assert.deepEqual(resetPoachTrace(1), on, 'on trace is deterministic')
  const summarize = rows => ({ poachFrames: rows.filter(r => r[4] === 'POACHING').length,
    resetDoneFrames: rows.filter(r => r[6]).length, finalPosition: rows.at(-1).slice(0, 2).map(rounded) })
  return { seed: 8103, frames: on.length, durationSeconds: 5,
    off: summarize(off), on: summarize(on), identicalTrace: JSON.stringify(on) === JSON.stringify(off) }
}

function poachAttempts(instructions) {
  const player = makePlayer()
  const tactics = { oLineCoachDirectives: { poachSeeking: -1 },
    oLinePlayerInstructions: { [player.id]: instructions } }
  const mods = mergeTraitAndCoachMods(player, tactics, 'defense')
  const rng = createRng(554)
  let attempts = 0
  for (let i = 0; i < 10000; i++) if (shouldAttemptPoach(player, { defenseStyle: 'person',
    distToDisc: 4, distToLane: 1, separationToMark: 1, stallCount: 2,
    canPoachRole: true, activePoachers: 0, rng, defenseTactics: tactics })) attempts++
  assert.ok(Number.isFinite(mods.poachChanceMult) && mods.poachChanceMult >= 0)
  assert.ok(attempts >= 0 && attempts <= 10000)
  return { instructions, attempts, opportunities: 10000,
    mode: rounded(mods.poachSeekingMode), multiplier: rounded(mods.poachChanceMult) }
}

function probePoachBan() {
  const rows = [[], ['no_poach'], ['poach']].map(poachAttempts)
  assert.deepEqual([[], ['no_poach'], ['poach']].map(poachAttempts), rows, 'poach probes are deterministic')
  return { seed: 554, rows, extraBanDoesNotIncreasePoaches: rows[1].attempts <= rows[0].attempts }
}

function readWindowThresholds() {
  // Read the currently used literals, so this audit does not bake the old bug in.
  // A future refactor may remove this recognisable form; that means unavailable.
  const source = ['throwerBrain.js', 'throwerDecision.js'].map(file =>
    readFileSync(new URL(`../src/matchEngine/ai/${file}`, import.meta.url), 'utf8')).join('\n')
  const safe = source.match(/if \(window < ([\d.]+)\) score -= safe/)
  const creative = source.match(/if \(window >= ([\d.]+) && window < ([\d.]+)\) score \+= creative/)
  return { safeCeiling: safe ? Number(safe[1]) : null,
    creativeFloor: creative ? Number(creative[1]) : null,
    creativeCeiling: creative ? Number(creative[2]) : null }
}

function probeWindowScale() {
  const player = makePlayer(), rng = createRng(333), thresholds = readWindowThresholds()
  let min = Infinity, max = -Infinity, halfOpenWindows = 0, weakWindows = 0
  let currentSafeBranchMatches = 0, currentCreativeBranchMatches = 0
  for (let i = 0; i < 5000; i++) {
    const x = 25 + rng.float() * 45, y = 2 + rng.float() * 33
    const offensePositions = Array.from({ length: 6 }, (_, j) => ({ player: { id: `clogger-${j}` },
      x: x + (rng.float() - 0.5) * 12, y: y + (rng.float() - 0.5) * 12 }))
    const defensePositions = Array.from({ length: 7 }, () => ({
      x: x + (rng.float() - 0.5) * 12, y: y + (rng.float() - 0.5) * 12 }))
    const situation = evaluatePlayerSituation(player, { x, y, offensePositions, defensePositions,
      disc: { x: 40, y: fieldCenterY() }, throwerPos: { x: 40, y: fieldCenterY() }, forceSide: 'force_forehand' })
    const w = situation.throwWindowScore
    assert.ok(Number.isFinite(w) && w >= 0 && w <= 100, 'window scores are finite points in 0..100')
    min = Math.min(min, w); max = Math.max(max, w)
    if (w >= 25 && w < 55) halfOpenWindows++
    if (w < 35) weakWindows++
    if (thresholds.safeCeiling !== null && w < thresholds.safeCeiling) currentSafeBranchMatches++
    if (thresholds.creativeFloor !== null && w >= thresholds.creativeFloor && w < thresholds.creativeCeiling) currentCreativeBranchMatches++
  }
  assert.ok(halfOpenWindows > 0 && weakWindows > 0, 'fixture must exercise both documented score bands')
  return { seed: 333, scenes: 5000, range: [rounded(min), rounded(max)],
    thresholds, weakWindowsBelow35: weakWindows, halfOpenWindows25To55: halfOpenWindows,
    currentSafeBranchMatches: thresholds.safeCeiling === null ? null : currentSafeBranchMatches,
    currentCreativeBranchMatches: thresholds.creativeFloor === null ? null : currentCreativeBranchMatches }
}

function probeForceGeometry() {
  const player = makePlayer(), rows = []
  for (const force of Object.values(FORCE_SIDES)) for (const attackSign of [1, -1]) for (const y of [5, 32]) {
    const marker = forceMarkPosition(40, y, force, attackSign)
    assert.ok(Math.abs(Math.hypot(marker.x - 40, marker.y - y) - STALL_MARK_DISTANCE_M) < 1e-8,
      'marker displacement has the declared units and radius')
    const receiverYs = [y - 3, y + 3]
    const open = receiverYs.map(ry => evaluatePlayerSituation(player, {
      x: 40 + attackSign * 12, y: ry, disc: { x: 40, y }, throwerPos: { x: 40, y },
      forceSide: force, possessionTeam: attackSign > 0 ? 'home' : 'away' }).isOpenSide)
    rows.push({ force, attackSign, throwerY: y, markerDy: rounded(marker.y - y),
      layout: forceMarkLayoutSide(force, y, attackSign), openSign: openSideSign(force, y, attackSign),
      breakSign: breakSideSign(force, y, attackSign), resetSign: resetLateralSign(force, y, attackSign), receiverYs, open,
      gripRight: resolveActiveForceGrip(force, { throwerY: y, attackSign, dominantHand: DOMINANT_HAND.RIGHT }),
      gripLeft: resolveActiveForceGrip(force, { throwerY: y, attackSign, dominantHand: DOMINANT_HAND.LEFT }) })
  }
  return { rows, helperFacesMarker: rows.filter(r => r.markerDy && r.openSign === Math.sign(r.markerDy)).length,
    pairedLocalLanesHaveSameLabel: rows.filter(r => r.force !== 'force_straight' && r.open[0] === r.open[1]).length }
}

const resetPoach = probeResetPoach(), poachBan = probePoachBan(), windowScale = probeWindowScale(), forceGeometry = probeForceGeometry()
assert.deepEqual(probeWindowScale(), windowScale, 'window probes are deterministic')
assert.deepEqual(probeForceGeometry(), forceGeometry, 'force probes are deterministic')
const observations = []
if (resetPoach.identicalTrace) observations.push('Reset poach on/off has an identical five-second movement/state trace.')
if (!poachBan.extraBanDoesNotIncreasePoaches) observations.push('Adding no_poach increases poach attempts under a team ban.')
if (windowScale.currentSafeBranchMatches === 0 && windowScale.weakWindowsBelow35 > 0) observations.push('No measured weak window reaches the current safe-window branch.')
if (windowScale.currentCreativeBranchMatches === 0 && windowScale.halfOpenWindows25To55 > 0) observations.push('No measured half-open window reaches the current creative-window branch.')
if (forceGeometry.helperFacesMarker) observations.push('Some open-side helpers point towards the marker lateral offset.')
if (forceGeometry.pairedLocalLanesHaveSameLabel) observations.push('Opposite local passing lanes often receive the same open/break label.')
console.log(JSON.stringify({ purpose: 'Read-only diagnosis; assertions validate fixtures and reproducibility, observations are not fixed-output tests.',
  resetPoach, poachBan, windowScale, forceGeometry, observations }, null, 2))
