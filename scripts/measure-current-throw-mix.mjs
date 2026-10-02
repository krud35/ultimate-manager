import fs from 'node:fs'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { initMatchSession, playNextPoint } from '../src/matchEngine/matchSession.js'
import { defaultTacticsForPlayers, ATTACK_STYLES } from '../src/matchEngine/tacticsModifiers.js'
import { MATCH_CONFIG } from '../src/matchEngine/config.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'

const dir = process.env.OUTPUT_DIR || 'artifacts/throw-mix-2026-09-28'
const count = (map, key) => { map[key] = (map[key] || 0) + 1 }
// Disjoint categories: engine hucks first, then dominant lateral direction,
// then forward/backward. A <3 m longitudinal change is also a lateral/reset pass.
const category = ({ type, forward, lateral }) => type === 'huck' ? 'huck'
  : Math.abs(forward) < 3 || Math.abs(lateral) > Math.abs(forward) ? 'across'
    : forward < 0 ? 'dump' : 'forward'

if (isMainThread) {
  fs.mkdirSync(dir, { recursive: true })
  const seeds = (process.env.SEEDS || '92701,92702').split(',').map(Number)
  const jobs = Object.values(ATTACK_STYLES).flatMap(style => seeds.map(seed => ({ style, seed })))
  const total = jobs.length, rows = []
  const lane = async () => {
    while (jobs.length) {
      const job = jobs.shift()
      const row = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: job })
        worker.on('message', resolve)
        worker.on('error', reject)
        worker.on('exit', code => { if (code) reject(new Error(`worker exit ${code}`)) })
      })
      rows.push(row)
      fs.writeFileSync(`${dir}/matches.json`, JSON.stringify(rows, null, 2))
      console.log(`${rows.length}/${total} ${job.style} ${job.seed}: ${row.throws.length} attempts`)
    }
  }
  await Promise.all(Array.from({ length: 3 }, lane))
  const summarize = matches => {
    const result = { matches: matches.length, points: 0, attempts: 0, successes: 0, categories: {}, types: {}, longitudinal: {} }
    for (const row of matches) {
      result.points += row.points
      result.successes += row.successes
      for (const pass of row.throws) {
        result.attempts++
        count(result.categories, category(pass))
        count(result.types, pass.type)
        count(result.longitudinal, pass.forward >= 3 ? 'forward' : pass.forward <= -3 ? 'backward' : 'level')
      }
    }
    result.percentages = Object.fromEntries(Object.entries(result.categories).map(([k, v]) => [k, 100 * v / result.attempts]))
    const possessions = matches.flatMap(row => row.possessions)
    const counts = possessions.map(p => p.attempts).sort((a, b) => a - b)
    const mean = group => group.length ? group.reduce((sum, p) => sum + p.attempts, 0) / group.length : null
    result.possessionStats = {
      count: possessions.length,
      attemptsPerPossession: mean(possessions),
      completionsPerPossession: result.successes / possessions.length,
      medianAttempts: counts.length % 2 ? counts[(counts.length - 1) / 2]
        : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2,
      zeroThrowPossessions: counts.filter(n => n === 0).length,
      scoringPossessions: possessions.filter(p => p.outcome === 'score').length,
      attemptsPerScoringPossession: mean(possessions.filter(p => p.outcome === 'score')),
      attemptsPerLostPossession: mean(possessions.filter(p => p.outcome === 'turnover')),
      outcomes: possessions.reduce((map, p) => { count(map, p.outcome); return map }, {}),
    }
    return result
  }
  const summary = {
    settings: { seeds, pointsToWin: Number(process.env.POINTS || 5), mode: 'full, no replay frames', windMph: 0,
      defense: 'person', rotation: false, aiAdaptation: false, playerInstructions: 'none',
      classification: 'huck = engine label; across = abs(forward)<3m or abs(lateral)>abs(forward); remaining negative forward = dump; remaining positive = forward' },
    overall: summarize(rows),
    byStyle: Object.fromEntries(Object.values(ATTACK_STYLES).map(style => [style, summarize(rows.filter(r => r.style === style))])),
  }
  fs.writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} else {
  const { style, seed } = workerData
  MATCH_CONFIG.pointsToWin = Number(process.env.POINTS || 5)
  Math.random = createRng(seed ^ 0x15511551).float
  const home = structuredClone(demoHomeTeam), away = structuredClone(demoAwayTeam)
  const tactics = players => normalizeTactics({ ...defaultTacticsForPlayers(players),
    oLineAttackStyle: style, dLineAttackStyle: style, oLineDefenseStyle: 'person', dLineDefenseStyle: 'person',
    oLinePlayerInstructions: {}, dLinePlayerInstructions: {} })
  let session = initMatchSession({ homeTeam: home, awayTeam: away, homeTactics: tactics(home.players),
    awayTactics: tactics(away.players), seed, wind: { speedMph: 0, directionDeg: 0 }, windLocked: true, collectFrames: false })
  const row = { style, seed, points: 0, successes: 0, throws: [], possessions: [] }
  let seen = 0, pointIndex = null, possession = null
  while (session.status !== 'finished') {
    session = playNextPoint(session, {}, { rotateHome: false, rotateAway: false, aiHome: false, aiAway: false,
      fastMode: false, collectFrames: false })
    for (const e of session.events.slice(seen)) {
      if (e.type === 'point_start') { row.points++; pointIndex = e.pointIndex }
      if (e.type === 'possession') {
        if (possession && !possession.outcome) throw new Error('Previous possession not closed')
        possession = { pointIndex, team: e.team, attempts: 0, completions: 0, outcome: null }
        row.possessions.push(possession)
      }
      if (e.type === 'turnover') {
        if (!possession) throw new Error('Turnover without possession')
        possession.outcome = 'turnover'
        possession.reason = e.reason
      }
      if (e.type === 'score') {
        if (!possession) throw new Error('Score without possession')
        possession.outcome = ['throw_limit', 'action_limit'].includes(e.reason) ? 'simulation_limit' : 'score'
        possession.reason = e.reason || 'completed_pass'
      }
      if (e.type === 'throw_success') { row.successes++; possession.completions++ }
      if (e.type !== 'throw_attempt') continue
      if (!possession || possession.outcome || possession.team !== e.possessionTeam) throw new Error('Throw outside active possession')
      possession.attempts++
      if (!Number.isInteger(pointIndex)) throw new Error('Missing point index')
      const sign = (e.possessionTeam === 'home' ? 1 : -1) * (pointIndex % 2 === 0 ? -1 : 1)
      const forward = (e.targetPoint?.x - e.releasePoint?.x) * sign
      const lateral = e.targetPoint?.y - e.releasePoint?.y
      if (![forward, lateral].every(Number.isFinite)) throw new Error('Missing throw geometry')
      row.throws.push({ pointIndex, team: e.possessionTeam, type: e.throwType, forward, lateral,
        distance: e.throwDistanceM, throwerRole: e.throwerSubRole, receiverRole: e.receiverSubRole })
    }
    seen = session.events.length
  }
  if (row.possessions.some(p => !p.outcome)) throw new Error('Unclosed possession')
  row.score = [session.homeScore, session.awayScore]
  parentPort.postMessage(row)
}
