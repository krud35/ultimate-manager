/** Passive, bounded per-match evidence. Never consumes RNG or changes player traits. */
export const STYLE_EVIDENCE_VERSION = 1
export const STYLE_OBSERVATIONS = {
 full: ['throws','cutStarts','underCuts','deepCuts','cutMeters','directionChanges','doubleMoves','feintMeters','offenseSeconds','defenseSeconds','holdSeconds','throwWindowSeconds','fakeWindows','fakeActions','highDiscSeconds','jumpAttempts','sidelineSeconds','transitionSeconds','recoverySeconds'],
 fast: ['throws'],
}
export function recordStyleEvidence(boxScore, id, mode, metric, amount = 1, context = 'unknown') {
 const row = boxScore?.[id]
 if (!row || !STYLE_OBSERVATIONS[mode]?.includes(metric) || !Number.isFinite(amount) || amount <= 0) return
 const evidence = row.styleEvidence ??= { version: STYLE_EVIDENCE_VERSION, modes: {} }
 const group = evidence.modes[mode] ??= { observed: [...STYLE_OBSERVATIONS[mode]], counters: {}, contexts: {} }
 group.counters[metric] = (group.counters[metric] ?? 0) + amount
 const partition = group.contexts[context] ??= {}
 partition[metric] = (partition[metric] ?? 0) + amount
}
export function instructionContext(tactics, playerId) {
 // Presence indicates exposure, never proves the action was forced by instructions.
 const individual = [tactics?.oLinePlayerInstructions?.[playerId], tactics?.dLinePlayerInstructions?.[playerId]]
 return individual.some(value => value && Object.keys(value).length) ? 'individual_instructions' : 'team_system'
}
export function recordStyleThrow(boxScore, thrower, mode, {type, success, curve = null, technique = null, execution = null, tactics} = {}) {
 recordStyleEvidence(boxScore, thrower.id, mode, 'throws', 1, instructionContext(tactics, thrower.id))
 const evidence = boxScore?.[thrower.id]?.styleEvidence?.modes?.[mode]
 if (!evidence) return
 const key = `${type ?? 'unknown'}|${technique ?? 'unknown'}|${curve ?? 'unobserved'}`
 const row = (evidence.throwResults ??= {})[key] ??= { attempts: 0, completions: 0 }
 row.attempts++
 if (success) row.completions++
 if (Number.isFinite(execution?.curveError)) {
  row.executionSamples = (row.executionSamples ?? 0) + 1
  row.absoluteCurveError = (row.absoluteCurveError ?? 0) + Math.abs(execution.curveError)
  row.absoluteArcError = (row.absoluteArcError ?? 0) + Math.abs(execution.arcError ?? 0)
 }
}
export function observeStyleTick(boxScore, before, offense, defense, {dtSec, throwerId, disc, afterTurnover, attackSign, offenseTactics, defenseTactics, fakePhase, previousFakePhase, fakeWindow, previousFakeWindow, fieldWidth}) {
 if (!boxScore || !(dtSec > 0)) return
 for (const [agents, role, tactics] of [[offense,'offense',offenseTactics],[defense,'defense',defenseTactics]]) for (const a of agents) {
  const id = a.id ?? a.player?.id, old = before.get(id), context = instructionContext(tactics,id)
  const add = (metric,n=1) => recordStyleEvidence(boxScore,id,'full',metric,n,context)
  add(role==='offense'?'offenseSeconds':'defenseSeconds',dtSec)
  if (!old) continue
  if (role==='offense') {
   if (id===throwerId && !disc?.inFlight) add('holdSeconds',dtSec)
   if (id===throwerId && !disc?.inFlight && fakeWindow>0 && !(previousFakeWindow>0)) add('fakeWindows')
   if (id===throwerId && !disc?.inFlight && fakePhase>0 && !(previousFakePhase>0)) add('fakeActions')
   // A window records availability even when no fake is chosen (phase supplied separately).
   if (a.state==='ACTIVE_CUT' && old.state!=='ACTIVE_CUT') {
    add('cutStarts');if(a.cutKind==='in')add('underCuts');if(a.cutKind==='deep')add('deepCuts')
   }
   if(a.feintElapsedMs>0 && (!(old.feintElapsedMs>0) || a.feintElapsedMs<old.feintElapsedMs)) add('doubleMoves')
   if(a.state==='INITIATING_CUT' && a.feintElapsedMs>0) add('feintMeters',Math.hypot(a.x-old.x,a.y-old.y))
   if(a.state==='ACTIVE_CUT') {
    add('cutMeters',Math.hypot(a.x-old.x,a.y-old.y))
    if(a.cutKind!==old.cutKind && old.state==='ACTIVE_CUT') {
     add('directionChanges');add('cutStarts');if(a.cutKind==='in')add('underCuts');if(a.cutKind==='deep')add('deepCuts')
    }
   }
   if(a.y<=5 || a.y>=fieldWidth-5)add('sidelineSeconds',dtSec)
   if(disc?.inFlight && disc.z>2 && Math.hypot(a.x-disc.x,a.y-disc.y)<5) add('highDiscSeconds',dtSec)
   if(a.jumping && !old.jumping)add('jumpAttempts')
  } else if(afterTurnover) {
   add('transitionSeconds',dtSec)
   if((a.x-old.x)*attackSign>0 && !a.isActiveMark)add('recoverySeconds',dtSec)
  }
 }
}

export function captureStyleInstructions(boxScore, players, tactics, role) {
 for (const player of players) {
  const row = boxScore?.[player.id]; if (!row) continue
  const evidence = row.styleEvidence ??= {version:STYLE_EVIDENCE_VERSION,modes:{}}
  const snapshot = {role, teamStyle: role==='offense'?tactics?.attackStyle:tactics?.defenseStyle,
   coach: tactics?.[role==='offense'?'oLineCoachDirectives':'dLineCoachDirectives'] ?? null,
   individual: tactics?.[role==='offense'?'oLinePlayerInstructions':'dLinePlayerInstructions']?.[player.id] ?? null}
  const snapshots = evidence.instructionSnapshots ??= []
  const serialized = JSON.stringify(snapshot)
  if (!snapshots.some(value=>JSON.stringify(value)===serialized)) {
   if(snapshots.length<8) snapshots.push(JSON.parse(serialized))
   else evidence.instructionsTruncated = true
  }
 }
}
