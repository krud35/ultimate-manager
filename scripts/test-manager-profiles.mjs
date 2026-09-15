import assert from 'node:assert/strict'
import { createManagerProfile, MANAGER_BACKGROUND_QUESTIONS, ensureWorldManagers, appointClubManager, recordManagerMatch, recordManagerAchievement, recordManagerResults, createPostPlayingCareer, processWorldManagers } from '../src/career/managerProfiles.js'
import { managerJobOffers, acceptManagerJob, leaveManagerJob } from '../src/career/managerCareer.js'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { staffMarket, hireClubStaff, staffSessionQuality } from '../src/career/clubStaff.js'

const profile = createManagerProfile({ firstName: 'Anna', lastName: 'Test', nationality: 'pl', age: 25, formerPlayer: 'none', answers: Object.fromEntries(MANAGER_BACKGROUND_QUESTIONS.map(q=>[q.id,q.options[0].id])) })
const different = createManagerProfile({ firstName: 'Anna', lastName: 'Test', nationality: 'de', age: 50, formerPlayer: 'none', answers: profile.background.answers })
assert.deepEqual(profile.attributes,different.attributes,'Age and nationality do not grant attribute bonuses')
assert.equal(Object.keys(profile.background.answers).length,7)
assert(Object.values(profile.attributes).every(x=>x>=1&&x<=20))
assert.notDeepEqual(profile.attributes,createManagerProfile({answers:Object.fromEntries(MANAGER_BACKGROUND_QUESTIONS.map(q=>[q.id,q.options[2].id]))}).attributes)

const world = { teamsById: { a:{id:'a',name:'A',country:'Poland',players:[]}, b:{id:'b',name:'B',country:'Germany',players:[]} } }
ensureWorldManagers(world,{managerProfile:profile,playerTeamId:'a',seasonYear:2026,currentDate:'2026-08-15'})
const oldB=world.teamsById.b.manager, oldA=Object.values(world.managersById).find(m=>m.id==='manager-a')
assert.equal(oldA.teamId,null,'Initial incumbent enters market')
const career = { world,managerProfile:profile,playerTeamId:'a',seasonYear:2026,league:{currentDate:'2026-09-01',matchHistory:[],otherLeagues:[]} }
const match={fixtureId:'test',date:'2026-08-20',homeTeamId:'a',awayTeamId:'b',homeScore:15,awayScore:11}
recordManagerMatch(career,match,'cup');recordManagerMatch(career,match,'cup')
assert.equal(profile.stats.wins,1);assert.equal(oldB.stats.losses,1)
recordManagerMatch(career,{...match,fixtureId:'container-move',competition:'league'},'league')
recordManagerMatch(career,{...match,fixtureId:'container-move',competition:'league'},'tier2')
assert.equal(profile.stats.wins,2,'Moving league history into another container cannot recount matches')
recordManagerAchievement(career,'a',{id:'cup-2026',type:'trophy',title:'Cup'})
recordManagerAchievement(career,'a',{id:'cup-2026',type:'trophy',title:'Cup'})
assert.equal(profile.stats.trophies.length,1)
const saved=JSON.parse(JSON.stringify(career))
ensureWorldManagers(saved.world,{managerProfile:saved.managerProfile,playerTeamId:'a',seasonYear:2026,currentDate:'2026-09-01'})
recordManagerMatch(saved,match,'cup')
assert.equal(saved.world.managersById[profile.id].stats.wins,2,'Idempotence survives save/load')
appointClubManager(world,world.teamsById.b,oldA,'2026-09-01')
recordManagerMatch(career,{...match,fixtureId:'late-old',date:'2026-08-25'},'cup')
assert.equal(oldA.stats.matches,0,'Late old match cannot be assigned to new manager')
assert.equal(world.teamsById.b.aiCoachProfile.id,oldA.styleId,'Style follows manager')

const fullWorld=createWorldFromTemplate(2026),teams=Object.values(fullWorld.teamsById).slice(0,4)
fullWorld.teamsById=Object.fromEntries(teams.map(t=>[t.id,t]));fullWorld.teamIds=teams.map(t=>t.id)
fullWorld.worldConfig={leagues:{one:'playable',two:'playable',three:'transfers',four:'off'}}
teams.forEach((t,i)=>{t.domesticLeagueId=['one','two','three','four'][i]})
const league=(team,id)=>({id,label:id,teamIds:[team.id],fixtures:[],standings:{[team.id]:{teamId:team.id,wins:0,losses:9}},matchHistory:[],playerStats:{},totalRounds:0})
const game={competition:'domestic',seasonYear:2026,managerName:'Anna Test',managerProfile:createManagerProfile(),world:fullWorld,playerTeamId:teams[0].id,inbox:[],league:{...league(teams[0],'one'),currentDate:'2026-09-01',otherLeagues:teams.slice(1).map((t,i)=>league(t,['two','three','four'][i]))}}
game.league.countryId='pl';game.league.cup={id:'pl-cup',matches:[]}
game.league.otherLeagues[0].countryId='de';game.league.otherLeagues[1].countryId='de'
game.league.otherLeagues[1].cup={id:'de-cup',matches:[{id:'domestic-cup-de-2026-0-1'}]}
game.league.otherLeagues[1].fixtures=[{id:'domestic-cup-de-2026-0-1',competition:'cup'}]
game.league.fixtures.push({id:'icc-1',competition:'international-club'})
ensureWorldManagers(fullWorld,{managerProfile:game.managerProfile,playerTeamId:game.playerTeamId,seasonYear:2026,currentDate:game.league.currentDate})
const offers=managerJobOffers(game)
assert(offers.every(o=>o.teamId===teams[1].id),'Jobs exclude transfer-only and off leagues')
assert(offers.length)
const accepted=acceptManagerJob(game,offers[0].id)
assert(accepted.ok);assert.equal(accepted.career.league.id,'two');assert.equal(accepted.career.league.otherLeagues.find(l=>l.id==='one').teamIds[0],teams[0].id)
assert.equal(accepted.career.league.cup.id,'de-cup','New main inherits its country cup from another tier')
assert.equal(accepted.career.league.otherLeagues.find(l=>l.id==='one').cup.id,'pl-cup','Previous country keeps its cup')
assert(accepted.career.league.fixtures.some(f=>f.id==='icc-1'),'International fixtures stay on main league')
assert(accepted.career.league.fixtures.some(f=>f.id==='domestic-cup-de-2026-0-1'),'Cup fixtures follow cup ownership')
assert(!accepted.career.league.otherLeagues.find(l=>l.id==='three').fixtures.some(f=>f.competition==='cup'))
assert.equal(accepted.career.world.teamsById[teams[1].id].managerId,game.managerProfile.id)
const left=leaveManagerJob(accepted.career)
assert(left.ok);assert.equal(left.career.world.managersById[game.managerProfile.id].teamId,null)
assert.notEqual(left.career.world.teamsById[teams[1].id].managerId,game.managerProfile.id)
assert.equal(left.career.world.managersById[game.managerProfile.id].history.length,2,'One history entry per finished appointment')

for(let i=0;i<40;i++)createPostPlayingCareer(fullWorld,{id:`retired-${i}`,firstName:'Retired',lastName:`Player ${i}`,age:39},teams[0],'2026-09-01')
assert(fullWorld.managerCandidates.length>0&&fullWorld.staffCandidates.length>0)
const staff=fullWorld.staffCandidates[0],before=fullWorld.staffCandidates.length
createPostPlayingCareer(fullWorld,{id:'once',firstName:'Repeat',lastName:'Test',age:40,postPlayingCareer:{path:'staff'}},teams[0],'2026-09-01')
assert.equal(fullWorld.staffCandidates.length,before)
assert(staff.formerPlayerId&&staff.name.startsWith('Retired'))
const candidate=staffMarket(teams[0],staff.role,'2026-09-01').find(c=>c.id===staff.id)
assert(candidate,'Former player appears in hiring market')
teams[0].finances.cash=1e8
const hired=hireClubStaff(teams[0],staff.role,staff.id,'2026-09-01')
assert(hired.ok,JSON.stringify(hired));assert.equal(teams[0].staffMembers[staff.role].formerPlayerId,staff.formerPlayerId)
assert(!staffMarket(teams[0],staff.role,'2026-09-01').some(c=>c.id===staff.id))
assert(staffSessionQuality(teams[0],['structural'])<=1.2,'Combined manager and staff bonus stays capped')
processWorldManagers(game)
fullWorld.domesticHistory=[{year:2026,leagues:[{id:'one',championTeamId:teams[0].id}]}]
fullWorld.domesticMovements=[{teamId:teams[0].id,type:'promotions',leagueId:'higher',year:2026}]
processWorldManagers(game);processWorldManagers(game)
assert.equal(game.managerProfile.stats.trophies.length,1)
assert.equal(game.managerProfile.stats.promotions,1)
const crisisWorld={teamsById:{x:{id:'x',name:'Crisis',country:'Poland',players:[]},y:{id:'y',name:'Winner',country:'Germany',players:[]}}}
ensureWorldManagers(crisisWorld,{seasonYear:2026,currentDate:'2026-08-15'})
const crisisManager=crisisWorld.teamsById.x.managerId
const crisisCareer={seasonYear:2026,world:crisisWorld,league:{id:'test',currentDate:'2026-10-01',teamIds:['x','y'],otherLeagues:[],matchHistory:Array.from({length:6},(_,i)=>({fixtureId:`loss-${i}`,date:`2026-09-${String(i+1).padStart(2,'0')}`,homeTeamId:'x',awayTeamId:'y',homeScore:8,awayScore:15}))}}
processWorldManagers(crisisCareer)
assert.equal(crisisWorld.teamsById.x.managerId,crisisManager,'Poor run gets an improvement period')
crisisCareer.league.currentDate='2026-11-01';processWorldManagers(crisisCareer)
assert.notEqual(crisisWorld.teamsById.x.managerId,crisisManager,'Sustained crisis changes AI manager')
assert.equal(crisisWorld.managersById[crisisManager].teamId,null)
const replacementId=crisisWorld.teamsById.x.managerId
processWorldManagers(crisisCareer)
assert.equal(crisisWorld.teamsById.x.managerId,replacementId,'Monthly review is idempotent')
const trophyWorld={teamsById:{a:{id:'a',name:'A',country:'Poland',players:[]},b:{id:'b',name:'B',country:'Poland',players:[]}}}
ensureWorldManagers(trophyWorld,{seasonYear:2026,currentDate:'2026-08-15'})
const winner=trophyWorld.teamsById.a.manager
const trophyCareer={competition:'domestic',world:trophyWorld,seasonYear:2026,league:{id:'pl1',countryId:'pl',currentDate:'2027-05-20',matchHistory:[],standings:{a:{teamId:'a',wins:3,losses:0,pointsFor:45,pointsAgainst:20}},fixtures:[{id:'last-league',date:'2027-05-19',status:'completed',competition:'league'}],cup:{id:'cup-pl',countryId:'pl',championTeamId:'a',matches:[{id:'cup-final',round:'final',status:'completed',date:'2027-05-20'}]}}}
trophyCareer.league.tier=1;trophyCareer.league.teamIds=['a','x1','x2','x3']
trophyCareer.league.otherLeagues=[{id:'pl2',countryId:'pl',tier:2,teamIds:['b','x4','x5','x6'],standings:{b:{teamId:'b',wins:3,losses:0,pointsFor:45,pointsAgainst:20}},fixtures:[{id:'last-lower',date:'2027-05-18',status:'completed',competition:'league'}]}]
recordManagerResults(trophyCareer)
assert.equal(winner.stats.trophies.length,2,'League and cup titles are recorded immediately at completion')
assert.equal(trophyWorld.teamsById.b.manager.stats.promotions,1,'Promotion credited when both adjacent league tables finish')
const successor=createManagerProfile({id:'successor',firstName:'New',lastName:'Manager'})
appointClubManager(trophyWorld,trophyWorld.teamsById.a,successor,'2027-05-21')
trophyWorld.domesticHistory=[{year:2026,leagues:[{id:'pl1',countryId:'pl',championTeamId:'a',cupChampionTeamId:'a'}]}]
trophyWorld.domesticMovements=[{year:2026,teamId:'b',type:'promotions',leagueId:'pl1'}]
recordManagerResults(trophyCareer)
assert.equal(trophyWorld.teamsById.b.manager.stats.promotions,1,'July membership update does not duplicate promotion')
assert.equal(successor.stats.trophies.length,0,'Successor cannot inherit predecessor titles at season archive')
assert.equal(winner.stats.trophies.length,2,'Immediate and archived titles share global receipts')
recordManagerAchievement(trophyCareer,'a',{id:'late-reported-title',type:'trophy',date:'2027-05-18'})
assert.equal(winner.stats.trophies.length,3,'Late report finds the manager employed on the event date')
assert.equal(successor.stats.trophies.length,0)
const names=Object.values(fullWorld.managersById).map(m=>m.name)
assert(new Set(names).size>2)
console.log('Manager profiles: quiz, identities, records, migration, domestic jobs, retirement and staff integration passed.')
