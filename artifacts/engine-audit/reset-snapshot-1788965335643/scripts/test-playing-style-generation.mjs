import assert from 'node:assert/strict'
import { TRAIT_DEFS, rollTraitsForPlayer, ensurePlayerTraits } from '../src/models/playerTraits.js'
import { PLAYING_STYLE_CATEGORIES, STYLE_CATEGORY, initialStyleCount, styleCountWeights } from '../src/models/playingStyleGeneration.js'
assert.deepEqual(Object.keys(STYLE_CATEGORY).sort(), Object.keys(TRAIT_DEFS).filter(id=>TRAIT_DEFS[id].kind==='style').sort())
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length
const rows=[]
for(const age of [18,21,25,29,34]) for(const archetype of ['control_handler','under_cutter','matchup_defender','all_rounder']) {
 const family={control_handler:'thrower',under_cutter:'receiver',matchup_defender:'defense'}[archetype]
 const lengths=[], categories={thrower:0,receiver:0,offense:0,defense:0}
 // Exact count CDF without expensive roster construction.
 const histogram=[0,0,0,0,0,0]
 for(let i=0;i<1000;i++)histogram[initialStyleCount({age,archetype},()=> (i+0.5)/1000)-1]++
 assert.deepEqual(histogram,styleCountWeights({age,archetype}).map(p=>p*10))
 for(let id=1;id<=500;id++){
  const player={id,age,archetype}
  const traits=rollTraitsForPlayer(player)
  const styles=traits.filter(t=>TRAIT_DEFS[t].kind==='style')
  const counts=Object.fromEntries(Object.keys(PLAYING_STYLE_CATEGORIES).map(c=>[c,0]))
  styles.forEach(id=>{counts[STYLE_CATEGORY[id]]++;categories[STYLE_CATEGORY[id]]++})
  assert(styles.length>= (archetype==='all_rounder'?3:1) && styles.length<=6)
  assert.equal(new Set(styles).size,styles.length)
  if(family)assert.equal(STYLE_CATEGORY[styles[0]],family)
  if(styles.length>=3)assert(Object.values(counts).filter(Boolean).length>=2)
  assert(Math.max(...Object.values(counts))<=4)
  if(archetype==='all_rounder')assert(Math.max(...Object.values(counts))-Math.min(...Object.values(counts))<=1)
  const migrated={...player,traits:[...traits],traitsGen:6};ensurePlayerTraits(migrated)
  assert.deepEqual(migrated.traits,traits,'No conflicts hidden by migration')
  assert.deepEqual(rollTraitsForPlayer(player),traits)
  lengths.push(styles.length)
 }
 if(family)for(const cat of Object.keys(categories))if(cat!==family)assert(categories[family]>categories[cat])
 rows.push({age,archetype,average:+mean(lengths).toFixed(2)})
}
for(const traits of [[],['huck_lover'],['good_insides','good_arounds','loyal']]){
 const player={id:9,age:35,archetype:'all_rounder',traits:[...traits],traitsGen:5}
 ensurePlayerTraits(player)
 assert.deepEqual(player.traits,traits,'Old saves are never filled to new count')
}
console.table(rows)
console.log('Phase 1: age distributions, role preferences, balanced all-rounders, compatibility and legacy preservation passed')
