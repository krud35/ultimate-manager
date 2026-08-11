/** Modyfikatory stylów — wartości można stroić bez zmiany logiki punktu. */
import { readLegacySkill } from '../models/playerStats.js'

export const ATTACK_STYLES = {
  VERTICAL_STACK: 'vertical_stack',
  HORIZONTAL_STACK: 'horizontal_stack',
  SPLIT_STACK: 'split_stack',
  SIDE_STACK: 'side_stack',
  MOTION_OFFENSE: 'motion_offense',
  HEX_OFFENSE: 'hex_offense',
  ZONE_OFFENSE: 'zone_offense',
}

export const DEFENSE_STYLES = {
  PERSON: 'person',
  ZONE_CUP: 'zone_cup',
  ZONE_WALL: 'zone_wall',
  CLAM: 'clam',
  ALL_PERSON: 'all_person',
}

/** Opcja force mark. */
export const FORCE_SIDES = {
  FORCE_FOREHAND: 'force_forehand',
  FORCE_BACKHAND: 'force_backhand',
  FORCE_MIDDLE: 'force_middle',
  FORCE_SIDELINE: 'force_sideline',
  FORCE_STRAIGHT: 'force_straight',
}

/** @typedef {'offense'|'defense'} LineRole — O-Line | D-Line (wg startu punktu) */

/**
 * Która linia: jawny lineRole, albo tactics._pointStartRole (runtime), albo O-Line.
 * Współdzielone przez coachDirectives.js i playerInstructions.js (bez cyklu importów).
 * @param {object|null|undefined} tactics
 * @param {LineRole|null|undefined} lineRole
 * @returns {LineRole}
 */
export function resolveLineRole(tactics, lineRole = null) {
  if (lineRole === 'offense' || lineRole === 'defense') return lineRole
  if (tactics?._pointStartRole === 'offense' || tactics?._pointStartRole === 'defense') {
    return tactics._pointStartRole
  }
  return 'offense'
}

/**
 * Profile behawioralne AI — wagi z kompendium taktyk (tacticsGuide.js).
 * Silnik czyta je przez tacticsBehavior.js.
 */
export const TACTICS_MODIFIERS = {
  attack: {
    [ATTACK_STYLES.VERTICAL_STACK]: {
      label: 'Vertical Stack',
      description:
        'Linia cuttersów w środku — dwa pasy (open/break). Wyższa celność, izolowane 1-na-1, mniej big plays.',
      descriptionEn:
        'Cutters in a line down the middle — open and break lanes. Higher completion rate, isolated 1v1s, fewer big plays.',
      throwAccuracyBonus: 3,
      throwRandomSpreadBonus: -2,
      throwDepthBias: -0.15,
      resetPriority: 0.15,
      cutConcurrency: 2,
      spaceCreateBias: 0.2,
      continuationUrgency: 0.1,
      releaseGateMult: 1.2,
    },
    [ATTACK_STYLES.HORIZONTAL_STACK]: {
      label: 'Horizontal Stack',
      description:
        '3 handlerów + 4 cuttersów w poprzek. Więcej under+deep naraz, wyższe tempo i ryzyko.',
      descriptionEn:
        '3 handlers + 4 cutters across the field. More under+deep looks at once, higher tempo and risk.',
      throwAccuracyBonus: -2,
      throwRandomSpreadBonus: 3,
      throwDepthBias: 0.35,
      resetPriority: -0.05,
      cutConcurrency: 3,
      spaceCreateBias: 0.1,
      continuationUrgency: 0.35,
      releaseGateMult: 0.95,
    },
    [ATTACK_STYLES.SPLIT_STACK]: {
      label: 'Split Stack',
      description:
        'Cuttersi na obu stronach (2–2). Silne iso / flood, dobre pull plays.',
      descriptionEn:
        'Cutters on both sides (2–2). Strong iso/flood looks, good for pull plays.',
      throwAccuracyBonus: 1,
      throwRandomSpreadBonus: 1,
      throwDepthBias: 0.2,
      resetPriority: 0,
      cutConcurrency: 2,
      spaceCreateBias: 0.25,
      continuationUrgency: 0.2,
      isoBias: 0.45,
      releaseGateMult: 1.05,
    },
    [ATTACK_STYLES.SIDE_STACK]: {
      label: 'Side Stack',
      description:
        'Flood jednej sideline + izolowany cutter w wolnej połowie. Klasyczne iso.',
      descriptionEn:
        'Flood one sideline + isolated cutter in the open half. Classic iso offense.',
      throwAccuracyBonus: -1,
      throwRandomSpreadBonus: 2,
      throwDepthBias: 0.25,
      resetPriority: 0.05,
      cutConcurrency: 1,
      spaceCreateBias: 0.35,
      continuationUrgency: 0.15,
      isoBias: 0.7,
      releaseGateMult: 1.15,
    },
    [ATTACK_STYLES.MOTION_OFFENSE]: {
      label: 'Motion / Flow',
      description:
        'Point-five mentality: dysk w ruchu, bliskie podania, minimalny standing stack.',
      descriptionEn:
        'Point-five mentality: disc in motion, short throws, minimal standing stack.',
      throwAccuracyBonus: -1,
      throwRandomSpreadBonus: 2,
      throwDepthBias: -0.05,
      resetPriority: -0.2,
      cutConcurrency: 3,
      spaceCreateBias: 0.15,
      continuationUrgency: 0.7,
      releaseGateMult: 0.62,
    },
    [ATTACK_STYLES.HEX_OFFENSE]: {
      label: 'Hex / Hexagon',
      description:
        'Kształt sześciokąta wokół dysku; szybkie bliskie podania, uniwersalne role.',
      descriptionEn:
        'Hexagon shape around the disc; quick short throws, interchangeable roles.',
      throwAccuracyBonus: 0,
      throwRandomSpreadBonus: 1,
      throwDepthBias: -0.2,
      resetPriority: -0.15,
      cutConcurrency: 3,
      spaceCreateBias: 0.3,
      continuationUrgency: 0.55,
      releaseGateMult: 0.72,
    },
    [ATTACK_STYLES.ZONE_OFFENSE]: {
      label: 'Zone Offense',
      description:
        '3 flat handlerów + poppers/wings. Around / through / over przeciw zone D.',
      descriptionEn:
        '3 flat handlers + poppers/wings. Around / through / over against zone D.',
      throwAccuracyBonus: 1,
      throwRandomSpreadBonus: 0,
      throwDepthBias: -0.1,
      resetPriority: 0.25,
      cutConcurrency: 2,
      spaceCreateBias: 0.2,
      continuationUrgency: 0.4,
      swingBias: 0.45,
      releaseGateMult: 1.25,
    },
  },
  defense: {
    [DEFENSE_STYLES.PERSON]: {
      label: 'Person-to-Person',
      description: 'Man-to-man + force. Fundament: open-side shade, help deep, poach opcjonalny.',
      descriptionEn:
        'Man-to-man + force. Fundamentals: open-side shade, help deep, optional poach.',
      defenseBonus: 0,
      blockBonus: 0,
      yardsAllowedMultiplier: 1,
      // Rzadki mikro-poach — nie stałe porzucanie krycia.
      poachTendency: 0.09,
      helpDeepBias: 0.25,
      denyUnderBias: 0.2,
      personMark: true,
      maxPoachers: 1,
    },
    [DEFENSE_STYLES.ZONE_CUP]: {
      label: 'Zone Cup (3-person)',
      description: 'Cup 3 m od dysku + wings + deeps. Karze niedokładnych handlerów, zabija tempo.',
      descriptionEn:
        'Cup 3 m from the disc + wings + deeps. Punishes inaccurate handlers, kills tempo.',
      defenseBonus: -4,
      blockBonus: 12,
      yardsAllowedMultiplier: 1.22,
      poachTendency: 0,
      helpDeepBias: 0.55,
      denyUnderBias: 0.4,
      personMark: false,
      zoneKind: 'cup',
      maxPoachers: 0,
    },
    [DEFENSE_STYLES.ZONE_WALL]: {
      label: 'Junk / Wall (Arrowhead)',
      description:
        'Ściana 5–7 m od dysku blokująca upfield. Trudniejsza do crashnięcia niż ciasny cup.',
      descriptionEn:
        'Wall 5–7 m from the disc denying upfield. Harder to crash than a tight cup.',
      defenseBonus: -2,
      blockBonus: 10,
      yardsAllowedMultiplier: 1.15,
      poachTendency: 0,
      helpDeepBias: 0.5,
      denyUnderBias: 0.55,
      personMark: false,
      zoneKind: 'wall',
      maxPoachers: 0,
    },
    [DEFENSE_STYLES.CLAM]: {
      label: 'Clam',
      description:
        'Obrona typów cutów (open under / break under / deep), nie ludzi. Zabójcza vs vertical stack.',
      descriptionEn:
        'Defends cut types (open under / break under / deep), not people. Deadly vs vertical stack.',
      defenseBonus: 4,
      blockBonus: 6,
      yardsAllowedMultiplier: 0.95,
      poachTendency: 0.22,
      helpDeepBias: 0.4,
      denyUnderBias: 0.5,
      personMark: true,
      antiVertBonus: 10,
      maxPoachers: 2,
    },
    [DEFENSE_STYLES.ALL_PERSON]: {
      label: 'All Person (AP)',
      description:
        'Dynamiczny mark + poachy handler D. Choppy offense, bait deep, lockdown na sideline.',
      descriptionEn:
        'Dynamic mark + handler-D poaches. Choppy offense, bait deep, sideline lockdown.',
      defenseBonus: 2,
      blockBonus: 4,
      yardsAllowedMultiplier: 1.08,
      poachTendency: 0.28,
      helpDeepBias: 0.12,
      denyUnderBias: 0.55,
      personMark: true,
      baitDeep: true,
      maxPoachers: 2,
    },
  },
  force: {
    [FORCE_SIDES.FORCE_FOREHAND]: {
      label: 'Force Forehand',
      description: 'Wymusza forehand (u RH). Standard; downfield shade open-side.',
      descriptionEn: 'Forces forehand (for RH). Standard; downfield open-side shade.',
      huckLaneOpen: 0.2,
      sidelineTrap: 0,
      bothSidesShort: 0,
      markStraight: false,
    },
    [FORCE_SIDES.FORCE_BACKHAND]: {
      label: 'Force Backhand',
      description: 'Wymusza backhand. Utrudnia szybki flick break; lepsza coverage hammerów.',
      descriptionEn: 'Forces backhand. Harder quick flick breaks; better hammer coverage.',
      huckLaneOpen: 0.1,
      sidelineTrap: 0,
      bothSidesShort: 0,
      markStraight: false,
    },
    [FORCE_SIDES.FORCE_MIDDLE]: {
      label: 'Force Middle',
      description: 'Zawsze do środka; na sideline staje się flat trap. Kompaktuje O.',
      descriptionEn: 'Always to the middle; on the sideline becomes a flat trap. Compacts O.',
      huckLaneOpen: -0.15,
      sidelineTrap: 0.35,
      bothSidesShort: 0,
      markStraight: false,
    },
    [FORCE_SIDES.FORCE_SIDELINE]: {
      label: 'Force Sideline / Trap',
      description: 'Forsuj do najbliższej sideline i zaciśnij. Sideline = ósmy obrońca.',
      descriptionEn: 'Force to the nearest sideline and squeeze. Sideline = eighth defender.',
      huckLaneOpen: -0.1,
      sidelineTrap: 0.7,
      bothSidesShort: 0,
      markStraight: false,
    },
    [FORCE_SIDES.FORCE_STRAIGHT]: {
      label: 'Straight Up / No Huck',
      description: 'Mark na wprost — utrudnia deep, oddaje flat shorty na obie strony.',
      descriptionEn: 'Straight-up mark — denies deep, gives flat shorts both ways.',
      huckLaneOpen: -0.55,
      sidelineTrap: 0,
      bothSidesShort: 0.55,
      markStraight: true,
    },
  },
}

export function attackMods(attackStyle) {
  return (
    TACTICS_MODIFIERS.attack[attackStyle] ??
    TACTICS_MODIFIERS.attack[ATTACK_STYLES.VERTICAL_STACK]
  )
}

export function defenseMods(defenseStyle) {
  return (
    TACTICS_MODIFIERS.defense[defenseStyle] ??
    TACTICS_MODIFIERS.defense[DEFENSE_STYLES.PERSON]
  )
}

export function forceMods(forceSide) {
  return (
    TACTICS_MODIFIERS.force[forceSide] ??
    TACTICS_MODIFIERS.force[FORCE_SIDES.FORCE_FOREHAND]
  )
}

/** Obrony oparte o matchup (nie pure zone). */
export function isPersonDefense(defenseStyle) {
  const m = defenseMods(defenseStyle)
  return m.personMark !== false
}

export function isZoneDefense(defenseStyle) {
  return !isPersonDefense(defenseStyle)
}

export function defaultTacticsForPlayers(players) {
  const ids = players.map((p) => p.id)
  const fillLine = (orderedIds) => {
    const line = []
    for (let i = 0; i < 7; i += 1) {
      line.push(orderedIds[i % orderedIds.length] ?? null)
    }
    return line
  }

  const byThrow = [...players].sort(
    (a, b) => readLegacySkill(b.skills, 'throwing') - readLegacySkill(a.skills, 'throwing'),
  )
  const byDef = [...players].sort(
    (a, b) => readLegacySkill(b.skills, 'defense') - readLegacySkill(a.skills, 'defense'),
  )

  const oAtk = ATTACK_STYLES.VERTICAL_STACK
  const oDef = DEFENSE_STYLES.PERSON
  const dAtk = ATTACK_STYLES.VERTICAL_STACK
  const dDef = DEFENSE_STYLES.PERSON

  return {
    oLineAttackStyle: oAtk,
    oLineDefenseStyle: oDef,
    dLineAttackStyle: dAtk,
    dLineDefenseStyle: dDef,
    /** @deprecated alias = O-Line atak (kompatybilność) */
    attackStyle: oAtk,
    /** @deprecated alias = O-Line obrona */
    defenseStyle: oDef,
    coachDirectives: {
      creativity: 0,
      coverageShade: 0,
      huckAppetite: 0,
      passSelectivity: 0,
      breakAppetite: 0,
      possessionTempo: 0,
      forceSide: FORCE_SIDES.FORCE_FOREHAND,
    },
    oLineCoachDirectives: {
      creativity: 0,
      coverageShade: 0,
      huckAppetite: 0,
      passSelectivity: 0,
      breakAppetite: 0,
      possessionTempo: 0,
      forceSide: FORCE_SIDES.FORCE_FOREHAND,
    },
    dLineCoachDirectives: {
      creativity: 0,
      coverageShade: 0,
      huckAppetite: 0,
      passSelectivity: 0,
      breakAppetite: 0,
      possessionTempo: 0,
      forceSide: FORCE_SIDES.FORCE_FOREHAND,
    },
    /** Alias → oLineCoachDirectives.forceSide */
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    oLinePlayerInstructions: {},
    dLinePlayerInstructions: {},
    playerSubRoles: {},
    lineupWhenOffenseStartPlayerIds: fillLine(byThrow.map((p) => p.id)),
    lineupWhenDefenseStartPlayerIds: fillLine(byDef.map((p) => p.id)),
  }
}

export function attachTacticsToTeam(team, tactics) {
  return { ...team, tactics: tactics ?? defaultTacticsForPlayers(team.players) }
}
