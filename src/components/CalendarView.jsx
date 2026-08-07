import { useMemo, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { displaySeasonLabel, UI_LANG } from '../ui/locale'
import { commonStrings } from '../ui/strings/common'
import { calendarStrings } from '../ui/strings/calendar'
import {
  addDays,
  formatISODate,
  parseISODate,
  teamNameMap,
  getFixturesOnDate,
  detectSeasonPhase,
  officialSeasonEndDate,
  venueMarkerForTeam,
} from '../league'
import {
  getTeamTrainingsOnDate,
  focusLabel,
  intensityLabel,
  weekdayLabel,
  ensureTeamTraining,
  sessionQualityLabel,
} from '../career/teamTraining.js'

const PHASE_COLOR = {
  fall: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  cup: 'bg-ufa-gold/20 text-ufa-gold border-ufa-gold/30',
  spring: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  offseason: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

function weekdayShortMonFirst(lang) {
  const short = commonStrings(lang).weekdaysShort
  return [short[1], short[2], short[3], short[4], short[5], short[6], short[0]]
}

function mondayOfWeek(date) {
  const d = typeof date === 'string' ? parseISODate(date) : new Date(date.getTime())
  const day = d.getDay()
  const back = day === 0 ? 6 : day - 1
  return addDays(d, -back)
}

function startOfMonth(date) {
  const d = typeof date === 'string' ? parseISODate(date) : new Date(date.getTime())
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatMonthYear(isoOrDate, lang = UI_LANG.PL) {
  const d = typeof isoOrDate === 'string' ? parseISODate(isoOrDate) : isoOrDate
  return d.toLocaleDateString(lang === UI_LANG.EN ? 'en-US' : 'pl-PL', {
    month: 'long',
    year: 'numeric',
  })
}

function formatDayNum(iso) {
  return parseISODate(iso).getDate()
}

function shortTeam(name) {
  if (!name) return '—'
  if (name.length <= 14) return name
  return `${name.slice(0, 12)}…`
}

/** Kompaktowa etykieta meczu gracza: „H Opponent” / „A …” / „N …”. */
function playerFixtureCompactLabel(fixture, league, names) {
  const pid = league.playerTeamId
  const marker = venueMarkerForTeam(fixture, pid) ?? '?'
  const oppId =
    fixture.homeTeamId === pid ? fixture.awayTeamId : fixture.homeTeamId
  return `${marker} ${shortTeam(names[oppId])}`
}

function allFixtures(league) {
  const list = [...(league.fixtures ?? [])]
  const seen = new Set(list.map((f) => f.id))
  for (const m of league.cup?.matches ?? []) {
    if (!seen.has(m.id)) {
      list.push(m)
      seen.add(m.id)
    }
  }
  return list
}

function fixturesByDate(league) {
  const map = new Map()
  for (const f of allFixtures(league)) {
    if (!f.date) continue
    if (!map.has(f.date)) map.set(f.date, [])
    map.get(f.date).push(f)
  }
  return map
}

function isPlayerFixture(league, f) {
  const pid = league.playerTeamId
  return pid && (f.homeTeamId === pid || f.awayTeamId === pid)
}

function VenueTag({ fixture, playerTeamId, className = '' }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const marker = venueMarkerForTeam(fixture, playerTeamId)
  if (!marker) return null
  const tone =
    marker === 'H'
      ? 'text-emerald-300/90'
      : marker === 'A'
        ? 'text-sky-300/90'
        : 'text-ufa-gold'
  const title =
    marker === 'H' ? t.venueHome : marker === 'A' ? t.venueAway : t.venueNeutral
  return (
    <span
      className={`inline-flex min-w-[1.1rem] justify-center rounded border border-current/25 px-0.5 text-[9px] font-semibold tabular-nums ${tone} ${className}`}
      title={title}
    >
      {marker}
    </span>
  )
}

function playerTeamFromLeague(league) {
  const id = league?.playerTeamId
  if (!id || !league?.teamsById) return null
  return league.teamsById[id] ?? null
}

function TrainingChip({ training, compact = false }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const focuses = training.focuses ?? []
  const done = training.completed === true || training.report != null
  const labelA = focusLabel(focuses[0], lang)
  const labelB = focusLabel(focuses[1], lang)
  const intens = intensityLabel(training.intensity, lang)
  const kind = training.source === 'oneOff' ? t.trainingOneOff : t.trainingWeekly

  return (
    <div
      className={`rounded border px-1.5 py-1 text-[10px] leading-tight border-sky-500/40 bg-sky-500/10 ${
        done ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold text-sky-200">
          {compact ? t.training : `${t.training} · ${kind}`}
        </span>
        {done && <span className="text-sky-300/80 shrink-0">✓</span>}
      </div>
      <p className="mt-0.5 text-ufa-text">
        {compact ? (
          <>
            {labelA.slice(0, 8)}
            {labelA.length > 8 ? '…' : ''}
            {' + '}
            {labelB.slice(0, 8)}
            {labelB.length > 8 ? '…' : ''}
          </>
        ) : (
          <>
            {labelA} + {labelB}
          </>
        )}
      </p>
      <p className="mt-0.5 text-ufa-muted">
        {intens}
        {training.report
          ? ` · ${
              lang === UI_LANG.EN
                ? training.report.qualityLabelEn ??
                  training.report.qualityLabel ??
                  (training.report.quality != null
                    ? sessionQualityLabel(training.report.quality / 100, lang)
                    : '')
                : training.report.qualityLabel ??
                  (training.report.quality != null
                    ? sessionQualityLabel(training.report.quality / 100, lang)
                    : '')
            }`
          : done
            ? t.doneSession
            : ''}
      </p>
    </div>
  )
}

function FixtureChip({ fixture, names, league, compact = false, onPlay }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const yours = isPlayerFixture(league, fixture)
  const done = fixture.status === 'completed'
  const home = names[fixture.homeTeamId] ?? 'TBD'
  const away = names[fixture.awayTeamId] ?? 'TBD'
  const isToday = !!fixture.date && fixture.date === league.currentDate
  const canPlay =
    yours &&
    !done &&
    isToday &&
    fixture.homeTeamId &&
    fixture.awayTeamId &&
    onPlay

  return (
    <div
      className={`rounded border px-1.5 py-1 text-[10px] leading-tight ${
        yours
          ? 'border-ufa-accent/50 bg-ufa-accent/15 text-ufa-text'
          : 'border-ufa-border/70 bg-ufa-bg/60 text-ufa-muted'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span>
          {compact ? (
            <>
              <span className={fixture.homeTeamId === league.playerTeamId ? 'text-ufa-accent font-semibold' : ''}>
                {shortTeam(home)}
              </span>
              <span className="opacity-60"> · </span>
              <span className={fixture.awayTeamId === league.playerTeamId ? 'text-ufa-accent font-semibold' : ''}>
                {shortTeam(away)}
              </span>
            </>
          ) : (
            <>
              <span className={fixture.homeTeamId === league.playerTeamId ? 'text-ufa-accent font-semibold' : 'text-ufa-text'}>
                {home}
              </span>
              <span className="text-ufa-muted mx-1">vs</span>
              <span className={fixture.awayTeamId === league.playerTeamId ? 'text-ufa-accent font-semibold' : 'text-ufa-text'}>
                {away}
              </span>
            </>
          )}
          {yours && (
            <VenueTag
              fixture={fixture}
              playerTeamId={league.playerTeamId}
              className="ml-1 align-middle"
            />
          )}
        </span>
        {fixture.competition === 'cup' && (
          <span className="shrink-0 text-ufa-gold">P</span>
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 tabular-nums">
        <span>
          {done ? `${fixture.homeScore}:${fixture.awayScore}` : yours ? t.yourMatch : t.scheduled}
        </span>
        {canPlay && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlay(fixture)
            }}
            className="text-ufa-accent hover:underline font-semibold"
          >
            {t.play}
          </button>
        )}
      </div>
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const views = [
    { id: 'week', label: t.views.week },
    { id: 'month', label: t.views.month },
    { id: 'season', label: t.views.season },
  ]
  return (
    <div className="inline-flex rounded-lg border border-ufa-border bg-ufa-bg/80 p-0.5">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            view === v.id
              ? 'bg-ufa-accent/25 text-ufa-accent'
              : 'text-ufa-muted hover:text-ufa-text'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

function WeekView({ league, names, team, anchorIso, selectedDay, onSelectDay, onPlay }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  const monday = mondayOfWeek(anchorIso)
  const days = Array.from({ length: 7 }, (_, i) => formatISODate(addDays(monday, i)))
  const today = league.currentDate

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((iso, i) => {
        const fixtures = getFixturesOnDate(league, iso)
        const trainings = getTeamTrainingsOnDate(team, iso)
        const isToday = iso === today
        const isSelected = iso === selectedDay
        const phase = detectSeasonPhase(league, iso)
        const empty = fixtures.length === 0 && trainings.length === 0
        return (
          <div
            key={iso}
            role="button"
            tabIndex={0}
            onClick={() => onSelectDay?.(iso)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectDay?.(iso)
              }
            }}
            className={`flex flex-col rounded-xl border bg-ufa-panel min-h-[140px] overflow-hidden text-left transition hover:bg-ufa-panel-hover/40 cursor-pointer ${
              isSelected
                ? 'border-ufa-accent ring-1 ring-ufa-accent/40'
                : isToday
                  ? 'border-ufa-accent/60 ring-1 ring-ufa-accent/30'
                  : 'border-ufa-border'
            }`}
          >
            <div className="border-b border-ufa-border/60 px-2.5 py-2 w-full">
              <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                {weekdayShortMonFirst(lang)[i]}
              </p>
              <p className={`text-sm font-semibold tabular-nums ${isToday || isSelected ? 'text-ufa-accent' : 'text-ufa-text'}`}>
                {iso.slice(5).replace('-', '.')}
                {isToday && <span className="ml-1 text-[10px] font-normal">({t.today})</span>}
              </p>
              <p className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[9px] ${PHASE_COLOR[phase] ?? PHASE_COLOR.offseason}`}>
                {c.phases[phase] ?? phase}
              </p>
            </div>
            <div className="flex-1 space-y-1.5 p-2 w-full">
              {empty ? (
                <p className="text-[10px] text-ufa-muted">{t.noEvents}</p>
              ) : (
                <>
                  {trainings.map((t) => (
                    <TrainingChip key={t.id} training={t} compact />
                  ))}
                  {fixtures.map((f) => (
                    <FixtureChip
                      key={f.id}
                      fixture={f}
                      names={names}
                      league={league}
                      compact
                      onPlay={onPlay}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ league, names, team, anchorIso, selectedDay, onSelectDay }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  const monthStart = startOfMonth(anchorIso)
  const gridStart = mondayOfWeek(monthStart)
  const cells = Array.from({ length: 42 }, (_, i) => formatISODate(addDays(gridStart, i)))
  const month = monthStart.getMonth()
  const year = monthStart.getFullYear()
  const today = league.currentDate
  const byDate = fixturesByDate(league)

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayShortMonFirst(lang).map((d) => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wide text-ufa-muted py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso) => {
          const d = parseISODate(iso)
          const inMonth = d.getMonth() === month && d.getFullYear() === year
          const fixtures = byDate.get(iso) ?? []
          const trainings = getTeamTrainingsOnDate(team, iso)
          const playerOnes = fixtures.filter((f) => isPlayerFixture(league, f))
          const isToday = iso === today
          const isSelected = iso === selectedDay
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDay?.(iso)}
              className={`min-h-[72px] sm:min-h-[88px] rounded-lg border p-1.5 text-left transition hover:bg-ufa-panel-hover/60 ${
                isSelected
                  ? 'border-ufa-accent ring-1 ring-ufa-accent/40 bg-ufa-accent/10'
                  : isToday
                    ? 'border-ufa-accent/60 bg-ufa-accent/10'
                    : inMonth
                      ? 'border-ufa-border bg-ufa-panel'
                      : 'border-ufa-border/40 bg-ufa-bg/40 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-xs tabular-nums font-medium ${
                    isToday || isSelected ? 'text-ufa-accent' : inMonth ? 'text-ufa-text' : 'text-ufa-muted'
                  }`}
                >
                  {formatDayNum(iso)}
                </span>
                <span className="flex items-center gap-0.5">
                  {trainings.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title={t.trainingDot} />
                  )}
                  {playerOnes.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-ufa-accent" title={t.yourMatch} />
                  )}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 hidden sm:block">
                {trainings.slice(0, 1).map((tr) => (
                  <p key={tr.id} className="truncate text-[9px] leading-tight text-sky-300 font-medium">
                    {t.trainingChip(intensityLabel(tr.intensity, lang))}
                  </p>
                ))}
                {playerOnes.slice(0, 2).map((f) => (
                  <p key={f.id} className="truncate text-[9px] leading-tight text-ufa-accent font-medium">
                    {playerFixtureCompactLabel(f, league, names)}
                    {f.competition === 'cup' ? ' · P' : ''}
                  </p>
                ))}
                {fixtures.length > 0 && playerOnes.length === 0 && (
                  <p className="truncate text-[9px] text-ufa-muted">
                    {t.matchCount(fixtures.length)}
                  </p>
                )}
                {fixtures.length > playerOnes.length && playerOnes.length > 0 && (
                  <p className="truncate text-[9px] text-ufa-muted">
                    {t.otherMatchCount(fixtures.length - playerOnes.length)}
                  </p>
                )}
              </div>
              <div className="mt-1 flex gap-0.5 sm:hidden">
                {trainings.slice(0, 2).map((t) => (
                  <span key={t.id} className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                ))}
                {fixtures.slice(0, 4).map((f) => (
                  <span
                    key={f.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      isPlayerFixture(league, f) ? 'bg-ufa-accent' : 'bg-ufa-muted/50'
                    }`}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function countPendingPlayerMatchesBefore(league, targetIso) {
  const today = league.currentDate
  if (!today || !targetIso || targetIso <= today) return 0
  return allFixtures(league).filter(
    (f) =>
      isPlayerFixture(league, f) &&
      f.date &&
      f.date >= today &&
      f.date < targetIso &&
      f.status !== 'completed' &&
      f.homeTeamId &&
      f.awayTeamId,
  ).length
}

function DayPeek({ league, names, team, iso, onPlay, onSimulateUntilDate }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  if (!iso) return null
  const fixtures = getFixturesOnDate(league, iso)
  const trainings = getTeamTrainingsOnDate(team, iso)
  const isFuture = iso > league.currentDate
  const isToday = iso === league.currentDate
  const playerMatchesAhead = isFuture ? countPendingPlayerMatchesBefore(league, iso) : 0
  const phase = detectSeasonPhase(league, iso)
  const empty = fixtures.length === 0 && trainings.length === 0

  const handleSimulate = () => {
    if (!onSimulateUntilDate || !isFuture) return
    const matchNote =
      playerMatchesAhead > 0
        ? t.confirmMatchNotePlayer(playerMatchesAhead)
        : t.confirmMatchNoteAi
    const ok = window.confirm(
      `${t.confirmSim(iso)}${matchNote}\n${t.confirmSimKeep}`,
    )
    if (!ok) return
    onSimulateUntilDate(iso)
  }

  return (
    <div className="mt-4 rounded-xl border border-ufa-border bg-ufa-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-ufa-text">
            {t.eventsTitle(iso, isToday ? ` · ${t.today}` : '')}
          </h3>
          <p className="mt-0.5 text-[10px] text-ufa-muted">
            {c.phases[phase] ?? phase}
          </p>
        </div>
        {isFuture && onSimulateUntilDate && (
          <button
            type="button"
            onClick={handleSimulate}
            className="rounded-md bg-ufa-accent px-4 py-2 text-xs font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.simToDay}
          </button>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-ufa-muted">{t.noEventsDay}</p>
      ) : (
        <div className="space-y-3">
          {trainings.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-sky-300/90 mb-1.5">{t.trainingsSection}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {trainings.map((t) => (
                  <TrainingChip key={t.id} training={t} />
                ))}
              </div>
            </div>
          )}
          {fixtures.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ufa-muted mb-1.5">{t.fixturesSection}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {fixtures.map((f) => (
                  <FixtureChip
                    key={f.id}
                    fixture={f}
                    names={names}
                    league={league}
                    onPlay={isToday ? onPlay : null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {isFuture && onSimulateUntilDate && (
        <p className="mt-3 text-[11px] text-ufa-muted">
          {t.simOverlayHint(playerMatchesAhead)}
        </p>
      )}
    </div>
  )
}

function SeasonView({ league, names, team, onPlay, onSimulateUntilDate }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  const cal = league.calendar
  const byDate = fixturesByDate(league)
  const tt = team ? ensureTeamTraining(team) : null
  const playerFixtures = useMemo(() => {
    return allFixtures(league)
      .filter((f) => isPlayerFixture(league, f) && f.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [league])

  const weeklyPlan = tt?.weekly?.filter((s) => s.enabled !== false) ?? []
  const upcomingOneOff = (tt?.oneOff ?? [])
    .filter((o) => !o.completed && o.date >= (league.currentDate ?? ''))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 8)

  const confirmSimulateTo = (iso) => {
    if (!onSimulateUntilDate || !iso || iso <= league.currentDate) return
    const playerMatchesAhead = countPendingPlayerMatchesBefore(league, iso)
    const matchNote =
      playerMatchesAhead > 0
        ? t.confirmMatchNotePlayer(playerMatchesAhead)
        : t.confirmMatchNoteAi
    const ok = window.confirm(
      `${t.confirmSim(iso)}${matchNote}\n${t.confirmSimKeep}`,
    )
    if (!ok) return
    onSimulateUntilDate(iso)
  }
  const phases = useMemo(() => {
    if (!cal) return []
    const items = []
    if (cal.fallRounds?.length) {
      const firstRound = cal.fallRounds[0]
      const lastRound = cal.fallRounds[cal.fallRounds.length - 1]
      const start = cal.roundDates?.[firstRound]?.[0]?.date ?? cal.startDate
      const lastSlots = cal.roundDates?.[lastRound] ?? []
      const end = lastSlots[lastSlots.length - 1]?.date ?? start
      items.push({
        id: 'fall',
        label: c.phases.fall,
        start,
        end,
        rounds: cal.fallRounds,
        color: PHASE_COLOR.fall,
      })
    }
    if (cal.cup) {
      items.push({
        id: 'cup',
        label: c.phases.cup,
        start: cal.cup.freeWeek1?.start,
        end: cal.cup.freeWeek4?.end,
        rounds: null,
        color: PHASE_COLOR.cup,
        cupWeeks: [
          { label: t.freeWeek, range: cal.cup.freeWeek1 },
          { label: t.pqQuarters, range: cal.cup.playWeek2 },
          { label: t.semisFinal, range: cal.cup.playWeek3 },
          { label: t.freeWeek, range: cal.cup.freeWeek4 },
        ],
      })
    }
    if (cal.springRounds?.length) {
      const firstRound = cal.springRounds[0]
      const lastRound = cal.springRounds[cal.springRounds.length - 1]
      const start = cal.roundDates?.[firstRound]?.[0]?.date
      const lastSlots = cal.roundDates?.[lastRound] ?? []
      const end = lastSlots[lastSlots.length - 1]?.date ?? cal.endDate
      items.push({
        id: 'spring',
        label: c.phases.spring,
        start,
        end,
        rounds: cal.springRounds,
        color: PHASE_COLOR.spring,
      })
    }
    const seasonYear = cal.seasonYear
    const summerStart =
      seasonYear != null ? formatISODate(new Date(seasonYear + 1, 6, 1)) : null
    const officialEnd = cal.officialEndDate ?? officialSeasonEndDate(cal)
    if (summerStart && officialEnd && officialEnd >= summerStart) {
      items.push({
        id: 'offseason',
        label: t.summerWindowEnd,
        start: summerStart,
        end: officialEnd,
        rounds: null,
        color: PHASE_COLOR.offseason,
      })
    }
    return items
  }, [cal, c.phases, t.freeWeek, t.pqQuarters, t.semisFinal, t.summerWindowEnd])

  const currentPhase = detectSeasonPhase(league)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {phases.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border p-4 ${p.color} ${
              currentPhase === p.id ? 'ring-1 ring-ufa-accent/40' : ''
            }`}
          >
            <p className="text-sm font-semibold">{p.label}</p>
            <p className="mt-1 text-xs opacity-80 tabular-nums">
              {p.start ?? '—'} → {p.end ?? '—'}
            </p>
            {p.rounds && (
              <p className="mt-2 text-xs opacity-70">
                {t.roundsRange(p.rounds[0], p.rounds[p.rounds.length - 1])}
              </p>
            )}
            {currentPhase === p.id && (
              <p className="mt-2 text-[10px] uppercase tracking-wide font-semibold">{t.currentPhase}</p>
            )}
          </div>
        ))}
      </div>

      {phases
        .filter((p) => p.cupWeeks)
        .map((p) => (
          <div key={`${p.id}-weeks`} className="rounded-xl border border-ufa-border bg-ufa-panel p-4">
            <h3 className="text-sm font-semibold text-ufa-text mb-3">{t.januaryCupSchedule}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {p.cupWeeks.map((w) => (
                <div
                  key={w.label + (w.range?.start ?? '')}
                  className="rounded-lg border border-ufa-border/70 bg-ufa-bg/50 px-3 py-2"
                >
                  <p className="text-xs font-medium text-ufa-text">{w.label}</p>
                  <p className="text-[10px] text-ufa-muted tabular-nums mt-0.5">
                    {w.range?.start} – {w.range?.end}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

      <div className="rounded-xl border border-ufa-border bg-ufa-panel overflow-hidden">
        <div className="border-b border-ufa-border px-5 py-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-ufa-text text-sm">{t.planTeamTraining}</h3>
          <span className="text-xs text-ufa-muted">
            {t.weeklyOneOffCounts(weeklyPlan.length, upcomingOneOff.length)}
          </span>
        </div>
        {weeklyPlan.length === 0 && upcomingOneOff.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ufa-muted">
            {t.noScheduledTrainings}
          </p>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {weeklyPlan.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {weeklyPlan.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-sky-200">
                      {weekdayLabel(s.weekday, lang)}
                    </p>
                    <p className="text-ufa-text mt-0.5">
                      {focusLabel(s.focuses[0], lang)} + {focusLabel(s.focuses[1], lang)}
                    </p>
                    <p className="text-ufa-muted mt-0.5">
                      {intensityLabel(s.intensity, lang)} {t.everyWeek}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {upcomingOneOff.length > 0 && (
              <ul className="space-y-1.5">
                {upcomingOneOff.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm border-t border-ufa-border/50 pt-2"
                  >
                    <span>
                      <span className="tabular-nums text-sky-300 font-medium">{s.date}</span>
                      <span className="text-ufa-muted mx-2">·</span>
                      <span className="text-ufa-text">
                        {focusLabel(s.focuses[0], lang)} + {focusLabel(s.focuses[1], lang)}
                      </span>
                    </span>
                    <span className="text-xs text-ufa-muted">{intensityLabel(s.intensity, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ufa-border bg-ufa-panel overflow-hidden">
        <div className="border-b border-ufa-border px-5 py-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-ufa-text text-sm">{t.yourSeasonFixtures}</h3>
          <span className="text-xs text-ufa-muted">{t.matchCount(playerFixtures.length)}</span>
        </div>
        {playerFixtures.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ufa-muted">{t.noScheduledFixtures}</p>
        ) : (
          <ul className="divide-y divide-ufa-border/60 max-h-[420px] overflow-y-auto">
            {playerFixtures.map((f) => {
              const done = f.status === 'completed'
              const isPast = f.date < league.currentDate
              const isToday = f.date === league.currentDate
              return (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm ${
                    isToday ? 'bg-ufa-accent/10' : ''
                  }`}
                >
                  <div>
                    <p className="text-[10px] text-ufa-muted tabular-nums">
                      {f.date}
                      {f.competition === 'cup' ? t.cupShort : f.round != null ? t.roundShort(f.round) : ''}
                      {isToday ? ` · ${t.today}` : ''}
                    </p>
                    <p className="text-ufa-text mt-0.5 flex flex-wrap items-center">
                      <span className={f.homeTeamId === league.playerTeamId ? 'font-semibold text-ufa-accent' : ''}>
                        {names[f.homeTeamId] ?? 'TBD'}
                      </span>
                      <span className="text-ufa-muted mx-2">vs</span>
                      <span className={f.awayTeamId === league.playerTeamId ? 'font-semibold text-ufa-accent' : ''}>
                        {names[f.awayTeamId] ?? 'TBD'}
                      </span>
                      <VenueTag
                        fixture={f}
                        playerTeamId={league.playerTeamId}
                        className="ml-2 text-[10px] min-w-[1.35rem] px-1"
                      />
                    </p>
                  </div>
                  <div className="flex items-center gap-3 tabular-nums text-ufa-muted">
                    {done ? (
                      <span className="text-ufa-text font-medium">
                        {f.homeScore}:{f.awayScore}
                      </span>
                    ) : isPast ? (
                      <span>—</span>
                    ) : (
                      <span className="text-xs">{t.scheduled}</span>
                    )}
                    {!done && f.date > league.currentDate && onSimulateUntilDate && (
                      <button
                        type="button"
                        onClick={() => confirmSimulateTo(f.date)}
                        className="rounded-md border border-ufa-border px-2.5 py-1 text-[11px] text-ufa-text hover:bg-ufa-panel-hover"
                      >
                        {t.simToDay}
                      </button>
                    )}
                    {!done && isToday && f.homeTeamId && f.awayTeamId && onPlay && (
                      <button
                        type="button"
                        onClick={() => onPlay(f)}
                        className="rounded-md bg-ufa-accent px-3 py-1 text-xs font-semibold text-ufa-bg hover:opacity-90"
                      >
                        {t.play}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Dense season month strip */}
      {cal?.startDate && cal?.endDate && (
        <SeasonMonthStrip
          league={league}
          team={team}
          byDate={byDate}
          start={cal.startDate}
          end={cal.endDate}
        />
      )}
    </div>
  )
}

function SeasonMonthStrip({ league, team, byDate, start, end }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const months = useMemo(() => {
    const out = []
    let cursor = startOfMonth(start)
    const endD = parseISODate(end)
    while (cursor.getTime() <= endD.getTime()) {
      out.push(new Date(cursor.getTime()))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    return out
  }, [start, end])

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4">
      <h3 className="text-sm font-semibold text-ufa-text mb-3">{t.seasonMap}</h3>
      <div className="flex flex-wrap gap-3">
        {months.map((m) => {
          const y = m.getFullYear()
          const mo = m.getMonth()
          const daysInMonth = new Date(y, mo + 1, 0).getDate()
          const label = m.toLocaleDateString(lang === UI_LANG.EN ? 'en-US' : 'pl-PL', { month: 'short', year: '2-digit' })
          return (
            <div key={`${y}-${mo}`} className="min-w-[100px]">
              <p className="text-[10px] uppercase text-ufa-muted mb-1 capitalize">{label}</p>
              <div className="flex flex-wrap gap-0.5" style={{ width: 84 }}>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const iso = formatISODate(new Date(y, mo, i + 1))
                  const fixtures = byDate.get(iso) ?? []
                  const yours = fixtures.some((f) => isPlayerFixture(league, f))
                  const hasTraining = getTeamTrainingsOnDate(team, iso).length > 0
                  const hasAny = fixtures.length > 0
                  const isToday = iso === league.currentDate
                  return (
                    <span
                      key={iso}
                      title={iso}
                      className={`h-2 w-2 rounded-[2px] ${
                        isToday
                          ? 'ring-1 ring-white bg-ufa-accent'
                          : yours
                            ? 'bg-ufa-accent'
                            : hasTraining
                              ? 'bg-sky-400'
                              : hasAny
                                ? 'bg-ufa-muted/40'
                                : 'bg-ufa-border/50'
                      }`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-ufa-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-ufa-accent" /> {t.yourMatch}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-sky-400" /> {t.training}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-ufa-muted/40" /> {t.otherMatches}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-ufa-border/50" /> {t.freeDay}
        </span>
      </div>
    </div>
  )
}

export default function CalendarView({ league, onPlayFixture, onSimulateUntilDate }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  const names = teamNameMap(league, lang)
  const team = playerTeamFromLeague(league)
  const [view, setView] = useState('week')
  const [anchorIso, setAnchorIso] = useState(league.currentDate ?? league.calendar?.startDate)
  const [selectedDay, setSelectedDay] = useState(league.currentDate ?? null)

  const phase = detectSeasonPhase(league, anchorIso)
  const monday = mondayOfWeek(anchorIso)

  const navLabel = useMemo(() => {
    if (view === 'week') {
      const sun = formatISODate(addDays(monday, 6))
      return `${formatISODate(monday)} – ${sun}`
    }
    if (view === 'month') {
      return formatMonthYear(anchorIso, lang)
    }
    return displaySeasonLabel(league.seasonLabel ?? league.calendar?.seasonLabel ?? t.season, lang)
  }, [view, monday, anchorIso, league.seasonLabel, league.calendar?.seasonLabel, lang, t])

  const shift = (dir) => {
    if (view === 'week') {
      setAnchorIso(formatISODate(addDays(parseISODate(anchorIso), dir * 7)))
      return
    }
    if (view === 'month') {
      const d = parseISODate(anchorIso)
      setAnchorIso(formatISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    }
  }

  const goToday = () => {
    if (league.currentDate) {
      setAnchorIso(league.currentDate)
      setSelectedDay(league.currentDate)
    }
  }

  const upcomingPlayer = useMemo(() => {
    return allFixtures(league)
      .filter(
        (f) =>
          isPlayerFixture(league, f) &&
          f.date &&
          f.date >= league.currentDate &&
          f.status !== 'completed',
      )
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 3)
  }, [league])

  const upcomingTrainings = useMemo(() => {
    if (!team || !league.currentDate) return []
    const out = []
    const cursor = parseISODate(league.currentDate)
    for (let i = 0; i < 21 && out.length < 3; i += 1) {
      const iso = formatISODate(addDays(cursor, i))
      for (const t of getTeamTrainingsOnDate(team, iso)) {
        if (t.completed) continue
        out.push({ ...t, date: iso })
        if (out.length >= 3) break
      }
    }
    return out
  }, [team, league.currentDate, team?.teamTraining])

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{t.calendarTitle}</h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {displaySeasonLabel(league.seasonLabel, lang)} · {t.today} {league.currentDate} ·{' '}
              <span className="text-ufa-text">{c.phases[phase] ?? phase}</span>
            </p>
            <p className="mt-1 text-[11px] text-ufa-muted">
              {t.calendarIntro}
            </p>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        {view !== 'season' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="rounded-md border border-ufa-border px-3 py-1.5 text-sm text-ufa-text hover:bg-ufa-panel-hover"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-md border border-ufa-border px-3 py-1.5 text-xs text-ufa-muted hover:text-ufa-text hover:bg-ufa-panel-hover"
            >
              {t.todayChip}
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded-md border border-ufa-border px-3 py-1.5 text-sm text-ufa-text hover:bg-ufa-panel-hover"
            >
              →
            </button>
            <p className="ml-1 text-sm font-medium text-ufa-text capitalize tabular-nums">
              {navLabel}
            </p>
          </div>
        )}

        {(upcomingPlayer.length > 0 || upcomingTrainings.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {upcomingTrainings.map((tr) => (
              <button
                key={`${tr.id}-${tr.date}`}
                type="button"
                onClick={() => {
                  setView('week')
                  setAnchorIso(tr.date)
                  setSelectedDay(tr.date)
                }}
                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-left hover:bg-sky-500/20"
              >
                <span className="text-sky-300 font-semibold tabular-nums">{tr.date}</span>
                <span className="text-ufa-muted mx-1.5">·</span>
                <span className="text-ufa-text">
                  {t.trainingChip(focusLabel(tr.focuses?.[0], lang))}
                </span>
              </button>
            ))}
            {upcomingPlayer.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setView('week')
                  setAnchorIso(f.date)
                  setSelectedDay(f.date)
                }}
                className="rounded-lg border border-ufa-accent/40 bg-ufa-accent/10 px-3 py-1.5 text-xs text-left hover:bg-ufa-accent/20"
              >
                <span className="text-ufa-accent font-semibold tabular-nums">{f.date}</span>
                <span className="text-ufa-muted mx-1.5">·</span>
                <span className="text-ufa-text">
                  {playerFixtureCompactLabel(f, league, names)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'week' && (
        <>
          <WeekView
            league={league}
            names={names}
            team={team}
            anchorIso={anchorIso}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onPlay={onPlayFixture}
          />
          <DayPeek
            league={league}
            names={names}
            team={team}
            iso={selectedDay}
            onPlay={onPlayFixture}
            onSimulateUntilDate={onSimulateUntilDate}
          />
        </>
      )}

      {view === 'month' && (
        <>
          <MonthView
            league={league}
            names={names}
            team={team}
            anchorIso={anchorIso}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          <DayPeek
            league={league}
            names={names}
            team={team}
            iso={selectedDay}
            onPlay={onPlayFixture}
            onSimulateUntilDate={onSimulateUntilDate}
          />
        </>
      )}

      {view === 'season' && (
        <SeasonView
          league={league}
          names={names}
          team={team}
          onPlay={onPlayFixture}
          onSimulateUntilDate={onSimulateUntilDate}
        />
      )}
    </div>
  )
}

/** Kompaktowy kafelek na hub sezonu */
export function CalendarTile({ league, onNavigate }) {
  const { lang } = useUiLang()
  const t = calendarStrings(lang)
  const c = commonStrings(lang)
  const names = teamNameMap(league, lang)
  const phase = detectSeasonPhase(league)
  const upcoming = allFixtures(league)
    .filter(
      (f) =>
        isPlayerFixture(league, f) &&
        f.date &&
        f.date >= league.currentDate &&
        f.status !== 'completed',
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 2)

  const weekFixtures = useMemo(() => {
    const mon = mondayOfWeek(league.currentDate)
    let count = 0
    let yours = 0
    for (let i = 0; i < 7; i += 1) {
      const day = getFixturesOnDate(league, formatISODate(addDays(mon, i)))
      count += day.length
      yours += day.filter((f) => isPlayerFixture(league, f)).length
    }
    return { count, yours }
  }, [league])

  return (
    <button
      type="button"
      onClick={() => onNavigate('calendar')}
      className="w-full rounded-xl border border-ufa-border bg-ufa-panel p-4 text-left shadow-lg shadow-black/20 transition hover:border-ufa-accent/40 hover:bg-ufa-panel-hover/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-ufa-muted">{t.tileTitle}</p>
          <p className="mt-0.5 text-sm font-semibold text-ufa-text">
            {c.phases[phase] ?? phase}
          </p>
        </div>
        <span className="text-ufa-accent text-sm">→</span>
      </div>
      <p className="mt-2 text-xs text-ufa-muted">
        {t.thisWeekMeetings(weekFixtures.count)}
        {weekFixtures.yours > 0 ? t.yoursCount(weekFixtures.yours) : ''}
      </p>
      <div className="mt-3 space-y-1.5">
        {upcoming.length === 0 ? (
          <p className="text-xs text-ufa-muted">{t.noUpcomingYours}</p>
        ) : (
          upcoming.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-ufa-accent/30 bg-ufa-accent/5 px-2 py-1.5 text-xs"
            >
              <span className="text-ufa-accent font-medium tabular-nums">{f.date.slice(5)}</span>
              <span className="text-ufa-text truncate">
                {playerFixtureCompactLabel(f, league, names)}
              </span>
            </div>
          ))
        )}
      </div>
      <p className="mt-3 text-[10px] text-ufa-muted">
        {t.viewsHint}
      </p>
    </button>
  )
}
