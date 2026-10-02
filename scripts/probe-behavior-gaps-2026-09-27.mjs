import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assignActiveCutters } from '../src/matchEngine/ai/activeCutters.js'
import { subRoleAllowsInitiateCut, resolvePlayerSubRole } from '../src/matchEngine/playerSubRoles.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'
import { formationStructuralTarget } from '../src/matchEngine/ai/tacticsBehavior.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { pickThrowType } from '../src/matchEngine/throwTypes.js'
import { createRng } from '../src/matchEngine/rng.js'
import { throwScanRadiusM, perceivedOptionLimit } from '../src/matchEngine/ai/statFormulas.js'
import { setPlayerMods, clearPointPlayerMods } from '../src/matchEngine/playerModsRegistry.js'

const observations = {}
const roles = ['primary_cutter', 'secondary_cutter', 'continuation_cutter', 'filler_cutter']
const agents = roles.map((subRole, stackIndex) => ({ id: stackIndex, subRole, stackIndex, state: 'WAITING' }))
const situation = { throwWindowScore: 100, separation: 12, cloggingLevel: 0 }
observations.eligibility = []
for (const ms of [0, 1200, 4500, 6500]) {
  const copy = structuredClone(agents)
  assignActiveCutters(copy, 3, ms, true)
  observations.eligibility.push({ ms, agents: copy.map(a => ({ role: a.subRole, selected: a.isActive,
    allowsGreatOpportunity: subRoleAllowsInitiateCut(a.subRole, situation, { reorgWindow: true }) })) })
}
assert.equal(observations.eligibility[0].agents[2].selected, false)
assert.equal(observations.eligibility[0].agents[2].allowsGreatOpportunity, true)

const player = structuredClone(demoHomeTeam.players[0])
const tactics = { playerSubRoles: { [player.id]: 'reset_handler' } }
observations.roleMismatch = { resolvedRole: resolvePlayerSubRole(tactics, player.id, { role: 'cutter', roleIndex: 1 }),
  mergedMods: { cutRollMult: mergeTraitAndCoachMods(player, tactics).cutRollMult,
    preferDumpRole: mergeTraitAndCoachMods(player, tactics).preferDumpRole } }
assert.equal(observations.roleMismatch.resolvedRole, 'primary_cutter')
assert.equal(observations.roleMismatch.mergedMods.preferDumpRole, true)

const context = { attackStyle: 'horizontal_stack', x: 40, y: 18, disc: { x: 40, y: 18 },
  throwerPos: { x: 40, y: 18 }, forceSide: 'force_forehand', possessionTeam: 'home', rng: { float: () => 0.5 } }
observations.handlerSlots = [1, 2].map(stackIndex => ({ stackIndex,
  formation: formationStructuralTarget({ ...context, stackIndex, isDump: false }),
  handler: formationStructuralTarget({ ...context, stackIndex, isDump: true }) }))
assert.deepEqual(observations.handlerSlots[0].handler, observations.handlerSlots[1].handler)
assert.notDeepEqual(observations.handlerSlots[0].formation, observations.handlerSlots[1].formation)

const makeTactics = instruction => ({ oLinePlayerInstructions: { [player.id]: [instruction] } })
observations.highStall = {}
for (const stallCount of [1, 8]) {
  let differences = 0
  const distributions = [{}, {}]
  for (let seed = 1; seed <= 1000; seed++) {
    const choices = ['throw_hucks', 'no_hucks'].map((instruction, index) => {
      const choice = pickThrowType({ rng: createRng(Math.imul(seed, 2654435761)), thrower: player, defender: demoAwayTeam.players[0],
        stallCount, discPosition: 45, defenseStyle: 'person', attackStyle: 'vertical_stack',
        separation: { outcome: 'open' }, tactics: makeTactics(instruction) })
      distributions[index][choice] = (distributions[index][choice] ?? 0) + 1
      return choice
    })
    if (choices[0] !== choices[1]) differences++
  }
  observations.highStall[stallCount] = { differences, distributions }
}
assert.equal(observations.highStall[8].differences, 0)
assert.ok(observations.highStall[1].differences > 0)

const dominate = mergeTraitAndCoachMods(player, makeTactics('dominate'))
const before = { radius: throwScanRadiusM(player), options: perceivedOptionLimit(player) }
setPlayerMods(player, dominate)
observations.dominatePerception = { mergedRadiusBonus: dominate.scanRadiusBonusM,
  mergedOptionsBonus: dominate.perceivedOptionsBonus, actualRadius: throwScanRadiusM(player),
  actualOptionLimit: perceivedOptionLimit(player), before,
  note: 'Instruction reaches perception through point player-mods registry.' }
assert.ok(dominate.scanRadiusBonusM > 0)
assert.ok(observations.dominatePerception.actualRadius > before.radius)
clearPointPlayerMods()
fs.writeFileSync('artifacts/match-behavior-2026-09-27/mechanisms.json', JSON.stringify(observations, null, 2))
console.log(JSON.stringify(observations, null, 2))
