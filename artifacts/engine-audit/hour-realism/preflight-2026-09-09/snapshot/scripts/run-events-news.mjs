// Run with Node 22.15+ / 24: node scripts/run-events-news.mjs
// Match Vite resolution without depending on another test suite's loader.
import { registerHooks } from 'node:module'

const lzBridge = 'data:text/javascript,' + encodeURIComponent(
  `import { createRequire } from 'node:module';
   const lz = createRequire(${JSON.stringify(import.meta.url)})('lz-string');
   export const { compressToUTF16, decompressFromUTF16 } = lz;
   export default lz;`,
)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'lz-string') return { url: lzBridge, shortCircuit: true }
    try { return nextResolve(specifier, context) }
    catch (error) {
      if (error.code === 'ERR_UNSUPPORTED_DIR_IMPORT') return nextResolve(`${specifier.replace(/\/$/, '')}/index.js`, context)
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
        return nextResolve(`${specifier}.js`, context)
      }
      throw error
    }
  },
})
await import('./test-events-news.mjs')
