/**
 * Mikro-store na nadpisanie sceny tła przez widok zagnieżdżony (np. etapy
 * dnia meczowego w MatchView), bez przeciągania propsów przez cały App.
 */
import { useEffect } from 'react'

let current = null
const listeners = new Set()

export function getSceneOverride() {
  return current
}

export function subscribeSceneOverride(fn) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function publish(next) {
  if (current === next) return
  current = next
  for (const fn of listeners) fn()
}

/** Ustawia scenę na czas życia komponentu; przy odmontowaniu wraca do zakładki. */
export function useSceneOverride(sceneId) {
  useEffect(() => {
    if (!sceneId) return undefined
    publish(sceneId)
    return () => {
      if (current === sceneId) publish(null)
    }
  }, [sceneId])
}
