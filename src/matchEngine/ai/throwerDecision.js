import { attackDirectionX, FIELD_DIMENSIONS } from '../fieldDimensions.js'
import { subStat } from './statFormulas.js'
import { HUCK_MIN_M } from '../matchStats.js'

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
/**
 * Balans „teren vs utrzymanie posiadania".
 *
 * `forwardScale` skaluje CAŁĄ wartość zysku terenu, `dumpBonus` podnosi wartość resetu.
 * Zmierzone tło: standard i dump mają praktycznie identyczną skuteczność (90.3% vs
 * 90.4%), ale standardy to 83% wszystkich podań — więc odpowiadają za większość strat w
 * liczbach bezwzględnych, i każda z nich oddaje dysk w połowie boiska zamiast bezpiecznie
 * z tyłu. Udział resetów 8.4% przy realnych 22-38% to zresztą osobny, niezależny powód.
 */
export const YARDAGE_BALANCE = { forwardScale: 1, dumpBonus: 0 }

export function yardageScoreComponent(forwardProgress, stallCount, isDump = false) {
  const fp = forwardProgress ?? 0
  // Nasycenie: 25 m nie jest dwa razy lepsze niż 12 m, bo dłuższy rzut to większe ryzyko.
  if (fp >= 15) return (26 + Math.min(12, (fp - 15) * 0.5)) * YARDAGE_BALANCE.forwardScale
  if (fp >= 8) return (18 + (fp - 8) * 1.15) * YARDAGE_BALANCE.forwardScale
  if (fp >= 5) return (12 + (fp - 5) * 1.2) * YARDAGE_BALANCE.forwardScale
  if (fp >= 2) return (6 + (fp - 2) * 2) * YARDAGE_BALANCE.forwardScale
  if (fp >= 0.5) return fp * 3 * YARDAGE_BALANCE.forwardScale

  // Reset/swing przy niskim stallu NIE jest zagraniem z natury złym — w realnym club
  // ultimate to ~25-35% wszystkich podań i normalny element flow (zeruje liczenie,
  // utrzymuje posiadanie, przestawia dysk na drugą stronę). Poprzednie -14/-26 przy
  // stallu <4 sprawiały, że nawet zupełnie otwarty reset przegrywał z przeciętnym
  // zyskiem 5-8 m o 26-44 pkt, więc pełny silnik (mediana stallu 2!) praktycznie nigdy
  // nie resetował — 1,9% resetów zamiast realnych ~30% (patrz scripts/engine-parity.mjs).
  // Reset ma być nadal gorszy od dobrego zysku terenu, ale ma wygrywać ze słabym lookiem.
  if (fp >= -0.75) {
    if (stallCount >= 4 && stallCount < 7 && isDump) return 6 + YARDAGE_BALANCE.dumpBonus
    if (stallCount >= 7) return isDump ? 2 : -8
    return isDump ? -2 + YARDAGE_BALANCE.dumpBonus : -12
  }

  if (stallCount >= 7) return isDump ? -4 : -10
  return isDump ? -6 : -20
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

  // Podanie bez zysku musi być pewniejsze niż zysk terenu, ale KRÓTKI reset do handlera
  // jest w realnym ultimate zagraniem rutynowym, nie awaryjnym: dysk leci 5-10 m, rzucający
  // kładzie go po bezpiecznej stronie odbiorcy, więc 1,5-2 m zapasu w zupełności wystarcza.
  // Próg 3,2 m sprawiał, że przy typowym dla pełnego silnika stallu 2 reset praktycznie nie
  // przechodził bramki i atak grał wyłącznie do przodu (3,8% resetów przy realnych 25-35%
  // — patrz scripts/engine-parity.mjs). Wymóg skalowany dystansem: krótki reset łatwo,
  // długie podanie w bok / do tyłu nadal wymaga sporo miejsca.
  if (fp < 0.5) {
    const shortReset = dist <= 12
    req = Math.max(req, isDump ? (shortReset ? 1.8 : 3.2) : shortReset ? 3.0 : 4.6)
  }

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

  // Druga, twardsza bramka na wczesnym stallu — ta sama korekta co w
  // requiredSeparationMeters: krótki reset do handlera jest rutyną także przy stallu 1-3
  // (to normalny sposób resetowania liczenia, nie ostatnia deska ratunku).
  if (stallCount < 4 && fp < 0.5) {
    const openBias = Math.max(0, Math.min(1, sepPolicy?.openLookBias ?? 0))
    const shortReset = (throwDistanceM ?? 0) <= 12
    const dumpMin = (shortReset ? 1.9 : 3.4) + openBias * 0.6
    const otherMin = (shortReset ? 3.2 : 5) + openBias * 1.2
    return sep >= (isDump ? dumpMin : otherMin)
  }

  return true
}

/**
 * Skorygowana ocena opcji (yardage + eskalacja ryzyka od stall).
 */
/**
 * Kara za KRYCIE, niezależna od dystansu.
 *
 * Wcześniej ryzyko liczyło się wyłącznie dla rzutów powyżej 16 m (`dist > 16` niżej),
 * więc kryty rzut na 12 m nie dostawał ŻADNEJ kary, a inkasował pełne +22.6 za zysk
 * terenu. Bilans wychodził skrzywiony: teren wart do 48 pkt (yardageScoreComponent do
 * 38 + 10 za forwardProgress >= 5), a bycie otwartym maksymalnie 20
 * (`min(20, (separation - 3) * 4.5)`). Skutkiem był zmierzony rozjazd: opcja do przodu
 * średnio 121 pkt przeciw 79 dla dumpa, przy progu akceptacji 75 — dump był
 * akceptowalny i często najlepszy w skanie, ale w chwili realnego wypuszczenia dysku
 * przegrywał z krytą grą do przodu. Stąd 4.8% resetów zamiast realnych 22-38%.
 *
 * W ultimate kryty rzut na 12 m to realne ryzyko straty niezależnie od tego, że nie
 * jest długi — dlatego kara musi działać na każdym dystansie.
 */
/**
 * Wagi ATRAKCYJNOŚCI OFERTY.
 *
 * Nadrzędny priorytet ataku to UTRZYMANIE POSIADANIA — dlatego kara za krycie jest
 * najcięższym pojedynczym członem, a wartość terenu ma sufit. Zdobycie punktu jest
 * osobną, dużą premią, bo kończy posiadanie z zyskiem i nie da się go wycenić metrami.
 *
 * Break side dostaje premię, bo zysk poprzeczny wobec krycia realnie otwiera boisko na
 * kolejne zagranie. Rzut pod linię jest karany, bo linia boczna działa jak dodatkowy
 * obrońca — łatwiej tam zamknąć atak w kolejnym posiadaniu.
 */
export const OPTION_VALUE = {
  /** Szansa na zdobycie punktu tym rzutem — bardzo mocno. */
  scoreChanceBonus: 55,
  /** Metry do przodu; sufit, bo 30 m nie jest trzy razy lepsze niż 10 m. */
  forwardPerM: 1.15,
  forwardCapPts: 26,
  /** Zagranie na break side — otwiera boisko. */
  breakSideBonus: 14,
  /** Kara za odbiór blisko linii bocznej i szerokość pasa, w którym działa. */
  sidelinePenalty: 18,
  sidelineBandM: 7,
}

/**
 * TRUDNOŚĆ RZUTU rosnąca z dystansem — niezależnie od tego, ile ten rzut daje.
 *
 * Dotąd odległość wchodziła do oceny wyłącznie jako nagroda (yardageScoreComponent) oraz
 * jako ryzyko, ale dopiero powyżej 16 m i tylko w interakcji z kryciem. Krótki i średni
 * rzut w to samo krycie kosztowały więc tyle samo z tytułu samej odległości, co jest
 * nieprawdą: dłuższy lot to więcej czasu dla obrony na domknięcie, większy błąd
 * dozowania prędkości, silniejszy wpływ wiatru i trudniejsze wyprowadzenie na lead.
 *
 * Krzywa jest ponadliniowa (wykładnik > 1), bo te czynniki nakładają się na siebie:
 * przy 5 m kara ~3 pkt, przy 15 m ~11, przy 25 m 22, przy 40 m ~41.
 *
 * Człon wchodzi do riskPenalty, więc jest filtrowany przez `decisionMaking` — słaby
 * decydent NIE DOSTRZEGA, o ile trudniejszy jest długi rzut, i przez to go wybiera.
 * To jest właściwe miejsce na tę różnicę między zawodnikami.
 */
export const THROW_DIFFICULTY = {
  pointsAtRef: 22,
  refM: 25,
  exponent: 1.3,
}

export const COVERAGE_RISK = {
  /** Separacja, powyżej której rzut uznajemy za czysty i kary nie ma. */
  cleanSepM: 6,
  /** Punkty kary za każdy metr separacji poniżej progu. */
  perMeter: 7,
  /** Udział kary przy rzucie bardzo krótkim; rośnie liniowo do 1.0 przy 16 m. */
  shortThrowFloor: 0.35,
}

export function evaluateThrowOptionScore(baseScore, ctx) {
  const {
    forwardProgress = 0,
    stallCount = 1,
    separation = 0,
    isDump = false,
    isOpenSide = true,
    throwWindowScore = 0,
    throwDistanceM = null,
    /** Czy ten odbiór kończy się punktem (catch w strefie). */
    scoresPoint = false,
    /** Y punktu odbioru — do kary za grę pod linią. */
    receiverY = null,
    /** Ocena sytuacyjna rzucającego (0-100) — filtruje CZŁONY RYZYKA, nie nagrody. */
    decisionMaking = 75,
  } = ctx

  let score = baseScore
  score += yardageScoreComponent(forwardProgress, stallCount, isDump)

  // Długi rzut w ciasne krycie to prosta droga do straty — karz proporcjonalnie.
  const dist = throwDistanceM ?? Math.abs(forwardProgress)
  // Człony RYZYKA zbierane osobno — na końcu skalowane przez decisionMaking. Nagrody
  // (teren, punkt, break side) widzi każdy; ryzyko dostrzega się tym lepiej, im lepszą
  // ma się ocenę sytuacyjną. Słaby decydent nie rzuca „gorzej" losowo — rzuca w opcje,
  // które WYGLĄDAJĄ dobrze, a są ryzykowne.
  let riskPenalty = 0
  // Sama odległość jest trudnością — bliższa przestrzeń to ŁATWIEJSZA decyzja.
  riskPenalty +=
    THROW_DIFFICULTY.pointsAtRef *
    Math.pow(Math.max(0, dist) / THROW_DIFFICULTY.refM, THROW_DIFFICULTY.exponent)
  if (dist > 16) {
    const risk = (dist - 16) * 0.9
    const sepFactor = separation >= 6 ? 0.3 : separation >= 3.5 ? 0.9 : 2.4
    riskPenalty += risk * sepFactor
  }

  if (stallCount < 4) {
    if (forwardProgress >= 5) score += 10
    // Druga kara za brak zysku przy niskim stallu — złagodzona z tego samego powodu co
    // yardageScoreComponent wyżej (reset to element flow, nie ostateczność).
    if (forwardProgress < 1 && !isDump) score -= 10
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

  // Punkt kończy posiadanie z zyskiem — nie da się tego wycenić metrami.
  if (scoresPoint) score += OPTION_VALUE.scoreChanceBonus

  // Break side: zysk poprzeczny wobec krycia otwiera boisko na kolejne zagranie.
  if (!isOpenSide && forwardProgress >= 0) score += OPTION_VALUE.breakSideBonus

  // Gra pod linią: linia boczna działa jak dodatkowy obrońca, więc odbiór przy niej
  // jest wart mniej, nawet gdy sam rzut jest czysty.
  if (receiverY != null) {
    const w = FIELD_DIMENSIONS.widthM
    const toLine = Math.min(receiverY, w - receiverY)
    if (toLine < OPTION_VALUE.sidelineBandM) {
      riskPenalty += OPTION_VALUE.sidelinePenalty * (1 - toLine / OPTION_VALUE.sidelineBandM)
    }
  }

  // Kara za krycie na KAŻDYM dystansie (patrz COVERAGE_RISK).
  {
    const under = Math.max(0, COVERAGE_RISK.cleanSepM - separation)
    if (under > 0 && !isDump) {
      const distFactor =
        COVERAGE_RISK.shortThrowFloor +
        (1 - COVERAGE_RISK.shortThrowFloor) * Math.min(1, Math.max(0, dist) / 16)
      riskPenalty += under * COVERAGE_RISK.perMeter * distFactor
    }
  }

  if (forwardProgress >= 5 && separation >= 4.5) {
    score += Math.min(12, forwardProgress * 0.6)
  }

  // Naprawdę wolny odbiorca w głębi jest wart ryzyka — inaczej bliskie podanie
  // zawsze wygrywało ocenę i huck nie powstawał nigdy.
  if (dist >= 25 && separation >= 4) {
    score += 22
  }

  if (throwWindowScore > 55 && forwardProgress >= 3) score += 5

  // Ocena sytuacyjna: 50 -> widzi 70% ryzyka, 75 -> 85%, 95 -> 97%.
  const dmFactor = 0.4 + 0.6 * Math.max(0, Math.min(1, decisionMaking / 100))
  score -= riskPenalty * dmFactor

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
/**
 * Czas od chwytu do wypuszczenia dysku — SKŁADANY, nie stała bramka.
 *
 * Rzut natychmiast po złapaniu jest nierealistyczny, ale nierealistyczna jest też stała
 * ~2.5 s przed każdym podaniem (tak było wcześniej: „minimum ~2.1 s (stall 2+)" wpisane
 * wprost w kod, żeby trafić w pasmo stallu). Realny czas to suma trzech rzeczy:
 *
 *   1. WYKONANIE — pivot, zamach, wypuszczenie. Krótkie i niemal stałe, bo to mechanika.
 *   2. PERCEPCJA — dostrzeżenie oferty. Skaluje się `vision`.
 *   3. DECYZJA — ocena i wybór spośród tego, co widać. Skaluje się `decisionMaking`.
 *
 * Percepcja i decyzja rosną, gdy look jest niejednoznaczny: odkrytego odbiorcę widać od
 * razu, a wybór między trzema przeciętnymi opcjami zajmuje realnie dłużej.
 *
 * Dzięki temu rozkład stallu wychodzi z zawodników i sytuacji, a nie z tabeli stałych:
 * elita z czystym lookiem wypuszcza w ~0.6 s (stall 1), przeciętny gracz z solidnym
 * lookiem ~1.2 s (stall 2), słaby gracz bez looku ~4 s (stall 4-5).
 */
/**
 * SKALA: stallCountFromHoldMs to floor(holdMs / 1000), więc czasy 1100-1900 ms mapują się
 * w CAŁOŚCI na stall 1. Pierwsza kalibracja tego nie uwzględniała i mediana stallu tkwiła
 * na 1 mimo sensownie wyglądających milisekund. Teraz typowy zawodnik: czysty look ~1.7 s
 * (stall 1), solidny ~2.4 s (stall 2), przeciętny ~3.1 s (stall 3), brak looku ~5 s.
 */
export const DECISION_TIME = {
  /** Sama mechanika wypuszczenia — pivot, zamach, release. */
  executionMs: 200,
  /**
   * Percepcja i decyzja: WOLNY koniec skali był nierealistyczny. Zawodnik przeciętny
   * (50/50) potrzebował 200 + 3200 = 3.4 s na wypuszczenie solidnego looku; w klubowym
   * ultimate to jest 1.5-2.5 s. Elita (95/95) miała 1.1 s i to było poprawne — dlatego
   * skracamy wyłącznie wolny koniec, zamiast skalować całą bramkę (globalny mnożnik
   * zjechałby elicie do ~0.3 s, co jest bez sensu).
   *
   * Zmierzony wpływ magnitudy bramki (tmp-sweep, mnożnik globalny): 1.0 -> hucki 24.0%,
   * rzuty/punkt 5.86, hold 79.3; 0.25 -> hucki 10.3%, rzuty/punkt 8.64, hold 65.4.
   * Szybsze wypuszczanie urealnia rozkład rzutów kosztem hold% — bo więcej podań na
   * punkt to więcej okazji do straty.
   */
  perceptionSlowMs: 850,
  perceptionFastMs: 450,
  /** Decyzja przy decisionMaking 50 -> 95. */
  decisionSlowMs: 950,
  decisionFastMs: 500,
  /** Mnożnik czasu wg czytelności looku. */
  clarityGolden: 0.7,
  claritySolid: 1,
  clarityDecent: 1.3,
  clarityWeak: 1.7,
  clarityNothing: 2.2,
}

function lerpStat(slowMs, fastMs, statValue) {
  const t = Math.max(0, Math.min(1, (statValue - 50) / 45))
  return slowMs + (fastMs - slowMs) * t
}

/** Czas decyzji dla konkretnego rzucającego przy danej czytelności looku. */
export function throwerDecisionTimeMs(thrower, clarityMult) {
  const D = DECISION_TIME
  const perception = lerpStat(D.perceptionSlowMs, D.perceptionFastMs, subStat(thrower, 'mental', 'vision'))
  const decision = lerpStat(D.decisionSlowMs, D.decisionFastMs, subStat(thrower, 'mental', 'decisionMaking'))
  return Math.round(D.executionMs + (perception + decision) * clarityMult)
}

/** Globalna skala bramki wypuszczenia — 0 = rzut w chwili znalezienia opcji. */
export const GATE_SCALE = { value: 1 }

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
    /** Rzucający — czas decyzji zależy od jego vision i decisionMaking. */
    thrower = null,
  } = opts

  // Skala bramki — patrz GATE_SCALE.
  const G = (ms) => Math.round(ms * GATE_SCALE.value)

  if (stallCount >= 8) return G(0)
  if (stallCount >= 7) return G(280)
  if (stallCount >= 5) return G(700)

  const sep = separation ?? 0
  const fp = forwardProgress ?? 0
  const goldenOpen = sep >= 5.5 && fp >= 7 && (teammateCrowd ?? 0) < 1.0
  const solidOpen = sep >= 4 && fp >= 3.5
  const flowOffense = (continuationUrgency ?? 0) >= 0.5

  // Point-five tylko w stylach flow (motion / hex).
  if (flowOffense && postCatchReorg && isContinuationCut && solidOpen) {
    return G(goldenOpen ? 420 : 700)
  }

  // Chaos: najpierw napraw strukturę.
  if ((crowded || (teammateCrowd ?? 0) >= 1.8) && !goldenOpen) {
    if (stallCount >= 4) return G(1600)
    return G(3600)
  }

  // Lock-in na realnie otwarty huck (≥ HUCK_MIN_M, sep ≥ 3): scanThrowOptions
  // przelicza best opcję na nowo co tick, więc otwarte okno na hucka regularnie
  // znikało (cutter biegnie dalej, szum decyzyjny), zanim minął zwykły gate
  // (2100ms+ dla goldenOpen — ta sama wartość co dla zwykłego dobrego looku).
  // Prawdziwy rzucający na tak otwarty deep strzela od razu, nie czeka.
  if (fp >= HUCK_MIN_M && sep >= 3) return G(260)

  // Czas decyzji, nie wymuszony stall.
  //
  // Poprzednie wartości (2100 / 2600 / 2400 / 3100 / 3600) były dobrane pod METRYKĘ:
  // komentarz mówił wprost „minimum ~2.1 s (stall 2+)". Skutkiem było to, że nawet
  // zupełnie odkryty odbiorca 8 m w polu czekał 2,1 s — a w ultimate taki look leci od
  // razu. Ta jedna stała ustawiała cały rozkład gry: rzucający trzymał dysk 2,5 s przed
  // KAŻDYM podaniem, więc opcje do przodu zdążały dojrzeć i wyprzedzić reset. Zmierzone
  // skutki: średni zysk 16,5 m (realnie 6-10), 4,8% resetów (realnie 22-38), 5,1 podania
  // na punkt (realnie 7-12), i tylko 2,7% podań cofających dysk.
  //
  // Sweep bramki (tmp-sweep/gate-sweep.mjs) potwierdził kierunek: skalowanie jej w dół
  // przesuwało JEDNOCZEŚNIE wszystkie trzy uparte metryki we właściwą stronę, a przy
  // pełnym usunięciu dumpy (28,2%) i podania na punkt (9,61) wchodziły w pasmo — kosztem
  // strat 0,98/punkt i mediany stallu 1. Dlatego nie usuwamy bramki, tylko urealniamy jej
  // magnitudy: czysty look wypuszczany od razu, brak looku nadal trzymany długo.
  const D = DECISION_TIME
  const t = (mult) => G(thrower ? throwerDecisionTimeMs(thrower, mult) : Math.round(1200 * mult))
  if (goldenOpen && fp >= 8) return t(D.clarityGolden)
  if (solidOpen && fp >= 5) return t(D.claritySolid)
  if (isContinuationCut && solidOpen) return t(D.claritySolid * 0.85)
  if (fp >= 3 && sep >= 3) return t(D.clarityDecent)
  if (fp >= 1) return t(D.clarityWeak)
  return t(stallCount >= 4 ? D.clarityWeak : D.clarityNothing)
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
