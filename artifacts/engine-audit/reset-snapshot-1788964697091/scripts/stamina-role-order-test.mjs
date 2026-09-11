/**
 * Zużycie staminy / punkt wg podroli i rozkazów indywidualnych.
 * Wynik: JSON na stdout.
 */
import { writeFileSync } from 'node:fs'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { initMatchSession, cloneStaminaMaps, getStamina } from '../src/matchEngine/index.js'
import { simulatePoint } from '../src/matchEngine/point.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { staminaSpentBetween, residualCostFromPointSpent } from '../src/matchEngine/stamina.js'
import { tacticsForTeam } from '../src/matchEngine/aiLineup.js'
import {
  HANDLER_SUB_ROLES,
  CUTTER_SUB_ROLES,
} from '../src/matchEngine/playerSubRoles.js'
import { normalizePlayerSkills } from '../src/models/playerStats.js'

const SEEDS = [11, 22, 33, 44]
const POINTS_PER_SEED = 8
const CROSS_SEEDS = [11, 22, 33]
const ENDURANCE = 70

const ROLE_ORDER = [
  HANDLER_SUB_ROLES.PRIMARY,
  HANDLER_SUB_ROLES.RESET,
  CUTTER_SUB_ROLES.PRIMARY,
  CUTTER_SUB_ROLES.SECONDARY,
  CUTTER_SUB_ROLES.CONTINUATION,
  CUTTER_SUB_ROLES.FILLER,
]

const O_ORDERS = [
  { id: 'none', label: 'Bez rozkazu' },
  { id: 'cut_under', label: 'Biegaj under' },
  { id: 'cut_deep', label: 'Biegaj deep' },
  { id: 'give_space', label: 'Nie zabieraj przestrzeni' },
]

const D_ORDERS = [
  { id: 'none', label: 'Bez rozkazu' },
  { id: 'shutdown', label: 'Shutdown D' },
  { id: 'tight_mark', label: 'Bliskie krycie' },
]

function equalizeEndurance(team) {
  for (const p of team.players) {
    normalizePlayerSkills(p)
    const phys = p.skills.physical
    if (phys && typeof phys === 'object') {
      phys.endurance = ENDURANCE
      phys.agility = ENDURANCE
    }
  }
}

function pickLine(players, n) {
  return players.slice(0, n).map((p) => p.id)
}

function buildSubRoles(oLine) {
  // Vertical: H1, H2, C1..C5
  const roles = [
    HANDLER_SUB_ROLES.PRIMARY,
    HANDLER_SUB_ROLES.RESET,
    CUTTER_SUB_ROLES.PRIMARY,
    CUTTER_SUB_ROLES.SECONDARY,
    CUTTER_SUB_ROLES.CONTINUATION,
    CUTTER_SUB_ROLES.FILLER,
    CUTTER_SUB_ROLES.FILLER,
  ]
  const map = {}
  oLine.forEach((id, i) => {
    map[String(id)] = roles[i] ?? CUTTER_SUB_ROLES.FILLER
  })
  return map
}

function makeTactics(home, oLine, dLine, subRoles, instructions) {
  const base = tacticsForTeam(home, { withPlayerInstructions: false })
  return normalizeTactics({
    ...base,
    oLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    dLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON,
    dLineDefenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    playerSubRoles: subRoles,
    playerInstructions: instructions ?? {},
    lineupWhenOffenseStartPlayerIds: oLine,
    lineupWhenDefenseStartPlayerIds: dLine,
  })
}

function refillStamina(session) {
  for (const side of ['home', 'away']) {
    for (const id of Object.keys(session.stamina[side])) {
      session.stamina[side][id] = 100
    }
    for (const p of session[side].players) {
      p.currentStamina = 100
      p.developmentFatigue = 0
    }
  }
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * (s.length - 1))))
  return s[i]
}

function summarize(samples) {
  return {
    n: samples.length,
    mean: Number(avg(samples).toFixed(2)),
    p25: Number(pct(samples, 25).toFixed(2)),
    p50: Number(pct(samples, 50).toFixed(2)),
    p75: Number(pct(samples, 75).toFixed(2)),
    max: Number((samples.length ? Math.max(...samples) : 0).toFixed(2)),
  }
}

function runCondition({ seed, instructions, sideMode }) {
  const home = structuredClone(demoHomeTeam)
  const away = structuredClone(demoAwayTeam)
  equalizeEndurance(home)
  equalizeEndurance(away)

  const oLine = pickLine(home.players, 7)
  const dLine = pickLine(home.players, 7)
  const subRoles = buildSubRoles(oLine)
  const homeTactics = makeTactics(home, oLine, dLine, subRoles, instructions)
  const awayTactics = tacticsForTeam(away, { withPlayerInstructions: false })

  const session = initMatchSession({
    homeTeam: home,
    awayTeam: away,
    homeTactics,
    awayTactics,
    seed,
  })
  session.home.tactics = homeTactics
  session.away.tactics = awayTactics

  const roleById = Object.fromEntries(
    Object.entries(subRoles).map(([id, role]) => [Number(id), role]),
  )
  const samples = {}
  const ensure = (k) => {
    if (!samples[k]) samples[k] = []
    return samples[k]
  }

  for (let i = 0; i < POINTS_PER_SEED; i += 1) {
    // Wymuś stronę: nie zależymy od przebiegu wyniku / pulli.
    if (sideMode === 'offense') session.pullTeam = 'away'
    else if (sideMode === 'defense') session.pullTeam = 'home'

    const pullBefore = session.pullTeam
    const attackTeamId = pullBefore === 'home' ? 'away' : 'home'
    const homeRole = attackTeamId === 'home' ? 'offense' : 'defense'

    refillStamina(session)
    session.home.tactics = homeTactics
    session.away.tactics = awayTactics

    const before = cloneStaminaMaps(session.stamina)
    const pointResult = simulatePoint({
      homeTeam: session.home,
      awayTeam: session.away,
      pullTeam: session.pullTeam,
      pointIndex: session.pointIndex,
      rng: session.rng,
      boxScore: session.boxScore,
      matchStats: session.matchStats,
      stamina: session.stamina,
      wind: session.wind,
    })

    {
      const trackedIds = sideMode === 'defense' ? dLine : oLine

      for (const id of trackedIds) {
        const role = roleById[id]
        const spent = staminaSpentBetween(before.home, session.stamina.home, id)
        const residual = residualCostFromPointSpent(
          spent,
          homeRole,
          home.players.find((p) => p.id === id),
        )
        ensure(role).push(spent)
        ensure(`${role}__total`).push(spent + residual)
        ensure(`${role}__residual`).push(residual)
      }

      if (instructions) {
        for (const [pid, list] of Object.entries(instructions)) {
          if (!list?.length) continue
          const id = Number(pid)
          const spent = staminaSpentBetween(before.home, session.stamina.home, id)
          const residual = residualCostFromPointSpent(
            spent,
            homeRole,
            home.players.find((p) => p.id === id),
          )
          const tag = `instr:${list[0]}`
          ensure(tag).push(spent)
          ensure(`${tag}__total`).push(spent + residual)
        }
      }
    }

    if (pointResult.scoringTeam === 'home') session.homeScore += 1
    else session.awayScore += 1
    session.pointIndex += 1
  }

  return samples
}

function mergeSamples(into, add) {
  for (const [k, arr] of Object.entries(add)) {
    if (!into[k]) into[k] = []
    into[k].push(...arr)
  }
}

function run() {
  const byRole = {}
  for (const seed of SEEDS) {
    mergeSamples(
      byRole,
      runCondition({
        seed,
        instructions: {},
        sideMode: 'offense',
      }),
    )
  }

  const roleRows = ROLE_ORDER.map((role) => ({
    role,
    spent: summarize(byRole[role] ?? []),
    residual: summarize(byRole[`${role}__residual`] ?? []),
    total: summarize(byRole[`${role}__total`] ?? []),
  }))

  // Cross: each cutter role × each O order
  const cross = []
  for (const role of [
    CUTTER_SUB_ROLES.PRIMARY,
    CUTTER_SUB_ROLES.SECONDARY,
    CUTTER_SUB_ROLES.CONTINUATION,
    CUTTER_SUB_ROLES.FILLER,
  ]) {
    for (const order of O_ORDERS) {
      const home = structuredClone(demoHomeTeam)
      const oLine = pickLine(home.players, 7)
      const subRoles = buildSubRoles(oLine)
      const targetId = Number(
        Object.entries(subRoles).find(([, r]) => r === role)?.[0] ?? oLine[2],
      )
      const instructions =
        order.id === 'none' ? {} : { [String(targetId)]: [order.id] }
      const bag = {}
      for (const seed of CROSS_SEEDS) {
        mergeSamples(
          bag,
          runCondition({
            seed: seed + ROLE_ORDER.indexOf(role) * 31 + order.id.length * 13,
            instructions,
            sideMode: 'offense',
          }),
        )
      }
      const spentArr =
        order.id === 'none'
          ? bag[role] ?? []
          : bag[`instr:${order.id}`] ?? bag[role] ?? []
      cross.push({
        role,
        order: order.id,
        orderLabel: order.label,
        spent: summarize(spentArr),
      })
    }
  }

  // Handlers × O orders
  const handlerCross = []
  for (const role of [HANDLER_SUB_ROLES.PRIMARY, HANDLER_SUB_ROLES.RESET]) {
    for (const order of O_ORDERS) {
      const home = structuredClone(demoHomeTeam)
      const oLine = pickLine(home.players, 7)
      const subRoles = buildSubRoles(oLine)
      const targetId = Number(
        Object.entries(subRoles).find(([, r]) => r === role)?.[0],
      )
      const instructions =
        order.id === 'none' ? {} : { [String(targetId)]: [order.id] }
      const bag = {}
      for (const seed of CROSS_SEEDS) {
        mergeSamples(
          bag,
          runCondition({
            seed: seed + 200 + ROLE_ORDER.indexOf(role) * 17 + order.id.length,
            instructions,
            sideMode: 'offense',
          }),
        )
      }
      handlerCross.push({
        role,
        order: order.id,
        orderLabel: order.label,
        spent: summarize(
          order.id === 'none'
            ? bag[role] ?? []
            : bag[`instr:${order.id}`] ?? bag[role] ?? [],
        ),
      })
    }
  }

  const byOOrder = {}
  for (const order of O_ORDERS) {
    const row = cross.find(
      (r) => r.role === CUTTER_SUB_ROLES.PRIMARY && r.order === order.id,
    )
    byOOrder[order.id] = {
      label: order.label,
      target: 'primary_cutter',
      spent: row?.spent ?? summarize([]),
    }
  }

  // D orders on first D-line player (same as O-line[0] in our setup)
  const byDOrder = {}
  const dTargetId = pickLine(structuredClone(demoHomeTeam).players, 7)[0]
  for (const order of D_ORDERS) {
    const bag = {}
    const instructions =
      order.id === 'none' ? {} : { [String(dTargetId)]: [order.id] }
    for (const seed of SEEDS) {
      mergeSamples(
        bag,
        runCondition({
          seed: seed + 100 + order.id.length * 19,
          instructions,
          sideMode: 'defense',
        }),
      )
    }
    const roleKey = Object.entries(
      buildSubRoles(pickLine(structuredClone(demoHomeTeam).players, 7)),
    ).find(([id]) => Number(id) === dTargetId)?.[1]
    byDOrder[order.id] = {
      label: order.label,
      targetRole: roleKey,
      spent: summarize(
        order.id === 'none'
          ? bag[roleKey] ?? []
          : bag[`instr:${order.id}`] ?? bag[roleKey] ?? [],
      ),
      total: summarize(
        order.id === 'none'
          ? bag[`${roleKey}__total`] ?? []
          : bag[`instr:${order.id}__total`] ?? bag[`${roleKey}__total`] ?? [],
      ),
    }
  }

  const out = {
    meta: {
      seeds: SEEDS.length,
      crossSeeds: CROSS_SEEDS.length,
      pointsPerSeed: POINTS_PER_SEED,
      enduranceNormalized: ENDURANCE,
      attackStyle: 'vertical_stack',
      defenseStyle: 'person',
      metric: 'stamina spent during point (before residual), refill 100 each point',
      note: 'Home O/D line fixed; AI rotation off. Residual reported separately for roles.',
    },
    byRole: roleRows,
    byOOrderOnPrimaryCutter: byOOrder,
    cutterOrderCross: cross,
    handlerOrderCross: handlerCross,
    byDOrder: byDOrder,
  }

  const path = new URL('./stamina-role-order-results.json', import.meta.url)
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(
    JSON.stringify(
      {
        byRole: roleRows.map((r) => ({
          role: r.role,
          mean: r.spent.mean,
          p50: r.spent.p50,
          n: r.spent.n,
        })),
        byOOrderOnPrimaryCutter: Object.fromEntries(
          Object.entries(byOOrder).map(([k, v]) => [k, { mean: v.spent.mean, n: v.spent.n }]),
        ),
        byDOrder: Object.fromEntries(
          Object.entries(byDOrder).map(([k, v]) => [k, { mean: v.spent.mean, n: v.spent.n }]),
        ),
        cutterOrderCross: cross.map((r) => ({
          role: r.role,
          order: r.order,
          mean: r.spent.mean,
          n: r.spent.n,
        })),
        handlerOrderCross: handlerCross.map((r) => ({
          role: r.role,
          order: r.order,
          mean: r.spent.mean,
          n: r.spent.n,
        })),
      },
      null,
      2,
    ),
  )
  console.error('Wrote', path.pathname)
}

run()
