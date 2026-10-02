/** The four axes are the saved source of truth; detailed engine orders are derived. */
export const PLAN_AXES = [
  { key: 'tempo', pl: 'Tempo', en: 'Tempo', plValues: ['Cierpliwe', 'Zrównoważone', 'Szybkie'], enValues: ['Patient', 'Balanced', 'Fast'], plCost: 'Szybsza gra utrudnia ustawienie obrony, ale daje mniej czasu na znalezienie podania.', enCost: 'Speed challenges the defense but leaves less time to find a pass.' },
  { key: 'risk', pl: 'Ryzyko podań', en: 'Passing risk', plValues: ['Bezpieczne', 'Zrównoważone', 'Odważne'], enValues: ['Safe', 'Balanced', 'Bold'], plCost: 'Odważne podania otwierają trudniejsze okna kosztem większego ryzyka straty.', enCost: 'Bold passes open difficult windows at a higher turnover risk.' },
  { key: 'direction', pl: 'Kierunek ataku', en: 'Attack direction', plValues: ['Krótkie podania', 'Mieszany', 'Głębokie podania'], enValues: ['Short', 'Mixed', 'Deep'], plCost: 'Głębokie podania dają więcej metrów, lecz wymagają dobrych rzutów i odbiorców.', enCost: 'Deep passes gain ground but demand strong throws and receivers.' },
  { key: 'pressure', pl: 'Presja obronna', en: 'Defensive pressure', plValues: ['Ostrożna', 'Zrównoważona', 'Agresywna'], enValues: ['Cautious', 'Balanced', 'Aggressive'], plCost: 'Agresywna obrona szuka przechwytu, oddając więcej miejsca za plecami.', enCost: 'Aggressive defense hunts blocks while conceding space behind it.' },
]
export const PLAN_EXCEPTIONS = { throw_hucks: ['Szukaj głębokich podań', 'Look for deep passes'], no_hucks: ['Unikaj głębokich podań', 'Avoid deep passes'], dump_first: ['Najpierw reset', 'Reset first'], look_downfield: ['Najpierw do przodu', 'Look downfield first'] }
const snap = value => Number(value) > 0.33 ? 1 : Number(value) < -0.33 ? -1 : 0
const retired = ['coachDirectives', 'oLineCoachDirectives', 'dLineCoachDirectives', 'playerInstructions', 'oLinePlayerInstructions', 'dLinePlayerInstructions', 'playerSubRoles', 'playerSubTags', 'playerSubPriorityIds']
function legacyLine(t, prefix) {
  const d = t[`${prefix}CoachDirectives`] ?? t.coachDirectives ?? {}
  return { tempo: snap(d.possessionTempo), risk: snap(((d.passSelectivity ?? 0) + (d.breakAppetite ?? 0)) / 2), direction: snap(d.huckAppetite), pressure: snap(((d.poachSeeking ?? 0) - (d.cushionDepth ?? 0)) / 2), force: d.forceSide ?? t.forceSide ?? 'force_forehand' }
}
export function compactStreamlinedTactics(tactics = {}) {
  tactics ??= {}
  const next = { ...tactics }
  const old = tactics.streamlinedPlan
  const exceptions = { ...(old?.exceptions ?? {}) }
  if (!old) for (const key of ['oLinePlayerInstructions', 'dLinePlayerInstructions', 'playerInstructions']) {
    for (const [id, tags] of Object.entries(tactics[key] ?? {})) {
      const tag = (Array.isArray(tags) ? tags : []).find(t => PLAN_EXCEPTIONS[t])
      if (tag && !exceptions[id]) exceptions[id] = tag
    }
  }
  next.streamlinedPlan = { version: 1, exceptions: Object.fromEntries(Object.entries(exceptions).filter(([, tag]) => PLAN_EXCEPTIONS[tag])) }
  for (const [line, prefix] of [['offense', 'oLine'], ['defense', 'dLine']]) {
    const input = old?.[line] ?? legacyLine(tactics, prefix)
    next.streamlinedPlan[line] = { ...Object.fromEntries(PLAN_AXES.map(a => [a.key, snap(input[a.key])])), force: input.force ?? 'force_forehand' }
  }
  for (const key of retired) delete next[key]
  return next
}
export function compileStreamlinedTactics(tactics) {
  if (!tactics?.streamlinedPlan) return tactics
  const base = compactStreamlinedTactics(tactics)
  const directives = ({ tempo, risk, direction, pressure, force }) => ({ possessionTempo: tempo, creativity: risk * .6, passSelectivity: risk * .8, breakAppetite: risk * .7, huckAppetite: direction * .85, stackDepth: -direction * .4, coverageShade: 0, cushionDepth: -pressure * .7, markShape: 0, poachSeeking: pressure, helpDeep: -pressure, poachResetHandler: pressure > 0 ? 1 : 0, forceSide: force })
  const orders = Object.fromEntries(Object.entries(base.streamlinedPlan.exceptions).map(([id, tag]) => [id, [tag]]))
  return { ...base, oLineCoachDirectives: directives(base.streamlinedPlan.offense), dLineCoachDirectives: directives(base.streamlinedPlan.defense), coachDirectives: directives(base.streamlinedPlan.offense), forceSide: base.streamlinedPlan.offense.force, playerInstructions: orders, oLinePlayerInstructions: orders, dLinePlayerInstructions: orders, playerSubRoles: {} }
}
