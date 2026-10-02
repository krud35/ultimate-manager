import { useUiLang } from '../ui/UiLangContext'
import { compactStreamlinedTactics, PLAN_AXES, PLAN_EXCEPTIONS } from '../career/streamlinedTactics'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES, TACTICS_MODIFIERS } from '../matchEngine/tacticsModifiers'
import { offenseLineSlotsForAttackStyle } from '../matchEngine/offenseLineSlots'
import { getPlayerFullName } from '../data/mockPlayers'
import { playerSubRoleLabel } from '../matchEngine/playerSubRoles.js'

export default function StreamlinedTacticsForm({ tactics, roster = [], onTacticsChange, lineupMode = 'dual', pointStartRole = 'offense' }) {
  const { lang } = useUiLang()
  const en = lang === 'en', t = compactStreamlinedTactics(tactics)
  const change = patch => onTacticsChange(compactStreamlinedTactics({ ...t, ...patch }))
  const plan = (line, patch) => change({ streamlinedPlan: { ...t.streamlinedPlan, [line]: { ...t.streamlinedPlan[line], ...patch } } })
  const selectClass = 'rounded border border-ufa-border bg-ufa-bg p-2 text-ufa-text'
  const lines = lineupMode === 'single' ? [pointStartRole === 'defense' ? 'defense' : 'offense'] : ['offense', 'defense']
  return <div className="space-y-4">
    <p className="text-sm text-ufa-muted">{en ? 'Choose a formation, four priorities and the starting seven. A player’s single exception overrides the team instruction.' : 'Wybierz ustawienie, cztery priorytety i wyjściową siódemkę. Jeden wyjątek zawodnika ma pierwszeństwo przed poleceniem drużyny.'}</p>
    <div className="grid gap-4 xl:grid-cols-2">{lines.map(line => {
      const prefix = line === 'offense' ? 'oLine' : 'dLine', lineupKey = line === 'offense' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds', attack = t[`${prefix}AttackStyle`] ?? t.attackStyle ?? 'vertical_stack'
      const slots = offenseLineSlotsForAttackStyle(attack)
      const lineup = t[lineupKey] ?? []
      return <section key={line} className="space-y-3 rounded border border-ufa-border p-4">
        <h3 className="text-xl font-semibold">{line === 'offense' ? 'O-Line' : 'D-Line'}</h3>
        <div className="grid gap-2 sm:grid-cols-3">{[['AttackStyle', ATTACK_STYLES, 'attack', en ? 'Attack' : 'Atak'], ['DefenseStyle', DEFENSE_STYLES, 'defense', en ? 'Defense' : 'Obrona']].map(([key, values, group, label]) => <label key={key}>{label}<select className={`${selectClass} w-full`} value={t[`${prefix}${key}`] ?? t[key === 'AttackStyle' ? 'attackStyle' : 'defenseStyle']} onChange={e => change({ [`${prefix}${key}`]: e.target.value, ...(line === 'offense' ? { [key === 'AttackStyle' ? 'attackStyle' : 'defenseStyle']: e.target.value } : {}) })}>{Object.values(values).map(v => <option key={v} value={v}>{TACTICS_MODIFIERS[group][v]?.label ?? v}</option>)}</select></label>)}
          <label>Force<select className={`${selectClass} w-full`} value={t.streamlinedPlan[line].force} onChange={e => plan(line, { force: e.target.value })}>{Object.values(FORCE_SIDES).map(v => <option key={v} value={v}>{TACTICS_MODIFIERS.force[v]?.label ?? v}</option>)}</select></label>
        </div>
        {PLAN_AXES.map(axis => <label key={axis.key} className="block"><span className="font-semibold">{axis[en ? 'en' : 'pl']}</span><select className={`${selectClass} ml-2`} value={t.streamlinedPlan[line][axis.key]} onChange={e => plan(line, { [axis.key]: Number(e.target.value) })}>{[-1, 0, 1].map((v, i) => <option key={v} value={v}>{axis[en ? 'enValues' : 'plValues'][i]}</option>)}</select><p className="mt-1 text-xs text-ufa-muted">{axis[en ? 'enCost' : 'plCost']}</p></label>)}
        <h4 className="font-semibold">{en ? 'Starting seven' : 'Wyjściowa siódemka'}</h4>
        {Array.from({ length: 7 }, (_, i) => <label key={i} className="flex items-center gap-2"><span className="w-28 text-xs">{i + 1}. {playerSubRoleLabel(slots[i]?.defaultSubRole)}</span><select className={`${selectClass} min-w-0 flex-1`} value={lineup[i] ?? ''} onChange={e => { const ids = [...lineup]; ids[i] = roster.find(p => String(p.id) === e.target.value)?.id ?? null; change({ [lineupKey]: ids }) }}><option value="">—</option>{roster.map(p => <option key={p.id} value={p.id} disabled={p.injury?.daysRemaining > 0 || lineup.some((id, j) => j !== i && String(id) === String(p.id))}>{getPlayerFullName(p)}{p.injury?.daysRemaining > 0 ? ' — ' + (en ? 'injured' : 'kontuzja') : ''}</option>)}</select></label>)}
      </section>
    })}</div>
    <label>{en ? 'Rotation' : 'Rotacja'} <select className={selectClass} value={t.autoSubMode ?? 'balanced'} onChange={e => change({ autoSubMode: e.target.value })}>{[['balanced', 'Zrównoważona', 'Balanced'], ['fixed_lines', 'Stałe linie', 'Fixed lines'], ['power_lines', 'Najsilniejszy skład', 'Power lines'], ['position_rotation', 'Według pozycji', 'By position']].map(([id, pl, english]) => <option key={id} value={id}>{en ? english : pl}</option>)}</select></label>
    <details className="rounded border border-ufa-border p-3"><summary>{en ? 'One individual exception per player' : 'Jeden indywidualny wyjątek na zawodnika'}</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{roster.map(p => <label key={p.id} className="flex justify-between gap-2">{getPlayerFullName(p)}<select className={selectClass} value={t.streamlinedPlan.exceptions[p.id] ?? ''} onChange={e => change({ streamlinedPlan: { ...t.streamlinedPlan, exceptions: { ...t.streamlinedPlan.exceptions, [p.id]: e.target.value } } })}><option value="">{en ? 'Team plan' : 'Plan drużyny'}</option>{Object.entries(PLAN_EXCEPTIONS).map(([id, labels]) => <option key={id} value={id}>{labels[en ? 1 : 0]}</option>)}</select></label>)}</div></details>
  </div>
}
