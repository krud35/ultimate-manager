/**
 * Sprawdza lokalne importy w src/:
 * 1) względna ścieżka wskazuje na istniejący plik
 * 2) named import istnieje w eksporcie celu
 *
 * Łapie white-screen Vite:
 * - Failed to resolve import "./foo.js"
 * - does not provide an export named 'X'
 *
 * Usage: node scripts/check-named-exports.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

const EXT = ['.js', '.jsx', '.mjs']

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (EXT.some((e) => ent.name.endsWith(e))) out.push(p)
  }
  return out
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  let abs = path.normalize(path.join(path.dirname(fromFile), spec))
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs
  for (const e of EXT) {
    if (fs.existsSync(abs + e)) return abs + e
  }
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    for (const e of EXT) {
      const idx = path.join(abs, 'index' + e)
      if (fs.existsSync(idx)) return idx
    }
  }
  return null
}

function parseExportNames(src) {
  const names = new Set()
  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(m[1])
  }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim()
      if (!t || t.startsWith('type ') || t.startsWith('typeof ')) continue
      const bits = t.split(/\s+as\s+/)
      names.add((bits[1] || bits[0]).trim())
    }
  }
  return names
}

function getExports(file, cache, stack = new Set()) {
  if (cache.has(file)) return cache.get(file)
  if (stack.has(file)) return new Set()
  stack.add(file)
  const src = fs.readFileSync(file, 'utf8')
  const names = parseExportNames(src)
  for (const m of src.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, m[2])
    for (const part of m[1].split(',')) {
      const t = part.trim()
      if (!t) continue
      const bits = t.split(/\s+as\s+/)
      names.add((bits[1] || bits[0]).trim())
    }
    if (target) {
      const te = getExports(target, cache, stack)
      for (const part of m[1].split(',')) {
        const t = part.trim()
        if (!t) continue
        const bits = t.split(/\s+as\s+/)
        const local = bits[0].trim()
        if (!te.has(local)) names.delete((bits[1] || bits[0]).trim())
      }
    }
  }
  for (const m of src.matchAll(/export\s+\*\s+from\s*['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, m[1])
    if (target) {
      for (const n of getExports(target, cache, stack)) names.add(n)
    }
  }
  cache.set(file, names)
  stack.delete(file)
  return names
}

function importedNames(clause) {
  return clause
    .split(',')
    .map((s) => {
      const t = s.trim()
      if (!t || t.startsWith('type ') || t.startsWith('typeof ')) return null
      return t.split(/\s+as\s+/)[0].trim()
    })
    .filter(Boolean)
}

/** Wszystkie lokalne specyfikatory z import/export-from. */
function collectRelativeSpecs(src) {
  const specs = []
  const re =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g
  for (const m of src.matchAll(re)) {
    specs.push({ spec: m[1], index: m.index ?? 0 })
  }
  // Prostsze, pewniejsze dopasowania na typowe formy:
  for (const m of src.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+|[\s\S]*?from\s+)['"](\.[^'"]+)['"]/g,
  )) {
    specs.push({ spec: m[1], index: m.index ?? 0 })
  }
  for (const m of src.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
    specs.push({ spec: m[1], index: m.index ?? 0 })
  }
  const seen = new Set()
  const out = []
  for (const s of specs) {
    if (seen.has(s.spec)) continue
    seen.add(s.spec)
    out.push(s.spec)
  }
  return out
}

const files = walk(SRC)
const cache = new Map()
const missingModules = []
const missingExports = []

for (const file of files) {
  const relFile = path.relative(ROOT, file).replaceAll('\\', '/')
  const src = fs.readFileSync(file, 'utf8')

  for (const spec of collectRelativeSpecs(src)) {
    const target = resolveImport(file, spec)
    if (!target) {
      missingModules.push({ file: relFile, from: spec })
    }
  }

  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!m[2].startsWith('.')) continue
    const target = resolveImport(file, m[2])
    if (!target) continue
    const exports = getExports(target, cache)
    for (const name of importedNames(m[1])) {
      if (!exports.has(name)) {
        missingExports.push({
          file: relFile,
          name,
          from: m[2],
          target: path.relative(ROOT, target).replaceAll('\\', '/'),
        })
      }
    }
  }
}

let failed = false
if (missingModules.length) {
  failed = true
  console.error('Missing modules (' + missingModules.length + '):')
  for (const p of missingModules) {
    console.error(`  ${p.file} → ${p.from}`)
  }
}
if (missingExports.length) {
  failed = true
  console.error('Missing named exports (' + missingExports.length + '):')
  for (const p of missingExports) {
    console.error(
      `  ${p.file} imports '${p.name}' from ${p.from} (resolved ${p.target})`,
    )
  }
}
if (failed) process.exit(1)

console.log(
  'OK: all local imports resolve (' +
    files.length +
    ' files, modules + named exports)',
)
