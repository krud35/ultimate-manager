import { clampAgentPosition, evaluatePlayerSituation } from './spatialEvaluator.js'
import { attackDirectionX, clampFieldX, clampFieldY, fieldCenterY } from '../fieldDimensions.js'
import { forceMarkLayoutSide, normalizeForceMark } from '../throwTechnique.js'
import {
  pickBreakSideClearTarget,
  spacingAdjustedTarget,
  resetSlotTarget,
} from './offenseReorganization.js'
import {
  formationStructuralTarget,
  preferredCutKind,
  ATTACK_STYLES,
} from './tacticsBehavior.js'
import { maxSpeedMps, plantStopMs, subStat } from './statFormulas.js'
import { buildSpaceMap, perceiveSpaceMap, YARD_REF_M } from './spaceMap.js'
import { mergeTraitAndCoachMods } from '../coachDirectives.js'
import { integrateAgentMotion, repositionSpeedMps, waitingHoldSpeedMps } from './playerMovement.js'
import {
  subRoleForAgent,
  subRoleAllowsInitiateCut,
  HANDLER_SUB_ROLES,
} from '../playerSubRoles.js'

export const CUTTER_STATE = {
  WAITING: 'WAITING',
  INITIATING_CUT: 'INITIATING_CUT',
  ACTIVE_CUT: 'ACTIVE_CUT',
  CLEARING: 'CLEARING',
}

const ACTIVE_CUT_MS_BASE = 1600
/** Sufit czasu jednego cutu — nawet najdłuższy deep kiedyś się kończy i trzeba clearować. */
const MAX_ACTIVE_CUT_MS = 5200

/**
 * Co ile ms biegnący cutter PRZEGLĄDA swój cut na nowo.
 *
 * Dotąd cel był wybierany raz, przy starcie, i zawodnik biegł do niego przez cały cut —
 * po wydłużeniu cutów do 5.2 s (żeby deep w ogóle mógł dobiec) oznaczało to nawet pięć
 * sekund biegu do punktu wybranego na podstawie nieaktualnego już obrazu boiska.
 * Realnie cutter cały czas czyta sytuację: koryguje kierunek, a gdy obrońca go przykryje
 * i nic lepszego nie ma — rezygnuje i schodzi w clearing, zwalniając przestrzeń.
 * Tempo przeglądu jest takie samo jak przewartościowanie obrony (300 ms), więc żadna
 * strona nie dostaje przewagi w częstotliwości decyzji.
 */
const CUT_REVIEW_MS = 300
/** O ile lepszy musi być nowy cel, żeby zmienić kierunek w biegu (histereza). */
const CUT_RETARGET_MARGIN = 18
/** Poniżej tego wyniku najlepszej opcji cutter rezygnuje i schodzi w clearing. */
const CUT_ABANDON_SCORE = 42

/**
 * Opóźnienie startu cutu i błąd ustawienia w formacji — czyli NIEIDEALNOŚĆ ATAKU.
 *
 * Obrona miała realne opóźnienie reakcji (reactionDelayMs, 112-175 ms) i cushion zależny
 * od statów, a atak nie miał NICZEGO: cutter decydował i w następnym ticku (20 ms) biegł
 * już na pełnym zaangażowaniu, trafiał w slot formacji co do metra i czytał zajętość
 * boiska bezbłędnie. To była asymetria wpisana w architekturę, nie w statystyki.
 *
 * Teraz start cutu kosztuje czas (rozpoznanie sytuacji + decyzja + ruszenie z miejsca),
 * a ustawienie w formacji ma błąd malejący ze znajomością systemu ofensywnego.
 */
const CUT_INITIATION_SLOW_MS = 520
const CUT_INITIATION_FAST_MS = 160
/** Maks. błąd ustawienia w slocie formacji (m) przy słabej znajomości systemu. */
const SLOT_ERROR_MAX_M = 3.2

function cutInitiationMs(player) {
  const skill =
    subStat(player, 'mental', 'reactions') * 0.5 + subStat(player, 'mental', 'decisionMaking') * 0.5
  const t = Math.max(0, Math.min(1, (skill - 50) / 45))
  return Math.round(CUT_INITIATION_SLOW_MS + (CUT_INITIATION_FAST_MS - CUT_INITIATION_SLOW_MS) * t)
}

/** Błąd ustawienia: gdzie zawodnikowi się WYDAJE, że jest jego miejsce w formacji. */
function slotWithError(slot, player, rng) {
  if (!rng?.float) return slot
  const systems = subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const err = Math.max(0, Math.min(1, 1 - (systems - 50) / 45))
  if (err < 0.02) return slot
  return {
    x: clampFieldX(slot.x + (rng.float() - 0.5) * SLOT_ERROR_MAX_M * err),
    y: clampFieldY(slot.y + (rng.float() - 0.5) * SLOT_ERROR_MAX_M * err),
  }
}
const REORG_WINDOW_MS = 700
const CLEAR_MAX_MS = 1100
/** Ilu zawodników tnie naraz — reszta trzyma stack i pilnuje przestrzeni. */
const MAX_CONCURRENT_CUTTERS = 2
/** Bliżej dysku niż tyle metrów nie ma sensu inicjować cutu — trzeba najpierw odejść. */
const MIN_CUT_START_DIST_M = 7
const DEG = Math.PI / 180

function layoutSideFromForce(forceSide) {
  return forceMarkLayoutSide(normalizeForceMark(forceSide))
}

function vectorAtAngle(attackSign, angleDeg, length) {
  const rad = angleDeg * DEG
  const ax = Math.cos(rad) * attackSign
  const ay = Math.sin(rad)
  const d = Math.hypot(ax, ay) || 1
  return { dx: (ax / d) * length, dy: (ay / d) * length }
}

function pickDiagonalAngleDeg(situation, rng, kind, player) {
  const open = situation.isOpenSide
  const systems = subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const movement = subStat(player, 'offensive', 'cutterMovement')
  const craft = (systems + movement) / 2
  const minA = 12 + (craft - 50) * 0.06
  const maxA = 58 + (craft - 50) * 0.08
  let base = minA + rng.float() * Math.max(8, maxA - minA)
  if (kind === 'in') base *= 0.85 + rng.float() * 0.2
  const sideSign = open ? 1 : -1
  const ySign = situation.preferredCutSideY ?? (rng.float() < 0.5 ? 1 : -1)
  return sideSign * ySign * base
}

function estimateOpenSpaceTarget(agent, disc, attackSign, situation, rng) {
  const cy = fieldCenterY()
  const candidates = []
  for (let i = 0; i < 5; i += 1) {
    const angle = pickDiagonalAngleDeg(
      situation,
      rng,
      i % 2 === 0 ? 'in' : 'deep',
      agent?.player ?? agent,
    )
    const dist = 5 + rng.float() * 11
    const { dx, dy } = vectorAtAngle(attackSign, angle, dist)
    const x = clampFieldX(disc.x + dx)
    const y = clampFieldY(disc.y + dy)
    let score = situation.throwWindowScore ?? 40
    score -= Math.abs(y - cy) < 2 ? 8 : 0
    score -= Math.hypot(x - agent.x, y - agent.y) < 3 ? 6 : 0
    score += situation.isOpenSide ? (y - cy) * 0.4 : (cy - y) * 0.35
    candidates.push({ x, y, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] ?? { x: disc.x + attackSign * 6, y: disc.y }
}

/**
 * Wagi wyboru KOMÓRKI PRZESTRZENI do zaatakowania (patrz spaceMap.js).
 *
 * Sens modelu: cutter nie pyta „jaki cut przewiduje mój styl ataku", tylko „gdzie jest
 * wolne miejsce, do którego zdążę". Formacja wpływa na to POŚREDNIO — przez to, gdzie
 * stoją koledzy, czyli które komórki są zatkane.
 */
/** Główny człon: jak pusta jest komórka (freeness 0-1). */
/**
 * Balans „wartość terenu vs koszt dobiegu" przy wyborze przestrzeni do zaatakowania.
 *
 * Przekalibrowane po przebudowie cienia na model zaangażowania obrońcy. Wcześniej te
 * wagi były bezsilne: tło mapy miało freeness 0.97 w głębi przy 0.63 pod dyskiem, więc
 * niezależnie od ustawień cutterzy biegli daleko (sweep: krótkie rzuty 14.0-15.9% przy
 * siedmiokrotnej zmianie stosunku wag). Po wyrównaniu cienia do ~0.5 w każdym paśmie
 * ciąg ku głębi przeniósł się w całości do tego jawnego члena i wagi zaczęły działać.
 *
 * Sweep na nowym modelu (tmp-sweep/space-sweep.mjs, rozproszone seedy):
 *   45/8  -> krótkie 17.7%  długie 25.1%  rzut/pkt 5.98
 *   30/14 -> krótkie 21.3%  długie 12.9%  rzut/pkt 8.56
 *   18/20 -> krótkie 24.7%  długie  7.0%  rzut/pkt 10.06  <- wybrane
 *   8/28  -> krótkie 26.4%  długie  8.1%  rzut/pkt 10.06
 * 18/20 trafia w pasmo długich (5-10%) i rzutów na punkt (7-12) przy completion 89.9%.
 * Krótkie zostają na 24.7% wobec celu 50-60% — reszta luki jest w GEOMETRII pasm
 * (trzy z pięciu środków leżą powyżej 15 m), nie w tych wagach.
 */
export const SPACE_BALANCE = { yard: 12, reach: 26 }
const SPACE_FREE_WEIGHT = 100
/** Osobista preferencja z cech (deep_threat / under_cutter) — cecha ZAWODNIKA, nie
 *  mnożnik taktyki, więc zostaje. */
const SPACE_BIAS_WEIGHT = 40
/** Szum decyzyjny — żeby dwóch cutterów nie wybierało zawsze tej samej komórki. */
const SPACE_NOISE = 12

function pickCutTarget(
  agent,
  disc,
  attackSign,
  situation,
  rng,
  forceSide,
  attackStyle,
  stackIndex,
  offenseTactics = null,
  teammates = null,
  defenders = null,
  throwerPos = null,
) {
  const traitMods = mergeTraitAndCoachMods(agent?.player ?? agent, offenseTactics, 'offense')
  const selfId = agent?.id ?? agent?.player?.id ?? null
  // Zawodnik działa na SWOJEJ percepcji mapy, nie na prawdziwej — patrz perceiveSpaceMap.
  const cells = perceiveSpaceMap(
    buildSpaceMap({
      disc,
      attackSign,
      teammates: teammates ?? [],
      defenders: defenders ?? [],
      ignoreId: selfId,
      // Cutter ocenia przestrzeń ZE SWOJEJ pozycji — kto będzie tam pierwszy.
      viewer: { x: agent.x, y: agent.y },
    }),
    agent?.player ?? agent,
    'offense',
    rng,
  )

  // Brak danych o pozycjach (np. wywołanie spoza pełnego ticku) — stara ścieżka
  // oparta na stylu, żeby nie wywrócić się na niekompletnym kontekście.
  if (!cells.length) {
    return legacyStyleCutTarget(agent, disc, attackSign, situation, rng, forceSide, attackStyle, stackIndex, traitMods)
  }

  const maxAhead = YARD_REF_M
  const speed = Math.max(3, maxSpeedMps(agent?.player ?? agent))
  const deepBias = traitMods.deepCutBias ?? 0
  const underBias = traitMods.underCutBias ?? 0

  let best = null
  let bestScore = -Infinity
  for (const cell of cells) {
    // 1. Wolna przestrzeń — to jest istota decyzji.
    let score = cell.freeness * SPACE_FREE_WEIGHT
    // 2. Ile metrów da zdobycie tej przestrzeni.
    score += (cell.ahead / maxAhead) * SPACE_BALANCE.yard
    // 3. Czy zdążę tam dobiec.
    const runM = Math.hypot(cell.x - agent.x, cell.y - agent.y)
    score -= (runM / speed) * SPACE_BALANCE.reach
    // 4. Osobista preferencja zawodnika.
    if (cell.depth === 'deep') score += deepBias * SPACE_BIAS_WEIGHT
    if (cell.depth === 'under') score += underBias * SPACE_BIAS_WEIGHT
    // 5. Szum, żeby cała linia nie atakowała jednej komórki.
    score += (rng?.float ? rng.float() : 0.5) * SPACE_NOISE
    if (score > bestScore) {
      bestScore = score
      best = cell
    }
  }

  // Cel wewnątrz komórki, lekko rozrzucony — cutter atakuje PRZESTRZEŃ, nie punkt.
  const jitterX = (rng?.float ? rng.float() - 0.5 : 0) * 6
  const jitterY = (rng?.float ? rng.float() - 0.5 : 0) * 6
  const targetX = clampFieldX(best.x + jitterX)
  const targetY = clampFieldY(best.y + jitterY)

  // `kind` jest WZGLĘDNY WOBEC RZUCAJĄCEGO, nie wobec boiska.
  //
  // deep (albo leading pass przy krótszym rzucie) = odbiorca ODDALA SIĘ od rzucającego,
  // biegnie w tę samą stronę, w którą leci dysk. under (in-cut) = odbiorca BIEGNIE
  // W STRONĘ rzucającego. To jest realna definicja z ultimate i nie da się jej wyrazić
  // pasmem boiska: under z głębi vertical stacka i płaski under z linii horizontala
  // trafiały wcześniej do różnych pasm, choć oba są tym samym zagraniem — i odwrotnie,
  // ten sam kawałek boiska bywa deep albo under zależnie od tego, gdzie stoi dysk.
  const anchor = throwerPos ?? disc
  const kind =
    anchor &&
    Math.hypot(targetX - anchor.x, targetY - anchor.y) >
      Math.hypot(agent.x - anchor.x, agent.y - anchor.y)
      ? 'deep'
      : 'in'

  return { kind, x: targetX, y: targetY, score: bestScore }
}

/** Stara ścieżka „rodzaj cutu z reguł stylu" — już tylko awaryjnie, gdy brak pozycji. */
function legacyStyleCutTarget(agent, disc, attackSign, situation, rng, forceSide, attackStyle, stackIndex, traitMods) {
  const side = layoutSideFromForce(forceSide)
  const cy = fieldCenterY()
  const openSpace = estimateOpenSpaceTarget(agent, disc, attackSign, situation, rng)
  let kind = preferredCutKind(attackStyle, stackIndex, rng)
  const deepBias = traitMods.deepCutBias ?? 0
  const underBias = traitMods.underCutBias ?? 0
  if (deepBias !== 0 || underBias !== 0) {
    const pDeep = Math.max(0.05, Math.min(0.95, (kind === 'deep' ? 0.55 : 0.45) + deepBias - underBias))
    kind = rng.float() < pDeep ? 'deep' : 'in'
  }
  if (kind === 'in') {
    const angle = pickDiagonalAngleDeg(
      { ...situation, preferredCutSideY: openSpace.y >= cy ? 1 : -1 },
      rng,
      'in',
      agent?.player ?? agent,
    )
    const dist = 4 + rng.float() * 7
    const { dx, dy } = vectorAtAngle(attackSign, angle, dist)
    const breakBias = side === 'away' ? -0.8 : side === 'home' ? 0.8 : 0
    return { kind: 'in', x: clampFieldX(disc.x + dx + breakBias), y: clampFieldY(disc.y + dy) }
  }
  const outAngle = pickDiagonalAngleDeg({ ...situation, isOpenSide: !situation.isOpenSide }, rng, 'deep', agent)
  const deepDist = Math.min(75, Math.max(20, situation.discDist + 20 + rng.float() * 35))
  const rad = outAngle * DEG
  const downfieldFactor = Math.max(0.82, Math.cos(rad))
  const dx = deepDist * downfieldFactor * attackSign
  const dy = Math.sin(rad) * deepDist
  return { kind: 'deep', x: clampFieldX(disc.x + dx), y: clampFieldY(openSpace.y + dy * 0.45) }
}
function pickClearTarget(x, y, disc, attackSign, forceSide, rng) {
  return pickBreakSideClearTarget(x, y, disc, attackSign, forceSide, rng)
}

/** Pozycja resetu — kilka metrów za dyskiem, na otwartej stronie. */
/**
 * Cel aktywnego resetu — teraz przez MAPĘ PRZESTRZENI, nie przez zaszytą geometrię.
 *
 * Dopóki reset miał własną, niezależną ścieżkę, pasmo resetowe w spaceMap było martwe:
 * istniało w mapie, ale nikt, kto realnie robi reset, z niego nie korzystał. Teraz
 * zawodnik wybiera NAJWOLNIEJSZĄ komórkę resetową (linia dysku i za nią), czyli reset
 * jest normalnym atakiem na wolną przestrzeń, która akurat jest z tyłu — a nie osobną
 * mechaniką obok reszty decyzji.
 */
function pickResetTarget(disc, throwerPos, attackSign, forceSide, rng, cells = null) {
  const slot = resetSlotTarget({ disc, throwerPos, attackSign, forceSide, rng })
  const resetCells = (cells ?? []).filter((c) => c.depth === 'reset')
  if (!resetCells.length) return slot
  // Spośród komórek resetowych bierz najwolniejszą, ale nie odbiegaj daleko od slotu —
  // reset ma pozostać realnym, bliskim wyjściem spod stallu, nie ucieczką przez pół boiska.
  let best = null
  let bestScore = -Infinity
  for (const c of resetCells) {
    const score = c.freeness * 100 - Math.hypot(c.x - slot.x, c.y - slot.y) * 2.5
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best ? { x: clampFieldX(best.x), y: clampFieldY(best.y) } : slot
}

/**
 * Co robi ten zawodnik po chwycie: czyści do stacka, oferuje się do dysku,
 * czy zostaje z tyłu jako reset. Każdy decyduje osobno, na podstawie własnej sytuacji.
 */
function pickPostCatchRole(agent, situation, isDump, stackIndex, rng, canCut, coachMods) {
  if (situation?.inThrowLane) return 'clear'
  if (isDump || coachMods?.preferDumpRole) return 'reset'
  if (!canCut) return 'clear'
  const priority = cutPriority(agent.player, situation, stackIndex)
  let offerChance = Math.max(0, Math.min(0.8, (priority - 38) / 55))
  offerChance = Math.max(0, Math.min(0.92, offerChance + (coachMods?.postCatchOfferBonus ?? 0)))
  return (rng?.float ? rng.float() : 0.5) < offerChance ? 'offer' : 'clear'
}

/**
 * Odległość od najbliższego obrońcy (m), przy której krycie nie pomaga ani nie szkodzi
 * decyzji o rozpoczęciu cutu — mniej więcej typowy cushion krycia 1-na-1.
 */
const CUT_COVERAGE_NEUTRAL_M = 2.5
/** Ile punktów priorytetu waży każdy metr (nad/pod progiem neutralnym). */
const CUT_COVERAGE_WEIGHT = 4
/** Sufit wpływu krycia w obie strony — żeby zupełnie wolny cutter nie dostawał
 *  nieograniczonego priorytetu, a szczelnie kryty nie był wyłączony na stałe. */
const CUT_COVERAGE_CLAMP = 8

function cutPriority(player, situation, stackIndex) {
  const cutterMovement = subStat(player, 'offensive', 'cutterMovement')
  const systems = subStat(player, 'offensive', 'offensiveSystemsKnowledge')
  const catching = subStat(player, 'offensive', 'catching')
  const speed = subStat(player, 'physical', 'speed')
  let p =
    cutterMovement * 0.45 +
    speed * 0.18 +
    systems * 0.12 +
    catching * 0.1 +
    (situation.throwWindowScore ?? 0) * 0.22
  p -= (situation.cloggingLevel ?? 0) * 4
  p -= stackIndex * 0.8

  // Jawny człon krycia. Bez niego sama część „własne umiejętności" dawała przy typowych
  // statach (~80) już ~68 pkt przy bramce 64 — cutter startował ZAWSZE, gdy był wolny
  // slot, niezależnie od tego, jak ciasno był kryty, a krycie wchodziło tylko pośrednio
  // przez throwWindowScore*0.22. Efekt: atak zawsze produkował otwarte opcje, jakość
  // obrony nie wpływała na wynik meczu (test win-rate: płasko 40/20/25/35%).
  // Teraz sloty cutowe (MAX_CONCURRENT_CUTTERS) trafiają do najmniej krytych zawodników,
  // a przeciw szczelnej obronie po prostu startuje mniej cutów — thrower musi czekać albo
  // resetować, zamiast dostawać otwartą opcję za darmo. Ucieczka przez cutRoll zostaje,
  // więc kryty cutter nadal czasem pobiegnie (inaczej atak by zamarzał).
  const sep = situation.separation ?? CUT_COVERAGE_NEUTRAL_M
  const coverage = (sep - CUT_COVERAGE_NEUTRAL_M) * CUT_COVERAGE_WEIGHT
  p += Math.max(-CUT_COVERAGE_CLAMP, Math.min(CUT_COVERAGE_CLAMP, coverage))
  return p
}

export function tickCutterBrain(agent, tickCtx) {
  const {
    dtSec,
    disc,
    possessionTeam,
    forceSide,
    situation,
    rng,
    stackIndex = 0,
    isThrower = false,
    isDump = false,
    postCatchReorg = false,
    throwerId = null,
    throwerPos = null,
    postResetClearout = false,
    elapsedMs = 0,
    teammates = null,
    defenders = null,
    activeCutters = 0,
    attackStyle = ATTACK_STYLES.VERTICAL_STACK,
    maxCutters = MAX_CONCURRENT_CUTTERS,
    offenseTactics = null,
  } = tickCtx

  if (isThrower) {
    return { ...agent, state: CUTTER_STATE.WAITING, vx: 0, vy: 0 }
  }

  const coachMods = mergeTraitAndCoachMods(agent.player ?? agent, offenseTactics, 'offense')
  const subRole = agent.subRole ?? subRoleForAgent(agent, offenseTactics)
  const attackSign = attackDirectionX(possessionTeam)

  const structuralTarget = () =>
    formationStructuralTarget({
      attackStyle,
      x: agent.x,
      y: agent.y,
      disc,
      throwerPos,
      forceSide,
      possessionTeam,
      stackIndex,
      isDump,
      rng,
    })

  const distToDisc = Math.hypot(
    agent.x - (throwerPos?.x ?? disc.x),
    agent.y - (throwerPos?.y ?? disc.y),
  )
  const alreadyCutting =
    agent.state === CUTTER_STATE.ACTIVE_CUT || agent.state === CUTTER_STATE.INITIATING_CUT
  const canStartCut =
    alreadyCutting ||
    (activeCutters < maxCutters && distToDisc >= MIN_CUT_START_DIST_M)

  let state = agent.state ?? CUTTER_STATE.WAITING
  let targetX = agent.targetX ?? agent.x
  let targetY = agent.targetY ?? agent.y
  let stateMs = (agent.stateMs ?? 0) + dtSec * 1000

  // Reorganizacja po chwycie trwa tylko chwilę — potem stack musi wrócić do cięcia,
  // inaczej cała ofensywa zostaje w CLEARING i ucieka od dysku do końca punktu.
  const reorgWindow = postCatchReorg && elapsedMs < REORG_WINDOW_MS

  if (reorgWindow && situation?.inThrowLane && state !== CUTTER_STATE.ACTIVE_CUT) {
    state = CUTTER_STATE.CLEARING
    stateMs = 0
    const clr = pickClearTarget(agent.x, agent.y, disc, attackSign, forceSide, rng)
    targetX = clr.x
    targetY = clr.y
  } else if (reorgWindow && state === CUTTER_STATE.WAITING) {
    const role = pickPostCatchRole(
      agent,
      situation,
      isDump,
      stackIndex,
      rng,
      canStartCut,
      coachMods,
    )
    stateMs = 0
    if (role === 'offer') {
      state = CUTTER_STATE.INITIATING_CUT
      const tgt = pickCutTarget(
        agent,
        disc,
        attackSign,
        situation,
        rng,
        forceSide,
        attackStyle,
        stackIndex,
        offenseTactics,
        teammates,
        defenders,
        throwerPos,
      )
      targetX = tgt.x
      targetY = tgt.y
      agent.cutKind = tgt.kind
      agent.cutScore = tgt.score
      agent.cutReviewMs = 0
      agent.continuationCut = true
    } else if (role === 'reset') {
      state = CUTTER_STATE.CLEARING
      const tgt = pickResetTarget(
        disc,
        throwerPos,
        attackSign,
        forceSide,
        rng,
        buildSpaceMap({
          disc,
          attackSign,
          teammates: teammates ?? [],
          defenders: defenders ?? [],
          ignoreId: agent?.id ?? agent?.player?.id ?? null,
        }),
      )
      targetX = tgt.x
      targetY = tgt.y
    } else {
      const pref = structuralTarget()
      state = CUTTER_STATE.CLEARING
      targetX = pref.x
      targetY = pref.y
    }
  } else if (
    postResetClearout &&
    !isDump &&
    !coachMods.continuationOnlyCuts &&
    !coachMods.fillerCutsOnly &&
    throwerPos &&
    Math.hypot(agent.x - throwerPos.x, agent.y - throwerPos.y) < 24
  ) {
    state = CUTTER_STATE.ACTIVE_CUT
    stateMs = 0
    const sideMult = situation?.isOpenSide ? 1 : -1
    const angleDeg = (22 + rng.float() * 38) * sideMult
    const dist = 11 + rng.float() * 9
    const rad = angleDeg * (Math.PI / 180)
    const ax = Math.cos(rad) * attackSign
    const ay = Math.sin(rad)
    const d = Math.hypot(ax, ay) || 1
    targetX = clampFieldX(throwerPos.x + (ax / d) * dist)
    targetY = clampFieldY(throwerPos.y + (ay / d) * dist)
    agent.cutKind = rng.float() < 0.45 ? 'in' : 'deep'
    agent.continuationCut = true
    agent.forceClearout = true
  } else if (state === CUTTER_STATE.WAITING) {
    const player = agent.player ?? agent
    const stamina = player?.currentStamina ?? agent.currentStamina ?? 100
    const fatigueWaiting = stamina < 40
    const priority = cutPriority(player, situation, stackIndex) + (coachMods.cutOfferPriority ?? 0) * 2
    const clogged = (situation.cloggingLevel ?? 0) >= 2 || situation?.inThrowLane
    const timing = coachMods.timingCutBias ?? 0
    let cutRoll = (fatigueWaiting ? 0.006 : 0.022) * (coachMods.cutRollMult ?? 1)
    let priorityGate = (fatigueWaiting ? 72 : 64) + (coachMods.cutPriorityDelta ?? 0)
    let allowClogEscape = clogged
    if (timing > 0) {
      if (clogged) {
        // Dobry timing: nie uciekaj panicznie w lane — czekaj na czystszy moment.
        allowClogEscape = false
        cutRoll *= Math.max(0.35, 1 - timing * 0.7)
        priorityGate += timing * 6
      } else if ((situation.cloggingLevel ?? 0) === 0 && (situation.throwWindowScore ?? 0) > 0.45) {
        cutRoll *= 1 + timing * 0.55
        priorityGate -= timing * 4
      }
    }
    const roleAllows = subRoleAllowsInitiateCut(subRole, situation, { reorgWindow: false })
    if (
      !fatigueWaiting &&
      canStartCut &&
      roleAllows &&
      (allowClogEscape || priority > priorityGate || rng.float() < cutRoll)
    ) {
      state = CUTTER_STATE.INITIATING_CUT
      stateMs = 0
      const tgt = pickCutTarget(
        agent,
        disc,
        attackSign,
        situation,
        rng,
        forceSide,
        attackStyle,
        stackIndex,
        offenseTactics,
        teammates,
        defenders,
        throwerPos,
      )
      targetX = tgt.x
      targetY = tgt.y
      agent.cutKind = tgt.kind
      agent.cutScore = tgt.score
      agent.cutReviewMs = 0
      agent.continuationCut = tgt.kind === 'in' || tgt.kind === 'deep'
    }
  } else if (state === CUTTER_STATE.INITIATING_CUT) {
    // Rozpoznanie, decyzja i ruszenie z miejsca kosztują czas — nie zero ticków.
    if (stateMs >= cutInitiationMs(agent.player ?? agent)) {
      state = CUTTER_STATE.ACTIVE_CUT
      stateMs = 0
      agent.continuationCut = true
    }
  } else if (state === CUTTER_STATE.ACTIVE_CUT) {
    const player = agent.player ?? agent
    // Przegląd cutu w biegu — patrz CUT_REVIEW_MS.
    if (!globalThis.__OFF_CUTREVIEW && stateMs - (agent.cutReviewMs ?? 0) >= CUT_REVIEW_MS) {
      agent.cutReviewMs = stateMs
      const fresh = pickCutTarget(
        agent, disc, attackSign, situation, rng, forceSide, attackStyle, stackIndex,
        offenseTactics, teammates, defenders, throwerPos,
      )
      if (fresh.score < CUT_ABANDON_SCORE) {
        // Przykryty i nic lepszego nie ma — zejdź, zwolnij przestrzeń.
        state = CUTTER_STATE.CLEARING
        stateMs = 0
        agent.cutReviewMs = 0
        const clr = structuralTarget()
        targetX = clr.x
        targetY = clr.y
      } else if (fresh.score > (agent.cutScore ?? 0) + CUT_RETARGET_MARGIN) {
        targetX = fresh.x
        targetY = fresh.y
        agent.cutKind = fresh.kind
        agent.cutScore = fresh.score
      }
    }
    const plantMs = plantStopMs(player)
    // Czas cutu wynika z DYSTANSU DO WYBRANEJ PRZESTRZENI, nie ze stałej.
    //
    // Przy stałej 1600 ms cut kończył się po ~10.9 m (1713 ms przy 6.4 m/s) i zawodnik
    // przechodził w CLEARING. Próg hucka to 35 m — czyli DEEP CUT BYŁ STRUKTURALNIE
    // NIEMOŻLIWY DO DOBIEGNIĘCIA, niezależnie od tego, jak dobrze wybrana była
    // przestrzeń i ile czasu dał rzucający.
    //
    // To tłumaczy zmierzoną tabelę hucków per formacja: vertical stack dawał 13-20%,
    // bo jego ostatni zawodnik STOI na ~33 m i miał do dobiegnięcia kilka metrów;
    // motion i hex dawały dokładnie 0.0%, bo ich pierścień stoi na 7-10 m. Hucki nigdy
    // nie brały się z deep cutów, tylko z tego, że ktoś już stał głęboko.
    const cutDistM = Math.hypot(targetX - agent.x, targetY - agent.y)
    const travelMs = (cutDistM / Math.max(3, maxSpeedMps(player))) * 1000
    const activeCutMs =
      Math.min(
        MAX_ACTIVE_CUT_MS,
        Math.max(ACTIVE_CUT_MS_BASE, travelMs) + plantMs * 0.65,
      ) * (coachMods.clearActiveCutMult ?? 1)
    if (stateMs >= activeCutMs) {
      state = CUTTER_STATE.CLEARING
      stateMs = 0
      const clr = structuralTarget()
      const extra = coachMods.clearLaneExtraM ?? 0
      targetX = clampFieldX(clr.x + (extra ? -attackSign * extra * 0.35 : 0))
      targetY = clr.y
    }
  } else if (state === CUTTER_STATE.CLEARING) {
    const reachedClear = Math.hypot(targetX - agent.x, targetY - agent.y) < 2.5
    if (reachedClear || stateMs >= CLEAR_MAX_MS) {
      state = CUTTER_STATE.WAITING
      stateMs = 0
      agent.continuationCut = false
      agent.forceClearout = false
    }
  }

  let x = agent.x
  let y = agent.y
  let vx = agent.vx ?? 0
  let vy = agent.vy ?? 0

  const reorganizing = reorgWindow || state === CUTTER_STATE.CLEARING

  if (state === CUTTER_STATE.ACTIVE_CUT || state === CUTTER_STATE.CLEARING) {
    const player = agent.player ?? agent
    let speed
    if (reorganizing) {
      const dumpLike =
        isDump ||
        coachMods.preferDumpRole ||
        subRole === HANDLER_SUB_ROLES.RESET
      const dist = Math.hypot(targetX - agent.x, targetY - agent.y)
      // Reset handler: clear/dump truchtem–biegiem, nie sprintem jak cutter clearing lane.
      speed = dumpLike
        ? waitingHoldSpeedMps(player, dist)
        : repositionSpeedMps(player, dist)
    } else {
      const stamina = player?.currentStamina ?? 100
      let speedMult = stamina < 25 ? 0.8 : 1
      if (stamina < 50) {
        speedMult = 1 - (1 - speedMult) * (coachMods.lowStaminaMovePenaltyMult ?? 1)
      }
      if (agent.cutKind === 'deep') speedMult *= coachMods.deepSpeedMult ?? 1
      // Reset handler rzadko cutuje; gdy już, krótszy / wolniejszy wysiłek.
      if (subRole === HANDLER_SUB_ROLES.RESET) speedMult *= 0.72
      const movement = subStat(player, 'offensive', 'cutterMovement')
      // Craft ~0.90–1.02 — nie pomnażaj Vmax ponad realistyczny sprint.
      const craft = 0.9 + (movement / 100) * 0.12
      speed = maxSpeedMps(player) * speedMult * craft
    }
    const spaced = spacingAdjustedTarget(agent, targetX, targetY, teammates)
    const moved = integrateAgentMotion(
      { ...agent, x, y, vx, vy },
      spaced.x,
      spaced.y,
      speed,
      dtSec,
      true,
      // rola 'offense': zwinność + cutterMovement decydują, jak ostro cutter potrafi
      // zmienić kierunek — czyli ile separacji realnie urywa (patrz mobilityMultiplier).
      'offense',
    )
    x = moved.x
    y = moved.y
    vx = moved.vx
    vy = moved.vy
  } else if (state === CUTTER_STATE.WAITING) {
    // Bez piłki zawodnik nie stoi bezczynnie: wraca truchtem / lekkim biegiem na slot
    // (nie sprint — sprint tylko na ACTIVE_CUT).
    const slot = slotWithError(structuralTarget(), agent.player ?? agent, rng)
    const spaced = spacingAdjustedTarget(agent, slot.x, slot.y, teammates)
    const drift = Math.hypot(spaced.x - agent.x, spaced.y - agent.y)
    if (drift > 1.5) {
      const moved = integrateAgentMotion(
        { ...agent, x, y, vx, vy },
        spaced.x,
        spaced.y,
        waitingHoldSpeedMps(agent.player ?? agent, drift),
        dtSec,
        true,
        'offense',
      )
      x = moved.x
      y = moved.y
      vx = moved.vx
      vy = moved.vy
    } else {
      x += (rng.float() - 0.5) * 0.15
      y += (rng.float() - 0.5) * 0.12
      vx *= 0.5
      vy *= 0.5
    }
  }

  const clamped = clampAgentPosition(x, y)
  return {
    ...agent,
    x: clamped.x,
    y: clamped.y,
    state,
    stateMs,
    targetX,
    targetY,
    vx,
    vy,
  }
}

export function createCutterAgent(player, x, y) {
  return {
    player,
    id: player.id,
    x,
    y,
    z: 0,
    vz: 0,
    state: CUTTER_STATE.WAITING,
    stateMs: 0,
    targetX: x,
    targetY: y,
    vx: 0,
    vy: 0,
  }
}

