import {
  ensurePlayerTraits,
  getPlayerTraits,
  traitLabel,
  traitDescription,
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
      {['style', 'personality'].map(kind => <div key={kind}>
        <p className="text-xs text-ufa-muted mb-1">{kind === 'style'
          ? (lang === 'pl' ? 'Styl gry' : 'Playing style')
          : (lang === 'pl' ? 'Charakter' : 'Personality')}</p>
        <div className="um-traits">
          {traits.filter(id => traitDef(id)?.kind === kind).map(id => <details key={id} className="um-trait-detail"><summary>{traitLabel(id, lang)}</summary><p>{traitDescription(id, lang)}</p></details>)}
          {!traits.some(id => traitDef(id)?.kind === kind) && <span className="text-ufa-muted">—</span>}
        </div>
      </div>)}
      <div>
        <p className="text-xs text-ufa-muted mb-1">{lang === 'pl' ? 'Mocne strony — wynikają z atrybutów' : 'Strengths — derived from attributes'}</p>
        <div className="um-traits">{badges.length ? badges.map(b => <span key={b.id}
          className="text-xs text-ufa-muted"
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
    <div className={`um-traits ${className}`}>
      {shown.map((id) => {
        const label = traitLabel(id, lang)
        const desc = traitDescription(id, lang)
        return (
          <span
            key={id}
            className="text-xs text-ufa-muted"
            title={desc ? `${label} — ${desc}` : label}
          >
            {label}
          </span>
        )
      })}
      {rest > 0 && (
        <span
          className="text-xs text-ufa-muted"
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
