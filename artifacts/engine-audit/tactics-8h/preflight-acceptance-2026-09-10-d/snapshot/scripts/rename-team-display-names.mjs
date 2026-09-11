import fs from 'node:fs'
import path from 'node:path'

const dir = path.join('src', 'data', 'historical')
let files = 0
let dc = 0
let la = 0

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const p = path.join(dir, f)
  let s = fs.readFileSync(p, 'utf8')
  const before = s
  const dcCount = (s.match(/Dc Breeze/g) || []).length
  const laCount = (s.match(/La Aviators|LA Aviators/g) || []).length
  s = s.replaceAll('"Dc Breeze"', '"DC Breeze"')
  s = s.replaceAll('"La Aviators"', '"Los Angeles Aviators"')
  s = s.replaceAll('"LA Aviators"', '"Los Angeles Aviators"')
  if (s !== before) {
    fs.writeFileSync(p, s)
    files += 1
    dc += dcCount
    la += laCount
  }
}

console.log({ files, dc, la })
