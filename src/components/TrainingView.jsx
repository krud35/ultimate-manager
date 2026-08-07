import { useUiLang } from '../ui/UiLangContext'
import { pickDesc, pickLabel } from '../ui/locale'
import { trainingStrings } from '../ui/strings/training'
import { useMemo, useState } from 'react'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import {
  TRAINING_FOCUS_OPTIONS,
  ensurePlayerDevelopment,
  setPlayerTrainingFocus,
  setTeamTrainingFocus,
} from '../career/playerDevelopment.js'
import {
  TEAM_TRAINING_FOCUS_OPTIONS,
  TEAM_TRAINING_INTENSITY,
  WEEKDAY_OPTIONS,
  ensureTeamTraining,
  addWeeklyTeamTraining,
  updateWeeklyTeamTraining,
  removeWeeklyTeamTraining,
  addOneOffTeamTraining,
  removeOneOffTeamTraining,
  focusLabel,
  intensityLabel,
  weekdayLabel,
} from '../career/teamTraining.js'
import { injuryStatusLabel, isPlayerInjured } from '../models/playerInjury.js'

function fatigueClass(fatigue) {
  if (fatigue >= 75) return 'text-red-400'
  if (fatigue >= 50) return 'text-amber-400'
  if (fatigue >= 25) return 'text-ufa-gold'
  return 'text-ufa-accent'
}

function qualityClass(q) {
  if (q >= 78) return 'text-emerald-400'
  if (q >= 62) return 'text-ufa-accent'
  if (q >= 48) return 'text-ufa-gold'
  return 'text-amber-400'
}

const INTENSITY_IDS = Object.keys(TEAM_TRAINING_INTENSITY)

function FocusSelect({ value, onChange, exclude, disabled }) {
  const { lang } = useUiLang()
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-ufa-border bg-ufa-bg px-2 py-1.5 text-sm text-ufa-text disabled:opacity-40"
    >
      {TEAM_TRAINING_FOCUS_OPTIONS.filter((f) => f.id !== exclude).map((f) => (
        <option key={f.id} value={f.id}>
          {pickLabel(f, lang)}
        </option>
      ))}
    </select>
  )
}

function IntensitySelect({ value, onChange, disabled }) {
  const { lang } = useUiLang()
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-ufa-border bg-ufa-bg px-2 py-1.5 text-sm text-ufa-text disabled:opacity-40"
    >
      {INTENSITY_IDS.map((id) => (
        <option key={id} value={id}>
          {pickLabel(TEAM_TRAINING_INTENSITY[id], lang)}
        </option>
      ))}
    </select>
  )
}

function TeamTrainingPanel({ team, league, disabled, onChange }) {
  const { lang } = useUiLang()
  const t = trainingStrings(lang)
  const tt = ensureTeamTraining(team)
  const today = league?.currentDate ?? null

  const [weekDay, setWeekDay] = useState(2)
  const [weekA, setWeekA] = useState('structural')
  const [weekB, setWeekB] = useState('physical')
  const [weekIntensity, setWeekIntensity] = useState('medium')

  const [oneDate, setOneDate] = useState(today ?? '')
  const [oneA, setOneA] = useState('skills')
  const [oneB, setOneB] = useState('throwing')
  const [oneIntensity, setOneIntensity] = useState('medium')
  const [error, setError] = useState('')

  function bump() {
    onChange?.(team)
  }

  function addWeekly() {
    if (disabled) return
    setError('')
    const entry = addWeeklyTeamTraining(team, {
      weekday: weekDay,
      focusA: weekA,
      focusB: weekB,
      intensity: weekIntensity,
    })
    if (!entry) {
      setError(t.errWeekly)
      return
    }
    bump()
  }

  function addOneOff() {
    if (disabled) return
    setError('')
    const entry = addOneOffTeamTraining(team, {
      date: oneDate,
      focusA: oneA,
      focusB: oneB,
      intensity: oneIntensity,
    })
    if (!entry) {
      setError(t.errOneOff)
      return
    }
    bump()
  }

  const fam = tt.tacticsFamiliarity ?? 38
  const last = tt.lastSession
  const upcomingOneOff = (tt.oneOff ?? []).filter((o) => !o.completed)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{t.title}</h2>
            <p className="mt-1 text-sm text-ufa-muted max-w-2xl">
              {t.intro}
            </p>
          </div>
          <div className="min-w-[160px] rounded-lg border border-ufa-border bg-ufa-bg/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{t.tacticsFamiliarity}</p>
            <p className="text-xl font-semibold tabular-nums text-ufa-accent">{fam}</p>
            <div className="mt-1 h-1.5 rounded-full bg-ufa-border overflow-hidden">
              <div
                className="h-full rounded-full bg-ufa-accent/80"
                style={{ width: `${fam}%` }}
              />
            </div>
          </div>
        </div>

        {last && (
          <div className="mt-4 rounded-lg border border-ufa-border/80 bg-ufa-bg/50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-ufa-muted">{t.lastSession} · {last.date}</p>
            <p className={`mt-1 text-sm font-semibold ${qualityClass(last.quality)}`}>
              {lang === 'en'
                ? last.qualityLabelEn ?? last.qualityLabel
                : last.qualityLabel}{' '}
              ({last.quality}%)
            </p>
            <p className="mt-1 text-xs text-ufa-muted">
              {focusLabel(last.focuses?.[0], lang)} + {focusLabel(last.focuses?.[1], lang)} ·{' '}
              {intensityLabel(last.intensity, lang)} · {t.attendance} {last.attendance}% · {t.engagement}{' '}
              {last.engagement}% · {t.luck} {last.luck}%
            </p>
            <p className="mt-1 text-xs text-ufa-muted">
              {t.attended} {last.attendedCount}/{last.rosterSize}
              {last.skillBumps > 0 ? ` · +${last.skillBumps} ${t.skillBumps}` : ''}
              {last.tacticsDelta > 0 ? ` · ${t.tacticsPlus} +${last.tacticsDelta}` : ''}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-amber-400">{error}</p>}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/40 p-4">
            <h3 className="text-sm font-semibold text-ufa-text">{t.weekly}</h3>
            <p className="mt-0.5 text-[11px] text-ufa-muted">{t.weeklyHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={weekDay}
                disabled={disabled}
                onChange={(e) => setWeekDay(Number(e.target.value))}
                className="rounded-md border border-ufa-border bg-ufa-bg px-2 py-1.5 text-sm text-ufa-text disabled:opacity-40"
              >
                {WEEKDAY_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {pickLabel(d, lang)}
                  </option>
                ))}
              </select>
              <FocusSelect value={weekA} exclude={weekB} onChange={setWeekA} disabled={disabled} />
              <FocusSelect value={weekB} exclude={weekA} onChange={setWeekB} disabled={disabled} />
              <IntensitySelect value={weekIntensity} onChange={setWeekIntensity} disabled={disabled} />
              <button
                type="button"
                disabled={disabled}
                onClick={addWeekly}
                className="rounded-md bg-ufa-accent px-3 py-1.5 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
              >
                {t.addWeekly}
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {(tt.weekly ?? []).length === 0 && (
                <li className="text-xs text-ufa-muted">{t.noWeekly}</li>
              )}
              {(tt.weekly ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-ufa-text">{weekdayLabel(s.weekday, lang)}</span>
                    <span className="text-ufa-muted mx-2">·</span>
                    <span className="text-ufa-text">
                      {focusLabel(s.focuses[0], lang)} + {focusLabel(s.focuses[1], lang)}
                    </span>
                    <span className="text-ufa-muted mx-2">·</span>
                    <span className="text-ufa-muted">{intensityLabel(s.intensity, lang)}</span>
                    {s.enabled === false && (
                      <span className="ml-2 text-[10px] text-amber-400">{t.off}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        updateWeeklyTeamTraining(team, s.id, { enabled: s.enabled === false })
                        bump()
                      }}
                      className="text-xs text-ufa-muted hover:text-ufa-text disabled:opacity-40"
                    >
                      {s.enabled === false ? t.enable : t.disable}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        removeWeeklyTeamTraining(team, s.id)
                        bump()
                      }}
                      className="text-xs text-red-400/90 hover:underline disabled:opacity-40"
                    >{t.remove}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-ufa-border bg-ufa-bg/40 p-4">
            <h3 className="text-sm font-semibold text-ufa-text">{t.oneOff}</h3>
            <p className="mt-0.5 text-[11px] text-ufa-muted">{t.oneOffDateHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="date"
                value={oneDate}
                disabled={disabled}
                onChange={(e) => setOneDate(e.target.value)}
                className="rounded-md border border-ufa-border bg-ufa-bg px-2 py-1.5 text-sm text-ufa-text disabled:opacity-40"
              />
              <FocusSelect value={oneA} exclude={oneB} onChange={setOneA} disabled={disabled} />
              <FocusSelect value={oneB} exclude={oneA} onChange={setOneB} disabled={disabled} />
              <IntensitySelect value={oneIntensity} onChange={setOneIntensity} disabled={disabled} />
              <button
                type="button"
                disabled={disabled}
                onClick={addOneOff}
                className="rounded-md bg-ufa-accent px-3 py-1.5 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
              >
                Zaplanuj
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {upcomingOneOff.length === 0 && (
                <li className="text-xs text-ufa-muted">{t.noUpcomingOneOff}</li>
              )}
              {upcomingOneOff.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium tabular-nums text-ufa-accent">{s.date}</span>
                    <span className="text-ufa-muted mx-2">·</span>
                    <span className="text-ufa-text">
                      {focusLabel(s.focuses[0], lang)} + {focusLabel(s.focuses[1], lang)}
                    </span>
                    <span className="text-ufa-muted mx-2">·</span>
                    <span className="text-ufa-muted">{intensityLabel(s.intensity, lang)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      removeOneOffTeamTraining(team, s.id)
                      bump()
                    }}
                    className="text-xs text-red-400/90 hover:underline disabled:opacity-40"
                  >{t.remove}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 text-[11px] text-ufa-muted">
          {TEAM_TRAINING_FOCUS_OPTIONS.slice(0, 3).map((f) => (
            <p key={f.id}>
              <span className="text-ufa-text font-medium">{pickLabel(f, lang)}</span> — {pickDesc(f, lang)}
            </p>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ufa-muted">
          {t.intensityHint}
        </p>
      </div>
    </div>
  )
}

export default function TrainingView({
  team,
  league = null,
  leaguePlayerStats = null,
  onChange,
  disabled = false,
}) {
  const { lang } = useUiLang()
  const t = trainingStrings(lang)
  const [filter, setFilter] = useState('all')
  const players = useMemo(() => {
    const list = [...(team?.players ?? [])]
    for (const p of list) ensurePlayerDevelopment(p, { leaguePlayerStats })
    return list.sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0))
  }, [team, leaguePlayerStats])

  const filtered = useMemo(() => {
    if (filter === 'young') return players.filter((p) => (p.age ?? 99) <= 24)
    if (filter === 'vet') return players.filter((p) => (p.age ?? 0) >= 30)
    if (filter === 'tired') return players.filter((p) => (p.developmentFatigue ?? 0) >= 50)
    return players
  }, [players, filter])

  function bump() {
    onChange?.(team)
  }

  function setFocus(player, focusId) {
    if (disabled) return
    setPlayerTrainingFocus(player, focusId)
    bump()
  }

  function setAll(focusId) {
    if (disabled) return
    setTeamTrainingFocus(team, focusId)
    bump()
  }

  if (!team) {
    return <p className="text-sm text-ufa-muted">{t.noTeam}</p>
  }

  return (
    <div className="space-y-6 league-fade-in">
      <TeamTrainingPanel team={team} league={league} disabled={disabled} onChange={onChange} />

      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <h2 className="text-lg font-semibold text-ufa-text">{t.individualTitle(team.name)}</h2>
        <p className="mt-2 text-sm text-ufa-muted max-w-3xl">
          {t.individualIntro}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'all', label: t.filterAll },
            { id: 'young', label: t.filterYoungFull },
            { id: 'vet', label: t.filterVetFull },
            { id: 'tired', label: t.filterTired },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === f.id
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'bg-ufa-bg text-ufa-muted ring-1 ring-ufa-border hover:text-ufa-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-ufa-muted self-center mr-1">{t.setAll}</span>
          {TRAINING_FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => setAll(opt.id)}
              className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text disabled:opacity-40"
            >
              {pickLabel(opt, lang)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-ufa-border bg-ufa-bg/80 text-xs uppercase tracking-wider text-ufa-muted">
                <th className="px-4 py-3 font-medium">{t.player}</th>
                <th className="px-3 py-3 font-medium">{t.age}</th>
                <th className="px-3 py-3 font-medium">OVR</th>
                <th className="px-3 py-3 font-medium">POT</th>
                <th className="px-3 py-3 font-medium">{t.fatigue}</th>
                <th className="px-3 py-3 font-medium">{t.status}</th>
                <th className="px-3 py-3 font-medium">{t.trainingFocus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ufa-border">
              {filtered.map((player) => {
                const ovr = getOverallRating(player.skills)
                const pot = player.potential ?? ovr
                const fatigue = player.developmentFatigue ?? 0
                const room = pot - ovr
                return (
                  <tr key={player.id} className="hover:bg-ufa-panel-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ufa-text">{getPlayerFullName(player)}</p>
                      <p className="text-xs text-ufa-muted">
                        {room > 0 ? t.roomPlus(room) : player.age >= 30 ? t.decline : '—'}
                      </p>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ufa-text">{player.age}</td>
                    <td className="px-3 py-3 tabular-nums text-ufa-text">{ovr}</td>
                    <td className="px-3 py-3 tabular-nums text-ufa-accent font-semibold">{pot}</td>
                    <td className={`px-3 py-3 tabular-nums font-medium ${fatigueClass(fatigue)}`}>
                      {fatigue}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {isPlayerInjured(player) ? (
                        <span className="font-semibold text-red-400">
                          {injuryStatusLabel(player, lang)}
                        </span>
                      ) : (
                        <span className="text-ufa-muted">{t.ready}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={player.trainingFocus ?? 'balanced'}
                        disabled={disabled || isPlayerInjured(player)}
                        onChange={(e) => setFocus(player, e.target.value)}
                        className="w-full max-w-[180px] rounded-md border border-ufa-border bg-ufa-bg px-2 py-1.5 text-sm text-ufa-text disabled:opacity-40"
                      >
                        {TRAINING_FOCUS_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {pickLabel(opt, lang)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
