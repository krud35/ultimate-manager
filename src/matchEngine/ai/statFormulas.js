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
 * Dla ilu opcji rzucający realnie ROZPATRUJE TOR — czyli sprawdza, czy da się tam dysk
 * posłać tak, żeby nikt go nie zdjął (patrz chooseThrowShape w throwShape.js).
 *
 * To nie to samo co perceivedOptionLimit: dostrzec kolegę w polu widzenia jest tanio,
 * ale rozrysowanie sobie korytarza — którędy dysk przejdzie, czy trzeba go zakręcić,
 * czy podnieść — kosztuje uwagę i czas, i realnie robi się to dla tych dwóch-trzech
 * opcji, na których wzrok się zatrzymał. Stąd wąski zakres: 2 przy słabym czytaniu gry,
 * 3 u elity.
 */
export function throwLaneReadLimit(player) {
  const vision = subStat(player, 'mental', 'vision')
  return 2 + Math.round(Math.max(0, Math.min(1, (vision - 55) / 40)))
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
/**
 * WYSOKOŚĆ WYPUSZCZENIA dysku (m) — z czego rzucający wypuszcza dysk w TEJ sytuacji.
 *
 * Nie ma jednego punktu wyrzutu: forehand schodzi z biodra, backhand z pasa, hammer leci
 * znad głowy, a pod ciasnym markiem rzucający albo klęka i puszcza tuż nad trawą (dookoła
 * marka), albo podnosi rękę wysoko i przerzuca go górą. Skala jest zaczepiona o
 * standingReachM, więc gdy pojawi się wzrost, wypuszczenie zacznie zależeć od postury
 * bez ruszania tej funkcji.
 */
const RELEASE_BASE_FRACTION = 0.5
/** Ile razy niżej/wyżej niż normalnie schodzi dysk przy rzucie łamiącym marka. */
const RELEASE_AROUND_MARK = 0.6
const RELEASE_OVER_MARK = 1.6
/** Jak często rzucający wybiera wysokie wypuszczenie zamiast niskiego, gdy łamie marka. */
const HIGH_RELEASE_SHARE = 0.3

export function discReleaseHeightM(
  thrower,
  { trajectory = 'forward', technique = null, isOpenSide = true, rng = null } = {},
) {
  const base = standingReachM(thrower) * RELEASE_BASE_FRACTION
  let h
  if (trajectory === 'overhead') {
    // Hammer/scoober wychodzi znad głowy — dlatego w ogóle da się nim przerzucić obronę.
    h = standingReachM(thrower) * 0.95
  } else if (technique === 'forehand') {
    h = base * 0.85
  } else if (trajectory === 'deep') {
    // Krok w bok i pełny zamach — dysk wychodzi odrobinę wyżej niż przy zwykłym podaniu.
    h = base * 1.08
  } else {
    h = base
  }
  if (!isOpenSide && trajectory !== 'overhead') {
    // Rzut na break side musi ominąć marka: albo dołem, albo górą. Obie drogi są realne,
    // dołem częściej.
    const high = rng?.float ? rng.float() < HIGH_RELEASE_SHARE : false
    h *= high ? RELEASE_OVER_MARK : RELEASE_AROUND_MARK
  }
  // Drobna zmienność wykonania — ten sam rzut nie wychodzi dwa razy z tej samej wysokości.
  if (rng?.float) h *= 0.94 + rng.float() * 0.12
  return Math.max(0.25, h)
}

export const THROW_ARC = { FLAT: 'flat', NORMAL: 'normal', OVER: 'over' }

/**
 * WYKONANIE wybranego toru — czy rzucający trafia w kształt, który zamierzył.
 *
 * WYBÓR toru (który kształt w ogóle ma sens wobec ustawienia obrony) siedzi osobno, w
 * throwShape.js. Tu jest tylko ręka.
 *
 * Rzucający nie jest bierny wobec kształtu lotu: widząc obrońcę na torze, może dysk
 * przerzucić górą (jedyny sposób, żeby podanie w ogóle doszło), a mając czysty korytarz
 * puszcza go płasko i twardo, bo tak jest najbezpieczniej. Za to KONTROLA wysokości jest
 * umiejętnością, dokładnie jak celność: słabszy rzucający nie trafia w zamierzony łuk i
 * myli się głównie w GÓRĘ — przelot, dysk wisi, obrona zdąża się zbiec. To jest realne
 * źródło większości kontestów: leading pass, który poleciał za wysoko i za długo.
 *
 * Zwraca mnożniki pułapu i amplitudy krzywizny; metry i wynikający z nich hang liczy
 * flightKinematics.js.
 */
const ARC_OVER_MULT = 1.75
const ARC_FLAT_MULT = 0.72
/** Maks. rozrzut wykonania łuku u rzucającego bez kontroli wysokości (stat 0). */
const ARC_ERROR_MAX = 0.4
/** Ile z tego rozrzutu to systematyczny przelot W GÓRĘ (a nie symetryczny szum). */
const ARC_OVERCOOK_BIAS = 0.35

export function executeThrowShape(
  thrower,
  { arc = THROW_ARC.NORMAL, curve = 'natural', loftStat = DEFAULT, rng = null } = {},
) {
  const intended = arc === THROW_ARC.OVER ? ARC_OVER_MULT : arc === THROW_ARC.FLAT ? ARC_FLAT_MULT : 1

  const control = Math.max(0, Math.min(1, loftStat / 100))
  const spread = (1 - control) * ARC_ERROR_MAX
  const noise = rng?.float ? (rng.float() * 2 - 1) * spread : 0
  // Rzut górą jest trudniejszy do wydozowania niż płaski — przelot rośnie z ambicją toru.
  const bias = spread * ARC_OVERCOOK_BIAS * (arc === THROW_ARC.OVER ? 1.6 : 1)

  // Krzywizna też bywa nietrafiona: rzut pod prąd naturalnego fade'u (inside-out) albo się
  // nie zakręci wcale, albo przekręci za mocno. Rzut z naturalnym fadem robi się sam.
  const curveSpread = (1 - control) * (curve === 'reverse' ? 0.55 : curve === 'straight' ? 0.3 : 0.18)
  const curveNoise = rng?.float ? (rng.float() * 2 - 1) * curveSpread : 0

  return {
    arc,
    curve,
    peakMult: Math.max(0.45, intended * (1 + noise + bias)),
    amplitudeMult: Math.max(0.15, 1 + curveNoise),
    /** Ile z tego jest niezamierzone — do diagnostyki/narracji. */
    executionError: noise + bias,
    curveError: curveNoise,
  }
}

/**
 * Wysokość dysku w punkcie DOSTARCZENIA (m) — tam, gdzie odbiorca ma go zagrać.
 *
 * Podanie kończy się w rękach, nie na murawie: płaskie dochodzi na klatkę, wiszący huck
 * schodzi wyżej, bo odbiorca wychodzi pod niego i bierze go nad sobą. To jest wielkość,
 * która w ogóle daje sens walce w powietrzu — dopóki każdy lot kończył się na z=0, każdy
 * chwyt odbywał się przy ziemi i zasięg nie miał czego rozstrzygać.
 */
export function discDeliveryHeightM(trajectory) {
  if (trajectory === 'deep') return 1.6
  if (trajectory === 'overhead') return 1.45
  if (trajectory === 'lateral') return 1.0
  return 1.15
}

export function discPeakHeightM(
  trajectory,
  loftStat = DEFAULT,
  { distanceM = null, releaseHeightM = null } = {},
) {
  const release = releaseHeightM ?? 1.05
  const dist = Number.isFinite(distanceM) ? Math.max(0, distanceM) : null
  const loft = loftStat / 100

  // BEZ dystansu (stara sygnatura — fallback kosmetyczny w flightKinematics) zachowujemy
  // dawne stałe, żeby nie zmieniać zachowania wywołań, które dystansu nie znają.
  if (dist == null) {
    const base =
      trajectory === 'deep' ? 4.2 : trajectory === 'overhead' ? 5.5 : trajectory === 'lateral' ? 1.2 : 2.4
    return base + loft * 1.85
  }

  // Łuk MUSI zależeć od dystansu. Dawna formuła patrzyła wyłącznie na trajektorię i stat
  // rzucającego, więc dump na 4 m dostawał ten sam łuk co forehand na 20 m i wznosił się
  // na 2.3 m — wisiał obronie nad głową ćwierć sekundy przed dojściem i stąd brały się
  // kontesty na dumpach. Płaski rzut ma lecieć płasko: wznieść się o kilkadziesiąt
  // centymetrów ponad rękę i tyle.
  if (trajectory === 'deep') {
    // Huck: pełny łuk, ale krótki „deep" nie wisi tak jak bomba na 55 m.
    return release + (2.6 + loft * 1.9) * Math.min(1, dist / 45)
  }
  if (trajectory === 'overhead') {
    // Hammer leci nad obroną — wysoko i stromo w dół.
    return release + (2.2 + loft * 1.4) * Math.min(1, dist / 22)
  }
  if (trajectory === 'lateral') {
    // Dump/swing: praktycznie płasko, kilkadziesiąt cm łuku.
    return release + Math.min(0.55, dist * 0.05) * (0.8 + loft * 0.4)
  }
  // Forehand/backhand do przodu: łuk rośnie z dystansem, ale ma sufit. 12 m szczytuje
  // ~1.6 m, 20 m ~2.2 m (zamiast dawnych 3.8 m), a dopiero rzut na 30 m może realnie
  // zawisnąć — i to jest dokładnie ten przypadek, w którym kontest ma prawo wybuchnąć
  // przy rzucie płaskim: za długi, za wysoki leading pass.
  return release + Math.min(1.6, dist * 0.055) * (0.75 + loft * 0.5)
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

  let difficulty = 0
  const strain = Math.max(0, Math.min(1, reachStrain))
  // Kwadratowo: sięganie na granicy zasięgu jest nieproporcjonalnie trudniejsze niż lekka
  // korekta ręki.
  difficulty += strain * strain * C.strainMiss

  // Wysokość liczona względem WŁASNEGO zasięgu: wygodnie łapie się do wysokości klatki/
  // głowy (0.85 zasięgu stojącego), a im bliżej szczytu wyskoku, tym bardziej jest to
  // chwyt jednoręczny w locie. Dawna formuła brała `1.15 + jump*2.35/100` jako „zasięg",
  // czyli 2.56 m przy jump=60 — próg tak wysoki, że przy realnych wysokościach dysku
  // składnik nie odpalał prawie nigdy.
  const comfortable = standingReachM(receiver) * 0.85
  if (discZ > comfortable) {
    const span = Math.max(0.35, maxAerialReachM(receiver) - comfortable)
    const over = Math.min(1.4, (discZ - comfortable) / span)
    difficulty += C.heightMiss * (1 + over * 2.5)
  }
  if (contested) difficulty += C.contestedMiss
  if (layoutAttempt) difficulty += C.layoutMiss

  const stamina = receiver?.currentStamina ?? 100
  if (stamina < 50) difficulty += ((50 - stamina) / 50) * 0.08

  // Umiejętność redukuje TRUDNOŚĆ, nie podnosi bazy.
  const relief = Math.max(0, Math.min(1, (catching - 50) / 45)) * C.skillRelief
  const missP = C.easyMiss + difficulty * (1 - relief) - (catchBonus ?? 0) * 0.002
  return Math.max(CATCH_MIN_P, Math.min(CATCH_MAX_P, 1 - missP))
}

/**
 * ZASIĘG PIONOWY — dokąd zawodnik sięga ręką, stojąc na ziemi (m).
 *
 * Model docelowy to wzrost + zasięg ramion; ani jednego, ani drugiego nie ma jeszcze w
 * modelu zawodnika (models/playerStats.js), więc dziś jedynym wejściem jest `jump` —
 * jako proxy, ze świadomie WĄSKIM rozrzutem (2.00–2.35 m), bo wysoko skaczący nie musi
 * być wysoki. Rozbicie na dwie osobne funkcje jest celowe: gdy wzrost i długość ramion
 * się pojawią, zmienia się WYŁĄCZNIE ta funkcja, a kontest powietrzny i trudność chwytu
 * liczą się z niej bez żadnej zmiany.
 */
const STANDING_REACH_BASE_M = 2.0
const STANDING_REACH_JUMP_SPAN_M = 0.35

export function standingReachM(player) {
  const jump = subStat(player, 'physical', 'jump')
  return STANDING_REACH_BASE_M + (jump / 100) * STANDING_REACH_JUMP_SPAN_M
}

/**
 * Wysokość wybicia (m) — jedno źródło prawdy dla łuku skoku (tickJumpArc w
 * flightKinematics.js) i dla zasięgu w kontestcie powietrznym.
 */
const JUMP_HEIGHT_BASE_M = 0.3
const JUMP_HEIGHT_SPAN_M = 0.85

export function jumpHeightM(player) {
  const jump = subStat(player, 'physical', 'jump')
  return JUMP_HEIGHT_BASE_M + (jump / 100) * JUMP_HEIGHT_SPAN_M
}

/**
 * Najwyższy punkt, w którym zawodnik może w ogóle zagrać dysk (m) — 2.30 przy jump 0,
 * 2.90 przy 50, 3.50 przy 100. To jest wielkość, która na hucku decyduje: dysk schodzi
 * przez tę wysokość i bierze go ten, kto sięga tam wcześniej.
 */
export function maxAerialReachM(player) {
  return standingReachM(player) + jumpHeightM(player)
}

/**
 * Naturalna wysokość chwytu (m) — dysk w rękach przed klatką/twarzą. Punkt odniesienia
 * dla „jak daleko od dysku był ten zawodnik": mierzenie od stóp miało sens tylko wtedy,
 * gdy każdy lot kończył się na ziemi.
 */
export function catchHeightM(player) {
  return standingReachM(player) * 0.62
}

/**
 * Zasięg W BOK (m) — dokąd sięga ręką na boki, z wychyleniem i krokiem, ale bez layoutu.
 * Docelowo z długości ramion; dziś ułamek zasięgu pionowego, bo obie wielkości biorą się
 * z tej samej budowy ciała. Kopertę zasięgu trzeba mieć niesymetryczną: dysk 2.5 m NAD
 * głową jest w zasięgu wyskoku, ten sam dysk 2.5 m OBOK — nie jest.
 */
export function horizontalReachM(player) {
  return standingReachM(player) * 0.52
}

/** Szansa layout / catch w powietrzu (0–1). */
export function aerialContestChance(player, discZMeters, isReceiver = true) {
  const jump = subStat(player, 'physical', 'jump')
  const mods = getTraitMods(player)
  // Ten sam zasięg, na którym rozstrzyga się kontest powietrzny — dysk wyraźnie ponad
  // nim to już tylko desperacka próba.
  const reach = maxAerialReachM(player)
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
