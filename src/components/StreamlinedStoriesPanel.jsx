import { useUiLang } from '../ui/UiLangContext'
import { playingTimeProgress, SQUAD_ROLES } from '../career/streamlinedStories.js'
import { getPlayerFullName } from '../data/mockPlayers.js'
import { clubObjectives } from '../career/clubObjectives.js'
export default function StreamlinedStoriesPanel({ career, onNavigate }) {
  const { lang } = useUiLang(), en = lang === 'en', team = career.world?.teamsById[career.playerTeamId]
  if (!team) return null
  const stories = []
  if (career.managerCareer?.warnings?.length) stories.push({ id: 'board', title: en ? 'The board expects improvement' : 'Zarząd oczekuje poprawy', body: `${career.managerCareer.warnings.length}/2 · ${clubObjectives(team, lang)[0]?.target ?? ''}`, tab: 'club-board' })
  for (const p of team.players.filter(p => p.playingTimePromise?.status === 'active').sort((a, b) => (a.playingTimePromise.source === 'event' ? 0 : 1) - (b.playingTimePromise.source === 'event' ? 0 : 1) || playingTimeProgress(b, team.id).games - playingTimeProgress(a, team.id).games)) {
    const progress = playingTimeProgress(p, team.id), promise = p.playingTimePromise
    stories.push({ id: `role-${p.id}`, title: `${getPlayerFullName(p)} · ${SQUAD_ROLES[promise.role]?.[en ? 'en' : 'pl']}`, body: `${progress.games}/6 ${en ? 'available matches' : 'dostępnych meczów'} · ${Math.round(progress.share * 100)}% / ${Math.round(promise.target * 100)}% ${en ? 'of points; morale review +1 / −3' : 'punktów; ocena morale +1 / −3'}`, tab: 'tactics' })
  }
  for (const follow of career.pendingEventFollowUps ?? []) stories.push({ id: follow.id, title: en ? 'Story continuation' : 'Dalszy ciąg wydarzenia', body: `${follow.ctx?.playerName ?? ''} · ${follow.dueDate}`, tab: 'inbox' })
  const injured = [...team.players].filter(p => p.injury?.daysRemaining > 0).sort((a, b) => b.injury.daysRemaining - a.injury.daysRemaining)[0]
  if (injured) stories.push({ id: `injury-${injured.id}`, title: `${en ? 'Return to the team' : 'Powrót do zespołu'} · ${getPlayerFullName(injured)}`, body: `${injured.injury.daysRemaining} ${en ? 'days of recovery remaining' : 'dni regeneracji do końca'}`, tab: 'training' })
  const objective = clubObjectives(team, lang)[0]
  if (objective) stories.push({ id: 'objective', title: objective.label, body: `${objective.target} · ${objective.deadline}`, tab: 'club-board' })
  const shown = stories.slice(0, 3)
  const international = (career.league.fixtures ?? []).find(f => f.status !== 'completed' && f.competition === 'international-club' && [f.homeTeamId, f.awayTeamId].includes(team.id))
  return <section className="um-section space-y-3"><h2 className="text-xl font-semibold">{en ? 'Current stories' : 'Wątki kariery'}</h2><div className="grid gap-3 md:grid-cols-3">{shown.map(story => <button key={story.id} className="rounded border border-ufa-border p-3 text-left" onClick={() => onNavigate(story.tab)}><strong>{story.title}</strong><p className="mt-2 text-sm text-ufa-muted">{story.body} →</p></button>)}</div><p className="text-xs text-ufa-muted">{en ? 'Three priorities for today. All remaining contracts and stories stay available in their sections.' : 'Trzy priorytety na dziś. Pozostałe umowy i wydarzenia są dostępne w swoich zakładkach.'}</p>{international && <button className="um-button" onClick={() => onNavigate('team-schedule')}>{en ? 'International match ahead' : 'Przed Tobą mecz międzynarodowy'} · {international.date} →</button>}</section>
}
