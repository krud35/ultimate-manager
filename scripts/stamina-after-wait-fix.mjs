/**
 * Szybki pomiar średniego zużycia staminy / punkt po zmianach WAITING.
 */
import { writeFileSync } from 'node:fs'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { initMatchSession, cloneStaminaMaps } from '../src/matchEngine/index.js'
import { simulatePoint } from '../src/matchEngine/point.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../src/matchEngine/tacticsModifiers.js'
import { staminaSpentBetween, residualCostFromPointSpent } from '../src/matchEngine/stamina.js'
import { tacticsForTeam } from '../src/matchEngine/aiLineup.js'
import { HANDLER_SUB_ROLES, CUTTER_SUB_ROLES } from '../src/matchEngine/playerSubRoles.js'
import { normalizePlayerSkills } from '../src/models/playerStats.js'

const SEEDS = [11, 22, 33, 44, 55]
const POINTS = 10
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
    if (p.skills?.physical) {
      p.skills.physical.endurance = ENDURANCE
      p.skills.physical.agility = ENDURANCE
    }
  }
}

function avg(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
}
function pct(a, p) {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1)))]
}
function summarize(samples) {
  return {
    n: samples.length,
    mean: Number(avg(samples).toFixed(2)),
    p50: Number(pct(samples, 50).toFixed(2)),
    p75: Number(pct(samples, 75).toFixed(2)),
    max: Number((samples.length ? Math.max(...samples) : 0).toFixed(2)),
  }
}

function buildSubRoles(oLine) {
  const roles = [
    HANDLER_SUB_ROLES.PRIMARY,
    HANDLER_SUB_ROLES.RESET,
    CUTTER_SUB_ROLES.PRIMARY,
    CUTTER_SUB_ROLES.SECONDARY,
    CUTTER_SUB_ROLES.CONTINUATION,
    CUTTER_SUB_ROLES.FILLER,
    CUTTER_SUB_ROLES.FILLER,
  ]
  return Object.fromEntries(oLine.map((id, i) => [String(id), roles[i]]))
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

function runBatch({ seeds, sideMode, instructionsFactory }) {
  const bags = {}
  const push = (k, v) => {
    if (!bags[k]) bags[k] = []
    bags[k].push(v)
  }

  for (const seed of seeds) {
    const home = structuredClone(demoHomeTeam)
    const away = structuredClone(demoAwayTeam)
    equalizeEndurance(home)
    equalizeEndurance(away)
    const oLine = home.players.slice(0, 7).map((p) => p.id)
    const dLine = oLine.slice()
    const subRoles = buildSubRoles(oLine)
    const roleById = Object.fromEntries(oLine.map((id) => [id, subRoles[String(id)]]))
    const instructions = instructionsFactory?.(oLine, subRoles) ?? {}
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

    for (let i = 0; i < POINTS; i += 1) {
      session.pullTeam = sideMode === 'offense' ? 'away' : 'home'
      for (const side of ['home', 'away']) {
        for (const id of Object.keys(session.stamina[side])) session.stamina[side][id] = 100
        for (const p of session[side].players) p.currentStamina = 100
      }
      const before = cloneStaminaMaps(session.stamina)
      const homeRole = sideMode === 'offense' ? 'offense' : 'defense'
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
      const ids = sideMode === 'offense' ? oLine : dLine
      for (const id of ids) {
        const role = roleById[id]
        const spent = staminaSpentBetween(before.home, session.stamina.home, id)
        const residual = residualCostFromPointSpent(
          spent,
          homeRole,
          home.players.find((p) => p.id === id),
        )
        push(role, spent)
        push(`${role}__total`, spent + residual)
      }
      if (instructions) {
        for (const [pid, list] of Object.entries(instructions)) {
          if (!list?.length) continue
          const id = Number(pid)
          const spent = staminaSpentBetween(before.home, session.stamina.home, id)
          push(`instr:${list[0]}`, spent)
        }
      }
      session.pointIndex += 1
      if (pointResult.scoringTeam === 'home') session.homeScore += 1
      else session.awayScore += 1
    }
  }
  return bags
}

function main() {
  console.error('byRole O…')
  const byRoleBags = runBatch({ seeds: SEEDS, sideMode: 'offense' })
  const byRole = ROLE_ORDER.map((role) => ({
    role,
    spent: summarize(byRoleBags[role] ?? []),
    total: summarize(byRoleBags[`${role}__total`] ?? []),
  }))

  console.error('PC orders…')
  const pcOrders = {}
  for (const order of O_ORDERS) {
    const bags = runBatch({
      seeds: SEEDS,
      sideMode: 'offense',
      instructionsFactory: (oLine) =>
        order.id === 'none' ? {} : { [String(oLine[2])]: [order.id] },
    })
    pcOrders[order.id] = {
      label: order.label,
      spent: summarize(
        order.id === 'none'
          ? bags[CUTTER_SUB_ROLES.PRIMARY] ?? []
          : bags[`instr:${order.id}`] ?? [],
      ),
    }
  }

  console.error('D orders…')
  const dOrders = {}
  for (const order of D_ORDERS) {
    const bags = runBatch({
      seeds: SEEDS,
      sideMode: 'defense',
      instructionsFactory: (oLine) =>
        order.id === 'none' ? {} : { [String(oLine[0])]: [order.id] },
    })
    const role = HANDLER_SUB_ROLES.PRIMARY
    dOrders[order.id] = {
      label: order.label,
      spent: summarize(
        order.id === 'none' ? bags[role] ?? [] : bags[`instr:${order.id}`] ?? [],
      ),
    }
  }

  const prev = {
    primary_handler: 8.36,
    reset_handler: 8.47,
    primary_cutter: 14.31,
    secondary_cutter: 13.81,
    continuation_cutter: 11.84,
    filler_cutter: 13.56,
  }

  const out = {
    meta: {
      seeds: SEEDS.length,
      points: POINTS,
      endurance: ENDURANCE,
      note: 'After waitingHoldSpeedMps — no sprint in WAITING',
      comparedTo: 'pre-change role means from stamina-role-order canvas',
    },
    byRole: byRole.map((r) => ({
      ...r,
      prevMean: prev[r.role] ?? null,
      delta: prev[r.role] != null ? Number((r.spent.mean - prev[r.role]).toFixed(2)) : null,
    })),
    pcOrders,
    dOrders,
  }

  writeFileSync(
    new URL('./stamina-after-wait-fix.json', import.meta.url),
    JSON.stringify(out, null, 2),
  )
  console.log(JSON.stringify(out, null, 2))
}

main()
