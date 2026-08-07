import { getSubStat } from '../models/playerStats.js'
import { getDominantHand, DOMINANT_HAND } from '../models/playerProfile.js'
import { fieldCenterY } from './fieldDimensions.js'
import { FORCE_SIDES } from './tacticsModifiers.js'
import { THROW_TYPE } from './throwTypes.js'

export const THROW_TECHNIQUE = {
  FOREHAND: 'forehand',
  BACKHAND: 'backhand',
}

/** @typedef {'force_forehand'|'force_backhand'|'force_middle'|'force_sideline'|'force_straight'} ForceMark */

/**
 * Jedyna dozwolona reprezentacja Force (+ migracja starych wartości).
 * @returns {ForceMark}
 */
export function normalizeForceMark(raw) {
  if (
    raw === FORCE_SIDES.FORCE_BACKHAND ||
    raw === 'force_backhand' ||
    raw === 'force_away' ||
    raw === 'away'
  ) {
    return FORCE_SIDES.FORCE_BACKHAND
  }
  if (
    raw === FORCE_SIDES.FORCE_MIDDLE ||
    raw === 'force_middle' ||
    raw === 'middle'
  ) {
    return FORCE_SIDES.FORCE_MIDDLE
  }
  if (
    raw === FORCE_SIDES.FORCE_SIDELINE ||
    raw === 'force_sideline' ||
    raw === 'force_line' ||
    raw === 'force_line_trap' ||
    raw === 'sideline'
  ) {
    return FORCE_SIDES.FORCE_SIDELINE
  }
  if (
    raw === FORCE_SIDES.FORCE_STRAIGHT ||
    raw === 'force_straight' ||
    raw === 'straight_up' ||
    raw === 'straight'
  ) {
    return FORCE_SIDES.FORCE_STRAIGHT
  }
  if (
    raw === FORCE_SIDES.FORCE_FOREHAND ||
    raw === 'force_forehand' ||
    raw === 'force_home' ||
    raw === 'home'
  ) {
    return FORCE_SIDES.FORCE_FOREHAND
  }
  return FORCE_SIDES.FORCE_FOREHAND
}

/**
 * Geometria markera na boisku.
 * sideline → dynamicznie do bliższej krawędzi (home/away).
 * straight → middle (mark na wprost).
 */
export function forceMarkLayoutSide(forceMark, throwerY = null) {
  const f = normalizeForceMark(forceMark)
  if (f === FORCE_SIDES.FORCE_MIDDLE || f === FORCE_SIDES.FORCE_STRAIGHT) return 'middle'
  if (f === FORCE_SIDES.FORCE_SIDELINE) {
    const cy = fieldCenterY()
    const y = throwerY ?? cy
    return y >= cy ? 'away' : 'home'
  }
  if (f === FORCE_SIDES.FORCE_BACKHAND) return 'away'
  return 'home'
}

/**
 * Force Middle: technika wymuszana na podanie w szeroki środek zależy od Y rzucającego i ręki.
 * @returns {'force_forehand'|'force_backhand'}
 */
export function resolveMiddleForceGrip({ throwerY, dominantHand }) {
  const cy = fieldCenterY()
  const hand =
    dominantHand === DOMINANT_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
  const onHomeHalf = throwerY < cy
  if (hand === DOMINANT_HAND.RIGHT) {
    return onHomeHalf ? FORCE_SIDES.FORCE_FOREHAND : FORCE_SIDES.FORCE_BACKHAND
  }
  return onHomeHalf ? FORCE_SIDES.FORCE_BACKHAND : FORCE_SIDES.FORCE_FOREHAND
}

/**
 * Aktywny force (grip) używany przy open/break — dla middle/sideline dynamiczny.
 */
export function resolveActiveForceGrip(forceMark, { throwerY, dominantHand } = {}) {
  const f = normalizeForceMark(forceMark)
  if (f === FORCE_SIDES.FORCE_MIDDLE || f === FORCE_SIDES.FORCE_SIDELINE) {
    return resolveMiddleForceGrip({
      throwerY: throwerY ?? cySafe(),
      dominantHand,
    })
  }
  // Straight-up: technika „neutralna” — traktuj jak forehand na open (obie strony short).
  if (f === FORCE_SIDES.FORCE_STRAIGHT) {
    return FORCE_SIDES.FORCE_FOREHAND
  }
  return f
}

function cySafe() {
  return fieldCenterY()
}

/** @deprecated użyj normalizeForceMark + forceMarkLayoutSide */
export function normalizeForceSide(forceSide) {
  return forceMarkLayoutSide(forceSide)
}

/** @deprecated użyj resolveActiveForceGrip */
export function forceMarkGrip(forceSide, ctx = {}) {
  return resolveActiveForceGrip(forceSide, ctx)
}

/**
 * Open vs break + force + ręka dominująca → technika rzutu (forehand/backhand).
 */
export function resolveThrowTechnique({
  dominantHand,
  forceSide,
  isOpenSide,
  throwerY,
}) {
  const hand =
    dominantHand === DOMINANT_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
  const force = resolveActiveForceGrip(forceSide, { throwerY, dominantHand: hand })
  const onOpen = !!isOpenSide

  if (hand === DOMINANT_HAND.RIGHT && force === FORCE_SIDES.FORCE_FOREHAND) {
    return onOpen ? THROW_TECHNIQUE.FOREHAND : THROW_TECHNIQUE.BACKHAND
  }
  if (hand === DOMINANT_HAND.RIGHT && force === FORCE_SIDES.FORCE_BACKHAND) {
    return onOpen ? THROW_TECHNIQUE.BACKHAND : THROW_TECHNIQUE.FOREHAND
  }
  if (hand === DOMINANT_HAND.LEFT && force === FORCE_SIDES.FORCE_FOREHAND) {
    return onOpen ? THROW_TECHNIQUE.BACKHAND : THROW_TECHNIQUE.FOREHAND
  }
  return onOpen ? THROW_TECHNIQUE.FOREHAND : THROW_TECHNIQUE.BACKHAND
}

/** Kara 35% celności i wyższe ryzyko D-block na break backhand (RH + force forehand). */
export function throwTechniqueModifiers({
  technique,
  dominantHand,
  forceSide,
  isOpenSide,
  throwerY,
}) {
  const mods = {
    accuracyMult: 1,
    blockRiskBonus: 0,
    technique,
  }
  if (technique !== THROW_TECHNIQUE.BACKHAND || isOpenSide) return mods

  const hand =
    dominantHand === DOMINANT_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
  const force = resolveActiveForceGrip(forceSide, { throwerY, dominantHand: hand })
  const breakBackhandRh =
    hand === DOMINANT_HAND.RIGHT && force === FORCE_SIDES.FORCE_FOREHAND
  const breakBackhandLh =
    hand === DOMINANT_HAND.LEFT && force === FORCE_SIDES.FORCE_BACKHAND
  if (breakBackhandRh || breakBackhandLh) {
    mods.accuracyMult = 0.65
    mods.blockRiskBonus = 10
  }
  return mods
}

export function techniqueAccuracyBase(thrower, technique, throwType = THROW_TYPE.STANDARD) {
  const skills = thrower?.skills ?? {}
  if (throwType === THROW_TYPE.HUCK) {
    return getSubStat(skills, 'throwing', 'huck')
  }
  if (throwType === THROW_TYPE.OVER_THE_TOP) {
    const hammer = getSubStat(skills, 'throwing', 'hammer')
    const huck = getSubStat(skills, 'throwing', 'huck')
    return hammer * 0.62 + huck * 0.38
  }
  if (throwType === THROW_TYPE.DUMP_SWING) {
    const bh = getSubStat(skills, 'throwing', 'backhand')
    const fh = getSubStat(skills, 'throwing', 'forehand')
    return bh * 0.55 + fh * 0.45
  }
  if (technique === THROW_TECHNIQUE.BACKHAND) {
    return getSubStat(skills, 'throwing', 'backhand')
  }
  return getSubStat(skills, 'throwing', 'forehand')
}

export function resolveThrowTechniqueForPlayer(thrower, ctx) {
  const dominantHand = getDominantHand(thrower)
  const technique = resolveThrowTechnique({
    dominantHand,
    forceSide: ctx.forceSide,
    isOpenSide: ctx.isOpenSide,
    throwerY: ctx.throwerY,
  })
  const mods = throwTechniqueModifiers({
    technique,
    dominantHand,
    forceSide: ctx.forceSide,
    isOpenSide: ctx.isOpenSide,
    throwerY: ctx.throwerY,
  })
  return { dominantHand, technique, ...mods }
}
