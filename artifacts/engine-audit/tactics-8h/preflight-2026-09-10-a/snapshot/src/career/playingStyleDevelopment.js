import { TRAIT_DEFS, getPlayerTraits, replacePlayerTraits, conflictingPlayerTraits } from '../models/playerTraits.js'
import { STYLE_PRACTICE_RULES, evaluateStyleMatch, summarizeStylePractice } from './playingStylePractice.js'
const DAY=86400000
const day=iso=>Date.parse(`${String(iso).slice(0,10)}T00:00:00Z`)/DAY
const ageRate=age=>age<=19?1.4:age<=22?1.2:age<=26?1:age<=30?.65:.4
const limit=(n,min,max)=>Math.max(min,Math.min(max,n))
export function updatePlayingStyles(player, date, season = String(date).slice(0,4)) {
 const today=day(date);if(!Number.isFinite(today))return []
 const state=player.playingStyleDevelopment ??= {version:1,lastWeek:null,seen:[],styles:{},candidates:{},memory:{},season,acquired:0,lastAcquired:null}
 const week=Math.floor(today/7)
 if(state.lastWeek!=null && week<=state.lastWeek)return []
 state.lastWeek=week
 if(state.season!==season){state.season=season;state.acquired=0}
 const traits=getPlayerTraits(player), styles=traits.filter(id=>TRAIT_DEFS[id]?.kind==='style')
 for(const id of styles)state.styles[id]??={level:100,since:date,weakWeeks:0,weakMatches:0,warned:false}
 const history=(player.playingStyleMatches??[]).filter(m=>Number.isFinite(day(m.date))&&day(m.date)<=today&&today-day(m.date)<=84).slice(-10)
 const fresh=history.filter(m=>!state.seen.includes(m.key))
 state.seen=[...new Set([...state.seen,...fresh.map(m=>m.key)])].slice(-32)
 // Absence, injury and unobserved behavior are not evidence of disuse.
 if(player.injury?.daysRemaining>0 || !fresh.length)return []
 const events=[],rate=ageRate(player.age??25)
 for(const id of styles) {
  const item=state.styles[id],recent=summarizeStylePractice(history,id),newPractice=summarizeStylePractice(fresh,id)
  if(!recent||!newPractice)continue
  if(newPractice.strength>=.35) {
   item.level=Math.min(100,item.level+6*rate)
   item.weakWeeks=Math.max(0,item.weakWeeks-2)
   item.weakMatches=Math.max(0,item.weakMatches-newPractice.matches)
   if(item.level>=70)item.warned=false
  } else if(newPractice.strength<.2 && recent.strength<.25 && today-day(item.since)>=42) {
   item.weakWeeks++;item.weakMatches+=newPractice.matches
   if(item.weakWeeks>=8&&item.weakMatches>=6) {
    // Broad category training only helps retain technical specializations, never grants one.
    const technical=STYLE_PRACTICE_RULES[id]?.technical
    const maintains=technical&&player.trainingFocus==='throwing'
    if(!maintains)item.level=Math.max(0,item.level-(technical?2:7)*rate)
   }
  }
  if(item.level<=40&&!item.warned){events.push({kind:'weakening',style:id,date});item.warned=true}
  if(item.level<=0&&item.weakWeeks>=(STYLE_PRACTICE_RULES[id]?.technical?26:12)
    && getPlayerTraits(player).filter(t=>TRAIT_DEFS[t]?.kind==='style').length>1) {
   replacePlayerTraits(player,getPlayerTraits(player).filter(t=>t!==id))
   state.memory[id]=true;delete state.styles[id]
   events.push({kind:'lost',style:id,date})
  }
 }
 const current=getPlayerTraits(player),currentStyles=current.filter(id=>TRAIT_DEFS[id]?.kind==='style')
 for(const id of Object.keys(STYLE_PRACTICE_RULES)) {
  if(current.includes(id))continue
  const summary=summarizeStylePractice(history,id),newPractice=summarizeStylePractice(fresh,id)
  if(!summary||!newPractice)continue
  const candidate=state.candidates[id]??={progress:state.memory[id]?40:0,first:date,matches:0}
  candidate.matches+=fresh.filter(m=>evaluateStyleMatch(m,id)!=null).length
  if(summary.strength>=.6&&newPractice.strength>=.5) {
   const breadth=1+.15*Math.max(0,currentStyles.length-2)
   candidate.progress=limit(candidate.progress+6*rate*summary.strength*summary.independence/breadth,0,100)
  } else if(newPractice.strength<.25)candidate.progress=Math.max(0,candidate.progress-3)
 }
 if(state.acquired>=((player.age??25)<=22?2:1) || (state.lastAcquired&&today-day(state.lastAcquired)<42))return events
 const ranked=Object.entries(state.candidates).filter(([,c])=>c.progress>=100&&c.matches>=6&&today-day(c.first)>=42).sort((a,b)=>b[1].progress-a[1].progress||a[0].localeCompare(b[0]))
 for(const [id] of ranked) {
  // A candidate blocked by the cap must still be practiced when a slot opens.
  if(current.includes(id) || (summarizeStylePractice(fresh,id)?.strength??0)<.5)continue
  const conflicts=conflictingPlayerTraits(id,current)
  // Opposite habits can replace only a demonstrably weakened existing style.
  if(conflicts.some(t=>!state.styles[t]||state.styles[t].level>20))continue
  if(currentStyles.length-conflicts.length>=6)continue
  replacePlayerTraits(player,[...current.filter(t=>!conflicts.includes(t)),id])
  for(const old of conflicts){delete state.styles[old];state.memory[old]=true}
  state.styles[id]={level:100,since:date,weakWeeks:0,weakMatches:0,warned:false}
  delete state.candidates[id];state.acquired++;state.lastAcquired=date
  events.push({kind:conflicts.length?'replaced':'acquired',style:id,replaced:conflicts,date})
  break
 }
 return events
}
export function processPlayingStyleDevelopment(world, date, season) {
 const changes=[]
 for(const team of Object.values(world?.teamsById??{}))for(const player of team.players??[]){
  for(const event of updatePlayingStyles(player,date,season))changes.push({...event,playerId:player.id,playerName:`${player.firstName??''} ${player.lastName??''}`.trim(),teamId:team.id})
 }
 return changes
}
