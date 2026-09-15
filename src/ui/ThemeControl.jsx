import { useEffect, useState } from 'react'
import { useUiLang } from './UiLangContext'

const KEY = 'ufa-ui-theme'
function readTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return ['light', 'dark'].includes(value) ? value : 'system'
  } catch { return 'system' }
}

export default function ThemeControl() {
  const { lang } = useUiLang()
  const [theme, setTheme] = useState(readTheme)
  useEffect(() => {
    const sync = (event) => setTheme(event.type === 'ufa-theme-change' ? event.detail : readTheme())
    window.addEventListener('ufa-theme-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('ufa-theme-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <label className="um-theme-control">
      <span>{lang === 'en' ? 'Appearance' : 'Wygląd'}</span>
      <select value={theme} onChange={(event) => {
        const value = event.target.value
        setTheme(value)
        document.documentElement.dataset.theme = value
        try { localStorage.setItem(KEY, value) } catch { /* A session-only preference still works. */ }
        window.dispatchEvent(new CustomEvent('ufa-theme-change', { detail: value }))
      }}>
        <option value="system">{lang === 'en' ? 'System' : 'Systemowy'}</option>
        <option value="light">{lang === 'en' ? 'Light' : 'Jasny'}</option>
        <option value="dark">{lang === 'en' ? 'Dark' : 'Ciemny'}</option>
      </select>
    </label>
  )
}
