/**
 * OCENA I WYBÓR TORU RZUTU.
 *
 * Rzucający nie ma jednego toru do celu — ma ich kilka i wybiera ten, który najtrudniej
 * zablokować: płasko i twardo, gdy korytarz jest czysty; górą, gdy ktoś stoi na drodze;
 * z krzywizną, żeby dysk doszedł do odbiorcy od strony, z której obrońca go nie dosięgnie
 * (klasyczny huck lecący na otwartą stronę i fadeujący na zamkniętą).
 *
 * Podział jest ten sam, co wszędzie indziej w silniku: osobno DECYZJA (czy widzi dobry
 * tor — vision/decisionMaking), osobno WYKONANIE (czy potrafi go trafić — stat techniki,
 * patrz executeThrowShape w statFormulas.js). Słaby rzucający myli się w obu miejscach i
 * są to dwa różne błędy: zły wybór toru i nietrafiony dobry wybór.
 */
import { DOMINANT_HAND, getDominantHand } from '../../models/playerProfile.js'
import { discHeightAtSec } from './discPhysics.js'
import {
  THROW_ARC,
  horizontalReachM,
  maxAerialReachM,
  subStat,
} from './statFormulas.js'

export const THROW_CURVE = {
  /** Bez krzywizny — dysk idzie prosto, najłatwiej go wydozować. */
  STRAIGHT: 'straight',
  /** Naturalny fade techniki (backhand i forehand zakrzywiają się w PRZECIWNE strony). */
  NATURAL: 'natural',
  /** Pod prąd naturalnej krzywizny (inside-out) — najtrudniejszy, ale wchodzi tam,
   *  gdzie naturalny nie sięga. */
  REVERSE: 'reverse',
}

/**
 * Kierunek naturalnego fade'u względem wektora prostopadłego do rzutu
 * (perp = (-dy, dx)/len — ta sama konwencja co w flightKinematics.js).
 *
 * Istotne jest nie to, którą stronę nazwiemy dodatnią, tylko że BACKHAND I FOREHAND
 * ZAKRZYWIAJĄ SIĘ PRZECIWNIE, a leworęczny ma to lustrzanie. Do tej pory silnik miał
 * `turnFadeSign: 1` na sztywno, więc każdy dysk — niezależnie od chwytu i ręki — uciekał
 * w tę samą stronę.
 */
export function naturalCurveSign(technique, thrower) {
  const lefty = getDominantHand(thrower) === DOMINANT_HAND.LEFT
  const backhand = technique !== 'forehand'
  const sign = backhand ? 1 : -1
  return lefty ? -sign : sign
}

const ARC_MULT = {
  [THROW_ARC.FLAT]: 0.72,
  [THROW_ARC.NORMAL]: 1,
  [THROW_ARC.OVER]: 1.75,
}
const CURVE_AMP_MULT = {
  [THROW_CURVE.STRAIGHT]: 0.25,
  [THROW_CURVE.NATURAL]: 1,
  [THROW_CURVE.REVERSE]: 0.85,
}

/**
 * Wagi oceny. Wszystkie w tych samych „punktach toru", żeby dało się je porównywać:
 * prześwit jest zyskiem, zawis i trudność wykonania kosztem.
 */
export const SHAPE_CALIBRATION = {
  /** Ile punktów kosztuje obrońca mogący dotknąć dysku w torze (kwadratowo od bliskości). */
  laneClearanceWeight: 26,
  /** Od jakiej znormalizowanej odległości od koperty zasięgu obrońca przestaje być groźny.
   *  1.0 = dokładnie na granicy jego zasięgu, więc margines bezpieczeństwa to nadwyżka. */
  laneSafeMargin: 1.9,
  /** Premia za dolot od strony przeciwnej niż obrońca odbiorcy (skalowana amplitudą). */
  arrivalSideWeight: 9,
  /** Kara za każdą sekundę zawisu ponad lot płaski — wiszący dysk ściąga help D. */
  hangCostPerSec: 7,
  /** Kara za kształt spoza umiejętności rzucającego (0-1 trudności × ta waga). */
  difficultyWeight: 22,
  /** Rozrzut OCENY u rzucającego bez czytania gry (punkty toru) — maleje z awareness. */
  judgementNoise: 14,
}

/** Ile z lotu w ogóle podlega blokowi w torze — końcówki to rzucający i odbiorca. */
const LANE_U_FROM = 0.18
const LANE_U_TO = 0.82
const LANE_SAMPLES = 9
/** Zanim minie tyle sekund od wypuszczenia, obrońca w torze praktycznie nie zdąży
 *  zareagować; pełne zagrożenie osiąga po kolejnej sekundzie. */
const LANE_REACTION_SEC = 0.35
const LANE_FULL_REACT_SEC = 1.0

/**
 * Trudność wykonania kształtu dla TEGO rzucającego (0 = jego chleb powszedni, 1 = rzut,
 * którego nie ma w repertuarze).
 */
function shapeDifficulty(arc, curve, loftStat) {
  const control = Math.max(0, Math.min(1, loftStat / 100))
  let raw = 0
  if (arc === THROW_ARC.OVER) raw += 0.45
  else if (arc === THROW_ARC.FLAT) raw += 0.1
  if (curve === THROW_CURVE.REVERSE) raw += 0.5
  else if (curve === THROW_CURVE.STRAIGHT) raw += 0.15
  // Ten sam kształt jest banałem dla elity i loterią dla przeciętnego rzucającego.
  return raw * (1 - control * 0.75)
}

function candidateShapes(trajectory) {
  if (trajectory === 'overhead') {
    // Hammer JEST rzutem górą — wybór dotyczy tylko tego, jak mocno go zakrzywić.
    return [
      { arc: THROW_ARC.OVER, curve: THROW_CURVE.NATURAL },
      { arc: THROW_ARC.OVER, curve: THROW_CURVE.STRAIGHT },
    ]
  }
  if (trajectory === 'lateral') {
    // Dump/swing: płasko, ewentualnie z lekkim łukiem wokół marka. Nigdy górą.
    return [
      { arc: THROW_ARC.FLAT, curve: THROW_CURVE.STRAIGHT },
      { arc: THROW_ARC.FLAT, curve: THROW_CURVE.NATURAL },
      { arc: THROW_ARC.NORMAL, curve: THROW_CURVE.NATURAL },
    ]
  }
  const arcs =
    trajectory === 'deep'
      ? [THROW_ARC.NORMAL, THROW_ARC.OVER]
      : [THROW_ARC.FLAT, THROW_ARC.NORMAL, THROW_ARC.OVER]
  const out = []
  for (const arc of arcs) {
    for (const curve of [THROW_CURVE.STRAIGHT, THROW_CURVE.NATURAL, THROW_CURVE.REVERSE]) {
      out.push({ arc, curve })
    }
  }
  return out
}

/**
 * Jak blisko dysku znajdzie się obrońca na torze — znormalizowane jego KOPERTĄ ZASIĘGU
 * (ta sama elipsoida, którą rozstrzygamy kontest: w pionie wyskok, w bok ramię).
 * Wynik < 1 znaczy „może go dotknąć", 2 znaczy „przechodzi dwa zasięgi obok".
 */
function normalizedLaneGap(defender, discX, discY, discZ) {
  const horiz = Math.hypot(discX - defender.x, discY - defender.y)
  // Dokładnie ta sama elipsoida, co przy sięgnięciu po dysk w kontestcie
  // (trackAerialTake): pion mierzony od ZIEMI do szczytu wyskoku, bok — ramieniem.
  // Zasięgi są policzone RAZ na obrońcę (patrz reachAnnotatedDefenders) — liczenie ich
  // w tej pętli oznaczało odpytywanie statów z morale i traitami 567 razy na kandydata
  // i potroiło czas symulacji meczu.
  const ex = horiz / defender.reachOutM
  const ez = Math.max(0, discZ) / defender.reachUpM
  return Math.sqrt(ex * ex + ez * ez)
}

/**
 * Zasięgi obrońców policzone raz — wejście dla wszystkich kandydatów na tor.
 * Idempotentne: obrońca już opisany zasięgiem przechodzi bez ponownego liczenia, więc
 * scoreThrowShape można wołać i osobno (harness), i przez chooseThrowShape.
 */
function reachAnnotatedDefenders(defenders) {
  return defenders.map((d) => {
    if (Number.isFinite(d.reachOutM) && Number.isFinite(d.reachUpM)) return d
    const player = d.player ?? d
    return {
      x: d.x ?? 0,
      y: d.y ?? 0,
      reachOutM: Math.max(0.5, horizontalReachM(player)),
      reachUpM: Math.max(0.5, maxAerialReachM(player)),
    }
  })
}

/**
 * Ocena JEDNEGO kandydata na tor — czysto geometryczna, bez udziału statów. To jest
 * „obiektywna" jakość toru; staty wchodzą dopiero przy wyborze (szum oceny) i przy
 * wykonaniu.
 */
export function scoreThrowShape(candidate, ctx) {
  const {
    fromX,
    fromY,
    toX,
    toY,
    perpX,
    perpY,
    defenders = [],
    receiverDefender = null,
    basePeakM,
    baseFlightMs,
    baseAmplitudeM,
    releaseHeightM,
    deliveryHeightM,
    loftStat,
  } = ctx
  const C = SHAPE_CALIBRATION
  const defs = reachAnnotatedDefenders(defenders)
  const peakM = Math.max(releaseHeightM + 0.12, basePeakM * (ARC_MULT[candidate.arc] ?? 1))
  // To samo sprzężenie co w locie: wyższy łuk = dłuższy lot.
  const hangMult = Math.min(1.3, Math.max(0.86, 1 + (peakM - basePeakM) * 0.09))
  const flightSec = (baseFlightMs * hangMult) / 1000
  const amplitudeM = baseAmplitudeM * (CURVE_AMP_MULT[candidate.curve] ?? 1)
  const sign = candidate.curveSign ?? 1

  let laneCost = 0
  let worstGap = Infinity
  for (let i = 0; i < LANE_SAMPLES; i += 1) {
    const u = LANE_U_FROM + ((LANE_U_TO - LANE_U_FROM) * i) / (LANE_SAMPLES - 1)
    const lateral = sign * amplitudeM * Math.sin(2 * Math.PI * u)
    const x = fromX + (toX - fromX) * u + perpX * lateral
    const y = fromY + (toY - fromY) * u + perpY * lateral
    const z = discHeightAtSec(u * flightSec, {
      totalSec: flightSec,
      startHeightM: releaseHeightM,
      peakHeightM: peakM,
      endHeightM: deliveryHeightM,
    })
    // Sam prześwit nie wystarczy: obrońca musi jeszcze ZDĄŻYĆ. Dysk posłany płasko i
    // twardo mija go, zanim ten zareaguje, a ten sam korytarz przy wiszącym rzucie jest
    // śmiertelnie groźny. Bez tej wagi ocena zawsze wolałaby wyższy łuk (wyżej = dalej od
    // rąk), czyli dokładnie odwrotnie niż w realnym ultimate, gdzie czysty korytarz gra
    // się mocno i nisko.
    const tSec = u * flightSec
    const timeWeight = Math.min(1, Math.max(0.15, (tSec - LANE_REACTION_SEC) / LANE_FULL_REACT_SEC))
    for (const d of defs) {
      const gap = normalizedLaneGap(d, x, y, z)
      if (gap < worstGap) worstGap = gap
      if (gap < C.laneSafeMargin) {
        const deficit = C.laneSafeMargin - gap
        laneCost += deficit * deficit * timeWeight
      }
    }
  }

  // STRONA DOLOTU. Boczny dryf zeruje się na końcach, więc dysk trafia dokładnie w punkt
  // dostarczenia — ale DOCHODZI do niego z jednej strony: przy sign=+1 wybrzusza się w
  // stronę +perp na pierwszej połowie i wchodzi w cel od strony -perp. Jeśli to strona
  // przeciwna do obrońcy odbiorcy, obrońca ma do dysku dalej niż wynikałoby z samych
  // pozycji — o to chodzi w rzucie „na otwartą, z fadem na zamkniętą".
  let arrivalBonus = 0
  if (receiverDefender) {
    const dSide = Math.sign(
      (receiverDefender.x - toX) * perpX + (receiverDefender.y - toY) * perpY,
    )
    const approachSide = -sign
    if (dSide !== 0 && approachSide !== dSide) {
      arrivalBonus = C.arrivalSideWeight * Math.min(1, amplitudeM / 1.6)
    } else if (dSide !== 0) {
      arrivalBonus = -C.arrivalSideWeight * 0.6 * Math.min(1, amplitudeM / 1.6)
    }
  }

  const hangCost = C.hangCostPerSec * Math.max(0, flightSec - baseFlightMs / 1000)
  const difficulty = shapeDifficulty(candidate.arc, candidate.curve, loftStat)
  const score =
    -C.laneClearanceWeight * (laneCost / LANE_SAMPLES) +
    arrivalBonus -
    hangCost -
    C.difficultyWeight * difficulty

  return {
    ...candidate,
    curveSign: sign,
    score,
    peakM,
    amplitudeM,
    hangMult,
    difficulty,
    /** Najciaśniejsze miejsce w torze (w zasięgach obrońcy) — do diagnostyki. */
    minLaneGap: Number.isFinite(worstGap) ? worstGap : null,
  }
}

/**
 * Wybiera tor. Zwraca też, jak dobry był NAJLEPSZY dostępny tor (`bestScore`) — to jest
 * miara „czy to podanie w ogóle da się bezpiecznie posłać", którą ocena opcji rzutu może
 * później uwzględniać przy wyborze odbiorcy.
 */
export function chooseThrowShape(thrower, ctx) {
  const { trajectory = 'forward', technique = null, rng = null } = ctx
  const curveSignNatural = naturalCurveSign(technique, thrower)
  const scoreCtx = { ...ctx, defenders: reachAnnotatedDefenders(ctx.defenders ?? []) }
  const candidates = candidateShapes(trajectory).map((c) =>
    scoreThrowShape(
      {
        ...c,
        curveSign:
          c.curve === THROW_CURVE.REVERSE ? -curveSignNatural : curveSignNatural,
      },
      scoreCtx,
    ),
  )
  if (!candidates.length) return null

  const vision = subStat(thrower, 'mental', 'vision')
  const decision = subStat(thrower, 'mental', 'decisionMaking')
  const awareness = Math.max(0.2, Math.min(1, (vision * 0.55 + decision * 0.45) / 100))
  const noiseAmp = SHAPE_CALIBRATION.judgementNoise * (1 - awareness)

  let chosen = null
  let best = null
  for (const c of candidates) {
    const perceived = c.score + (rng?.float ? (rng.float() * 2 - 1) * noiseAmp : 0)
    if (!chosen || perceived > chosen.perceived) chosen = { ...c, perceived }
    if (!best || c.score > best.score) best = c
  }
  return {
    ...chosen,
    /** Ile stracił, wybierając gorzej niż mógł — miara jakości DECYZJI, nie wykonania. */
    judgementLoss: best.score - chosen.score,
    bestScore: best.score,
    naturalCurveSign: curveSignNatural,
  }
}

/** Domyślny kształt, gdy nie ma danych o obronie (fastMode, wywołania spoza symulacji). */
export function defaultThrowShape(thrower, { trajectory = 'forward', technique = null } = {}) {
  const curveSign = naturalCurveSign(technique, thrower)
  return {
    arc: trajectory === 'overhead' ? THROW_ARC.OVER : THROW_ARC.NORMAL,
    curve: THROW_CURVE.NATURAL,
    curveSign,
    score: 0,
    bestScore: 0,
    judgementLoss: 0,
    naturalCurveSign: curveSign,
  }
}

export { ARC_MULT, CURVE_AMP_MULT }
