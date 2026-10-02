import fs from 'node:fs'
import { initMatchSession, playNextPoint, defaultTacticsForPlayers, ATTACK_STYLES, MATCH_CONFIG } from '../src/matchEngine/index.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'

const dir = process.env.OUTPUT_DIR ?? 'artifacts/match-behavior-2026-09-27'
fs.mkdirSync(dir, { recursive: true })
MATCH_CONFIG.pointsToWin = Number(process.env.POINTS ?? 2)
const styles = process.env.STYLES?.split(',') ?? Object.values(ATTACK_STYLES)
const seeds = (process.env.SEEDS ?? '92701,92702').split(',').map(Number)
const rows = []
const inc = (map, key) => { map[key ?? 'unknown'] = (map[key ?? 'unknown'] ?? 0) + 1 }
for (const style of styles) for (const seed of seeds) {
  const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
  const tactics = players => normalizeTactics({ ...defaultTacticsForPlayers(players),
    oLineAttackStyle: style, dLineAttackStyle: style, oLineDefenseStyle: 'person', dLineDefenseStyle: 'person' })
  let session = initMatchSession({ homeTeam: home, awayTeam: away, homeTactics: tactics(home.players),
    awayTactics: tactics(away.players), seed, wind: { speedMph: 0, directionDeg: 0 } })
  const row = { style, seed, types: {}, techniques: {}, throwRoles: {}, receiveRoles: {}, arcs: {}, curves: {},
    states: {}, attempts: 0, successes: 0, distanceSum: 0, holdSumMs: 0, holdN: 0,
    motionSamples: 0, movingSamples: 0, speedSum: 0, maxSpeed: 0, nonFinite: 0, playerThrows: {}, playerTargets: {} }
  let seen = 0
  const start = performance.now()
  while (session.status !== 'finished') {
    session = playNextPoint(session, { homeTactics: session.home.tactics, awayTactics: session.away.tactics },
      { rotateHome: false, rotateAway: false, aiHome: false, aiAway: false, fastMode: false, collectFrames: true })
    for (const e of session.events.slice(seen)) {
      if (e.type === 'throw_success') row.successes++
      if (e.type !== 'throw_attempt') continue
      row.attempts++
      inc(row.types, e.throwType); inc(row.techniques, e.throwTechnique)
      inc(row.throwRoles, e.throwerSubRole); inc(row.receiveRoles, e.receiverSubRole)
      inc(row.playerThrows, e.throwerId); inc(row.playerTargets, e.receiverId)
      row.distanceSum += e.throwDistanceM ?? 0
      const hold = (e.holdStartMs ?? 0) + (e.actionSim?.throwMs ?? 0)
      if (Number.isFinite(hold)) { row.holdSumMs += hold; row.holdN++ }
      const shape = e.motionTrace?.plannedShape
      inc(row.arcs, shape?.arc); inc(row.curves, shape?.curve)
      for (const frame of e.actionSim?.frames ?? []) for (const p of frame.players) {
        const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0)
        row.motionSamples++; row.speedSum += speed
        row.maxSpeed = Math.max(row.maxSpeed, speed)
        if (speed > 0.5) row.movingSamples++
        if (![p.x, p.y, speed].every(Number.isFinite)) row.nonFinite++
        inc(row.states, p.cutterState ?? p.defenderState)
      }
    }
    seen = session.events.length
  }
  row.score = [session.homeScore, session.awayScore]
  row.durationSec = (performance.now() - start) / 1000
  rows.push(row)
  fs.writeFileSync(`${dir}/matches.json`, JSON.stringify(rows, null, 2))
  console.log(JSON.stringify(row))
}
