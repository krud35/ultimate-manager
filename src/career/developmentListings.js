import { getOverallRating } from '../models/playerStats.js'
import { recentPlayingTime } from './matchDevelopment.js'

export function developmentListingDecision(player, team, date) {
  if(player.notForSale||player.loan||player.injury?.daysRemaining>0||(team.players?.length??0)<=16)return null
  const usage=recentPlayingTime(player,team.id,date)
  if(usage.games<4||usage.share>=.12)return null
  const ranked=[...team.players].sort((a,b)=>getOverallRating(b.skills)-getOverallRating(a.skills))
  if(ranked.slice(0,7).some(p=>p.id===player.id))return null
  const average=ranked.slice(0,21).reduce((s,p)=>s+getOverallRating(p.skills),0)/Math.min(21,ranked.length)
  const future=(player.age??25)<=24&&(player.potential??0)>=average+3&&(player.potential??0)-getOverallRating(player.skills)>=5
  return future?'loan':'transfer'
}

export function refreshAiDevelopmentListings(world,{date,excludeTeamId=null}={}) {
  const week=Math.floor(Date.parse(date)/604800000)
  if(!Number.isFinite(week))return
  for(const team of Object.values(world?.teamsById??{})){
    if(team.id===excludeTeamId||team.lastDevelopmentListingWeek===week)continue
    team.lastDevelopmentListingWeek=week
    for(const player of team.players??[]){
      const decision=developmentListingDecision(player,team,date)
      if(!decision&&!player.developmentListing)continue
      player.loanListed=decision==='loan';player.transferListed=decision==='transfer'
      player.developmentListing=decision
    }
  }
}
