import { pacedSpeedMps, speedRangeFor } from './flightSpeed.js'
import { bodyAwareTarget } from './bodyTraffic.js'
import { DISC_STATE, discPositionHeld, discPositionInFlight } from '../discState.js'
import { integrateAgentMotion, waitingHoldSpeedMps } from './playerMovement.js'
import { computeDynamicOffenseTarget, spacingAdjustedTarget } from './offenseReorganization.js'
import {
  aerialContestChance,
  discDeliveryHeightM,
  discReleaseHeightM,
  executeThrowShape,
  discPeakHeightM,
  jumpHeightM,
  maxSpeedMps,
  standingReachM,
  subStat,
} from './statFormulas.js'
import { createDiscTrajectory, sampleContinuedDisc, trajectoryWindOffset } from './discTrajectory.js'
import { chooseThrowShape, defaultThrowShape, CURVE_AMP_MULT } from './throwShape.js'
import { selectDiscIntercept } from './discIntercept.js'
import { ARRIVAL_CALIBRATION, arrivalSpeed } from './arrivalMotion.js'
import { playerMatchMods } from '../playerModsRegistry.js'
import { perceivePlayers } from './playerPerception.js'
import { sampleDeflection } from './discDeflection.js'
import { playerBody } from '../../models/playerBody.js'

export const FLIGHT_TICK_MS = 20
const DT_SEC = FLIGHT_TICK_MS / 1000
/** Zasięg gracza na dysk (z layoutem) — używane też jako granica fizycznej łapliwości rzutu. */
export const LAYOUT_DIST_M = 2.5
const LAYOUT_TIME_MS = 220

export function pathLength(pts) {
  if (!pts?.length) return 1
  let len = 0
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return Math.max(len, 1)
}

export function samplePathAt(pts, u) {
  if (!pts?.length) return { x: 0, y: 0 }
  if (pts.length === 1) return { ...pts[0] }
  const total = pathLength(pts)
  let need = u * total
  for (let i = 1; i < pts.length; i += 1) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (need <= seg || i === pts.length - 1) {
      const t = seg > 0 ? need / seg : 0
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * Math.min(1, Math.max(0, t)),
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * Math.min(1, Math.max(0, t)),
      }
    }
    need -= seg
  }
  return { ...pts[pts.length - 1] }
}

/** Prędkość pościgu; wpływ odczytu gry pozostaje częścią obecnego modelu zawodników. */
export function sprintSpeedMps(player) {
  return maxSpeedMps(player)
}

// Faza 3 planu 3D: layout przestał być bool flagą bez ruchu — to realny skok/wyskok:
// grawitacja ściąga z powrotem do ziemi (z<=0 => wylądowany), wysokość wybicia skalowana
// statem jump. Aktualne wybicie wyznacza pionowy zasięg kontaktu w actionSimulator.
const JUMP_GRAVITY_MPS2 = 9.81

function tickJumpArc(agent, discX, discY, timeToDiscMs, player, rng, discZ = 2, role = 'offense') {
  if (agent.layout) {
    if (!agent.jumping) return agent
    const vz = (agent.vz ?? 0) - JUMP_GRAVITY_MPS2 * DT_SEC
    const z = (agent.z ?? 0) + vz * DT_SEC
    if (z <= 0) return { ...agent, z: 0, vz: 0, jumping: false }
    return { ...agent, z, vz }
  }
  const dist = Math.hypot(discX - agent.x, discY - agent.y)
  const attackHigh = role === 'offense' && playerMatchMods(player).highDiscAttack
  const jumpWindow = attackHigh ? Math.sqrt(2 * jumpHeightM(player) / JUMP_GRAVITY_MPS2)
    * (0.7 + subStat(player, 'offensive', 'cutTiming') / 330) * 1000 : LAYOUT_TIME_MS
  if (dist >= LAYOUT_DIST_M || timeToDiscMs > jumpWindow) return agent
  // Niski dysk nie wymaga pionowego wyskoku: wybicie oddalałoby od niego ręce.
  // Poziomy layout potrzebuje osobnego modelu ułożenia ciała.
  if (discZ <= standingReachM(player) + (agent.z ?? 0)) return agent
  const isReceiver = role === 'offense'
  const chance = aerialContestChance(player, discZ, isReceiver)
  if (rng && rng.float() > chance + 0.12) return agent
  // Jedno źródło prawdy dla wysokości wybicia — ta sama wielkość, którą kontest
  // powietrzny (actionSimulator.js) dolicza do zasięgu.
  const vz0 = Math.sqrt(2 * JUMP_GRAVITY_MPS2 * jumpHeightM(player))
  return { ...agent, layout: true, layoutMs: timeToDiscMs, jumping: true, z: 0, vz: vz0 }
}

// Granice prędkości dysku wg trajektorii — miękki łuk (deep) vs płaski, twardy rzut (standard).
// Trzymane blisko wcześniej wykalibrowanych stałych (6.5/7.8/7.2), żeby "mocny rzut" nie
// był tak szybki, że odbiera zapas czasu, który wcześniej pomagał domykać dystans.
/**
 * Mnożnik prędkości lotu — dysk był ZA WOLNY i to jest najpewniej źródło tego, że
 * separacja nie chroni przed stratą.
 *
 * Zmierzone czasy lotu przy dotychczasowych stałych: 20 m w 1.56 s, 30 m w 2.61 s,
 * 40 m w 3.70 s — czyli płaskie ~9.2 m/s niezależnie od dystansu. Realny backhand czy
 * forehand schodzi z ręki przy 15-25 m/s i przez cały lot trzyma średnio 12-18 m/s,
 * więc obrońca dostawał u nas o ~60% więcej czasu na domknięcie, niż powinien.
 *
 * To spójnie tłumaczy trzy niezależne pomiary: krzywa completion wobec separacji jest
 * płaska (86.9% przy 2-3 m, 91.2% przy 8+ m), bloki nie maleją z separacją, a przewaga
 * odbiorcy przy dysku wynosi 1.3-1.5 m niezależnie od tego, jak wolny był w chwili rzutu.
 * Wyjściowa przewaga po prostu zdąży wyparować w locie.
 */


/** Maks. względny błąd dozowania prędkości u NAJSŁABSZEGO rzucającego (przy stacie 60);
 *  u elity (95+) spada do zera. Patrz komentarz przy flightSpeedMps. */
const TOUCH_ERROR_MAX = 0.3

/** Od jakiego ułamka lotu zawodnik zaczyna czytać realny tor dysku, i kiedy ma go już
 *  w pełni odczytany (patrz interceptForFlight). */
const READ_START_FRAC = 0.15
const READ_FULL_FRAC = 0.55
export const FLIGHT_APPROACH_CALIBRATION = { enabled: true, arrivalLeadSec: 0.15, stopBufferM: 0.08, readDelayScale: 1, interceptJumpClock: true,
  readIntervalMs: 200, readBlendScale: 1 }

/**
 * Umiejętność RZUCAJĄCEGO właściwa dla kształtu tego lotu — używana i do wysokości łuku,
 * i do tego, jak mocno potrafi dysk posłać. To ten sam podział co w
 * throwTechnique.js:techniqueAccuracyBase, tylko po stronie fizyki lotu.
 */
function throwerLoftStat(thrower, trajectory) {
  if (!thrower) return 50
  if (trajectory === 'deep') return subStat(thrower, 'throwing', 'huck')
  if (trajectory === 'overhead') return subStat(thrower, 'throwing', 'hammer')
  return (
    subStat(thrower, 'throwing', 'backhand') * 0.5 + subStat(thrower, 'throwing', 'forehand') * 0.5
  )
}

export function createFlightContext({
  fromX,
  fromY,
  toX,
  toY,
  /** Punkt ZAMIERZONY przez rzucającego (bez chybienia) — do niego biegną zawodnicy. */
  aimX = null,
  aimY = null,
  throwType,
  trajectory,
  /** Technika i strona rzutu — z czego dysk wychodzi (patrz discReleaseHeightM). */
  throwTechnique = null,
  isOpenSide = true,
  /** Pozycje obrony w chwili wypuszczenia — wejście oceny torów (throwShape.js). */
  defenseAgents = null,
  receiverDefenderAgent = null,
  throwPathPoints,
  receiverId,
  defenderId,
  throwerId,
  thrower,
  receiver,
  receiverAgent,
  /**
   * Prędkość lotu WYBRANA przez rzucającego razem z punktem dostarczenia (throwerBrain:
   * chooseDeliveryPoint). Rzut dalej niż odbiorca sam dobiegnie jest opłacony floatem —
   * jeśli wykonanie by tego nie uszanowało, dysk doleciałby twardo w miejsce, w którym
   * odbiorcy jeszcze nie ma, czyli decyzja rzucającego byłaby fikcją.
   */
  chosenFlightSpeedMps = null,
  plannedShape = null,
  /** Potrzebny do błędu dozowania prędkości (patrz flightSpeedMps niżej). */
  rng = null,
  resolution,
  throwMs,
  weather,
}) {
  const throwPath =
    throwPathPoints ??
    [{ x: fromX, y: fromY }, { x: toX, y: toY }]
  const pathLen = pathLength(throwPath)
  const finalPt = throwPath[throwPath.length - 1] ?? { x: toX, y: toY }

  // Separacja jest wynikiem pozycji i ruchu, nie mnożnikiem fizycznej prędkości.
  const defenderSpeedMult = 1
  const defenderReactionDelayMs = 0
  // Receiver w locie biegnie WPROST do finalnego miejsca lądowania dysku (flight.toX/toY),
  // nie goni bieżącej pozycji dysku na ścieżce — pościg za ruchomym punktem matematycznie
  // nigdy nie domyka dystansu. Prosta linia do znanego z góry celu naprawdę się domyka.
  //
  // Moc rzutu (prędkość dysku) zależy od tego, ile czasu potrzebuje TEN odbiorca: gdy ma
  // daleko do celu (duży lead, np. huck) — rzut leci wolniej/miękcej, dając czas na dobieg;
  // gdy odbiorca jest już blisko celu — rzut leci szybko/płasko, bo i tak zdąży. Realny
  // odpowiednik decyzji "mocniej czy słabiej rzucić" w zależności od pozycji odbiorcy.
  // Prędkość dysku: umiejętnością jest TRAFIENIE W ODPOWIEDNIĄ prędkość, nie siła.
  //
  // `idealSpeedMps` (z dystansu i szybkości odbiorcy) to prędkość idealnie dozowana pod
  // tego odbiorcę — czyli perfekcyjny touch. Dobry rzucający realizuje ją blisko co do
  // metra na sekundę; słabszy się od niej odchyla, w OBIE strony: za mocno (odbiorca nie
  // zdąży dobiec) albo za miękko (dysk wisi, obrona ma czas dojść do punktu lądowania).
  //
  // PRÓBOWANE I COFNIĘTE: uzależnienie SUFITU prędkości od mocy rzucającego. Efekt był
  // ODWROTNY do zamierzonego (tmp-thrower-ovr.mjs): throwing 70 dawało 86.0% completion
  // i 83% wygranych, a throwing 95 tylko 81.5% i 58% — bo wolniejszy dysk = dłuższy lot,
  // a na tym zyskuje przede wszystkim ODBIORCA (więcej czasu na dobieg do znanego punktu
  // lądowania). Słaba moc była więc premią. Błąd dozowania jest symetryczny, więc takiej
  // premii nie tworzy — karą jest sam rozrzut.
  const speedRange = speedRangeFor(trajectory)
  let flightSpeedMps = pacedSpeedMps(trajectory, receiverAgent, fromX, fromY)
  if (Number.isFinite(chosenFlightSpeedMps)) {
    flightSpeedMps = Math.min(speedRange.max, Math.max(speedRange.min, chosenFlightSpeedMps))
  }
  if (!Number.isFinite(chosenFlightSpeedMps) &&
    receiverAgent != null &&
    Number.isFinite(receiverAgent.x) &&
    Number.isFinite(receiverAgent.y)
  ) {
    const distToTarget = Math.hypot(finalPt.x - receiverAgent.x, finalPt.y - receiverAgent.y)
    const receiverSpeedMps = Math.max(3.5, maxSpeedMps(receiver))
    const neededSec = Math.max(0.3, (distToTarget / receiverSpeedMps) * 1.15)
    const idealSpeedMps = pathLen / neededSec
    if (Number.isFinite(idealSpeedMps)) {
      const touchStat = subStat(thrower, 'throwing', 'touch') * 0.65 + throwerLoftStat(thrower, trajectory) * 0.35
      const touchFrac = Math.max(0, Math.min(1, (touchStat - 60) / 35))
      const errorSpan = TOUCH_ERROR_MAX * (1 - touchFrac)
      const deviation = rng?.float ? (rng.float() * 2 - 1) * errorSpan : 0
      // Rzucający WYBIERA tempo wewnątrz realnego pasma: leading pass niżej (dysk czeka
      // na odbiorcę w przestrzeni), in-cut wyżej (odbiorca wbiega w dysk, float zbędny).
      // Potrzeba odbiorcy (idealSpeedMps) może jeszcze ZDJĄĆ moc poniżej tego wyboru, ale
      // nie dodaje jej ponad — bo to sufit realnej fizyki, nie preferencja.
      const chosenMps = pacedSpeedMps(trajectory, receiverAgent, fromX, fromY)
      flightSpeedMps = Math.min(
        chosenMps,
        Math.max(speedRange.min, idealSpeedMps * (1 + deviation)),
      )
    }
  }
  // Bezpieczny sufit — actionSimulator.js rezerwuje na fazę lotu stały budżet ticków
  // (MAX_FLIGHT_MS, musi być >= tego sufitu + margines); dłuższy totalFlightMs nie
  // wydłuża budżetu, tylko ucina animację przed realnym końcem lotu (a przy wielu
  // długich rzutach w punkcie potrafi bardzo spowolnić całą symulację).
  // KSZTAŁT LOTU wybrany przez rzucającego — musi być policzony PRZED czasem lotu, bo
  // wyższy łuk to dłuższy lot: dysk przerzucony górą (albo przelot słabego rzucającego)
  // wisi, a wiszący dysk daje obronie czas na zbiegnięcie się. To jest sprzężenie, przez
  // które kontrola wysokości realnie kosztuje.
  const discLoftStat = throwerLoftStat(thrower, trajectory)
  const releaseHeightM = plannedShape?.plan?.startHeightM ?? discReleaseHeightM(thrower, {
    trajectory,
    technique: throwTechnique,
    isOpenSide,
    rng,
  })
  const throwDistanceM = Math.hypot(finalPt.x - fromX, finalPt.y - fromY)
  const basePeakM = plannedShape?.basePeakM ?? discPeakHeightM(trajectory, discLoftStat, {
    distanceM: throwDistanceM,
    releaseHeightM,
  })
  const dxPath = finalPt.x - fromX
  const dyPath = finalPt.y - fromY
  const pathDirLen = Math.hypot(dxPath, dyPath) || 1
  const perpX = -dyPath / pathDirLen
  const perpY = dxPath / pathDirLen
  const baseAmplitudeM = plannedShape?.baseAmplitudeM ?? Math.min(2.2, Math.max(0.4, pathLen * 0.035))
  const baseFlightMs = plannedShape?.baseFlightMs
    ?? Math.max(FLIGHT_TICK_MS * 4, Math.round((pathLen / flightSpeedMps) * 1000))

  // WYBÓR TORU: rzucający porównuje kilka kształtów (płasko/normalnie/górą × prosto/
  // z naturalnym fadem/pod prąd) i bierze ten, który najtrudniej zablokować — patrz
  // throwShape.js. Bez danych o obronie (fastMode, wywołania spoza symulacji) leci
  // kształt domyślny.
  const shape = plannedShape ?? (
    defenseAgents?.length
      ? chooseThrowShape(thrower, {
          trajectory,
          technique: throwTechnique,
          fromX,
          fromY,
          toX: finalPt.x,
          toY: finalPt.y,
          perpX,
          perpY,
          defenders: defenseAgents,
          receiverDefender: receiverDefenderAgent,
          basePeakM,
          baseFlightMs,
          baseAmplitudeM,
          releaseHeightM,
          deliveryHeightM: discDeliveryHeightM(trajectory),
          loftStat: discLoftStat,
          wind: weather,
          rng,
        })
      : defaultThrowShape(thrower, { trajectory, technique: throwTechnique }))
  // WYKONANIE: czy trafił w wybrany kształt (osobno wysokość, osobno krzywizna).
  const arc = executeThrowShape(thrower, {
    arc: shape.arc,
    curve: shape.curve,
    technique: trajectory === 'overhead' ? null : throwTechnique,
    loftStat: discLoftStat,
    rng,
  })
  const peakHeightM = Math.max(releaseHeightM + 0.12, basePeakM * arc.peakMult)
  const turnFadeAmplitudeM = baseAmplitudeM * (CURVE_AMP_MULT[shape.curve] ?? 1) * arc.amplitudeMult
  // Każdy dodatkowy metr łuku to ~9% dłuższy lot (i symetrycznie: płaski rzut dochodzi
  // szybciej), z sufitem, żeby przelot nie zamieniał podania w balon.
  const hangMult = Math.min(1.3, Math.max(0.86, 1 + (peakHeightM - basePeakM) * 0.09))
  const totalFlightMs = Math.min(
    9500,
    Math.max(FLIGHT_TICK_MS * 4, Math.round(baseFlightMs * hangMult)),
  )
  const compensatedX = finalPt.x + (shape.compensation?.dx ?? 0)
  const compensatedY = finalPt.y + (shape.compensation?.dy ?? 0)
  const trajectoryPlan = createDiscTrajectory({ fromX, fromY, toX: compensatedX, toY: compensatedY,
    totalFlightMs, startHeightM: releaseHeightM, peakHeightM,
    endHeightM: discDeliveryHeightM(trajectory), amplitudeM: turnFadeAmplitudeM,
    spinRadSec: 25 + subStat(thrower, 'throwing', 'releaseControl') * 0.4,
    curveSign: shape.curveSign, wind: weather })
  const landingDrift = trajectoryWindOffset(trajectoryPlan, totalFlightMs)
  const landingX = (aimX ?? finalPt.x) + (shape.compensation?.dx ?? 0) + landingDrift.dx
  const landingY = (aimY ?? finalPt.y) + (shape.compensation?.dy ?? 0) + landingDrift.dy
  const trueLandingX = compensatedX + landingDrift.dx
  const trueLandingY = compensatedY + landingDrift.dy

  return {
    throwPathPoints: throwPath,
    totalFlightMs,
    elapsedMs: 0,
    throwMs,
    fromX,
    fromY,
    toX: finalPt.x,
    toY: finalPt.y,
    aimX: aimX ?? finalPt.x,
    aimY: aimY ?? finalPt.y,
    executionResult: resolution,
    compensatedAimX: compensatedX,
    compensatedAimY: compensatedY,
    // Punkt, do którego realnie biegną zawodnicy — z dryfem wiatru (patrz wyżej).
    landingX,
    landingY,
    trueLandingX,
    trueLandingY,
    receiverId,
    defenderId,
    throwerId,
    receiver,
    trajectory,
    throwType,
    /** Z czego dysk wyszedł — wejście bramki kontestu powietrznego (actionSimulator.js). */
    releaseHeightM,
    /** Tor wybrany przez rzucającego i to, jak bardzo go przestrzelił (resolveThrowArc). */
    throwArc: shape.arc,
    throwCurve: shape.curve,
    curveSign: shape.curveSign,
    arcExecutionError: arc.executionError,
    curveExecutionError: arc.curveError,
    /** Najciaśniejsze miejsce wybranego toru i ile rzucający stracił na samym WYBORZE. */
    minLaneGap: shape.minLaneGap ?? null,
    judgementLoss: shape.judgementLoss ?? 0,
    shapeScore: shape.score ?? 0,
    bestShapeScore: shape.bestScore ?? 0,
    resolution: resolution ?? null,
    defenderSpeedMult,
    defenderReactionDelayMs,
    weather,
    windTickBase: Math.round(throwMs / FLIGHT_TICK_MS),
    discLoftStat,
    peakHeightM,
    perpX,
    perpY,
    trajectoryPlan,
    plannedShape,
    pathLenM: pathLen,
    dragPacing: trajectoryPlan.pacing,
  }
}

/** Jeden sampler dla predykcji i wykonania; wykonanie różni się błędem rzutu. */
export function sampleFlightDisc(flight, flightElapsedMs) {
  if (flight.deflection && flightElapsedMs >= flight.deflection.atMs) {
    return sampleDeflection(flight.deflection, flight.trajectoryPlan, flightElapsedMs)
  }
  return sampleContinuedDisc(flight.trajectoryPlan, flightElapsedMs)
}

/**
 * Punkt, do którego zawodnicy biegną w danej chwili lotu.
 *
 * Na starcie to punkt ZAMIERZONY przez rzucającego (tam odbiorca już biegł), ale w miarę
 * lotu widać realny tor dysku i bieg jest korygowany na faktyczne miejsce lądowania.
 * Dzięki temu chybiony rzut kosztuje dokładnie to, co powinien: dystans stracony zanim
 * korekta nastąpi — a nie automatyczną stratę (gdy odbiorca jest ślepy na chybienie) ani
 * zero (gdy od pierwszego ticku biegnie w faktyczne miejsce lądowania).
 */
export function interceptForFlight(flight) {
  const aimX = flight.landingX ?? flight.toX
  const aimY = flight.landingY ?? flight.toY
  const trueX = flight.trueLandingX ?? aimX
  const trueY = flight.trueLandingY ?? aimY
  const total = flight.totalFlightMs || 1
  const t = Math.max(0, Math.min(1, (flight.elapsedMs ?? 0) / total))
  const read = Math.max(0, Math.min(1, (t - READ_START_FRAC) / (READ_FULL_FRAC - READ_START_FRAC)))
  return { x: aimX + (trueX - aimX) * read, y: aimY + (trueY - aimY) * read }
}

const interceptCache = new WeakMap()

export function interceptForAgent(flight, agent, player, role, speed) {
  let cache = interceptCache.get(flight)
  if (!cache) { cache = new Map(); interceptCache.set(flight, cache) }
  const elapsedMs = flight.elapsedMs ?? 0
  const cached = cache.get(agent.id)
  if (cached && cached.deflection === flight.deflection && elapsedMs - cached.readMs < FLIGHT_APPROACH_CALIBRATION.readIntervalMs && cached.target.atMs > elapsedMs) return cached.target
  const reactions = subStat(player, 'mental', 'reactions')
  const vision = subStat(player, role === 'defense' ? 'defensive' : 'offensive', 'discReading') * 0.65
    + subStat(player, 'mental', 'anticipation') * 0.35
  const delayMs = Math.max(80, 350 - reactions * 2.5 + (playerMatchMods(player).reactionDelayDeltaMs ?? 0)) * FLIGHT_APPROACH_CALIBRATION.readDelayScale
  const read = Math.max(0, Math.min(1, (elapsedMs - delayMs) / (Math.max(400, 1200 - vision * 8) * FLIGHT_APPROACH_CALIBRATION.readBlendScale)))
  const plan = flight.plannedShape?.plan
  const intendedAt = ms => {
    const p = sampleContinuedDisc(plan ?? flight.trajectoryPlan, ms / flight.totalFlightMs * (plan?.totalMs ?? flight.totalFlightMs))
    return plan ? p : { ...p, x: p.x + (flight.landingX ?? flight.toX) - (flight.trueLandingX ?? flight.toX),
      y: p.y + (flight.landingY ?? flight.toY) - (flight.trueLandingY ?? flight.toY) }
  }
  const now = sampleFlightDisc(flight, elapsedMs), before = sampleFlightDisc(flight, Math.max(0, elapsedMs - 20))
  const observations = perceivePlayers({ ...agent, player }, [{ ...now, id: 'disc',
    vx: (now.x - before.x) / 0.02, vy: (now.y - before.y) / 0.02,
    vz: (now.z - before.z) / 0.02, deflected: !!flight.deflection }, ...(flight.sightBlockers ?? [])], flight.sightBlockers ?? [], elapsedMs,
    { ...now, lock: true })
  const observation = observations.find(o => o.id === 'disc')
  const knownAt = observation ? intendedAt(observation.observedAtMs) : null
  const knownBefore = observation ? intendedAt(Math.max(0, observation.observedAtMs - 20)) : null
  const sample = ms => {
    const intended = intendedAt(ms)
    if (!observation || !knownAt) return intended
    const horizon = Math.max(0, (ms - observation.observedAtMs) / 1000)
    if (observation.deflected) return { x: observation.rawX + observation.vx * horizon,
      y: observation.rawY + observation.vy * horizon,
      z: Math.max(0, observation.z + observation.vz * horizon - 4.905 * horizon * horizon) }
    // Correct a known plan from an observed error, never sample the future actual flight.
    const confidence = read * Math.max(0.2, observation.visibility)
    const extrapolate = Math.min(0.8, horizon) * vision / 100
    return { x: intended.x + (observation.rawX - knownAt.x + (observation.vx - (knownAt.x - knownBefore.x) / 0.02) * extrapolate) * confidence,
      y: intended.y + (observation.rawY - knownAt.y + (observation.vy - (knownAt.y - knownBefore.y) / 0.02) * extrapolate) * confidence,
      z: Math.max(0, intended.z + (observation.z - knownAt.z + (observation.vz - (knownAt.z - knownBefore.z) / 0.02) * extrapolate) * confidence) }
  }
  const target = selectDiscIntercept({ agent, player, role, speed, elapsedMs,
    totalMs: Math.min(flight.totalFlightMs + 12000, Math.max(flight.totalFlightMs + 3000, elapsedMs + 3000)), sample,
    blockers: observations.filter(o => o.id !== 'disc') })
  target.hasObservedDeflection = !!observation?.deflected
  if (agent.id === flight.receiverId || agent.id === flight.recoveryReceiverId) {
    const evidence = { elapsedMs, playerId: agent.id, observedAtMs: observation?.observedAtMs ?? null,
      actualReceiver: { x: agent.x, y: agent.y, z: agent.z ?? 0, vx: agent.vx ?? 0, vy: agent.vy ?? 0 },
      actualDisc: { x: now.x, y: now.y, z: now.z },
      observationAgeMs: observation?.observationAgeMs ?? null, visibility: observation?.visibility ?? 0,
      targetX: target.x, targetY: target.y, reachable: target.reachable, legal: target.legal,
      detourSec: target.detourSec, avoidedId: target.avoidedId,
      predictedAtMs: target.atMs, lateness: target.lateness }
    flight.receiverReads ??= []
    if (flight.receiverReads.length < 64) flight.receiverReads.push(evidence)
    else flight.receiverReads[63] = evidence
  }
  cache.set(agent.id, { readMs: elapsedMs, target, deflection: flight.deflection })
  return target
}

export function tickFlightContestAgent(agent, intercept, player, role, discSample, rng, speedMult = 1, flight = null) {
  if (agent.diving) {
    const vz = (agent.vz ?? 0) - 9.81 * DT_SEC, z = Math.max(0, (agent.z ?? 0) + vz * DT_SEC)
    return { ...agent, x: agent.x + (agent.vx ?? 0) * DT_SEC, y: agent.y + (agent.vy ?? 0) * DT_SEC,
      z, vz, vx: (agent.vx ?? 0) * (z > 0 ? 1 : 0.8), vy: (agent.vy ?? 0) * (z > 0 ? 1 : 0.8),
      diving: z > 0, jumping: z > 0 }
  }
  const speed = sprintSpeedMps(player, role) * speedMult
  const target = flight ? interceptForAgent(flight, agent, player, role, speed) : intercept
  const remainingSec = Math.max(0.08, ((target.atMs ?? flight?.elapsedMs ?? 0) - (flight?.elapsedMs ?? 0)) / 1000 - FLIGHT_APPROACH_CALIBRATION.arrivalLeadSec)
  const distanceToTarget = Math.hypot(target.x - agent.x, target.y - agent.y)
  const approachSpeed = target.reachable && ARRIVAL_CALIBRATION.kinematics && FLIGHT_APPROACH_CALIBRATION.enabled
    ? arrivalSpeed(agent, target, player, speed, remainingSec + FLIGHT_APPROACH_CALIBRATION.arrivalLeadSec,
      FLIGHT_APPROACH_CALIBRATION.arrivalLeadSec, FLIGHT_APPROACH_CALIBRATION.stopBufferM)
    : target.reachable && FLIGHT_APPROACH_CALIBRATION.enabled
    ? Math.min(speed, Math.max(0, distanceToTarget - FLIGHT_APPROACH_CALIBRATION.stopBufferM) / remainingSec) : speed
  const movementTarget = bodyAwareTarget(agent, target, flight?.sightBlockers, approachSpeed)
  if (flight && movementTarget.avoidedId != null && (agent.id === flight.receiverId || agent.id === flight.recoveryReceiverId)) {
    flight.bodyAvoidanceTicks = (flight.bodyAvoidanceTicks ?? 0) + 1
    flight.bodyAvoidance ??= []
    const last = flight.bodyAvoidance.at(-1)
    if (flight.bodyAvoidance.length < 64 && (!last || flight.elapsedMs - last.atMs >= 200)) {
      flight.bodyAvoidance.push({ atMs: flight.elapsedMs, playerId: agent.id, avoidedId: movementTarget.avoidedId,
        x: agent.x, y: agent.y, plannedX: target.x, plannedY: target.y,
        movementX: movementTarget.x, movementY: movementTarget.y, requestedSpeed: movementTarget.speed })
    }
  }
  let next = { ...agent, ...integrateAgentMotion(agent, movementTarget.x, movementTarget.y, speed, DT_SEC, true, role, movementTarget.speed) }
  const dist = Math.hypot(discSample.x - next.x, discSample.y - next.y)
  const diveReach = playerBody(player).heightM * 0.65 + playerBody(player).armSpanM * 0.5
  const movingToward = (discSample.x - next.x) * next.vx + (discSample.y - next.y) * next.vy > 1
  const occupied = (flight?.sightBlockers ?? []).some(a => a.id !== agent.id
    && Math.hypot(a.x - discSample.x, a.y - discSample.y) < 1)
  if (!agent.layout && !occupied && movingToward && discSample.z < 1.35 && discSample.z > 0.15
    && dist > 1.15 && dist < diveReach && Math.hypot(next.vx, next.vy) > 2.5
    && (target.atMs == null || target.atMs - (flight?.elapsedMs ?? 0) < 320)) {
    const desire = Math.min(0.95, 0.55 * (playerMatchMods(player).layoutAttemptMult ?? 1))
    if (!rng || rng.float() < desire) next = { ...next, layout: true, diving: true,
      jumping: true, z: 0.15, vz: 1.8, diveHeading: Math.atan2(next.vy, next.vx) }
  }
  if (next.diving) return next
  const timeToContact = FLIGHT_APPROACH_CALIBRATION.interceptJumpClock && target.atMs != null && flight
    ? Math.max(0, target.atMs - flight.elapsedMs) : discSample.timeToDisc
  next = tickJumpArc(next, discSample.x, discSample.y, timeToContact, player, rng, discSample.z, role)
  return next
}

export function tickOffenseAgentDuringFlight(agent, ctx) {
  const {
    discSample,
    throwerId,
    forceSide,
    possessionTeam,
    flight,
    rng,
    dtSec,
    /** Przewidywany punkt LĄDOWANIA dysku — wokół niego atak się przestawia. */
    anchor = null,
  } = ctx
  if (agent.isThrower || agent.id === throwerId) {
    return {
      ...agent,
      ...integrateAgentMotion(agent, flight.fromX, flight.fromY, 2.5, dtSec, true),
    }
  }
  if (agent.id === flight.receiverId) {
    return agent
  }
  // Atak przestawia się względem miejsca, gdzie dysk WYLĄDUJE, nie gdzie akurat leci.
  // Wcześniej celem był `discSample`, czyli dysk w locie — zawodnik reorganizował się
  // wokół punktu, który w chwili chwytu jest już nieaktualny, i po złapaniu struktura
  // była rozjechana. Realni zawodnicy przestawiają stack, PATRZĄC na lecący dysk, tak
  // żeby w momencie chwytu ustawienie było już gotowe. Symetryczne do antycypacji
  // obrony (spaceAnchor w actionSimulator.js).
  // UWAGA: computeDynamicOffenseTarget kotwiczy strukturę na `throwerPos`, a `disc` bierze
  // tylko jako fallback (sprawdzone: ten sam cel dla dysku na x=40, 60 i 80). Sam podmiana
  // `disc` nic więc nie dawała — trzeba podmienić KOTWICĘ. W locie następnym rozgrywającym
  // będzie odbiorca, stojący w punkcie lądowania, i to wokół niego atak ma się ustawiać.
  const reorgAnchor = anchor ?? { x: discSample.x, y: discSample.y }
  const pref = computeDynamicOffenseTarget({
    x: agent.x,
    y: agent.y,
    disc: reorgAnchor,
    throwerId,
    playerId: agent.id,
    throwerPos: reorgAnchor,
    forceSide,
    possessionTeam,
    inThrowLane: false,
    rng,
    stackIndex: agent.stackIndex,
    isDump: agent.isDump,
  })
  const spaced = spacingAdjustedTarget(agent, pref.x, pref.y, ctx.teammates)
  const speed = waitingHoldSpeedMps(
    agent.player ?? agent,
    Math.hypot(spaced.x - agent.x, spaced.y - agent.y),
  )
  return { ...agent, ...integrateAgentMotion(agent, spaced.x, spaced.y, speed, dtSec, true) }
}

export function discSnapshotForFlight(flight, flightElapsedMs, attackSign, throwerAgent) {
  if (flightElapsedMs <= 0 && throwerAgent) {
    return discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
  }
  const sample = sampleFlightDisc(flight, flightElapsedMs)
  return discPositionInFlight(sample.x, sample.y, sample.z ?? 0)
}

export function flightComplete(flight) {
  return flight.elapsedMs > flight.totalFlightMs + 12000 || (flight.elapsedMs > flight.totalFlightMs
    && sampleFlightDisc(flight, flight.elapsedMs - FLIGHT_TICK_MS).z <= 0)
}

/** Zachowana kompatybilność wywołań: wstępny wynik nie może przestawiać graczy. */
export function applyFlightResolutionToAgents(flight, offenseAgents, defenseAgents) {
  void flight
  return { offenseAgents, defenseAgents }
}

export function finalDiscAfterFlight(flight, discSample, offenseAgents, attackSign) {
  const res = flight.resolution
  if (res?.success !== false) {
    const recv = offenseAgents.find((a) => a.id === flight.receiverId)
    if (recv) return discPositionHeld(recv.x, recv.y, attackSign)
  }
  if (res && !res.success) {
    return { state: DISC_STATE.ON_GROUND, x: discSample.x, y: discSample.y, z: 0 }
  }
  return discPositionInFlight(discSample.x, discSample.y, discSample.z ?? 0)
}
