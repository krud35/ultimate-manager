// Read completed immutable results one at a time; do not retain replay/checkpoint objects.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const out = path.resolve(process.argv[2] ?? 'artifacts/engine-audit/tactics-balance-2026-10-03-v2')
const read = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'))
const progress = read('progress.json'), manifest = read('manifest.json')
let coordinatorAlive = true
try { process.kill(progress.pid, 0) }
catch (error) { if (error.code === 'ESRCH') coordinatorAlive = false; else throw error }
const states = {}, cohorts = {}, rounds = {}, failures = [], invalidLineups = []
const motionAlarms = { nonfinite: 0, displacementAlarms: 0, targetReversals: 0 }
const motionAlarmJobs = []
let games = 0, pointsChecked = 0, substitutions = 0, maxWorkerRssBytes = 0
for (const filename of fs.readdirSync(path.join(out, 'jobs'))) {
  if (!filename.endsWith('.json')) continue
  const result = read(`jobs/${filename}`)
  games++
  states[result.status] = (states[result.status] ?? 0) + 1
  cohorts[result.job.cohort] = (cohorts[result.job.cohort] ?? 0) + 1
  rounds[result.job.round] = (rounds[result.job.round] ?? 0) + 1
  substitutions += result.forcedSubstitutions ?? 0
  maxWorkerRssBytes = Math.max(maxWorkerRssBytes, result.timings?.maxRssBytes ?? 0)
  if (result.status !== 'complete' || result.hardErrors?.length) failures.push({ id: result.job.id,
    status: result.status, hardErrors: result.hardErrors, error: result.error })
  for (const side of ['home', 'away']) {
    const motion = result.sides?.[side]?.motion ?? {}
    for (const key of Object.keys(motionAlarms)) motionAlarms[key] += motion[key] ?? 0
    if (motion.nonfinite || motion.displacementAlarms) motionAlarmJobs.push({ id: result.job.id,
      side, identity: result.identity?.[side], nonfinite: motion.nonfinite ?? 0,
      displacementAlarms: motion.displacementAlarms ?? 0 })
  }
  for (const point of result.pointOutcomes ?? []) {
    pointsChecked++
    if (point.playerCounts?.home !== 7 || point.playerCounts?.away !== 7
      || point.observedPlayerCounts?.home?.min !== 7 || point.observedPlayerCounts?.away?.min !== 7) {
      invalidLineups.push({ id: result.job.id, point: point.point })
    }
  }
}
const summary = { at: new Date().toISOString(), stage: 'streaming-baseline-monitor', coordinatorAlive,
  progress, deadline: manifest.deadline, workers: manifest.workers, games, states, cohorts, rounds,
  pointsChecked, substitutions, failures, invalidLineups, maxWorkerRssBytes,
  motionAlarms, motionAlarmJobs,
  freeMemoryGb: os.freemem() / 2 ** 30, monitorMaxRssMb: process.resourceUsage().maxRSS / 1024 }
fs.appendFileSync(path.join(out, 'monitor.jsonl'), JSON.stringify(summary) + '\n')
console.log(JSON.stringify(summary))
