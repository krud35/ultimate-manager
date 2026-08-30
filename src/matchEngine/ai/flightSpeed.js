/**
 * Tempo lotu dysku — JEDNO źródło prawdy dla trzech miejsc, które muszą się zgadzać:
 *  1. WYKONANIE       — flightKinematics.js liczy z tego realny czas lotu,
 *  2. PREDYKCJA LEADU — discFlightPredict.js wyznacza z tego punkt chwytu,
 *  3. DECYZJA         — throwerBrain.js ocenia z tego, kto dobiegnie do dysku pierwszy.
 *
 * Rozdzielenie tych trzech było prawdziwym powodem, dla którego dysk leciał wolno.
 * Prędkość NIE była stałą w kodzie: brała się z `idealSpeedMps = pathLen / neededSec`,
 * gdzie `neededSec` to czas potrzebny ODBIORCY na dobieg do celu — a wynik był przycinany
 * do pasma. Zmierzone: `idealSpeedMps` praktycznie ZAWSZE przekracza sufit pasma, więc
 * realnie o wszystkim decydował sam sufit. Stąd płaskie ~9.2 m/s niezależnie od dystansu
 * i od tego, czego potrzebował odbiorca — logika "rzucający dozuje moc" była martwa.
 *
 * Przyspieszenie samego czasu lotu po fakcie (mnożnik na totalFlightMs) rozjeżdżało
 * sprzężenie: predykcja dalej zakładała 10 m/s i na tej podstawie wyznaczała lead, więc
 * dysk dolatywał tam, gdzie odbiorcy jeszcze nie było. Zmierzone: mnożnik 1.6x dawał
 * 93.7% niecelnych rzutów. Skalowanie MUSI iść przez wszystkie trzy naraz — wtedy szybszy
 * dysk sam z siebie skraca lead (flightSec = pathDist / speed), a odbiorca nadal zdąży.
 */

export const FLIGHT_SPEED = {
  /** Skala całego modelu tempa (rusza wykonanie, predykcję i decyzję jednocześnie). */
  mult: 1,
  /** Stojący odbiorca / brak danych — środek pasma. */
  neutralPace: 0.5,
  /** Prędkość biegu odbiorcy (m/s), przy której rozróżnienie leading/in-cut jest pełne. */
  refRunMps: 3.5,
}

/**
 * Pasma ŚREDNIEJ prędkości lotu (m/s). Realne ultimate: płaski in-cut na 20 m dolatuje
 * w ~1.4 s (≈14 m/s), huck na 45 m wisi ~4 s (≈11 m/s) — stąd deep ma niższy sufit,
 * a nie wyższy. Dolny koniec każdego pasma to rzut z pełnym floatem, górny — płasko
 * i twardo; rzucający wybiera między nimi (paceFracFor).
 *
 * Skalibrowane empirycznie (tmp-sweep/flight-speed-sweep.mjs, 8 rozproszonych seedów):
 * te wartości dają 92.5% completion i najwyższy hold%, a przy tym są ~1.6x wyższe niż
 * poprzednie — które nie były wyborem projektowym, tylko skutkiem tego, że predykcja
 * leadu i wykonanie liczyły się osobno.
 */
const BASE_RANGE_BY_TRAJECTORY = {
  deep: { min: 7, max: 12.5 },
  overhead: { min: 9.9, max: 15.2 },
}
const BASE_RANGE_DEFAULT = { min: 9.9, max: 14.7 }

export function speedRangeFor(trajectory) {
  const b = BASE_RANGE_BY_TRAJECTORY[trajectory] ?? BASE_RANGE_DEFAULT
  return { min: b.min * FLIGHT_SPEED.mult, max: b.max * FLIGHT_SPEED.mult }
}

/** Wystawione do sweepu: predykcja leadu MUSI odpowiadać realnemu tempu lotu. */
export const PREDICT_MPS = { standard: 16, deep: 7.7 }

/** Prędkość zakładana przy wyznaczaniu leadu dla zwykłego rzutu. */
export function predictFlightSpeedMps() {
  return PREDICT_MPS.standard * FLIGHT_SPEED.mult
}

/** To samo dla cutu 'deep' (huck lead) — najbardziej wyczekujący koniec pasma. */
export function deepCutFlightSpeedMps() {
  return PREDICT_MPS.deep * FLIGHT_SPEED.mult
}

/**
 * Tempo dobrane przez RZUCAJĄCEGO — zwraca UŁAMEK pasma: 1 = górny koniec (IN-CUT,
 * płasko i twardo), 0 = dolny koniec (LEADING PASS, z floatem).
 *
 * Rozróżnienie idzie przez rzutowanie wektora prędkości odbiorcy na kierunek
 * rzucający→odbiorca: dodatnie = odbiorca ODDALA SIĘ, dysk musi więc poczekać na niego
 * w przestrzeni; ujemne = odbiorca WBIEGA w lecący dysk, float jest zbędny.
 *
 * Wybór jest CELOWO ograniczony do pasma realnych wartości — rzucający dobiera tempo, ale
 * nie zrobi z dysku ani pocisku, ani balonu. I działa jako decyzja "ile mocy ZDJĄĆ",
 * a nie "ile dodać ponad fizykę".
 */
export function paceFracFor(receiverAgent, fromX, fromY) {
  if (!receiverAgent) return FLIGHT_SPEED.neutralPace
  const dx = (receiverAgent.x ?? fromX) - fromX
  const dy = (receiverAgent.y ?? fromY) - fromY
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return FLIGHT_SPEED.neutralPace
  const away = ((receiverAgent.vx ?? 0) * dx + (receiverAgent.vy ?? 0) * dy) / len
  const t = Math.max(-1, Math.min(1, away / FLIGHT_SPEED.refRunMps))
  // t = +1 (pełny leading) -> dolny koniec pasma; t = -1 (pełny in-cut) -> górny.
  return (1 - t) / 2
}

/** Prędkość wybrana przez rzucającego wewnątrz realnego pasma dla tej trajektorii. */
export function pacedSpeedMps(trajectory, receiverAgent, fromX, fromY) {
  const { min, max } = speedRangeFor(trajectory)
  return min + (max - min) * paceFracFor(receiverAgent, fromX, fromY)
}
