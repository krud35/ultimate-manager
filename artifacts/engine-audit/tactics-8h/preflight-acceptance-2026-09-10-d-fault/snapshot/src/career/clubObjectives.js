export const CLUB_STRATEGY_DEFS = {
 development: { pl:'Rozwój młodzieży', en:'Youth development', place:12, youth:4, primary:'youth' },
 balanced: { pl:'Zrównoważony rozwój', en:'Balanced development', place:8, youth:2, primary:'league' },
 contend: { pl:'Walka o trofea', en:'Challenge for trophies', place:3, youth:1, primary:'league' },
 promotion: { pl:'Walka o awans', en:'Promotion challenge', place:2, youth:2, primary:'league' },
 financial: { pl:'Stabilność finansowa', en:'Financial stability', place:10, youth:3, primary:'finance' },
 survival: { pl:'Utrzymanie w lidze', en:'Avoid relegation', place:13, youth:2, primary:'league' },
}
export function clubObjectives(team, lang='pl') {
 const en=lang==='en', g=team.boardObjective, def=CLUB_STRATEGY_DEFS[team.clubStrategy]??CLUB_STRATEGY_DEFS.balanced
 if(!g)return []
 return [
  {id:'league',label:en?'League finish':'Miejsce w lidze',target:en?`Top ${g.targetPlace}`:`Miejsce ${g.targetPlace} lub wyższe`,deadline:en?'Every season':'Każdy sezon'},
  {id:'youth',label:en?'Academy graduates':'Awanse wychowanków',target:`${g.graduates}/${g.youthTarget}`,deadline:en?`By season ${g.untilSeason}/${g.untilSeason+1}`:`Do końca sezonu ${g.untilSeason}/${g.untilSeason+1}`},
  {id:'finance',label:en?'Financial stability':'Stabilność finansowa',target:en?'No debt':'Bez zadłużenia',deadline:en?'Every monthly review':'Każdy przegląd miesięczny'},
 ].map(o=>({...o,priority:o.id===def.primary?1:o.id==='league'?2:3})).sort((a,b)=>a.priority-b.priority)
}
