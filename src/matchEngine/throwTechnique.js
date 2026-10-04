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
 * Open side in GLOBAL field Y. FH/BH name the side for a right-handed thrower;
 * changing hands never moves the mark. At midfield middle/sideline are neutral.
 */
export function forceOpenSideY(forceMark, throwerY = null, attackSign = 1) {
  const f = normalizeForceMark(forceMark)
  const sign = Math.sign(attackSign) || 1
  const centerward = Math.sign(fieldCenterY() - (throwerY ?? fieldCenterY()))
  if (f === FORCE_SIDES.FORCE_STRAIGHT) return 0
  if (f === FORCE_SIDES.FORCE_MIDDLE) return centerward
  if (f === FORCE_SIDES.FORCE_SIDELINE) {
    return centerward === 0 ? 0 : -centerward
  }
  return f === FORCE_SIDES.FORCE_BACKHAND ? -sign : sign
}

/** Marker/blocking side, not the forced/open side. Legacy labels refer to global Y. */
export function forceMarkLayoutSide(forceMark, throwerY = null, attackSign = 1) {
  const open = forceOpenSideY(forceMark, throwerY, attackSign)
  return open > 0 ? 'home' : open < 0 ? 'away' : 'middle'
}

/**
 * A straight/neutral mark has no lateral break side. A pass exactly on the axis
 * is neutral too; its actual obstruction is assessed from the marker geometry.
 */
export function isForceOpenSide(forceMark, throwerY, receiverY, attackSign = 1) {
  const open = forceOpenSideY(forceMark, throwerY, attackSign)
  return open === 0 || (receiverY - throwerY) * open >= -1e-9
}

/** Grip for RH on the open side. Apply handedness exactly once in the technique. */
export function resolveActiveForceGrip(forceMark, { throwerY, attackSign = 1 } = {}) {
  const open = forceOpenSideY(forceMark, throwerY, attackSign)
  return open * (Math.sign(attackSign) || 1) < 0
    ? FORCE_SIDES.FORCE_BACKHAND : FORCE_SIDES.FORCE_FOREHAND
}

export function resolveMiddleForceGrip(ctx = {}) {
  return resolveActiveForceGrip(FORCE_SIDES.FORCE_MIDDLE, ctx)
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
  attackSign = 1,
  throwDy,
}) {
  const hand =
    dominantHand === DOMINANT_HAND.LEFT ? DOMINANT_HAND.LEFT : DOMINANT_HAND.RIGHT
  const force = resolveActiveForceGrip(forceSide, { throwerY, attackSign })
  const onOpen = !!isOpenSide

  // Both lateral lanes are open under a neutral mark, but they still require
  // opposite techniques. Retain the RH forehand fallback on the exact axis.
  if (forceOpenSideY(forceSide, throwerY, attackSign) === 0 && Number.isFinite(throwDy)) {
    const rhForehand = throwDy * (Math.sign(attackSign) || 1) >= 0
    return rhForehand === (hand === DOMINANT_HAND.RIGHT)
      ? THROW_TECHNIQUE.FOREHAND : THROW_TECHNIQUE.BACKHAND
  }

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

/**
 * Kara 35% celności i wyższe ryzyko D-block na break-side throw — "dookoła marku"
 * jest trudniejsze niezależnie od tego, czy to akurat forehand czy backhand:
 * resolveThrowTechnique już zapewnia, że break-side zawsze dostaje "trudniejszą"
 * technikę dla danego force (RIGHT+force_forehand → break backhand, RIGHT+force_backhand
 * → break forehand, itd.). Wcześniej kara sprawdzała tylko technique===BACKHAND, więc
 * trafiała jedynie RIGHT+force_forehand / LEFT+force_backhand — force_backhand,
 * force_middle i force_sideline nigdy jej nie dostawały, dając atakującemu darmową
 * celność na break side przeciw tym trzem force (audyt balansu: 96.2% vs 92.1% na
 * pojedynczym rzucie, kompoundujące do 20-27pp różnicy w win rate — tmp-force-diagnose.mjs).
 */
export function throwTechniqueModifiers({ technique, isOpenSide }) {
  const mods = {
    accuracyMult: 1,
    blockRiskBonus: 0,
    technique,
  }
  if (isOpenSide) return mods
  mods.accuracyMult = 0.65
  mods.blockRiskBonus = 10
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
    attackSign: ctx.attackSign,
    throwDy: ctx.throwDy,
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
