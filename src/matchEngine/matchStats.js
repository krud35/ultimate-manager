import { MATCH_CONFIG } from './config.js'
import { EVENT } from './events.js'

export const HUCK_MIN_YARDS = 40

/**
 * Rzut liczy się jako "pod presją", gdy pada przy tym lub wyższym stall foulcount.
 * W praktyce silnik rzadko przekracza stall 5 (gracze rzucają wcześnie, żeby uniknąć
 * kary za skład — patrz stallComposureAccuracyPenalty), więc próg 4 łapie ok. górne
 * ~9% rzutów, czyli realny "późny" moment decyzji, a nie martwy próg blisko STALL_MAX.
 */
export const PRESSURE_STALL_THRESHOLD = 4

export function createTeamMatchStats() {
  return {
    totalYards: 0,
    throwAttempts: 0,
    completions: 0,
    huckAttempts: 0,
    huckCompletions: 0,
    pressureAttempts: 0,
    pressureCompletions: 0,
    turnovers: [],
  }
}

export function createMatchStats() {
  return {
    home: createTeamMatchStats(),
    away: createTeamMatchStats(),
  }
}

export function completionRate(teamStats) {
  if (!teamStats || teamStats.throwAttempts === 0) return 0
  return (teamStats.completions / teamStats.throwAttempts) * 100
}

export function huckRate(teamStats) {
  if (!teamStats || teamStats.huckAttempts === 0) return 0
  return (teamStats.huckCompletions / teamStats.huckAttempts) * 100
}

/** Procent skuteczności rzutów oddanych przy stallCount >= PRESSURE_STALL_THRESHOLD, albo null gdy brak próbek. */
export function pressureCompletionRate(teamStats) {
  if (!teamStats || !teamStats.pressureAttempts) return null
  return (teamStats.pressureCompletions / teamStats.pressureAttempts) * 100
}

/**
 * Kompaktowe team stats do zapisu (bez mapy strat).
 * @param {ReturnType<typeof createTeamMatchStats>|null|undefined} teamStats
 */
export function compactTeamMatchStats(teamStats) {
  if (!teamStats) {
    return {
      totalYards: 0,
      throwAttempts: 0,
      completions: 0,
      huckAttempts: 0,
      huckCompletions: 0,
      completionPct: 0,
      pressureAttempts: 0,
      pressureCompletions: 0,
      pressureCompletionPct: null,
    }
  }
  const pressureRate = pressureCompletionRate(teamStats)
  return {
    totalYards: teamStats.totalYards ?? 0,
    throwAttempts: teamStats.throwAttempts ?? 0,
    completions: teamStats.completions ?? 0,
    huckAttempts: teamStats.huckAttempts ?? 0,
    huckCompletions: teamStats.huckCompletions ?? 0,
    completionPct: Math.round(completionRate(teamStats) * 10) / 10,
    pressureAttempts: teamStats.pressureAttempts ?? 0,
    pressureCompletions: teamStats.pressureCompletions ?? 0,
    pressureCompletionPct: pressureRate == null ? null : Math.round(pressureRate * 10) / 10,
  }
}

/**
 * @param {{ home?: object, away?: object }|null|undefined} matchStats
 */
export function compactMatchStats(matchStats) {
  return {
    home: compactTeamMatchStats(matchStats?.home),
    away: compactTeamMatchStats(matchStats?.away),
  }
}

/**
 * Punkty zdobyte po rozpoczęciu punktu w ataku / w obronie.
 * Liczone z POINT_START (role) + POINT_END (scoringTeam).
 * @returns {{ home: { offense: number, defense: number }, away: { offense: number, defense: number } }}
 */
export function summarizeLineStartPoints(events) {
  // offense/defense = punkty wygrane z danej roli (holdy/breaki).
  // offensePoints/defensePoints = ile razy dana rola w ogóle wystąpiła (mianownik do Hold%/Break%).
  const home = { offense: 0, defense: 0, offensePoints: 0, defensePoints: 0 }
  const away = { offense: 0, defense: 0, offensePoints: 0, defensePoints: 0 }
  let homeRole = null
  let awayRole = null

  for (const e of events ?? []) {
    if (e?.type === EVENT.POINT_START) {
      homeRole = e.homePointStartRole ?? null
      awayRole = e.awayPointStartRole ?? null
      if (homeRole === 'offense') home.offensePoints += 1
      else if (homeRole === 'defense') home.defensePoints += 1
      if (awayRole === 'offense') away.offensePoints += 1
      else if (awayRole === 'defense') away.defensePoints += 1
      continue
    }
    if (e?.type !== EVENT.POINT_END || !e.scoringTeam) continue
    if (e.scoringTeam === 'home') {
      if (homeRole === 'offense') home.offense += 1
      else if (homeRole === 'defense') home.defense += 1
    } else if (e.scoringTeam === 'away') {
      if (awayRole === 'offense') away.offense += 1
      else if (awayRole === 'defense') away.defense += 1
    }
  }

  return { home, away }
}

/** Hold% — odsetek punktów utrzymanych z własnego rozpoczęcia w ataku, albo null gdy brak próbek. */
export function holdPct(lineStats) {
  if (!lineStats || !lineStats.offensePoints) return null
  return (lineStats.offense / lineStats.offensePoints) * 100
}

/** Break% — odsetek punktów odebranych przeciwnikowi z rozpoczęcia w obronie, albo null gdy brak próbek. */
export function breakPct(lineStats) {
  if (!lineStats || !lineStats.defensePoints) return null
  return (lineStats.defense / lineStats.defensePoints) * 100
}

/**
 * @param {'home'|'away'} offenseTeamId
 */
export function recordThrowAttempt(
  matchStats,
  offenseTeamId,
  { success, yardsGained, isHuck, turnoverMeters, stallCount },
) {
  const s = matchStats[offenseTeamId]
  s.throwAttempts += 1
  if (isHuck) s.huckAttempts += 1

  const underPressure = (stallCount ?? 0) >= PRESSURE_STALL_THRESHOLD
  if (underPressure) s.pressureAttempts += 1

  if (success) {
    s.completions += 1
    s.totalYards += yardsGained
    if (isHuck) s.huckCompletions += 1
    if (underPressure) s.pressureCompletions += 1
  } else if (turnoverMeters != null) {
    s.turnovers.push({ meters: turnoverMeters, team: offenseTeamId })
  }
}

/** Odtwarza statystyki z logu zdarzeń (gdy brak inkrementacji na żywo). */
export function buildMatchStatsFromEvents(events) {
  const stats = createMatchStats()
  for (const e of events) {
    if (e.type === 'throw_success') {
      recordThrowAttempt(stats, e.possessionTeam, {
        success: true,
        yardsGained: e.yardsGained ?? 0,
        isHuck: !!e.isHuck,
        stallCount: e.stallCount,
      })
    }
    if (e.type === 'throw_fail') {
      recordThrowAttempt(stats, e.possessionTeam, {
        success: false,
        isHuck: !!e.isHuck,
        turnoverMeters: e.turnoverMeters,
        stallCount: e.stallCount,
      })
    }
  }
  return stats
}

export function yardsFromPositions(before, after) {
  return Math.max(0, Math.round(after - before))
}

export function isHuckThrow(yards) {
  return (Number(yards) || 0) >= HUCK_MIN_YARDS
}

export function fieldMetersFromEnginePosition(pos) {
  const { min, max } = MATCH_CONFIG.field
  const span = max - min || 1
  return Math.round(((pos - min) / span) * 100)
}
