/** A safety limit is a failed simulation, never a sporting result. */
export class PointSimulationLimitError extends Error {
  constructor(failure, partialEvents = []) {
    super(`Point ${failure.pointIndex} reached the simulation action limit without a score; restart the match.`)
    this.name = 'PointSimulationLimitError'
    this.code = 'POINT_SIMULATION_LIMIT'
    this.failure = { ...failure, code: this.code }
    // These events describe an incomplete point. They must not become a score.
    this.partialEvents = partialEvents
  }
}

export function assertMatchCanContinue(session) {
  if (session?.status === 'failed') {
    throw new PointSimulationLimitError(session.failure ?? {})
  }
}
