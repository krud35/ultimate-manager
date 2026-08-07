import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { useEffect, useMemo, useState } from 'react'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { MAIN_CATEGORY_SORT_KEYS, readCategorySkill } from '../models/playerStats.js'
import StaminaBar, { getStaminaForPlayer } from './StaminaBar'
import PlayerProfileModal from './PlayerProfileModal'
import { getThrowingHand, throwingHandShortLabel, THROWING_HAND } from '../models/playerProfile.js'
import { getPlayerMorale } from '../models/playerMorale.js'
import { getPlayerForm } from '../models/playerForm.js'
import PlayerInstructionsPicker, {
  PlayerInstructionBadges,
} from './PlayerInstructionsPicker'

function ThrowingHandBadge({ player }) {
  const { lang } = useUiLang()
  const hand = getThrowingHand(player)
  const isLeft = hand === THROWING_HAND.LEFT
  const title =
    lang === 'en'
      ? `Throwing hand: ${hand}`
      : `Ręka rzutu: ${isLeft ? 'Lewa' : 'Prawa'}`
  return (
    <span
      title={title}
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ${
        isLeft
          ? 'bg-violet-500/15 text-violet-300 ring-violet-500/35'
          : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35'
      }`}
    >
      {throwingHandShortLabel(hand)}
    </span>
  )
}

/** Widoczne tagi, gdy zawodnik jest już w O-Line / D-Line. */
function LineMembershipBadges({ playerId, offenseLineIds = null, defenseLineIds = null }) {
  const { lang } = useUiLang()
  if (playerId == null) return null
  const onO = Array.isArray(offenseLineIds) && offenseLineIds.includes(playerId)
  const onD = Array.isArray(defenseLineIds) && defenseLineIds.includes(playerId)
  if (!onO && !onD) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {onO ? (
        <span
          title={lang === 'en' ? 'On O-Line' : 'W O-Line'}
          className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
        >
          O-Line
        </span>
      ) : null}
      {onD ? (
        <span
          title={lang === 'en' ? 'On D-Line' : 'W D-Line'}
          className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40"
        >
          D-Line
        </span>
      ) : null}
    </span>
  )
}

function PositionBadge({ position }) {
  const raw = String(position ?? '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  // Podział Handler/Cutter na zawodniku usunięty — nie pokazuj tagów H/C.
  if (lower.includes('handler') || lower.includes('cutter')) return null
  return (
    <span
      title={raw}
      className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1 bg-ufa-border/40 text-ufa-muted ring-ufa-border/60"
    >
      {raw.slice(0, 3)}
    </span>
  )
}

const MAIN_CATEGORIES = ['throwing', 'physical', 'mental', 'offensive', 'defensive']

const SKILL_SORT_KEYS = [
  ...MAIN_CATEGORY_SORT_KEYS,
  { id: 'stamina', label: 'Stamina' },
  { id: 'form', labelPl: 'Forma', labelEn: 'Form' },
  { id: 'morale', label: 'Morale' },
]

function SkillBar({ value }) {
  const color =
    value >= 85 ? 'bg-ufa-accent' : value >= 70 ? 'bg-ufa-gold' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="h-1.5 flex-1 rounded-full bg-ufa-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ufa-muted w-6 text-right">{value}</span>
    </div>
  )
}

function sortPlayers(players, sortKey, sortDir, getStamina) {
  const dir = sortDir === 'asc' ? 1 : -1
  const list = [...players]
  list.sort((a, b) => {
    let va
    let vb
    switch (sortKey) {
      case 'name':
        va = getPlayerFullName(a).toLowerCase()
        vb = getPlayerFullName(b).toLowerCase()
        return va.localeCompare(vb) * dir
      case 'ovr':
        va = getOverallRating(a.skills)
        vb = getOverallRating(b.skills)
        break
      case 'stamina':
        va = getStamina(a)
        vb = getStamina(b)
        break
      case 'morale':
        va = getPlayerMorale(a)
        vb = getPlayerMorale(b)
        break
      case 'form':
        va = getPlayerForm(a)
        vb = getPlayerForm(b)
        break
      default:
        va = readCategorySkill(a.skills, sortKey)
        vb = readCategorySkill(b.skills, sortKey)
    }
    if (sortKey !== 'name') {
      if (va !== vb) return (va - vb) * dir
      return getPlayerFullName(a).localeCompare(getPlayerFullName(b))
    }
    return 0
  })
  return list
}

export default function TeamRosterPanel({
  roster,
  teamName,
  staminaMap = null,
  defaultOpen = false,
  compact = false,
  leaguePlayerStats = null,
  /** Gdy ustawione — klik w zawodnika wstawia go na aktywny slot (lub zamienia, jeśli już na linii). */
  replaceTarget = null,
  onReplacePlayer = null,
  linePlayerIds = null,
  /** Sloty formacji aktywnej linii — etykiety NA LINII · H2. */
  positionSlots = null,
  /** Id zawodników w O-Line — tag „O-Line” na liście. */
  offenseLineIds = null,
  /** Id zawodników w D-Line — tag „D-Line” na liście. */
  defenseLineIds = null,
  tactics = null,
  onTacticsChange = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [open, setOpen] = useState(defaultOpen || !!replaceTarget)
  const [sortKey, setSortKey] = useState('ovr')
  const [sortDir, setSortDir] = useState('desc')
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [instrPlayerId, setInstrPlayerId] = useState(null)

  const canEditInstructions = tactics != null && typeof onTacticsChange === 'function'
  const showLineTags = offenseLineIds != null || defenseLineIds != null

  const getSt = (p) => getStaminaForPlayer(staminaMap, p.id)
  const lineSet = useMemo(
    () => new Set((linePlayerIds ?? []).filter(Boolean)),
    [linePlayerIds],
  )

  const sorted = useMemo(
    () => sortPlayers(roster, sortKey, sortDir, getSt),
    [roster, sortKey, sortDir, staminaMap],
  )

  useEffect(() => {
    if (replaceTarget) setOpen(true)
  }, [replaceTarget])

  useEffect(() => {
    if (instrPlayerId == null) return undefined
    function onDoc(e) {
      const host = e.target?.closest?.('[data-instr-player]')
      if (host && host.getAttribute('data-instr-player') === String(instrPlayerId)) {
        return
      }
      setInstrPlayerId(null)
    }
    function onKey(e) {
      if (e.key === 'Escape') setInstrPlayerId(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [instrPlayerId])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const replaceActive = replaceTarget != null && typeof onReplacePlayer === 'function'

  return (
    <>
      <div className="rounded-lg border border-ufa-border bg-ufa-bg/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ufa-panel-hover"
        >
          <span className="text-sm font-medium text-ufa-text">
            {t.fullRoster(teamName, roster.length)}
          </span>
          <span className="text-xs text-ufa-muted">{open ? t.collapse : t.expand}</span>
        </button>
        {replaceActive && (
          <div className="border-t border-ufa-accent/30 bg-ufa-accent/10 px-4 py-2 text-xs text-ufa-accent">
            {t.replaceHint(replaceTarget.lineLabel ?? `slot ${replaceTarget.slotIndex + 1}`)}
          </div>
        )}
        {open && (
          <div
            className={`border-t border-ufa-border ${compact ? 'max-h-64' : 'max-h-96'} overflow-auto`}
          >
            <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-ufa-border/60 bg-ufa-panel/30">
              <span className="text-xs text-ufa-muted self-center">{t.sortBy}</span>
              {SKILL_SORT_KEYS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => toggleSort(k.id)}
                  className={`rounded px-2 py-0.5 text-xs ${
                    sortKey === k.id
                      ? 'bg-ufa-accent/20 text-ufa-accent'
                      : 'text-ufa-muted hover:text-ufa-text'
                  }`}
                >
                  {pickLabel(k, lang)}
                  {sortKey === k.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-ufa-border/50 text-sm">
              {sorted.map((p) => {
                const onLine = lineSet.has(p.id)
                const lineIdx = onLine
                  ? (linePlayerIds ?? []).findIndex((id) => id === p.id)
                  : -1
                const takenSlot = lineIdx >= 0 ? positionSlots?.[lineIdx] ?? null : null
                const onLineLabel = onLine
                  ? takenSlot?.shortLabel
                    ? t.onLineSlot(takenSlot.shortLabel)
                    : t.onLine
                  : null
                const isCurrent = p.id === replaceTarget?.currentPlayerId
                const canSwap = replaceActive && onLine && !isCurrent
                const canReplace = replaceActive
                return (
                  <li
                    key={p.id}
                    data-instr-player={
                      canEditInstructions && instrPlayerId === p.id ? String(p.id) : undefined
                    }
                    className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 ${
                      canSwap
                        ? 'hover:bg-amber-500/10'
                        : canReplace
                          ? 'hover:bg-ufa-accent/10'
                          : 'hover:bg-ufa-panel-hover/50'
                    }`}
                  >
                    {replaceActive ? (
                      <button
                        type="button"
                        onClick={() => onReplacePlayer(p.id)}
                        className="font-medium min-w-[140px] text-left text-ufa-accent hover:underline"
                        title={canSwap ? t.swapPositions : undefined}
                      >
                        {getPlayerFullName(p)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setProfilePlayer(p)}
                        className="font-medium min-w-[140px] text-left text-ufa-accent hover:underline"
                      >
                        {getPlayerFullName(p)}
                      </button>
                    )}
                    <ThrowingHandBadge player={p} />
                    {onLineLabel ? (
                      <span
                        title={canSwap ? t.swapPositions : onLineLabel}
                        className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/45"
                      >
                        {onLineLabel}
                      </span>
                    ) : null}
                    {showLineTags ? (
                      <LineMembershipBadges
                        playerId={p.id}
                        offenseLineIds={offenseLineIds}
                        defenseLineIds={defenseLineIds}
                      />
                    ) : null}
                    <span className="text-xs text-ufa-muted tabular-nums">
                      OVR {getOverallRating(p.skills)}
                    </span>
                    {MAIN_CATEGORIES.map((cat) => (
                      <span key={cat} className="hidden lg:inline-flex" title={cat}>
                        <SkillBar value={readCategorySkill(p.skills, cat)} />
                      </span>
                    ))}
                    <StaminaBar stamina={getSt(p)} compact />
                    {canEditInstructions && (
                      <PlayerInstructionBadges playerId={p.id} tactics={tactics} />
                    )}
                    {canEditInstructions && (
                      <button
                        type="button"
                        onClick={() =>
                          setInstrPlayerId((id) => (id === p.id ? null : p.id))
                        }
                        className="text-[11px] text-ufa-muted hover:text-ufa-accent"
                      >
                        {instrPlayerId === p.id ? 'ukryj rozkazy' : 'rozkazy'}
                      </button>
                    )}
                    {!replaceActive && (
                      <button
                        type="button"
                        onClick={() => setProfilePlayer(p)}
                        className={`${canEditInstructions ? '' : 'ml-auto '}text-[11px] text-ufa-muted hover:text-ufa-text`}
                      >
                        profil
                      </button>
                    )}
                    {canEditInstructions && instrPlayerId === p.id && (
                      <div className="w-full basis-full pl-1 pr-1 pb-1">
                        <PlayerInstructionsPicker
                          playerId={p.id}
                          tactics={tactics}
                          onTacticsChange={onTacticsChange}
                          compact={compact}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        stamina={profilePlayer ? getSt(profilePlayer) : null}
        leaguePlayerStats={leaguePlayerStats}
        isOwnPlayer
      />
    </>
  )
}

export {
  SKILL_SORT_KEYS,
  sortPlayers,
  SkillBar,
  ThrowingHandBadge,
  PositionBadge,
  LineMembershipBadges,
}
