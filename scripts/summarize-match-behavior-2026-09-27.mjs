import fs from 'node:fs'
const dir = 'artifacts/match-behavior-2026-09-27'
const matches = JSON.parse(fs.readFileSync(`${dir}/matches.json`))
const settings = JSON.parse(fs.readFileSync(`${dir}/settings.json`))
const byStyle = {}
for (const r of matches) {
  const a = byStyle[r.style] ??= { matches: 0, attempts: 0, successes: 0, distanceSum: 0, holdSumMs: 0, holdN: 0,
    motionSamples: 0, movingSamples: 0, nonFinite: 0, maxSpeed: 0, types: {}, throwRoles: {}, receiveRoles: {}, techniques: {} }
  a.matches++
  for (const k of ['attempts', 'successes', 'distanceSum', 'holdSumMs', 'holdN', 'motionSamples', 'movingSamples', 'nonFinite']) a[k] += r[k]
  a.maxSpeed = Math.max(a.maxSpeed, r.maxSpeed)
  for (const key of ['types', 'throwRoles', 'receiveRoles', 'techniques']) for (const [k, v] of Object.entries(r[key])) a[key][k] = (a[key][k] ?? 0) + v
}
const ratio = (a,b) => b ? a/b : 0
const metrics = {
  deepThrowShare: s => 100*ratio(s.deep,s.succ), breakShare: s => 100*ratio(s.brk,s.brk+s.open),
  resetShare: s => 100*ratio(s.reset,s.succ), tightSepShare: s => 100*ratio(s.sepTight,s.sepN),
  holdMs: s => ratio(s.holdMs,s.holdN), cutFwdPerCutM: s => ratio(s.cutFwdM,s.cutInits),
  cutInitPer1k: s => 1000*ratio(s.cutInits,s.offTicks), waitLaneM: s => ratio(s.waitLaneSum,s.waitTicks),
  cushionM: s => ratio(s.cushionSum,s.cushionN), shadeM: s => ratio(s.shadeSum,s.shadeN),
  poachShare: s => 100*ratio(s.poachTicks,s.defTicks), stackDepthM: s => ratio(s.stackDepthSum,s.stackDepthN),
  markAngleDeg: s => ratio(s.markAngleSum,s.markAngleN), deepCushionM: s => ratio(s.deepCushionSum,s.deepCushionN),
  resetGapM: s => ratio(s.resetGapSum,s.resetDefTicks),
}
const probes = {
  throw_hucks:['deepThrowShare',1,3], no_hucks:['deepThrowShare',-1,3],
  break_mark:['breakShare',1,5], no_break_mark:['breakShare',-1,5],
  dump_first:['resetShare',1,2], look_downfield:['resetShare',-1,2],
  safe_throws:['tightSepShare',-1,2], take_risks:['tightSepShare',1,2],
  cut_deep:['cutFwdPerCutM',1,.9], cut_under:['cutFwdPerCutM',-1,.9],
  dominate:['cutInitPer1k',1,.35], wait_your_turn:['cutInitPer1k',-1,.35],
  play_fast:['holdMs',-1,250], play_slow:['holdMs',1,250],
  take_space:['waitLaneM',-1,.6], give_space:['waitLaneM',1,.6],
  tight_mark:['cushionM',-1,.22], loose_mark:['cushionM',1,.22],
  shade_deep:['shadeM',1,.25], shade_under:['shadeM',-1,.25],
  poach:['poachShare',1,.1], no_poach:['poachShare',-1,.1],
  huckAppetite:['deepThrowShare',1,3], breakAppetite:['breakShare',1,5], passSelectivity:['tightSepShare',1,2],
  possessionTempo:['holdMs',-1,250], stackDepth:['stackDepthM',1,1.5], coverageShade:['cushionM',1,.22],
  cushionDepth:['cushionM',1,.22], markShape:['markAngleDeg',1,4], poachSeeking:['poachShare',1,.1],
  helpDeep:['deepCushionM',1,.3], poachResetHandler:['resetGapM',1,.4], creativity:['poachShare',1,.1],
}
const effects = []
for (const r of settings.results) {
  const id = r.instruction ?? r.directive
  if (!id) continue
  const [metric, direction, minimum] = probes[id]
  const f = metrics[metric]
  const diff = row => row.acc ? f(row.acc.A)-f(row.acc.B) : f(row.agg.D)-f(row.agg.C)
  const base = settings.results.filter(b => b.kind === r.kind && !b.instruction && !b.directive).map(diff)
  const mean = base.reduce((s,x)=>s+x,0)/base.length
  const spread = Math.max(...base)-Math.min(...base)
  const threshold = Math.max(minimum,spread)
  const effect = diff(r)-mean
  const expected = direction*(r.value ?? 1)
  effects.push({ kind:r.kind,id,value:r.value,metric,effect,threshold,
    clearsHeuristic: effect*expected >= threshold })
}
fs.writeFileSync(`${dir}/summary.json`, JSON.stringify({ byStyle, effects }, null, 2))
const pct = (v,n) => (100*ratio(v??0,n)).toFixed(1)
const lines = ['# Wyniki pomiarów — 27.09.2026', '',
  `Formacje: ${matches.length} meczów do 5 punktów. Cztery seedy na formację, składy demonstracyjne, bez adaptacji AI i automatycznej rotacji, bez wiatru. Obie drużyny używają tej samej formacji ataku i obrony person.`, '',
  '| Formacja | Rzuty | Standard % | Dump/swing % | Huck % | OTT % | Celność % | Dystans m | Czas do rzutu s |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for(const [style,a] of Object.entries(byStyle)) lines.push(`| ${style} | ${a.attempts} | ${pct(a.types.standard,a.attempts)} | ${pct(a.types.dump_swing,a.attempts)} | ${pct(a.types.huck,a.attempts)} | ${pct(a.types.over_the_top,a.attempts)} | ${pct(a.successes,a.attempts)} | ${(a.distanceSum/a.attempts).toFixed(2)} | ${(a.holdSumMs/a.holdN/1000).toFixed(2)} |`)
lines.push('', 'Udział ról w wyborze odbiorcy (liczby wskazań, obejmują nieudane rzuty; nie są oceną skuteczności roli ani statystyką na minutę):', '',
  '| Formacja | Primary handler | Reset handler | Primary cutter | Secondary cutter | Continuation | Filler |', '|---|---:|---:|---:|---:|---:|---:|')
for(const [style,a] of Object.entries(byStyle)) lines.push(`| ${style} | ${['primary_handler','reset_handler','primary_cutter','secondary_cutter','continuation_cutter','filler_cutter'].map(k=>a.receiveRoles[k]??0).join(' | ')} |`)
lines.push('', 'Próba ustawień: 4 mecze do 3 punktów na warunek, 3 niezależne powtórzenia neutralnego baseline dla każdej rodziny testów. To przesiew diagnostyczny, nie test istotności statystycznej. „Sygnał” oznacza przekroczenie heurystycznego progu istniejących benchmarków; „nierozstrzygające” nie dowodzi braku działania.', '',
  'Efekt instrukcji: zmiana różnicy między zawodnikami instruowanymi i kontrolnymi względem średniego baseline. Efekt dyrektywy: analogiczna różnica między drużynami. Próg = większa z minimalnej zmiany benchmarku i pełnego rozstępu trzech baseline. Jednostki udziałów: punkty procentowe; holdMs: ms; odległości: metry; cutInitPer1k: inicjacje na 1000 próbek ofensywnych. Metryka deepThrowShare oznacza udane podania z zyskiem ≥26 m, a nie etykietę huck.', '',
  '| Rodzaj | Ustawienie | Biegun | Metryka | Efekt | Próg | Wynik przesiewu |', '|---|---|---:|---|---:|---:|---|')
for (const r of effects) lines.push(`| ${r.kind} | ${r.id} | ${r.value??''} | ${r.metric} | ${r.effect.toFixed(2)} | ${r.threshold.toFixed(2)} | ${r.clearsHeuristic?'sygnał':'nierozstrzygające'} |`)
lines.push('', 'Zastrzeżenia: creativity wpływa na wiele zachowań, więc poachShare nie jest pełną oceną tej dyrektywy. Ujemny poachResetHandler jest obcinany do zera — jego brak efektu jest oczekiwany. Poach i cushion mierzone są w person; nie jest to porównanie wszystkich obron. Liczenie inicjacji cutu resetuje poprzedni stan przy każdej akcji, więc nie mierzy idealnie wszystkich ciągłych wyjść. Statystyki rzutów nie obejmują pulli i akcji zakończonych bez wypuszczenia dysku. Brak arc/curve w zdarzeniach nie oznacza braku kształtowania toru w silniku.')
fs.writeFileSync(`${dir}/measurements.md`, lines.join('\n')+'\n')
console.log(JSON.stringify({ matches:matches.length, settings:settings.results.length, byStyle, effects },null,2))
