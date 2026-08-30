import { getSubStat } from '../../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale } from '../../models/playerMorale.js'
import { getTraitMods } from '../../models/playerTraits.js'

const DEFAULT = 50

/** Podstatystyka z fallbackiem 50 — z lekkim wpływem morale. */
export function subStat(player, category, key) {
  const raw = getSubStat(player?.skills, category, key, DEFAULT)
  return applyMoraleToStat(raw, getPlayerMorale(player))
}

/** Vmax ≈ 4.4–7.2 m/s (speed 0–100) — sprint cutu ultimate, nie finisz 100 m. */
export function maxSpeedMps(player) {
  const mods = getTraitMods(player)
  return (4.4 + (subStat(player, 'physical', 'speed') / 100) * 2.8) * (mods.speedMult ?? 1)
}

/** Plant & cut: 300 - (agility / 100) * 180 ms */
export function plantStopMs(player) {
  const mods = getTraitMods(player)
  const base = 300 - (subStat(player, 'physical', 'agility') / 100) * 180
  return Math.max(90, base * (mods.plantMsMult ?? 1))
}

/** Reakcje obrońcy: 350 - (reactions / 100) * 250 ms */
export function defenderReactionDelayMs(player) {
  const mods = getTraitMods(player)
  return Math.round(
    350 - (subStat(player, 'mental', 'reactions') / 100) * 250 + (mods.reactionDelayDeltaMs ?? 0),
  )
}

/**
 * Skan opcji: 22 + (vision/100)^4 * 55 m. Sześcian (^3 *60) wciąż dawał przy typowym
 * rosterze (vision~79) scanRadius ~52m i hucki na ~15% rzutów — nadal za często (miały
 * być sporadyczne). Czwarta potęga mocniej odcina środek stawki: vision 79 -> 0.79^4≈0.39
 * -> tylko ~43m, elita (vision 93+: 0.93^4≈0.75 -> ~63m) wciąż może sporadycznie zobaczyć
 * bombę 55m+. Sufit przy vision=100 to 77m, margines nad deepDist (75m).
 */
export function throwScanRadiusM(player) {
  const mods = getTraitMods(player)
  const visionFrac = subStat(player, 'mental', 'vision') / 100
  return 22 + visionFrac ** 4 * 55 + (mods.scanRadiusBonusM ?? 0)
}

/**
 * Ile opcji podania zawodnik naprawdę dostrzega: 2 przy słabym vision, 7 u elity.
 * Reszta boiska po prostu umyka jego uwadze.
 */
export function perceivedOptionLimit(player) {
  const mods = getTraitMods(player)
  return 2 + Math.round((subStat(player, 'mental', 'vision') / 100) * 5) + (mods.perceivedOptionsBonus ?? 0)
}

/**
 * Rozrzut oceny opcji. Słaby decydent myli dobre podanie ze złym, a przy presji
 * stalla dokłada się do tego niskie composure.
 */
export function decisionNoiseAmplitude(player, stallCount = 1) {
  const dm = subStat(player, 'mental', 'decisionMaking')
  const composure = subStat(player, 'mental', 'composure')
  const mods = getTraitMods(player)
  const base = (1 - dm / 100) * 38
  const pressure = stallCount >= 5 ? (1 - composure / 100) * (stallCount - 4) * 5 : 0
  return (base + pressure) * (mods.decisionNoiseMult ?? 1)
}

/** Kara celności za stall > 4 (punkty score) — composure chroni pod presją. */
/** Skala kary composure za presję stall — patrz HIGH_STALL_PENALTY_SCALE w stall.js. */
const HIGH_STALL_COMPOSURE_PENALTY_SCALE = 0.12

export function stallComposureAccuracyPenalty(stallCount, player) {
  if (stallCount <= 4) return 0
  const comp = subStat(player, 'mental', 'composure') / 100
  return (stallCount - 4) * (1 - comp) * 9 * HIGH_STALL_COMPOSURE_PENALTY_SCALE
}

/** Cushion krycia cuttera: 2.5 - (defensiveCutterMovement / 100) * 1.8 m */
export function coverageCushionMeters(player) {
  const mods = getTraitMods(player)
  const base =
    2.5 -
    (subStat(player, 'defensive', 'defensiveCutterMovement') / 100) * 1.8 +
    (mods.cushionDeltaM ?? 0)
  return Math.max(0.35, base)
}

/**
 * Pułap Z dysku (m): kształt rzutu + zdolność RZUCAJĄCEGO do wypuszczenia takiego łuku.
 * Drugi argument to loft rzucającego (huck / hammer / backhand-forehand wg trajektorii),
 * NIE skoczność odbiorcy — patrz throwerLoftStat w flightKinematics.js. Wcześniej
 * podawany był tu `jump` ODBIORCY, przez co wysokość lotu dysku zależała od tego, jak
 * wysoko skacze łapiący. Skoczność odbiorcy decyduje o czym innym: czy DOSIĘGNIE
 * wysoko lecącego dysku (aerialContestChance / tickJumpArc).
 */
export function discPeakHeightM(trajectory, loftStat = DEFAULT) {
  const base =
    trajectory === 'deep' ? 4.2 : trajectory === 'overhead' ? 5.5 : trajectory === 'lateral' ? 1.2 : 2.4
  return base + (loftStat / 100) * 1.85
}

/**
 * Szansa złapania dysku, który DOLECIAŁ do odbiorcy (0–1).
 *
 * To osobny, jawny krok: do tej pory `catching` nie miało własnego testu — podbijało
 * tylko liczbę celności rzutu (i to nawet po stronie RZUCAJĄCEGO), więc nie istniało
 * „dobiegł, ale upuścił". Rzut nieudany był albo blokiem, albo niczym.
 * Chwyt jest osobną umiejętnością od wyjścia na pozycję: szybki cutter, który się
 * uwolni, wcale nie musi dysku utrzymać.
 *
 * Kalibracja: czysty chwyt niekontestowany to w elicie ~97-99%, więc drop jest zdarzeniem
 * rzadkim; robi się realny dopiero przy dysku wysoko nad głową, w kontakcie z obrońcą
 * albo przy layoucie.
 */
/**
 * Model chwytu — regulowany, bo otoczenie zmieniło się pod nim całkowicie.
 *
 * Te stałe były kalibrowane, gdy silnik rzucał 5.5 razy na punkt, średnio 20 m, z 25-32%
 * podań powyżej 25 m. Teraz jest 10.4 podania na punkt, średnio ~15 m, i inny rozkład
 * kontestów — więc ta sama szansa bazowa daje inny wynik zbiorczy.
 */
/**
 * Model chwytu oparty na TRUDNOŚCI, nie na płaskiej bazie.
 *
 * Poprzednio szansa startowała od 0.915 i schodziły z niej kary — więc nawet idealny,
 * krótki, celny rzut prosto w ręce miał ~2-3% szans na drop. To nieprawda: dobre podanie
 * łapie się praktycznie zawsze, a dropy biorą się z rzutów TRUDNYCH do złapania —
 * wyciągniętych, wysokich, szybkich, w krycie albo na layout.
 *
 * Teraz baza to 0.6% (chwyt czysty, dysk w ręce, bez presji), a reszta ryzyka NARASTA
 * z realnych czynników trudności. Umiejętność `catching` nie podnosi bazy — ona redukuje
 * wpływ trudności, bo dobry łapacz różni się od słabego właśnie w trudnych chwytach,
 * a nie w łatwych, gdzie obaj łapią.
 */
const CATCH_MIN_P = 0.35
const CATCH_MAX_P = 0.998

/**
 * REKALIBRACJA pod completion 95%: cztery pierwsze składniki przeskalowane ×0.18,
 * `layoutMiss` CELOWO nietknięty.
 *
 * Skalowanie jednorodne dawało 95% kosztem spłaszczenia całej krzywej trudności —
 * layout w tłumie skakał z 70.9% na 95.6%, czyli chwyt na desperacko stawał się niemal
 * pewny. Ponieważ layout wchodzi osobnym składnikiem, wystarczy go zostawić: przy ×0.18
 * layout w tłumie trzyma 86.1%, a więc pozostaje wyraźnie trudniejszy od wszystkiego
 * innego. Zmierzone (tmp-sweep/to-95b.mjs, 8 rozproszonych seedów): 95.39% completion,
 * dropy 0.58%, hold 66.8%, GEOMETRIA OBRONY NIETKNIĘTA (contestAbsoluteThreshold 1.2 —
 * obrońca nadal musi realnie dotknąć dysku).
 *
 * PRÓBOWANE I ODRZUCONE — dwie inne drogi do 95%:
 *  1. MISS_CALIBRATION (celność rzucającego). Sprowadzenie chybienia do ZERA — i
 *     częstości, i odległości — dało 91.6% wobec 92.0%, czyli nic. Trudność chwytu nie
 *     bierze się dziś z tego, gdzie rzucający położył dysk, tylko z `receiverMinDist3D`,
 *     zdominowanego przez to, czy odbiorca DOBIEGŁ. (Osobny wniosek: `throwing` nie
 *     różnicuje więc dziś rzucających w pełnym silniku — do zbadania.)
 *  2. Podniesienie GEOMETRIC_CALIBRATION.catchReachM. 95% wymagałoby 3.9 m, czyli
 *     zasięgu nierealistycznego dla człowieka, i nawet wtedy dawało 94.6%.
 */
export const CATCH_CALIBRATION = {
  /** Ryzyko chwytu idealnego — dysk trafia w ręce, bez presji. */
  easyMiss: 0.0011,
  /** Ryzyko przy pełnym wyciągnięciu (dysk na granicy zasięgu). */
  strainMiss: 0.031,
  /** Dysk wyraźnie powyżej wygodnej wysokości. */
  heightMiss: 0.018,
  /** Obrońca realnie przy dysku. */
  contestedMiss: 0.018,
  /** Chwyt w wyskoku/na layout — NIE skalowany, to ma zostać trudne. */
  layoutMiss: 0.14,
  /** Ile z trudności zdejmuje umiejętność chwytania. */
  skillRelief: 0.55,
}

export function catchSuccessChance(
  receiver,
  {
    discZ = 1.2,
    contested = false,
    layoutAttempt = false,
    catchBonus = 0,
    /** 0 = dysk trafił w ręce, 1 = odbiorca sięgał na granicy zasięgu. */
    reachStrain = 0,
  } = {},
) {
  const C = CATCH_CALIBRATION
  const catching = subStat(receiver, 'offensive', 'catching')
  const jump = subStat(receiver, 'physical', 'jump')

  let difficulty = 0
  const strain = Math.max(0, Math.min(1, reachStrain))
  // Kwadratowo: sięganie na granicy zasięgu jest nieproporcjonalnie trudniejsze niż lekka
  // korekta ręki.
  difficulty += strain * strain * C.strainMiss

  const reach = 1.15 + (jump / 100) * 2.35
  const comfortable = reach * 0.9
  if (discZ > comfortable) difficulty += C.heightMiss + (discZ - comfortable) * 0.06
  if (contested) difficulty += C.contestedMiss
  if (layoutAttempt) difficulty += C.layoutMiss

  const stamina = receiver?.currentStamina ?? 100
  if (stamina < 50) difficulty += ((50 - stamina) / 50) * 0.08

  // Umiejętność redukuje TRUDNOŚĆ, nie podnosi bazy.
  const relief = Math.max(0, Math.min(1, (catching - 50) / 45)) * C.skillRelief
  const missP = C.easyMiss + difficulty * (1 - relief) - (catchBonus ?? 0) * 0.002
  return Math.max(CATCH_MIN_P, Math.min(CATCH_MAX_P, 1 - missP))
}

/** Szansa layout / catch w powietrzu (0–1). */
export function aerialContestChance(player, discZMeters, isReceiver = true) {
  const jump = subStat(player, 'physical', 'jump')
  const mods = getTraitMods(player)
  const reach = 1.15 + (jump / 100) * 2.35
  let chance
  if (discZMeters > reach + 0.35) {
    chance = Math.max(0.05, (jump / 100) * 0.22)
  } else if (isReceiver) {
    const catching = subStat(player, 'offensive', 'catching')
    chance = 0.28 + (jump / 100) * 0.42 + (catching / 100) * 0.22
  } else {
    const blocking = subStat(player, 'defensive', 'blocking')
    chance = 0.22 + (jump / 100) * 0.38 + (blocking / 100) * 0.18
  }
  const mult = isReceiver
    ? (mods.aerialRecvMult ?? 1) * (mods.layoutAerialMult ?? 1)
    : (mods.aerialDefMult ?? 1) * (mods.layoutAerialMult ?? 1)
  return Math.min(0.95, chance * mult)
}
