import { useUiLang } from '../ui/UiLangContext'
import { pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { getPlayerFullName } from '../data/mockPlayers'
import {
  ZONE_DEFENSE_ROLE_DEFS,
  ZONE_DEFENSE_ROLE_IDS,
  ZONE_ROLE_SLOT_LIMITS,
  resolveTeamZoneSlotRoleMap,
  setPlayerZoneRoleInTactics,
} from '../matchEngine'

/**
 * Ręczny przydział slotów zone defense (marker/cup×2/wing×2/middle/deep) dla 7
 * graczy już wybranych na linię. Nie wybiera SKŁADU (to robi PlayerSlotPicker) —
 * tylko role W OBRĘBIE już ustalonej siódemki.
 * Zmiana roli = zamiana (swap): jeśli docelowa rola jest już zajęta w limicie
 * (1 marker/2 cup/2 wing/1 middle/1 deep), aktualny posiadacz dostaje starą rolę
 * gracza, którego właśnie przestawiamy — przydział zawsze zostaje kompletny.
 */
export default function ZoneDefenseRolesPanel({ lineIds = [], roster = [], tactics, onTacticsChange, label = null }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)

  const players = (lineIds ?? [])
    .filter((id) => id != null)
    .map((id) => roster.find((p) => p.id === id))
    .filter(Boolean)

  if (!tactics || typeof onTacticsChange !== 'function' || players.length === 0) return null

  const roleMap = resolveTeamZoneSlotRoleMap(tactics, lineIds)

  function handleRoleChange(playerId, newRole) {
    const oldRole = roleMap[String(playerId)]
    if (oldRole === newRole) return
    const limit = ZONE_ROLE_SLOT_LIMITS[newRole] ?? 1
    const holders = (lineIds ?? []).filter(
      (id) => id != null && String(id) !== String(playerId) && roleMap[String(id)] === newRole,
    )
    let next = tactics
    if (holders.length >= limit) {
      const displaced = holders[0]
      if (displaced != null && oldRole) {
        next = setPlayerZoneRoleInTactics(next, displaced, oldRole)
      }
    }
    next = setPlayerZoneRoleInTactics(next, playerId, newRole)
    onTacticsChange(next)
  }

  return (
    <div className="space-y-2 rounded-lg border border-ufa-border/70 bg-ufa-bg/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ufa-muted">
        {label ? t.zoneRolesFor(label) : t.zoneRoles}
      </p>
      <p className="text-[11px] text-ufa-muted">{t.zoneRolesHint}</p>
      <div className="space-y-1.5">
        {players.map((p) => {
          const role = roleMap[String(p.id)]
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border/60 bg-ufa-panel px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-sm text-ufa-text">{getPlayerFullName(p)}</span>
              <select
                value={role ?? ''}
                onChange={(e) => handleRoleChange(p.id, e.target.value)}
                className="rounded border border-ufa-border bg-ufa-panel px-2 py-1 text-[11px] text-ufa-text"
              >
                {ZONE_DEFENSE_ROLE_IDS.map((id) => (
                  <option key={id} value={id} title={pickDesc(ZONE_DEFENSE_ROLE_DEFS[id], lang)}>
                    {ZONE_DEFENSE_ROLE_DEFS[id].label}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
