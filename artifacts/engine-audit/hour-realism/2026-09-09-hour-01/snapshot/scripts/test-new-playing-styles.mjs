import assert from 'node:assert/strict'
import { demoHomeTeam } from '../src/data/demoMatchTeams.js'
import { TRAIT_DEFS, TRAITS_GEN_VERSION, styleAbilityWeight, getTraitMods } from '../src/models/playerTraits.js'
import { throwingFakePhase, doubleMoveSetup } from '../src/matchEngine/ai/traitBehavior.js'
import { tickDefenseAgent, createDefenderAgent } from '../src/matchEngine/ai/defenderBrain.js'
import { selectDiscIntercept } from '../src/matchEngine/ai/discIntercept.js'
import { createRng } from '../src/matchEngine/rng.js'
const make = traits => ({ ...structuredClone(demoHomeTeam.players[0]), traits, traitsGen: TRAITS_GEN_VERSION })
assert.equal(Object.values(TRAIT_DEFS).filter(t=>t.kind==='style').length,36)
assert.equal(throwingFakePhase(200,1),0)
assert(throwingFakePhase(440,1)>0)
assert.equal(throwingFakePhase(440,0),0)
assert(doubleMoveSetup(90).earlyPriority>doubleMoveSetup(60).earlyPriority)
assert(doubleMoveSetup(90).extraDelayMs<doubleMoveSetup(60).extraDelayMs)
const skilled={skills:{physical:{jump:90},offensive:{cutTiming:90,catching:90}}}
assert.equal(styleAbilityWeight('attacks_disc_high',skilled),4)
assert.equal(styleAbilityWeight('attacks_disc_high',{skills:{physical:{jump:90},offensive:{cutTiming:65,catching:90}}}),0.25)
const defend = trait => {
 const player=make(trait?[trait]:[])
 return tickDefenseAgent(createDefenderAgent(player,35,18),{targetOffense:{x:45,y:18,player:make([])},disc:{x:30,y:18},
  afterTurnover:true,ms:200,attackSign:1,dtSec:0.04,possessionTeam:'home',forceSide:'force_forehand',rng:createRng(15)})
}
assert(defend('recovery_defense').x>35)
assert.equal(getTraitMods(make(['recovery_defense'])).speedMult,getTraitMods(make([])).speedMult)
const intercept=trait=>{const player=make(trait?[trait]:[]);return selectDiscIntercept({agent:{x:40,y:18},player,role:'offense',speed:6,
 elapsedMs:0,totalMs:1800,sample:ms=>({x:40,y:18,z:3.4-ms/1000})})}
const normal=intercept(null),high=intercept('attacks_disc_high')
assert(high.atMs<normal.atMs)
assert(high.z>normal.z)
console.log('Five new styles: registry, fake windows, timing-aware setup, ability-weighted draw, recovery movement and high intercept passed')
