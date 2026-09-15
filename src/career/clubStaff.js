import { staffWeeklyCosts, clubReputation } from './economyBalance.js'
import { ensureClubEconomy, postClubCash } from './clubEconomy.js'
import { getTransferBudget } from './transfers/clubFinances.js'
import { generateStaffName, isLegacyStaffName } from './staffNames.js'

export const STAFF_ROLE_DEFS = {
  youthCoach: { pl: 'Trener młodzieży', en: 'Youth coach', skills: ['coaching','development','communication'] },
  chiefScout: { pl: 'Główny skaut', en: 'Chief scout', skills: ['judgement','development','network'] },
  physio: { pl: 'Fizjoterapeuta', en: 'Physiotherapist', skills: ['recovery','prevention','communication'] },
  sportingDirector: { pl: 'Dyrektor sportowy', en: 'Sporting director', skills: ['judgement','negotiation','network'] },
  assistantCoach: { pl: 'Asystent trenera', en: 'Assistant coach', skills: ['coaching','planning','communication'] },
  analyst: { pl: 'Analityk', en: 'Analyst', skills: ['analysis','judgement','communication'] },
}
export const CLUB_STAFF_ROLES = Object.keys(STAFF_ROLE_DEFS)
export const STAFF_SPECIALTIES = ['throwing','offensive','defensive','physical','structural','mental']
export const STAFF_SPECIALTY_LABELS = {
  throwing: ['Technika rzutów','Throwing technique'], offensive: ['Atak','Offense'], defensive: ['Obrona','Defense'], physical: ['Przygotowanie fizyczne','Conditioning'], structural: ['Taktyka','Tactics'], mental: ['Decyzje','Decision making'], rehabilitation: ['Rehabilitacja','Rehabilitation'], prevention: ['Profilaktyka','Prevention'], talent: ['Młode talenty','Young talent'], recruitment: ['Rekrutacja','Recruitment'], squad: ['Planowanie kadry','Squad planning'], negotiation: ['Negocjacje','Negotiation'],
}
const roleSpecialties = { physio: ['rehabilitation','prevention'], chiefScout: ['talent','recruitment'], sportingDirector: ['squad','negotiation'] }
const hash = value => { let h=17; for(const c of String(value)) h=(Math.imul(h,31)+c.charCodeAt(0))>>>0; return h }
function createStaff(id, role, level, year, country, excluded = []) {
  const h=hash(id)
  return { id, role, level, name: generateStaffName(id, country, excluded), nameGenerationVersion: 2, age: 30+h%26,
    skills: Object.fromEntries(STAFF_ROLE_DEFS[role].skills.map((s,i)=>[s,Math.min(20,level*5+((h>>>i)%4))])),
    specialty: (roleSpecialties[role] ?? STAFF_SPECIALTIES)[h % (roleSpecialties[role] ?? STAFF_SPECIALTIES).length], weeklyWage: staffWeeklyCosts[level], expiresOn: `${year+1}-07-31` }
}
/** Legacy levels remain derived compatibility fields for scouting/academy/medical systems. */
export function ensureClubStaff(team, year = team.financeSeasonYear ?? 2025) {
  team.staff ??= { youthCoach: 1, chiefScout: 1, physio: 1, sportingDirector: 1 }
  team.staffMembers ??= {}
  for(const role of CLUB_STAFF_ROLES) {
    team.staff[role] ??= 0
    const excluded = Object.values(team.staffMembers).filter(Boolean).map(p => p.name)
    if (!(role in team.staffMembers)) team.staffMembers[role] = team.staff[role] > 0 ? createStaff(`${team.id}-${role}-legacy`,role,team.staff[role],year,team.country,excluded) : null
    const member = team.staffMembers[role]
    if (member && isLegacyStaffName(member)) {
      member.name = generateStaffName(member.id, team.country, excluded)
      member.nameGenerationVersion = 2
    }
  }
  return team.staffMembers
}
export function staffPayroll(team) {
  return Object.values(ensureClubStaff(team)).reduce((sum,p)=>sum+(p?.weeklyWage??0),0)
}
export function staffMarket(team, role, date) {
  if (!STAFF_ROLE_DEFS[role] || !validDate(date)) return []
  const year=Number(date.slice(0,4)), month=date.slice(0,7)
  const names = []
  return [1,2,3].map(level => {
    const candidate = createStaff(`${team.id}-${role}-${month}-${level}`,role,level,year,team.country,names)
    names.push(candidate.name)
    return { ...candidate, interested: clubReputation(team) >= (level===3?55:level===2?30:0) }
  })
}
export function staffReleaseCost(member, date) {
  if(!member)return 0
  const weeks=Math.max(0,Math.ceil((Date.parse(member.expiresOn)-Date.parse(date))/604800000))
  return Math.min(8,weeks)*member.weeklyWage
}
function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date }
function extendDate(date,years) { const d=new Date(`${date}T12:00:00Z`);d.setUTCFullYear(d.getUTCFullYear()+years);return d.toISOString().slice(0,10) }
function updatePayroll(team,previousWage,nextWage) { const f=ensureClubEconomy(team);f.weeklyOperations=Math.max(0,(f.weeklyOperations??0)+nextWage-previousWage) }
export function hireClubStaff(team, role, candidateId, date, years=1) {
  if(![1,2,3].includes(years)||!validDate(date))return {ok:false,error:'invalid_contract'}
  const members=ensureClubStaff(team), candidate=staffMarket(team,role,date).find(p=>p.id===candidateId)
  if(!candidate?.interested || members[role]?.id===candidateId)return {ok:false,error:'unavailable'}
  const cost=candidate.weeklyWage*4+staffReleaseCost(members[role],date)
  if(getTransferBudget(team)<cost)return {ok:false,error:'insufficient_funds'}
  postClubCash(team,-cost,'staff_recruitment',date)
  const previousWage=members[role]?.weeklyWage??0
  members[role]={...candidate,expiresOn:extendDate(date,years)}
  team.staff[role]=candidate.level
  updatePayroll(team,previousWage,candidate.weeklyWage)
  return {ok:true,cost}
}
export function releaseClubStaff(team,role,date) {
  if(!validDate(date))return {ok:false,error:'invalid_contract'}
  const members=ensureClubStaff(team),cost=staffReleaseCost(members[role],date)
  if(!members[role])return {ok:false,error:'unavailable'}
  if(getTransferBudget(team)<cost)return {ok:false,error:'insufficient_funds'}
  postClubCash(team,-cost,'staff_recruitment',date)
  updatePayroll(team,members[role].weeklyWage,0)
  members[role]=null;team.staff[role]=0
  return {ok:true,cost}
}
export function renewClubStaff(team,role,date,years=1) {
  const p=ensureClubStaff(team)[role]
  if(!p || ![1,2,3].includes(years) || !validDate(date))return {ok:false,error:'unavailable'}
  const start=p.expiresOn>date?p.expiresOn:date
  p.expiresOn=extendDate(start,years)
  return {ok:true}
}
export function setLegacyStaffLevel(team, role, level) {
  ensureClubStaff(team)
  team.staff[role]=level
  team.staffMembers[role]=level?createStaff(`${team.id}-${role}-${level}`,role,level,team.financeSeasonYear??2025,team.country):null
}
export function processStaffContracts(team,date,{ai=false}={}) {
  const notices=[]
  for(const [role,p] of Object.entries(ensureClubStaff(team))) {
    if(!p)continue
    const days=Math.ceil((Date.parse(p.expiresOn)-Date.parse(date))/86400000)
    if(ai && days<=30 && ensureClubEconomy(team).cash>staffPayroll(team)*12) { renewClubStaff(team,role,date);continue }
    if(days<=0) {updatePayroll(team,p.weeklyWage,0);team.staffMembers[role]=null;team.staff[role]=0;notices.push({role,name:p.name,expired:true})}
    else if(days<=30 && p.remindedExpiry!==p.expiresOn) {p.remindedExpiry=p.expiresOn;notices.push({role,name:p.name,expired:false})}
  }
  if(ai && !team.staff?.assistantCoach && ensureClubEconomy(team).cash>100_000) {
    const candidate=staffMarket(team,'assistantCoach',date)[0]
    hireClubStaff(team,'assistantCoach',candidate.id,date)
    if(team.teamTraining?.schedule)team.teamTraining.schedule.delegated=true
  }
  return notices
}
export function staffSessionQuality(team,focuses,player=null) {
  const members=ensureClubStaff(team)
  const roles=player && (player.age??25)<=21?['youthCoach','assistantCoach']:['assistantCoach']
  if(focuses.includes('structural'))roles.push('analyst')
  let bonus=0
  for(const role of roles) {
    const p=members[role];if(!p)continue
    const skill=p.skills.coaching??p.skills.analysis??10
    bonus += skill * 0.004 + (focuses.includes(p.specialty) ? 0.025 : 0)
  }
  return 1+Math.min(.2,bonus)
}
