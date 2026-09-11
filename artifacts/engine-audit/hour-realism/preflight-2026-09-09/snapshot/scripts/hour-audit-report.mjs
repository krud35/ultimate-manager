import fs from 'node:fs'
import path from 'node:path'

const pct = (a, b) => b ? 100 * a / b : null
const fmt = x => x == null ? '—' : Number(x).toFixed(2)
const ratio = (s, a, b) => pct(s[a], s[b])
function sum(rows) {
  const out = {}
  for (const row of rows) for (const [k, v] of Object.entries(row.stats ?? {})) {
    if (typeof v === 'number') out[k] = (out[k] ?? 0) + v
    else if (k === 'types') {
      out.types ??= {}
      for (const [type, counts] of Object.entries(v)) {
        out.types[type] ??= { attempts: 0, completions: 0 }
        out.types[type].attempts += counts.attempts; out.types[type].completions += counts.completions
      }
    } else if (k === 'diagnoses') {
      out.diagnoses ??= {}; for (const [d, n] of Object.entries(v)) out.diagnoses[d] = (out.diagnoses[d] ?? 0) + n
    }
  }
  return out
}
function measures(row) {
  const s = row.stats ?? row.metrics ?? {}
  return { completion: ratio(s, 'completions', 'attempts'), resetCompletion: ratio(s, 'resetCompletions', 'resetAttempts'),
    resetShare: ratio(s, 'resetAttempts', 'attempts'), huckShare: ratio(s, 'hucks', 'attempts'),
    meanHoldMs: s.holdN ? s.holdMs / s.holdN : null, meanDistance: s.attempts ? s.distance / s.attempts : null,
    meanWidth: s.shapeN ? s.widthSum / s.shapeN : null, meanDepth: s.shapeN ? s.depthSum / s.shapeN : null,
    poachShare: ratio(s, 'poachSeconds', 'defenseSeconds'), stationaryOffShare: ratio(s, 'stationaryOffSeconds', 'offenseSeconds'),
    meanCushion: s.cushionN ? s.cushionSum / s.cushionN : null, targetReversals: s.targetReversals,
    selected: row.selected, success: row.success, holdMs: row.holdMs }
}
// Bootstrap complete swap-pairs, preserving within-match and paired dependence.
function confidence(rows, numerator, denominator) {
  const groups = new Map()
  for (const row of rows) { const key = row.job.pair ?? row.job.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) }
  const blocks = [...groups.values()].filter(g => g.length === 2 && new Set(g.map(r => r.job.swap)).size === 2).map(sum)
  if (blocks.length < 4) return { ci95: null, blocks: blocks.length, reason: 'Fewer than 4 complete swap-pairs' }
  let seed = 51717013
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const values = []
  for (let n = 0; n < 2000; n++) {
    let a = 0, b = 0
    for (let i = 0; i < blocks.length; i++) { const block = blocks[Math.floor(rand() * blocks.length)]; a += block[numerator] ?? 0; b += block[denominator] ?? 0 }
    if (b) values.push(100 * a / b)
  }
  values.sort((a, b) => a - b)
  return { ci95: values.length ? [values[Math.floor(values.length * .025)], values[Math.floor(values.length * .975)]] : null,
    blocks: blocks.length, method: '2000 bootstrap samples of complete home/away pairs; diagnostic RNG seed 51717013' }
}
const bandVerdict = (estimate, ci, target, enough) => !enough || !ci ? 'INCONCLUSIVE'
  : ci[0] >= target[0] && ci[1] <= target[1] ? 'PASS'
    : ci[1] < target[0] || ci[0] > target[1] ? 'FAIL' : 'INCONCLUSIVE'

export function writeHourReport(out) {
  const save = (file, data) => fs.writeFileSync(path.join(out, file), JSON.stringify(data, null, 2))
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')))
  const rows = fs.readdirSync(path.join(out, 'jobs')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(out, 'jobs', f))))
  const reference = rows.filter(r => r.job.phase === 'reference' && r.status === 'complete')
  const s = sum(reference), all = sum(rows)
  const completionCI = confidence(reference, 'completions', 'attempts'), resetCI = confidence(reference, 'resetCompletions', 'resetAttempts')
  const byGroup = [0, 1, 2].map(group => { const r = reference.filter(x => x.job.group === group); return { group, matches: r.length, ...sum(r), measures: measures({ stats: sum(r) }) } })
  const cells = new Map()
  for (const r of reference) { const key = `${r.job.group}|${r.job.tactical}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(r) }
  const cellMeasures = [...cells].map(([cell, r]) => ({ cell, matches: r.length, ...measures({ stats: sum(r) }) }))
  const equalCellCompletion = cellMeasures.length === 6 ? cellMeasures.reduce((a, c) => a + c.completion, 0) / 6 : null
  const expected = Object.values(manifest.queues).flat()
  const done = new Map(rows.map(r => [r.job.id, r]))
  const coverage = manifest.phases.map(p => ({ phase: p.id, planned: manifest.queues[p.id].length,
    attempted: rows.filter(r => r.job.phase === p.id).length,
    complete: rows.filter(r => r.job.phase === p.id && ['complete', 'complete_point_sample', 'complete_external_check'].includes(r.status)).length,
    fullMatches: rows.filter(r => r.job.phase === p.id && r.job.kind === 'match' && !r.job.points && r.status === 'complete').length }))
  const missing = expected.filter(j => !done.has(j.id)).map(j => ({ id: j.id, phase: j.phase, kind: j.kind, attribute: j.attribute, cell: j.cell, directive: j.directive }))
  const incomplete = rows.filter(r => !['complete', 'complete_point_sample', 'complete_external_check'].includes(r.status))
  const tactical = rows.filter(r => r.job.phase === 'tactics').map(r => ({ id: r.job.id, job: r.job, status: r.status,
    stats: r.stats, metrics: measures(r), effectiveFirstPoint: r.checkpoints?.[0]?.effective }))
  const coach = []
  for (const row of tactical.filter(r => r.job.directive && r.job.value !== 0)) {
    const base = tactical.find(r => r.job.pair === row.job.pair && r.job.value === 0)
    const delta = {}
    if (base) for (const [key, v] of Object.entries(row.metrics)) if (typeof v === 'number' && typeof base.metrics[key] === 'number') delta[key] = v - base.metrics[key]
    coach.push({ directive: row.job.directive, value: row.job.value, pair: row.job.pair, status: row.status,
      baseline: base?.id, treatment: row.id, delta, caveat: 'Paired one-point global behavior probe; not isolated side advantage or significance.' })
  }
  const effectRows = rows.filter(r => r.job.phase === 'effects').flatMap(r => (r.rows ?? []).map(x => ({ jobId: r.job.id, ...x, measures: measures(x) })))
  const effects = { exploratory: true, rows: effectRows, coverage: {} }
  for (const r of effectRows) {
    const key = r.variant?.category ? `${r.variant.category}.${r.variant.key}` : r.variant?.trait ?? r.variant?.state ?? r.variant?.instruction
    effects.coverage[key] ??= { rows: 0, seeds: new Set(), contexts: new Set(), levels: new Set(), withSelectedThrow: 0, withResolvedFlight: 0 }
    const c = effects.coverage[key]; c.rows++; c.seeds.add(r.seed); c.contexts.add(r.case); c.levels.add(r.variant.delta ?? r.variant.value)
    if (r.selected) c.withSelectedThrow++; if (r.success != null) c.withResolvedFlight++
  }
  for (const c of Object.values(effects.coverage)) { c.seeds = c.seeds.size; c.contexts = [...c.contexts]; c.levels = [...c.levels] }
  const candidates = rows.flatMap(r => r.replayCandidates ?? [])
  const clips = []
  for (const category of ['success', 'failure', 'long_setup', 'defense_transition']) clips.push(...candidates.filter(c => c.category === category).sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 6))
  const problems = []
  if (all.nonfinite || all.limits) problems.push({ priority: 1, title: 'Nielegalne stany lub sztuczne rozstrzygnięcia', evidence: { nonfinite: all.nonfinite, limits: all.limits }, confidence: 'confirmed by invariant counters' })
  if (incomplete.length) problems.push({ priority: 1, title: 'Przerwane lub nieudane próby', evidence: incomplete.map(r => ({ id: r.job.id, status: r.status, log: r.log, error: r.error })), confidence: 'confirmed execution limitation' })
  if (s.resetChainAlarms) problems.push({ priority: 2, title: 'Długie łańcuchy resetów bez zysku terenu', evidence: s.resetChainAlarms, confidence: 'heuristic; review sequence and pressure' })
  if (s.displacementAlarms) problems.push({ priority: 2, title: 'Skokowe przemieszczenia wymagające przeglądu', evidence: s.displacementAlarms, confidence: 'conservative alarm; not automatically teleport bug' })
  if (s.targetReversals) problems.push({ priority: 2, title: 'Odwracanie celu ruchu', evidence: s.targetReversals, confidence: 'exposure count; may include legitimate route changes' })
  const summary = { status: manifest.status, referenceMatches: reference.length, stats: s, measures: measures({ stats: s }),
    completionCI, resetCI, equalCellCompletion, byGroup, cells: cellMeasures, coverage, incomplete: incomplete.map(r => ({ id: r.job.id, status: r.status })),
    verdicts: {
      measurement: manifest.integrity?.status ?? 'INCONCLUSIVE',
      checkedMechanics: all.nonfinite || all.limits ? 'FAIL' : 'INCONCLUSIVE',
      completion: bandVerdict(ratio(s, 'completions', 'attempts'), completionCI.ci95, [90, 93], reference.length >= 12 && s.attempts >= 1000),
      resetCompletion: bandVerdict(ratio(s, 'resetCompletions', 'resetAttempts'), resetCI.ci95, [94, 96], reference.length >= 8 && s.resetAttempts >= 500),
      externalRealism: 'INCONCLUSIVE', behavior: 'REQUIRES_REPLAY_REVIEW', attributes: 'EXPLORATORY',
      fullMatchCoverage: reference.length >= 24 && coverage.find(c => c.phase === 'tactics').fullMatches >= 4 && coverage.find(c => c.phase === 'stress').fullMatches >= 4 ? 'PASS' : 'INCOMPLETE',
    }, missingJobs: missing.length, problems, replaySelection: clips, limitations: manifest.limitations }
  save('summary.json', summary); save('effects.json', effects); save('tactics-baseline.json', tactical); save('coach-effects.json', coach)
  save('missing-coverage.json', missing); save('replay-index.json', clips)
  fs.writeFileSync(path.join(out, 'matches.jsonl'), rows.filter(r => r.job.kind === 'match').map(r => JSON.stringify({ job: r.job, status: r.status, stats: r.stats, score: r.score, timings: r.timings, fingerprint: r.fingerprint })).join('\n') + '\n')
  fs.writeFileSync(path.join(out, 'anomalies.jsonl'), rows.flatMap(r => (r.warnings ?? []).map(w => JSON.stringify({ jobId: r.job.id, ...w }))).join('\n') + '\n')
  fs.writeFileSync(path.join(out, 'tactics-coverage.csv'), 'id,cell,directive,value,status\n' + expected.filter(j => j.phase === 'tactics').map(j => [j.id, j.cell ?? '', j.directive ?? '', j.value ?? '', done.get(j.id)?.status ?? 'not_run'].join(',')).join('\n'))
  const interval = c => c.ci95 ? `${fmt(c.ci95[0])}–${fmt(c.ci95[1])}%` : 'brak wystarczającej próby'
  const report = `# Godzinny audyt silnika\n\nStatus: ${manifest.status}. Start: ${manifest.startedAt ?? '—'}. Koniec: ${manifest.finishedAt ?? 'w toku'}. Czas: ${fmt((manifest.elapsedMs ?? manifest.simulationWallMs ?? 0) / 60000)} min.\n\n## Wynik główny\n\nReferencyjne pełne mecze: **${reference.length}**. Completion: **${fmt(summary.measures.completion)}%** (${s.completions ?? 0}/${s.attempts ?? 0}), 95% CI ${interval(completionCI)}; cel 90–93%, werdykt ${summary.verdicts.completion}. Resety: **${fmt(summary.measures.resetCompletion)}%** (${s.resetCompletions ?? 0}/${s.resetAttempts ?? 0}), 95% CI ${interval(resetCI)}; cel 94–96%, werdykt ${summary.verdicts.resetCompletion}.\n\nŚrednia completion z równymi wagami 6 komórek: ${fmt(equalCellCompletion)}%. Przerwane mecze są wyłączone z tego wyniku i jawnie wykazane niżej.\n\n## Pokrycie\n\n| Moduł | Wykonane / kolejka | Pełne mecze |\n|---|---:|---:|\n${coverage.map(c => `| ${c.phase} | ${c.complete}/${c.planned} | ${c.fullMatches} |`).join('\n')}\n\nKolejka zawiera także dodatkowe powtórzenia; nie każde niewykonane zadanie jest brakującym minimum. Szczegóły: missing-coverage.json oraz effects.json. Pełne mecze — pokrycie minimum: ${summary.verdicts.fullMatchCoverage}.\n\n## Podania i straty\n\n| Typ | Próby | Completion |\n|---|---:|---:|\n${Object.entries(s.types ?? {}).map(([t, v]) => `| ${t} | ${v.attempts} | ${fmt(pct(v.completions, v.attempts))}% |`).join('\n')}\n\nDiagnozy zakończeń: ${JSON.stringify(s.diagnoses ?? {})}. Nie utożsamiamy etykiety zakończenia z potwierdzoną przyczyną.\n\n## Zachowanie\n\nŚredni czas do rzutu: ${fmt(summary.measures.meanHoldMs)} ms. Udział resetów: ${fmt(summary.measures.resetShare)}%. Hucków: ${fmt(summary.measures.huckShare)}%. Statyczne przebywanie zawodników bez dysku: ${fmt(summary.measures.stationaryOffShare)}% czasu ofensywnych agentów (obejmuje uzasadnione czekanie). Skanów: ${s.scans ?? 0}; bez wybranej opcji: ${s.noSelection ?? 0}; obserwacje starsze niż 500 ms: ${fmt(pct(s.stalePlayers, s.perceivedPlayers))}%.\n\nAlarmy: ${s.resetChainAlarms ?? 0} łańcuchów resetów, ${s.displacementAlarms ?? 0} przemieszczeń, ${s.targetReversals ?? 0} odwróceń celu. To materiał do diagnozy, nie automatycznie potwierdzone błędy decyzji.\n\n## Taktyki i cechy\n\nProfile taktyk: tactics-baseline.json. Sparowane efekty dyrektyw: coach-effects.json. Próby cech: effects.json (${effectRows.length} sytuacji, ${Object.keys(effects.coverage).length} osi). Małe próby są eksploracyjne; brak okazji nie dowodzi martwego ustawienia. Wyniki nie stanowią rankingu taktyk ani zakończonego balansu.\n\n## Integralność i ograniczenia\n\nNeutralność sond / powtarzalność: ${summary.verdicts.measurement}. NaN/Infinity: ${all.nonfinite ?? 0}; sztuczne wyniki z limitu: ${all.limits ?? 0}. Pozostałe niezmienniki nie są automatycznie uznane za PASS.\n\n${manifest.limitations.map(x => '- ' + x).join('\n')}\n\nPrzerwane/błędne zadania: ${incomplete.map(r => `${r.job.id} (${r.status})`).join(', ') || 'brak'}.\n\n## Materiał do przeglądu\n\nreview.html: ${clips.length} powtórek z losowania warstwowego. Przy tej implementacji próbkujemy kandydatów o minimalnym hashu z każdego zadania; replay-index.json podaje identyfikatory i seedy. Pełne źródła są w snapshot/, wejścia w inputs/. Ślady do odtworzenia zaczynamy od początku zadania/punktu z seedem; sam stan pozycji nie wystarcza.\n\nOcenę wzrokową i wnioski przyczynowe dopisujemy po obejrzeniu materiału. Nie potwierdzamy empirycznej zgodności z rzeczywistymi meczami bez zgodnego zbioru referencyjnego.\n`
  fs.writeFileSync(path.join(out, 'REPORT.md'), report)
  const replayData = clips.map(c => ({ ...c, data: JSON.parse(fs.readFileSync(path.join(out, c.path))) }))
  const payload = JSON.stringify(replayData).replaceAll('<', '\\u003c')
  const html = `<!doctype html><meta charset="utf-8"><title>Audyt silnika — powtórki</title><style>body{font:16px system-ui;background:#101b25;color:#eef;margin:24px}canvas{width:min(1100px,95vw);background:#245c45;border:1px solid #789}button,select,input{margin:8px;padding:8px}pre{white-space:pre-wrap;max-height:250px;overflow:auto}small{color:#bbc}</style><h1>Audyt silnika — materiał do oceny</h1><p>Niebiescy: atak, czerwoni: obrona. Żółty dysk. Linie wskazują cele ruchu. Pokazywane klatki co 100 ms.</p><select id="select"></select><button id="play">Odtwórz / pauza</button><button id="blind">Zatrzymaj przed rzutem</button><label><input type="checkbox" id="knowledge">Wiedza rzucającego (ostatni zapisany skan)</label><br><canvas id="field" width="1100" height="470"></canvas><br><input id="time" type="range" min="0" max="1" value="0" style="width:90%"><p id="label"></p><small>Wiedza z próbkowanych skanów; brak zapisu nie oznacza niewidoczności. Zestaw może zawierać akcję poprzedzającą i następną.</small><pre id="details"></pre><script>const data=${payload};const select=document.querySelector('#select'),canvas=document.querySelector('#field'),ctx=canvas.getContext('2d'),slider=document.querySelector('#time');let frames=[],i=0,playing=false,entry=null;data.forEach((d,n)=>{const o=document.createElement('option');o.value=n;o.textContent=d.category+' · '+d.jobId+' · punkt '+d.pointIndex;select.append(o)});function load(){entry=data[select.value||0];frames=[];for(const [a,c]of(entry?.data.clips||[]).entries())for(const f of c.frames||[])frames.push({...f,action:a,throwMs:c.throwMs});i=0;slider.max=Math.max(0,frames.length-1);draw()}function draw(){ctx.clearRect(0,0,1100,470);ctx.strokeStyle='#fff';ctx.strokeRect(50,50,1000,370);for(const x of[230,870]){ctx.beginPath();ctx.moveTo(x,50);ctx.lineTo(x,420);ctx.stroke()}const f=frames[i];if(!f)return;let players=f.players;const k=document.querySelector('#knowledge').checked;let scan=null;if(k){scan=(entry.data.scans||[]).filter(s=>s.throwerId===f.throwerId&&s.setupElapsedMs<=f.ms).at(-1);if(scan)players=[...scan.perceived.offense.map(p=>({...p,cutterState:true})),...scan.perceived.defense.map(p=>({...p,defenderState:true}))]}for(const p of players){const x=50+p.x*10,y=50+p.y*10;ctx.fillStyle=p.defenderState?'#ff7373':'#68bdff';ctx.beginPath();ctx.arc(x,y,5,0,7);ctx.fill();const a=p.audit||p;if(Number.isFinite(a.targetX)){ctx.strokeStyle='#aaa6';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(50+a.targetX*10,50+a.targetY*10);ctx.stroke()}}if(f.disc){ctx.fillStyle='#ffe078';ctx.beginPath();ctx.arc(50+f.disc.x*10,50+f.disc.y*10,4+Math.max(0,f.disc.z||0),0,7);ctx.fill()}slider.value=i;document.querySelector('#label').textContent='Akcja '+f.action+' · '+f.ms+' ms · stall '+f.stallCount+' · wysokość '+(f.disc?.z||0).toFixed(2)+' m';document.querySelector('#details').textContent=JSON.stringify({seed:entry.seed,point:entry.pointIndex,outcome:entry.data.outcome,scan:scan?{selectedId:scan.selectedId,options:scan.options,threshold:scan.threshold}:undefined},null,2)}select.onchange=load;slider.oninput=()=>{i=+slider.value;draw()};document.querySelector('#play').onclick=()=>playing=!playing;document.querySelector('#blind').onclick=()=>{playing=false;i=Math.max(0,frames.findIndex(f=>f.ms>=f.throwMs)-1);draw()};document.querySelector('#knowledge').onchange=draw;setInterval(()=>{if(playing&&frames.length){i=(i+1)%frames.length;draw()}},100);load();</script>`
  fs.writeFileSync(path.join(out, 'review.html'), html)
  return summary
}

if (process.argv[1]?.endsWith('hour-audit-report.mjs') && process.argv[2]) writeHourReport(path.resolve(process.argv[2]))
