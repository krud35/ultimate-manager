/**
 * Worker: N meczów dla pary (attackStyle, defenseStyle).
 *
 * Obie drużyny grają TYM SAMYM atakiem (attackStyle).
 * Drużyna A (test ataku vs D): obrona bazowa (person)
 * Drużyna D (test obrony):    obrona = defenseStyle
 *
 * Dzięki temu różnica wyniku = skuteczność defenseStyle vs person
 * przy stałym ataku — bez biasu „Vertical na drugiej stronie”.
 *
 * Agregat z perspektywy drużyny A (atak vs testowana obrona):
 *   homeWins/homeGoals = drużyna A, awayWins/awayGoals = drużyna D
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
  normalizePlayerSkills,
  clampSubStat,
} from '../src/models/playerStats.js'

const {
  matches,
  seedBase,
  attackStyle,
  defenseStyle,
  rosterSize,
  pointsToWin,
  baselineAttack,
  baselineDefense,
  forceSide,
} = workerData

MATCH_CONFIG.pointsToWin = pointsToWin

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

function makeRoster(rng, idBase) {
  const players = []
  for (let i = 0; i < rosterSize; i += 1) {
    const position = i < 6 ? 'Handler' : 'Cutter'
    players.push({
      id: idBase + i,
      firstName: `P${idBase + i}`,
      lastName: position,
      name: `P${idBase + i}`,
      position,
      jersey: (idBase + i) % 99,
      skills: makeSkills(rng, (rng.float() - 0.5) * 2),
    })
  }
  return players
}

function cloneRoster(players, idBase) {
  return players.map((p, i) => ({
    ...p,
    id: idBase + i,
    firstName: `P${idBase + i}`,
    name: `P${idBase + i}`,
    skills: structuredClone(p.skills),
  }))
}

function tacticsFor(players, { attack, defense }) {
  const base = defaultTacticsForPlayers(players)
  return normalizeTactics({
    ...base,
    oLineAttackStyle: attack,
    dLineAttackStyle: attack,
    oLineDefenseStyle: defense,
    dLineDefenseStyle: defense,
    forceSide,
    tacticsFamiliarity: 55,
  })
}

function simulateOne({ homeTeam, awayTeam, homeTactics, awayTactics, seed }) {
  let session = initMatchSession({
    homeTeam,
    awayTeam,
    homeTactics,
    awayTactics,
    seed,
  })
  const opts = {
    rotateHome: true,
    rotateAway: true,
    aiHome: false,
    aiAway: false,
  }
  while (session.status !== 'finished') {
    session = playNextPoint(
      session,
      {
        homeTactics: session.home.tactics,
        awayTactics: session.away.tactics,
      },
      opts,
    )
  }
  return {
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    winner: session.winner,
  }
}

const agg = {
  n: 0,
  homeWins: 0,
  awayWins: 0,
  draws: 0,
  homeGoals: 0,
  awayGoals: 0,
  attackStyle,
  defenseStyle,
}

for (let i = 0; i < matches; i += 1) {
  const matchSeed = (seedBase + i * 7919) >>> 0 || 1
  const rng = createRng(matchSeed)
  const homePlayers = makeRoster(rng, 1000)
  const awayPlayers = cloneRoster(homePlayers, 2000)

  // Połowa meczów: swap stron (anti pull/home bias)
  const swap = i % 2 === 1
  const teamAPlayers = swap ? awayPlayers : homePlayers
  const teamDPlayers = swap ? homePlayers : awayPlayers

  // Ten sam atak po obu stronach; różni się tylko obrona
  const tacticsA = tacticsFor(teamAPlayers, {
    attack: attackStyle,
    defense: baselineDefense,
  })
  const tacticsD = tacticsFor(teamDPlayers, {
    attack: attackStyle, // ten sam atak — baselineAttack z workerData ignorujemy celowo
    defense: defenseStyle,
  })
  void baselineAttack

  const homeTeam = {
    id: 'home',
    name: swap ? 'DefTest' : 'AtkRef',
    players: homePlayers,
    tacticsFamiliarity: 55,
  }
  const awayTeam = {
    id: 'away',
    name: swap ? 'AtkRef' : 'DefTest',
    players: awayPlayers,
    tacticsFamiliarity: 55,
  }

  const result = simulateOne({
    homeTeam,
    awayTeam,
    homeTactics: swap ? tacticsD : tacticsA,
    awayTactics: swap ? tacticsA : tacticsD,
    seed: (matchSeed ^ 0x5a5a5a5a) >>> 0 || 1,
  })

  // Perspektywa drużyny A: ten sam atak, słabsza/bazowa obrona (person)
  // vs drużyny D: ten sam atak, testowana obrona
  // Wysoki WR A ⇒ testowana obrona D jest słaba (nie zatrzymuje ataku lepiej niż person)
  // Niski WR A / wysoki WR D ⇒ obrona D skuteczniejsza niż person
  const scoreA = swap ? result.awayScore : result.homeScore
  const scoreD = swap ? result.homeScore : result.awayScore
  const aWon =
    (swap && result.winner === 'away') || (!swap && result.winner === 'home')
  const dWon =
    (swap && result.winner === 'home') || (!swap && result.winner === 'away')

  agg.n += 1
  agg.homeGoals += scoreA
  agg.awayGoals += scoreD
  if (aWon) agg.homeWins += 1
  else if (dWon) agg.awayWins += 1
  else agg.draws += 1
}

parentPort.postMessage({ type: 'result', agg })
