import { PLAYER_ARCHETYPES } from '../models/playerArchetypes.js'
import {
  ensurePlayerTraits,
  getPlayerTraits,
  traitLabel,
  traitDescription,
  traitToneClass,
  traitDef,
  playerSkillBadges,
} from '../models/playerTraits.js'
import { useUiLang } from '../ui/UiLangContext'

/**
 * @param {{ player: object, max?: number | null, className?: string }} props
 * max — ile chipów pokazać (null = wszystkie); reszta jako „+N”.
 */
export default function PlayerTraitChips({ player, max = null, className = '', grouped = false }) {
  const { lang } = useUiLang()
  if (!player) return null
  ensurePlayerTraits(player)
  const traits = getPlayerTraits(player)
  if (grouped) {
    const badges = playerSkillBadges(player)
    return <div className={`space-y-3 ${className}`}>
      {player.generatedReserve && <p className="text-xs text-ufa-muted">{lang === 'pl' ? 'Wygenerowany zawodnik uzupełniający skład' : 'Generated squad player'}</p>}
      {PLAYER_ARCHETYPES[player.archetype] && <p className="text-sm font-semibold">{PLAYER_ARCHETYPES[player.archetype][lang === 'pl' ? 'pl' : 'en']}</p>}
      {['style', 'personality'].map(kind => <div key={kind}>
        <p className="text-xs text-ufa-muted mb-1">{kind === 'style'
          ? (lang === 'pl' ? 'Styl gry' : 'Playing style')
          : (lang === 'pl' ? 'Charakter' : 'Personality')}</p>
        <div className="flex flex-wrap gap-1">
          {traits.filter(id => traitDef(id)?.kind === kind).map(id => <span key={id}
            className={`rounded bg-ufa-bg px-1.5 py-0.5 text-xs ring-1 ring-ufa-border ${traitToneClass(id)}`}
            title={traitDescription(id, lang)}>{traitLabel(id, lang)}</span>)}
          {!traits.some(id => traitDef(id)?.kind === kind) && <span className="text-ufa-muted">—</span>}
        </div>
      </div>)}
      <div>
        <p className="text-xs text-ufa-muted mb-1">{lang === 'pl' ? 'Mocne strony — wynikają z atrybutów' : 'Strengths — derived from attributes'}</p>
        <div className="flex flex-wrap gap-1">{badges.length ? badges.map(b => <span key={b.id}
          className="rounded bg-ufa-bg px-1.5 py-0.5 text-xs text-ufa-muted ring-1 ring-ufa-border"
          title={lang === 'pl' ? 'Opis umiejętności, bez dodatkowego bonusu.' : 'Describes ability; grants no additional bonus.'}
        >{lang === 'pl' ? b.namePl : b.nameEn}</span>) : <span className="text-ufa-muted">—</span>}</div>
      </div>
    </div>
  }
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
        const desc = traitDescription(id, lang)
        return (
          <span
            key={id}
            className={`rounded bg-ufa-bg px-1.5 py-0.5 text-[11px] font-medium ring-1 ${ring} ${traitToneClass(id)}`}
            title={desc ? `${label} — ${desc}` : label}
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
            .map((id) => {
              const desc = traitDescription(id, lang)
              const label = traitLabel(id, lang)
              return desc ? `${label} — ${desc}` : label
            })
            .join('\n')}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
