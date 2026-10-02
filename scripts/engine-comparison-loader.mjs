import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

const sourceRoot = new URL('../src/', import.meta.url).href
const baselineDirectory = process.env.ENGINE_BASELINE_DIR
const entries = baselineDirectory
  ? JSON.parse((await readFile(resolvePath(baselineDirectory, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''))
  : null
const originals = entries ? new Map(entries.map(entry => [
  pathToFileURL(resolvePath(entry.path)).href,
  pathToFileURL(resolvePath(baselineDirectory, entry.file)),
])) : new Map(['bodyTraffic', 'discIntercept', 'flightKinematics'].map(name => [
  new URL(`../src/matchEngine/ai/${name}.js`, import.meta.url).href,
  new URL(`../artifacts/engine-optimization/baseline/${name}.js.txt`, import.meta.url),
]))

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context)
  if (result.url.startsWith(sourceRoot)
    && (context.parentURL?.includes('?engineBaseline') || result.url.includes('?engineBaseline'))) {
    const url = new URL(result.url)
    url.search = '?engineBaseline'
    return { ...result, url: url.href }
  }
  return result
}

export async function load(url, context, nextLoad) {
  const parsed = new URL(url)
  if (parsed.search === '?engineBaseline') {
    parsed.search = ''
    const original = originals.get(parsed.href)
    if (original) return { format: 'module', source: await readFile(original, 'utf8'), shortCircuit: true }
  }
  return nextLoad(url, context)
}
