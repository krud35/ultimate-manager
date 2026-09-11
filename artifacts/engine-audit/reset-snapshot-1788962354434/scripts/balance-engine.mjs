// Reproducible, process-local calibration switches. No source-file rewriting.
import { LANE_BLOCK_CALIBRATION } from '../src/matchEngine/ai/actionSimulator.js'
import { DEFLECTION_CALIBRATION } from '../src/matchEngine/ai/discDeflection.js'
import { THROW_FATIGUE_CALIBRATION } from '../src/matchEngine/stamina.js'
import { FLIGHT_APPROACH_CALIBRATION } from '../src/matchEngine/ai/flightKinematics.js'
import { BODY_TRAFFIC_CALIBRATION } from '../src/matchEngine/ai/bodyTraffic.js'
import { RESET_CUT_CALIBRATION } from '../src/matchEngine/ai/cutterBrain.js'
import { ARRIVAL_CALIBRATION } from '../src/matchEngine/ai/arrivalMotion.js'
import { MISS_CALIBRATION } from '../src/matchEngine/resolution.js'
import { MATCH_CONFIG } from '../src/matchEngine/config.js'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

if (process.argv.includes('--legacy-defense')) {
  Object.assign(LANE_BLOCK_CALIBRATION, { baseChance: 0.1, skillSpan: 0.28, spatialPressure: false, selectContact: false, deflectionReaction: false, interceptions: false })
  DEFLECTION_CALIBRATION.controlledSwat = false
  FLIGHT_APPROACH_CALIBRATION.interceptJumpClock = false
}
if (process.argv.includes('--legacy-fatigue')) THROW_FATIGUE_CALIBRATION.singleExecution = false
if (process.argv.includes('--no-body-traffic')) BODY_TRAFFIC_CALIBRATION.enabled = false
if (process.argv.includes('--no-route-planning')) BODY_TRAFFIC_CALIBRATION.planning = false
if (process.argv.includes('--no-offball-traffic')) BODY_TRAFFIC_CALIBRATION.offBall = false
if (process.argv.includes('--legacy-reset-cuts')) RESET_CUT_CALIBRATION.stable = false
if (process.argv.includes('--legacy-arrival')) Object.assign(ARRIVAL_CALIBRATION, { kinematics: false, observationRisk: false })
for (const [flag, config, key] of [
  ['--block-base', LANE_BLOCK_CALIBRATION, 'baseChance'], ['--block-span', LANE_BLOCK_CALIBRATION, 'skillSpan'],
  ['--read-interval', FLIGHT_APPROACH_CALIBRATION, 'readIntervalMs'], ['--read-blend', FLIGHT_APPROACH_CALIBRATION, 'readBlendScale'],
  ['--miss-slope', MISS_CALIBRATION, 'missPerMarginPoint'], ['--clean-margin', MISS_CALIBRATION, 'cleanMargin'],
  ['--max-uncertainty', ARRIVAL_CALIBRATION, 'maxUncertaintyM'],
]) {
  const i = process.argv.indexOf(flag)
  if (i < 0) continue
  const value = Number(process.argv[i + 1])
  if (!Number.isFinite(value) || value < 0 || (flag.startsWith('--read-') && value === 0)) throw new Error(`Invalid ${flag}`)
  config[key] = value
}
const fastGapIndex = process.argv.indexOf('--fast-gap')
if (fastGapIndex >= 0) {
  const value = Number(process.argv[fastGapIndex + 1])
  if (!Number.isFinite(value)) throw new Error('Invalid --fast-gap')
  MATCH_CONFIG.fastCalibration.gapOffset = value
}
const configuration = structuredClone({ block: LANE_BLOCK_CALIBRATION, deflection: DEFLECTION_CALIBRATION, fatigue: THROW_FATIGUE_CALIBRATION, approach: FLIGHT_APPROACH_CALIBRATION, bodyTraffic: BODY_TRAFFIC_CALIBRATION, resetCuts: RESET_CUT_CALIBRATION, arrival: ARRIVAL_CALIBRATION, miss: MISS_CALIBRATION, fast: MATCH_CONFIG.fastCalibration })
const filesUnder = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const p = `${dir}/${entry.name}`
  return entry.isDirectory() ? filesUnder(p) : /\.[cm]?js$/.test(p) ? [p] : []
})
const sources = ['scripts/balance-engine.mjs', 'scripts/engine-realism.mjs', 'scripts/calibrate-situations.mjs',
  ...['src/matchEngine', 'src/models', 'src/data'].flatMap(filesUnder)].sort()
const hashSource = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sourceHashes = Object.fromEntries(sources.map(p => [p, hashSource(p)]))
if (process.argv.includes('--situations')) await import('./calibrate-situations.mjs')
else await import('./engine-realism.mjs')
const index = process.argv.indexOf('--output')
if (index >= 0) {
  const path = process.argv[index + 1], result = JSON.parse(fs.readFileSync(path))
  const changedDuringRun = sources.filter(p => sourceHashes[p] !== hashSource(p))
  result.balance = { configuration, sourceHashes, changedDuringRun, args: process.argv.slice(2) }
  fs.writeFileSync(path, JSON.stringify(result, null, 2) + '\n')
  if (changedDuringRun.length) throw new Error(`Źródła zmieniły się podczas pomiaru: ${changedDuringRun.join(', ')}`)
}
