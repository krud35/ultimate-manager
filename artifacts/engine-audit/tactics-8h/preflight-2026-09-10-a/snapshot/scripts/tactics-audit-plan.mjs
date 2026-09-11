import { AI_COACH_ARCHETYPES } from '../src/matchEngine/aiCoachProfile.js'
import { COACH_SLIDER_KEYS, COACH_DIRECTIVE_KIND } from '../src/matchEngine/coachDirectives.js'
import { PLAYER_INSTRUCTION_DEFS } from '../src/matchEngine/playerInstructions.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { PLAYER_STAT_CATEGORIES, normalizePlayerSkills } from '../src/models/playerStats.js'
import { createRng } from '../src/matchEngine/rng.js'

export const phases = [
  { id: 'integrity', end: 15 }, { id: 'controls', end: 70 }, { id: 'matrix', end: 130 },
  { id: 'coaches', end: 185 }, { id: 'adaptation', end: 230 },
  { id: 'development', end: 295 }, { id: 'validation', end: 340 }, { id: 'holdout', end: 460 },
]
export const families = ['balanced', 'handlers', 'flow', 'deep', 'defenders', 'technical']
export const sentinels = [
  { id: 'neutral', attack: 'vertical_stack', defense: 'person', adapt: false },
  { id: 'pressure', attack: 'horizontal_stack', defense: 'all_person', directives: { cushionDepth: -.4, possessionTempo: .3 }, adapt: false },
  { id: 'zone', attack: 'hex_offense', defense: 'zone_cup', force: 'force_sideline', adapt: false },
]
const catalogFamilies = [
  ['control', 'patient_controller', { huckAppetite: -.4, possessionTempo: -.35, passSelectivity: -.3 }],
  ['flow', 'motion_system', { possessionTempo: .4, stackDepth: -.2 }],
  ['deep', 'deep_strike', { huckAppetite: .4, stackDepth: .2 }],
  ['isolation', 'creative_iso', { breakAppetite: .4, creativity: .25 }],
  ['counter', 'trap_counter', { cushionDepth: -.25, possessionTempo: .3 }],
  ['zone', 'cup_grinder', { helpDeep: 1, markShape: .3 }],
  ['hybrid', 'junk_hybrid', { poachSeeking: 1, coverageShade: .2 }],
  ['pragmatic', 'tactical_mastermind', { possessionTempo: 0, huckAppetite: 0 }],
]
export const candidates = catalogFamilies.flatMap(([family, profile, base]) => Array.from({ length: 8 }, (_, i) => ({
  id: `${family}-${i}`, family, profile, policy: i < 4 ? 'production' : 'stable', cooldown: 3,
  directives: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, COACH_DIRECTIVE_KIND[k] ? v : v * [.6, 1][i % 2]])),
  ...(i % 4 >= 2 ? { instructions: family === 'deep' ? ['look_downfield'] : family === 'control' ? ['dump_first'] : ['take_space'], instructionRole: family === 'deep' || family === 'control' ? 'handler' : 'cutter' } : {}),
})))

export function rosterId(split, family, replicate, side) { return `${split}-${family}-${replicate}-${side}` }
export function makeRosters() {
  const teams = {}, profiles = []
  for (const [splitIndex, split] of ['development', 'validation', 'holdout'].entries()) for (const [f, family] of families.entries()) for (let replicate = 0; replicate < 3; replicate++) {
    const rng = createRng(810031 + splitIndex * 100000 + f * 1000 + replicate * 37)
    const players = Array.from({ length: 18 }, (_, i) => {
      const skills = {}
      for (const [category, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
        const values = keys.map(() => (rng.float() - .5) * 6)
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        skills[category] = Object.fromEntries(keys.map((k, n) => [k, 81 + values[n] - mean]))
      }
      const boosts = family === 'handlers' ? ['throwing', 'mental'] : family === 'flow' ? ['physical', 'offensive'] : family === 'deep' ? ['throwing', 'physical'] : family === 'defenders' ? ['defensive', 'mental'] : family === 'technical' ? ['throwing', 'offensive'] : []
      for (const [category, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) for (const k of keys) {
        // Equal mean per category group; exact realized means are reported rather than assumed equal after normalization.
        skills[category][k] += boosts.length ? boosts.includes(category) ? 4.5 : -3 : 0
      }
      return { id: i, name: `Fixture ${i + 1}`, position: i % 7 < 3 ? 'handler' : 'cutter', age: 26,
        skills: normalizePlayerSkills(skills), traits: [], morale: 65, form: 72, currentStamina: 100,
        body: { heightCm: 183 + (i % 5) * 2, weightKg: 79 + (i % 4) * 2 }, throwingHand: 'right',
        injury: null }
    })
    for (const side of ['a', 'b']) {
      const id = rosterId(split, family, replicate, side)
      teams[id] = { id, name: id, aiCoachProfile: null, players: players.map((p, i) => ({ ...structuredClone(p), id: `${id}-p${i}` })) }
      profiles.push({ id, split, family, replicate, mean: players.reduce((s, p) => s + Object.values(p.skills).flatMap(Object.values).reduce((a, b) => a + b, 0), 0) / (players.length * Object.values(PLAYER_STAT_CATEGORIES).flat().length) })
    }
  }
  return { teams, profiles, pairs: [[rosterId('development', 'balanced', 0, 'a'), rosterId('development', 'balanced', 0, 'b')]],
    source: 'Synthetic explicitly materialized detailed skills, traits, body and state. Paired mirrored rosters, disjoint splits.' }
}

export function makeQueues(smoke = false) {
  const queues = Object.fromEntries(phases.map(p => [p.id, []])); let serial = 0
  const add = (phase, x) => { const j = { id: `${phase}-${String(++serial).padStart(6, '0')}`, phase, kind: 'match', seed: 9100301 + serial * 37,
    points: 1, rotate: false, homeConfig: {}, awayConfig: {}, observe: true, keepReplays: false,
    home: rosterId('development', 'balanced', 0, 'a'), away: rosterId('development', 'balanced', 0, 'b'),
    wind: { speedMph: 0, directionDeg: 0 }, lockWind: true, ...x }; queues[phase].push(j); return j }
  for (const variant of ['native', 'adapter', 'unobserved', 'repeat']) add('integrity', { seed: 9200341, points: smoke ? 2 : 3, rotate: true,
    homeConfig: { profile: 'balanced_pro' }, awayConfig: { profile: 'tempo_pusher' },
    native: variant === 'native', observe: variant !== 'unobserved', pair: 'engine-equivalence', variant })
  if (smoke) {
    add('controls', { homeConfig: { instructions: ['dump_first'], directives: { possessionTempo: -.5 } } })
    add('matrix', { homeConfig: { attack: 'hex_offense' }, awayConfig: { defense: 'zone_cup' } })
    add('coaches', { homeConfig: candidates[36], points: 2, rotate: true })
    add('adaptation', { kind: 'adaptation' })
    return queues
  }
  const controls = [
    ...COACH_SLIDER_KEYS.map(key => ({ family: 'directive', key, values: COACH_DIRECTIVE_KIND[key] === 'toggle' ? [0, 1] : [0, -1, 1], config: v => ({ directives: { [key]: v } }) })),
    ...Object.keys(PLAYER_INSTRUCTION_DEFS).map(key => ({ family: 'instruction', key, values: [0, 1], config: v => ({ instructions: v ? [key] : [] }) })),
    { family: 'force', key: 'force', values: Object.values(FORCE_SIDES), config: v => ({ force: v }) },
  ]
  for (let r = 0; r < 32; r++) for (const c of controls) for (const context of ['person', 'zone_cup']) for (const v of c.values)
    add('controls', { seed: 9300000 + r, control: c.key, controlFamily: c.family, value: v, context,
      block: `${c.key}-${context}-${r}`, homeConfig: c.config(v), awayConfig: { defense: context } })
  for (let r = 0; r < 32; r++) for (const attack of Object.values(ATTACK_STYLES)) for (const defense of Object.values(DEFENSE_STYLES))
    add('matrix', { seed: 9400000 + r, cell: `${attack}|${defense}`, round: r,
      homeConfig: { attack }, awayConfig: { defense }, keepReplays: r === 0, points: 1 })
  // Full games first. Every completed round covers every coach before increasing depth.
  for (let r = 0; r < 8; r++) for (const profile of AI_COACH_ARCHETYPES) for (const swap of [false, true]) add('coaches', {
    seed: 9500000 + r, points: null, rotate: true, coach: profile.id, round: r, swap,
    block: `${profile.id}-${r}`, homeConfig: { profile: profile.id }, awayConfig: sentinels[r % 3],
    home: rosterId('development', families[r % 6], r % 3, 'a'), away: rosterId('development', families[r % 6], r % 3, 'b'),
    keepReplays: r === 0 && !swap })
  for (let r = 0; r < 128; r++) add('adaptation', { kind: 'adaptation', seed: 9600000 + r, lossStreak: [0, 4, 6][r % 3] })
  // Component ablations and state/instruction interactions use full production points.
  for (let r = 0; r < 8; r++) for (const ablation of ['none', 'preferences', 'biases', 'instructions', 'lineup', 'adaptation', 'rotation'])
    for (const profile of AI_COACH_ARCHETYPES) add('adaptation', { coach: profile.id, ablation, round: r, points: 3, rotate: true,
      seed: 9610000 + r, block: `${profile.id}-${r}`, homeConfig: { profile: profile.id, ablation }, awayConfig: sentinels[r % 3] })
  const extras = []
  for (let r = 0; r < 16; r++) for (const [condition, levels] of [['familiarity', [30, 65, 90]], ['morale', [35, 65, 90]], ['energy', [35, 65, 100]]])
    for (const v of levels) extras.push({ seed: 9700000 + r, control: condition, value: v, [condition]: v,
      homeConfig: { profile: 'motion_system', instructions: ['play_fast'] }, awayConfig: sentinels[0], points: 2 })
  for (let r = 0; r < 16; r++) for (const attribute of ['offensive.routeCraft', 'offensive.resetMovement', 'offensive.cutTiming', 'mental.spatialAwareness', 'defensive.matchupReading', 'defensive.resetDefense']) for (const v of [72, 81, 90])
    extras.push({ seed: 9710000 + r, control: attribute, value: v, attribute, attributeValue: v, attributeSide: attribute.startsWith('defensive') ? 'away' : 'home', homeConfig: { instructions: ['cut_under'] }, points: 2 })
  for (const x of extras) { const j = add('controls', x); queues.controls.pop(); queues.controls.splice(Math.min(200 + extras.indexOf(x) * 4, queues.controls.length), 0, j) }
  for (let r = 0; r < 32; r++) for (const c of candidates) for (const swap of [false, true]) add('development', {
    candidate: c.id, family: c.family, round: r, swap, seed: 9800000 + r, block: `${c.id}-${r}`,
    homeConfig: c, awayConfig: sentinels[r % 3], points: 2,
    home: rosterId('development', families[r % 6], r % 3, 'a'), away: rosterId('development', families[r % 6], r % 3, 'b'),
    wind: { speedMph: [0, 0, 7, 14][r % 4], directionDeg: [0, 90, 180][r % 3] } })
  return queues
}

export function selectedQueue(phase, configs, rounds) {
  const split = phase === 'holdout' ? 'holdout' : 'validation', q = []
  for (let r = 0; r < rounds; r++) for (const c of configs) for (const swap of [false, true]) {
    const id = `${phase}-${c.id}-${r}-${swap ? 'b' : 'a'}`
    q.push({ id, phase, kind: 'match', candidate: c.id, family: c.family, block: `${c.id}-${r}`, round: r, swap,
      seed: (phase === 'holdout' ? 10000000 : 9900000) + r, points: phase === 'holdout' ? null : 3,
      rotate: phase === 'holdout', observe: true, keepReplays: phase === 'holdout' && r < 2 && !swap,
      home: rosterId(split, families[r % 6], Math.floor(r / 6) % 3, 'a'), away: rosterId(split, families[r % 6], Math.floor(r / 6) % 3, 'b'),
      homeConfig: c, awayConfig: sentinels[r % 3], lockWind: true,
      wind: { speedMph: r < 6 ? 0 : [7, 14][r % 2], directionDeg: (r % 4) * 90 } })
  }
  return q
}
