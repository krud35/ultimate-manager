import fs from 'node:fs'
const snapshot = new URL('../artifacts/engine-audit/reset-snapshot-1788957435171/', import.meta.url)
const source = p => import(new URL(`src/${p}`, snapshot))
const { simulateMatch } = await source('matchEngine/matchSession.js')
const { demoHomeTeam, demoAwayTeam } = await source('data/demoMatchTeams.js')
const { normalizeTactics } = await source('matchEngine/lineups.js')
const { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } = await source('matchEngine/tacticsModifiers.js')
const tactics = style => {
  const dirs = { creativity: 0, coverageShade: 0, huckAppetite: 0, passSelectivity: 0,
    breakAppetite: 0, possessionTempo: 0, forceSide: FORCE_SIDES.FORCE_FOREHAND }
  return normalizeTactics({ oLineAttackStyle: style, dLineAttackStyle: style,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON, dLineDefenseStyle: DEFENSE_STYLES.PERSON,
    oLineCoachDirectives: dirs, dLineCoachDirectives: dirs, coachDirectives: dirs,
    forceSide: dirs.forceSide, lineupWhenOffenseStartPlayerIds: [], lineupWhenDefenseStartPlayerIds: [] })
}
const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
home.tactics = tactics(ATTACK_STYLES.HORIZONTAL_STACK)
away.tactics = tactics(ATTACK_STYLES.VERTICAL_STACK)
const result = simulateMatch({ homeTeam: home, awayTeam: away, seed: 105437, fastMode: false,
  wind: { speedMph: 20, directionDeg: 90 }, windLocked: true })
let point = null
const candidates = []
for (const event of result.events) {
  if (event.type === 'point_start') point = event.pointIndex
  if (event.type !== 'throw_attempt') continue
  const trace = event.motionTrace ?? event.actionSim
  if (event.throwDistanceM >= 10 || trace?.resolution?.diagnosis?.primary !== 'unknown_no_contact') continue
  candidates.push({ point, event, trace })
}
if (!candidates.length) throw new Error('No short no-contact failure in this match')
const chosen = candidates[0]
const data = { snapshot: snapshot.pathname, seed: 105437, wind: { speedMph: 20, directionDeg: 90 },
  selection: 'First chronological throw under 10 m diagnosed unknown_no_contact',
  candidates: candidates.map(c => ({ point: c.point, id: c.event.id, distance: c.event.throwDistanceM,
    thrower: c.event.throwerName, receiver: c.event.receiverName, type: c.event.throwType })),
  point: chosen.point,
  event: Object.fromEntries(Object.entries(chosen.event).filter(([k]) => !['motionTrace', 'actionSim'].includes(k))),
  trace: chosen.trace }
fs.writeFileSync('artifacts/engine-audit/failed-pass.json', JSON.stringify(data, null, 2))
console.log(JSON.stringify({ candidates: data.candidates, event: data.event, traceKeys: Object.keys(data.trace), diagnosis: data.trace.resolution.diagnosis }))
