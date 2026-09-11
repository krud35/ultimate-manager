import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { ensureManagerCareer, managerJobOffers, leaveManagerJob, acceptManagerJob } from '../career/managerCareer.js'
import { CLUB_STRATEGY_DEFS } from '../career/clubObjectives.js'

export default function ManagerCareerPanel({career,onUpdate,onWait}) {
 const {lang}=useUiLang(),en=lang==='en',m=ensureManagerCareer(career)
 const [confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null)
 const offers=managerJobOffers(career)
 const execute=()=>{const result=confirm==='resign'?leaveManagerJob(career):acceptManagerJob(career,confirm);if(result.ok){setConfirm(null);setError(null);onUpdate(result.career)}else setError(en?'This offer is no longer available.':'Oferta nie jest już dostępna.')}
 return <section className="space-y-4 rounded-xl border border-ufa-border bg-ufa-panel p-5 text-ufa-text">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{en?'Manager career':'Kariera trenera'}</h2><span>{career.league.currentDate}</span></div>
  <p>{career.managerName} · {en?'Reputation':'Reputacja'}: <strong>{Math.round(m.reputation)}/100</strong> · {m.status==='employed'?(career.world.teamsById[career.playerTeamId]?.name):(en?'Unemployed':'Bez klubu')}</p>
  <p className="text-xs text-ufa-muted">{en?'Results earned during your appointments determine your reputation. Clubs recruit according to their needs and level.':'Reputacja zależy od wyników osiągniętych podczas Twojej pracy. Kluby rekrutują zgodnie ze swoją sytuacją i poziomem rozgrywek.'}</p>
  {!!m.warnings.length&&<p className="rounded-lg border border-red-500 p-3 text-red-400">{en?'Board warnings':'Ostrzeżenia zarządu'}: {m.warnings.length}/2 · {m.warnings.at(-1).date}</p>}
  {m.status==='employed'?<button type="button" className="rounded border border-red-500/50 px-3 py-2 text-sm" onClick={()=>setConfirm('resign')}>{en?'Resign from club':'Odejdź z klubu'}</button>:<button type="button" disabled={busy||!!confirm} className="rounded bg-ufa-accent px-3 py-2 text-sm text-ufa-bg disabled:opacity-40" onClick={async()=>{setBusy(true);try{await onWait?.()}catch{setError(en?'Could not advance the calendar.':'Nie udało się przesunąć kalendarza.')}finally{setBusy(false)}}}>{busy?(en?'Simulating…':'Symulacja…'):(en?'Continue job search (7 days)':'Kontynuuj poszukiwania (7 dni)')}</button>}
  <h3 className="font-semibold">{en?'Available job offers':'Dostępne oferty pracy'}</h3>
  {offers.length===0&&<p className="text-sm text-ufa-muted">{en?'No suitable vacancies. New offers are reviewed each month.':'Brak odpowiednich wakatów. Nowe oferty są sprawdzane co miesiąc.'}</p>}
  <div className="grid gap-3 md:grid-cols-2">{offers.map(o=><div key={o.id} className="rounded-lg border border-ufa-border p-3">
   <h4 className="font-semibold">{o.name} · {o.tier?`${en?'League':'Liga'} ${o.tier}`:'UFA'}</h4>
   <p className="mt-1 text-xs text-ufa-muted">{CLUB_STRATEGY_DEFS[career.world.teamsById[o.teamId].clubStrategy]?.[en?'en':'pl']} · {en?'Minimum reputation':'Wymagana reputacja'}: {o.required}</p>
   <p className="my-2 text-xs">{o.reason==='rebuild'?(en?'Club looking to rebuild.':'Klub szuka trenera do odbudowy.'):(en?'Board dissatisfied with results.':'Zarząd niezadowolony z wyników.')}</p>
   <button type="button" disabled={busy} className="rounded border border-ufa-accent px-3 py-2 text-sm" onClick={()=>setConfirm(o.id)}>{en?'Accept offer':'Przyjmij ofertę'}</button>
  </div>)}</div>
  {confirm&&<div role="alertdialog" aria-label={en?'Confirm job change':'Potwierdź zmianę pracy'} className="rounded-lg border border-ufa-gold p-4">
   <p>{confirm==='resign'?(en?'Resign now? You will lose control of this club and may only accept available job offers.':'Odejść teraz? Utracisz kontrolę nad klubem i będziesz mógł przyjąć tylko dostępne oferty pracy.'):(en?'Accept this job? Your current appointment ends and you take over the new club immediately.':'Przyjąć tę pracę? Obecna współpraca zostanie zakończona i od razu obejmiesz nowy klub.')} {confirm!=='resign'&&<strong>{offers.find(o=>o.id===confirm)?.name}</strong>}</p>
   <div className="mt-3 flex gap-3"><button type="button" className="rounded bg-ufa-accent px-3 py-2 text-ufa-bg" onClick={execute}>{en?'Confirm':'Potwierdź'}</button><button type="button" className="rounded border border-ufa-border px-3 py-2" onClick={()=>setConfirm(null)}>{en?'Cancel':'Anuluj'}</button></div>
  </div>}
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  {m.status==='unemployed'&&<div><h3 className="font-semibold">{en?'Inbox — manager messages':'Skrzynka — wiadomości dotyczące kariery'}</h3>{(career.inbox??[]).filter(x=>x.payload?.kind==='manager_career').slice(0,8).map(x=><details key={x.id} className="mt-2 rounded border border-ufa-border p-3"><summary>{en?x.titleEn??x.title:x.title} · {x.date}</summary><p className="mt-2 whitespace-pre-line text-sm">{en?x.bodyEn??x.body:x.body}</p></details>)}</div>}
  <details><summary className="cursor-pointer text-sm">{en?'Employment history':'Historia zatrudnienia'}</summary>{m.history.map((h,i)=><p key={i} className="mt-2 text-xs">{h.teamName} · {h.from}–{h.to} · {h.reason==='dismissed'?(en?'Dismissed':'Zwolnienie'):(en?'Resigned':'Odejście')}</p>)}</details>
 </section>
}
