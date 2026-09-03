import { attackDirectionX, opponentGoalLineM } from '../fieldDimensions.js'
import { THROW_TYPE } from '../throwTypes.js'

/**
 * Próg „to jest głęboki look" dla WARSTWY DECYZYJNEJ — celowo NIŻSZY niż HUCK_MIN_M,
 * który jest progiem KLASYFIKACJI statystycznej.
 *
 * Wcześniej obie rzeczy jechały na jednej stałej (40, w dodatku nazwanej „yards" i
 * porównywanej z metrami). Skutek: cały apetyt na deep — huckWeightMult,
 * huckAcceptanceDelta, bonus z umiejętności huck, premia percepcyjna w salience —
 * siedział za bramką, która otwierała się powyżej p99 realnego zysku (34 m). Mnożenie
 * wyniku przez 1,65 wewnątrz bramki, która nigdy się nie otwiera, nie robi nic:
 * zmierzone throw_hucks dawało +0,4 pp, a no_hucks (mnożnik 0,55) nie zmniejszało
 * hucków w ogóle.
 * Rzucający rozważający „czy iść deep" myśli o rzucie od ~26 m — to górne ~5% looków
 * (p75 = 15 m, p90 = 21 m), czyli właściwa populacja dla apetytu na głęboką grę.
 * Klasyfikacja tego rzutu jako hucka to osobna sprawa i zostaje przy HUCK_MIN_M.
 */
const DEEP_LOOK_MIN_M = 26
import { HUCK_MIN_M } from '../matchStats.js'
import { evaluatePlayerSituation } from './spatialEvaluator.js'
import { sprintSpeedMps } from './flightKinematics.js'
import { stallTier } from '../stall.js'
import { readLegacySkill } from '../../models/playerStats.js'
import { applyMoraleToStat, getPlayerMorale } from '../../models/playerMorale.js'
import { resolveThrowTechniqueForPlayer } from '../throwTechnique.js'
import { FORCE_SIDES } from '../tacticsModifiers.js'
import { CUTTER_STATE } from './cutterBrain.js'
import {
  forwardProgressMeters,
  optionPassesStallPolicy,
  evaluateThrowTraffic,
  evaluateThrowOptionScore,
  acceptanceThresholdForStall,
} from './throwerDecision.js'
import {
  maxSpeedMps,
  throwScanRadiusM,
  stallComposureAccuracyPenalty,
  perceivedOptionLimit,
  decisionNoiseAmplitude,
  subStat,
} from './statFormulas.js'
import {
  applyAttackThrowBias,
  ATTACK_STYLES,
  DEFENSE_STYLES,
} from './tacticsBehavior.js'
import { DEFENDER_STATE } from './defenderBrain.js'
import {
  pointAlongCut,
  receiverCutPath,
  DEEP_CUT_FLIGHT_SPEED_MPS,
  DEEP_CUT_MAX_LEAD_SEC,
} from './discFlightPredict.js'
import { pacedSpeedMps, speedRangeFor } from './flightSpeed.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { classifySeparationM } from '../separation.js'
import { windOptionScoreAdjust } from '../wind.js'

export const CONTINUATION_WINDOW_MS = 900

/** Do tylu metrów rzut do zawodnika w stanie CLEARING liczy się jako realny reset
 * (a nie „rzut w pustkę do kogoś odchodzącego od gry") — patrz filtr w scanThrowOptions. */
const CLEARING_RESET_MAX_M = 13

function acceptanceThreshold(stallCount, thrower, tactics = null) {
  const tier = stallTier(stallCount)
  const compPenalty = stallComposureAccuracyPenalty(stallCount, thrower)
  const vision = subStat(thrower, 'mental', 'vision')
  const decision = subStat(thrower, 'mental', 'decisionMaking')
  const composure = subStat(thrower, 'mental', 'composure')
  const judgment = decision * 0.5 + vision * 0.3 + composure * 0.2
  const mods = mergeTraitAndCoachMods(thrower, tactics, 'offense')
  let base
  // Wyższy próg na niskim stallu — czekamy na czystszą opcję.
  if (tier === 'low') base = 70 - judgment * 0.1
  else if (tier === 'medium') base = 54 - judgment * 0.09
  else if (tier === 'high') base = 36 - judgment * 0.05
  else base = 100
  return base + compPenalty * 0.15 + (mods.acceptanceThresholdDelta ?? 0)
}

function inferThrowType(option, discDist, stallCount, forwardProgress = 0, thrower = null, rng = null) {
  const goesForward = forwardProgress >= 3
  // Typ rzutu wynika z GEOMETRII zagrania, nie z roli odbiorcy. Poprzednio reset
  // wymagał flagi `option.isDump` (rola w formacji), więc identyczne zagranie w bok /
  // do tyłu było liczone jako „standard", gdy łapał je ktokolwiek inny niż wyznaczony
  // dump — stąd 1,4% resetów przy realnych ~25-35%. Każde podanie bez realnego zysku
  // terenu to swing/reset, bez względu na to, kto je łapie.
  if (!goesForward) return THROW_TYPE.DUMP_SWING
  // Huck = postęp do przodu ≥ HUCK_MIN_M albo realnie długi lot na tym samym progu
  // np. zagranie na skos przez całe boisko, które w postępie do przodu wypada niżej.
  if (forwardProgress >= HUCK_MIN_M || discDist >= HUCK_MIN_M) return THROW_TYPE.HUCK
  // Hammer/scoober: w realnym club ultimate ~1-3% wszystkich podań. Poprzednie warunki
  // (break side + 12-20 m + separacja ≥4 + throwing >70) spełniała ogromna część
  // normalnych zagrań break-side, przez co hammer stawał się DOMYŚLNYM rzutem na tę
  // stronę — audyt pokazał 15,1% wszystkich rzutów. Realnie większość podań break-side
  // to inside-out flick/backhand, a hammer wchodzi dopiero, gdy płaska trasa jest
  // zamknięta. Stąd: węższe okno dystansu, wyższy próg umiejętności, wymagana presja
  // stallu i losowa bramka (nie każdy taki układ kończy się hammerem).
  // Dodatkowo poprawiony realny błąd: sprawdzany był `throwing` ODBIORCY
  // (option.player), mimo że komentarz mówił „dla dobrego handlera" — hammer rzuca
  // RZUCAJĄCY, więc liczy się jego umiejętność.
  const hammerThrower = thrower ?? option.player
  if (
    !option.situation.isOpenSide &&
    discDist > 12 &&
    discDist <= 18 &&
    option.situation.separation >= 4 &&
    // Pełny silnik wypuszcza dysk przy medianie stallu 2, więc próg 4 zbijał hammery
    // do zera (audyt: 0,00% przy realnych 1-3%). 2 = „nie pierwszy look", czyli płaska
    // trasa zdążyła się zamknąć.
    stallCount >= 2 &&
    applyMoraleToStat(readLegacySkill(hammerThrower?.skills, 'throwing'), getPlayerMorale(hammerThrower)) >
      76 &&
    (rng ? rng.float() < 0.35 : true)
  ) {
    return THROW_TYPE.OVER_THE_TOP
  }
  return THROW_TYPE.STANDARD
}

function throwerPosition(offenseAgents, thrower) {
  const agent = offenseAgents.find((a) => a.player?.id === thrower.id)
  return agent ? { x: agent.x, y: agent.y } : null
}

/**
 * Skan opcji rzutu — zwraca najlepszą opcję lub null.
 */
/**
 * Ile waży POTENCJAŁ cutu względem samej separacji w danym ticku.
 *
 * Rzucający oceniał dotąd wyłącznie stan zastany: gdzie odbiorca JEST i jaka jest jego
 * separacja teraz. To źle odwzorowuje ultimate — realny handler czyta RUCH: zawodnik
 * dopiero rozpędzający się w pustą przestrzeń jest lepszą opcją niż stojący w tej samej
 * separacji, bo za pół sekundy będzie wolny, a jego obrońca zostanie z tyłu.
 */
/**
 * PRZEWAGA CZASOWA — czy odbiorca dotrze do punktu chwytu przed KTÓRYMKOLWIEK obrońcą.
 *
 * To jest jedyna rzecz, którą realnie rozstrzyga geometryczny resolver: kto jest bliżej
 * dysku w chwili chwytu. Ocena opcji tego nie zawierała i skutek był mierzalny —
 * rzuty udane miały średni wynik 109.2, a kończące się stratą 103.9, przy separacji 5.1
 * wobec 4.6 i identycznym tłoku. Pięć punktów różnicy na skali stu czterech znaczy, że
 * funkcja oceny praktycznie NIE ODRÓŻNIAŁA rzutu, który przechodzi, od takiego, który
 * kończy się stratą. Każda kalibracja wag była wtedy przestawianiem mebli: zmieniała,
 * co rzucający wybierze, ale nie mogła poprawić trafności, bo sygnału nie było.
 *
 * Separacja jest miarą ODLEGŁOŚCI w jednej chwili. Ta miara jest w SEKUNDACH i dotyczy
 * momentu, w którym dysk realnie dolatuje — uwzględnia więc i to, jak daleko każdy ma
 * do przebiegnięcia, i jak szybko biega, i w którą stronę już jest rozpędzony.
 */
/**
 * Wagi członów wykonalności — ustalone POMIAREM SIŁY SYGNAŁU, nie z góry.
 *
 * Zmierzone rozdziały (udane vs stracone, siła efektu):
 *   margines dolotu   1.166 m vs 0.765 m   ->  0.19   jedyny realny sygnał
 *   zatkanie toru     0.117 vs 0.135       -> -0.07   w granicach szumu
 *   trudność break    0.405 vs 0.379       ->  0.07   zły znak
 *   faza ruchu        0.368 vs 0.407       -> -0.07   zły znak
 *
 * Trzy ostatnie ZMIENIŁY ZNAK między kolejnymi przebiegami, więc nie niosą informacji.
 * Zostawiam je z małymi wagami, bo są poprawne teoretycznie (zatkanie toru odpowiada
 * kryterium resolvera, trudność marku i faza ruchu to realne zjawiska), ale nie udaję,
 * że coś przewidują — gdyby miały decydować, byłby to szum podniesiony do rangi modelu.
 *
 * UWAGA na historię: margines dolotu przez trzy pomiary wychodził 0.006 m vs 0.004 m,
 * bo `Math.max(0, dist - speed * tFlight)` zerowało obie strony (przy locie 2-4 s każdy
 * „przebiega" 14-28 m). Miara była martwa, a ja oceniałem ją po wpływie na łączny wynik
 * zamiast wypisać jej własny rozkład.
 */
const ARRIVAL_WEIGHT = 11
/** Waga fazy ruchu: uciekający odbiorca vs hamujący, przy tej samej separacji. */
const SEPARATING_PHASE_WEIGHT = 4
/** Powyżej tylu sekund przewagi rzut jest po prostu bezpieczny — nie nagradzamy dalej. */
const ARRIVAL_CAP_M = 6
/** Ile sekund biegu „oszczędza" obrońca już rozpędzony w stronę punktu chwytu. */
const MOMENTUM_CREDIT_SEC = 0.4

/**
 * Prędkość dysku wg dystansu — ciągła, nie progowa.
 *
 * Krótkie podanie idzie płasko i szybko (~8.5 m/s), długie musi iść łukiem, żeby w ogóle
 * doleciało, więc realna prędkość wzdłuż ziemi spada (~5.5 m/s przy 45 m). To jest
 * miejsce, w którym CZAS LOTU wchodzi do oceny: przy 30 m łuk leci ~5.0 s, a płaski rzut
 * na 15 m ~1.8 s — obrona dostaje przy tym pierwszym ponad trzy sekundy więcej na
 * domknięcie, a dotąd ocena opcji tego nie widziała.
 */
function discSpeedFor(distM, receiverAgent = null, fromX = 0, fromY = 0) {
  // Ta sama funkcja, której użyje WYKONANIE (flightKinematics -> pacedSpeedMps), a nie
  // osobna aproksymacja z samego dystansu.
  //
  // Jednorodne skalowanie po dystansie było niespójne dokładnie tam, gdzie boli najbardziej:
  // huck idzie do odbiorcy, który UCIEKA, więc realnie poleci dołem pasma deep (~7 m/s,
  // z pełnym floatem) — a ocena zakładała ~9.3 m/s. Rzucający systemowo nie doceniał, ile
  // czasu daje odbiorcy na dobieg, więc huck nigdy nie wygrywał arrivalMarginM. Zmierzone:
  // udział hucków 0.1-0.5% przy celu 7-16%, p95 dystansu rzutu 24.6 m, najdłuższy rzut
  // w ośmiu meczach 38.9 m.
  const trajectory = distM >= HUCK_MIN_M ? 'deep' : null
  return pacedSpeedMps(trajectory, receiverAgent, fromX, fromY)
}

/**
 * FAZA RUCHU odbiorcy — czy w chwili chwytu wciąż oddala się od swojego obrońcy, czy
 * już hamuje i wraca po dysk.
 *
 * Przy identycznej separacji to są dwie różne sytuacje: zawodnik wciąż uciekający ma
 * przewagę, która rośnie, a zawodnik hamujący oddaje ją z każdym metrem. Zwraca -1..1.
 */
function separatingPhase(agent, defenders) {
  const vx = agent.vx ?? 0
  const vy = agent.vy ?? 0
  const speed = Math.hypot(vx, vy)
  if (speed < 0.6 || !defenders?.length) return 0
  let nearest = null
  let bd = Infinity
  for (const d of defenders) {
    const dd = Math.hypot(d.x - agent.x, d.y - agent.y)
    if (dd < bd) { bd = dd; nearest = d }
  }
  if (!nearest || bd < 1e-6) return 0
  const ax = (agent.x - nearest.x) / bd
  const ay = (agent.y - nearest.y) / bd
  return Math.max(-1, Math.min(1, (vx * ax + vy * ay) / speed))
}

/**
 * Kto będzie BLIŻEJ DYSKU w chwili, gdy on dolatuje.
 *
 * Pierwsza wersja liczyła „kto szybciej dobiegnie do punktu chwytu" i była zdegenerowana:
 * `predictReceiverCatchPoint` wybiera ten punkt TAK, ŻEBY ODBIORCA ZDĄŻYŁ, więc jego czas
 * był tam prawie stały, a obrońcy — przywiązani do swoich zawodników — mieli czas do
 * niego doklejony. Zmierzone: rozstęp między rzutami udanymi a straconymi spadł z 5.3
 * punktu do -0.4, czyli miara nie niosła żadnej informacji.
 *
 * Teraz liczone jest to, co realnie rozstrzyga geometryczny resolver: pozycje w MOMENCIE
 * DOLOTU. Uwzględnia to czas lotu, więc wolny, wysoki huck i płaski rzut na ten sam
 * dystans przestają być tą samą opcją — obrona dostaje przy tym pierwszym o sekundę
 * więcej na domknięcie.
 */
function arrivalMarginM(agent, catchPt, defenders, throwerPos, flightSpeedMps = null) {
  const fromX = throwerPos?.x ?? agent.x
  const fromY = throwerPos?.y ?? agent.y
  const throwDist = Math.hypot(catchPt.x - fromX, catchPt.y - fromY)
  const tFlight = throwDist / (flightSpeedMps ?? discSpeedFor(throwDist, agent, fromX, fromY))

  const recvSpeed = Math.max(3, sprintSpeedMps(agent.player ?? agent, 'offense'))
  const recvDist = Math.hypot(catchPt.x - agent.x, catchPt.y - agent.y)
  // BEZ przycinania do zera: przy locie 2-4 s i prędkości ~7 m/s każdy „przebiega" 14-28 m,
  // więc max(0, ...) zerowało obie strony i różnica zer dawała zero. Zmierzone: margines
  // 0.006 m przy rzutach udanych i 0.004 m przy straconych — miara była martwa.
  // Wartość ujemna znaczy „dotrze z zapasem" i to jest informacja, nie błąd.
  const recvAtArrival = recvDist - recvSpeed * tFlight

  let defAtArrival = Infinity
  for (const d of defenders) {
    const dp = d.player ?? d
    const dist = Math.hypot(catchPt.x - d.x, catchPt.y - d.y)
    const ux = dist > 1e-6 ? (catchPt.x - d.x) / dist : 0
    const uy = dist > 1e-6 ? (catchPt.y - d.y) / dist : 0
    const towards = Math.max(0, (d.vx ?? 0) * ux + (d.vy ?? 0) * uy)
    const speed = Math.max(3, sprintSpeedMps(dp, 'defense'))
    const eff = dist - towards * MOMENTUM_CREDIT_SEC - speed * tFlight
    if (eff < defAtArrival) defAtArrival = eff
  }
  if (!Number.isFinite(defAtArrival)) return ARRIVAL_CAP_M
  // Dodatnie = odbiorca bliżej dysku niż najlepszy obrońca.
  return Math.max(-ARRIVAL_CAP_M, Math.min(ARRIVAL_CAP_M, defAtArrival - recvAtArrival))
}
/**
 * ZATKANIE LINII RZUTU — najmniejsza odległość obrońcy od odcinka rzucający → cel.
 *
 * To jest wielkość, którą realnie rozstrzyga resolver: blok pada, gdy obrońca zbliży się
 * do dysku na mniej niż 1.2 m w trakcie CAŁEGO lotu i jest przy tym ~7.7x bliżej niż
 * odbiorca. Poacher stojący w lane'ie zbija dysk, nie zbliżając się do odbiorcy ani na
 * metr — a wcześniejsze predyktory mierzyły wyścig do punktu chwytu i takiej sytuacji
 * nie widziały. Stąd trzy kolejne wersje dawały ten sam rozstęp 5 punktów między rzutami
 * udanymi a straconymi, mimo że bloki to 44.7% wszystkich strat.
 *
 * Przy rzucie górnym (OTT) dysk przechodzi NAD zawodnikami, więc zatkanie linii prawie
 * nie działa — to jest cała racja bytu hammera i scoobera.
 */
const LANE_CLEAR_M = 2.5
const LANE_BLOCK_WEIGHT = 20
const OTT_LANE_DISCOUNT = 0.15

/**
 * GDZIE wzdłuż cutu dostarczyć dysk — decyzja rzucającego, nie geometryczne maksimum.
 *
 * `predictReceiverCatchPoint` zwracała JEDEN punkt: najdalszy, do jakiego odbiorca zdąży
 * dobiec (reach = min(dystans_do_celu_cutu, prędkość · czas_lotu)). To nie jest wybór —
 * to sufit. Opcja "mocniej, ale bardziej w niego" nie przegrywała w scoringu, tylko
 * w ogóle nie powstawała. Stąd zmierzony rozkład: 65.5% rzutów to leading ze średnim
 * zyskiem 22 m, in-cut tylko 28.5% przy 6.2 m, a krótkie rzuty tkwiły na 24-32% zamiast
 * realnych 50-60%.
 *
 * Realny rzucający wybiera na tej samej trasie punkt WCZEŚNIEJSZY (krócej, twardziej,
 * mniej metrów, ale obrona nie zdąży) albo PÓŹNIEJSZY (więcej metrów, ale dłuższy lot
 * daje czas na domknięcie i na poacha). Kandydaci są oceniani tą samą walutą co same
 * opcje rzutu — zysk terenu przeciw wyścigowi do dysku i zatkaniu linii — więc wybór
 * dostarczenia i wybór odbiorcy mierzą to samo.
 *
 * Rodzaj rzutu nie jest tu jeszcze znany (inferThrowType potrzebuje dystansu, czyli
 * wyniku tej decyzji), więc linia jest oceniana bez zniżki OTT — dla rzutu górnego
 * wybór wyjdzie zachowawczo, nigdy zbyt śmiało.
 */
/**
 * Gdzie NA TRASIE CUTU dostarczyć dysk — i ile floatu to kosztuje.
 *
 * Poprzednia wersja skalowała `reach`, czyli to, co odbiorca zdąży przebiec w czasie
 * lotu. Wariant "dalej, ale z większym floatem" był w tej konstrukcji NIEWYRAŻALNY:
 * `reach` z definicji kończy się tam, gdzie odbiorca zdąży. Zmierzone — mediana
 * rozpiętości między najkrótszym a najdłuższym kandydatem wynosiła 0.00 m, a realny
 * wybór (>3 m) pojawiał się w 1.2% decyzji. Chooser był praktycznie bezczynny.
 *
 * Teraz kandydaci idą wzdłuż CAŁEJ trasy cutu, aż do jego celu, a float jest ceną:
 * dostarczenie za `reach` wymaga, by dysk leciał wolniej, bo odbiorca musi zdążyć.
 * Wymagana prędkość wynika wprost z geometrii (droga dysku / czas dobiegu odbiorcy)
 * i jest przycinana do realnego pasma — jeśli nawet najwolniejszy legalny rzut dolatuje
 * przed odbiorcą, kandydat nie jest odrzucany, tylko dostaje ujemny arrivalMargin.
 * To jest ryzyko do wyceny, nie zakaz.
 *
 * Trade-off wychodzi więc z samej fizyki, a nie z osobnej kary: dalszy punkt to więcej
 * metrów, ale dłuższy lot, więc obrona ma więcej czasu na domknięcie (arrivalMarginM)
 * i na wejście w tor (laneObstruction).
 */
/**
 * `beyondFrac` = ile z odcinka między zasięgiem odbiorcy a celem cutu wolno rzucającemu
 * wykorzystać. ZAGASZONE (0) na podstawie pomiaru, nie z braku implementacji.
 *
 * Zmierzone (tmp-sweep/predict-sweep.mjs, 8 rozproszonych seedów): 0 -> 92.0% completion
 * i hold 48.4; 0.5 -> 86.7 / 33.5; 1 -> 85.7 / 32.2. Kara za zbiegającą się pomoc miała
 * to naprawić i pogorszyła (79.9% przy wadze 9, 77.1% przy 20) — hipoteza obalona.
 *
 * Powód jest po stronie ATAKU, nie tej decyzji: mediana najgłębszego atakującego to
 * 21.4 m od dysku, a opcja ≥35 m istnieje w 0.9% rzutów. "Dalej z floatem" ma sens tylko
 * wtedy, gdy odbiorca ma dokąd biec — bez głębokich cutów oznacza rzut ZA zawodnika,
 * który tnie krótko, i to jest zły rzut także w realnym ultimate. Wrócić do tego po
 * naprawie głębokiego ustawienia ataku.
 */
/**
 * Ile z prędkości odbiorcy wolno założyć przy sprawdzaniu, czy zdąży na punkt
 * dostarczenia. 0.85 = musi mu zostać 15% zapasu.
 *
 * Bez tego sprawdzenia rzucający wybierał punkty, do których NIKT nie docierał.
 * Zmierzone z resolvera (tmp-sweep/geom-truth.mjs, 702 rzuty): w paśmie 20-30 m tylko
 * 40.8% rzutów kończyło się chwytem, a przy stratach odbiorca był w najbliższym
 * momencie lotu 9.42 m od dysku, najbliższy obrońca 8.91 m, a chybienie rzucającego
 * 0.00 m. Dysk leciał dokładnie tam, gdzie celowano — tyle że w pustkę.
 */
const DELIVERY_FEASIBLE_FRAC = 0.85
export const DELIVERY = { yardWeight: 1.6, beyondFrac: 0 }

function chooseDeliveryPoint(agent, throwerX, throwerY, defenders, possessionTeam, path) {
  const { reach, toTarget } = path
  const beyond = Math.max(0, toTarget - reach)
  const far = beyond * DELIVERY.beyondFrac
  const dists = [reach * 0.5, reach, reach + far * 0.5, reach + far]
  const recvSpeed = Math.max(3, sprintSpeedMps(agent.player ?? agent, 'offense'))
  const throwerPos = { x: throwerX, y: throwerY }
  let best = null
  let bestScore = -Infinity
  for (let i = 0; i < dists.length; i += 1) {
    const d = dists[i]
    if (i > 0 && d - dists[i - 1] < 0.4) continue
    const pt = pointAlongCut(path, d)
    const pathDist = Math.hypot(pt.x - throwerX, pt.y - throwerY)
    // Ile czasu potrzebuje odbiorca, żeby tam być — i jak wolno musi lecieć dysk.
    const neededSec = Math.max(0.3, d / recvSpeed)
    const band = speedRangeFor(pathDist >= HUCK_MIN_M ? 'deep' : null)
    // Prędkość "idealnego czasowania" — dysk dolatuje wtedy, gdy odbiorca tam jest.
    // Ma sens jako WYBÓR tylko dla dostarczenia ZA zasięg odbiorcy, gdzie float jest
    // ceną za metry. Bliżej niż `reach` ta formuła saturuje na górze pasma (krótki
    // dobieg = duża wymagana prędkość), więc narzucanie jej wykonaniu skasowałoby float
    // z całej gry — także z in-cutów, gdzie tempo dobiera paceFracFor. Zmierzone:
    // completion 92.4% -> 89.5% nawet przy zerowym zasięgu za `reach`.
    const needsFloat = d > reach + 0.1
    const timed = Math.min(band.max, Math.max(band.min, pathDist / neededSec))
    const speed = needsFloat ? timed : null
    const evalSpeed = speed ?? pacedSpeedMps(pathDist >= HUCK_MIN_M ? 'deep' : null, agent, throwerX, throwerY)
    // WYKONALNOŚĆ: czy odbiorca w ogóle zdąży, licząc REALNYM czasem lotu tego rzutu.
    // Kandydat, na który musiałby biec szybciej niż potrafi, nie jest opcją ryzykowną —
    // jest niewykonalny, i rzucający ma go nie rozważać.
    const tFlight = pathDist / Math.max(1, evalSpeed)
    const needMps = d / Math.max(0.15, tFlight)
    if (needMps > recvSpeed * DELIVERY_FEASIBLE_FRAC) continue
    const gain = forwardProgressMeters(throwerX, pt.x, possessionTeam)
    const arrival = arrivalMarginM(agent, pt, defenders, throwerPos, evalSpeed)
    const lane = laneObstruction(throwerX, throwerY, pt, defenders, null, evalSpeed)
    const score =
      gain * DELIVERY.yardWeight +
      arrival * ARRIVAL_WEIGHT -
      lane * LANE_BLOCK_WEIGHT
    if (score > bestScore) { bestScore = score; best = { x: pt.x, y: pt.y, flightSpeedMps: speed } }
  }
  // Nic wykonalnego — dysk pod nogi odbiorcy, zamiast w przestrzeń, do której nie dobiegnie.
  return best ?? { x: agent.x, y: agent.y, flightSpeedMps: null }
}

function laneObstruction(fromX, fromY, catchPt, defenders, throwType, flightSpeedMps = null) {
  const dx = catchPt.x - fromX
  const dy = catchPt.y - fromY
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return 0
  const throwDist = Math.sqrt(len2)
  const tFlight = throwDist / (flightSpeedMps ?? discSpeedFor(throwDist, null, fromX, fromY))
  let worst = 0
  for (const d of defenders) {
    // Rzut ocenia PRZECIĘCIE TORU, nie obecność w nim teraz. Dysk potrzebuje tFlight,
    // żeby przelecieć — obrońca ma tyle samo czasu, żeby wejść w linię. Sprawdzamy więc
    // jego pozycję w chwili, w której dysk mija dany punkt toru: nadbiegający poacher
    // staje się widoczny, zanim fizycznie tam stanie.
    let t = ((d.x - fromX) * dx + (d.y - fromY) * dy) / len2
    if (t <= 0.05 || t >= 0.98) continue
    t = Math.max(0, Math.min(1, t))
    const px = fromX + dx * t
    const py = fromY + dy * t
    const tAt = tFlight * t
    const dpx = d.x + (d.vx ?? 0) * tAt
    const dpy = d.y + (d.vy ?? 0) * tAt
    const gap = Math.hypot(dpx - px, dpy - py)
    if (gap >= LANE_CLEAR_M) continue
    const severity = 1 - gap / LANE_CLEAR_M
    if (severity > worst) worst = severity
  }
  return throwType === THROW_TYPE.OVER_THE_TOP ? worst * OTT_LANE_DISCOUNT : worst
}

/**
 * TRUDNOŚĆ ŁAMANIA MARKU — cel po stronie, którą marker zasłania.
 *
 * Marker stoi po jednej stronie rzucającego i to on definiuje open side. Rzut na drugą
 * stronę wymaga obejścia go i jest realnie trudniejszy — tym mniej, im lepiej rzucający
 * łamie mark. Dotąd `isOpenSide` było binarne i wchodziło jako drobna premia; tutaj jest
 * ciągłe i zależne od faktycznego ustawienia markera oraz umiejętności zawodnika.
 */
const BREAK_DIFFICULTY_WEIGHT = 12

function breakDifficulty(thrower, throwerPos, marker, catchPt) {
  if (!marker || !throwerPos) return 0
  const mx = marker.x - throwerPos.x
  const my = marker.y - throwerPos.y
  const mlen = Math.hypot(mx, my)
  if (mlen < 1e-6) return 0
  const tx = catchPt.x - throwerPos.x
  const ty = catchPt.y - throwerPos.y
  const tlen = Math.hypot(tx, ty)
  if (tlen < 1e-6) return 0
  // 1 = cel dokładnie za markerem, -1 = po przeciwnej stronie.
  const alignment = (mx * tx + my * ty) / (mlen * tlen)
  if (alignment <= 0) return 0
  const breakSkill =
    subStat(thrower, 'throwing', 'breakMark') ||
    (subStat(thrower, 'throwing', 'backhand') + subStat(thrower, 'throwing', 'forehand')) / 2
  const skillRelief = Math.max(0, Math.min(1, (breakSkill - 55) / 40))
  // Ciasny mark boli bardziej niż luźny.
  const tightness = Math.max(0, Math.min(1, (3.5 - mlen) / 3.5))
  return alignment * (1 - skillRelief * 0.7) * (0.45 + tightness * 0.55)
}

export function scanThrowOptions(thrower, offenseAgents, defenseAgents, ctx) {
  const {
    disc,
    stallCount = 1,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    possessionTeam = 'home',
    wind = null,
    rng,
    setupElapsedMs = 0,
    postCatchReorg = false,
    lastThrowerId = null,
    hardStallCount = stallCount,
    requireForwardPass = false,
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle = DEFENSE_STYLES.PERSON,
    offenseTactics = null,
  } = ctx

  const threshold = acceptanceThresholdForStall(
    stallCount,
    acceptanceThreshold(stallCount, thrower, offenseTactics),
  )
  const tier = stallTier(stallCount)
  const scanRadius = throwScanRadiusM(thrower)
  const throwerPos = throwerPosition(offenseAgents, thrower)
  const throwerMods = mergeTraitAndCoachMods(thrower, offenseTactics, 'offense')
  // Marker to obrońca stojący najbliżej rzucającego — on definiuje open/break side.
  let markerAgent = null
  if (throwerPos && defenseAgents?.length) {
    let bd = Infinity
    for (const d of defenseAgents) {
      const dd = Math.hypot(d.x - throwerPos.x, d.y - throwerPos.y)
      if (dd < bd) { bd = dd; markerAgent = d }
    }
  }
  const sepPolicy = {
    separationReqDeltaM: throwerMods.separationReqDeltaM ?? 0,
    openLookBias: throwerMods.openLookBias ?? 0,
    breakSideSepReqDeltaM: throwerMods.breakSideSepReqDeltaM ?? 0,
  }
  const continuationWindow =
    postCatchReorg &&
    setupElapsedMs < CONTINUATION_WINDOW_MS &&
    stallCount <= 1

  const offensePositions = offenseAgents.map((a) => ({
    player: a.player,
    x: a.x,
    y: a.y,
  }))
  const defensePositions = defenseAgents.map((a) => ({
    player: a.player,
    x: a.x,
    y: a.y,
    // vx/vy: rzucający czyta tempo domykania luki (patrz closingMps w spatialEvaluator).
    vx: a.vx ?? 0,
    vy: a.vy ?? 0,
  }))

  const options = []
  for (const agent of offenseAgents) {
    if (agent.player.id === thrower.id) continue
    // CLEARING = zawodnik zakończył próbę cutu i wraca do formacji. Rzut GŁĘBOKI do
    // kogoś takiego jest nierealny (nie patrzy na dysk, odchodzi od gry) — stąd
    // pierwotne, całkowite wykluczenie. Okazało się jednak zbyt szerokie: pomiar
    // (tmp-scan-diag.mjs) pokazał, że 80,2% WSZYSTKICH rozważanych opcji odpadało
    // właśnie tutaj, bo handler resetowy prawie zawsze jest w CLEARING — przez co atak
    // w pełnym silniku nie miał do kogo zresetować i grał wyłącznie do przodu (3,3%
    // resetów przy realnych 25-35%). W realnym ultimate handler, który właśnie wyszedł
    // z lane'u, jest dokładnie tym, do kogo się resetuje. Kompromis: BLISKI reset do
    // clearującego jest dozwolony, daleki rzut w pole — nadal nie.
    if (agent.state === CUTTER_STATE.CLEARING) {
      const dx = (agent.x ?? 0) - (throwerPos?.x ?? disc?.x ?? 0)
      const dy = (agent.y ?? 0) - (throwerPos?.y ?? disc?.y ?? 0)
      if (Math.hypot(dx, dy) > CLEARING_RESET_MAX_M) continue
    }
    // Szeroki sufit czasu predykcji (DEEP_CUT_*) tylko gdy WYNIK predykcji sam z siebie
    // zasługuje na huck-owe traktowanie — nie po cutKind='deep' ani po surowym dystansie
    // do CELU cutu. cutKind opisuje KSZTAŁT trasy cuttera, nie dystans rzutu: mnóstwo
    // deep-cutów kończy się throwType STANDARD (< HUCK_MIN_M), a bramka po surowym
    // dystansie do celu wciąż dawała im 8.5s sufitu (bo SUROWY cel bywa ≥40m, nawet gdy
    // realny catchPt po ograniczonym reach wychodzi dużo bliżej) — przewidziany lead 20m+
    // przy realnym (szybkim) locie ~2-3s, odbiorca fizycznie nie mógł dobiec (zmierzone:
    // tmp-standard-gap-diag.mjs, 9.6% rzutów standard geometrycznie zawodzi, mediana
    // predictedLeadDist ~20.6m, ACTIVE_CUT dominuje). Samouzgodnione dwuprzebiegowe
    // podejście: licz najpierw z CIASNYM sufitem (domyślne założenie — większość rzutów
    // NIE jest huckiem); jeśli WYNIK i tak wychodzi ≥HUCK_MIN_M od rzucającego,
    // dopiero wtedy przelicz z hojnym sufitem (i tak zostanie zaklasyfikowany jako huck
    // przez inferThrowType niżej, więc zasługuje na realistyczną, nie ucinaną predykcję).
    const throwerX = throwerPos?.x ?? disc?.x ?? agent.x
    const throwerY = throwerPos?.y ?? disc?.y ?? agent.y
    // Trasa cutu liczona RAZ (iteracja z tłumieniem w środku), a dopiero na niej
    // rzucający wybiera punkt dostarczenia. Dwuprzebiegowy dobór sufitu jak wyżej:
    // hojny sufit tylko wtedy, gdy sam CEL cutu leży huckowo daleko.
    let path = receiverCutPath(agent, throwerX, throwerY)
    const farPt = pointAlongCut(path, path.toTarget)
    if (Math.hypot(farPt.x - throwerX, farPt.y - throwerY) >= HUCK_MIN_M) {
      path = receiverCutPath(
        agent,
        throwerX,
        throwerY,
        DEEP_CUT_FLIGHT_SPEED_MPS(),
        DEEP_CUT_MAX_LEAD_SEC,
      )
    }
    const catchPt = chooseDeliveryPoint(
      agent,
      throwerX,
      throwerY,
      defenseAgents,
      possessionTeam,
      path,
    )
    // Ile zajmie odbiorcy dobiegnięcie do punktu chwytu — o tyle samo przesuwamy
    // obrońców w evaluatePlayerSituation, żeby separacja była liczona spójnie w czasie.
    const leadDist = Math.hypot(catchPt.x - agent.x, catchPt.y - agent.y)
    const leadTimeSec = leadDist / Math.max(3.5, maxSpeedMps(agent.player))
    const situation = evaluatePlayerSituation(agent.player, {
      x: catchPt.x,
      y: catchPt.y,
      leadTimeSec,
      offensePositions,
      defensePositions,
      disc,
      forceSide,
      possessionTeam,
      throwerPos,
    })

    const distFromThrower =
      throwerPos != null
        ? Math.hypot(catchPt.x - throwerPos.x, catchPt.y - throwerPos.y)
        : situation.discDist
    if (distFromThrower > scanRadius) continue

    const isDump = agent.isDump === true
    const isContinuationCut =
      agent.state === CUTTER_STATE.ACTIVE_CUT ||
      agent.state === CUTTER_STATE.INITIATING_CUT ||
      agent.continuationCut === true
    const speed = Math.hypot(agent.vx ?? 0, agent.vy ?? 0)

    if (continuationWindow && !isDump && !isContinuationCut && speed < 0.35) {
      continue
    }

    const forwardProgress =
      throwerPos != null
        ? forwardProgressMeters(throwerPos.x, catchPt.x, possessionTeam)
        : 0

    // Zakaz odbicia dysku do poprzedniego rzucającego bez zysku — to źródło pętli A→B→A.
    // Zwalnia dopiero realny (nie eskalowany) stall, żeby eskalacja nie odblokowała pętli.
    const isEchoBack = lastThrowerId != null && agent.player.id === lastThrowerId
    // Reset jest wyjątkiem od obu filtrów niżej: rzucający ZAWSZE musi widzieć dumpa.
    // W ultimate handler ma reset w polu widzenia przez cały czas liczenia — to jego
    // wyjście awaryjne i podstawa flow, a nie opcja, którą się odsiewa regułą. Wcześniej
    // `requireForwardPass` (blokada po serii podań bez postępu) i zakaz odbicia do
    // poprzedniego rzucającego potrafiły usunąć dumpa z rozważanych opcji — a rzucający
    // rozważa ich średnio tylko 1.89 z 6, więc każdy taki filtr realnie waży.
    if (!isDump) {
      if (isEchoBack && forwardProgress < 3 && hardStallCount < 8) continue
      // Po serii podań bez postępu jedyną dopuszczalną opcją jest zysk terenu.
      if (requireForwardPass && hardStallCount < 8 && forwardProgress < 2.5) continue
    }

    if (
      !optionPassesStallPolicy(
        situation.separation,
        stallCount,
        forwardProgress,
        isDump,
        distFromThrower,
        sepPolicy,
        situation.isOpenSide,
      )
    ) {
      continue
    }

    const fromX = throwerPos?.x ?? disc?.x ?? catchPt.x
    const fromY = throwerPos?.y ?? disc?.y ?? catchPt.y
    const traffic = evaluateThrowTraffic({
      fromX,
      fromY,
      toX: catchPt.x,
      toY: catchPt.y,
      receiverId: agent.player.id,
      throwerId: thrower.id,
      offenseAgents,
      defenseAgents,
      stallCount,
      thrower,
    })

    // Skrajna grupa przy wysokim awareness — sporadycznie odrzuć na stallu 1–3.
    if (
      stallCount < 4 &&
      !isDump &&
      (traffic.teammateCrowd ?? 0) >= 3.2 &&
      (traffic.awareness ?? 0) > 0.8
    ) {
      continue
    }

    let score = situation.throwWindowScore
    if (continuationWindow && isContinuationCut) {
      score += 22 + speed * 4
      if (agent.state === CUTTER_STATE.ACTIVE_CUT) score += 12
    }


    // Reset/dump nie jest w realnym ultimate wyłącznie ratunkiem przy wysokim stallu —
    // to normalny element flow (~25-35% wszystkich podań na poziomie club elite; patrz
    // pasma w scripts/engine-parity.mjs). Pełny silnik wypuszczał dysk przy medianie
    // stallu 2, więc bonus zarezerwowany dla tier medium/high praktycznie nigdy nie
    // działał i resety stanowiły 1,4% rzutów — atak grał wyłącznie do przodu.
    if (isDump) score += tier === 'high' || tier === 'medium' ? 18 : 14
    if (tier === 'low' && situation.separation < 4) score *= 0.55
    if (tier === 'high') score += 8

    const throwType = inferThrowType(
      { player: agent.player, situation, isDump },
      distFromThrower,
      stallCount,
      forwardProgress,
      thrower,
      rng,
    )

    const tech = resolveThrowTechniqueForPlayer(thrower, {
      forceSide,
      isOpenSide: situation.isOpenSide,
      throwerY: throwerPos?.y,
    })
    if (tech.technique === 'forehand' && situation.isOpenSide) score += 6
    if (tech.accuracyMult < 1) score -= (1 - tech.accuracyMult) * 40

    {
      const fromX = throwerPos?.x ?? disc?.x ?? 0
      const fromY = throwerPos?.y ?? disc?.y ?? 0
      const windAdj = windOptionScoreAdjust({
        wind,
        throwDx: catchPt.x - fromX,
        throwDy: catchPt.y - fromY,
        throwType,
        forwardProgress,
        isDump,
        thrower,
        possessionTeam,
        distanceM: distFromThrower,
        stallCount,
      })
      score += windAdj.scoreDelta
    }
    score -= stallComposureAccuracyPenalty(stallCount, thrower) * 0.2

    // PREDYKTOR: kto będzie przy dysku pierwszy. Człon dominujący, bo to jest realne
    // kryterium rozstrzygnięcia rzutu — reszta wag opisuje wartość, nie wykonalność.
    const fxT = throwerPos?.x ?? disc?.x ?? 0
    const fyT = throwerPos?.y ?? disc?.y ?? 0
    const laneVal = laneObstruction(fxT, fyT, catchPt, defenseAgents, throwType, catchPt.flightSpeedMps)
    const breakVal = breakDifficulty(thrower, throwerPos, markerAgent, catchPt)
    const arrivalVal = arrivalMarginM(agent, catchPt, defenseAgents, throwerPos, catchPt.flightSpeedMps)
    const phaseVal = separatingPhase(agent, defenseAgents)
    score -= laneVal * LANE_BLOCK_WEIGHT
    score -= breakVal * BREAK_DIFFICULTY_WEIGHT
    score += arrivalVal * ARRIVAL_WEIGHT
    score += phaseVal * SEPARATING_PHASE_WEIGHT

    score = evaluateThrowOptionScore(score, {
      forwardProgress,
      stallCount,
      separation: situation.separation,
      isDump,
      isOpenSide: situation.isOpenSide,
      throwWindowScore: situation.throwWindowScore,
      throwDistanceM: distFromThrower,
      // Czy ten odbiór to punkt — catchPt za linią bramkową strony atakującej.
      scoresPoint:
        (catchPt.x - opponentGoalLineM(possessionTeam)) *
          attackDirectionX(possessionTeam) >=
        0,
      receiverY: catchPt.y,
      decisionMaking: subStat(thrower, 'mental', 'decisionMaking'),
    })

    if (!situation.isOpenSide) {
      score += (throwerMods.breakSideOptionBonus ?? 0) * 100
      score *= throwerMods.breakSideWeightMult ?? 1
    }

    // Safe vs creative: pewne okna vs ryzyko otwierające boisko.
    {
      const sep = situation.separation ?? 0
      const window = situation.throwWindowScore ?? 0
      const safe = throwerMods.safeOptionBias ?? 0
      const creative = throwerMods.creativeRiskBias ?? 0
      if (safe > 0) {
        if (sep < 2.8) score -= safe * 28
        else if (sep >= 4.5) score += safe * 12
        if (window < 0.35) score -= safe * 18
        if (isDump) score += safe * 10
      }
      if (creative > 0) {
        if (!situation.isOpenSide) score += creative * 16
        if (throwType === THROW_TYPE.OVER_THE_TOP) score += creative * 22
        if (sep >= 2.2 && sep < 4.2) score += creative * 14
        if (window >= 0.25 && window < 0.55) score += creative * 10
      }
    }

    // Preferuj czystą przestrzeń / unikaj grupy — lekka kara, stall 1–3 ostrzejsza.
    {
      const aw = traffic.awareness ?? 0.5
      const early = stallCount < 4
      score -= traffic.teammateCrowd * aw * (early ? 4 : 2)
      score -= traffic.laneThreat * aw * (early ? 8 : 4)
      if (early && distFromThrower <= 16) {
        score += Math.min(4, traffic.space * aw * 3)
      }
    }

    // Deep look (≥ DEEP_LOOK_MIN_M): appetite premiuje czyste i półotwarte okna.
    // Medium deep (18–30 m) dostaje lekki skill bias.
    {
      const sep = situation.separation ?? 0
      const huckSkill = subStat(thrower, 'throwing', 'huck')
      const isHuckRange =
        throwType === THROW_TYPE.HUCK ||
        forwardProgress >= DEEP_LOOK_MIN_M ||
        distFromThrower >= DEEP_LOOK_MIN_M

      if (isHuckRange) {
        score += (huckSkill - 50) * 0.2
        const openDeep = sep >= 4.5
        const goodDeep = sep >= 3.0
        if (openDeep || goodDeep) {
          const appetiteFactor = openDeep ? 1 : 0.55
          score += (huckSkill - 50) * 0.2 * appetiteFactor
          score += (openDeep ? 14 : 7) * appetiteFactor
          const w = throwerMods.huckWeightMult ?? 1
          score *= 0.82 + 0.18 * (1 + (w - 1) * appetiteFactor)
          score += (throwerMods.huckAcceptanceDelta ?? 0) * 40 * appetiteFactor
          const hero = throwerMods.heroThrowWeightMult ?? 1
          score *= 1 + (hero - 1) * appetiteFactor
          score += (throwerMods.scoringOptionBonus ?? 0) * 50 * appetiteFactor
        } else if (sep < 2.5) {
          score -= 6
        }
      } else if (forwardProgress >= 18 || distFromThrower >= 20) {
        score += (huckSkill - 50) * 0.14
        if (sep >= 3.2) score += 3
      }
    }

    if (isDump) {
      score *= throwerMods.dumpWeightMult ?? 1
      score += (throwerMods.dumpEarlyBias ?? 0) * 18
      score -= Math.max(0, throwerMods.scoringOptionBonus ?? 0) * 25
    }

    // Poach: porzucony receiver jest złotem; rzut w lane poachera — pułapka.
    // Faza 5 planu 3D: odkąd geometryczny resolve (Faza 4b, actionSimulator.js:
    // computeGeometricResolution) realnie kredytuje NAJBLIŻSZEGO obrońcę (nie tylko
    // statycznie przypisaną markę) — poacher bliżej dysku niż receiver naprawdę
    // przejmuje blok, fizycznie, bez udziału tego bonusu/kary. Kara za rzut w lane
    // poachera (-22) liczyłaby to ryzyko PODWÓJNIE (raz tu jako "zła decyzja", raz
    // realnie jako fizyczna konsekwencja) — zmniejszona o połowę, zostaje jako czysty
    // sygnał jakości decyzji (czy thrower w ogóle WIDZI poacha), nie substytut fizyki.
    // Bonus za trafienie w porzuconego receivera zostaje bez zmian — to wciąż dobra
    // decyzja do nagrodzenia, nie podwójne liczenie tego samego ryzyka.
    const poachers = defenseAgents.filter((d) => d.state === DEFENDER_STATE.POACHING)
    for (const p of poachers) {
      const abandonedId = p.poachedFromId
      if (abandonedId != null && agent.player.id === abandonedId) {
        score += 28
      }
      const nearPoach = Math.hypot(catchPt.x - p.x, catchPt.y - p.y) < 4.5
      if (nearPoach && agent.player.id !== abandonedId) score -= 11
    }

    score = applyAttackThrowBias(score, {
      attackStyle,
      forceSide,
      defenseStyle,
      forwardProgress,
      throwDistanceM: distFromThrower,
      isDump,
      separation: situation.separation,
      isOpenSide: situation.isOpenSide,
      receiverY: catchPt.y,
    })

    // Ocena jest subiektywna: to, jak trafnie zawodnik porówna opcje, zależy od
    // decisionMaking i composure. Słabszy myli dobre podanie z ryzykownym.
    score += (rng.float() * 2 - 1) * decisionNoiseAmplitude(thrower, stallCount)

    options.push({
      agent,
      laneVal,
      breakVal,
      arrivalVal,
      phaseVal,
      player: agent.player,
      score,
      salience:
        (isDump ? 30 : 0) +
        (isContinuationCut ? 25 : 0) +
        Math.max(0, 40 - distFromThrower) +
        (situation.separation ?? 0) * 4 +
        // Bez tego każda opcja ≥ DEEP_LOOK_MIN_M dostawała 0 z członu
        // odległości (Math.max(0, 40-dist)) i niemal zawsze odpadała z limitu
        // percepcji (perceivedOptionLimit) przed samym scoringiem — huck nigdy
        // nie trafiał do `considered`, więc nigdy nie mógł zostać wybrany. Skala
        // rośnie z separacją: NAPRAWDĘ otwarty głęboki odbiorca (duży separation)
        // rzuca się w oczy tak samo mocno jak bliska opcja z dobrym oknem — bez
        // tego cele 55m+ (generowane regularnie przez cutterBrain) nigdy nie
        // przetrwały limitu percepcji wobec kilku bliższych konkurentów.
        (distFromThrower >= DEEP_LOOK_MIN_M && (situation.separation ?? 0) >= 3
          ? 20 + (situation.separation ?? 0) * 6
          : 0),
      situation,
      traffic,
      laneThreats: traffic.laneThreats,
      throwType,
      isDump,
      isContinuationCut,
      forwardProgress,
      catchX: catchPt.x,
      catchY: catchPt.y,
      // Float wybrany razem z punktem dostarczenia — wykonanie musi go uszanować,
      // inaczej rzut "dalej, ale miękko" doleci twardo i odbiorca go nie zastanie.
      flightSpeedMps: catchPt.flightSpeedMps,
      throwTechnique: tech.technique,
      techniqueMods: tech,
      isOpenSide: situation.isOpenSide,
    })
  }

  // Zawodnik z niskim vision nie ogarnia całego boiska — rozważa tylko opcje
  // najbardziej rzucające się w oczy (bliskie, dump, cutter już w ruchu).
  const optionLimit = perceivedOptionLimit(thrower)
  const considered =
    options.length > optionLimit
      ? [...options].sort((a, b) => b.salience - a.salience).slice(0, optionLimit)
      : options

  if (globalThis.__ACCDIAG) {
    const D = globalThis.__ACCDIAG
    const acc = considered.filter((o) => o.score >= threshold).length
    D.hist[Math.min(6, acc)] = (D.hist[Math.min(6, acc)] ?? 0) + 1
    D.n += 1
    D.optionsSeen += considered.length
  }
  considered.sort((a, b) => b.score - a.score)
  const best = considered[0]
  if (!best) return null

  // Diagnostyka: czy reset był w ogóle na stole i ile był wart.
  {
    const dumps = considered.filter((o) => o.isDump)
    const bd = dumps.length ? dumps.reduce((x, y) => (y.score > x.score ? y : x)) : null
    for (const o of considered) {
      o.resetAvailable = !!bd
      o.resetScore = bd ? bd.score : null
      o.acceptThreshold = threshold
    }
  }

  // Kontynuacja obniża próg tylko przy realnym flow cutcie, nie przy każdym catchu.
  const flowLook = continuationWindow && best.isContinuationCut
  const contThreshold = threshold - (flowLook ? 12 : 0)

  if (stallCount < 4 && best.isDump && (best.forwardProgress ?? 0) < 1) {
    const forwardOpt = considered.find(
      (o) =>
        !o.isDump &&
        (o.forwardProgress ?? 0) >= 3 &&
        o.score >= contThreshold - 12,
    )
    if (forwardOpt) return forwardOpt
  }
  if (
    stallCount < 4 &&
    (best.forwardProgress ?? 0) < 0.5 &&
    !best.isDump
  ) {
    const ahead = considered.find((o) => (o.forwardProgress ?? 0) >= 4 && o.score >= contThreshold - 8)
    if (ahead) return ahead
  }

  if (tier === 'high' && best.isDump && best.score >= contThreshold - 12) {
    return best
  }
  if (stallCount >= 7 && best.forwardProgress >= 1 && best.score >= contThreshold - 22) {
    return best
  }
  if (best.score >= contThreshold) return best
  if (flowLook && best.score >= contThreshold - 10) return best
  if (tier === 'high' && considered.find((o) => o.isDump && o.score >= contThreshold - 15)) {
    return considered.find((o) => o.isDump)
  }
  return null
}

export function separationFromSituation(situation, rng, stallCount = 1) {
  // Wspólna klasyfikacja z separation.js — te same progi w metrach co w fastMode.
  // Wcześniej były tu zduplikowane progi (>5.5 / >3) obok osobnych, punktowych progów
  // w resolveSeparation, więc „tight" znaczyło w obu silnikach co innego.
  return classifySeparationM(situation.separation ?? 0, rng, stallCount)
}
