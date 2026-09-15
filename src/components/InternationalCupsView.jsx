import { useState } from 'react'
import { INTERNATIONAL_CLUB_CUP_DEFS, internationalGroupTable, internationalCoefficientRanking } from '../career/internationalClubCups.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'

export default function InternationalCupsView({ career, lang = 'pl', onTeamClick }) {
  const en=lang==='en',cups=career?.internationalClubCups??career?.league?.internationalClubCups
  const [selected,setSelected]=useState('europe')
  const [tab,setTab]=useState('results')
  const teams=career?.world?.teamsById??career?.league?.teamsById??{}
  const editions=(cups?.editions??[]).filter(e=>e.kind===selected).sort((a,b)=>b.seasonYear-a.seasonYear)
  const e=editions[0]
  const name=id=>teams[id]?.name??id
  const teamLink=id=><button type="button" className="text-left hover:underline" onClick={()=>onTeamClick?.(id)}>{name(id)}</button>
  const fixtures=e?.fixtures??[]
  const ranks=internationalCoefficientRanking(career,tab==='countries'?'countries':'clubs',(career?.seasonYear??2025)+1)
  return <section className="space-y-4">
    <h2 className="text-2xl font-semibold">{en?'International club cups':'Międzynarodowe puchary klubowe'}</h2>
    <div className="flex flex-wrap gap-2">{Object.entries(INTERNATIONAL_CLUB_CUP_DEFS).map(([id,d])=><button type="button" key={id} aria-pressed={selected===id} onClick={()=>setSelected(id)} className={`rounded-md border px-3 py-2 text-sm ${selected===id?'border-ufa-accent text-ufa-accent':'border-ufa-border'}`}>{id==='europe'?'Champions League':d.name}</button>)}</div>
    <div className="flex flex-wrap gap-3">{[['results','Wyniki','Results'],['clubs','Ranking klubów','Club coefficients'],['countries','Ranking krajów','Country coefficients'],['history','Historia','History']].map(([id,pl,eng])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)} className={tab===id?'font-semibold text-ufa-accent':'text-ufa-muted'}>{en?eng:pl}</button>)}</div>
    {tab==='results'&&<>
      {!e?<p className="text-ufa-muted">{en?'Competition disabled or not scheduled this season. WUCC takes place every four years.':'Rozgrywki wyłączone lub nieprzewidziane w tym sezonie. WUCC odbywa się co cztery lata.'}</p>:<>
        <h3 className="text-lg font-semibold">{e.name} · {e.seasonYear}/{String(e.seasonYear+1).slice(-2)}</h3>
        <p className="text-sm text-ufa-muted">{en?'Participants':'Uczestnicy'}: {e.teamIds.length} · {en?'Qualification':'Kwalifikacja'}: {e.qualification?.source==='previous-season'?(en?'previous domestic season':'poprzedni sezon krajowy'):(en?'initial club reputation':'początkowa reputacja klubów')}</p>
        {e.phase==='unavailable'&&<p>{en?'At least two eligible clubs are required.':'Potrzebne są co najmniej dwa uprawnione kluby.'}</p>}
        {e.championTeamId&&<p className="rounded-md border border-ufa-accent p-3">{en?'Champion':'Zdobywca pucharu'}: {teamLink(e.championTeamId)}</p>}
        {e.groups.length>0&&<div className="grid gap-3 md:grid-cols-2">{e.groups.map(g=><div key={g.id} className="overflow-x-auto rounded-md border border-ufa-border p-3"><h4 className="font-semibold">{en?'Group':'Grupa'} {g.id}</h4><table className="w-full text-sm"><thead><tr><th className="text-left">{en?'Club':'Klub'}</th><th>{en?'P':'M'}</th><th>{en?'W':'Z'}</th><th>+/-</th></tr></thead><tbody>{internationalGroupTable(e,g.id).map((r,i)=><tr key={r.teamId} className={i<2?'text-ufa-accent':''}><td className="py-1">{teamLink(r.teamId)}</td><td className="text-center">{r.played}</td><td className="text-center">{r.wins}</td><td className="text-center">{r.diff}</td></tr>)}</tbody></table></div>)}</div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-ufa-border text-left"><th className="py-2">{en?'Date':'Data'}</th><th>{en?'Stage':'Etap'}</th><th>{en?'Home':'Gospodarze'}</th><th>{en?'Score':'Wynik'}</th><th>{en?'Away':'Goście'}</th></tr></thead><tbody>{[...fixtures].sort((a,b)=>a.date.localeCompare(b.date)).map(f=><tr key={f.id} className="border-b border-ufa-border"><td className="whitespace-nowrap py-2 pr-3">{f.date}</td><td className="pr-3">{f.groupId?`${en?'Group':'Grupa'} ${f.groupId}`:f.round==='qualifying'?(en?'Qualifying':'Kwalifikacje'):(en?'Knockout':'Faza pucharowa')}</td><td>{teamLink(f.homeTeamId)}</td><td className="whitespace-nowrap px-3">{f.status==='completed'?`${f.homeScore} – ${f.awayScore}`:'–'}</td><td>{teamLink(f.awayTeamId)}</td></tr>)}</tbody></table></div>
      </>}
    </>}
    {(tab==='clubs'||tab==='countries')&&<><p className="text-sm text-ufa-muted">{en?'Results from five seasons; recent seasons carry more weight. Country coefficients average each participant’s points. Rankings combine all international club cups.':'Wyniki z pięciu sezonów; nowsze sezony mają większą wagę. Ranking kraju uwzględnia średnią punktów jego uczestników. Rankingi łączą wszystkie puchary międzynarodowe.'}</p>{!ranks.length?<p>{en?'Rankings will appear after the first completed competition.':'Ranking pojawi się po zakończeniu pierwszych rozgrywek.'}</p>:<ol className="space-y-2">{ranks.map((r,i)=><li key={r.id} className="flex justify-between border-b border-ufa-border py-2"><span>{i+1}. {tab==='clubs'?teamLink(r.id):(ACADEMY_COUNTRIES[r.id]?.[en?'labelEn':'labelPl']??r.id)}</span><span>{r.points.toFixed(2)}</span></li>)}</ol>}</>}
    {tab==='history'&&<div className="space-y-2">{(cups?.history??[]).filter(h=>h.kind===selected).slice().reverse().map(h=><p key={h.id} className="rounded-md border border-ufa-border p-3">{h.seasonYear}/{String(h.seasonYear+1).slice(-2)} · {teamLink(h.championTeamId)}</p>)}{!(cups?.history??[]).some(h=>h.kind===selected)&&<p>{en?'No completed editions.':'Brak zakończonych edycji.'}</p>}</div>}
  </section>
}
