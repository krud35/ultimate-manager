import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { WEEK_GOALS, WEEK_INTENSITIES, PROJECT_FOCUSES, setWeekPlan, setDevelopmentProject, readiness } from '../career/streamlinedTraining.js'
import { resolveTrainingDay, trainingDateAdd, SESSION_DEFS } from '../career/trainingSchedule.js'
import { getPlayerFullName } from '../data/mockPlayers.js'
import { getOverallRating, getCategoryOverall } from '../models/playerStats.js'
import PlayerProfileModal from './PlayerProfileModal.jsx'

const selectClass = 'mt-2 w-full border border-ufa-border bg-ufa-panel p-3 text-ufa-text'
export function PlayerReadinessList({ players, onSelect }) {
  const { lang } = useUiLang()
  const en = lang === 'en'
  const categories = { throwing: en ? 'Throwing' : 'Rzuty', physical: en ? 'Fitness' : 'Fizyczność', mental: en ? 'Decisions' : 'Decyzje', offensive: en ? 'Offense' : 'Atak', defensive: en ? 'Defense' : 'Obrona' }
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{(en ? ['Player', 'Role', 'Readiness', 'Strengths'] : ['Zawodnik', 'Rola', 'Gotowość', 'Mocne strony']).map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{players.map(player => {
    const status = readiness(player)
    const strengths = Object.keys(categories).map(id => ({ id, value: getCategoryOverall(player.skills, id) })).sort((a,b) => b.value - a.value).slice(0, 2)
    return <tr className="border-t border-ufa-border" key={player.id}><td className="p-3"><button className="um-link text-left" onClick={() => onSelect(player)}>{getPlayerFullName(player)}</button></td><td className="p-3">{player.position ?? '—'}</td><td className={`p-3 ${status.id === 'ready' ? 'text-ufa-success' : 'text-ufa-gold'}`}>{status[en ? 'en' : 'pl']}</td><td className="p-3">{strengths.map(s => `${categories[s.id]} ${Math.round(s.value)}`).join(' · ')}</td></tr>
  })}</tbody></table></div>
}
export default function StreamlinedTrainingView({ team, league, leaguePlayerStats, disabled, onChange }) {
  const { lang } = useUiLang()
  const en = lang === 'en'
  const [profile, setProfile] = useState(null)
  if (!team?.teamTraining?.schedule?.streamlined) return null
  const settings = team.teamTraining.schedule.streamlined
  const projects = settings.projects ?? []
  const players = team.players ?? []
  const change = patch => { if (!disabled && setWeekPlan(team, patch)) onChange?.(team) }
  const recent = (team.teamTraining.sessionLog ?? []).filter(r => r.date >= trainingDateAdd(league.currentDate, -7))
  return <div className="space-y-6">
    <header><p className="um-eyebrow">{en ? 'Streamlined career' : 'Kariera uproszczona'}</p><h2 className="um-page-title">{en ? 'Prepare your team' : 'Przygotuj zespół'}</h2><p className="mt-2 text-ufa-muted">{en ? 'Choose a goal and workload. Your staff handles sessions, recovery and match preparation automatically.' : 'Wybierz cel i obciążenie. Sztab automatycznie układa sesje, regenerację i przygotowanie do meczów.'}</p></header>
    <section className="um-section"><fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2"><label>{en ? 'Weekly goal' : 'Cel tygodnia'}<select className={selectClass} value={settings.goal} onChange={e => change({ goal: e.target.value })}>{Object.entries(WEEK_GOALS).map(([id,d]) => <option key={id} value={id}>{d[en ? 'en' : 'pl']}</option>)}</select></label><label>{en ? 'Workload' : 'Obciążenie'}<select className={selectClass} value={settings.intensity} onChange={e => change({ intensity: e.target.value })}>{Object.entries(WEEK_INTENSITIES).map(([id,d]) => <option key={id} value={id}>{d[en ? 'en' : 'pl']}</option>)}</select></label></fieldset><p className="mt-3 text-sm text-ufa-muted">{en ? 'Heavy weeks add practice but cost freshness. Congested fixtures, fatigue and injuries take priority over workload. Changes affect upcoming sessions only; this plan repeats until changed.' : 'Mocne tygodnie dają dodatkową praktykę kosztem świeżości. Gęsty terminarz, zmęczenie i urazy mają pierwszeństwo przed obciążeniem. Zmiany dotyczą przyszłych sesji; plan powtarza się do kolejnej zmiany.'}</p></section>
    <section className="um-section"><h3 className="um-section-title">{en ? 'Development projects' : 'Projekty rozwoju'} · {projects.length}/3</h3><p className="my-2 text-sm text-ufa-muted">{en ? 'Select up to three players for a specific focus. Other players follow balanced development.' : 'Wskaż do trzech zawodników ze szczególnym celem. Pozostali rozwijają się w sposób zrównoważony.'}</p>{projects.map(entry => players.find(p => p.id === entry.playerId)).filter(Boolean).map(player => {
      const project = projects.find(p => p.playerId === player.id)
      return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ufa-border py-2" key={player.id}><button className="um-link" onClick={() => setProfile(player)}>{getPlayerFullName(player)}</button><div className="flex items-center gap-3">{project?.baselineSkills && <small>OVR {getOverallRating(player.skills) - getOverallRating(project.baselineSkills) >= 0 ? '+' : ''}{getOverallRating(player.skills) - getOverallRating(project.baselineSkills)}</small>}<select aria-label={`${en ? 'Development focus' : 'Cel rozwoju'}: ${getPlayerFullName(player)}`} className="border border-ufa-border bg-ufa-panel p-2 text-sm" value={project?.focus ?? ''} disabled={disabled || (!project && projects.length >= 3)} onChange={e => { if (setDevelopmentProject(team, player.id, e.target.value)) onChange?.(team) }}><option value="">{en ? 'Automatic' : 'Automatycznie'}</option>{Object.entries(PROJECT_FOCUSES).map(([id,d]) => <option key={id} value={id}>{d[en ? 'en' : 'pl']}</option>)}</select></div></div>
    })}{projects.length < 3 && <label className="mt-4 block">{en ? 'Add a player' : 'Dodaj zawodnika'}<select className={selectClass} value="" disabled={disabled} onChange={e => { if (setDevelopmentProject(team, e.target.value, 'throwing')) onChange?.(team) }}><option value="">{en ? 'Choose a player…' : 'Wybierz zawodnika…'}</option>{players.filter(p => !projects.some(project => project.playerId === p.id)).map(p => <option key={p.id} value={p.id}>{getPlayerFullName(p)}</option>)}</select></label>}</section>
    <section className="um-section"><h3 className="um-section-title">{en ? 'Readiness' : 'Gotowość do gry'}</h3><PlayerReadinessList players={players} onSelect={setProfile} /></section>
    <details className="um-section"><summary className="font-semibold">{en ? 'Automatic plan for the next seven days' : 'Automatyczny plan na siedem dni'}</summary><ul className="mt-3 space-y-2">{Array.from({ length: 7 }, (_, i) => trainingDateAdd(league.currentDate, i)).map(date => <li key={date} className="text-sm">{date} · {(resolveTrainingDay(team, date, league) ?? []).filter(p => p.type !== 'rest').map(p => SESSION_DEFS[p.type]?.[en ? 'en' : 'pl']).join(' · ') || (en ? 'Rest' : 'Wolne')}</li>)}</ul></details>
    <section className="um-section"><h3 className="um-section-title">{en ? 'Last seven days' : 'Ostatnie siedem dni'}</h3><p className="mt-2 text-sm">{en ? 'Sessions' : 'Sesje'}: {recent.length} · {en ? 'Attribute increases' : 'Przyrosty atrybutów'}: {recent.reduce((sum,r) => sum + (r.skillBumps ?? 0), 0)} · {en ? 'Tactical familiarity' : 'Znajomość taktyki'}: +{recent.reduce((sum,r) => sum + (r.tacticsDelta ?? 0), 0).toFixed(1)}</p><p className="mt-2 text-sm text-ufa-muted">{en ? 'These are recorded training results, not a prediction of the next match.' : 'To zapisane efekty treningów, a nie prognoza wyniku kolejnego meczu.'}</p></section>
    <PlayerProfileModal player={profile} onClose={() => setProfile(null)} leaguePlayerStats={leaguePlayerStats} teamName={team.name} isOwnPlayer />
  </div>
}
