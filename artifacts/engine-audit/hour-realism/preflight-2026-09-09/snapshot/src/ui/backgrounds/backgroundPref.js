/** Przełącznik "proceduralne tła" — zapamiętywany w localStorage. */
import { useCallback, useState } from 'react'

const STORAGE_KEY = 'ufa-ui-bg'

export function readBackgroundPref() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeBackgroundPref(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  return on
}

export function useBackgroundPref() {
  const [enabled, setEnabled] = useState(readBackgroundPref)
  const toggle = useCallback(() => {
    setEnabled((prev) => writeBackgroundPref(!prev))
  }, [])
  return [enabled, toggle]
}
