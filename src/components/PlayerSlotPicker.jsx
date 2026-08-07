import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { MAIN_CATEGORY_SORT_KEYS, readCategorySkill } from '../models/playerStats.js'
import StaminaBar, { getStaminaForPlayer } from './StaminaBar'
import { ThrowingHandBadge, LineMembershipBadges } from './TeamRosterPanel'
import { getPlayerForm } from '../models/playerForm.js'
import { getPlayerMorale } from '../models/playerMorale.js'
import {
  getInjuryDaysRemaining,
  injuryStatusLabel,
  isPlayerInjured,
} from '../models/playerInjury.js'
import PlayerInstructionsPicker, {
  PlayerInstructionBadges,
} from './PlayerInstructionsPicker'
import PlayerSubRolePicker, { PlayerSubRoleBadge } from './PlayerSubRolePicker'
import PlayerProfileModal from './PlayerProfileModal'
import {
  isPlayerTakenOnLine,
  lineSlotIndexOf,
  resolvePlayerSubRole,
  setPlayerSubRoleInTactics,
  storedSubRoleForPlayer,
  isHandlerSubRole,
  isCutterSubRole,
} from '../matchEngine'

const SORT_KEYS = [
  { id: 'ovr', label: 'OVR' },
  { id: 'name', labelPl: 'Imię', labelEn: 'Name' },
  ...MAIN_CATEGORY_SORT_KEYS.filter((k) => k.id !== 'name' && k.id !== 'ovr'),
  { id: 'stamina', label: 'STA' },
  { id: 'form', labelPl: 'Forma', labelEn: 'Form' },
  { id: 'morale', labelPl: 'Morale', labelEn: 'Morale' },
]

const STAT_CATS = [
  { id: 'throwing', short: 'THR' },
  { id: 'physical', short: 'PHY' },
  { id: 'mental', short: 'MEN' },
  { id: 'offensive', short: 'OFF' },
  { id: 'defensive', short: 'DEF' },
]

function filterRoster(players, { query }) {
  const q = query.trim().toLowerCase()
  if (!q) return players
  return players.filter((p) => getPlayerFullName(p).toLowerCase().includes(q))
}

function sortRoster(players, sortKey, sortDir, staminaMap) {
  const dir = sortDir === 'asc' ? 1 : -1
  const list = [...players]
  list.sort((a, b) => {
    let va
    let vb
    switch (sortKey) {
      case 'name':
        return getPlayerFullName(a).localeCompare(getPlayerFullName(b)) * dir
      case 'ovr':
        va = getOverallRating(a.skills)
        vb = getOverallRating(b.skills)
        break
      case 'stamina':
        va = getStaminaForPlayer(staminaMap, a.id)
        vb = getStaminaForPlayer(staminaMap, b.id)
        break
      case 'form':
        va = getPlayerForm(a)
        vb = getPlayerForm(b)
        break
      case 'morale':
        va = getPlayerMorale(a)
        vb = getPlayerMorale(b)
        break
      default:
        va = readCategorySkill(a.skills, sortKey)
        vb = readCategorySkill(b.skills, sortKey)
    }
    if (va !== vb) return (va - vb) * dir
    return getPlayerFullName(a).localeCompare(getPlayerFullName(b))
  })
  return list
}

function PlayerStatChips({ player, staminaMap, dense = false, lang = 'pl' }) {
  const sta = getStaminaForPlayer(staminaMap, player.id)
  const form = getPlayerForm(player)
  const morale = getPlayerMorale(player)
  const injured = isPlayerInjured(player)
  const injuryDays = getInjuryDaysRemaining(player)
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums ${
        dense ? 'text-[10px]' : 'text-[11px]'
      } text-ufa-muted`}
    >
      <span className="font-semibold text-ufa-text">
        OVR {getOverallRating(player.skills)}
      </span>
      {STAT_CATS.map((c) => (
        <span key={c.id} title={c.id}>
          {c.short} {readCategorySkill(player.skills, c.id)}
        </span>
      ))}
      <span title={lang === 'en' ? 'Form' : 'Forma'}>F {form}</span>
      <span title="Morale">M {morale}</span>
      <span title="Stamina">STA {sta}</span>
      {injured ? (
        <span
          className="font-semibold text-red-400"
          title={injuryStatusLabel(player, lang)}
        >
          OUT {injuryDays}d
        </span>
      ) : null}
    </div>
  )
}

function InjuryBadge({ player, lang = 'pl' }) {
  if (!isPlayerInjured(player)) return null
  const label = injuryStatusLabel(player, lang)
  return (
    <span
      title={label}
      className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-red-500/20 text-red-300 ring-1 ring-red-500/45"
    >
      {label}
    </span>
  )
}

/** Mini-kafelek: zawodnik już w tej siódemce (można kliknąć → zamiana pozycji). */
function OnLineBadge({ label, title = null }) {
  if (!label) return null
  return (
    <span
      title={title ?? label}
      className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/45"
    >
      {label}
    </span>
  )
}

/**
 * Czytelny wybór zawodnika na slot: lista ze stats / sortowaniem / profilem.
 */
export default function PlayerSlotPicker({
  index,
  playerId,
  line,
  roster,
  staminaMap,
  accentClass,
  onChange,
  selected = false,
  onSelectSlot = null,
  open: openProp = null,
  onOpenChange = null,
  slotLabel = null,
  slotShortLabel = null,
  /** 'handler' | 'cutter' — domyślny filtr pozycji */
  slotRole = null,
  /** 1-based index w rodzinie handler/cutter */
  slotRoleIndex = 1,
  tactics = null,
  onTacticsChange = null,
  teamName = null,
  leaguePlayerStats = null,
  /** Id w O-Line — tag przy zawodniku w liście / na slocie. */
  offenseLineIds = null,
  /** Id w D-Line — tag przy zawodniku w liście / na slocie. */
  defenseLineIds = null,
  /** Sloty formacji — etykiety „NA LINII · H2” itd. */
  positionSlots = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)

  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [sortKey, setSortKey] = useState('ovr')
  const [sortDir, setSortDir] = useState('desc')
  const [query, setQuery] = useState('')
  const [instrOpen, setInstrOpen] = useState(false)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const rootRef = useRef(null)
  const searchRef = useRef(null)

  const selectedPlayer = roster.find((p) => p.id === playerId) ?? null
  const selectedInjured = selectedPlayer ? isPlayerInjured(selectedPlayer) : false
  const stamina = getStaminaForPlayer(staminaMap, playerId)
  const positionTitle = slotLabel ?? `Pozycja ${index + 1}`
  const badgeText = slotShortLabel ?? String(index + 1)
  const canEditInstr =
    playerId != null && tactics != null && typeof onTacticsChange === 'function'

  const filteredSorted = useMemo(() => {
    const filtered = filterRoster(roster, { query })
    return sortRoster(filtered, sortKey, sortDir, staminaMap)
  }, [roster, query, sortKey, sortDir, staminaMap])

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    const t = window.setTimeout(() => searchRef.current?.focus?.(), 40)
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
        setInstrOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        setInstrOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  useEffect(() => {
    if (!instrOpen || open) return undefined
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setInstrOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setInstrOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [instrOpen, open])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc')
    }
  }

  function pick(id) {
    if (id != null) {
      const target = roster.find((p) => p.id === id)
      if (target && isPlayerInjured(target)) return
    }
    onChange(id)
    setOpen(false)
    setInstrOpen(false)
  }

  useEffect(() => {
    if (!canEditInstr) return
    if (slotRole !== 'handler' && slotRole !== 'cutter') return
    if (playerId == null) return
    const stored = storedSubRoleForPlayer(tactics, playerId)
    const fits =
      (slotRole === 'handler' && isHandlerSubRole(stored)) ||
      (slotRole === 'cutter' && isCutterSubRole(stored))
    if (fits) return
    const def = resolvePlayerSubRole(tactics, playerId, {
      role: slotRole,
      roleIndex: slotRoleIndex,
    })
    onTacticsChange(setPlayerSubRoleInTactics(tactics, playerId, def))
  }, [
    canEditInstr,
    playerId,
    slotRole,
    slotRoleIndex,
    tactics,
    onTacticsChange,
  ])

  return (
    <div
      ref={rootRef}
      className={`rounded-lg border bg-ufa-bg/50 ${
        selectedInjured
          ? 'border-red-500/55 ring-1 ring-red-500/25'
          : selected || open
            ? 'border-ufa-accent/60 ring-1 ring-ufa-accent/30'
            : 'border-ufa-border/80'
      }`}
    >
      <div className="flex items-stretch gap-2 p-2">
        <button
          type="button"
          onClick={() => onSelectSlot?.(index)}
          className={`flex h-9 min-w-[2.75rem] shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold ${accentClass}`}
          title={positionTitle}
        >
          {badgeText}
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectSlot?.(index)
            setInstrOpen(false)
            setOpen(!open)
          }}
          className="min-w-0 flex-1 rounded-md border border-ufa-border bg-ufa-panel px-3 py-1.5 text-left hover:bg-ufa-panel-hover"
        >
          <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{positionTitle}</p>
          {selectedPlayer ? (
            <div className="mt-0.5 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-medium text-ufa-text">
                  {getPlayerFullName(selectedPlayer)}
                </span>
                <InjuryBadge player={selectedPlayer} lang={lang} />
                <ThrowingHandBadge player={selectedPlayer} />
                <LineMembershipBadges
                  playerId={playerId}
                  offenseLineIds={offenseLineIds}
                  defenseLineIds={defenseLineIds}
                />
                {tactics && (
                  <>
                    <PlayerSubRoleBadge
                      playerId={playerId}
                      tactics={tactics}
                      slotRole={slotRole}
                      slotRoleIndex={slotRoleIndex}
                    />
                    <PlayerInstructionBadges playerId={playerId} tactics={tactics} />
                  </>
                )}
              </div>
              <PlayerStatChips
                player={selectedPlayer}
                staminaMap={staminaMap}
                dense
                lang={lang}
              />
            </div>
          ) : (
            <span className="mt-0.5 block text-sm text-ufa-muted">{t.pickPlayer}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectSlot?.(index)
            setInstrOpen(false)
            setOpen(!open)
          }}
          className="shrink-0 rounded-md border border-ufa-border px-2 text-xs text-ufa-muted hover:text-ufa-text"
          aria-expanded={open}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {selectedPlayer && (
        <div className="space-y-2 px-3 pb-2 pl-14">
          <StaminaBar stamina={stamina} compact />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setProfilePlayer(selectedPlayer)}
              className="text-[11px] text-ufa-muted hover:text-ufa-accent"
            >
              {t.profile}
            </button>
            {canEditInstr && (
              <>
                <PlayerSubRolePicker
                  playerId={playerId}
                  slotRole={slotRole}
                  slotRoleIndex={slotRoleIndex}
                  tactics={tactics}
                  onTacticsChange={onTacticsChange}
                  compact
                />
                <button
                  type="button"
                  onClick={() => {
                    onSelectSlot?.(index)
                    setInstrOpen((v) => !v)
                  }}
                  className="text-[11px] text-ufa-muted hover:text-ufa-accent"
                >
                  {instrOpen ? t.hideOrders : t.showOrders}
                </button>
              </>
            )}
          </div>
          {canEditInstr && instrOpen && (
            <PlayerInstructionsPicker
              playerId={playerId}
              tactics={tactics}
              onTacticsChange={onTacticsChange}
              compact
            />
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-ufa-border bg-ufa-panel/80">
          <div className="space-y-2 border-b border-ufa-border/60 px-2 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchName}
                className="min-w-[8rem] flex-1 rounded-md border border-ufa-border bg-ufa-bg px-2 py-1 text-xs text-ufa-text placeholder:text-ufa-muted"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="self-center text-[10px] uppercase tracking-wide text-ufa-muted">
                {t.sortBy}
              </span>
              {SORT_KEYS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => toggleSort(k.id)}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    sortKey === k.id
                      ? 'bg-ufa-accent/20 text-ufa-accent'
                      : 'text-ufa-muted hover:text-ufa-text'
                  }`}
                >
                  {pickLabel(k, lang) ?? k.label}
                  {sortKey === k.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
              {playerId != null && (
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-amber-300/90 hover:bg-amber-500/10"
                >
                  {t.clearSlot}
                </button>
              )}
            </div>
            <p className="text-[10px] text-ufa-muted">
              {t.shownOf(filteredSorted.length, roster.length)}
            </p>
          </div>
          <ul className="max-h-72 overflow-auto divide-y divide-ufa-border/40">
            {filteredSorted.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-ufa-muted">
                {t.noPlayersFilter}
              </li>
            ) : (
              filteredSorted.map((p) => {
                const taken = isPlayerTakenOnLine(line, p.id, index)
                const lineIdx = lineSlotIndexOf(line, p.id)
                const takenSlot =
                  lineIdx >= 0 ? positionSlots?.[lineIdx] ?? null : null
                const onLineLabel =
                  taken || lineIdx === index
                    ? takenSlot?.shortLabel
                      ? t.onLineSlot(takenSlot.shortLabel)
                      : t.onLine
                    : null
                const injured = isPlayerInjured(p)
                const isCurrent = p.id === playerId
                const canSwap = taken && !isCurrent && !injured
                return (
                  <li key={p.id} className="flex items-stretch gap-0">
                    <button
                      type="button"
                      disabled={injured}
                      onClick={() => pick(p.id)}
                      title={
                        injured
                          ? injuryStatusLabel(p, lang)
                          : canSwap
                            ? t.swapPositions
                            : undefined
                      }
                      className={`min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                        injured
                          ? 'bg-red-500/5'
                          : isCurrent
                            ? 'bg-ufa-accent/10'
                            : canSwap
                              ? 'bg-amber-500/5 hover:bg-amber-500/15'
                              : 'hover:bg-ufa-panel-hover/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-[7rem] text-sm font-medium text-ufa-text">
                          {getPlayerFullName(p)}
                        </span>
                        <InjuryBadge player={p} lang={lang} />
                        {onLineLabel ? (
                          <OnLineBadge
                            label={onLineLabel}
                            title={canSwap ? t.swapPositions : onLineLabel}
                          />
                        ) : null}
                        <ThrowingHandBadge player={p} />
                        <LineMembershipBadges
                          playerId={p.id}
                          offenseLineIds={offenseLineIds}
                          defenseLineIds={defenseLineIds}
                        />
                        {isCurrent ? (
                          <span className="text-[10px] text-ufa-accent">wybrany</span>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        <PlayerStatChips player={p} staminaMap={staminaMap} dense lang={lang} />
                      </div>
                    </button>
                    <button
                      type="button"
                      title={t.openProfile}
                      onClick={(e) => {
                        e.stopPropagation()
                        setProfilePlayer(p)
                      }}
                      className="shrink-0 border-l border-ufa-border/50 px-2.5 text-[11px] text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-accent"
                    >
                      Profil
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        stamina={
          profilePlayer ? getStaminaForPlayer(staminaMap, profilePlayer.id) : null
        }
        leaguePlayerStats={leaguePlayerStats}
        teamName={teamName}
        isOwnPlayer
      />
    </div>
  )
}
