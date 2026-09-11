// Match Vite's extension/directory resolution in headless career tests.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'lz-string') {
    return { url: new URL('./world-test-lz.mjs', import.meta.url).href, shortCircuit: true }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error.code === 'ERR_UNSUPPORTED_DIR_IMPORT') return nextResolve(`${specifier.replace(/\/$/, '')}/index.js`, context)
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}
