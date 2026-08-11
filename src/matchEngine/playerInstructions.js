/**
 * Indywidualne instrukcje trenera dla zawodnika (tagi, bez limitu liczby).
 * Osobny zestaw dla O-Line i D-Line (tactics.oLinePlayerInstructions / dLinePlayerInstructions).
 * Nakładane na trait + coachDirectives z własnym compliance.
 */

import { getPlayerTraits } from '../models/playerTraits.js'
import { getSubStat, normalizePlayerSkills } from '../models/playerStats.js'
import { resolveLineRole } from './tacticsModifiers.js'

/** @typedef {'offense'|'defense'} InstructionSide */

/**
 * @typedef {object} PlayerInstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {InstructionSide} side
 * @property {string} group
 */

/** @type {Record<string, PlayerInstructionDef>} */
export const PLAYER_INSTRUCTION_DEFS = {
  // ── Rzut ──
  throw_hucks: {
    id: 'throw_hucks',
    label: 'Rzucaj hucki',
    labelEn: 'Throw hucks',
    description: 'Szukaj deep przy dobrej separacji — nie forsuj contested.',
    descriptionEn: 'Look deep with good separation — do not force contested looks.',
    side: 'offense',
    group: 'throw',
  },
  no_hucks: {
    id: 'no_hucks',
    label: 'Nie rzucaj hucków',
    labelEn: 'No hucks',
    description: 'Unikaj deep — preferuj dump i swing.',
    descriptionEn: 'Avoid deep — prefer dumps and swings.',
    side: 'offense',
    group: 'throw',
  },
  break_mark: {
    id: 'break_mark',
    label: 'Przełamuj mark',
    labelEn: 'Break the mark',
    description: 'Aktywnie szukaj break-side / IO.',
    descriptionEn: 'Actively look for break-side / IO.',
    side: 'offense',
    group: 'throw',
  },
  no_break_mark: {
    id: 'no_break_mark',
    label: 'Nie przełamuj marka',
    labelEn: "Don't break the mark",
    description:
      'Wyższy wymagany zapas separacji na break side — preferuj open side / bezpieczny dump.',
    descriptionEn:
      'Higher required separation on break-side looks — prefer the open side / a safe dump.',
    side: 'offense',
    group: 'throw',
  },
  dump_first: {
    id: 'dump_first',
    label: 'Najpierw reset',
    labelEn: 'Dump first',
    description: 'Wcześniej szukaj dumpa / bezpiecznego resetu.',
    descriptionEn: 'Look earlier for a dump / safe reset.',
    side: 'offense',
    group: 'throw',
  },
  look_downfield: {
    id: 'look_downfield',
    label: 'Patrz w pole',
    labelEn: 'Look downfield',
    description: 'Najpierw szukaj zysku terenu — dump dopiero gdy nic innego nie ma.',
    descriptionEn: 'Look for downfield yardage first — dump only once nothing else is there.',
    side: 'offense',
    group: 'throw',
  },
  // ── Cut ──
  cut_deep: {
    id: 'cut_deep',
    label: 'Biegaj na hucki',
    labelEn: 'Cut deep',
    description: 'Częściej deep cuty i kontynuacje w głąb pola.',
    descriptionEn: 'More deep cuts and continuations downfield.',
    side: 'offense',
    group: 'cut',
  },
  cut_under: {
    id: 'cut_under',
    label: 'Biegaj under',
    labelEn: 'Cut under',
    description: 'Częściej under do dysku, rzadziej deep.',
    descriptionEn: 'More under cuts to the disc, fewer deeps.',
    side: 'offense',
    group: 'cut',
  },
  // ── Obrona ──
  tight_mark: {
    id: 'tight_mark',
    label: 'Kryj blisko',
    labelEn: 'Tight mark',
    description: 'Mniejszy cushion — twardy person mark.',
    descriptionEn: 'Smaller cushion — hard person mark.',
    side: 'defense',
    group: 'defense',
  },
  loose_mark: {
    id: 'loose_mark',
    label: 'Kryj luźno',
    labelEn: 'Loose mark',
    description: 'Większy cushion — lekki bonus do pomocy w głębi.',
    descriptionEn: 'Bigger cushion — small bonus to help deep.',
    side: 'defense',
    group: 'defense',
  },
  poach: {
    id: 'poach',
    label: 'Poachuj',
    labelEn: 'Poach',
    description: 'Częściej zostawiaj człowieka i wchodź w lane.',
    descriptionEn: 'Leave your person more often and jump into lanes.',
    side: 'defense',
    group: 'defense',
  },
  no_poach: {
    id: 'no_poach',
    label: 'Nie poachuj',
    labelEn: 'No poaching',
    description: 'Trzymaj swojego człowieka — bez lane poach.',
    descriptionEn: 'Stick with your person — no lane poaches.',
    side: 'defense',
    group: 'defense',
  },
  shade_deep: {
    id: 'shade_deep',
    label: 'Kryj deep',
    labelEn: 'Shade deep',
    description: 'Shade deep / help deep — under mniej pilnowany.',
    descriptionEn: 'Shade / help deep — under less tightly guarded.',
    side: 'defense',
    group: 'defense',
  },
  shade_under: {
    id: 'shade_under',
    label: 'Kryj under',
    labelEn: 'Shade under',
    description: 'Shade / help under — deep mniej pilnowany.',
    descriptionEn: 'Shade / help under — deep less tightly guarded.',
    side: 'defense',
    group: 'defense',
  },
  // ── Rola ──
  dominate: {
    id: 'dominate',
    label: 'Dominuj grę',
    labelEn: 'Dominate play',
    description: 'Chce dysk i decyzje — wyższy priorytet cutów / skanu.',
    descriptionEn: 'Want the disc and decisions — higher cut / scan priority.',
    side: 'both',
    group: 'role',
  },
  give_space: {
    id: 'give_space',
    label: 'Zostaw przestrzeń innym',
    labelEn: 'Give space to others',
    description: 'Oddaj lane — mniej cutów, więcej clearingu.',
    descriptionEn: 'Yield the lane — fewer cuts, more clearing.',
    side: 'offense',
    group: 'role',
  },
  play_fast: {
    id: 'play_fast',
    label: 'Graj szybko',
    labelEn: 'Play fast',
    description: 'Szybszy release i wcześniejsze wyjścia — wyższe tempo.',
    descriptionEn: 'Faster release and earlier looks — higher tempo.',
    side: 'offense',
    group: 'role',
  },
  play_slow: {
    id: 'play_slow',
    label: 'Graj wolno',
    labelEn: 'Play slow',
    description: 'Dłuższy release gate, więcej cierpliwości — niższe tempo.',
    descriptionEn: 'Longer release gate, more patience — lower tempo.',
    side: 'offense',
    group: 'role',
  },
  take_space: {
    id: 'take_space',
    label: 'Bierz przestrzeń',
    labelEn: 'Take the space',
    description: 'Częściej inicjuje cuty.',
    descriptionEn: 'Initiates cuts more often.',
    side: 'offense',
    group: 'role',
  },
  wait_your_turn: {
    id: 'wait_your_turn',
    label: 'Czekaj na swoją kolej',
    labelEn: 'Wait for your turn',
    description: 'Rzadziej inicjuje cuty — oddaje pierwszeństwo innym.',
    descriptionEn: 'Initiates cuts less often — yields priority to others.',
    side: 'offense',
    group: 'role',
  },
}

/** Pary wzajemnie wykluczające się. */
export const PLAYER_INSTRUCTION_CONFLICTS = [
  ['throw_hucks', 'no_hucks'],
  ['break_mark', 'no_break_mark'],
  ['dump_first', 'look_downfield'],
  ['cut_deep', 'cut_under'],
  ['tight_mark', 'loose_mark'],
  ['poach', 'no_poach'],
  ['shade_deep', 'shade_under'],
  ['dominate', 'give_space'],
  ['play_fast', 'play_slow'],
  ['take_space', 'wait_your_turn'],
]

export const PLAYER_INSTRUCTION_IDS = Object.keys(PLAYER_INSTRUCTION_DEFS)

export function playerInstructionDef(id) {
  return PLAYER_INSTRUCTION_DEFS[id] ?? null
}

export function playerInstructionLabel(id, lang = 'pl') {
  const def = PLAYER_INSTRUCTION_DEFS[id]
  if (!def) return id
  if (lang === 'en') return def.labelEn ?? def.label ?? id
  return def.label ?? def.labelEn ?? id
}

function conflictPartner(id) {
  for (const [a, b] of PLAYER_INSTRUCTION_CONFLICTS) {
    if (a === id) return b
    if (b === id) return a
  }
  return null
}

/**
 * Normalizacja listy tagów: unikalne, znane ID, bez konfliktów (bez limitu liczby).
 * @param {string[]|null|undefined} ids
 */
export function normalizeInstructionList(ids) {
  if (!Array.isArray(ids)) return []
  const out = []
  const seen = new Set()
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw : null
    if (!id || !PLAYER_INSTRUCTION_DEFS[id] || seen.has(id)) continue
    const partner = conflictPartner(id)
    if (partner && seen.has(partner)) {
      // nowszy wygrywa — usuń partnera
      const idx = out.indexOf(partner)
      if (idx >= 0) {
        out.splice(idx, 1)
        seen.delete(partner)
      }
    }
    out.push(id)
    seen.add(id)
  }
  return out
}

/**
 * @param {Record<string|number, string[]>|null|undefined} map
 */
export function normalizePlayerInstructionsMap(map) {
  if (!map || typeof map !== 'object') return {}
  const out = {}
  for (const [key, ids] of Object.entries(map)) {
    const list = normalizeInstructionList(ids)
    if (list.length) out[String(key)] = list
  }
  return out
}

/**
 * Znormalizowane mapy instrukcji dla O-Line i D-Line + legacy alias.
 * Legacy `tactics.playerInstructions` (płaska mapa) zasila O-Line, jeśli
 * `oLinePlayerInstructions` jeszcze nie istnieje — zgodnie z tym samym wzorcem
 * co `normalizeLineCoachDirectives` w coachDirectives.js.
 * @param {object|null|undefined} tactics
 */
export function normalizeLinePlayerInstructions(tactics) {
  const legacy = tactics?.playerInstructions

  const oLinePlayerInstructions = normalizePlayerInstructionsMap(
    tactics?.oLinePlayerInstructions ?? legacy,
  )
  const dLinePlayerInstructions = normalizePlayerInstructionsMap(
    tactics?.dLinePlayerInstructions,
  )

  return {
    oLinePlayerInstructions,
    dLinePlayerInstructions,
    /** @deprecated alias = O-Line */
    playerInstructions: oLinePlayerInstructions,
  }
}

/**
 * Instrukcje zawodnika dla danej linii (jawny lineRole albo _pointStartRole runtime).
 * @param {object|null|undefined} tactics
 * @param {string|number|null|undefined} playerId
 * @param {'offense'|'defense'|null} [lineRole]
 */
export function instructionsForPlayer(tactics, playerId, lineRole = null) {
  if (playerId == null) return []
  const role = resolveLineRole(tactics, lineRole)
  const { oLinePlayerInstructions, dLinePlayerInstructions } =
    normalizeLinePlayerInstructions(tactics)
  const map = role === 'defense' ? dLinePlayerInstructions : oLinePlayerInstructions
  return map[String(playerId)] ?? []
}

/**
 * Toggle tagu z respektowaniem konfliktów.
 * @returns {string[]}
 */
export function togglePlayerInstruction(currentIds, instructionId) {
  const id = instructionId
  if (!PLAYER_INSTRUCTION_DEFS[id]) {
    return normalizeInstructionList(currentIds)
  }
  const cur = normalizeInstructionList(currentIds)
  if (cur.includes(id)) {
    return cur.filter((x) => x !== id)
  }
  const partner = conflictPartner(id)
  const next = partner ? cur.filter((x) => x !== partner) : [...cur]
  next.push(id)
  return normalizeInstructionList(next)
}

/**
 * Zwraca nową mapę taktyki po toggle, dla danej linii (O-Line / D-Line).
 * @param {'offense'|'defense'|null} [lineRole]
 */
export function toggleInstructionInTactics(tactics, playerId, instructionId, lineRole = null) {
  const role = resolveLineRole(tactics, lineRole)
  const key = role === 'defense' ? 'dLinePlayerInstructions' : 'oLinePlayerInstructions'
  const pid = String(playerId)
  const { oLinePlayerInstructions, dLinePlayerInstructions } =
    normalizeLinePlayerInstructions(tactics)
  const map = { ...(role === 'defense' ? dLinePlayerInstructions : oLinePlayerInstructions) }
  const nextList = togglePlayerInstruction(map[pid] ?? [], instructionId)
  if (nextList.length) map[pid] = nextList
  else delete map[pid]

  return {
    ...tactics,
    oLinePlayerInstructions: role === 'defense' ? oLinePlayerInstructions : map,
    dLinePlayerInstructions: role === 'defense' ? map : dLinePlayerInstructions,
    [key]: map,
  }
}

/**
 * Compliance dla instrukcji osobistych — wyższy floor niż drużynowe.
 * @param {object} player
 * @param {'offense'|'defense'} role
 * @param {string} [instructionId]
 */
export function instructionCompliance(player, role = 'offense', instructionId = null) {
  const skills = normalizePlayerSkills(player?.skills ?? player)
  const systems =
    role === 'defense'
      ? getSubStat(skills, 'defensive', 'defensiveSystemsKnowledge')
      : getSubStat(skills, 'offensive', 'offensiveSystemsKnowledge')
  const t = Math.max(0, Math.min(1, (systems ?? 50) / 100))
  let compliance = 0.25 + (0.85 - 0.25) * t

  const traits = new Set(getPlayerTraits(player))
  if (traits.has('professional')) compliance += 0.08
  if (traits.has('composed')) compliance += 0.04
  if (traits.has('determined')) compliance += 0.03
  if (traits.has('disciplined')) compliance += 0.1
  if (traits.has('adaptive')) compliance += 0.04
  if (traits.has('smart')) compliance += 0.03
  if (traits.has('hot_headed')) compliance -= 0.1
  if (traits.has('fragile_ego')) compliance -= 0.06
  if (traits.has('wants_the_disc')) compliance -= 0.06
  if (traits.has('turnover_prone')) compliance -= 0.05

  if (instructionId === 'throw_hucks' || instructionId === 'no_hucks') {
    if (traits.has('huck_lover')) compliance -= 0.12
    if (traits.has('dump_guy')) compliance -= 0.1
    if (traits.has('safe_hands')) compliance -= 0.06
  }

  // Rozkaz osobisty — trudniej zignorować
  return Math.max(0.35, Math.min(0.95, compliance + 0.08))
}

/**
 * Surowe mody z listy tagów (przed compliance).
 * @param {string[]} ids
 */
export function rawInstructionMods(ids) {
  const mods = {
    huckWeightMult: 1,
    dumpWeightMult: 1,
    ottWeightMult: 1,
    standardWeightMult: 1,
    breakSideOptionBonus: 0,
    breakSideWeightMult: 1,
    breakSideSepReqDeltaM: 0,
    acceptanceThresholdDelta: 0,
    decisionNoiseMult: 1,
    scanRadiusBonusM: 0,
    perceivedOptionsBonus: 0,
    cutRollMult: 1,
    cutPriorityDelta: 0,
    deepCutBias: 0,
    underCutBias: 0,
    clearActiveCutMult: 1,
    clearLaneExtraM: 0,
    cushionDeltaM: 0,
    denyUnderBias: 0,
    helpDeepBias: 0,
    poachChanceMult: 1,
    releaseGateMult: 1,
    dumpEarlyBias: 0,
    huckAcceptanceDelta: 0,
    heroThrowWeightMult: 1,
    resetFirstStallBias: 0,
    primaryHandlerBias: 0,
    throwerPickWeightMult: 1,
  }

  for (const id of normalizeInstructionList(ids)) {
    switch (id) {
      case 'cut_deep':
        mods.deepCutBias += 0.55
        mods.underCutBias -= 0.15
        mods.cutRollMult *= 1.12
        break
      case 'cut_under':
        mods.underCutBias += 0.55
        mods.deepCutBias -= 0.2
        break
      case 'throw_hucks':
        // Premia tylko przy czystej sep (egzekwowane w throwerBrain) — tu same wagi.
        mods.huckWeightMult *= 1.65
        mods.huckAcceptanceDelta += 0.18
        mods.heroThrowWeightMult *= 1.2
        mods.dumpWeightMult *= 0.85
        break
      case 'no_hucks':
        mods.huckWeightMult *= 0.35
        mods.dumpWeightMult *= 1.35
        mods.huckAcceptanceDelta -= 0.2
        mods.heroThrowWeightMult *= 0.7
        break
      case 'break_mark':
        mods.breakSideOptionBonus += 0.28
        mods.breakSideWeightMult *= 1.45
        break
      case 'no_break_mark':
        mods.breakSideOptionBonus -= 0.3
        mods.breakSideWeightMult *= 0.6
        mods.breakSideSepReqDeltaM += 1.4
        mods.dumpWeightMult *= 1.15
        mods.standardWeightMult *= 1.1
        break
      case 'dump_first':
        mods.dumpWeightMult *= 1.45
        mods.dumpEarlyBias += 0.25
        mods.resetFirstStallBias += 2.5
        mods.huckWeightMult *= 0.8
        break
      case 'look_downfield':
        mods.dumpWeightMult *= 0.7
        mods.standardWeightMult *= 1.25
        mods.huckWeightMult *= 1.15
        mods.resetFirstStallBias -= 2
        mods.dumpEarlyBias -= 0.2
        break
      case 'tight_mark':
        mods.cushionDeltaM -= 0.55
        mods.denyUnderBias += 0.15
        break
      case 'loose_mark':
        mods.cushionDeltaM += 0.5
        mods.denyUnderBias -= 0.15
        mods.helpDeepBias += 0.15
        break
      case 'poach':
        mods.poachChanceMult *= 1.75
        break
      case 'no_poach':
        mods.poachChanceMult *= 0.25
        break
      case 'shade_deep':
        mods.cushionDeltaM += 0.45
        mods.helpDeepBias += 0.4
        mods.denyUnderBias -= 0.25
        break
      case 'shade_under':
        mods.cushionDeltaM -= 0.4
        mods.denyUnderBias += 0.3
        mods.helpDeepBias -= 0.3
        break
      case 'dominate':
        // Rebalans: −8 progu akceptacji generowało niewspółmiernie dużo strat
        // nawet u dobrych zawodników — złagodzone do −4, reszta lekko przycięta.
        mods.acceptanceThresholdDelta -= 4
        mods.scanRadiusBonusM += 3
        mods.perceivedOptionsBonus += 1
        mods.cutRollMult *= 1.18
        mods.cutPriorityDelta -= 6
        mods.throwerPickWeightMult *= 1.3
        break
      case 'give_space':
        mods.cutRollMult *= 0.55
        mods.cutPriorityDelta += 14
        mods.clearActiveCutMult *= 1.2
        mods.clearLaneExtraM += 2
        break
      case 'play_fast':
        mods.releaseGateMult *= 0.8
        mods.dumpEarlyBias += 0.15
        mods.cutRollMult *= 1.1
        break
      case 'play_slow':
        mods.releaseGateMult *= 1.25
        mods.dumpEarlyBias -= 0.1
        mods.acceptanceThresholdDelta += 4
        mods.cutRollMult *= 0.9
        break
      case 'take_space':
        mods.cutRollMult *= 1.2
        mods.cutPriorityDelta -= 5
        break
      case 'wait_your_turn':
        mods.cutRollMult *= 0.65
        mods.cutPriorityDelta += 10
        mods.clearActiveCutMult *= 1.15
        break
      default:
        break
    }
  }

  return mods
}

/**
 * Mody instrukcji z compliance (skalowanie addytywnych / blend mnożników).
 * @param {string[]} ids
 * @param {object} player
 * @param {'offense'|'defense'} role
 */
export function instructionModsForPlayer(ids, player, role = 'offense') {
  const list = normalizeInstructionList(ids)
  if (!list.length) {
    return rawInstructionMods([])
  }
  // Średnie compliance po tagach (lekko)
  let complianceSum = 0
  for (const id of list) {
    complianceSum += instructionCompliance(player, role, id)
  }
  const c = complianceSum / list.length
  const raw = rawInstructionMods(list)

  const scaleMult = (m) => 1 + (m - 1) * c
  const scaleAdd = (v) => v * c

  return {
    huckWeightMult: scaleMult(raw.huckWeightMult),
    dumpWeightMult: scaleMult(raw.dumpWeightMult),
    ottWeightMult: scaleMult(raw.ottWeightMult),
    standardWeightMult: scaleMult(raw.standardWeightMult),
    breakSideOptionBonus: scaleAdd(raw.breakSideOptionBonus),
    breakSideWeightMult: scaleMult(raw.breakSideWeightMult),
    breakSideSepReqDeltaM: scaleAdd(raw.breakSideSepReqDeltaM),
    acceptanceThresholdDelta: scaleAdd(raw.acceptanceThresholdDelta),
    decisionNoiseMult: scaleMult(raw.decisionNoiseMult),
    scanRadiusBonusM: scaleAdd(raw.scanRadiusBonusM),
    perceivedOptionsBonus: Math.round(scaleAdd(raw.perceivedOptionsBonus)),
    cutRollMult: scaleMult(raw.cutRollMult),
    cutPriorityDelta: scaleAdd(raw.cutPriorityDelta),
    deepCutBias: scaleAdd(raw.deepCutBias),
    underCutBias: scaleAdd(raw.underCutBias),
    clearActiveCutMult: scaleMult(raw.clearActiveCutMult),
    clearLaneExtraM: scaleAdd(raw.clearLaneExtraM),
    cushionDeltaM: scaleAdd(raw.cushionDeltaM),
    denyUnderBias: scaleAdd(raw.denyUnderBias),
    helpDeepBias: scaleAdd(raw.helpDeepBias),
    poachChanceMult: scaleMult(raw.poachChanceMult),
    releaseGateMult: scaleMult(raw.releaseGateMult),
    dumpEarlyBias: scaleAdd(raw.dumpEarlyBias),
    huckAcceptanceDelta: scaleAdd(raw.huckAcceptanceDelta),
    heroThrowWeightMult: scaleMult(raw.heroThrowWeightMult),
    resetFirstStallBias: scaleAdd(raw.resetFirstStallBias),
    primaryHandlerBias: scaleAdd(raw.primaryHandlerBias),
    throwerPickWeightMult: scaleMult(raw.throwerPickWeightMult),
  }
}

export function instructionBadges(ids, maxShow = 2, lang = 'pl') {
  const list = normalizeInstructionList(ids)
  return list.slice(0, maxShow).map((id) => ({
    id,
    label: playerInstructionLabel(id, lang),
    short: shortLabel(id),
  }))
}

function shortLabel(id) {
  const map = {
    throw_hucks: 'Huck+',
    no_hucks: 'Huck−',
    break_mark: 'Break',
    no_break_mark: 'NoBrk',
    dump_first: 'Dump',
    look_downfield: 'Field',
    cut_deep: 'Deep',
    cut_under: 'Under',
    tight_mark: 'Tight',
    loose_mark: 'Loose',
    poach: 'Poach',
    no_poach: 'NoP',
    shade_deep: 'ShDeep',
    shade_under: 'ShUnd',
    dominate: 'Dom',
    give_space: 'Space',
    play_fast: 'Fast',
    play_slow: 'Slow',
    take_space: 'Take',
    wait_your_turn: 'Wait',
  }
  return map[id] ?? id.slice(0, 4)
}
