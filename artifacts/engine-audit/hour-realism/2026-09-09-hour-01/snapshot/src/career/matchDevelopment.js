import { PLAYER_STAT_CATEGORIES, categoryStatRange, getOverallRating, getSubStat, normalizePlayerSkills } from '../models/playerStats.js'
import { getPlayerForm } from '../models/playerForm.js'
import { currentEucsTier } from './competitionMembership.js'
import { createRng } from '../matchEngine/rng.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
function hash(text) { let h=17; for(const c of String(text))h=Math.imul(h,31)+c.charCodeAt(0);return h>>>0 }

/** Participation in actual points is the engine's playing-time measure. No bench XP. */
export function matchDevelopmentCredit(player, { share, tier, opponentOverall }) {
  if (!(share > 0)) return 0
  const ovr=getOverallRating(player.skills),room=Math.max(0,(player.potential??ovr)-ovr),age=player.age??25
  const ageMult=age<=20?1.25:age<=23?1.1:age<=26?.75:age<=29?.4:.15
  const level=({1:1.15,2:1,3:.8})[tier]??1.05
  const challenge=clamp(1+((opponentOverall??ovr)-ovr)/40,.8,1.2)
  const form=clamp(.75+(getPlayerForm(player)-45)/120,.6,1.2)
  const fatigue=clamp(1-(player.developmentFatigue??0)/150,.4,1)
  return 1.6*Math.min(1,share/.5)*ageMult*level*challenge*form*fatigue*Math.min(1,room/8)
}

export function recordMatchDevelopment(league, record) {
  if(record.forfeited || !record.boxScore?.length)return
  const key=String(record.fixtureId??record.id??'')
  if(!key)return
  const date=record.date??league.currentDate
  const totalPoints=Math.max(1,(record.homeScore??0)+(record.awayScore??0))
  const rows=new Map(record.boxScore.map(r=>[String(r.playerId??r.id),r]))
  for(const [id,opponentId] of [[record.homeTeamId,record.awayTeamId],[record.awayTeamId,record.homeTeamId]]){
    const team=league.teamsById?.[id],opponent=league.teamsById?.[opponentId];if(!team)continue
    const matchKey=`${date}|${key}`
    if(team.developmentMatches?.includes(matchKey))continue
    team.developmentMatches=[...(team.developmentMatches??[]).slice(-39),matchKey]
    const rivals=opponent?.players??[]
    const opponentOverall=rivals.length?rivals.reduce((s,p)=>s+getOverallRating(p.skills),0)/rivals.length:70
    for(const p of team.players??[]){
      const points=Math.max(0,Number(rows.get(String(p.id))?.pointsPlayed)||0),share=clamp(points/totalPoints,0,1)
      p.recentPlayingTime=[...(p.recentPlayingTime??[]).slice(-7),{teamId:id,date,share,available:points>0||!(p.injury?.daysRemaining>0)}]
      const credit=matchDevelopmentCredit(p,{share,tier:currentEucsTier(team),opponentOverall})
      if(!credit)continue
      p.matchDevelopmentCredit=Math.min(3,(p.matchDevelopmentCredit??0)+credit)
      const rng=createRng(hash(`${p.id}|${matchKey}|development`))
      const cats=Object.keys(PLAYER_STAT_CATEGORIES)
      let gains=0
      while(p.matchDevelopmentCredit>=1){
        p.matchDevelopmentCredit-=1
        const options=cats.flatMap(cat=>PLAYER_STAT_CATEGORIES[cat].map(stat=>({cat,stat})))
          .filter(({cat,stat})=>getSubStat(p.skills,cat,stat)<Math.min(categoryStatRange(cat).max,(p.potential??70)+2))
        if(!options.length)break
        const {cat,stat}=options[rng.int(0,options.length-1)]
        const skills=structuredClone(normalizePlayerSkills(p.skills))
        skills[cat][stat]=getSubStat(skills,cat,stat)+1;p.skills=skills;gains++
      }
      p.matchDevelopmentGains=(p.matchDevelopmentGains??0)+gains
    }
  }
}

export function recentPlayingTime(player, teamId, date) {
  const rows=(player.recentPlayingTime??[]).filter(r=>r.teamId===teamId&&r.available&&(!date||((Date.parse(date)-Date.parse(r.date))/86400000<=90)))
  return {games:rows.length,share:rows.length?rows.reduce((s,r)=>s+r.share,0)/rows.length:0}
}
