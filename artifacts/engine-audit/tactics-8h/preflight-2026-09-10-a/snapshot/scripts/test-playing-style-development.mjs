import assert from 'node:assert/strict'
import {updatePlayingStyles} from '../src/career/playingStyleDevelopment.js'
import {evaluateStyleMatch} from '../src/career/playingStylePractice.js'
import {playingStyleMessages} from '../src/career/playingStyleMessages.js'
import {getPlayerTraits,getTraitMods,replacePlayerTraits} from '../src/models/playerTraits.js'
const date=w=>new Date(Date.UTC(2026,0,5+w*7)).toISOString().slice(0,10)
const match=(w,strength=1,mode='full')=>({key:`${w}`,date:date(w),pointsPlayed:12,evidence:{modes:{[mode]:{
 observed:['cutStarts','underCuts','deepCuts'],counters:{cutStarts:20,underCuts:20*strength,deepCuts:20*(1-strength)},contexts:{},
}}}})
const run=(p,w,strength=1)=>{p.playingStyleMatches=[...(p.playingStyleMatches??[]).slice(-11),match(w,strength)];return updatePlayingStyles(p,date(w),Math.floor(w/52))}
const p={id:1,age:18,traits:['loyal','huck_lover']};const events=[]
for(let w=0;w<25;w++)events.push(...run(p,w))
assert(p.traits.includes('under_cutter'));assert(p.traits.includes('loyal'))
assert.equal(events.filter(e=>e.kind==='acquired').length,1)
const before=structuredClone(p);updatePlayingStyles(p,date(24),0);assert.deepEqual(p,before)
const loaded=JSON.parse(JSON.stringify(p));assert.deepEqual(updatePlayingStyles(loaded,date(24),0),[])
// Sparse schedule and injury never treat missing activity as disuse.
for(let w=25;w<40;w++)updatePlayingStyles(p,date(w),0)
assert.equal(p.playingStyleDevelopment.styles.under_cutter.level,100)
p.injury={daysRemaining:60};for(let w=40;w<50;w++)run(p,w,0)
assert.equal(p.playingStyleDevelopment.styles.under_cutter.level,100);delete p.injury
for(let w=50;w<95;w++)events.push(...run(p,w,0))
assert(!p.traits.includes('under_cutter'))
assert(p.traits.includes('deep_threat'))
assert(events.some(e=>e.kind==='weakening'))
assert(events.some(e=>e.kind==='lost'||e.kind==='replaced'))
assert(p.playingStyleDevelopment.memory.under_cutter)
assert(p.traits.includes('loyal'))
getTraitMods(p)
const unsupported={id:2,age:20,traits:['fakes_a_lot'],playingStyleMatches:[{key:'a',date:date(0),evidence:{modes:{fast:{observed:['throws'],counters:{throws:30}}}}}]}
assert.equal(evaluateStyleMatch(unsupported.playingStyleMatches[0],'fakes_a_lot'),null)
updatePlayingStyles(unsupported,date(0));assert.equal(unsupported.playingStyleDevelopment.styles.fakes_a_lot.level,100)
// Same common throw evidence in either mode has identical normalized weight.
const throwing=mode=>({evidence:{modes:{[mode]:{observed:['throws'],counters:{throws:20},throwResults:{'huck|backhand|unobserved':{attempts:12,completions:6},'standard|forehand|unobserved':{attempts:8,completions:8}}}}}})
assert.deepEqual(evaluateStyleMatch(throwing('full'),'huck_lover'),evaluateStyleMatch(throwing('fast'),'huck_lover'))
assert.equal(evaluateStyleMatch(throwing('fast'),'good_insides'),null)
const notifications=playingStyleMessages([{kind:'acquired',style:'under_cutter',date:date(1),playerId:1,playerName:'Test',teamId:'a'}],'a')
assert.equal(notifications.length,1);assert(!notifications[0].body.includes('100'))
assert.equal(playingStyleMessages([{teamId:'b'}],'a').length,0)
console.log('Acquisition, protection, inactivity, injury, decay, replacement, memory, save/load, common-mode parity and notifications passed')
const report=[]
for(const age of [18,22,26,30,35]){
 const player={id:age,age,traits:['loyal','under_cutter']};let added=0,lost=0
 for(let w=0;w<156;w++){
  player.age=age+Math.floor(w/52)
  for(const event of run(player,w,w<52||w>=104?1:0)){if(event.kind==='acquired'||event.kind==='replaced')added++;if(event.kind==='lost'||event.kind==='replaced')lost++}
  assert(getPlayerTraits(player).filter(t=>t!=='loyal').length<=6)
  assert(player.traits.includes('loyal'))
 }
 report.push({startingAge:age,acquisitions:added,losses:lost,finalStyles:player.traits.join(',')})
}
console.table(report)

// Current practice, caps, age and technical retention are independent safeguards.
const timing=[]
for(const age of [18,22,26,30,35]) {
 const player={id:age,age,traits:['loyal','huck_lover']}
 let acquiredAt=null
 for(let w=0;w<60;w++)if(run(player,w).some(e=>e.style==='under_cutter'&&e.kind==='acquired')){acquiredAt=w;break}
 assert(acquiredAt!=null)
 timing.push(acquiredAt)
}
assert(timing[0]<timing[2]&&timing[2]<timing[4])
console.log('Weeks to learn under (ages 18/22/26/30/35):',timing)
const capped={id:3,age:18,traits:['huck_lover','good_insides','good_arounds','fakes_a_lot','sideline_receiver','recovery_defense']}
for(let w=0;w<30;w++)run(capped,w)
assert.equal(capped.traits.length,6);assert(!capped.traits.includes('under_cutter'))
replacePlayerTraits(capped,capped.traits.filter(t=>t!=='sideline_receiver'))
run(capped,30,0)
assert(!capped.traits.includes('under_cutter'),'A free slot cannot grant a habit no longer practiced')
run(capped,31,1);run(capped,32,1)
assert(capped.traits.includes('under_cutter'))
const lastStyle={id:4,age:18,traits:['under_cutter']}
updatePlayingStyles(lastStyle,date(0))
for(let w=1;w<80;w++) {
 // Neither under nor deep: no opposing candidate can fill the final slot.
 const m=match(w,0);m.evidence.modes.full.counters.deepCuts=0
 lastStyle.playingStyleMatches=[m];updatePlayingStyles(lastStyle,date(w))
}
assert.deepEqual(lastStyle.traits,['under_cutter'],'Keep the minimum of one style')
const technical={id:5,age:18,traits:['good_insides','huck_lover'],trainingFocus:'throwing'}
for(let w=0;w<90;w++) {
 technical.playingStyleMatches=[{key:String(w),date:date(w),...throwing('full')}]
 technical.playingStyleMatches[0].evidence.modes.full.throwResults={'standard|forehand|natural':{attempts:20,executionSamples:20,absoluteCurveError:0}}
 updatePlayingStyles(technical,date(w))
}
assert.equal(technical.playingStyleDevelopment.styles.good_insides.level,100)
const contextMatch=match(0)
contextMatch.evidence.modes.full.contexts={individual_instructions:{cutStarts:20}}
contextMatch.evidence.instructionSnapshots=[{individual:['tight_mark']}]
assert.equal(evaluateStyleMatch(contextMatch,'under_cutter').independence,1)
contextMatch.evidence.instructionSnapshots=[{individual:['cut_under']}]
assert.equal(evaluateStyleMatch(contextMatch,'under_cutter').independence,.7)
console.log('Age curve, cap, stale candidates, minimum count, technical training and relevant instructions passed')
const remembered={id:6,age:18,traits:['huck_lover']}
updatePlayingStyles(remembered,date(0),0)
remembered.playingStyleDevelopment.memory.under_cutter=true
let relearnedAt=null
for(let w=1;w<30;w++)if(run(remembered,w).some(e=>e.kind==='acquired')){relearnedAt=w;break}
assert(relearnedAt<timing[0],'Remembered habits return sooner')
for(const age of [18,30]) {
 const limited={id:age,age,traits:['huck_lover']}
 updatePlayingStyles(limited,date(0),0)
 limited.playingStyleDevelopment.acquired=age===18?2:1
 limited.playingStyleDevelopment.candidates.under_cutter={progress:100,matches:20,first:date(0)}
 for(let w=10;w<20;w++)run(limited,w)
 assert(!limited.traits.includes('under_cutter'))
 run(limited,52)
 assert(limited.traits.includes('under_cutter'),'A new season resets the acquisition cap')
}
const cached={id:88,age:25,traits:['huck_lover']}
const oldMods=getTraitMods(cached)
replacePlayerTraits(cached,['under_cutter'])
assert.notDeepEqual(getTraitMods(cached),oldMods,'New styles immediately affect the engine cache')
console.log('Relearning, annual limits and modifier cache invalidation passed')
