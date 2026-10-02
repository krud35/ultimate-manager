import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import { PLAYER_INSTRUCTION_IDS } from '../src/matchEngine/playerInstructions.js'
const dir = 'artifacts/match-behavior-2026-09-27'
fs.mkdirSync(dir, { recursive: true })
const jobs = []
const seeds = [424242, 924242, 1424242]
for (const seedBase of seeds) for (const kind of ['instructions', 'directives']) jobs.push({ kind, seedBase })
for (const instruction of PLAYER_INSTRUCTION_IDS) jobs.push({ kind: 'instructions', instruction, seedBase: seeds[0] })
for (const directive of ['huckAppetite', 'breakAppetite', 'passSelectivity', 'possessionTempo', 'stackDepth',
  'coverageShade', 'cushionDepth', 'markShape', 'poachSeeking', 'helpDeep', 'poachResetHandler', 'creativity']) {
  for (const value of [-1, 1]) jobs.push({ kind: 'directives', directive, value, seedBase: seeds[0] })
}
const results = []
async function workerLoop() {
  while (jobs.length) {
    const job = jobs.shift()
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL(job.kind === 'instructions' ? './bench-player-instructions-worker.mjs' : './bench-coach-directives-worker.mjs', import.meta.url),
        { workerData: { ...job, matches: 4, pointsToWin: 3, rosterSize: 18 } })
      worker.on('message', resolve); worker.on('error', reject)
      worker.on('exit', code => { if (code) reject(new Error(`exit ${code}`)) })
    })
    results.push({ ...job, ...result })
    fs.writeFileSync(`${dir}/settings.json`, JSON.stringify({ matchesPerCondition: 4, pointsToWin: 3, results }, null, 2))
    console.log(`${results.length}/52 ${job.kind} ${job.instruction ?? job.directive ?? 'baseline'} ${job.value ?? ''}`)
  }
}
await Promise.all(Array.from({ length: 4 }, workerLoop))
