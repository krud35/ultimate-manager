import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, formatContractRemaining } from '../ui/locale'
import { rosterStrings } from '../ui/strings/roster'
import { useCallback, useMemo, useState } from 'react'
import { UFA_LEAGUE_TEAMS } from '../data/ufaLeagueTeams.js'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { readCategorySkill } from '../models/playerStats.js'
import { demoHomeTeam } from '../data/demoMatchTeams'
import StaminaBar, { getStaminaForPlayer } from './StaminaBar'
import { SkillBar, sortPlayers, ThrowingHandBadge } from './TeamRosterPanel'
import PlayerProfileModal from './PlayerProfileModal'
import LoanTermsModal from './LoanTermsModal'

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
import { formatUsd, formatUsdCompact, getPlayerMarketValue } from '../career'
import PlayerTraitChips from './PlayerTraitChips'
import { fatigueBandLabel, fatigueBandToneClass } from '../ui/fogOfWar'
import { currentMatchStamina } from '../matchEngine/stamina.js'

const PAGE_SIZE_OPTIONS = [
  { id: 20, label: '20' },
  { id: 50, label: '50' },
  { id: 100, label: '100' },
  { id: 'all', labelPl: 'Wszyscy', labelEn: 'All' },
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
  onToggleTransferList = null,
  onToggleLoanList = null,
  onProposeLoanOut = null,
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
  const [view, setView] = useState('overview')
  const [sortKey, setSortKey] = useState('ovr')
  const [sortDir, setSortDir] = useState('desc')
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [pageSize, setPageSize] = useState(20)
  const [loanOutPlayer, setLoanOutPlayer] = useState(null)
  const [loanFlash, setLoanFlash] = useState(null)

  const teamNameById = useMemo(() => {
    const byId = new Map()
    for (const team of leagueTeams) byId.set(team.id, team.name)
    return byId
  }, [leagueTeams])

  const showStamina = !!matchStamina
  const effectiveFilter = clubOnly ? focusTeamName : teamFilter

  const teamFilters = useMemo(() => {
    if (clubOnly) return [{ id: focusTeamName, label: focusTeamName }]
    const names = leagueTeams.map((t) => t.name).sort()
    return [{ id: 'all', label: t.allTeams }, ...names.map((t) => ({ id: t, label: t }))]
  }, [leagueTeams, clubOnly, focusTeamName, t.allTeams])

  const filtered = useMemo(() => {
    if (effectiveFilter === 'all') return allPlayers
    return allPlayers.filter((p) => teamNameOf(p) === effectiveFilter)
  }, [effectiveFilter, allPlayers, teamNameOf])

  const getSt = useCallback((p) => {
    const side = rosterStaminaSide(p, matchStamina, focusTeamName, teamNameOf)
    return side ? getStaminaForPlayer(matchStamina[side], p.id) : 100
  }, [matchStamina, focusTeamName, teamNameOf])

  const rows = useMemo(() => {
    const sorted = sortPlayers(filtered, sortKey, sortDir, getSt)
    if (['age', 'value', 'freshness'].includes(sortKey)) {
      const value = p => sortKey === 'age' ? p.age ?? 0 : sortKey === 'value' ? getPlayerMarketValue(p) : currentMatchStamina(p)
      return [...sorted].sort((a, b) => (value(a) - value(b)) * (sortDir === 'asc' ? 1 : -1))
    }
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
  }, [filtered, sortKey, sortDir, getSt, leaguePlayerStats])

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

  const views = [
    { id: 'overview', label: lang === 'en' ? 'Overview' : 'Przegląd' },
    { id: 'attributes', label: lang === 'en' ? 'Attributes' : 'Atrybuty' },
    { id: 'statistics', label: lang === 'en' ? 'Statistics' : 'Statystyki' },
    { id: 'contracts', label: lang === 'en' ? 'Contracts' : 'Kontrakty' },
  ]
  const columnsByView = {
    overview: [['age', t.age], ['ovr', 'OVR'], ['form', t.form], ['morale', t.morale], ['freshness', t.matchFreshnessCol], ['traits', t.traits]],
    attributes: [['ovr', 'OVR'], ['hand', t.hand], ['throwing', lang === 'en' ? 'Throwing' : 'Rzuty'], ['physical', lang === 'en' ? 'Physical' : 'Fizyczne'], ['mental', lang === 'en' ? 'Mental' : 'Mentalne'], ['offensive', lang === 'en' ? 'Offense' : 'Atak'], ['defensive', lang === 'en' ? 'Defense' : 'Obrona']],
    statistics: [['ovr', 'OVR'], ['goals', 'G'], ['assists', 'A'], ['blocks', 'B'], ['pointsPlayed', 'PP']],
    contracts: [['age', t.age], ['ovr', 'OVR'], ['value', t.value], ['salary', t.salary], ['contractRemaining', t.contractRemaining]],
  }
  const columns = [...columnsByView[view], ...(showStamina ? [['stamina', 'Stamina']] : [])]
  const sortable = columns.filter(([key]) => !['traits', 'hand'].includes(key))
  function renderCell(player, key) {
    switch (key) {
      case 'age': return player.age ?? '—'
      case 'ovr': return <span className="um-rating">{getOverallRating(player.skills)}</span>
      case 'hand': return <ThrowingHandBadge player={player} />
      case 'form': return <span className={formToneClass(getPlayerForm(player))}>{formLabel(getPlayerForm(player), lang)}</span>
      case 'morale': return <span className={moraleToneClass(getPlayerMorale(player))}>{moraleLabel(getPlayerMorale(player), lang)}</span>
      case 'freshness': return <span className={fatigueBandToneClass(100 - currentMatchStamina(player))}>{fatigueBandLabel(100 - currentMatchStamina(player), lang)}</span>
      case 'traits': return <PlayerTraitChips player={player} max={2} />
      case 'value': return formatUsdCompact(getPlayerMarketValue(player))
      case 'salary': return player.contract?.weeklyWage ? t.salaryWeeklyShort(formatUsd(player.contract.weeklyWage)) : t.noContract
      case 'contractRemaining': return player.contract?.weeksRemaining != null ? formatContractRemaining(player.contract.weeksRemaining, lang) : t.noContract
      case 'stamina': return <StaminaBar stamina={getSt(player)} />
      case 'goals': case 'assists': case 'blocks': case 'pointsPlayed': return seasonStatsForPlayer(leaguePlayerStats, player)[key] ?? 0
      default: return <SkillBar value={readCategorySkill(player.skills, key)} />
    }
  }
  return (
    <>
      <section>
        <header className="um-page-heading"><p className="um-eyebrow">{focusTeamName} / {t.playerCount(filtered.length)}</p><h1 className="um-page-title">{clubOnly ? t.clubTitle : t.leagueTitle}</h1><p className="text-sm text-ufa-muted">{clubOnly ? t.clubHint : t.leagueHint(allPlayers.length)}</p></header>
        <div className="um-tabs" aria-label={lang === 'en' ? 'Roster view' : 'Widok składu'}>{views.map(item => <button type="button" key={item.id} aria-pressed={view === item.id} onClick={() => { setView(item.id); setSortKey('ovr'); setSortDir('desc') }}>{item.label}</button>)}</div>
        <div className="um-table-toolbar">
          {!clubOnly && <label className="flex items-center gap-2 text-sm">{t.team}<select className="rounded-sm border border-ufa-border bg-ufa-panel px-3 py-2" value={teamFilter} onChange={event => setTeamFilter(event.target.value)}>{teamFilters.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
          <label className="flex items-center gap-2 text-sm text-ufa-muted">{t.show}<select className="rounded-sm border border-ufa-border bg-ufa-panel px-3 py-2 text-ufa-text" value={String(pageSize)} onChange={event => setPageSize(event.target.value === 'all' ? 'all' : Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map(option => <option key={option.id} value={option.id}>{pickLabel(option, lang)}</option>)}</select></label>
          <span className="text-xs text-ufa-muted">{t.ofTotal(visibleRows.length, rows.length)}</span>
        </div>
        {view === 'overview' && <div className="um-mobile-roster">
          <div className="flex items-center justify-between gap-3 border-b border-ufa-border pb-2"><label className="flex items-center gap-2 text-xs text-ufa-muted">{t.sort}<select className="border border-ufa-border bg-ufa-panel p-2 text-ufa-text" value={sortKey} onChange={e => onSort(e.target.value)}>{[['name', t.player], ...sortable].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="um-button" type="button" onClick={() => onSort(sortKey)} aria-label={lang === 'en' ? 'Reverse sort order' : 'Odwróć kolejność'}>{sortDir === 'desc' ? '↓' : '↑'}</button></div>
          {visibleRows.map(player => <button className="um-roster-mobile-row" type="button" key={player.id} onClick={() => setProfilePlayer(player)}><span><strong>{getPlayerFullName(player)}</strong><small>{player.age ?? '—'} · {isPlayerInjured(player) ? injuryStatusLabel(player, lang) : fatigueBandLabel(100 - currentMatchStamina(player), lang)}{!clubOnly ? ' · ' + teamNameOf(player) : ''}</small>{player.transferListed && <small>{t.transferListedBadge}</small>}{player.loan && <small>{t.loanedInBadge(teamNameById.get(player.loan.parentTeamId) ?? player.loan.parentTeamId)}</small>}</span><span className="um-rating">{getOverallRating(player.skills)}</span><span aria-hidden="true">›</span></button>)}
        </div>}
        <div className={view === 'overview' ? 'um-table-wrap um-table-overview' : 'um-table-wrap'}>
          <table className="um-roster-table"><thead><tr>
            <th aria-sort={sortKey === 'name' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => onSort('name')}>{t.player} {sortKey === 'name' ? sortDir === 'asc' ? '↑' : '↓' : '↕'}</button></th>
            {!clubOnly && <th>{t.team}</th>}
            {columns.map(([key, label]) => <th key={key} aria-sort={sortKey === key ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}>{['traits', 'hand'].includes(key) ? label : <button type="button" onClick={() => onSort(key)}>{label} {sortKey === key ? sortDir === 'asc' ? '↑' : '↓' : '↕'}</button>}</th>)}
          </tr></thead><tbody>{visibleRows.map(player => {
            ensurePlayerMorale(player); ensurePlayerForm(player); ensurePlayerInjury(player)
            return <tr key={player.id}><td><button type="button" className="um-link text-left font-semibold" onClick={() => setProfilePlayer(player)}>{getPlayerFullName(player)} ↗</button>{isPlayerInjured(player) && <p className="text-xs text-ufa-danger">{injuryStatusLabel(player, lang)}</p>}{clubOnly && player.transferListed && <p className="text-xs text-ufa-gold">{t.transferListedBadge}</p>}{clubOnly && player.loan && <p className="text-xs text-ufa-muted">{t.loanedInBadge(teamNameById.get(player.loan.parentTeamId) ?? player.loan.parentTeamId)}</p>}</td>{!clubOnly && <td className="text-ufa-muted">{teamNameOf(player)}</td>}{columns.map(([key]) => <td key={key} className={['ovr','age','value','salary','contractRemaining','goals','assists','blocks','pointsPlayed'].includes(key) ? 'text-right' : ''}>{renderCell(player, key)}</td>)}</tr>
          })}</tbody></table>
        </div>
        {rows.length === 0 && <p className="py-8 text-ufa-muted">{lang === 'en' ? 'No players to display.' : 'Brak zawodników do wyświetlenia.'}</p>}
      </section>
      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        stamina={profilePlayer ? getSt(profilePlayer) : null}
        leaguePlayerStats={leaguePlayerStats}
        teamName={profilePlayer ? teamNameOf(profilePlayer) : null}
        isOwnPlayer={clubOnly}
        onExtendContract={clubOnly ? onExtendContract : null}
        onToggleTransferList={clubOnly ? onToggleTransferList : null}
        onToggleLoanList={clubOnly ? onToggleLoanList : null}
        onProposeLoanOut={
          clubOnly && onProposeLoanOut
            ? () => {
                setLoanOutPlayer(profilePlayer)
                setProfilePlayer(null)
              }
            : null
        }
        loanCounterpartyName={
          profilePlayer?.loan ? (teamNameById.get(profilePlayer.loan.parentTeamId) ?? null) : null
        }
      />
      {loanOutPlayer && onProposeLoanOut && (
        <LoanTermsModal
          mode="out"
          player={{
            name: getPlayerFullName(loanOutPlayer),
            marketValue: getPlayerMarketValue(loanOutPlayer),
          }}
          teams={leagueTeams.filter((team) => team.name !== focusTeamName)}
          onClose={() => setLoanOutPlayer(null)}
          onSubmit={(terms) => {
            const result = onProposeLoanOut(loanOutPlayer.id, terms)
            if (result?.ok) {
              setLoanFlash({ type: 'ok', text: result.flash ?? 'OK' })
              setLoanOutPlayer(null)
            } else {
              setLoanFlash({ type: 'error', text: result?.error ?? 'Error' })
            }
          }}
        />
      )}
      {loanFlash && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-sm  ${
            loanFlash.type === 'ok'
              ? 'bg-emerald-500/15 text-ufa-success ring-1 ring-emerald-500/40'
              : 'bg-red-500/15 text-ufa-danger ring-1 ring-red-500/40'
          }`}
        >
          {loanFlash.text}
          <button
            type="button"
            onClick={() => setLoanFlash(null)}
            className="ml-3 text-xs underline"
          >
            {t.close ?? '×'}
          </button>
        </div>
      )}
    </>
  )
}
