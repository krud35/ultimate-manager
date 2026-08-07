import { clampFieldX, clampFieldY, fieldCenterY, attackDirectionX } from '../fieldDimensions.js'
import { FORCE_SIDES } from '../tacticsModifiers.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'
import { isCloggingThrowLane } from './offenseReorganization.js'
import { subStat } from './statFormulas.js'
import { getTraitMods } from '../../models/playerTraits.js'

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay)
}

/**
 * @param {object} player — zawodnik ofensywny
 * @param {object} ctx
 * @param {number} ctx.x
 * @param {number} ctx.y
 * @param {Array<{ player, x, y }>} ctx.offensePositions
 * @param {Array<{ player, x, y }>} ctx.defensePositions
 * @param {{ x: number, y: number }} ctx.disc
 * @param {string} ctx.forceSide
 * @param {string} ctx.possessionTeam
 */
export function evaluatePlayerSituation(player, ctx) {
  const {
    x,
    y,
    offensePositions = [],
    defensePositions = [],
    disc,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    possessionTeam = 'home',
    throwerPos = null,
  } = ctx

  let minDefDist = Infinity
  for (const d of defensePositions) {
    minDefDist = Math.min(minDefDist, dist(x, y, d.x, d.y))
  }
  if (!Number.isFinite(minDefDist)) minDefDist = 12

  const forceMark = normalizeForceMark(forceSide)
  const layout = forceMarkLayoutSide(forceMark, throwerPos?.y ?? y)
  const cy = fieldCenterY()
  let isOpenSide = true
  if (forceMark === FORCE_SIDES.FORCE_STRAIGHT) {
    // Straight-up: obie strony „otwarte” na short — deep trudniejszy.
    isOpenSide = true
  } else if (layout === 'middle') {
    isOpenSide = Math.abs(y - cy) >= 2.2
  } else if (layout === 'home') {
    isOpenSide = y >= cy + 0.8
  } else if (layout === 'away') {
    isOpenSide = y <= cy - 0.8
  }

  const inThrowLane = isCloggingThrowLane(x, y, disc, throwerPos, possessionTeam)

  let cloggingLevel = 0
  for (const o of offensePositions) {
    if (o.player.id === player.id) continue
    if (dist(x, y, o.x, o.y) < 7) cloggingLevel += 1
  }
  if (inThrowLane) cloggingLevel += 2
  const traitMods = getTraitMods(player)
  if ((traitMods.clogChanceMult ?? 1) > 1.1 && inThrowLane) cloggingLevel += 1
  if ((traitMods.clogChanceMult ?? 1) < 0.7 && cloggingLevel > 0) {
    cloggingLevel = Math.max(0, cloggingLevel - 1)
  }

  const discDist = disc ? dist(x, y, disc.x, disc.y) : 15
  const attackSign = attackDirectionX(possessionTeam)
  const aheadOfDisc = (x - disc.x) * attackSign
  const angleQuality = aheadOfDisc > -2 ? 1 : 0.55
  const sepScore = Math.min(1, minDefDist / 10)
  const distScore = discDist >= 6 && discDist <= 22 ? 1 : discDist < 6 ? 0.65 : 0.75
  const openBonus = isOpenSide ? 0.15 : -0.12
  const clogPenalty = cloggingLevel * 0.08

  const throwWindowScore = Math.max(
    0,
    Math.min(
      100,
      sepScore * 42 +
        distScore * 28 +
        angleQuality * 18 +
        openBonus * 20 -
        clogPenalty * 25 +
        ((subStat(player, 'physical', 'speed') - 50) * 0.12 +
          (subStat(player, 'offensive', 'offensiveSystemsKnowledge') - 50) * 0.06),
    ),
  )

  return {
    separation: minDefDist,
    isOpenSide,
    cloggingLevel,
    inThrowLane,
    throwWindowScore,
    discDist,
    aheadOfDisc,
  }
}

export function clampAgentPosition(x, y) {
  return { x: clampFieldX(x), y: clampFieldY(y) }
}
