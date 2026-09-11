/**
 * AUTO-ZMIANY SKŁADU — jeden mechanizm dla drużyny AI i drużyny gracza.
 *
 * Wcześniej były dwa: AI przebudowywało siódemki co punkt od zera (`pickDefaultLine`,
 * ranking po czystym skillu, stamina tylko jako bramka), a drużyna gracza dostawała
 * `autoSubstituteTacticsForTeam` (ranking ważony staminą). Efekt: dwie różne polityki
 * minut w tym samym meczu. Tu jest jedna.
 *
 * ZASADA PROGÓW
 * - Na SWOJEJ linii zawodnik gra, dopóki ma STA >= OWN_LINE_STAMINA_MIN (60).
 * - Na CUDZEJ linii (cross-over) wchodzi dopiero od STA >= CROSSOVER_STAMINA_MIN (80)
 *   i tylko wtedy, gdy wyraźnie podnosi jakość tej linii.
 *
 * Chodzi o to, żeby najlepsi nie grali cały mecz do upadłego. Gwiazda z O-Line może
 * wyskoczyć na D-Line, ale tylko wtedy, gdy naprawdę ma zapas siły — inaczej wraca na
 * swoją linię wyżęta i nie ma z niej pożytku tam, gdzie jest przypisana.
 *
 * SWOJA LINIA
 * - zawodnik wpisany do siódemki O i/lub D → to jest jego linia (obie, jeśli w obu),
 * - rezerwowy bez przypisania → linia z jego tagu (o_line_sub / d_line_sub),
 *   `either_line_sub`, `priority_sub` i brak tagu = obie linie.
 */

import { MATCH_CONFIG } from './config.js'
import { getStamina, STAMINA_CONFIG, staminaParticipationFactor } from './stamina.js'
import { isPlayerAvailable } from '../models/playerInjury.js'
import {
  getCategoryOverall,
  normalizePlayerSkills,
  readLegacySkill,
} from '../models/playerStats.js'
import { getPlayerMorale, moraleSkillMultiplier } from '../models/playerMorale.js'
import { offenseLineSlotsForAttackStyle } from './offenseLineSlots.js'

const LINE_SIZE = MATCH_CONFIG.lineupSize

/** Zawodnik na SWOJEJ linii gra, dopóki ma tyle staminy. */
export const OWN_LINE_STAMINA_MIN = 60
/** Wejście na CUDZĄ linię (cross-over) wymaga zapasu — inaczej gwiazdy grają non stop. */
export const CROSSOVER_STAMINA_MIN = 80
/** Cross-over musi być naprawdę lepszy od zawodnika, którego zastępuje. */
const CROSSOVER_CLEAR_ADVANTAGE = 1.12
/** Jedna linia może dostać najwyżej tyle wsparć spoza swojej podstawowej rotacji. */
const MAX_CROSSOVERS_PER_LINE = 2
/**
 * Tryb `position_rotation` ściąga z linii wcześniej niż próg zmęczenia, żeby minuty
 * rozłożyły się na całą rotację, a nie na siódemkę.
 */
export const ROTATION_REST_STAMINA = 72

/** Tag linii dla rezerwowego bez przypisanej siódemki. */
export const SUB_LINE_TAGS = {
  O_LINE: 'o_line_sub',
  D_LINE: 'd_line_sub',
  /** Może zastąpić zawodnika na dowolnej linii. */
  EITHER: 'either_line_sub',
  /** Historyczny tag: jak `either`, ale z niewielkim priorytetem w rankingu. */
  PRIORITY: 'priority_sub',
}

/** Tag pozycji dla rezerwowego — na jaki slot formacji może wejść. */
export const SUB_POSITION_TAGS = {
  HANDLER: 'handler_sub',
  CUTTER: 'cutter_sub',
  /** Może zastąpić zawodnika na dowolnym slocie formacji. */
  EITHER: 'either_position_sub',
  /** Historyczny alias `either_position_sub`. */
  HYBRID: 'hybrid_sub',
}

export const SUB_TAG_DEFS = {
  [SUB_LINE_TAGS.O_LINE]: {
    id: SUB_LINE_TAGS.O_LINE,
    group: 'line',
    label: 'Zmiana O-Line',
    labelEn: 'O-line sub',
    shortLabel: 'O',
    description: 'Wchodzi na O-Line jak na swoją linię (próg 60), na D-Line tylko z zapasem (80) i gdy wyraźnie ją wzmacnia.',
    descriptionEn: 'Treats O-line as their own (60 threshold); D-line only at 80+ and when clearly improving it.',
  },
  [SUB_LINE_TAGS.D_LINE]: {
    id: SUB_LINE_TAGS.D_LINE,
    group: 'line',
    label: 'Zmiana D-Line',
    labelEn: 'D-line sub',
    shortLabel: 'D',
    description: 'Wchodzi na D-Line jak na swoją linię (próg 60), na O-Line tylko z zapasem (80) i gdy wyraźnie ją wzmacnia.',
    descriptionEn: 'Treats D-line as their own (60 threshold); O-line only at 80+ and when clearly improving it.',
  },
  [SUB_LINE_TAGS.EITHER]: {
    id: SUB_LINE_TAGS.EITHER,
    group: 'line',
    label: 'Zmiana na dowolnej linii',
    labelEn: 'Either-line sub',
    shortLabel: 'O/D',
    description: 'Może wejść zarówno na O-Line, jak i D-Line.',
    descriptionEn: 'Can enter on either O-Line or D-Line.',
  },
  [SUB_POSITION_TAGS.HANDLER]: {
    id: SUB_POSITION_TAGS.HANDLER,
    group: 'position',
    label: 'Zmiana za handlera',
    labelEn: 'Handler sub',
    shortLabel: 'H',
    description: 'Wchodzi na sloty handlerskie.',
    descriptionEn: 'Fills handler slots.',
  },
  [SUB_POSITION_TAGS.CUTTER]: {
    id: SUB_POSITION_TAGS.CUTTER,
    group: 'position',
    label: 'Zmiana za cuttera',
    labelEn: 'Cutter sub',
    shortLabel: 'C',
    description: 'Wchodzi na sloty cutterskie.',
    descriptionEn: 'Fills cutter slots.',
  },
  [SUB_POSITION_TAGS.EITHER]: {
    id: SUB_POSITION_TAGS.EITHER,
    group: 'position',
    label: 'Zmiana za dowolną pozycję',
    labelEn: 'Either-position sub',
    shortLabel: 'X',
    description: 'Wchodzi na każdy slot bez kary za niedopasowanie pozycji.',
    descriptionEn: 'Fills any slot with no position-mismatch penalty.',
  },
}

export const SUB_LINE_TAG_IDS = [...new Set(Object.values(SUB_LINE_TAGS))]
export const SUB_POSITION_TAG_IDS = [...new Set(Object.values(SUB_POSITION_TAGS))]
export const SUB_TAG_IDS = [...SUB_LINE_TAG_IDS, ...SUB_POSITION_TAG_IDS]

/** Sposób prowadzenia zmian — trener AI ma swój domyślny, gracz wybiera w taktyce. */
export const AUTO_SUB_MODES = {
  /** Twarde linie: bez cross-overów, zmiana tylko z ławki przypisanej do tej linii. */
  FIXED_LINES: 'fixed_lines',
  /** Domyślny: linie trzymane, cross-over dozwolony przy zapasie siły. */
  BALANCED: 'balanced',
  /** Co kilka punktów najlepsza dostępna siódemka, niezależnie od przypisań. */
  POWER_LINES: 'power_lines',
  /** Minuty rozkładane szeroko — schodzi się z linii wcześniej, zanim padnie próg. */
  POSITION_ROTATION: 'position_rotation',
}

export const AUTO_SUB_MODE_DEFS = {
  [AUTO_SUB_MODES.FIXED_LINES]: {
    id: AUTO_SUB_MODES.FIXED_LINES,
    label: 'Twarde linie',
    labelEn: 'Fixed lines',
    description:
      'O-Line gra O, D-Line gra D. Zero cross-overów: zmiennik zawsze z ławki przypisanej do tej linii.',
    descriptionEn:
      'O plays O, D plays D. No cross-overs: replacements come from that line’s bench only.',
  },
  [AUTO_SUB_MODES.BALANCED]: {
    id: AUTO_SUB_MODES.BALANCED,
    label: 'Zbalansowany',
    labelEn: 'Balanced',
    description:
      'Linie trzymane, ale zawodnik z zapasem siły (80+) może wesprzeć drugą linię tylko, gdy jest od niej wyraźnie lepszy.',
    descriptionEn:
      'Lines held, but a player with 80+ stamina can cross over only when clearly better than that line.',
  },
  [AUTO_SUB_MODES.POWER_LINES]: {
    id: AUTO_SUB_MODES.POWER_LINES,
    label: 'Power line',
    labelEn: 'Power line',
    description:
      'Co kilka punktów wystawiana jest najlepsza dostępna siódemka, niezależnie od przypisań do linii.',
    descriptionEn:
      'Every few points the best available seven takes the field, regardless of line assignment.',
  },
  [AUTO_SUB_MODES.POSITION_ROTATION]: {
    id: AUTO_SUB_MODES.POSITION_ROTATION,
    label: 'Szeroka rotacja',
    labelEn: 'Wide rotation',
    description:
      'Zawodnik schodzi już przy 72 STA, żeby minuty rozłożyły się na całą rotację, a nie na siódemkę.',
    descriptionEn:
      'Players rest at 72 stamina so minutes spread across the whole roster, not just the seven.',
  },
}

export const AUTO_SUB_MODE_IDS = Object.values(AUTO_SUB_MODES)
export const DEFAULT_AUTO_SUB_MODE = AUTO_SUB_MODES.BALANCED

/** Co ile punktów tryb `power_lines` wystawia najlepszą siódemkę. */
const POWER_LINE_EVERY_POINTS = 4

export function normalizeAutoSubMode(mode) {
  return AUTO_SUB_MODE_IDS.includes(mode) ? mode : DEFAULT_AUTO_SUB_MODE
}

/**
 * Mapa tagów rezerwowych: { [playerId]: [tag, ...] }. Najwyżej jeden tag linii i jeden
 * tag pozycji na zawodnika — kolejne tego samego rodzaju są odrzucane.
 */
export function normalizePlayerSubTagsMap(map) {
  const out = {}
  for (const [key, value] of Object.entries(map ?? {})) {
    const list = Array.isArray(value) ? value : [value]
    let lineTag = null
    let posTag = null
    for (const tag of list) {
      if (!lineTag && SUB_LINE_TAG_IDS.includes(tag)) lineTag = tag
      else if (!posTag && SUB_POSITION_TAG_IDS.includes(tag)) posTag = tag
    }
    const tags = [lineTag, posTag].filter(Boolean)
    if (tags.length) out[String(key)] = tags
  }
  return out
}

export function subLineTagFor(tagsMap, playerId) {
  return (tagsMap?.[String(playerId)] ?? []).find((t) => SUB_LINE_TAG_IDS.includes(t)) ?? null
}

export function subPositionTagFor(tagsMap, playerId) {
  return (tagsMap?.[String(playerId)] ?? []).find((t) => SUB_POSITION_TAG_IDS.includes(t)) ?? null
}

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

/** Kara za zmęczenie — poniżej exhausted praktycznie wyklucza z najlepszej siódemki. */
function staminaFit(stamina) {
  const s = stamina ?? STAMINA_CONFIG.default
  if (s < STAMINA_CONFIG.exhaustedThreshold) return 0.15
  if (s < STAMINA_CONFIG.lowFatigueThreshold) return 0.45
  if (s < STAMINA_CONFIG.midFatigueThreshold) return 0.7
  if (s < STAMINA_CONFIG.tiredThreshold) return 0.88
  return staminaParticipationFactor(s)
}

export function scorePlayerForOffense(player, staminaMap) {
  const stam = staminaMap ? getStamina(staminaMap, player.id) : STAMINA_CONFIG.default
  return (
    offenseSkillScore(player) * staminaFit(stam) * moraleSkillMultiplier(getPlayerMorale(player))
  )
}

export function scorePlayerForDefense(player, staminaMap) {
  const stam = staminaMap ? getStamina(staminaMap, player.id) : STAMINA_CONFIG.default
  return (
    defenseSkillScore(player) * staminaFit(stam) * moraleSkillMultiplier(getPlayerMorale(player))
  )
}

/** Ranking „kogo trener CHCE grać" — czysty skill + morale, bez bieżącej staminy. */
export function offenseDefaultScore(player) {
  return offenseSkillScore(player) * moraleSkillMultiplier(getPlayerMorale(player))
}

export function defenseDefaultScore(player) {
  return defenseSkillScore(player) * moraleSkillMultiplier(getPlayerMorale(player))
}

function padLineIds(ids, size = LINE_SIZE) {
  const line = [...(ids ?? [])].slice(0, size)
  while (line.length < size) line.push(null)
  return line
}

/** Pozycja zawodnika sprowadzona do rodziny slotu formacji. */
function positionFamily(player) {
  const pos = String(player?.position ?? '').toLowerCase()
  if (pos.startsWith('handler')) return 'handler'
  if (pos.startsWith('cutter')) return 'cutter'
  return null
}

/**
 * Dopasowanie zawodnika do slotu formacji. Tag pozycji rezerwowego ma pierwszeństwo
 * przed nominalną pozycją — po to się go ustawia.
 */
function positionFitMultiplier(player, slotRole, posTag) {
  if (!slotRole) return 1
  if (posTag === SUB_POSITION_TAGS.EITHER || posTag === SUB_POSITION_TAGS.HYBRID) return 1
  if (posTag === SUB_POSITION_TAGS.HANDLER) return slotRole === 'handler' ? 1 : 0.6
  if (posTag === SUB_POSITION_TAGS.CUTTER) return slotRole === 'cutter' ? 1 : 0.6
  const family = positionFamily(player)
  if (!family) return 0.85
  return family === slotRole ? 1 : 0.75
}

/** Jawny tag rezerwowego wygrywa pierwszy wybór na zgodnym slocie. */
function isPreferredSubForSlot(playerId, slotRole, tagsMap) {
  const tag = subPositionTagFor(tagsMap, playerId)
  if (!tag || !slotRole) return false
  if (tag === SUB_POSITION_TAGS.EITHER || tag === SUB_POSITION_TAGS.HYBRID) return true
  return (
    (tag === SUB_POSITION_TAGS.HANDLER && slotRole === 'handler') ||
    (tag === SUB_POSITION_TAGS.CUTTER && slotRole === 'cutter')
  )
}

/**
 * Linie przypisane zawodnikowi. Wpis w siódemce jest silniejszy niż tag rezerwowego —
 * kto jest w składzie, ten ma tę linię jako swoją, niezależnie od tagów.
 */
function ownLinesFor(playerId, { oLineSet, dLineSet, tagsMap }) {
  const own = new Set()
  if (oLineSet.has(playerId)) own.add('offense')
  if (dLineSet.has(playerId)) own.add('defense')
  if (own.size) return own
  const tag = subLineTagFor(tagsMap, playerId)
  if (tag === SUB_LINE_TAGS.O_LINE) return new Set(['offense'])
  if (tag === SUB_LINE_TAGS.D_LINE) return new Set(['defense'])
  // priority_sub i rezerwowy bez tagu: obie linie są „swoje”.
  return new Set(['offense', 'defense'])
}

/**
 * Podstawowe przypisanie linii nie może zmieniać się po każdej auto-zmianie. Bez tej
 * pamięci zawodnik, który raz wskoczył na drugą linię, w następnym punkcie traktował ją
 * jako swoją i omijał próg 80. Mapa jest tworzona z pierwszego ustawienia meczu.
 */
function lineAssignmentSets(tactics, oLine, dLine) {
  const saved = tactics?.autoSubLineAssignments
  const offense = new Set((saved?.offense ?? oLine).filter((id) => id != null))
  const defense = new Set((saved?.defense ?? dLine).filter((id) => id != null))
  return { offense, defense }
}

function serializeLineAssignments({ offense, defense }) {
  return {
    offense: [...offense],
    defense: [...defense],
  }
}

/**
 * Wystarczy siły, żeby wejść/zostać na tej linii?
 * @returns {{ ok: boolean, crossover: boolean }}
 */
function staminaGate(playerId, line, stamina, ctx) {
  const own = ownLinesFor(playerId, ctx).has(line)
  const crossover = !own
  if (crossover && ctx.mode === AUTO_SUB_MODES.FIXED_LINES) return { ok: false, crossover }
  const min = own
    ? ctx.mode === AUTO_SUB_MODES.POSITION_ROTATION
      ? ROTATION_REST_STAMINA
      : OWN_LINE_STAMINA_MIN
    : CROSSOVER_STAMINA_MIN
  return { ok: stamina >= min, crossover }
}

/**
 * Buduje jedną linię: zostawia na swoich miejscach tych, którzy mają siłę grać, a puste
 * i „wypalone" sloty obsadza najlepszym dostępnym kandydatem pod dany slot formacji.
 */
function buildLine({ line, assignedLine, slots, roster, byId, staminaMap, scoreFn, lineRole, ctx, rebuildAll }) {
  const base = padLineIds(line)
  const next = [...base]
  const keep = new Set()

  if (!rebuildAll) {
    for (let i = 0; i < next.length; i += 1) {
      const pid = next[i]
      const player = pid != null ? byId[pid] : null
      if (!player || !isPlayerAvailable(player)) {
        next[i] = null
        continue
      }
      const gate = staminaGate(pid, lineRole, getStamina(staminaMap, pid), ctx)
      if (gate.ok) keep.add(pid)
      else next[i] = null
    }
    // Gdy zawodnik odpoczął do progu swojej linii, wraca do niej zamiast na stałe
    // ustępować miejsca tymczasowemu zmiennikowi z poprzedniego punktu.
    const assigned = padLineIds(assignedLine)
    for (let i = 0; i < assigned.length; i += 1) {
      const pid = assigned[i]
      if (pid == null || next[i] === pid) continue
      const player = byId[pid]
      if (!player || !isPlayerAvailable(player)) continue
      if (!staminaGate(pid, lineRole, getStamina(staminaMap, pid), ctx).ok) continue
      const previousSlot = next.indexOf(pid)
      if (previousSlot >= 0) next[previousSlot] = null
      next[i] = pid
    }
    keep.clear()
    for (const pid of next) if (pid != null) keep.add(pid)
  } else {
    next.fill(null)
  }

  const used = new Set(keep)
  const candidatesFor = (slotRole, { relaxStamina = false } = {}) => {
    const out = []
    for (const player of roster) {
      if (used.has(player.id)) continue
      if (!isPlayerAvailable(player)) continue
      const stamina = getStamina(staminaMap, player.id)
      const gate = staminaGate(player.id, lineRole, stamina, ctx)
      if (!gate.ok && !relaxStamina) continue
      if (!gate.ok && ctx.mode === AUTO_SUB_MODES.FIXED_LINES && gate.crossover) continue
      const posTag = subPositionTagFor(ctx.tagsMap, player.id)
      const lineTag = subLineTagFor(ctx.tagsMap, player.id)
      const score =
        scoreFn(player, staminaMap) *
        positionFitMultiplier(player, slotRole, posTag) *
        (gate.crossover ? 0.85 : 1) *
        (lineTag === SUB_LINE_TAGS.PRIORITY ? 1.08 : 1)
      out.push({ player, score })
    }
    // Ręczna kolejność ławki jest rozstrzygająca w ramach tej samej grupy kandydatów;
    // wynik sportowy zostaje sensownym tie-breakerem dla nieustawionych rezerwowych.
    return out.sort(
      (a, b) =>
        (ctx.subPriorityRank[String(a.player.id)] ?? Number.MAX_SAFE_INTEGER) -
          (ctx.subPriorityRank[String(b.player.id)] ?? Number.MAX_SAFE_INTEGER) ||
        b.score - a.score,
    )
  }

  for (let i = 0; i < next.length; i += 1) {
    if (next[i] != null) continue
    const slotRole = slots?.[i]?.role ?? null
    // Najpierw ci, którzy mają siłę. Dopiero gdy ławka jest pusta, wracamy po zmęczonych
    // — lepszy wyżęty zawodnik niż dziura w siódemce.
    const eligible = candidatesFor(slotRole)
    // Najpierw patrzymy na rezerwowych ręcznie przypisanych do tego typu slotu;
    // ogólny ranking jest fallbackiem, gdy takiego zawodnika nie ma.
    const preferred = eligible.filter(({ player }) =>
      isPreferredSubForSlot(player.id, slotRole, ctx.tagsMap),
    )
    const ranked = preferred.length ? preferred : eligible
    const own = ranked.filter(({ player }) =>
      ownLinesFor(player.id, ctx).has(lineRole),
    )
    const crossovers = ranked.filter(({ player }) =>
      !ownLinesFor(player.id, ctx).has(lineRole),
    )
    const bestOwn = own[0]
    const bestCrossover = crossovers[0]
    // Nawet przy wolnym slocie druga linia dostaje wsparcie tylko po wyraźnym upgrade.
    // Jeśli nie ma świeżego zawodnika swojej linii, cross-over jest naturalnym wyborem.
    const pick =
      bestCrossover &&
      (!bestOwn || bestCrossover.score >= bestOwn.score * CROSSOVER_CLEAR_ADVANTAGE)
        ? bestCrossover
        : bestOwn ?? candidatesFor(slotRole, { relaxStamina: true })[0]
    if (!pick) continue
    next[i] = pick.player.id
    used.add(pick.player.id)
  }

  return next
}

/**
 * Dopiero po obsadzeniu własnej rotacji sprawdzamy, czy bardzo świeży zawodnik z drugiej
 * linii daje istotny upgrade. Dzięki temu cross-over nie jest awaryjną zapchajdziurą ani
 * sposobem na przejęcie całej drugiej siódemki przez gwiazdy.
 */
function addClearCrossovers({ line, slots, roster, byId, staminaMap, scoreFn, lineRole, ctx }) {
  const next = [...line]
  const used = new Set(next.filter((id) => id != null))
  let added = 0

  while (added < MAX_CROSSOVERS_PER_LINE) {
    let best = null
    for (let i = 0; i < next.length; i += 1) {
      const incumbent = byId[next[i]]
      if (!incumbent) continue
      const incumbentScore = scoreFn(incumbent, staminaMap)
      const slotRole = slots?.[i]?.role ?? null
      for (const candidate of roster) {
        if (used.has(candidate.id) || !isPlayerAvailable(candidate)) continue
        const stamina = getStamina(staminaMap, candidate.id)
        const gate = staminaGate(candidate.id, lineRole, stamina, ctx)
        if (!gate.ok || !gate.crossover) continue
        const score =
          scoreFn(candidate, staminaMap) *
          positionFitMultiplier(candidate, slotRole, subPositionTagFor(ctx.tagsMap, candidate.id))
        if (score < incumbentScore * CROSSOVER_CLEAR_ADVANTAGE) continue
        const gain = score - incumbentScore
        if (!best || gain > best.gain) best = { i, candidate, gain }
      }
    }
    if (!best) break
    used.delete(next[best.i])
    next[best.i] = best.candidate.id
    used.add(best.candidate.id)
    added += 1
  }
  return next
}

/**
 * Auto-zmiany dla drużyny — wspólne dla AI i gracza.
 *
 * @param {object} team drużyna z `players` i `tactics`
 * @param {Record<string|number, number>} staminaMap
 * @param {object} [options]
 * @param {string} [options.mode] tryb zmian; domyślnie z taktyki drużyny
 * @param {number} [options.pointIndex] numer punktu (tryb power_lines)
 * @returns {object} taktyka z podmienionymi siódemkami (bez normalizeTactics — robi to caller)
 */
export function autoSubLineups(team, staminaMap, options = {}) {
  const tactics = team?.tactics ?? {}
  const roster = team?.players ?? []
  if (!roster.length) return tactics

  const oLine = padLineIds(tactics.lineupWhenOffenseStartPlayerIds)
  const dLine = padLineIds(tactics.lineupWhenDefenseStartPlayerIds)
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]))
  const assignments = lineAssignmentSets(tactics, oLine, dLine)
  const ctx = {
    oLineSet: assignments.offense,
    dLineSet: assignments.defense,
    tagsMap: normalizePlayerSubTagsMap(tactics.playerSubTags),
    subPriorityRank: Object.fromEntries(
      (tactics.playerSubPriorityIds ?? []).map((id, index) => [String(id), index]),
    ),
    mode: normalizeAutoSubMode(options.mode ?? tactics.autoSubMode),
  }

  const pointIndex = options.pointIndex ?? 0
  // Power line: co kilka punktów przypisania idą w kąt i na boisko wychodzi najlepsza
  // dostępna siódemka. Deterministycznie po numerze punktu, żeby mecz był powtarzalny.
  const powerPoint =
    ctx.mode === AUTO_SUB_MODES.POWER_LINES &&
    pointIndex > 0 &&
    pointIndex % POWER_LINE_EVERY_POINTS === 0

  const oSlots = offenseLineSlotsForAttackStyle(tactics.oLineAttackStyle ?? tactics.attackStyle)
  const dSlots = offenseLineSlotsForAttackStyle(tactics.dLineAttackStyle ?? tactics.attackStyle)

  const baseO = buildLine({
    line: oLine,
    assignedLine: tactics.autoSubLineAssignments?.offense ?? oLine,
    slots: oSlots,
    roster,
    byId,
    staminaMap,
    scoreFn: scorePlayerForOffense,
    lineRole: 'offense',
    ctx,
    rebuildAll: powerPoint,
  })
  // D-Line liczona po O-Line, ale bez blokowania zawodników — obsada obu linii naraz
  // jest dozwolona (to świadoma decyzja trenera), progi staminy same to studzą.
  const baseD = buildLine({
    line: dLine,
    assignedLine: tactics.autoSubLineAssignments?.defense ?? dLine,
    slots: dSlots,
    roster,
    byId,
    staminaMap,
    scoreFn: scorePlayerForDefense,
    lineRole: 'defense',
    ctx,
    rebuildAll: powerPoint,
  })

  const nextO = powerPoint
    ? baseO
    : addClearCrossovers({
        line: baseO, slots: oSlots, roster, byId, staminaMap, scoreFn: scorePlayerForOffense,
        lineRole: 'offense', ctx,
      })
  const nextD = powerPoint
    ? baseD
    : addClearCrossovers({
        line: baseD, slots: dSlots, roster, byId, staminaMap, scoreFn: scorePlayerForDefense,
        lineRole: 'defense', ctx,
      })

  return {
    ...tactics,
    autoSubLineAssignments: serializeLineAssignments(assignments),
    lineupWhenOffenseStartPlayerIds: nextO,
    lineupWhenDefenseStartPlayerIds: nextD,
  }
}
