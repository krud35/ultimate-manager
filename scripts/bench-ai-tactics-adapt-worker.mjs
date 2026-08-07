/**
 * Worker: uruchamia N meczów jednej rundy i zwraca agregat.
 */
import { parentPort, workerData } from 'node:worker_threads'
import {
  initMatchSession,
  playNextPoint,
  ATTACK_STYLES,
  DEFENSE_STYLES,
  FORCE_SIDES,
  defaultTacticsForPlayers,
  MATCH_CONFIG,
} from '../src/matchEngine/index.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { createRng } from '../src/matchEngine/rng.js'
import {
  PLAYER_STAT_CATEGORIES,
  CATEGORY_STAT_RANGES,
  getOverallRating,
  normalizePlayerSkills,
  clampSubStat,
} from '../src/models/playerStats.js'

const {
  matches,
  seedBase,
  homeStronger,
  aiHome,
  aiAway,
  mode,
  strongerDelta,
  rosterSize,
  pointsToWin,
} = workerData

MATCH_CONFIG.pointsToWin = pointsToWin

const ATTACK_POOL = Object.values(ATTACK_STYLES)
const DEFENSE_POOL = Object.values(DEFENSE_STYLES)
const FORCE_POOL = Object.values(FORCE_SIDES)

const ADAPTIVE_COACH = {
  id: 'bench_adaptive',
  label: 'Bench Adaptive',
  attackMindset: 'balanced',
  defenseMindset: 'balanced',
  preferredAttackStyles: [
    ATTACK_STYLES.VERTICAL_STACK,
    ATTACK_STYLES.HORIZONTAL_STACK,
    ATTACK_STYLES.HEX_OFFENSE,
    ATTACK_STYLES.MOTION_OFFENSE,
    ATTACK_STYLES.ZONE_OFFENSE,
  ],
  preferredDefenseStyles: [
    DEFENSE_STYLES.PERSON,
    DEFENSE_STYLES.CLAM,
    DEFENSE_STYLES.ZONE_CUP,
    DEFENSE_STYLES.ALL_PERSON,
  ],
  preferredForce: FORCE_SIDES.FORCE_FOREHAND,
  directiveBias: {},
  adaptability: 0.92,
  conservatism: 0.22,
}

const FIXED_COACH = {
  ...ADAPTIVE_COACH,
  id: 'bench_fixed',
  label: 'Bench Fixed',
  adaptability: 0,
  conservatism: 1,
}

function pick(rng, arr) {
  return arr[Math.floor(rng.float() * arr.length)]
}

function randIn(rng, lo, hi) {
  return lo + rng.float() * (hi - lo)
}

function makeSkills(rng, baseBias = 0) {
  const skills = {}
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    const { min, max } = CATEGORY_STAT_RANGES[cat]
    skills[cat] = {}
    for (const key of keys) {
      const mid = (min + max) / 2
      const spread = (max - min) * 0.28
      const raw = mid + baseBias + (rng.float() * 2 - 1) * spread
      skills[cat][key] = clampSubStat(raw, cat)
    }
  }
  return normalizePlayerSkills(skills)
}

function bumpSkills(skills, delta) {
  const nested = normalizePlayerSkills(skills)
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    for (const key of keys) {
      nested[cat][key] = clampSubStat(nested[cat][key] + delta, cat)
    }
  }
  return nested
}

function makePlayer(id, rng, { position, skillBias = 0, ovrBump = 0 }) {
  let skills = makeSkills(rng, skillBias)
  if (ovrBump) skills = bumpSkills(skills, ovrBump)
  return {
    id,
    firstName: `P${id}`,
    lastName: position === 'Handler' ? 'Handler' : 'Cutter',
    name: `P${id}`,
    position,
    jersey: (id % 99) + 1,
    skills,
  }
}

function makeRoster(rng, { idBase, ovrBump = 0 }) {
  const players = []
  for (let i = 0; i < rosterSize; i += 1) {
    const position = i < 6 ? 'Handler' : 'Cutter'
    players.push(
      makePlayer(idBase + i, rng, {
        position,
        skillBias: (rng.float() - 0.5) * 2,
        ovrBump,
      }),
    )
  }
  return players
}

function cloneRosterEqual(players, idBase) {
  return players.map((p, i) => ({
    ...p,
    id: idBase + i,
    firstName: `P${idBase + i}`,
    name: `P${idBase + i}`,
    skills: structuredClone(p.skills),
  }))
}

function rosterAvgOvr(players) {
  const sum = players.reduce((s, p) => s + getOverallRating(p.skills), 0)
  return sum / Math.max(1, players.length)
}

function makeTeam(id, name, players, coach) {
  return {
    id,
    name,
    players,
    aiCoachProfile: coach,
    tacticsFamiliarity: 55,
  }
}

function randomTacticsPackage(rng, players) {
  const attack = pick(rng, ATTACK_POOL)
  const defense = pick(rng, DEFENSE_POOL)
  const force = pick(rng, FORCE_POOL)
  const base = defaultTacticsForPlayers(players)
  return normalizeTactics({
    ...base,
    oLineAttackStyle: attack,
    dLineAttackStyle: attack,
    oLineDefenseStyle: defense,
    dLineDefenseStyle: defense,
    forceSide: force,
    oLineCoachDirectives: {
      ...(base.oLineCoachDirectives ?? {}),
      huckAppetite: randIn(rng, -0.4, 0.55),
      possessionTempo: randIn(rng, -0.45, 0.45),
      breakAppetite: randIn(rng, -0.3, 0.4),
      creativity: randIn(rng, -0.25, 0.35),
      coverageShade: randIn(rng, -0.3, 0.35),
    },
    dLineCoachDirectives: {
      ...(base.dLineCoachDirectives ?? {}),
      huckAppetite: randIn(rng, -0.4, 0.4),
      possessionTempo: randIn(rng, -0.35, 0.35),
      coverageShade: randIn(rng, -0.25, 0.4),
      creativity: randIn(rng, -0.2, 0.35),
    },
    tacticsFamiliarity: 55,
  })
}

function styleSnap(t) {
  if (!t) return null
  return {
    oAtk: t.oLineAttackStyle ?? t.attackStyle,
    dAtk: t.dLineAttackStyle,
    oDef: t.oLineDefenseStyle ?? t.defenseStyle,
    dDef: t.dLineDefenseStyle,
    force: t.forceSide,
    huck: t.oLineCoachDirectives?.huckAppetite ?? t.coachDirectives?.huckAppetite ?? 0,
  }
}

function styleChanged(a, b) {
  if (!a || !b) return { attack: false, defense: false, force: false, huck: false, any: false }
  const attack = a.oAtk !== b.oAtk || a.dAtk !== b.dAtk
  const defense = a.oDef !== b.oDef || a.dDef !== b.dDef
  const force = a.force !== b.force
  const huck = Math.abs((a.huck ?? 0) - (b.huck ?? 0)) >= 0.2
  return { attack, defense, force, huck, any: attack || defense || force || huck }
}

function simulateTrackedMatch({
  homeTeam,
  awayTeam,
  homeTactics,
  awayTactics,
  seed,
  aiHome: ah,
  aiAway: aa,
}) {
  let session = initMatchSession({
    homeTeam,
    awayTeam,
    homeTactics,
    awayTactics,
    seed,
  })

  const startHome = styleSnap(session.home.tactics)
  const startAway = styleSnap(session.away.tactics)
  let prevHome = startHome
  let prevAway = startAway
  const opts = { rotateHome: true, rotateAway: true, aiHome: ah, aiAway: aa }

  while (session.status !== 'finished') {
    session = playNextPoint(
      session,
      {
        homeTactics: session.home.tactics,
        awayTactics: session.away.tactics,
      },
      opts,
    )
    prevHome = styleSnap(session.home.tactics)
    prevAway = styleSnap(session.away.tactics)
  }

  return {
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    winner: session.winner,
    homeChanged: styleChanged(startHome, prevHome),
    awayChanged: styleChanged(startAway, prevAway),
  }
}

function emptyAgg() {
  return {
    n: 0,
    homeWins: 0,
    awayWins: 0,
    draws: 0,
    homeGoals: 0,
    awayGoals: 0,
    homeChangedAny: 0,
    awayChangedAny: 0,
    homeAttackChanges: 0,
    awayAttackChanges: 0,
    homeDefenseChanges: 0,
    awayDefenseChanges: 0,
    homeHuckChanges: 0,
    awayHuckChanges: 0,
    adaptiveSideWins: 0,
    fixedSideWins: 0,
    avgHomeOvr: 0,
    avgAwayOvr: 0,
  }
}

const agg = emptyAgg()

for (let i = 0; i < matches; i += 1) {
  const matchSeed = (seedBase + i * 9973) >>> 0
  const rng = createRng(matchSeed || 1)

  const basePlayers = makeRoster(rng, { idBase: 1000 })
  const homePlayers = homeStronger
    ? basePlayers.map((p) => ({
        ...p,
        skills: bumpSkills(p.skills, strongerDelta),
      }))
    : basePlayers
  const awayPlayers = cloneRosterEqual(basePlayers, 2000)

  const homeTeam = makeTeam(
    'ai1',
    'AI 1',
    homePlayers,
    aiHome ? ADAPTIVE_COACH : FIXED_COACH,
  )
  const awayTeam = makeTeam(
    'ai2',
    'AI 2',
    awayPlayers,
    aiAway ? ADAPTIVE_COACH : FIXED_COACH,
  )

  const stylePkg = randomTacticsPackage(rng, homePlayers)
  const homeTactics = normalizeTactics({
    ...defaultTacticsForPlayers(homePlayers),
    oLineAttackStyle: stylePkg.oLineAttackStyle,
    dLineAttackStyle: stylePkg.dLineAttackStyle,
    oLineDefenseStyle: stylePkg.oLineDefenseStyle,
    dLineDefenseStyle: stylePkg.dLineDefenseStyle,
    forceSide: stylePkg.forceSide,
    oLineCoachDirectives: stylePkg.oLineCoachDirectives,
    dLineCoachDirectives: stylePkg.dLineCoachDirectives,
    coachDirectives: stylePkg.oLineCoachDirectives,
    tacticsFamiliarity: 55,
  })
  const awayTactics = normalizeTactics({
    ...defaultTacticsForPlayers(awayPlayers),
    oLineAttackStyle: stylePkg.oLineAttackStyle,
    dLineAttackStyle: stylePkg.dLineAttackStyle,
    oLineDefenseStyle: stylePkg.oLineDefenseStyle,
    dLineDefenseStyle: stylePkg.dLineDefenseStyle,
    forceSide: stylePkg.forceSide,
    oLineCoachDirectives: structuredClone(stylePkg.oLineCoachDirectives),
    dLineCoachDirectives: structuredClone(stylePkg.dLineCoachDirectives),
    coachDirectives: structuredClone(stylePkg.oLineCoachDirectives),
    tacticsFamiliarity: 55,
  })

  const result = simulateTrackedMatch({
    homeTeam,
    awayTeam,
    homeTactics,
    awayTactics,
    seed: (matchSeed ^ 0xa5a5a5a5) >>> 0 || 1,
    aiHome,
    aiAway,
  })

  agg.n += 1
  agg.homeGoals += result.homeScore
  agg.awayGoals += result.awayScore
  agg.avgHomeOvr += rosterAvgOvr(homePlayers)
  agg.avgAwayOvr += rosterAvgOvr(awayPlayers)
  if (result.winner === 'home') agg.homeWins += 1
  else if (result.winner === 'away') agg.awayWins += 1
  else agg.draws += 1
  if (result.homeChanged?.any) agg.homeChangedAny += 1
  if (result.awayChanged?.any) agg.awayChangedAny += 1
  if (result.homeChanged?.attack) agg.homeAttackChanges += 1
  if (result.awayChanged?.attack) agg.awayAttackChanges += 1
  if (result.homeChanged?.defense) agg.homeDefenseChanges += 1
  if (result.awayChanged?.defense) agg.awayDefenseChanges += 1
  if (result.homeChanged?.huck) agg.homeHuckChanges += 1
  if (result.awayChanged?.huck) agg.awayHuckChanges += 1
  if (mode === 'fixed_vs_adaptive') {
    if (result.winner === 'away') agg.adaptiveSideWins += 1
    if (result.winner === 'home') agg.fixedSideWins += 1
  }

  if (parentPort && ((i + 1) % 5 === 0 || i === matches - 1)) {
    parentPort.postMessage({ type: 'progress', done: i + 1, total: matches })
  }
}

parentPort.postMessage({ type: 'result', agg })
