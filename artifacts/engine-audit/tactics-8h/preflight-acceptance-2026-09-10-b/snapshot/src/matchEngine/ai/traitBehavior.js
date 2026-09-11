/** Preference scores only: these never change execution accuracy or physical ability. */
export function stylePassBonus(mods, { lateral = 0, forward = 0, distance = 0, afterTurnover = false } = {}) {
  const swing = Math.abs(lateral) >= 8 && Math.abs(forward) <= 8 ? 14 * (mods.swingBias ?? 0) : 0
  const transition = afterTurnover ? (mods.transitionBias ?? 0) * (forward >= 8 ? 16 : distance <= 12 ? -12 : 0) : 0
  return swing + transition
}

export function uplineSpaceBonus(mods, ahead, lateral) {
  return ahead >= 2 && ahead <= 12 && Math.abs(lateral) <= 8 ? 24 * (mods.uplineBias ?? 0) : 0
}

export function giveAndGoOfferBonus(mods, playerId, lastThrowerId, elapsedMs) {
  return playerId === lastThrowerId && lastThrowerId != null && elapsedMs < 2500
    ? 0.4 * (mods.giveAndGoBias ?? 0) : 0
}

export function isClutchPoint(homeScore = 0, awayScore = 0, target = 15) {
  return Math.max(homeScore, awayScore) >= target - 2 && Math.abs(homeScore - awayScore) <= 2
}

/** Fixed windows avoid a per-tick probability depending on frame rate. */
export function throwingFakePhase(ms, enabled) {
  if (!enabled || ms < 300) return 0
  const phase = (ms - 300) % 1500
  return phase < 280 ? Math.sin(Math.PI * phase / 280) : 0
}
export function doubleMoveSetup(timing) {
  const skill = Math.max(0, Math.min(1, timing / 100))
  return { durationMs: 440 - 160 * skill, earlyPriority: 7 * skill,
    extraDelayMs: 260 * (1 - skill), distanceM: 1.2 + 0.6 * skill }
}
