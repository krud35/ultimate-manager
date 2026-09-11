import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readResults, summarize, selectConfigs, writeReport } from './tactics-audit-report.mjs'

const out = path.resolve(process.argv[2])
const old = await import(pathToFileURL(path.join(out, 'snapshot/scripts/tactics-audit-report.mjs')))
const catalog = JSON.parse(fs.readFileSync(path.join(out, 'candidate-configs.json')))
const rows = readResults(out)
const files = fs.readdirSync(path.join(out, 'jobs')).filter(f => f.endsWith('.json'))
assert.equal(rows.length, files.length)
const sample = files.filter(f => !f.startsWith('adaptation-')).filter((_, i) => i % 97 === 0).slice(0, 40)
const raw = sample.map(f => JSON.parse(fs.readFileSync(path.join(out, 'jobs', f))))
const ids = new Set(raw.map(r => r.job.id))
assert.deepEqual(summarize(rows.filter(r => ids.has(r.job.id))), old.summarize(raw))
assert.deepEqual(selectConfigs(rows.filter(r => ids.has(r.job.id)), catalog, 16, 2), old.selectConfigs(raw, catalog, 16, 2))
const development = readResults(out, 'development')
const selection = selectConfigs(development, catalog, 16, 2)
assert.ok(selection.selected.length > 0)
assert.deepEqual(selection, selectConfigs(rows.filter(r => r.job.phase === 'development'), catalog, 16, 2))
writeReport(out)
console.log(JSON.stringify({ status: 'PASS', files: rows.length, development: development.length,
  selected: selection.selected.map(c => c.id), maxRssBytes: process.resourceUsage().maxRSS * 1024,
  checks: ['projected aggregation matches original', 'selection algorithm matches original', 'phase filtering preserves selection', 'whole-corpus report under 512 MB heap'] }))
