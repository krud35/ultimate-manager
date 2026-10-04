import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createDefenderAgent, tickDefenderBrain } from '../src/matchEngine/ai/defenderBrain.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { shouldAttemptPoach } from '../src/matchEngine/ai/tacticsBehavior.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'
import { instructionCompliance } from '../src/matchEngine/playerInstructions.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'
import { createRng } from '../src/matchEngine/rng.js'

const playerWith = (knowledge = 80, traits = []) => {
  const p = structuredClone(demoHomeTeam.players[0])
  p.traits = traits
  p.currentStamina = 100
  p.skills.defensive.defensiveSystemsKnowledge = knowledge
  return p
}
const tacticsFor = (p, instructions = [], directives = {}) => ({
  oLineCoachDirectives: { poachSeeking: -1, poachResetHandler: 1, ...directives },
  oLinePlayerInstructions: { [p.id]: instructions },
})
const target = { id: 'reset', player: { id: 'reset' }, x: 45, y: 18, isDump: true }
const thrower = { id: 'thrower', x: 40, y: 18 }
const baseCtx = { targetOffense: target, throwerAgent: thrower, disc: thrower,
  forceSide: 'force_forehand', dtSec: 0.02, stallCount: 2, defenseStyle: 'person',
  attackSign: 1, possessionTeam: 'home', rng: { float: () => 1 } }
const p = playerWith()
const tactics = tacticsFor(p)
const step = (agent, ms, changes = {}) => tickDefenderBrain(agent, {
  ...baseCtx, defenseTactics: tactics, ms, ...changes,
})
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Entry must change movement in the first tick and retain its timer/once flag.
const initial = createDefenderAgent(p, 45, 17)
let agent = step(initial, 0)
assert.equal(agent.state, 'POACHING')
assert.equal(agent.resetPoachDone, true)
assert.equal(agent.poachedFromId, target.id)
assert.ok(agent.poachUntil > 0 && agent.poachUntil <= 4000)
assert.ok(distance(agent, { x: 43.5, y: 18 }) < distance(initial, { x: 43.5, y: 18 }))
const until = agent.poachUntil
let poachFrames = 1
let firstRecoveryMs = null
let recoveryStartDistance = null
const movingTarget = { ...target, x: 49, y: 20 }
for (let ms = 20; ms <= 16000; ms += 20) {
  const recovering = ms >= until
  if (recovering && recoveryStartDistance === null) recoveryStartDistance = distance(agent, movingTarget)
  agent = step(agent, ms, recovering ? { targetOffense: movingTarget } : {})
  assert.ok([agent.x, agent.y, agent.vx, agent.vy].every(Number.isFinite))
  assert.equal(agent.resetPoachDone, true, 'once flag survives every recovery tick')
  if (!recovering) {
    assert.equal(agent.state, 'POACHING')
    assert.equal(agent.poachUntil, until, 'duration is not extended each tick')
    poachFrames++
  } else {
    firstRecoveryMs ??= ms
    assert.notEqual(agent.state, 'POACHING', 'expired reset cannot immediately re-enter')
    assert.equal(agent.poachUntil, 0)
    assert.equal(agent.poachedFromId, null)
  }
}
assert.ok(firstRecoveryMs >= until && firstRecoveryMs - until < 20)
assert.ok(distance(agent, movingTarget) < recoveryStartDistance / 2, 'defender physically recovers to a moving mark')
assert.equal(step(createDefenderAgent(p, 45, 17), 0).state, 'POACHING', 'fresh possession can poach again')
assert.equal(step(initial, 0, { targetOffense: { ...target, isDump: false, fieldRole: 'dump' } }).state,
  'POACHING', 'runtime dump role identifies reset when isDump is absent/false')
assert.notEqual(step(initial, 0, { targetOffense: { ...target, isDump: false } }).state, 'POACHING')
assert.notEqual(step(createDefenderAgent(p, 60, 17), 0).state, 'POACHING', 'distant defender stays with mark')
assert.equal(step(initial, 0, { isMarkerOnThrower: true }).state, 'MARKING_STALL')
assert.notEqual(step(initial, 0, { defenseTactics: tacticsFor(p, [], { poachResetHandler: 0 }) }).state, 'POACHING')

// Personal no_poach respects compliance without interfering with deep positioning.
const banned = tacticsFor(p, ['no_poach'])
assert.ok(instructionCompliance(p, 'defense', 'no_poach') >= 0.55)
assert.notEqual(step(initial, 0, { defenseTactics: banned }).state, 'POACHING')
const cancelled = step(step(initial, 0), 20, { defenseTactics: banned })
assert.notEqual(cancelled.state, 'POACHING', 'a newly applied personal ban ends an active lane leave')
assert.equal(cancelled.resetPoachDone, true)
for (const knowledge of [60, 65, 70]) {
  const low = playerWith(knowledge, ['hot_headed', 'fragile_ego', 'wants_the_disc', 'turnover_prone'])
  const start = createDefenderAgent(low, 45, 17)
  const unbanned = step(start, 0, { defenseTactics: tacticsFor(low) })
  const restricted = step(start, 0, { defenseTactics: tacticsFor(low, ['no_poach']) })
  assert.ok(instructionCompliance(low, 'defense', 'no_poach') < 0.55)
  assert.equal(restricted.state, 'POACHING', 'weak compliance is retained, not replaced by an absolute global ban')
  assert.ok(restricted.poachUntil > 0 && restricted.poachUntil < unbanned.poachUntil)
}
function deepTrace(helpDeep, instructions) {
  let a = createDefenderAgent(p, 50, 18)
  const other = createDefenderAgent({ ...p, id: 'other' }, 35, 18)
  const deepTarget = { ...target, x: 49, y: 18, isDump: false }
  const dt = tacticsFor(p, instructions, { helpDeep, poachResetHandler: 0 })
  for (let ms = 0; ms <= 6000; ms += 20) {
    a = step(a, ms, { defenseTactics: dt, targetOffense: deepTarget, defenseAgents: [a, other] })
    assert.notEqual(a.state, 'POACHING')
  }
  return [a.x, a.y]
}
const deepOn = deepTrace(1, ['no_poach']), deepOff = deepTrace(-1, ['no_poach'])
assert.deepEqual(deepOn, deepTrace(1, []), 'personal ban does not change independent helpDeep positioning')
assert.ok(deepOn[0] > deepOff[0] + 0.5, 'helpDeep still moves the defender deeper under a poach ban')

// Matched opportunities use the same random quantile, testing nested decisions,
// not just a noisy aggregate. Include low/high knowledge, personality, familiarity,
// team bans/neutral/encouragement, and restrictive tactical situations.
let comparisons = 0, baseAttempts = 0, bannedAttempts = 0, positiveAttempts = 0
const opportunities = [
  { defenseStyle: 'person', distToDisc: 4, distToLane: 1, separationToMark: 1, canPoachRole: true, activePoachers: 0 },
  { defenseStyle: 'all_person', distToDisc: 7, distToLane: 3, separationToMark: 2, canPoachRole: true, activePoachers: 0 },
  { defenseStyle: 'person', distToDisc: 20, distToLane: 9, separationToMark: 1, canPoachRole: false, activePoachers: 0 },
  { defenseStyle: 'person', distToDisc: 4, distToLane: 1, separationToMark: 5, canPoachRole: true, activePoachers: 0 },
  { defenseStyle: 'person', distToDisc: 4, distToLane: 1, separationToMark: 1, canPoachRole: true, activePoachers: 7 },
]
for (const knowledge of [60, 65, 70, 80, 90, 95]) {
  for (const traits of [[], ['hot_headed', 'fragile_ego', 'wants_the_disc', 'turnover_prone'], ['professional', 'disciplined'], ['poacher']]) {
    const pl = playerWith(knowledge, traits)
    for (const familiarity of [0, 100]) for (const seeking of [-1, 0, 1]) {
      const neutral = { ...tacticsFor(pl, [], { poachSeeking: seeking }), tacticsFamiliarity: familiarity }
      const noPoach = { ...tacticsFor(pl, ['no_poach'], { poachSeeking: seeking }), tacticsFamiliarity: familiarity }
      const mods = mergeTraitAndCoachMods(pl, noPoach, 'defense')
      const ordinaryMods = mergeTraitAndCoachMods(pl, neutral, 'defense')
      assert.ok(mods.poachSeekingMode <= 0)
      assert.equal(mods.cushionDeltaM, ordinaryMods.cushionDeltaM, 'ban affects decisions, not cushion')
      for (const opportunity of opportunities) for (let q = 0; q < 250; q++) {
        const ctx = { ...opportunity, stallCount: q % 2 ? 2 : 7, rng: { float: () => q / 250 } }
        const ordinary = shouldAttemptPoach(pl, { ...ctx, defenseTactics: neutral })
        const restricted = shouldAttemptPoach(pl, { ...ctx, defenseTactics: noPoach })
        assert.ok(!restricted || ordinary, `adding no_poach created opportunity at knowledge=${knowledge}, seeking=${seeking}`)
        comparisons++
        baseAttempts += Number(ordinary)
        bannedAttempts += Number(restricted)
      }
    }
    const positive = tacticsFor(pl, ['poach'], { poachSeeking: -1 })
    assert.equal(mergeTraitAndCoachMods(pl, positive, 'defense').poachSeekingMode, 0,
      'explicit positive instruction continues to override team ban')
    assert.equal(shouldAttemptPoach(pl, { ...opportunities[0], stallCount: 2,
      rng: { float: () => 0 }, defenseTactics: positive }), true)
    positiveAttempts++
  }
}
assert.ok(baseAttempts > bannedAttempts && bannedAttempts > 0, 'compliance still permits occasional low-knowledge disobedience')

// Ordinary poach remains short and retains its recovery cooldown.
const ordinaryTactics = tacticsFor(p, [], { poachSeeking: 0, poachResetHandler: 0 })
const ordinaryCtx = { defenseTactics: ordinaryTactics, rng: { float: () => 0 } }
let ordinary = step(initial, 0, ordinaryCtx)
assert.equal(ordinary.state, 'POACHING')
const ordinaryUntil = ordinary.poachUntil
for (let ms = 20; ms <= ordinaryUntil + 1600; ms += 20) {
  ordinary = step(ordinary, ms, ordinaryCtx)
  if (ms >= ordinaryUntil) assert.notEqual(ordinary.state, 'POACHING', 'ordinary cooldown survives recovery')
}

// Real action snapshots must carry the once flag across a catch. A turnover
// changes the player's role and must clear it before the next defensive possession.
const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
for (const team of [home, away]) team.tactics = { ...defaultTacticsForPlayers(team.players),
  oLineCoachDirectives: { poachSeeking: -1, poachResetHandler: 1 } }
const action = (possessionTeam, throwerIndex, seedStates = null) => {
  const offenseTeam = possessionTeam === 'home' ? home : away
  const defenseTeam = possessionTeam === 'home' ? away : home
  const offenseLineup = offenseTeam.players.slice(0, 7), defenseLineup = defenseTeam.players.slice(0, 7)
  return runContinuousThrowSimulation({ rng: createRng(7221), thrower: offenseLineup[throwerIndex],
    offenseLineup, defenseLineup,
    personMatchups: new Map(offenseLineup.map((pl, index) => [pl.id, defenseLineup[index]])),
    possessionTeam, discPosition: 40, discYMeters: 18, stallCount: 1,
    offenseTeam, defenseTeam, maxTicks: 2, collectFrames: false, seedStates }).endStates
}
const firstAction = action('home', 0)
const departedReset = [...firstAction.values()].find(a => a.role === 'defense' && a.resetPoachDone)
assert.ok(departedReset, 'the fixture starts a real reset poach in the full action loop')
const secondAction = action('home', 2, firstAction)
assert.equal(secondAction.get(departedReset.id).resetPoachDone, true, 'same team possession preserves the once flag')
assert.notEqual(secondAction.get(departedReset.id).state, 'POACHING', 'a completed pass must not restart the reset poach')
const turnoverAction = action('away', 0, secondAction)
assert.equal(turnoverAction.get(departedReset.id).role, 'offense')
assert.equal(turnoverAction.get(departedReset.id).resetPoachDone, false, 'turnover clears the old defensive flag')
const nextDefensivePossession = action('home', 0, turnoverAction)
assert.equal(nextDefensivePossession.get(departedReset.id).resetPoachDone, true,
  'a new defensive possession enables reset poach again')
console.log(JSON.stringify({ pass: true, resetPoach: { poachFrames, until, firstRecoveryMs,
  finalDistanceToMark: distance(agent, movingTarget) }, deepOn, deepOff,
  comparisons, baseAttempts, bannedAttempts, positiveOverrides: positiveAttempts,
  fullActionContinuity: 'two same-possession actions and two turnovers passed' }, null, 2))
