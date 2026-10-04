import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { layoutPlayersOnField, discPositionFromFieldMeters } from '../src/matchEngine/fieldViz.js'
import { formationStructuralTarget } from '../src/matchEngine/ai/tacticsBehavior.js'
import { offenseLineSlotsForAttackStyle } from '../src/matchEngine/offenseLineSlots.js'
import { assignActiveCutters } from '../src/matchEngine/ai/activeCutters.js'
import { createCutterAgent, tickCutterBrain } from '../src/matchEngine/ai/cutterBrain.js'
import { runContinuousThrowSimulation } from '../src/matchEngine/ai/actionSimulator.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { defaultTacticsForPlayers } from '../src/matchEngine/tacticsModifiers.js'
import { createRng } from '../src/matchEngine/rng.js'

const lineup = structuredClone(demoHomeTeam.players.slice(0, 7))
const slots = offenseLineSlotsForAttackStyle('hex_offense')
const roleById = new Map(lineup.map((p, i) => [p.id, slots[i].defaultSubRole]))
const disc = { x: 50, y: 18.5 }
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message)
const expectedVertices = [[9, 0], [4.5, Math.sqrt(3) * 4.5], [-4.5, Math.sqrt(3) * 4.5],
  [-9, 0], [-4.5, -Math.sqrt(3) * 4.5], [4.5, -Math.sqrt(3) * 4.5]]
let handlerOffers = 0

for (const possessionTeam of ['home', 'away']) for (const thrower of lineup) {
  const attackSign = possessionTeam === 'home' ? 1 : -1
  const layout = layoutPlayersOnField(lineup, possessionTeam, disc.x, true, {
    attackStyle: 'hex_offense', throwerId: thrower.id, attackSign, discYMeters: disc.y,
  })
  const agents = layout.map(p => ({ ...createCutterAgent(lineup.find(pl => pl.id === p.id), p.x, p.y),
    stackIndex: p.stackIndex, fieldRole: p.fieldRole, subRole: roleById.get(p.id),
    isThrower: p.id === thrower.id, isDump: roleById.get(p.id).endsWith('handler') }))
  agents.filter(p => p.isDump && !p.isThrower).forEach((p, i) => { p.handlerSlotIndex = i })
  assignActiveCutters(agents, 3, 0, true)
  assert.equal(agents.filter(a => a.isDump).length, 2, 'HEX retains its two handler specializations')
  const targets = []
  for (const agent of agents.filter(a => !a.isThrower)) {
    const beforeRole = agent.subRole, beforeActive = agent.isActive
    const target = formationStructuralTarget({ ...agent, attackStyle: 'hex_offense',
      disc, throwerPos: disc, forceSide: 'force_forehand', possessionTeam, rng: { float: () => 0.5 } })
    const vertex = expectedVertices[agent.stackIndex - 1]
    near((target.x - disc.x) * attackSign, vertex[0], 'keep the declared HEX vertex along the attack axis')
    near(target.y - disc.y, vertex[1], 'keep the declared HEX vertex across the field')
    near(target.x, agent.x, 'live structure agrees with initial layout')
    near(target.y, agent.y, 'live structure agrees with initial layout')
    assert.equal(agent.subRole, beforeRole)
    assert.equal(agent.isActive, beforeActive, 'fixing geometry must not grant additional active cutter slots')
    targets.push(target)

    if (agent.isDump) {
      // A real handler brain after a catch must keep the same support vertex.
      // Previously pickResetTarget immediately sent it behind the new thrower.
      let moving = { ...agent, x: disc.x - attackSign * 2, y: disc.y, vx: 0, vy: 0 }
      const startX = moving.x
      for (let elapsedMs = 0; elapsedMs < 200; elapsedMs += 20) {
        moving = tickCutterBrain(moving, { dtSec: 0.02, disc, throwerPos: disc, possessionTeam,
          forceSide: 'force_forehand', situation: { separation: 5, throwWindowScore: 60, cloggingLevel: 0 },
          rng: createRng(823 + elapsedMs), stackIndex: moving.stackIndex, isDump: true,
          postCatchReorg: true, elapsedMs, activeCutters: 3, maxCutters: 3, attackStyle: 'hex_offense' })
        near(moving.targetX, target.x, 'post-catch reset/support must not erase the HEX vertex')
        near(moving.targetY, target.y, 'post-catch reset/support retains its assigned lane')
        assert.equal(moving.subRole, beforeRole)
        assert.equal(moving.isDump, true)
      }
      assert.ok((moving.x - startX) * attackSign > 0.05, 'the handler physically offers forward, without teleporting')
      assert.ok(Math.abs(moving.x - startX) < 2, 'short offer obeys movement integration')
      handlerOffers++
    }
  }
  assert.equal(new Set(targets.map(t => `${t.x},${t.y}`)).size, 6)
  assert.equal(targets.filter(t => (t.x - disc.x) * attackSign > 0.01).length, 3)
}

// Full action loop: after a cutter receives, both off-disc handlers retain their
// two forward vertices. Test the real layout/role resolution, not just helpers.
let actionOffers = 0
const oldObserver = THROW_SCAN_DIAGNOSTICS.observe
THROW_SCAN_DIAGNOSTICS.observe = () => {}
try {
  for (const possessionTeam of ['home', 'away']) {
    const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
    for (const team of [home, away]) team.tactics = { ...defaultTacticsForPlayers(team.players),
      oLineAttackStyle: 'hex_offense', dLineAttackStyle: 'hex_offense' }
    const offenseTeam = possessionTeam === 'home' ? home : away
    const defenseTeam = possessionTeam === 'home' ? away : home
    const offenseLineup = offenseTeam.players.slice(0, 7), defenseLineup = defenseTeam.players.slice(0, 7)
    const act = (throwerIndex, seedStates = null, anchor = { x: 50, y: 18.5 }) => runContinuousThrowSimulation({
      rng: createRng(82021), thrower: offenseLineup[throwerIndex], offenseLineup, defenseLineup,
      personMatchups: new Map(offenseLineup.map((p, i) => [p.id, defenseLineup[i]])),
      possessionTeam, discPosition: discPositionFromFieldMeters(anchor.x, possessionTeam), discYMeters: anchor.y, stallCount: 1,
      offenseTeam, defenseTeam, maxTicks: 3, seedStates, collectFrames: true,
    })
    const first = act(0)
    const catchAnchor = first.endStates.get(offenseLineup[2].id)
    const afterCatch = act(2, first.endStates, catchAnchor)
    const frame = afterCatch.frames.at(-1)
    const attackSign = possessionTeam === 'home' ? 1 : -1
    const offDiscIds = new Set(offenseLineup.filter(p => p.id !== offenseLineup[2].id).map(p => p.id))
    assert.ok(frame.players.filter(p => offDiscIds.has(p.id)
      && (p.audit.targetX - catchAnchor.x) * attackSign > 0).length >= 3,
    'post-catch movement keeps all three forward support vertices available')
    for (const handler of offenseLineup.slice(0, 2)) {
      const actual = frame.players.find(p => p.id === handler.id)
      assert.equal(actual.audit.isDump, true, 'full action preserves handler role after a cutter catch')
      assert.ok((actual.audit.targetX - catchAnchor.x) * attackSign > 0,
        `full action preserves forward handler support: ${JSON.stringify({ possessionTeam, actual, disc: frame.disc })}`)
      actionOffers++
    }
  }
} finally { THROW_SCAN_DIAGNOSTICS.observe = oldObserver }

// Other two-handler formations still use the existing behind-disc reset.
for (const attackStyle of ['vertical_stack', 'split_stack', 'side_stack']) {
  for (const possessionTeam of ['home', 'away']) {
    const attackSign = possessionTeam === 'home' ? 1 : -1
    const target = formationStructuralTarget({ attackStyle, disc, throwerPos: disc,
      possessionTeam, forceSide: 'force_forehand', stackIndex: 1, isDump: true, rng: { float: () => 0.5 } })
    assert.equal((target.x - disc.x) * attackSign, -1.5)
    const agent = { ...createCutterAgent(lineup[1], 50, 18.5), subRole: 'reset_handler', isDump: true }
    const moved = tickCutterBrain(agent, { dtSec: 0.02, disc, throwerPos: disc, possessionTeam,
      forceSide: 'force_forehand', situation: { separation: 5, throwWindowScore: 60, cloggingLevel: 0 },
      rng: createRng(823), stackIndex: 1, isDump: true, postCatchReorg: true, elapsedMs: 0,
      activeCutters: 3, maxCutters: 3, attackStyle })
    assert.ok((moved.targetX - disc.x) * attackSign < 0, 'other formations retain their post-catch reset search')
  }
}
console.log(JSON.stringify({ pass: true, layouts: 14, vertices: 84, handlerOffers,
  fullActionOffersAfterCatch: actionOffers, nonHexResetControls: 6 }, null, 2))
