import { memo } from 'react'
import {
  completionRate,
  huckRate,
  pressureCompletionRate,
  summarizeLineStartPoints,
  holdPct,
  breakPct,
} from '../matchEngine'
import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'

function emptySide() {
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

function parseLeadingNumber(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const m = String(val ?? '').match(/^-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function StatTile({ label, homeVal, awayVal, title = null }) {
  const homeNum = parseLeadingNumber(homeVal)
  const awayNum = parseLeadingNumber(awayVal)
  const total =
    homeNum != null && awayNum != null && homeNum + awayNum > 0
      ? homeNum + awayNum
      : null
  const homeShare = total != null ? (homeNum / total) * 100 : 50

  return (
    <div
      className="flex flex-col gap-2.5 border-b border-ufa-border px-3 py-3"
      title={title ?? undefined}
    >
      <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-ufa-muted">
        {label}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className="text-right text-sm font-bold tabular-nums text-ufa-info sm:text-base">
          {homeVal}
        </p>
        <span className="text-[11px] text-ufa-muted/70" aria-hidden>
          ·
        </span>
        <p className="text-left text-sm font-bold tabular-nums text-ufa-danger sm:text-base">
          {awayVal}
        </p>
      </div>
      {total != null ? (
        <div
          className="flex h-1 overflow-hidden rounded-full bg-ufa-border/60"
          aria-hidden
        >
          <div
            className="h-full bg-blue-500"
            style={{ width: `${homeShare}%` }}
          />
          <div
            className="h-full bg-red-500"
            style={{ width: `${100 - homeShare}%` }}
          />
        </div>
      ) : (
        <div className="h-1 rounded-full bg-ufa-border/40" aria-hidden />
      )}
    </div>
  )
}

/**
 * Wynik + kluczowe statystyki meczu — wynik i wyśrodkowane kafelki.
 */
const MatchDashboard = memo(function MatchDashboard({
  matchStats,
  homeName,
  awayName,
  homeScore = 0,
  awayScore = 0,
  matchEvents = null,
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)
  const home = matchStats?.home ?? emptySide()
  const away = matchStats?.away ?? emptySide()
  const linePts = summarizeLineStartPoints(matchEvents)
  const homeTo = home.turnovers?.length ?? 0
  const awayTo = away.turnovers?.length ?? 0

  const fmtPct = (n) => `${n.toFixed(0)}%`
  const fmtComp = (s) =>
    s.throwAttempts === 0
      ? '—'
      : `${s.completions}/${s.throwAttempts} (${fmtPct(completionRate(s))})`
  const fmtHuck = (s) =>
    s.huckAttempts === 0
      ? '0'
      : `${s.huckCompletions}/${s.huckAttempts} (${fmtPct(huckRate(s))})`
  const fmtPressure = (s) => {
    const rate = pressureCompletionRate(s)
    return rate == null ? '—' : `${s.pressureCompletions}/${s.pressureAttempts} (${fmtPct(rate)})`
  }
  const fmtHold = (lineSide) => {
    const pct = holdPct(lineSide)
    return pct == null ? `${lineSide.offense}` : `${lineSide.offense}/${lineSide.offensePoints} (${fmtPct(pct)})`
  }
  const fmtBreak = (lineSide) => {
    const pct = breakPct(lineSide)
    return pct == null ? `${lineSide.defense}` : `${lineSide.defense}/${lineSide.defensePoints} (${fmtPct(pct)})`
  }

  const tiles = [
    {
      label: t.yardsFromThrows,
      homeVal: home.totalYards ?? 0,
      awayVal: away.totalYards ?? 0,
    },
    {
      label: t.completions,
      homeVal: fmtComp(home),
      awayVal: fmtComp(away),
    },
    {
      label: t.hucks,
      homeVal: fmtHuck(home),
      awayVal: fmtHuck(away),
      title: t.huckTitle,
    },
    {
      label: t.turnovers,
      homeVal: homeTo,
      awayVal: awayTo,
    },
    {
      label: t.hold,
      homeVal: fmtHold(linePts.home),
      awayVal: fmtHold(linePts.away),
      title: t.holdTitle,
    },
    {
      label: t.break,
      homeVal: fmtBreak(linePts.home),
      awayVal: fmtBreak(linePts.away),
      title: t.breakTitle,
    },
    {
      label: t.pressureCompletions,
      homeVal: fmtPressure(home),
      awayVal: fmtPressure(away),
      title: t.pressureCompletionsTitle,
    },
  ]

  return (
    <div className="um-scoreboard mx-auto w-full max-w-4xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 py-5">
        <div className="min-w-0 text-center">
          <p
            className="text-base font-semibold text-ufa-info/90"
            title={homeName}
          >
            {homeName}
          </p>
          <p className="um-scoreboard-number mt-2 tabular-nums text-ufa-text">
            {homeScore ?? 0}
          </p>
        </div>
        <span className="text-2xl text-ufa-muted">:</span>
        <div className="min-w-0 text-center">
          <p
            className="text-base font-semibold text-ufa-danger/90"
            title={awayName}
          >
            {awayName}
          </p>
          <p className="um-scoreboard-number mt-2 tabular-nums text-ufa-text">
            {awayScore ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-ufa-muted">
          {t.matchStatsTitle}
        </p>
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
          {tiles.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] uppercase tracking-wide text-ufa-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden />
            {t.homeShort}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden />
            {t.awayShort}
          </span>
        </div>
      </div>
    </div>
  )
})

export default MatchDashboard
