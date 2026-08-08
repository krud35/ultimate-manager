import { UI_LANG } from './locale'

export function LangSwitch({ lang, onChange, className = '' }) {
  return (
    <div
      className={`inline-flex rounded-md border border-ufa-border bg-ufa-bg p-0.5 ${className}`}
      role="group"
      aria-label={lang === UI_LANG.EN ? 'Interface language' : 'Język interfejsu'}
    >
      <button
        type="button"
        onClick={() => onChange(UI_LANG.PL)}
        className={`min-h-8 rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors sm:min-h-0 ${
          lang === UI_LANG.PL
            ? 'bg-ufa-accent text-ufa-bg'
            : 'text-ufa-muted hover:text-ufa-text'
        }`}
      >
        PL
      </button>
      <button
        type="button"
        onClick={() => onChange(UI_LANG.EN)}
        className={`min-h-8 rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors sm:min-h-0 ${
          lang === UI_LANG.EN
            ? 'bg-ufa-accent text-ufa-bg'
            : 'text-ufa-muted hover:text-ufa-text'
        }`}
      >
        EN
      </button>
    </div>
  )
}
