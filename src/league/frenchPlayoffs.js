import { standingsTable } from './standings.js'
import { addDays, formatISODate, nextWeekday } from './seasonCalendar.js'
import { allocateFrenchRegions } from './frenchRegions.js'

const tables = league => [league,...(league.otherLeagues ?? [])].filter(l=>l.frenchPyramid)
const ranked = comp => standingsTable(comp.standings).map(r=>r.teamId)
function eligible(id, destination, teams, proposed = {}) {
  const parent = teams[teams[id]?.parentClubId]
  return !parent || (proposed[parent.id] ?? parent.tier) < destination
}
function nationalMoves(comps,teams) {
  const n1=comps.find(l=>l.tier===1),n2=comps.find(l=>l.tier===2)
  const down=ranked(n1).slice(-2)
  const up=ranked(n2).filter(id=>eligible(id,1,teams)).slice(0,2)
  const proposed=Object.fromEntries([...down.map(id=>[id,2]),...up.map(id=>[id,1])])
  // Relegating first teams take priority: their N2 reserves must also drop.
  const forced=ranked(n2).filter(id=>!up.includes(id)&&teams[id]?.parentClubId&&proposed[teams[id].parentClubId]===2)
  const toRegions=[...new Set([...forced,...ranked(n2).reverse().filter(id=>!up.includes(id))])].slice(0,2)
  return {n1,n2,down,up,toRegions,proposed}
}
export function initializeFrenchPlayoffs(league) {
  const comps=tables(league)
  if(comps.filter(l=>l.tier===3).length!==4) return
  const date=formatISODate(nextWeekday(`${league.seasonYear+1}-05-10`,3))
  league.frenchPlayoffs={status:'awaiting-standings',dates:[date,formatISODate(addDays(date,7)),formatISODate(addDays(date,14))],paths:[],promotedTeamIds:[]}
  // An 80-club cup needs seven rounds. Keep its final clear of the promotion playoffs.
  const cup=comps.find(l=>l.cup)?.cup
  if(cup) {
    const finalDate=formatISODate(nextWeekday(`${league.seasonYear+1}-04-21`,3))
    cup.roundDates[cup.roundDates.length-1]=finalDate
    for(const match of cup.matches.filter(m=>m.round==='final')) {
      match.date=finalDate
      for(const comp of comps) { const fixture=comp.fixtures.find(f=>f.id===match.id);if(fixture)fixture.date=finalDate }
    }
  }
}
export function prepareFrenchPlayoffs(league) {
  const state=league.frenchPlayoffs
  if(!state || state.status!=='awaiting-standings')return
  const comps=tables(league)
  // N2's promotion race must be settled before an eligible reserve can enter playoffs.
  const regions=comps.filter(l=>l.tier===3)
  if(comps.some(l=>l.fixtures.some(f=>f.competition==='league'&&f.status!=='completed')))return
  const teams=league.teamsById
  const {proposed,toRegions}=nationalMoves(comps,teams)
  for(const id of toRegions)proposed[id]=3
  const entrants={}
  for(const r of regions) entrants[r.id]=ranked(r).filter(id=>eligible(id,2,teams,proposed)).slice(0,3)
  if(Object.values(entrants).some(ids=>ids.length<3))throw new Error('Not enough eligible French playoff entrants')
  state.status='active'
  for(const [index,[a,b]] of [['nord','ouest'],['est','sud']].entries()) {
    const A=entrants[`fr-3-${a}`],B=entrants[`fr-3-${b}`],prefix=`fr-playoff-${league.seasonYear}-${index}`
    const ids=['q1','q2','s1','s2','f'].map(s=>`${prefix}-${s}`)
    const match=(i,home,away,round,date,nextMatchId,nextSlot)=>({id:ids[i],competition:'promotion-playoff',frenchPlayoff:true,round,date,homeTeamId:home,awayTeamId:away,status:home&&away?'scheduled':'pending',nextMatchId,nextSlot,venue:round==='final'?'neutral':'home'})
    league.fixtures.push(match(0,A[1],B[2],'quarterfinal',state.dates[0],ids[2],'awayTeamId'),match(1,B[1],A[2],'quarterfinal',state.dates[0],ids[3],'awayTeamId'),match(2,A[0],null,'semifinal',state.dates[1],ids[4],'homeTeamId'),match(3,B[0],null,'semifinal',state.dates[1],ids[4],'awayTeamId'),match(4,null,null,'final',state.dates[2]))
    state.paths.push({name:`${a}–${b}`,seeds:[...A,...B],matchIds:ids})
  }
}
export function recordFrenchPlayoffResult(league, fixture) {
  if(!fixture.frenchPlayoff)return
  if(fixture.nextMatchId) {
    const next=league.fixtures.find(f=>f.id===fixture.nextMatchId)
    next[fixture.nextSlot]=fixture.winnerTeamId
    if(next.homeTeamId&&next.awayTeamId)next.status='scheduled'
  }
  const finals=league.fixtures.filter(f=>f.frenchPlayoff&&f.round==='final')
  if(finals.length===2&&finals.every(f=>f.status==='completed')) {
    league.frenchPlayoffs.status='complete'
    league.frenchPlayoffs.promotedTeamIds=finals.map(f=>f.winnerTeamId)
  }
}
export function frenchSeasonMoves(career,comps) {
  const state=career.league.frenchPlayoffs
  if(state?.status!=='complete'||state.promotedTeamIds.length!==2)throw new Error('French promotion playoffs must finish before season rollover')
  const teams=career.world.teamsById,{n1,n2,down,up,toRegions}=nationalMoves(comps,teams)
  const promoted=state.promotedTeamIds
  const regions=comps.filter(l=>l.tier===3)
  const regionalTeams=[...regions.flatMap(l=>l.teamIds).filter(id=>!promoted.includes(id)),...toRegions].map(id=>teams[id])
  const allocation=allocateFrenchRegions(regionalTeams,true)
  const moves=[...down.map(teamId=>({teamId,to:n2,type:'relegations'})),...up.map(teamId=>({teamId,to:n1,type:'promotions'})),...promoted.map(teamId=>({teamId,to:n2,type:'promotions'}))]
  for(const team of regionalTeams) {
    const to=regions.find(l=>l.id===allocation[team.id])
    if(team.domesticLeagueId!==to.id)moves.push({teamId:team.id,to,type:toRegions.includes(team.id)?'relegations':'regional-reassignment'})
  }
  state.movements=moves.map(m=>({teamId:m.teamId,from:teams[m.teamId].domesticLeagueId,to:m.to.id,type:m.type}))
  return moves
}
