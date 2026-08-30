/**
 * Adaptacja taktyk AI między punktami:
 * - forma zawodników → mniej minut / instrukcje
 * - złe hucki → mniej appetite
 * - nieskuteczna formacja → zmiana stylu
 * - reakcja na taktykę gracza z opóźnieniem 1 punktu
 */

import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
} from './tacticsModifiers.js'
import { normalizeTactics } from './lineups.js'
import { normalizeCoachDirectives } from './coachDirectives.js'
import { normalizeInstructionList } from './playerInstructions.js'
import {
  getCategoryOverall,
  getSubStat,
  normalizePlayerSkills,
} from '../models/playerStats.js'
import { EVENT } from './events.js'
import { huckRate } from './matchStats.js'

const ATTACK_ALTERNATES = {
  [ATTACK_STYLES.VERTICAL_STACK]: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
  [ATTACK_STYLES.HORIZONTAL_STACK]: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.MOTION_OFFENSE],
  [ATTACK_STYLES.SPLIT_STACK]: [ATTACK_STYLES.SIDE_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
  [ATTACK_STYLES.SIDE_STACK]: [ATTACK_STYLES.SPLIT_STACK, ATTACK_STYLES.VERTICAL_STACK],
  [ATTACK_STYLES.MOTION_OFFENSE]: [ATTACK_STYLES.HORIZONTAL_STACK, ATTACK_STYLES.HEX_OFFENSE],
  [ATTACK_STYLES.HEX_OFFENSE]: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.MOTION_OFFENSE],
  [ATTACK_STYLES.ZONE_OFFENSE]: [ATTACK_STYLES.VERTICAL_STACK, ATTACK_STYLES.HORIZONTAL_STACK],
}

const DEFENSE_ALTERNATES = {
  [DEFENSE_STYLES.PERSON]: [DEFENSE_STYLES.ALL_PERSON, DEFENSE_STYLES.CLAM],
  [DEFENSE_STYLES.ALL_PERSON]: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ZONE_CUP],
  [DEFENSE_STYLES.CLAM]: [DEFENSE_STYLES.PERSON, DEFENSE_STYLES.ALL_PERSON],
  [DEFENSE_STYLES.ZONE_CUP]: [DEFENSE_STYLES.ZONE_WALL, DEFENSE_STYLES.PERSON],
  [DEFENSE_STYLES.ZONE_WALL]: [DEFENSE_STYLES.ZONE_CUP, DEFENSE_STYLES.PERSON],
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function patchDirectives(dirs, patch) {
  return normalizeCoachDirectives({ ...(dirs ?? {}), ...patch })
}

function addInstr(map, playerId, tag) {
  if (playerId == null) return
  const key = String(playerId)
  map[key] = normalizeInstructionList([...(map[key] ?? []), tag])
}

function removeInstr(map, playerId, tag) {
  if (playerId == null) return
  const key = String(playerId)
  const list = map[key] ?? []
  map[key] = normalizeInstructionList(list.filter((t) => t !== tag))
  if (!map[key].length) delete map[key]
}

/** Analiza ostatniego punktu pod kątem naszej drużyny. */
export function analyzePointForSide(pointEvents, side, boxScore) {
  const events = pointEvents ?? []
  let ourThrows = 0
  let ourCompletions = 0
  let ourHucks = 0
  let ourHuckCompletions = 0
  let ourTurnovers = 0
  let weScored = false
  let theyScored = false
  const throwerTos = {}

  for (const ev of events) {
    if (ev.type === EVENT.THROW_ATTEMPT && ev.possessionTeam === side) {
      ourThrows += 1
      if (ev.isHuck) ourHucks += 1
    }
    if (ev.type === EVENT.THROW_SUCCESS && ev.possessionTeam === side) {
      ourCompletions += 1
      if (ev.isHuck) ourHuckCompletions += 1
    }
    if (ev.type === EVENT.THROW_FAIL && ev.possessionTeam === side) {
      ourTurnovers += 1
      if (ev.throwerId != null) {
        throwerTos[ev.throwerId] = (throwerTos[ev.throwerId] ?? 0) + 1
      }
      if (ev.isHuck) ourHucks += 1
    }
    if (ev.type === EVENT.TURNOVER && ev.possessionTeam === side) {
      // already counted via throw_fail often
    }
    if (ev.type === EVENT.SCORE) {
      const scorer = ev.scoringTeam ?? ev.team
      if (scorer === side) weScored = true
      else if (scorer) theyScored = true
    }
    if (ev.type === EVENT.POINT_END && ev.scoringTeam) {
      if (ev.scoringTeam === side) weScored = true
      else theyScored = true
    }
  }

  const strugglingPlayers = []
  if (boxScore) {
    for (const row of Object.values(boxScore)) {
      if (row.teamId !== side) continue
      const pp = Math.max(1, row.pointsPlayed || 1)
      const toRate = (row.turnovers ?? 0) / pp
      const production = (row.goals ?? 0) + (row.assists ?? 0) + (row.blocks ?? 0)
      if ((row.turnovers ?? 0) >= 2 && production === 0) {
        strugglingPlayers.push({ id: row.playerId, turnovers: row.turnovers, toRate })
      } else if (toRate >= 0.75 && (row.turnovers ?? 0) >= 2) {
        strugglingPlayers.push({ id: row.playerId, turnovers: row.turnovers, toRate })
      }
    }
  }

  const huckComp = ourHucks > 0 ? ourHuckCompletions / ourHucks : null
  const throwComp = ourThrows > 0 ? ourCompletions / ourThrows : null

  return {
    ourThrows,
    ourCompletions,
    ourHucks,
    ourHuckCompletions,
    ourTurnovers,
    weScored,
    theyScored,
    throwerTos,
    strugglingPlayers,
    huckComp,
    throwComp,
    offenseFailed: !weScored && ourTurnovers >= 2,
    defenseFailed: theyScored && ourTurnovers === 0, // scored on without us turning? soft signal
  }
}

function pickAlternate(current, pool, preferredList, rng) {
  const prefs = (preferredList ?? []).filter((s) => s !== current)
  const alts = (ATTACK_ALTERNATES[current] ?? DEFENSE_ALTERNATES[current] ?? []).filter(
    (s) => s !== current,
  )
  const candidates = [...new Set([...prefs, ...alts, ...(pool ?? [])])].filter((s) => s !== current)
  if (!candidates.length) return current
  if (rng?.float) return candidates[Math.floor(rng.float() * candidates.length)]
  return candidates[0]
}

/**
 * Stan adaptacji per drużyna w sesji.
 */
export function createAiAdaptSideState() {
  return {
    /** Taktyka przeciwnika widziana z poprzedniego punktu (do decyzji teraz). */
    observedOpponentTactics: null,
    /** Zapamiętana taktyka przeciwnika z bieżącego punktu → będzie observed następnym razem. */
    pendingOpponentTactics: null,
    pointsSinceAttackChange: 99,
    pointsSinceDefenseChange: 99,
    huckFailStreak: 0,
    /** 0 = spokój, 1 = zaniepokojony, 2 = panika — patrz sekcja 0 w adaptAiTacticsBetweenPoints. */
    panicLevel: 0,
    /** Punkty stracone z rzędu w BIEŻĄCYM meczu (reset przy zdobyciu punktu). */
    lossStreakInMatch: 0,
  }
}

export function createAiAdaptState() {
  return {
    home: createAiAdaptSideState(),
    away: createAiAdaptSideState(),
  }
}

function snapshotTacticsLite(tactics) {
  if (!tactics) return null
  return {
    oLineAttackStyle: tactics.oLineAttackStyle ?? tactics.attackStyle,
    oLineDefenseStyle: tactics.oLineDefenseStyle ?? tactics.defenseStyle,
    dLineAttackStyle: tactics.dLineAttackStyle,
    dLineDefenseStyle: tactics.dLineDefenseStyle,
    forceSide: tactics.forceSide,
    huckAppetite: tactics.oLineCoachDirectives?.huckAppetite ?? tactics.coachDirectives?.huckAppetite,
    possessionTempo:
      tactics.oLineCoachDirectives?.possessionTempo ?? tactics.coachDirectives?.possessionTempo,
  }
}

/**
 * Po punkcie: zapamiętaj taktykę przeciwnika z właśnie rozegranego punktu.
 * AI użyje jej dopiero przy adaptacji przed kolejnym punktem (opóźnienie 1 punktu).
 */
export function updateAiAdaptObservation(adaptSide, opponentTactics) {
  const next = { ...(adaptSide ?? createAiAdaptSideState()) }
  // pending = świeża obserwacja; przed następnym punktem promujemy do observed
  next.pendingOpponentTactics = snapshotTacticsLite(opponentTactics)
  next.pointsSinceAttackChange = (next.pointsSinceAttackChange ?? 0) + 1
  next.pointsSinceDefenseChange = (next.pointsSinceDefenseChange ?? 0) + 1
  return next
}

/** Przed punktem: uaktywnij obserwację z poprzedniego punktu. */
export function promoteAiAdaptObservation(adaptSide) {
  const next = { ...(adaptSide ?? createAiAdaptSideState()) }
  if (next.pendingOpponentTactics) {
    next.observedOpponentTactics = next.pendingOpponentTactics
    next.pendingOpponentTactics = null
  }
  return next
}

/**
 * Główna adaptacja taktyk AI przed kolejnym punktem.
 *
 * @param {object} params
 * @param {object} params.team
 * @param {object} params.tactics — już po rotacji składu
 * @param {object} params.identity — z profilem trenera
 * @param {object} params.adaptSide
 * @param {object} params.pointAnalysis
 * @param {object|null} params.matchStatsSide
 * @param {'home'|'away'} params.side
 * @param {number} params.ourScore
 * @param {number} params.theirScore
 * @param {object|null} params.rng
 * @param {boolean} params.isAi — false dla drużyny gracza
 */
export function adaptAiTacticsBetweenPoints({
  team,
  tactics,
  identity,
  adaptSide,
  pointAnalysis,
  matchStatsSide = null,
  side,
  ourScore = 0,
  theirScore = 0,
  rng = null,
  isAi = true,
}) {
  if (!isAi || !tactics) return { tactics, adaptSide }

  const profile = identity?.aiCoachProfile ?? team?.aiCoachProfile
  let adapt = profile?.adaptability ?? identity?.adaptability ?? 0.5
  let conserve = profile?.conservatism ?? identity?.conservatism ?? 0.5
  const analysis = pointAnalysis ?? {}
  let next = normalizeTactics({ ...tactics })
  let state = { ...(adaptSide ?? createAiAdaptSideState()) }
  // Reakcje poniżej (bench, złe hucki) dotyczą zawodników na O-Line — tylko ta linia rzuca.
  const instr = { ...(next.oLinePlayerInstructions ?? {}) }

  const roll = () => (rng?.float ? rng.float() : Math.random())
  const willing = () => roll() < adapt

  // --- 0) Panika: duży deficyt punktowy albo seria strat w TYM meczu → trener odrzuca
  // ostrożność, nawet jeśli jego archetyp jest z natury uparty (conservatism ignorowany
  // przy panicLevel 2). Deficyt liczony względem MATCH_CONFIG.pointsToWin (gra do 15).
  if (analysis.weScored) state.lossStreakInMatch = 0
  else if (analysis.theyScored) state.lossStreakInMatch = (state.lossStreakInMatch ?? 0) + 1

  const deficit = theirScore - ourScore
  const targetPanic = deficit >= 7 || (state.lossStreakInMatch ?? 0) >= 4 ? 2 : deficit >= 4 ? 1 : 0
  const prevPanic = state.panicLevel ?? 0
  state.panicLevel =
    targetPanic > prevPanic
      ? targetPanic
      : analysis.weScored
        ? Math.max(targetPanic, prevPanic - 1)
        : prevPanic
  const panicLevel = state.panicLevel

  if (panicLevel >= 1) {
    // Podbija adapt/conserve tak, żeby formacje/sekcje 3-5 poniżej reagowały pewniej i
    // częściej — bez duplikowania ich logiki. Przy panicLevel 2 conservatism jest
    // całkowicie zignorowany (gwarantowana reakcja co punkt, jeśli sytuacja tego wymaga).
    adapt = panicLevel >= 2 ? 1 : Math.max(adapt, 0.85)
    conserve = panicLevel >= 2 ? 0 : Math.min(conserve, 0.3)

    const swing = panicLevel >= 2 ? 0.5 : 0.25
    const oDirsPanic = next.oLineCoachDirectives ?? next.coachDirectives
    const dDirsPanic = next.dLineCoachDirectives ?? oDirsPanic
    next.oLineCoachDirectives = patchDirectives(oDirsPanic, {
      huckAppetite: clamp((oDirsPanic?.huckAppetite ?? 0) + swing, -1, 1),
      possessionTempo: clamp((oDirsPanic?.possessionTempo ?? 0) + swing * 0.6, -1, 1),
      breakAppetite: clamp((oDirsPanic?.breakAppetite ?? 0) + swing * 0.5, -1, 1),
    })
    next.dLineCoachDirectives = patchDirectives(dDirsPanic, {
      coverageShade: clamp((dDirsPanic?.coverageShade ?? 0) + swing * 0.5, -1, 1),
      creativity: clamp((dDirsPanic?.creativity ?? 0) + swing * 0.4, -1, 1),
    })
  }

  // --- 1) Słabo grający zawodnicy: mniej minut + instrukcje ---
  const benchPenaltyIds = new Set()
  for (const p of analysis.strugglingPlayers ?? []) {
    benchPenaltyIds.add(p.id)
    addInstr(instr, p.id, 'give_space')
    removeInstr(instr, p.id, 'dominate')
    removeInstr(instr, p.id, 'throw_hucks')
    addInstr(instr, p.id, 'no_hucks')
  }
  for (const [tid, tos] of Object.entries(analysis.throwerTos ?? {})) {
    if (tos >= 2) {
      removeInstr(instr, tid, 'throw_hucks')
      addInstr(instr, tid, 'no_hucks')
      addInstr(instr, tid, 'dump_first')
    }
  }

  if (benchPenaltyIds.size) {
    const demote = (lineKey) => {
      const line = [...(next[lineKey] ?? [])]
      for (let i = line.length - 1; i >= 0; i -= 1) {
        if (!benchPenaltyIds.has(line[i])) continue
        // Przesuń na koniec / zamień z pierwszym z ławki
        const id = line[i]
        const bench = (team.players ?? [])
          .map((p) => p.id)
          .filter((pid) => pid != null && !line.includes(pid) && !benchPenaltyIds.has(pid))
        if (bench.length) {
          line[i] = bench[0]
          benchPenaltyIds.delete(id)
        }
      }
      next[lineKey] = line
    }
    if (willing()) {
      demote('lineupWhenOffenseStartPlayerIds')
      demote('lineupWhenDefenseStartPlayerIds')
    }
  }

  // --- 2) Hucki nie wychodzą ---
  const matchHuckAttempts = matchStatsSide?.huckAttempts ?? 0
  const matchHuckPct = matchHuckAttempts >= 3 ? huckRate(matchStatsSide) : null
  const pointHuckBad =
    (analysis.ourHucks ?? 0) >= 2 && (analysis.huckComp == null || analysis.huckComp < 0.35)
  const matchHuckBad = matchHuckPct != null && matchHuckPct < 40

  if (pointHuckBad || matchHuckBad) {
    state.huckFailStreak = (state.huckFailStreak ?? 0) + 1
  } else if ((analysis.ourHucks ?? 0) > 0 && (analysis.huckComp ?? 1) >= 0.5) {
    state.huckFailStreak = 0
  }

  if (state.huckFailStreak >= 1 && willing()) {
    const oDirs = next.oLineCoachDirectives ?? next.coachDirectives
    const dDirs = next.dLineCoachDirectives ?? oDirs
    const cur = oDirs?.huckAppetite ?? 0
    const lowered = clamp(cur - 0.35 - state.huckFailStreak * 0.1, -1, 0.15)
    next.oLineCoachDirectives = patchDirectives(oDirs, { huckAppetite: lowered })
    next.dLineCoachDirectives = patchDirectives(dDirs, {
      huckAppetite: clamp((dDirs?.huckAppetite ?? 0) - 0.2, -1, 0.2),
    })
    next.coachDirectives = next.oLineCoachDirectives
    // Handlers: no_hucks
    for (const pid of next.lineupWhenOffenseStartPlayerIds ?? []) {
      const pl = team.players?.find((p) => p.id === pid)
      if (!pl) continue
      const skills = normalizePlayerSkills(pl.skills)
      const huck = getCategoryOverall(skills, 'throwing')
      if (huck < 82 || state.huckFailStreak >= 2) {
        removeInstr(instr, pid, 'throw_hucks')
        addInstr(instr, pid, 'no_hucks')
      }
    }
  }

  // --- 3) Formacja ofensywna nie działa → zmień; działa → nie ---
  const offenseOk = analysis.weScored || ((analysis.throwComp ?? 1) >= 0.75 && (analysis.ourTurnovers ?? 0) <= 1)
  const offenseBad =
    analysis.offenseFailed ||
    ((analysis.ourTurnovers ?? 0) >= 2 && !analysis.weScored) ||
    ((analysis.throwComp ?? 1) < 0.55 && (analysis.ourThrows ?? 0) >= 4)

  if (offenseOk) {
    // zachowaj — conservatism
  } else if (
    offenseBad &&
    (state.pointsSinceAttackChange ?? 99) >= 1 &&
    roll() < adapt * (1.15 - conserve * 0.5)
  ) {
    const cur = next.oLineAttackStyle
    const alt = pickAlternate(
      cur,
      identity?.oLineAttackStyles ?? profile?.oLineAttackStyles,
      profile?.oLineAttackStyles,
      rng,
    )
    if (alt !== cur) {
      next.oLineAttackStyle = alt
      // D-line atak też lekko
      if (roll() < 0.5) next.dLineAttackStyle = alt
      state.pointsSinceAttackChange = 0
    }
  }

  // --- 4) Obrona nie działa ---
  const defenseBad = analysis.theyScored && (analysis.weScored === false || (ourScore < theirScore))
  if (
    defenseBad &&
    (state.pointsSinceDefenseChange ?? 99) >= 1 &&
    roll() < adapt * (1.1 - conserve * 0.4)
  ) {
    const cur = next.dLineDefenseStyle ?? next.oLineDefenseStyle
    const alt = pickAlternate(
      cur,
      profile?.dLineDefenseStyles,
      profile?.dLineDefenseStyles,
      rng,
    )
    if (alt !== cur) {
      next.dLineDefenseStyle = alt
      if (roll() < 0.4) next.oLineDefenseStyle = alt
      state.pointsSinceDefenseChange = 0
    }
  }

  // --- 5) Reakcja na taktykę przeciwnika (opóźnienie 1 punktu = observed) ---
  const opp = state.observedOpponentTactics
  if (opp && roll() < adapt * 0.85) {
    const oppAtk = opp.oLineAttackStyle
    const oppDef = opp.oLineDefenseStyle ?? opp.dLineDefenseStyle

    // Przeciwnik gra zone → my strefowy atak / więcej breaków
    if (
      (oppDef === DEFENSE_STYLES.ZONE_CUP || oppDef === DEFENSE_STYLES.ZONE_WALL) &&
      (state.pointsSinceAttackChange ?? 99) >= 1
    ) {
      if (next.oLineAttackStyle !== ATTACK_STYLES.ZONE_OFFENSE && roll() < 0.7) {
        next.oLineAttackStyle = ATTACK_STYLES.ZONE_OFFENSE
        state.pointsSinceAttackChange = 0
      }
      next.oLineCoachDirectives = patchDirectives(next.oLineCoachDirectives, {
        breakAppetite: clamp((next.oLineCoachDirectives?.breakAppetite ?? 0) + 0.25, -1, 1),
      })
    }

    // Przeciwnik horizontal tempo / dużo deep → shade deep, ostrożniej
    if (
      oppAtk === ATTACK_STYLES.HORIZONTAL_STACK ||
      oppAtk === ATTACK_STYLES.MOTION_OFFENSE ||
      (opp.huckAppetite ?? 0) >= 0.3
    ) {
      next.dLineCoachDirectives = patchDirectives(next.dLineCoachDirectives, {
        coverageShade: clamp((next.dLineCoachDirectives?.coverageShade ?? 0) + 0.3, -1, 1),
      })
      if (
        (state.pointsSinceDefenseChange ?? 99) >= 1 &&
        next.dLineDefenseStyle === DEFENSE_STYLES.PERSON &&
        roll() < 0.45
      ) {
        next.dLineDefenseStyle = DEFENSE_STYLES.CLAM
        state.pointsSinceDefenseChange = 0
      }
    }

    // Przeciwnik patient vertical → więcej pressure / poach bias przez tempo D
    if (oppAtk === ATTACK_STYLES.VERTICAL_STACK && (opp.possessionTempo ?? 0) <= -0.2) {
      next.dLineCoachDirectives = patchDirectives(next.dLineCoachDirectives, {
        creativity: clamp((next.dLineCoachDirectives?.creativity ?? 0) + 0.15, -1, 1),
      })
    }
  }

  next.oLinePlayerInstructions = instr
  next.coachDirectives = next.oLineCoachDirectives
  return { tactics: normalizeTactics(next), adaptSide: state }
}

/**
 * Skill-based instrukcje AI (start meczu + odświeżenie).
 * Zwraca osobne mapy dla O-Line i D-Line (tactics.oLinePlayerInstructions / dLinePlayerInstructions).
 * „Primary handler” nie jest tu przydzielany jako instrukcja — pokrywa to podrola
 * formacji (playerSubRoles: HANDLER_SUB_ROLES.PRIMARY), żeby uniknąć podwójnego liczenia.
 */
export function buildSkillBasedAiInstructions(players, identity, oSorted, dSorted) {
  const oMap = {}
  const dMap = {}
  const coach = identity?.oLineCoachDirectives ?? identity?.coachDirectives ?? {}
  const dCoach = identity?.dLineCoachDirectives ?? coach
  const addO = (player, tag) => {
    if (!player?.id) return
    oMap[String(player.id)] = normalizeInstructionList([
      ...(oMap[String(player.id)] ?? []),
      tag,
    ])
  }
  const addD = (player, tag) => {
    if (!player?.id) return
    dMap[String(player.id)] = normalizeInstructionList([
      ...(dMap[String(player.id)] ?? []),
      tag,
    ])
  }

  const roster = players ?? []
  for (const p of roster) {
    const skills = normalizePlayerSkills(p.skills)
    const throwing = getCategoryOverall(skills, 'throwing')
    const huckSub = getSubStat(skills, 'throwing', 'huck', throwing)
    const offense = getCategoryOverall(skills, 'offensive')
    const defense = getCategoryOverall(skills, 'defensive')
    const mental = getCategoryOverall(skills, 'mental')
    const strongThrower = throwing >= 76
    // Apetyt trenera na hucki steruje WSZYSTKIMI trzema progami niżej. Wcześniej sterował
    // tylko licencją `throw_hucks` (twarda bramka >= 0.15 / >= 0.4), a `no_hucks` jechało
    // po stałym progu umiejętności bez żadnego odniesienia do apetytu. Efekt asymetrii:
    // drużyna z apetytem 0.64 i tak dostawała 20 z 35 zawodników z `no_hucks`, a drużyna
    // z apetytem 0.12 nie dostawała ANI JEDNEGO `throw_hucks` (0.12 < 0.15) niezależnie od
    // tego, jak dobrych miała hucking handlerów. Zmierzone: udział hucków 6.2% przy stałej
    // taktyce vs 2.5% po rotacji AI — generator ścinał głęboką grę o ~60%.
    const appetite = coach.huckAppetite ?? 0
    const strongCutter = offense >= 76 && throwing < 78

    // Słaby thrower — nie hucki, dump first jeśli silny thrower lub słaby rzut.
    // Próg skaluje się apetytem: -1 -> 80 (kneblujemy prawie wszystkich), 0 -> 70 (jak
    // dawniej), +1 -> 60 (knebel tylko dla naprawdę słabych). Sam zły rzucający i tak jest
    // karany osobno członem `(huckSkill - 50) * 0.2` w throwerBrain, więc knebel nie musi
    // być jedynym zabezpieczeniem.
    const noHuckBelow = 70 - appetite * 10
    if (huckSub < noHuckBelow || (huckSub < noHuckBelow + 6 && throwing < 72)) {
      addO(p, 'no_hucks')
      if (strongThrower || throwing < 68) addO(p, 'dump_first')
    }

    // Licencja na hucki: zamiast urwiska na apetycie (0.15 / 0.4) próg UMIEJĘTNOŚCI
    // maleje z apetytem. -1 -> 96 (nikt), 0 -> 86 (jak dawna górna bramka), +1 -> 76.
    const huckLicenseAt = 86 - appetite * 10
    if (huckSub >= huckLicenseAt && throwing >= 78) {
      addO(p, 'throw_hucks')
    }

    // Dobry ofensywny — więcej odpowiedzialności
    if (offense >= 84 && mental >= 78) {
      addO(p, 'dominate')
    }

    // Deep cutter. To jest NAJMOCNIEJSZA realna dźwignia udziału hucków w pełnym silniku
    // (zmierzone przy stałej taktyce: cut_under 4.3% -> brak 6.8% -> cut_deep 8.8%, przy
    // średnim zysku 10.8 -> 14.4 -> 17.7 m). Strona rzucającego prawie nie reaguje
    // (`throw_hucks` dokładane do cut_deep nie zmienia nic: 8.4% vs 8.8%), bo huck powstaje
    // wtedy, gdy ktoś REALNIE biegnie w głąb — nie wtedy, gdy rzucający ma na niego ochotę.
    // Dlatego próg tej instrukcji też musi jechać apetytem: -1 -> 86, 0 -> 78, +1 -> 70.
    const deepCutAt = 78 - appetite * 8
    if (strongCutter && offense >= deepCutAt && appetite >= -0.3) {
      addO(p, 'cut_deep')
    }

    // Słaby / zmęczony ofensywnie — daj przestrzeń
    if (offense < 72 && !strongThrower) {
      addO(p, 'give_space')
    }

    // Break mark dla dobrych throwerów
    if (strongThrower && throwing >= 80 && (coach.breakAppetite ?? 0) >= 0.25) {
      addO(p, 'break_mark')
    }

    // Obrona
    if (defense >= 82) {
      if ((dCoach.coverageShade ?? 0) >= 0.2) addD(p, 'shade_deep')
      else if ((dCoach.creativity ?? 0) >= 0.25) addD(p, 'poach')
      else addD(p, 'tight_mark')
    }
  }

  // Gwiazda z sortowania — jeśli trener nie chce hucków, nawet top handler dostaje wodze skrócone.
  const starHandler = oSorted?.[0]
  if ((coach.huckAppetite ?? 0) <= -0.35 && starHandler) {
    addO(starHandler, 'no_hucks')
  }
  void dSorted

  return { offense: oMap, defense: dMap }
}
