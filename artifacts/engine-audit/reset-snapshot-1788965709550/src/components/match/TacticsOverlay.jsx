import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUiLang } from '../../ui/UiLangContext'
import { matchStrings } from '../../ui/strings/match'

/** Modal na żądanie: taktyka/skład na kolejny punkt, zamiast stałego panelu na stronie. */
export default function TacticsOverlay({ open, onClose, children }) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4 sm:pt-6"
      role="dialog"
      aria-modal="true"
      aria-label={t.tacticsAndSubs}
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-label={t.close}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[min(92vh,100%)] overflow-auto rounded-t-xl sm:rounded-xl border border-ufa-border bg-ufa-bg shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ufa-border bg-ufa-panel/95 px-4 py-3 backdrop-blur">
          <p className="text-sm font-semibold text-ufa-text">{t.tacticsAndSubs}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ufa-muted ring-1 ring-ufa-border hover:bg-ufa-panel-hover hover:text-ufa-text"
          >
            {t.close}
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
