import { estimateWorldCost, normalizeWorldConfig } from '../data/domesticLeagues.js'

export default function WorldSimulationOptions({ config, lang, onChange }) {
  const en = lang === 'en'
  const cost = estimateWorldCost(config)
  return <div className="my-3 space-y-2">
    <label className="flex items-center gap-2 text-sm text-ufa-text">
      <input type="checkbox" checked={config.backgroundSimulation !== false} onChange={e => onChange(normalizeWorldConfig({ ...config, backgroundSimulation: e.target.checked }))} />
      {en ? 'Simulate background leagues' : 'Symuluj ligi tła'}
    </label>
    <p className="font-semibold text-ufa-accent">Game speed: {cost.gameSpeed}</p>
    <p className="text-xs text-ufa-muted">{en ? 'Recommended: at least medium. Comparative estimate, not a device benchmark.' : 'Zalecane: co najmniej medium. Wskaźnik porównawczy, bez pomiaru czasu na tym urządzeniu.'}</p>
    {config.backgroundSimulation === false && <p className="text-xs text-ufa-muted">{en ? 'Inactive leagues have no domestic matches or standings. Players remain available for national teams; international club competitions retain their participants.' : 'Nieaktywne ligi nie rozgrywają meczów krajowych ani nie prowadzą tabel. Zawodnicy pozostają dostępni dla reprezentacji, a puchary międzynarodowe zachowują uczestników.'}</p>}
  </div>
}
