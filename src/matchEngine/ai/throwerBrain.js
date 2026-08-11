import { THROW_TYPE } from '../throwTypes.js'
import { HUCK_MIN_YARDS } from '../matchStats.js'
import { evaluatePlayerSituation } from './spatialEvaluator.js'
import { stallTier } from '../stall.js'
import { readLegacySkill } from '../../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale } from '../../models/playerMorale.js'
import { resolveThrowTechniqueForPlayer } from '../throwTechnique.js'
import { FORCE_SIDES } from '../tacticsModifiers.js'
import { CUTTER_STATE } from './cutterBrain.js'
import {
  forwardProgressMeters,
  optionPassesStallPolicy,
  evaluateThrowTraffic,
  evaluateThrowOptionScore,
  acceptanceThresholdForStall,
} from './throwerDecision.js'
import {
  throwScanRadiusM,
  stallComposureAccuracyPenalty,
  perceivedOptionLimit,
  decisionNoiseAmplitude,
  subStat,
} from './statFormulas.js'
import {
  applyAttackThrowBias,
  ATTACK_STYLES,
  DEFENSE_STYLES,
} from './tacticsBehavior.js'
import { DEFENDER_STATE } from './defenderBrain.js'
import { predictReceiverCatchPoint } from './discFlightPredict.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { windOptionScoreAdjust } from '../wind.js'

export const CONTINUATION_WINDOW_MS = 900

function acceptanceThreshold(stallCount, thrower, tactics = null) {
  const tier = stallTier(stallCount)
  const compPenalty = stallComposureAccuracyPenalty(stallCount, thrower)
  const vision = subStat(thrower, 'mental', 'vision')
  const decision = subStat(thrower, 'mental', 'decisionMaking')
  const composure = subStat(thrower, 'mental', 'composure')
  const judgment = decision * 0.5 + vision * 0.3 + composure * 0.2
  const mods = mergeTraitAndCoachMods(thrower, tactics, 'offense')
  let base
  // Wyższy próg na niskim stallu — czekamy na czystszą opcję.
  if (tier === 'low') base = 70 - judgment * 0.1
  else if (tier === 'medium') base = 54 - judgment * 0.09
  else if (tier === 'high') base = 36 - judgment * 0.05
  else base = 100
  return base + compPenalty * 0.15 + (mods.acceptanceThresholdDelta ?? 0)
}

function inferThrowType(option, discDist, stallCount, forwardProgress = 0) {
  const goesForward = forwardProgress >= 3
  if (option.isDump && !goesForward) return THROW_TYPE.DUMP_SWING
  if (stallCount >= 8 && option.situation.separation < 5 && !goesForward) {
    return THROW_TYPE.DUMP_SWING
  }
  // Huck = postęp do przodu ≥ 40 m (HUCK_MIN_YARDS). Krótsze „deep” zostają standardem.
  if (forwardProgress >= HUCK_MIN_YARDS) return THROW_TYPE.HUCK
  // Hammer/scoober to rzut awaryjny — tylko przy zamkniętej stronie break,
  // na średnim dystansie, dla dobrego handlera i gdy odbiorca ma zapas miejsca.
  if (
    !option.situation.isOpenSide &&
    discDist > 12 &&
    discDist <= 20 &&
    option.situation.separation >= 4 &&
    applyMoraleToStat(readLegacySkill(option.player?.skills, 'throwing'), getPlayerMorale(option.player)) >
      70
  ) {
    return THROW_TYPE.OVER_THE_TOP
  }
  return THROW_TYPE.STANDARD
}

function throwerPosition(offenseAgents, thrower) {
  const agent = offenseAgents.find((a) => a.player?.id === thrower.id)
  return agent ? { x: agent.x, y: agent.y } : null
}

/**
 * Skan opcji rzutu — zwraca najlepszą opcję lub null.
 */
export function scanThrowOptions(thrower, offenseAgents, defenseAgents, ctx) {
  const {
    disc,
    stallCount = 1,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    possessionTeam = 'home',
    wind = null,
    rng,
    setupElapsedMs = 0,
    postCatchReorg = false,
    lastThrowerId = null,
    hardStallCount = stallCount,
    requireForwardPass = false,
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle = DEFENSE_STYLES.PERSON,
    offenseTactics = null,
  } = ctx

  const threshold = acceptanceThresholdForStall(
    stallCount,
    acceptanceThreshold(stallCount, thrower, offenseTactics),
  )
  const tier = stallTier(stallCount)
  const scanRadius = throwScanRadiusM(thrower)
  const throwerPos = throwerPosition(offenseAgents, thrower)
  const throwerMods = mergeTraitAndCoachMods(thrower, offenseTactics, 'offense')
  const sepPolicy = {
    separationReqDeltaM: throwerMods.separationReqDeltaM ?? 0,
    openLookBias: throwerMods.openLookBias ?? 0,
    breakSideSepReqDeltaM: throwerMods.breakSideSepReqDeltaM ?? 0,
  }
  const continuationWindow =
    postCatchReorg &&
    setupElapsedMs < CONTINUATION_WINDOW_MS &&
    stallCount <= 1

  const offensePositions = offenseAgents.map((a) => ({
    player: a.player,
    x: a.x,
    y: a.y,
  }))
  const defensePositions = defenseAgents.map((a) => ({
    player: a.player,
    x: a.x,
    y: a.y,
  }))

  const options = []
  for (const agent of offenseAgents) {
    if (agent.player.id === thrower.id) continue
    const catchPt = predictReceiverCatchPoint(
      agent,
      throwerPos?.x ?? disc?.x ?? agent.x,
      throwerPos?.y ?? disc?.y ?? agent.y,
    )
    const situation = evaluatePlayerSituation(agent.player, {
      x: catchPt.x,
      y: catchPt.y,
      offensePositions,
      defensePositions,
      disc,
      forceSide,
      possessionTeam,
      throwerPos,
    })

    const distFromThrower =
      throwerPos != null
        ? Math.hypot(catchPt.x - throwerPos.x, catchPt.y - throwerPos.y)
        : situation.discDist
    if (distFromThrower > scanRadius) continue

    const isDump = agent.isDump === true
    const isContinuationCut =
      agent.state === CUTTER_STATE.ACTIVE_CUT ||
      agent.state === CUTTER_STATE.INITIATING_CUT ||
      agent.continuationCut === true
    const speed = Math.hypot(agent.vx ?? 0, agent.vy ?? 0)

    if (continuationWindow && !isDump && !isContinuationCut && speed < 0.35) {
      continue
    }

    const forwardProgress =
      throwerPos != null
        ? forwardProgressMeters(throwerPos.x, catchPt.x, possessionTeam)
        : 0

    // Zakaz odbicia dysku do poprzedniego rzucającego bez zysku — to źródło pętli A→B→A.
    // Zwalnia dopiero realny (nie eskalowany) stall, żeby eskalacja nie odblokowała pętli.
    const isEchoBack = lastThrowerId != null && agent.player.id === lastThrowerId
    if (isEchoBack && forwardProgress < 3 && hardStallCount < 8) continue

    // Po serii podań bez postępu jedyną dopuszczalną opcją jest zysk terenu.
    if (requireForwardPass && hardStallCount < 8 && forwardProgress < 2.5) continue

    if (
      !optionPassesStallPolicy(
        situation.separation,
        stallCount,
        forwardProgress,
        isDump,
        distFromThrower,
        sepPolicy,
        situation.isOpenSide,
      )
    ) {
      continue
    }

    const fromX = throwerPos?.x ?? disc?.x ?? catchPt.x
    const fromY = throwerPos?.y ?? disc?.y ?? catchPt.y
    const traffic = evaluateThrowTraffic({
      fromX,
      fromY,
      toX: catchPt.x,
      toY: catchPt.y,
      receiverId: agent.player.id,
      throwerId: thrower.id,
      offenseAgents,
      defenseAgents,
      stallCount,
      thrower,
    })

    // Skrajna grupa przy wysokim awareness — sporadycznie odrzuć na stallu 1–3.
    if (
      stallCount < 4 &&
      !isDump &&
      (traffic.teammateCrowd ?? 0) >= 3.2 &&
      (traffic.awareness ?? 0) > 0.8
    ) {
      continue
    }

    let score = situation.throwWindowScore
    if (continuationWindow && isContinuationCut) {
      score += 22 + speed * 4
      if (agent.state === CUTTER_STATE.ACTIVE_CUT) score += 12
    }
    if (isDump) score += tier === 'high' || tier === 'medium' ? 18 : 6
    if (tier === 'low' && situation.separation < 4) score *= 0.55
    if (tier === 'high') score += 8

    const throwType = inferThrowType(
      { player: agent.player, situation, isDump },
      distFromThrower,
      stallCount,
      forwardProgress,
    )

    const tech = resolveThrowTechniqueForPlayer(thrower, {
      forceSide,
      isOpenSide: situation.isOpenSide,
      throwerY: throwerPos?.y,
    })
    if (tech.technique === 'forehand' && situation.isOpenSide) score += 6
    if (tech.accuracyMult < 1) score -= (1 - tech.accuracyMult) * 40

    {
      const fromX = throwerPos?.x ?? disc?.x ?? 0
      const fromY = throwerPos?.y ?? disc?.y ?? 0
      const windAdj = windOptionScoreAdjust({
        wind,
        throwDx: catchPt.x - fromX,
        throwDy: catchPt.y - fromY,
        throwType,
        forwardProgress,
        isDump,
        thrower,
        possessionTeam,
        distanceM: distFromThrower,
        stallCount,
      })
      score += windAdj.scoreDelta
    }
    score -= stallComposureAccuracyPenalty(stallCount, thrower) * 0.2

    score = evaluateThrowOptionScore(score, {
      forwardProgress,
      stallCount,
      separation: situation.separation,
      isDump,
      isOpenSide: situation.isOpenSide,
      throwWindowScore: situation.throwWindowScore,
      throwDistanceM: distFromThrower,
    })

    if (!situation.isOpenSide) {
      score += (throwerMods.breakSideOptionBonus ?? 0) * 100
      score *= throwerMods.breakSideWeightMult ?? 1
    }

    // Safe vs creative: pewne okna vs ryzyko otwierające boisko.
    {
      const sep = situation.separation ?? 0
      const window = situation.throwWindowScore ?? 0
      const safe = throwerMods.safeOptionBias ?? 0
      const creative = throwerMods.creativeRiskBias ?? 0
      if (safe > 0) {
        if (sep < 2.8) score -= safe * 28
        else if (sep >= 4.5) score += safe * 12
        if (window < 0.35) score -= safe * 18
        if (isDump) score += safe * 10
      }
      if (creative > 0) {
        if (!situation.isOpenSide) score += creative * 16
        if (throwType === THROW_TYPE.OVER_THE_TOP) score += creative * 22
        if (sep >= 2.2 && sep < 4.2) score += creative * 14
        if (window >= 0.25 && window < 0.55) score += creative * 10
      }
    }

    // Preferuj czystą przestrzeń / unikaj grupy — lekka kara, stall 1–3 ostrzejsza.
    {
      const aw = traffic.awareness ?? 0.5
      const early = stallCount < 4
      score -= traffic.teammateCrowd * aw * (early ? 4 : 2)
      score -= traffic.laneThreat * aw * (early ? 8 : 4)
      if (early && distFromThrower <= 16) {
        score += Math.min(4, traffic.space * aw * 3)
      }
    }

    // Deep / huck (≥ HUCK_MIN_YARDS): appetite premiuje czyste i półotwarte okna.
    // Medium deep (18–30 m) dostaje lekki skill bias.
    {
      const sep = situation.separation ?? 0
      const huckSkill = subStat(thrower, 'throwing', 'huck')
      const isHuckRange =
        throwType === THROW_TYPE.HUCK ||
        forwardProgress >= HUCK_MIN_YARDS ||
        distFromThrower >= HUCK_MIN_YARDS

      if (isHuckRange) {
        score += (huckSkill - 50) * 0.2
        const openDeep = sep >= 4.5
        const goodDeep = sep >= 3.0
        if (openDeep || goodDeep) {
          const appetiteFactor = openDeep ? 1 : 0.55
          score += (huckSkill - 50) * 0.2 * appetiteFactor
          score += (openDeep ? 14 : 7) * appetiteFactor
          const w = throwerMods.huckWeightMult ?? 1
          score *= 0.82 + 0.18 * (1 + (w - 1) * appetiteFactor)
          score += (throwerMods.huckAcceptanceDelta ?? 0) * 40 * appetiteFactor
          const hero = throwerMods.heroThrowWeightMult ?? 1
          score *= 1 + (hero - 1) * appetiteFactor
          score += (throwerMods.scoringOptionBonus ?? 0) * 50 * appetiteFactor
        } else if (sep < 2.5) {
          score -= 6
        }
      } else if (forwardProgress >= 18 || distFromThrower >= 20) {
        score += (huckSkill - 50) * 0.14
        if (sep >= 3.2) score += 3
      }
    }

    if (isDump) {
      score *= throwerMods.dumpWeightMult ?? 1
      score += (throwerMods.dumpEarlyBias ?? 0) * 18
      score -= Math.max(0, throwerMods.scoringOptionBonus ?? 0) * 25
    }

    // Poach: porzucony receiver jest złotem; rzut w lane poachera — pułapka.
    const poachers = defenseAgents.filter((d) => d.state === DEFENDER_STATE.POACHING)
    for (const p of poachers) {
      const abandonedId = p.poachedFromId
      if (abandonedId != null && agent.player.id === abandonedId) {
        score += 28
      }
      const nearPoach = Math.hypot(catchPt.x - p.x, catchPt.y - p.y) < 4.5
      if (nearPoach && agent.player.id !== abandonedId) score -= 22
    }

    score = applyAttackThrowBias(score, {
      attackStyle,
      forceSide,
      defenseStyle,
      forwardProgress,
      throwDistanceM: distFromThrower,
      isDump,
      separation: situation.separation,
      isOpenSide: situation.isOpenSide,
      receiverY: catchPt.y,
    })

    // Ocena jest subiektywna: to, jak trafnie zawodnik porówna opcje, zależy od
    // decisionMaking i composure. Słabszy myli dobre podanie z ryzykownym.
    score += (rng.float() * 2 - 1) * decisionNoiseAmplitude(thrower, stallCount)

    options.push({
      agent,
      player: agent.player,
      score,
      salience:
        (isDump ? 30 : 0) +
        (isContinuationCut ? 25 : 0) +
        Math.max(0, 40 - distFromThrower) +
        (situation.separation ?? 0) * 4,
      situation,
      traffic,
      laneThreats: traffic.laneThreats,
      throwType,
      isDump,
      isContinuationCut,
      forwardProgress,
      catchX: catchPt.x,
      catchY: catchPt.y,
      throwTechnique: tech.technique,
      techniqueMods: tech,
      isOpenSide: situation.isOpenSide,
    })
  }

  // Zawodnik z niskim vision nie ogarnia całego boiska — rozważa tylko opcje
  // najbardziej rzucające się w oczy (bliskie, dump, cutter już w ruchu).
  const optionLimit = perceivedOptionLimit(thrower)
  const considered =
    options.length > optionLimit
      ? [...options].sort((a, b) => b.salience - a.salience).slice(0, optionLimit)
      : options

  considered.sort((a, b) => b.score - a.score)
  const best = considered[0]
  if (!best) return null

  // Kontynuacja obniża próg tylko przy realnym flow cutcie, nie przy każdym catchu.
  const flowLook = continuationWindow && best.isContinuationCut
  const contThreshold = threshold - (flowLook ? 12 : 0)

  if (stallCount < 4 && best.isDump && (best.forwardProgress ?? 0) < 1) {
    const forwardOpt = considered.find(
      (o) =>
        !o.isDump &&
        (o.forwardProgress ?? 0) >= 3 &&
        o.score >= contThreshold - 12,
    )
    if (forwardOpt) return forwardOpt
  }
  if (
    stallCount < 4 &&
    (best.forwardProgress ?? 0) < 0.5 &&
    !best.isDump
  ) {
    const ahead = considered.find((o) => (o.forwardProgress ?? 0) >= 4 && o.score >= contThreshold - 8)
    if (ahead) return ahead
  }

  if (tier === 'high' && best.isDump && best.score >= contThreshold - 12) {
    return best
  }
  if (stallCount >= 7 && best.forwardProgress >= 1 && best.score >= contThreshold - 22) {
    return best
  }
  if (best.score >= contThreshold) return best
  if (flowLook && best.score >= contThreshold - 10) return best
  if (tier === 'high' && considered.find((o) => o.isDump && o.score >= contThreshold - 15)) {
    return considered.find((o) => o.isDump)
  }
  return null
}

export function separationFromSituation(situation, rng, stallCount = 1) {
  const sep = situation.separation
  // Progi dopasowane do skali separacji, jaką generuje symulacja ruchu:
  // przy kryciu 1:1 typowy zapas otwartego odbiorcy to 3–5 m, nie 8+.
  if (sep > 5.5) {
    return { outcome: 'open', abort: false, throwBonus: 14, throwPenalty: 0, margin: sep }
  }
  if (sep > 3) {
    return { outcome: 'contested', abort: false, throwBonus: 4, throwPenalty: 0, margin: sep }
  }
  const abort =
    stallCount >= 7 ? rng.float() < 0.12 : stallCount >= 4 ? rng.float() < 0.22 : rng.float() < 0.38
  return { outcome: 'tight', abort, throwBonus: 0, throwPenalty: 12, margin: sep }
}

