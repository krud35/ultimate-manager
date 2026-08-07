import { completionRate, huckRate, summarizeLineStartPoints } from '../matchEngine'
import { useUiLang } from '../ui/UiLangContext'
import { matchStrings } from '../ui/strings/match'

function emptySide() {
  return {
    totalYards: 0,
    throwAttempts: 0,
    completions: 0,
    huckAttempts: 0,
    huckCompletions: 0,
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
      className="flex flex-col gap-2.5 rounded-lg border border-ufa-border/70 bg-ufa-bg/55 px-3 py-3 shadow-sm shadow-black/10"
      title={title ?? undefined}
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-ufa-muted">
        {label}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className="text-right text-sm font-bold tabular-nums text-blue-400 sm:text-base">
          {homeVal}
        </p>
        <span className="text-[10px] text-ufa-muted/70" aria-hidden>
          ·
        </span>
        <p className="text-left text-sm font-bold tabular-nums text-red-400 sm:text-base">
          {awayVal}
        </p>
      </div>
      {total != null ? (
        <div
          className="flex h-1 overflow-hidden rounded-full bg-ufa-border/60"
          aria-hidden
        >
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
            style={{ width: `${homeShare}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-red-400 to-red-500"
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
export default function MatchDashboard({
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
      homeVal: linePts.home.offense,
      awayVal: linePts.away.offense,
      title: t.holdTitle,
    },
    {
      label: t.break,
      homeVal: linePts.home.defense,
      awayVal: linePts.away.defense,
      title: t.breakTitle,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20 sm:p-5">
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-lg bg-ufa-bg/80 py-5 ring-1 ring-ufa-border sm:gap-10">
        <div className="min-w-[7rem] text-center">
          <p
            className="max-w-[11rem] truncate text-sm font-medium text-blue-400/90"
            title={homeName}
          >
            {homeName}
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums text-ufa-text">
            {homeScore ?? 0}
          </p>
        </div>
        <span className="text-2xl text-ufa-muted">:</span>
        <div className="min-w-[7rem] text-center">
          <p
            className="max-w-[11rem] truncate text-sm font-medium text-red-400/90"
            title={awayName}
          >
            {awayName}
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums text-ufa-text">
            {awayScore ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
          {t.matchStatsTitle}
        </p>
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
          {tiles.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-center gap-4 text-[10px] uppercase tracking-wide text-ufa-muted">
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
}
