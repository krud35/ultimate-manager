import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// Keep long comparisons independent of edits in another local task.
const destination = path.resolve('artifacts/engine-audit', `reset-snapshot-${Date.now()}`)
const filesUnder = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = `${dir}/${e.name}`
  return e.isDirectory() ? filesUnder(p) : [p]
})
const files = ['package.json', ...filesUnder('src'), ...filesUnder('scripts')]
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const manifest = Object.fromEntries(files.map(p => [p, hash(p)]))
fs.mkdirSync(destination, { recursive: true })
for (const p of files) {
  const target = path.join(destination, p)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(p, target)
  if (hash(p) !== manifest[p] || hash(target) !== manifest[p]) throw new Error(`Source changed while copying: ${p}`)
}
for (const p of ['artifacts/engine-audit', 'artifacts/scenarios']) fs.mkdirSync(path.join(destination, p), { recursive: true })
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(destination)
