/** Separate the observed ending from hypotheses about its cause. */
export function diagnoseThrow(flight, resolution) {
  const plan = flight.plannedShape
  const execution = flight.executionResult?.execution ?? {}
  const outcome = resolution.success ? 'completed' : resolution.reason === 'out_of_bounds' ? 'boundary'
    : resolution.isBlock ? 'block' : resolution.isDrop ? 'drop' : 'no_contact'
  const missM = Math.hypot(flight.toX - (flight.aimX ?? flight.toX), flight.toY - (flight.aimY ?? flight.toY))
  const contacts = flight.touches ?? []
  const contributors = []
  if (missM > 0.05) contributors.push('aim_error')
  if (Math.abs(flight.arcExecutionError ?? 0) > 0.01) contributors.push('arc_error')
  if (Math.abs(flight.curveExecutionError ?? 0) > 0.01) contributors.push('curve_error')
  if (execution.markerPressure > 0) contributors.push('marker_pressure')
  if (Math.abs(execution.windPenalty ?? 0) > 0) contributors.push('wind_execution')
  if (execution.fatiguePenalty > 0) contributors.push('fatigue')
  const primary = outcome !== 'no_contact' ? outcome : !plan?.plannedArrival ? 'unknown_unvalidated'
    : plan.plannedArrival.legal === false ? 'illegal_choice'
      : plan.plannedArrival.reachable === false ? 'forced_unreachable_choice' : 'unknown_no_contact'
  const cause = resolution.success ? null : outcome === 'boundary' ? 'unknown_boundary_cause'
    : outcome === 'block' ? 'defender_contact' : outcome === 'drop' ? 'failed_catch' : primary
  return { primary, outcome, cause, causeConfirmed: outcome === 'block' || outcome === 'drop',
    inference: outcome === 'no_contact', contributors, missM,
    validationStatus: plan?.validationStatus ?? 'unvalidated',
    decisionAtMs: plan?.decisionAtMs ?? null, releaseAtMs: plan?.releaseAtMs ?? flight.throwMs ?? null,
    observationAtMs: plan?.observationAtMs ?? null, receiverObservation: plan?.receiverObservation ?? null,
    plannedLateness: plan?.plannedArrival?.lateness ?? null, plannedSupport: plan?.plannedArrival?.support ?? null,
    plannedDetourSec: plan?.plannedArrival?.detourSec ?? 0, plannedAvoidedId: plan?.plannedArrival?.avoidedId ?? null,
    markerPressure: execution.markerPressure ?? 0, windPenalty: execution.windPenalty ?? 0,
    fatiguePenalty: execution.fatiguePenalty ?? 0,
    fatigueComponents: execution.fatigueComponents ?? null,
    arcExecutionError: flight.arcExecutionError ?? null, curveExecutionError: flight.curveExecutionError ?? null,
    judgementLoss: plan?.judgementLoss ?? 0, contacts, receiverReads: flight.receiverReads ?? [],
    recoveryReceiverId: flight.recoveryReceiverId ?? null, lastTouchType: contacts.at(-1)?.type ?? null,
    bodyAvoidanceTicks: flight.bodyAvoidanceTicks ?? 0, bodyAvoidance: flight.bodyAvoidance ?? [],
    toeIn: resolution.toeIn ?? null, restartPoint: resolution.restartPoint ?? null }
}
