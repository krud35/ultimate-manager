/** Predykcja punktu chwytu / przechwytu dysku w locie. */

import { clampFieldX, clampFieldY } from '../fieldDimensions.js'

const DEFAULT_FLIGHT_SPEED_MPS = 10
const MIN_CUT_SPEED_MPS = 4.5
/**
 * Niższa prędkość predykcji WYŁĄCZNIE dla cutu 'deep' (huck lead). Globalne DEFAULT=10
 * w formule reach=min(toTarget, recvSpeed*pathDist/flightSpeedMps) przy recvSpeed≤~7.2
 * strukturalnie nie pozwalało dobiec dalej niż ~72% celu — realny huck (≥40m) prawie
 * nigdy nie powstawał (patrz audyt huck-scarcity). Obniżenie TYLKO dla deep daje więcej
 * czasu w predykcji bez podnoszenia kompletności krótkich/średnich podań (te nadal 10).
 */
// Obniżone dalej (6->4.8): realna prędkość lotu dla 'deep' w flightKinematics.js jest
// teraz DYNAMICZNA (4.4-7.8 m/s, dobierana wg potrzeb odbiorcy, sufit czasu lotu 9.5s) —
// predykcja z 6 m/s zakładała mniej czasu niż realny system potrafi dać na bardzo
// długich rzutach (55m+), więc sama predykcja ucinała target dużo wcześniej niż
// wykonanie by na to pozwoliło. 4.8 lepiej odzwierciedla dolny (najbardziej wyczekujący)
// koniec realnego zakresu.
export const DEEP_CUT_FLIGHT_SPEED_MPS = 4.8

/**
 * Sufit zakładanego czasu lotu w predykcji leadu (s) — bez tego samouzgodniona iteracja
 * (patrz reach/pathDist niżej) zbiega do coraz większego reach, gdy cel cutu jest daleko,
 * bo dłuższy reach -> dłuższy pathDist -> więcej "dostępnego" czasu -> jeszcze dłuższy
 * reach. Dla hucków to prawidłowe (rzut faktycznie może lecieć 9s+) — ale dla zwykłych
 * rzutów prowadziło do przewidywań typu "odbiorca przebiegnie 22m w 3s" (zmierzone:
 * tmp-phase4a-shadow.mjs, mediana predictedLeadDist=22.5m przy medianie totalFlightMs
 * ~3.0s dla rozjeżdżających się case'ów — wymaga ~7.4 m/s utrzymanego, poza zasięgiem
 * większości graczy). Standardowe rzuty dostają ciasny, realistyczny sufit; deep cut
 * (wywołanie z DEEP_CUT_FLIGHT_SPEED_MPS) dostaje osobny, szeroki sufit blisko realnego
 * 9.5s limitu lotu.
 */
const DEFAULT_MAX_LEAD_SEC = 2.0
export const DEEP_CUT_MAX_LEAD_SEC = 8.5

function isCuttingState(state) {
  return state === 'ACTIVE_CUT' || state === 'INITIATING_CUT'
}

/**
 * Punkt, w który thrower rzuca: lead wzdłuż cutu (B), nie bieżąca pozycja (A).
 * Stojący / dump — lekki lead z prędkości; cutter — punkt osiągalny na drodze do targetu.
 */
export function predictReceiverCatchPoint(
  recvAgent,
  fromX,
  fromY,
  flightSpeedMps = DEFAULT_FLIGHT_SPEED_MPS,
  maxLeadSec = DEFAULT_MAX_LEAD_SEC,
) {
  if (!recvAgent) {
    return { x: (fromX ?? 0) + 8, y: fromY ?? 0 }
  }

  const curX = recvAgent.x ?? fromX ?? 0
  const curY = recvAgent.y ?? fromY ?? 0
  const tgtX = recvAgent.targetX ?? curX
  const tgtY = recvAgent.targetY ?? curY
  const vx = recvAgent.vx ?? 0
  const vy = recvAgent.vy ?? 0
  const cutting = isCuttingState(recvAgent.state)

  if (!cutting) {
    const speed = Math.hypot(vx, vy)
    if (speed < 0.4) return { x: curX, y: curY }
    const dist = Math.hypot(curX - fromX, curY - fromY)
    const flightSec = Math.min(maxLeadSec, Math.max(0.25, dist / Math.max(1, flightSpeedMps)))
    return {
      x: clampFieldX(curX + vx * flightSec * 0.55),
      y: clampFieldY(curY + vy * flightSec * 0.55),
    }
  }

  const toTarget = Math.hypot(tgtX - curX, tgtY - curY)
  if (toTarget < 0.75) return { x: curX, y: curY }

  // Lead w kierunku B: dysk leci tam, gdzie odbiorca dotrze w czasie lotu (max = target).
  // Dostępny czas lotu (flightSec) zależy od dystansu rzucający→PUNKT RZUTU — ale punkt
  // rzutu (catchPt) to właśnie to, co liczymy. Gdy odbiorca jest już daleko od rzucającego
  // (typowe w trakcie cutu), liczenie flightSec od rzucający→surowy cel cutu (blisko
  // rzucającego przy comeback cucie) dawało fałszywie krótki czas → mały reach → catchPt
  // wciąż blisko odbiorcy, ale i tak daleko (~20m+) od rzucającego, bo odbiorca sam był
  // tak daleko. Efekt: rzut realnie dłuższy niż czas, jaki formuła założyła. Samouzgodnione
  // rozwiązanie: iteracja z tłumieniem (5 kroków zbiega się nawet przy oscylacji, patrz
  // devtest) — pathDist liczony od AKTUALNEGO oszacowania catchPt, nie surowego celu.
  const recvSpeed = Math.max(Math.hypot(vx, vy), MIN_CUT_SPEED_MPS)
  const ux = (tgtX - curX) / toTarget
  const uy = (tgtY - curY) / toTarget
  let reach = Math.min(
    toTarget,
    recvSpeed *
      Math.min(
        maxLeadSec,
        Math.max(0.3, Math.hypot(tgtX - fromX, tgtY - fromY) / Math.max(1, flightSpeedMps)),
      ),
  )
  for (let i = 0; i < 5; i += 1) {
    const catchX = curX + ux * reach
    const catchY = curY + uy * reach
    const pathDist = Math.hypot(catchX - fromX, catchY - fromY)
    const flightSec = Math.min(maxLeadSec, Math.max(0.3, pathDist / Math.max(1, flightSpeedMps)))
    const candidate = Math.min(toTarget, recvSpeed * flightSec)
    reach = (reach + candidate) / 2
  }
  return {
    x: clampFieldX(curX + ux * reach),
    y: clampFieldY(curY + uy * reach),
  }
}

export function discPathVelocityMps(samplePathAt, pathPoints, u, totalFlightMs) {
  if (totalFlightMs <= 0) return 0
  const eps = Math.min(0.04, 20 / totalFlightMs)
  const u0 = Math.max(0, u - eps)
  const u1 = Math.min(1, u + eps)
  const p0 = samplePathAt(pathPoints, u0)
  const p1 = samplePathAt(pathPoints, u1)
  const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const dtSec = ((u1 - u0) * totalFlightMs) / 1000
  return dtSec > 1e-6 ? dist / dtSec : 0
}
