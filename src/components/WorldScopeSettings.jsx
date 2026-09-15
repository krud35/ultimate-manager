import { useState } from 'react'
import { DOMESTIC_COUNTRIES, normalizeWorldConfig } from '../data/domesticLeagues.js'
import { focusedLimit } from '../data/focusedWorld.js'
import WorldCountryChoice from './WorldCountryChoice.jsx'

export default function WorldScopeSettings({ career, lang, onChange }) {
  const [open,setOpen]=useState(false)
  if(career.world.worldConfig?.simulationModel!=='focused'||!onChange)return null
  const config=normalizeWorldConfig(career.world.pendingSimulationConfig??career.world.worldConfig)
  const en=lang==='en'
  return <section className="rounded border border-ufa-border bg-ufa-panel p-4">
    <button className="font-semibold text-ufa-accent" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{en?'Active leagues next season':'Aktywne ligi w następnym sezonie'} · + {config.additionalCountryIds.length}/{focusedLimit(config)}</button>
    {open && <><p className="my-3 text-sm text-ufa-muted">{en?'Changes apply at the start of next season. Your current club determines the main league.':'Zmiany obowiązują od początku następnego sezonu. Liga główna wynika z obecnego klubu.'}</p><div className="max-h-96 space-y-3 overflow-y-auto">{[...DOMESTIC_COUNTRIES].sort((a,b)=>a[en?'labelEn':'labelPl'].localeCompare(b[en?'labelEn':'labelPl'],lang)).map(country=><WorldCountryChoice key={country.id} country={country} config={config} lang={lang} lockMain onChange={next=>onChange(next)}/>)}</div></>}
  </section>
}
