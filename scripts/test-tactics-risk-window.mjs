import assert from 'node:assert/strict'
import { applyRiskInstructionScore } from '../src/matchEngine/ai/throwerDecision.js'
import { THROW_TYPE } from '../src/matchEngine/throwTypes.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'

const player = { ...structuredClone(demoHomeTeam.players[0]), traits: [] }
const mods = instruction => mergeTraitAndCoachMods(player, {
  oLinePlayerInstructions: { [player.id]: instruction ? [instruction] : [] },
}, 'offense')
const neutral = mods(null), safe = mods('safe_throws'), creative = mods('take_risks')
assert.ok(safe.safeOptionBias > 0 && creative.creativeRiskBias > 0, 'real instructions reach scoring')
const situation = window => ({ separation: 4.3, throwWindowScore: window, isOpenSide: true })
const delta = (window, instructionMods) => applyRiskInstructionScore(70, situation(window), THROW_TYPE.STANDARD, false, instructionMods)
  - applyRiskInstructionScore(70, situation(window), THROW_TYPE.STANDARD, false, neutral)
for (const window of [1, 19, 25, 30, 34.999]) assert.ok(delta(window, safe) < 0, 'safe instruction penalizes weak windows in point units')
for (const window of [35, 45, 55, 80, 100]) assert.equal(delta(window, safe), 0, 'strong windows do not get the weak-window penalty')
for (const window of [25, 35, 45, 54.999]) assert.ok(delta(window, creative) > 0, 'creative instruction recognizes semi-open windows')
for (const window of [0, 24.999, 55, 100]) assert.equal(delta(window, creative), 0, 'creative window bonus has bounded exposure')
for (const instructionMods of [safe, creative]) {
  const half = { safeOptionBias: (instructionMods.safeOptionBias ?? 0) / 2,
    creativeRiskBias: (instructionMods.creativeRiskBias ?? 0) / 2 }
  assert.ok(Math.abs(delta(30, half) * 2 - delta(30, instructionMods)) < 1e-10, 'compliance scales the preference without changing units')
}
assert.ok(applyRiskInstructionScore(70, situation(80), THROW_TYPE.STANDARD, true, safe)
  > applyRiskInstructionScore(70, situation(80), THROW_TYPE.STANDARD, false, safe), 'existing safe reset preference remains')
assert.ok(applyRiskInstructionScore(70, { ...situation(80), isOpenSide: false }, THROW_TYPE.OVER_THE_TOP, false, creative)
  > applyRiskInstructionScore(70, situation(80), THROW_TYPE.STANDARD, false, creative), 'existing creative break/overhead preference remains')
console.log('PASS real instruction exposure, 0–100 score boundaries, compliance and retained reset/break preferences')
