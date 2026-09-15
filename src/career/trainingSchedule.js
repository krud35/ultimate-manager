import { addDays, formatISODate, parseISODate } from '../league/seasonCalendar.js'
import { trainingParticipation, ensurePlayerWorkload, recoverPlayerDay, addPlayerLoad } from '../models/playerWorkload.js'
import { medicalRecoveryMult } from './clubFacilities.js'

export const SESSION_DEFS = {
  rest: { pl: 'Wolne', en: 'Rest', load: 0, focuses: [], intensity: 'light' },
  recovery: { pl: 'Regeneracja', en: 'Recovery', load: 0, focuses: [], intensity: 'light' },
  video: { pl: 'Analiza wideo', en: 'Video analysis', load: 0.3, focuses: ['structural', 'mental'], intensity: 'light' },
  throwing: { pl: 'Technika rzutów', en: 'Throwing technique', load: 3, focuses: ['throwing', 'skills'], intensity: 'light' },
  roles: { pl: 'Handlerzy / cutterzy', en: 'Handlers / cutters', load: 6, focuses: ['throwing', 'offensive'], intensity: 'medium' },
  offense: { pl: 'Atak pozycyjny', en: 'Offense', load: 7, focuses: ['offensive', 'structural'], intensity: 'medium' },
  defense: { pl: 'Obrona', en: 'Defense', load: 8, focuses: ['defensive', 'structural'], intensity: 'medium' },
  physical: { pl: 'Szybkość i wytrzymałość', en: 'Speed and endurance', load: 14, focuses: ['physical', 'skills'], intensity: 'high' },
  scrimmage: { pl: 'Gra wewnętrzna', en: 'Scrimmage', load: 12, focuses: ['offensive', 'defensive'], intensity: 'high', sharpness: 5 },
  matchPrep: { pl: 'Przygotowanie meczowe', en: 'Match preparation', load: 3, focuses: ['structural', 'mental'], intensity: 'light', sharpness: 1 },
  individual: { pl: 'Praca indywidualna', en: 'Individual practice', load: 5, focuses: ['skills', 'mental'], intensity: 'medium' },
  match: { pl: 'Mecz', en: 'Match', load: 0, focuses: [], intensity: 'light' },
}
export const TRAINING_TEMPLATES = {
  balanced: { pl: 'Jeden mecz / zbalansowany', en: 'One match / balanced', days: [['throwing','roles'],['physical','rest'],['offense','scrimmage'],['video','defense'],['matchPrep','rest'],['throwing','rest'],['rest','rest']] },
  preseason: { pl: 'Przygotowanie do sezonu', en: 'Preseason', days: [['physical','throwing'],['roles','video'],['physical','rest'],['defense','throwing'],['scrimmage','rest'],['recovery','rest'],['rest','rest']] },
  congested: { pl: 'Dwa mecze', en: 'Two matches', days: [['throwing','rest'],['video','rest'],['matchPrep','rest'],['recovery','rest'],['roles','rest'],['throwing','rest'],['rest','rest']] },
  tournament: { pl: 'Turniej', en: 'Tournament', days: [['roles','rest'],['throwing','video'],['matchPrep','rest'],['recovery','rest'],['video','rest'],['rest','rest'],['rest','rest']] },
  youth: { pl: 'Rozwój młodzieży', en: 'Youth development', days: [['roles','throwing'],['physical','rest'],['defense','video'],['roles','rest'],['scrimmage','rest'],['recovery','rest'],['rest','rest']] },
  recovery: { pl: 'Odciążenie', en: 'Recovery week', days: [['recovery','rest'],['video','rest'],['throwing','rest'],['recovery','rest'],['video','rest'],['rest','rest'],['rest','rest']] },
}
export const trainingDateAdd = (date, days) => formatISODate(addDays(date, days))
export function ensureTrainingSchedule(team) {
  team.teamTraining ??= { weekly: [], oneOff: [], sessionLog: [], tacticsFamiliarity: 38 }
  const tt = team.teamTraining
  if (!tt.schedule) tt.schedule = { version: 1, template: 'balanced', overrides: {}, weeks: {}, autoRest: true, restBelow: 55, adaptMatches: true, delegated: false, legacy: !!(tt.weekly?.length || tt.oneOff?.length) }
  return tt.schedule
}
export function setTrainingTemplate(team, template, weekStart = null) {
  if (!TRAINING_TEMPLATES[template]) return false
  const s = ensureTrainingSchedule(team)
  if (weekStart) s.weeks[weekStart] = template
  else { s.template = template; s.legacy = false }
  return true
}
export function setTrainingSlot(team, date, slot, type, group = 'all') {
  if (!validTrainingDate(date) || ![0,1,2].includes(slot) || !SESSION_DEFS[type] || type === 'match' || !['all','handlers','cutters','youth','oline','dline'].includes(group)) return false
  const s = ensureTrainingSchedule(team)
  s.legacy = false
  s.overrides[`${date}|${slot}`] = { type, group }
  return true
}
export function validTrainingDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date }
export function trainingFixtures(league, teamId) {
  const competitions = [league, ...(league?.otherLeagues ?? [])]
  return competitions.flatMap(c => [...(c?.fixtures ?? []), ...(c?.cup?.matches ?? [])])
    .filter(f => f.date && (f.homeTeamId === teamId || f.awayTeamId === teamId) && !['cancelled','postponed'].includes(f.status))
}
export function resolveTrainingDay(team, date, league = null) {
  const s = ensureTrainingSchedule(team)
  const weekday = (parseISODate(date).getDay() + 6) % 7
  const weekStart = trainingDateAdd(date, -weekday)
  const fixtures = league ? trainingFixtures(league, team.id) : (s.fixtureCache ?? [])
  const on = offset => fixtures.some(f => f.date === trainingDateAdd(date, offset))
  if (on(0)) return [{ id: `schedule-${date}-match`, date, type: 'match', slot: 0, group: 'all', source: 'schedule', focuses: [], intensity: 'light' }]
  if (s.legacy) return null
  let template = s.weeks[weekStart] ?? s.template
  if (s.delegated && team.staff?.assistantCoach > 0) {
    const count = new Set(fixtures.filter(f => f.date >= weekStart && f.date <= trainingDateAdd(weekStart, 6)).map(f => f.date)).size
    const avg = (team.players ?? []).reduce((sum,p) => sum + (p.developmentFatigue ?? 0),0) / Math.max(1,team.players?.length ?? 0)
    template = avg > 40 ? 'recovery' : count >= 3 ? 'tournament' : count >= 2 ? 'congested' : template
  }
  let types = [...(TRAINING_TEMPLATES[template] ?? TRAINING_TEMPLATES.balanced).days[weekday], 'rest']
  let reason = ''
  if (s.adaptMatches && on(-1)) { types = ['recovery','rest','rest']; reason = 'postMatch' }
  if (s.adaptMatches && on(1)) { types = ['matchPrep','rest','rest']; reason = 'preMatch' }
  return types.map((type,slot) => {
    const override = s.overrides[`${date}|${slot}`]
    return { id: `schedule-${date}-${slot}`, date, slot, type, group: 'all', reason, ...override, source: 'schedule', ...SESSION_DEFS[override?.type ?? type] }
  })
}
export function playerSessionPlan(player, plan, team) {
  const s = ensureTrainingSchedule(team)
  const participation = trainingParticipation(player, plan.date, s)
  const role = String(player.position ?? '').toLowerCase()
  const last = [...(player.recentPlayingTime ?? [])].reverse().find(r => r.date < plan.date)
  const youth = (player.age ?? 25) <= 21
  const group = player.trainingGroup ?? (role.includes('handler') ? 'handlers' : 'cutters')
  if (plan.group && plan.group !== 'all' && !(plan.group === 'youth' ? youth : group === plan.group)) return { multiplier: 0, type: 'rest', load: 0, reason: 'group' }
  if (!participation.multiplier) return { ...participation, multiplier: plan.type === 'recovery' ? 1 : 0, type: plan.type === 'recovery' ? 'recovery' : 'rest', load: 0 }
  let type = plan.type
  if (type === 'recovery' && plan.reason === 'postMatch' && plan.slot === 0 && !(last?.date === trainingDateAdd(plan.date,-1) && last.share >= 0.3)) type = 'scrimmage'
  const def = SESSION_DEFS[type]
  let multiplier = participation.multiplier * (youth ? 0.85 : 1)
  if ((player.matchStamina ?? 100) < 70 && s.autoRest) multiplier = Math.min(multiplier, 0.65)
  return { ...participation, multiplier, type, load: (def?.load ?? 8.5) * multiplier }
}

/** Deterministic estimate on a clone; never consumes real sessions or randomness. */
export function forecastTrainingPlayer(player, team, league, from, until) {
  const p = structuredClone(player)
  const end = until < trainingDateAdd(from,28) ? until : trainingDateAdd(from,28)
  for (let date=from;date<end;date=trainingDateAdd(date,1)) {
    for (const plan of resolveTrainingDay(team,date,league) ?? []) {
      if (plan.type === 'match') { addPlayerLoad(p,22,{ match: true, sharpness: 8 }); continue }
      if (team.teamTraining?.lastProcessedDate >= date) continue
      const personal = playerSessionPlan(p,plan,team)
      addPlayerLoad(p,personal.load)
      if(personal.type === 'recovery') ensurePlayerWorkload(p).recovery = 4
    }
    recoverPlayerDay(p,date,medicalRecoveryMult(team))
  }
  return { freshness: Math.round(Math.min(p.matchStamina ?? 100,100-(p.developmentFatigue??0)*.5)), fatigue: Math.round(p.developmentFatigue ?? 0) }
}
