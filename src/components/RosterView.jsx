import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { rosterStrings } from '../ui/strings/roster'
import { useMemo, useState } from 'react'
import { UFA_LEAGUE_TEAMS } from '../data/ufaLeagueTeams.js'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { MAIN_CATEGORY_SORT_KEYS, readCategorySkill } from '../models/playerStats.js'
import { demoHomeTeam } from '../data/demoMatchTeams'
import StaminaBar, { getStaminaForPlayer } from './StaminaBar'
import { SkillBar, sortPlayers, ThrowingHandBadge } from './TeamRosterPanel'
import PlayerProfileModal from './PlayerProfileModal'

import { seasonStatsForPlayer } from '../league/leagueStats.js'
import { ensurePlayerDevelopment } from '../career/playerDevelopment.js'
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
  ensurePlayerInjury,
  injuryStatusLabel,
  isPlayerInjured,
} from '../models/playerInjury.js'
import { formatUsdCompact, getPlayerMarketValue } from '../career'
import PlayerTraitChips from './PlayerTraitChips'
import { fatigueBandLabel, fatigueBandToneClass } from '../ui/fogOfWar'
import { currentMatchStamina } from '../matchEngine/stamina.js'

const PAGE_SIZE_OPTIONS = [
  { id: 20, label: '20' },
  { id: 50, label: '50' },
  { id: 100, label: '100' },
  { id: 'all', labelPl: 'Wszyscy', labelEn: 'All' },
]

const SORT_OPTIONS = [
  ...MAIN_CATEGORY_SORT_KEYS,
  { id: 'goals', label: 'G' },
  { id: 'assists', label: 'A' },
  { id: 'blocks', label: 'B' },
  { id: 'pointsPlayed', label: 'PP' },
  { id: 'form', labelPl: 'Forma', labelEn: 'Form' },
  { id: 'morale', label: 'Morale' },
  { id: 'stamina', label: 'Stamina' },
]

const MAIN_COLUMNS = [
  { id: 'throwing', label: 'Throwing' },
  { id: 'physical', label: 'Physical' },
  { id: 'mental', label: 'Mental' },
  { id: 'offensive', label: 'Offensive' },
  { id: 'defensive', label: 'Defensive' },
]

function rosterStaminaSide(player, matchStamina, focusTeamName, teamNameOf) {
  if (!matchStamina) return null
  if (teamNameOf(player) !== focusTeamName) return null
  if (matchStamina.home && player.id in matchStamina.home) return 'home'
  if (matchStamina.away && player.id in matchStamina.away) return 'away'
  return 'home'
}

export default function RosterView({
  matchStamina,
  focusTeamName = demoHomeTeam.name,
  leaguePlayerStats = null,
  /** Żywe składy ze świata kariery; fallback = szablon UFA. */
  teams = null,
  /** Tylko skład Twojej drużyny (bez filtrów ligowych). */
  clubOnly = false,
  onExtendContract = null,
}) {
  const { lang } = useUiLang()
  const t = rosterStrings(lang)
  const leagueTeams = teams?.length ? teams : UFA_LEAGUE_TEAMS
  const allPlayers = useMemo(
    () =>
      leagueTeams.flatMap((t) => {
        for (const p of t.players ?? []) ensurePlayerDevelopment(p)
        return t.players ?? []
      }),
    [leagueTeams],
  )

  const teamNameOf = useMemo(() => {
    const byPlayer = new Map()
    for (const team of leagueTeams) {
      for (const player of team.players ?? []) {
        byPlayer.set(player.id, team.name)
      }
    }
    return (player) => byPlayer.get(player.id) ?? '—'
  }, [leagueTeams])

  const [teamFilter, setTeamFilter] = useState(focusTeamName)
  const [sortKey, setSortKey] = useState('ovr')
  const [sortDir, setSortDir] = useState('desc')
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [pageSize, setPageSize] = useState(20)

  const showStamina = !!matchStamina
  const effectiveFilter = clubOnly ? focusTeamName : teamFilter

  const teamFilters = useMemo(() => {
    if (clubOnly) return [{ id: focusTeamName, label: focusTeamName }]
    const names = leagueTeams.map((t) => t.name).sort()
    return [{ id: 'all', label: t.allTeams }, ...names.map((t) => ({ id: t, label: t }))]
  }, [leagueTeams, clubOnly, focusTeamName])

  const filtered = useMemo(() => {
    if (effectiveFilter === 'all') return allPlayers
    return allPlayers.filter((p) => teamNameOf(p) === effectiveFilter)
  }, [effectiveFilter, allPlayers, teamNameOf])

  const getSt = (p) => {
    const side = rosterStaminaSide(p, matchStamina, focusTeamName, teamNameOf)
    return side ? getStaminaForPlayer(matchStamina[side], p.id) : 100
  }

  const rows = useMemo(() => {
    const sorted = sortPlayers(filtered, sortKey, sortDir, getSt)
    if (sortKey === 'form') {
      const dir = sortDir === 'asc' ? 1 : -1
      return [...sorted].sort((a, b) => {
        ensurePlayerForm(a)
        ensurePlayerForm(b)
        const va = getPlayerForm(a)
        const vb = getPlayerForm(b)
        if (va !== vb) return (va - vb) * dir
        return getPlayerFullName(a).localeCompare(getPlayerFullName(b))
      })
    }
    if (sortKey === 'morale') {
      const dir = sortDir === 'asc' ? 1 : -1
      return [...sorted].sort((a, b) => {
        ensurePlayerMorale(a)
        ensurePlayerMorale(b)
        const va = getPlayerMorale(a)
        const vb = getPlayerMorale(b)
        if (va !== vb) return (va - vb) * dir
        return getPlayerFullName(a).localeCompare(getPlayerFullName(b))
      })
    }
    if (!['goals', 'assists', 'blocks', 'pointsPlayed'].includes(sortKey)) return sorted
    const dir = sortDir === 'asc' ? 1 : -1
    return [...sorted].sort((a, b) => {
      const va = seasonStatsForPlayer(leaguePlayerStats, a)[sortKey] ?? 0
      const vb = seasonStatsForPlayer(leaguePlayerStats, b)[sortKey] ?? 0
      if (va !== vb) return (va - vb) * dir
      return getPlayerFullName(a).localeCompare(getPlayerFullName(b))
    })
  }, [filtered, sortKey, sortDir, matchStamina, leaguePlayerStats, teamNameOf])

  const visibleRows = useMemo(() => {
    if (pageSize === 'all') return rows
    const n = Number(pageSize)
    if (!Number.isFinite(n) || n <= 0) return rows
    return rows.slice(0, n)
  }, [rows, pageSize])

  function onSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
        <div className="border-b border-ufa-border px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">
              {clubOnly ? t.clubTitle : t.leagueTitle}
            </h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {clubOnly
                ? `${focusTeamName} · ${t.playerCount(filtered.length)}`
                : t.leagueHint(allPlayers.length)}
              {showStamina ? t.matchStamina : ''}
              {' · '}
              {t.clubHint}
            </p>
          </div>
          {!clubOnly && (
          <div className="flex flex-wrap gap-2">
            {teamFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTeamFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  teamFilter === f.id
                    ? 'bg-ufa-accent text-ufa-bg'
                    : 'bg-ufa-bg text-ufa-muted ring-1 ring-ufa-border hover:text-ufa-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-ufa-border/80 bg-ufa-bg/40">
          <span className="text-xs text-ufa-muted uppercase tracking-wide">{t.sort}</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSort(opt.id)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                sortKey === opt.id
                  ? 'bg-ufa-accent/15 text-ufa-accent ring-1 ring-ufa-accent/30'
                  : 'text-ufa-muted hover:text-ufa-text'
              }`}
            >
              {pickLabel(opt, lang)}
              {sortKey === opt.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-ufa-border sm:inline" aria-hidden />
          <label className="flex items-center gap-2 text-xs text-ufa-muted">
            <span className="uppercase tracking-wide">{t.show}</span>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value
                setPageSize(v === 'all' ? 'all' : Number(v))
              }}
              className="rounded-md border border-ufa-border bg-ufa-panel px-2 py-1 text-xs font-medium text-ufa-text"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={String(opt.id)} value={String(opt.id)}>
                  {pickLabel(opt, lang)}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-ufa-muted tabular-nums">
            {visibleRows.length === rows.length
              ? t.playerCount(rows.length)
              : t.ofTotal(visibleRows.length, rows.length)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead>
              <tr className="border-b border-ufa-border bg-ufa-bg/80 text-xs uppercase tracking-wider text-ufa-muted">
                <th className="px-4 py-3 font-medium">{t.player}</th>
                {!clubOnly && (
                  <th className="px-3 py-3 font-medium">{t.team}</th>
                )}
                <th className="px-3 py-3 font-medium">{t.age}</th>
                <th className="px-3 py-3 font-medium">{t.hand}</th>
                <th className="px-3 py-3 font-medium">OVR</th>
                <th className="px-3 py-3 font-medium">{t.value}</th>
                <th className="px-3 py-3 font-medium">{t.form}</th>
                <th className="px-3 py-3 font-medium">{t.morale}</th>
                <th className="px-3 py-3 font-medium">{t.matchFreshnessCol}</th>
                <th className="px-3 py-3 font-medium min-w-[140px]">{t.traits}</th>
                {MAIN_COLUMNS.map((col) => (
                  <th key={col.id} className="px-3 py-3 font-medium">
                    {col.label}
                  </th>
                ))}
                {showStamina && (
                  <th className="px-3 py-3 font-medium min-w-[100px]">Stamina</th>
                )}
                <th className="px-3 py-3 font-medium text-center">G</th>
                <th className="px-3 py-3 font-medium text-center">A</th>
                <th className="px-3 py-3 font-medium text-center">B</th>
                <th className="px-3 py-3 font-medium text-center" title={t.pointsPlayed}>
                  PP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ufa-border">
              {visibleRows.map((player) => {
                const ovr = getOverallRating(player.skills)
                const { skills } = player
                const s = seasonStatsForPlayer(leaguePlayerStats, player)
                const stamina = getSt(player)
                ensurePlayerMorale(player)
                ensurePlayerForm(player)
                ensurePlayerInjury(player)
                const morale = getPlayerMorale(player)
                const form = getPlayerForm(player)
                const matchFreshness = Math.round(currentMatchStamina(player))
                const injured = isPlayerInjured(player)
                return (
                  <tr key={player.id} className="transition-colors hover:bg-ufa-panel-hover">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setProfilePlayer(player)}
                        className="text-ufa-accent hover:underline text-left"
                      >
                        {getPlayerFullName(player)}
                      </button>
                      {injured ? (
                        <p
                          className="mt-0.5 text-[11px] font-semibold text-red-400"
                          title={injuryStatusLabel(player, lang)}
                        >
                          {injuryStatusLabel(player, lang)}
                        </p>
                      ) : null}
                    </td>
                    {!clubOnly && (
                      <td className="px-3 py-3 text-ufa-muted whitespace-nowrap">
                        {teamNameOf(player)}
                      </td>
                    )}
                    <td className="px-3 py-3 tabular-nums text-ufa-muted">
                      {player.age ?? '—'}
                    </td>
                    <td className="px-3 py-3">
                      <ThrowingHandBadge player={player} />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md text-xs font-bold ${
                          ovr >= 85
                            ? 'bg-ufa-accent/20 text-ufa-accent'
                            : 'bg-slate-700/50 text-slate-200'
                        }`}
                      >
                        {ovr}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ufa-gold font-medium">
                      {formatUsdCompact(getPlayerMarketValue(player))}
                    </td>
                    <td className={`px-3 py-3 font-semibold ${formToneClass(form)}`}>
                      {formLabel(form, lang)}
                    </td>
                    <td className={`px-3 py-3 font-semibold ${moraleToneClass(morale)}`}>
                      {moraleLabel(morale, lang)}
                    </td>
                    <td
                      className={`px-3 py-3 font-semibold ${fatigueBandToneClass(100 - matchFreshness)}`}
                      title={`${matchFreshness}/100`}
                    >
                      {fatigueBandLabel(100 - matchFreshness, lang)}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <PlayerTraitChips player={player} max={2} />
                    </td>
                    {MAIN_COLUMNS.map((col) => (
                      <td key={col.id} className="px-3 py-3">
                        <SkillBar value={readCategorySkill(skills, col.id)} />
                      </td>
                    ))}
                    {showStamina && (
                      <td className="px-3 py-3">
                        <StaminaBar stamina={stamina} />
                      </td>
                    )}
                    <td className="px-3 py-3 text-center tabular-nums">{s.goals}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{s.assists}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{s.blocks}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{s.pointsPlayed}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        stamina={profilePlayer ? getSt(profilePlayer) : null}
        leaguePlayerStats={leaguePlayerStats}
        teamName={profilePlayer ? teamNameOf(profilePlayer) : null}
        isOwnPlayer={clubOnly}
        onExtendContract={clubOnly ? onExtendContract : null}
      />
    </>
  )
}
