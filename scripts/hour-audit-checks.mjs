import assert from 'node:assert/strict'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { coachDirectivesForLine, effectiveCoachDirectives } from '../src/matchEngine/coachDirectives.js'
import { instructionsForPlayer } from '../src/matchEngine/playerInstructions.js'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'

const p = structuredClone(demoHomeTeam.players[0])
const tactics = normalizeTactics({
  oLineCoachDirectives: { huckAppetite: 1, helpDeep: -1 },
  dLineCoachDirectives: { huckAppetite: -1, helpDeep: 1 },
  oLinePlayerInstructions: { [p.id]: ['no_hucks'] }, dLinePlayerInstructions: {},
})
assert.equal(coachDirectivesForLine(tactics, 'offense').helpDeep, -1)
assert.equal(coachDirectivesForLine(tactics, 'defense').helpDeep, 1)
assert.equal(effectiveCoachDirectives(tactics, p, 'offense', 'offense').huckAppetite, 0, 'Individual no_hucks overrides O-line coach axis')
assert.ok(effectiveCoachDirectives(tactics, p, 'offense', 'defense').huckAppetite < 0, 'D-line offense after turnover retains D-line directive')
assert.ok(effectiveCoachDirectives(tactics, p, 'defense', 'offense').helpDeep < 0, 'O-line defense after turnover retains O-line directive')
assert.deepEqual(instructionsForPlayer(tactics, p.id, 'defense'), [])
assert.deepEqual(instructionsForPlayer(tactics, p.id, 'offense'), ['no_hucks'])
console.log('PASS: line scope, phase distinction, individual override; runtime traces evaluated separately.')
