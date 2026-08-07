import {
  ensurePlayerTraits,
  getPlayerTraits,
  traitLabel,
  traitToneClass,
  traitDef,
} from '../models/playerTraits.js'
import { useUiLang } from '../ui/UiLangContext'

/**
 * @param {{ player: object, max?: number | null, className?: string }} props
 * max — ile chipów pokazać (null = wszystkie); reszta jako „+N”.
 */
export default function PlayerTraitChips({ player, max = null, className = '' }) {
  const { lang } = useUiLang()
  if (!player) return null
  ensurePlayerTraits(player)
  const traits = getPlayerTraits(player)
  if (!traits.length) {
    return <span className={`text-xs text-ufa-muted ${className}`}>—</span>
  }

  const shown = max != null ? traits.slice(0, max) : traits
  const rest = max != null ? Math.max(0, traits.length - shown.length) : 0

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {shown.map((id) => {
        const pol = traitDef(id)?.polarity
        const ring =
          pol === 'positive'
            ? 'ring-emerald-500/35'
            : pol === 'negative'
              ? 'ring-red-500/35'
              : pol === 'mixed'
                ? 'ring-ufa-gold/40'
                : 'ring-ufa-border'
        const label = traitLabel(id, lang)
        return (
          <span
            key={id}
            className={`rounded bg-ufa-bg px-1.5 py-0.5 text-[11px] font-medium ring-1 ${ring} ${traitToneClass(id)}`}
            title={label}
          >
            {label}
          </span>
        )
      })}
      {rest > 0 && (
        <span
          className="rounded bg-ufa-bg px-1.5 py-0.5 text-[11px] text-ufa-muted ring-1 ring-ufa-border"
          title={traits
            .slice(max)
            .map((id) => traitLabel(id, lang))
            .join(', ')}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
