import fs from 'node:fs'
import { simulateMatch } from '../src/matchEngine/matchSession.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { BODY_TRAFFIC_CALIBRATION } from '../src/matchEngine/ai/bodyTraffic.js'
import { THROW_SCAN_DIAGNOSTICS } from '../src/matchEngine/ai/throwerBrain.js'
import { RESET_CUT_CALIBRATION } from '../src/matchEngine/ai/cutterBrain.js'
if (process.argv.includes('--legacy-reset-cuts')) RESET_CUT_CALIBRATION.stable = false

const scans = []
if (process.argv.includes('--scans')) THROW_SCAN_DIAGNOSTICS.observe = scan => {
  if (scan.requireForwardPass) scans.push(scan)
}

const control = process.argv.includes('--control')
if (control) Object.assign(BODY_TRAFFIC_CALIBRATION, { planning: false, offBall: false })
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
let current = []
const points = []
for (const event of result.events) {
  if (event.type === 'point_start') current = []
  const trace = event.motionTrace ?? event.actionSim
  const metadata = Object.fromEntries(Object.entries(event).filter(([key]) => !['motionTrace', 'actionSim'].includes(key)))
  current.push({ ...metadata, ...(trace ? { totalMs: trace.totalMs, throwMs: trace.throwMs,
    resolution: trace.resolution, firstDisc: trace.frames?.[0]?.disc, lastDisc: trace.frames?.at(-1)?.disc } : {}) })
  if (event.type === 'point_end') points.push(current)
}
const longest = points.toSorted((a, b) => b.filter(e => e.type === 'throw_attempt').length - a.filter(e => e.type === 'throw_attempt').length).slice(0, 2)
const data = { control, seed: 105437, score: [result.homeScore, result.awayScore], scans,
  counts: points.map(p => ({ point: p[0]?.pointIndex, throws: p.filter(e => e.type === 'throw_attempt').length,
    turnovers: p.filter(e => e.type === 'turnover').length, score: p.find(e => e.type === 'score') })), longest }
const outputIndex = process.argv.indexOf('--output')
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : `artifacts/engine-audit/route-limit-${control ? 'control' : 'enabled'}.json`
fs.writeFileSync(output, JSON.stringify(data, null, 2))
console.log(JSON.stringify(data.counts.toSorted((a, b) => b.throws - a.throws).slice(0, 3)))
