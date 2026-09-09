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
