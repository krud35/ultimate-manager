import { ensureClubManagement } from './clubManagement.js'
import { clubWelcomeSnapshot } from './clubWelcome.js'
import { CLUB_STRATEGY_DEFS, clubObjectives } from './clubObjectives.js'
import { clubCash } from './clubEconomy.js'
import { currentEucsTier } from './competitionMembership.js'
import { standingsTable } from '../league/standings.js'
import { ensureAiCoachProfiles } from '../matchEngine/aiCoachProfile.js'
import { ensureTeamTraining } from './teamTraining.js'

const clamp=(x,min,max)=>Math.max(min,Math.min(max,x))
const dayDiff=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000
function competitionFor(c,teamId){return [c.league,...(c.league?.otherLeagues??[])].find(l=>l?.teamIds?.includes(teamId)||l?.standings?.[teamId])}
function standing(c,id){const l=competitionFor(c,id),table=standingsTable(l?.standings??{});const index=table.findIndex(r=>r.teamId===id);const row=table[index];return {place:index+1,total:table.length,wins:row?.wins??0,losses:row?.losses??0,played:(row?.wins??0)+(row?.losses??0)}}
function message(c,id,title,titleEn,body,bodyEn){return {id,date:c.league.currentDate,type:'club_news',read:false,seasonYear:c.seasonYear,title,titleEn,body,bodyEn,payload:{kind:'manager_career'}}}
export function ensureManagerCareer(c){
 if(!c.managerCareer){const t=c.world?.teamsById[c.playerTeamId],s=standing(c,c.playerTeamId);c.managerCareer={status:c.playerTeamId?'employed':'unemployed',reputation:({1:60,2:40,3:22})[currentEucsTier(t)]??40,joinedDate:c.league?.currentDate,joinedTeamId:c.playerTeamId,appointmentIndex:1,lastWins:s.wins,lastLosses:s.losses,lastSeason:c.seasonYear,warnings:[],history:[],offers:[]}}
 return c.managerCareer
}
export function addManagerWelcome(c){
 const m=ensureManagerCareer(c),t=c.world?.teamsById[c.playerTeamId];if(!t)return c
 ensureClubManagement(t,c.seasonYear)
 const key=`manager-welcome-${t.id}-${m.joinedDate}-${m.appointmentIndex??1}`
 if(m.welcomeId===key)return c
 const body=lang=>`${lang==='en'?'Welcome to':'Witamy w'} ${t.name}. ${lang==='en'?'Club strategy':'Strategia klubu'}: ${CLUB_STRATEGY_DEFS[t.clubStrategy]?.[lang==='en'?'en':'pl']}.\n\n`+clubObjectives(t,lang).map(o=>`${lang==='en'?'Priority':'Priorytet'} ${o.priority}: ${o.label} — ${o.target}. ${o.deadline}.`).join('\n')+`\n\n${lang==='en'?'The board reviews your work monthly. Warnings and a chance to improve precede dismissal.':'Zarząd ocenia Twoją pracę co miesiąc. Przed zwolnieniem otrzymasz ostrzeżenia i czas na poprawę.'}`
 const welcomeMessage=message(c,key,'Strategia i oczekiwania zarządu','Club strategy and board expectations',body('pl'),body('en'))
 welcomeMessage.payload.welcome=clubWelcomeSnapshot(t,c.seasonYear)
 c.inbox=[welcomeMessage,...(c.inbox??[])];m.welcomeId=key;return c
}
function updateRecord(c){const m=ensureManagerCareer(c);if(!c.playerTeamId)return
 const s=standing(c,c.playerTeamId)
 if(m.lastSeason!==c.seasonYear){m.lastWins=0;m.lastLosses=0;m.lastSeason=c.seasonYear}
 const wins=Math.max(0,s.wins-m.lastWins),losses=Math.max(0,s.losses-m.lastLosses)
 m.reputation=clamp(m.reputation+wins*1.1-losses*.9,5,95);m.wins=(m.wins??0)+wins;m.losses=(m.losses??0)+losses
 m.lastWins=s.wins;m.lastLosses=s.losses
 return {...s,newGames:wins+losses}
}
export function managerJobOffers(c){
 const m=ensureManagerCareer(c),date=c.league.currentDate,month=date.slice(0,7)
 const eligible=Object.values(c.world.teamsById).filter(t=>t.id!==c.playerTeamId&&t.id!==m.lastClubId).map(t=>{
  ensureClubManagement(t,c.seasonYear)
  const s=standing(c,t.id),tier=currentEucsTier(t),rep=Number(t.reputation?.value??t.reputation??50)
  const weak=s.place>=Math.max(1,s.total-3)
  const required=weak&&(tier===3||!tier)?5:({1:54,2:30,3:12})[tier]??25
  const threshold=required+(weak?0:rep*.12)+(t.clubStrategy==='contend'?6:0)
  const vacancy=t.boardObjective.confidence<40||(s.played>=4&&s.place>t.boardObjective.targetPlace+3)||weak
  return {teamId:t.id,name:t.name,tier,required:Math.round(threshold),reason:weak?'rebuild':'underperforming',vacancy}
 }).filter(o=>o.vacancy&&m.reputation>=o.required).sort((a,b)=>b.required-a.required||a.teamId.localeCompare(b.teamId)).slice(0,4)
 return eligible.map(o=>({...o,id:`job-${month}-${o.teamId}`,month}))
}
function clearClubDecisions(c){c.inbox=(c.inbox??[]).map(msg=>['pending','counter','awaiting_reply'].includes(msg.payload?.status)?{...msg,payload:{...msg.payload,status:'withdrawn'}}:msg);c.pendingEventFollowUps=[]}
export function leaveManagerJob(c,{dismissed=false}={}){
 if(!c.playerTeamId)return {ok:false,error:'not_employed'}
 const next=structuredClone(c),m=ensureManagerCareer(next),t=next.world.teamsById[next.playerTeamId]
 updateRecord(next)
 m.history.push({teamId:t.id,teamName:t.name,from:m.joinedDate,to:next.league.currentDate,reason:dismissed?'dismissed':'resigned',reputation:Math.round(m.reputation)})
 m.reputation=clamp(m.reputation-(dismissed?8:2),5,95);m.lastClubId=t.id;m.status='unemployed';m.offers=[];m.warnings=[]
 next.playerTeamId=null;next.league.playerTeamId=null;next.homeTactics=null;clearClubDecisions(next);ensureAiCoachProfiles(next.world,null)
 next.inbox.unshift(message(next,`manager-exit-${t.id}-${next.league.currentDate}`,dismissed?'Zwolnienie z klubu':'Odejście z klubu',dismissed?'Dismissed by the board':'Resignation confirmed',`${t.name}: ${dismissed?'zarząd zakończył współpracę po ostrzeżeniach.':'Twoja rezygnacja została przyjęta.'} Oferty pracy znajdziesz w panelu kariery trenera.`,`${t.name}: ${dismissed?'the board has dismissed you after warnings.':'your resignation has been accepted.'} Check the manager career panel for available jobs.`))
 return {ok:true,career:next}
}
export function acceptManagerJob(c,offerId){
 const offer=managerJobOffers(c).find(o=>o.id===offerId);if(!offer)return {ok:false,error:'offer_unavailable'}
 let next=c.playerTeamId?leaveManagerJob(c).career:structuredClone(c)
 const team=next.world.teamsById[offer.teamId],m=ensureManagerCareer(next),old=next.league,target=competitionFor(next,team.id)
 if(!target)return {ok:false,error:'competition_unavailable'}
 if(target!==old){
  const keys=['teamIds','fixtures','standings','playerStats','matchHistory','totalRounds','simSeedBase']
  const previous={id:`tier${next.pyramid?.tier}`,label:`UltiLeague ${next.pyramid?.tier}`}
  for(const k of keys){previous[k]=old[k];old[k]=target[k]}
  old.otherLeagues=[...(old.otherLeagues??[]).filter(l=>l!==target),previous]
  old.currentRound=old.fixtures.find(f=>f.status!=='completed')?.round??old.totalRounds
  old.scheduleRounds=Array.from({length:old.totalRounds},(_,i)=>old.fixtures.filter(f=>f.round===i+1))
  old.fallStandingsOrder=null
  old.seasonLabel=`${target.label} ${next.seasonYear}/${next.seasonYear+1}`
 }
 next.playerTeamId=team.id;old.playerTeamId=team.id;old.teamsById=next.world.teamsById
 ensureAiCoachProfiles(next.world,team.id);ensureTeamTraining(team)
 if(next.pyramid)next.pyramid={...next.pyramid,tier:currentEucsTier(team)}
 m.appointmentIndex=(m.appointmentIndex??1)+1;m.status='employed';m.joinedDate=old.currentDate;m.joinedTeamId=team.id;m.warnings=[];m.lastReviewMonth=old.currentDate.slice(0,7);m.welcomeId=null
 const s=standing(next,team.id);m.lastWins=s.wins;m.lastLosses=s.losses;m.lastSeason=next.seasonYear
 team.boardObjective.confidence=60;clearClubDecisions(next);next.homeTactics=null;addManagerWelcome(next)
 return {ok:true,career:next}
}
export function processManagerCareer(c){
 const m=ensureManagerCareer(c),date=c.league.currentDate,month=date.slice(0,7)
 addManagerWelcome(c)
 if(m.status==='employed'&&c.playerTeamId&&m.lastReviewMonth!==month){
  m.lastReviewMonth=month
  const t=c.world.teamsById[c.playerTeamId],s=updateRecord(c),g=t.boardObjective
  const primary=CLUB_STRATEGY_DEFS[t.clubStrategy]?.primary??'league'
  const sport=s.newGames>=2&&s.played>=4?(s.place<=g.targetPlace?5:s.place>g.targetPlace+3?-10:-4):0
  const finance=clubCash(t)<0?(primary==='finance'?-10:-6):0
  const elapsed=Math.max(0,(Number(date.slice(0,4))-g.fromSeason)*12+Number(date.slice(5,7))-8)
  const expected=Math.floor(g.youthTarget*Math.min(1,elapsed/((g.untilSeason-g.fromSeason+1)*12)))
  const youth=primary==='youth'&&g.graduates<expected?-4:0
  g.confidence=clamp(g.confidence+Math.round(sport*(primary==='league'?1.3:1))+finance+youth,0,100)
  if(g.confidence>40)m.warnings=[]
  const last=m.warnings.at(-1)
  if(g.confidence<=15&&m.warnings.length>=2&&dayDiff(date,last.date)>=14){return leaveManagerJob(c,{dismissed:true}).career}
  if(g.confidence<=30&&(!last||dayDiff(date,last.date)>=14)&&m.warnings.length<2){
   m.warnings.push({date,confidence:g.confidence})
   c.inbox.unshift(message(c,`board-warning-${t.id}-${date}`,m.warnings.length===2?'Ostateczne ostrzeżenie zarządu':'Ostrzeżenie zarządu',m.warnings.length===2?'Final board warning':'Board warning',`Zaufanie zarządu: ${g.confidence}/100. Popraw realizację priorytetowych celów. Utrzymanie bardzo niskiego zaufania może skutkować zwolnieniem po okresie na poprawę.`,`Board confidence: ${g.confidence}/100. Improve priority objectives. Persistently very low confidence may lead to dismissal after time to improve.`))
  }
 }
 // Job offers are surfaced in the manager career panel (managerJobOffers(c)
 // is read directly there) — no inbox notification, so they don't interrupt
 // the calendar/sim loop while the manager is happily employed.
 if(m.lastOfferMonth!==month){m.lastOfferMonth=month;m.offers=managerJobOffers(c)}
 return c
}
