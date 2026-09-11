/**
 * Worker: N meczów dla jednego rozkazu indywidualnego, design sparowany split-squad.
 *
 * W drużynie HOME zawodnicy o PARZYSTYM id dostają badany rozkaz (grupa A), o nieparzystym
 * nie dostają nic (grupa B). Obie grupy grają ten sam mecz, więc chaos symulacji działa na
 * nie identycznie i znosi się w różnicy A−B. Drużyna AWAY nigdy nie ma rozkazów.
 *
 * Sondy liczone są PER ZAWODNIK z telemetrii tickowej (`event.actionSim.frames`, klatki co
 * 20 ms ze stanem i pozycją każdego agenta) oraz ze zdarzeń rzutu przypisanych do konkretnego
 * rzucającego. Statystyki drużyny (completion%, gole) świadomie NIE są tu miarą: rozkaz ma
 * zmieniać zachowanie zawodnika, a nie od razu wynik.
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

const { instruction, matches, pointsToWin, seedBase, rosterSize } = workerData

MATCH_CONFIG.pointsToWin = pointsToWin

const HOME_ID_BASE = 1000
const AWAY_ID_BASE = 2000
/** Grupa A = rozkaz, grupa B = kontrola. Podział po parzystości id. */
const groupOf = (id) => (id % 2 === 0 ? 'A' : 'B')
const isHomeId = (id) => id >= HOME_ID_BASE && id < AWAY_ID_BASE

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
      // Puste `traits` → ensurePlayerTraits rzuca je deterministycznie z id, więc baseline
      // i warunek testowy dostają ten sam zestaw cech.
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

function tacticsFor(players, instructionId = null) {
  const base = defaultTacticsForPlayers(players)
  const map = {}
  if (instructionId) {
    for (const p of players) {
      if (groupOf(p.id) === 'A') map[String(p.id)] = [instructionId]
    }
  }
  return normalizeTactics({
    ...base,
    oLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    dLineAttackStyle: ATTACK_STYLES.VERTICAL_STACK,
    oLineDefenseStyle: DEFENSE_STYLES.PERSON,
    dLineDefenseStyle: DEFENSE_STYLES.PERSON,
    forceSide: FORCE_SIDES.FORCE_FOREHAND,
    tacticsFamiliarity: 55,
    // Ten sam rozkaz na obu liniach — sonda ma złapać zachowanie niezależnie od tego,
    // czy punkt zaczyna się z O-Line czy z D-Line.
    oLinePlayerInstructions: map,
    dLinePlayerInstructions: map,
  })
}

const newAcc = () => ({
  // --- rzuty tego zawodnika (zdarzenia) ---
  thr: 0,
  huck: 0,
  brk: 0,
  open: 0,
  succ: 0,
  reset: 0,
  deep: 0,
  yards: 0,
  stall: 0,
  holdMs: 0,
  holdN: 0,
  sepTight: 0,
  sepN: 0,
  // --- atak (klatki) ---
  offTicks: 0,
  waitTicks: 0,
  waitLaneSum: 0,
  cutInits: 0,
  cutTicks: 0,
  cutFwdM: 0,
  clearTicks: 0,
  // --- obrona (klatki) ---
  defTicks: 0,
  poachTicks: 0,
  cushionSum: 0,
  cushionN: 0,
  shadeSum: 0,
  shadeN: 0,
  // --- wysiłek ---
  runM: 0,
  allTicks: 0,
  moveTicks: 0,
  staminaSum: 0,
  staminaN: 0,
})

const CUT_ACTIVE = 'ACTIVE_CUT'
const CUT_INIT = 'INITIATING_CUT'
const CUT_WAIT = 'WAITING'
const CUT_CLEAR = 'CLEARING'
const DEF_POACH = 'POACHING'

/** Jedna akcja rzutu: przejście klatek i dopisanie sond do akumulatorów grup. */
function scanFrames(actionSim, possessionTeamGeo, acc) {
  const frames = actionSim?.frames
  if (!frames?.length) return
  const dt = (actionSim.tickMs ?? 20) / 1000
  const attackSign = attackDirectionX(possessionTeamGeo)
  /** Poprzedni stan cuttera per id — do wykrycia inicjacji cutu (WAITING → INITIATING_CUT). */
  const prevState = new Map()

  for (const frame of frames) {
    const byId = new Map()
    for (const p of frame.players) byId.set(p.id, p)
    const disc = frame.disc

    for (const p of frame.players) {
      if (!isHomeId(p.id)) continue
      const s = acc[groupOf(p.id)]
      s.allTicks += 1
      const sp = Math.hypot(p.vx ?? 0, p.vy ?? 0)
      s.runM += sp * dt
      // Ticki, w których zawodnik REALNIE biegnie — metry na tick rozcieńcza stanie
      // w formacji, więc intensywność mierzymy tylko po ruchu.
      if (sp > 0.5) s.moveTicks += 1

      if (p.cutterState) {
        s.offTicks += 1
        const prev = prevState.get(p.id)
        // „Rozpoczęcie cutu" to wejście w INITIATING_CUT **albo** w ACTIVE_CUT: ścieżka
        // clearoutu po resecie (cutterBrain.js) wskakuje prosto w ACTIVE_CUT, więc liczenie
        // samych INITIATING_CUT gubiło znaczną część startów i zaniżało sondę priorytetu.
        const nowCutting = p.cutterState === CUT_INIT || p.cutterState === CUT_ACTIVE
        const wasCutting = prev === CUT_INIT || prev === CUT_ACTIVE
        if (nowCutting && !wasCutting) s.cutInits += 1
        prevState.set(p.id, p.cutterState)

        if (p.cutterState === CUT_WAIT) {
          s.waitTicks += 1
          // „Ustawiony w pasie rzutu" = mały odstęp w poprzek boiska od dysku.
          if (disc) s.waitLaneSum += Math.abs(p.y - disc.y)
        } else if (p.cutterState === CUT_ACTIVE) {
          s.cutTicks += 1
          s.cutFwdM += (p.vx ?? 0) * attackSign * dt
        } else if (p.cutterState === CUT_CLEAR) {
          s.clearTicks += 1
        }
      } else if (p.defenderState) {
        s.defTicks += 1
        if (p.defenderState === DEF_POACH) s.poachTicks += 1
        const mark = p.markTargetId != null ? byId.get(p.markTargetId) : null
        if (mark) {
          s.cushionSum += Math.hypot(p.x - mark.x, p.y - mark.y)
          s.cushionN += 1
          // Dodatnie = obrońca stoi GŁĘBIEJ niż kryty (shade deep).
          s.shadeSum += (p.x - mark.x) * attackSign
          s.shadeN += 1
        }
      }
    }
  }
}

function scanMatch(session, acc) {
  for (const e of session.events) {
    if (e.type === 'throw_attempt') {
      if (e.actionSim) {
        scanFrames(e.actionSim, e.motionTrace?.possessionTeam ?? e.possessionTeam, acc)
      }
      if (isHomeId(e.throwerId)) {
        const s = acc[groupOf(e.throwerId)]
        s.thr += 1
        if (e.throwType === 'huck') s.huck += 1
        if (e.isOpenSide === false) s.brk += 1
        else if (e.isOpenSide === true) s.open += 1
        if (Number.isFinite(e.stallCount)) s.stall += e.stallCount
        const hold = (e.holdStartMs ?? 0) + (e.actionSim?.throwMs ?? 0)
        if (hold > 0) {
          s.holdMs += hold
          s.holdN += 1
        }
        if (e.separationOutcome) {
          s.sepN += 1
          if (e.separationOutcome === 'tight') s.sepTight += 1
        }
        const stam = e.staminaAfterThrow?.home
        if (stam) {
          const v = stam[e.throwerId] ?? stam[String(e.throwerId)]
          if (Number.isFinite(v)) {
            s.staminaSum += v
            s.staminaN += 1
          }
        }
      }
    } else if (e.type === 'throw_success' && isHomeId(e.throwerId ?? -1)) {
      const s = acc[groupOf(e.throwerId)]
      s.succ += 1
      const y = e.yardsGained ?? 0
      s.yards += y
      if (y < 2) s.reset += 1
      if (y >= 26) s.deep += 1
    }
  }
}

/**
 * `throw_success` nie niesie throwerId (patrz point.js) — dopisujemy go z poprzedzającego
 * `throw_attempt`, żeby sonda „reset / zysk terenu" była liczona per rzucający.
 */
function stampThrowerOnResults(session) {
  let lastThrower = null
  for (const e of session.events) {
    if (e.type === 'throw_attempt') lastThrower = e.throwerId
    else if ((e.type === 'throw_success' || e.type === 'throw_fail') && e.throwerId == null) {
      e.throwerId = lastThrower
    }
  }
}

const acc = { A: newAcc(), B: newAcc() }

for (let i = 0; i < matches; i += 1) {
  const rosterSeed = (seedBase + i * 7919) >>> 0 || 1
  const rng = createRng(rosterSeed)
  const homePlayers = makeRoster(rng, HOME_ID_BASE)
  const awayPlayers = cloneRoster(homePlayers, AWAY_ID_BASE)

  let session = initMatchSession({
    homeTeam: { id: 'home', name: 'Instr', players: homePlayers, tacticsFamiliarity: 55 },
    awayTeam: { id: 'away', name: 'Ref', players: awayPlayers, tacticsFamiliarity: 55 },
    homeTactics: tacticsFor(homePlayers, instruction),
    awayTactics: tacticsFor(awayPlayers, null),
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
  stampThrowerOnResults(session)
  scanMatch(session, acc)
}

parentPort.postMessage({ instruction: instruction ?? null, acc })
