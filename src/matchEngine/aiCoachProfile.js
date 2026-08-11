/**
 * Ukryte profile trenerów AI — losowane przy nowym zapisie kariery.
 * Modyfikują tożsamość taktyczną drużyny (formacje, suwaki, temperament).
 */

import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
} from './tacticsModifiers.js'
import { normalizeCoachDirectives, defaultCoachDirectives } from './coachDirectives.js'
import { createRng } from './rng.js'

/** @typedef {'patient'|'tempo'|'creative'|'balanced'|'aggressive'} AttackMindset */
/** @typedef {'contain'|'pressure'|'zone'|'balanced'} DefenseMindset */

/**
 * @typedef {object} AiCoachProfile
 * @property {string} id
 * @property {string} label
 * @property {string} labelEn
 * @property {AttackMindset} attackMindset — opis/flavor, nie steruje już wyborem stylu
 * @property {DefenseMindset} defenseMindset — opis/flavor, nie steruje już wyborem stylu
 * @property {string[]} oLineAttackStyles — kolejność preferencji O-Line w ataku
 * @property {string[]} oLineDefenseStyles — kolejność preferencji O-Line gdy straci dysk
 * @property {string[]} dLineAttackStyles — kolejność preferencji D-Line po przejęciu
 * @property {string[]} dLineDefenseStyles — kolejność preferencji D-Line w obronie
 * @property {string} [preferredForce]
 * @property {object} oLineDirectiveBias — dodatek −1…1 do suwaków O-Line
 * @property {object} dLineDirectiveBias — dodatek −1…1 do suwaków D-Line
 * @property {number} adaptability — 0…1 jak chętnie zmienia taktykę w meczu
 * @property {number} conservatism — 0…1 opór przed zmianą gdy idzie OK
 * @property {boolean} [flatStart] — ignoruje własne preferencje na starcie, gra czystym dopasowaniem do rosteru
 */

/** @type {AiCoachProfile[]} */
export const AI_COACH_ARCHETYPES = [
  {
    id: 'patient_controller',
    label: 'Cierpliwy kontroler',
    labelEn: 'Patient controller',
    attackMindset: 'patient',
    defenseMindset: 'contain',
    oLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    dLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    dLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    oLineDirectiveBias: {
      creativity: -0.25,
      huckAppetite: -0.35,
      possessionTempo: -0.5,
      breakAppetite: -0.15,
      passSelectivity: -0.35,
      coverageShade: -0.1,
    },
    dLineDirectiveBias: {
      creativity: -0.25,
      huckAppetite: -0.35,
      possessionTempo: -0.5,
      breakAppetite: -0.15,
      passSelectivity: -0.35,
      coverageShade: -0.1,
    },
    adaptability: 0.35,
    conservatism: 0.75,
  },
  {
    id: 'tempo_pusher',
    label: 'Tempo / flow',
    labelEn: 'Tempo / flow',
    attackMindset: 'tempo',
    defenseMindset: 'pressure',
    oLineAttackStyles: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.MOTION_OFFENSE],
    oLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    dLineAttackStyles: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.MOTION_OFFENSE],
    dLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    preferredForce: FORCE_SIDES.FORCE_BACKHAND,
    oLineDirectiveBias: {
      creativity: 0.15,
      huckAppetite: 0.2,
      possessionTempo: 0.55,
      breakAppetite: 0.15,
      passSelectivity: 0.15,
      coverageShade: -0.2,
    },
    dLineDirectiveBias: {
      creativity: 0.15,
      huckAppetite: 0.2,
      possessionTempo: 0.55,
      breakAppetite: 0.15,
      passSelectivity: 0.15,
      coverageShade: -0.2,
    },
    adaptability: 0.55,
    conservatism: 0.4,
  },
  {
    id: 'huck_gambler',
    label: 'Deep gambler',
    labelEn: 'Deep gambler',
    attackMindset: 'aggressive',
    defenseMindset: 'pressure',
    oLineAttackStyles: [ATTACK_STYLES.SPLIT_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    // D-line: po przejęciu od razu izoluje i szuka głębi, zanim D się ustawi.
    dLineAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_MIDDLE,
    oLineDirectiveBias: {
      creativity: 0.35,
      huckAppetite: 0.65,
      possessionTempo: 0.25,
      breakAppetite: 0.2,
      passSelectivity: 0.25,
      coverageShade: 0.25,
    },
    dLineDirectiveBias: {
      creativity: 0.35,
      huckAppetite: 0.75,
      possessionTempo: 0.35,
      breakAppetite: 0.2,
      passSelectivity: 0.25,
      coverageShade: 0.25,
    },
    adaptability: 0.45,
    conservatism: 0.35,
  },
  {
    id: 'zone_architect',
    label: 'Architekt strefy',
    labelEn: 'Zone architect',
    attackMindset: 'patient',
    defenseMindset: 'zone',
    oLineAttackStyles: [ATTACK_STYLES.ZONE_OFFENSE, ATTACK_STYLES.VERTICAL_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.ZONE_WALL],
    dLineAttackStyles: [ATTACK_STYLES.ZONE_OFFENSE, ATTACK_STYLES.VERTICAL_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.ZONE_WALL],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    oLineDirectiveBias: {
      creativity: -0.1,
      huckAppetite: -0.15,
      possessionTempo: -0.2,
      breakAppetite: 0.25,
      passSelectivity: -0.2,
      coverageShade: 0.1,
    },
    dLineDirectiveBias: {
      creativity: -0.1,
      huckAppetite: -0.15,
      possessionTempo: -0.2,
      breakAppetite: 0.25,
      passSelectivity: -0.2,
      coverageShade: 0.1,
    },
    adaptability: 0.5,
    conservatism: 0.55,
  },
  {
    id: 'creative_iso',
    label: 'Kreatywne iso',
    labelEn: 'Creative iso',
    attackMindset: 'creative',
    defenseMindset: 'balanced',
    oLineAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    dLineAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    oLineDirectiveBias: {
      creativity: 0.55,
      huckAppetite: 0.1,
      possessionTempo: 0.1,
      breakAppetite: 0.45,
      passSelectivity: 0.05,
      coverageShade: 0.15,
    },
    dLineDirectiveBias: {
      creativity: 0.55,
      huckAppetite: 0.1,
      possessionTempo: 0.1,
      breakAppetite: 0.45,
      passSelectivity: 0.05,
      coverageShade: 0.15,
    },
    adaptability: 0.65,
    conservatism: 0.3,
  },
  {
    id: 'balanced_pro',
    label: 'Zrównoważony pro',
    labelEn: 'Balanced pro',
    attackMindset: 'balanced',
    defenseMindset: 'balanced',
    oLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    dLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    oLineDirectiveBias: {
      creativity: 0,
      huckAppetite: 0,
      possessionTempo: 0,
      breakAppetite: 0,
      passSelectivity: -0.1,
      coverageShade: 0,
    },
    dLineDirectiveBias: {
      creativity: 0,
      huckAppetite: 0,
      possessionTempo: 0,
      breakAppetite: 0,
      passSelectivity: -0.1,
      coverageShade: 0,
    },
    adaptability: 0.55,
    conservatism: 0.5,
  },
  {
    id: 'grind_defense',
    label: 'Grind D-first',
    labelEn: 'Grind D-first',
    attackMindset: 'patient',
    defenseMindset: 'pressure',
    oLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    oLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.CLAM],
    // D-line: cały sens istnienia to obrona — po przejęciu chce szybko skapitalizować.
    dLineAttackStyles: [ATTACK_STYLES.HEX_OFFENSE, ATTACK_STYLES.VERTICAL_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    oLineDirectiveBias: {
      creativity: -0.2,
      huckAppetite: -0.25,
      possessionTempo: -0.3,
      breakAppetite: -0.05,
      passSelectivity: -0.25,
      coverageShade: 0.2,
    },
    dLineDirectiveBias: {
      creativity: -0.15,
      huckAppetite: -0.2,
      possessionTempo: -0.2,
      breakAppetite: 0.1,
      passSelectivity: -0.2,
      coverageShade: 0.3,
    },
    adaptability: 0.4,
    conservatism: 0.65,
  },
  {
    id: 'trap_counter',
    label: 'Pułapka i kontra',
    labelEn: 'Trap & counter',
    attackMindset: 'patient',
    defenseMindset: 'contain',
    oLineAttackStyles: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.VERTICAL_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    // D-line: po zamknięciu sideline i przejęciu — natychmiastowy reset i uderzenie.
    dLineAttackStyles: [ATTACK_STYLES.HEX_OFFENSE, ATTACK_STYLES.MOTION_OFFENSE],
    dLineDefenseStyles: [DEFENSE_STYLES.ZONE_WALL, DEFENSE_STYLES.ZONE_CUP],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    oLineDirectiveBias: {
      creativity: -0.1,
      huckAppetite: -0.15,
      possessionTempo: -0.25,
      breakAppetite: -0.05,
      passSelectivity: -0.2,
      coverageShade: 0,
    },
    dLineDirectiveBias: {
      creativity: 0.2,
      huckAppetite: 0.35,
      possessionTempo: 0.5,
      breakAppetite: 0.15,
      passSelectivity: 0.15,
      coverageShade: 0.15,
    },
    adaptability: 0.5,
    conservatism: 0.55,
  },
  {
    id: 'veteran_grinder',
    label: 'Weteran / grinder',
    labelEn: 'Veteran grinder',
    attackMindset: 'patient',
    defenseMindset: 'contain',
    oLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.CLAM],
    // D-line: nie zmienia tożsamości nawet po bloku — zero ryzyka, wygrywa dyscypliną.
    dLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    oLineDirectiveBias: {
      creativity: -0.3,
      huckAppetite: -0.4,
      possessionTempo: -0.35,
      breakAppetite: -0.2,
      passSelectivity: -0.4,
      coverageShade: -0.05,
    },
    dLineDirectiveBias: {
      creativity: -0.2,
      huckAppetite: -0.3,
      possessionTempo: -0.2,
      breakAppetite: 0.1,
      passSelectivity: -0.25,
      coverageShade: 0.15,
    },
    adaptability: 0.3,
    conservatism: 0.8,
  },
  {
    id: 'deep_strike',
    label: 'Łowca głębi',
    labelEn: 'Deep strike',
    attackMindset: 'patient',
    defenseMindset: 'pressure',
    oLineAttackStyles: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.VERTICAL_STACK],
    oLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    // D-line: agresywny mark wymusza rzut, złapany blok = izolacja i natychmiastowy huck.
    dLineAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    preferredForce: FORCE_SIDES.FORCE_MIDDLE,
    oLineDirectiveBias: {
      creativity: -0.05,
      huckAppetite: -0.1,
      possessionTempo: -0.1,
      breakAppetite: 0,
      passSelectivity: -0.15,
      coverageShade: 0,
    },
    dLineDirectiveBias: {
      creativity: 0.3,
      huckAppetite: 0.6,
      possessionTempo: 0.2,
      breakAppetite: 0.25,
      passSelectivity: 0.2,
      coverageShade: 0.35,
    },
    adaptability: 0.45,
    conservatism: 0.45,
  },
  {
    id: 'junk_hybrid',
    label: 'Chaos strefowy',
    labelEn: 'Junk hybrid',
    attackMindset: 'creative',
    defenseMindset: 'zone',
    oLineAttackStyles: [ATTACK_STYLES.HEX_OFFENSE, ATTACK_STYLES.MOTION_OFFENSE],
    // Tożsamość defensywna niezależna od linii — zawsze matchup-zone (Clam), nie czeka na ustawienie.
    oLineDefenseStyles: [DEFENSE_STYLES.CLAM, DEFENSE_STYLES.ALL_PERSON],
    dLineAttackStyles: [ATTACK_STYLES.MOTION_OFFENSE, ATTACK_STYLES.HEX_OFFENSE],
    dLineDefenseStyles: [DEFENSE_STYLES.CLAM, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_MIDDLE,
    oLineDirectiveBias: {
      creativity: 0.25,
      huckAppetite: 0.05,
      possessionTempo: 0.15,
      breakAppetite: 0.2,
      passSelectivity: 0,
      coverageShade: 0.2,
    },
    dLineDirectiveBias: {
      creativity: 0.3,
      huckAppetite: 0.1,
      possessionTempo: 0.25,
      breakAppetite: 0.25,
      passSelectivity: 0.05,
      coverageShade: 0.3,
    },
    adaptability: 0.6,
    conservatism: 0.35,
  },
  {
    id: 'cup_grinder',
    label: 'Cup control',
    labelEn: 'Cup control',
    attackMindset: 'patient',
    defenseMindset: 'zone',
    oLineAttackStyles: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
    // W przeciwieństwie do "Architekta strefy" — ciasny cup, nie inwestuje w zone offense.
    oLineDefenseStyles: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.PERSON],
    dLineAttackStyles: [ATTACK_STYLES.HEX_OFFENSE, ATTACK_STYLES.VERTICAL_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.ZONE_WALL],
    preferredForce: FORCE_SIDES.FORCE_MIDDLE,
    oLineDirectiveBias: {
      creativity: -0.15,
      huckAppetite: -0.2,
      possessionTempo: -0.15,
      breakAppetite: 0.1,
      passSelectivity: -0.15,
      coverageShade: 0.05,
    },
    dLineDirectiveBias: {
      creativity: -0.05,
      huckAppetite: -0.1,
      possessionTempo: -0.1,
      breakAppetite: 0.3,
      passSelectivity: -0.15,
      coverageShade: 0.25,
    },
    adaptability: 0.4,
    conservatism: 0.6,
  },
  {
    id: 'bait_switch',
    label: 'Prowokator',
    labelEn: 'Bait & switch',
    attackMindset: 'creative',
    defenseMindset: 'balanced',
    oLineAttackStyles: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.SPLIT_STACK],
    // Pozorowany person, realny poach — cała tożsamość to zwodzenie.
    oLineDefenseStyles: [DEFENSE_STYLES.CLAM, DEFENSE_STYLES.PERSON],
    dLineAttackStyles: [ATTACK_STYLES.SPLIT_STACK, ATTACK_STYLES.SIDE_STACK],
    dLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.CLAM],
    preferredForce: FORCE_SIDES.FORCE_SIDELINE,
    oLineDirectiveBias: {
      creativity: 0.4,
      huckAppetite: 0.15,
      possessionTempo: 0.05,
      breakAppetite: 0.35,
      passSelectivity: 0.1,
      coverageShade: 0.2,
    },
    dLineDirectiveBias: {
      creativity: 0.35,
      huckAppetite: 0.25,
      possessionTempo: 0.15,
      breakAppetite: 0.3,
      passSelectivity: 0.1,
      coverageShade: 0.3,
    },
    adaptability: 0.6,
    conservatism: 0.3,
  },
  {
    id: 'motion_system',
    label: 'Systemowiec',
    labelEn: 'Motion system',
    attackMindset: 'tempo',
    defenseMindset: 'pressure',
    // Jedyny archetyp z tą samą tożsamością ataku na O i D-line — wierzy w system, nie w sytuację.
    oLineAttackStyles: [ATTACK_STYLES.MOTION_OFFENSE, ATTACK_STYLES.HEX_OFFENSE],
    oLineDefenseStyles: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.PERSON],
    dLineAttackStyles: [ATTACK_STYLES.MOTION_OFFENSE, ATTACK_STYLES.HEX_OFFENSE],
    dLineDefenseStyles: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
    preferredForce: FORCE_SIDES.FORCE_BACKHAND,
    oLineDirectiveBias: {
      creativity: 0.1,
      huckAppetite: -0.05,
      possessionTempo: 0.4,
      breakAppetite: 0.05,
      passSelectivity: 0.2,
      coverageShade: -0.1,
    },
    dLineDirectiveBias: {
      creativity: 0.1,
      huckAppetite: -0.05,
      possessionTempo: 0.35,
      breakAppetite: 0.05,
      passSelectivity: 0.15,
      coverageShade: -0.05,
    },
    adaptability: 0.55,
    conservatism: 0.45,
  },
  {
    id: 'tactical_mastermind',
    label: 'Geniusz taktyczny',
    labelEn: 'Tactical mastermind',
    attackMindset: 'balanced',
    defenseMindset: 'balanced',
    // Brak dogmy: każdy mecz startuje z układem wybranym czysto pod roster (patrz flatStart
    // + computeStyleFitForTeam w aiLineup.js). Pełne menu stylów — nic nie jest z góry wykluczone.
    oLineAttackStyles: Object.values(ATTACK_STYLES),
    oLineDefenseStyles: Object.values(DEFENSE_STYLES),
    dLineAttackStyles: Object.values(ATTACK_STYLES),
    dLineDefenseStyles: Object.values(DEFENSE_STYLES),
    preferredForce: FORCE_SIDES.FORCE_FOREHAND,
    oLineDirectiveBias: {
      creativity: 0,
      huckAppetite: 0,
      possessionTempo: 0,
      breakAppetite: 0,
      passSelectivity: 0,
      coverageShade: 0,
    },
    dLineDirectiveBias: {
      creativity: 0,
      huckAppetite: 0,
      possessionTempo: 0,
      breakAppetite: 0,
      passSelectivity: 0,
      coverageShade: 0,
    },
    // Prawie natychmiastowa, bardzo trafna reakcja w trakcie meczu (adaptAiTacticsBetweenPoints
    // czyta te wartości — wysoka adaptability + minimalny conservatism = reaguje niemal co punkt).
    adaptability: 0.97,
    conservatism: 0.05,
    flatStart: true,
  },
]

function clampBias(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

/**
 * Właściwe uśrednienie ważone (współczynniki sumują się do 1) — poprzednia wersja
 * sumowała `base*(1-weight*0.35) + bias*weight` (razem ~1.55 przy weight=0.85), więc
 * gdy tożsamość drużyny i wylosowany archetyp trenera zgadzały się kierunkiem
 * (częste — archetypy jak "patient"/"tempo" pokrywają się z gotowymi tożsamościami),
 * efekty się wzmacniały zamiast uśredniać i suwak lądował przy granicy ±1.
 */
function blendDirective(base, bias, weight = 0.85) {
  return clampBias((base ?? 0) * (1 - weight) + (bias ?? 0) * weight)
}

const ARCHETYPE_AFFINITY_WEIGHT = 0.65
const ROSTER_FIT_WEIGHT = 0.35

/** Im wcześniej styl jest w liście preferencji, tym wyższe powinowactwo (100 → 40 floor). */
function styleAffinity(style, preferredList) {
  if (!preferredList?.length) return 50
  const idx = preferredList.indexOf(style)
  if (idx === -1) return 30
  return Math.max(40, 100 - idx * 15)
}

/**
 * Wybór stylu dla jednego z 4 slotów (oLine/dLine × atak/obrona): łączy tożsamość
 * trenera (`preferredList`, w kolejności) z realnym dopasowaniem drużyny do stylu
 * (`fitMap`, 0–100 per styl — patrz computeStyleFitForTeam w aiLineup.js). Dzięki wadze
 * dopasowania archetyp może zostać "przegłosowany", gdy roster fatalnie pasuje do jego
 * ulubionego stylu (np. brak obrońców do zony) — bez twardego progu, efekt wynika wprost
 * z wagi ROSTER_FIT_WEIGHT. `flatStart` (Geniusz taktyczny) ignoruje tożsamość całkowicie.
 */
/**
 * Ile gorszy fit preferowanego stylu (względem najlepszego dostępnego) trener jeszcze
 * toleruje, zanim uzna go za niegrywalny z obecnym rosterem i porzuci — niezależnie od
 * tego, jak bardzo "swój" jest to styl. Przykład: archetyp zonowy bez obrońców
 * potrafiących czytać zonę (niskie defensiveSystemsKnowledge) traci zonę z listy.
 */
const FIT_OVERRIDE_MARGIN = 20

function pickStyleForSlot(preferredList, fitMap, fallback, flatStart = false) {
  const candidates = fitMap ? Object.keys(fitMap) : preferredList
  if (!candidates?.length) return preferredList?.[0] ?? fallback ?? null

  const fitOf = (style) => fitMap?.[style] ?? 50
  // Preferencje, których fit fatalnie odstaje od najlepszego dostępnego stylu w tej
  // kategorii, wypadają z rozważań tożsamości — reszta selekcji (poniżej) już samą wagą
  // ROSTER_FIT_WEIGHT dociąga wybór do tego, co roster faktycznie potrafi zagrać.
  let usablePreferred = preferredList
  if (!flatStart && preferredList?.length && fitMap) {
    const bestFit = Math.max(...candidates.map(fitOf))
    const filtered = preferredList.filter((s) => fitOf(s) >= bestFit - FIT_OVERRIDE_MARGIN)
    usablePreferred = filtered.length ? filtered : null
  }

  let best = candidates[0]
  let bestScore = -Infinity
  for (const style of candidates) {
    const fit = fitOf(style)
    const score = flatStart
      ? fit
      : styleAffinity(style, usablePreferred) * ARCHETYPE_AFFINITY_WEIGHT + fit * ROSTER_FIT_WEIGHT
    if (score > bestScore) {
      bestScore = score
      best = style
    }
  }
  return best
}

/** Deterministyczny wybór archetypu z seeda (teamId + saveSeed). */
export function pickAiCoachArchetype(rngOrSeed) {
  const rng =
    typeof rngOrSeed === 'object' && rngOrSeed?.float
      ? rngOrSeed
      : createRng(typeof rngOrSeed === 'number' ? rngOrSeed : hashString(String(rngOrSeed ?? 'ai')))
  const idx = Math.floor(rng.float() * AI_COACH_ARCHETYPES.length) % AI_COACH_ARCHETYPES.length
  const base = AI_COACH_ARCHETYPES[idx]
  // Lekki jitter suwaków, żeby nie wszystkie drużyny z tym samym archetypem były klonami.
  const jitterBias = (biasObj) => {
    const jitter = (key, amp = 0.12) =>
      clampBias((biasObj?.[key] ?? 0) + (rng.float() * 2 - 1) * amp)
    return {
      creativity: jitter('creativity'),
      coverageShade: jitter('coverageShade', 0.1),
      huckAppetite: jitter('huckAppetite'),
      passSelectivity: jitter('passSelectivity', 0.1),
      breakAppetite: jitter('breakAppetite'),
      possessionTempo: jitter('possessionTempo'),
    }
  }
  return {
    ...base,
    oLineDirectiveBias: jitterBias(base.oLineDirectiveBias),
    dLineDirectiveBias: jitterBias(base.dLineDirectiveBias),
    adaptability: Math.max(0.2, Math.min(0.95, base.adaptability + (rng.float() * 2 - 1) * 0.08)),
    conservatism: Math.max(0.15, Math.min(0.9, base.conservatism + (rng.float() * 2 - 1) * 0.08)),
  }
}

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Losuje profile dla wszystkich drużyn AI w świecie (przy createCareer).
 * @param {object} world
 * @param {string|null} playerTeamId
 * @param {number} [seed]
 */
export function rollAiCoachProfilesForWorld(world, playerTeamId = null, seed = null) {
  if (!world?.teamsById) return world
  const baseSeed = seed ?? (Date.now() % 1_000_000)
  for (const id of world.teamIds ?? Object.keys(world.teamsById)) {
    const team = world.teamsById[id]
    if (!team) continue
    if (playerTeamId && id === playerTeamId) {
      team.aiCoachProfile = null
      continue
    }
    team.aiCoachProfile = pickAiCoachArchetype(hashString(`${baseSeed}:${id}`))
  }
  return world
}

/** Uzupełnia brakujące profile (stare save'y) — deterministycznie z teamId. */
export function ensureAiCoachProfiles(world, playerTeamId = null) {
  if (!world?.teamsById) return world
  for (const id of world.teamIds ?? Object.keys(world.teamsById)) {
    const team = world.teamsById[id]
    if (!team) continue
    if (playerTeamId && id === playerTeamId) {
      if (team.aiCoachProfile == null) team.aiCoachProfile = null
      continue
    }
    if (!team.aiCoachProfile?.id) {
      team.aiCoachProfile = pickAiCoachArchetype(hashString(`ensure:${id}`))
    }
  }
  return world
}

/**
 * Łączy tożsamość ligową z ukrytym profilem trenera.
 * @param {object} identity — z teamTacticalIdentity()
 * @param {AiCoachProfile|null|undefined} profile
 * @param {object} [options]
 * @param {{oLineAttack:object, oLineDefense:object, dLineAttack:object, dLineDefense:object}|null} [options.styleFit]
 *   — mapy `{ [styleId]: 0-100 }` z computeStyleFitForTeam (aiLineup.js), per slot.
 */
export function applyAiCoachProfileToIdentity(identity, profile, options = {}) {
  if (!profile?.id) return identity
  const { styleFit = null } = options

  const bias = { o: profile.oLineDirectiveBias ?? {}, d: profile.dLineDirectiveBias ?? {} }
  const baseO = identity.oLineCoachDirectives ?? identity.coachDirectives ?? defaultCoachDirectives()
  const baseD = identity.dLineCoachDirectives ?? identity.coachDirectives ?? baseO

  const mergeDirs = (base, b) =>
    normalizeCoachDirectives({
      ...base,
      creativity: blendDirective(base.creativity, b.creativity),
      coverageShade: blendDirective(base.coverageShade, b.coverageShade),
      huckAppetite: blendDirective(base.huckAppetite, b.huckAppetite),
      passSelectivity: blendDirective(base.passSelectivity, b.passSelectivity),
      breakAppetite: blendDirective(base.breakAppetite, b.breakAppetite),
      possessionTempo: blendDirective(base.possessionTempo, b.possessionTempo),
      forceSide: profile.preferredForce ?? base.forceSide,
    })

  const oDirs = mergeDirs(baseO, bias.o)
  const dDirs = mergeDirs(baseD, bias.d)

  const flat = profile.flatStart === true

  return {
    ...identity,
    label: `${identity.label} · ${profile.label}`,
    aiCoachProfile: profile,
    oLineAttackStyle: pickStyleForSlot(
      profile.oLineAttackStyles,
      styleFit?.oLineAttack,
      identity.oLineAttackStyle,
      flat,
    ),
    dLineAttackStyle: pickStyleForSlot(
      profile.dLineAttackStyles,
      styleFit?.dLineAttack,
      identity.dLineAttackStyle,
      flat,
    ),
    oLineDefenseStyle: pickStyleForSlot(
      profile.oLineDefenseStyles,
      styleFit?.oLineDefense,
      identity.oLineDefenseStyle,
      flat,
    ),
    dLineDefenseStyle: pickStyleForSlot(
      profile.dLineDefenseStyles,
      styleFit?.dLineDefense,
      identity.dLineDefenseStyle,
      flat,
    ),
    oLineCoachDirectives: oDirs,
    dLineCoachDirectives: dDirs,
    coachDirectives: oDirs,
    forceSide: oDirs.forceSide,
    attackMindset: profile.attackMindset,
    defenseMindset: profile.defenseMindset,
    adaptability: profile.adaptability ?? 0.5,
    conservatism: profile.conservatism ?? 0.5,
  }
}

/** Profil z drużyny albo deterministyczny fallback. */
export function resolveTeamAiCoachProfile(team) {
  if (team?.aiCoachProfile?.id) return team.aiCoachProfile
  if (!team?.id) return null
  return pickAiCoachArchetype(hashString(`runtime:${team.id}`))
}
