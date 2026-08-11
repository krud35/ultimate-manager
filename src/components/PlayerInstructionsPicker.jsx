import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { getPlayerFullName } from '../data/mockPlayers'
import {
  PLAYER_INSTRUCTION_DEFS,
  PLAYER_INSTRUCTION_CONFLICTS,
  instructionsForPlayer,
  toggleInstructionInTactics,
  instructionBadges,
  normalizeInstructionList,
  normalizeTactics,
} from '../matchEngine'

const GROUPS = [
  { id: 'throw', labelPl: 'Rzut', labelEn: 'Throw' },
  { id: 'cut', labelPl: 'Cut', labelEn: 'Cut' },
  { id: 'defense', labelPl: 'Obrona', labelEn: 'Defense' },
  { id: 'role', labelPl: 'Rola', labelEn: 'Role' },
]

/** Pary instrukcji należące do danej grupy, w kolejności PLAYER_INSTRUCTION_CONFLICTS. */
function pairsForGroup(groupId) {
  return PLAYER_INSTRUCTION_CONFLICTS.filter(
    ([a]) => PLAYER_INSTRUCTION_DEFS[a]?.group === groupId,
  )
}

/**
 * Popup z instrukcjami trenera dla zawodnika — osobno dla O-Line i D-Line.
 * Pary przeciwstawne (np. throw_hucks / no_hucks) renderowane obok siebie,
 * pogrupowane kategoriami (rzut / cut / obrona / rola).
 */
export default function PlayerInstructionsPicker({
  playerId,
  tactics,
  onTacticsChange,
  onClose,
  defaultLineRole = 'offense',
  roster = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [lineRole, setLineRole] = useState(defaultLineRole)

  useEffect(() => {
    setLineRole(defaultLineRole)
  }, [defaultLineRole, playerId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (playerId == null || !tactics || !onTacticsChange) return null

  const active = instructionsForPlayer(tactics, playerId, lineRole)
  const activeSet = new Set(active)
  const player = roster?.find?.((p) => p.id === playerId) ?? null

  function toggle(id) {
    onTacticsChange(
      normalizeTactics(toggleInstructionInTactics(tactics, playerId, id, lineRole)),
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4 sm:pt-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-instructions-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-label={t.close ?? 'Close'}
        onClick={onClose}
      />
      <div className="relative z-10 mt-0 w-full max-w-2xl max-h-[min(92vh,100%)] overflow-auto rounded-t-xl sm:mt-0 sm:rounded-xl border border-ufa-border bg-ufa-panel shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ufa-border bg-ufa-panel/95 px-4 py-3 backdrop-blur">
          <h2 id="player-instructions-title" className="text-sm font-semibold text-ufa-text">
            {t.instructions}
            {player ? ` · ${getPlayerFullName(player)}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ufa-muted ring-1 ring-ufa-border hover:bg-ufa-panel-hover hover:text-ufa-text"
          >
            {t.close ?? '✕'}
          </button>
        </div>

        <div className="flex gap-1 border-b border-ufa-border/60 bg-ufa-bg/30 p-2">
          {[
            { id: 'offense', label: t.oLine, accent: 'bg-sky-500/20 text-sky-200' },
            { id: 'defense', label: t.dLine, accent: 'bg-orange-500/20 text-orange-200' },
          ].map((tab) => {
            const on = lineRole === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLineRole(tab.id)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  on ? tab.accent : 'text-ufa-muted hover:text-ufa-text'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-4 p-4">
          {GROUPS.map((group) => {
            const pairs = pairsForGroup(group.id)
            if (!pairs.length) return null
            return (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ufa-muted">
                  {pickLabel(group, lang)}
                </p>
                <div className="space-y-1">
                  {pairs.map(([idA, idB]) => (
                    <div key={idA} className="grid grid-cols-2 gap-1.5">
                      {[idA, idB].map((id) => {
                        const def = PLAYER_INSTRUCTION_DEFS[id]
                        const on = activeSet.has(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            title={pickDesc(def, lang)}
                            onClick={() => toggle(id)}
                            className={`rounded-md border px-2.5 py-2 text-left text-xs transition ${
                              on
                                ? 'border-ufa-accent bg-ufa-accent/20 text-ufa-accent'
                                : 'border-ufa-border bg-ufa-bg/40 text-ufa-muted hover:border-ufa-accent/40 hover:text-ufa-text'
                            }`}
                          >
                            <span className="block font-medium">{pickLabel(def, lang)}</span>
                            <span className="mt-0.5 block text-[10px] opacity-80">
                              {pickDesc(def, lang)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Małe badge’e aktywnych instrukcji (slot / wiersz rosteru).
 * Z podanym `lineRole` pokazuje tylko tę linię; bez niego — sumę O-Line + D-Line. */
export function PlayerInstructionBadges({ playerId, tactics, maxShow = 2, lineRole = null }) {
  const { lang } = useUiLang()
  const ids = lineRole
    ? instructionsForPlayer(tactics, playerId, lineRole)
    : normalizeInstructionList([
        ...instructionsForPlayer(tactics, playerId, 'offense'),
        ...instructionsForPlayer(tactics, playerId, 'defense'),
      ])
  const badges = instructionBadges(ids, maxShow, lang)
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
