/**
 * Faza 1 planu 3D (patrz .claude/plans — real disc/player physics): realna, uproszczona
 * fizyka wysokości dysku w locie — grawitacja + efekt siły nośnej (uproszczony jako
 * "efektywna grawitacja" mniejsza niż realna 9.81, bo unoszący dysk spada wolniej niż
 * swobodny rzut) + boczny dryf odzwierciedlający turn/fade (precesja żyroskopowa
 * wirującego dysku — banкуje jedną stroną przy dużej prędkości/wirowaniu, potem
 * odwraca się przy wytracaniu prędkości pod koniec lotu).
 *
 * CELOWO nie jest to pełna symulacja bryły sztywnej 6-DOF (tensor momentu bezwładności,
 * moment precesji od kąta natarcia) — to przerost formy dla silnika gry i nie do
 * skalibrowania pod balans. Model tutaj to prawdziwa integracja kinematyczna (siła →
 * przyspieszenie → prędkość → pozycja), tylko z jedną uproszczoną stałą ("efektywna
 * grawitacja") zamiast pełnej krzywej współczynnika siły nośnej od kąta natarcia.
 *
 * Ta faza jest CELOWO neutralna dla wyniku: całkowity czas lotu i punkt lądowania (x,y)
 * zostają dokładnie takie, jak wyliczył istniejący system (`createFlightContext`) — tylko
 * KSZTAŁT toru w międzyczasie (wysokość + boczny dryf) staje się realną fizyką zamiast
 * czystego sinusa. Realny wpływ na wynik (kto łapie/blokuje) to Faza 4 planu, nie ta.
 */

/** Rozdzielczość próbkowania trajektorii (ms) — niezależna od SIM_TICK_MS silnika ticków. */
const SAMPLE_STEP_MS = 25

/** Maks. czas trwania fazy wzniesienia/spadku (s) — reszta długiego lotu to płaski hang.
 * Krótkie rzuty (< 2× ten limit) nie mają fazy hang wcale: cały lot to symetryczny
 * wznieś-opadnij, blisko starego kosmetycznego łuku. */
const MAX_RISE_FALL_SEC = 1.3

/**
 * Buduje raz, na starcie lotu, pełną próbkę trajektorii wysokości + bocznego dryfu w
 * czasie. Wynik jest później próbkowany (interpolowany) dla dowolnego ms — ten sam wzorzec
 * co `throwPathPoints`/`samplePathAt` dla x,y (policz raz, próbkuj wiele razy).
 *
 * @param {number} totalFlightMs - całkowity, już wyliczony czas lotu (bez zmian w tej fazie)
 * @param {number} peakHeightM - docelowa maks. wysokość (z discPeakHeightM, kalibrowane stat.)
 * @param {number} [turnFadeAmplitudeM] - maks. boczny dryf (m); 0 wyłącza turn/fade
 * @param {number} [turnFadeSign] - kierunek (+1/-1) początkowego turnu
 * @returns {{ms:number, z:number, lateral:number}[]} próbki, zawsze zaczynają się i
 *   kończą na z=0, lateral=0 (nie rusza skalibrowanego punktu wypuszczenia/lądowania)
 */
export function integrateDiscFlight3D({
  totalFlightMs,
  peakHeightM,
  turnFadeAmplitudeM = 1.4,
  turnFadeSign = 1,
}) {
  const totalSec = Math.max(0, (totalFlightMs ?? 0) / 1000)
  const peak = Math.max(0, Number.isFinite(peakHeightM) ? peakHeightM : 0)
  if (totalSec <= 0 || peak <= 0) {
    return [{ ms: 0, z: 0, lateral: 0 }]
  }

  // Trójfazowy profil (nie symetryczna parabola balistyczna): szybkie wzniesienie do
  // peakHeightM, potem płaski "hang" (siła nośna wirującego dysku prawie równoważy
  // grawitację — realny dysk szybuje, nie leci jak pocisk), potem przyspieszający spadek
  // pod koniec (spin i siła nośna wygasają). Symetryczna parabola dawała przy długich
  // hisach (7-8s hucki) absurdalny szczyt — żeby wrócić do 0 dokładnie w totalSec przy
  // tak długim czasie, musiałaby wznieść się dziesiątki metrów. Ten profil trzyma
  // zadany szczyt DOKŁADNIE (rise kończy się w z=peak, fall zaczyna się w z=peak i
  // wraca do 0), niezależnie od tego, jak długo trwa lot — nadmiar czasu idzie w
  // dłuższy płaski hang, nie w wyższy szczyt. Krótkie rzuty (2×MAX_RISE_FALL_SEC lub
  // krócej) nie mają fazy hang wcale — cały lot to rise+fall, blisko dawnego symetrycznego
  // łuku.
  const riseSec = Math.min(MAX_RISE_FALL_SEC, totalSec * 0.5)
  const fallSec = Math.min(MAX_RISE_FALL_SEC, totalSec * 0.5)
  const glideSec = Math.max(0, totalSec - riseSec - fallSec)
  // Rise: stały ujemny przyspiesz. sprowadzający v0 do 0 dokładnie w riseSec, przy z=peak.
  const v0 = riseSec > 0 ? (2 * peak) / riseSec : 0
  const riseAccel = riseSec > 0 ? -v0 / riseSec : 0
  // Fall: start z vz=0 przy z=peak, stały przyspiesz. w dół, dokładnie z=0 w fallSec.
  const fallAccel = fallSec > 0 ? (-2 * peak) / (fallSec * fallSec) : 0

  const samples = []
  const stepSec = SAMPLE_STEP_MS / 1000
  for (let t = 0; t <= totalSec; t += stepSec) {
    let z
    if (t <= riseSec) {
      z = v0 * t + 0.5 * riseAccel * t * t
    } else if (t <= riseSec + glideSec) {
      z = peak
    } else {
      const tf = t - riseSec - glideSec
      z = peak + 0.5 * fallAccel * tf * tf
    }
    z = Math.max(0, z)
    const uFrac = t / totalSec
    // S-curve zerowana na obu końcach (nie rusza punktu startu/lądowania) — banking
    // jedną stroną w pierwszej połowie lotu (turn, dysk szybki/mocno wirujący), drugą
    // w drugiej (fade, dysk zwalnia i traci stabilizację żyroskopową).
    const lateral = turnFadeSign * turnFadeAmplitudeM * Math.sin(2 * Math.PI * uFrac)
    samples.push({ ms: Math.round(t * 1000), z, lateral })
  }
  const last = samples[samples.length - 1]
  if (!last || last.ms < totalFlightMs) {
    samples.push({ ms: totalFlightMs, z: 0, lateral: 0 })
  } else {
    last.z = 0
    last.lateral = 0
  }
  return samples
}

/** Interpolacja liniowa próbek trajektorii dla dowolnego ms (analogicznie do samplePathAt). */
export function sampleDiscFlight3D(samples, ms) {
  if (!samples?.length) return { z: 0, lateral: 0 }
  const first = samples[0]
  if (ms <= first.ms) return { z: first.z, lateral: first.lateral }
  const lastSample = samples[samples.length - 1]
  if (ms >= lastSample.ms) return { z: lastSample.z, lateral: lastSample.lateral }
  for (let i = 1; i < samples.length; i += 1) {
    const b = samples[i]
    if (b.ms >= ms) {
      const a = samples[i - 1]
      const span = b.ms - a.ms || 1
      const t = (ms - a.ms) / span
      return {
        z: a.z + (b.z - a.z) * t,
        lateral: a.lateral + (b.lateral - a.lateral) * t,
      }
    }
  }
  return { z: lastSample.z, lateral: lastSample.lateral }
}

/** True gdy próbki trajektorii wyglądają fizycznie sensownie (bez NaN/Infinity/ujemnych z). */
export function isDiscFlight3DValid(samples) {
  if (!samples?.length) return false
  return samples.every(
    (s) =>
      Number.isFinite(s.ms) &&
      Number.isFinite(s.z) &&
      Number.isFinite(s.lateral) &&
      s.z >= -0.001 &&
      s.z < 25 &&
      Math.abs(s.lateral) < 50,
  )
}

/**
 * Faza 2 planu 3D: "aiming solve" dla poziomego tempa dysku wzdłuż już istniejącej
 * ścieżki (throwPathPoints) — zamiast dowolnie dobranego wykładnika ease-out
 * (DISC_DECEL_POWER) używamy realnej całki ruchu pod oporem powietrza (dv/dt = -k·v²,
 * rozwiązanie zamknięte v(t) = v0/(1+k·v0·t), s(t) = ln(1+k·v0·t)/k) — dysk realnie
 * zwalnia od prędkości wypuszczenia v0, a nie podąża za arbitralną krzywą.
 *
 * v0 (prędkość wypuszczenia) jest wybrana jako mnożnik średniej prędkości potrzebnej do
 * pokonania trasy w totalFlightMs — daje "szybki start, potem zwolnienie", jak realny
 * dysk. Współczynnik oporu k jest DOSZUKIWANY (nie zmierzony z gęstości powietrza — to
 * uproszczenie, patrz nagłówek pliku) tak, żeby s(totalSec) trafiało dokładnie w
 * pathLenM: domknięte przybliżenie startowe (rozwinięcie Taylora ln) + do 2 poprawek
 * Newtona (numeryczna pochodna, sztywny limit iteracji — ten sam wzorzec co
 * predictReceiverCatchPoint w discFlightPredict.js). Nie zbiega w tolerancji → invalid,
 * wywołujący wraca do starej krzywej ease-out (bezpiecznik).
 */
export function solveDragPacing({ totalFlightMs, pathLenM, launchBoostMult = 1.4 }) {
  const totalSec = Math.max(0.001, (totalFlightMs ?? 0) / 1000)
  const pathLen = Math.max(0, pathLenM ?? 0)
  if (pathLen <= 0) return { valid: false }

  const vAvg = pathLen / totalSec
  const v0 = Math.max(vAvg, vAvg * launchBoostMult)
  // Brak miejsca na sensowne zwolnienie (v0 ledwo większe od średniej) — trzymamy się
  // starej krzywej zamiast solvować k blisko zera (niestabilne numerycznie).
  if (v0 * totalSec <= pathLen * 1.0001) return { valid: false }

  const distAt = (kTry) => Math.log(1 + kTry * v0 * totalSec) / kTry
  // Przybliżenie startowe z rozwinięcia Taylora ln(1+x)≈x-x²/2 wokół s(T)=pathLen.
  let k = (2 * (v0 * totalSec - pathLen)) / (v0 * v0 * totalSec * totalSec)
  if (!Number.isFinite(k) || k <= 0) return { valid: false }

  for (let i = 0; i < 3; i += 1) {
    const s = distAt(k)
    const err = s - pathLen
    if (Math.abs(err) < 0.05) break
    const dk = k * 0.01 + 1e-6
    const slope = (distAt(k + dk) - s) / dk
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) break
    const nextK = k - err / slope
    if (!Number.isFinite(nextK) || nextK <= 0) break
    k = nextK
  }

  const finalS = distAt(k)
  if (!Number.isFinite(finalS) || Math.abs(finalS - pathLen) > Math.max(0.5, pathLen * 0.03)) {
    return { valid: false }
  }
  return { valid: true, v0, k }
}

/** Ułamek postępu wzdłuż ścieżki (u, 0-1) w chwili tSec, wg solvowanego tempa oporu. */
export function sampleDragPaceU(pacing, tSec, totalSec, pathLenM) {
  if (!pacing?.valid || pathLenM <= 0) return null
  if (tSec <= 0) return 0
  if (tSec >= totalSec) return 1
  const s = Math.log(1 + pacing.k * pacing.v0 * tSec) / pacing.k
  return Math.min(1, Math.max(0, s / pathLenM))
}
