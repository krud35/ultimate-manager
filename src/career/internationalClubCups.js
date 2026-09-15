/** Saveable international club competitions. Formats are game rules, not WFDF rules. */
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import { simulateAdHocMatch, applyEngineBoxScoreToRoster } from '../league/leagueEngine.js'
import { postClubCash } from './clubEconomy.js'
import { addPlayerLoad } from '../models/playerWorkload.js'
import { recordMatchDevelopment } from './matchDevelopment.js'
import { recordPlayingStyleMatch } from './playingStyleEvidence.js'

export const INTERNATIONAL_CLUB_CUP_DEFS = {
  europe: { name: 'European Ultimate Champions League', maxTeams: 32, continents: ['europe'], summer: false },
  paucc: { name: 'PAUCC', maxTeams: 16, continents: ['northAmerica', 'southAmerica'], summer: true },
  aoucc: { name: 'AOUCC', maxTeams: 16, continents: ['asia', 'oceania'], summer: true },
  wucc: { name: 'WUCC', maxTeams: 32, continents: null, summer: true },
}
const iso = d => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const v = new Date(`${d}T12:00:00Z`); v.setUTCDate(v.getUTCDate() + n); return iso(v) }
const weekday = d => new Date(`${d}T12:00:00Z`).getUTCDay()
const wednesday = d => addDays(d, (3 - weekday(d) + 7) % 7)
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const unique = list => [...new Set(list)]
const country = t => t?.countryId ?? t?.country ?? t?.nationality ?? 'unknown'
const continent = t => t?.continent ?? ACADEMY_COUNTRIES[country(t)]?.continent ?? 'unknown'
const allTeams = c => c.world?.teamsById ?? c.league?.teamsById ?? {}
const state = c => c.internationalClubCups ?? c.league?.internationalClubCups
const powerFloor = n => 2 ** Math.floor(Math.log2(Math.max(2, n)))

export function internationalCoefficientRanking(career, kind = 'clubs', beforeYear = Infinity) {
  const totals = {}
  for (const row of state(career)?.coefficients ?? []) {
    if (row.seasonYear >= beforeYear || beforeYear - row.seasonYear > 5) continue
    const age = Number.isFinite(beforeYear) ? beforeYear - row.seasonYear : 1
    for (const [id, points] of Object.entries(row[kind] ?? {})) totals[id] = (totals[id] ?? 0) + points * Math.max(.2, 1 - (age - 1) * .16)
  }
  return Object.entries(totals).map(([id, points]) => ({ id, points: Math.round(points * 100) / 100 })).sort((a,b) => b.points - a.points || a.id.localeCompare(b.id))
}

function domesticPositions(career) {
  const positions = {}
  for (const league of [career.league, ...Object.values(career.league?.otherLeagues ?? {})]) {
    const rows = Object.values(league?.standings ?? {}).filter(r => r?.teamId)
    rows.sort((a,b) => (b.wins ?? b.points ?? 0) - (a.wins ?? a.points ?? 0) || ((b.pointsFor ?? 0) - (b.pointsAgainst ?? 0)) - ((a.pointsFor ?? 0) - (a.pointsAgainst ?? 0)))
    rows.forEach((r,i) => { positions[r.teamId] = i + 1 })
  }
  return positions
}

function domesticQualificationSnapshot(career) {
  const teamMeta={},topTierByCountry={},cupWinnersByCountry={}
  for(const team of Object.values(allTeams(career))) {
    teamMeta[team.id]={countryId:country(team),leagueId:team.domesticLeagueId??null,tier:Number(team.tier)||1}
  }
  for(const league of [career.league,...Object.values(career.league?.otherLeagues??{})]) {
    if(!league)continue
    for(const id of league.teamIds??Object.keys(league.standings??{})) {
      if(!teamMeta[id])continue
      teamMeta[id]={...teamMeta[id],countryId:league.countryId??teamMeta[id].countryId,leagueId:league.id??teamMeta[id].leagueId,tier:Number(league.tier)||teamMeta[id].tier}
    }
    if(league.cup?.championTeamId) {
      const id=league.cup.championTeamId,countryId=league.cup.countryId??league.countryId??teamMeta[id]?.countryId
      if(countryId)cupWinnersByCountry[countryId]=id
    }
  }
  for(const meta of Object.values(teamMeta))topTierByCountry[meta.countryId]=Math.min(topTierByCountry[meta.countryId]??Infinity,meta.tier)
  return {seasonYear:career.seasonYear,positions:domesticPositions(career),teamMeta,topTierByCountry,cupWinnersByCountry}
}

/** Champions have a path; extra berths follow country coefficients and domestic position. */
export function qualifyInternationalClubs(career, kind, seasonYear) {
  const def = INTERNATIONAL_CLUB_CUP_DEFS[kind], teams = allTeams(career)
  const clubPoints = Object.fromEntries(internationalCoefficientRanking(career, 'clubs', seasonYear).map(r => [r.id,r.points]))
  const countryPoints = Object.fromEntries(internationalCoefficientRanking(career, 'countries', seasonYear).map(r => [r.id,r.points]))
  const live=domesticQualificationSnapshot(career)
  const snapshot=state(career)?.domesticSnapshot??live
  const positions=snapshot.positions
  const metadata=snapshot.teamMeta??live.teamMeta
  const topTierByCountry=snapshot.topTierByCountry??live.topTierByCountry
  const qualifyingCountry=t=>metadata[t.id]?.countryId??country(t)
  const eligible = Object.values(teams).filter(t => t?.id && t.players?.length >= 7 && !t.isNationalTeam && (t.domesticLeagueId || t.countryId) && (!def.continents || def.continents.includes(continent(t))))
  // Prior-season membership is authoritative even after promotion/relegation.
  // A lower-division winner is not the national champion and gets no ordinary berth.
  const topDivision=eligible.filter(t=>(metadata[t.id]?.tier??1)===(topTierByCountry[qualifyingCountry(t)]??1))
  const sorted = topDivision.sort((a,b) => (positions[a.id] ?? 999) - (positions[b.id] ?? 999) || (b.reputation ?? 0) - (a.reputation ?? 0) || a.id.localeCompare(b.id))
  const countries = unique(sorted.map(qualifyingCountry)).sort((a,b) => (countryPoints[b] ?? ACADEMY_COUNTRIES[b]?.strength ?? 0) - (countryPoints[a] ?? ACADEMY_COUNTRIES[a]?.strength ?? 0) || a.localeCompare(b))
  const champions = countries.map(id => sorted.find(t => qualifyingCountry(t) === id)?.id).filter(Boolean)
  const eligibleIds=new Set(eligible.map(t=>t.id))
  const cupWinners=countries.map(id=>snapshot.cupWinnersByCountry?.[id]).filter(id=>eligibleIds.has(id))
  const previous = state(career)?.history?.filter(h => h.kind === kind).at(-1)?.championTeamId
  let selected
  if (kind === 'wucc') {
    // Every available continent, including Africa, receives an initial route.
    const regions = ['europe','northAmerica','southAmerica','asia','oceania','africa']
    const regional = regions.map(region => sorted.find(t => continent(t) === region)?.id).filter(Boolean)
    selected = unique([...(eligibleIds.has(previous) ? [previous] : []), ...regional, ...champions, ...cupWinners]).slice(0, def.maxTeams)
  } else {
    // European overflow champions play qualifiers rather than disappearing from selection.
    selected = unique([...(eligibleIds.has(previous) ? [previous] : []), ...champions, ...cupWinners]).slice(0, kind === 'europe' ? 64 : def.maxTeams)
  }
  const extras = [...sorted].sort((a,b) => (positions[a.id] ?? 999) - (positions[b.id] ?? 999) || (countryPoints[country(b)] ?? 0) - (countryPoints[country(a)] ?? 0) || (clubPoints[b.id] ?? b.reputation ?? 0) - (clubPoints[a.id] ?? a.reputation ?? 0))
  for (const t of extras) { if (selected.length >= def.maxTeams) break; if (!selected.includes(t.id)) selected.push(t.id) }
  return selected.sort((a,b) => (clubPoints[b] ?? teams[b]?.reputation ?? 0) - (clubPoints[a] ?? teams[a]?.reputation ?? 0) || hash(`${seasonYear}:${a}`) - hash(`${seasonYear}:${b}`))
}

export function internationalGroupTable(edition, groupId) {
  const group = edition.groups.find(g => g.id === groupId)
  const rows = Object.fromEntries((group?.teamIds ?? []).map(teamId => [teamId,{teamId,played:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0,diff:0}]))
  for (const f of edition.fixtures.filter(f => f.groupId === groupId && f.status === 'completed')) {
    for (const [id,own,against] of [[f.homeTeamId,f.homeScore,f.awayScore],[f.awayTeamId,f.awayScore,f.homeScore]]) {
      const r=rows[id];r.played++;r.wins += own>against?1:0;r.losses += own<against?1:0;r.pointsFor += own;r.pointsAgainst += against;r.diff=r.pointsFor-r.pointsAgainst
    }
  }
  return Object.values(rows).sort((a,b)=>b.wins-a.wins || b.diff-a.diff || b.pointsFor-a.pointsFor || edition.teamIds.indexOf(a.teamId)-edition.teamIds.indexOf(b.teamId))
}

function fixture(edition, homeTeamId, awayTeamId, date, round, groupId = null) {
  const f = {id:`${edition.id}:${round}:${edition.fixtures.length}`,internationalCupId:edition.id,competition:'international-club',competitionName:edition.name,homeTeamId,awayTeamId,date,round,groupId,status:'scheduled'}
  edition.fixtures.push(f);return f
}

function buildGroups(edition, ids, teams) {
  if (ids.length < 8) return buildKnockout(edition, ids, 0)
  const count=ids.length/4
  edition.phase='groups';edition.groups=Array.from({length:count},(_,i)=>({id:String.fromCharCode(65+i),teamIds:[]}))
  for(let pot=0;pot<4;pot++) {
    const available = new Set(edition.groups.map(g=>g.id))
    for(const id of ids.slice(pot*count,(pot+1)*count)) {
      const choices=edition.groups.filter(g=>available.has(g.id))
      choices.sort((a,b)=>a.teamIds.filter(t=>country(teams[t])===country(teams[id])).length-b.teamIds.filter(t=>country(teams[t])===country(teams[id])).length || hash(`${edition.id}:${pot}:${id}:${a.id}`)-hash(`${edition.id}:${pot}:${id}:${b.id}`))
      choices[0].teamIds.push(id);available.delete(choices[0].id)
    }
  }
  const matches=[[[0,3],[1,2]],[[0,2],[3,1]],[[0,1],[2,3]]]
  const dates=edition.kind==='europe'?['09-16','10-07','10-28','11-11','11-25','12-09'].map(s=>wednesday(`${edition.seasonYear}-${s}`)):[0,2,4].map(n=>addDays(`${edition.seasonYear+1}-06-17`,n))
  dates.forEach((date,r)=>{for(const g of edition.groups)for(const pair of matches[r%3]){const [a,b]=r>=3?[pair[1],pair[0]]:pair;fixture(edition,g.teamIds[a],g.teamIds[b],date,`group-${r+1}`,g.id)}})
}

function buildKnockout(edition, ids, roundIndex) {
  edition.phase='knockout';edition.knockoutRound=roundIndex
  const bracketSize=powerFloor(ids.length-1)*2,byes=ids.length===2?0:bracketSize-ids.length
  const ordered=[...ids],next=ordered.splice(0,byes)
  edition.knockoutByes=next
  // Reserved separately from domestic cup anchors (Jan13, Feb17, Apr7, May19).
  const months=['02-24','03-24','04-21','05-26']
  const roundsLeft=Math.ceil(Math.log2(ids.length))
  const date=edition.kind==='europe'?wednesday(`${edition.seasonYear+1}-${months[Math.max(0,4-roundsLeft)]}`):addDays(`${edition.seasonYear+1}-06-24`,roundIndex*2)
  edition.activeRound=`knockout-${roundIndex}`
  while(ordered.length>=2) fixture(edition,ordered.shift(),ordered.pop(),date,edition.activeRound)
}

function drawEdition(career,kind,seasonYear) {
  const def=INTERNATIONAL_CLUB_CUP_DEFS[kind],ids=qualifyInternationalClubs(career,kind,seasonYear)
  const edition={id:`icc-${kind}-${seasonYear}`,kind,name:def.name,seasonYear,teamIds:ids,groups:[],fixtures:[],phase:ids.length>=2?'draw':'unavailable',registeredRosters:{},qualification:{source:state(career)?.domesticSnapshot?'previous-season':'initial-reputation',teamIds:[...ids]}}
  if(ids.length<2)return edition
  const target=Math.min(def.maxTeams,powerFloor(ids.length)),n=ids.length-target
  if(n>0){edition.phase='qualifying';edition.qualifyingByes=ids.slice(0,target-n);const pool=ids.slice(target-n);for(let i=0;i<n;i++)fixture(edition,pool[i],pool[pool.length-1-i],kind==='europe'?wednesday(`${seasonYear}-08-19`):`${seasonYear+1}-06-15`,'qualifying')}
  else buildGroups(edition,ids,allTeams(career))
  return edition
}

/** Call after world/league creation and after every season rollover. */
export function initializeInternationalClubCups(career,{seasonYear=career.seasonYear}={}) {
  if (!career.world?.worldConfig || career.competition==='ufa' || career.competitionMode==='ufa')return null
  career.internationalClubCups ??= {version:1,editions:[],coefficients:[],history:[],events:[]}
  const s=career.internationalClubCups
  career.league.internationalClubCups=s
  const wuccYear=career.world.worldConfig.international?.wucc!==false&&(seasonYear+1-2026)%4===0
  for(const kind of Object.keys(INTERNATIONAL_CLUB_CUP_DEFS)) {
    if(career.world.worldConfig.international?.[kind]===false || (kind==='wucc'&&(seasonYear+1-2026)%4!==0))continue
    if(wuccYear&&(kind==='paucc'||kind==='aoucc'))continue
    if(!s.editions.some(e=>e.kind===kind&&e.seasonYear===seasonYear))s.editions.push(drawEdition(career,kind,seasonYear))
  }
  syncInternationalClubFixtures(career)
  return s
}

export function internationalClubFixtures(career) { return (state(career)?.editions??[]).flatMap(e=>e.fixtures) }
export function syncInternationalClubFixtures(career) {
  if(!career.league)return
  // Serialized career/league copies must share a single authoritative edition state.
  if(career.internationalClubCups)career.league.internationalClubCups=career.internationalClubCups
  const existing=new Map((career.league.fixtures??=[]).map(f=>[f.id,f]))
  for(const f of internationalClubFixtures(career)) {
    const saved=existing.get(f.id)
    if(!saved){career.league.fixtures.push(f);existing.set(f.id,f)}
    // Save/load duplicates object references. Honor calendar postponements, then
    // rebind the fixture to the edition so future calendar edits stay shared.
    else if(saved!==f){if(saved.status!=='completed'&&saved.date)f.date=saved.date;career.league.fixtures[career.league.fixtures.indexOf(saved)]=f}
  }
}
export function pendingInternationalPlayerFixture(career,date=career.league?.currentDate) {
  return internationalClubFixtures(career).filter(f=>f.status!=='completed'&&f.date<=date&&(f.homeTeamId===career.playerTeamId||f.awayTeamId===career.playerTeamId)).sort((a,b)=>a.date.localeCompare(b.date))[0]??null
}
export function completeInternationalClubSeason(career) { return (state(career)?.editions??[]).every(e=>['complete','unavailable'].includes(e.phase)) }

function finishEdition(career,e,winnerId,date) {
  const s=state(career),teams=allTeams(career)
  if(e.phase==='complete')return
  e.phase='complete';e.championTeamId=winnerId;e.completedDate=date
  const clubPoints={},countryTotals={},entries={}
  for(const id of e.teamIds){clubPoints[id]=1;const c=country(teams[id]);entries[c]=(entries[c]??0)+1}
  for(const f of e.fixtures)if(f.winnerTeamId)clubPoints[f.winnerTeamId]=(clubPoints[f.winnerTeamId]??0)+(f.round==='qualifying'?1:2)
  clubPoints[winnerId]+=5
  for(const [id,points]of Object.entries(clubPoints)){const c=country(teams[id]);countryTotals[c]=(countryTotals[c]??0)+points/(entries[c]||1)}
  s.coefficients.push({editionId:e.id,seasonYear:e.seasonYear,clubs:clubPoints,countries:countryTotals})
  const trophy={id:`trophy:${e.id}`,competitionId:e.kind,name:e.name,seasonYear:e.seasonYear,date,teamId:winnerId,championTeamId:winnerId}
  s.history.push({...trophy,kind:e.kind,placements:e.teamIds.map(teamId=>({teamId,points:clubPoints[teamId]}))})
  const team=teams[winnerId]
  if(team){(team.trophies??=[]).push(trophy);team.reputation=Math.min(100,(team.reputation??40)+3);if(team.fans)team.fans.mood=Math.min(100,(team.fans.mood??50)+8)}
  const championPrize=e.kind==='wucc'?250000:150000
  if(team)postClubCash(team,championPrize,'international_prize',date)
  s.events.push({...trophy,type:'international_club_trophy',amount:championPrize,managerId:team?.managerId??team?.manager?.id??null})
}

function advanceEdition(career,e) {
  const pending=e.fixtures.some(f=>f.status!=='completed')
  if(pending||['complete','unavailable'].includes(e.phase))return
  if(e.phase==='qualifying'){buildGroups(e,[...e.qualifyingByes,...e.fixtures.filter(f=>f.round==='qualifying').map(f=>f.winnerTeamId)],allTeams(career))}
  else if(e.phase==='groups') {
    const winners=e.groups.map(g=>internationalGroupTable(e,g.id)[0].teamId)
    const runners=e.groups.map(g=>internationalGroupTable(e,g.id)[1].teamId)
    // Reverse pairing avoids immediate rematches between qualifiers from the same group.
    buildKnockout(e,[...winners,...[...runners.slice(1),runners[0]].reverse()].filter(Boolean),0)
  } else if(e.phase==='knockout'){
    const round=e.fixtures.filter(f=>f.round===e.activeRound),ids=[...e.knockoutByes,...round.map(f=>f.winnerTeamId)]
    if(ids.length===1)finishEdition(career,e,ids[0],round.at(-1)?.date??career.league.currentDate)
    else buildKnockout(e,ids,e.knockoutRound+1)
  }
  syncInternationalClubFixtures(career)
}

/** Match engine already records stamina wear; do not charge it a second time here. */
export function recordInternationalClubCupResult(career,fixtureId,result,{applyPlayerStats=true}={}) {
  const e=state(career)?.editions.find(e=>e.fixtures.some(f=>f.id===fixtureId)),f=e?.fixtures.find(f=>f.id===fixtureId)
  if(!f||f.status==='completed')return false
  if(!Number.isFinite(result?.homeScore)||!Number.isFinite(result?.awayScore)||result.homeScore===result.awayScore||result.homeScore<0||result.awayScore<0)return false
  Object.assign(f,{status:'completed',homeScore:result.homeScore,awayScore:result.awayScore,winnerTeamId:result.homeScore>result.awayScore?f.homeTeamId:f.awayTeamId})
  const duplicate=career.league?.fixtures?.find(x=>x.id===f.id);if(duplicate&&duplicate!==f)Object.assign(duplicate,f)
  if(applyPlayerStats&&result.boxScore?.length)applyEngineBoxScoreToRoster({teamsById:allTeams(career)},f.homeTeamId,f.awayTeamId,result.boxScore)
  const event={id:f.id,fixtureId:f.id,type:'international_club_match',date:f.date,competition:'international-club',competitionId:e.kind,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeScore:f.homeScore,awayScore:f.awayScore,winner:f.winnerTeamId,winnerTeamId:f.winnerTeamId,boxScore:result.boxScore??[],playedByPlayer:!!result.playedByPlayer}
  if(career.league){recordMatchDevelopment(career.league,event);recordPlayingStyleMatch(career.league,event)}
  state(career).events.push(event)
  if(career.league){career.league.matchHistory??=[];if(!career.league.matchHistory.some(r=>r.fixtureId===f.id))career.league.matchHistory.push(event)}
  const winner=allTeams(career)[f.winnerTeamId];if(winner)postClubCash(winner,e.kind==='wucc'?15000:10000,'international_prize',f.date)
  advanceEdition(career,e)
  return true
}

/** Centralized tournaments freeze their roster on first match; Europe registers in August and February. */
export function internationalRegisteredTeam(career,edition,teamId,date) {
  const team=allTeams(career)[teamId]
  if(!team)return null
  const registrationKey=edition.kind==='europe'&&date>=`${edition.seasonYear+1}-02-01`?'spring':'initial'
  const key=`${teamId}:${registrationKey}`
  edition.registeredRosters[key]??=(team.players??[]).map(p=>p.id)
  const ids=new Set(edition.registeredRosters[key])
  // If fewer than seven remain, emergency replacements are needed to field a legal team.
  const players=(team.players??[]).filter(p=>ids.has(p.id))
  if(players.length<7)for(const p of team.players??[])if(!ids.has(p.id)&&players.length<7){players.push(p);edition.registeredRosters[key].push(p.id)}
  return {...team,players}
}

/** Use for BOTH interactive and automatic fixtures; charges travel once per trip. */
export function prepareInternationalClubMatch(career,fixture) {
  syncInternationalClubFixtures(career)
  const edition=state(career)?.editions.find(e=>e.id===fixture.internationalCupId)
  if(!edition)return null
  const home=internationalRegisteredTeam(career,edition,fixture.homeTeamId,fixture.date)
  const away=internationalRegisteredTeam(career,edition,fixture.awayTeamId,fixture.date)
  edition.travelCharged??={}
  for(const team of [home,away].filter(Boolean)) {
    const key=edition.kind==='europe'?`${team.id}:${fixture.id}`:team.id
    if(edition.travelCharged[key])continue
    // In Europe only the away side travels; summer tournaments have a central host.
    if(edition.kind!=='europe'||team.id===fixture.awayTeamId){postClubCash(allTeams(career)[team.id],-(edition.kind==='wucc'?12000:4000),'international_travel',fixture.date);for(const p of team.players)addPlayerLoad(p,edition.kind==='wucc'?2:1)}
    edition.travelCharged[key]=true
  }
  return {home,away}
}

/** Invoke daily BEFORE club training/recovery. Interactive player matches remain pending. */
export function advanceInternationalClubCups(career,date,{simulatePlayer=false,simulateMatch=simulateAdHocMatch}={}) {
  const s=state(career);if(!s)return []
  syncInternationalClubFixtures(career)
  const messages=[]
  for(const e of s.editions) {
    // Dynamic knockout rounds can be created as results arrive; process all due rounds.
    for(let pass=0;pass<12;pass++) {
      const due=e.fixtures.filter(f=>f.date<=date&&f.status!=='completed').sort((a,b)=>a.date.localeCompare(b.date))
      let progressed=false
      for(const f of due) {
        if(!simulatePlayer&&(f.homeTeamId===career.playerTeamId||f.awayTeamId===career.playerTeamId))continue
        const {home,away}=prepareInternationalClubMatch(career,f)??{}
        if(!home||!away)continue
        const result=simulateMatch(home,away,hash(f.id))
        progressed=recordInternationalClubCupResult(career,f.id,result)||progressed
      }
      if(!progressed)break
    }
    if(e.phase==='complete'&&!e.announced){e.announced=true;const winner=allTeams(career)[e.championTeamId]?.name??e.championTeamId;messages.push({id:`news:${e.id}`,date:e.completedDate,type:'club_news',read:false,title:`${e.name}: ${winner} zdobywa puchar`,titleEn:`${e.name}: ${winner} wins the trophy`,body:`Zakończono ${e.name}. Wyniki, historia i ranking są dostępne w rozgrywkach międzynarodowych.`,bodyEn:`${e.name} has finished. Results, history and coefficients are available in international competitions.`})}
  }
  syncInternationalClubFixtures(career)
  return messages
}

/** Call BEFORE replacing previous domestic standings at season rollover. */
export function snapshotInternationalQualification(career) {
  const s=state(career)
  if(s&&s.domesticSnapshot?.seasonYear!==career.seasonYear)s.domesticSnapshot=domesticQualificationSnapshot(career)
}
