import { FIELD_DIMENSIONS } from './fieldDimensions.js'

export const ANALYSIS_COLS = 10
export const ANALYSIS_ROWS = 5
const counters = ['pointsPlayed', 'pointsWon', 'pointsLost', 'goals', 'assists', 'blocks', 'turnovers', 'drops', 'attempts', 'completions', 'catches', 'throwMeters', 'catchMeters', 'huckAttempts', 'huckCompletions', 'pressureAttempts', 'pressureCompletions']
const layers = ['throws', 'catches', 'losses', 'blocks', 'drops', 'otherLosses', 'goals', 'assists', 'completedThrows']
const opposite = side => side === 'home' ? 'away' : 'home'
const bucket = () => ({ ...Object.fromEntries(counters.map(k => [k, 0])), maps: Object.fromEntries(layers.map(k => [k, {}])) })
const entity = () => ({ all: bucket(), offense: bucket(), defense: bucket() })
const team = () => ({ ...entity(), players: {}, games: 1 })

function normalize(point, side, swapped) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null
  const reverse = (side === 'away') !== swapped
  const { lengthM, widthM } = FIELD_DIMENSIONS
  return {
    x: Math.round(Math.max(0, Math.min(lengthM, reverse ? lengthM - point.x : point.x)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(widthM, reverse ? widthM - point.y : point.y)) * 10) / 10,
  }
}

function cell(point) {
  const x = Math.min(ANALYSIS_COLS - 1, Math.floor(point.x / FIELD_DIMENSIONS.lengthM * ANALYSIS_COLS))
  const y = Math.min(ANALYSIS_ROWS - 1, Math.floor(point.y / FIELD_DIMENSIONS.widthM * ANALYSIS_ROWS))
  return y * ANALYSIS_COLS + x
}

/** Event-derived report. No frame history, and no synthetic coordinates for missing events. */
export function buildScoutingAnalysis(result) {
  const report = { version: 1, home: team(), away: team(), marks: [] }
  const roles = { home: null, away: null }
  let swapped = false
  let attempt = null
  let caught = null
  let stall = null
  const names = Object.fromEntries((result?.boxScore ?? []).map(p => [p.playerId, `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()]))
  function player(side, id) {
    if (id == null) return null
    return report[side].players[id] ??= { ...entity(), name: names[id] || String(id), games: 1 }
  }
  function update(side, id, values = {}, map = null, point = null, teamAlso = true) {
    if (!report[side]) return
    const p = player(side, id)
    const targets = [...(teamAlso ? [report[side]] : []), ...(p ? [p] : [])]
    for (const target of targets) {
      for (const key of ['all', ...(roles[side] ? [roles[side]] : [])]) {
        const b = target[key]
        for (const [k, v] of Object.entries(values)) b[k] += v
        if (map && point) b.maps[map][cell(point)] = (b.maps[map][cell(point)] ?? 0) + 1
      }
    }
  }
  for (const e of result?.events ?? []) {
    if (e.type === 'point_start') {
      if (e.fastMode) report.spatialModel = 'simplified'
      swapped = e.sidesSwapped ?? (e.pointIndex % 2 === 0)
      attempt = null
      caught = null
      stall = null
      for (const side of ['home', 'away']) {
        roles[side] = e[`${side}PointStartRole`] ?? (e.attackTeam === side ? 'offense' : 'defense')
        update(side, null, { pointsPlayed: 1 })
        for (const id of e[`${side}LineupIds`] ?? []) update(side, id, { pointsPlayed: 1 }, null, null, false)
      }
    } else if (e.type === 'throw_attempt') {
      attempt = e
      caught = null
    } else if (e.type === 'throw_success' || e.type === 'throw_fail') {
      const side = e.possessionTeam
      if (!report[side]) continue
      const a = attempt?.possessionTeam === side ? attempt : {}
      const thrower = e.throwerId ?? a.throwerId
      const receiver = e.receiverId ?? a.receiverId
      const success = e.type === 'throw_success'
      const release = normalize(a.releasePoint, side, swapped)
      const end = normalize(success ? e.catchPoint : e.turnoverPoint, side, swapped)
      const pressure = (e.stallCount ?? a.stallCount ?? 0) >= 4
      update(side, thrower, { attempts: 1, completions: +success, throwMeters: success ? (e.yardsGained ?? 0) : 0,
        huckAttempts: +!!e.isHuck, huckCompletions: +(success && !!e.isHuck), pressureAttempts: +pressure, pressureCompletions: +(success && pressure) }, 'throws', release)
      if (success) {
        update(side, thrower, {}, 'completedThrows', release)
        update(side, receiver, { catches: 1, catchMeters: e.yardsGained ?? 0 }, 'catches', end)
        caught = { side, from: release, to: end, thrower, receiver }
      } else {
        const kind = e.isBlock ? 'blocks' : e.isDrop ? 'drops' : 'otherLosses'
        update(side, thrower, { turnovers: 1 }, 'losses', end)
        update(side, thrower, {}, kind, end)
        if (e.isDrop) update(side, receiver, { drops: 1 })
        if (e.isBlock) update(opposite(side), e.defenderId, { blocks: 1 })
        if (end) report.marks.push({ side, role: roles[side], kind, ...end, playerId: thrower, receiverId: receiver })
        caught = null
      }
      attempt = null
    } else if (e.type === 'stall_out') {
      // The following TURNOVER event is the same loss, not another one.
      const side = e.possessionTeam ?? e.team
      if (report[side]) update(side, e.throwerId, { turnovers: 1 })
      stall = { side, playerId: e.throwerId }
      caught = null
    } else if (e.type === 'turnover') {
      if (stall) {
        const side = opposite(e.newPossession)
        const p = normalize(e.turnoverPoint, side, swapped)
        update(side, stall.playerId, {}, 'losses', p)
        update(side, stall.playerId, {}, 'otherLosses', p)
        if (p) report.marks.push({ side, role: roles[side], kind: 'otherLosses', ...p, playerId: stall.playerId })
      }
      stall = null
      caught = null
    } else if (e.type === 'score') {
      if (!report[e.team]) continue
      const c = caught?.side === e.team && caught.receiver === e.receiverId ? caught : null
      update(e.team, e.receiverId, { goals: 1 }, 'goals', c?.to)
      if (e.throwerId != null) update(e.team, e.throwerId, { assists: 1 }, 'assists', c?.from)
      if (c?.to) report.marks.push({ side: e.team, role: roles[e.team], kind: 'goals', ...c.to, from: c.from, playerId: e.receiverId, throwerId: e.throwerId })
      caught = null
    } else if (e.type === 'point_end' && report[e.scoringTeam]) {
      for (const side of ['home', 'away']) update(side, null, { [side === e.scoringTeam ? 'pointsWon' : 'pointsLost']: 1 })
    }
  }
  report.hasEvents = (result?.events ?? []).some(e => e.type === 'point_start')
  return report
}

function mergeEntity(target, source) {
  for (const role of ['all', 'offense', 'defense']) {
    for (const key of counters) target[role][key] += source[role][key]
    for (const layer of layers) for (const [index, count] of Object.entries(source[role].maps[layer])) {
      target[role].maps[layer][index] = (target[role].maps[layer][index] ?? 0) + count
    }
  }
}

/** Persist only the managed club: latest report + running counters and fixed-size grids. */
export function saveScoutingAnalysis(league, record) {
  const side = record.homeTeamId === league.playerTeamId ? 'home' : record.awayTeamId === league.playerTeamId ? 'away' : null
  const club = side && league.teamsById?.[league.playerTeamId]
  if (!club) return
  const previous = club.scoutingAnalysis
  if (previous?.last?.fixtureId === record.fixtureId) return
  const report = record.scoutingAnalysis
  const last = { fixtureId: record.fixtureId, date: league.currentDate, homeScore: record.homeScore, awayScore: record.awayScore,
    homeName: league.teamsById?.[record.homeTeamId]?.name ?? record.homeTeamId,
    awayName: league.teamsById?.[record.awayTeamId]?.name ?? record.awayTeamId, side,
    report: report?.hasEvents ? report : null }
  const total = previous?.total ?? { ...team(), games: 0 }
  if (report?.hasEvents) {
    mergeEntity(total, report[side])
    total.games += 1
    if (report.spatialModel === 'simplified') total.simplifiedGames = (total.simplifiedGames ?? 0) + 1
    for (const [id, p] of Object.entries(report[side].players)) {
      const target = total.players[id] ??= { ...entity(), name: p.name, games: 0 }
      mergeEntity(target, p)
      target.name = p.name
      target.games += 1
    }
  }
  club.scoutingAnalysis = { version: 1, last, total }
}
