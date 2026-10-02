import './register-world-tests.mjs'
import { register } from 'node:module'

// Separate module graphs keep registries and caches independent. Only the three
// captured modules differ; the rest of the engine uses the current source.
register('./engine-comparison-loader.mjs', import.meta.url)
