import { CLUB_STRATEGY_DEFS, clubObjectives } from '../career/clubObjectives.js'
import { ensureClubManagement, buildSquadPlan } from '../career/clubManagement.js'

export default function ClubManagementPanel({ team, seasonYear, lang }) {
  const en = lang === 'en'
  ensureClubManagement(team, seasonYear)
  const plan = buildSquadPlan(team)
  const goal = team.boardObjective
  return <section className="space-y-4 rounded-sm border border-ufa-border bg-ufa-panel p-5">
    <h3 className="font-semibold">{en ? 'Club plan' : 'Plan klubu'}</h3>
      <div>
        <h4 className="text-lg font-semibold">{en ? 'Club strategy' : 'Strategia klubu'}: {CLUB_STRATEGY_DEFS[team.clubStrategy]?.[en ? 'en' : 'pl']}</h4>
        <p className="mt-1 text-xs text-ufa-muted">{en ? 'Set by the board.' : 'Ustalona przez zarząd.'}</p>
        <p className="my-3 text-lg font-semibold">{en ? 'Board confidence' : 'Zaufanie zarządu'}: {goal.confidence}/100</p>
        <h4 className="text-base font-semibold">{en ? 'Objectives and priorities' : 'Cele i priorytety'}</h4>
        <ol className="mt-2 space-y-2">{clubObjectives(team,lang).map(o=><li key={o.id} className="rounded-sm border border-ufa-border bg-ufa-bg/60 p-3"><span className="text-xs font-bold text-ufa-gold">{en ? 'Priority' : 'Priorytet'} {o.priority}</span><p className="font-semibold">{o.label}: {o.target}</p><p className="text-xs text-ufa-muted">{o.deadline}</p></li>)}</ol>
        <p className="mt-2 text-xs">{en ? 'Squad / target' : 'Kadra / cel'}: {team.players.length}/{plan.target}. {en ? 'Missing handlers / cutters / O-line / D-line' : 'Braki: handlerzy / cutterzy / O-line / D-line'}: {plan.needs.handler} / {plan.needs.cutter} / {plan.needs.offense} / {plan.needs.defense}.</p>
      </div>
  </section>
}
