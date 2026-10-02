import { MATCH_CONFIG } from './config.js'
import { summarizeLineStartPoints, PRESSURE_STALL_THRESHOLD } from './matchStats.js'

export function pointIsHighlight(events, pointIndex, homeScore, awayScore) {
  const start = events.find(e => e.type === 'point_start')
  const end = events.find(e => e.type === 'point_end')
  return pointIndex === 1 || Math.max(homeScore, awayScore) >= MATCH_CONFIG.pointsToWin - 2 ||
    events.some(e => e.type === 'injury' || (e.type === 'throw_success' && e.isHuck)) ||
    (end?.scoringTeam != null && end.scoringTeam === start?.pullTeam)
}

/** Runs only at a point boundary; does not draw randomness or change the session. */
export function matchIntervention(session, side, acknowledged = new Set()) {
  if (!session || session.status === 'finished' || session.pointIndex <= 1) return null
  const lastIndex = session.pointIndex - 1
  const injury = (session.events ?? []).find(e => e.type === 'injury' && e.pointIndex === lastIndex && e.teamId === side)
  if (injury && !acknowledged.has(`injury-${lastIndex}`)) return { key: `injury-${lastIndex}`, pl: 'Kontuzja w zespole. Sprawdź zastępstwo przed kolejnym punktem.', en: 'An injury in your team. Check the replacement before the next point.' }
  const score = Math.max(session.homeScore, session.awayScore)
  if (score >= MATCH_CONFIG.pointsToWin - 2 && !acknowledged.has('closing')) return { key: 'closing', pl: 'Końcówka meczu. Zdecyduj, czy oszczędzać siły, czy wystawić mocniejszą linię.', en: 'Closing stages. Decide whether to conserve energy or field a stronger line.' }
  if (score >= Math.ceil(MATCH_CONFIG.pointsToWin / 2) && !acknowledged.has('interval')) return { key: 'interval', pl: 'Przerwa na ocenę planu. Sprawdź wynik i świeżość linii.', en: 'Time to review your plan. Check the score and line freshness.' }
  const tired = Object.values(session.stamina?.[side] ?? {}).filter(n => typeof n === 'number' && n < 40).length
  if (tired >= 7 && !acknowledged.has('fatigue')) return { key: 'fatigue', pl: 'Co najmniej siedmiu zawodników ma mało energii. Rozważ szerszą rotację.', en: 'At least seven players are low on energy. Consider a wider rotation.' }
  return null
}

/** Evidence, not causal attribution: every observation contains point references. */
export function buildCoachReport(result, side = 'home', lang = 'pl') {
  const en = lang === 'en', events = result?.events ?? []
  const rows = []
  let point = null
  for (const event of events) {
    if (event.type === 'point_start') point = event.pointIndex
    rows.push({ event, point: event.pointIndex ?? point })
  }
  const own = rows.filter(r => r.event.possessionTeam === side)
  const fails = own.filter(r => r.event.type === 'throw_fail')
  const deep = own.filter(r => ['throw_success','throw_fail'].includes(r.event.type) && r.event.isHuck)
  const pressure = own.filter(r => ['throw_success','throw_fail'].includes(r.event.type) && r.event.stallCount >= PRESSURE_STALL_THRESHOLD)
  const line = summarizeLineStartPoints(events)[side]
  const pointRefs = rs => [...new Set(rs.map(r => r.point).filter(Number.isFinite))].slice(0, 3)
  const scores = rows.filter(r => r.event.type === 'point_end' && r.event.scoringTeam === side)
  const report = [{ id: 'lines', title: en ? 'Finishing points' : 'Kończenie punktów',
    observation: en ? `O-line holds: ${line.offense}/${line.offensePoints}. D-line breaks: ${line.defense}/${line.defensePoints}.` : `Utrzymane punkty O-line: ${line.offense}/${line.offensePoints}. Breaki D-line: ${line.defense}/${line.defensePoints}.`,
    suggestion: en ? 'Compare the lines before changing personnel; small samples do not establish a cause.' : 'Porównaj linie przed zmianą składu; mała próba nie dowodzi przyczyny wyniku.', points: pointRefs(scores) }]
  const selected = deep.length >= 3 ? deep : pressure
  const completed = selected.filter(r => r.event.type === 'throw_success').length
  report.push({ id: 'throws', title: en ? 'Passing choices' : 'Wybór podań',
    observation: selected.length ? (en ? `${deep.length >= 3 ? 'Deep' : 'Under-pressure'} passes completed: ${completed}/${selected.length}.` : `${deep.length >= 3 ? 'Długie podania' : 'Podania pod presją'}: ${completed}/${selected.length} celnych.`) : (en ? 'Too few deep or pressured throws to judge this pattern.' : 'Za mało długich podań lub rzutów pod presją, aby ocenić ten wzorzec.'),
    suggestion: en ? 'Try safer outlets if these attempts are costly; they may also slow your progress upfield.' : 'Przy kosztownych stratach rozważ bezpieczniejsze wyjścia; mogą jednak spowolnić zdobywanie terenu.', points: pointRefs(selected.filter(r => r.event.type === 'throw_fail').concat(selected)) })
  const blocks = fails.filter(r => r.event.isBlock).length, drops = fails.filter(r => r.event.isDrop).length
  report.push({ id: 'losses', title: en ? 'Where possession ended' : 'Jak traciliśmy dysk',
    observation: en ? `Failed throws: ${fails.length}; defender blocks: ${blocks}, drops: ${drops}.` : `Nieudane podania: ${fails.length}; bloki rywala: ${blocks}, upuszczenia: ${drops}.`,
    suggestion: en ? 'Review the actual attempts before choosing a training focus. These outcomes alone do not identify fatigue or wind as the cause.' : 'Obejrzyj próby przed wyborem celu treningu. Same rozstrzygnięcia nie wskazują zmęczenia ani wiatru jako przyczyny.', points: pointRefs(fails) })
  return report
}
