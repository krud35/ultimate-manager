/** Shared, saveable workload ledger. No calendar or match-engine dependencies. */
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
export function ensurePlayerWorkload(player) {
  player.workload ??= { history: [], pending: 0, pendingMatch: 0, recovery: 0, heavyDays: 0 }
  player.workload.history ??= []
  player.matchSharpness = clamp(player.matchSharpness ?? 65)
  return player.workload
}

export function addPlayerLoad(player, amount, { match = false, sharpness = 0 } = {}) {
  const w = ensurePlayerWorkload(player)
  const load = Math.max(0, Number(amount) || 0)
  w.pending = (w.pending ?? 0) + load
  if (match) w.pendingMatch = (w.pendingMatch ?? 0) + load
  player.matchStamina = clamp((player.matchStamina ?? 100) - load)
  // Repeated heavy days amplify the cost, rather than the training reward.
  player.developmentFatigue = clamp((player.developmentFatigue ?? 0) + load * (0.24 + Math.min(4, w.heavyDays ?? 0) * 0.04))
  player.matchSharpness = clamp(player.matchSharpness + sharpness)
  return load
}

export function recoverPlayerDay(player, date, medicalMultiplier = 1) {
  const w = ensurePlayerWorkload(player)
  if (!date || w.lastRecoveryDate >= date) return false
  const load = w.pending ?? 0
  const rest = player.trainingFocus === 'rest' ? 1.2 : 1
  const recovery = Math.min(1.4, Math.max(0.7, medicalMultiplier)) * rest
  // Recovery happens every day, including training days. Session cost is already paid.
  player.developmentFatigue = clamp((player.developmentFatigue ?? 0) - Math.max(0.5, 3.2 - load * 0.045) * recovery - Math.min(2, w.recovery ?? 0))
  const ceiling = 100 - player.developmentFatigue * 0.5
  player.matchStamina = clamp(Math.min(ceiling, (player.matchStamina ?? ceiling) + 13 * recovery + Math.min(4, w.recovery ?? 0)))
  player.matchSharpness = clamp(player.matchSharpness - ((w.pendingMatch ?? 0) > 0 ? 0 : 0.65))
  w.heavyDays = load >= 20 ? (w.heavyDays ?? 0) + 1 : Math.max(0, (w.heavyDays ?? 0) - 1)
  w.history = [...w.history, { date, load, matchLoad: w.pendingMatch ?? 0, freshness: player.matchStamina, fatigue: player.developmentFatigue }].slice(-35)
  w.lastRecoveryDate = date
  w.pending = 0
  w.pendingMatch = 0
  w.recovery = 0
  return true
}

export function workloadRisk(player) {
  const w = ensurePlayerWorkload(player)
  const recent = w.history.slice(-7).reduce((sum, day) => sum + day.load, w.pending ?? 0)
  const fatigue = player.developmentFatigue ?? 0
  return fatigue >= 65 || recent > 170 || w.heavyDays >= 3 ? 'high' : fatigue >= 35 || recent > 110 ? 'raised' : 'normal'
}

export function trainingParticipation(player, date, settings = {}) {
  const w=ensurePlayerWorkload(player)
  if ((w.pendingMatch ?? 0) > 0) return { multiplier: 0, reason: 'match' }
  if (player.injury?.daysRemaining > 0) return { multiplier: 0, reason: 'rehab' }
  if (player.trainingFocus === 'rest' || player.trainingIntensity === 'rest') return { multiplier: 0, reason: 'rest' }
  const freshness = Math.min(player.matchStamina ?? 100, 100 - (player.developmentFatigue ?? 0) * 0.5)
  if (settings.autoRest !== false && (freshness < (settings.restBelow ?? 55) || (player.developmentFatigue ?? 0) >= 70)) return { multiplier: 0, reason: 'overload' }
  const recentInjury = player.workload.returnUntil && date <= player.workload.returnUntil
  if (recentInjury) return { multiplier: 0.5, reason: 'return' }
  return { multiplier: ({ light: 0.65, normal: 1, extra: 1.2 })[player.trainingIntensity] ?? 1, reason: 'normal' }
}
