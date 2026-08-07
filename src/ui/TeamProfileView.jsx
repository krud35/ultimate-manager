import { useUiLang } from './UiLangContext'
import { resolveTeamName, displaySeasonLabel } from './locale'
import { useMemo, useState } from 'react'
import { getPlayerFullName } from '../data/mockPlayers'
import { teamDisplayName, teamStandingsRank } from '../seasonEngine/seasonStateFromLeague.js'
import {
  matchResultForTeam,
  matchesForTeam,
  pickBestSeven,
  playerSeasonLine,
  playerStamina,
  teamOffenseDefenseRatings,
} from '../seasonEngine/teamProfileUtils.js'
import StaminaBar from '../components/StaminaBar'
import { ThrowingHandBadge } from '../components/TeamRosterPanel'
import { getDominantHand } from '../models/playerProfile.js'
import {
  ensurePlayerMorale,
  getPlayerMorale,
  moraleLabel,
  moraleToneClass,
} from '../models/playerMorale.js'
import {
  ensurePlayerForm,
  getPlayerForm,
  formLabel,
  formToneClass,
} from '../models/playerForm.js'
import {
  ensureTeamFinances,
  formatUsd,
  formatUsdCompact,
  getPlayerMarketValue,
  getTransferBudget,
  getSalaryBudget,
  ensureTeamReputation,
  getTeamReputation,
  reputationLabel,
  reputationToneClass,
  ensureTeamFans,
  getFanSize,
  getFanMood,
  getFanTraits,
  formatFanSize,
  fanSizeLabel,
  fanMoodLabel,
  fanMoodToneClass,
  fanTraitLabel,
  fanTraitBlurb,
  fanTraitToneClass,
} from '../career'
import PlayerTraitChips from '../components/PlayerTraitChips'
import { teamProfileStrings } from './strings/teamProfile'
import { financeStateLabel, financeStateToneClass } from './fogOfWar'

function StatPill({ label, value, valueClassName = 'text-ufa-text' }) {
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  )
}

function StartingSevenCard({ player, seasonState, isOwnClub }) {
  const { lang } = useUiLang()
  const t = teamProfileStrings(lang)
  const line = playerSeasonLine(seasonState, player)
  const stamina = playerStamina(player)
  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  const morale = getPlayerMorale(player)
  const form = getPlayerForm(player)

  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3 flex flex-col gap-2 min-w-[160px]">
      <div>
        <p className="font-medium text-sm text-ufa-text leading-tight">{getPlayerFullName(player)}</p>
      </div>
      <StaminaBar stamina={stamina} compact />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ufa-muted">{t.form}</span>
        <span className={`font-semibold ${formToneClass(form)}`}>{formLabel(form, lang)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ufa-muted">{t.morale}</span>
        <span className={`font-semibold ${moraleToneClass(morale)}`}>
          {moraleLabel(morale, lang)}
        </span>
      </div>
      {isOwnClub && <PlayerTraitChips player={player} max={2} />}
      <div className="grid grid-cols-4 gap-1 text-center text-[11px] tabular-nums">
        <span title={t.goals}>
          <span className="text-ufa-muted block">G</span>
          {line.goals}
        </span>
        <span title={t.assists}>
          <span className="text-ufa-muted block">A</span>
          {line.assists}
        </span>
        <span title={t.blocks}>
          <span className="text-ufa-muted block">B</span>
          {line.blocks}
        </span>
        <span title={t.pointsPlayed}>
          <span className="text-ufa-muted block">PP</span>
          {line.pointsPlayed}
        </span>
      </div>
    </div>
  )
}

function rosterSortKeys(t) {
  return [
    { id: 'name', label: t.player },
    { id: 'stamina', label: 'Stamina' },
    { id: 'form', label: t.form },
    { id: 'morale', label: t.morale },
    { id: 'games', label: 'GP' },
    { id: 'pointsPlayed', label: 'PP' },
    { id: 'goals', label: 'G' },
    { id: 'assists', label: 'A' },
    { id: 'blocks', label: 'B' },
  ]
}

export default function TeamProfileView({ teamId, seasonState, onBack }) {
  const { lang } = useUiLang()
  const t = teamProfileStrings(lang)
  const sortCols = rosterSortKeys(t)
  const [sortKey, setSortKey] = useState('goals')
  const [sortDir, setSortDir] = useState('desc')

  const team = seasonState?.teamsById?.[teamId]
  const standing = seasonState?.standings?.[teamId]
  const rank = teamStandingsRank(seasonState, teamId)
  const ratings = useMemo(() => teamOffenseDefenseRatings(team), [team])
  const isOwnClub = Boolean(teamId && teamId === seasonState?.playerTeamId)

  const finances = useMemo(() => {
    if (!team) return null
    ensureTeamFinances(team)
    const budget = getTransferBudget(team)
    const salaryBudget = getSalaryBudget(team)
    let rosterValue = 0
    for (const p of team.players ?? []) {
      rosterValue += getPlayerMarketValue(p)
    }
    return { budget, salaryBudget, rosterValue }
  }, [team])

  const teamMorale = useMemo(() => {
    if (!isOwnClub) return null
    const players = team?.players ?? []
    if (!players.length) return null
    let sum = 0
    for (const p of players) {
      ensurePlayerMorale(p)
      sum += getPlayerMorale(p)
    }
    return Math.round(sum / players.length)
  }, [team?.players, isOwnClub])

  const teamForm = useMemo(() => {
    const players = team?.players ?? []
    if (!players.length) return null
    let sum = 0
    for (const p of players) {
      ensurePlayerForm(p)
      sum += getPlayerForm(p)
    }
    return Math.round(sum / players.length)
  }, [team?.players])

  const teamReputation = useMemo(() => {
    if (!team) return null
    ensureTeamReputation(team)
    return getTeamReputation(team)
  }, [team])

  const teamFans = useMemo(() => {
    if (!team) return null
    ensureTeamFans(team)
    return {
      size: getFanSize(team),
      mood: getFanMood(team),
      traits: getFanTraits(team),
    }
  }, [team])

  const teamMatches = useMemo(() => matchesForTeam(seasonState, teamId), [seasonState, teamId])

  const completed = useMemo(
    () => teamMatches.filter((m) => m.status === 'COMPLETED' || m.status === 'completed'),
    [teamMatches],
  )
  const upcoming = useMemo(
    () =>
      teamMatches.filter(
        (m) =>
          (m.status === 'SCHEDULED' || m.status === 'scheduled') &&
          (m.week ?? 0) >= (seasonState?.currentWeek ?? 1),
      ),
    [teamMatches, seasonState?.currentWeek],
  )

  const startingSeven = useMemo(() => pickBestSeven(team?.players), [team?.players])

  const rosterRows = useMemo(() => {
    const players = team?.players ?? []
    const dir = sortDir === 'asc' ? 1 : -1
    const enriched = players.map((p) => {
      const line = playerSeasonLine(seasonState, p)
      ensurePlayerMorale(p)
      ensurePlayerForm(p)
      return {
        player: p,
        line,
        stamina: playerStamina(p),
        form: getPlayerForm(p),
        morale: getPlayerMorale(p),
        name: getPlayerFullName(p).toLowerCase(),
      }
    })

    enriched.sort((a, b) => {
      let va
      let vb
      switch (sortKey) {
        case 'name':
          va = a.name
          vb = b.name
          return va.localeCompare(vb) * dir
        case 'stamina':
          va = a.stamina
          vb = b.stamina
          break
        case 'form':
          va = a.form
          vb = b.form
          break
        case 'morale':
          va = a.morale
          vb = b.morale
          break
        default:
          va = a.line[sortKey] ?? 0
          vb = b.line[sortKey] ?? 0
      }
      if (sortKey !== 'name') {
        if (va !== vb) return (va - vb) * dir
        return a.name.localeCompare(b.name)
      }
      return 0
    })

    return enriched
  }, [team?.players, seasonState, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  if (!team) {
    return (
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-8 text-center">
        <p className="text-ufa-muted">{t.notFound}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-sm text-ufa-accent hover:underline"
          >
            {t.back}
          </button>
        )}
      </div>
    )
  }

  const accent = team.primaryColor ?? '#0d9488'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-ufa-border px-3 py-1.5 text-sm text-ufa-muted hover:text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.backArrow}
          </button>
        )}
        <span className="text-xs text-ufa-muted uppercase tracking-wide">{t.profileTitle}</span>
      </div>

      {/* Header */}
      <section
        className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden"
        style={{ borderTopWidth: 4, borderTopColor: accent }}
      >
        <div className="px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-ufa-text">
                {resolveTeamName(team, lang)}
              </h2>
              <div className="flex items-center gap-1.5" title={t.kitColors}>
                <span
                  className="inline-block h-4 w-4 rounded-full border border-black/30"
                  style={{ backgroundColor: team.primaryColor ?? accent }}
                  aria-label={t.homeColor}
                />
                <span
                  className="inline-block h-4 w-4 rounded-full border border-black/30"
                  style={{ backgroundColor: team.awayColor ?? '#f8fafc' }}
                  aria-label={t.awayColor}
                />
              </div>
            </div>
            <p className="text-sm text-ufa-muted mt-1">
              {displaySeasonLabel(seasonState.seasonLabel ?? t.seasonFallback, lang)} ·{' '}
              {t.weekOf(seasonState.currentWeek, seasonState.totalWeeks)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatPill label={t.place} value={rank ?? '—'} />
            <StatPill label="W–L" value={`${standing?.wins ?? 0}–${standing?.losses ?? 0}`} />
            <StatPill label="PF" value={standing?.pointsFor ?? 0} />
            <StatPill label="PA" value={standing?.pointsAgainst ?? 0} />
            <StatPill label={t.teamOffense} value={ratings.offense} />
            <StatPill label={t.teamDefense} value={ratings.defense} />
            {teamForm != null && (
              <StatPill
                label={t.form}
                value={formLabel(teamForm, lang)}
                valueClassName={formToneClass(teamForm)}
              />
            )}
            {teamMorale != null && (
              <StatPill
                label={t.morale}
                value={moraleLabel(teamMorale, lang)}
                valueClassName={moraleToneClass(teamMorale)}
              />
            )}
            {teamReputation != null && (
              <StatPill
                label={t.reputation}
                value={teamReputation}
                valueClassName={reputationToneClass(teamReputation)}
              />
            )}
            {teamFans != null && (
              <StatPill
                label={t.fans}
                value={formatFanSize(teamFans.size, lang)}
                valueClassName="text-ufa-accent"
              />
            )}
            {teamFans != null && (
              <StatPill
                label={t.fanMood}
                value={teamFans.mood}
                valueClassName={fanMoodToneClass(teamFans.mood)}
              />
            )}
          </div>
        </div>
        {teamReputation != null && (
          <p className="px-6 pb-2 text-xs text-ufa-muted -mt-2">
            {t.clubPrestige}:{' '}
            <span className={`font-medium ${reputationToneClass(teamReputation)}`}>
              {reputationLabel(teamReputation, lang)}
            </span>
          </p>
        )}
        {teamFans != null && (
          <div className="px-6 pb-4 -mt-1">
            <p className="text-xs text-ufa-muted">
              {t.fanbase}:{' '}
              <span className="font-medium text-ufa-text">
                {fanSizeLabel(teamFans.size, lang)}
              </span>
              {' · '}
              {t.mood}:{' '}
              <span className={`font-medium ${fanMoodToneClass(teamFans.mood)}`}>
                {fanMoodLabel(teamFans.mood, lang)}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teamFans.traits.map((id) => (
                <span
                  key={id}
                  title={fanTraitBlurb(id, lang)}
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${fanTraitToneClass(id)}`}
                >
                  {fanTraitLabel(id, lang)}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Finances */}
      {finances && (
        <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
          <h3 className="font-semibold text-ufa-text mb-1">{t.finances}</h3>
          {isOwnClub ? (
            <>
              <p className="text-xs text-ufa-muted mb-4">{t.financesHintOwn}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                    {t.transferBudget}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ufa-accent">
                    {formatUsd(finances.budget)}
                  </p>
                </div>
                <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                    {t.wageBudget}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ufa-gold">
                    {formatUsd(finances.salaryBudget)}
                  </p>
                </div>
                <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                    {t.rosterValue}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ufa-gold">
                    {formatUsdCompact(finances.rosterValue)}
                  </p>
                  <p className="mt-0.5 text-xs text-ufa-muted tabular-nums">
                    {formatUsd(finances.rosterValue)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-4 py-3 max-w-sm">
              <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                {t.financesState}
              </p>
              <p
                className={`mt-1 text-xl font-bold capitalize ${financeStateToneClass(finances.budget)}`}
              >
                {financeStateLabel(finances.budget, lang)}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Starting 7 */}
      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-1">{t.bestSeven}</h3>
        <p className="text-xs text-ufa-muted mb-4">{t.bestSevenHint}</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {startingSeven.map((p) => (
            <StartingSevenCard
              key={p.id}
              player={p}
              seasonState={seasonState}
              isOwnClub={isOwnClub}
            />
          ))}
        </div>
      </section>

      {/* Results & schedule */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text mb-3">{t.recentResults}</h3>
          {completed.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noPlayedMatches}</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {[...completed].reverse().slice(0, 8).map((m) => {
                const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
                const opp = teamDisplayName(seasonState, oppId, lang)
                const res = matchResultForTeam(m, teamId)
                const atHome = m.homeTeamId === teamId
                return (
                  <li
                    key={m.id}
                    className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm border ${
                      res.type === 'win'
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : res.type === 'loss'
                          ? 'border-red-500/35 bg-red-500/10'
                          : 'border-ufa-border bg-ufa-bg/40'
                    }`}
                  >
                    <span className="text-ufa-muted text-xs tabular-nums w-8">
                      {t.weekAbbrev(m.week)}
                    </span>
                    <span className="flex-1 text-ufa-text truncate">
                      {atHome ? 'vs' : '@'} {opp}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {res.us}–{res.them}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5">
          <h3 className="font-semibold text-ufa-text mb-3">{t.upcomingMatches}</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noScheduled}</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((m) => {
                const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
                const opp = teamDisplayName(seasonState, oppId, lang)
                const atHome = m.homeTeamId === teamId
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-dashed border-ufa-border px-3 py-2 text-sm"
                  >
                    <span className="text-ufa-muted text-xs tabular-nums">
                      {t.weekShort(m.week)}
                    </span>
                    <span className="flex-1 text-ufa-text">
                      {atHome ? 'vs' : '@'} {opp}
                    </span>
                    <span className="text-xs text-ufa-accent uppercase">{t.scheduled}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Roster table */}
      <section className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
        <div className="border-b border-ufa-border px-6 py-4">
          <h3 className="font-semibold text-ufa-text">{t.rosterStats}</h3>
          <p className="text-xs text-ufa-muted mt-1">{t.sortHint}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-ufa-border bg-ufa-bg/80 text-xs uppercase tracking-wider text-ufa-muted">
                {sortCols.map((col) => (
                  <th key={col.id} className="px-3 py-3 font-medium text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className={`hover:text-ufa-text ${sortKey === col.id ? 'text-ufa-accent' : ''}`}
                    >
                      {col.label}
                      {sortKey === col.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 font-medium text-left">{t.hand}</th>
                {isOwnClub && (
                  <th className="px-3 py-3 font-medium text-left min-w-[140px]">{t.traits}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ufa-border">
              {rosterRows.map(({ player, line, stamina, form, morale }) => (
                <tr key={player.id} className="hover:bg-ufa-panel-hover">
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {getPlayerFullName(player)}
                  </td>
                  <td className="px-3 py-2.5 min-w-[100px]">
                    <StaminaBar stamina={stamina} compact />
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${formToneClass(form)}`}>
                    {formLabel(form, lang)}
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${moraleToneClass(morale)}`}>
                    {moraleLabel(morale, lang)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-center">{line.games}</td>
                  <td className="px-3 py-2.5 tabular-nums text-center">{line.pointsPlayed}</td>
                  <td className="px-3 py-2.5 tabular-nums text-center text-ufa-accent font-medium">
                    {line.goals}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-center">{line.assists}</td>
                  <td className="px-3 py-2.5 tabular-nums text-center">{line.blocks}</td>
                  <td className="px-3 py-2.5">
                    <ThrowingHandBadge player={player} />
                    <span className="sr-only">{getDominantHand(player)}</span>
                  </td>
                  {isOwnClub && (
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <PlayerTraitChips player={player} max={2} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
