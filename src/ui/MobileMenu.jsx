import { useCallback, useRef } from 'react'
import { pickLabel } from './locale'
import { LangSwitch } from './LangSwitch'
import ThemeControl from './ThemeControl'
import { useDialogFocus } from './useDialogFocus'

export default function MobileMenu({ open, onClose, categories, activeTab, lang, setLang, navigate, onExit, onSearch, disabled }) {
  const ref = useRef(null)
  const close = useCallback(() => onClose(), [onClose])
  useDialogFocus(ref, open, close)
  if (!open) return null
  return <>
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden="true" />
    <section ref={ref} className="um-menu-panel" role="dialog" aria-modal="true" aria-labelledby="um-menu-title">
      <div className="um-menu-heading"><h2 id="um-menu-title">Menu</h2><button type="button" className="um-button" onClick={onClose}>{lang === 'en' ? 'Close' : 'Zamknij'} ×</button></div>
      <button type="button" className="um-club-row" onClick={() => { onClose(); onSearch() }}>{lang === 'en' ? 'Find a screen' : 'Znajdź ekran'} <span>→</span></button>
      <div className="um-menu-grid">{categories.map(category => <section key={category.id}>
        <h3 className="um-eyebrow">{pickLabel(category, lang)}</h3>
        {category.items.map(item => <button key={item.id} type="button" aria-current={activeTab === item.id ? 'page' : undefined} disabled={disabled} onClick={() => { navigate(item.id); onClose() }}>{pickLabel(item, lang)}<span aria-hidden="true">→</span></button>)}
      </section>)}</div>
      <div className="um-settings"><LangSwitch lang={lang} onChange={setLang} /><ThemeControl /><button type="button" disabled={disabled} className="um-button" onClick={() => { onClose(); onExit() }}>{lang === 'en' ? 'Save and exit' : 'Zapisz i wyjdź'}</button></div>
    </section>
  </>
}
