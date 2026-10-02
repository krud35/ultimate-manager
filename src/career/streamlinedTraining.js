export const WEEK_GOALS = {
  tactical: { pl: 'Przygotowanie taktyczne', en: 'Tactical preparation', days: [['offense','video'],['defense','roles'],['offense','scrimmage'],['video','defense'],['throwing','roles'],['recovery','rest'],['rest','rest']] },
  technique: { pl: 'Technika', en: 'Technique', days: [['throwing','roles'],['throwing','video'],['roles','scrimmage'],['throwing','offense'],['throwing','defense'],['recovery','rest'],['rest','rest']] },
  physical: { pl: 'Przygotowanie fizyczne', en: 'Fitness', days: [['physical','throwing'],['roles','video'],['physical','rest'],['defense','throwing'],['scrimmage','rest'],['recovery','rest'],['rest','rest']] },
  youth: { pl: 'Rozwój młodych', en: 'Youth development', days: [['roles','throwing'],['physical','rest'],['defense','video'],['roles','offense'],['scrimmage','rest'],['recovery','rest'],['rest','rest']] },
  recovery: { pl: 'Regeneracja', en: 'Recovery', days: [['recovery','rest'],['video','rest'],['throwing','rest'],['recovery','rest'],['video','rest'],['rest','rest'],['rest','rest']] },
}
export const WEEK_INTENSITIES = { light: { pl: 'Lekkie', en: 'Light' }, normal: { pl: 'Normalne', en: 'Normal' }, strong: { pl: 'Mocne', en: 'Heavy' } }
export const PROJECT_FOCUSES = { throwing: { pl: 'Rzuty', en: 'Throwing' }, physical: { pl: 'Fizyczność', en: 'Fitness' }, offensive: { pl: 'Atak', en: 'Offense' }, defensive: { pl: 'Obrona', en: 'Defense' }, mental: { pl: 'Decyzje', en: 'Decisions' } }

export function setWeekPlan(team, patch) {
  const settings = team?.teamTraining?.schedule?.streamlined
  if (!settings || (patch.goal && !WEEK_GOALS[patch.goal]) || (patch.intensity && !WEEK_INTENSITIES[patch.intensity])) return false
  if (patch.goal) settings.goal = patch.goal
  if (patch.intensity) settings.intensity = patch.intensity
  return true
}
export function setDevelopmentProject(team, playerId, focus) {
  const settings = team?.teamTraining?.schedule?.streamlined
  const target = team?.players?.find(p => String(p.id) === String(playerId))
  if (!settings || !target || (focus && !PROJECT_FOCUSES[focus])) return false
  playerId = target.id
  const current = (settings.projects ?? []).filter(p => team.players.some(player => player.id === p.playerId))
  if (focus && !current.some(p => p.playerId === playerId) && current.length >= 3) return false
  settings.projects = current.filter(p => p.playerId !== playerId)
  if (focus) {
    const previous = current.find(p => p.playerId === playerId)
    const player = team.players.find(p => p.id === playerId)
    settings.projects.push({ playerId, focus, startedAt: previous?.startedAt ?? team.managementDate ?? null, baselineSkills: previous?.baselineSkills ?? structuredClone(player.skills) })
  }
  syncDevelopmentProjects(team)
  return true
}
export function syncDevelopmentProjects(team) {
  const settings = team?.teamTraining?.schedule?.streamlined
  if (!settings) return
  settings.projects = (settings.projects ?? []).filter(p => team.players?.some(player => player.id === p.playerId) && PROJECT_FOCUSES[p.focus]).slice(0, 3)
  for (const player of team.players ?? []) {
    player.trainingFocus = settings.projects.find(p => p.playerId === player.id)?.focus ?? 'balanced'
  }
}
export function readiness(player) {
  if (player.injury?.daysRemaining > 0) return { id: 'injured', pl: `Kontuzja · ${player.injury.daysRemaining} dni`, en: `Injured · ${player.injury.daysRemaining} days` }
  const freshness = Math.min(player.matchStamina ?? 100, 100 - (player.developmentFatigue ?? 0) * .5)
  if (freshness < 65 || (player.developmentFatigue ?? 0) >= 50) return { id: 'rest', pl: 'Potrzebuje odpoczynku', en: 'Needs rest' }
  if ((player.matchSharpness ?? 65) < 50) return { id: 'rhythm', pl: 'Brakuje ogrania', en: 'Needs match time' }
  return { id: 'ready', pl: 'Gotowy do gry', en: 'Ready to play' }
}
