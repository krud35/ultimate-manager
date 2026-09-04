import { MATCH_CONFIG } from './config.js'
import { DEFENSE_STYLES, FORCE_SIDES } from './tacticsModifiers.js'
import { negativeRandomSpread, randomSpread } from './rng.js'
import {
  staminaPerformancePenalty,
  staminaThrowCollapsePenalty,
  motionFatigueModifiers,
} from './stamina.js'
import { throwProfile, THROW_TYPE } from './throwTypes.js'
import { discMetersFromState } from './fieldViz.js'
import { FIELD_DIMENSIONS } from './fieldDimensions.js'
import { stallThrowModifiers } from './stall.js'
import { readLegacySkill } from '../models/playerStats.js'
import {
  resolveThrowTechniqueForPlayer,
  techniqueAccuracyBase,
} from './throwTechnique.js'
import { stallComposureAccuracyPenalty, subStat, catchSuccessChance } from './ai/statFormulas.js'
import {
  getTraitMods,
  throwTypeAccuracyTraitBonus,
  throwTypeBlockRiskTraitBonus,
} from '../models/playerTraits.js'
import { windThrowModifiers } from './wind.js'

/**
 * Kompresja różnic w atrybutach wokół poziomu 50. Lepszy zawodnik ma wygrywać
 * częściej, ale bez tego 20 punktów przewagi w statystykach dawało wyniki 15-0.
 */
const STAT_SENSITIVITY = 0.65

function compressSkill(value) {
  return 50 + (value - 50) * STAT_SENSITIVITY
}

/**
 * Kategorie dystansu rzutu — determinują bazową trudność niezależnie od typu rzutu
 * (dystans sam w sobie nie wpływał wcześniej na completion%, tylko wiatr; teraz
 * jest jawną osią trudności, tak jak strona (open/break) i separacja odbiorcy).
 */
const THROW_DISTANCE_CATEGORY = {
  DUMP: 'dump',
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  HUCK: 'huck',
}

export function throwDistanceCategory(distanceM) {
  const d = Number(distanceM) || 0
  if (d < 5) return THROW_DISTANCE_CATEGORY.DUMP
  if (d < 15) return THROW_DISTANCE_CATEGORY.SHORT
  if (d < 25) return THROW_DISTANCE_CATEGORY.MEDIUM
  if (d < 40) return THROW_DISTANCE_CATEGORY.LONG
  return THROW_DISTANCE_CATEGORY.HUCK
}

/**
 * Globalny mnożnik czułości rzutu na skill rzucającego (skillAdjustment poniżej).
 * Audyt balansu (tmp-balance-audit.mjs, suita D + F) pokazał, że różnica zaledwie
 * ~5 pkt średniego OVR między rosterami dawała 86%→2% win rate (i analogicznie
 * 30pp rozstęp win rate w pełnej lidze 16 drużyn UFA) — realna różnica rosterów
 * (5–10 pkt) powinna dawać raczej 60–75% niż 90–100%. Nieskompresowana
 * SKILL_ADJUST_WEIGHT (2–15, mocniej na break-side/huck) była głównym winowajcą —
 * tłumimy ją tu globalnie. Wyskalowane empirycznie (tmp-skill-sensitivity-tune.mjs,
 * identyczny roster po obu stronach żeby wykluczyć confound realnych rosterów) tak,
 * by delta +5 OVR dawała ~65-72% win rate rywala, +10 OVR ~77-79%, zamiast dawnych
 * 98%/99.7%.
 */
const SKILL_SENSITIVITY_SCALE = 0.35

/** Waga wpływu umiejętności rzucającego wokół bazy kategorii — mocniej na break-side/huck.
 * Już przemnożona przez SKILL_SENSITIVITY_SCALE. */
const SKILL_ADJUST_WEIGHT = {
  dump: { open: 2 * SKILL_SENSITIVITY_SCALE, break: 4 * SKILL_SENSITIVITY_SCALE },
  short: { open: 3 * SKILL_SENSITIVITY_SCALE, break: 6 * SKILL_SENSITIVITY_SCALE },
  medium: { open: 4 * SKILL_SENSITIVITY_SCALE, break: 8 * SKILL_SENSITIVITY_SCALE },
  long: { open: 5 * SKILL_SENSITIVITY_SCALE, break: 10 * SKILL_SENSITIVITY_SCALE },
  huck: { open: 8 * SKILL_SENSITIVITY_SCALE, break: 15 * SKILL_SENSITIVITY_SCALE },
}

/**
 * Docelowy gap (throwBase − defenseBase) skalibrowany binary-search NA PRAWDZIWYM
 * resolveThrow() (tmp-calibrate-real.mjs, __debugGapOverride) przy stallCount=2 (typowy,
 * niewymuszony rzut) i przeciętnym (60) rzucającym/odbiorcy/obrońcy — łapie realne
 * efekty uboczne (stallMods niskiego stallu, skillAdjustment, technikę rzutu), których
 * nie widziała czysto abstrakcyjna kalibracja szumu. Klucz = strona (open/break) +
 * separacja odbiorcy (Open/Contested/Tight — margines z resolveSeparation).
 *
 * Rekalibrowane po wprowadzeniu SKILL_SENSITIVITY_SCALE powyżej i
 * SEPARATION_SENSITIVITY_SCALE (separation.js) — te dwie zmiany wpływają na to, jaki
 * gap trzeba tu wpisać, żeby completion% przy skill=60 zostało identyczne jak przed
 * zmianami (zweryfikowane: tmp-verify-baseline-completion.mjs, wszystko ≤1.5pp od
 * oryginalnych targetów). Jeśli SKILL_SENSITIVITY_SCALE / SEPARATION_SENSITIVITY_SCALE
 * zmienią się ponownie, uruchom tmp-calibrate-real.mjs jeszcze raz.
 */
const DISTANCE_GAP_TABLE_BASE = {
  dump: { openOpen: 9.6, openContested: 9.2, openTight: 0.9, breakOpen: 12.2, breakContested: 5.5, breakTight: -2.9 },
  short: { openOpen: 6.3, openContested: 5.0, openTight: -4.0, breakOpen: 9.7, breakContested: 3.1, breakTight: -7.1 },
  medium: { openOpen: 5.2, openContested: 3.7, openTight: -6.5, breakOpen: 8.1, breakContested: 2.0, breakTight: -9.1 },
  long: { openOpen: 3.9, openContested: 1.0, openTight: -10.0, breakOpen: 7.0, breakContested: 0.7, breakTight: -11.3 },
  huck: { openOpen: 1.3, openContested: -0.4, openTight: -16.9, breakOpen: 2.5, breakContested: -1.7, breakTight: -18.9 },
}

/**
 * DISTANCE_GAP_TABLE_BASE powyżej został skalibrowany na IZOLOWANYM pojedynczym
 * rzucie (skill=60, stallCount=2 stałe, brak wiatru, pełna stamina) — celowo "czyste
 * laboratorium" bez tarcia, jakie realnie występuje w meczu. Zmierzony completion%
 * w prawdziwych meczach (fastMode i pełny silnik, po naprawie decyzyjności — patrz
 * tmp-completion-possession-report.mjs / tmp-fullengine-completion-check.mjs) wyszedł
 * 83-84% zamiast realnego benchmarku pro/elite ultimate (~92-96%), bo realne mecze
 * dokładają stall wyższy niż 2, zmienność skilli, zmęczenie, wiatr i karę break-side
 * techniki — żadnego z tych czynników nie było w izolowanej kalibracji. Ten
 * dodatek wyrównuje różnicę na poziomie CAŁEGO meczu, nie psując relatywnej trudności
 * między kategoriami/stronami/separacjami (dodawany jednolicie do każdej komórki).
 * Wyskalowany empirycznie (tmp-recalibrate-match-completion.mjs) tak, by agregatowe
 * completion% w realnych meczach wylądowało w środku pasma 92-96%.
 */
// Podniesione 11 -> 12 po odcięciu od throwStat statów, które nie miały wpływać na
// celność (vision/catching/speed rzucającego oraz catching+speed odbiorcy). Odbiorca
// wnosił wcześniej 15% do celności rzutu, więc jego usunięcie obniżyło completion
// pełnego silnika o ~0.8 pp (89.97 przy 20 meczach — powtarzalnie, nie szum).
// To jest właściwa dźwignia do takiej korekty: dodawana jednolicie do każdej komórki,
// więc nie rusza relatywnej trudności między dystansami/stronami/separacjami.
const MATCH_FRICTION_COMPENSATION = 13

const DISTANCE_GAP_TABLE = Object.fromEntries(
  Object.entries(DISTANCE_GAP_TABLE_BASE).map(([cat, row]) => [
    cat,
    Object.fromEntries(Object.entries(row).map(([key, gap]) => [key, gap + MATCH_FRICTION_COMPENSATION])),
  ]),
)

function distanceGapFor(category, isOpenSide, separationOutcome) {
  const row = DISTANCE_GAP_TABLE[category] ?? DISTANCE_GAP_TABLE.medium
  const sepKey = separationOutcome === 'open' ? 'Open' : separationOutcome === 'tight' ? 'Tight' : 'Contested'
  const sideKey = isOpenSide ? 'open' : 'break'
  return row[`${sideKey}${sepKey}`] ?? row.openContested
}

function skillAdjustment(throwStat, category, isOpenSide) {
  const weights = SKILL_ADJUST_WEIGHT[category] ?? SKILL_ADJUST_WEIGHT.medium
  const w = isOpenSide ? weights.open : weights.break
  return ((throwStat - 50) / 50) * w
}

/**
 * Obrońca na torze lotu — niezależna szansa bloku (agility / reactions / vision).
 * Zwraca null gdy nikt nie przerywa lotu.
 *
 * TYLKO fastMode. Pełny silnik ma od Fazy 4b realny blok z geometrii lotu
 * (laneBlockChance w ai/actionSimulator.js): dysk jest blokowany wtedy, gdy faktycznie
 * przechodzi przez kopertę zasięgu obrońcy, więc przerzucenie go górą albo wyprowadzenie
 * krzywizną poza rękę realnie działa. Ten model tego nie potrafił — liczył szansę z
 * płaskiej odległości od odcinka rzucający→cel i z wysokości ZGADYWANEJ z typu rzutu
 * (heightFactor), przez co wybór toru nie mógł na niego wpłynąć. Zmierzone przed
 * podmianą: 0 bloków na torze na 44 wszystkich w 6 meczach pełnym silnikiem, czyli
 * mechanizm w praktyce nie strzelał. W fastMode zostaje, bo tam nie ma geometrii.
 */
export function rollLaneBlock({
  laneThreats = [],
  rng,
  throwType = THROW_TYPE.STANDARD,
  thrower = null,
}) {
  if (!laneThreats.length || !rng) return null
  const profile = throwProfile(throwType)
  // Huck/OTT lecą wyżej — trudniej wyciągnąć rękę ze środka toru.
  const heightFactor =
    throwType === THROW_TYPE.HUCK || throwType === THROW_TYPE.OVER_THE_TOP ? 0.55 : 1
  const dumpFactor = throwType === THROW_TYPE.DUMP_SWING ? 0.75 : 1

  // Thrower z vision/decision lepiej omija tor (placement).
  const vision = thrower ? subStat(thrower, 'mental', 'vision') : 50
  const decision = thrower ? subStat(thrower, 'mental', 'decisionMaking') : 50
  const placement = Math.max(0.45, Math.min(1, (vision * 0.5 + decision * 0.5) / 100))
  const avoidMult = 1.15 - placement * 0.55

  for (const threat of laneThreats.slice(0, 3)) {
    const d = threat.defender
    if (!d) continue
    // Lekkie ocieranie toru nie daje bloku — tylko realne wejście w lane.
    if ((threat.threat ?? 0) < 0.42) continue
    const agility = subStat(d, 'physical', 'agility')
    const reactions = subStat(d, 'mental', 'reactions')
    const defVision = subStat(d, 'mental', 'vision')
    const blocking = subStat(d, 'defensive', 'blocking')
    const skill =
      agility * 0.34 + reactions * 0.34 + defVision * 0.2 + blocking * 0.12
    // Rzadki event: elita w środku toru ~4–7%, przeciętny ~1–3%.
    const base =
      (threat.threat ?? 0) *
      (0.008 + (skill / 100) * 0.055) *
      heightFactor *
      dumpFactor *
      avoidMult
    const profileBoost = 1 + Math.max(0, (profile.blockRiskMod ?? 0) / 120)
    const chance = Math.min(0.12, base * profileBoost)
    if (rng.float() < chance) {
      return { defender: d, defenderId: threat.defenderId ?? d.id, chance }
    }
  }
  return null
}

/**
 * Test umiejętności rzutu z typem podania i separation.
 */
export function resolveThrow({
  thrower,
  receiver,
  defender,
  rng,
  defenseStyle,
  throwType = THROW_TYPE.STANDARD,
  separation = null,
  stallCount = 0,
  forcedContested = false,
  forceSide = FORCE_SIDES.FORCE_FOREHAND,
  isOpenSide = true,
  throwTechnique = null,
  throwerY,
  laneThreats = null,
  wind = null,
  throwDx = 0,
  throwDy = 0,
  throwDistanceM = null,
  /** Tylko do kalibracji (tmp-calibrate-*.mjs) — pomija tabelę DISTANCE_GAP_TABLE. */
  __debugGapOverride = null,
}) {
  const { skillCheck } = MATCH_CONFIG
  const profile = throwProfile(throwType)
  const windMods = windThrowModifiers({
    wind,
    throwDx,
    throwDy,
    throwType,
    thrower,
    distanceM: throwDistanceM ?? Math.hypot(throwDx, throwDy),
  })

  const techCtx = resolveThrowTechniqueForPlayer(thrower, {
    forceSide,
    isOpenSide,
    throwerY,
  })
  const technique = throwTechnique ?? techCtx.technique
  const techniqueMods = {
    accuracyMult: techCtx.accuracyMult,
    blockRiskBonus: techCtx.blockRiskBonus,
  }
  if (throwTechnique && throwTechnique !== techCtx.technique) {
    const alt = resolveThrowTechniqueForPlayer(thrower, { forceSide, isOpenSide, throwerY })
    techniqueMods.accuracyMult = alt.accuracyMult
    techniqueMods.blockRiskBonus = alt.blockRiskBonus
  }

  const stallMods = stallThrowModifiers({
    thrower,
    defender,
    stallCount,
    separation,
    rng,
    fatigueComposurePenalty: motionFatigueModifiers(thrower.currentStamina ?? 100)
      .composurePenalty,
  })

  const throwerFatigue = motionFatigueModifiers(thrower.currentStamina ?? 100)

  let throwSkill = techniqueAccuracyBase(thrower, technique, throwType)
  throwSkill *= techniqueMods.accuracyMult ?? 1

  // Celność rzutu zależy WYŁĄCZNIE od umiejętności rzucania rzucającego.
  //
  // Wcześniej wchodziły tu trzy rzeczy, które nie mają z celnością związku:
  //  - `vision`, `catching` i `speed` RZUCAJĄCEGO (przez skillCheck.throwWeights, gdzie
  //    mają wagi 0.25 / 0.1 / 0.1). Vision steruje już — i słusznie — czym innym:
  //    zasięgiem skanu opcji (throwScanRadiusM), liczbą dostrzeganych opcji
  //    (perceivedOptionLimit) i omijaniem obrońców na torze (placement w rollLaneBlock),
  //    więc było liczone drugi raz, w niewłaściwym miejscu. Chwyt i sprint rzucającego
  //    nie wpływają na to, jak celnie rzuca.
  //  - `catching` + `speed` ODBIORCY (waga 0.15) — szybki odbiorca sprawiał, że RZUT
  //    stawał się celniejszy. Odbiorca wpływa na wynik gdzie indziej i właściwie:
  //    w pełnym silniku jego szybkość decyduje fizycznie o dobiegnięciu do dysku, a w
  //    fastMode wchodzi przez resolveSeparation (catching 0.55 + speed 0.45).
  //
  // skillCheck.throwWeights zostaje nietknięte, bo służy też do WYBORU rzucającego
  // (participants.js: pickThrower — tam vision jest jak najbardziej na miejscu).
  // Wagi 0.85/0.15 sumują się do 1, żeby skala throwStat (a przez to skillAdjustment
  // i kalibracja DISTANCE_GAP_TABLE) została ta sama co przy dawnych 0.72+0.13+0.15.
  const throwStat =
    throwSkill * 0.85 + readLegacySkill(thrower.skills, 'throwing') * 0.15

  const throwerTraits = getTraitMods(thrower)
  const receiverTraits = getTraitMods(receiver)
  const defenderTraits = getTraitMods(defender)

  const distanceM = throwDistanceM ?? Math.hypot(throwDx, throwDy)
  const distanceCategory = throwDistanceCategory(distanceM)
  const baseGap =
    __debugGapOverride ?? distanceGapFor(distanceCategory, isOpenSide, separation?.outcome)

  const throwBase =
    baseGap +
    skillAdjustment(throwStat, distanceCategory, isOpenSide) -
    stallComposureAccuracyPenalty(stallCount, thrower) +
    throwTypeAccuracyTraitBonus(thrower, throwType) +
    (!isOpenSide ? throwerTraits.breakSideAccuracy : 0) +
    // receiverTraits.catchBonus przeniesione do osobnego kroku chwytu niżej — chwyt
    // odbiorcy nie ma wpływu na to, jak CELNIE poleciał rzut.
    stallMods.accuracyBonus -
    stallMods.accuracyPenalty -
    throwerFatigue.throwAccuracyPenalty +
    (windMods.accuracyDelta ?? 0)

  // Obrońca wpływa na rzut głównie przez separację (resolveSeparation, wcześniej w
  // pipeline) — tu zostaje tylko wąski "hands" skill (D w momencie rzutu), wyśrodkowany
  // wokół 0 przy przeciętnej umiejętności, żeby nie przesuwać skalibrowanego baseGap.
  const defenseBase =
    (compressSkill(subStat(defender, 'defensive', 'blocking')) - 50) * 0.12 +
    throwTypeBlockRiskTraitBonus(thrower, throwType) +
    (techniqueMods.blockRiskBonus ?? 0) +
    (forcedContested || stallMods.forcedContested ? 4 : 0) +
    stallMods.blockRiskMod

  let throwSpread =
    skillCheck.throwRandomSpread +
    profile.randomSpreadBonus +
    stallMods.randomSpreadBonus
  if (throwType === THROW_TYPE.HUCK) throwSpread *= throwerTraits.huckSpreadMult
  throwSpread *= windMods.spreadMult ?? 1

  let throwScore =
    throwBase +
    randomSpread(rng, throwSpread) -
    staminaPerformancePenalty(thrower.currentStamina ?? 100) -
    staminaPerformancePenalty(receiver.currentStamina ?? 100) * 0.35 -
    staminaThrowCollapsePenalty(thrower.currentStamina ?? 100)
  const styleDefMult =
    defenseStyle === DEFENSE_STYLES.ZONE_CUP
      ? (defenderTraits.zoneDefenseBlockMult ?? 1)
      : (defenderTraits.personDefenseBlockMult ?? 1)
  let defenseScore =
    (defenseBase +
      negativeRandomSpread(rng, skillCheck.defenseRandomSpread) -
      staminaPerformancePenalty(defender.currentStamina ?? 100)) *
    (defenderTraits.blockChanceMult ?? 1) *
    styleDefMult

  let success = throwScore > defenseScore
  let isBlock = !success && throwScore + 8 < defenseScore
  let isLaneBlock = false
  let laneBlocker = null
  let isWindDrop = false

  // Nawet przy „sukcesie” vs krycie odbiorcy — obrońca na torze może ściąć dysk.
  if (success && laneThreats?.length) {
    const lane = rollLaneBlock({ laneThreats, rng, throwType, thrower })
    if (lane) {
      success = false
      isBlock = true
      isLaneBlock = true
      laneBlocker = lane.defender
      defenseScore = Math.max(defenseScore, throwScore + 10)
    }
  }

  // Downwind touch / cross flutter — drop mimo wygranej vs marker
  if (success && (windMods.dropChanceBonus ?? 0) > 0 && rng?.float) {
    if (rng.float() < windMods.dropChanceBonus) {
      success = false
      isBlock = false
      isWindDrop = true
    }
  }

  // OSOBNY KROK CHWYTU: dysk doleciał — czy odbiorca go utrzymał?
  // Do tej pory `catching` nie miało własnego testu (podbijało tylko celność rzutu),
  // więc nie istniał wynik „dobiegł, ale upuścił". To jest ścieżka fastMode; pełny
  // silnik robi ten sam test na realnej geometrii (computeGeometricResolution).
  let isDrop = false
  if (success && rng?.float) {
    // fastMode nie ma geometrii, więc trudność chwytu przybliżamy jakością separacji —
    // to jedyna informacja o tym, jak czysto dysk doszedł. Pełny silnik używa realnego
    // `reachStrain` z odległości odbiorcy od dysku w chwili chwytu.
    const strainApprox =
      separation?.outcome === 'open' ? 0.1 : separation?.outcome === 'tight' ? 0.8 : 0.45
    const pCatch = catchSuccessChance(receiver, {
      reachStrain: strainApprox,
      contested: separation?.outcome === 'tight',
      catchBonus: receiverTraits.catchBonus ?? 0,
    })
    if (rng.float() > pCatch) {
      success = false
      isBlock = false
      isDrop = true
    }
  }

  return {
    success,
    throwScore: Math.round(throwScore),
    defenseScore: Math.round(defenseScore),
    isBlock,
    /** Umiejętność rzutu użyta w teście — wejście do precyzji lądowania (computeMissDistanceM). */
    throwStat: Math.round(throwStat),
    isLaneBlock,
    /** Odbiorca dosięgnął dysku, ale go nie utrzymał — osobny wynik od bloku. */
    isDrop,
    laneBlocker,
    stallTier: stallMods.tier,
    forcedContested: forcedContested || stallMods.forcedContested,
    throwTechnique: technique,
    dominantHand: techCtx.dominantHand,
    windRelation: windMods.relation,
    windAdvanceMult: windMods.advanceMult,
    isWindDrop,
  }
}

/**
 * Faza 4b planu 3D: margines throwScore-defenseScore (już skalibrowany przez cały
 * aparat DISTANCE_GAP_TABLE/skill/stall/wind powyżej) przestaje być bezpośrednią bramką
 * sukcesu — zamiast tego określa, o ile metrów dysk realnie "chybia" zamierzonego celu
 * (gorszy rzut -> gorszy fizyczny tor). To, czy taki tor faktycznie kończy się złapaniem,
 * blokiem czy dropem, decyduje potem realna geometria 3D (actionSimulator.js, po
 * zakończeniu lotu) — nie ten margines wprost. margines>=CLEAN_MARGIN -> rzut trafia
 * dokładnie w cel (miss=0); poniżej rośnie liniowo, z sufitem MAX_MISS_M.
 */
/** Mutowalny obiekt kalibracyjny — pozwala skryptowi kalibrującemu (tmp-calibrate-*.mjs)
 * testować wiele wartości w jednym procesie Node, bez edycji pliku między przebiegami.
 * Ten sam wzorzec co __debugGapOverride przy oryginalnej kalibracji DISTANCE_GAP_TABLE. */
/** Wykalibrowane empirycznie (tmp-calibrate-geometric.mjs) — patrz komentarz przy
 * GEOMETRIC_CALIBRATION w actionSimulator.js. */
/**
 * REKALIBRACJA po przebudowie modelu chwytu i całej mechaniki przestrzeni.
 *
 * Sweep (tmp-sweep/miss-sweep2.mjs, 8 rozproszonych seedów, pełny silnik):
 *   0.1 /1.8/2.2 -> compl 88.5%  blok 4.7%  drop 3.5%  niecel 3.2%
 *   0.07/1.2/1.6 -> compl 89.2%  blok 4.2%  drop 3.4%  niecel 3.2%   <- wybrane
 *   0.045/0.8/1.2 -> compl 87.9%  blok 4.9%  drop 3.7%  niecel 3.5%
 *   0.03/0.5/0.9 -> compl 89.0%  blok 4.9%  drop 3.7%  niecel 2.4%
 *
 * Zależność jest PŁASKA i niemonotoniczna, więc to nie jest wyznaczone optimum, tylko
 * najlepszy z czterech punktów. Ważniejsza obserwacja: zacieśnianie celności NIE zmniejsza
 * dropów (3.5 -> 3.4 -> 3.7 -> 3.7). Hipoteza, że dropy biorą się z niecelnych rzutów,
 * jest więc błędna — `reachStrain` pochodzi głównie z tego, że odbiorca dobiega do
 * przewidzianego punktu chwytu z własnym błędem, a nie z tego, gdzie dysk został posłany.
 */
export const MISS_CALIBRATION = {
  // Próg „rzut idealnie w cel". Był 0, a zmierzony rozkład marginesu
  // (throwScore - defenseScore) w realnym meczu to mediana +30, p10 +6, p90 +53 —
  // więc chybienie odpalało tylko na 4.8% rzutów, a na pozostałych 95% dysk lądował
  // co do centymetra w celu. To był JEDYNY kanał, którym `throwing` wpływa na wynik w
  // pełnym silniku (geometryczny resolver nie patrzy na result.success), więc
  // umiejętność rzucania praktycznie nic nie robiła — zmierzone: throwing 70 vs 95
  // dawało completion 82.5% vs 82.5%, płasko.
  // Przy 40 mediana rzutu chybia ~0.6 m, słaby look (p10) ~2 m, świetny (p90) 0 m —
  // czyli lepszy rzucający realnie kładzie dysk bliżej zamierzonego punktu.
  cleanMargin: 12,
  missPerMarginPoint: 0.14,
  maxMissM: 15,
  missDistanceFractionCap: 0.4,
  /** Szansa realnej pomyłki rzucającego o umiejętności skillMissPivot; maleje liniowo
   *  do minMissChance przy pivot+span. throwStat 60 -> 10%, 80 -> 5.6%, 95 -> 2.2%. */
  missChanceAtPivot: 0.04,
  minMissChance: 0.015,
  skillMissPivot: 60,
  skillMissSpan: 45,
  /** Gdy pomyłka nastąpi — dysk ląduje 1.8–4.0 m od zamierzonego punktu. */
  errorMissMinM: 0.7,
  errorMissSpanM: 1.0,
}

export function computeMissDistanceM(throwScore, defenseScore, throwStat = null, rng = null) {
  const {
    cleanMargin,
    missPerMarginPoint,
    maxMissM,
    missChanceAtPivot,
    minMissChance,
    skillMissPivot,
    skillMissSpan,
    errorMissMinM,
    errorMissSpanM,
  } = MISS_CALIBRATION

  // 1) Trudność SYTUACJI (dystans, strona, krycie, stall, wiatr) — przez margines.
  const margin = (throwScore ?? 0) - (defenseScore ?? 0)
  const situational = margin >= cleanMargin ? 0 : (cleanMargin - margin) * missPerMarginPoint

  // 2) BŁĄD RZUCAJĄCEGO — umiejętność steruje CZĘSTOŚCIĄ pomyłki, nie stałym odchyleniem.
  //
  // Margines nie nadaje się na ten kanał: przechodzi przez skillAdjustment, gdzie
  // SKILL_SENSITIVITY_SCALE (0.35) spłaszcza 25 punktów statystyki do ~0.7 punktu
  // marginesu — przy rozrzucie ±22 to szum (zmierzone: throwing 70 vs 95 dawało
  // completion 82.5% vs 82.5%).
  //
  // PRÓBOWANE I ODRZUCONE: stałe chybienie malejące z umiejętnością (2.4 m przy stacie
  // 60, 1.0 m przy 95), doklejane do KAŻDEGO rzutu. Powstawał nierozwiązywalny konflikt:
  // przy promieniu chwytu 2.3 m gradient umiejętności był widoczny (54.6% -> 70.1%
  // completion), ale całość leciała daleko pod realne pasmo; po podniesieniu promienia do
  // 3.0 m completion wracało (~85%), lecz gradient znikał zupełnie. Bo stałe odchylenie
  // na każdym rzucie przesuwa CAŁY rozkład, zamiast różnicować zawodników.
  //
  // Realnie elita rzuca czysto niemal zawsze i myli się sporadycznie — więc to
  // częstotliwość pomyłki zależy od umiejętności, a nie precyzja każdego rzutu.
  const skill = throwStat == null ? skillMissPivot : throwStat
  const missChance = Math.max(
    minMissChance,
    missChanceAtPivot * (1 - (skill - skillMissPivot) / skillMissSpan),
  )
  let errorMiss = 0
  if (rng?.float && rng.float() < missChance) {
    errorMiss = errorMissMinM + rng.float() * errorMissSpanM
  }

  return Math.min(maxMissM, situational + errorMiss)
}

export function isInEndzone(discPosition, possessionTeam) {
  if (!possessionTeam) {
    return discPosition >= MATCH_CONFIG.field.max
  }
  const fieldX = discMetersFromState(discPosition, possessionTeam)
  const line = FIELD_DIMENSIONS.lengthM - FIELD_DIMENSIONS.endzoneM
  if (possessionTeam === 'home') {
    return fieldX >= line
  }
  return fieldX <= FIELD_DIMENSIONS.endzoneM
}

export { computeThrowAdvance } from './throwTypes.js'

/** Po turnoverze ta sama linia boiska, ale perspektywa drużyny się odwraca. */
export function flipDiscPosition(discPosition) {
  const { min, max } = MATCH_CONFIG.field
  return max - discPosition + min
}
