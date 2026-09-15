import { focusedRole, changeFocusedRole } from '../data/focusedWorld.js'
import { DOMESTIC_COUNTRIES, normalizeWorldConfig, setCountryDepth, setCountryMode } from '../data/domesticLeagues.js'

export default function WorldCountryChoice({ country, config, lang, onChange, lockMain = false }) {
  const en = lang === 'en', tr = (pl, english) => en ? english : pl
  const name = country[en ? 'labelEn' : 'labelPl']
  const effective = normalizeWorldConfig(config)
  const tiers = [...new Set(country.leagues.map(l => l.tier))].sort((a,b)=>a-b)
  const focused=effective.simulationModel==='focused'
  const role=focused?focusedRole(effective,country.id):null
  const mode = effective.leagues[country.leagues[0].id] ?? 'off'
  const selection = role === 'main' ? 'main' : role === 'active' || (!focused && ['playable', 'transfers'].includes(mode)) ? 'active' : 'none'
  const depth = Math.max(0,...country.leagues.filter(l=>!['off','background'].includes(effective.leagues[l.id])).map(l=>l.tier))
  const selectClass = 'w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text outline-none focus:border-ufa-accent disabled:opacity-50'
  const levelName = tier => country.id === 'fr' ? ({1:'Nationale 1',2:'Nationale 2',3:tr('Regiony', 'Regional leagues')})[tier] : `${tr('Poziom', 'Tier')} ${tier}`
  return <div className="world-country-choice rounded-sm border border-ufa-border bg-ufa-panel p-4 transition-colors" data-selection={selection}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-ufa-text">{name}</h3>
      {selection !== 'none' && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${selection === 'main' ? 'bg-ufa-accent text-ufa-on-accent' : 'border border-ufa-accent text-ufa-accent'}`}>
        <span aria-hidden="true">✓</span>{selection === 'main' ? tr('Liga główna', 'Main league') : tr('Aktywna', 'Active')}
      </span>}
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-ufa-muted">{tr('Symulacja', 'Simulation')}
        <select aria-label={`${tr('Symulacja', 'Simulation')}: ${name}`} className={selectClass} value={focused?role:mode} onChange={e => {
          if(focused) {onChange(changeFocusedRole(effective,country.id,e.target.value,DOMESTIC_COUNTRIES));return}
          const next=setCountryMode(config,country.id,e.target.value)
          onChange(depth && e.target.value!=='off' ? setCountryDepth(next,country.id,depth) : next)
        }}>
          {focused ? <>
            <option value="main" disabled={lockMain && role!=="main"}>{tr("Liga główna", "Main league")}</option>
            <option value="active" disabled={role==='main'}>{tr("Dodatkowa aktywna", "Additional active")}</option>
            <option value="background" disabled={role==='main'}>{effective.backgroundSimulation ? tr('Tło', 'Background') : tr('Brak symulacji', 'No simulation')}</option>
          </> : <>
          <option value="playable">{tr('Grywalny', 'Playable')}</option>
          <option value="transfers">{tr('Niegrywalny — dostępne transfery', 'Not playable — transfers available')}</option>
          <option value="off">{tr('Brak symulacji', 'No simulation')}</option>
          </>}
        </select>
      </label>
      {tiers.length>1 && <label className="text-sm text-ufa-muted">{tr('Włączone ligi', 'Included leagues')}
        <select aria-label={`${tr('Włączone ligi', 'Included leagues')}: ${name}`} className={selectClass} disabled={mode==='off'||role==='background'} value={depth || tiers.at(-1)} onChange={e=>onChange(setCountryDepth(config,country.id,Number(e.target.value)))}>
          {tiers.map(tier=><option key={tier} value={tier}>{tiers.filter(t=>t<=tier).map(levelName).join(' + ')}</option>)}
        </select>
      </label>}
    </div>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ufa-muted">{country.leagues.map(l=><li key={l.id} className={!['off','background'].includes(effective.leagues[l.id])?'font-semibold text-ufa-accent':''}>{!['off','background'].includes(effective.leagues[l.id])?'✓ ':''}{l.frenchPyramid ? l.name : levelName(l.tier)}: {l.teams.length} {tr('klubów', 'clubs')}</li>)}</ul>
  </div>
}
