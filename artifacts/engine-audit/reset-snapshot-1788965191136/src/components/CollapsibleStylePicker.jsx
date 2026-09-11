import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * Zwijany wybór stylu: zwinięty = tylko nazwa; rozwinięty = lista z opisami.
 * @param {boolean} [embedded] — bez osobnej karty (gdy w sekcji nadrzędnej)
 */
export default function CollapsibleStylePicker({
  label,
  options,
  value,
  onChange,
  name,
  embedded = false,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const listId = useId()
  const selected = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={
        embedded
          ? 'space-y-2'
          : 'rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20'
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ufa-muted">
        {label}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2.5 text-left hover:border-ufa-accent/40 hover:bg-ufa-accent/5"
      >
        <span className="text-sm font-semibold text-ufa-text">
          {pickLabel(selected, lang) || selected?.label || '—'}
        </span>
        <span className="shrink-0 text-xs text-ufa-muted">{open ? t.collapse : t.change}</span>
      </button>

      {open && (
        <div id={listId} className="space-y-1.5" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const active = opt.id === value
            const desc = pickDesc(opt, lang)
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                  active
                    ? 'border-ufa-accent/70 bg-ufa-accent/10'
                    : 'border-ufa-border/80 bg-ufa-bg/40 hover:border-ufa-muted hover:bg-ufa-panel-hover'
                }`}
              >
                <p className="text-sm font-medium text-ufa-text">
                  {pickLabel(opt, lang) || opt.label}
                </p>
                {desc ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ufa-muted">{desc}</p>
                ) : null}
                <input type="radio" name={name} checked={active} readOnly className="sr-only" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
