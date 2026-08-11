import { attackDirectionX } from '../fieldDimensions.js'
import { subStat } from './statFormulas.js'

/** Postęp w stronę strefy punktowej (metry), dodatni = do przodu. */
export function forwardProgressMeters(fromX, toX, possessionTeam) {
  return (toX - fromX) * attackDirectionX(possessionTeam)
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLen2 = abx * abx + aby * aby || 1
  let t = (apx * abx + apy * aby) / abLen2
  t = Math.max(0, Math.min(1, t))
  return {
    dist: Math.hypot(px - (ax + abx * t), py - (ay + aby * t)),
    t,
  }
}

/**
 * Tłok wokół odbiorcy + obrońcy na torze lotu.
 * Thrower z wysokim vision/decisionMaking „widzi” to ostrzej i unika takich opcji.
 */
export function evaluateThrowTraffic({
  fromX,
  fromY,
  toX,
  toY,
  receiverId,
  throwerId,
  offenseAgents = [],
  defenseAgents = [],
  stallCount = 1,
  thrower = null,
}) {
  const pathLen = Math.hypot(toX - fromX, toY - fromY) || 1
  let teammateCrowd = 0
  let nearestTeammate = Infinity
  for (const a of offenseAgents) {
    const id = a.player?.id ?? a.id
    if (id === receiverId || id === throwerId) continue
    const d = Math.hypot((a.x ?? 0) - toX, (a.y ?? 0) - toY)
    nearestTeammate = Math.min(nearestTeammate, d)
    if (d < 3.5) teammateCrowd += 1.4
    else if (d < 5.5) teammateCrowd += 0.7
  }

  let defenderCrowd = 0
  let nearestDefAtTarget = Infinity
  const laneThreats = []
  for (const d of defenseAgents) {
    const id = d.player?.id ?? d.id
    const dx = d.x ?? 0
    const dy = d.y ?? 0
    const atTarget = Math.hypot(dx - toX, dy - toY)
    nearestDefAtTarget = Math.min(nearestDefAtTarget, atTarget)
    if (atTarget < 3) defenderCrowd += 1.5
    else if (atTarget < 5) defenderCrowd += 0.6

    // Krycie przy catch point / mark przy throwerze = contest w resolveThrow, nie lane-block.
    const nearCatch = atTarget < 3.6
    const nearThrower = Math.hypot(dx - fromX, dy - fromY) < 3.2
    if (nearCatch || nearThrower) continue

    const { dist, t } = distPointToSegment(dx, dy, fromX, fromY, toX, toY)
    // Help / poach w środku toru lotu.
    if (dist <= 2.15 && t > 0.22 && t < 0.78) {
      const laneHalf = 2.15
      const proximity = 1 - dist / laneHalf
      const midBonus = 1 - Math.abs(t - 0.5) * 0.85
      const threat = proximity * Math.max(0.35, midBonus)
      laneThreats.push({
        defender: d.player ?? d,
        defenderId: id,
        distToPath: dist,
        pathT: t,
        threat,
      })
    }
  }
  laneThreats.sort((a, b) => b.threat - a.threat)

  const isolation = Math.min(1, (nearestDefAtTarget === Infinity ? 12 : nearestDefAtTarget) / 8)
  const space = Math.min(1, (nearestTeammate === Infinity ? 12 : nearestTeammate) / 7)
  const laneThreat = laneThreats[0]?.threat ?? 0

  // Stall 1–3: premiuj izolację i przestrzeń; tłok karany (vision skaluje).
  const earlyStall = stallCount < 4
  let rawPenalty =
    teammateCrowd * (earlyStall ? 7 : 4) +
    defenderCrowd * (earlyStall ? 5 : 3) +
    laneThreat * (earlyStall ? 11 : 7)
  let rawBonus =
    isolation * (earlyStall ? 10 : 6) + space * (earlyStall ? 8 : 4)

  const vision = thrower ? subStat(thrower, 'mental', 'vision') : 50
  const decision = thrower ? subStat(thrower, 'mental', 'decisionMaking') : 50
  // Słaby thrower niedoszacowuje tłoku → częściej rzuca w grupę.
  const awareness = Math.max(0.25, Math.min(1, (vision * 0.55 + decision * 0.45) / 100))
  const perceivedPenalty = rawPenalty * (0.3 + awareness * 0.7)
  const perceivedBonus = rawBonus * (0.55 + awareness * 0.45)

  const crowded =
    teammateCrowd >= 2.4 ||
    (teammateCrowd >= 1.8 && defenderCrowd >= 1.0) ||
    laneThreat >= 0.7

  return {
    teammateCrowd,
    defenderCrowd,
    isolation,
    space,
    laneThreat,
    laneThreats,
    nearestDefAtTarget: Number.isFinite(nearestDefAtTarget) ? nearestDefAtTarget : 12,
    nearestTeammate: Number.isFinite(nearestTeammate) ? nearestTeammate : 12,
    pathLen,
    scoreDelta: perceivedBonus - perceivedPenalty,
    crowded,
    awareness,
  }
}

/**
 * Czy opcja jest akceptowalna przy wczesnym stallu — izolacja / przestrzeń.
 * Twardo odrzucamy tylko skrajny tłok przy wysokim awareness; reszta to kara w score.
 */
export function optionPassesIsolationPolicy(traffic, stallCount, isDump = false) {
  if (stallCount >= 4) return true
  if (!traffic) return true
  const awareness = traffic.awareness ?? 0.5
  if (isDump) return (traffic.laneThreat ?? 0) < 0.82
  // Tylko ewidentna „zupa” zawodników + niska izolacja — i tylko gdy thrower to widzi.
  if (
    (traffic.teammateCrowd ?? 0) >= 2.6 &&
    (traffic.isolation ?? 1) < 0.35 &&
    awareness > 0.55
  ) {
    return false
  }
  if ((traffic.laneThreat ?? 0) >= 0.85 && awareness > 0.7) return false
  return true
}

/**
 * Bonus/kara do oceny opcji zależnie od zdobytych metrów i stall count.
 */
export function yardageScoreComponent(forwardProgress, stallCount, isDump = false) {
  const fp = forwardProgress ?? 0
  // Nasycenie: 25 m nie jest dwa razy lepsze niż 12 m, bo dłuższy rzut to większe ryzyko.
  if (fp >= 15) return 26 + Math.min(12, (fp - 15) * 0.5)
  if (fp >= 8) return 18 + (fp - 8) * 1.15
  if (fp >= 5) return 12 + (fp - 5) * 1.2
  if (fp >= 2) return 6 + (fp - 2) * 2
  if (fp >= 0.5) return fp * 3

  if (fp >= -0.75) {
    if (stallCount >= 4 && stallCount < 7 && isDump) return 6
    if (stallCount >= 7) return isDump ? 2 : -8
    return isDump ? -14 : -26
  }

  if (stallCount >= 7) return isDump ? -4 : -10
  return -32
}

/**
 * Minimalna separacja (m) wymagana do rozważenia podania.
 * Rośnie z dystansem rzutu — im dłuższy lot, tym więcej czasu ma obrońca na dojście.
 * @param {object} [sepPolicy]
 * @param {number} [sepPolicy.separationReqDeltaM] — z dyrektywy passSelectivity
 * @param {number} [sepPolicy.openLookBias] — 0…1, „tylko otwarte”
 * @param {number} [sepPolicy.breakSideSepReqDeltaM] — dodatkowy próg tylko na break side (instrukcja „nie przełamuj marka”)
 * @param {boolean} [isOpenSide] — czy opcja jest po open side (break-side dostaje breakSideSepReqDeltaM)
 */
export function requiredSeparationMeters(
  stallCount,
  forwardProgress,
  isDump,
  throwDistanceM = null,
  sepPolicy = null,
  isOpenSide = true,
) {
  const fp = forwardProgress ?? 0
  const dist = throwDistanceM ?? Math.max(0, Math.abs(fp))

  // Przy głębokim cutcie odbiorca biegnie na dysk — wystarczy półtora kroku zapasu.
  let req = dist <= 8 ? 1.6 : dist <= 16 ? 2.5 : dist <= 22 ? 2.8 : 2.4

  // Podanie bez zysku musi być praktycznie pewne, inaczej nie warto ryzykować straty.
  if (fp < 0.5) req = Math.max(req, isDump ? 3.2 : 4.6)

  // Głęboki zysk z rozsądną separacją jest dopuszczalny wcześniej niż krótki reset.
  if (fp >= 18) req = Math.min(req, 2.2)

  if (stallCount >= 7) req *= 0.55
  else if (stallCount >= 4) req *= 0.82

  const openBias = Math.max(0, Math.min(1, sepPolicy?.openLookBias ?? 0))
  const delta = sepPolicy?.separationReqDeltaM ?? 0

  // „Tylko otwarte”: podciągnij próg w stronę open (~5 m) na nie-dumpach.
  if (openBias > 0 && !isDump) {
    req = Math.max(req, 2.6 + openBias * 2.6)
  }
  req += delta
  if (!isOpenSide) req += sepPolicy?.breakSideSepReqDeltaM ?? 0

  // Floor: nawet „luźniej” nie akceptuje totalnie blanketed looków.
  const floor = isDump
    ? 1.25
    : stallCount >= 7
      ? 1.15
      : stallCount >= 4
        ? 1.5
        : 1.75

  return Math.max(floor, req)
}

/** Czy opcja mieści się w polityce ryzyka dla danego stall count. */
export function optionPassesStallPolicy(
  separation,
  stallCount,
  forwardProgress,
  isDump,
  throwDistanceM = null,
  sepPolicy = null,
  isOpenSide = true,
) {
  const sep = separation ?? 0
  const fp = forwardProgress ?? 0
  if (
    sep <
    requiredSeparationMeters(stallCount, fp, isDump, throwDistanceM, sepPolicy, isOpenSide)
  ) {
    return false
  }

  if (stallCount < 4 && fp < 0.5) {
    const openBias = Math.max(0, Math.min(1, sepPolicy?.openLookBias ?? 0))
    const dumpMin = 3.4 + openBias * 0.6
    const otherMin = 5 + openBias * 1.2
    return sep >= (isDump ? dumpMin : otherMin)
  }

  return true
}

/**
 * Skorygowana ocena opcji (yardage + eskalacja ryzyka od stall).
 */
export function evaluateThrowOptionScore(baseScore, ctx) {
  const {
    forwardProgress = 0,
    stallCount = 1,
    separation = 0,
    isDump = false,
    isOpenSide = true,
    throwWindowScore = 0,
    throwDistanceM = null,
  } = ctx

  let score = baseScore
  score += yardageScoreComponent(forwardProgress, stallCount, isDump)

  // Długi rzut w ciasne krycie to prosta droga do straty — karz proporcjonalnie.
  const dist = throwDistanceM ?? Math.abs(forwardProgress)
  if (dist > 16) {
    const risk = (dist - 16) * 0.9
    const sepFactor = separation >= 6 ? 0.3 : separation >= 3.5 ? 0.9 : 2.4
    score -= risk * sepFactor
  }

  if (stallCount < 4) {
    if (forwardProgress >= 5) score += 10
    if (forwardProgress < 1 && !isDump) score -= 18
    if (!isOpenSide && forwardProgress < 3) score *= 0.72
  }

  if (stallCount >= 4 && stallCount < 7) {
    if (isDump && forwardProgress <= 1.5) score += 8
    else if (forwardProgress >= 4) score += 6
  }

  if (stallCount >= 7) {
    score += 6
    if (forwardProgress >= 2) {
      score += 16
      if (separation < 5) score += (5 - separation) * 4
    } else if (forwardProgress >= 0) {
      score += 4
    }
    if (forwardProgress < -0.5 && !isDump) score -= 12
  }

  // Zapas miejsca odbiorcy jest wart tyle co kilka metrów zysku — podanie w krycie
  // najczęściej kończy się stratą, więc nie może wygrywać z bezpieczniejszą opcją.
  score += Math.min(20, Math.max(0, separation - 3) * 4.5)

  if (forwardProgress >= 5 && separation >= 4.5) {
    score += Math.min(12, forwardProgress * 0.6)
  }

  // Naprawdę wolny odbiorca w głębi jest wart ryzyka — inaczej bliskie podanie
  // zawsze wygrywało ocenę i huck nie powstawał nigdy.
  if (dist >= 25 && separation >= 4) {
    score += 22
  }

  if (throwWindowScore > 55 && forwardProgress >= 3) score += 5

  return score
}

/**
 * Ile ms rzucający musi skanować boisko, zanim wypuści dysk.
 *
 * Zasady:
 * - set play (stall niski): cierpliwość, cutterzy budują strukturę
 * - prawdziwy flow (motion/hex + kontynuacja): szybsza decyzja
 * - chaos / tłok: czekaj na otwartą przestrzeń
 * - wysoki stall: wymuszony rzut
 *
 * 3. arg może być boolean (legacy postCatchReorg) albo obiektem kontekstu.
 */
export function throwReleaseGateMs(stallCount, forwardProgress = 0, ctx = {}) {
  const opts =
    typeof ctx === 'boolean'
      ? { postCatchReorg: ctx }
      : ctx && typeof ctx === 'object'
        ? ctx
        : {}
  const {
    postCatchReorg = false,
    isContinuationCut = false,
    separation = 0,
    crowded = false,
    teammateCrowd = 0,
    continuationUrgency = 0.15,
  } = opts

  if (stallCount >= 8) return 0
  if (stallCount >= 7) return 280
  if (stallCount >= 5) return 700

  const sep = separation ?? 0
  const fp = forwardProgress ?? 0
  const goldenOpen = sep >= 5.5 && fp >= 7 && (teammateCrowd ?? 0) < 1.0
  const solidOpen = sep >= 4 && fp >= 3.5
  const flowOffense = (continuationUrgency ?? 0) >= 0.5

  // Point-five tylko w stylach flow (motion / hex).
  if (flowOffense && postCatchReorg && isContinuationCut && solidOpen) {
    return goldenOpen ? 420 : 700
  }

  // Chaos: najpierw napraw strukturę.
  if ((crowded || (teammateCrowd ?? 0) >= 1.8) && !goldenOpen) {
    if (stallCount >= 4) return 1600
    return 3600
  }

  // Set play — minimum ~2.1 s (stall 2+), dłużej przy słabszym looku.
  if (goldenOpen && fp >= 8) return 2100
  if (solidOpen && fp >= 5) return 2600
  if (isContinuationCut && solidOpen) return 2400
  if (fp >= 3 && sep >= 3) return 3100
  if (fp >= 1) return 3600
  return stallCount >= 4 ? 2000 : 4200
}

/**
 * Stall widziany przez AI przy wyborze opcji. Łańcuch podań bez postępu
 * (reset za resetem) podbija agresję, mimo że realny stall zeruje się po każdym chwycie.
 */
export function effectiveDecisionStall(stallCount, resetChain = 0) {
  if (!resetChain) return stallCount
  const boost = Math.min(8, resetChain * 2)
  return Math.min(9, stallCount + boost)
}

/** Próg akceptacji opcji (niższy = łatwiej rzucić). */
export function acceptanceThresholdForStall(stallCount, baseThreshold) {
  if (stallCount >= 7) return Math.max(18, baseThreshold - 28)
  if (stallCount >= 5) return baseThreshold - 14
  if (stallCount >= 4) return baseThreshold - 6
  if (stallCount >= 3) return baseThreshold + 2
  if (stallCount >= 2) return baseThreshold + 10
  // Stall 0–1: bardzo wybredny.
  return baseThreshold + 18
}
