/**
 * Budowa taktyk AI: styl drużyny + najlepsza siódemka O/D z uwzględnieniem staminy.
 */

import { MATCH_CONFIG } from './config.js'
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
  defaultTacticsForPlayers,
} from './tacticsModifiers.js'
import { normalizeTactics } from './lineups.js'
import {
  autoSubLineups,
  normalizeAutoSubMode,
  scorePlayerForOffense,
  scorePlayerForDefense,
  offenseDefaultScore,
  defenseDefaultScore,
  OWN_LINE_STAMINA_MIN,
} from './autoSub.js'
import {
  getCategoryOverall,
  getSubStat,
  normalizePlayerSkills,
  readLegacySkill,
} from '../models/playerStats.js'
import { teamTacticalIdentity } from '../data/teamTacticalIdentities.js'
import {
  applyAiCoachProfileToIdentity,
  resolveTeamAiCoachProfile,
} from './aiCoachProfile.js'
import { buildSkillBasedAiInstructions } from './aiTacticsAdapt.js'
import {
  defaultSubRoleForSlot,
  normalizePlayerSubRolesMap,
} from './playerSubRoles.js'
import { offenseLineSlotsForAttackStyle } from './offenseLineSlots.js'
import { isPlayerAvailable } from '../models/playerInjury.js'
import { padLine } from './lineups.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

/**
 * Próg auto-substytucji na WŁASNEJ linii — alias na OWN_LINE_STAMINA_MIN z autoSub.js,
 * gdzie mieszka cała polityka zmian (drużyna gracza i AI idą tym samym kodem).
 */
export const AUTO_SUB_STAMINA_MIN = OWN_LINE_STAMINA_MIN

function fillLineFromCandidates(candidates, size = LINE_SIZE) {
  const line = []
  const used = new Set()
  for (const p of candidates) {
    if (line.length >= size) break
    if (!p || used.has(p.id)) continue
    used.add(p.id)
    line.push(p.id)
  }
  while (line.length < size) line.push(null)
  return line.slice(0, size)
}

// Miary zawodnika (skill × stamina × morale) mieszkają w autoSub.js razem z polityką
// zmian — tu tylko re-eksport, żeby stare importy z aiLineup.js dalej działały.
export { scorePlayerForOffense, scorePlayerForDefense }

function offenseSkillScore(player) {
  const skills = normalizePlayerSkills(player.skills ?? {})
  return (
    getCategoryOverall(skills, 'throwing') * 0.32 +
    getCategoryOverall(skills, 'offensive') * 0.38 +
    getCategoryOverall(skills, 'mental') * 0.15 +
    getCategoryOverall(skills, 'physical') * 0.15
  )
}

function defenseSkillScore(player) {
  const skills = normalizePlayerSkills(player.skills ?? {})
  return (
    getCategoryOverall(skills, 'defensive') * 0.45 +
    getCategoryOverall(skills, 'physical') * 0.3 +
    getCategoryOverall(skills, 'mental') * 0.15 +
    readLegacySkill(skills, 'speed') * 0.1
  )
}

/**
 * Ranking "kogo trener CHCE grać" — czyste umiejętności + morale, BEZ bieżącej
 * staminy. To jest domyślna siódemka O/D; stamina decyduje tylko o tym, czy dany
 * zawodnik z tej siódemki jest w danym momencie zdolny zagrać (patrz pickDefaultLine).
 */
// offenseDefaultScore / defenseDefaultScore: patrz import z autoSub.js

function topBySkill(pool, scoreFn, n = LINE_SIZE) {
  // Ocena jest stała w obrębie sortowania. Stabilny sort zachowuje kolejność remisów.
  return pool.map(player => ({ player, score: scoreFn(player) }))
    .sort((a, b) => b.score - a.score).slice(0, n).map(entry => entry.player)
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function weightedFit(skills, entries) {
  let total = 0
  let wsum = 0
  for (const [category, key, w] of entries) {
    const val = key ? getSubStat(skills, category, key) : getCategoryOverall(skills, category)
    total += val * w
    wsum += w
  }
  return wsum > 0 ? total / wsum : 50
}

/** Wyraźny lider 1v1 w puli → wyższe dopasowanie do stylów iso (side/split stack). */
function starGapScore(pool, scoreFn) {
  if (pool.length < 2) return 55
  const sorted = topBySkill(pool, scoreFn, 2)
  const gap = scoreFn(sorted[0]) - scoreFn(sorted[1])
  return clampNum(50 + gap * 2.5, 0, 100)
}

const STAR_GAP = 'star_gap'

/** Profile wymagań per styl ataku — [kategoria, substat|null, waga]; STAR_GAP = wymaga wyraźnego 1v1 lidera. */
const ATTACK_STYLE_FIT_ENTRIES = {
  [ATTACK_STYLES.VERTICAL_STACK]: [
    ['throwing', null, 0.4],
    ['offensive', 'cutterMovement', 0.3],
    ['offensive', 'offensiveSystemsKnowledge', 0.3],
  ],
  [ATTACK_STYLES.HORIZONTAL_STACK]: [
    ['offensive', 'handlerMovement', 0.4],
    ['mental', 'vision', 0.3],
    ['throwing', null, 0.3],
  ],
  [ATTACK_STYLES.SPLIT_STACK]: STAR_GAP,
  [ATTACK_STYLES.SIDE_STACK]: STAR_GAP,
  [ATTACK_STYLES.MOTION_OFFENSE]: [
    ['offensive', 'offensiveSystemsKnowledge', 0.4],
    ['mental', 'decisionMaking', 0.3],
    ['offensive', 'catching', 0.3],
  ],
  [ATTACK_STYLES.HEX_OFFENSE]: [
    ['offensive', 'offensiveSystemsKnowledge', 0.4],
    ['mental', 'decisionMaking', 0.3],
    ['offensive', 'catching', 0.3],
  ],
  [ATTACK_STYLES.ZONE_OFFENSE]: [
    ['mental', 'vision', 0.35],
    ['offensive', 'handlerMovement', 0.35],
    ['throwing', null, 0.3],
  ],
}

/** Profile wymagań per styl obrony — patrz ATTACK_STYLE_FIT_ENTRIES. */
const DEFENSE_STYLE_FIT_ENTRIES = {
  [DEFENSE_STYLES.PERSON]: [
    ['defensive', 'defensiveCutterMovement', 0.4],
    ['physical', 'speed', 0.3],
    ['defensive', 'defensiveHandlerMovement', 0.3],
  ],
  [DEFENSE_STYLES.ALL_PERSON]: [
    ['defensive', 'defensiveHandlerMovement', 0.35],
    ['defensive', 'blocking', 0.35],
    ['mental', 'reactions', 0.3],
  ],
  [DEFENSE_STYLES.CLAM]: [
    ['defensive', 'defensiveSystemsKnowledge', 0.4],
    ['mental', 'decisionMaking', 0.3],
    ['defensive', 'blocking', 0.3],
  ],
  [DEFENSE_STYLES.ZONE_CUP]: [
    ['defensive', 'defensiveSystemsKnowledge', 0.5],
    ['mental', 'decisionMaking', 0.3],
    ['physical', 'endurance', 0.2],
  ],
  [DEFENSE_STYLES.ZONE_WALL]: [
    ['defensive', 'defensiveSystemsKnowledge', 0.5],
    ['mental', 'decisionMaking', 0.3],
    ['physical', 'endurance', 0.2],
  ],
}

function styleFitScore(pool, spec, starScoreFn) {
  if (!pool.length) return 50
  if (spec === STAR_GAP) return starGapScore(pool, starScoreFn)
  if (!spec) return 55
  const scores = pool.map((p) => weightedFit(normalizePlayerSkills(p.skills ?? {}), spec))
  return scores.reduce((sum, v) => sum + v, 0) / scores.length
}

function computeAttackStyleFits(pool) {
  const fits = {}
  for (const style of Object.values(ATTACK_STYLES)) {
    fits[style] = styleFitScore(pool, ATTACK_STYLE_FIT_ENTRIES[style], offenseSkillScore)
  }
  return fits
}

function computeDefenseStyleFits(pool) {
  const fits = {}
  for (const style of Object.values(DEFENSE_STYLES)) {
    fits[style] = styleFitScore(pool, DEFENSE_STYLE_FIT_ENTRIES[style], defenseSkillScore)
  }
  return fits
}

/**
 * Jak dobrze roster pasuje do każdego stylu — 0-100 per styl, osobno dla puli O-line
 * (top 7 wg czystego skilla ofensywnego) i D-line (top 7 wg skilla defensywnego), bo to
 * inni zawodnicy z inną siłą w innych aspektach gry. Używane przez pickStyleForSlot
 * w aiCoachProfile.js do korekty preferencji archetypu pod realny skład.
 */
function computeStyleFitForTeam(team) {
  const pool = availablePlayers(team?.players ?? [])
  const roster = pool.length ? pool : team?.players ?? []
  if (!roster.length) return null
  const oPool = topBySkill(roster, offenseDefaultScore)
  const dPool = topBySkill(roster, defenseDefaultScore)
  return {
    oLineAttack: computeAttackStyleFits(oPool),
    oLineDefense: computeDefenseStyleFits(oPool),
    dLineAttack: computeAttackStyleFits(dPool),
    dLineDefense: computeDefenseStyleFits(dPool),
  }
}

/**
 * Tożsamość ligowa + ukryty profil trenera AI (jeśli drużyna nie jest gracza).
 * `aiCoachProfile === null` = drużyna gracza — bez archetypu.
 */
export function resolveAiTeamIdentity(team, { lossStreak = 0 } = {}) {
  const base = teamTacticalIdentity(team?.id, team?.tacticalIdentity ?? null)
  if (team?.aiCoachProfile === null) return base
  const styleFit = computeStyleFitForTeam(team)
  return applyAiCoachProfileToIdentity(base, resolveTeamAiCoachProfile(team), {
    styleFit,
    lossStreak,
    teamId: team?.id ?? null,
  })
}

/**
 * Rozkazy meczowe AI wg skilli + stylu trenera.
 */
export function suggestAiPlayerInstructions(identity, oSorted, dSorted, players = null) {
  const roster =
    players ??
    [...new Map([...(oSorted ?? []), ...(dSorted ?? [])].map((p) => [p.id, p])).values()]
  return buildSkillBasedAiInstructions(roster, identity, oSorted, dSorted)
}

/**
 * Domyślne podrole AI wg slotów formacji O-Line (atak).
 */
export function suggestAiPlayerSubRoles(oLineIds, attackStyle) {
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  const map = {}
  for (let i = 0; i < slots.length; i += 1) {
    const pid = oLineIds?.[i]
    if (pid == null) continue
    const slot = slots[i]
    map[String(pid)] =
      slot.defaultSubRole ?? defaultSubRoleForSlot(slot.role, slot.roleIndex)
  }
  return normalizePlayerSubRolesMap(map)
}

/**
 * Taktyka startowa dla drużyny — styl z identity + najlepsze linie skill-based.
 * @param {object} team
 * @param {object} [options]
 * @param {Record<number, number>|null} [options.staminaMap]
 * @param {boolean} [options.withPlayerInstructions=true]
 */
function availablePlayers(players) {
  return (players ?? []).filter((p) => isPlayerAvailable(p))
}

export function tacticsForTeam(team, options = {}) {
  if (!team?.players?.length) {
    return defaultTacticsForPlayers([])
  }

  const identity = resolveAiTeamIdentity(team, { lossStreak: options.lossStreak ?? 0 })
  const staminaMap = options.staminaMap ?? null
  const withInstr = options.withPlayerInstructions !== false
  const pool = availablePlayers(team.players)
  const roster = pool.length ? pool : team.players

  const oSorted = [...roster].sort(
    (a, b) => scorePlayerForOffense(b, staminaMap) - scorePlayerForOffense(a, staminaMap),
  )
  const dSorted = [...roster].sort(
    (a, b) => scorePlayerForDefense(b, staminaMap) - scorePlayerForDefense(a, staminaMap),
  )

  // O-Line i D-Line mają być OSOBNYMI jednostkami: D dobierana z tych, którzy nie
  // weszli do O. Inaczej najlepszy zawodnik lądował w obu siódemkach i grał każdy punkt,
  // a progi staminy w autoSub.js nie miały czego pilnować. Przy rosterze < 2 × 7 luka
  // domykana jest najlepszymi mimo powtórzenia — lepsze niż pusty slot.
  const oLine = fillLineFromCandidates(oSorted)
  const oTaken = new Set(oLine.filter((id) => id != null))
  const dLine = fillLineFromCandidates([
    ...dSorted.filter((p) => !oTaken.has(p.id)),
    ...dSorted.filter((p) => oTaken.has(p.id)),
  ])
  const attackStyle =
    identity.oLineAttackStyle ?? identity.attackStyle ?? ATTACK_STYLES.VERTICAL_STACK
  const aiInstr = withInstr
    ? suggestAiPlayerInstructions(identity, oSorted, dSorted, roster)
    : { offense: {}, defense: {} }

  return normalizeTactics({
    oLineAttackStyle: attackStyle,
    oLineDefenseStyle: identity.oLineDefenseStyle ?? identity.defenseStyle ?? DEFENSE_STYLES.PERSON,
    dLineAttackStyle: identity.dLineAttackStyle ?? identity.attackStyle ?? ATTACK_STYLES.VERTICAL_STACK,
    dLineDefenseStyle: identity.dLineDefenseStyle ?? identity.defenseStyle ?? DEFENSE_STYLES.PERSON,
    oLineCoachDirectives: identity.oLineCoachDirectives ?? identity.coachDirectives,
    dLineCoachDirectives: identity.dLineCoachDirectives ?? identity.coachDirectives,
    coachDirectives: identity.oLineCoachDirectives ?? identity.coachDirectives,
    forceSide: identity.forceSide ?? FORCE_SIDES.FORCE_FOREHAND,
    tacticsFamiliarity: team.teamTraining?.tacticsFamiliarity ?? team.tacticsFamiliarity ?? 38,
    oLinePlayerInstructions: aiInstr.offense,
    dLinePlayerInstructions: aiInstr.defense,
    playerSubRoles: suggestAiPlayerSubRoles(oLine, attackStyle),
    autoSubMode: normalizeAutoSubMode(identity.autoSubMode),
    lineupWhenOffenseStartPlayerIds: oLine,
    lineupWhenDefenseStartPlayerIds: dLine,
  })
}

/**
 * AI między punktami: styl drużyny zostaje, siódemki idą przez WSPÓLNY mechanizm zmian
 * (autoSubLineups) — ten sam, którym jedzie drużyna gracza. Różnica jest tylko taka, że
 * AI dodatkowo odświeża sobie podrole i rozkazy indywidualne.
 *
 * Tryb zmian bierze z profilu trenera (identity.autoSubMode); jawny `options.mode`
 * wygrywa, jeśli podany.
 */
export function autoRotateTacticsForTeam(team, staminaMap, rng = null, options = {}) {
  void rng // zachowany w sygnaturze dla kompatybilności wywołań; nie steruje już losową rotacją.
  const identity = options.identity ?? resolveAiTeamIdentity(team)
  const existing = normalizeTactics(team.tactics ?? tacticsForTeam(team, { staminaMap }))

  const players = availablePlayers(team.players)
  const pool = players.length ? players : team.players ?? []

  const subbed = autoSubLineups({ ...team, tactics: existing }, staminaMap, {
    mode: options.mode ?? existing.autoSubMode ?? identity.autoSubMode,
    pointIndex: options.pointIndex ?? 0,
  })
  const oSortedFull = topBySkill(pool, offenseDefaultScore, pool.length)
  const dSortedFull = topBySkill(pool, defenseDefaultScore, pool.length)

  const oLine = subbed.lineupWhenOffenseStartPlayerIds
  const attackStyle = existing.oLineAttackStyle ?? identity.oLineAttackStyle
  const suggestedSubs = suggestAiPlayerSubRoles(oLine, attackStyle)
  const keptSubs = normalizePlayerSubRolesMap(existing.playerSubRoles)
  // Nowa O-Line: zachowaj ręczne podrole, uzupełnij brakujące ze slotów
  const mergedSubs = { ...suggestedSubs, ...keptSubs }
  for (const pid of oLine) {
    if (pid == null) continue
    const key = String(pid)
    if (!mergedSubs[key]) mergedSubs[key] = suggestedSubs[key]
  }

  const hasExistingInstr =
    (existing.oLinePlayerInstructions && Object.keys(existing.oLinePlayerInstructions).length) ||
    (existing.dLinePlayerInstructions && Object.keys(existing.dLinePlayerInstructions).length)
  const aiInstr = hasExistingInstr
    ? {
        offense: existing.oLinePlayerInstructions ?? {},
        defense: existing.dLinePlayerInstructions ?? {},
      }
    : suggestAiPlayerInstructions(identity, oSortedFull, dSortedFull, pool)

  return normalizeTactics({
    ...existing,
    oLineAttackStyle: existing.oLineAttackStyle ?? identity.oLineAttackStyle,
    oLineDefenseStyle: existing.oLineDefenseStyle ?? identity.oLineDefenseStyle,
    dLineAttackStyle: existing.dLineAttackStyle ?? identity.dLineAttackStyle,
    dLineDefenseStyle: existing.dLineDefenseStyle ?? identity.dLineDefenseStyle,
    oLineCoachDirectives:
      existing.oLineCoachDirectives ??
      identity.oLineCoachDirectives ??
      identity.coachDirectives,
    dLineCoachDirectives:
      existing.dLineCoachDirectives ??
      identity.dLineCoachDirectives ??
      identity.coachDirectives,
    coachDirectives:
      existing.oLineCoachDirectives ??
      existing.coachDirectives ??
      identity.coachDirectives,
    forceSide: existing.forceSide ?? identity.forceSide,
    oLinePlayerInstructions: aiInstr.offense,
    dLinePlayerInstructions: aiInstr.defense,
    autoSubMode: normalizeAutoSubMode(
      options.mode ?? existing.autoSubMode ?? identity.autoSubMode,
    ),
    playerSubRoles: normalizePlayerSubRolesMap(mergedSubs),
    autoSubLineAssignments: subbed.autoSubLineAssignments,
    lineupWhenOffenseStartPlayerIds: oLine,
    lineupWhenDefenseStartPlayerIds: subbed.lineupWhenDefenseStartPlayerIds,
  })
}

/**
 * Drużyna gracza w trakcie symulacji: dokładnie ten sam mechanizm zmian co u AI
 * (autoSubLineups) — progi 60 na swojej linii / 80 na cudzej, tagi rezerwowych, tryb
 * zmian z taktyki. Podrole O-Line są dociągane do slotów formacji po zmianie.
 *
 * @param {object} team
 * @param {Record<string|number, number>} staminaMap
 * @param {object} [options]
 * @param {string} [options.mode] nadpisuje tryb z taktyki
 * @param {number} [options.pointIndex] numer punktu (tryb power_lines)
 */
export function autoSubstituteTacticsForTeam(team, staminaMap, options = {}) {
  const existing = normalizeTactics(team.tactics ?? defaultTacticsForPlayers(team.players ?? []))
  const subbed = autoSubLineups({ ...team, tactics: existing }, staminaMap, {
    mode: options.mode ?? existing.autoSubMode,
    pointIndex: options.pointIndex ?? 0,
  })
  const oLine = subbed.lineupWhenOffenseStartPlayerIds
  const dLine = subbed.lineupWhenDefenseStartPlayerIds

  const attackStyle = existing.oLineAttackStyle ?? existing.attackStyle
  const slots = offenseLineSlotsForAttackStyle(attackStyle)
  const map = { ...normalizePlayerSubRolesMap(existing.playerSubRoles) }
  const prevO = padLine(existing.lineupWhenOffenseStartPlayerIds)
  for (let i = 0; i < slots.length; i += 1) {
    const pid = oLine[i]
    if (pid == null) continue
    const slot = slots[i]
    if (!slot) continue
    const key = String(pid)
    if (prevO[i] !== pid || !map[key]) {
      map[key] =
        slot.defaultSubRole ?? defaultSubRoleForSlot(slot.role, slot.roleIndex ?? 1)
    }
  }

  return normalizeTactics({
    ...existing,
    autoSubLineAssignments: subbed.autoSubLineAssignments,
    playerSubRoles: normalizePlayerSubRolesMap(map),
    lineupWhenOffenseStartPlayerIds: oLine,
    lineupWhenDefenseStartPlayerIds: dLine,
  })
}
