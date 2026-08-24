/**
 * Skrzynka odbiorcza managera — powiadomienia kariery.
 * Typy: raport treningowy, oferta transferowa, analiza pomeczowa, zdarzenie losowe.
 */

import { getPlayerFullName } from '../data/mockPlayers.js'
import { getOverallRating } from '../models/playerStats.js'
import { getPlayerForm, formLabel } from '../models/playerForm.js'
import { getPlayerMorale, moraleLabel } from '../models/playerMorale.js'
import { focusLabel, intensityLabel } from './teamTraining.js'
import { worldTeamById, worldTeamsList, findWorldPlayerById } from './worldState.js'
import { addDays, formatISODate, parseISODate } from '../league/seasonCalendar.js'
import {
  computeAskPrice,
  formatUsd,
  getPlayerMarketValue,
  getTransferBudget,
  getTransferPolicy,
  isTransferWindowOpen,
  refreshPlayerMarketValue,
  classifyTransferTarget,
} from './transfers/index.js'
import {
  pickRandomEventMessage,
  pickPostMatchEventMessage,
} from './randomEvents.js'
import { academyCountryLabel } from '../data/academyScoutGeography.js'
import { getPlayerKnowledge, playerSearchCriteriaScore, playerSearchCriteriaSummary } from './scouting.js'
import { attributeBandLabel, scoutedValueDisplay, trainingRoomLabel } from '../ui/fogOfWar.js'
import { holdPct, breakPct, pressureCompletionRate } from '../matchEngine'
import { seasonStatsForPlayer } from '../league/leagueStats.js'

export const INBOX_TYPES = {
  TRAINING_REPORT: 'training_report',
  TRANSFER_OFFER: 'transfer_offer',
  MATCH_ANALYSIS: 'match_analysis',
  RANDOM_EVENT: 'random_event',
  INJURY: 'injury',
  CLUB_NEWS: 'club_news',
  SCOUT_REPORT: 'scout_report',
}

export const INBOX_TYPE_META = {
  [INBOX_TYPES.TRAINING_REPORT]: {
    labelPl: 'Trening',
    labelEn: 'Training',
    navigateTo: 'training',
  },
  [INBOX_TYPES.TRANSFER_OFFER]: {
    labelPl: 'Transfer',
    labelEn: 'Transfer',
    navigateTo: 'club-transfers',
  },
  [INBOX_TYPES.MATCH_ANALYSIS]: {
    labelPl: 'Mecz',
    labelEn: 'Match',
    navigateTo: 'team-schedule',
  },
  [INBOX_TYPES.RANDOM_EVENT]: {
    labelPl: 'Zdarzenie',
    labelEn: 'Event',
    navigateTo: null,
  },
  [INBOX_TYPES.INJURY]: {
    labelPl: 'Kontuzja',
    labelEn: 'Injury',
    navigateTo: 'roster',
  },
  [INBOX_TYPES.CLUB_NEWS]: {
    labelPl: 'Klub',
    labelEn: 'Club',
    navigateTo: 'club-board',
  },
  [INBOX_TYPES.SCOUT_REPORT]: {
    labelPl: 'Scouting',
    labelEn: 'Scouting',
    navigateTo: 'team-profile',
  },
}

const INBOX_MAX = 80

// club_news payload.kind values that are pure FYI (money/routine notices) — never
// worth interrupting the "simulate until something needs attention" loop for.
const SILENT_CLUB_NEWS_KINDS = new Set([
  'sponsor_payout',
  'sponsor_expired',
  'sponsor_expiring_soon',
  'contract_bonus_paid',
  'fan_shop',
  'tv_payout',
  'league_placement_prize',
  'cup_placement_prize',
  'retirement',
])

// Pure info/report inbox types — never worth interrupting the loop.
const SILENT_REPORT_TYPES = new Set([INBOX_TYPES.TRAINING_REPORT, INBOX_TYPES.SCOUT_REPORT])

// transfer_offer payload {kind, status} combos that actually need the manager's
// input right now — mirrors the "bidPending" badge logic in InboxView. Everything
// else under transfer_offer (awaiting a reply, already resolved, a completed-deal
// FYI) is informational and shouldn't interrupt the simulation.
function isActionableTransferOffer(payload) {
  const kind = payload?.kind
  const status = payload?.status
  if (kind === 'incoming_bid') return status === 'pending' || status === 'counter'
  if (kind === 'outgoing_club_offer') return status === 'counter' || status === 'club_agreed'
  if (kind === 'outgoing_player_contract') return status === 'counter' || status === 'rejected'
  if (kind === 'pending_registration') return status === 'pending_confirm'
  return false
}

/**
 * Czy ta wiadomość powinna przerwać ciągłą symulację kalendarza ("Dalej")?
 * Raporty (treningowe, scouting) i rutynowe newsy klubowe (wypłaty, wygaśnięcia)
 * są ciche — kariera leci dalej. Zdarzenia losowe, które oferują opcję "zignoruj",
 * też nie blokują — gracz świadomie może je pominąć. Kontuzje, aktywne oferty/
 * odpowiedzi transferowe, decyzje bez opcji zignorowania i alarmy finansowe
 * zatrzymują symulację.
 */
export function isImportantInboxMessage(message) {
  if (!message) return false
  if (SILENT_REPORT_TYPES.has(message.type)) return false
  if (message.type === INBOX_TYPES.RANDOM_EVENT) {
    if (message.payload?.kind !== 'decision' || message.payload?.status !== 'pending') return false
    const choices = message.payload?.choices
    const canIgnore = Array.isArray(choices) && choices.some((c) => c?.id === 'ignore')
    return !canIgnore
  }
  if (message.type === INBOX_TYPES.TRANSFER_OFFER) {
    return isActionableTransferOffer(message.payload)
  }
  if (message.type === INBOX_TYPES.CLUB_NEWS) {
    const kind = message.payload?.kind
    return !SILENT_CLUB_NEWS_KINDS.has(kind)
  }
  return true
}

export function hasImportantInboxMessage(messages) {
  return (messages ?? []).some(isImportantInboxMessage)
}

/** Pierwsza "blokująca" wiadomość z listy — do podświetlenia w skrzynce po zatrzymaniu symulacji. */
export function firstImportantInboxMessage(messages) {
  return (messages ?? []).find(isImportantInboxMessage) ?? null
}

function newMessageId(prefix = 'msg') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function teamName(career, teamId) {
  return (
    worldTeamById(career?.world, teamId)?.name ??
    career?.league?.teamsById?.[teamId]?.name ??
    teamId
  )
}

/** Upewnia się, że kariera ma tablicę inbox (migracja starych zapisów). */
export function ensureInbox(career) {
  if (!career) return []
  if (!Array.isArray(career.inbox)) career.inbox = []
  return career.inbox
}

export function unreadInboxCount(career) {
  return ensureInbox(career).filter((m) => !m.read).length
}

export function createInboxMessage({
  type,
  title,
  body,
  titleEn = null,
  bodyEn = null,
  date = null,
  seasonIndex = null,
  seasonYear = null,
  payload = {},
  read = false,
}) {
  return {
    id: newMessageId(type),
    type,
    createdAt: new Date().toISOString(),
    date,
    seasonIndex,
    seasonYear,
    read: !!read,
    title,
    body,
    ...(titleEn ? { titleEn } : {}),
    ...(bodyEn ? { bodyEn } : {}),
    payload: payload ?? {},
  }
}

/**
 * Dokłada wiadomości na początek skrzynki (najnowsze pierwsze), z deduplikacją i limitem.
 * @returns {object[]} nowa tablica inbox
 */
export function appendInboxMessages(inbox, messages, { dedupeKey = null } = {}) {
  const list = Array.isArray(inbox) ? [...inbox] : []
  const incoming = (messages ?? []).filter(Boolean)
  if (!incoming.length) return list

  const existingKeys = new Set()
  if (dedupeKey) {
    for (const m of list) {
      const key = dedupeKey(m)
      if (key) existingKeys.add(key)
    }
  }

  const toAdd = []
  for (const msg of incoming) {
    if (dedupeKey) {
      const key = dedupeKey(msg)
      if (key && existingKeys.has(key)) continue
      if (key) existingKeys.add(key)
    }
    toAdd.push(msg)
  }

  if (!toAdd.length) return list
  return [...toAdd, ...list].slice(0, INBOX_MAX)
}

export function markInboxRead(inbox, messageId) {
  return (inbox ?? []).map((m) => (m.id === messageId ? { ...m, read: true } : m))
}

export function markAllInboxRead(inbox) {
  return (inbox ?? []).map((m) => (m.read ? m : { ...m, read: true }))
}

export function deleteInboxMessage(inbox, messageId) {
  return (inbox ?? []).filter((m) => m.id !== messageId)
}

/** Raport z sesji treningowej drużyny gracza. */
export function messageFromTrainingReport(report, career) {
  if (!report) return null
  const focusesPl = (report.focuses ?? []).map((id) => focusLabel(id, 'pl')).join(' + ')
  const focusesEn = (report.focuses ?? []).map((id) => focusLabel(id, 'en')).join(' + ')
  const intensityPl = intensityLabel(report.intensity, 'pl')
  const intensityEn = intensityLabel(report.intensity, 'en')
  const bumps = report.skillBumps ?? 0
  const quality =
    report.qualityLabel ?? (report.quality != null ? `${report.quality}%` : null)
  const qualityEn =
    report.qualityLabelEn ?? report.qualityLabel ?? (report.quality != null ? `${report.quality}%` : null)
  const tacticsPl =
    typeof report.tacticsDelta === 'number' && report.tacticsDelta > 0
      ? ` · znajomość taktyki +${report.tacticsDelta.toFixed(1)}`
      : ''
  const tacticsEn =
    typeof report.tacticsDelta === 'number' && report.tacticsDelta > 0
      ? ` · tactics familiarity +${report.tacticsDelta.toFixed(1)}`
      : ''

  return createInboxMessage({
    type: INBOX_TYPES.TRAINING_REPORT,
    title: `Raport treningowy · ${quality ?? 'sesja'}`,
    titleEn: `Training report · ${qualityEn ?? 'session'}`,
    body: `${focusesPl || 'Trening'} (${intensityPl}). Frekwencja ${report.attendance ?? 0}%, zaangażowanie ${report.engagement ?? 0}%. Jakość ${report.quality ?? 0}% · ${bumps} skoków skilli${tacticsPl}.`,
    bodyEn: `${focusesEn || 'Training'} (${intensityEn}). Attendance ${report.attendance ?? 0}%, engagement ${report.engagement ?? 0}%. Quality ${report.quality ?? 0}% · ${bumps} skill bumps${tacticsEn}.`,
    date: report.date ?? career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'session',
      report,
    },
  })
}

export function messagesFromTrainingReports(reports, career) {
  return (reports ?? []).map((r) => messageFromTrainingReport(r, career)).filter(Boolean)
}

function injuryDayWord(days, lang = 'pl') {
  if (lang === 'en') return days === 1 ? 'day' : 'days'
  if (days === 1) return 'dzień'
  return 'dni'
}

/**
 * Wiadomość o kontuzji zawodnika.
 * @param {object} career
 * @param {{ playerId: string, name?: string, label: string, labelEn?: string, daysRemaining: number, source?: 'match'|'training', date?: string }} injury
 */
export function messageFromInjury(career, injury) {
  if (!injury?.playerId || !injury.label || !(injury.daysRemaining > 0)) return null
  const name = injury.name || 'Zawodnik'
  const nameEn = injury.name || 'Player'
  const days = injury.daysRemaining
  const labelEn = injury.labelEn ?? injury.label
  const sourcePl = injury.source === 'training' ? 'na treningu' : 'w meczu'
  const sourceEn = injury.source === 'training' ? 'in training' : 'in a match'
  return createInboxMessage({
    type: INBOX_TYPES.INJURY,
    title: `Kontuzja · ${name}`,
    titleEn: `Injury · ${nameEn}`,
    body: `${name} doznał ${injury.label} ${sourcePl}. Niedostępny przez ${days} ${injuryDayWord(days, 'pl')}.`,
    bodyEn: `${nameEn} suffered ${labelEn} ${sourceEn}. Out for ${days} ${injuryDayWord(days, 'en')}.`,
    date: injury.date ?? career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      playerId: injury.playerId,
      name,
      label: injury.label,
      daysRemaining: days,
      source: injury.source === 'training' ? 'training' : 'match',
    },
  })
}

/** Kontuzje z raportów treningowych drużyny gracza. */
export function messagesFromTrainingInjuries(reports, career) {
  const out = []
  for (const report of reports ?? []) {
    for (const inj of report.injuries ?? []) {
      const msg = messageFromInjury(career, {
        ...inj,
        source: 'training',
        date: report.date,
      })
      if (msg) out.push(msg)
    }
  }
  return out
}

/** Lista kontuzji (np. z meczu) → wiadomości inbox. */
export function messagesFromInjuries(injuries, career, { date = null, source = 'match' } = {}) {
  return (injuries ?? [])
    .map((inj) =>
      messageFromInjury(career, {
        ...inj,
        source: inj.source ?? source,
        date: inj.date ?? date,
      }),
    )
    .filter(Boolean)
}

/**
 * Kontuzje drużyny gracza z nowych wpisów matchHistory (AI / zapisane w rekordzie).
 */
export function messagesFromNewMatchInjuries(
  career,
  prevHistory,
  nextHistory,
  { date = null } = {},
) {
  const playerTeamId = career?.playerTeamId
  if (!playerTeamId) return []
  const prevIds = new Set((prevHistory ?? []).map((h) => h.fixtureId))
  const out = []
  for (const entry of nextHistory ?? []) {
    if (!entry || prevIds.has(entry.fixtureId)) continue
    const involvesPlayer =
      entry.homeTeamId === playerTeamId || entry.awayTeamId === playerTeamId
    if (!involvesPlayer) continue
    for (const inj of entry.injuries ?? []) {
      if (inj.teamId && inj.teamId !== playerTeamId) continue
      // Bez teamId: przyjmij tylko gdy zawodnik jest w drużynie gracza
      if (!inj.teamId) {
        const team = worldTeamById(career?.world, playerTeamId)
        const onRoster = (team?.players ?? []).some((p) => p.id === inj.playerId)
        if (!onRoster) continue
      }
      const msg = messageFromInjury(career, {
        ...inj,
        source: 'match',
        date: date ?? career?.league?.currentDate ?? null,
      })
      if (msg) out.push(msg)
    }
  }
  return out
}

function boxRowName(row) {
  return (
    (row.name ?? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()) || 'Zawodnik'
  )
}

function filterOurBoxRows(boxScore, playerTeamId, side) {
  if (!boxScore?.length) return []
  const rows = boxScore.filter((row) => {
    if (row.teamId === side) return true
    if (row.teamId === playerTeamId) return true
    return false
  })
  return rows.length ? rows : []
}

function playerImpactScore(row) {
  return (
    (row.goals ?? 0) +
    (row.assists ?? 0) * 0.7 +
    (row.blocks ?? 0) * 0.5 -
    (row.turnovers ?? 0) * 1.2
  )
}

function mapPlayerSummary(row) {
  return {
    playerId: row.playerId,
    name: boxRowName(row),
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    blocks: row.blocks ?? 0,
    turnovers: row.turnovers ?? 0,
    pointsPlayed: row.pointsPlayed ?? 0,
    impact: Math.round(playerImpactScore(row) * 10) / 10,
  }
}

function topBoxScoreRows(boxScore, playerTeamId, side, limit = 3) {
  const scored = filterOurBoxRows(boxScore, playerTeamId, side)
  if (!scored.length) return []
  return [...scored]
    .sort((a, b) => playerImpactScore(b) - playerImpactScore(a))
    .filter((r) => (r.goals ?? 0) + (r.assists ?? 0) + (r.blocks ?? 0) > 0)
    .slice(0, limit)
}

function worstBoxScoreRows(boxScore, playerTeamId, side, limit = 3, excludeIds = null) {
  const scored = filterOurBoxRows(boxScore, playerTeamId, side)
  if (!scored.length) return []
  const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds ?? [])
  const pool = scored.filter(
    (r) => (r.pointsPlayed ?? 0) > 0 && !exclude.has(r.playerId),
  )
  const list = pool.length
    ? pool
    : scored.filter((r) => !exclude.has(r.playerId))
  if (!list.length) return []
  return [...list]
    .sort((a, b) => {
      const diff = playerImpactScore(a) - playerImpactScore(b)
      if (diff !== 0) return diff
      return (b.turnovers ?? 0) - (a.turnovers ?? 0)
    })
    .slice(0, limit)
}

function compactBoxScoreForPayload(boxScore) {
  if (!boxScore?.length) return []
  return boxScore.map((r) => ({
    playerId: r.playerId,
    firstName: r.firstName ?? '',
    lastName: r.lastName ?? '',
    name: boxRowName(r),
    teamId: r.teamId ?? null,
    goals: r.goals ?? 0,
    assists: r.assists ?? 0,
    blocks: r.blocks ?? 0,
    turnovers: r.turnovers ?? 0,
    pointsPlayed: r.pointsPlayed ?? 0,
  }))
}

function fmtCompletion(teamStats) {
  if (!teamStats || !(teamStats.throwAttempts > 0)) return '—'
  const pct =
    teamStats.completionPct != null
      ? teamStats.completionPct
      : Math.round(((teamStats.completions ?? 0) / teamStats.throwAttempts) * 1000) / 10
  return `${teamStats.completions}/${teamStats.throwAttempts} (${pct}%)`
}

/** Analiza pomeczowa (pełna z box score / matchStats lub uproszczona z historii). */
export function messageFromMatchAnalysis(career, { fixture, record, autoSimulated = false }) {
  if (!fixture && !record) return null
  const playerTeamId = career.playerTeamId
  const homeTeamId = record?.homeTeamId ?? fixture?.homeTeamId
  const awayTeamId = record?.awayTeamId ?? fixture?.awayTeamId
  const homeScore = record?.homeScore ?? fixture?.homeScore ?? 0
  const awayScore = record?.awayScore ?? fixture?.awayScore ?? 0
  const winner = record?.winner ?? record?.winnerTeamId ?? fixture?.winnerTeamId
  const fixtureId = record?.fixtureId ?? fixture?.id
  if (!fixtureId || !homeTeamId || !awayTeamId) return null

  const homeName = teamName(career, homeTeamId)
  const awayName = teamName(career, awayTeamId)
  const isHome = homeTeamId === playerTeamId
  const ourScore = isHome ? homeScore : awayScore
  const theirScore = isHome ? awayScore : homeScore
  const won = winner === playerTeamId
  const draw = homeScore === awayScore
  const resultLabel = draw ? 'Remis' : won ? 'Zwycięstwo' : 'Porażka'
  const resultLabelEn = draw ? 'Draw' : won ? 'Win' : 'Loss'
  const competition =
    (record?.competition ?? fixture?.competition) === 'cup' ? 'Puchar' : 'Liga'
  const competitionEn =
    (record?.competition ?? fixture?.competition) === 'cup' ? 'Cup' : 'League'

  const ourSide = isHome ? 'home' : 'away'
  const theirSide = isHome ? 'away' : 'home'
  const boxScore = record?.boxScore ?? fixture?.boxScore ?? []
  const bestRows = topBoxScoreRows(boxScore, playerTeamId, ourSide)
  const best = bestRows.map(mapPlayerSummary)
  const worst = worstBoxScoreRows(
    boxScore,
    playerTeamId,
    ourSide,
    3,
    bestRows.map((r) => r.playerId),
  ).map(mapPlayerSummary)

  const matchStats = record?.matchStats ?? null
  const ourStats = matchStats?.[ourSide] ?? null
  const theirStats = matchStats?.[theirSide] ?? null
  const linePoints = record?.linePoints ?? null
  const ourLine = linePoints?.[ourSide] ?? null
  const theirLine = linePoints?.[theirSide] ?? null

  const bestText = best.length
    ? best
        .map((r) => {
          const bits = []
          if (r.goals) bits.push(`${r.goals}G`)
          if (r.assists) bits.push(`${r.assists}A`)
          if (r.blocks) bits.push(`${r.blocks}B`)
          if (r.turnovers) bits.push(`${r.turnovers}TO`)
          return `${r.name} (${bits.join('/') || '0'})`
        })
        .join(', ')
    : null
  const worstText = worst.length
    ? worst
        .map((r) => {
          const bits = []
          if (r.turnovers) bits.push(`${r.turnovers}TO`)
          if (r.goals || r.assists || r.blocks) {
            bits.push(`${r.goals}G/${r.assists}A/${r.blocks}B`)
          }
          return `${r.name}${bits.length ? ` (${bits.join(', ')})` : ''}`
        })
        .join(', ')
    : null

  const bodyParts = [
    `${homeName} ${homeScore}–${awayScore} ${awayName} · Twój wynik ${ourScore}–${theirScore}.`,
  ]
  const bodyPartsEn = [
    `${homeName} ${homeScore}–${awayScore} ${awayName} · Your score ${ourScore}–${theirScore}.`,
  ]
  if (ourStats) {
    bodyParts.push(
      `Twoje staty: ${fmtCompletion(ourStats)} podań, ${ourStats.totalYards ?? 0} m.`,
    )
    bodyPartsEn.push(
      `Your stats: ${fmtCompletion(ourStats)} completions, ${ourStats.totalYards ?? 0} m.`,
    )
  }
  const ourHoldPct = holdPct(ourLine)
  const ourBreakPct = breakPct(ourLine)
  if (ourLine) {
    const holdBit =
      ourHoldPct == null
        ? `${ourLine.offense ?? 0} z O-line`
        : `Hold ${Math.round(ourHoldPct)}% (${ourLine.offense}/${ourLine.offensePoints})`
    const breakBit =
      ourBreakPct == null
        ? `${ourLine.defense ?? 0} z D-line`
        : `Break ${Math.round(ourBreakPct)}% (${ourLine.defense}/${ourLine.defensePoints})`
    const holdBitEn =
      ourHoldPct == null
        ? `${ourLine.offense ?? 0} from O-line`
        : `Hold ${Math.round(ourHoldPct)}% (${ourLine.offense}/${ourLine.offensePoints})`
    const breakBitEn =
      ourBreakPct == null
        ? `${ourLine.defense ?? 0} from D-line`
        : `Break ${Math.round(ourBreakPct)}% (${ourLine.defense}/${ourLine.defensePoints})`
    bodyParts.push(`${holdBit}, ${breakBit}.`)
    bodyPartsEn.push(`${holdBitEn}, ${breakBitEn}.`)
  }
  const ourPressureRate = pressureCompletionRate(ourStats)
  if (ourPressureRate != null) {
    bodyParts.push(
      `Pod presją (wysoki stall): ${ourStats.pressureCompletions}/${ourStats.pressureAttempts} (${Math.round(ourPressureRate)}%).`,
    )
    bodyPartsEn.push(
      `Under pressure (high stall count): ${ourStats.pressureCompletions}/${ourStats.pressureAttempts} (${Math.round(ourPressureRate)}%).`,
    )
  }
  if (bestText) {
    bodyParts.push(`Najlepsi: ${bestText}.`)
    bodyPartsEn.push(`Best: ${bestText}.`)
  }
  if (worstText) {
    bodyParts.push(`Najsłabsi: ${worstText}.`)
    bodyPartsEn.push(`Worst: ${worstText}.`)
  }
  if (!bestText && !ourStats) {
    if (autoSimulated) {
      bodyParts.push('Mecz rozegrany automatycznie (symulacja).')
      bodyPartsEn.push('Match played automatically (simulation).')
    } else {
      bodyParts.push('Szczegółowe statystyki niedostępne dla tego meczu.')
      bodyPartsEn.push('Detailed stats unavailable for this match.')
    }
  }

  const payloadBox = compactBoxScoreForPayload(boxScore)

  return createInboxMessage({
    type: INBOX_TYPES.MATCH_ANALYSIS,
    title: `Analiza pomeczowa · ${resultLabel} (${competition})`,
    titleEn: `Match analysis · ${resultLabelEn} (${competitionEn})`,
    body: bodyParts.join(' '),
    bodyEn: bodyPartsEn.join(' '),
    date: fixture?.date ?? career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      fixtureId,
      homeTeamId,
      awayTeamId,
      homeTeamName: homeName,
      awayTeamName: awayName,
      homeScore,
      awayScore,
      winner,
      competition: record?.competition ?? fixture?.competition ?? 'league',
      resultLabel,
      resultLabelEn,
      ourScore,
      theirScore,
      ourSide,
      autoSimulated: !!autoSimulated,
      // legacy alias
      highlights: best,
      bestPlayers: best,
      worstPlayers: worst,
      teamStats: {
        ours: ourStats,
        theirs: theirStats,
        ourPoints: ourScore,
        theirPoints: theirScore,
        ourLinePoints: ourLine,
        theirLinePoints: theirLine,
        ourHoldPct,
        ourBreakPct,
        ourPressureCompletionPct: ourPressureRate == null ? null : Math.round(ourPressureRate * 10) / 10,
      },
      boxScore: payloadBox,
      hasBoxScore: payloadBox.length > 0,
    },
  })
}

/** Uzupełnia analizy z nowych wpisów matchHistory (np. po auto-symulacji). */
export function messagesFromNewPlayerMatches(career, prevHistory, nextHistory, league) {
  const prevIds = new Set((prevHistory ?? []).map((e) => e.fixtureId))
  const playerTeamId = career?.playerTeamId
  if (!playerTeamId) return []

  const out = []
  for (const entry of nextHistory ?? []) {
    if (!entry?.playedByPlayer) continue
    if (prevIds.has(entry.fixtureId)) continue
    if (entry.homeTeamId !== playerTeamId && entry.awayTeamId !== playerTeamId) continue
    const fixture =
      (league?.fixtures ?? []).find((f) => f.id === entry.fixtureId) ?? null
    out.push(
      messageFromMatchAnalysis(career, {
        fixture,
        record: entry,
        autoSimulated: true,
      }),
    )
    out.push(pickPostMatchEventMessage(career, { fixture, record: entry }))
  }
  return out.filter(Boolean)
}

/** @deprecated prefer messagesFromNewPlayerMatches — pełna historia zalewa skrzynkę */
export function messagesFromPlayerMatchHistory(career, league = career?.league) {
  return messagesFromNewPlayerMatches(career, [], league?.matchHistory ?? [], league)
}

/** Wiadomość po sfinalizowanym transferze z udziałem gracza. */
export function messageFromTransferDeal(entry, career) {
  if (!entry?.involvesPlayer) return null
  const bought = entry.toTeamId === career.playerTeamId
  const verb = bought ? 'Kupiłeś' : 'Sprzedałeś'
  const verbEn = bought ? 'You bought' : 'You sold'
  const other = bought ? entry.fromTeamName : entry.toTeamName
  const prep = bought ? 'z' : 'do'
  const prepEn = bought ? 'from' : 'to'

  return createInboxMessage({
    type: INBOX_TYPES.TRANSFER_OFFER,
    title: `Transfer sfinalizowany · ${entry.playerName}`,
    titleEn: `Transfer completed · ${entry.playerName}`,
    body: `${verb} ${entry.playerName} (OVR ${entry.playerOvr}) ${prep} ${other} za ${formatUsd(entry.fee)}.`,
    bodyEn: `${verbEn} ${entry.playerName} (OVR ${entry.playerOvr}) ${prepEn} ${other} for ${formatUsd(entry.fee)}.`,
    date: entry.date ?? career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'completed_deal',
      entryId: entry.id,
      playerId: entry.playerId,
      fee: entry.fee,
      bought,
    },
  })
}

export function messagesFromNewTransferLogEntries(prevLog, nextLog, career) {
  const prevIds = new Set((prevLog ?? []).map((e) => e.id))
  const fresh = (nextLog ?? []).filter((e) => e?.involvesPlayer && !prevIds.has(e.id))
  return fresh.map((e) => messageFromTransferDeal(e, career)).filter(Boolean)
}

/**
 * Czy AI kupujący zainteresuje się zawodnikiem gracza.
 * Cele: jakość/upgrade, młody talent, weteran-okazja; forma; morale otwiera drzwi.
 * @returns {number} 0–1 szansa zainteresowania
 */
function aiIncomingInterestChance(buyer, player, seller, rng) {
  const form = getPlayerForm(player)
  const morale = getPlayerMorale(player)
  const target = classifyTransferTarget(player, buyer)
  const { ovr, age, pot, room, buyerAvg, prospect, strongProspect, veteran, veteranBargain } =
    target
  const avg = buyerAvg ?? 70
  const rank = [...(seller.players ?? [])]
    .sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
    .findIndex((p) => String(p.id) === String(player.id))

  // Twarde odrzucenia: dołek formy / zupełnie słabi (z wyjątkiem mocnych talentów).
  if (form < 50) return 0
  if (ovr < 66 && !strongProspect) return 0
  if (ovr < 70 && form < 62 && !prospect) return 0
  if (ovr < avg - 5 && !prospect && !veteranBargain) return 0
  if (ovr < 68 && !prospect) return 0
  // Weterani bez poziomu — nie.
  if (veteran && ovr < 70) return 0
  if (age >= 37) return 0

  let chance = 0.1

  if (ovr >= avg + 3) chance += 0.28
  else if (ovr >= avg + 1) chance += 0.2
  else if (ovr >= avg - 1) chance += 0.14
  else if (ovr >= avg - 3) chance += 0.06
  else chance += 0.015

  if (form >= 82) chance += 0.14
  else if (form >= 72) chance += 0.07
  else if (form >= 62) chance += 0.02
  else chance -= 0.12

  // Młody z potencjałem — osobny tor zakupowy.
  if (strongProspect) chance += 0.34
  else if (prospect) {
    chance += 0.22
    if (room >= 6) chance += 0.08
    if (pot >= avg + 4) chance += 0.06
  }

  // Starsi: tańsi względem OVR, depth / krótkoterminowa jakość.
  if (veteranBargain) chance += 0.2
  else if (veteran && ovr >= avg - 1) chance += 0.12
  else if (veteran && ovr >= avg - 3) chance += 0.06

  // Niskie morale → zawodnik „chce odejść” / agent szuka wyjścia.
  if (morale < 42) chance += 0.26
  else if (morale < 50) chance += 0.16
  else if (morale < 58) chance += 0.07
  else if (morale >= 88 && rank <= 1 && !prospect) chance -= 0.08

  if (rank === 0) chance *= prospect ? 0.7 : 0.55
  else if (rank <= 2) chance *= prospect || veteranBargain ? 0.85 : 0.75

  const policy = getTransferPolicy(buyer)
  if (policy.id === 'buy') chance += 0.06
  if (policy.id === 'hardline') chance -= 0.04
  // Kluby „sell” chętniej biorą tanie weterany.
  if (policy.id === 'sell' && veteranBargain) chance += 0.05

  return Math.max(0, Math.min(0.88, chance + (rng() - 0.5) * 0.04))
}

function pendingBidPlayerIds(inbox) {
  const ids = new Set()
  for (const m of inbox ?? []) {
    const p = m?.payload
    if (
      m?.type === INBOX_TYPES.TRANSFER_OFFER &&
      p?.kind === 'incoming_bid' &&
      (p.status === 'pending' || p.status === 'counter')
    ) {
      ids.add(String(p.playerId))
    }
  }
  return ids
}

/**
 * Oferty AI na zawodników z drużyny gracza.
 * Cele: jakość, młody talent, weteran-okazja; forma; morale ułatwia odejście.
 */
export function generateIncomingTransferOffers(career, { date = null } = {}) {
  if (!career?.world || !isTransferWindowOpen(career)) return []

  const simDate = date ?? career.league?.currentDate
  if (!simDate) return []

  const playerTeam = worldTeamById(career.world, career.playerTeamId)
  if (!playerTeam?.players?.length || playerTeam.players.length <= 14) return []

  const seed = hashSeed(
    `${career.id}|${career.seasonIndex}|${simDate}|inbox-offers-v3|${(career.inbox ?? []).length}`,
  )
  const rng = mulberry32(seed)

  // Bazowo rzadko; lekki bump przy niezadowolonych / atrakcyjnych talentach / weteranach.
  const unhappyQuality = playerTeam.players.some((p) => {
    const ovr = getOverallRating(p.skills)
    const morale = getPlayerMorale(p)
    const form = getPlayerForm(p)
    return ovr >= 74 && morale < 52 && form >= 55
  })
  const hasHotTarget = playerTeam.players.some((p) => {
    const t = classifyTransferTarget(p)
    const form = getPlayerForm(p)
    return form >= 55 && (t.strongProspect || t.veteranBargain)
  })
  const dayChance = unhappyQuality ? 0.13 : hasHotTarget ? 0.11 : 0.09
  if (rng() > dayChance) return []

  const aiTeams = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)
  if (!aiTeams.length) return []

  const blocked = pendingBidPlayerIds(career.inbox)
  const roster = [...playerTeam.players].filter((p) => !blocked.has(String(p.id)))
  if (!roster.length) return []

  // Wagi: OVR/forma + talent młodych + okazje weteranów + niskie morale.
  const weighted = []
  for (const player of roster) {
    const form = getPlayerForm(player)
    const morale = getPlayerMorale(player)
    const target = classifyTransferTarget(player)
    if (form < 50) continue
    if (target.ovr < 66 && !target.strongProspect) continue
    if (target.ovr < 68 && !target.prospect) continue
    if (target.veteran && target.ovr < 70) continue

    let w = Math.max(0.05, (target.ovr - 66) / 22 + (form - 50) / 45)
    if (target.strongProspect) w *= 1.7
    else if (target.prospect) w *= 1.4
    if (target.veteranBargain) w *= 1.35
    else if (target.veteran && target.ovr >= 72) w *= 1.15
    if (morale < 45) w *= 1.5
    else if (morale < 55) w *= 1.22
    weighted.push({ player, w, target })
  }
  if (!weighted.length) return []

  const totalW = weighted.reduce((s, x) => s + x.w, 0)
  let pick = rng() * totalW
  let chosenRow = weighted[0]
  for (const row of weighted) {
    pick -= row.w
    if (pick <= 0) {
      chosenRow = row
      break
    }
  }
  const chosen = chosenRow.player
  const chosenTarget = chosenRow.target

  refreshPlayerMarketValue(chosen)
  const ask = computeAskPrice(chosen, playerTeam)
  const value = getPlayerMarketValue(chosen)
  const ovr = getOverallRating(chosen.skills)
  const form = getPlayerForm(chosen)
  const morale = getPlayerMorale(chosen)

  const interested = []
  for (const team of aiTeams) {
    const budget = getTransferBudget(team)
    const budgetFloor = chosenTarget.prospect
      ? ask * 0.75
      : chosenTarget.veteran
        ? ask * 0.72
        : ask * 0.8
    if (budget < budgetFloor) continue
    const chance = aiIncomingInterestChance(team, chosen, playerTeam, rng)
    if (rng() < chance) interested.push({ team, budget, chance })
  }
  interested.sort((a, b) => b.chance - a.chance || b.budget - a.budget)
  if (!interested.length) return []

  const buyer =
    interested[Math.min(Math.floor(rng() * Math.min(3, interested.length)), interested.length - 1)]

  // Pricing: talenty drożej względem ask; weterani — niższe oferty.
  let offerMult = 0.9 + rng() * 0.2
  if (chosenTarget.strongProspect) offerMult = 0.98 + rng() * 0.2
  else if (chosenTarget.prospect) offerMult = 0.94 + rng() * 0.18
  else if (chosenTarget.veteranBargain) offerMult = 0.82 + rng() * 0.16
  else if (chosenTarget.veteran) offerMult = 0.85 + rng() * 0.14
  if (morale < 48) offerMult -= 0.06
  if (form >= 80) offerMult += 0.04
  let fee = Math.round((ask * offerMult) / 1000) * 1000
  fee = Math.min(fee, buyer.budget)
  const reserve = Math.round(buyer.budget * 0.06)
  if (fee > buyer.budget - reserve && buyer.budget > reserve * 2) {
    fee = Math.round((buyer.budget - reserve) / 1000) * 1000
  }
  const minFeeRatio = chosenTarget.veteran ? 0.65 : 0.72
  if (fee < value * minFeeRatio) return []

  const name = getPlayerFullName(chosen)
  const expires = formatISODate(addDays(parseISODate(simDate), 2 + Math.floor(rng() * 3)))
  const moraleNote =
    morale < 50
      ? ` ${name.split(' ').pop()} ma słabe morale (${moraleLabel(morale)}) i może naciskać na odejście.`
      : ''
  const formNote = ` Forma: ${formLabel(form)} (${form}).`
  const ageNote = ` Wiek ${chosenTarget.age}.`

  return [
    createInboxMessage({
      type: INBOX_TYPES.TRANSFER_OFFER,
      title: `Oferta transferowa · ${name}`,
      titleEn: `Transfer offer · ${name}`,
      body: `${buyer.team.name} oferuje ${formatUsd(fee)} za ${name} (OVR ${ovr}).${ageNote}${formNote}${moraleNote} Negocjuj w skrzynce — oferta ważna do ${expires}.`,
      bodyEn: `${buyer.team.name} offers ${formatUsd(fee)} for ${name} (OVR ${ovr}). Age ${chosenTarget.age}. Form: ${formLabel(form, 'en')} (${form}).${morale < 50 ? ` Low morale (${moraleLabel(morale, 'en')}) — may push to leave.` : ''} Negotiate in the inbox — offer valid until ${expires}.`,
      date: simDate,
      seasonIndex: career.seasonIndex,
      seasonYear: career.seasonYear,
      payload: {
        kind: 'incoming_bid',
        status: 'pending',
        playerId: chosen.id,
        playerName: name,
        playerOvr: ovr,
        playerAge: chosenTarget.age,
        playerPotential: chosenTarget.pot,
        playerForm: form,
        playerMorale: morale,
        targetMotive: chosenTarget.motive,
        askPrice: ask,
        marketValue: value,
        fee,
        originalFee: fee,
        fromTeamId: buyer.team.id,
        fromTeamName: buyer.team.name,
        expiresDate: expires,
        negotiationLog: [],
      },
    }),
  ]
}

/**
 * Aktualizuje jedną wiadomość w skrzynce (np. status oferty).
 */
export function updateInboxMessage(inbox, messageId, patch) {
  return (inbox ?? []).map((m) => {
    if (m.id !== messageId) return m
    const nextPayload =
      patch.payload != null ? { ...(m.payload ?? {}), ...patch.payload } : m.payload
    return { ...m, ...patch, payload: nextPayload }
  })
}

/**
 * Wygasa zaległe oferty (po dacie lub zamknięciu okna — bez kasowania aktywnych negocjacji poza oknem).
 */
export function expireStaleTransferOffers(career, { date = null } = {}) {
  const inbox = ensureInbox(career)
  const today = date ?? career?.league?.currentDate
  const windowOpen = isTransferWindowOpen(career)
  let changed = false
  const next = inbox.map((m) => {
    const p = m.payload
    if (m.type !== INBOX_TYPES.TRANSFER_OFFER) return m

    // Przychodzące oferty AI — tylko w oknie / do expiresDate
    if (
      p?.kind === 'incoming_bid' &&
      (p.status === 'pending' || p.status === 'counter' || p.status === 'awaiting_reply')
    ) {
      const expiredByDate = today && p.expiresDate && today > p.expiresDate
      if (!windowOpen || expiredByDate) {
        changed = true
        return {
          ...m,
          read: m.read,
          body: `${m.body} · Oferta wygasła.`,
          bodyEn: `${m.bodyEn ?? m.body} · Offer expired.`,
          payload: { ...p, status: 'expired' },
        }
      }
      return m
    }

    // Prośba o rejestrację — wygasa, gdy okno się zamknie bez potwierdzenia
    if (p?.kind === 'pending_registration' && p.status === 'pending_confirm' && !windowOpen) {
      changed = true
      return {
        ...m,
        body: `${m.body} · Okno się zamknęło — rejestracja nieważna.`,
        bodyEn: `${m.bodyEn ?? m.body} · The window closed — registration void.`,
        payload: { ...p, status: 'expired' },
      }
    }

    // Umowa wstępna powiadomiona w oknie, ale niepotwierdzona do zamknięcia okna
    if (p?.status === 'pre_agreed' && p.registrationNotified && !windowOpen) {
      changed = true
      return {
        ...m,
        body: `${m.body} · Nie potwierdzono rejestracji przed zamknięciem okna — umowa wygasła.`,
        bodyEn: `${m.bodyEn ?? m.body} · Registration wasn't confirmed before the window closed — the deal expired.`,
        payload: { ...p, status: 'expired' },
      }
    }

    return m
  })
  return changed ? next : inbox
}

/**
 * Zdarzenia losowe decyzyjne — ~26% szansy na 1 event / dzień (SPAWN_CHANCE w randomEvents.js).
 */
export function generateRandomEvents(career, { date = null } = {}) {
  const msg = pickRandomEventMessage(career, { date })
  return msg ? [msg] : []
}

function scoutedPlayerLine(world, playerId, knowledge, lang) {
  const { player } = findWorldPlayerById(world, playerId)
  if (!player) return null
  const name = getPlayerFullName(player)
  const ovr = getOverallRating(player.skills)
  return `${name}: ${attributeBandLabel(ovr, lang)}`
}

function findAcademyCandidate(team, candidateId) {
  return (team?.academyCandidates ?? []).find((p) => p.id === candidateId) ?? null
}

/** Linia raportu: nazwisko (wiek) — pasmo OVR + pasmo potencjału, oba zamglone `knowledge`. */
function academyCandidateBandLine(team, candidateId, lang, { isNew = false } = {}) {
  const candidate = findAcademyCandidate(team, candidateId)
  if (!candidate) return null
  const name = getPlayerFullName(candidate)
  const knowledge = getPlayerKnowledge(team, candidateId)
  const ovr = getOverallRating(candidate.skills)
  const ovrDisplay = scoutedValueDisplay(ovr, knowledge, lang)
  const room = (candidate.potential ?? ovr) - ovr
  const potentialLabel = trainingRoomLabel(room, candidate.age, lang)
  const prefix = isNew ? (lang === 'en' ? 'NEW · ' : 'NOWY · ') : ''
  return `${prefix}${name} (${candidate.age}): ${ovrDisplay.label}, ${potentialLabel}`
}

/** Comiesięczny raport z trwającej kampanii `academyProspect` (`advanceAcademyCampaigns`). */
export function messageFromAcademyCampaignReport(report, career) {
  if (!report) return null
  const team = worldTeamById(career?.world, career?.playerTeamId)
  const country = academyCountryLabel(report.countryId, 'pl')
  const countryEn = academyCountryLabel(report.countryId, 'en')
  const newSet = new Set(report.newCandidateIds ?? [])
  const linesPl = (report.candidateIds ?? [])
    .map((id) => academyCandidateBandLine(team, id, 'pl', { isNew: newSet.has(id) }))
    .filter(Boolean)
  const linesEn = (report.candidateIds ?? [])
    .map((id) => academyCandidateBandLine(team, id, 'en', { isNew: newSet.has(id) }))
    .filter(Boolean)
  return createInboxMessage({
    type: INBOX_TYPES.SCOUT_REPORT,
    title: `Scouting · Miesiąc ${report.monthNumber}/${report.monthsTotal}: ${country}`,
    titleEn: `Scouting · Month ${report.monthNumber}/${report.monthsTotal}: ${countryEn}`,
    body: `Comiesięczny raport skauta z kraju ${country}. Obserwowani kandydaci: ${linesPl.join('; ') || 'brak'}.`,
    bodyEn: `Monthly scouting report from ${countryEn}. Candidates observed: ${linesEn.join('; ') || 'none'}.`,
    date: career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'academyWatch',
      missionId: report.missionId,
      countryId: report.countryId ?? null,
      candidateIds: report.candidateIds ?? [],
      concluded: false,
      monthNumber: report.monthNumber,
      monthsTotal: report.monthsTotal,
    },
  })
}

export function messagesFromAcademyCampaignReports(reports, career) {
  return (reports ?? []).map((r) => messageFromAcademyCampaignReport(r, career)).filter(Boolean)
}

/**
 * Linia raportu misji `playerSearch`: nazwisko (klub/wolny agent) — pasmo OVR + pasmo
 * dopasowania do kryteriów gracza (oba zamglone `knowledge`), plus zawsze jawna
 * produkcja sezonowa — to ona rośnie na znaczeniu wraz z rozgrywanymi meczami.
 */
function playerSearchCandidateLine(world, team, playerId, criteria, leaguePlayerStats, lang) {
  const { player, teamId } = findWorldPlayerById(world, playerId)
  if (!player) return null
  const name = getPlayerFullName(player)
  const knowledge = getPlayerKnowledge(team, playerId)
  const ovr = getOverallRating(player.skills)
  const ovrDisplay = scoutedValueDisplay(ovr, knowledge, lang)
  const fit = playerSearchCriteriaScore(player, criteria)
  const fitDisplay = scoutedValueDisplay(fit, knowledge, lang)
  const club = teamId
    ? worldTeamById(world, teamId)?.name ?? teamId
    : lang === 'pl'
      ? 'wolny agent'
      : 'free agent'
  const s = seasonStatsForPlayer(leaguePlayerStats, player)
  const production = `${s.goals}G/${s.assists}A/${s.blocks}B`
  const fitLabel = lang === 'pl' ? 'dopasowanie' : 'fit'
  return `${name} (${club}): ${ovrDisplay.label}, ${fitLabel} ${fitDisplay.label}, ${production}`
}

/** Cotygodniowy raport z trwającej kampanii `playerSearch` (`advancePlayerSearchCampaigns`). */
export function messageFromPlayerSearchReport(report, career) {
  if (!report) return null
  const team = worldTeamById(career?.world, career?.playerTeamId)
  const summaryPl = playerSearchCriteriaSummary(report.criteria, 'pl')
  const summaryEn = playerSearchCriteriaSummary(report.criteria, 'en')
  const leaguePlayerStats = career?.league?.playerStats
  const linesPl = (report.candidateIds ?? [])
    .map((id) => playerSearchCandidateLine(career?.world, team, id, report.criteria, leaguePlayerStats, 'pl'))
    .filter(Boolean)
  const linesEn = (report.candidateIds ?? [])
    .map((id) => playerSearchCandidateLine(career?.world, team, id, report.criteria, leaguePlayerStats, 'en'))
    .filter(Boolean)
  return createInboxMessage({
    type: INBOX_TYPES.SCOUT_REPORT,
    title: `Scouting · Tydzień ${report.weekNumber}/${report.weeksTotal}: poszukiwania`,
    titleEn: `Scouting · Week ${report.weekNumber}/${report.weeksTotal}: search`,
    body: `Cotygodniowy raport poszukiwań (kryteria: ${summaryPl}). Sugerowani zawodnicy: ${linesPl.join('; ') || 'brak'}.`,
    bodyEn: `Weekly player-search report (criteria: ${summaryEn}). Suggested targets: ${linesEn.join('; ') || 'none'}.`,
    date: career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'playerSearchWatch',
      missionId: report.missionId,
      criteria: report.criteria ?? null,
      candidateIds: report.candidateIds ?? [],
      concluded: false,
      weekNumber: report.weekNumber,
      weeksTotal: report.weeksTotal,
    },
  })
}

export function messagesFromPlayerSearchReports(reports, career) {
  return (reports ?? []).map((r) => messageFromPlayerSearchReport(r, career)).filter(Boolean)
}

/**
 * Raport z zakończonej misji skautingowej (`resolveScoutMissions` w career/scouting.js).
 * @param {object} mission — wynik misji: { kind, opponentTeamId, targetPlayerId, knowledgeGained, tacticsGained, revealedPlayers }
 */
export function messageFromScoutMission(mission, career, { date = null } = {}) {
  if (!mission?.kind) return null
  const world = career?.world
  const resolvedDate = date ?? career?.league?.currentDate ?? null

  if (mission.kind === 'academyProspect') {
    const team = worldTeamById(world, career?.playerTeamId)
    const country = academyCountryLabel(mission.countryId, 'pl')
    const countryEn = academyCountryLabel(mission.countryId, 'en')
    const linesPl = (mission.candidateIds ?? [])
      .map((id) => academyCandidateBandLine(team, id, 'pl'))
      .filter(Boolean)
    const linesEn = (mission.candidateIds ?? [])
      .map((id) => academyCandidateBandLine(team, id, 'en'))
      .filter(Boolean)
    const recalled = !!mission.academyRecalled
    return createInboxMessage({
      type: INBOX_TYPES.SCOUT_REPORT,
      title: recalled
        ? `Scouting · Skaut wrócił wcześniej: ${country}`
        : `Scouting · Misja zakończona: ${country}`,
      titleEn: recalled
        ? `Scouting · Scout recalled early: ${countryEn}`
        : `Scouting · Mission complete: ${countryEn}`,
      body: `Skaut wraca z kraju ${country}${recalled ? ' (odwołany wcześniej)' : ''}. Obserwowani kandydaci: ${linesPl.join('; ') || 'brak'}. Zdecyduj w Akademii, kogo sprowadzić, kogo obserwować dalej, a kogo odrzucić.`,
      bodyEn: `Your scout is back from ${countryEn}${recalled ? ' (recalled early)' : ''}. Candidates observed: ${linesEn.join('; ') || 'none'}. Decide in the Academy who to sign, keep watching, or reject.`,
      date: resolvedDate,
      seasonIndex: career?.seasonIndex ?? null,
      seasonYear: career?.seasonYear ?? null,
      payload: {
        kind: 'academyWatch',
        missionId: mission.id,
        countryId: mission.countryId ?? null,
        candidateIds: mission.candidateIds ?? [],
        concluded: true,
        recalled,
      },
    })
  }

  if (mission.kind === 'playerSearch') {
    const team = worldTeamById(world, career?.playerTeamId)
    const summaryPl = playerSearchCriteriaSummary(mission.criteria, 'pl')
    const summaryEn = playerSearchCriteriaSummary(mission.criteria, 'en')
    const leaguePlayerStats = career?.league?.playerStats
    const linesPl = (mission.candidateIds ?? [])
      .map((id) => playerSearchCandidateLine(world, team, id, mission.criteria, leaguePlayerStats, 'pl'))
      .filter(Boolean)
    const linesEn = (mission.candidateIds ?? [])
      .map((id) => playerSearchCandidateLine(world, team, id, mission.criteria, leaguePlayerStats, 'en'))
      .filter(Boolean)
    const recalled = !!mission.playerSearchRecalled
    return createInboxMessage({
      type: INBOX_TYPES.SCOUT_REPORT,
      title: recalled ? `Scouting · Skaut wrócił wcześniej: poszukiwania` : `Scouting · Misja zakończona: poszukiwania`,
      titleEn: recalled ? `Scouting · Scout recalled early: search` : `Scouting · Mission complete: search`,
      body: `Skaut wraca z poszukiwań (kryteria: ${summaryPl})${recalled ? ' (odwołany wcześniej)' : ''}. Sugerowani zawodnicy: ${linesPl.join('; ') || 'brak'}. Otwórz Centrum skautingu, żeby rozpocząć negocjacje.`,
      bodyEn: `Your scout is back from the search (criteria: ${summaryEn})${recalled ? ' (recalled early)' : ''}. Suggested targets: ${linesEn.join('; ') || 'none'}. Open the Scouting Center to start negotiations.`,
      date: resolvedDate,
      seasonIndex: career?.seasonIndex ?? null,
      seasonYear: career?.seasonYear ?? null,
      payload: {
        kind: 'playerSearchWatch',
        missionId: mission.id,
        criteria: mission.criteria ?? null,
        candidateIds: mission.candidateIds ?? [],
        concluded: true,
        recalled,
      },
    })
  }

  const basePayload = {
    kind: mission.kind,
    missionId: mission.id,
    opponentTeamId: mission.opponentTeamId ?? null,
    targetPlayerId: mission.targetPlayerId ?? null,
    knowledgeGained: mission.knowledgeGained ?? 0,
    tacticsGained: mission.tacticsGained ?? 0,
    revealedPlayers: mission.revealedPlayers ?? [],
  }

  if (mission.kind === 'tactics') {
    const name = teamName(career, mission.opponentTeamId)
    return createInboxMessage({
      type: INBOX_TYPES.SCOUT_REPORT,
      title: `Scouting · Taktyka: ${name}`,
      titleEn: `Scouting · ${name} tactics`,
      body: `Skaut obserwował najbliższy mecz ${name} i przeanalizował sposób gry. Znajomość taktyki +${mission.tacticsGained ?? 0}, ogólna znajomość drużyny +${mission.knowledgeGained ?? 0}.`,
      bodyEn: `Your scout watched ${name}'s latest match and broke down their playing style. Tactics familiarity +${mission.tacticsGained ?? 0}, overall team knowledge +${mission.knowledgeGained ?? 0}.`,
      date: resolvedDate,
      seasonIndex: career?.seasonIndex ?? null,
      seasonYear: career?.seasonYear ?? null,
      payload: basePayload,
    })
  }

  if (mission.kind === 'keyPlayers') {
    const name = teamName(career, mission.opponentTeamId)
    const linesPl = (mission.revealedPlayers ?? [])
      .map((r) => scoutedPlayerLine(world, r.playerId, r.knowledge, 'pl'))
      .filter(Boolean)
    const linesEn = (mission.revealedPlayers ?? [])
      .map((r) => scoutedPlayerLine(world, r.playerId, r.knowledge, 'en'))
      .filter(Boolean)
    return createInboxMessage({
      type: INBOX_TYPES.SCOUT_REPORT,
      title: `Scouting · Kluczowi zawodnicy: ${name}`,
      titleEn: `Scouting · ${name} key players`,
      body: `Skaut wytypował czołowych zawodników ${name}: ${linesPl.join('; ') || 'brak danych'}.`,
      bodyEn: `Your scout flagged ${name}'s top players: ${linesEn.join('; ') || 'no data'}.`,
      date: resolvedDate,
      seasonIndex: career?.seasonIndex ?? null,
      seasonYear: career?.seasonYear ?? null,
      payload: basePayload,
    })
  }

  // mission.kind === 'player'
  const { player, teamId } = findWorldPlayerById(world, mission.targetPlayerId)
  const playerName = player ? getPlayerFullName(player) : 'zawodnik'
  const playerNameEn = player ? getPlayerFullName(player) : 'the player'
  const clubPl = teamId ? teamName(career, teamId) : 'wolny agent'
  const clubEn = teamId ? teamName(career, teamId) : 'free agent'
  const bandPl = player ? attributeBandLabel(getOverallRating(player.skills), 'pl') : null
  const bandEn = player ? attributeBandLabel(getOverallRating(player.skills), 'en') : null
  return createInboxMessage({
    type: INBOX_TYPES.SCOUT_REPORT,
    title: `Dossier skautingowe: ${playerName}`,
    titleEn: `Scouting dossier: ${playerNameEn}`,
    body: `Skaut przygotował dossier na ${playerName} (${clubPl}).${bandPl ? ` Ocena: ${bandPl}.` : ''} Znajomość zawodnika +${mission.knowledgeGained ?? 0}.`,
    bodyEn: `Your scout compiled a dossier on ${playerNameEn} (${clubEn}).${bandEn ? ` Rating: ${bandEn}.` : ''} Player knowledge +${mission.knowledgeGained ?? 0}.`,
    date: resolvedDate,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: basePayload,
  })
}

export function messagesFromScoutMissions(missions, career, { date = null } = {}) {
  return (missions ?? []).map((m) => messageFromScoutMission(m, career, { date })).filter(Boolean)
}

/** FYI (nie decyzja) — prospekt akademii skończył 21 lat i został zwolniony na wolny rynek. */
export function messagesFromAcademyAgedOut(players, career, { date = null } = {}) {
  if (!players?.length) return []
  const resolvedDate = date ?? career?.league?.currentDate ?? null
  return players.map((player) => {
    const name = getPlayerFullName(player)
    return createInboxMessage({
      type: INBOX_TYPES.CLUB_NEWS,
      title: `Akademia · ${name} odszedł na wolny rynek`,
      titleEn: `Academy · ${name} released to free agency`,
      body: `${name} skończył 21 lat w akademii i nie został awansowany do seniorów przed terminem — trafił na wolny rynek. Wciąż możesz spróbować go podpisać.`,
      bodyEn: `${name} turned 21 in the academy and wasn't promoted to the senior squad in time — he's been released to the free agent pool. You can still try to re-sign him.`,
      date: resolvedDate,
      seasonIndex: career?.seasonIndex ?? null,
      seasonYear: career?.seasonYear ?? null,
      payload: { kind: 'academy_aged_out', playerId: player.id, playerName: name },
    })
  })
}

/** Klucz deduplikacji dla typowych payloadów. */
export function inboxDedupeKey(message) {
  if (!message) return null
  const p = message.payload ?? {}
  if (message.type === INBOX_TYPES.SCOUT_REPORT && p.kind === 'academyWatch' && p.missionId) {
    return `academy_watch:${p.missionId}:${p.concluded ? 'concluded' : p.monthNumber}`
  }
  if (message.type === INBOX_TYPES.SCOUT_REPORT && p.kind === 'playerSearchWatch' && p.missionId) {
    return `player_search_watch:${p.missionId}:${p.concluded ? 'concluded' : p.weekNumber}`
  }
  if (message.type === INBOX_TYPES.SCOUT_REPORT && p.missionId) {
    return `scout:${p.missionId}`
  }
  if (message.type === INBOX_TYPES.MATCH_ANALYSIS && p.fixtureId) {
    return `match:${p.fixtureId}`
  }
  if (message.type === INBOX_TYPES.INJURY && p.playerId && message.date) {
    return `injury:${p.playerId}:${message.date}:${p.source ?? ''}:${p.label ?? ''}`
  }
  if (message.type === INBOX_TYPES.TRAINING_REPORT && p.report?.date && p.report?.planId) {
    return `train:${p.report.date}:${p.report.planId}`
  }
  if (message.type === INBOX_TYPES.TRAINING_REPORT && p.report?.date) {
    return `train:${p.report.date}:${(p.report.focuses ?? []).join(',')}:${p.report.source ?? ''}`
  }
  if (message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'completed_deal' && p.entryId) {
    return `deal:${p.entryId}`
  }
  if (
    message.type === INBOX_TYPES.TRANSFER_OFFER &&
    p.kind === 'incoming_bid' &&
    p.playerId &&
    message.date
  ) {
    return `bid:${message.date}:${p.playerId}:${p.fromTeamId}`
  }
  if (
    message.type === INBOX_TYPES.TRANSFER_OFFER &&
    p.kind === 'outgoing_club_offer' &&
    p.playerId &&
    message.date &&
    p.offerAmount != null
  ) {
    return `out-club:${message.date}:${p.playerId}:${p.offerAmount}`
  }
  if (
    message.type === INBOX_TYPES.TRANSFER_OFFER &&
    p.kind === 'outgoing_player_contract' &&
    p.playerId &&
    message.date &&
    p.weeklyWage != null
  ) {
    return `out-contract:${message.date}:${p.playerId}:${p.weeklyWage}:${p.years}`
  }
  if (
    message.type === INBOX_TYPES.TRANSFER_OFFER &&
    p.kind === 'pending_registration' &&
    p.playerId &&
    message.date
  ) {
    return `reg:${message.date}:${p.playerId}:${p.sourceMessageId ?? ''}`
  }
  if (
    message.type === INBOX_TYPES.RANDOM_EVENT &&
    p.templateId &&
    message.date
  ) {
    return `event:${message.date}:${p.templateId}`
  }
  if (message.type === INBOX_TYPES.CLUB_NEWS && p.kind === 'sponsor_offers' && p.slot) {
    return `sponsor_offers:${p.slot}:${message.seasonYear ?? ''}`
  }
  if (message.type === INBOX_TYPES.CLUB_NEWS && p.kind === 'sponsor_expired' && p.slot) {
    return `sponsor_expired:${p.slot}:${message.seasonYear ?? ''}`
  }
  if (
    message.type === INBOX_TYPES.CLUB_NEWS &&
    p.kind === 'sponsor_expiring_soon' &&
    p.slot
  ) {
    return `sponsor_soon:${p.slot}:${message.seasonYear ?? ''}`
  }
  if (
    message.type === INBOX_TYPES.CLUB_NEWS &&
    p.kind === 'sponsor_payout' &&
    p.payoutKind &&
    message.date
  ) {
    return `sponsor_pay:${p.payoutKind}:${message.date}`
  }
  return null
}

/**
 * Scala nowe wiadomości do kariery (zwraca nową tablicę inbox).
 */
export function mergeInbox(career, messages) {
  return appendInboxMessages(ensureInbox(career), messages, {
    dedupeKey: inboxDedupeKey,
  })
}
