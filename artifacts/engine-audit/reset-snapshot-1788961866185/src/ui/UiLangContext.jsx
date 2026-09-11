import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { readUiLang, writeUiLang, UI_LANG } from './locale'

const UiLangContext = createContext(null)

export function UiLangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const initial = readUiLang()
    try {
      document.documentElement.lang = initial
    } catch {
      /* ignore */
    }
    return initial
  })

  const setLang = useCallback((next) => {
    const lang = writeUiLang(next)
    setLangState(lang)
    try {
      document.documentElement.lang = lang
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({
      lang,
      setLang,
      isEn: lang === UI_LANG.EN,
    }),
    [lang, setLang],
  )

  return <UiLangContext.Provider value={value}>{children}</UiLangContext.Provider>
}

export function useUiLang() {
  const ctx = useContext(UiLangContext)
  if (!ctx) {
    throw new Error('useUiLang must be used within UiLangProvider')
  }
  return ctx
}
