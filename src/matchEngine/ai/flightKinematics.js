import { pacedSpeedMps, speedRangeFor } from './flightSpeed.js'
import { buildThrowPathPoints } from '../fieldViz.js'
import { DISC_STATE, discPositionHeld, discPositionInFlight } from '../discState.js'
import { integrateAgentMotion, waitingHoldSpeedMps } from './playerMovement.js'
import { computeDynamicOffenseTarget, spacingAdjustedTarget } from './offenseReorganization.js'
import {
  aerialContestChance,
  discPeakHeightM,
  maxSpeedMps,
  subStat,
} from './statFormulas.js'
import { windFlightOffset } from '../wind.js'
import {
  integrateDiscFlight3D,
  sampleDiscFlight3D,
  isDiscFlight3DValid,
  solveDragPacing,
  sampleDragPaceU,
} from './discPhysics.js'

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

/** Awaryjny łuk kosmetyczny (sinus) — używany tylko gdy integracja fizyczna (discPhysics.js)
 * da niesensowny wynik (NaN/niestabilność); patrz flight3DValid w createFlightContext. */
function discHeightAt(u, trajectory, jumpStat = 50) {
  const peak = discPeakHeightM(trajectory, jumpStat)
  return peak * Math.sin(Math.PI * Math.min(1, Math.max(0, u)))
}

/**
 * Prędkość dobiegu do dysku w fazie lotu.
 *
 * Po stronie OBRONY to właśnie tutaj rozstrzyga się kontest geometryczny (kto jest
 * bliżej dysku w momencie chwytu — patrz computeGeometricResolution w actionSimulator.js),
 * więc umiejętności obronne muszą tu realnie ważyć. Wcześniej bonus wynosił
 * `blocking * 0.004`, czyli 0.28 m/s przy 70 i 0.38 m/s przy 95 — 0.1 m/s różnicy na
 * bazie ~7 m/s, praktycznie zero. Efekt: wszyscy obrońcy gonili dysk tak samo i jakość
 * obrony nie wpływała na wynik rzutu (zmierzone: OVR obrony 70 -> 95 zmieniało
 * completion o ~0.6 pp, w granicach szumu).
 * Teraz mnożnik zależy od czytania gry i zdolności do przechwytu — analogicznie do
 * pościgu w defenderBrain.js: lepszy obrońca wcześniej rozpoznaje lot i biegnie
 * krótszą drogą. 70 -> ~0.92x, 95 -> ~1.07x realnej prędkości.
 */
export function sprintSpeedMps(player, role) {
  const base = maxSpeedMps(player)
  if (role === 'defense') {
    const readSkill =
      subStat(player, 'defensive', 'blocking') * 0.5 +
      subStat(player, 'defensive', 'defensiveCutterMovement') * 0.3 +
      subStat(player, 'mental', 'reactions') * 0.2
    return base * (0.50 + (readSkill / 100) * 0.6)
  }
  return base * 0.96 + subStat(player, 'offensive', 'catching') * 0.003
}

// Faza 3 planu 3D: layout przestał być bool flagą bez ruchu — to realny skok/wyskok:
// grawitacja ściąga z powrotem do ziemi (z<=0 => wylądowany), wysokość wybicia skalowana
// statem jump. Wciąż tylko wizualne/pozycyjne (dane wejściowe do resolveThrow nie
// zależą od tego) — Faza 4 dopiero użyje tej realnej wysokości do realnego kontestu.
const JUMP_GRAVITY_MPS2 = 9.81
const JUMP_PEAK_BASE_M = 0.3
const JUMP_PEAK_SCALE_M = 0.85

function tickJumpArc(agent, discX, discY, timeToDiscMs, player, rng, discZ = 2) {
  if (agent.layout) {
    if (!agent.jumping) return agent
    const vz = (agent.vz ?? 0) - JUMP_GRAVITY_MPS2 * DT_SEC
    const z = (agent.z ?? 0) + vz * DT_SEC
    if (z <= 0) return { ...agent, z: 0, vz: 0, jumping: false }
    return { ...agent, z, vz }
  }
  const dist = Math.hypot(discX - agent.x, discY - agent.y)
  if (dist >= LAYOUT_DIST_M || timeToDiscMs > LAYOUT_TIME_MS) return agent
  const isReceiver = agent.id === player?.id
  const chance = aerialContestChance(player, discZ, isReceiver)
  if (rng && rng.float() > chance + 0.12) return agent
  const jumpStat = subStat(player, 'physical', 'jump')
  const peakJumpM = JUMP_PEAK_BASE_M + (jumpStat / 100) * JUMP_PEAK_SCALE_M
  const vz0 = Math.sqrt(2 * JUMP_GRAVITY_MPS2 * peakJumpM)
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
  separationMargin = null,
  /** Potrzebny do błędu dozowania prędkości (patrz flightSpeedMps niżej). */
  rng = null,
  resolution,
  throwMs,
  weather,
}) {
  const throwPath =
    throwPathPoints ??
    buildThrowPathPoints(fromX, fromY, toX, toY, trajectory, throwType)
  const pathLen = pathLength(throwPath)
  const finalPt = throwPath[throwPath.length - 1] ?? { x: toX, y: toY }

  // Separacja (resolveSeparation) to abstrakcyjna ocena statystyk (receiver vs defender),
  // NIEZWIĄZANA z realną odległością na boisku — a obrońca w locie gonił dysk tą samą
  // prostą ścieżką i tą samą prędkością co receiver, więc realny dystans między nimi
  // (nawet przy "open") kurczył się do <1m niezależnie od tego, jak dobra była separacja
  // (obrońca "na papierze" pokonany i tak dobiegał na czas). Mnożnik prędkości obrońcy
  // w pościgu odzwierciedla margines separacji: dobrze pokonany obrońca realnie zostaje
  // w tyle, a nie tylko na etykietce.
  // Zmierzony rozkład marginesu (resolveSeparation): min -16, mediana 5.7, p90 17.7,
  // max 28. "open" zaczyna się od marginesu 14 — czyli tylko górne ~15% rozkładu. Sam
  // łagodny mnożnik (0.018/margines) prawie nie ruszał wyniku, bo przy długim locie
  // (hucki 5-9s) nawet 30% wolniejszy obrońca i tak doganiał. Prędkość skaluje się teraz
  // silniej i schodzi niżej (do 0.42x) — realnie pokonany obrońca ZOSTAJE w tyle przez
  // cały lot, nie tylko na starcie.
  const defenderSpeedMult =
    separationMargin == null
      ? 1
      : Math.min(1.18, Math.max(0.42, 1 - separationMargin * 0.03))
  // Opóźnienie reakcji na wypuszczony dysk — dodatkowy, krótszy efekt na starcie lotu
  // (dominuje przy krótkich/średnich rzutach, gdzie mnożnik prędkości ma mniej czasu,
  // żeby zadziałać).
  const defenderReactionDelayMs =
    separationMargin == null ? 0 : Math.min(700, Math.max(0, separationMargin * 30))

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
      const touchStat = throwerLoftStat(thrower, trajectory)
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
  const totalFlightMs = Math.min(
    9500,
    Math.max(FLIGHT_TICK_MS * 4, Math.round((pathLen / flightSpeedMps) * 1000)),
  )
  // Apex łuku wyznacza RZUCAJĄCY i rodzaj rzutu — nie skoczność odbiorcy. Wcześniej było
  // tu subStat(receiver,'physical','jump'), czyli wysokość lotu dysku zależała od tego,
  // jak wysoko skacze łapiący — fizyczny nonsens (skoczność odbiorcy nie zmienia toru
  // lecącego dysku). Skoczność odbiorcy ma sens tam, gdzie zawsze była potrzebna: czy
  // DOSIĘGNIE wysoko lecącego dysku (tickJumpArc / aerialContestChance).
  // REALNY punkt lądowania = koniec ścieżki + dryf wiatru narosły przez cały lot.
  // sampleFlightDisc dokłada windFlightOffset do pozycji dysku, ale gonieni przez agentów
  // byli dotąd `toX/toY` — punkt BEZ dryfu. Przy silnym wietrze (19.5 mph → ~4.8 m dryfu
  // na końcu lotu) odbiorca i obrońca biegli więc tam, gdzie dysk nigdy nie docierał:
  // mediana odległości odbiorcy od dysku rosła z 0.87 m do 2.75 m, a 83-93% rzutów
  // kończyło lot poza zasięgiem chwytu. Przy abstrakcyjnym resolverze było to niewidoczne
  // (o wyniku decydował rzut kością, wiatr miał osobne accuracyDelta/dropChanceBonus),
  // ale geometrycznie oznaczało mecze z completion ~10%.
  // Realni zawodnicy czytają wiatr i biegną tam, gdzie dysk faktycznie doleci.
  // Zawodnicy biegną do punktu ZAMIERZONEGO (+ dryf wiatru, bo wiatr się czyta), a NIE
  // do punktu, w który dysk realnie poleciał po chybieniu rzucającego. Inaczej chybienie
  // nic nie kosztuje: odbiorca biegnie dokładnie tam, gdzie wylądował źle rzucony dysk
  // (zmierzone — `throwing` 70 vs 95 dawało identyczne completion, mimo że chybienie
  // wynosiło odpowiednio 2.40 m i 1.00 m). Błąd rzucającego jest z definicji nieznany
  // w chwili wypuszczenia; wiatr — przeciwnie — jest jawny i przewidywalny.
  const landingDrift = windFlightOffset(weather, 1)
  // Punkt ZAMIERZONY (tam biegnie odbiorca w pierwszej fazie lotu) i REALNY (tam dysk
  // faktycznie ląduje po chybieniu). Odbiorca w locie płynnie przechodzi z jednego na
  // drugi — patrz interceptForFlight: widzi lecący dysk i koryguje bieg, więc źle rzucony
  // dysk kosztuje GRUNT STRACONY do momentu korekty, a nie automatyczną stratę.
  const landingX = (aimX ?? finalPt.x) + landingDrift.dx
  const landingY = (aimY ?? finalPt.y) + landingDrift.dy
  const trueLandingX = finalPt.x + landingDrift.dx
  const trueLandingY = finalPt.y + landingDrift.dy

  const discLoftStat = throwerLoftStat(thrower, trajectory)

  // Faza 1 planu 3D: realna integracja wysokości (grawitacja+uniesienie) + ograniczony
  // boczny dryf turn/fade, policzone raz tutaj i próbkowane co tick w sampleFlightDisc —
  // ten sam wzorzec co throwPathPoints/samplePathAt. Celowo NIE zmienia totalFlightMs ani
  // punktu lądowania (toX/toY) — tylko kształt toru w międzyczasie. Boczny dryf jest
  // zerowany na obu końcach lotu i ograniczony do ułamka dystansu rzutu, więc nie może
  // realnie przesunąć skalibrowanego punktu złapania.
  const peakHeightM = discPeakHeightM(trajectory, discLoftStat)
  const dxPath = finalPt.x - fromX
  const dyPath = finalPt.y - fromY
  const pathDirLen = Math.hypot(dxPath, dyPath) || 1
  const perpX = -dyPath / pathDirLen
  const perpY = dxPath / pathDirLen
  const turnFadeAmplitudeM = Math.min(2.2, Math.max(0.4, pathLen * 0.035))
  const flight3DSamples = integrateDiscFlight3D({
    totalFlightMs,
    peakHeightM,
    turnFadeAmplitudeM,
    turnFadeSign: 1,
  })
  const flight3DValid = isDiscFlight3DValid(flight3DSamples)

  // Faza 2 planu 3D: realna całka ruchu pod oporem powietrza dla tempa wzdłuż ścieżki,
  // zamiast dowolnego wykładnika ease-out — patrz discPhysics.js:solveDragPacing.
  const dragPacing = solveDragPacing({ totalFlightMs, pathLenM: pathLen })

  return {
    throwPathPoints: throwPath,
    totalFlightMs,
    elapsedMs: 0,
    throwMs,
    fromX,
    fromY,
    toX: finalPt.x,
    toY: finalPt.y,
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
    resolution: resolution ?? null,
    defenderSpeedMult,
    defenderReactionDelayMs,
    weather,
    windTickBase: Math.round(throwMs / FLIGHT_TICK_MS),
    discLoftStat,
    peakHeightM,
    perpX,
    perpY,
    flight3DSamples,
    flight3DValid,
    pathLenM: pathLen,
    dragPacing,
  }
}

/**
 * Dysk zwalnia w locie (opór powietrza) — szybki tuż po wypuszczeniu, wolniejszy
 * przy końcu (unosi się/opada do złapania), zamiast stałej prędkości przez cały lot.
 * u(t) = 1-(1-t/T)^DISC_DECEL_POWER: pochodna (prędkość) maleje monotonicznie z
 * DISC_DECEL_POWER/T na starcie do 0 przy starcie dysku — łagodny ease-out.
 * Całkowity czas lotu (i średnia prędkość) niezmienione — sam kształt krzywej.
 * AWARYJNY fallback gdy solveDragPacing (Faza 2, discPhysics.js) nie zbiegnie —
 * patrz flight.dragPacing poniżej, które w normalnych warunkach zastępuje tę krzywą
 * realną całką ruchu pod oporem powietrza.
 */
const DISC_DECEL_POWER = 1.8

export function sampleFlightDisc(flight, flightElapsedMs) {
  const ms = Math.min(flight.totalFlightMs, Math.max(0, flightElapsedMs))
  const tFrac = flight.totalFlightMs > 0 ? ms / flight.totalFlightMs : 1
  const pacedU = sampleDragPaceU(flight.dragPacing, ms / 1000, flight.totalFlightMs / 1000, flight.pathLenM)
  const u = pacedU != null ? pacedU : 1 - (1 - tFrac) ** DISC_DECEL_POWER
  const wind = windFlightOffset(flight.weather, u)
  const base = samplePathAt(flight.throwPathPoints, u)
  let discZ
  let lateral = 0
  if (flight.flight3DValid && flight.flight3DSamples) {
    // Fizyka próbkowana po REALNYM czasie lotu (ms), nie po u — u zawiera krzywą
    // zwalniania dysku (DISC_DECEL_POWER) dla postępu x,y, a wysokość rządzi się
    // rzeczywistym czasem od wypuszczenia, niezależnie od tego kształtu.
    const sample3D = sampleDiscFlight3D(flight.flight3DSamples, ms)
    discZ = sample3D.z
    lateral = sample3D.lateral
  } else {
    discZ = discHeightAt(u, flight.trajectory, flight.discLoftStat)
  }
  const discX = base.x + wind.dx + (flight.perpX ?? 0) * lateral
  const discY = base.y + wind.dy + (flight.perpY ?? 0) * lateral
  return { x: discX, y: discY, z: discZ, u, ms, timeToDisc: Math.max(0, flight.totalFlightMs - ms) }
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

export function tickFlightContestAgent(agent, intercept, player, role, discSample, rng, speedMult = 1) {
  const speed = sprintSpeedMps(player, role) * speedMult
  let next = { ...agent, ...integrateAgentMotion(agent, intercept.x, intercept.y, speed, DT_SEC, true, role) }
  next = tickJumpArc(next, discSample.x, discSample.y, discSample.timeToDisc, player, rng, discSample.z)
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
  return flight.elapsedMs >= flight.totalFlightMs
}

export function applyFlightResolutionToAgents(flight, offenseAgents, defenseAgents, discSample) {
  const res = flight.resolution
  if (!res || res.success !== false) return { offenseAgents, defenseAgents }
  let off = offenseAgents
  let def = defenseAgents
  if (res.isBlock && discSample.u > 0.82) {
    def = def.map((a) =>
      a.player?.id === flight.defenderId || a.id === flight.defenderId
        ? { ...a, x: discSample.x, y: discSample.y, layout: true }
        : a,
    )
  }
  if (!res.success && discSample.u > 0.9) {
    off = off.map((a) =>
      a.id === flight.receiverId ? { ...a, x: a.x - 0.8, y: a.y + 0.5 } : a,
    )
  }
  return { offenseAgents: off, defenseAgents: def }
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
