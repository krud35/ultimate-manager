/** Normalized evidence, no invented observations for missing simulation features. */
const clamp = x => Math.max(0, Math.min(1, x))
export const STYLE_PRACTICE_RULES = {
 huck_lover:{throwTypes:['huck'],target:.3}, dump_guy:{throwTypes:['dump_swing'],target:.4},
 hammer_happy:{throwTypes:['over_the_top'],target:.2},
 good_insides:{curve:'reverse',technical:true,target:.12}, good_arounds:{curve:'natural',technical:true,target:.25},
 under_cutter:{num:'underCuts',den:'cutStarts',min:6,target:.65},
 deep_threat:{num:'deepCuts',den:'cutStarts',min:6,target:.65},
 long_cuts:{num:'cutMeters',den:'cutStarts',min:6,target:16},
 quick_cuts:{num:'cutMeters',den:'cutStarts',min:6,target:7,inverse:true},
 double_move_cutter:{num:'doubleMoves',den:'cutStarts',min:6,target:.35},
 fakes_a_lot:{num:'fakeActions',den:'fakeWindows',min:4,target:.6},
 sideline_receiver:{num:'sidelineSeconds',den:'offenseSeconds',min:60,target:.4},
 attacks_disc_high:{num:'jumpAttempts',den:'highDiscSeconds',min:8,target:.12},
 recovery_defense:{num:'recoverySeconds',den:'transitionSeconds',min:12,target:.45},
}
export function evaluateStyleMatch(match, style) {
 const rule=STYLE_PRACTICE_RULES[style]
 if(!rule)return null
 let n=0,d=0,samples=0,error=0,individual=0,total=0
 for(const mode of Object.values(match.evidence?.modes ?? {})) {
  const c=mode.counters ?? {}, observed=mode.observed ?? []
  if(rule.throwTypes || rule.curve) {
   // Curve unavailable in fast mode; do not count those throws as non-use.
   for(const [key,row] of Object.entries(mode.throwResults ?? {})) {
    const [type,,curve]=key.split('|')
    if(rule.curve && (!curve || curve==='unobserved' || curve==='unknown'))continue
    d+=row.attempts
    if(rule.curve ? curve===rule.curve : rule.throwTypes.includes(type)) {
     n+=row.attempts;samples+=row.executionSamples??0;error+=row.absoluteCurveError??0
    }
   }
  } else {
   if(!observed.includes(rule.num)||!observed.includes(rule.den))continue
   n+=c[rule.num]??0;d+=c[rule.den]??0
  }
  const metric=rule.den??'throws'
  total+=c[metric]??0;individual+=mode.contexts?.individual_instructions?.[metric]??0
 }
 if(d<(rule.min??8))return null
 const ratio=n/d
 let strength=rule.inverse ? clamp((rule.target*2-ratio)/rule.target) : clamp(ratio/rule.target)
 if(rule.technical) {
  // Use signed-error samples, never completion percentage as an accuracy proxy.
  strength*=samples>=3 ? clamp(1-(error/samples)/.12) : 0
 }
 return {strength,opportunities:d,uses:n,qualitySamples:samples,
  independence:total>0?1-.3*clamp(individual/total):1}
}
export function summarizeStylePractice(matches, style) {
 const values=matches.map(m=>evaluateStyleMatch(m,style)).filter(Boolean)
 if(!values.length)return null
 // Equal weight per qualifying match prevents a very long match dominating.
 return {matches:values.length,strength:values.reduce((s,v)=>s+v.strength,0)/values.length,
  independence:values.reduce((s,v)=>s+v.independence,0)/values.length}
}
