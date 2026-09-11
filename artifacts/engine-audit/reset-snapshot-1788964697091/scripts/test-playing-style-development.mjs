import assert from 'node:assert/strict'
import {updatePlayingStyles} from '../src/career/playingStyleDevelopment.js'
import {evaluateStyleMatch} from '../src/career/playingStylePractice.js'
import {playingStyleMessages} from '../src/career/playingStyleMessages.js'
import {getPlayerTraits,getTraitMods} from '../src/models/playerTraits.js'
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
