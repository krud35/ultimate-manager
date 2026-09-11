// Profiles per-point wall-clock cost of a LIVE match simulation (the path used by
// "Symuluj do konca meczu" in MatchView.jsx: playNextPoint with aiHome/aiAway true),
// to find out why the UI hangs around point 12/13 then seems to speed up.
import { performance } from 'node:perf_hooks'
import { createCareer } from '../src/career/careerModel.js'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { teamForMatchEngine } from '../src/data/ufaLeagueTeams.js'
import { EVENT } from '../src/matchEngine/events.js'

globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}

const N_MATCHES = Number(process.argv[2] ?? 20)

const career = createCareer(0, {
  managerName: 'Bench',
  playerTeamId: 'toronto-rush',
  seasonYear: 2025,
  rosterMode: 'historical',
})
const teamIds = career.world.teamIds
const homeId = teamIds[0]

const allPointStats = []

for (let m = 0; m < N_MATCHES; m++) {
  const awayId = teamIds[1 + (m % (teamIds.length - 1))]
  const homeTeam = career.world.teamsById[homeId]
  const awayTeam = career.world.teamsById[awayId]

  const session = initMatchSession({
    homeTeam: teamForMatchEngine(homeTeam),
    awayTeam: teamForMatchEngine(awayTeam),
    seed: 1000 + m,
  })

  let guard = 0
  while (session.status !== 'finished' && guard++ < 60) {
    const evCountBefore = session.events.length
    const scoreBefore = [session.homeScore, session.awayScore]
    const t0 = performance.now()
    playNextPoint(session, {}, { rotateHome: true, rotateAway: true })
    const ms = performance.now() - t0
    const evCountAfter = session.events.length
    const pointEvents = session.events.slice(evCountBefore, evCountAfter)
    const throwCount = pointEvents.filter((e) => e.type === EVENT.THROW_ATTEMPT).length
    const turnoverCount = pointEvents.filter((e) => e.type === EVENT.TURNOVER || e.type === EVENT.STALL_OUT).length
    allPointStats.push({
      match: m,
      homeScore: scoreBefore[0],
      awayScore: scoreBefore[1],
      ms,
      totalEvents: pointEvents.length,
      throwLikeEvents: throwCount,
      turnoverLikeEvents: turnoverCount,
    })
  }
}

allPointStats.sort((a, b) => b.ms - a.ms)
console.log('=== Top 25 slowest points (by ms) ===')
console.log('score       ms      events  throwLike  turnoverLike  match#')
for (const p of allPointStats.slice(0, 25)) {
  console.log(
    `${String(p.homeScore).padStart(2)}-${String(p.awayScore).padEnd(2)}      ` +
    `${p.ms.toFixed(1).padStart(7)}  ${String(p.totalEvents).padStart(6)}  ` +
    `${String(p.throwLikeEvents).padStart(9)}  ${String(p.turnoverLikeEvents).padStart(12)}  m${p.match}`,
  )
}

console.log('\n=== Correlation: ms vs totalEvents (all points) ===')
const n = allPointStats.length
const meanMs = allPointStats.reduce((s, p) => s + p.ms, 0) / n
const meanEv = allPointStats.reduce((s, p) => s + p.totalEvents, 0) / n
let cov = 0, varMs = 0, varEv = 0
for (const p of allPointStats) {
  cov += (p.ms - meanMs) * (p.totalEvents - meanEv)
  varMs += (p.ms - meanMs) ** 2
  varEv += (p.totalEvents - meanEv) ** 2
}
const corr = cov / Math.sqrt(varMs * varEv)
console.log(`n=${n}  mean ms=${meanMs.toFixed(1)}  mean events=${meanEv.toFixed(1)}  corr(ms, events)=${corr.toFixed(3)}`)

console.log('\n=== Bucketed by max(homeScore,awayScore) at point start ===')
const byLead = new Map()
for (const p of allPointStats) {
  const lead = Math.max(p.homeScore, p.awayScore)
  const b = byLead.get(lead) ?? { count: 0, ms: 0, events: 0, maxMs: 0 }
  b.count++
  b.ms += p.ms
  b.events += p.totalEvents
  b.maxMs = Math.max(b.maxMs, p.ms)
  byLead.set(lead, b)
}
console.log('leadScore | count | avgMs | avgEvents | maxMs')
for (const [lead, b] of [...byLead.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${String(lead).padStart(9)} | ${String(b.count).padStart(5)} | ${(b.ms / b.count).toFixed(1).padStart(6)} | ${(b.events / b.count).toFixed(1).padStart(9)} | ${b.maxMs.toFixed(1)}`)
}
