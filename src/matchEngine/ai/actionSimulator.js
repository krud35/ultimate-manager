import {
  layoutPlayersOnField,
  resolveFieldTactics,
  resolveMarkForceSide,
  discMetersFromState,
} from '../fieldViz.js'
import { forceMarkLayoutSide } from '../throwTechnique.js'
import { fieldCenterY } from '../fieldDimensions.js'
import { evaluatePlayerSituation } from './spatialEvaluator.js'
import { createCutterAgent, tickCutterBrain, CUTTER_STATE } from './cutterBrain.js'
import { scanThrowOptions, separationFromSituation } from './throwerBrain.js'
import { throwReleaseGateMs } from './throwerDecision.js'
import { tickDefenseAgent, DEFENDER_STATE, forceMarkPosition } from './defenderBrain.js'
import { defenderForPersonMark, isPersonDefense } from '../participants.js'
import { THROW_TYPE, throwProfile } from '../throwTypes.js'
import { discPositionHeld, discPositionInFlight } from '../discState.js'
import {
  predictReceiverCatchPoint,
  DEEP_CUT_FLIGHT_SPEED_MPS,
  DEEP_CUT_MAX_LEAD_SEC,
} from './discFlightPredict.js'
import {
  createFlightContext,
  sampleFlightDisc,
  tickFlightContestAgent,
  tickOffenseAgentDuringFlight,
  flightComplete,
  applyFlightResolutionToAgents,
  finalDiscAfterFlight,
  interceptForFlight,
  sprintSpeedMps,
  LAYOUT_DIST_M,
} from './flightKinematics.js'
import { paceFracFor } from './flightSpeed.js'
import {
  drainAgentsTickStamina,
  syncPlayerFromStaminaMap,
} from '../stamina.js'
import { maxConcurrentCutters, throwReleaseGateMultiplier, throwerPatienceBonusMs } from './tacticsBehavior.js'
import { attackMods } from '../tacticsModifiers.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import {
  STALL_MAX,
  STALL_SECOND_MS,
  stallCountFromHoldMs,
  decisionStallFromHoldMs,
  isStallOutHoldMs,
} from '../stall.js'
import { subRoleForAgent, HANDLER_SUB_ROLES } from '../playerSubRoles.js'
import { HUCK_MIN_M } from '../matchStats.js'
import { buildSpaceMap } from './spaceMap.js'
import { subStat } from './statFormulas.js'
import {
  catchHeightM,
  catchSuccessChance,
  defenderReactionDelayMs,
  standingReachM,
  horizontalReachM,
  maxAerialReachM,
} from './statFormulas.js'
import { getTraitMods } from '../../models/playerTraits.js'

export const SIM_TICK_MS = 20
/** Stały krok symulacji (50 Hz); jedna ciągła pętla setup → lot */
const DT_SEC = SIM_TICK_MS / 1000
/** Pełny stall-out = 10 s krycia. */

/** Co ile ms obrona przewartościowuje, której przestrzeni broni (ludzkie tempo, nie 50 Hz). */
const DEFENSE_REASSESS_MS = 300
/** Próg percepcji rzucającego — jak często w ogóle przegląda boisko (ms). */
const THROWER_SCAN_MS = 250
/** O ile sekund poacher musi być SZYBSZY od odbiorcy, żeby uznać wypad za opłacalny. */
const POACH_BEAT_MARGIN_SEC = 0.25
/** Sufit szansy, że obrońca w ogóle dostrzeże okazję do poacha na lecący dysk. */
const POACH_NOTICE_MAX = 0.75
const MAX_SETUP_MS = STALL_MAX * STALL_SECOND_MS + SIM_TICK_MS
// Musi być >= sufitu totalFlightMs w createFlightContext (flightKinematics.js) + margines,
// inaczej dłuższe loty (miękkie, dalekie rzuty) nie mieszczą się w budżecie ticków.
const MAX_FLIGHT_MS = 9700
/**
 * Jeśli obrońca jest dalej od swojej marki niż ten dystans na starcie rzutu,
 * doklejamy go do shade (inaczej po reorganizacji O / turnoverze „gubi” człowieka).
 */
const DEFENSE_REANCHOR_GAP_M = 5.5
/** Faza 4a (shadow mode): okno przed złapaniem, w którym śledzimy realną odległość 3D
 * każdego obrońcy/receivera do dysku — zbliżone do LAYOUT_TIME_MS (kiedy layout/skok
 * może się realnie zdarzyć). */
const CONTEST_WINDOW_MS = 260
/** Do tylu metrów od dysku obrońca realnie utrudnia CHWYT (ręce przy dysku), w odróżnieniu
 *  od szerszego catchReachM, który mówi tylko „ktoś tam był". */
const CONTESTED_CATCH_DIST_M = 1.0
/**
 * Okno śledzenia KTO MOŻE SIĘGNĄĆ DYSKU — celowo szersze niż CONTEST_WINDOW_MS.
 *
 * CONTEST_WINDOW_MS (260 ms) opisuje moment lądowania: dysk jest wtedy na ~0.3 m i
 * wysokość nie znaczy tam nic. Realna walka o hucka rozstrzyga się wyżej i wcześniej —
 * dysk schodzi przez 3.5 m mniej więcej pół sekundy przed lądowaniem i bierze go ten,
 * kto sięga tam pierwszy. Żeby ten moment w ogóle zobaczyć, trzeba patrzeć szerzej.
 */
const AERIAL_WINDOW_MS = 900

function agentPlayerId(agent) {
  return agent?.player?.id ?? agent?.id ?? null
}

/**
 * Jak daleko zawodnik był od dysku — mierzone od jego RĄK, nie od stóp.
 *
 * Dopóki lot kończył się na z=0, „odległość 3D od stóp" była dobrym przybliżeniem. Teraz
 * dysk dochodzi na wysokość chwytu (discDeliveryHeightM), więc mierzenie od ziemi
 * doliczałoby każdemu ~1.2 m kary za to, że dysk w ogóle jest w powietrzu. Nadwyżka
 * ponad wygodną wysokość chwytu (i ponad aktualne wybicie) liczy się normalnie — to
 * właśnie ona sprawia, że wysoko wiszący dysk jest dla niższego dalej.
 */
function discReachGapM(agent, player, discSample) {
  const dz = Math.max(
    0,
    (discSample.z ?? 0) - catchHeightM(player ?? agent?.player) - (agent.z ?? 0),
  )
  return Math.hypot(discSample.x - agent.x, discSample.y - agent.y, dz)
}

// Faza 4a (shadow mode) — opcjonalny log diagnostyczny do porównania geometrii z
// abstrakcyjnym resolveThrow bez dotykania point.js/kontraktu gry. Zero kosztu gdy nikt
// nie woła __getShadowContestLog (tmp-*.mjs harness). Nie jest to stan gry.
let __shadowContestLog = []
export function __getShadowContestLog() {
  return __shadowContestLog
}
export function __clearShadowContestLog() {
  __shadowContestLog = []
}

/**
 * Faza 4a (shadow mode) — zwija zebrane w oknie kontestu minimalne odległości 3D w jeden
 * podsumowujący obiekt do porównania z abstrakcyjnym resolveThrow (flight.resolution).
 * Czysto diagnostyczne: nic z tego nie wraca do gry ani nie zmienia stanu meczu.
 */
function summarizeShadowContest(shadowContest, flight) {
  if (!shadowContest || !flight) return null
  let nearestDefenderId = null
  let nearestDefenderMinDist3D = Infinity
  for (const [id, d] of shadowContest.defenders) {
    if (d < nearestDefenderMinDist3D) {
      nearestDefenderMinDist3D = d
      nearestDefenderId = id
    }
  }
  const assignedDefenderMinDist3D = shadowContest.defenders.get(flight.defenderId) ?? null
  const receiverMinDist3D = Number.isFinite(shadowContest.receiverMinDist3D)
    ? shadowContest.receiverMinDist3D
    : null
  const geometricSuccess = receiverMinDist3D != null && receiverMinDist3D <= LAYOUT_DIST_M
  const abstractSuccess = flight.resolution?.success ?? null
  return {
    receiverMinDist3D,
    assignedDefenderMinDist3D,
    nearestDefenderId,
    nearestDefenderMinDist3D: Number.isFinite(nearestDefenderMinDist3D)
      ? nearestDefenderMinDist3D
      : null,
    poacherWasClosest: nearestDefenderId != null && nearestDefenderId !== flight.defenderId,
    geometricSuccess,
    abstractSuccess,
    agreesWithAbstract: abstractSuccess == null ? null : geometricSuccess === abstractSuccess,
  }
}

/**
 * BLOK NA TORZE — realny, z geometrii lotu.
 *
 * Zastępuje abstrakcyjny rollLaneBlock (resolution.js), który liczył szansę z płaskiej
 * odległości obrońcy od odcinka rzucający→cel i ze zgadywanej z TYPU rzutu wysokości.
 * Skutki tamtego modelu były dwa i oba złe: wybór toru nie mógł zmniejszyć szansy bloku
 * (bo blok nie wiedział, jak dysk leci), a sam mechanizm i tak nie strzelał — zmierzone
 * na 6 meczach pełnym silnikiem: 0 bloków na torze na 44 wszystkich.
 *
 * Teraz obrońca blokuje dysk wtedy, kiedy ten realnie przechodzi przez jego kopertę
 * zasięgu — tę samą elipsoidę (pion z wyskoku, bok z ramienia), którą rozstrzygamy
 * kontest. Dzięki temu przerzucenie dysku nad obrońcą albo wyprowadzenie go krzywizną
 * poza jego rękę faktycznie działa, a nie jest tylko etykietką.
 *
 * ZMIERZONE (tmp-laneblock-sweep.mjs, 8 meczów/arm, te same seedy):
 *   base/span      completion  bloki/mecz (na torze)  hold%   huck
 *   0.16 / 0.42      92.6%      13.4  (4.4)          68.5%  79.3%
 *   0.10 / 0.28      94.0%       9.4  (2.1)          74.2%  83.3%   <- wybrane
 *   0.06 / 0.18      94.1%       8.6  (1.9)          72.6%  82.7%
 *   0.03 / 0.12      93.7%       7.9  (0.9)          68.9%  85.5%
 *
 * Bloki na torze to ~22% wszystkich bloków — reszta zostaje na odbiorcy (nie dobiegł
 * albo przegrał walkę o dysk), co odpowiada realnemu rozkładowi: przecięcie podania w
 * połowie drogi zdarza się, ale nie jest głównym sposobem odbierania dysku.
 */
export const LANE_BLOCK_CALIBRATION = {
  /** Szansa dla przeciętnego obrońcy, gdy dysk idzie wprost w niego, wolno. */
  baseChance: 0.1,
  /** Ile dokłada umiejętność (agility/reactions/vision/blocking). */
  skillSpan: 0.28,
  /** Dysk mijający na granicy zasięgu jest dużo trudniejszy niż lecący w klatkę. */
  edgePenalty: 0.65,
  /** Powyżej tej prędkości (m/s) ręka po prostu nie nadąża; poniżej easy — pełna szansa. */
  hardSpeedMps: 21,
  easySpeedMps: 8,
}

function laneBlockChance(player, envelopeFrac, discSpeedMps) {
  const C = LANE_BLOCK_CALIBRATION
  const skill =
    subStat(player, 'physical', 'agility') * 0.34 +
    subStat(player, 'mental', 'reactions') * 0.34 +
    subStat(player, 'mental', 'vision') * 0.2 +
    subStat(player, 'defensive', 'blocking') * 0.12
  const speedFactor = Math.max(
    0.12,
    Math.min(1, (C.hardSpeedMps - discSpeedMps) / (C.hardSpeedMps - C.easySpeedMps)),
  )
  const depth = 1 - Math.min(1, Math.max(0, envelopeFrac)) * C.edgePenalty
  const mods = getTraitMods(player)
  return Math.max(
    0,
    (C.baseChance + (skill / 100) * C.skillSpan) * depth * speedFactor * (mods.blockChanceMult ?? 1),
  )
}

/**
 * Śledzi, KIEDY (i na jakiej wysokości) dany zawodnik po raz pierwszy mógł zagrać dysk.
 *
 * Warunek jest fizyczny, nie statystyczny: dysk musi być w zasięgu poziomym (ręce +
 * krok) i nie wyżej, niż zawodnik sięga w wyskoku (maxAerialReachM — dziś jump, docelowo
 * wzrost + ramiona). Ponieważ lot próbkujemy do przodu, pierwszy taki tick to moment
 * NAJWCZEŚNIEJSZY, czyli i najwyższy — a to jest cała stawka kontestu na hucku: dwóch
 * ludzi stoi w tym samym miejscu i dysk bierze ten, kto sięga wyżej.
 *
 * `minDistToReceiver` jest tu po to, żeby odróżnić obrońcę, który kontestuje TEGO
 * odbiorcę, od takiego, który po prostu przebiegał obok punktu lądowania — brak tej
 * informacji był powodem, dla którego wcześniejsza próba stopniowanego kontestu dawała
 * szum zamiast sygnału (patrz komentarz przy GEOMETRIC_CALIBRATION).
 */
function trackAerialTake(prev, agent, player, discSample, receiverAgent = null) {
  const state = prev ?? {
    player,
    // Koperta zasięgu jest ELIPSOIDĄ, nie kulą ani walcem: w pionie sięga wyskok
    // (2.3–3.5 m), w bok tylko ramię z wychyleniem (~1.1 m). Walec dawał artefakt —
    // obrońca, nad którym dysk dopiero PRZELATYWAŁ w drodze do odbiorcy, „sięgał" go
    // wcześniej niż odbiorca stojący w punkcie dostarczenia (zmierzone: obrońcy mieli
    // średnio 182 ms przewagi, czyli model nagradzał bycie po drodze, nie przy dysku).
    reachUpM: maxAerialReachM(player),
    reachOutM: horizontalReachM(player),
    takeMs: null,
    takeZ: null,
    minDistToReceiver: Infinity,
    prevHoriz: Infinity,
  }
  if (receiverAgent) {
    const dr = Math.hypot(agent.x - receiverAgent.x, agent.y - receiverAgent.y)
    if (dr < state.minDistToReceiver) state.minDistToReceiver = dr
  }
  const horiz = Math.hypot(discSample.x - agent.x, discSample.y - agent.y)
  if (state.takeMs == null) {
    const ex = horiz / state.reachOutM
    const ez = Math.max(0, discSample.z) / state.reachUpM
    // Dysk musi do zawodnika PODCHODZIĆ. Bez tego warunku obrońca, nad którym dysk
    // właśnie przelatuje w drodze do odbiorcy, „zagrywał" go — a dysku oddalającego się
    // z prędkością kilkunastu m/s nie zabiera się w biegu. To ten warunek odróżnia
    // realny kontest (obaj zbiegają się pod wiszący dysk) od bycia po drodze.
    if (ex * ex + ez * ez <= 1 && horiz <= state.prevHoriz) {
      state.takeMs = discSample.timeToDisc
      state.takeZ = discSample.z
    }
  }
  state.prevHoriz = horiz
  return state
}

/**
 * Zdolność do wygrania dysku w powietrzu (skala statów). `jump` wchodzi tu drugi raz —
 * po pierwsze przez zasięg (kto sięga wcześniej), po drugie tutaj, bo wyskok to nie
 * tylko wysokość, ale i to, czy zawodnik zabiera dysk pewnie, czy tylko go dotyka.
 */
function aerialSkillScore(player, isReceiver) {
  const mods = getTraitMods(player)
  const base = isReceiver
    ? subStat(player, 'offensive', 'catching') * 0.6 + subStat(player, 'physical', 'jump') * 0.4
    : subStat(player, 'defensive', 'blocking') * 0.6 + subStat(player, 'physical', 'jump') * 0.4
  const mult = isReceiver ? (mods.aerialRecvMult ?? 1) : (mods.aerialDefMult ?? 1)
  return base * mult
}

/**
 * Kalibracja kontestu powietrznego — osobno od GEOMETRIC_CALIBRATION, bo odpowiada za
 * inne pytanie. Tamta mówi „czy odbiorca w ogóle dobiegł", ta „kto zabrał dysk, skoro
 * dobiegli obaj".
 */
/**
 * ZMIERZONE — 8 meczów pełnym silnikiem na etap, te same seedy (tmp-aerial-sep.mjs):
 *
 *                         completion  bloki/mecz  hold%   dump   standard  huck
 *   baseline (przed)         96.2%       4.4      81.2%   97.8%   96.2%   93.5%
 *   sam kontest              89.8%      17.4      62.1%   93.0%   89.7%   84.7%
 *   + bramka sky             95.1%       7.0      76.3%   96.5%   95.9%   87.7%
 *   + wybór toru rzutu       94.5%       8.0      70.3%   96.5%   95.6%   83.8%
 *
 * Wniosek, dla którego warto to tu trzymać: SAM kontest bez bramki wysokości był
 * katastrofą (17 bloków na mecz, dumpy 93%), bo odpalał na płaskich podaniach. Dopiero
 * warunek „dysk musiał spadać z góry" ustawił go tam, gdzie należy — na huckach.
 *
 * Sweep przewagi odbiorcy (tmp-aerial-sweep.mjs, 16 meczów/arm, jeszcze przed bramką):
 * edge 2.0/2.2/2.4/2.6 dało completion 91.9/92.8/92.3/92.3% — całość w granicach szumu
 * (ten sam arm w dwóch przebiegach: 92.8% i 91.7%), więc nie ma sensu stroić dokładniej.
 * Realną dźwignią częstości kontestów jest minDefenderLeadMs: 90 ms -> 12.6 bloku/mecz,
 * 120 ms -> 9.9, 150 ms -> 11.0.
 *
 * Hold% schodzi z 81% do ~70%, czyli do dolnej krawędzi pasma (70–85) — to bezpośrednia
 * konsekwencja tego, że obrona zaczęła wygrywać dyski, i pierwsza rzecz do sprawdzenia,
 * gdyby mecze wyszły zbyt „obronne".
 *
 * WRAŻLIWOŚĆ NA SKOCZNOŚĆ (tmp-aerial-jumpab2.mjs, jump całej drużyny 25/60/95,
 * completion rzutów tej drużyny — pomiar sprzed bramki sky, gdy kontestów było dużo
 * i próbka wystarczała):
 *   atak   W KONTEŚCIE 28.1% -> 41.0% -> 63.8%   bez kontestu 96.4% -> 97.1% -> 96.8%
 *   obrona W KONTEŚCIE 79.4% -> 72.5% -> 51.1%   bez kontestu 94.2% -> 96.1% -> 97.3%
 * Czyli skoczność rozstrzyga dokładnie tam, gdzie powinna — w walce o dysk — i nie
 * rusza rzutów, których nikt nie kontestuje.
 */
export const AERIAL_CALIBRATION = {
  /** Ile ms przewagi w sięgnięciu po dysk daje 1 logit (≈73% szansy). */
  msPerLogit: 90,
  /** Ile punktów różnicy zdolności powietrznych daje 1 logit. */
  skillPerLogit: 28,
  /**
   * Stała przewaga odbiorcy przy RÓWNYM dojściu do dysku. Musi być duża, bo równe
   * dojście nie jest sytuacją równą: odbiorca atakuje dysk twarzą, obiema rękami i
   * wie, kiedy go zabrać, a obrońca sięga przez plecy, jedną ręką i pod rygorem faulu.
   * Przy 2.2 równe dojście to ~90% dla ataku, obrońca 100 ms wcześniej ~75%, 200 ms
   * wcześniej ~50%, 300 ms wcześniej ~25% — czyli dopiero realne wyprzedzenie odbiorcy
   * przy dysku (a nie samo bycie w pobliżu) zabiera atakowi rzut.
   */
  receiverEdgeLogit: 2.2,
  /** Dokładany logit obrony za KAŻDEGO kolejnego kontestującego (help D w tłoku). */
  extraContesterLogit: 0.5,
  /**
   * Ile ms przed dolotem dysku obrońca musi być przy nim, żeby w ogóle zdążył zagrać.
   * Dysku, który wchodzi w zasięg dopiero w ostatniej chwili, nie da się zabrać — na
   * wyprost ręki czy wybicie potrzeba czasu. To jest granica między płaskim, szybkim
   * podaniem (obrońca ociera się o dysk, ale nic z tym nie zrobi) a wiszącym huckiem,
   * pod który zbiegają się wszyscy.
   */
  minDefenderLeadMs: 120,
  /** Jak blisko odbiorcy musi być obrońca, żeby kontestować JEGO, a nie samą przestrzeń. */
  nearReceiverM: 3.0,
  /**
   * BRAMKA „TO JEST SKY BALL" — bez niej kontest odpalał na czym popadnie.
   *
   * Walka o dysk w powietrzu ma sens tylko wtedy, gdy dysk SCHODZI Z GÓRY na stojących
   * pod nim zawodników: wisiał, obaj zdążyli dobiec, obaj skaczą. Płaskie podanie leci
   * cały czas na podobnej wysokości i dochodzi w ręce — nie ma tam czego wyskakiwać,
   * a obrona odbiera je blokiem na torze (rollLaneBlock) albo tym, że odbiorca nie
   * dobiegł, nie walką w powietrzu.
   *
   * Warunek: w strefie dolotu (skyZoneM od punktu dostarczenia) dysk musiał być wyżej
   * niż zasięg stojącego odbiorcy — czyli trzeba było po niego wyskoczyć. Próg jest
   * zaczepiony o standingReachM, więc razem ze wzrostem zawodników przesunie się sam.
   */
  skyZoneM: 3.0,
  skyReachFraction: 1.0,
}

/**
 * Rozstrzyga walkę o dysk między odbiorcą a obrońcami, którzy realnie mogli go zagrać.
 * Zwraca null, gdy nie ma czego rozstrzygać (żaden obrońca nie sięgnął dysku).
 */
function resolveAerialContest(shadowContest, flight, summary, rng) {
  const recvTake = shadowContest?.aerialReceiver ?? null
  const defTakes = shadowContest?.aerialDefenders
  if (!defTakes || defTakes.size === 0) return null
  const { catchReachM } = GEOMETRIC_CALIBRATION
  const A = AERIAL_CALIBRATION

  // Dump/swing nie kontestuje się nigdy. Po urealnieniu toru lotu (dump szczytuje ~1.3 m)
  // i tak nie przeszedłby bramki wysokości, ale zapisujemy to wprost, żeby nie wróciło
  // przy następnej zmianie pułapu.
  if (flight?.throwType === THROW_TYPE.DUMP_SWING) return null

  // Dysk musiał schodzić z góry — inaczej to nie jest walka w powietrzu.
  const receiverPlayer = recvTake?.player ?? flight.receiver
  const skyBar = standingReachM(receiverPlayer) * A.skyReachFraction
  if (!((shadowContest.approachMaxZ ?? 0) > skyBar)) return null

  const contesters = []
  for (const [id, take] of defTakes) {
    if (take.takeMs == null || take.takeMs < A.minDefenderLeadMs) continue
    if (take.minDistToReceiver > A.nearReceiverM) continue
    const distToDisc = summary.nearestDefenderId === id
      ? summary.nearestDefenderMinDist3D
      : (shadowContest.defenders.get(id) ?? Infinity)
    if (!(distToDisc <= catchReachM)) continue
    contesters.push({ id, take })
  }
  if (contesters.length === 0) return null

  // Najgroźniejszy = ten, kto sięga dysku najwcześniej; przy remisie lepszy powietrznie.
  contesters.sort(
    (a, b) =>
      b.take.takeMs - a.take.takeMs ||
      aerialSkillScore(b.take.player, false) - aerialSkillScore(a.take.player, false),
  )
  const best = contesters[0]

  // Odbiorca, który nigdy nie sięgnął dysku wyżej niż przy samej ziemi, wchodzi do
  // kontestu z zerową przewagą czasową — nie jest z niego wykluczony, bo bramka
  // catchReachM już potwierdziła, że przy dysku był.
  const recvTakeMs = recvTake?.takeMs ?? 0
  const recvPlayer = recvTake?.player ?? flight.receiver
  const logit =
    A.receiverEdgeLogit +
    (recvTakeMs - best.take.takeMs) / A.msPerLogit +
    (aerialSkillScore(recvPlayer, true) - aerialSkillScore(best.take.player, false)) /
      A.skillPerLogit -
    (contesters.length - 1) * A.extraContesterLogit
  const pReceiver = 1 / (1 + Math.exp(-logit))
  const receiverWins = rng?.float ? rng.float() < pReceiver : pReceiver >= 0.5

  return {
    receiverWins,
    pReceiver,
    defenderId: best.id,
    contesterCount: contesters.length,
    recvTakeMs,
    defTakeMs: best.take.takeMs,
    // Wysokość, na której dysk faktycznie został zagrany — to ona (a nie wysokość przy
    // lądowaniu) decyduje o trudności chwytu.
    takeZ: recvTake?.takeZ ?? shadowContest.discZAtClosest ?? 1.2,
  }
}

/**
 * Faza 4b planu 3D: prawdziwa decyzja complete/block/drop na podstawie tego, kto
 * faktycznie był najbliżej dysku w 3D pod koniec lotu (nie statycznie przypisanego
 * obrońcy — patrz shadowContest, który śledzi WSZYSTKICH obrońców, więc poaczer bliżej
 * dysku niż przypisana marka realnie przejmuje kredyt za blok). Uproszczony tie-break:
 * obrońca WYRAŹNIE bliżej niż receiver (< 70% jego dystansu) wygrywa kontest mimo że
 * receiver technicznie w zasięgu — realny skill (jump/reach) już wpływa na te dystanse
 * przez Fazę 3 (prawdziwe łuki skoku), więc nie potrzeba tu osobnego rzutu kością.
 */
/** Mutowalny obiekt kalibracyjny — jak MISS_CALIBRATION w resolution.js, pozwala
 * skryptowi kalibrującemu testować wiele wartości w jednym procesie Node. */
export const GEOMETRIC_CALIBRATION = {
  // Wykalibrowane empirycznie (tmp-calibrate-geometric.mjs, grid-search jak przy
  // oryginalnej DISTANCE_GAP_TABLE) — DWIE rundy: pierwsza (catchReachM=3.0) trafiła
  // ~89.4% overall, zanim naprawiono samouzgodniony dobór sufitu predykcji leadu
  // (throwerBrain.js/discFlightPredict.js — patrz komentarz tam), co drastycznie
  // poprawiło realną zbieżność receivera do celu (9.6%→0.8% czystych niepowodzeń
  // geometrii dla standardowych rzutów). Po tej naprawie catchReachM=3.0 był już za
  // hojny (97%+); domknięte ponownie do 1.6m — finalnie: overall 94.9%, standard 95.6%
  // (baseline 94.9%), dump_swing 100% (dokładne trafienie).
  // REKALIBRACJA po naprawie obrony (cushion + spójna czasowo separacja): krycie stało
  // się realnie ciaśniejsze, więc przy dawnym 1.6 geometria zabierała za dużo — 86.8%
  // completion i hold 61%. Ponowny sweep (tmp-recal-geo.mjs): 2.0 -> 92.5%/hold 65.7,
  // 2.2 -> 93.7%/hold 74.3/bloki 8.1, 2.4 -> 94.4%/hold 75.7 przy spadku rzutów/punkt.
  // 2.2 najlepiej trafia jednocześnie w hold% (70-85) i bloki (5-16).
  // Ponowna korekta po uzależnieniu zmiany kierunku od statów (mobilityMultiplier w
  // playerMovement.js): atak zyskał, więc 2.2 podbijało completion do ~94.7%. Sweep
  // 1.8/1.95/2.1 -> 90.6/92.3/93.8% completion; 1.95 trafia jednocześnie w completion,
  // bloki, hold% i rzuty/punkt.
  // REKALIBRACJA po wprowadzeniu korekty biegu w locie (interceptForFlight w
  // flightKinematics.js): odbiorca widzi lecący dysk i poprawia kierunek, więc chybiony
  // rzut kosztuje tylko stracony grunt, nie automatyczną stratę. To przesunęło cały
  // reżim — przy 2.3/0.22 completion spadło do 87.4% przy 0.96 TO/punkt. Sweep na
  // szerokim rozrzucie seedów (tmp-sweep, 6 baz seedów, żeby próbka objęła też mocny
  // wiatr): 2.5/0.10 -> 89.7% | 2.7/0.10 -> 91.0% | 2.9/0.10 -> 91.5% | 2.7/0.13 -> 90.9%
  // przy 0.65 TO/punkt i 7.3 bloku/mecz. Wybrane 2.7/0.13: trafia jednocześnie w
  // completion (90-93), turnovery (0.45-0.85) i bloki (5-16), zachowując wyższy próg
  // względny, czyli realny wpływ jakości obrony na kontest.
  catchReachM: 2.7,
  // Próg „obrońca wygrywa kontest" — o ile bliżej dysku musi być od odbiorcy. To jest
  // dźwignia, która decyduje, CZY obrona w ogóle wpływa na WYNIK, czy tylko na wybór
  // opcji. Przy 0.15 obrońca musiał być ~6.7x bliżej, więc bramka prawie nie odpalała i
  // turnovery brały się niemal wyłącznie z niecelnych rzutów (efekt OVR obrony na
  // completion: 0.8 pp). Sweep (tmp-recal-geo.mjs, catchReachM=2.2):
  // 0.15 -> 94.0%/8.0 bloków/hold 73.6 | 0.4 -> 91.7%/11.9/66.2 | 0.6 -> 86.6%/23.1/58.8.
  // Po dowiązaniu prędkości dobiegu do dysku do umiejętności obronnych (sprintSpeedMps
  // w flightKinematics.js) obrona zrobiła się mocniejsza i 0.3 zbijało completion; sweep
  // 0.18/0.22/0.26 -> 92.8/92.5/92.0% completion przy 8.25/8.75/9.25 bloków. 0.22 trafia
  // w środek pasma completion przy sensownej liczbie bloków.
  contestRelativeThreshold: 0.13,
  contestAbsoluteThreshold: 1.2,
}

function computeGeometricResolution(shadowContest, flight, rng = null) {
  const summary = summarizeShadowContest(shadowContest, flight)
  if (!summary || summary.receiverMinDist3D == null) return null
  const { catchReachM } = GEOMETRIC_CALIBRATION
  const receiverInReach = summary.receiverMinDist3D <= catchReachM
  const defenderInReach =
    summary.nearestDefenderMinDist3D != null && summary.nearestDefenderMinDist3D <= catchReachM

  // PRÓBA STOPNIOWANEGO KONTESTU — cofnięta, zostawiam wnioski, bo są nietrywialne.
  // Zamiast twardej bramki liczone było prawdopodobieństwo bloku z marginesu odległości
  // (receiver vs najbliższy obrońca) i z aerialContestChance. Zmierzone wyniki:
  //  - przy agresywnym ustawieniu bloki 18.75/mecz i completion 86% (cel 90-93),
  //  - przy łagodnym gradient open->tight SPADAŁ do 2.6 pp (twarda bramka daje 6.6 pp)
  //    i przestawał być monotoniczny (contested 90.9% > open 86.8%).
  // Przyczyna: `nearestDefenderMinDist3D` to odległość najbliższego obrońcy DO DYSKU, a
  // nie miara tego, czy TEN odbiorca był kryty. Przy otwartych rzutach też często ktoś
  // z obrony dobiega w pobliże dysku, więc kontest odpalał niezależnie od krycia i
  // dokładał szum zamiast sygnału. Żeby to zrobić dobrze, trzeba najpierw wiedzieć, KTO
  // realnie kontestował tego odbiorcę (obrońca blisko dysku ORAZ blisko odbiorcy),
  // a tej informacji shadowContest dziś nie zbiera.
  // KONTEST POWIETRZNY zastępuje dawną bramkę „obrońca wyraźnie bliżej dysku".
  // Tamta wymagała, żeby obrońca był bliżej niż 13% dystansu odbiorcy — przy typowym
  // receiverMinDist3D ≈ 0.9 m oznaczało to 0.12 m i praktycznie nigdy nie odpalała:
  // zmierzone na hucku obrońca był bliżej dysku niż odbiorca w 29.9% rzutów, a odbiorca
  // i tak łapał 80% z nich. Teraz o dysk toczy się realna walka: kto sięga wcześniej
  // (zasięg + wyskok), z poprawką na umiejętności powietrzne i liczbę kontestujących.
  // Odbiorca, który nie dobiegł, nie ma o co walczyć — kontestu wtedy nie rozstrzygamy
  // (i nie zużywamy na niego losowania).
  const aerial = receiverInReach ? resolveAerialContest(shadowContest, flight, summary, rng) : null
  const defenderWinsContest = aerial
    ? !aerial.receiverWins
    : // Zapas na wypadek braku danych o sięgnięciu (np. bardzo krótki lot) — stara,
      // czysto dystansowa bramka.
      defenderInReach &&
      summary.nearestDefenderMinDist3D <
        summary.receiverMinDist3D * GEOMETRIC_CALIBRATION.contestRelativeThreshold &&
      summary.nearestDefenderMinDist3D < GEOMETRIC_CALIBRATION.contestAbsoluteThreshold
  if (receiverInReach && !defenderWinsContest) {
    // OSOBNY KROK CHWYTU — dysk doleciał w zasięg, ale trzeba go jeszcze utrzymać.
    // Ta sama formuła co w fastMode (resolveThrow), tylko karmiona realną geometrią:
    // wysokością dysku w chwili zbliżenia i tym, czy obrońca był przy nim.
    // „Kontestowany chwyt" to obrońca realnie przy dysku, a nie ktokolwiek w promieniu
    // catchReachM (1.95 m) — przy tym szerszym progu flaga odpalała na większości
    // chwytów i dropy wychodziły 7.6% zamiast realnych ~2-4%.
    const contestedCatch =
      summary.nearestDefenderMinDist3D != null &&
      summary.nearestDefenderMinDist3D <= CONTESTED_CATCH_DIST_M
    // Wysokość ZAGRANIA dysku, nie wysokość przy lądowaniu. Odbiorca, który wyszedł
    // pod hucka wysoko, łapie go na 2 m nad ziemią — i to jest chwyt trudniejszy, nawet
    // gdy wygrał wyścig. Dawne `discZAtClosest` opisywało moment, w którym dysk był już
    // praktycznie na ziemi (zmierzone: średnio 0.26–0.52 m), więc trudność wysokości
    // nie odpalała nigdy.
    const takeZ = shadowContest.aerialReceiver?.takeZ ?? shadowContest.discZAtClosest ?? 1.2
    const pCatch = catchSuccessChance(flight.receiver, {
      discZ: takeZ,
      contested: contestedCatch,
      // Chwyt na pełnym wybiciu, u szczytu własnego zasięgu — tam dysk łapie się jedną
      // ręką, w kontakcie i bez asekuracji ciałem.
      layoutAttempt: takeZ > maxAerialReachM(flight.receiver) * 0.92,
      catchBonus: getTraitMods(flight.receiver).catchBonus ?? 0,
      // Jak bardzo odbiorca musiał sięgać: 0 = dysk trafił w ręce, 1 = granica zasięgu.
      reachStrain:
        summary.receiverMinDist3D != null
          ? Math.max(0, Math.min(1, summary.receiverMinDist3D / GEOMETRIC_CALIBRATION.catchReachM))
          : 0,
    })
    if (rng?.float && rng.float() > pCatch) {
      return {
        success: false,
        isBlock: false,
        isDrop: true,
        defenderId: null,
        reason: 'drop',
        aerialDebug: aerial,
      }
    }
    return { success: true, isBlock: false, defenderId: null, reason: 'catch', aerialDebug: aerial }
  }
  // Przegrany kontest powietrzny to blok konkretnego obrońcy — tego, który dysk zabrał,
  // nawet jeśli inny był statystycznie bliżej w chwili lądowania.
  if (receiverInReach && aerial) {
    return {
      success: false,
      isBlock: true,
      isDrop: false,
      defenderId: aerial.defenderId,
      reason: 'aerial_lost',
      aerialDebug: aerial,
    }
  }
  return {
    success: false,
    isBlock: defenderInReach,
    isDrop: false,
    defenderId: defenderInReach ? summary.nearestDefenderId : null,
    reason: receiverInReach ? 'contest_lost' : 'not_in_reach',
    aerialDebug: aerial,
  }
}

/** Person-mark: obrońca → agent ofensywy (matchup, potem markTargetId, potem najbliższy). */
function resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups) {
  const defId = agentPlayerId(defAgent)
  if (personMatchups instanceof Map && defId != null) {
    for (const off of offenseAgents) {
      const mapped = personMatchups.get(agentPlayerId(off) ?? off.id)
      if (mapped != null && (mapped.id === defId || mapped === defId)) {
        return off
      }
    }
  }
  const markId = defAgent?.markTargetId
  if (markId != null) {
    const byMark = offenseAgents.find((o) => agentPlayerId(o) === markId || o.id === markId)
    if (byMark) return byMark
  }
  let best = offenseAgents[0] ?? null
  let bestD = Infinity
  for (const off of offenseAgents) {
    const d = Math.hypot((defAgent.x ?? 0) - (off.x ?? 0), (defAgent.y ?? 0) - (off.y ?? 0))
    if (d < bestD) {
      bestD = d
      best = off
    }
  }
  return best
}

function shadeMarkBesideOffense(off, forceSide, attackSign) {
  const layout = forceMarkLayoutSide(forceSide, off.y)
  const shade = layout === 'away' ? 0.9 : layout === 'home' ? -0.9 : 0
  return {
    x: off.x - attackSign * 2.2,
    y: off.y + shade,
  }
}

function layoutToAgents(layout, teamId, rosterLineup = [], tactics = null) {
  return layout.map((p, stackIndex) => {
    const rosterPlayer = rosterLineup.find((r) => r.id === p.id) ?? p
    const base = {
      player: rosterPlayer,
      id: p.id,
      x: p.x,
      y: p.y,
      z: 0,
      vz: 0,
      teamId,
      fieldRole: p.fieldRole,
      stackIndex: p.stackIndex ?? stackIndex,
      roleSlotIndex: p.roleSlotIndex ?? 0,
      isThrower: p.fieldRole === 'thrower',
      markTargetId: p.markTargetId ?? null,
    }
    const subRole = subRoleForAgent(base, tactics)
    const preferDump = subRole === HANDLER_SUB_ROLES.RESET
    return {
      ...base,
      subRole,
      isDump: preferDump || (p.fieldRole === 'dump' && subRole !== HANDLER_SUB_ROLES.PRIMARY),
    }
  })
}

/** Stan zawodników na koniec symulacji — wejście do kolejnego rzutu (ciągłość ruchu). */
function snapshotAgentStates(offenseAgents, defenseAgents) {
  const map = new Map()
  const put = (agents, role) => {
    for (const a of agents) {
      if (a?.id == null) continue
      map.set(a.id, {
        id: a.id,
        x: a.x,
        y: a.y,
        vx: a.vx ?? 0,
        vy: a.vy ?? 0,
        z: 0,
        vz: 0,
        state: a.state,
        stateMs: a.stateMs ?? 0,
        targetX: a.targetX ?? a.x,
        targetY: a.targetY ?? a.y,
        role,
      })
    }
  }
  put(offenseAgents, 'offense')
  put(defenseAgents, 'defense')
  return map
}

function snapshotFrame(ms, offenseAgents, defenseAgents, throwerId, disc = null, markerId = null, stallCount = null) {
  const players = [
    ...offenseAgents.map((a) => ({
      id: a.id,
      teamId: a.teamId ?? 'home',
      x: a.x,
      y: a.y,
      z: a.z ?? 0,
      vx: a.vx ?? 0,
      vy: a.vy ?? 0,
      role: a.isThrower ? 'thrower' : a.fieldRole ?? 'stack',
      cutterState: a.state,
      layout: a.layout ?? false,
      motionPhase: a.layout ? 'layout' : undefined,
    })),
    ...defenseAgents.map((a) => {
      const id = a.id ?? a.player?.id
      const isActiveMark = markerId != null && id === markerId
      return {
        id,
        teamId: a.teamId ?? 'away',
        x: a.x,
        y: a.y,
        z: a.z ?? 0,
        vx: a.vx ?? 0,
        vy: a.vy ?? 0,
        // Marker throwera + markTargetId z matchupu (nie tylko aktywny stall).
        role: isActiveMark
          ? 'marker'
          : a.fieldRole?.startsWith('zone_')
            ? a.fieldRole
            : 'defender',
        isActiveMark,
        markTargetId: isActiveMark ? throwerId : a.markTargetId ?? null,
        defenderState: a.state,
        layout: a.layout ?? false,
        motionPhase: a.layout ? 'layout' : a.state === DEFENDER_STATE.CONTESTING_DISC ? 'contest' : undefined,
      }
    }),
  ]
  return { ms, players, throwerId, disc, markerId, stallCount }
}

function buildMotionTracePayload({
  frames,
  throwMs,
  discX,
  discY,
  flight,
  possessionTeam,
  resolution,
  markerId = null,
  holdStartMs = 0,
}) {
  const totalMs = frames.length ? frames[frames.length - 1].ms : throwMs ?? 0
  return {
    tickMs: SIM_TICK_MS,
    throwMs: throwMs ?? 0,
    releaseMs: 0,
    flightMs: flight ? flight.totalFlightMs : 0,
    totalMs,
    discX,
    discY,
    throwPathPoints: flight?.throwPathPoints ?? null,
    frames,
    resolution: resolution ?? flight?.resolution ?? null,
    possessionTeam,
    markerId,
    holdStartMs,
  }
}

/**
 * Ciągła symulacja akcji rzutu (setup + lot w jednej pętli 20 ms).
 * `onThrowCommitted(decision)` — zwraca `{ resolution, trajectory, throwType, abort? }` lub null (bez lotu).
 */
export function runContinuousThrowSimulation({
  rng,
  thrower,
  offenseLineup,
  defenseLineup,
  personMatchups,
  possessionTeam,
  discPosition,
  discYMeters,
  stallCount,
  offenseTeam,
  defenseTeam,
  wind = null,
  /** Ms już naliczone w tym posiadaniu (po abortach) — stall kontynuuje. */
  startHoldMs = 0,
  maxTicks = null,
  staminaMaps = null,
  seedStates = null,
  postResetClearout = false,
  lastThrowerId = null,
  hardStallCount = stallCount,
  requireForwardPass = false,
  onThrowCommitted = null,
}) {
  const holdStartMs = Math.max(0, startHoldMs ?? 0)
  const setupBudgetMs = Math.max(
    SIM_TICK_MS,
    STALL_MAX * STALL_SECOND_MS - holdStartMs + SIM_TICK_MS,
  )
  const resolvedMaxTicks =
    maxTicks ??
    Math.ceil(setupBudgetMs / SIM_TICK_MS) + Math.ceil(MAX_FLIGHT_MS / SIM_TICK_MS)
  const discX = discMetersFromState(discPosition, possessionTeam)
  const discY = discYMeters ?? fieldCenterY()
  const disc = { x: discX, y: discY, position: discPosition }
  const postCatchReorg = seedStates instanceof Map && seedStates.size > 0
  const defenseTeamId = possessionTeam === 'home' ? 'away' : 'home'
  const tickKinematics = {}

  const homeSide = possessionTeam === 'home' ? offenseTeam : defenseTeam
  const awaySide = possessionTeam === 'home' ? defenseTeam : offenseTeam
  const { attackStyle, defenseStyle, personMark } = resolveFieldTactics(
    possessionTeam,
    homeSide,
    awaySide,
    null,
  )
  const forceSide = resolveMarkForceSide(defenseTeam, null)
  const attackSign = possessionTeam === 'home' ? 1 : -1
  let spaceCellsCache = null
  let spaceCellsCacheMs = -1e9
  /**
   * Rzucający SKANUJE boisko co THROWER_SCAN_MS, a nie co tick (20 ms).
   *
   * Człowiek nie przelicza opcji pięćdziesiąt razy na sekundę. Przy skanie co tick
   * rzucający widział każde, nawet ułamkowe okno — a ponieważ rzut wychodzi dopiero po
   * minięciu bramki wypuszczenia, do wykonania dożywały tylko opcje DŁUGOTRWAŁE, czyli
   * głębokie. Zmierzone: rozkład DECYZJI to 45.9% krótkich i 7.3% głębokich, a rozkład
   * WYKONANYCH rzutów 29.1% i 33.5% — te same opcje, przefiltrowane przez czas.
   */
  let scanCache = null
  let scanCacheMs = -1e9

  const offenseLayout = layoutPlayersOnField(
    offenseLineup,
    possessionTeam,
    discX,
    true,
    {
      attackStyle,
      throwerId: thrower.id,
      attackSign,
      discYMeters: discY,
    },
  )

  const defenseLayout = layoutPlayersOnField(
    defenseLineup,
    possessionTeam === 'home' ? 'away' : 'home',
    discX,
    false,
    {
      defenseStyle,
      offenseLayout,
      personMark,
      attackSign,
      forceSide,
      personMatchups,
      defenseTactics: defenseTeam?.tactics,
    },
  )

  let offenseAgents = layoutToAgents(
    offenseLayout,
    possessionTeam,
    offenseLineup,
    offenseTeam?.tactics,
  ).map((a) => {
    const seed = seedStates?.get(a.id)
    // Po turnoverze seed ma starą rolę — nie bierz pozycji z przeciwnika.
    const carriesRole = seed?.role === 'offense'
    if (a.isThrower) {
      return {
        ...a,
        x: discX,
        y: discY,
        state: CUTTER_STATE.WAITING,
        vx: 0,
        vy: 0,
        player: a.player,
        subRole: a.subRole,
      }
    }
    const startX = carriesRole ? (seed.x ?? a.x) : a.x
    const startY = carriesRole ? (seed.y ?? a.y) : a.y
    const base = createCutterAgent(a.player, startX, startY)
    // Ciągłość między rzutami: zawodnik kontynuuje bieg z zachowaną prędkością i celem,
    // zamiast zaczynać od nowa w formacji.
    return {
      ...base,
      vx: carriesRole ? (seed.vx ?? 0) : 0,
      vy: carriesRole ? (seed.vy ?? 0) : 0,
      state: carriesRole ? (seed.state ?? base.state) : base.state,
      stateMs: carriesRole ? (seed.stateMs ?? 0) : 0,
      targetX: carriesRole ? (seed.targetX ?? base.targetX) : base.targetX,
      targetY: carriesRole ? (seed.targetY ?? base.targetY) : base.targetY,
      teamId: possessionTeam,
      fieldRole: a.fieldRole,
      stackIndex: a.stackIndex,
      isDump: a.isDump,
      isThrower: false,
      subRole: a.subRole,
    }
  })

  let defenseAgents = layoutToAgents(defenseLayout, defenseTeamId, defenseLineup).map((a) => {
    const seed = seedStates?.get(a.id)
    const carriesRole = seed?.role === 'defense'
    return {
      ...a,
      x: carriesRole ? (seed.x ?? a.x) : a.x,
      y: carriesRole ? (seed.y ?? a.y) : a.y,
      state: carriesRole ? (seed.state ?? DEFENDER_STATE.COVERING_CUTTER) : DEFENDER_STATE.COVERING_CUTTER,
      reactUntil: 0,
      pendingTarget: null,
      vx: carriesRole ? (seed.vx ?? 0) : 0,
      vy: carriesRole ? (seed.vy ?? 0) : 0,
      z: 0,
      vz: 0,
      markTargetId: a.markTargetId ?? null,
    }
  })

  // Ustaw D przy swoich markach (matchupy ≠ kolejność layoutu).
  // Marker throwera zawsze; cutter D — gdy brak ciągłości albo zbyt daleko po reorg O.
  if (personMark && personMatchups instanceof Map) {
    for (const off of offenseAgents) {
      const defPlayer = personMatchups.get(off.player?.id ?? off.id)
      if (!defPlayer) continue
      const defAgent = defenseAgents.find((d) => agentPlayerId(d) === defPlayer.id)
      if (!defAgent) continue
      defAgent.markTargetId = off.id
      const carriesDefense = seedStates?.get(defAgent.id)?.role === 'defense'
      if (off.isThrower || off.player?.id === thrower.id) {
        const mark = forceMarkPosition(off.x, off.y, forceSide, attackSign)
        defAgent.x = mark.x
        defAgent.y = mark.y
        defAgent.vx = 0
        defAgent.vy = 0
        defAgent.state = DEFENDER_STATE.MARKING_STALL
      } else {
        const shade = shadeMarkBesideOffense(off, forceSide, attackSign)
        const dist = Math.hypot(defAgent.x - shade.x, defAgent.y - shade.y)
        if (!carriesDefense || dist > DEFENSE_REANCHOR_GAP_M) {
          defAgent.x = shade.x
          defAgent.y = shade.y
          defAgent.vx = 0
          defAgent.vy = 0
          defAgent.state = DEFENDER_STATE.COVERING_CUTTER
        }
      }
    }
  }

  const throwerAgent = offenseAgents.find((a) => a.isThrower)

  const markerOnThrower =
    isPersonDefense(defenseStyle) && personMatchups
      ? defenderForPersonMark(personMatchups, thrower, defenseLineup, rng)
      : null
  const zoneMarkerAgent = defenseAgents.find((a) => a.fieldRole === 'zone_marker')
  let markerId =
    markerOnThrower?.id ??
    zoneMarkerAgent?.id ??
    zoneMarkerAgent?.player?.id ??
    defenseAgents.reduce((best, a) => {
      if (!throwerAgent) return best
      const d = Math.hypot((a.x ?? 0) - throwerAgent.x, (a.y ?? 0) - throwerAgent.y)
      if (!best || d < best.d) return { id: a.id ?? a.player?.id, d }
      return best
    }, null)?.id ??
    null

  const frames = []
  let throwDecision = null
  let flight = null
  let commitMeta = null
  let stallOut = false
  let holdMsAtEnd = holdStartMs
  // Faza 4a planu 3D (shadow mode) — realny geometryczny kontest liczony z prawdziwych
  // pozycji 3D w oknie tuż przed złapaniem, TYLKO do logowania/porównania z abstrakcyjnym
  // resolveThrow (flight.resolution) — nie zmienia niczego w faktycznym wyniku gry. Śledzi
  // WSZYSTKICH obrońców (nie tylko statycznie przypisanego), więc łapie realny wpływ
  // poacha, jeśli faktycznie jest bliżej dysku niż przypisany obrońca.
  let shadowContest = null
  /** Blok na torze (geometryczny) — gdy padnie, lot kończy się w miejscu przecięcia. */
  let laneBlock = null
  const laneBlockTried = new Set()
  /** Zasięg i czas reakcji obrońców — wielkości stałe na cały lot, więc liczone RAZ.
   *  Odpytywanie ich co tick (staty przez morale i traity) było najdroższą częścią
   *  symulacji: 4 łańcuchy statów x 7 obrońców x ~150 ticków na każdy lot. */
  const laneBlockProfiles = new Map()
  let prevDiscSample = null

  for (let tick = 0; tick < resolvedMaxTicks; tick += 1) {
    const ms = tick * SIM_TICK_MS
    const holdMs = holdStartMs + ms
    holdMsAtEnd = holdMs
    const liveStall = stallCountFromHoldMs(holdMs)
    const decisionStall = decisionStallFromHoldMs(holdMs)

    if (flight && flightComplete(flight)) {
      break
    }

    if (!flight && isStallOutHoldMs(holdMs)) {
      stallOut = true
      const heldDisc = throwerAgent
        ? discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
        : null
      frames.push(
        snapshotFrame(ms, offenseAgents, defenseAgents, thrower.id, heldDisc, markerId, STALL_MAX),
      )
      break
    }

    if (staminaMaps) {
      for (const agent of offenseAgents) {
        syncPlayerFromStaminaMap(staminaMaps, agent.player, possessionTeam)
        agent.currentStamina = agent.player?.currentStamina
      }
      for (const agent of defenseAgents) {
        syncPlayerFromStaminaMap(staminaMaps, agent.player, defenseTeamId)
        agent.currentStamina = agent.player?.currentStamina
      }
    }

    const offensePositions = offenseAgents.map((a) => ({
      id: a.id,
      player: a.player,
      x: a.x,
      y: a.y,
      // Podrola i stan — potrzebne, by kolega mógł ocenić CZYJĄ przydatność do resetu
      // porównuje. Bez nich resetFitness liczył wszystkich domyślnymi wartościami:
      // każdy widział siebie prawdziwie, a innych domyślnie, więc każdy uznawał się
      // za najlepszego kandydata.
      subRole: a.subRole ?? null,
      state: a.state ?? null,
      // PRZESTRZEŃ ZAKLEPANA: dokąd ten kolega już biegnie. Mapa liczyła dotąd wyłącznie
      // bieżące pozycje, więc trzech cutterów oceniających tę samą pustą głębię widziało
      // ją jako wolną — każdy z nich osobno — i biegli tam wszyscy naraz.
      claimX:
        a.state === CUTTER_STATE.ACTIVE_CUT || a.state === CUTTER_STATE.INITIATING_CUT
          ? (a.targetX ?? null)
          : null,
      claimY:
        a.state === CUTTER_STATE.ACTIVE_CUT || a.state === CUTTER_STATE.INITIATING_CUT
          ? (a.targetY ?? null)
          : null,
    }))
    const defensePositions = defenseAgents.map((a) => ({
      player: a.player,
      x: a.x,
      y: a.y,
      // vx/vy: tempo domykania luki (patrz closingMps w spatialEvaluator).
      vx: a.vx ?? 0,
      vy: a.vy ?? 0,
    }))

    // Mapa przestrzeni dla obrony — przeliczana w LUDZKIM tempie, nie co tick.
    //
    // Tick to 20 ms, czyli 50 przeliczeń na sekundę. Człowiek nie przewartościowuje
    // sytuacji pięćdziesiąt razy na sekundę — czas reakcji na zmianę kierunku to
    // 112-175 ms (reactionDelayMs), a świadoma ocena „której przestrzeni teraz bronię"
    // jest wolniejsza. Przeliczanie co tick dawało obronie nadludzką czujność i było
    // przy okazji najdroższą częścią symulacji.
    // Punkt odniesienia: w locie miejsce LĄDOWANIA (antycypacja), poza lotem sam dysk.
    const spaceAnchor = flight
      ? { x: flight.landingX ?? flight.toX, y: flight.landingY ?? flight.toY }
      : disc
    if (!spaceCellsCache || ms - spaceCellsCacheMs >= DEFENSE_REASSESS_MS) {
      spaceCellsCache = buildSpaceMap({
        disc: spaceAnchor,
        attackSign,
        teammates: offensePositions,
        defenders: defensePositions,
      })
      spaceCellsCacheMs = ms
    }
    const spaceCells = spaceCellsCache

    let discForAi = disc
    let discSample = null

    if (flight) {
      discSample = sampleFlightDisc(flight, flight.elapsedMs)
      discForAi = { x: discSample.x, y: discSample.y, position: discPosition }
      // Punkt dobiegu w tej chwili lotu: start na punkcie ZAMIERZONYM, korekta na REALNY
      // w miarę czytania lotu (interceptForFlight). Zawsze z dryfem wiatru — bez tego przy
      // silnym wietrze wszyscy biegli tam, gdzie dysk nigdy nie docierał.
      const intercept = interceptForFlight(flight)
      const throwerPos = { x: flight.fromX, y: flight.fromY }

      offenseAgents = offenseAgents.map((agent, idx) => {
        if (agent.id === flight.receiverId) {
          const contested = tickFlightContestAgent(
            agent,
            intercept,
            agent.player ?? throwDecision.receiver,
            'offense',
            discSample,
            rng,
          )
          return {
            ...contested,
            teamId: possessionTeam,
            fieldRole: agent.fieldRole,
            stackIndex: agent.stackIndex,
            isDump: agent.isDump,
            isThrower: false,
          }
        }
        // Rzucający zostaje przy punkcie wypuszczenia — jego zachowanie po rzucie to
        // osobna sprawa i nie zmieniamy go przy okazji.
        if (agent.id === thrower.id || agent.isThrower) {
          return {
            ...tickOffenseAgentDuringFlight(agent, {
              discSample,
              throwerId: thrower.id,
              throwerPos,
              forceSide,
              possessionTeam,
              flight,
              anchor: spaceAnchor,
              rng,
              dtSec: DT_SEC,
              teammates: offensePositions,
            }),
            teamId: possessionTeam,
            fieldRole: agent.fieldRole,
            stackIndex: agent.stackIndex,
            isDump: agent.isDump,
            isThrower: true,
          }
        }
        // CUTY NIE ZATRZYMUJĄ SIĘ NA CZAS LOTU. Wcześniej w tej fazie cutterzy tylko
        // przestawiali się strukturalnie (tickOffenseAgentDuringFlight), a cięcie
        // zaczynało się dopiero, gdy ktoś trzymał dysk. Skutek: KAŻDY deep cut startował
        // od zera po chwycie i potrzebował 4-5 s, więc huck powstawał tylko wtedy, gdy
        // rzucający długo trzymał dysk. Stąd sztuczny kompromis „szybkie wypuszczanie
        // albo hucki" — zmierzone: po urealnieniu czasu decyzji hucki spadły do 2.1%.
        // Realnie cutterzy tną cały czas i dostosowują trasy do sytuacji, więc w chwili
        // chwytu część cutów jest już rozwinięta. Rzucający, który zostaje
        // (isThrower/receiver), nadal ma osobną obsługę wyżej.
        return {
          ...tickCutterBrain({ ...agent, player: agent.player }, {
            dtSec: DT_SEC,
            // Cutterzy odnoszą się do miejsca, gdzie dysk BĘDZIE — tam zacznie się gra.
            disc: spaceAnchor,
            // Czy dysk jest w powietrzu i czy leci DO MNIE — cutter po rozpoczęciu
            // deep cutu ogląda się i na tej podstawie biegnie dalej albo zawraca.
            discInFlight: !!flight,
            flightIsForMe: !!flight && flight.receiverId === (agent.player?.id ?? agent.id),
            possessionTeam,
            forceSide,
            situation: evaluatePlayerSituation(agent.player ?? agent, {
              x: agent.x,
              y: agent.y,
              offensePositions,
              defensePositions,
              disc: spaceAnchor,
              forceSide,
              possessionTeam,
              throwerPos,
            }),
            rng,
            stackIndex: agent.stackIndex ?? 0,
            isThrower: false,
            isDump: agent.isDump,
            throwerId: thrower.id,
            throwerPos,
            elapsedMs: ms,
            teammates: offensePositions,
            defenders: defensePositions,
            activeCutters: offenseAgents.filter((a) => a.state === CUTTER_STATE.ACTIVE_CUT).length,
            attackStyle,
            maxCutters: maxConcurrentCutters(attackStyle),
            offenseTactics: offenseTeam?.tactics,
          }),
          teamId: possessionTeam,
          fieldRole: agent.fieldRole,
          stackIndex: agent.stackIndex,
          isDump: agent.isDump,
          isThrower: agent.isThrower ?? false,
        }
      })

      defenseAgents = defenseAgents.map((defAgent) => {
        const isPrimary =
          defAgent.player?.id === flight.defenderId || defAgent.id === flight.defenderId
        if (isPrimary) {
          // Reakcja na wypuszczony dysk zajmuje chwilę — dobrze pokonany obrońca (duży
          // margines separacji) stoi dłużej, zanim zacznie gonić nowy cel (patrz komentarz
          // w createFlightContext), zamiast biec pełną prędkością od pierwszego ticka lotu.
          if (flight.elapsedMs < (flight.defenderReactionDelayMs ?? 0)) {
            return { ...defAgent, state: DEFENDER_STATE.CONTESTING_DISC }
          }
          const contested = tickFlightContestAgent(
            defAgent,
            intercept,
            defAgent.player ?? throwDecision.defender,
            'defense',
            discSample,
            rng,
            flight.defenderSpeedMult ?? 1,
          )
          return {
            ...contested,
            state: DEFENDER_STATE.CONTESTING_DISC,
          }
        }
        // POACH NA LECĄCY DYSK — obrońca nie swojego zawodnika może porzucić krycie i
        // pójść po blok, jeśli oceni, że dobiegnie do dysku przed odbiorcą. Warunkiem
        // jest, żeby w ogóle to ZAUWAŻYŁ: szansa dostrzeżenia skaluje się czytaniem gry,
        // więc słabszy obrońca przegapi okazję, którą lepszy wykorzysta.
        {
          const dp = defAgent.player ?? defAgent
          const recvAgentNow = offenseAgents.find((o) => o.id === flight.receiverId)
          if (!globalThis.__OFF_FLIGHTPOACH && recvAgentNow && !defAgent.poachCommitted) {
            const myT = Math.hypot(intercept.x - defAgent.x, intercept.y - defAgent.y) / Math.max(3, sprintSpeedMps(dp, 'defense'))
            const hisT = Math.hypot(intercept.x - recvAgentNow.x, intercept.y - recvAgentNow.y) / Math.max(3, sprintSpeedMps(recvAgentNow.player ?? recvAgentNow, 'offense'))
            const flightLeftSec = Math.max(0, (flight.totalFlightMs - flight.elapsedMs) / 1000)
            const canBeatHim = myT + POACH_BEAT_MARGIN_SEC < hisT && myT <= flightLeftSec
            if (canBeatHim) {
              const read =
                subStat(dp, 'mental', 'vision') * 0.35 +
                subStat(dp, 'defensive', 'blocking') * 0.35 +
                subStat(dp, 'mental', 'reactions') * 0.3
              const notices = rng.float() < Math.max(0, Math.min(0.9, (read - 55) / 45)) * POACH_NOTICE_MAX
              if (notices) defAgent.poachCommitted = true
            }
          }
          if (defAgent.poachCommitted) {
            const contested = tickFlightContestAgent(
              defAgent, intercept, dp, 'defense', discSample, rng, 1,
            )
            return { ...contested, state: DEFENDER_STATE.CONTESTING_DISC, poachCommitted: true }
          }
        }

        const targetOff = personMark
          ? resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups)
          : resolvePersonMarkTarget(defAgent, offenseAgents, null)
        const isMarkerOnThrower =
          targetOff?.isThrower || targetOff?.player?.id === thrower.id
        return tickDefenseAgent(defAgent, {
          targetOffense: targetOff,
          throwerAgent,
          disc: discForAi,
          forceSide,
          dtSec: DT_SEC,
          ms,
          isMarkerOnThrower,
          defenseStyle,
          possessionTeam,
          stallCount: 1,
          rng,
          activePoachers: defenseAgents.filter((a) => a.state === DEFENDER_STATE.POACHING)
            .length,
          attackSign,
          defenseTactics: defenseTeam?.tactics,
          spaceCells,
        })
      })

      const adjusted = applyFlightResolutionToAgents(
        flight,
        offenseAgents,
        defenseAgents,
        discSample,
      )
      offenseAgents = adjusted.offenseAgents
      defenseAgents = adjusted.defenseAgents

      // BLOK NA TORZE: dysk przechodzi przez zasięg obrońcy w drodze do odbiorcy. Liczy
      // się tylko przelot (poza oknem dolotu — końcówkę rozstrzyga kontest powietrzny) i
      // dopiero po czasie reakcji obrońcy: dysku, którego jeszcze nie przeczytał, nie
      // zetnie. Każdy obrońca ma jedną próbę na lot.
      if (!laneBlock && discSample.timeToDisc > AERIAL_WINDOW_MS) {
        const discSpeedMps =
          prevDiscSample != null
            ? Math.hypot(discSample.x - prevDiscSample.x, discSample.y - prevDiscSample.y) /
              (SIM_TICK_MS / 1000)
            : 0
        for (const dAgent of defenseAgents) {
          const dId = agentPlayerId(dAgent)
          if (dId == null || laneBlockTried.has(dId)) continue
          const dPlayer = dAgent.player ?? dAgent
          let prof = laneBlockProfiles.get(dId)
          if (!prof) {
            prof = {
              player: dPlayer,
              reactionMs: defenderReactionDelayMs(dPlayer),
              reachOutM: Math.max(0.5, horizontalReachM(dPlayer)),
              reachUpM: Math.max(0.5, maxAerialReachM(dPlayer)),
            }
            laneBlockProfiles.set(dId, prof)
          }
          if (flight.elapsedMs < prof.reactionMs) continue
          const horiz = Math.hypot(discSample.x - dAgent.x, discSample.y - dAgent.y)
          const ex = horiz / prof.reachOutM
          const ez = Math.max(0, (discSample.z ?? 0) - (dAgent.z ?? 0)) / prof.reachUpM
          const envelope = Math.sqrt(ex * ex + ez * ez)
          if (envelope > 1) continue
          laneBlockTried.add(dId)
          if (rng.float() < laneBlockChance(dPlayer, envelope, discSpeedMps)) {
            laneBlock = {
              defenderId: dId,
              x: discSample.x,
              y: discSample.y,
              z: discSample.z ?? 0,
              ms: flight.elapsedMs,
              envelope,
              discSpeedMps,
            }
            break
          }
        }
        if (laneBlock) {
          // Lot kończy się TU — dysk nie leci dalej, a strata jest w miejscu przecięcia,
          // nie przy odbiorcy.
          frames.push(
            snapshotFrame(
              ms,
              offenseAgents,
              defenseAgents,
              thrower.id,
              discPositionInFlight(laneBlock.x, laneBlock.y, laneBlock.z),
              markerId,
              liveStall,
            ),
          )
          break
        }
      }

      if (discSample.timeToDisc <= AERIAL_WINDOW_MS) {
        if (!shadowContest) {
          shadowContest = {
            receiverMinDist3D: Infinity,
            defenders: new Map(),
            discZAtClosest: 0,
            // Jak wysoko dysk był, wchodząc w strefę dolotu — wejście bramki sky.
            approachMaxZ: 0,
            // Kto i kiedy mógł sięgnąć dysku — okno szersze niż to poniżej, patrz
            // AERIAL_WINDOW_MS.
            aerialReceiver: null,
            aerialDefenders: new Map(),
          }
        }
        // Wąskie okno (moment lądowania) rządzi bramką „czy odbiorca w ogóle dobiegł" —
        // zostaje dokładnie takie, jak było skalibrowane.
        const inContestWindow = discSample.timeToDisc <= CONTEST_WINDOW_MS
        // Wysokość dysku w strefie dolotu (nie na całej trasie): interesuje nas, czy
        // SPADAŁ na zawodników przy punkcie dostarczenia, a nie jak wysoko leciał w pół drogi.
        const distToTarget = Math.hypot(
          discSample.x - (flight.trueLandingX ?? flight.toX),
          discSample.y - (flight.trueLandingY ?? flight.toY),
        )
        if (distToTarget <= AERIAL_CALIBRATION.skyZoneM && discSample.z > shadowContest.approachMaxZ) {
          shadowContest.approachMaxZ = discSample.z
        }
        const recvAgent = offenseAgents.find((a) => a.id === flight.receiverId)
        if (recvAgent) {
          if (inContestWindow) {
            const d3 = discReachGapM(
              recvAgent,
              recvAgent.player ?? throwDecision.receiver,
              discSample,
            )
            if (d3 < shadowContest.receiverMinDist3D) {
              shadowContest.receiverMinDist3D = d3
              shadowContest.discZAtClosest = discSample.z ?? 0
            }
          }
          shadowContest.aerialReceiver = trackAerialTake(
            shadowContest.aerialReceiver,
            recvAgent,
            recvAgent.player ?? throwDecision.receiver,
            discSample,
          )
        }
        for (const dAgent of defenseAgents) {
          const dId = agentPlayerId(dAgent)
          if (dId == null) continue
          if (inContestWindow) {
            const d3 = discReachGapM(dAgent, dAgent.player ?? dAgent, discSample)
            const prev = shadowContest.defenders.get(dId)
            if (prev == null || d3 < prev) shadowContest.defenders.set(dId, d3)
          }
          shadowContest.aerialDefenders.set(
            dId,
            trackAerialTake(
              shadowContest.aerialDefenders.get(dId),
              dAgent,
              dAgent.player ?? dAgent,
              discSample,
              recvAgent,
            ),
          )
        }
      }

      prevDiscSample = discSample
      flight.elapsedMs += SIM_TICK_MS
    } else {
      const throwerPos = { x: discX, y: discY }
      const activeCutterCount = offenseAgents.filter(
        (a) =>
          !a.isThrower &&
          (a.state === CUTTER_STATE.ACTIVE_CUT || a.state === CUTTER_STATE.INITIATING_CUT),
      ).length

      offenseAgents = offenseAgents.map((agent, idx) => {
        if (agent.isThrower) {
          return { ...agent, x: discX, y: discY }
        }
        const situation = evaluatePlayerSituation(agent.player, {
          x: agent.x,
          y: agent.y,
          vx: agent.vx ?? 0,
          vy: agent.vy ?? 0,
          offensePositions,
          defensePositions,
          disc,
          forceSide,
          possessionTeam,
          throwerPos,
        })
        return {
          ...tickCutterBrain({ ...agent, player: agent.player }, {
            dtSec: DT_SEC,
            disc,
            possessionTeam,
            forceSide,
            situation,
            rng,
            stackIndex: agent.stackIndex ?? idx,
            isThrower: false,
            isDump: agent.isDump,
            postCatchReorg,
            throwerId: thrower.id,
            throwerPos,
            postResetClearout,
            elapsedMs: ms,
            teammates: offensePositions,
            // Cutter czyta WOLNĄ PRZESTRZEŃ (spaceMap.js), a obrońcy ją odbierają —
            // bez ich pozycji mapa widziałaby tylko zatykanie przez kolegów.
            defenders: defensePositions,
            activeCutters: activeCutterCount,
            attackStyle,
            maxCutters: maxConcurrentCutters(attackStyle),
            offenseTactics: offenseTeam?.tactics,
          }),
          teamId: possessionTeam,
          fieldRole: agent.fieldRole,
          stackIndex: agent.stackIndex,
          isDump: agent.isDump,
          isThrower: false,
        }
      })

      defenseAgents = defenseAgents.map((defAgent) => {
        const targetOff = personMark
          ? resolvePersonMarkTarget(defAgent, offenseAgents, personMatchups)
          : resolvePersonMarkTarget(defAgent, offenseAgents, null)
        const isMarkerOnThrower =
          targetOff?.isThrower || targetOff?.player?.id === thrower.id
        const activePoachers = defenseAgents.filter(
          (a) => a.state === DEFENDER_STATE.POACHING,
        ).length
        return tickDefenseAgent(defAgent, {
          targetOffense: targetOff,
          throwerAgent,
          disc,
          forceSide,
          dtSec: DT_SEC,
          ms,
          isMarkerOnThrower,
          defenseStyle,
          possessionTeam,
          stallCount: decisionStall,
          rng,
          activePoachers,
          attackSign,
          defenseTactics: defenseTeam?.tactics,
          spaceCells,
        })
      })
    }

    if (staminaMaps) {
      drainAgentsTickStamina(
        staminaMaps,
        offenseAgents,
        possessionTeam,
        possessionTeam,
        tickKinematics,
        DT_SEC,
      )
      drainAgentsTickStamina(
        staminaMaps,
        defenseAgents,
        defenseTeamId,
        possessionTeam,
        tickKinematics,
        DT_SEC,
      )
    }

    let discSnapshot = null
    if (flight) {
      const sample =
        discSample ?? sampleFlightDisc(flight, Math.max(0, flight.elapsedMs - SIM_TICK_MS))
      if (flightComplete(flight)) {
        discSnapshot = finalDiscAfterFlight(flight, sample, offenseAgents, attackSign)
      } else {
        discSnapshot = discPositionInFlight(sample.x, sample.y, sample.z ?? 0)
      }
    } else if (throwerAgent) {
      discSnapshot = discPositionHeld(throwerAgent.x, throwerAgent.y, attackSign)
    }

    frames.push(
      snapshotFrame(ms, offenseAgents, defenseAgents, thrower.id, discSnapshot, markerId, liveStall),
    )

    if (!flight) {
      if (ms - scanCacheMs >= THROWER_SCAN_MS || scanCache === null) {
        scanCacheMs = ms
        scanCache = scanThrowOptions(thrower, offenseAgents, defenseAgents, {
          disc,
          stallCount: decisionStall,
          forceSide,
          possessionTeam,
          wind,
          rng,
          setupElapsedMs: ms,
          postCatchReorg,
          lastThrowerId,
          hardStallCount: Math.max(hardStallCount ?? 1, decisionStall),
          requireForwardPass,
          attackStyle,
          defenseStyle,
          offenseTactics: offenseTeam?.tactics,
        })
      }
      const option = scanCache

      const atkStyle = attackStyle
      const defStyle = defenseStyle
      const throwerCoach = mergeTraitAndCoachMods(thrower, offenseTeam?.tactics, 'offense')
      const gateBase =
        throwReleaseGateMs(decisionStall, option?.forwardProgress ?? 0, {
          postCatchReorg,
          isContinuationCut: option?.isContinuationCut === true,
          separation: option?.situation?.separation ?? 0,
          crowded: option?.traffic?.crowded === true,
          teammateCrowd: option?.traffic?.teammateCrowd ?? 0,
          continuationUrgency: attackMods(atkStyle).continuationUrgency ?? 0.15,
          thrower,
        }) *
          throwReleaseGateMultiplier(atkStyle, defStyle) *
          (throwerCoach.releaseGateMult ?? 1) +
        throwerPatienceBonusMs(thrower)
      // Jitter w górę częściej niż w dół — rzadziej „przyśpieszamy” set play.
      const releaseGateMs = gateBase * (0.95 + rng.float() * 0.25)
      if (option && ms >= Math.max(0, releaseGateMs)) {
        if (globalThis.__DEC) {
          globalThis.__DEC.push({
            score: option.score,
            isDump: !!option.isDump,
            resetAvailable: !!option.resetAvailable,
            resetScore: option.resetScore,
            thr: option.acceptThreshold,
            sep: option.situation?.separation ?? null,
            crowd: option.traffic?.teammateCrowd ?? null,
            lane: option.laneVal ?? null,
            brk: option.breakVal ?? null,
            arrival: option.arrivalVal ?? null,
            phase: option.phaseVal ?? null,
          })
        }
        const defender = isPersonDefense(defenseStyle)
          ? defenderForPersonMark(personMatchups, option.player, defenseLineup, rng)
          : defenseLineup[0]
        const recvAgent =
          option.agent ??
          offenseAgents.find((a) => a.player?.id === option.player?.id)
        const fromX = throwerAgent?.x ?? discX
        const fromY = throwerAgent?.y ?? discY
        // Rzut w lead / punkt cutu (B), nie w bieżącą pozycję startu cutu (A). Samouzgodniony
        // dwuprzebiegowy dobór sufitu predykcji (ciasny -> hojny tylko jeśli WYNIK sam z
        // siebie wychodzi huck-owy) — patrz komentarz przy analogicznym wywołaniu w
        // throwerBrain.js.
        const catchPt =
          option.catchX != null && option.catchY != null
            ? { x: option.catchX, y: option.catchY }
            : (() => {
                const tight = predictReceiverCatchPoint(recvAgent, fromX, fromY)
                const tightDist = Math.hypot(tight.x - fromX, tight.y - fromY)
                if (tightDist < HUCK_MIN_M) return tight
                return predictReceiverCatchPoint(
                  recvAgent,
                  fromX,
                  fromY,
                  DEEP_CUT_FLIGHT_SPEED_MPS(),
                  DEEP_CUT_MAX_LEAD_SEC,
                )
              })()
        const toX = catchPt.x
        const toY = catchPt.y

        throwDecision = {
          receiver: option.player,
          receiverAgent: recvAgent,
          throwType: option.throwType ?? THROW_TYPE.STANDARD,
          throwTechnique: option.throwTechnique,
          isOpenSide: option.isOpenSide,
          defender,
          separation: separationFromSituation(option.situation, rng, decisionStall),
          throwMs: ms,
          holdMs,
          // Stall z zegara posiadania (1 s = 1); nie podbijaj sztucznie do 1 przed 1. sekundą.
          stallCount: Math.max(1, liveStall || stallCountFromHoldMs(Math.max(holdMs, 1000))),
          optionScore: option.score,
          flightSpeedMps: option.flightSpeedMps ?? null,
          // LEADING PASS = odbiorca oddalał się od rzucającego, więc dysk musiał
          // poczekać na niego w przestrzeni. IN-CUT = wbiegał w lecący dysk.
          // Ta sama miara, którą wykonanie dobiera tempo lotu (flightSpeed.js).
          leadingPass: paceFracFor(recvAgent, fromX, fromY) < 0.5,
          // Podrole obu stron zagrania — podrola jest wyliczana per agent przy
          // budowaniu składu i nigdzie indziej nie jest zapisywana, więc bez tego
          // statystyki nie potrafią rozbić rzutów wg roli.
          throwerSubRole: throwerAgent?.subRole ?? null,
          receiverSubRole: recvAgent?.subRole ?? null,
          catchX: toX,
          catchY: toY,
          laneThreats: option.laneThreats ?? option.traffic?.laneThreats ?? [],
          traffic: option.traffic ?? null,
          markerId,
        }

        if (onThrowCommitted) {
          const commit = onThrowCommitted(throwDecision, {
            offenseAgents,
            defenseAgents,
            ms,
          })
          if (commit?.abort) {
            // Odrzucony look — nie przerywaj setupu; stall płynie dalej.
            throwDecision = null
            continue
          }
          const trajectory =
            commit?.trajectory ?? throwProfile(throwDecision.throwType).trajectory
          if (commit?.throwType) throwDecision.throwType = commit.throwType
          if (commit?.defender) throwDecision.defender = commit.defender
          const flightDefender = throwDecision.defender ?? defender
          // Faza 4b planu 3D: gorszy rzut (mały/ujemny margines throwScore-defenseScore)
          // może przesunąć realny cel lotu (miss) — geometria po zakończeniu lotu decyduje
          // wtedy naprawdę, czy taki tor kończy się złapaniem. Patrz resolution.js:
          // computeMissDistanceM, point.js: onThrowCommitted.
          const finalToX = commit?.adjustedToX ?? toX
          const finalToY = commit?.adjustedToY ?? toY
          flight = createFlightContext({
            fromX,
            fromY,
            toX: finalToX,
            toY: finalToY,
            // ZAMIERZONY punkt (przed chybieniem) — to jego czytają zawodnicy i tam
            // biegną. Dysk leci do finalToX/finalToY, czyli tam, gdzie realnie poleciał.
            aimX: toX,
            aimY: toY,
            throwType: throwDecision.throwType,
            trajectory,
            // Z czego dysk wychodzi: forehand niżej, hammer znad głowy, rzut łamiący
            // marka dołem albo górą (discReleaseHeightM).
            throwTechnique: throwDecision.throwTechnique ?? null,
            isOpenSide: throwDecision.isOpenSide ?? true,
            // Ustawienie obrony w chwili wypuszczenia — rzucający ocenia po nim, którym
            // torem dysk najtrudniej zablokować (throwShape.js).
            defenseAgents: defenseAgents.map((d) => ({ x: d.x, y: d.y, player: d.player ?? d })),
            receiverDefenderAgent: flightDefender
              ? defenseAgents.find(
                  (d) => (d.player?.id ?? d.id) === flightDefender.id,
                ) ?? null
              : null,
            receiverId: throwDecision.receiver.id,
            defenderId: flightDefender?.id,
            throwerId: thrower.id,
            thrower,
            receiver: throwDecision.receiver,
            receiverAgent: throwDecision.receiverAgent,
            // Float wybrany przez rzucającego razem z punktem dostarczenia.
            chosenFlightSpeedMps: throwDecision.flightSpeedMps ?? null,
            separationMargin: commit?.separation?.margin ?? throwDecision.separation?.margin ?? null,
            rng,
            resolution: commit?.resolution ?? null,
            throwMs: ms,
            weather: wind,
          })
          if (commit?.separation) throwDecision.separation = commit.separation
          commitMeta = commit
        } else {
          break
        }
      }
    }
  }

  if (stallOut || !throwDecision) {
    return {
      stallAbort: true,
      stallOut,
      frames,
      tickMs: SIM_TICK_MS,
      holdMsAtEnd,
      holdStartMs,
      stallCount: stallCountFromHoldMs(holdMsAtEnd),
      markerId,
      endStates: snapshotAgentStates(offenseAgents, defenseAgents),
      motionTrace: buildMotionTracePayload({
        frames,
        throwMs: null,
        discX,
        discY,
        flight: null,
        possessionTeam,
        markerId,
        holdStartMs,
      }),
    }
  }

  const motionTrace = buildMotionTracePayload({
    frames,
    throwMs: throwDecision.throwMs,
    discX,
    discY,
    flight,
    possessionTeam,
    resolution: flight?.resolution ?? commitMeta?.resolution ?? null,
    markerId,
    holdStartMs,
  })

  // Blok na torze zamyka sprawę: dysk nigdy nie doleciał do odbiorcy, więc nie ma czego
  // rozstrzygać w powietrzu.
  const geoResolution = laneBlock
    ? {
        success: false,
        isBlock: true,
        isDrop: false,
        defenderId: laneBlock.defenderId,
        reason: 'lane_block',
        laneBlock,
      }
    : computeGeometricResolution(shadowContest, flight, rng)

  return {
    stallAbort: false,
    stallOut: false,
    commitAbort: false,
    commitMeta,
    receiver: throwDecision.receiver,
    throwType: throwDecision.throwType,
    throwTechnique: throwDecision.throwTechnique,
    throwerSubRole: throwDecision.throwerSubRole ?? null,
    receiverSubRole: throwDecision.receiverSubRole ?? null,
    leadingPass: throwDecision.leadingPass ?? null,
    isOpenSide: throwDecision.isOpenSide,
    defender: throwDecision.defender,
    separation: throwDecision.separation,
    throwMs: throwDecision.throwMs,
    holdMsAtEnd: throwDecision.holdMs ?? holdMsAtEnd,
    holdStartMs,
    stallCount: throwDecision.stallCount ?? stallCountFromHoldMs(throwDecision.holdMs ?? holdMsAtEnd),
    markerId,
    frames,
    tickMs: SIM_TICK_MS,
    discX,
    discY,
    motionTrace,
    endStates: snapshotAgentStates(offenseAgents, defenseAgents),
    geometricResolution: geoResolution,
    geometricShadow: (() => {
      const g = summarizeShadowContest(shadowContest, flight)
      if (g) {
        const ra = throwDecision.receiverAgent
        const predictedLeadDist =
          ra != null ? Math.hypot(flight.toX - ra.x, flight.toY - ra.y) : null
        __shadowContestLog.push({
          ...g,
          throwType: throwDecision.throwType,
          receiverState: ra?.state ?? null,
          receiverId: flight.receiverId,
          assignedDefenderId: flight.defenderId,
          separationOutcome: throwDecision.separation?.outcome ?? null,
          predictedLeadDist,
          totalFlightMs: flight.totalFlightMs,
          throwDistanceM: Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY),
          // Realna decyzja geometrii (to, co trafia do gry) + wejścia kontestu
          // powietrznego — bez tego z logu nie da się odróżnić „odbiorca nie dobiegł"
          // od „dobiegł i przegrał walkę w powietrzu".
          geoSuccess: geoResolution?.success ?? null,
          geoIsBlock: geoResolution?.isBlock ?? null,
          geoIsDrop: geoResolution?.isDrop ?? null,
          geoReason: geoResolution?.reason ?? null,
          laneBlock: geoResolution?.laneBlock ?? null,
          discZAtClosest: shadowContest?.discZAtClosest ?? null,
          approachMaxZ: shadowContest?.approachMaxZ ?? null,
          throwArc: flight.throwArc ?? null,
          throwCurve: flight.throwCurve ?? null,
          minLaneGap: flight.minLaneGap ?? null,
          judgementLoss: flight.judgementLoss ?? null,
          shapeScore: flight.shapeScore ?? null,
          bestShapeScore: flight.bestShapeScore ?? null,
          arcExecutionError: flight.arcExecutionError ?? null,
          peakHeightM: flight.peakHeightM ?? null,
          releaseHeightM: flight.releaseHeightM ?? null,
          aerial: geoResolution?.aerialDebug ?? null,
        })
      }
      return g
    })(),
  }
}

/** @deprecated Użyj {@link runContinuousThrowSimulation} — zachowane dla kompatybilności (bez fazy lotu). */
export function runThrowSetupSimulation(params) {
  return runContinuousThrowSimulation({ ...params, onThrowCommitted: null })
}
