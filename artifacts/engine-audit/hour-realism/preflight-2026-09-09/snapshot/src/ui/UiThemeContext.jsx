/* eslint-disable react-refresh/only-export-components -- context and hook intentionally share a module. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'ufa-ui-theme'
const THEMES = ['system', 'light', 'dark']

function readTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme === 'system' ? 'light dark' : theme
}

export const UiThemeContext = createContext(null)

export function UiThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* Theme preference is optional when storage is unavailable. */
    }
  }, [theme])

  const setTheme = useCallback((next) => {
    setThemeState(THEMES.includes(next) ? next : 'system')
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>
}

export function useUiTheme() {
  const context = useContext(UiThemeContext)
  if (!context) throw new Error('useUiTheme must be used within UiThemeProvider')
  return context
}
