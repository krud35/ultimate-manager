import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { COACH_SLIDER_KEYS, COACH_DIRECTIVE_KIND } from '../src/matchEngine/coachDirectives.js'
import { PLAYER_INSTRUCTION_CONFLICTS, PLAYER_INSTRUCTION_DEFS } from '../src/matchEngine/playerInstructions.js'
import { PLAN_AXES } from '../src/career/streamlinedTactics.js'
import { rosterId, families } from './tactics-audit-plan.mjs'

export const weatherCases = [
  { id: 'calm', wind: { speedMph: 0, directionDeg: 0 } },
  { id: 'cross14', wind: { speedMph: 14, directionDeg: 90 } },
  { id: 'axial14', wind: { speedMph: 14, directionDeg: 0 } },
  { id: 'cross24', wind: { speedMph: 24, directionDeg: 270 } },
  { id: 'axial24', wind: { speedMph: 24, directionDeg: 180 } },
]
const neutral = { attack: 'horizontal_stack', defense: 'person', instructions: [], adapt: false }
const defaultRoles = ['primary_handler', 'reset_handler', 'reset_handler', 'primary_cutter', 'secondary_cutter', 'continuation_cutter', 'filler_cutter']
const planLine = { tempo: 0, risk: 0, direction: 0, pressure: 0, force: 'force_forehand' }
const career = patch => ({ ...neutral, streamlinedPlan: { version: 1, offense: { ...planLine, ...patch }, defense: { ...planLine, ...patch }, exceptions: {} } })

// Breadth is interleaved across factors; a scheduling unit is an entire contrast,
// so a deadline never intentionally selects only one treatment of a comparison.
export function makeBalancePlan({ rounds = 8 } = {}) {
  const queues = Object.fromEntries(['matrix', 'instruction', 'directive', 'roles', 'force', 'career', 'interaction'].map(k => [k, []]))
  let serial = 0
  function group({ cohort, factor, round, weather, levels, opponent = neutral, attack, defense, family = 'balanced', split = 'development', rotate = false, core = true }) {
    const id = `${cohort}-${String(++serial).padStart(5, '0')}`
    // All treatments of one contrast share seed, fixture, kickoff and wind.
    const seed = cohort === 'matrix'
      ? 100301000 + round * 10000 + Object.values(ATTACK_STYLES).indexOf(attack) * 100 + Object.values(DEFENSE_STYLES).indexOf(defense)
      : 101000000 + serial * 71 + round * 100000
    const firstOffense = round % 2 ? 'b' : 'a'
    const jobs = levels.flatMap(([level, config]) => [false, true].map(swap => ({
      id: `${id}-${level}-${swap ? 'b' : 'a'}`, block: `${id}-${level}`, contrast: id,
      cohort, factor, level, round, weather: weather.id, attack: attack ?? config.attack ?? neutral.attack,
      defense: defense ?? opponent.defense ?? 'person', family, split, seed, firstOffense, swap,
      home: rosterId(split, family, round % 3, 'a'), away: rosterId(split, family, round % 3, 'b'),
      homeConfig: { ...neutral, ...config }, awayConfig: { ...neutral, ...opponent },
      wind: weather.wind, lockWind: true, rotate, observe: true,
      keepReplays: round === 0 && !swap, budgetMs: 900000,
    })))
    queues[cohort].push({ id, cohort, factor, weather: weather.id, round, core: core && round < 3, jobs })
  }
  for (let round = 0; round < rounds; round++) {
    const family = round < 3 ? 'balanced' : families[(round - 3) % families.length]
    const split = round >= 6 ? 'validation' : 'development'
    // Three independently seeded core repetitions precede the wider catalogue.
    // The first pass is calm; selected weather contrasts also enter the core.
    const attacks = Object.values(ATTACK_STYLES), defenses = Object.values(DEFENSE_STYLES)
    for (let weatherPass = 0; weatherPass < weatherCases.length; weatherPass++) {
      for (let a = 0; a < attacks.length; a++) for (let d = 0; d < defenses.length; d++) {
        const weather = weatherCases[weatherPass === 0 ? 0 : 1 + ((weatherPass - 1 + a + d) % (weatherCases.length - 1))]
        const windSentinel = new Set(['0|0', '1|0', '3|4', '4|0', '5|1', '6|1', '6|2', '2|3', '1|2', '0|3'])
        group({ cohort: 'matrix', factor: `${attacks[a]}|${defenses[d]}`, attack: attacks[a], defense: defenses[d],
          round, weather, family, split, core: weatherPass === 0 || (weatherPass === 1 && windSentinel.has(`${a}|${d}`)),
          levels: [['configured', { attack: attacks[a] }]], opponent: { ...neutral, defense: defenses[d] } })
      }
    }
    for (const [index, pair] of PLAYER_INSTRUCTION_CONFLICTS.entries()) {
      for (const context of ['person', 'zone_cup']) {
        const weather = weatherCases[(index + (context === 'zone_cup' ? 1 : 0) + (round < 3 ? 0 : round)) % weatherCases.length]
        const def = PLAYER_INSTRUCTION_DEFS[pair[0]]
        const focal = { ...neutral, ...(def.side === 'defense' ? { defense: context } : {}) }
        const instructionRole = def.group === 'throw' ? 'handler' : ['cut', 'positioning'].includes(def.group) ? 'cutter' : undefined
        const targeted = ['dominate', 'take_space', 'cut_deep'].includes(pair[0]) ? { instructionTargetSlot: 3 } : {}
        group({ cohort: 'instruction', factor: pair.join('|'), round, weather, family, split, core: context === 'person',
          levels: [['neutral', focal], ...pair.map(key => [key, { ...focal, instructionRole, ...targeted, instructions: [key] }])],
          opponent: { ...neutral, defense: context } })
      }
    }
    for (const [index, key] of COACH_SLIDER_KEYS.entries()) {
      const values = COACH_DIRECTIVE_KIND[key] === 'toggle' ? [['neutral', 0], ['high', 1]] : [['neutral', 0], ['low', -1], ['high', 1]]
      group({ cohort: 'directive', factor: key, round, weather: weatherCases[((round < 3 ? 0 : round) + index) % weatherCases.length], family, split,
        levels: values.map(([label, value]) => [label, { ...neutral, directives: { [key]: value } }]),
        opponent: { ...neutral, defense: index % 2 ? 'zone_cup' : 'person' } })
    }
    for (const [slot, roleList] of [[0, ['primary_handler', 'reset_handler']], [3, ['primary_cutter', 'secondary_cutter', 'continuation_cutter', 'filler_cutter']]]) {
      group({ cohort: 'roles', factor: `slot-${slot}`, round, weather: weatherCases[round < 3 ? 0 : round % weatherCases.length], family, split,
        levels: [['neutral', { ...neutral, subRoles: defaultRoles }], ...roleList.filter(role => role !== defaultRoles[slot]).map(role => [role, { ...neutral, subRoles: defaultRoles.map((base, i) => i === slot ? role : base) }])] })
    }
    for (const [index, force] of Object.values(FORCE_SIDES).entries()) {
      if (force === 'force_forehand') continue
      group({ cohort: 'force', factor: force, round, weather: weatherCases[((round < 3 ? 0 : round) + index) % weatherCases.length], family, split,
        levels: [['neutral', neutral], ['configured', { ...neutral, force }]] })
    }
    for (const [index, axis] of PLAN_AXES.entries()) group({ cohort: 'career', factor: axis.key, round,
      weather: weatherCases[((round < 3 ? 0 : round) + index) % weatherCases.length], family, split, rotate: true,
      levels: [['neutral', career({})], ['low', career({ [axis.key]: -1 })], ['high', career({ [axis.key]: 1 })]], opponent: career({}) })
    const interactions = [
      ['poach-ban-monotonicity', { directives: { poachSeeking: -1 }, instructions: ['no_poach'] }, { directives: { poachSeeking: -1 }, instructions: ['poach'] }, { directives: { poachSeeking: -1 } }],
      ['reset-poach-isolation', { directives: { poachSeeking: -1, poachResetHandler: 1 } }, { directives: { poachSeeking: -1, poachResetHandler: 1 }, instructions: ['no_poach'] }, { directives: { poachSeeking: -1, poachResetHandler: 0 } }],
      ['direction-vs-wind', { directives: { huckAppetite: 1 }, instructions: ['throw_hucks'], instructionRole: 'handler' }, { directives: { huckAppetite: -1 }, instructions: ['no_hucks'], instructionRole: 'handler' }],
      ['instruction-overrides-hucks', { directives: { huckAppetite: 1 }, instructions: ['no_hucks'], instructionRole: 'handler' }, { directives: { huckAppetite: -1 }, instructions: ['throw_hucks'], instructionRole: 'handler' }],
      ['instruction-overrides-poach', { directives: { poachSeeking: 1 }, instructions: ['no_poach'] }, { directives: { poachSeeking: -1 }, instructions: ['poach'] }],
      ['role-vs-dominate', { subRoles: defaultRoles.map((r, i) => i === 3 ? 'filler_cutter' : r), instructions: ['dominate'], instructionTargetSlot: 3 }, { subRoles: defaultRoles.map((r, i) => i === 3 ? 'filler_cutter' : r), instructions: ['wait_your_turn'], instructionTargetSlot: 3 }, { subRoles: defaultRoles.map((r, i) => i === 3 ? 'filler_cutter' : r) }],
      ['zone-tempo', { attack: 'zone_offense', directives: { possessionTempo: 1 } }, { attack: 'zone_offense', directives: { possessionTempo: -1 } }, { attack: 'zone_offense' }],
    ]
    for (const [index, [factor, low, high, base]] of interactions.entries()) group({ cohort: 'interaction', factor, round,
      weather: weatherCases[((round < 3 ? 0 : round) + index) % weatherCases.length], family, split,
      levels: [['neutral', { ...neutral, ...base }], ['low', low], ['high', high]], opponent: { ...neutral, defense: index % 2 ? 'zone_cup' : 'person' } })
  }
  const groups = []
  // Schedule each repetition's breadth before the next repetition. Matrix gets
  // more slots, but every family obtains evidence early in the run.
  for (const core of [true, false]) for (let round = 0; round < rounds; round++) {
    const lane = Object.fromEntries(Object.entries(queues).map(([key, rows]) => [key, rows.filter(r => r.round === round && r.core === core)]))
    while (Object.values(lane).some(rows => rows.length)) {
      for (const key of ['matrix', 'instruction', 'matrix', 'directive', 'matrix', 'career', 'matrix', 'roles', 'force', 'interaction']) {
        if (lane[key].length) groups.push(lane[key].shift())
      }
    }
  }
  return groups
}
