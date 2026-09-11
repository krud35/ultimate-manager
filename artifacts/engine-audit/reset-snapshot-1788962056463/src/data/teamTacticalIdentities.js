/**
 * Charakterystyczne style taktyczne drużyn UFA — AI korzysta z nich w meczach.
 */
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
} from '../matchEngine/tacticsModifiers.js'
import { normalizeCoachDirectives } from '../matchEngine/coachDirectives.js'

/**
 * @typedef {object} TeamTacticalIdentity
 * @property {string} label
 * @property {string} attackStyle
 * @property {string} defenseStyle
 * @property {string} [oLineAttackStyle]
 * @property {string} [oLineDefenseStyle]
 * @property {string} [dLineAttackStyle]
 * @property {string} [dLineDefenseStyle]
 * @property {string} forceSide
 * @property {object} [coachDirectives]
 * @property {string} [blurb]
 * @property {string} [blurbEn]
 */

/** @type {Record<string, TeamTacticalIdentity>} */
export const TEAM_TACTICAL_IDENTITIES = {
  'seattle-cascades': {
    label: 'Vertical control',
    attackStyle: ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    coachDirectives: {
      creativity: -0.35,
      coverageShade: -0.15,
      huckAppetite: -0.4,
      breakAppetite: -0.2,
      possessionTempo: -0.45,
    },
    blurb: 'Czysty vertical, patient resety, person D.',
    blurbEn: 'Clean vertical, patient resets, person D.',
  },
  'boston-glory': {
    label: 'Horizontal tempo',
    attackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    defenseStyle: DEFENSE_STYLES.ZONE_CUP,
    dLineAttackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_CUP,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_BACKHAND,
    coachDirectives: {
      creativity: 0.15,
      coverageShade: -0.25,
      huckAppetite: 0.25,
      breakAppetite: 0.1,
      possessionTempo: 0.55,
    },
    blurb: 'Szybkie under+deep, cup na D-line pull-playach.',
    blurbEn: 'Fast under+deep, cup on D-line pull plays.',
  },
  'austin-sol': {
    label: 'Iso flood',
    attackStyle: ATTACK_STYLES.SIDE_STACK,
    defenseStyle: DEFENSE_STYLES.PERSON,
    dLineAttackStyle: ATTACK_STYLES.SPLIT_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ALL_PERSON,
    forceSide: FORCE_SIDES.FORCE_SIDELINE,
    coachDirectives: {
      creativity: 0.35,
      coverageShade: 0.2,
      huckAppetite: 0.15,
      breakAppetite: 0.4,
      possessionTempo: 0.2,
    },
    blurb: 'Side stack / iso na O, agresywny person na D.',
    blurbEn: 'Side stack / iso on offense, aggressive person on D.',
  },
  'carolina-flyers': {
    label: 'Motion pressure',
    attackStyle: ATTACK_STYLES.MOTION_OFFENSE,
    defenseStyle: DEFENSE_STYLES.ALL_PERSON,
    dLineAttackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ALL_PERSON,
    forceSide: FORCE_SIDES.FORCE_MIDDLE,
    coachDirectives: {
      creativity: 0.45,
      coverageShade: -0.1,
      huckAppetite: 0.1,
      breakAppetite: 0.25,
      possessionTempo: 0.65,
    },
    blurb: 'Dysk w ruchu, agresywny all-person.',
    blurbEn: 'Disc in motion, aggressive all-person.',
  },
  'chicago-union': {
    label: 'Split & clam',
    attackStyle: ATTACK_STYLES.SPLIT_STACK,
    defenseStyle: DEFENSE_STYLES.CLAM,
    dLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.CLAM,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    coachDirectives: {
      creativity: 0.05,
      coverageShade: -0.35,
      huckAppetite: -0.1,
      breakAppetite: -0.05,
      possessionTempo: 0,
    },
    blurb: 'Split stack na O, clam na D.',
    blurbEn: 'Split stack on offense, clam on D.',
  },
  'colorado-apex': {
    label: 'Hex & wall',
    attackStyle: ATTACK_STYLES.HEX_OFFENSE,
    defenseStyle: DEFENSE_STYLES.ZONE_WALL,
    dLineAttackStyle: ATTACK_STYLES.MOTION_OFFENSE,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_WALL,
    forceSide: FORCE_SIDES.FORCE_STRAIGHT,
    coachDirectives: {
      creativity: 0.3,
      coverageShade: 0.45,
      huckAppetite: -0.2,
      breakAppetite: 0.15,
      possessionTempo: 0.25,
    },
    blurb: 'Hex flow na O, ściana strefowa na D.',
    blurbEn: 'Hex flow on offense, zone wall on D.',
  },
  'houston-havoc': {
    label: 'Huck & cup',
    attackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    defenseStyle: DEFENSE_STYLES.ZONE_CUP,
    dLineAttackStyle: ATTACK_STYLES.SIDE_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_CUP,
    forceSide: FORCE_SIDES.FORCE_BACKHAND,
    coachDirectives: {
      creativity: 0.2,
      coverageShade: 0.35,
      huckAppetite: 0.7,
      breakAppetite: 0.2,
      possessionTempo: 0.35,
    },
    blurb: 'Głębokie ataki na O, cup po pullu D-line.',
    blurbEn: 'Deep shots on offense, cup after the D-line pull.',
  },
  'minnesota-wind-chill': {
    label: 'Classic vertical',
    attackStyle: ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    coachDirectives: {
      creativity: -0.25,
      coverageShade: 0,
      huckAppetite: -0.15,
      breakAppetite: -0.15,
      possessionTempo: -0.2,
    },
    blurb: 'Tradycyjny vertical + person.',
    blurbEn: 'Traditional vertical + person.',
  },
  'dc-breeze': {
    label: 'Flow middle',
    attackStyle: ATTACK_STYLES.MOTION_OFFENSE,
    defenseStyle: DEFENSE_STYLES.PERSON,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_CUP,
    forceSide: FORCE_SIDES.FORCE_MIDDLE,
    coachDirectives: {
      creativity: 0.25,
      coverageShade: -0.2,
      huckAppetite: 0,
      breakAppetite: 0.35,
      possessionTempo: 0.4,
    },
    blurb: 'Motion offense, force middle; cup na D-line.',
    blurbEn: 'Motion offense, force middle; cup on D-line.',
  },
  'new-york-empire': {
    label: 'Sideline iso',
    attackStyle: ATTACK_STYLES.SIDE_STACK,
    defenseStyle: DEFENSE_STYLES.ALL_PERSON,
    dLineAttackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ALL_PERSON,
    forceSide: FORCE_SIDES.FORCE_SIDELINE,
    coachDirectives: {
      creativity: 0.15,
      coverageShade: 0.15,
      huckAppetite: 0.2,
      breakAppetite: -0.25,
      possessionTempo: 0.1,
    },
    blurb: 'Iso na sideline, tight person D.',
    blurbEn: 'Sideline iso, tight person D.',
  },
  'oakland-spiders': {
    label: 'Hex clam',
    attackStyle: ATTACK_STYLES.HEX_OFFENSE,
    defenseStyle: DEFENSE_STYLES.CLAM,
    dLineAttackStyle: ATTACK_STYLES.SPLIT_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.CLAM,
    forceSide: FORCE_SIDES.FORCE_STRAIGHT,
    coachDirectives: {
      creativity: 0.4,
      coverageShade: 0.25,
      huckAppetite: -0.05,
      breakAppetite: 0.45,
      possessionTempo: 0.15,
    },
    blurb: 'Hexagon + clam po turnie.',
    blurbEn: 'Hexagon + clam after the turn.',
  },
  'atlanta-hustle': {
    label: 'Horizontal wall',
    attackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    defenseStyle: DEFENSE_STYLES.ZONE_WALL,
    dLineAttackStyle: ATTACK_STYLES.ZONE_OFFENSE,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_WALL,
    forceSide: FORCE_SIDES.FORCE_BACKHAND,
    coachDirectives: {
      creativity: 0.1,
      coverageShade: 0.3,
      huckAppetite: 0.3,
      breakAppetite: 0.05,
      possessionTempo: 0.5,
    },
    blurb: 'Tempo horizontal, zone wall.',
    blurbEn: 'Horizontal tempo, zone wall.',
  },
  'toronto-rush': {
    label: 'Split person',
    attackStyle: ATTACK_STYLES.SPLIT_STACK,
    defenseStyle: DEFENSE_STYLES.PERSON,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_CUP,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    coachDirectives: {
      creativity: -0.1,
      coverageShade: -0.2,
      huckAppetite: -0.05,
      breakAppetite: 0,
      possessionTempo: 0.05,
    },
    blurb: 'Split stack, klasyczny person / cup na D.',
    blurbEn: 'Split stack, classic person / cup on D.',
  },
  'montreal-royal': {
    label: 'Zone specialists',
    attackStyle: ATTACK_STYLES.ZONE_OFFENSE,
    defenseStyle: DEFENSE_STYLES.ZONE_CUP,
    dLineAttackStyle: ATTACK_STYLES.ZONE_OFFENSE,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_WALL,
    forceSide: FORCE_SIDES.FORCE_MIDDLE,
    coachDirectives: {
      creativity: -0.55,
      coverageShade: -0.3,
      huckAppetite: -0.35,
      breakAppetite: -0.2,
      possessionTempo: -0.15,
    },
    blurb: 'Zone O vs zone D — specjalizacja strefowa.',
    blurbEn: 'Zone O vs zone D — zone specialists.',
  },
  'san-diego-growlers': {
    label: 'Motion wall',
    attackStyle: ATTACK_STYLES.MOTION_OFFENSE,
    defenseStyle: DEFENSE_STYLES.ZONE_WALL,
    dLineAttackStyle: ATTACK_STYLES.HORIZONTAL_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.ZONE_WALL,
    forceSide: FORCE_SIDES.FORCE_SIDELINE,
    coachDirectives: {
      creativity: 0.35,
      coverageShade: 0.4,
      huckAppetite: 0.15,
      breakAppetite: 0.3,
      possessionTempo: 0.6,
    },
    blurb: 'Szybki flow, wall na obronie.',
    blurbEn: 'Fast flow, wall on defense.',
  },
  'salt-lake-shred': {
    label: 'Vertical clam',
    attackStyle: ATTACK_STYLES.VERTICAL_STACK,
    defenseStyle: DEFENSE_STYLES.CLAM,
    dLineAttackStyle: ATTACK_STYLES.SIDE_STACK,
    dLineDefenseStyle: DEFENSE_STYLES.CLAM,
    forceSide: FORCE_SIDES.FORCE_STRAIGHT,
    coachDirectives: {
      creativity: -0.4,
      coverageShade: -0.25,
      huckAppetite: -0.5,
      breakAppetite: -0.3,
      possessionTempo: -0.55,
    },
    blurb: 'Cierpliwy vertical, clam po złapaniu.',
    blurbEn: 'Patient vertical, clam after the catch.',
  },
}

export function coachDirectivesFromIdentity(identity, lineRole = 'offense') {
  const raw =
    lineRole === 'defense'
      ? (identity?.dLineCoachDirectives ?? identity?.coachDirectives)
      : (identity?.oLineCoachDirectives ?? identity?.coachDirectives)
  return normalizeCoachDirectives(
    raw,
    identity?.forceSide ?? FORCE_SIDES.FORCE_FOREHAND,
  )
}

export function teamTacticalIdentity(teamId, identityOverride = null) {
  const base =
    identityOverride ??
    TEAM_TACTICAL_IDENTITIES[teamId] ?? {
      label: 'Default',
      attackStyle: ATTACK_STYLES.VERTICAL_STACK,
      defenseStyle: DEFENSE_STYLES.PERSON,
      forceSide: FORCE_SIDES.FORCE_FOREHAND,
      blurb: 'Standardowy setup.',
      blurbEn: 'Standard setup.',
    }
  const oLineCoachDirectives = coachDirectivesFromIdentity(base, 'offense')
  const dLineCoachDirectives = coachDirectivesFromIdentity(base, 'defense')
  return {
    ...base,
    oLineAttackStyle: base.oLineAttackStyle ?? base.attackStyle,
    oLineDefenseStyle: base.oLineDefenseStyle ?? base.defenseStyle,
    dLineAttackStyle: base.dLineAttackStyle ?? base.attackStyle,
    dLineDefenseStyle: base.dLineDefenseStyle ?? base.defenseStyle,
    oLineCoachDirectives,
    dLineCoachDirectives,
    /** @deprecated alias = O-Line */
    coachDirectives: oLineCoachDirectives,
    forceSide: oLineCoachDirectives.forceSide,
  }
}
