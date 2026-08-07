/** Ręka rzutu (forehand/backhand dominant side). */
export const THROWING_HAND = {
  RIGHT: 'Right',
  LEFT: 'Left',
}

export const DOMINANT_HAND = {
  RIGHT: 'RIGHT',
  LEFT: 'LEFT',
}

/** Deterministyczny wybór ręki (~14% leworęcznych). */
export function rollThrowingHandForPlayer(playerId) {
  let h = (Number(playerId) || 1) >>> 0
  const tag = 'throwing-hand:v1'
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x85ebca6b)
    h >>>= 0
  }
  return h % 100 < 14 ? THROWING_HAND.LEFT : THROWING_HAND.RIGHT
}

export function getDominantHand(player) {
  const d = player?.dominantHand
  if (d === DOMINANT_HAND.LEFT || d === DOMINANT_HAND.RIGHT) return d
  const th = getThrowingHand(player)
  return th === THROWING_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
}

export function dominantHandFromThrowingHand(throwingHand) {
  return throwingHand === THROWING_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
}

export function getThrowingHand(player) {
  const hand = player?.throwingHand
  if (hand === THROWING_HAND.LEFT || hand === THROWING_HAND.RIGHT) return hand
  if (player?.id != null) return rollThrowingHandForPlayer(player.id)
  return THROWING_HAND.RIGHT
}

export function throwingHandShortLabel(hand) {
  return hand === THROWING_HAND.LEFT ? 'L' : 'R'
}
