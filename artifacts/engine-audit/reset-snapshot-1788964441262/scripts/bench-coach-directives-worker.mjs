/**
 * Worker: N meczów dla jednego ustawienia dyrektywy trenerskiej.
 *
 * Dyrektywa działa na CAŁĄ drużynę, więc nie da się użyć podziału składu jak przy
 * rozkazach indywidualnych (bench-player-instructions). Zamiast tego para bliźniaczych
 * drużyn w tym samym meczu: jedna dostaje badane ustawienie, druga gra neutralnie.
 * Strony są zamieniane co drugi mecz, żeby pull i kierunek ataku nie wpisały się w wynik.
 *
 * Sondy liczone są z telemetrii tickowej (`event.actionSim.frames`) i przypisywane do
 * strony, która w danej akcji jest w ATAKU albo w OBRONIE — dyrektywa ofensywna ma sens
 * tylko z dyskiem, defensywna tylko bez niego.
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
import { attackDirectionX } from '../src/matchEngine/fieldDimensions.js'
import { createRng } from '../src/matchEngine/rng.js'
import {
  PLAYER_STAT_CATEGORIES,
  CATEGORY_STAT_RANGES,
  normalizePlayerSkills,
  clampSubStat,
} from '../src/models/playerStats.js'

const { directive, value, matches, pointsToWin, seedBase, rosterSize } = workerData

MATCH_CONFIG.pointsToWin = pointsToWin

const HOME_ID_BASE = 1000
const AWAY_ID_BASE = 2000
const teamOfId = (id) => (id >= AWAY_ID_BASE ? 'away' : 'home')

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
      // Puste `traits` → ensurePlayerTraits rzuca je deterministycznie z id, więc oba
      // warianty dostają ten sam zestaw cech.
      traits: [],
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
    traits: [],
    skills: structuredClone(p.skills),
  }))
}

function tacticsFor(players, patch = null) {
  const base = defaultTacticsForPlayers(players)
  const dirs = patch
    ? { ...(base.oLineCoachDirectives ?? {}), ...patch }
    : base.oLineCoachDirectives
  return normalizeTactics({
    ...base,
    oLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    dLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON,
    dLineDefenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    tacticsFamiliarity: 55,
    // To samo ustawienie na obu liniach: dyrektywa ma być sprawdzona niezależnie od tego,
    // czy punkt zaczyna się z O-Line czy z D-Line.
    oLineCoachDirectives: dirs,
    dLineCoachDirectives: dirs,
  })
}

const newAcc = () => ({
  // atak (klatki)
  stackDepthSum: 0,
  stackDepthN: 0,
  // obrona (klatki)
  defTicks: 0,
  poachTicks: 0,
  cushionSum: 0,
  cushionN: 0,
  markAngleSum: 0,
  markAngleN: 0,
  deepCushionSum: 0,
  deepCushionN: 0,
  resetDefTicks: 0,
  resetPoachTicks: 0,
  resetGapSum: 0,
  // rzuty (zdarzenia)
  thr: 0,
  succ: 0,
  deep: 0,
  reset: 0,
  brk: 0,
  open: 0,
  sepTight: 0,
  sepN: 0,
  holdMs: 0,
  holdN: 0,
})

const DEG = 180 / Math.PI

function scanFrames(actionSim, possessionTeamGeo, offenseTeam, defenseTeam, acc) {
  const frames = actionSim?.frames
  if (!frames?.length) return
  const attackSign = attackDirectionX(possessionTeamGeo)
  const off = acc[offenseTeam]
  const def = acc[defenseTeam]

  frames.forEach((frame, frameIdx) => {
    const byId = new Map()
    for (const p of frame.players) byId.set(p.id, p)
    const disc = frame.disc
    const thrower = frame.throwerId != null ? byId.get(frame.throwerId) : null

    // Najgłębszy obrońca w tej klatce — sonda dla help deep.
    let deepest = null
    let deepestVal = -Infinity
    for (const p of frame.players) {
      if (!p.defenderState) continue
      const d = p.x * attackSign
      if (d > deepestVal) {
        deepestVal = d
        deepest = p
      }
    }

    for (const p of frame.players) {
      if (p.cutterState) {
        // Głębokość ustawienia stacka: jak daleko od dysku, wzdłuż osi ataku, stoją
        // zawodnicy czekający w formacji.
        // Bez rzucającego i bez aktualnego resetu: obu ustawia dysk, nie stack — tak samo
        // jak applySlotDepthBias w cutterBrain pomija zawodnika w roli dumpa.
        // TYLKO pierwsza klatka akcji: tam ustawienie pochodzi z layoutu formacji.
        // Średnia po całej akcji mieszała stack z zawodnikami ściągniętymi pod dysk po
        // resecie i dawała bazę 2.79 m, choć layout stawia stack 8-26 m w dół boiska.
        if (
          frameIdx === 0 &&
          p.cutterState === 'WAITING' &&
          disc &&
          p.role !== 'thrower' &&
          p.role !== 'dump'
        ) {
          off.stackDepthSum += (p.x - disc.x) * attackSign
          off.stackDepthN += 1
        }
      } else if (p.defenderState) {
        def.defTicks += 1
        const poaching = p.defenderState === 'POACHING'
        if (poaching) def.poachTicks += 1

        if (p.role === 'marker' && thrower) {
          // Kąt marka względem osi ataku: „no inside" wpycha markera przed rzucającego
          // (kąt maleje), „no around" rozciąga go w bok (kąt rośnie).
          const vx = (p.x - thrower.x) * attackSign
          const vy = p.y - thrower.y
          if (Math.hypot(vx, vy) > 1e-6) {
            def.markAngleSum += Math.abs(Math.atan2(vy, vx)) * DEG
            def.markAngleN += 1
          }
        }

        const mark = p.markTargetId != null ? byId.get(p.markTargetId) : null
        if (mark) {
          const gap = Math.hypot(p.x - mark.x, p.y - mark.y)
          def.cushionSum += gap
          def.cushionN += 1
          // Obrońca AKTUALNEGO resetu — sonda dla poachResetHandler.
          if (mark.role === 'dump') {
            // Dystans obrońcy od resetu, nie etykieta stanu: gdy schodzi zamknąć lane,
            // odstęp rośnie niezależnie od tego, jak silnik nazwał ten stan.
            def.resetDefTicks += 1
            def.resetGapSum += gap
            if (poaching) def.resetPoachTicks += 1
          }
          if (p === deepest) {
            def.deepCushionSum += gap
            def.deepCushionN += 1
          }
        }
      }
    }
  })
}

function scanMatch(session, acc) {
  let lastThrower = null
  for (const e of session.events) {
    if (e.type === 'throw_attempt') {
      lastThrower = e.throwerId
      const offTeam = e.possessionTeam
      const defTeam = offTeam === 'home' ? 'away' : 'home'
      if (e.actionSim) {
        scanFrames(
          e.actionSim,
          e.motionTrace?.possessionTeam ?? offTeam,
          offTeam,
          defTeam,
          acc,
        )
      }
      const s = acc[offTeam]
      s.thr += 1
      if (e.isOpenSide === false) s.brk += 1
      else if (e.isOpenSide === true) s.open += 1
      if (e.separationOutcome) {
        s.sepN += 1
        if (e.separationOutcome === 'tight') s.sepTight += 1
      }
      const hold = (e.holdStartMs ?? 0) + (e.actionSim?.throwMs ?? 0)
      if (hold > 0) {
        s.holdMs += hold
        s.holdN += 1
      }
    } else if (e.type === 'throw_success') {
      const s = acc[e.possessionTeam]
      if (!s) continue
      s.succ += 1
      const y = e.yardsGained ?? 0
      if (y >= 26) s.deep += 1
      if (y < 2) s.reset += 1
      void lastThrower
    }
  }
}

/** Wynik zbierany po STRONIE ROLI: D = drużyna z dyrektywą, C = kontrolna. */
const agg = { D: newAcc(), C: newAcc() }

for (let i = 0; i < matches; i += 1) {
  const rosterSeed = (seedBase + i * 7919) >>> 0 || 1
  const rng = createRng(rosterSeed)
  const homePlayers = makeRoster(rng, HOME_ID_BASE)
  const awayPlayers = cloneRoster(homePlayers, AWAY_ID_BASE)

  // Zamiana stron co drugi mecz — inaczej pull i kierunek ataku wpisałyby się w wynik.
  const directiveOnHome = i % 2 === 0
  const patch = directive ? { [directive]: value } : null

  let session = initMatchSession({
    homeTeam: { id: 'home', name: 'H', players: homePlayers, tacticsFamiliarity: 55 },
    awayTeam: { id: 'away', name: 'A', players: awayPlayers, tacticsFamiliarity: 55 },
    homeTactics: tacticsFor(homePlayers, directiveOnHome ? patch : null),
    awayTactics: tacticsFor(awayPlayers, directiveOnHome ? null : patch),
    seed: (rosterSeed ^ 0x5a5a5a5a) >>> 0 || 1,
  })
  const opts = { rotateHome: true, rotateAway: true, aiHome: false, aiAway: false }
  while (session.status !== 'finished') {
    session = playNextPoint(
      session,
      { homeTactics: session.home.tactics, awayTactics: session.away.tactics },
      opts,
    )
  }

  const perTeam = { home: newAcc(), away: newAcc() }
  scanMatch(session, perTeam)
  const dTeam = directiveOnHome ? 'home' : 'away'
  const cTeam = directiveOnHome ? 'away' : 'home'
  for (const key of Object.keys(agg.D)) {
    agg.D[key] += perTeam[dTeam][key]
    agg.C[key] += perTeam[cTeam][key]
  }
  void teamOfId
}

parentPort.postMessage({ directive: directive ?? null, value, agg })
