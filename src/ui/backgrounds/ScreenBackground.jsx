/**
 * Warstwa tła: jedna scena SVG na cały ekran + przyciemniająca zasłona,
 * z przenikaniem przy zmianie ekranu.
 *
 * Renderuje maksymalnie dwie warstwy: starą (pełna widoczność, pod spodem)
 * i nową (wjeżdża opacity), po czym stara jest zdejmowana.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { BACKGROUND_SCENES, DEFAULT_SCENE, NO_SCENE } from './scenes.js'
import { getSceneOverride, subscribeSceneOverride } from './sceneOverride.js'

const serverSnapshot = () => null

export function ScreenBackground({ scene, enabled = true }) {
  const override = useSyncExternalStore(subscribeSceneOverride, getSceneOverride, serverSnapshot)
  const wanted = enabled ? (override ?? scene ?? DEFAULT_SCENE) : NO_SCENE
  const active = wanted in BACKGROUND_SCENES ? wanted : DEFAULT_SCENE

  const keyRef = useRef(1)
  const [layers, setLayers] = useState(() => [{ id: active, key: 0 }])

  const settle = useCallback(() => {
    setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev))
  }, [])

  useEffect(() => {
    setLayers((prev) => {
      if (prev[prev.length - 1].id === active) return prev
      const key = keyRef.current
      keyRef.current += 1
      return [...prev.slice(-1), { id: active, key }]
    })
    // Zapasowe sprzątanie: w ukrytej karcie animationend nie zawsze dochodzi,
    // a nie chcemy zostawić dwóch warstw na stałe.
    const t = setTimeout(settle, 900)
    return () => clearTimeout(t)
  }, [active, settle])

  return (
    <div className="ufa-bg-root" aria-hidden="true" data-scene={active}>
      {layers.map((layer, index) => {
        const Scene = BACKGROUND_SCENES[layer.id]
        const entering = index > 0
        return (
          <div
            key={layer.key}
            className={entering ? 'ufa-bg-layer ufa-bg-layer--in' : 'ufa-bg-layer'}
            data-scene={layer.id}
            onAnimationEnd={entering ? settle : undefined}
          >
            {Scene ? <Scene /> : null}
          </div>
        )
      })}
      <div className="ufa-bg-scrim" />
    </div>
  )
}
