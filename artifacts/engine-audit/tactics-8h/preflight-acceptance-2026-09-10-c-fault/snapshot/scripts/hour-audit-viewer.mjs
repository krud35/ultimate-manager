import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export function writeAuditViewer(directory) {
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'replay-index.json')))
  const entries = index.map(meta => ({ ...meta, data: JSON.parse(fs.readFileSync(path.join(directory, meta.path))) }))
  const payload = JSON.stringify(entries).replaceAll('<', '\\u003c')
  const html = `<!doctype html>
<html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audyt silnika — powtórki</title>
<style>
*{box-sizing:border-box}body{font:15px system-ui;margin:24px;color:#eef4ff;background:#101b25;max-width:1200px}
h1{font-size:25px;margin:0 0 8px}p{line-height:1.45}.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
button,select{font:inherit;padding:9px 12px;border:1px solid #7995a7;border-radius:5px;color:#eef4ff;background:#20394b;cursor:pointer}
button:hover{background:#2e5065}canvas{display:block;width:100%;background:#245c45;border:1px solid #6c9384}
input[type=range]{width:100%;margin:16px 0}label{display:flex;align-items:center;gap:6px}pre{background:#192d3c;padding:14px;white-space:pre-wrap;max-height:300px;overflow:auto}
.muted{color:#bdcbd9;font-size:13px}.badge{padding:5px 8px;background:#304659;border-radius:5px}
</style>
<h1>Audyt silnika — powtórki</h1>
<p>Niebiescy: atak · czerwoni: obrona · żółty: dysk. Cienkie linie pokazują cele ruchu. Widok obejmuje także przestrzeń poza boiskiem.</p>
<div class="controls"><label>Powtórka <select id="replay"></select></label><span class="badge" id="identity"></span></div>
<div class="controls"><button id="previous">Poprzednia akcja</button><button id="next">Następna akcja</button><button id="play">Odtwórz / pauza</button><button id="release">Przed wyrzutem</button><button id="reveal">Pokaż wynik</button></div>
<canvas id="pitch" width="1100" height="470" aria-label="Boisko z ruchem zawodników i dysku"></canvas>
<input id="time" aria-label="Czas akcji" type="range" min="0" max="1" value="0">
<div class="controls"><button id="back">−0,5 s</button><button id="forward">+0,5 s</button><label><input id="knowledge" type="checkbox">Wiedza rzucającego w chwili wyrzutu</label></div>
<p id="clock"></p><p id="scope" class="muted"></p><pre id="detail"></pre>
<script>
const entries=${payload};
const select=document.querySelector('#replay'),canvas=document.querySelector('#pitch'),ctx=canvas.getContext('2d'),slider=document.querySelector('#time');
let entry=null,action=0,frame=0,playing=false,revealed=false;
entries.forEach((e,i)=>{const option=document.createElement('option');option.value=i;option.textContent='Powtórka '+String(i+1).padStart(2,'0')+' · '+e.jobId;select.append(option)});
function clip(){return entry?.data.clips?.[action]}function frames(){return clip()?.frames||[]}
function load(){entry=entries[+select.value||0];action=entry?.data.selectedAction===0?0:Math.min(1,(entry?.data.clips?.length||1)-1);frame=0;revealed=false;playing=false;document.querySelector('#knowledge').checked=false;draw()}
function draw(){
const all=frames(),f=all[Math.min(frame,all.length-1)];slider.max=Math.max(0,all.length-1);slider.value=frame;
ctx.clearRect(0,0,1100,470);ctx.strokeStyle='#d5e6da';ctx.lineWidth=1.5;ctx.strokeRect(50,50,1000,370);
for(const x of[230,870]){ctx.beginPath();ctx.moveTo(x,50);ctx.lineTo(x,420);ctx.stroke()}
ctx.fillStyle='#c4d4c9';ctx.font='12px system-ui';ctx.fillText('0 m',48,35);ctx.fillText('100 m',1015,35);
if(!f){document.querySelector('#clock').textContent='Brak klatek dla tej akcji.';return}
const knowledge=document.querySelector('#knowledge').checked;
const scan=(entry.data.scans||[]).find(s=>s.throwerId===f.throwerId&&Math.abs(s.setupElapsedMs-f.ms)<=110);
let players=f.players;let scope='Stan rzeczywisty. Zapis widoku co 100 ms; pełny przebieg można odtworzyć z seeda.';
if(knowledge&&scan){players=[...scan.perceived.offense.map(p=>({...p,cutterState:true})),...scan.perceived.defense.map(p=>({...p,defenderState:true}))];scope='Wiedza rzucającego: jeden jednoznacznie dopasowany skan przy wyrzucie. Brak zawodnika oznacza brak w tym skanie.'}
else if(knowledge){scope='Brak dopasowanego zapisu wiedzy w tej klatce. Nadal pokazany jest stan rzeczywisty; nie rekonstruujemy percepcji.'}
for(const p of players){const x=50+p.x*10,y=50+p.y*10;ctx.fillStyle=p.defenderState?'#ff8585':'#70c5ff';ctx.beginPath();ctx.arc(x,y,p.id===f.throwerId?6:4.5,0,Math.PI*2);ctx.fill();if(p.diving||p.layout){ctx.strokeStyle='#fff';ctx.strokeRect(x-7,y-4,14,8)}const t=p.audit||p;if(Number.isFinite(t.targetX)&&Number.isFinite(t.targetY)){ctx.strokeStyle='#dae6ee55';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(50+t.targetX*10,50+t.targetY*10);ctx.stroke()}}
if(f.disc){ctx.fillStyle='#ffdf69';ctx.beginPath();ctx.arc(50+f.disc.x*10,50+f.disc.y*10,3.5+Math.max(0,f.disc.z||0),0,Math.PI*2);ctx.fill()}
document.querySelector('#identity').textContent='seed '+entry.data.seed+' · punkt '+entry.pointIndex;
document.querySelector('#clock').textContent='Akcja '+(action+1)+'/'+entry.data.clips.length+' · '+(f.ms/1000).toFixed(2)+' s · stall '+(f.stallCount??'—')+' · dysk '+(f.disc?.z||0).toFixed(2)+' m';
document.querySelector('#scope').textContent=scope;
const detail={throwerId:f.throwerId,throwType:clip().throwType,releaseMs:clip().throwMs,frameMs:f.ms};
if(revealed){detail.selectedActionOutcome=entry.data.outcome;detail.sampleCategory=entry.category;detail.resolution=clip().resolution?.diagnosis??clip().resolution}
else detail.result='Ukryty — oceń decyzję, zanim pokażesz wynik.';
if(knowledge&&scan)detail.scan={selectedId:scan.selectedId,threshold:scan.threshold,options:scan.options};
document.querySelector('#detail').textContent=JSON.stringify(detail,null,2)
}
select.onchange=load;slider.oninput=()=>{playing=false;frame=+slider.value;draw()};
document.querySelector('#play').onclick=()=>{playing=!playing};
document.querySelector('#previous').onclick=()=>{playing=false;action=Math.max(0,action-1);frame=0;draw()};
document.querySelector('#next').onclick=()=>{playing=false;action=Math.min(entry.data.clips.length-1,action+1);frame=0;draw()};
document.querySelector('#release').onclick=()=>{playing=false;const i=frames().findIndex(f=>f.ms>=clip().throwMs);frame=Math.max(0,i-1);draw()};
document.querySelector('#reveal').onclick=()=>{revealed=!revealed;draw()};
document.querySelector('#back').onclick=()=>{playing=false;frame=Math.max(0,frame-5);draw()};
document.querySelector('#forward').onclick=()=>{playing=false;frame=Math.min(frames().length-1,frame+5);draw()};
document.querySelector('#knowledge').onchange=draw;
setInterval(()=>{if(playing){if(frame<frames().length-1){frame++;draw()}else playing=false}},100);load();
</script></html>`
  fs.writeFileSync(path.join(directory, 'review.html'), html)
  fs.writeFileSync(path.join(directory, 'viewer-version.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex'),
    source: 'scripts/hour-audit-viewer.mjs', note: 'Presentation-only postprocessing; simulation sources and results unchanged.' }, null, 2))
}
if (process.argv[2]) writeAuditViewer(path.resolve(process.argv[2]))
