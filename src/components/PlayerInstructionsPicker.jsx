import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import {
  PLAYER_INSTRUCTION_DEFS,
  PLAYER_INSTRUCTION_MAX,
  instructionsForPlayer,
  toggleInstructionInTactics,
  instructionBadges,
  normalizeTactics,
  playerInstructionLabel,
} from '../matchEngine'

const GROUPS = [
  { id: 'throw', labelPl: 'Rzut', labelEn: 'Throw' },
  { id: 'cut', labelPl: 'Cut', labelEn: 'Cut' },
  { id: 'defense', labelPl: 'Obrona', labelEn: 'Defense' },
  { id: 'role', labelPl: 'Rola', labelEn: 'Role' },
]

/**
 * Chipy indywidualnych instrukcji trenera dla jednego zawodnika.
 */
export default function PlayerInstructionsPicker({
  playerId,
  tactics,
  onTacticsChange,
  compact = false,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)

  if (playerId == null || !tactics || !onTacticsChange) return null

  const active = instructionsForPlayer(tactics, playerId)
  const activeSet = new Set(active)

  function toggle(id) {
    onTacticsChange(
      normalizeTactics(toggleInstructionInTactics(tactics, playerId, id)),
    )
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ufa-muted">
          {t.instructions}
        </p>
        <span className="text-[10px] tabular-nums text-ufa-muted">
          {active.length}/{PLAYER_INSTRUCTION_MAX}
        </span>
      </div>
      {GROUPS.map((group) => {
        const opts = Object.values(PLAYER_INSTRUCTION_DEFS).filter(
          (d) => d.group === group.id,
        )
        if (!opts.length) return null
        return (
          <div key={group.id} className="space-y-1">
            {!compact && (
              <p className="text-[10px] text-ufa-muted/80">{pickLabel(group, lang)}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {opts.map((def) => {
                const on = activeSet.has(def.id)
                const atCap = !on && active.length >= PLAYER_INSTRUCTION_MAX
                return (
                  <button
                    key={def.id}
                    type="button"
                    title={pickDesc(def, lang)}
                    disabled={atCap}
                    onClick={() => toggle(def.id)}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] transition ${
                      on
                        ? 'border-ufa-accent bg-ufa-accent/20 text-ufa-accent'
                        : atCap
                          ? 'border-ufa-border/40 text-ufa-muted/40 cursor-not-allowed'
                          : 'border-ufa-border bg-ufa-bg/40 text-ufa-muted hover:border-ufa-accent/40 hover:text-ufa-text'
                    }`}
                  >
                    {pickLabel(def, lang)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Małe badge’e aktywnych instrukcji (slot / wiersz rosteru). */
export function PlayerInstructionBadges({ playerId, tactics, maxShow = 2 }) {
  const { lang } = useUiLang()
  const badges = instructionBadges(instructionsForPlayer(tactics, playerId), maxShow, lang)
  if (!badges.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.id}
          title={b.label}
          className="inline-flex rounded bg-ufa-accent/15 px-1 py-0.5 text-[9px] font-semibold text-ufa-accent ring-1 ring-ufa-accent/30"
        >
          {b.short}
        </span>
      ))}
    </div>
  )
}
