import { runContinuousThrowSimulation } from './actionSimulator.js'

/**
 * Pełna symulacja akcji rzutu w jednej pętli ticków (setup + lot).
 * `onThrowCommitted` — decyzja o kontynuacji lotu i wyniku (z point.js / resolveThrow).
 */
export function runThrowMotionSimulation(params) {
  return runContinuousThrowSimulation(params)
}

/** @deprecated Trace powstaje w {@link runContinuousThrowSimulation}; zwraca gotowy motionTrace z wyniku symulacji. */
export function finalizeThrowMotionTrace(sim, params = {}) {
  if (sim?.stallAbort) return null
  if (sim?.motionTrace?.frames?.length) {
    const trace = sim.motionTrace
    if (params.resolution) trace.resolution = params.resolution
    return trace
  }
  return null
}
