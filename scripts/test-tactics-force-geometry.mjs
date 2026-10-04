import assert from 'node:assert/strict'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { DOMINANT_HAND } from '../src/models/playerProfile.js'
import { FORCE_SIDES, ATTACK_STYLES, DEFENSE_STYLES } from '../src/matchEngine/tacticsModifiers.js'
import { fieldCenterY, geoTeam, attackDirectionX } from '../src/matchEngine/fieldDimensions.js'
import { forceOpenSideY, forceMarkLayoutSide, isForceOpenSide, normalizeForceMark,
  resolveThrowTechniqueForPlayer, resolveActiveForceGrip } from '../src/matchEngine/throwTechnique.js'
import { forceMarkPosition, STALL_MARK_DISTANCE_M } from '../src/matchEngine/ai/defenderBrain.js'
import { evaluatePlayerSituation } from '../src/matchEngine/ai/spatialEvaluator.js'
import { openSideSign, breakSideSign, resetSlotTarget, computeDynamicOffenseTarget,
  pickBreakSideClearTarget } from '../src/matchEngine/ai/offenseReorganization.js'
import { formationStructuralTarget, zoneStructuralTarget } from '../src/matchEngine/ai/tacticsBehavior.js'
import { layoutPlayersOnField } from '../src/matchEngine/fieldViz.js'
import { scanThrowOptions } from '../src/matchEngine/ai/throwerBrain.js'
import { resetPlayerPerception } from '../src/matchEngine/ai/playerPerception.js'
import { resolveThrow } from '../src/matchEngine/resolution.js'
import { createRng } from '../src/matchEngine/rng.js'

const cy = fieldCenterY()
const forces = Object.values(FORCE_SIDES)
const hands = [DOMINANT_HAND.RIGHT, DOMINANT_HAND.LEFT]
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: ${actual} !== ${expected}`)
const samePoint = (a, b, message) => { close(a.x, b.x, `${message}/x`); close(a.y, b.y, `${message}/y`) }
const player = hand => ({ ...structuredClone(demoHomeTeam.players[0]), dominantHand: hand,
  traits: [], currentStamina: 100, morale: 72 })
const expectedOpen = (force, y, a) => {
  switch (force) {
    case FORCE_SIDES.FORCE_FOREHAND: return a
    case FORCE_SIDES.FORCE_BACKHAND: return -a
    case FORCE_SIDES.FORCE_MIDDLE: return y < cy ? 1 : y > cy ? -1 : 0
    case FORCE_SIDES.FORCE_SIDELINE: return y < cy ? -1 : y > cy ? 1 : 0
    default: return 0
  }
}
const expectedTechnique = (hand, lateral, open, a) => {
  const rhForehand = lateral === 0 ? open * a >= 0 : lateral * a > 0
  return rhForehand === (hand === DOMINANT_HAND.RIGHT) ? 'forehand' : 'backhand'
}
let laneCases = 0
for (const force of forces) for (const a of [1, -1]) for (const hand of hands) for (const y of [5, cy, 32]) {
  const label = `${force}/${a}/${hand}/${y}`
  const p = player(hand)
  const open = expectedOpen(force, y, a)
  const possessionTeam = a > 0 ? 'home' : 'away'
  assert.equal(forceOpenSideY(force, y, a), open, label)
  assert.equal(openSideSign(force, y, a), open, label)
  assert.equal(breakSideSign(force, y, a), open ? -open : 0, label)
  assert.equal(forceMarkLayoutSide(force, y, a), open > 0 ? 'home' : open < 0 ? 'away' : 'middle', label)
  assert.equal(resolveActiveForceGrip(force, { throwerY: y, attackSign: a, dominantHand: hand }),
    open * a < 0 ? FORCE_SIDES.FORCE_BACKHAND : FORCE_SIDES.FORCE_FOREHAND, 'grip names the RH side')
  for (const bias of [-1, 0, 1]) {
    const marker = forceMarkPosition(40, y, force, a, bias)
    close(Math.hypot(marker.x - 40, marker.y - y), STALL_MARK_DISTANCE_M, `${label}/radius`)
    assert.equal(Math.sign(marker.y - y), open ? -open : 0, `${label}/blocking side`)
    assert.ok((marker.x - 40) * a > 0, `${label}/marker ahead`)
    const turned = forceMarkPosition(60, 37 - y, force, -a, bias)
    samePoint(turned, { x: 100 - marker.x, y: 37 - marker.y }, `${label}/180 degree rotation`)
  }
  for (const dy of [-3, 0, 3]) {
    const isOpen = open === 0 || dy * open >= 0
    const ctx = { forceSide: force, throwerY: y, attackSign: a, throwDy: dy, isOpenSide: isOpen }
    const situation = evaluatePlayerSituation(p, { x: 40 + a * 12, y: y + dy,
      disc: { x: 40, y }, throwerPos: { x: 40, y }, forceSide: force, possessionTeam })
    assert.equal(situation.isOpenSide, isOpen, `${label}/${dy}/local lane`)
    assert.equal(isForceOpenSide(force, y, y + dy, a), isOpen, `${label}/${dy}/shared lane`)
    const tech = resolveThrowTechniqueForPlayer(p, ctx)
    assert.equal(tech.technique, expectedTechnique(hand, dy, open, a), `${label}/${dy}/hand once`)
    assert.equal(tech.accuracyMult, isOpen ? 1 : 0.65, `${label}/${dy}/unchanged break penalty`)
    assert.equal(tech.blockRiskBonus, isOpen ? 0 : 10, `${label}/${dy}/unchanged block penalty`)
    const result = resolveThrow({ thrower: p, receiver: p, defender: null, executionOnly: true,
      rng: createRng(831), defenseStyle: DEFENSE_STYLES.PERSON, separation: { outcome: 'open', distanceM: 12 },
      throwDx: a * 12, throwDistanceM: Math.hypot(12, dy), ...ctx })
    assert.equal(result.throwTechnique, tech.technique, `${label}/${dy}/execution context`)
    const rotated = resolveThrowTechniqueForPlayer(p, { ...ctx, throwerY: 37 - y, attackSign: -a, throwDy: -dy })
    assert.equal(rotated.technique, tech.technique, `${label}/${dy}/rotation preserves technique`)
    laneCases++
  }
}
console.log(`PASS ${laneCases} lanes: 5 forces × 2 directions × 2 hands × 3 thrower Ys × 3 receiver offsets`)

// Local rather than absolute Y; old field-half classification failed both cases.
for (const a of [1, -1]) for (const y of [2, 35]) for (const dy of [-1, 1]) {
  const open = isForceOpenSide(FORCE_SIDES.FORCE_FOREHAND, y, y + dy, a)
  assert.equal(open, dy * a > 0)
}
for (const [alias, force] of [['home', 'force_forehand'], ['away', 'force_backhand'],
  ['middle', 'force_middle'], ['force_line', 'force_sideline'], ['straight_up', 'force_straight']]) {
  assert.equal(normalizeForceMark(alias), force)
}

// Same thrower, different cutter Y: the force cannot switch with the cutter.
for (const forceSide of forces) for (const a of [1, -1]) for (const y of [0.5, 5, cy, 32, 36.5]) {
  const disc = { x: 40, y }, possessionTeam = a > 0 ? 'home' : 'away'
  const common = { x: 53, disc, throwerPos: disc, forceSide, possessionTeam, attackSign: a,
    stackIndex: 2, throwerId: 'thrower', playerId: 'receiver' }
  for (const targetFn of [computeDynamicOffenseTarget, formationStructuralTarget]) {
    samePoint(targetFn({ ...common, y: 5, rng: createRng(11) }),
      targetFn({ ...common, y: 32, rng: createRng(11) }), 'structure uses thrower Y')
  }
  const reset = resetSlotTarget({ ...common, rng: createRng(11) })
  const clear = pickBreakSideClearTarget(40, y, disc, a, forceSide, createRng(11))
  for (const target of [reset, clear]) assert.ok(target.y >= 0.5 && target.y <= 36.5 && Number.isFinite(target.x))
  const open = expectedOpen(forceSide, y, a)
  if (open && y >= 5 && y <= 32) {
    assert.ok((reset.y - y) * open >= 0, 'reset on open side (or clamped at line)')
    assert.ok((clear.y - y) * open < 0, 'clear to blocked side')
  }
}
console.log('PASS thrower-relative structure, reset/clear direction, boundary clamps and legacy aliases')

// Field setup must retain the original force, including straight vs middle.
for (const forceSide of forces) for (const a of [1, -1]) for (const y of [5, cy, 32]) {
  const offense = layoutPlayersOnField(demoHomeTeam.players.slice(0, 7), 'home', 40, true,
    { throwerId: demoHomeTeam.players[0].id, attackSign: a, discYMeters: y })
  const thrower = offense.find(p => p.fieldRole === 'thrower')
  for (const defenseStyle of ['person', 'zone_cup', 'zone_wall']) {
    const defense = layoutPlayersOnField(demoAwayTeam.players.slice(0, 7), 'away', 40, false,
      { offenseLayout: offense, attackSign: a, discYMeters: y, forceSide, defenseStyle })
    const marker = defense.find(d => defenseStyle === 'person' ? d.markTargetId === thrower.id : d.fieldRole === 'zone_marker')
    assert.ok(marker, `${defenseStyle}/marker exists`)
    samePoint(marker, forceMarkPosition(thrower.x, thrower.y, forceSide, a), `${defenseStyle}/mark setup`)
    for (const cup of defense.filter(d => d.fieldRole === 'zone_cup')) {
      const expected = zoneStructuralTarget(cup.fieldRole, cup.roleSlotIndex, {
        discX: 40, discY: y, attackSign: a, zoneKind: defenseStyle === 'zone_cup' ? 'cup' : 'wall',
        openSideSign: expectedOpen(forceSide, y, a) })
      samePoint(cup, expected, 'cup setup follows runtime force')
    }
  }
}
console.log('PASS person/cup/wall initial mark and cup rotation share the force contract')

// Exercise real scanning and execution in both geometric directions, including
// a roster home team after sides swap. No hand-picked result object substitutes
// for the decision. Repeated observations give perception time to see the option.
let decisions = 0
for (const forceSide of forces) for (const sidesSwapped of [false, true]) for (const hand of hands) for (const y of [5, cy, 32]) {
  const possessionTeam = geoTeam('home', sidesSwapped), a = attackDirectionX(possessionTeam)
  const thrower = player(hand), receiver = { ...player(hand), id: 'force-test-receiver' }
  const open = expectedOpen(forceSide, y, a)
  for (const dy of open ? [open * 3] : [-3, 3]) {
    const tx = 40, ty = y
    const offense = [{ id: thrower.id, player: thrower, x: tx, y: ty, vx: 0, vy: 0, isThrower: true },
      { id: receiver.id, player: receiver, x: tx + a * 12, y: ty + dy, vx: 0, vy: 0,
        targetX: tx + a * 12, targetY: ty + dy, state: 'WAITING', isActive: true,
        isDump: false, subRole: 'primary_cutter' }]
    resetPlayerPerception(thrower)
    let decision = null
    for (const setupElapsedMs of [0, 250, 500, 750, 1000]) {
      decision = scanThrowOptions(thrower, offense, [], { disc: { x: tx, y: ty },
        possessionTeam, forceSide, stallCount: 2, setupElapsedMs, rng: createRng(55221 + setupElapsedMs),
        attackStyle: ATTACK_STYLES.VERTICAL_STACK, offenseTactics: {}, postCatchReorg: true })
    }
    assert.ok(decision, `${forceSide}/${a}/${hand}/${y}/${dy}: visible open receiver selected`)
    assert.equal(decision.player.id, receiver.id)
    const actualDy = decision.catchY - ty
    const ctx = { forceSide, throwerY: ty, attackSign: a, throwDy: actualDy, isOpenSide: decision.isOpenSide }
    const marker = forceMarkPosition(tx, ty, forceSide, a)
    assert.equal(decision.isOpenSide, true)
    if (open) assert.ok((marker.y - ty) * actualDy < 0, 'selected open lane is opposite the marker')
    assert.equal(decision.throwTechnique, expectedTechnique(hand, actualDy, open, a), 'decision technique')
    const result = resolveThrow({ thrower, receiver, defender: null, executionOnly: true,
      rng: createRng(832), defenseStyle: DEFENSE_STYLES.PERSON, throwType: decision.throwType,
      separation: { outcome: 'open', distanceM: 12 }, throwDx: decision.catchX - tx,
      throwDistanceM: Math.hypot(decision.catchX - tx, actualDy), ...ctx })
    assert.equal(result.throwTechnique, decision.throwTechnique, 'execution independently reconstructs decision technique')
    decisions++
  }
}
console.log(`PASS ${decisions} actual decisions → independent execution, including sidesSwapped and neutral marks`)
