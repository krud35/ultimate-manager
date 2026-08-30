/**
 * Założenia trenera per linia (O-Line / D-Line): suwaki −1…+1 + force.
 * Nakładane na decyzje AI z wagą compliance (cechy + znajomość systemu).
 *
 * tactics.oLineCoachDirectives / tactics.dLineCoachDirectives
 * Legacy: tactics.coachDirectives → migracja do obu linii (alias = O-Line).
 */

import { FORCE_SIDES, resolveLineRole } from './tacticsModifiers.js'
import { normalizeForceMark } from './throwTechnique.js'
import { getPlayerTraits, getTraitMods } from '../models/playerTraits.js'
import { getSubStat, normalizePlayerSkills } from '../models/playerStats.js'
import {
  instructionsForPlayer,
  instructionModsForPlayer,
} from './playerInstructions.js'
import { storedSubRoleForPlayer, subRoleMods } from './playerSubRoles.js'

/** @typedef {'offense'|'defense'} CoachRole */
/** @typedef {'offense'|'defense'} LineRole — O-Line | D-Line (wg startu punktu) */

export const COACH_SLIDER_KEYS = [
  'creativity',
  'coverageShade',
  'huckAppetite',
  'passSelectivity',
  'breakAppetite',
  'possessionTempo',
]

/** Metadane UI / opisy biegunów. */
export const COACH_DIRECTIVE_META = {
  creativity: {
    label: 'Kreatywna ekspresja',
    labelEn: 'Creative expression',
    left: 'Brak',
    leftEn: 'None',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Dozwolona',
    rightEn: 'Allowed',
    descriptionLeft: 'Sztywne ramy taktyczne — mniej hero throws i poachów.',
    descriptionLeftEn: 'Strict tactical frame — fewer hero throws and poaches.',
    descriptionRight: 'Więcej kreatywnych cutów, breaków i nietypowych rzutów.',
    descriptionRightEn: 'More creative cuts, breaks, and unusual throws.',
  },
  coverageShade: {
    label: 'Krycie (under / deep)',
    labelEn: 'Coverage (under / deep)',
    left: 'Od in',
    leftEn: 'Under',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Od out',
    rightEn: 'Deep',
    descriptionLeft: 'Cushion bliżej dysku — zabieraj under / podania do dysku.',
    descriptionLeftEn: 'Cushion closer to the disc — take away under / in cuts.',
    descriptionRight: 'Shade deep — pilnuj głębokości, under oddany szybszym cutom.',
    descriptionRightEn: 'Shade deep — guard depth, concede under to faster cuts.',
  },
  huckAppetite: {
    label: 'Hucki',
    labelEn: 'Hucks',
    left: 'Ostrożnie',
    leftEn: 'Careful',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Chętnie',
    rightEn: 'Eager',
    descriptionLeft: 'Mniej deep looks, więcej dump–swing.',
    descriptionLeftEn: 'Fewer deep looks, more dump–swing.',
    descriptionRight: 'Szukaj deep przy czystej separacji — nie forsuj contested hucków.',
    descriptionRightEn: 'Look deep with clean separation — do not force contested hucks.',
  },
  passSelectivity: {
    label: 'Wymagana separacja',
    labelEn: 'Required separation',
    left: 'Tylko otwarte',
    leftEn: 'Open only',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Luźniej',
    rightEn: 'Looser',
    descriptionLeft: 'Wyższy próg separacji na wszystkie rzuty — preferuj otwarte oferty.',
    descriptionLeftEn: 'Higher separation bar on all throws — prefer open looks.',
    descriptionRight: 'Niższy próg separacji (bez totalnie złych looków) — więcej contested OK.',
    descriptionRightEn: 'Lower separation bar (no truly bad looks) — more contested OK.',
  },
  breakAppetite: {
    label: 'Break vs force',
    labelEn: 'Break vs force',
    left: 'Szanuj force',
    leftEn: 'Respect force',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Szukaj breaków',
    rightEn: 'Hunt breaks',
    descriptionLeft: 'Rzucaj open-side; rzadziej IO / around.',
    descriptionLeftEn: 'Throw open-side; fewer IO / arounds.',
    descriptionRight: 'Aktywnie szukaj break-side i IO.',
    descriptionRightEn: 'Actively look for break-side and IO.',
  },
  possessionTempo: {
    label: 'Tempo posiadania',
    labelEn: 'Possession tempo',
    left: 'Cierpliwie',
    leftEn: 'Patient',
    center: 'Neutralnie',
    centerEn: 'Neutral',
    right: 'Tempo',
    rightEn: 'Tempo',
    descriptionLeft: 'Dłużej trzymaj dysk na lepszy look.',
    descriptionLeftEn: 'Hold the disc longer for a better look.',
    descriptionRight: 'Szybsze release / wcześniejsze dumpy.',
    descriptionRightEn: 'Faster release / earlier dumps.',
  },
}

export const COACH_FORCE_PRIMARY = [
  FORCE_SIDES.FORCE_FOREHAND,
  FORCE_SIDES.FORCE_BACKHAND,
  FORCE_SIDES.FORCE_MIDDLE,
]

export const COACH_FORCE_ADVANCED = [
  FORCE_SIDES.FORCE_SIDELINE,
  FORCE_SIDES.FORCE_STRAIGHT,
]

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function clampSlider(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function defaultCoachDirectives(forceSide = FORCE_SIDES.FORCE_FOREHAND) {
  return {
    creativity: 0,
    coverageShade: 0,
    huckAppetite: 0,
    passSelectivity: 0,
    breakAppetite: 0,
    possessionTempo: 0,
    forceSide: normalizeForceMark(forceSide),
  }
}

/**
 * Normalizacja + migracja legacy `tactics.forceSide` → coachDirectives.forceSide.
 * @param {object|null|undefined} raw
 * @param {string} [legacyForceSide]
 */
export function normalizeCoachDirectives(raw, legacyForceSide = null) {
  const base = defaultCoachDirectives(
    raw?.forceSide ?? legacyForceSide ?? FORCE_SIDES.FORCE_FOREHAND,
  )
  if (!raw || typeof raw !== 'object') return base
  return {
    creativity: clampSlider(raw.creativity ?? base.creativity),
    coverageShade: clampSlider(raw.coverageShade ?? base.coverageShade),
    huckAppetite: clampSlider(raw.huckAppetite ?? base.huckAppetite),
    passSelectivity: clampSlider(raw.passSelectivity ?? base.passSelectivity),
    breakAppetite: clampSlider(raw.breakAppetite ?? base.breakAppetite),
    possessionTempo: clampSlider(raw.possessionTempo ?? base.possessionTempo),
    forceSide: normalizeForceMark(
      raw.forceSide ?? legacyForceSide ?? base.forceSide,
    ),
  }
}

/** @deprecated import from tacticsModifiers.js instead — re-exported here for existing callers. */
export { resolveLineRole }

/**
 * Dyrektywy dla O-Line lub D-Line (z migracją legacy coachDirectives).
 * @param {object|null|undefined} tactics
 * @param {LineRole|null|undefined} [lineRole]
 */
export function coachDirectivesForLine(tactics, lineRole = null) {
  const role = resolveLineRole(tactics, lineRole)
  const legacy = tactics?.coachDirectives
  const legacyForce = tactics?.forceSide ?? legacy?.forceSide

  if (role === 'defense') {
    return normalizeCoachDirectives(
      tactics?.dLineCoachDirectives ?? legacy,
      tactics?.dLineCoachDirectives?.forceSide ?? legacyForce,
    )
  }
  return normalizeCoachDirectives(
    tactics?.oLineCoachDirectives ?? legacy,
    tactics?.oLineCoachDirectives?.forceSide ?? legacy?.forceSide ?? legacyForce,
  )
}

/**
 * Para znormalizowanych dyrektyw + aliasy legacy.
 * @param {object|null|undefined} tactics
 */
export function normalizeLineCoachDirectives(tactics) {
  const legacyForce = tactics?.forceSide ?? tactics?.coachDirectives?.forceSide
  const legacy = tactics?.coachDirectives

  const oLineCoachDirectives = normalizeCoachDirectives(
    tactics?.oLineCoachDirectives ?? legacy,
    tactics?.oLineCoachDirectives?.forceSide ?? legacy?.forceSide ?? legacyForce,
  )
  const dLineCoachDirectives = normalizeCoachDirectives(
    tactics?.dLineCoachDirectives ?? legacy ?? oLineCoachDirectives,
    tactics?.dLineCoachDirectives?.forceSide ??
      legacy?.forceSide ??
      oLineCoachDirectives.forceSide ??
      legacyForce,
  )

  return {
    oLineCoachDirectives,
    dLineCoachDirectives,
    /** @deprecated alias = O-Line */
    coachDirectives: oLineCoachDirectives,
    /** @deprecated alias = O-Line force */
    forceSide: oLineCoachDirectives.forceSide,
  }
}

/** Force z taktyki dla danej linii (domyślnie O-Line / _pointStartRole). */
export function forceSideFromTactics(tactics, lineRole = null) {
  return coachDirectivesForLine(tactics, lineRole).forceSide
}

/**
 * Jak mocno zawodnik słucha założeń trenera (0.15–0.95).
 * @param {object} player
 * @param {CoachRole} role
 * @param {string} [directiveKey] — opcjonalnie lekka korekta per dyrektywa
 * @param {object|null} [tactics] — opcjonalnie tacticsFamiliarity z treningów
 */
export function coachCompliance(player, role = 'offense', directiveKey = null, tactics = null) {
  const skills = normalizePlayerSkills(player?.skills ?? player)
  const systems =
    role === 'defense'
      ? getSubStat(skills, 'defensive', 'defensiveSystemsKnowledge')
      : getSubStat(skills, 'offensive', 'offensiveSystemsKnowledge')
  let compliance = lerp(0.25, 0.85, clamp01((systems ?? 50) / 100))

  const traits = new Set(getPlayerTraits(player))
  if (traits.has('professional')) compliance += 0.08
  if (traits.has('composed')) compliance += 0.04
  if (traits.has('determined')) compliance += 0.03
  if (traits.has('leader')) compliance += 0.02
  if (traits.has('disciplined')) compliance += 0.1
  if (traits.has('adaptive')) compliance += 0.04
  if (traits.has('smart')) compliance += 0.03
  if (traits.has('hot_headed')) compliance -= 0.1
  if (traits.has('fragile_ego')) compliance -= 0.06
  if (traits.has('wants_the_disc')) compliance -= 0.06
  if (traits.has('turnover_prone')) compliance -= 0.05
  compliance += getTraitMods(player).structureComplianceBonus ?? 0

  // Znajomość taktyk z treningów drużynowych (0–100 → do ±0.08)
  const fam = tactics?.tacticsFamiliarity
  if (typeof fam === 'number' && Number.isFinite(fam)) {
    compliance += ((fam - 40) / 100) * 0.12
  }

  if (directiveKey === 'huckAppetite') {
    if (traits.has('huck_lover')) compliance -= 0.12
    if (traits.has('dump_guy')) compliance -= 0.1
    if (traits.has('safe_hands')) compliance -= 0.06
  }
  if (directiveKey === 'passSelectivity') {
    if (traits.has('safe_hands')) compliance += 0.06
    if (traits.has('huck_lover')) compliance -= 0.05
    if (traits.has('hot_headed')) compliance -= 0.08
    if (traits.has('disciplined')) compliance += 0.05
  }
  if (directiveKey === 'creativity') {
    if (traits.has('hot_headed')) compliance -= 0.05
    if (traits.has('creative_thrower')) compliance -= 0.1
    if (traits.has('safe_hands')) compliance -= 0.08
  }

  return Math.max(0.15, Math.min(0.95, compliance))
}

/**
 * Efektywna wartość dyrektywy dla zawodnika: instinct(0) → coach, wagą compliance.
 */
export function effectiveDirective(coachValue, compliance) {
  return clampSlider((coachValue ?? 0) * compliance)
}

/**
 * Zestaw skutecznych biasów (−1…1) dla zawodnika w danej roli.
 * @param {object|null} tactics
 * @param {object} player
 * @param {CoachRole} role
 * @param {LineRole|null} [lineRole]
 */
export function effectiveCoachDirectives(tactics, player, role = 'offense', lineRole = null) {
  const d = coachDirectivesForLine(tactics, lineRole)
  const out = { forceSide: d.forceSide }
  for (const key of COACH_SLIDER_KEYS) {
    const c = coachCompliance(player, role, key, tactics)
    out[key] = effectiveDirective(d[key], c)
  }
  return out
}

/**
 * Modyfikatory liczbowe pod mózgi AI.
 * @param {object|null} tactics
 * @param {object} player
 * @param {CoachRole} role
 * @param {LineRole|null} [lineRole]
 */
export function coachDirectiveMods(tactics, player, role = 'offense', lineRole = null) {
  const e = effectiveCoachDirectives(tactics, player, role, lineRole)
  return {
    forceSide: e.forceSide,
    acceptanceThresholdDelta: -e.creativity * 0.12,
    decisionNoiseMult: 1 + e.creativity * 0.18,
    poachChanceMult: 1 + e.creativity * 0.22,
    cutRollMult: 1 + e.creativity * 0.1,
    heroThrowWeightMult: 1 + e.creativity * 0.25,
    cushionDeltaM: e.coverageShade * 0.55,
    denyUnderBias: -e.coverageShade * 0.35,
    helpDeepBias: e.coverageShade * 0.35,
    underCutDenyMult: 1 - e.coverageShade * 0.2,
    huckWeightMult: 1 + e.huckAppetite * 0.25,
    dumpWeightMult: 1 - e.huckAppetite * 0.1,
    huckAcceptanceDelta: e.huckAppetite * 0.06,
    // −1 = tylko otwarte (wyższy próg), +1 = luźniej (niższy próg).
    separationReqDeltaM: -e.passSelectivity * 0.6,
    openLookBias: Math.max(0, -e.passSelectivity),
    breakSideOptionBonus: e.breakAppetite * 0.22,
    breakSideWeightMult: 1 + e.breakAppetite * 0.35,
    releaseGateMult: 1 - e.possessionTempo * 0.1,
    dumpEarlyBias: e.possessionTempo * 0.08,
  }
}

/**
 * Trait mods + coachDirectives (per linia) + indywidualne instrukcje + podrole.
 * @param {object} player
 * @param {object|null|undefined} tactics
 * @param {CoachRole} [role]
 * @param {LineRole|null} [lineRole]
 */
/**
 * Cache po TOŻSAMOŚCI (player, tactics) + kluczu (role, lineRole) — patrz analogiczny
 * komentarz przy normalizeLinePlayerInstructions (playerInstructions.js). To najgorętsza
 * funkcja silnika po memoizacji warstwy niżej: buduje duży obiekt modyfikatorów i woła
 * coachCompliance / coachDirectiveMods / instructionsForPlayer, a jest wywoływana w
 * pętlach per-tick dla każdego agenta (profil: 33% czasu CPU pełnego meczu). Wszystkie
 * wejścia są w trakcie meczu niezmienne, a wynik jest tylko odczytywany (zweryfikowane —
 * `instructionModsForPlayer` mutuje własny, lokalny obiekt, nie ten zwracany tutaj).
 */
const mergedModsCache = new WeakMap()
const NO_TACTICS = Object.freeze({})

export function mergeTraitAndCoachMods(player, tactics = null, role = 'offense', lineRole = null) {
  if (player && typeof player === 'object') {
    const tacticsKey = tactics && typeof tactics === 'object' ? tactics : NO_TACTICS
    let byTactics = mergedModsCache.get(player)
    if (!byTactics) {
      byTactics = new WeakMap()
      mergedModsCache.set(player, byTactics)
    }
    let byRole = byTactics.get(tacticsKey)
    if (!byRole) {
      byRole = new Map()
      byTactics.set(tacticsKey, byRole)
    }
    const roleKey = `${role}|${lineRole}`
    if (byRole.has(roleKey)) return byRole.get(roleKey)
    const computed = computeTraitAndCoachMods(player, tactics, role, lineRole)
    byRole.set(roleKey, computed)
    return computed
  }
  return computeTraitAndCoachMods(player, tactics, role, lineRole)
}

function computeTraitAndCoachMods(player, tactics = null, role = 'offense', lineRole = null) {
  const traits = getTraitMods(player)
  const emptyExtra = {
    denyUnderBias: 0,
    helpDeepBias: 0,
    releaseGateMult: 1,
    breakSideWeightMult: 1,
    breakSideSepReqDeltaM: 0,
    huckAcceptanceDelta: 0,
    heroThrowWeightMult: 1,
    dumpEarlyBias: 0,
    separationReqDeltaM: 0,
    openLookBias: 0,
    primaryHandlerBias: 0,
    throwerPickWeightMult: 1,
    resetFirstStallBias: traits.resetFirstStallBias ?? 0,
    cutOfferPriority: 0,
    continuationOnlyCuts: false,
    fillerCutsOnly: false,
    greatOppWindowMin: 0,
    postCatchOfferBonus: 0,
    preferDumpRole: false,
  }

  let merged = {
    ...traits,
    ...emptyExtra,
    resetFirstStallBias: traits.resetFirstStallBias ?? 0,
    dumpEarlyBias: traits.dumpEarlyBias ?? 0,
    huckAcceptanceDelta: traits.huckAcceptanceDelta ?? 0,
    heroThrowWeightMult: traits.heroThrowWeightMult ?? 1,
    releaseGateMult: traits.releaseGateMult ?? 1,
  }

  if (tactics) {
    const coach = coachDirectiveMods(tactics, player, role, lineRole)
    merged = {
      ...merged,
      acceptanceThresholdDelta:
        (merged.acceptanceThresholdDelta ?? 0) + (coach.acceptanceThresholdDelta ?? 0),
      decisionNoiseMult: (merged.decisionNoiseMult ?? 1) * (coach.decisionNoiseMult ?? 1),
      huckWeightMult: (merged.huckWeightMult ?? 1) * (coach.huckWeightMult ?? 1),
      dumpWeightMult: (merged.dumpWeightMult ?? 1) * (coach.dumpWeightMult ?? 1),
      breakSideOptionBonus:
        (merged.breakSideOptionBonus ?? 0) + (coach.breakSideOptionBonus ?? 0),
      poachChanceMult: (merged.poachChanceMult ?? 1) * (coach.poachChanceMult ?? 1),
      cutRollMult: (merged.cutRollMult ?? 1) * (coach.cutRollMult ?? 1),
      cushionDeltaM: (merged.cushionDeltaM ?? 0) + (coach.cushionDeltaM ?? 0),
      denyUnderBias: (merged.denyUnderBias ?? 0) + (coach.denyUnderBias ?? 0),
      helpDeepBias: (merged.helpDeepBias ?? 0) + (coach.helpDeepBias ?? 0),
      releaseGateMult: (merged.releaseGateMult ?? 1) * (coach.releaseGateMult ?? 1),
      breakSideWeightMult:
        (merged.breakSideWeightMult ?? 1) * (coach.breakSideWeightMult ?? 1),
      huckAcceptanceDelta:
        (merged.huckAcceptanceDelta ?? 0) + (coach.huckAcceptanceDelta ?? 0),
      heroThrowWeightMult:
        (merged.heroThrowWeightMult ?? 1) * (coach.heroThrowWeightMult ?? 1),
      dumpEarlyBias: (merged.dumpEarlyBias ?? 0) + (coach.dumpEarlyBias ?? 0),
      separationReqDeltaM:
        (merged.separationReqDeltaM ?? 0) + (coach.separationReqDeltaM ?? 0),
      openLookBias: Math.max(merged.openLookBias ?? 0, coach.openLookBias ?? 0),
    }
  }

  const instrIds = instructionsForPlayer(tactics, player?.id, lineRole)
  if (instrIds.length) {
    const instr = instructionModsForPlayer(instrIds, player, role)
    merged = {
      ...merged,
      huckWeightMult: (merged.huckWeightMult ?? 1) * (instr.huckWeightMult ?? 1),
      dumpWeightMult: (merged.dumpWeightMult ?? 1) * (instr.dumpWeightMult ?? 1),
      ottWeightMult: (merged.ottWeightMult ?? 1) * (instr.ottWeightMult ?? 1),
      standardWeightMult:
        (merged.standardWeightMult ?? 1) * (instr.standardWeightMult ?? 1),
      breakSideOptionBonus:
        (merged.breakSideOptionBonus ?? 0) + (instr.breakSideOptionBonus ?? 0),
      breakSideWeightMult:
        (merged.breakSideWeightMult ?? 1) * (instr.breakSideWeightMult ?? 1),
      breakSideSepReqDeltaM:
        (merged.breakSideSepReqDeltaM ?? 0) + (instr.breakSideSepReqDeltaM ?? 0),
      acceptanceThresholdDelta:
        (merged.acceptanceThresholdDelta ?? 0) + (instr.acceptanceThresholdDelta ?? 0),
      decisionNoiseMult: (merged.decisionNoiseMult ?? 1) * (instr.decisionNoiseMult ?? 1),
      scanRadiusBonusM: (merged.scanRadiusBonusM ?? 0) + (instr.scanRadiusBonusM ?? 0),
      perceivedOptionsBonus:
        (merged.perceivedOptionsBonus ?? 0) + (instr.perceivedOptionsBonus ?? 0),
      cutRollMult: (merged.cutRollMult ?? 1) * (instr.cutRollMult ?? 1),
      cutPriorityDelta: (merged.cutPriorityDelta ?? 0) + (instr.cutPriorityDelta ?? 0),
      deepCutBias: (merged.deepCutBias ?? 0) + (instr.deepCutBias ?? 0),
      underCutBias: (merged.underCutBias ?? 0) + (instr.underCutBias ?? 0),
      clearActiveCutMult:
        (merged.clearActiveCutMult ?? 1) * (instr.clearActiveCutMult ?? 1),
      clearLaneExtraM: (merged.clearLaneExtraM ?? 0) + (instr.clearLaneExtraM ?? 0),
      cushionDeltaM: (merged.cushionDeltaM ?? 0) + (instr.cushionDeltaM ?? 0),
      denyUnderBias: (merged.denyUnderBias ?? 0) + (instr.denyUnderBias ?? 0),
      helpDeepBias: (merged.helpDeepBias ?? 0) + (instr.helpDeepBias ?? 0),
      poachChanceMult: (merged.poachChanceMult ?? 1) * (instr.poachChanceMult ?? 1),
      releaseGateMult: (merged.releaseGateMult ?? 1) * (instr.releaseGateMult ?? 1),
      dumpEarlyBias: (merged.dumpEarlyBias ?? 0) + (instr.dumpEarlyBias ?? 0),
      huckAcceptanceDelta:
        (merged.huckAcceptanceDelta ?? 0) + (instr.huckAcceptanceDelta ?? 0),
      heroThrowWeightMult:
        (merged.heroThrowWeightMult ?? 1) * (instr.heroThrowWeightMult ?? 1),
      resetFirstStallBias:
        (merged.resetFirstStallBias ?? 0) + (instr.resetFirstStallBias ?? 0),
      primaryHandlerBias:
        (merged.primaryHandlerBias ?? 0) + (instr.primaryHandlerBias ?? 0),
      throwerPickWeightMult:
        (merged.throwerPickWeightMult ?? 1) * (instr.throwerPickWeightMult ?? 1),
    }
  }

  const subId = storedSubRoleForPlayer(tactics, player?.id)
  if (subId) {
    const sub = subRoleMods(subId)
    merged = {
      ...merged,
      cutRollMult: (merged.cutRollMult ?? 1) * (sub.cutRollMult ?? 1),
      cutPriorityDelta: (merged.cutPriorityDelta ?? 0) + (sub.cutPriorityDelta ?? 0),
      cutOfferPriority: (merged.cutOfferPriority ?? 0) + (sub.cutOfferPriority ?? 0),
      continuationOnlyCuts: Boolean(sub.continuationOnlyCuts),
      fillerCutsOnly: Boolean(sub.fillerCutsOnly),
      greatOppWindowMin: Math.max(merged.greatOppWindowMin ?? 0, sub.greatOppWindowMin ?? 0),
      postCatchOfferBonus: (merged.postCatchOfferBonus ?? 0) + (sub.postCatchOfferBonus ?? 0),
      throwerPickWeightMult:
        (merged.throwerPickWeightMult ?? 1) * (sub.throwerPickWeightMult ?? 1),
      primaryHandlerBias: (merged.primaryHandlerBias ?? 0) + (sub.primaryHandlerBias ?? 0),
      dumpWeightMult: (merged.dumpWeightMult ?? 1) * (sub.dumpWeightMult ?? 1),
      dumpEarlyBias: (merged.dumpEarlyBias ?? 0) + (sub.dumpEarlyBias ?? 0),
      resetFirstStallBias: (merged.resetFirstStallBias ?? 0) + (sub.resetFirstStallBias ?? 0),
      preferDumpRole: Boolean(merged.preferDumpRole) || Boolean(sub.preferDumpRole),
    }
  }

  return merged
}

/** Opis bieżącego bieguna suwaka (do UI). */
export function coachSliderPoleDescription(key, value, lang = 'pl') {
  const meta = COACH_DIRECTIVE_META[key]
  if (!meta) return ''
  const v = clampSlider(value)
  const en = lang === 'en'
  if (Math.abs(v) < 0.15) {
    return en
      ? `${meta.centerEn ?? meta.center}: no extra bias.`
      : `${meta.center}: bez dodatkowego biasu.`
  }
  if (v < 0) return en ? meta.descriptionLeftEn ?? meta.descriptionLeft : meta.descriptionLeft
  return en ? meta.descriptionRightEn ?? meta.descriptionRight : meta.descriptionRight
}

export function coachDirectivePoleWord(key, value, lang = 'pl') {
  const meta = COACH_DIRECTIVE_META[key]
  if (!meta) return null
  const v = Number(value)
  if (!Number.isFinite(v) || Math.abs(v) < 0.15) return null
  if (lang === 'en') return v < 0 ? meta.leftEn ?? meta.left : meta.rightEn ?? meta.right
  return v < 0 ? meta.left : meta.right
}
