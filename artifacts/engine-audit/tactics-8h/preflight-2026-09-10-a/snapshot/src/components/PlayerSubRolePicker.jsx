import { useUiLang } from '../ui/UiLangContext'
import { pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import {
  resolvePlayerSubRole,
  setPlayerSubRoleInTactics,
  subRolesForFamily,
  playerSubRoleShortLabel,
} from '../matchEngine'

/**
 * Wybór podroli (handler / cutter) dla zawodnika na slocie formacji.
 */
export default function PlayerSubRolePicker({
  playerId,
  slotRole = null,
  slotRoleIndex = 1,
  tactics,
  onTacticsChange,
  compact = false,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)

  if (playerId == null || !tactics || !onTacticsChange) return null
  if (slotRole !== 'handler' && slotRole !== 'cutter') return null

  const options = subRolesForFamily(slotRole)
  const value = resolvePlayerSubRole(tactics, playerId, {
    role: slotRole,
    roleIndex: slotRoleIndex,
  })

  return (
    <label
      className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      title={t.subRoleTitle}
    >
      <span className="text-ufa-muted">{t.subRole}</span>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const id = e.target.value || null
          onTacticsChange(setPlayerSubRoleInTactics(tactics, playerId, id))
        }}
        className={`rounded border border-ufa-border bg-ufa-panel text-ufa-text ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
        }`}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} title={pickDesc(opt, lang)}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PlayerSubRoleBadge({ playerId, tactics, slotRole = null, slotRoleIndex = 1 }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  if (playerId == null || !tactics) return null
  if (slotRole !== 'handler' && slotRole !== 'cutter') return null
  const id = resolvePlayerSubRole(tactics, playerId, {
    role: slotRole,
    roleIndex: slotRoleIndex,
  })
  if (!id) return null
  return (
    <span
      className="rounded bg-ufa-border/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ufa-muted"
      title={t.subRole}
    >
      {playerSubRoleShortLabel(id)}
    </span>
  )
}
